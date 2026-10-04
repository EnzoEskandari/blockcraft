// Generated structures: villages, desert pyramids, jungle temples, witch huts, igloos,
// pillager outposts, woodland mansions, ruined portals, desert wells and shipwrecks.
//
// Each structure type sits on a grid of regions. A region deterministically picks one spot,
// checks the biome there, and builds a plan (a list of parts with bounding boxes). When a chunk
// generates, every part that overlaps it is stamped with writes clipped to that chunk, so a
// structure comes out identical no matter which chunk loads first.
import { B, ID, BLOCKS, ITEMS, JOB_BLOCKS } from './blocks.js';
import { hash3, mulberry32 } from './noise.js';
import { randomBook, randomlyEnchanted } from './enchant.js';
import { CS, CH, SEA, BIOME } from './constants.js';
import { NB, NETHER_LAVA, strongholds } from './dims.js';

const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
const DIRV = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // facing meta -> (dx, dz)

function rotVec(dx, dz, r) {
  switch (r & 3) {
    case 0: return [dx, dz];
    case 1: return [-dz, dx];
    case 2: return [-dx, -dz];
    default: return [dz, -dx];
  }
}
function rotFacing(meta, r) {
  const [dx, dz] = rotVec(DIRV[meta][0], DIRV[meta][1], r);
  return DIRV.findIndex((v) => v[0] === dx && v[1] === dz);
}
// rotation that turns the local front (0, -1) into world direction (fx, fz)
function rotFor(fx, fz) {
  if (fz === -1) return 0;
  if (fx === 1) return 1;
  if (fz === 1) return 2;
  return 3;
}

// ---------------------------------------------------------------- loot
// From worst to best: villages and outposts hold everyday things and worn gear, temples and
// shipwrecks hold treasure. Each table: rolls [min, max], items [key, min, max, weight],
// sure (always in the chest) and wear (how used any tools and armour are, 0-1).
const LOOT = {
  village_house: {
    rolls: [2, 5], wear: [0.3, 0.8],
    items: [['bread', 1, 3, 10], ['wheat', 2, 6, 8], ['wheat_seeds', 2, 6, 8], ['apple', 1, 3, 8], ['cooked_porkchop', 1, 2, 3], ['coal', 1, 3, 6], ['torch', 2, 6, 5],
      ['stick', 2, 6, 4], ['oak_sapling', 1, 2, 4], ['feather', 1, 3, 3], ['white_wool', 1, 3, 3], ['leather', 1, 3, 3], ['string', 1, 2, 2], ['flint', 1, 2, 2],
      ['paper', 1, 3, 3], ['book', 1, 1, 2], ['emerald', 1, 1, 2], ['iron_ingot', 1, 1, 1], ['wooden_pickaxe', 1, 1, 2], ['stone_axe', 1, 1, 2],
      ['leather_helmet', 1, 1, 2], ['leather_boots', 1, 1, 2]],
  },
  blacksmith: {
    rolls: [3, 6], wear: [0.25, 0.7],
    items: [['iron_ingot', 1, 4, 10], ['coal', 2, 6, 8], ['bread', 1, 3, 6], ['apple', 1, 3, 5], ['gold_ingot', 1, 2, 3], ['flint', 1, 3, 3], ['obsidian', 1, 3, 2],
      ['stone_pickaxe', 1, 1, 3], ['iron_pickaxe', 1, 1, 3], ['iron_sword', 1, 1, 3], ['iron_axe', 1, 1, 2], ['iron_shovel', 1, 1, 2],
      ['iron_helmet', 1, 1, 2], ['iron_boots', 1, 1, 2], ['iron_leggings', 1, 1, 1], ['iron_chestplate', 1, 1, 1], ['chainmail_chestplate', 1, 1, 1], ['diamond', 1, 1, 1]],
  },
  outpost: {
    rolls: [2, 4], wear: [0.4, 0.85],
    items: [['arrow', 2, 8, 8], ['string', 1, 4, 6], ['wheat', 2, 5, 6], ['dark_oak_log', 2, 4, 5], ['bread', 1, 2, 4], ['bone', 1, 3, 4], ['rotten_flesh', 1, 4, 4],
      ['bow', 1, 1, 3], ['stone_sword', 1, 1, 2], ['leather_chestplate', 1, 1, 2], ['iron_ingot', 1, 2, 2], ['emerald', 1, 1, 1], ['book', 1, 1, 1]],
  },
  igloo: {
    rolls: [3, 5], wear: [0.2, 0.6],
    items: [['apple', 1, 3, 12], ['coal', 1, 4, 12], ['bread', 1, 2, 8], ['cooked_mutton', 1, 3, 6], ['wheat', 2, 3, 6], ['torch', 2, 5, 4], ['gold_ingot', 1, 2, 6],
      ['iron_ingot', 1, 2, 3], ['emerald', 1, 1, 2], ['stone_axe', 1, 1, 3], ['leather_helmet', 1, 1, 3]],
  },
  ruined_portal: {
    rolls: [4, 7], wear: [0.1, 0.6],
    items: [['obsidian', 1, 3, 30], ['flint', 1, 4, 30], ['iron_ingot', 2, 6, 25], ['flint_and_steel', 1, 1, 20], ['gold_ingot', 2, 8, 20],
      ['golden_sword', 1, 1, 12], ['golden_axe', 1, 1, 12], ['golden_pickaxe', 1, 1, 10], ['golden_helmet', 1, 1, 10], ['golden_chestplate', 1, 1, 8],
      ['golden_leggings', 1, 1, 8], ['golden_boots', 1, 1, 10], ['glowstone', 4, 12, 8], ['emerald', 1, 2, 6], ['gold_block', 1, 2, 3], ['diamond', 1, 1, 2]],
  },
  mansion: {
    rolls: [3, 7], wear: [0, 0.4],
    items: [['iron_ingot', 2, 5, 10], ['gold_ingot', 2, 5, 8], ['emerald', 1, 4, 8], ['diamond', 1, 2, 4], ['bread', 2, 4, 6], ['book', 1, 3, 6], ['bookshelf', 1, 2, 3],
      ['string', 2, 6, 6], ['bone', 2, 6, 5], ['redstone', 2, 6, 5], ['lapis_lazuli', 2, 6, 5], ['cobweb', 1, 3, 3], ['iron_leggings', 1, 1, 3], ['iron_chestplate', 1, 1, 3],
      ['chainmail_chestplate', 1, 1, 3], ['diamond_pickaxe', 1, 1, 1], ['diamond_chestplate', 1, 1, 1], ['diamond_hoe', 1, 1, 1]],
  },
  pyramid: {
    rolls: [4, 7], wear: [0, 0.25], sure: [['gold_ingot', 2, 5]],
    items: [['diamond', 1, 3, 8], ['emerald', 2, 5, 10], ['gold_ingot', 2, 7, 14], ['iron_ingot', 2, 6, 12], ['gold_block', 1, 1, 3], ['lapis_lazuli', 3, 8, 6],
      ['redstone', 3, 8, 6], ['bone', 2, 6, 10], ['rotten_flesh', 2, 6, 8], ['gunpowder', 2, 6, 8], ['tnt', 1, 3, 4], ['sand', 3, 8, 4], ['book', 1, 3, 6],
      ['shade_pearl', 1, 1, 3], ['golden_chestplate', 1, 1, 4], ['golden_leggings', 1, 1, 3], ['iron_chestplate', 1, 1, 4], ['diamond_sword', 1, 1, 2],
      ['diamond_pickaxe', 1, 1, 2], ['diamond_helmet', 1, 1, 1], ['diamond_boots', 1, 1, 1]],
  },
  jungle_temple: {
    rolls: [4, 7], wear: [0, 0.25], sure: [['diamond', 1, 2], ['emerald', 1, 3]],
    items: [['diamond', 1, 3, 8], ['emerald', 2, 5, 10], ['gold_ingot', 2, 7, 12], ['iron_ingot', 2, 6, 12], ['gold_block', 1, 1, 2], ['bone', 2, 6, 10],
      ['rotten_flesh', 2, 6, 8], ['arrow', 4, 12, 6], ['bow', 1, 1, 4], ['book', 1, 3, 6], ['jungle_log', 3, 6, 4], ['shade_pearl', 1, 1, 3],
      ['iron_pickaxe', 1, 1, 4], ['iron_helmet', 1, 1, 4], ['golden_chestplate', 1, 1, 3], ['diamond_sword', 1, 1, 2], ['diamond_axe', 1, 1, 2], ['diamond_leggings', 1, 1, 1]],
  },
  shipwreck_supply: {
    rolls: [4, 8], wear: [0, 0.4], sure: [['bread', 2, 5]],
    items: [['paper', 2, 12, 8], ['wheat', 8, 20, 6], ['coal', 3, 10, 8], ['gunpowder', 2, 6, 6], ['tnt', 1, 3, 4], ['pumpkin', 1, 3, 3], ['cooked_porkchop', 2, 5, 6],
      ['steak', 2, 5, 4], ['apple', 2, 5, 5], ['book', 1, 3, 5], ['emerald', 1, 3, 4], ['diamond', 1, 1, 2], ['leather_helmet', 1, 1, 3],
      ['chainmail_helmet', 1, 1, 3], ['chainmail_chestplate', 1, 1, 3], ['chainmail_leggings', 1, 1, 3], ['chainmail_boots', 1, 1, 3],
      ['iron_sword', 1, 1, 3], ['iron_axe', 1, 1, 3], ['iron_pickaxe', 1, 1, 3]],
  },
  stronghold_corridor: {
    rolls: [3, 6], wear: [0, 0.4],
    items: [['shade_pearl', 1, 2, 10], ['iron_ingot', 1, 5, 10], ['gold_ingot', 1, 3, 5], ['bread', 1, 3, 15], ['apple', 1, 3, 15], ['redstone', 4, 9, 5],
      ['diamond', 1, 3, 3], ['iron_pickaxe', 1, 1, 5], ['iron_sword', 1, 1, 5], ['iron_chestplate', 1, 1, 5], ['iron_helmet', 1, 1, 5], ['iron_leggings', 1, 1, 5], ['iron_boots', 1, 1, 5]],
  },
  stronghold_library: {
    rolls: [2, 8], wear: [0, 0],
    items: [['book', 1, 3, 20], ['paper', 2, 7, 20], ['bookshelf', 1, 2, 4], ['shade_pearl', 1, 1, 2]],
  },
  fortress: {
    rolls: [3, 6], wear: [0, 0.3], sure: [['gold_ingot', 1, 3]],
    items: [['diamond', 1, 3, 5], ['iron_ingot', 1, 5, 5], ['gold_ingot', 1, 3, 15], ['golden_sword', 1, 1, 5], ['golden_chestplate', 1, 1, 5],
      ['flint_and_steel', 1, 1, 5], ['nether_wart', 3, 7, 5], ['obsidian', 2, 4, 2], ['cinder_rod', 1, 2, 4], ['magma_cream', 1, 3, 4]],
  },
  bastion: {
    rolls: [4, 8], wear: [0, 0.3], sure: [['gold_block', 1, 2]],
    items: [['gold_ingot', 3, 9, 16], ['gold_nugget', 6, 17, 12], ['diamond', 1, 3, 6], ['golden_helmet', 1, 1, 5], ['golden_boots', 1, 1, 5], ['golden_leggings', 1, 1, 4],
      ['golden_axe', 1, 1, 4], ['diamond_sword', 1, 1, 2], ['diamond_chestplate', 1, 1, 2], ['obsidian', 2, 6, 6], ['magma_cream', 2, 6, 6], ['cinder_rod', 1, 3, 3],
      ['shade_pearl', 1, 2, 4], ['arrow', 5, 17, 6], ['gilded_blackstone', 2, 6, 5], ['string', 3, 8, 5]],
  },
  end_city: {
    rolls: [4, 8], wear: [0, 0.15], sure: [['diamond', 1, 3]],
    items: [['diamond', 2, 7, 10], ['iron_ingot', 4, 8, 10], ['gold_ingot', 2, 7, 15], ['emerald', 2, 6, 3], ['diamond_sword', 1, 1, 3], ['diamond_pickaxe', 1, 1, 3],
      ['diamond_helmet', 1, 1, 3], ['diamond_chestplate', 1, 1, 3], ['diamond_leggings', 1, 1, 3], ['diamond_boots', 1, 1, 3], ['iron_sword', 1, 1, 3],
      ['iron_chestplate', 1, 1, 3], ['shade_pearl', 1, 3, 5], ['clamper_shell', 1, 2, 3], ['end_rod', 2, 6, 4]],
  },
  shipwreck_treasure: {
    rolls: [5, 9], wear: [0, 0.15], sure: [['diamond', 2, 4], ['emerald', 3, 8], ['gold_ingot', 3, 8]],
    items: [['iron_ingot', 3, 9, 20], ['gold_ingot', 3, 9, 14], ['emerald', 3, 9, 14], ['diamond', 1, 4, 10], ['lapis_lazuli', 4, 10, 8], ['gold_block', 1, 2, 4],
      ['iron_block', 1, 1, 3], ['diamond_block', 1, 1, 1], ['emerald_block', 1, 1, 1], ['shade_pearl', 1, 2, 4], ['glowstone', 2, 6, 4], ['golden_helmet', 1, 1, 3],
      ['diamond_sword', 1, 1, 3], ['diamond_pickaxe', 1, 1, 3], ['diamond_chestplate', 1, 1, 2], ['diamond_helmet', 1, 1, 2], ['diamond_boots', 1, 1, 2]],
  },
};

