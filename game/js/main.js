// main.js - game loop, player, driving, combat and state machine for Heatline: Marisol Bay.
import * as THREE from 'three';
import { buildCity } from './city.js';
import { Car, TrafficManager, CAR_MODELS } from './traffic.js';
import { PoliceManager } from './police.js';
import { MissionManager, WEAPONS } from './missions.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { defaultSave, readSlot, writeSlot, listSlots } from './save.js';
import { makeRng, clamp, angleLerp } from './random.js';

const SHOT_PARAM = new URLSearchParams(window.location.search).get('shot');
const SEED_PARAM = parseInt(new URLSearchParams(window.location.search).get('seed') || '1', 10);

function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xc22e2e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x232838 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.36), jacket);
  torso.position.y = 1.18; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skin);
  head.position.y = 1.78;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), pants);
  legL.position.set(-0.17, 0.4, 0);
  const legR = legL.clone(); legR.position.x = 0.17;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), jacket);
  armL.position.set(-0.42, 1.2, 0);
  const armR = armL.clone(); armR.position.x = 0.42;
  g.add(torso, head, legL, legR, armL, armR);
  return { group: g, legL, legR, armL, armR };
}

export class Game {
  constructor() {
    this.rng = makeRng(20261119);
    this.state = 'title';
    this.timeOfDay = 'day';
    this.quality = 'HIGH';
    this.player = null;
    this.playerMesh = null;
    this.car = null;
    this.parkedCars = [];
    this.missionCars = [];
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.camDist = 8;
    this.camMode = 0;
    this.damageFlash = 0;
    this.lastDamageAt = -99;
    this.elapsed = 0;
    this.shotMode = SHOT_PARAM || null;
    this.shotCam = null;
    this.fireLights = [];
    this.gunfirePos = null;
    this.gunfireTimer = 0;
    this.aiming = false;
    this.fireCooldown = 0;
    this.respawnTimer = 0;
    this.save = defaultSave();
    this.init();
  }

