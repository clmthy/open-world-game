// missions.js - the 7 story missions, objectives, dialogue and enemy goons for Marisol Bay.
import * as THREE from 'three';
import { Car } from './traffic.js';
import { clamp } from './random.js';

export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, range: 2.2, rate: 0.45, auto: false, ammo: Infinity },
  pistol: { name: 'Street Pistol', damage: 26, range: 55, rate: 0.28, auto: false, ammo: 0 },
  smg: { name: 'SMG', damage: 15, range: 42, rate: 0.09, auto: true, ammo: 0 },
  shotgun: { name: 'Pump Shotgun', damage: 60, range: 22, rate: 0.9, auto: false, ammo: 0 },
  rifle: { name: 'Bolt Rifle', damage: 85, range: 90, rate: 1.1, auto: false, ammo: 0 },
  molotov: { name: 'Molotov', damage: 70, range: 26, rate: 1.0, auto: false, ammo: 0 },
  frag: { name: 'Frag', damage: 95, range: 30, rate: 1.0, auto: false, ammo: 0 },
};

function makeGoonMesh() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x8a1f1f });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc9a06a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x1c1e26 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.34), shirt);
  torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skin);
  head.position.y = 1.72;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), pants);
  legL.position.set(-0.16, 0.38, 0);
  const legR = legL.clone(); legR.position.x = 0.16;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.7), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.3, 1.3, 0.3);
  g.add(torso, head, legL, legR, gun);
  return g;
}

export class Enemy {
  constructor(scene, x, z) {
    this.mesh = makeGoonMesh();
    this.x = x; this.z = z;
    this.health = 60;
    this.shootTimer = 1 + Math.random();
    this.dead = false;
    scene.add(this.mesh);
    this.mesh.position.set(x, 0, z);
  }
  update(dt, playerPos, onShoot) {
    if (this.dead) return;
    const dx = playerPos.x - this.x, dz = playerPos.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    this.mesh.rotation.y = Math.atan2(dx, dz);
    if (d > 26) {
      this.x += (dx / d) * 3.2 * dt;
      this.z += (dz / d) * 3.2 * dt;
    }
    this.shootTimer -= dt;
    if (this.shootTimer <= 0 && d < 42) {
      this.shootTimer = 1.4 + Math.random() * 0.8;
      onShoot(this, d);
    }
    this.mesh.position.set(this.x, 0, this.z);
  }
  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.mesh.visible = false;
      return true;
    }
    return false;
  }
}

