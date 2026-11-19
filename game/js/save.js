// save.js - save slots for Heatline: Marisol Bay (localStorage, 3 slots).
export const SAVE_KEY = 'heatline.save.v1';
export function defaultSave() {
  return {
    v: 1, slot: 0, missionIndex: 0, money: 250, health: 100, armor: 0,
    weapons: { fists: 1, pistol: 1 }, ammo: { pistol: 48, smg: 0, shotgun: 0, rifle: 0, molotov: 0, frag: 0 },
    currentWeapon: 'pistol', pos: [24, 0, 120], heading: 0, completed: [],
  };
}
export function readSlot(slot) {
  try {
    const raw = localStorage.getItem(SAVE_KEY + '.' + slot);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch (e) { return null; }
}
export function writeSlot(slot, data) {
  try {
    data.slot = slot;
    localStorage.setItem(SAVE_KEY + '.' + slot, JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Save failed — check browser storage settings.' };
  }
}
export function listSlots() {
  const out = [];
  for (let i = 0; i < 3; i++) out.push(readSlot(i));
  return out;
}
export function hasAnySave() { return listSlots().some((s) => s !== null); }
