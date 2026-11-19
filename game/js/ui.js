// ui.js - HUD, minimap, start and pause screens for Heatline: Marisol Bay.
export class UI {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of ['minimap', 'wanted', 'objective', 'speedo', 'vitals', 'ammo', 'subtitle', 'crosshair', 'toast', 'vignette', 'damage', 'interact', 'startScreen', 'pauseScreen', 'pauseMap', 'slots']) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = document.getElementById('mapCanvas').getContext('2d');
    this.pauseCtx = document.getElementById('pauseMap').getContext('2d');
    this.subtitleTimer = 0;
    this.toastTimer = 0;
    this.quality = 'HIGH';
    document.getElementById('btnQuality').addEventListener('click', () => {
      this.quality = this.quality === 'HIGH' ? 'MED' : (this.quality === 'MED' ? 'LOW' : 'HIGH');
      document.getElementById('btnQuality').textContent = 'QUALITY: ' + this.quality;
      this.game.applyQuality(this.quality);
    });
    document.getElementById('btnNew').addEventListener('click', () => this.game.newGame());
    document.getElementById('btnContinue').addEventListener('click', () => this.game.continueGame());
    document.getElementById('btnResume').addEventListener('click', () => this.game.resumeGame());
    document.getElementById('btnQuit').addEventListener('click', () => this.game.quitToTitle());
  }
  showStart() {
    this.el.startScreen.classList.remove('hidden');
    this.el.pauseScreen.classList.add('hidden');
  }
  hideStart() { this.el.startScreen.classList.add('hidden'); }
  showPause() {
    this.el.pauseScreen.classList.remove('hidden');
    this.renderPauseMap();
    this.renderSlots();
  }
  hidePause() { this.el.pauseScreen.classList.add('hidden'); }
  say(text, seconds) {
    this.el.subtitle.textContent = text;
    this.el.subtitle.classList.remove('hidden');
    this.subtitleTimer = seconds || 4;
  }
  toast(text, seconds) {
    this.el.toast.textContent = text;
    this.toastTimer = seconds || 3;
  }
  setInteract(text) {
    if (text) {
      this.el.interact.textContent = text;
      this.el.interact.classList.remove('hidden');
    } else {
      this.el.interact.classList.add('hidden');
    }
  }
  update(dt, s) {
    // Wanted slashes.
    let w = '';
    for (let i = 0; i < 5; i++) {
      w += i < s.wanted ? '<span>/</span>' : '<span class="off">/</span>';
    }
    this.el.wanted.innerHTML = w;
    this.el.vignette.style.opacity = s.wanted >= 3 ? String(Math.min(1, (s.wanted - 2) * 0.35)) : '0';
    // Objective.
    if (s.objective) {
      this.el.objective.classList.remove('hidden');
      const dist = s.objectiveDist != null ? ' — ' + (s.objectiveDist / 1000).toFixed(1) + ' km' : '';
      this.el.objective.innerHTML = s.objective + '<small>' + (s.objectiveSub || '') + dist + '</small>';
    } else {
      this.el.objective.classList.add('hidden');
    }
    // Speedo / vitals / ammo.
    if (s.inCar) {
      this.el.speedo.classList.remove('hidden');
      const kmh = Math.round(Math.abs(s.speed) * 3.6);
      this.el.speedo.innerHTML = '<b>' + kmh + '</b> km/h<br>' + s.carName + ' · HP ' + Math.max(0, Math.round(s.carHealth)) + '%';
    } else {
      this.el.speedo.classList.add('hidden');
    }
    this.el.vitals.innerHTML = 'Health <b>' + Math.max(0, Math.round(s.health)) + '</b> · Armor <b>' + Math.round(s.armor) + '</b><br>$' + s.money + ' · Mission ' + (s.missionIndex + 1) + '/7';
    if (s.weapon && s.weapon !== 'fists') {
      this.el.ammo.classList.remove('hidden');
      this.el.ammo.innerHTML = s.weaponName + '<br><b>' + (s.ammo === Infinity ? '∞' : s.ammo) + '</b>';
    } else {
      this.el.ammo.classList.add('hidden');
    }
    this.el.crosshair.style.display = s.aiming ? 'block' : 'none';
    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      if (this.subtitleTimer <= 0) this.el.subtitle.classList.add('hidden');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.textContent = '';
    }
    this.el.damage.style.opacity = s.damageFlash > 0 ? String(Math.min(1, s.damageFlash)) : '0';
    this.drawMinimap(s);
  }
  drawMinimap(s) {
    const ctx = this.mapCtx;
    const size = 210, R = 105;
    const info = s.mapInfo;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#0a1226'; ctx.fillRect(0, 0, size, size);
    const scale = size / 640;
    const toMap = (x, z) => [R + x * scale, R + z * scale];
    // Water.
    ctx.fillStyle = '#1e5f7f';
    ctx.fillRect(R + 320 * scale, 0, size, size);
    // District washes.
    ctx.fillStyle = 'rgba(255,120,170,0.16)';
    ctx.fillRect(R + 160 * scale, 0, size, size);
    ctx.fillStyle = 'rgba(255,160,60,0.16)';
    ctx.fillRect(0, R + 160 * scale, R + 160 * scale, size);
    ctx.fillStyle = 'rgba(140,255,170,0.14)';
    ctx.fillRect(0, 0, R - 160 * scale, R - 160 * scale);
    ctx.fillStyle = 'rgba(170,120,255,0.14)';
    ctx.fillRect(0, R + 160 * scale, R - 160 * scale, size);
    // Roads.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    for (const r of info.roads) {
      const [x0] = toMap(r, 0);
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, size); ctx.stroke();
      const [, z0] = toMap(0, r);
      ctx.beginPath(); ctx.moveTo(0, z0); ctx.lineTo(size, z0); ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = 'rgba(200,210,230,0.5)';
    for (const b of info.buildings) {
      const [x, z] = toMap(b.x - b.w / 2, b.z - b.d / 2);
      ctx.fillRect(x, z, Math.max(1.5, b.w * scale), Math.max(1.5, b.d * scale));
    }
    // Landmarks.
    const lm = (x, z, color, r) => {
      const [px, pz] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(px, pz, r || 3, 0, Math.PI * 2); ctx.fill();
    };
    lm(s.landmarks.pelicanTower.x, s.landmarks.pelicanTower.z, '#ffd75e', 4);
    for (const rs of s.landmarks.repairShops) lm(rs.x, rs.z, '#7dff9a', 3);
    lm(s.landmarks.chopShop.x, s.landmarks.chopShop.z, '#ff9a5e', 3);
    // Mission marker + route.
    if (s.marker) {
      const [mx, mz] = toMap(s.marker.x, s.marker.z);
      const [px, pz] = toMap(s.playerX, s.playerZ);
      ctx.strokeStyle = '#ffd75e'; ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(px, pz); ctx.lineTo(mx, mz); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath(); ctx.arc(mx, mz, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx, mz, 5, 0, Math.PI * 2); ctx.stroke();
    }
    // Police dots.
    ctx.fillStyle = '#ff3b30';
    for (const p of s.police) {
      const [px, pz] = toMap(p.x, p.z);
      ctx.beginPath(); ctx.arc(px, pz, 3, 0, Math.PI * 2); ctx.fill();
    }
    // View circle at wanted.
    if (s.wanted > 0) {
      const [px, pz] = toMap(s.playerX, s.playerZ);
      ctx.strokeStyle = 'rgba(255,59,48,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, pz, 70 * scale, 0, Math.PI * 2); ctx.stroke();
    }
    // Player arrow.
    const [px, pz] = toMap(s.playerX, s.playerZ);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.atan2(Math.sin(s.heading), Math.cos(s.heading)));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
  }
  renderPauseMap() {
    const ctx = this.pauseCtx;
    const w = 560, h = 420;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a1226'; ctx.fillRect(0, 0, w, h);
    const scale = w / 640;
    const toMap = (x, z) => [w / 2 + x * scale, h / 2 + z * scale];
    ctx.fillStyle = '#1e5f7f';
    ctx.fillRect(w / 2 + 320 * scale, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    const info = this.game.city.mapInfo;
    for (const r of info.roads) {
      const [x0] = toMap(r, 0);
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, h); ctx.stroke();
      const [, z0] = toMap(0, r);
      ctx.beginPath(); ctx.moveTo(0, z0); ctx.lineTo(w, z0); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(200,210,230,0.45)';
    for (const b of info.buildings) {
      const [x, z] = toMap(b.x - b.w / 2, b.z - b.d / 2);
      ctx.fillRect(x, z, Math.max(1, b.w * scale), Math.max(1, b.d * scale));
    }
    ctx.font = 'bold 13px Arial';
    const label = (x, z, text, color) => {
      const [px, pz] = toMap(x, z);
      ctx.fillStyle = color || '#ffd75e';
      ctx.beginPath(); ctx.arc(px, pz, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(text, px + 8, pz + 4);
    };
    const lm = this.game.city.landmarks;
    label(lm.pelicanTower.x, lm.pelicanTower.z, 'Pelican Tower');
    for (const rs of lm.repairShops) label(rs.x, rs.z, rs.name, '#7dff9a');
    label(lm.chopShop.x, lm.chopShop.z, 'Chop Shop', '#ff9a5e');
    label(lm.garage.x, lm.garage.z, 'Garage', '#8fe3ff');
    label(lm.villa.x, lm.villa.z, 'Halden Villa', '#ff9a9a');
    // 7 mission markers.
    const spots = [[24, 40], [-40, 96], [-64, 200], [-232, -232], [224, -96], [-224, 224], [96, -224]];
    spots.forEach((p, i) => {
      const [px, pz] = toMap(p[0], p[1]);
      ctx.fillStyle = i < this.game.missions.index ? '#7dff9a' : '#ffd75e';
      ctx.beginPath(); ctx.arc(px, pz, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px Arial';
      ctx.fillText(String(i + 1), px - 3, pz + 3);
      ctx.font = 'bold 13px Arial';
    });
    const [px, pz] = toMap(this.game.player.x, this.game.player.z);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px, pz, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('YOU', px + 8, pz + 4);
  }
  renderSlots() {
    const slots = this.game.listSaves();
    this.el.slots.innerHTML = '';
    slots.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.textContent = s ? ('Slot ' + (i + 1) + ' — Mission ' + (s.missionIndex + 1) + ' · $' + s.money) : ('Slot ' + (i + 1) + ' — empty');
      d.addEventListener('click', () => this.game.saveToSlot(i));
      this.el.slots.appendChild(d);
    });
  }
}
