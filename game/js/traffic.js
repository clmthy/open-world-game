// traffic.js - vehicles, arcade driving, traffic cars and pedestrians for Marisol Bay.
import * as THREE from 'three';
import { makeRng, clamp } from './random.js';

export const CAR_MODELS = {
  marlin: { name: 'Marlin GT', maxSpeed: 42, accel: 16, grip: 6.5, length: 4.4, width: 2.0, color: 0xd21f2e, seats: 2 },
  sol: { name: 'Cardena Sol', maxSpeed: 28, accel: 11, grip: 5.5, length: 4.2, width: 1.9, color: 0x3a7bd5, seats: 4 },
  haul: { name: 'Haul-6', maxSpeed: 24, accel: 8, grip: 4.5, length: 6.4, width: 2.4, color: 0x8a8f98, seats: 2 },
  sedan: { name: 'Sedan', maxSpeed: 30, accel: 12, grip: 5.5, length: 4.3, width: 1.9, color: 0xcccccc, seats: 4 },
  police: { name: 'MBPD Interceptor', maxSpeed: 38, accel: 15, grip: 6.0, length: 4.5, width: 2.0, color: 0x1a1d24, seats: 2 },
};

export function makeCarMesh(modelKey, colorOverride) {
  const spec = CAR_MODELS[modelKey] || CAR_MODELS.sedan;
  const color = colorOverride !== undefined ? colorOverride : spec.color;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161c });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd4e8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.width, 0.62, spec.length), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  if (modelKey === 'haul') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.92, 1.1, 1.4), bodyMat);
    cab.position.set(0, 1.35, spec.length / 2 - 1.0);
    cab.castShadow = true;
    g.add(cab);
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.96, 1.5, spec.length * 0.55), new THREE.MeshLambertMaterial({ color: 0x5a5f6a }));
    cargo.position.set(0, 1.1, -spec.length * 0.18);
    cargo.castShadow = true;
    g.add(cargo);
  } else {
    const cabinH = modelKey === 'marlin' ? 0.42 : 0.55;
    const cabinY = modelKey === 'marlin' ? 0.98 : 1.05;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.82, cabinH, spec.length * 0.42), glassMat);
    cabin.position.set(0, cabinY, -spec.length * 0.06);
    cabin.castShadow = true;
    g.add(cabin);
    if (modelKey === 'marlin') {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.9, 0.08, 0.4), darkMat);
      spoiler.position.set(0, 1.0, -spec.length / 2 + 0.25);
      g.add(spoiler);
    }
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const wy = 0.36;
  const wz = spec.length / 2 - 0.8;
  const wx = spec.width / 2 - 0.1;
  for (const [x, z] of [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(x, wy, z);
    g.add(w);
    wheels.push(w);
  }
  // Headlights + taillights.
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  hl.position.set(-wx + 0.3, 0.62, spec.length / 2 + 0.02);
  g.add(hl);
  const hl2 = hl.clone(); hl2.position.x = wx - 0.3; g.add(hl2);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  tl.position.set(-wx + 0.3, 0.62, -spec.length / 2 - 0.02);
  g.add(tl);
  const tl2 = tl.clone(); tl2.position.x = wx - 0.3; g.add(tl2);
  let lightBar = null;
  if (modelKey === 'police') {
    lightBar = new THREE.Group();
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    r.position.x = -0.3;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    b.position.x = 0.3;
    lightBar.add(r); lightBar.add(b);
    lightBar.position.set(0, 1.45, -0.2);
    g.add(lightBar);
    const decal = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 0.02, 0.2, spec.length * 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    decal.position.set(0, 0.62, 0);
    g.add(decal);
  }
  return { group: g, wheels, lightBar, spec };
}