// Enchantments in loot: [chance a tool or armour piece is enchanted, lowest and highest level it is
// enchanted with, weight of a book of enchantment among the table's items]
const BOOK_LOOT = {
  blacksmith: [0.15, 5, 15, 0], outpost: [0.2, 5, 15, 2], igloo: [0.3, 10, 25, 4], ruined_portal: [0.5, 10, 25, 3], mansion: [0.4, 15, 30, 6],
  pyramid: [0.4, 15, 30, 10], jungle_temple: [0.4, 15, 30, 10], shipwreck_supply: [0.2, 5, 15, 0], shipwreck_treasure: [0.5, 15, 30, 6],
  stronghold_corridor: [0.4, 15, 30, 5], stronghold_library: [0, 0, 0, 30], fortress: [0.3, 10, 25, 3], bastion: [0.6, 20, 30, 8], end_city: [1, 20, 30, 6],
};

// Items for a structure chest, spread over 27 slots
export function rollLoot(table, seed) {
  const T = LOOT[table];
  const slots = new Array(27).fill(null);
  if (!T) return slots;
  const r = mulberry32(seed >>> 0);
  const put = (key, min, max) => {
    const id = ID[key];
    if (!id) return;
    const def = ITEMS[id];
    const count = Math.min(def ? def.stack : 64, min + Math.floor(r() * (max - min + 1)));
    // tools and armour found lying around are used; the better the place, the less worn
    let dmg = 0;
    if (def && def.durability && T.wear) dmg = Math.floor(def.durability * (T.wear[0] + r() * (T.wear[1] - T.wear[0])));
    let slot = Math.floor(r() * 27);
    for (let t = 0; t < 27 && slots[slot]; t++) slot = (slot + 7) % 27;
    if (slots[slot]) return;
    slots[slot] = { id, count, dmg };
    // books of enchantment, and in the better places gear that is already enchanted
    const E = BOOK_LOOT[table];
    if (key === 'enchanted_book') slots[slot] = randomBook(r, true);
    else if (E && def && def.durability && r() < E[0]) slots[slot] = { ...randomlyEnchanted(r, id, E[1] + Math.floor(r() * (E[2] - E[1] + 1)), true), dmg };
  };
  for (const [key, min, max] of T.sure || []) put(key, min, max);
  // (how often a roll turns up a book of enchantment, on top of the table's own things)
  const E = BOOK_LOOT[table];
  const items = E && E[3] ? [...T.items, ['enchanted_book', 1, 1, E[3]]] : T.items;
  const total = items.reduce((n, it) => n + it[3], 0);
  const rolls = T.rolls[0] + Math.floor(r() * (T.rolls[1] - T.rolls[0] + 1));
  for (let k = 0; k < rolls; k++) {
    let pick = r() * total;
    const it = items.find((x) => (pick -= x[3]) < 0) || items[0];
    put(it[0], it[1], it[2]);
  }
  return slots;
}

// ---------------------------------------------------------------- stamping context
function makeCtx(world, chunk, plan) {
  const x0 = chunk.cx * CS, z0 = chunk.cz * CS;
  const blocks = chunk.blocks;
  const inside = (x, z) => x >= x0 && x < x0 + CS && z >= z0 && z < z0 + CS;
  const ctx = {
    world, plan, x0, z0, inside,
    set(x, y, z, id, meta = 0) {
      if (!inside(x, z) || y < 1 || y >= CH - 1) return;
      const i = (y << 8) | ((z - z0) << 4) | (x - x0);
      blocks[i] = id;
      if (meta || chunk.meta) {
        if (!chunk.meta) chunk.meta = new Uint8Array(CS * CS * CH);
        chunk.meta[i] = meta;
      }
    },
    get(x, y, z) {
      if (!inside(x, z) || y < 0 || y >= CH) return -1;
      return blocks[(y << 8) | ((z - z0) << 4) | (x - x0)];
    },
    ground: (x, z) => plan.ground(x, z),
    chest(x, y, z, loot, facing = 0) {
      ctx.set(x, y, z, B.chest, facing);
      if (inside(x, z)) world.lootChests.set(`${x},${y},${z}`, loot);
    },
    // a positional hash for decisions that must match across chunks
    h: (x, y, z, s = 0) => hash3(world.seed ^ (0x5717 + s), x, y, z),
  };
  return ctx;
}

// Local coordinates for a rotated building part: x across, z depth (front is -z), y up from the floor
function local(ctx, part) {
  const ox = part.x, oy = part.y, oz = part.z, rot = part.rot || 0;
  const L = {
    w(lx, lz) { const [dx, dz] = rotVec(lx, lz, rot); return [ox + dx, oz + dz]; },
    set(lx, ly, lz, id, meta = 0) {
      const [dx, dz] = rotVec(lx, lz, rot);
      const def = BLOCKS[id];
      const m = def && def.facing ? (rotFacing(meta & 3, rot) | (meta & ~3)) : meta;
      ctx.set(ox + dx, oy + ly, oz + dz, id, m);
    },
    get(lx, ly, lz) { const [dx, dz] = rotVec(lx, lz, rot); return ctx.get(ox + dx, oy + ly, oz + dz); },
    fill(lx0, ly0, lz0, lx1, ly1, lz1, id, meta = 0) {
      for (let ly = Math.min(ly0, ly1); ly <= Math.max(ly0, ly1); ly++)
        for (let lz = Math.min(lz0, lz1); lz <= Math.max(lz0, lz1); lz++)
          for (let lx = Math.min(lx0, lx1); lx <= Math.max(lx0, lx1); lx++) L.set(lx, ly, lz, id, meta);
    },
    chest(lx, ly, lz, loot, facing = 0) {
      const [dx, dz] = rotVec(lx, lz, rot);
      ctx.chest(ox + dx, oy + ly, oz + dz, loot, rotFacing(facing, rot));
    },
    door(lx, ly, lz, facing) { L.set(lx, ly, lz, B.oak_door, facing); L.set(lx, ly + 1, lz, B.oak_door_top, facing); },
    bed(lx, ly, lz, facing) {
      L.set(lx, ly, lz, B.bed_foot, facing);
      L.set(lx + DIRV[facing][0], ly, lz + DIRV[facing][1], B.bed_head, facing);
    },
    // Level the footprint: fill below the floor down to the ground, clear everything above
    prepare(hw, hd, height, found, floor) {
      for (let lz = -hd; lz <= hd; lz++) for (let lx = -hw; lx <= hw; lx++) {
        const [wx, wz] = L.w(lx, lz);
        if (!ctx.inside(wx, wz)) continue;
        const g = ctx.ground(wx, wz);
        const bottom = Math.max(Math.min(g, oy - 1), oy - 10);
        for (let y = bottom; y <= oy - 2; y++) ctx.set(wx, y, wz, found);
        if (floor !== null) ctx.set(wx, oy - 1, wz, floor);
        const top = Math.min(oy + Math.max(height, g - oy + 2), oy + 16);
        for (let y = oy; y <= top; y++) ctx.set(wx, y, wz, 0);
      }
    },
    // A short path from the front door to the road
    doorstep(hd, len, pathId) {
      // Villages in land first seen from 1.7 on: the path meets the door at the level of the floor and
      // goes up or down a block at a time to the ground, so a house on a slope can always be walked into
      if (ctx.plan.gen >= 3) {
        const f = oy - 1;
        for (let k = 1; k <= 3; k++) {   // (no further than the road, so nothing across it is cut into)
          const [wx, wz] = L.w(0, -hd - k);
          const g = ctx.ground(wx, wz);
          const t = f + Math.max(-(k - 1), Math.min(k - 1, g - f));
          if (t < SEA) break;
          for (let y = Math.min(g, t); y < t; y++) ctx.set(wx, y, wz, B.cobblestone);
          ctx.set(wx, t, wz, pathId);
          for (let y = t + 1; y <= Math.max(t + 3, g); y++) ctx.set(wx, y, wz, 0);   // (room to walk, and no higher: the eaves stay)
          if (t === g && k > len) break;
        }
        return;
      }
      for (let k = 1; k <= len; k++) {
        const [wx, wz] = L.w(0, -hd - k);
        const g = ctx.ground(wx, wz);
        if (g >= SEA) { ctx.set(wx, g, wz, pathId); ctx.set(wx, g + 1, wz, 0); ctx.set(wx, g + 2, wz, 0); }
      }
    },
  };
  return L;
}

function bboxOf(x, z, hw, hd, rot, margin = 1) {
  const ex = (rot & 1 ? hd : hw) + margin, ez = (rot & 1 ? hw : hd) + margin;
  return { minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez };
}
const overlaps = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

// ---------------------------------------------------------------- village buildings
const STYLE = {
  plains: { wall: B.oak_planks, frame: B.oak_log, floor: B.oak_planks, found: B.cobblestone, roof: B.oak_planks, win: B.glass, flat: false, path: B.dirt_path },
  desert: { wall: B.sandstone, frame: B.chiseled_sandstone, floor: B.sandstone, found: B.sandstone, roof: B.sandstone, win: 0, flat: true, accent: B.orange_terracotta, path: B.dirt_path },
  taiga: { wall: B.spruce_planks, frame: B.spruce_log, floor: B.spruce_planks, found: B.cobblestone, roof: B.spruce_planks, win: B.glass, flat: false, path: B.dirt_path },
  snowy: { wall: B.spruce_planks, frame: B.spruce_log, floor: B.spruce_planks, found: B.stone_bricks, roof: B.dark_oak_planks, win: B.glass, flat: false, path: B.dirt_path },
};

