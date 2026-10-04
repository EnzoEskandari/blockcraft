// Enchantments: what each one is, which items take it, and how the enchanting table, the anvil and the
// grindstone work with them. The numbers (levels, weights, costs) follow the original game's.
//
// An enchanted stack carries them as `e`: { key: level }. Keys are never renamed (saves hold them).
import { ITEMS, ID } from './blocks.js';
import { mulberry32 } from './noise.js';

const lin = (base, per) => (l) => base + (l - 1) * per;
// name, highest level, weight (how often the table picks it), lowest enchanting power for a level, how far
// above that it still appears, what it goes on at the table (`on`) and with an anvil (`also`), what it can't
// be combined with (`not`), treasure (never from the table), curse
export const ENCH = {
  protection: { name: 'Protection', max: 4, w: 10, min: lin(1, 11), span: 11, on: 'armor', not: ['fire_protection', 'blast_protection', 'projectile_protection'] },
  fire_protection: { name: 'Fire Protection', max: 4, w: 5, min: lin(10, 8), span: 8, on: 'armor', not: ['protection', 'blast_protection', 'projectile_protection'] },
  feather_falling: { name: 'Feather Falling', max: 4, w: 5, min: lin(5, 6), span: 6, on: 'boots' },
  blast_protection: { name: 'Blast Protection', max: 4, w: 2, min: lin(5, 8), span: 8, on: 'armor', not: ['protection', 'fire_protection', 'projectile_protection'] },
  projectile_protection: { name: 'Projectile Protection', max: 4, w: 5, min: lin(3, 6), span: 6, on: 'armor', not: ['protection', 'fire_protection', 'blast_protection'] },
  respiration: { name: 'Respiration', max: 3, w: 2, min: (l) => 10 * l, span: 30, on: 'helmet' },
  aqua_affinity: { name: 'Aqua Affinity', max: 1, w: 2, min: () => 1, span: 40, on: 'helmet' },
  thorns: { name: 'Thorns', max: 3, w: 1, min: lin(10, 20), span: 50, on: 'chestplate', also: 'armor' },
  depth_strider: { name: 'Depth Strider', max: 3, w: 2, min: (l) => 10 * l, span: 15, on: 'boots', not: ['frost_walker'] },
  frost_walker: { name: 'Frost Walker', max: 2, w: 2, min: (l) => 10 * l, span: 15, on: 'boots', not: ['depth_strider'], treasure: true },
  soul_speed: { name: 'Soul Speed', max: 3, w: 1, min: (l) => 10 * l, span: 15, on: 'boots', treasure: true },
  swift_sneak: { name: 'Swift Sneak', max: 3, w: 1, min: (l) => 25 * l, span: 50, on: 'leggings', treasure: true },
  sharpness: { name: 'Sharpness', max: 5, w: 10, min: lin(1, 11), span: 20, on: 'sword', also: 'axe', not: ['smite', 'bane_of_arthropods'] },
  smite: { name: 'Smite', max: 5, w: 5, min: lin(5, 8), span: 20, on: 'sword', also: 'axe', not: ['sharpness', 'bane_of_arthropods'] },
  bane_of_arthropods: { name: 'Bane of Arthropods', max: 5, w: 5, min: lin(5, 8), span: 20, on: 'sword', also: 'axe', not: ['sharpness', 'smite'] },
  knockback: { name: 'Knockback', max: 2, w: 5, min: lin(5, 20), span: 50, on: 'sword' },
  fire_aspect: { name: 'Fire Aspect', max: 2, w: 2, min: lin(10, 20), span: 50, on: 'sword' },
  looting: { name: 'Looting', max: 3, w: 2, min: lin(15, 9), span: 50, on: 'sword' },
  sweeping_edge: { name: 'Sweeping Edge', max: 3, w: 2, min: lin(5, 9), span: 15, on: 'sword' },
  efficiency: { name: 'Efficiency', max: 5, w: 10, min: lin(1, 10), span: 50, on: 'tool' },
  silk_touch: { name: 'Silk Touch', max: 1, w: 1, min: () => 15, span: 50, on: 'tool', not: ['fortune'] },
  unbreaking: { name: 'Unbreaking', max: 3, w: 5, min: lin(5, 8), span: 50, on: 'gear', also: 'breakable' },
  fortune: { name: 'Fortune', max: 3, w: 2, min: lin(15, 9), span: 50, on: 'tool', not: ['silk_touch'] },
  power: { name: 'Power', max: 5, w: 10, min: lin(1, 10), span: 15, on: 'bow' },
  punch: { name: 'Punch', max: 2, w: 2, min: lin(12, 20), span: 25, on: 'bow' },
  flame: { name: 'Flame', max: 1, w: 2, min: () => 20, span: 30, on: 'bow' },
  infinity: { name: 'Infinity', max: 1, w: 1, min: () => 20, span: 30, on: 'bow', not: ['mending'] },
  luck_of_the_sea: { name: 'Luck of the Sea', max: 3, w: 2, min: lin(15, 9), span: 50, on: 'rod' },
  lure: { name: 'Lure', max: 3, w: 2, min: lin(15, 9), span: 50, on: 'rod' },
  loyalty: { name: 'Loyalty', max: 3, w: 5, min: (l) => 5 + 7 * l, top: 50, on: 'trident', not: ['riptide'] },
  impaling: { name: 'Impaling', max: 5, w: 2, min: lin(1, 8), span: 20, on: 'trident' },
  riptide: { name: 'Riptide', max: 3, w: 2, min: (l) => 10 + 7 * l, top: 50, on: 'trident', not: ['loyalty', 'channeling'] },
  channeling: { name: 'Channeling', max: 1, w: 1, min: () => 25, top: 50, on: 'trident', not: ['riptide'] },
  multishot: { name: 'Multishot', max: 1, w: 2, min: () => 20, top: 50, on: 'crossbow', not: ['piercing'] },
  quick_charge: { name: 'Quick Charge', max: 3, w: 5, min: lin(12, 20), top: 50, on: 'crossbow' },
  piercing: { name: 'Piercing', max: 4, w: 10, min: lin(1, 10), top: 50, on: 'crossbow', not: ['multishot'] },
  mending: { name: 'Mending', max: 1, w: 2, min: () => 25, span: 50, on: 'gear', also: 'breakable', not: ['infinity'], treasure: true },
  binding_curse: { name: 'Curse of Binding', max: 1, w: 1, min: () => 25, top: 50, on: 'armor', treasure: true, curse: true },
  vanishing_curse: { name: 'Curse of Vanishing', max: 1, w: 1, min: () => 25, top: 50, on: 'gear', also: 'breakable', treasure: true, curse: true },
};
export const ENCH_KEYS = Object.keys(ENCH);
for (const k of ENCH_KEYS) ENCH[k].key = k;
const maxCost = (E, l) => (E.top !== undefined ? E.top : E.min(l) + E.span);

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const enchLine = (key, lvl) => (ENCH[key] ? ENCH[key].name + (ENCH[key].max > 1 ? ' ' + (ROMAN[lvl] || lvl) : '') : key);