  init() {
    const canvas = document.getElementById('c');
    this.canvas = canvas;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    } catch (e) {
      document.getElementById('startScreen').innerHTML = '<h1>HEATLINE</h1><p>WebGL is not available in this browser. Please use a desktop browser with WebGL enabled.</p>';
      return;
    }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b5e0);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(24, 30, 80);
    this.camera.lookAt(0, 0, 0);

    this.city = buildCity(this.scene, 1337);
    this.traffic = new TrafficManager(this.scene, this.city, 777);
    this.police = new PoliceManager(this.scene, this.city, this.rng);
    this.audio = new AudioEngine();
    this.input = new Input(canvas);
    this.ui = new UI(this);
    this.missions = new MissionManager(this.scene, this.city, {
      say: (t) => this.ui.say(t),
      onMissionComplete: (m) => this.onMissionComplete(m),
      onStepComplete: () => { this.audio.pickup(); },
      spawnMissionCar: (model, marker) => this.spawnMissionCar(model, marker),
      spawnGoons: (at, n) => this.spawnGoons(at, n),
      onEnemyShoot: (enemy, d) => this.onEnemyShoot(enemy, d),
      setWanted: (n) => this.police.setWanted(n),
    });
    this.police.onWantedUp = (n) => { this.audio.wantedUp(); this.ui.toast('Wanted level ' + n, 2); };
    this.police.onRam = (car, dist) => this.onPoliceRam(car, dist);

    // Player.
    const pm = makePlayerMesh();
    this.playerMesh = pm.group;
    this.playerParts = pm;
    this.scene.add(this.playerMesh);
    this.player = {
      x: 24, z: 120, heading: 0, vx: 0, vz: 0,
      health: 100, armor: 0, money: 250,
      weapons: { fists: 1, pistol: 1 }, ammo: { pistol: 48, smg: 0, shotgun: 0, rifle: 0, molotov: 0, frag: 0 },
      currentWeapon: 'pistol', inCar: false, moving: false,
    };

    // Parked cars (lazy: only near the player get a mesh).
    this.parkedSpawns = this.city.carSpawns.map((s) => ({ ...s, car: null }));

    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pauseGame();
    });
    this.applyQuality('HIGH');

    // Shot staging runs before the first frame so the screenshot has a full scene.
    if (this.shotMode) {
      this.startShot(this.shotMode);
      // Headless screenshot compositors often drop the WebGL layer: mirror the
      // WebGL canvas into a 2D canvas overlay so the shot captures the frame.
      this.shotOverlay = document.createElement('canvas');
      this.shotOverlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
      const app = document.getElementById('app');
      app.insertBefore(this.shotOverlay, app.children[1]);
      const mirror = () => {
        const src = this.renderer.domElement;
        if (this.shotOverlay.width !== src.width || this.shotOverlay.height !== src.height) {
          this.shotOverlay.width = src.width;
          this.shotOverlay.height = src.height;
        }
        const g = this.shotOverlay.getContext('2d');
        g.drawImage(src, 0, 0);
      };
      this._mirror = mirror;
      mirror();
      setInterval(mirror, 250);
    }
    this.renderer.render(this.scene, this.camera);
    if (this._mirror) this._mirror();
    window.__heatlineReady = true;
    this.lastT = performance.now();
    const loop = (t) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.lastT) / 1000 || 0.016);
      this.lastT = t;
      this.update(dt);
    };
    requestAnimationFrame(loop);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  applyQuality(q) {
    this.quality = q;
    if (!this.renderer) return;
    if (q === 'LOW') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.renderer.antialias = false;
    } else if (q === 'MED') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.shadowMap.enabled = false;
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.scene.traverse((o) => {
      if (o.isDirectionalLight) o.castShadow = (q === 'HIGH');
    });
  }

  setTimeOfDay(preset) {
    this.timeOfDay = preset;
    this.city.setTimeOfDay(preset);
  }

  // ---- save / load ----
  snapshotSave() {
    return {
      v: 1, slot: this.save.slot || 0, missionIndex: this.missions.index,
      money: this.player.money, health: Math.round(this.player.health), armor: Math.round(this.player.armor),
      weapons: { ...this.player.weapons }, ammo: { ...this.player.ammo },
      currentWeapon: this.player.currentWeapon,
      pos: [Math.round(this.player.x), 0, Math.round(this.player.z)],
      heading: this.player.heading, completed: this.missions.missions.slice(0, this.missions.index).map((m) => m.id),
    };
  }
  applySave(data) {
    this.save = data;
    this.player.money = data.money;
    this.player.health = data.health;
    this.player.armor = data.armor || 0;
    this.player.weapons = { ...data.weapons };
    this.player.ammo = { ...data.ammo };
    this.player.currentWeapon = data.currentWeapon || 'pistol';
    this.player.x = data.pos[0]; this.player.z = data.pos[2];
    this.player.heading = data.heading || 0;
    this.missions.index = data.missionIndex || 0;
    this.missions.stepIndex = 0;
  }
  saveToSlot(i) {
    const data = this.snapshotSave();
    const r = writeSlot(i, data);
    this.ui.toast(r.ok ? ('Saved to slot ' + (i + 1)) : ('Save failed: ' + r.error), 3);
    this.ui.renderSlots();
  }
  listSaves() { return listSlots(); }
  newGame() {
    this.audio.init(); this.audio.startAmbient();
    this.applySave(defaultSave());
    this.police.clearWanted();
    this.missions.clearEnemies();
    this.setTimeOfDay('day');
    this.player.inCar = false;
    if (this.car) { this.car.occupied = false; this.car = null; }
    this.ui.hideStart();
    this.state = 'playing';
    this.missions.startMission(0);
    this.ui.say('Nina: Dez! You are out. Get to the garage and grab a car.');
  }
  continueGame() {
    const slots = listSlots();
    const data = slots.find((s) => s !== null);
    if (!data) { this.ui.toast('No save found — starting a new game.', 3); this.newGame(); return; }
    this.audio.init(); this.audio.startAmbient();
    this.applySave(data);
    this.police.clearWanted();
    this.setTimeOfDay('day');
    this.ui.hideStart();
    this.state = 'playing';
    this.missions.startMission(this.missions.index);
  }
  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.showPause();
  }
  resumeGame() {
    this.state = 'playing';
    this.ui.hidePause();
  }
  quitToTitle() {
    this.saveToSlot(this.save.slot || 0);
    this.state = 'title';
    this.ui.hidePause();
    this.ui.showStart();
  }
  onMissionComplete(m) {
    this.player.money += m.reward;
    if (m.unlock) {
      this.player.weapons[m.unlock] = 1;
      this.player.ammo[m.unlock] = (this.player.ammo[m.unlock] || 0) + (m.unlock === 'smg' ? 120 : m.unlock === 'shotgun' ? 24 : m.unlock === 'rifle' ? 20 : 3);
    }
    this.audio.missionDone();
    this.ui.toast('Mission complete: ' + m.name + '  +$' + m.reward, 4);
    const data = this.snapshotSave();
    writeSlot(this.save.slot || 0, data);
  }

  // ---- cars ----
  spawnMissionCar(model, marker) {
    const x = marker ? marker.x + 6 : this.player.x + 8;
    const z = marker ? marker.z + 6 : this.player.z;
    const car = new Car(this.scene, model, x, z, 0);
    car.mission = true;
    this.missionCars.push(car);
    return car;
  }
  nearestParkedCar(maxD) {
    let best = null, bestD = maxD;
    for (const s of this.parkedSpawns) {
      if (s.car) {
        const d = Math.hypot(s.car.x - this.player.x, s.car.z - this.player.z);
        if (d < bestD) { bestD = d; best = s.car; }
      }
    }
    for (const c of this.missionCars) {
      if (c.dead) continue;
      const d = Math.hypot(c.x - this.player.x, c.z - this.player.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }
  ensureParkedCars() {
    for (const s of this.parkedSpawns) {
      const d = Math.hypot(s.x - this.player.x, s.z - this.player.z);
      if (!s.car && d < 130) {
        s.car = new Car(this.scene, s.model, s.x, s.z, s.heading);
      } else if (s.car && d > 190 && !s.car.occupied && s.car !== this.car) {
        this.scene.remove(s.car.mesh);
        s.car = null;
      }
    }
  }
  enterCar(car) {
    this.car = car;
    car.occupied = true;
    this.player.inCar = true;
    this.playerMesh.visible = false;
    this.audio.setEngine(0, true);
    const stolen = !car.mission;
    if (stolen && this.police.wanted === 0) this.police.setWanted(1);
    this.ui.setInteract('');
  }
  exitCar() {
    if (!this.car) return;
    const car = this.car;
    car.occupied = false;
    this.player.x = car.x + Math.cos(car.heading + Math.PI / 2) * 3;
    this.player.z = car.z - Math.sin(car.heading + Math.PI / 2) * 3;
    this.player.heading = car.heading;
    this.player.inCar = false;
    this.playerMesh.visible = true;
    this.car = null;
    this.audio.setEngine(0, false);
  }

  // ---- combat ----
  spawnGoons(at, n) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const x = clamp(at.x + Math.sin(a) * this.rng.range(8, 16), -315, 315);
      const z = clamp(at.z + Math.cos(a) * this.rng.range(8, 16), -315, 315);
      this.missions.spawnEnemy(x, z);
    }
  }
  onEnemyShoot(enemy, dist) {
    const hitChance = clamp(0.5 - dist / 90, 0.08, 0.45);
    if (Math.random() < hitChance) this.damagePlayer(6 + Math.random() * 6);
    this.audio.noiseBurst(0.1, 0.25, 1800);
  }
  damagePlayer(amount) {
    if (this.state !== 'playing') return;
    let remaining = amount;
    if (this.player.armor > 0) {
      const absorbed = Math.min(this.player.armor, remaining * 0.6);
      this.player.armor -= absorbed;
      remaining -= absorbed;
    }
    this.player.health -= remaining;
    this.damageFlash = 1;
    this.lastDamageAt = this.elapsed;
    if (this.player.health <= 0) this.playerDown();
  }
  playerDown() {
    this.player.health = 100;
    this.player.armor = 0;
    this.player.money = Math.max(0, this.player.money - 200);
    this.police.clearWanted();
    if (this.car) { this.exitCar(); }
    this.player.x = 24; this.player.z = 40;
    this.ui.toast('You are down — you wake up at the clinic, $200 lighter.', 5);
    this.ui.say('Nina: Dez! Get up. We still have work to do.');
  }
  onPoliceRam(car, dist) {
    if (!this.car || this.state !== 'playing') return;
    if (dist < 3.4) {
      this.car.health -= 0.22;
      this.car.speed *= 0.985;
      if (this.car.health <= 0) this.carDestroyed();
    }
  }
  carDestroyed() {
    if (!this.car) return;
    this.audio.crash();
    this.ui.toast('Your car is wrecked.', 3);
    const wreck = this.car;
    wreck.dead = true;
    this.scene.remove(wreck.mesh);
    if (wreck.mission) this.missionCars = this.missionCars.filter((c) => c !== wreck);
    else {
      const spawn = this.parkedSpawns.find((s) => s.car === wreck);
      if (spawn) spawn.car = null;
    }
    this.car = null;
    this.player.inCar = false;
    this.playerMesh.visible = true;
    this.damagePlayer(15);
  }
  shoot() {
    const w = WEAPONS[this.player.currentWeapon];
    if (!w) return;
    if (this.fireCooldown > 0) return;
    if (this.player.currentWeapon !== 'fists' && (this.player.ammo[this.player.currentWeapon] || 0) <= 0) {
      this.audio.blip(180, 0.1, 'square', 0.15);
      return;
    }
    this.fireCooldown = w.rate;
    this.audio.gunshot();
    if (this.player.currentWeapon !== 'fists') {
      this.player.ammo[this.player.currentWeapon]--;
    }
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = this.camera.position.clone();
    let hitEnemy = null, hitD = w.range;
    for (const e of this.missions.enemies) {
      if (e.dead) continue;
      const toE = new THREE.Vector3(e.x - origin.x, 1.2 - origin.y, e.z - origin.z);
      const dist = toE.length();
      if (dist > w.range) continue;
      toE.normalize();
      const angle = toE.angleTo(dir);
      if (angle < 0.06 && dist < hitD) { hitD = dist; hitEnemy = e; }
    }
    if (hitEnemy) {
      const killed = hitEnemy.damage(w.damage);
      this.gunfirePos = { x: hitEnemy.x, z: hitEnemy.z };
      this.gunfireTimer = 0.5;
      if (killed) {
        this.missions.onEnemyKilled();
        this.audio.pickup();
      }
    } else if (this.player.currentWeapon === 'fists') {
      this.audio.punch();
    }
    const flash = new THREE.PointLight(0xffe9a8, 60, 12);
    flash.position.copy(origin).addScaledVector(dir, 2);
    this.scene.add(flash);
    setTimeout(() => this.scene.remove(flash), 60);
    this.gunfirePos = this.gunfirePos || { x: this.player.x, z: this.player.z };
    this.gunfireTimer = 0.5;
  }

  // ---- update ----
  update(dt) {
    this.elapsed += dt;
    if (this.state === 'playing') {
      this.updatePlaying(dt);
    } else if (this.state === 'title' || this.state === 'paused') {
      if (this.state === 'title' && !this.shotMode) {
        const t = this.elapsed * 0.05;
        this.camera.position.set(Math.sin(t) * 180, 90, Math.cos(t) * 180);
        this.camera.lookAt(0, 0, 0);
      }
      this.city.update(dt);
    }
    if (this.gunfireTimer > 0) this.gunfireTimer -= dt;
    if (this.gunfireTimer <= 0) this.gunfirePos = null;
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 1.6);
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.elapsed - this.lastDamageAt > 8 && this.player.health < 100 && this.player.health > 0) {
      this.player.health = Math.min(100, this.player.health + 2 * dt);
    }
    this.renderer.render(this.scene, this.camera);
    if (this._mirror) this._mirror();
  }

  updatePlaying(dt) {
    const p = this.player;
    const mouse = this.input.consumeMouse();
    this.camYaw -= mouse.dx * 0.0032;
    this.camPitch = clamp(this.camPitch + mouse.dy * 0.0026, -0.15, 1.1);
    if (this.input.wasPressed('KeyC')) this.camMode = (this.camMode + 1) % 3;
    if (this.input.wasPressed('Escape')) { this.pauseGame(); return; }
    const weaponKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
    const weaponIds = ['fists', 'pistol', 'smg', 'shotgun', 'rifle', 'molotov'];
    weaponKeys.forEach((k, i) => {
      if (this.input.wasPressed(k) && p.weapons[weaponIds[i]]) p.currentWeapon = weaponIds[i];
    });
    if (this.input.wasPressed('Digit7') && p.weapons.frag) p.currentWeapon = 'frag';

    this.traffic.ensureNear({ x: p.x, z: p.z });
    this.ensureParkedCars();
    this.traffic.update(dt, { x: p.x, z: p.z }, this.car ? Math.abs(this.car.speed) : 0, this.gunfirePos, this.police.wanted);
    this.city.update(dt);

    let interact = '';
    if (!p.inCar) {
      const nearCar = this.nearestParkedCar(4.5);
      if (nearCar) interact = 'Press E — steal the ' + nearCar.spec.name;
      const nearShop = this.city.landmarks.repairShops.find((s) => Math.hypot(s.x - p.x, s.z - p.z) < 10);
      if (nearShop && this.police.wanted >= 2) interact = 'Press R — respray $150, clear wanted';
      if (this.input.wasPressed('KeyE') && nearCar) this.enterCar(nearCar);
      if (this.input.wasPressed('KeyR') && nearShop && this.police.wanted >= 2 && p.money >= 150) {
        p.money -= 150;
        this.police.clearWanted();
        if (this.car) { this.car.health = 100; }
        this.audio.pickup();
        this.ui.toast('Resprayed — wanted cleared.', 3);
      }
    } else if (this.input.wasPressed('KeyE')) {
      this.exitCar();
    }
    this.ui.setInteract(interact);

    if (p.inCar && this.car) {
      const ax = this.input.axis();
      this.car.drive(dt, { throttle: ax.y, steer: -ax.x, handbrake: this.input.down('Space') }, this.city.colliders);
      p.x = this.car.x; p.z = this.car.z; p.heading = this.car.heading;
      this.audio.setEngine(Math.abs(this.car.speed) / this.car.spec.maxSpeed, true);
      for (const t of this.traffic.cars) {
        const d = Math.hypot(t.x - this.car.x, t.z - this.car.z);
        if (d < 3.4 && d > 0.01) {
          const push = (3.4 - d) * 0.5;
          const nx = (this.car.x - t.x) / d, nz = (this.car.z - t.z) / d;
          this.car.x += nx * push; this.car.z += nz * push;
          t.x -= nx * push; t.z -= nz * push;
          this.car.speed *= 0.9;
          if (Math.abs(this.car.speed) > 12) { this.audio.crash(); this.car.health -= 3; }
        }
      }
      if (this.car.health <= 0) this.carDestroyed();
    } else {
      const ax = this.input.axis();
      const speed = this.input.down('ShiftLeft') || this.input.down('ShiftRight') ? 9 : 6;
      const fwdX = Math.sin(this.camYaw), fwdZ = Math.cos(this.camYaw);
      const rightX = Math.cos(this.camYaw), rightZ = -Math.sin(this.camYaw);
      let mx = (fwdX * ax.y + rightX * ax.x);
      let mz = (fwdZ * ax.y + rightZ * ax.x);
      const len = Math.hypot(mx, mz);
      p.moving = len > 0.1;
      if (p.moving) {
        mx /= len; mz /= len;
        const nx = p.x + mx * speed * dt;
        const nz = p.z + mz * speed * dt;
        let blocked = false;
        for (const c of this.city.colliders) {
          if (nx > c.x0 - 0.6 && nx < c.x1 + 0.6 && nz > c.z0 - 0.6 && nz < c.z1 + 0.6) { blocked = true; break; }
        }
        if (!blocked) { p.x = clamp(nx, -318, 318); p.z = clamp(nz, -318, 318); }
        p.heading = Math.atan2(mx, mz);
      }
      this.playerMesh.position.set(p.x, 0, p.z);
      this.playerMesh.rotation.y = p.heading;
      const swing = p.moving ? Math.sin(this.elapsed * 10) * 0.5 : 0;
      this.playerParts.legL.rotation.x = swing;
      this.playerParts.legR.rotation.x = -swing;
      this.playerParts.armL.rotation.x = -swing * 0.7;
      this.playerParts.armR.rotation.x = swing * 0.7;
      this.audio.setEngine(0, false);
      this.aiming = true;
      if (this.input.mouseDown || this.input.wasPressed('KeyF')) this.shoot();
    }

    const ctx = {
      px: p.x, pz: p.z, inCar: p.inCar, carModel: this.car ? this.car.modelKey : null,
      wanted: this.police.wanted, held: 0, kills: this.missions.kills, delivered: this.missions.delivered,
    };
    const step = this.missions.currentStep();
    if (step && step.deliver && p.inCar && this.car && this.car.mission) {
      const target = this.city.landmarks.chopShop;
      if (Math.hypot(p.x - target.x, p.z - target.z) < 9) {
        this.missions.onDelivered();
        const done = this.car;
        this.exitCar();
        this.scene.remove(done.mesh);
        this.missionCars = this.missionCars.filter((c) => c !== done);
      }
    }
    this.missions.update(dt, ctx);

    this.police.update(dt, { x: p.x, z: p.z }, p.inCar, this.city.colliders, this.timeOfDay);
    this.audio.setSiren(this.police.sirenOn, dt);

    const mi = this.missions.index;
    const wantTod = mi === 2 ? 'night' : (mi === 6 ? 'dusk' : 'day');
    if (!this.shotMode && wantTod !== this.timeOfDay) this.setTimeOfDay(wantTod);

    this.updateCamera(dt);

    const obj = this.missions.objectiveText();
    const marker = this.missions.markerPos();
    this.ui.update(dt, {
      wanted: this.police.wanted,
      objective: obj ? obj.text : null,
      objectiveSub: obj ? obj.sub : '',
      objectiveDist: marker ? Math.hypot(p.x - marker.x, p.z - marker.z) * 4 : null,
      inCar: p.inCar,
      speed: this.car ? this.car.speed : 0,
      carName: this.car ? this.car.spec.name : '',
      carHealth: this.car ? this.car.health : 0,
      health: p.health, armor: p.armor, money: p.money,
      missionIndex: Math.min(this.missions.index, 6),
      weapon: p.currentWeapon,
      weaponName: WEAPONS[p.currentWeapon] ? WEAPONS[p.currentWeapon].name : '',
      ammo: p.ammo[p.currentWeapon],
      aiming: this.aiming && !p.inCar,
      damageFlash: this.damageFlash,
      playerX: p.x, playerZ: p.z, heading: p.inCar ? (this.car ? this.car.heading : 0) : this.camYaw,
      marker, police: this.police.policePositions(),
      mapInfo: this.city.mapInfo, landmarks: this.city.landmarks,
    });
    this.aiming = false;
  }

  updateCamera(dt) {
    if (this.shotCam) {
      this.camera.position.copy(this.shotCam.pos);
      this.camera.lookAt(this.shotCam.look);
      return;
    }
    const p = this.player;
    const dist = this.camMode === 0 ? 8 : (this.camMode === 1 ? 12 : 5);
    if (p.inCar && this.car) {
      const back = this.car.heading + Math.PI;
      const tx = this.car.x + Math.sin(back) * dist;
      const tz = this.car.z + Math.cos(back) * dist;
      const ty = 3.2 + (this.camMode === 1 ? 1.5 : 0);
      this.camera.position.x += (tx - this.camera.position.x) * Math.min(1, 5 * dt);
      this.camera.position.y += (ty - this.camera.position.y) * Math.min(1, 5 * dt);
      this.camera.position.z += (tz - this.camera.position.z) * Math.min(1, 5 * dt);
      this.camera.lookAt(this.car.x + Math.sin(this.car.heading) * 6, 1.4, this.car.z + Math.cos(this.car.heading) * 6);
    } else {
      const cx = p.x - Math.sin(this.camYaw) * dist;
      const cz = p.z - Math.cos(this.camYaw) * dist;
      const cy = 2.2 + Math.sin(this.camPitch) * dist * 0.9;
      this.camera.position.x += (cx - this.camera.position.x) * Math.min(1, 8 * dt);
      this.camera.position.y += (cy - this.camera.position.y) * Math.min(1, 8 * dt);
      this.camera.position.z += (cz - this.camera.position.z) * Math.min(1, 8 * dt);
      this.camera.lookAt(p.x, 1.5, p.z);
    }
  }

  // ---- screenshot staging ----
  addFire(x, z) {
    const light = new THREE.PointLight(0xff6a22, 15, 8, 2);
    light.position.set(x, 2.5, z);
    this.scene.add(light);
    this.fireLights.push(light);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 3.4, 8),
      new THREE.MeshBasicMaterial({ color: 0xff7a22, transparent: true, opacity: 0.9 })
    );
    cone.position.set(x, 1.7, z);
    this.scene.add(cone);
  }
  startShot(name) {
    this.state = 'playing';
    this.ui.hideStart();
    this.audio.init();
    const P = this.player;
    const placeCar = (model, x, z, heading) => {
      const car = new Car(this.scene, model, x, z, heading);
      car.mission = true;
      this.missionCars.push(car);
      return car;
    };
    if (name === 'broadcast') {
      this.setTimeOfDay('dusk');
      const car = placeCar('marlin', 208, 40, Math.PI / 2);
      car.speed = 26;
      this.enterCar(car);
      P.x = car.x; P.z = car.z;
      this.police.setWanted(4, true);
      for (let i = 0; i < 3; i++) {
        const pc = this.police.spawnPoliceCar({ x: P.x, z: P.z });
        pc.x = P.x - 14 - i * 9; pc.z = P.z - 10 - i * 3; pc.heading = Math.PI / 2;
      }
      this.police.ensureHeli();
      this.missions.index = 6;
      this.missions.startMission(6);
      this.ui.say('Nina: The whole city is on us, Dez. Do not stop. Do not stop!');
      this.shotCam = {
        pos: new THREE.Vector3(P.x - 14, 3.4, P.z - 16),
        look: new THREE.Vector3(P.x + 14, 1.6, P.z + 8),
      };
      this.camYaw = Math.PI / 2;
    } else if (name === 'lowtide') {
      this.setTimeOfDay('night');
      P.x = -58; P.z = 196; P.heading = Math.PI;
      this.playerMesh.position.set(P.x, 0, P.z);
      this.playerMesh.rotation.y = P.heading;
      const truck = placeCar('haul', -64, 206, Math.PI / 2);
      truck.mesh.rotation.y = Math.PI / 2 + 0.5;
      this.addFire(-64, 210);
      this.addFire(-70, 204);
      this.police.setWanted(2, true);
      this.missions.index = 2;
      this.missions.startMission(2);
      this.spawnGoons({ x: -52, z: 204 }, 3);
      this.ui.say('Ramona: The cargo is ours. Take the truck — and watch the rooftops.');
      this.shotCam = {
        pos: new THREE.Vector3(P.x - 7, 2.6, P.z - 9),
        look: new THREE.Vector3(P.x + 4, 1.4, P.z + 10),
      };
      this.camYaw = Math.PI;
    } else if (name === 'freshair') {
      this.setTimeOfDay('day');
      const car = placeCar('marlin', 24, 52, Math.PI / 2);
      P.x = 20; P.z = 52; P.heading = Math.PI / 2;
      this.playerMesh.position.set(P.x, 0, P.z);
      this.playerMesh.rotation.y = P.heading;
      this.police.setWanted(0, true);
      this.missions.index = 0;
      this.missions.startMission(0);
      this.missions.stepIndex = 1;
      this.missions.enterStep();
      this.ui.say('Nina: Dez! Grab a car and get to the overpass.');
      this.shotCam = {
        pos: new THREE.Vector3(P.x - 4.5, 2.0, P.z - 5.5),
        look: new THREE.Vector3(P.x + 4, 1.2, P.z + 3),
      };
      this.camYaw = Math.PI / 2;
    } else if (name === 'pause') {
      this.setTimeOfDay('day');
      P.x = 24; P.z = 40;
      this.playerMesh.position.set(P.x, 0, P.z);
      this.police.setWanted(0, true);
      this.missions.index = 3;
      this.missions.startMission(3);
      this.state = 'paused';
      this.ui.showPause();
      this.shotCam = null;
    }
    this.traffic.ensureNear({ x: P.x, z: P.z });
    this.ensureParkedCars();
    this.traffic.update(0.016, { x: P.x, z: P.z }, 0, null, this.police.wanted);
    this.updateCamera(1);
    const obj = this.missions.objectiveText();
    this.ui.update(0.016, {
      wanted: this.police.wanted,
      objective: obj ? obj.text : null,
      objectiveSub: obj ? obj.sub : '',
      objectiveDist: 1200,
      inCar: P.inCar, speed: this.car ? this.car.speed : 0,
      carName: this.car ? this.car.spec.name : '', carHealth: this.car ? this.car.health : 0,
      health: P.health, armor: P.armor, money: P.money, missionIndex: Math.min(this.missions.index, 6),
      weapon: P.currentWeapon, weaponName: WEAPONS[P.currentWeapon].name, ammo: P.ammo[P.currentWeapon],
      aiming: false, damageFlash: 0, playerX: P.x, playerZ: P.z,
      heading: P.inCar ? (this.car ? this.car.heading : 0) : this.camYaw,
      marker: this.missions.markerPos(), police: this.police.policePositions(),
      mapInfo: this.city.mapInfo, landmarks: this.city.landmarks,
    });
  }
}

new Game();
