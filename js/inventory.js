// Item stacks and the player's inventory (slots 0-8 are the hotbar, 9-35 the main grid).
import { maxStack, ITEMS } from './blocks.js';

export const stack = (id, count = 1, dmg = 0) => ({ id, count, dmg });
export const cloneStack = (s) => (s ? { id: s.id, count: s.count, dmg: s.dmg || 0 } : null);
export const sameItem = (a, b) => a && b && a.id === b.id && !ITEMS[a.id]?.durability;

export function packSlots(slots) { return slots.map((s) => (s ? [s.id, s.count, s.dmg || 0] : 0)); }
export function unpackSlots(arr, n) {
  const out = new Array(n).fill(null);
  (arr || []).forEach((v, i) => { if (v && i < n && ITEMS[v[0]]) out[i] = stack(v[0], v[1], v[2]); });
  return out;
}

// How many times a recipe can be made from the items that count(id) reports
export function craftableTimes(count, rec) {
  let times = Infinity;
  for (const g of rec.groups) {
    let have = 0;
    for (const id of g.ids) have += count(id);
    times = Math.min(times, Math.floor(have / g.n));
  }
  return times === Infinity ? 0 : times;
}

// Takes one recipe's worth of ingredients out of the inventory; false if they are not all there
export function takeIngredients(inv, rec) {
  if (craftableTimes((id) => inv.count(id), rec) < 1) return false;
  for (const g of rec.groups) {
    let need = g.n;
    const ids = [...g.ids].sort((a, b) => inv.count(b) - inv.count(a));
    for (const id of ids) {
      const k = Math.min(need, inv.count(id));
      if (k) { inv.remove(id, k); need -= k; }
      if (!need) break;
    }
  }
  return true;
}

export class Inventory {
  constructor() {
    this.slots = new Array(36).fill(null);
    this.selected = 0;
  }
  get held() { return this.slots[this.selected]; }

  // Returns how many items did not fit
  add(id, count, dmg = 0) {
    const max = maxStack(id);
    if (max > 1) {
      for (let i = 0; i < 36 && count > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.count < max) {
          const n = Math.min(count, max - s.count);
          s.count += n; count -= n;
        }
      }
    }
    for (let i = 0; i < 36 && count > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(count, max);
        this.slots[i] = stack(id, n, dmg);
        count -= n;
      }
    }
    return count;
  }

  count(id) { return this.slots.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0); }

  remove(id, n) {
    for (let i = 35; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const k = Math.min(n, s.count);
        s.count -= k; n -= k;
        if (!s.count) this.slots[i] = null;
      }
    }
  }

  consumeHeld(n = 1) {
    const s = this.held;
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
  }

  // Damages the held tool; returns true if it broke
  damageHeld(n = 1) {
    const s = this.held;
    if (!s) return false;
    const it = ITEMS[s.id];
    if (!it || !it.durability) return false;
    s.dmg = (s.dmg || 0) + n;
    if (s.dmg >= it.durability) { this.slots[this.selected] = null; return true; }
    return false;
  }

  clear() { this.slots.fill(null); }
}