function walls(L, S, hw, hd, H, wallId) {
  for (let ly = 0; ly < H; ly++) for (let lz = -hd; lz <= hd; lz++) for (let lx = -hw; lx <= hw; lx++) {
    const edgeX = lx === -hw || lx === hw, edgeZ = lz === -hd || lz === hd;
    if (!edgeX && !edgeZ) continue;
    L.set(lx, ly, lz, edgeX && edgeZ ? S.frame : wallId || S.wall);
  }
}
function roof(L, S, hw, hd, H) {
  if (S.flat) {
    L.fill(-hw, H, -hd, hw, H, hd, S.roof);
    for (let lz = -hd; lz <= hd; lz++) for (let lx = -hw; lx <= hw; lx++) {
      if (lx === -hw || lx === hw || lz === -hd || lz === hd) L.set(lx, H + 1, lz, S.accent && (lx + lz) % 2 === 0 ? S.accent : S.roof);
    }
    return;
  }
  for (let i = 0; i <= hw + 1; i++) {
    const x0 = -hw - 1 + i, x1 = hw + 1 - i;
    if (x0 > x1) break;
    L.fill(x0, H + i, -hd - 1, x1, H + i, hd + 1, S.roof);
  }
}
function windowsOn(L, S, hw, hd, ly) {
  const w = S.win;
  L.set(-hw, ly, 0, w); L.set(hw, ly, 0, w); L.set(0, ly, hd, w);
  if (hd >= 3) { L.set(-hw, ly, -hd + 2, w); L.set(hw, ly, -hd + 2, w); L.set(-hw, ly, hd - 2, w); L.set(hw, ly, hd - 2, w); }
  if (hw >= 3) { L.set(-2, ly, -hd, w); L.set(2, ly, -hd, w); L.set(-2, ly, hd, w); L.set(2, ly, hd, w); }
}

const BUILDINGS = {
  small: { w: 5, d: 5, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 2, 7, S.found, S.floor);
    walls(L, S, 2, 2, 3);
    L.door(0, 0, -2, 2);
    windowsOn(L, S, 2, 2, 1);
    roof(L, S, 2, 2, 3);
    const v = Math.floor(ctx.h(part.x, part.y, part.z, 41) * 3);
    L.bed(1, 0, 0, 0);
    if (v === 0) L.set(-1, 0, 1, B.crafting_table);
    else if (v === 1) L.chest(-1, 0, 1, 'village_house', 3);
    else { L.set(-1, 0, 1, B.furnace, 3); L.set(-1, 0, 0, B.crafting_table); }
    L.set(-1, 0, -1, B.torch);
    L.doorstep(2, 2, S.path);
  } },
  big: { w: 7, d: 7, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(3, 3, 9, S.found, S.floor);
    walls(L, S, 3, 3, 4);
    L.door(0, 0, -3, 2);
    windowsOn(L, S, 3, 3, 1);
    windowsOn(L, S, 3, 3, 2);
    roof(L, S, 3, 3, 4);
    L.bed(2, 0, 1, 0);
    L.chest(-2, 0, 2, 'village_house', 2);
    L.set(-2, 0, 1, B.crafting_table);
    L.set(-2, 0, -1, B.furnace, 3);
    L.set(2, 0, -2, B.torch);
    if (ctx.h(part.x, part.y, part.z, 42) < 0.5) L.set(0, 0, 2, B.bookshelf);
    else L.bed(0, 0, 1, 0);
    L.doorstep(3, 2, S.path);
  } },
  // Two storeys: kitchen downstairs, bedroom upstairs, reached by steps
  tall: { w: 5, d: 7, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 3, 12, S.found, S.floor);
    walls(L, S, 2, 3, 7);
    L.fill(-1, 3, -2, 1, 3, 2, S.floor);
    for (let k = 0; k < 4; k++) L.fill(1, 0, -2 + k, 1, k, -2 + k, S.floor);
    L.fill(1, 3, -2, 1, 3, 0, 0);
    L.door(0, 0, -3, 2);
    windowsOn(L, S, 2, 3, 1);
    windowsOn(L, S, 2, 3, 5);
    roof(L, S, 2, 3, 7);
    L.set(-1, 0, 2, B.crafting_table);
    L.set(0, 0, 2, B.furnace, 2);
    L.set(-1, 0, -2, B.torch);
    L.bed(-1, 4, 1, 0);
    L.chest(0, 4, 2, 'village_house', 2);
    L.set(1, 4, 2, B.torch);
    L.doorstep(3, 2, S.path);
  } },
  // A long family house with two beds and storage
  longhouse: { w: 5, d: 9, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 4, 8, S.found, S.floor);
    walls(L, S, 2, 4, 3);
    for (const lz of [-2, 0, 2]) L.fill(-2, 1, lz, -2, 1, lz, S.win === 0 ? 0 : S.win), L.fill(2, 1, lz, 2, 1, lz, S.win === 0 ? 0 : S.win);
    L.door(0, 0, -4, 2);
    roof(L, S, 2, 4, 3);
    L.bed(-1, 0, 2, 0);
    L.bed(1, 0, 2, 0);
    L.chest(-1, 0, 0, 'village_house', 1);
    L.chest(1, 0, 0, 'village_house', 3);
    L.set(-1, 0, -2, B.crafting_table);
    L.set(1, 0, -2, B.bookshelf);
    L.set(0, 0, 1, B.torch);
    L.doorstep(4, 2, S.path);
  } },
  // A small log hut with a flat roof, hay and a chest
  hut: { w: 5, d: 5, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 2, 6, S.found, S.floor);
    walls(L, S, 2, 2, 3, S.frame);
    L.fill(0, 0, -2, 0, 1, -2, 0);
    L.set(-2, 1, 0, S.win === 0 ? 0 : S.win); L.set(2, 1, 0, S.win === 0 ? 0 : S.win);
    L.fill(-2, 3, -2, 2, 3, 2, S.roof);
    for (let lz = -2; lz <= 2; lz++) for (let lx = -2; lx <= 2; lx++) if (lx === -2 || lx === 2 || lz === -2 || lz === 2) L.set(lx, 4, lz, S.frame);
    L.set(1, 0, 1, B.hay_bale);
    L.set(1, 1, 1, B.hay_bale);
    L.chest(-1, 0, 1, 'village_house', 2);
    L.set(-1, 0, -1, B.torch);
    L.bed(1, 0, -1, 1);
    L.doorstep(2, 2, S.path);
  } },
  // A house with a covered front porch
  porch: { w: 7, d: 7, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(3, 3, 9, S.found, S.floor);
    for (let ly = 0; ly < 4; ly++) for (let lz = -1; lz <= 3; lz++) for (let lx = -3; lx <= 3; lx++) {
      const ex = lx === -3 || lx === 3, ez = lz === -1 || lz === 3;
      if (ex || ez) L.set(lx, ly, lz, ex && ez ? S.frame : S.wall);
    }
    L.door(0, 0, -1, 2);
    L.set(-2, 1, -1, S.win === 0 ? 0 : S.win); L.set(2, 1, -1, S.win === 0 ? 0 : S.win);
    L.set(-3, 1, 1, S.win === 0 ? 0 : S.win); L.set(3, 1, 1, S.win === 0 ? 0 : S.win); L.set(0, 1, 3, S.win === 0 ? 0 : S.win);
    for (let lx = -3; lx <= 3; lx++) if (lx !== 0) L.set(lx, 0, -3, B.oak_fence);
    L.set(-3, 0, -2, B.oak_fence); L.set(3, 0, -2, B.oak_fence);
    for (const lx of [-3, 3]) L.fill(lx, 1, -3, lx, 3, -3, S.frame);
    roof(L, S, 3, 3, 4);
    L.bed(2, 0, 1, 0);
    L.chest(-2, 0, 2, 'village_house', 2);
    L.set(-2, 0, 0, B.crafting_table);
    L.set(0, 0, 2, B.furnace, 2);
    L.set(2, 0, 0, B.torch);
    L.set(-2, 0, -2, B.hay_bale);
    L.doorstep(3, 2, S.path);
  } },
  library: { w: 7, d: 9, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(3, 4, 10, S.found, S.floor);
    walls(L, S, 3, 4, 5);
    L.door(0, 0, -4, 2);
    windowsOn(L, S, 3, 4, 2);
    roof(L, S, 3, 4, 5);
    for (let lz = -2; lz <= 3; lz++) { L.fill(-2, 0, lz, -2, 1, lz, B.bookshelf); L.fill(2, 0, lz, 2, 1, lz, B.bookshelf); }
    L.fill(-1, 0, 3, 1, 1, 3, B.bookshelf);
    L.set(0, 0, 1, B.crafting_table);
    L.set(-1, 0, -3, B.torch); L.set(1, 0, -3, B.torch);
    L.doorstep(4, 2, S.path);
  } },
  blacksmith: { w: 7, d: 7, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(3, 3, 7, S.found, B.cobblestone);
    for (let ly = 0; ly < 4; ly++) for (let lz = -3; lz <= 3; lz++) for (let lx = -3; lx <= 3; lx++) {
      const edge = lx === -3 || lx === 3 || lz === 3;
      const corner = (lx === -3 || lx === 3) && (lz === -3 || lz === 3);
      if (corner) L.set(lx, ly, lz, S.frame);
      else if (edge) L.set(lx, ly, lz, ly === 0 ? B.cobblestone : B.stone_bricks);
    }
    L.fill(-3, 4, -3, 3, 4, 3, B.cobblestone);
    L.set(-1, 0, 2, B.furnace, 2); L.set(1, 0, 2, B.furnace, 2);
    L.chest(2, 0, 2, 'blacksmith', 2);
    L.set(-2, 0, 2, B.crafting_table);
    L.set(2, 0, -2, B.torch);
    L.set(-2, 0, -1, B.iron_block);
  } },
  church: { w: 5, d: 9, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 4, 13, S.found, S.floor);
    walls(L, S, 2, 4, 5, B.cobblestone);
    for (let ly = 5; ly < 10; ly++) for (let lz = 1; lz <= 4; lz++) for (let lx = -2; lx <= 2; lx++) {
      if (lx === -2 || lx === 2 || lz === 1 || lz === 4) L.set(lx, ly, lz, (ly === 7 && lx === 0) || (ly === 7 && lz === 1 && lx === 0) ? B.glass : B.cobblestone);
    }
    L.fill(-2, 5, -4, 2, 5, 0, B.cobblestone);
    L.fill(-2, 10, 1, 2, 10, 4, B.cobblestone);
    L.set(0, 11, 2, B.glowstone);
    L.door(0, 0, -4, 2);
    windowsOn(L, { ...S, win: B.glass }, 2, 4, 2);
    L.set(0, 0, 3, B.glowstone);
    L.doorstep(4, 2, S.path);
  } },
  butcher: { w: 5, d: 7, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 3, 8, S.found, S.floor);
    walls(L, S, 2, 3, 3);
    L.door(0, 0, -3, 2);
    windowsOn(L, S, 2, 3, 1);
    roof(L, S, 2, 3, 3);
    L.set(1, 0, 2, B.furnace, 2);
    L.chest(-1, 0, 2, 'village_house', 2);
    L.set(1, 0, -2, B.torch);
    L.doorstep(3, 2, S.path);
  } },
  farm: { w: 9, d: 7, build(ctx, part) {
    const L = local(ctx, part);
    L.prepare(4, 3, 3, B.dirt, null);
    for (let lz = -3; lz <= 3; lz++) for (let lx = -4; lx <= 4; lx++) {
      const edge = lx === -4 || lx === 4 || lz === -3 || lz === 3;
      if (edge) { L.set(lx, -1, lz, B.oak_log); continue; }
      if (lz === 0) { L.set(lx, -1, lz, B.water); continue; }
      L.set(lx, -1, lz, B.farmland);
      const [wx, wz] = L.w(lx, lz);
      const stage = Math.min(3, Math.floor(ctx.h(wx, part.y, wz, 3) * 4.4));
      L.set(lx, 0, lz, B.wheat_0 + stage);
    }
  } },
  pen: { w: 7, d: 7, build(ctx, part) {
    const L = local(ctx, part);
    L.prepare(3, 3, 3, B.dirt, B.grass);
    for (let lz = -3; lz <= 3; lz++) for (let lx = -3; lx <= 3; lx++) {
      if ((lx === -3 || lx === 3 || lz === -3 || lz === 3) && !(lz === -3 && lx === 0)) L.set(lx, 0, lz, B.oak_fence);
    }
    L.set(2, 0, 2, B.hay_bale);
  } },
  lamp: { w: 1, d: 1, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(0, 0, 3, S.found, S.found);
    L.set(0, 0, 0, B.oak_fence); L.set(0, 1, 0, B.oak_fence); L.set(0, 2, 0, B.torch);
  } },
  well: { w: 5, d: 5, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 2, 5, S.found, S.found);
    for (let lz = -2; lz <= 2; lz++) for (let lx = -2; lx <= 2; lx++) {
      const rim = lx === -2 || lx === 2 || lz === -2 || lz === 2;
      if (rim) L.set(lx, 0, lz, S.found);
      else { L.set(lx, -1, lz, B.water); L.set(lx, -2, lz, B.water); L.set(lx, -3, lz, S.found); }
    }
    for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { L.set(lx, 1, lz, B.oak_fence); L.set(lx, 2, lz, B.oak_fence); }
    L.fill(-2, 3, -2, 2, 3, 2, S.found);
  } },
};