const MISSIONS = [
  {
    id: 'fresh-air', name: 'Fresh Air', reward: 400,
    briefing: ["Nina: Dez! You are out. Get to the garage and grab a car.", "Dez: Three years. Time to take back what Halden stole."],
    steps: [
      { text: 'Walk to the garage', marker: { x: 24, z: 40 }, check: (c) => Math.hypot(c.px - 24, c.pz - 40) < 6 },
      { text: 'Steal the red Marlin GT', marker: { x: 24, z: 52 }, car: 'marlin', check: (c) => c.inCar && c.carModel === 'marlin' },
      { text: 'Drive to Nina at the overpass', marker: { x: -40, z: 96 }, check: (c) => Math.hypot(c.px + 40, c.pz - 96) < 8 },
    ],
  },
  {
    id: 'hot-plates', name: 'Hot Plates', reward: 700, unlock: 'smg',
    briefing: ["Nina: Three cars need new plates. Take each one to the chop shop at the docks.", "Dez: On it. Try not to get spotted."],
    steps: [
      { text: 'Take the blue Sol to the chop shop', marker: { x: -40, z: 224 }, car: 'sol', deliver: true, check: (c) => c.delivered === 1 },
      { text: 'Take the grey sedan to the chop shop', marker: { x: -40, z: 224 }, car: 'sedan', deliver: true, check: (c) => c.delivered === 2 },
      { text: 'Take the second Sol to the chop shop', marker: { x: -40, z: 224 }, car: 'sol', deliver: true, check: (c) => c.delivered === 3 },
    ],
  },
  {
    id: 'low-tide', name: 'Low Tide', reward: 900,
    briefing: ["Ramona: The rivals have a Haul-6 full of cargo. Take it. Then lose the heat.", "Dez: A truck job. Fine."],
    steps: [
      { text: 'Steal the Haul-6 at the docks', marker: { x: -64, z: 200 }, car: 'haul', check: (c) => c.inCar && c.carModel === 'haul' },
      { text: 'Lose the heat — get wanted down to zero', marker: null, check: (c) => c.wanted === 0 },
      { text: 'Park the truck at the chop shop', marker: { x: -40, z: 224 }, check: (c) => Math.hypot(c.px + 40, c.pz - 224) < 9 },
    ],
  },
  {
    id: 'glass-house', name: 'Glass House', reward: 1200, unlock: 'shotgun',
    briefing: ["Nina: Halden keeps his ledger in the Heights villa. Get in, grab it, get out.", "Dez: If they spot me, it gets loud."],
    steps: [
      { text: 'Reach the villa in Halcyon Heights', marker: { x: -232, z: -232 }, check: (c) => Math.hypot(c.px + 232, c.pz + 232) < 9 },
      { text: 'Grab the ledger inside', marker: { x: -232, z: -232 }, hold: 3, check: (c) => c.held >= 3 },
      { text: 'Deal with the guards', marker: { x: -232, z: -232 }, kills: 3, check: (c) => c.kills >= 3 },
      { text: 'Get back to the garage', marker: { x: 24, z: 40 }, check: (c) => Math.hypot(c.px - 24, c.pz - 40) < 8 },
    ],
  },
  {
    id: 'static', name: 'Static', reward: 1500, unlock: 'rifle',
    briefing: ["Nina: I need bugs on three signal points. Cover me while I plant them.", "Dez: Stay close. I have got you."],
    steps: [
      { text: 'Plant the bug at the Coral Strand relay', marker: { x: 224, z: -96 }, hold: 4, kills: 2, check: (c) => c.held >= 4 },
      { text: 'Plant the bug at the downtown relay', marker: { x: 32, z: -32 }, hold: 4, kills: 2, check: (c) => c.held >= 4 },
      { text: 'Plant the bug at the docks relay', marker: { x: -96, z: 192 }, hold: 4, kills: 2, check: (c) => c.held >= 4 },
    ],
  },
  {
    id: 'saltmarsh-run', name: 'Saltmarsh Run', reward: 1800, unlock: 'molotov',
    briefing: ["Nina: The evidence rides with you. Break the roadblock on the marsh highway.", "Dez: Floor it."],
    steps: [
      { text: 'Reach the marsh highway gate', marker: { x: -224, z: 224 }, check: (c) => Math.hypot(c.px + 224, c.pz - 224) < 9 },
      { text: 'Break through the police roadblock', marker: { x: 0, z: 256 }, check: (c) => Math.hypot(c.px - 0, c.pz - 256) < 10 },
      { text: 'Deliver the evidence to the east garage', marker: { x: 224, z: 224 }, check: (c) => Math.hypot(c.px - 224, c.pz - 224) < 9 },
    ],
  },
  {
    id: 'broadcast', name: 'Broadcast', reward: 3000, unlock: 'frag',
    briefing: ["Nina: This is it. Five levels of heat. Get the drive to Pelican Tower and end Halden.", "Dez: All the way. No brakes."],
    steps: [
      { text: 'Fight through to Pelican Tower', marker: { x: 96, z: -224 }, kills: 2, check: (c) => Math.hypot(c.px - 96, c.pz + 224) < 10 },
      { text: 'Take down Halden\u2019s bodyguards', marker: { x: 96, z: -224 }, kills: 2, check: (c) => c.kills >= 2 },
      { text: 'Upload the drive at the tower door', marker: { x: 96, z: -208 }, hold: 5, check: (c) => c.held >= 5 },
    ],
  },
];

