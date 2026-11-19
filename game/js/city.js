// city.js - builds the Marisol Bay city grid, blocks, docks, beach and landmarks.
import * as THREE from 'three';
import { makeRng, clamp } from './random.js';

export const WORLD = { min: -320, max: 320, roadPitch: 64, roadWidth: 16 };
const ROADS = [];
for (let i = 0; i <= 9; i++) ROADS.push(-288 + i * 64);

function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function facadeTexture(base, win, lit) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cols = 6, rows = 12;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = 8 + c * 19, y = 10 + r * 20;
        g.fillStyle = ((r * 7 + c * 3) % 5 === 0) ? lit : win;
        g.fillRect(x, y, 12, 12);
      }
    }
  });
}

function neonTexture(text, color) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#0a0a14'; g.fillRect(0, 0, w, h);
    g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 16;
    g.fillStyle = color; g.fillText(text, w / 2, h / 2);
    g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.fillText(text, w / 2, h / 2);
  });
}

function groundTexture() {
  return canvasTexture(1024, 1024, (g, w, h) => {
    const toPx = (v) => ((v + 320) / 640) * w;
    g.fillStyle = '#3a3f4a'; g.fillRect(0, 0, w, h);
    // District tint washes.
    const wash = (x0, z0, x1, z1, color) => {
      g.fillStyle = color; g.fillRect(toPx(x0), toPx(z0), toPx(x1) - toPx(x0), toPx(z1) - toPx(z0));
    };
    wash(160, -320, 320, 320, 'rgba(255,120,170,0.10)');   // Coral Strand
    wash(-320, 160, 160, 320, 'rgba(255,160,60,0.10)');    // Ironreef Docks
    wash(-320, -320, -160, -160, 'rgba(140,255,170,0.10)'); // Halcyon Heights
    wash(-320, 160, -160, 320, 'rgba(170,120,255,0.10)');  // Saltmarsh
    // Sidewalk blocks.
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        const x0 = -288 + i * 64 + 8, z0 = -288 + j * 64 + 8;
        g.fillStyle = '#565d6b';
        g.fillRect(toPx(x0), toPx(z0), toPx(x0 + 48) - toPx(x0), toPx(z0 + 48) - toPx(z0));
      }
    }
    // Roads.
    g.fillStyle = '#23262e';
    for (const r of ROADS) {
      g.fillRect(toPx(r - 8), 0, toPx(r + 8) - toPx(r - 8), h);
      g.fillRect(0, toPx(r - 8), w, toPx(r + 8) - toPx(r - 8));
    }
    // Lane dashes.
    g.fillStyle = '#d8c25a';
    for (const r of ROADS) {
      for (let d = -300; d < 300; d += 24) {
        g.fillRect(toPx(r) - 1, toPx(d), 2, 10);
        g.fillRect(toPx(d), toPx(r) - 1, 10, 2);
      }
    }
    // Beach sand strip east.
    g.fillStyle = '#c9b285';
    g.fillRect(toPx(288), 0, toPx(320) - toPx(288), h);
    // Crosswalks at intersections.
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (const rx of ROADS) for (const rz of ROADS) {
      for (let k = -3; k <= 3; k++) {
        g.fillRect(toPx(rx - 7 + k * 2), toPx(rz - 9), 1.4, 5);
        g.fillRect(toPx(rx - 7 + k * 2), toPx(rz + 4), 1.4, 5);
      }
    }
  });
}

export function districtAt(x, z) {
  if (x > 160) return 'coral';
  if (z > 160 && x <= 160) return 'docks';
  if (x < -160 && z < -160) return 'heights';
  if (x < -160 && z > 160) return 'marsh';
  if (Math.abs(x) < 96 && Math.abs(z) < 96) return 'downtown';
  return 'midtown';
}