function buildRoad(ctx, part) {
  const S = STYLE[part.style];
  for (let x = part.minX; x <= part.maxX; x++) for (let z = part.minZ; z <= part.maxZ; z++) {
    if (!ctx.inside(x, z)) continue;
    const g = ctx.ground(x, z);
    if (g < SEA) { ctx.set(x, SEA, z, S.floor); continue; }
    ctx.set(x, g, z, S.path);
    for (let y = g + 1; y <= g + 6; y++) {
      const b = ctx.get(x, y, z);
      if (b > 0 && (BLOCKS[b].replaceable || BLOCKS[b].cutout || b === B.oak_log || b === B.spruce_log || b === B.birch_log || b === B.cactus || b === B.dandelion || b === B.poppy || b === B.pumpkin)) ctx.set(x, y, z, 0);
    }
  }
}

// Villages in land first seen from 1.7 on: the house of every villager with a trade holds its job block,
// and the buildings that had no bed get one. [x, y, z] inside each kind of building.
const JOB_SPOT = { small: [1, 0, -1], big: [2, 0, -1], tall: [-1, 0, 0], longhouse: [-1, 0, -1], hut: [-1, 0, 0], porch: [-2, 0, 1], library: [0, 0, 2], blacksmith: [0, 0, 2], church: [1, 0, 3], butcher: [0, 0, 2], farm: [-4, 0, -3] };
const EXTRA_BED = { library: [-1, 0, -3], blacksmith: [2, 0, -1], church: [-1, 0, 1], butcher: [-1, 0, -1], porch: [1, 0, 1] };   // (the porch house gets a spare one, for the farm hands)
function furnish(ctx, part) {
  const L = local(ctx, part);
  const spot = JOB_SPOT[part.kind], job = part.prof && JOB_BLOCKS[part.prof];
  if (spot && job) L.set(spot[0], spot[1], spot[2], job, 2);
  const bed = EXTRA_BED[part.kind];
  if (bed) L.bed(bed[0], bed[1], bed[2], 0);
}

const HOUSE_KINDS = [['small', 15], ['big', 10], ['tall', 10], ['longhouse', 8], ['hut', 8], ['porch', 9], ['farm', 18], ['blacksmith', 6], ['library', 6], ['church', 4], ['butcher', 6], ['pen', 8]];
const PROF_FOR = {
  small: ['fletcher', 'shepherd', 'leatherworker', 'mason', 'nitwit'],
  big: ['farmer', 'shepherd', 'fletcher', 'librarian'],
  tall: ['librarian', 'cleric', 'mason', 'farmer'],
  longhouse: ['farmer', 'shepherd', 'nitwit', 'fletcher'],
  hut: ['farmer', 'leatherworker', 'shepherd'],
  porch: ['fletcher', 'mason', 'leatherworker', 'farmer'],
  farm: ['farmer'],
  blacksmith: ['armorer', 'weaponsmith', 'toolsmith'],
  library: ['librarian'],
  church: ['cleric'],
  butcher: ['butcher'],
};

function planVillage(world, plan, x, z, col, rng) {
  const style = col.biome === BIOME.DESERT ? 'desert' : col.biome === BIOME.SNOWY ? 'snowy' : col.biome === BIOME.TAIGA ? 'taiga' : 'plains';
  const cy = plan.ground(x, z) + 1;
  if (cy - 1 < SEA + 1) return false;
  const occupied = [];
  const addBuilding = (kind, bx, bz, rot) => {
    const K = BUILDINGS[kind];
    const hw = K.w >> 1, hd = K.d >> 1;
    const box = bboxOf(bx, bz, hw, hd, rot, 1);
    if (occupied.some((o) => overlaps(o, box))) return null;
    const g = plan.ground(bx, bz);
    if (g < SEA + 1) return null;
    const corners = [[box.minX, box.minZ], [box.maxX, box.minZ], [box.minX, box.maxZ], [box.maxX, box.maxZ]].map(([a, b]) => plan.ground(a, b));
    if (Math.max(...corners) - Math.min(...corners) > 6) return null;
    const p = { ...box, x: bx, z: bz, y: g + 1, rot, style, kind, build: (ctx, pp) => { K.build(ctx, pp); if (ctx.plan.gen >= 3) furnish(ctx, pp); } };
    occupied.push(box);
    plan.add(p);
    // (the steps in front of a door reach a few blocks further out than the building itself)
    p.stamp = bboxOf(bx, bz, hw, hd, rot, 7);
    plan.minX = Math.min(plan.minX, p.stamp.minX); plan.maxX = Math.max(plan.maxX, p.stamp.maxX);
    plan.minZ = Math.min(plan.minZ, p.stamp.minZ); plan.maxZ = Math.max(plan.maxZ, p.stamp.maxZ);
    return p;
  };
  const well = addBuilding('well', x, z, 0);
  if (!well) return false;
  const pick = (list) => {
    const total = list.reduce((n, l) => n + l[1], 0);
    let v = rng() * total;
    return (list.find((l) => (v -= l[1]) < 0) || list[0])[0];
  };
  let houses = 0, vi = 0;
  const villager = (prof, vx, vy, vz) => plan.mobs.push({ type: 'villager', x: vx + 0.5, y: vy, z: vz + 0.5, prof, key: `${plan.key}:${vi++}` });
  // A road from (sx, sz) heading (dx, dz), lined with houses; main roads sprout side streets
  const road = (sx, sz, dx, dz, len, branches) => {
    const px = -dz, pz = dx; // perpendicular
    const x1 = sx + dx * len, z1 = sz + dz * len;
    const box = {
      minX: Math.min(sx, x1) - Math.abs(px), maxX: Math.max(sx, x1) + Math.abs(px),
      minZ: Math.min(sz, z1) - Math.abs(pz), maxZ: Math.max(sz, z1) + Math.abs(pz),
      style, build: buildRoad,
    };
    if (occupied.some((o) => overlaps(o, box))) return;
    plan.add(box);
    occupied.push(box);
    const sideStreets = [];
    for (let d = 5; d < len - 2; d += 8 + Math.floor(rng() * 3)) {
      for (const side of [-1, 1]) {
        // leave gaps where side streets branch off
        if (branches && sideStreets.length < 2 && d > 12 && rng() < 0.3) { sideStreets.push([d, side]); continue; }
        if (rng() < 0.08) continue;
        const kind = pick(HOUSE_KINDS);
        const K = BUILDINGS[kind];
        const hd = K.d >> 1;
        const off = hd + 3;
        const bx = sx + dx * d + px * side * off, bz = sz + dz * d + pz * side * off;
        const rot = rotFor(-px * side, -pz * side);
        const p = addBuilding(kind, bx, bz, rot);
        if (!p) continue;
        houses++;
        if (kind === 'pen') {
          const animal = ['cow', 'sheep', 'pig', 'chicken'][Math.floor(rng() * 4)];
          for (let k = 0; k < 2 + Math.floor(rng() * 2); k++) plan.mobs.push({ type: animal, x: bx + 0.5 + (k - 1), y: p.y, z: bz + 0.5, key: `${plan.key}:a${vi++}` });
        } else {
          const profs = PROF_FOR[kind];
          const [fx, fz] = rotVec(0, -1, rot);
          p.prof = profs[Math.floor(rng() * profs.length)];   // (its job block goes in this building)
          villager(p.prof, bx + fx * (hd + 2), p.y, bz + fz * (hd + 2));
        }
      }
    }
    for (let d = 6; d < len; d += 12) addBuilding('lamp', sx + dx * d + px * 2, sz + dz * d + pz * 2, 0);
    for (const [d, side] of sideStreets) {
      road(sx + dx * d + px * side * 2, sz + dz * d + pz * side * 2, px * side, pz * side, 16 + Math.floor(rng() * 12), false);
    }
  };
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) road(x + dx * 4, z + dz * 4, dx, dz, 30 + Math.floor(rng() * 26), true);
  villager('nitwit', x + 3, cy, z + 3);
  villager('farmer', x - 3, cy, z - 3);
  if (houses >= 4) plan.mobs.push({ type: 'iron_golem', x: x + 4.5, y: cy, z: z - 3.5, key: `${plan.key}:golem` });
  return true;
}

// ---------------------------------------------------------------- other structures
function planSingle(plan, x, z, y, hw, hd, rot, build, extra = {}) {
  plan.add({ ...bboxOf(x, z, hw, hd, rot, 2), x, z, y, rot, build, ...extra });
}