export class MissionManager {
  constructor(scene, city, hooks) {
    this.scene = scene;
    this.city = city;
    this.hooks = hooks; // { say(text), onMissionComplete(mission), onStepComplete(), spawnCar(model,x,z), setWanted(n) }
    this.missions = MISSIONS;
    this.index = 0;
    this.stepIndex = 0;
    this.active = false;
    this.enemies = [];
    this.markerMesh = null;
    this.holdTimer = 0;
    this.holding = false;
    this.kills = 0;
    this.delivered = 0;
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })
    );
    this.beacon.visible = false;
    scene.add(this.beacon);
    const ringGeo = new THREE.RingGeometry(3, 4.2, 24);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd75e, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.15;
    this.ring.visible = false;
    scene.add(this.ring);
  }
  currentMission() { return this.missions[this.index] || null; }
  currentStep() {
    const m = this.currentMission();
    return m ? m.steps[this.stepIndex] : null;
  }
  startMission(i) {
    this.index = i;
    this.stepIndex = 0;
    this.active = true;
    this.kills = 0;
    this.delivered = 0;
    this.holdTimer = 0;
    const m = this.currentMission();
    if (!m) { this.active = false; return; }
    this.hooks.say(m.briefing[0]);
    if (m.briefing[1]) setTimeout(() => this.hooks.say(m.briefing[1]), 3600);
    this.enterStep();
  }
  enterStep() {
    const step = this.currentStep();
    this.holdTimer = 0;
    this.holding = false;
    if (!step) return;
    if (step.marker) {
      this.beacon.visible = true;
      this.beacon.position.set(step.marker.x, 30, step.marker.z);
      this.ring.visible = true;
      this.ring.position.set(step.marker.x, 0.15, step.marker.z);
    } else {
      this.beacon.visible = false;
      this.ring.visible = false;
    }
    if (step.car && this.hooks.spawnMissionCar) this.hooks.spawnMissionCar(step.car, step.marker);
    if (step.kills && this.hooks.spawnGoons) this.hooks.spawnGoons(step.marker || { x: 0, z: 0 }, step.kills);
  }
  completeStep(ctx) {
    const m = this.currentMission();
    const step = this.currentStep();
    this.stepIndex++;
    this.hooks.onStepComplete && this.hooks.onStepComplete();
    if (this.stepIndex >= m.steps.length) {
      this.finishMission(ctx);
    } else {
      this.enterStep();
    }
  }
  finishMission(ctx) {
    const m = this.currentMission();
    this.active = false;
    this.beacon.visible = false;
    this.ring.visible = false;
    this.hooks.onMissionComplete && this.hooks.onMissionComplete(m);
    this.index++;
    this.stepIndex = 0;
    if (this.index < this.missions.length) {
      setTimeout(() => this.startMission(this.index), 2500);
    } else {
      this.hooks.say('Nina: It is over, Dez. Halden is done. Marisol Bay is yours.');
    }
  }
  spawnEnemy(x, z) {
    const e = new Enemy(this.scene, x, z);
    this.enemies.push(e);
    return e;
  }
  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }
  update(dt, ctx) {
    if (!this.active) return;
    const step = this.currentStep();
    if (!step) return;
    // Hold-to-complete steps (planting, grabbing, uploading).
    if (step.hold) {
      const near = step.marker && Math.hypot(ctx.px - step.marker.x, ctx.pz - step.marker.z) < 7;
      if (near) {
        this.holding = true;
        this.holdTimer += dt;
        ctx.held = this.holdTimer;
        if (step.kills && this.enemies.length === 0 && this.holdTimer < step.hold) {
          this.hooks.spawnGoons && this.hooks.spawnGoons(step.marker, step.kills);
        }
      } else {
        this.holding = false;
        this.holdTimer = Math.max(0, this.holdTimer - dt * 2);
        ctx.held = this.holdTimer;
      }
    }
    ctx.kills = this.kills;
    ctx.delivered = this.delivered;
    if (step.check(ctx)) this.completeStep(ctx);
    // Enemy updates.
    for (const e of this.enemies) {
      if (!e.dead) e.update(dt, { x: ctx.px, z: ctx.pz }, (enemy, d) => {
        this.hooks.onEnemyShoot && this.hooks.onEnemyShoot(enemy, d);
      });
    }
  }
  onEnemyKilled() { this.kills++; }
  onDelivered() { this.delivered++; }
  objectiveText() {
    if (!this.active) return null;
    const m = this.currentMission();
    const s = this.currentStep();
    if (!m || !s) return null;
    let text = m.name + ' — ' + s.text;
    let sub = '';
    if (s.marker) sub = 'marker on the map';
    if (s.hold) sub = 'hold position ' + Math.max(0, Math.ceil(s.hold - this.holdTimer)) + 's';
    if (s.kills) sub = 'targets down: ' + Math.min(this.kills, s.kills) + '/' + s.kills;
    return { text, sub };
  }
  markerPos() {
    const s = this.currentStep();
    return s && s.marker ? s.marker : null;
  }
}