// What a stack carries
export const ench = (s, key) => (s && s.e && s.e[key]) || 0;
export const enchList = (s) => (s && s.e ? ENCH_KEYS.filter((k) => s.e[k]).map((k) => [k, s.e[k]]) : []);
export const isEnchanted = (s) => !!(s && s.e && Object.keys(s.e).length);

// Only real enchantments at sensible levels survive loading a save or a message from another player
export function cleanEnch(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  const out = {};
  let n = 0;
  for (const k of ENCH_KEYS) {
    const l = e[k] | 0;
    if (l > 0) { out[k] = Math.min(l, ENCH[k].max); n++; }
  }
  return n ? out : null;
}

// ---------------------------------------------------------------- which items take what
const ARMOR_TAG = ['helmet', 'chestplate', 'leggings', 'boots'];
// The kinds an item counts as: 'gear' is anything the table enchants, 'breakable' anything that wears out
export function itemTags(id) {
  const it = ITEMS[id];
  if (!it || it.isBlock) return [];
  const t = [];
  if (it.durability) t.push('breakable');
  if (it.armor) t.push('armor', ARMOR_TAG[it.armor.slot], 'gear');
  else if (it.tool === 'sword') t.push('sword', 'gear');
  else if (it.tool === 'axe') t.push('tool', 'axe', 'gear');
  else if (it.tool === 'pickaxe' || it.tool === 'shovel' || it.tool === 'hoe') t.push('tool', 'gear');
  else if (id === ID.bow) t.push('bow', 'gear');
  else if (id === ID.crossbow) t.push('crossbow', 'gear');
  else if (id === ID.trident) t.push('trident', 'gear');
  else if (id === ID.fishing_rod) t.push('rod', 'gear');
  return t;
}