export class Car {
  constructor(scene, modelKey, x, z, heading, colorOverride) {
    this.modelKey = modelKey;
    const built = makeCarMesh(modelKey, colorOverride);
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.lightBar = built.lightBar;
    this.spec = built.spec;
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.vx = 0; this.vz = 0;
    this.steer = 0;
    this.health = 100;
    this.occupied = false;
    this.dead = false;
    scene.add(this.mesh);
    this.syncMesh();
  }
  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    for (const w of this.wheels) w.rotation.x += this.speed * 0.016 / 0.36;
  }
  // Arcade drive. input: {throttle (-1..1), steer (-1..1), handbrake}. Returns nothing.
  drive(dt, input, colliders) {
    const spec = this.spec;
    const forward = { x: Math.sin(this.heading), z: Math.cos(this.heading) };
    const targetSpeed = input.throttle * (input.throttle < 0 ? spec.maxSpeed * 0.45 : spec.maxSpeed);
    const accelRate = input.throttle !== 0 ? spec.accel : 8;
    if (input.throttle !== 0) {
      this.speed += Math.sign(targetSpeed - this.speed) * Math.min(Math.abs(targetSpeed - this.speed), accelRate * dt);
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 10 * dt);
    }
    const grip = input.handbrake ? 1.6 : spec.grip;
    const steerTarget = input.steer * clamp(Math.abs(this.speed) / 8, 0, 1) * (this.speed >= 0 ? 1 : -1);
    this.steer += (steerTarget - this.steer) * Math.min(1, 8 * dt);
    this.heading += this.steer * clamp(this.speed / spec.maxSpeed, -1, 1) * 1.9 * dt * (input.handbrake ? 1.6 : 1);
    const fwd = { x: Math.sin(this.heading), z: Math.cos(this.heading) };
    const tvx = fwd.x * this.speed, tvz = fwd.z * this.speed;
    const k = Math.min(1, grip * dt);
    this.vx += (tvx - this.vx) * k;
    this.vz += (tvz - this.vz) * k;
    let nx = this.x + this.vx * dt;
    let nz = this.z + this.vz * dt;
    // Circle vs AABB collision.
    const r = Math.max(spec.length, spec.width) * 0.42;
    for (const c of colliders) {
      const cx = clamp(nx, c.x0, c.x1), cz = clamp(nz, c.z0, c.z1);
      const dx = nx - cx, dz = nz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.001;
        const push = r - d;
        const px = dx / d, pz = dz / d;
        nx += px * push; nz += pz * push;
        const vn = this.vx * px + this.vz * pz;
        if (vn < 0) {
          this.vx -= vn * px * 1.4; this.vz -= vn * pz * 1.4;
          this.speed *= 0.82;
          if (Math.abs(vn) > 8) this.health -= Math.min(18, Math.abs(vn) - 6);
        }
      }
    }
    nx = clamp(nx, -318, 318); nz = clamp(nz, -318, 318);
    this.x = nx; this.z = nz;
    this.syncMesh();
  }
}

function makePedMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: [0xd25a5a, 0x5a7bd2, 0x5ad27a, 0xd2b25a, 0x9a5ad2][Math.floor(rng.next() * 5)] });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3242 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirt);
  torso.position.y = 1.15; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.72;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.22), pants);
  legL.position.set(-0.15, 0.38, 0);
  const legR = legL.clone(); legR.position.x = 0.15;
  g.add(torso, head, legL, legR);
  return { group: g, legL, legR };
}