function buildPyramid(ctx, part) {
  const { x, z, y } = part;
  const mixed = (i) => (i % 5 === 3 ? B.orange_terracotta : B.sandstone);
  for (let dz = -10; dz <= 10; dz++) for (let dx = -10; dx <= 10; dx++) {
    const wx = x + dx, wz = z + dz;
    if (!ctx.inside(wx, wz)) continue;
    const g = ctx.ground(wx, wz);
    for (let yy = Math.max(Math.min(g, y - 1), y - 12); yy <= y - 1; yy++) ctx.set(wx, yy, wz, B.sandstone);
    for (let yy = y; yy <= y + 12; yy++) ctx.set(wx, yy, wz, 0);
    for (let k = 0; k <= 9; k++) {
      const s = 10 - k, m = Math.max(Math.abs(dx), Math.abs(dz));
      if (m > s) continue;
      const shell = m >= s - 1;
      if (shell || k >= 5) ctx.set(wx, y + k, wz, shell && k % 3 === 1 && m === s ? mixed(k + dx + dz) : B.sandstone);
    }
  }
  // decorated floor
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const m = Math.max(Math.abs(dx), Math.abs(dz));
    ctx.set(x + dx, y - 1, z + dz, m === 2 ? B.orange_terracotta : m === 1 ? B.sandstone : B.blue_terracotta);
  }
  // entrance through the front
  for (let dz = 6; dz <= 10; dz++) for (let dx = -1; dx <= 1; dx++) for (let k = 0; k <= 2; k++) ctx.set(x + dx, y + k, z + dz, 0);
  ctx.set(x - 2, y + 3, z + 9, B.chiseled_sandstone); ctx.set(x + 2, y + 3, z + 9, B.chiseled_sandstone);
  // corner towers
  for (const tx of [-8, 8]) {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) for (let k = 0; k <= 11; k++) {
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      ctx.set(x + tx + dx, y + k, z + 8 + dz, k === 9 || k === 10 ? (edge ? B.orange_terracotta : B.sandstone) : B.sandstone);
    }
    ctx.set(x + tx, y + 7, z + 10, B.chiseled_sandstone);
  }
  // hidden treasure chamber under the blue centre block
  const cy = y - 14;
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) for (let k = 0; k <= 4; k++) {
    const edge = Math.abs(dx) === 4 || Math.abs(dz) === 4 || k === 0 || k === 4;
    ctx.set(x + dx, cy + k, z + dz, edge ? B.sandstone : 0);
  }
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) ctx.set(x + dx, cy - 1, z + dz, B.tnt);
  for (let yy = cy + 4; yy <= y - 2; yy++) ctx.set(x, yy, z, 0);
  ctx.set(x, cy, z, B.blue_terracotta);
  ctx.chest(x + 3, cy + 1, z, 'pyramid', 1);
  ctx.chest(x - 3, cy + 1, z, 'pyramid', 3);
  ctx.chest(x, cy + 1, z + 3, 'pyramid', 2);
  ctx.chest(x, cy + 1, z - 3, 'pyramid', 0);
}

function buildJungleTemple(ctx, part) {
  const L = local(ctx, part);
  const stone = (lx, ly, lz) => { const [wx, wz] = L.w(lx, lz); return ctx.h(wx, part.y + ly, wz, 7) < 0.45 ? B.mossy_cobblestone : B.cobblestone; };
  L.prepare(5, 6, 11, B.cobblestone, B.mossy_stone_bricks);
  for (let ly = 0; ly <= 7; ly++) for (let lz = -6; lz <= 6; lz++) for (let lx = -5; lx <= 5; lx++) {
    const edge = lx === -5 || lx === 5 || lz === -6 || lz === 6;
    if (edge || ly === 7) L.set(lx, ly, lz, stone(lx, ly, lz));
  }
  for (let lz = -5; lz <= 5; lz++) for (let lx = -4; lx <= 4; lx++) L.set(lx, 8, lz, stone(lx, 8, lz));
  for (let lz = -4; lz <= 4; lz++) for (let lx = -3; lx <= 3; lx++) L.set(lx, 9, lz, stone(lx, 9, lz));
  // upper floor over the back half, reached by steps
  for (let lz = 0; lz <= 5; lz++) for (let lx = -4; lx <= 4; lx++) L.set(lx, 3, lz, B.mossy_stone_bricks);
  for (let k = 0; k <= 3; k++) L.fill(4, 0, -3 + k, 4, k, -3 + k, B.cobblestone);
  L.fill(0, 0, -6, 0, 2, -6, 0);
  L.set(-3, 1, -6, 0); L.set(3, 1, -6, 0); L.set(-5, 5, 0, 0); L.set(5, 5, 0, 0);
  for (const lx of [-2, 2]) L.fill(lx, 0, -3, lx, 2, -3, B.mossy_stone_bricks);
  L.chest(0, 4, 5, 'jungle_temple', 2);
  // basement room with a second chest, dropped into through a hole
  L.fill(-2, -5, 1, 2, -2, 5, B.cobblestone);
  L.fill(-1, -4, 2, 1, -2, 4, 0);
  L.set(0, -1, 3, 0);
  L.chest(0, -4, 4, 'jungle_temple', 2);
  L.set(-1, -4, 2, B.torch);
}

function buildWitchHut(ctx, part) {
  const L = local(ctx, part);
  for (let lz = -4; lz <= 4; lz++) for (let lx = -3; lx <= 3; lx++) {
    const [wx, wz] = L.w(lx, lz);
    if (!ctx.inside(wx, wz)) continue;
    for (let ly = 0; ly <= 7; ly++) ctx.set(wx, part.y + ly, wz, 0);
  }
  for (const [lx, lz] of [[-3, -4], [3, -4], [-3, 4], [3, 4], [-3, 0], [3, 0]]) {
    const [wx, wz] = L.w(lx, lz);
    const g = Math.min(ctx.ground(wx, wz), SEA - 1);
    for (let yy = g; yy < part.y; yy++) ctx.set(wx, yy, wz, B.oak_log);
  }
  L.fill(-3, 0, -4, 3, 0, 4, B.spruce_planks);
  for (let ly = 1; ly <= 3; ly++) for (let lz = -2; lz <= 4; lz++) for (let lx = -3; lx <= 3; lx++) {
    if (lx === -3 || lx === 3 || lz === -2 || lz === 4) L.set(lx, ly, lz, (lx === -3 || lx === 3) && (lz === -2 || lz === 4) ? B.oak_log : B.spruce_planks);
  }
  L.fill(0, 1, -2, 0, 2, -2, 0);
  L.set(-3, 2, 1, B.glass); L.set(3, 2, 1, B.glass); L.set(0, 2, 4, B.glass);
  L.fill(-4, 4, -3, 4, 4, 5, B.spruce_planks);
  L.fill(-3, 5, -2, 3, 5, 4, B.spruce_planks);
  L.set(2, 1, 3, B.crafting_table);
  L.set(-2, 1, 3, B.pumpkin);
  L.set(-2, 1, 0, B.torch);
  for (const lx of [-1, 1]) L.set(lx, 1, -4, B.oak_fence);
}

function buildIgloo(ctx, part) {
  const L = local(ctx, part);
  L.prepare(4, 6, 6, B.snow, B.snow);
  for (let ly = 0; ly <= 4; ly++) for (let lz = -4; lz <= 4; lz++) for (let lx = -4; lx <= 4; lx++) {
    const d = Math.sqrt(lx * lx + lz * lz + ly * ly * 1.3);
    if (d <= 3.9 && d > 2.9) L.set(lx, ly, lz, B.snow);
  }
  for (let lz = -2; lz <= 2; lz++) for (let lx = -2; lx <= 2; lx++) if (lx * lx + lz * lz <= 6) L.set(lx, -1, lz, B.white_wool);
  for (let lz = -6; lz <= -3; lz++) {
    L.set(-1, 0, lz, B.snow); L.set(1, 0, lz, B.snow); L.set(-1, 1, lz, B.snow); L.set(1, 1, lz, B.snow);
    L.set(0, 2, lz, B.snow); L.set(0, 0, lz, 0); L.set(0, 1, lz, 0);
  }
  L.set(-3, 1, 0, B.ice); L.set(3, 1, 0, B.ice);
  L.bed(-1, 0, 1, 1);
  L.set(1, 0, 1, B.crafting_table);
  L.set(2, 0, -1, B.furnace, 1);
  L.set(1, 0, -2, B.torch);
  L.chest(-2, 0, -1, 'igloo', 3);
}