// How readily an item takes enchantments at the table (0: not at all)
const TOOL_ABILITY = { wooden: 15, stone: 5, iron: 14, golden: 22, diamond: 10 };
const ARMOR_ABILITY = { leather: 15, chainmail: 12, iron: 9, golden: 25, diamond: 10 };
export function enchantability(id) {
  const it = ITEMS[id];
  if (!it) return 0;
  if (id === ID.book) return 1;
  if (it.armor) return ARMOR_ABILITY[it.material] || 9;
  if (it.tool) return TOOL_ABILITY[it.material] || 10;
  return itemTags(id).includes('gear') ? 1 : 0;
}

// Does this enchantment go on this item (with an anvil, or at the table when `table`)?
export function fits(key, id, table = false) {
  const E = ENCH[key];
  if (!E) return false;
  if (id === ID.book || id === ID.enchanted_book) return true;
  const tags = itemTags(id);
  return tags.includes(E.on) || (!table && !!E.also && tags.includes(E.also));
}
export const compatible = (a, b) => a === b || !((ENCH[a].not || []).includes(b) || (ENCH[b].not || []).includes(a));

// ---------------------------------------------------------------- the enchanting table
const nextInt = (rng, n) => Math.floor(rng() * n);
// (seeds are scrambled first, so two that are close don't give offers that are alike)
const scramble = (seed, k) => { let h = (seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };

// The three level requirements the table offers, from the number of bookshelves around it (15 is the most
// that count: they bring the bottom slot to level 30)
export function tableLevels(seed, shelves, id) {
  if (!enchantability(id)) return [0, 0, 0];
  const b = Math.max(0, Math.min(15, shelves | 0));
  const rng = mulberry32(scramble(seed, 0));
  const out = [];
  for (let i = 0; i < 3; i++) {
    const base = 1 + nextInt(rng, 8) + (b >> 1) + nextInt(rng, b + 1);
    const lvl = i === 0 ? Math.max(Math.floor(base / 3), 1) : i === 1 ? Math.floor(base * 2 / 3) + 1 : Math.max(base, b * 2);
    out.push(lvl < i + 1 ? 0 : lvl);
  }
  return out;
}

// Every enchantment (at its highest level that fits) an enchanting power can give this item
function available(power, id, treasure) {
  const out = [];
  for (const k of ENCH_KEYS) {
    const E = ENCH[k];
    if (E.treasure && !treasure) continue;
    if (!fits(k, id, true)) continue;
    for (let l = E.max; l >= 1; l--) {
      if (power >= E.min(l) && power <= maxCost(E, l)) { out.push([k, l]); break; }
    }
  }
  return out;
}
function weighted(rng, pool) {
  let v = rng() * pool.reduce((n, [k]) => n + ENCH[k].w, 0);
  return pool.find(([k]) => (v -= ENCH[k].w) < 0) || pool[pool.length - 1];
}

// The enchantments an item gets for spending `level` levels: usually one, sometimes more at high levels
export function rollEnchantments(rng, id, level, treasure = false) {
  const ability = enchantability(id);
  if (!ability) return [];
  let power = level + 1 + nextInt(rng, (ability >> 2) + 1) + nextInt(rng, (ability >> 2) + 1);
  power = Math.max(1, Math.round(power + power * (rng() + rng() - 1) * 0.15));
  let pool = available(power, id, treasure);
  const out = [];
  if (!pool.length) return out;
  out.push(weighted(rng, pool));
  while (nextInt(rng, 50) <= power) {
    const last = out[out.length - 1][0];
    pool = pool.filter(([k]) => k !== last && compatible(k, last));
    if (!pool.length) break;
    out.push(weighted(rng, pool));
    power = Math.floor(power / 2);
  }
  // a book holds one fewer when it would get several
  if (id === ID.book && out.length > 1) out.splice(nextInt(rng, out.length), 1);
  return out;
}

// What the table shows and gives for one of its three slots: always the same for the same seed
export function tableOffer(seed, slot, level, id) {
  return level ? rollEnchantments(mulberry32(scramble(seed, slot + 1)), id, level) : [];
}

// Puts enchantments on a stack (a book becomes an enchanted book)
export function enchanted(s, list) {
  const e = { ...(s.e || {}) };
  for (const [k, l] of list) e[k] = Math.max(e[k] || 0, l);
  return { id: s.id === ID.book ? ID.enchanted_book : s.id, count: 1, dmg: s.dmg || 0, e };
}

// A book holding one enchantment picked at random (villager librarians, treasure chests, fishing)
export function randomBook(rng, treasure = true) {
  const keys = ENCH_KEYS.filter((k) => treasure || !ENCH[k].treasure);
  const k = keys[nextInt(rng, keys.length)];
  return { id: ID.enchanted_book, count: 1, dmg: 0, e: { [k]: 1 + nextInt(rng, ENCH[k].max) } };
}
// An item enchanted as if at a table with this many levels (loot, trades, what you fish up)
export function randomlyEnchanted(rng, id, level, treasure = false) {
  const list = rollEnchantments(rng, id, level, treasure);
  return list.length ? enchanted({ id, count: 1, dmg: 0 }, list) : { id, count: 1, dmg: 0 };
}

// ---------------------------------------------------------------- the anvil
// What mends each kind of thing, a quarter of its durability per piece
const REPAIR = { wooden: '#planks', stone: '#cobblestone', iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond', leather: 'leather', chainmail: 'iron_ingot' };
export function repairItem(id) {
  const it = ITEMS[id];
  if (!it || !it.durability) return null;
  if (id === ID.shield) return '#planks';
  return REPAIR[it.material] || null;
}
const rarityCost = (k) => (ENCH[k].w >= 10 ? 1 : ENCH[k].w >= 5 ? 2 : ENCH[k].w >= 2 ? 4 : 8);

// Left item + right item -> { out, cost (levels), uses (how many of the right stack are used) }, or null.
// A book adds its enchantments, a second item of the same kind adds its enchantments and what is left of
// its durability, and the item's own material mends it. Two of the same level make the next level.
export function anvil(a, b, isRepair) {
  if (!a || !b) return null;
  const ia = ITEMS[a.id];
  if (!ia || a.id === ID.book || a.count !== 1) return null;
  const out = { id: a.id, count: 1, dmg: a.dmg || 0, e: { ...(a.e || {}) } };
  let cost = 0, uses = 1;
  if (isRepair && isRepair(a.id, b.id) && ia.durability) {
    if (!out.dmg) return null;
    const per = Math.ceil(ia.durability / 4);
    uses = Math.min(b.count, Math.ceil(out.dmg / per));
    out.dmg = Math.max(0, out.dmg - per * uses);
    cost = uses;
  } else {
    const book = b.id === ID.enchanted_book;
    const same = b.id === a.id && (ia.durability || a.id === ID.enchanted_book);
    if (!book && !same) return null;
    if (same && ia.durability && (a.dmg || b.dmg)) {
      const left = (ia.durability - (a.dmg || 0)) + (ia.durability - (b.dmg || 0)) + Math.floor(ia.durability * 0.12);
      out.dmg = Math.max(0, ia.durability - left);
      if (out.dmg < (a.dmg || 0)) cost += 2;
    }
    let added = 0;
    for (const [k, lb] of enchList(b)) {
      if (!fits(k, a.id)) continue;
      if (Object.keys(out.e).some((o) => o !== k && !compatible(o, k))) { cost += 1; continue; }
      const la = out.e[k] || 0;
      const l = Math.min(ENCH[k].max, la === lb ? la + 1 : Math.max(la, lb));
      if (l > la) added++;
      out.e[k] = l;
      cost += Math.max(1, Math.floor(rarityCost(k) / (book ? 2 : 1))) * l;
    }
    if (!added && !(cost >= 2 && out.dmg < (a.dmg || 0))) return null;
  }
  if (!Object.keys(out.e).length) delete out.e;
  cost = Math.max(1, cost);
  return { out, cost, uses, tooExpensive: cost > 39 };
}

// The grindstone takes enchantments off (curses stay) and gives some experience back for them
export function grind(s) {
  if (!s || !isEnchanted(s)) return null;
  let xp = 0;
  const keep = {};
  for (const [k, l] of enchList(s)) {
    if (ENCH[k].curse) keep[k] = l;
    else xp += ENCH[k].min(l);
  }
  if (!xp) return null;
  const out = { id: s.id === ID.enchanted_book ? ID.book : s.id, count: 1, dmg: s.dmg || 0 };
  if (Object.keys(keep).length) { out.e = keep; if (s.id === ID.enchanted_book) out.id = ID.enchanted_book; }
  return { out, xp: Math.ceil(xp * 0.75) };
}

// ---------------------------------------------------------------- what they do
// Extra damage a weapon's enchantments add against a kind of mob
export function bonusDamage(s, def) {
  let d = 0;
  const sh = ench(s, 'sharpness'), sm = ench(s, 'smite'), ba = ench(s, 'bane_of_arthropods');
  if (sh) d += 0.5 * sh + 0.5;
  if (sm && def && def.undead) d += 2.5 * sm;
  if (ba && def && def.arthropod) d += 2.5 * ba;
  return d;
}

// Unbreaking: does this point of wear count? (armour shrugs off less of it than tools)
export function wears(s, armor = false) {
  const l = ench(s, 'unbreaking');
  if (!l) return true;
  return armor ? Math.random() < 0.6 + 0.4 / (l + 1) : Math.random() < 1 / (l + 1);
}

// How much of a kind of damage the protection enchantments on the armour take off (0 to 0.8)
const FIRE_KINDS = ['fire', 'lava', 'burn'];
export function protection(armor, kind) {
  let epf = 0;
  for (const s of armor) {
    if (!s || !s.e) continue;
    epf += ench(s, 'protection');
    if (FIRE_KINDS.includes(kind)) epf += 2 * ench(s, 'fire_protection');
    if (kind === 'explosion') epf += 2 * ench(s, 'blast_protection');
    if (kind === 'arrow' || kind === 'fireball') epf += 2 * ench(s, 'projectile_protection');
    if (kind === 'fall' || kind === 'pearl') epf += 3 * ench(s, 'feather_falling');
  }
  return Math.min(20, epf) * 0.04;
}

// ---------------------------------------------------------------- experience
// Points needed to go from a level to the next
export const xpForLevel = (l) => (l >= 30 ? 112 + (l - 30) * 9 : l >= 15 ? 37 + (l - 15) * 5 : 7 + l * 2);
// All the points it takes to reach a level from nothing
export function xpToReach(l) {
  let n = 0;
  for (let i = 0; i < l; i++) n += xpForLevel(i);
  return n;
}

// ---------------------------------------------------------------- bookshelves
// How many bookshelves an enchanting table at (x, y, z) can draw on: those two blocks away, level with it or
// one higher, with nothing in between. Fifteen are as many as count.
export function countShelves(world, x, y, z, shelfId, open) {
  let n = 0;
  const shelf = (a, b, c) => (world.getBlock(a, b, c) === shelfId ? 1 : 0);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dz) || !open(x + dx, y, z + dz) || !open(x + dx, y + 1, z + dz)) continue;
    n += shelf(x + dx * 2, y, z + dz * 2) + shelf(x + dx * 2, y + 1, z + dz * 2);
    if (dx && dz) n += shelf(x + dx * 2, y, z + dz) + shelf(x + dx * 2, y + 1, z + dz) + shelf(x + dx, y, z + dz * 2) + shelf(x + dx, y + 1, z + dz * 2);
  }
  return Math.min(15, n);
}
