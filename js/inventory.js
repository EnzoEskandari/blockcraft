// Item stacks and the player's inventory (slots 0-8 are the hotbar, 9-35 the main grid).
import { maxStack, ITEMS, ID } from './blocks.js';
import { cleanEnch, wears } from './enchant.js';

// A stack: { id, count, dmg } and, when it is enchanted, e: { enchantment: level }
export const stack = (id, count = 1, dmg = 0, e = null) => (e ? { id, count, dmg, e } : { id, count, dmg });
export const cloneStack = (s) => (s ? stack(s.id, s.count, s.dmg || 0, s.e ? { ...s.e } : null) : null);
// (things that wear out or are enchanted never pile up together)
export const sameItem = (a, b) => a && b && a.id === b.id && !ITEMS[a.id]?.durability && !a.e && !b.e;

// Saved as [id, count, damage] or, enchanted, [id, count, damage, { enchantment: level }]
// (a fifth entry, 1, is a crossbow that is loaded)
export const packStack = (s) => (s ? (s.ch ? [s.id, s.count, s.dmg || 0, s.e || 0, 1] : s.e ? [s.id, s.count, s.dmg || 0, s.e] : [s.id, s.count, s.dmg || 0]) : 0);
export function packSlots(slots) { return slots.map(packStack); }
export function unpackSlots(arr, n) {
  const out = new Array(n).fill(null);
  (arr || []).forEach((v, i) => { if (v && i < n && ITEMS[v[0]]) { out[i] = stack(v[0], v[1], v[2], cleanEnch(v[3])); if (v[4]) out[i].ch = 1; } });
  return out;
}

// Bundles. A bundle holds what would fill one stack of 64, of any mix of things: a thing that stacks to 16 takes
// up four times the room, and one that does not stack fills it alone. Its contents are saved stacks, last in
// last, kept in `e.bundle` so that they stay with it wherever a stack goes.
export const BUNDLE_SIZE = 64;
export const isBundle = (s) => !!s && s.id === ID.bundle;
export const bundleItems = (s) => unpackSlots(s.e && s.e.bundle, BUNDLE_SIZE).filter(Boolean);
const roomEach = (id) => Math.ceil(BUNDLE_SIZE / maxStack(id));
export const bundleFill = (s) => bundleItems(s).reduce((n, x) => n + roomEach(x.id) * x.count, 0);
const setItems = (s, list) => { if (list.length) s.e = { bundle: packSlots(list) }; else delete s.e; };

// Puts as much of stack `st` into the bundle as fits (taking it off `st`) and returns how many went in
export function bundleAdd(b, st) {
  if (!st || isBundle(st)) return 0;
  const n = Math.min(st.count, Math.floor((BUNDLE_SIZE - bundleFill(b)) / roomEach(st.id)));
  if (n <= 0) return 0;
  const list = bundleItems(b);
  let left = n;
  // (on top of what it has of the same thing, and that goes to the top, where it comes out first)
  for (let i = list.length - 1; i >= 0 && left; i--) {
    const x = list[i];
    if (!sameItem(x, st) || x.count >= maxStack(x.id)) continue;
    const k = Math.min(left, maxStack(x.id) - x.count);
    x.count += k; left -= k;
    list.push(...list.splice(i, 1));
  }
  if (left) { const x = cloneStack(st); x.count = left; if (st.ch) x.ch = 1; list.push(x); }
  setItems(b, list);
  st.count -= n;
  return n;
}

// Takes out what went in last, or null if there is nothing in it
export function bundleTake(b) {
  const list = bundleItems(b), x = list.pop() || null;
  setItems(b, list);
  return x;
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
  add(id, count, dmg = 0, e = null) {
    const max = e ? 1 : maxStack(id);
    if (max > 1) {
      for (let i = 0; i < 36 && count > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && !s.e && s.count < max) {
          const n = Math.min(count, max - s.count);
          s.count += n; count -= n;
        }
      }
    }
    for (let i = 0; i < 36 && count > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(count, max);
        this.slots[i] = stack(id, n, dmg, e ? { ...e } : null);
        count -= n;
      }
    }
    return count;
  }

  // How many more of an item would fit
  room(id) {
    const max = maxStack(id);
    let n = 0;
    for (const s of this.slots) {
      if (!s) n += max;
      else if (max > 1 && s.id === id) n += Math.max(0, max - s.count);
    }
    return n;
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

  // Damages the held tool; returns true if it broke (Unbreaking lets some of the wear pass)
  damageHeld(n = 1) {
    const s = this.held;
    if (!s) return false;
    const it = ITEMS[s.id];
    if (!it || !it.durability) return false;
    if (s.e) { let k = 0; for (let i = 0; i < n; i++) if (wears(s)) k++; n = k; }
    s.dmg = (s.dmg || 0) + n;
    if (s.dmg >= it.durability) { this.slots[this.selected] = null; return true; }
    return false;
  }

  clear() { this.slots.fill(null); }
}