function buildOutpost(ctx, part) {
  const L = local(ctx, part);
  L.prepare(4, 4, 22, B.cobblestone, B.cobblestone);
  for (let ly = 0; ly <= 13; ly++) for (let lz = -3; lz <= 3; lz++) for (let lx = -3; lx <= 3; lx++) {
    const edgeX = lx === -3 || lx === 3, edgeZ = lz === -3 || lz === 3;
    if (!edgeX && !edgeZ) continue;
    let id = edgeX && edgeZ ? B.dark_oak_log : ly <= 1 ? B.cobblestone : B.dark_oak_planks;
    if ((ly === 2 || ly === 7 || ly === 12) && (lx === 0 || lz === 0) && !(ly === 2 && lz === -3 && lx === 0)) id = 0;
    L.set(lx, ly, lz, id);
  }
  L.fill(0, 0, -3, 0, 1, -3, 0);
  for (const ly of [4, 9]) L.fill(-2, ly, -2, 2, ly, 2, B.dark_oak_planks);
  L.fill(-4, 14, -4, 4, 14, 4, B.dark_oak_planks);
  for (let lz = -4; lz <= 4; lz++) for (let lx = -4; lx <= 4; lx++) {
    if (lx === -4 || lx === 4 || lz === -4 || lz === 4) L.set(lx, 15, lz, B.oak_fence);
  }
  for (const [lx, lz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) L.fill(lx, 16, lz, lx, 17, lz, B.oak_fence);
  L.fill(-4, 18, -4, 4, 18, 4, B.dark_oak_planks);
  L.fill(-3, 19, -3, 3, 19, 3, B.dark_oak_planks);
  L.chest(0, 15, 0, 'outpost', 2);
  L.set(2, 15, 2, B.torch);
}

function buildMansion(ctx, part) {
  const L = local(ctx, part);
  const HW = 14, HD = 10;
  L.prepare(HW, HD, 16, B.cobblestone, B.dark_oak_planks);
  for (const base of [0, 6]) {
    for (let ly = base; ly < base + 6; ly++) for (let lz = -HD; lz <= HD; lz++) for (let lx = -HW; lx <= HW; lx++) {
      const edgeX = lx === -HW || lx === HW, edgeZ = lz === -HD || lz === HD;
      if (!edgeX && !edgeZ) continue;
      const pillar = (edgeX && edgeZ) || (edgeZ && (lx + HW) % 6 === 0) || (edgeX && (lz + HD) % 5 === 0);
      let id = pillar ? B.dark_oak_log : ly === 0 ? B.cobblestone : B.dark_oak_planks;
      const r = ly - base;
      if (!pillar && (r === 2 || r === 3) && ((edgeZ && (lx + HW) % 6 >= 2 && (lx + HW) % 6 <= 3) || (edgeX && (lz + HD) % 5 === 2))) id = B.glass;
      L.set(lx, ly, lz, id);
    }
    // central hallway with a red runner, rooms on both sides
    const floorY = base === 0 ? -1 : 6;
    if (base === 6) L.fill(-HW + 1, 6, -HD + 1, HW - 1, 6, HD - 1, B.dark_oak_planks);
    for (let lx = -HW + 1; lx <= HW - 1; lx++) L.set(lx, floorY, 0, B.red_wool);
    const r0 = base === 0 ? 0 : 7;
    for (let ly = r0; ly < r0 + 5; ly++) for (let lx = -HW + 1; lx <= HW - 1; lx++) {
      for (const lz of [-2, 2]) {
        const doorGap = (lx + HW) % 6 === 3 && ly < r0 + 2;
        L.set(lx, ly, lz, doorGap ? 0 : B.birch_planks);
      }
    }
    for (let room = 0; room < 4; room++) {
      const rx0 = -HW + 1 + room * 7, rx1 = Math.min(HW - 1, rx0 + 5);
      if (room > 0) for (let ly = r0; ly < r0 + 5; ly++) { L.fill(rx0 - 1, ly, -HD + 1, rx0 - 1, ly, -3, B.birch_planks); L.fill(rx0 - 1, ly, 3, rx0 - 1, ly, HD - 1, B.birch_planks); }
      for (const side of [-1, 1]) {
        const lzA = side < 0 ? -HD + 1 : 3, lzB = side < 0 ? -3 : HD - 1;
        const [wx, wz] = L.w(rx0, lzA);
        const kind = Math.floor(ctx.h(wx, part.y + base, wz, 11) * 5);
        const cx = rx0 + 2, cz = side < 0 ? lzA + 1 : lzB - 1;
        if (kind === 0) { L.bed(cx, r0, cz, side < 0 ? 2 : 0); L.chest(cx + 2, r0, cz, 'mansion', side < 0 ? 0 : 2); }
        else if (kind === 1) { for (let lx = rx0; lx <= rx1; lx++) L.fill(lx, r0, side < 0 ? lzA : lzB, lx, r0 + 1, side < 0 ? lzA : lzB, B.bookshelf); L.set(cx, r0, side < 0 ? lzA + 3 : lzB - 3, B.crafting_table); }
        else if (kind === 2) { L.chest(cx, r0, cz, 'mansion', side < 0 ? 0 : 2); L.set(cx + 1, r0, cz, B.hay_bale); L.set(cx - 1, r0, cz, B.hay_bale); }
        else if (kind === 3) { L.fill(cx - 1, r0, cz, cx + 1, r0, cz, B.dark_oak_planks); L.set(cx, r0 + 1, cz, B.torch); }
        else { for (let lz = Math.min(lzA, lzB); lz <= Math.max(lzA, lzB); lz++) for (let lx = rx0; lx <= rx1; lx++) L.set(lx, r0 - 1, lz, B.white_wool); }
      }
      L.set(rx0 + 1, r0, 1, B.torch);
    }
  }
  // stairs up the hallway to the upper floor
  for (let k = 0; k <= 6; k++) {
    L.fill(HW - 8 + k, 0, 0, HW - 8 + k, k, 0, B.dark_oak_planks);
    if (k >= 3) L.set(HW - 8 + k, 6, 0, 0);
  }
  L.door(0, 0, -HD, 2);
  L.set(-1, 0, -HD - 1, B.torch); L.set(1, 0, -HD - 1, B.torch);
  // roof
  L.fill(-HW, 12, -HD, HW, 12, HD, B.dark_oak_planks);
  L.fill(-HW + 1, 13, -HD + 1, HW - 1, 13, HD - 1, B.dark_oak_planks);
  L.fill(-HW + 3, 14, -HD + 3, HW - 3, 14, HD - 3, B.dark_oak_planks);
}

function buildRuinedPortal(ctx, part) {
  const L = local(ctx, part);
  for (let lz = -5; lz <= 5; lz++) for (let lx = -5; lx <= 5; lx++) {
    const d = Math.hypot(lx, lz);
    const [wx, wz] = L.w(lx, lz);
    if (!ctx.inside(wx, wz)) continue;
    const g = ctx.ground(wx, wz);
    if (ctx.h(wx, 0, wz, 21) < (1 - d / 5.5) * 0.85) ctx.set(wx, g, wz, ctx.h(wx, 1, wz, 22) < 0.12 ? B.obsidian : B.netherrack);
  }
  L.prepare(2, 1, 6, B.netherrack, B.netherrack);
  for (let ly = 0; ly <= 4; ly++) for (let lx = -2; lx <= 1; lx++) {
    const frame = lx === -2 || lx === 1 || ly === 0 || ly === 4;
    if (!frame) continue;
    const [wx, wz] = L.w(lx, 0);
    const missing = ctx.h(wx, part.y + ly, wz, 23) < 0.28;
    L.set(lx, ly, 0, missing ? 0 : B.obsidian);
  }
  L.set(-1, 0, 1, B.gold_block);
  L.set(3, 0, 1, B.obsidian); L.set(-4, 0, -1, B.obsidian);
  L.chest(2, 0, -1, 'ruined_portal', 2);
}

function buildWell(ctx, part) {
  const L = local(ctx, part);
  L.prepare(2, 2, 4, B.sandstone, B.sandstone);
  L.set(0, -1, 0, B.water); L.set(0, -2, 0, B.water); L.set(0, -3, 0, B.sandstone);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) L.fill(lx, 0, lz, lx, 1, lz, B.sandstone);
  L.fill(-1, 2, -1, 1, 2, 1, B.sandstone);
  for (const [lx, lz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) L.set(lx, 0, lz, B.sandstone);
}

function buildShipwreck(ctx, part) {
  const L = local(ctx, part);
  const fillWith = (ly) => (part.y + ly <= SEA ? B.water : 0);
  for (let lx = -8; lx <= 8; lx++) {
    const taper = Math.abs(lx) >= 6 ? 1 : 0;
    const hw = 2 - taper;
    for (let ly = 0; ly <= 7; ly++) for (let lz = -3; lz <= 3; lz++) L.set(lx, ly, lz, fillWith(ly));
    if (Math.abs(lx) <= 7) L.set(lx, 0, 0, B.spruce_log);
    for (let lz = -hw + 1; lz <= hw - 1; lz++) L.set(lx, 1, lz, B.oak_planks);
    for (let ly = 1; ly <= 3; ly++) { L.set(lx, ly, -hw, B.spruce_planks); L.set(lx, ly, hw, B.spruce_planks); }
    if (lx >= -5 && lx <= 6) for (let lz = -hw + 1; lz <= hw - 1; lz++) {
      const [wx, wz] = L.w(lx, lz);
      if (ctx.h(wx, part.y + 3, wz, 31) > 0.25) L.set(lx, 3, lz, B.oak_planks);
    }
  }
  for (let ly = 4; ly <= 5; ly++) for (let lz = -2; lz <= 2; lz++) for (let lx = -8; lx <= -5; lx++) {
    if (lx === -8 || lx === -5 || lz === -2 || lz === 2) L.set(lx, ly, lz, B.spruce_planks);
  }
  L.fill(-8, 3, -1, -6, 3, 1, B.spruce_planks);
  L.set(-5, 4, 0, fillWith(4)); L.set(-5, 5, 0, fillWith(5));
  L.fill(-8, 6, -2, -5, 6, 2, B.spruce_planks);
  for (let ly = 1; ly <= 10; ly++) L.set(2, ly, 0, B.spruce_log);
  L.fill(2, 8, -2, 2, 8, 2, B.spruce_planks);
  L.chest(5, 2, 0, 'shipwreck_supply', 3);
  L.chest(-7, 4, 0, 'shipwreck_treasure', 3);
}

// ---------------------------------------------------------------- the Nether
// A fortress: bridges of nether brick over the lava, a cinder spawner platform, a nether wart garden, chest rooms
function buildFortress(ctx, part) {
  const { x, z, y } = part;
  const N = B.nether_bricks, F = B.nether_brick_fence;
  const arm = 34;
  const deck = (x0, z0, x1, z1) => {
    for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) {
      if (!ctx.inside(xx, zz)) continue;
      ctx.set(xx, y, zz, N);
      for (let k = 1; k <= 5; k++) ctx.set(xx, y + k, zz, 0);
    }
  };
  const rails = (x0, z0, x1, z1) => {
    for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) {
      const edge = xx === x0 || xx === x1 || zz === z0 || zz === z1;
      if (edge && ctx.inside(xx, zz)) ctx.set(xx, y + 1, zz, F);
    }
  };
  const pillar = (px, pz) => {
    if (!ctx.inside(px, pz)) return;
    for (let yy = y - 1; yy > NETHER_LAVA - 6; yy--) {
      const cur = ctx.get(px, yy, pz);
      if (cur !== 0 && cur !== B.lava && yy < y - 2) break;
      ctx.set(px, yy, pz, N);
    }
  };
  // crossing and four bridges
  deck(x - 4, z - 4, x + 4, z + 4);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x0 = dx ? Math.min(x + 5 * dx, x + arm * dx) : x - 2, x1 = dx ? Math.max(x + 5 * dx, x + arm * dx) : x + 2;
    const z0 = dz ? Math.min(z + 5 * dz, z + arm * dz) : z - 2, z1 = dz ? Math.max(z + 5 * dz, z + arm * dz) : z + 2;
    deck(x0, z0, x1, z1);
    rails(x0, z0, x1, z1);
    for (let k = 5; k <= arm; k += 6) { pillar(x + k * dx + (dz ? -2 : 0), z + k * dz + (dx ? -2 : 0)); pillar(x + k * dx + (dz ? 2 : 0), z + k * dz + (dx ? 2 : 0)); }
  }
  for (const [px, pz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) { pillar(x + px, z + pz); for (let k = 1; k <= 3; k++) ctx.set(x + px, y + k, z + pz, N); }
  // room at each end
  const room = (cx, cz, kind) => {
    for (let zz = cz - 5; zz <= cz + 5; zz++) for (let xx = cx - 5; xx <= cx + 5; xx++) {
      if (!ctx.inside(xx, zz)) continue;
      const edge = Math.abs(xx - cx) === 5 || Math.abs(zz - cz) === 5;
      ctx.set(xx, y, zz, N);
      for (let k = 1; k <= 6; k++) ctx.set(xx, y + k, zz, edge ? (k === 3 && (xx + zz) % 3 === 0 ? F : N) : 0);
      ctx.set(xx, y + 7, zz, N);
      pillar(xx, zz);
    }
    // doorways towards the crossing
    for (let k = 1; k <= 3; k++) for (let w = -1; w <= 1; w++) {
      const dx = Math.sign(x - cx), dz = Math.sign(z - cz);
      ctx.set(cx + dx * 5 + (dz ? w : 0), y + k, cz + dz * 5 + (dx ? w : 0), 0);
    }
    if (kind === 'spawner') {
      for (let zz = cz - 1; zz <= cz + 1; zz++) for (let xx = cx - 1; xx <= cx + 1; xx++) ctx.set(xx, y + 1, zz, N);
      ctx.set(cx, y + 2, cz, B.spawner, 0);
    } else if (kind === 'garden') {
      for (let zz = cz - 3; zz <= cz + 3; zz++) for (let xx = cx - 3; xx <= cx + 3; xx++) {
        const edge = Math.abs(xx - cx) === 3 || Math.abs(zz - cz) === 3;
        ctx.set(xx, y + 1, zz, edge ? N : B.soul_sand);
        if (!edge) ctx.set(xx, y + 2, zz, B.nether_wart);
      }
    } else {
      ctx.chest(cx + 3, y + 1, cz + 3, 'fortress', 2);
      ctx.chest(cx - 3, y + 1, cz - 3, 'fortress', 0);
      ctx.set(cx, y + 1, cz, B.spawner, 0);
    }
  };
  room(x + arm + 5, z, 'spawner');
  room(x - arm - 5, z, 'garden');
  room(x, z + arm + 5, 'chests');
  room(x, z - arm - 5, 'chests');
}