export class TrafficManager {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(seed || 777);
    this.cars = [];
    this.peds = [];
    this.maxCars = 14;
    this.maxPeds = 22;
  }
  spawnCar(x, z, heading) {
    const models = ['sedan', 'sedan', 'sol', 'sedan', 'haul'];
    const colors = [0xcccccc, 0x3a3a3a, 0x7a2e2e, 0x2e5a7a, 0xd2b25a, 0x5a7a3a];
    const car = new Car(this.scene, this.rng.pick(models), x, z, heading, this.rng.pick(colors));
    car.speed = this.rng.range(6, 11);
    car.ai = { axis: this.rng.chance(0.5) ? 'x' : 'z', dir: this.rng.chance(0.5) ? 1 : -1, lane: this.rng.pick([-3.5, 3.5]) };
    this.cars.push(car);
    return car;
  }
  spawnPed(x, z) {
    const built = makePedMesh(this.rng);
    const ped = { mesh: built.group, legL: built.legL, legR: built.legR, x, z, heading: this.rng.range(0, Math.PI * 2), speed: this.rng.range(1.0, 1.6), phase: this.rng.range(0, 6), flee: 0 };
    this.scene.add(ped.mesh);
    this.peds.push(ped);
    return ped;
  }
  ensureNear(playerPos) {
    while (this.cars.length < this.maxCars) {
      const road = this.city.roads[Math.floor(this.rng.next() * this.city.roads.length)];
      const along = playerPos.x + this.rng.range(-140, 140);
      const horizontal = this.rng.chance(0.5);
      const x = horizontal ? clamp(along, -300, 300) : road + this.rng.pick([-3.5, 3.5]);
      const z = horizontal ? road + this.rng.pick([-3.5, 3.5]) : clamp(playerPos.z + this.rng.range(-140, 140), -300, 300);
      if (Math.hypot(x - playerPos.x, z - playerPos.z) < 40) continue;
      this.spawnCar(x, z, horizontal ? (this.rng.chance(0.5) ? 0 : Math.PI) : (this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2));
    }
    while (this.peds.length < this.maxPeds) {
      const x = clamp(playerPos.x + this.rng.range(-90, 90), -300, 300);
      const z = clamp(playerPos.z + this.rng.range(-90, 90), -300, 300);
      if (Math.hypot(x - playerPos.x, z - playerPos.z) < 12) continue;
      this.spawnPed(x, z);
    }
  }
  update(dt, playerPos, playerSpeed, gunfirePos, wanted) {
    // Traffic cars: drive along their axis, turn at intersections, slow for cars ahead.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      const d = Math.hypot(car.x - playerPos.x, car.z - playerPos.z);
      if (d > 220) {
        this.scene.remove(car.mesh);
        this.cars.splice(i, 1);
        continue;
      }
      let blocked = false;
      for (const other of this.cars) {
        if (other === car) continue;
        const dx = other.x - car.x, dz = other.z - car.z;
        const ahead = car.ai.axis === 'x' ? dx * car.ai.dir : dz * car.ai.dir;
        const side = car.ai.axis === 'x' ? Math.abs(dz) : Math.abs(dx);
        if (ahead > 0 && ahead < 9 && side < 3) { blocked = true; break; }
      }
      const pd = Math.hypot(playerPos.x - car.x, playerPos.z - car.z);
      if (pd < 7 && Math.abs(playerSpeed) > 2) blocked = true;
      const target = blocked ? 0 : car.spec.maxSpeed * 0.42;
      car.speed += (target - car.speed) * Math.min(1, 2 * dt);
      // At intersections, sometimes turn.
      const nearRoadX = this.city.roads.some((r) => Math.abs(car.x - r) < 2.5);
      const nearRoadZ = this.city.roads.some((r) => Math.abs(car.z - r) < 2.5);
      if (nearRoadX && nearRoadZ && this.rng.chance(dt * 0.25)) {
        car.ai.axis = car.ai.axis === 'x' ? 'z' : 'x';
        car.ai.dir = this.rng.chance(0.5) ? 1 : -1;
        car.ai.lane = this.rng.pick([-3.5, 3.5]);
      }
      // Steer toward the lane line of the current road.
      const roadCoord = car.ai.axis === 'x'
        ? this.city.roads.reduce((a, b) => (Math.abs(b - car.z) < Math.abs(a - car.z) ? b : a), this.city.roads[0])
        : this.city.roads.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a), this.city.roads[0]);
      const laneTarget = roadCoord + car.ai.lane;
      const off = car.ai.axis === 'x' ? laneTarget - car.z : laneTarget - car.x;
      const desiredHeading = car.ai.axis === 'x' ? (car.ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.ai.dir > 0 ? 0 : Math.PI);
      let dh = desiredHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += clamp(dh + clamp(off * 0.06, -0.3, 0.3), -1, 1) * 1.6 * dt;
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      car.x = clamp(car.x, -318, 318); car.z = clamp(car.z, -318, 318);
      car.syncMesh();
    }
    // Pedestrians: walk sidewalks, flee gunfire and high wanted.
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      if (d > 170) { this.scene.remove(p.mesh); this.peds.splice(i, 1); continue; }
      let fleeX = 0, fleeZ = 0;
      if (gunfirePos && Math.hypot(p.x - gunfirePos.x, p.z - gunfirePos.z) < 30) {
        fleeX = p.x - gunfirePos.x; fleeZ = p.z - gunfirePos.z;
      } else if (wanted >= 3 && d < 25) {
        fleeX = p.x - playerPos.x; fleeZ = p.z - playerPos.z;
      }
      if (fleeX || fleeZ) {
        const len = Math.hypot(fleeX, fleeZ) || 1;
        p.heading = Math.atan2(fleeX / len, fleeZ / len);
        p.speed = 3.2;
      } else {
        p.speed = 1.3;
        if (this.rng.chance(dt * 0.12)) p.heading += this.rng.range(-1.2, 1.2);
      }
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      p.x = clamp(p.x, -315, 315); p.z = clamp(p.z, -315, 315);
      p.phase += dt * p.speed * 2.4;
      p.legL.rotation.x = Math.sin(p.phase) * 0.55;
      p.legR.rotation.x = -Math.sin(p.phase) * 0.55;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }
  nearestCar(pos, radius) {
    let best = null, bestD = radius;
    for (const car of this.cars) {
      const d = Math.hypot(car.x - pos.x, car.z - pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }
}