export function buildCity(scene, seed) {
  const rng = makeRng(seed || 1337);
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const mapBuildings = [];
  const carSpawns = [];
  const lamps = [];
  const neons = [];

  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(120, 220, 80);
  sun.castShadow = false;
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a2f28, 0.9);
  scene.add(hemi);
  scene.fog = new THREE.Fog(0x9fc3e8, 220, 640);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 640),
    new THREE.MeshLambertMaterial({ map: groundTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Water east of the beach.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 640),
    new THREE.MeshLambertMaterial({ color: 0x1e6f8f, transparent: true, opacity: 0.92 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(410, 0.4, 0);
  group.add(water);

  // Sun disc for dusk shots.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xffb36b, fog: false, transparent: true, opacity: 0.95 })
  );
  sunDisc.position.set(430, 60, -140);
  sunDisc.lookAt(0, 40, 0);
  sunDisc.visible = false;
  group.add(sunDisc);

  // Facade materials.
  const facades = {
    downtown: new THREE.MeshLambertMaterial({ map: facadeTexture('#2c3550', '#1a2238', '#ffd98a') }),
    midtown: new THREE.MeshLambertMaterial({ map: facadeTexture('#4a4038', '#2c2620', '#ffe9b0') }),
    coral: new THREE.MeshLambertMaterial({ map: facadeTexture('#7a4a6e', '#4a2c44', '#9fe8ff') }),
    docks: new THREE.MeshLambertMaterial({ map: facadeTexture('#5c4a2e', '#33291a', '#ffb35e') }),
    heights: new THREE.MeshLambertMaterial({ map: facadeTexture('#e8e6da', '#b8c4b0', '#fff2c0') }),
    marsh: new THREE.MeshLambertMaterial({ map: facadeTexture('#3e3a55', '#262238', '#c9a8ff') }),
  };
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a2d36 });
  const containerColors = [0xc65a2e, 0x2e7fc6, 0x5a9e3a, 0xc6a12e, 0x8a3a6e];
  const containerMat = containerColors.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const palmTrunk = new THREE.MeshLambertMaterial({ color: 0x6e4f2a });
  const palmLeaf = new THREE.MeshLambertMaterial({ color: 0x2e8f4e });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x30343e, emissive: 0x000000 });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });

  function addBuilding(cx, cz, w, d, h, district) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, facades[district] || facades.midtown);
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    group.add(mesh);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6), roofMat);
    roof.position.set(cx, h + 0.4, cz);
    group.add(roof);
    colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
    mapBuildings.push({ x: cx, z: cz, w, d, district });
    return mesh;
  }

  // City blocks.
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      const bx = -256 + i * 64, bz = -256 + j * 64;
      const district = districtAt(bx, bz);
      if (district === 'docks') {
        // Container yard: stacked boxes.
        for (let k = 0; k < 5; k++) {
          const cx = bx + rng.range(-16, 16), cz = bz + rng.range(-16, 16);
          const w = rng.pick([12, 12, 8]), d = 4, h = rng.pick([3, 3, 6]);
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), containerMat[Math.floor(rng.next() * containerMat.length)]);
          m.position.set(cx, h / 2, cz);
          m.rotation.y = rng.pick([0, Math.PI / 2]);
          m.castShadow = true;
          group.add(m);
          colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
          mapBuildings.push({ x: cx, z: cz, w, d, district });
        }
        continue;
      }
      if (district === 'marsh') {
        if (rng.chance(0.55)) {
          addBuilding(bx, bz, rng.range(14, 22), rng.range(14, 22), rng.range(5, 9), district);
        }
        continue;
      }
      if (district === 'heights') {
        addBuilding(bx - 10, bz - 8, 16, 14, rng.range(6, 10), district);
        addBuilding(bx + 12, bz + 10, 14, 12, rng.range(6, 9), district);
        continue;
      }
      if (district === 'downtown') {
        addBuilding(bx, bz, rng.range(24, 30), rng.range(24, 30), rng.range(28, 62), district);
        continue;
      }
      if (district === 'coral') {
        addBuilding(bx - 8, bz, 20, 26, rng.range(10, 18), district);
        continue;
      }
      // Midtown: two buildings per block.
      addBuilding(bx - 11, bz - 10, 18, 16, rng.range(8, 16), district);
      addBuilding(bx + 11, bz + 11, 16, 16, rng.range(8, 15), district);
    }
  }

  // Pelican Tower (broadcast tower) — tall landmark, downtown north.
  const towerBase = new THREE.Mesh(new THREE.BoxGeometry(18, 90, 18), facades.downtown);
  towerBase.position.set(96, 45, -224);
  towerBase.castShadow = true;
  group.add(towerBase);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 26, 8), new THREE.MeshLambertMaterial({ color: 0x888888 }));
  antenna.position.set(96, 103, -224);
  group.add(antenna);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  beacon.position.set(96, 117, -224);
  group.add(beacon);
  colliders.push({ x0: 87, z0: -233, x1: 105, z1: -215 });
  mapBuildings.push({ x: 96, z: -224, w: 18, d: 18, district: 'downtown' });

  // Palms along Coral Strand beach avenue.
  for (let z = -280; z <= 280; z += 32) {
    const x = 296 + rng.range(-3, 3);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 9, 6), palmTrunk);
    trunk.position.set(x, 4.5, z);
    trunk.rotation.z = rng.range(-0.12, 0.12);
    group.add(trunk);
    for (let f = 0; f < 5; f++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5, 4), palmLeaf);
      leaf.position.set(x + Math.cos(f * 1.26) * 1.6, 9.4, z + Math.sin(f * 1.26) * 1.6);
      leaf.rotation.z = Math.cos(f * 1.26) * 1.1;
      leaf.rotation.x = Math.sin(f * 1.26) * 1.1;
      group.add(leaf);
    }
  }

  // Neon signs on Coral Strand + docks.
  const neonDefs = [
    { text: 'CORAL', color: '#ff7ad9', x: 200, z: -160, ry: -Math.PI / 2 },
    { text: 'MARLIN', color: '#7ad9ff', x: 200, z: 32, ry: -Math.PI / 2 },
    { text: 'IRONREEF', color: '#ffb35e', x: -40, z: 232, ry: 0 },
    { text: 'PELICAN', color: '#ffe9a8', x: 96, z: -196, ry: 0 },
    { text: 'TIDE BAR', color: '#9fe8ff', x: 200, z: 160, ry: -Math.PI / 2 },
    { text: 'HALCYON', color: '#b8ffb0', x: -200, z: -160, ry: Math.PI / 2 },
  ];
  for (const n of neonDefs) {
    const mat = new THREE.MeshBasicMaterial({ map: neonTexture(n.text, n.color), transparent: true });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(24, 6), mat);
    sign.position.set(n.x, 12, n.z);
    sign.rotation.y = n.ry;
    group.add(sign);
    neons.push(mat);
  }

  // Street lamps at intersections.
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      if ((rx + rz) % 128 !== 0) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), lampMat);
      pole.position.set(rx + 9, 3.5, rz + 9);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lampGlowMat);
      bulb.position.set(rx + 9, 7.2, rz + 9);
      group.add(bulb);
      lamps.push(bulb);
    }
  }

  // Parked cars along roads (spawn points for stealing).
  const carModels = ['sol', 'sol', 'marlin', 'haul', 'sol', 'marlin'];
  for (let k = 0; k < 26; k++) {
    const horizontal = rng.chance(0.5);
    const road = ROADS[Math.floor(rng.next() * ROADS.length)];
    const along = rng.range(-280, 280);
    const x = horizontal ? along : road + (rng.chance(0.5) ? 5.5 : -5.5);
    const z = horizontal ? road + (rng.chance(0.5) ? 5.5 : -5.5) : along;
    const heading = horizontal ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    carSpawns.push({ x, z, heading, model: carModels[k % carModels.length] });
  }

  const landmarks = {
    pelicanTower: { x: 96, z: -224 },
    garage: { x: 24, z: 40 },
    chopShop: { x: -40, z: 224 },
    repairShops: [{ x: -224, z: 32, name: 'Spray & Go North' }, { x: 160, z: -96, name: 'Spray & Go East' }],
    docks: { x: -40, z: 224 },
    villa: { x: -232, z: -232 },
    marshGate: { x: -224, z: 224 },
  };

  function setTimeOfDay(preset) {
    if (preset === 'dusk') {
      scene.background = new THREE.Color(0x2c1e3e);
      scene.fog.color.set(0x8a5a6e); scene.fog.near = 180; scene.fog.far = 560;
      sun.color.set(0xff9a5e); sun.intensity = 1.6; sun.position.set(380, 55, -120);
      hemi.intensity = 0.45; hemi.color.set(0xff9a7a);
      sunDisc.visible = true;
      sunDisc.material.color.set(0xff8a4a);
      water.material.color.set(0x4a2e5e);
      for (const m of neons) m.opacity = 1;
      for (const b of lamps) b.material = lampGlowMat;
    } else if (preset === 'night') {
      scene.background = new THREE.Color(0x070a18);
      scene.fog.color.set(0x0a0f24); scene.fog.near = 140; scene.fog.far = 480;
      sun.color.set(0x8fb0ff); sun.intensity = 0.5; sun.position.set(-120, 200, 100);
      hemi.intensity = 0.28; hemi.color.set(0x5a6a9a);
      sunDisc.visible = false;
      water.material.color.set(0x0a2038);
      for (const m of neons) m.opacity = 1;
      for (const b of lamps) b.material = lampGlowMat;
    } else {
      scene.background = new THREE.Color(0x87b5e0);
      scene.fog.color.set(0x9fc3e8); scene.fog.near = 220; scene.fog.far = 640;
      sun.color.set(0xfff2d8); sun.intensity = 2.6; sun.position.set(120, 220, 80);
      hemi.intensity = 1.15; hemi.color.set(0xbfd8ff);
      sunDisc.visible = false;
      water.material.color.set(0x1e6f8f);
      for (const m of neons) m.opacity = 0.85;
      for (const b of lamps) b.material = lampGlowMat;
    }
  }
  setTimeOfDay('day');

  let t = 0;
  function update(dt) {
    t += dt;
    water.position.y = 0.4 + Math.sin(t * 0.8) * 0.15;
    beacon.material.color.setHex(Math.sin(t * 4) > 0 ? 0xff2222 : 0x881111);
  }

  return {
    group, colliders, mapBuildings, carSpawns, landmarks, roads: ROADS,
    bounds: WORLD, setTimeOfDay, update,
    mapInfo: { buildings: mapBuildings, roads: ROADS, waterX: 320, bounds: WORLD },
  };
}