// A bastion: a blackstone keep with gold inside, guarded by snoutlings
function buildBastion(ctx, part) {
  const { x, z, y } = part;
  const H = 8, R = 9;
  const stone = (xx, yy, zz) => (ctx.h(xx, yy, zz, 41) < 0.12 ? B.gilded_blackstone : ctx.h(xx, yy, zz, 42) < 0.25 ? B.basalt : B.blackstone);
  for (let zz = z - R; zz <= z + R; zz++) for (let xx = x - R; xx <= x + R; xx++) {
    if (!ctx.inside(xx, zz)) continue;
    const edge = Math.abs(xx - x) === R || Math.abs(zz - z) === R;
    // foundation down into the lava
    for (let yy = y - 1; yy > NETHER_LAVA - 4; yy--) {
      const cur = ctx.get(xx, yy, zz);
      if (cur !== 0 && cur !== B.lava && yy < y - 3) break;
      ctx.set(xx, yy, zz, B.blackstone);
    }
    for (let k = 0; k <= H * 2 + 1; k++) {
      const floor = k === 0 || k === H;
      let id = floor ? B.blackstone : edge ? stone(xx, y + k, zz) : 0;
      if (edge && (k === 3 || k === H + 3) && (xx + zz) % 4 === 0) id = 0;   // windows
      if (k === H * 2 + 1) id = edge ? stone(xx, y + k, zz) : B.blackstone;
      ctx.set(xx, y + k, zz, id);
    }
  }
  // a hole in the upper floor with a ladder of blocks, a gold pile, and chests
  for (let k = 1; k < H; k++) ctx.set(x + R - 2, y + k, z, k % 2 ? B.basalt : 0);
  for (let k = 0; k <= 1; k++) for (let w = -1; w <= 1; w++) ctx.set(x + R - 2 + w, y + H, z + k, 0);
  for (let w = -1; w <= 1; w++) for (let k = 1; k <= 3; k++) ctx.set(x + w, y + k, z - R, 0);   // gate
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) ctx.set(x + dx, y + H + 1, z + dz, B.gold_block);
  ctx.set(x, y + H + 2, z, B.gold_block);
  ctx.chest(x - R + 2, y + 1, z + R - 2, 'bastion', 0);
  ctx.chest(x + R - 2, y + H + 1, z + R - 2, 'bastion', 0);
  ctx.chest(x - R + 2, y + H + 1, z - R + 2, 'bastion', 2);
  ctx.set(x - 3, y + 1, z - 3, B.magma_block);
  ctx.set(x + 3, y + 1, z + 3, B.magma_block);
}

// ---------------------------------------------------------------- the End
// An end city tower of violetstone on an outer island, with a treasure room and clampers on the walls
function buildEndCity(ctx, part) {
  const { x, z, y } = part;
  const P = B.violetstone, PP = B.violetstone_pillar, S = B.end_stone_bricks;
  const levels = part.levels;
  let base = y;
  for (let lv = 0; lv < levels; lv++) {
    const r = lv === levels - 1 ? 5 : 3 + (lv % 2);
    const h = lv === levels - 1 ? 6 : 7;
    for (let zz = z - r; zz <= z + r; zz++) for (let xx = x - r; xx <= x + r; xx++) {
      if (!ctx.inside(xx, zz)) continue;
      const edge = Math.abs(xx - x) === r || Math.abs(zz - z) === r;
      const corner = Math.abs(xx - x) === r && Math.abs(zz - z) === r;
      for (let k = 0; k <= h; k++) {
        let id = k === 0 || k === h ? P : edge ? (corner ? PP : P) : 0;
        if (edge && !corner && k >= 2 && k <= 4 && ((xx - x) % 2 === 0 && (zz - z) % 2 === 0)) id = 0;
        ctx.set(xx, base + k, zz, id);
      }
      if (lv === 0) for (let yy = base - 1; yy > base - 8; yy--) { if (ctx.get(xx, yy, zz) === B.end_stone) break; ctx.set(xx, yy, zz, S); }
    }
    // stairs up through the middle
    if (lv < levels - 1) for (let k = 1; k <= h; k++) { ctx.set(x + (k % 2), base + k, z, 0); ctx.set(x, base + k, z + 1, P); }
    ctx.set(x - r + 1, base + h - 1, z - r + 1, B.end_rod);
    ctx.set(x + r - 1, base + h - 1, z + r - 1, B.end_rod);
    base += h;
  }
  // doorway at the bottom, treasure at the top
  for (let k = 1; k <= 3; k++) ctx.set(x, y + k, z - 3, 0);
  const top = base - 6;
  ctx.chest(x - 3, top + 1, z + 3, 'end_city', 2);
  ctx.chest(x + 3, top + 1, z + 3, 'end_city', 2);
  ctx.set(x, top + 1, z, B.end_rod);
}

// ---------------------------------------------------------------- strongholds (overworld, underground)
function buildStronghold(ctx, part) {
  const { x, z, y } = part;
  const brick = (xx, yy, zz) => { const r = ctx.h(xx, yy, zz, 51); return r < 0.18 ? B.mossy_stone_bricks : r < 0.3 ? B.cracked_stone_bricks : B.stone_bricks; };
  const box = (x0, y0, z0, x1, y1, z1) => {
    for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) {
      if (!ctx.inside(xx, zz)) continue;
      const shell = xx === x0 || xx === x1 || yy === y0 || yy === y1 || zz === z0 || zz === z1;
      ctx.set(xx, yy, zz, shell ? brick(xx, yy, zz) : 0);
    }
  };
  // the portal room
  box(x - 6, y - 1, z - 8, x + 6, y + 7, z + 8);
  for (let zz = z + 1; zz <= z + 7; zz++) for (let xx = x - 3; xx <= x + 3; xx++) ctx.set(xx, y, zz, B.stone_bricks);   // raised floor
  for (let zz = z + 3; zz <= z + 5; zz++) for (let xx = x - 1; xx <= x + 1; xx++) { ctx.set(xx, y, zz, B.lava); ctx.set(xx, y - 1, zz, B.stone_bricks); }
  const cz = z + 4;
  const ring = [];
  for (let d = -1; d <= 1; d++) ring.push([x + d, cz - 2], [x + d, cz + 2], [x - 2, cz + d], [x + 2, cz + d]);
  for (const [fx, fz] of ring) ctx.set(fx, y + 1, fz, ctx.h(fx, y, fz, 52) < 0.1 ? B.end_portal_frame_filled : B.end_portal_frame);
  for (let k = 0; k <= 2; k++) ctx.set(x, y + k - 0, z - 1 + k, B.stone_bricks);   // steps up
  ctx.set(x, y + 1, z - 3, B.spawner, 1);
  ctx.set(x - 5, y + 3, z, B.torch); ctx.set(x + 5, y + 3, z, B.torch);
  // corridors out to side rooms
  box(x - 3, y - 1, z - 26, x + 3, y + 4, z - 8);
  for (let k = 0; k <= 2; k++) for (let w = -1; w <= 1; w++) ctx.set(x + w, y + k, z - 8, 0);
  box(x - 26, y - 1, z - 3, x - 6, y + 4, z + 3);
  for (let k = 0; k <= 2; k++) for (let w = -1; w <= 1; w++) ctx.set(x - 6, y + k, z + w, 0);
  box(x + 6, y - 1, z - 3, x + 26, y + 4, z + 3);
  for (let k = 0; k <= 2; k++) for (let w = -1; w <= 1; w++) ctx.set(x + 6, y + k, z + w, 0);
  for (const [tx, tz] of [[x, z - 17], [x - 16, z], [x + 16, z]]) ctx.set(tx, y + 2, tz + (tz === z ? 2 : 0) + (tx === x ? 0 : 0), B.torch);
  // a library at one end and store rooms at the others
  box(x - 36, y - 1, z - 6, x - 26, y + 7, z + 6);
  for (let k = 0; k <= 2; k++) for (let w = -1; w <= 1; w++) ctx.set(x - 26, y + k, z + w, 0);
  for (let zz = z - 5; zz <= z + 5; zz++) for (let k = 0; k <= 4; k++) { ctx.set(x - 35, y + k, zz, B.bookshelf); if (Math.abs(zz - z) > 1) ctx.set(x - 31, y + k, zz, B.bookshelf); }
  ctx.chest(x - 33, y, z - 4, 'stronghold_library', 1);
  ctx.set(x - 28, y + 2, z + 4, B.torch);
  box(x + 26, y - 1, z - 4, x + 34, y + 5, z + 4);
  for (let k = 0; k <= 2; k++) for (let w = -1; w <= 1; w++) ctx.set(x + 26, y + k, z + w, 0);
  ctx.chest(x + 32, y, z + 2, 'stronghold_corridor', 3);
  ctx.chest(x + 32, y, z - 2, 'stronghold_corridor', 3);
  box(x - 5, y - 1, z - 36, x + 5, y + 5, z - 26);
  for (let k = 0; k <= 2; k++) for (let w = -1; w <= 1; w++) ctx.set(x + w, y + k, z - 26, 0);
  ctx.chest(x - 3, y, z - 33, 'stronghold_corridor', 0);
  ctx.set(x + 3, y + 2, z - 33, B.torch);
}

function strongholdPlans(world) {
  if (world._strongholdPlans) return world._strongholdPlans;
  world._strongholdPlans = strongholds(world).map((s) => ({
    type: 'stronghold', key: `stronghold:${s.i}`, x: s.x, z: s.z, mobs: [],
    minX: s.x - 37, maxX: s.x + 35, minZ: s.z - 37, maxZ: s.z + 9,
    ground: () => s.y,
    parts: [{ minX: s.x - 37, maxX: s.x + 35, minZ: s.z - 37, maxZ: s.z + 9, x: s.x, z: s.z, y: s.y, build: buildStronghold }],
  }));
  return world._strongholdPlans;
}

