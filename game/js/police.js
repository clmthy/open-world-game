// police.js - wanted level, police cars and helicopter for Marisol Bay.
import * as THREE from 'three';
import { Car } from './traffic.js';
import { clamp } from './random.js';

export class PoliceManager {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.wanted = 0;
    this.cars = [];
    this.heli = null;
    this.heliLight = null;
    this.heliAngle = 0;
    this.outOfSightTimer = 0;
    this.spawnTimer = 0;
    this.viewRadius = 70;
    this.sirenOn = false;
  }
  setWanted(level, silent) {
    const next = clamp(Math.round(level), 0, 5);
    if (next !== this.wanted) {
      this.wanted = next;
      this.outOfSightTimer = 0;
      if (next > 0 && !silent) this.onWantedUp && this.onWantedUp(next);
    }
  }
  addWanted(n) { this.setWanted(this.wanted + n); }
  clearWanted() {
    this.setWanted(0, true);
    for (const c of this.cars) this.scene.remove(c.mesh);
    this.cars = [];
    if (this.heli) { this.scene.remove(this.heli); this.heli = null; }
    if (this.heliLight) { this.scene.remove(this.heliLight); this.heliLight = null; }
  }
  wantedTargetCount() {
    return this.wanted === 0 ? 0 : Math.min(2 + this.wanted, 6);
  }
  spawnPoliceCar(playerPos) {
    const road = this.city.roads[Math.floor(this.rng.next() * this.city.roads.length)];
    const angle = this.rng.range(0, Math.PI * 2);
    const dist = this.rng.range(55, 90);
    const x = clamp(playerPos.x + Math.sin(angle) * dist, -300, 300);
    const z = clamp(playerPos.z + Math.cos(angle) * dist, -300, 300);
    const car = new Car(this.scene, 'police', x, z, this.rng.range(0, Math.PI * 2));
    car.ai = { mode: 'chase' };
    this.cars.push(car);
    return car;
  }
  ensureHeli() {
    if (this.wanted >= 3 && !this.heli) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 6), new THREE.MeshLambertMaterial({ color: 0x1a1d24 }));
      body.castShadow = true;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 5), new THREE.MeshLambertMaterial({ color: 0x1a1d24 }));
      tail.position.set(0, 0.3, -5);
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.6), new THREE.MeshLambertMaterial({ color: 0x222222 }));
      rotor.position.y = 1.1;
      // Visible searchlight beam: translucent cone from the heli toward the player.
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(6, 20, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false })
      );
      beam.position.set(0, -10, 0);
      beam.rotation.x = 0.91;
      g.add(body, tail, rotor, beam);
      g.userData.rotor = rotor;
      this.heli = g;
      this.scene.add(g);
      this.heliLight = new THREE.SpotLight(0xfff2b0, 0, 90, 0.35, 0.5, 1.2);
      this.scene.add(this.heliLight);
      this.heliLight.target = new THREE.Object3D();
      this.scene.add(this.heliLight.target);
    }
    if (this.wanted < 3 && this.heli) {
      this.scene.remove(this.heli);
      this.scene.remove(this.heliLight);
      this.scene.remove(this.heliLight.target);
      this.heli = null; this.heliLight = null;
    }
  }
  update(dt, playerPos, playerInCar, colliders, timeOfDay) {
    this.sirenOn = this.wanted > 0;
    this.ensureHeli();
    // Spawn / despawn to target count.
    this.spawnTimer -= dt;
    if (this.cars.length < this.wantedTargetCount() && this.spawnTimer <= 0) {
      this.spawnPoliceCar(playerPos);
      this.spawnTimer = 1.2;
    }
    if (this.cars.length > this.wantedTargetCount()) {
      const c = this.cars.pop();
      this.scene.remove(c.mesh);
    }
    // Wanted decay: outside the view circle for 10s drops one level.
    const nearest = this.cars.reduce((best, c) => Math.min(best, Math.hypot(c.x - playerPos.x, c.z - playerPos.z)), 9999);
    const seen = nearest < this.viewRadius || this.wanted >= 4;
    if (this.wanted > 0) {
      if (!seen) {
        this.outOfSightTimer += dt;
        if (this.outOfSightTimer > 10) { this.setWanted(this.wanted - 1, true); }
      } else {
        this.outOfSightTimer = 0;
      }
    }
    // Police car AI: seek the player, avoid buildings by sliding along them.
    for (const car of this.cars) {
      const dx = playerPos.x - car.x, dz = playerPos.z - car.z;
      const dist = Math.hypot(dx, dz) || 1;
      const desired = Math.atan2(dx, dz);
      let dh = desired - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const throttle = dist > 4 ? 1 : 0.25;
      const steer = clamp(dh * 1.4, -1, 1);
      // Ram speed: faster at higher wanted.
      const boost = 1 + this.wanted * 0.04;
      const prevMax = car.spec.maxSpeed;
      car.spec = { ...car.spec, maxSpeed: prevMax * boost };
      car.drive(dt, { throttle, steer, handbrake: false }, colliders);
      car.spec = { ...car.spec, maxSpeed: prevMax };
      // Contact: push the player car and damage it.
      if (dist < 3.6 && this.onRam) this.onRam(car, dist);
      // Light bar flash.
      if (car.lightBar) {
        const t = performance.now() / 180;
        car.lightBar.children[0].material.color.setHex(Math.sin(t) > 0 ? 0xff2222 : 0x551111);
        car.lightBar.children[1].material.color.setHex(Math.sin(t) > 0 ? 0x111155 : 0x2244ff);
      }
    }
    // Helicopter: circle above the player, spotlight on them at dusk/night.
    if (this.heli) {
      this.heliAngle += dt * 0.35;
      const hx = playerPos.x + Math.sin(this.heliAngle) * 26;
      const hz = playerPos.z + Math.cos(this.heliAngle) * 26;
      this.heli.position.set(hx, 20, hz);
      this.heli.rotation.y = Math.atan2(playerPos.x - hx, playerPos.z - hz);
      this.heli.userData.rotor.rotation.y += dt * 22;
      if (this.heliLight) {
        this.heliLight.position.set(hx, 19, hz);
        this.heliLight.target.position.set(playerPos.x, 0, playerPos.z);
        this.heliLight.intensity = (timeOfDay === 'day') ? 0 : 260;
      }
    }
  }
  policePositions() {
    return this.cars.map((c) => ({ x: c.x, z: c.z }));
  }
}