// ---------------------------------------------------------------- structure types
const isLand = (c) => c.h > SEA + 1;
const TYPES = [
  { name: 'village', spacing: 20, sep: 5, chance: 1, radius: 100, ok: (c) => [BIOME.PLAINS, BIOME.DESERT, BIOME.TAIGA, BIOME.SNOWY].includes(c.biome) && isLand(c) && c.h < 92,
    plan: (world, plan, x, z, c, rng) => planVillage(world, plan, x, z, c, rng) },
  { name: 'pyramid', spacing: 14, sep: 4, chance: 0.8, radius: 14, ok: (c) => c.biome === BIOME.DESERT && isLand(c),
    plan: (world, plan, x, z) => { plan.add({ minX: x - 11, maxX: x + 11, minZ: z - 11, maxZ: z + 11, x, z, y: plan.ground(x, z) + 1, build: buildPyramid }); return true; } },
  { name: 'jungle_temple', spacing: 14, sep: 4, chance: 0.8, radius: 10, ok: (c) => c.biome === BIOME.JUNGLE && isLand(c),
    plan: (world, plan, x, z, c, rng) => { planSingle(plan, x, z, plan.ground(x, z) + 1, 5, 6, Math.floor(rng() * 4), buildJungleTemple); return true; } },
  { name: 'witch_hut', spacing: 10, sep: 3, chance: 0.8, radius: 7, ok: (c) => c.biome === BIOME.SWAMP,
    plan: (world, plan, x, z, c, rng) => {
      const y = Math.max(plan.ground(x, z), SEA) + 3;
      planSingle(plan, x, z, y, 3, 4, Math.floor(rng() * 4), buildWitchHut);
      plan.mobs.push({ type: 'witch', x: x + 0.5, y: y + 1, z: z + 0.5, key: `${plan.key}:witch` });
      return true;
    } },
  { name: 'igloo', spacing: 10, sep: 3, chance: 0.6, radius: 7, ok: (c) => c.biome === BIOME.SNOWY && isLand(c),
    plan: (world, plan, x, z, c, rng) => { planSingle(plan, x, z, plan.ground(x, z) + 1, 4, 6, Math.floor(rng() * 4), buildIgloo); return true; } },
  { name: 'outpost', spacing: 18, sep: 5, chance: 0.5, radius: 8, ok: (c) => [BIOME.PLAINS, BIOME.DESERT, BIOME.TAIGA, BIOME.SNOWY, BIOME.DARK_FOREST].includes(c.biome) && isLand(c) && c.h < 95,
    plan: (world, plan, x, z, c, rng) => {
      if (nearStructure(world, 'village', x, z, 180)) return false;
      const y = plan.ground(x, z) + 1;
      planSingle(plan, x, z, y, 4, 4, Math.floor(rng() * 4), buildOutpost);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; plan.mobs.push({ type: 'pillager', x: x + Math.cos(a) * 7 + 0.5, y: plan.ground(Math.round(x + Math.cos(a) * 7), Math.round(z + Math.sin(a) * 7)) + 1, z: z + Math.sin(a) * 7 + 0.5, key: `${plan.key}:p${k}` }); }
      plan.mobs.push({ type: 'pillager', x: x + 1.5, y: y + 15, z: z + 1.5, key: `${plan.key}:top` });
      return true;
    } },
  { name: 'mansion', spacing: 32, sep: 8, chance: 1, radius: 20, ok: (c) => c.biome === BIOME.DARK_FOREST && isLand(c),
    plan: (world, plan, x, z, c, rng) => {
      const rot = Math.floor(rng() * 4);
      const y = plan.ground(x, z) + 1;
      planSingle(plan, x, z, y, 14, 10, rot, buildMansion);
      for (const [lx, ly] of [[-8, 0], [6, 0], [-6, 7], [8, 7]]) {
        const [dx, dz] = rotVec(lx, 0, rot);
        plan.mobs.push({ type: 'vindicator', x: x + dx + 0.5, y: y + ly, z: z + dz + 0.5, key: `${plan.key}:v${lx}` });
      }
      return true;
    } },
  { name: 'ruined_portal', spacing: 12, sep: 3, chance: 0.5, radius: 7, ok: (c) => isLand(c) && c.biome !== BIOME.MOUNTAINS,
    plan: (world, plan, x, z, c, rng) => {
      if (nearStructure(world, 'village', x, z, 70)) return false;
      planSingle(plan, x, z, plan.ground(x, z) + 1, 5, 5, Math.floor(rng() * 4), buildRuinedPortal);
      return true;
    } },
  { name: 'well', spacing: 6, sep: 1, chance: 0.2, radius: 4, ok: (c) => c.biome === BIOME.DESERT && isLand(c),
    plan: (world, plan, x, z) => {
      if (nearStructure(world, 'village', x, z, 70) || nearStructure(world, 'pyramid', x, z, 25)) return false;
      planSingle(plan, x, z, plan.ground(x, z) + 1, 2, 2, 0, buildWell);
      return true;
    } },
  { name: 'shipwreck', spacing: 12, sep: 3, chance: 0.6, radius: 11, ok: (c) => c.h <= SEA + 1 && c.h >= SEA - 18,
    plan: (world, plan, x, z, c, rng) => {
      if (nearStructure(world, 'village', x, z, 70)) return false;
      planSingle(plan, x, z, plan.ground(x, z) + 1, 8, 3, Math.floor(rng() * 4), buildShipwreck);
      return true;
    } },
];
TYPES.push(
  { name: 'fortress', dim: 'nether', spacing: 13, sep: 4, chance: 0.75, radius: 46, ok: () => true,
    plan: (world, plan, x, z, c, rng) => {
      const y = 62 + Math.floor(rng() * 10);
      plan.add({ minX: x - 45, maxX: x + 45, minZ: z - 45, maxZ: z + 45, x, z, y, build: buildFortress });
      plan.fortress = { minX: x - 45, maxX: x + 45, minZ: z - 45, maxZ: z + 45, y };
      return true;
    } },
  { name: 'bastion', dim: 'nether', spacing: 15, sep: 4, chance: 0.6, radius: 11, ok: (c) => c.biome !== NB.BASALT,
    plan: (world, plan, x, z, c, rng) => {
      if (nearStructure(world, 'fortress', x, z, 90)) return false;
      const y = 40 + Math.floor(rng() * 16);
      plan.add({ minX: x - 10, maxX: x + 10, minZ: z - 10, maxZ: z + 10, x, z, y, build: buildBastion });
      for (let k = 0; k < 4; k++) plan.mobs.push({ type: 'snoutling', x: x + 0.5 + (k % 2 ? 3 : -3), y: y + 1 + (k > 1 ? 8 : 0), z: z + 0.5 + (k < 2 ? 3 : -3), key: `${plan.key}:s${k}` });
      plan.mobs.push({ type: 'snoutling_brute', x: x + 0.5, y: y + 9, z: z + 3.5, key: `${plan.key}:brute` });
      return true;
    } },
  { name: 'end_city', dim: 'end', spacing: 20, sep: 5, chance: 0.9, radius: 6, ok: (c) => c.h > 50,
    plan: (world, plan, x, z, c, rng) => {
      if (Math.hypot(x, z) < 1000) return false;
      const levels = 3 + Math.floor(rng() * 3);
      const y = c.h + 1;
      plan.add({ minX: x - 6, maxX: x + 6, minZ: z - 6, maxZ: z + 6, x, z, y, levels, build: buildEndCity });
      for (let k = 0; k < levels; k++) {
        const side = k % 2 ? 1 : -1;
        plan.mobs.push({ type: 'clamper', x: x + 0.5 + side * 4.5, y: y + 2 + k * 7, z: z + 0.5, key: `${plan.key}:c${k}` });
      }
      return true;
    } },
);
const dimOf = (T) => T.dim || 'overworld';
const TYPE_BY_NAME = Object.fromEntries(TYPES.map((t, i) => [t.name, { ...t, index: i }]));
TYPES.forEach((t, i) => { t.index = i; });

function regionPlan(world, T, rx, rz) {
  const key = `${T.name}:${rx}:${rz}`;
  const cache = world.structureCache;
  if (cache.has(key)) return cache.get(key);
  cache.set(key, null);
  const salt = 0x9e37 + T.index * 7919;
  if (hash3(world.seed ^ salt, rx, 0, rz) > T.chance) return null;
  const span = T.spacing - T.sep;
  const ocx = rx * T.spacing + Math.floor(hash3(world.seed ^ salt, rx, 1, rz) * span);
  const ocz = rz * T.spacing + Math.floor(hash3(world.seed ^ salt, rx, 2, rz) * span);
  const x = ocx * CS + 8, z = ocz * CS + 8;
  const col = world.column(x, z);
  if (!T.ok(col)) return null;
  const hcache = new Map();
  const plan = {
    type: T.name, key, x, z, parts: [], mobs: [],
    minX: x, maxX: x, minZ: z, maxZ: z,
    ground(px, pz) {
      const k = px + ',' + pz;
      let h = hcache.get(k);
      if (h === undefined) { h = world.column(px, pz).h; hcache.set(k, h); }
      return h;
    },
    add(p) {
      this.parts.push(p);
      this.minX = Math.min(this.minX, p.minX); this.maxX = Math.max(this.maxX, p.maxX);
      this.minZ = Math.min(this.minZ, p.minZ); this.maxZ = Math.max(this.maxZ, p.maxZ);
    },
  };
  const rng = mulberry32((hash3(world.seed ^ salt, rx, 3, rz) * 4294967296) >>> 0);
  if (!T.plan(world, plan, x, z, col, rng)) return null;
  // built the way the oldest chunk it covers was made, so nothing people have seen changes under them
  plan.gen = world.genOver(plan.minX, plan.maxX, plan.minZ, plan.maxZ);
  cache.set(key, plan);
  return plan;
}

// Is a structure of the given type centred within `dist` blocks of (x, z)?
function nearStructure(world, name, x, z, dist) {
  const T = TYPE_BY_NAME[name];
  const S = T.spacing * CS;
  const r0x = Math.floor((x - dist) / S), r1x = Math.floor((x + dist) / S);
  const r0z = Math.floor((z - dist) / S), r1z = Math.floor((z + dist) / S);
  for (let rx = r0x; rx <= r1x; rx++) for (let rz = r0z; rz <= r1z; rz++) {
    const p = regionPlan(world, TYPES[T.index], rx, rz);
    if (p && Math.hypot(p.x - x, p.z - z) < dist) return true;
  }
  return false;
}

// Called for every newly generated chunk
export function stampStructures(world, chunk) {
  const cx = chunk.cx, cz = chunk.cz;
  const cminX = cx * CS, cmaxX = cminX + CS - 1, cminZ = cz * CS, cmaxZ = cminZ + CS - 1;
  const cbox = { minX: cminX, maxX: cmaxX, minZ: cminZ, maxZ: cmaxZ };
  if (world.dim === 'overworld') {
    for (const plan of strongholdPlans(world)) {
      if (!overlaps(plan, cbox)) continue;
      const ctx = makeCtx(world, chunk, plan);
      for (const p of plan.parts) if (overlaps(p, cbox)) p.build(ctx, p);
    }
  }
  for (const T of TYPES) {
    if (dimOf(T) !== world.dim) continue;
    const rc = Math.ceil(T.radius / CS) + 1;
    const r0x = Math.floor((cx - rc) / T.spacing), r1x = Math.floor((cx + rc) / T.spacing);
    const r0z = Math.floor((cz - rc) / T.spacing), r1z = Math.floor((cz + rc) / T.spacing);
    for (let rx = r0x; rx <= r1x; rx++) for (let rz = r0z; rz <= r1z; rz++) {
      const plan = regionPlan(world, T, rx, rz);
      if (!plan || !overlaps(plan, cbox)) continue;
      const ctx = makeCtx(world, chunk, plan);
      for (const p of plan.parts) if (overlaps(plan.gen >= 3 && p.stamp ? p.stamp : p, cbox)) p.build(ctx, p);
      for (const m of plan.mobs) {
        if (m.x >= cminX && m.x < cmaxX + 1 && m.z >= cminZ && m.z < cmaxZ + 1) {
          const k = ckey(cx, cz);
          if (!world.pendingSpawns.has(k)) world.pendingSpawns.set(k, []);
          world.pendingSpawns.get(k).push(m);
        }
      }
    }
  }
}

// Footprints of structure parts near a chunk, so terrain generation can keep trees off them
export function structurePartsNear(world, cx, cz, margin) {
  const box = { minX: cx * CS - margin, maxX: cx * CS + CS - 1 + margin, minZ: cz * CS - margin, maxZ: cz * CS + CS - 1 + margin };
  const out = [];
  for (const T of TYPES) {
    if (dimOf(T) !== world.dim) continue;
    const rc = Math.ceil((T.radius + margin) / CS) + 1;
    const r0x = Math.floor((cx - rc) / T.spacing), r1x = Math.floor((cx + rc) / T.spacing);
    const r0z = Math.floor((cz - rc) / T.spacing), r1z = Math.floor((cz + rc) / T.spacing);
    for (let rx = r0x; rx <= r1x; rx++) for (let rz = r0z; rz <= r1z; rz++) {
      const plan = regionPlan(world, T, rx, rz);
      if (!plan || !overlaps(plan, box)) continue;
      for (const p of plan.parts) if (overlaps(p, box)) out.push(p);
    }
  }
  return out;
}

// Nearest structures of a type (used by the locate helper in the debug screen)
export function structuresNear(world, x, z, radius) {
  const out = [];
  for (const T of TYPES) {
    if (dimOf(T) !== world.dim) continue;
    const S = T.spacing * CS;
    for (let rx = Math.floor((x - radius) / S); rx <= Math.floor((x + radius) / S); rx++) {
      for (let rz = Math.floor((z - radius) / S); rz <= Math.floor((z + radius) / S); rz++) {
        const p = regionPlan(world, T, rx, rz);
        if (p) out.push({ type: T.name, x: p.x, z: p.z, dist: Math.hypot(p.x - x, p.z - z), plan: p });
      }
    }
  }
  return out.sort((a, b) => a.dist - b.dist);
}
