// Generated structures: villages, desert pyramids, jungle temples, witch huts, igloos,
// pillager outposts, woodland mansions, ruined portals, desert wells and shipwrecks.
//
// Each structure type sits on a grid of regions. A region deterministically picks one spot,
// checks the biome there, and builds a plan (a list of parts with bounding boxes). When a chunk
// generates, every part that overlaps it is stamped with writes clipped to that chunk, so a
// structure comes out identical no matter which chunk loads first.
import { B, ID, BLOCKS } from './blocks.js';
import { hash3, mulberry32 } from './noise.js';
import { CS, CH, SEA, BIOME } from './constants.js';

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
const LOOT = {
  village_house: { rolls: [3, 6], items: [['bread', 1, 4, 10], ['wheat', 2, 6, 8], ['apple', 1, 3, 8], ['emerald', 1, 3, 4], ['wheat_seeds', 2, 5, 6], ['oak_sapling', 1, 2, 3], ['iron_ingot', 1, 2, 2], ['book', 1, 1, 2]] },
  blacksmith: { rolls: [3, 8], items: [['iron_ingot', 1, 5, 10], ['bread', 1, 3, 8], ['apple', 1, 3, 8], ['gold_ingot', 1, 3, 5], ['iron_pickaxe', 1, 1, 5], ['iron_sword', 1, 1, 5], ['iron_helmet', 1, 1, 4], ['iron_chestplate', 1, 1, 3], ['iron_leggings', 1, 1, 3], ['iron_boots', 1, 1, 4], ['obsidian', 3, 7, 5], ['diamond', 1, 3, 3], ['oak_sapling', 3, 7, 4]] },
  pyramid: { rolls: [2, 5], items: [['bone', 4, 6, 25], ['rotten_flesh', 3, 7, 25], ['gunpowder', 1, 8, 10], ['gold_ingot', 2, 7, 15], ['iron_ingot', 1, 5, 15], ['emerald', 1, 3, 15], ['diamond', 1, 3, 5], ['sand', 1, 8, 10], ['book', 1, 1, 10], ['golden_helmet', 1, 1, 3], ['iron_chestplate', 1, 1, 3]] },
  jungle_temple: { rolls: [2, 6], items: [['diamond', 1, 3, 3], ['iron_ingot', 1, 5, 10], ['gold_ingot', 2, 7, 15], ['emerald', 1, 3, 4], ['bone', 4, 6, 20], ['rotten_flesh', 3, 7, 16], ['book', 1, 1, 5], ['golden_chestplate', 1, 1, 2]] },
  igloo: { rolls: [2, 5], items: [['apple', 1, 3, 15], ['coal', 1, 4, 15], ['gold_ingot', 1, 2, 10], ['wheat', 2, 3, 10], ['stone_axe', 1, 1, 2], ['rotten_flesh', 1, 1, 10], ['emerald', 1, 1, 1], ['bread', 1, 2, 8]] },
  outpost: { rolls: [2, 4], items: [['wheat', 3, 5, 7], ['book', 1, 1, 1], ['arrow', 2, 7, 4], ['string', 1, 6, 4], ['iron_ingot', 1, 3, 3], ['emerald', 1, 2, 2], ['dark_oak_log', 2, 3, 5], ['bread', 1, 3, 4]] },
  mansion: { rolls: [2, 5], items: [['iron_ingot', 1, 4, 10], ['gold_ingot', 1, 4, 5], ['emerald', 1, 4, 5], ['diamond_chestplate', 1, 1, 1], ['diamond_hoe', 1, 1, 1], ['bread', 1, 3, 10], ['book', 1, 2, 5], ['string', 1, 6, 10], ['bone', 1, 8, 10], ['diamond', 1, 2, 2], ['iron_leggings', 1, 1, 3]] },
  ruined_portal: { rolls: [4, 8], items: [['obsidian', 1, 2, 40], ['flint', 1, 4, 40], ['iron_ingot', 3, 9, 40], ['flint_and_steel', 1, 1, 40], ['gold_ingot', 2, 8, 15], ['golden_sword', 1, 1, 15], ['golden_axe', 1, 1, 15], ['golden_helmet', 1, 1, 15], ['golden_boots', 1, 1, 15], ['glowstone', 4, 12, 5], ['gold_block', 1, 2, 1]] },
  shipwreck_supply: { rolls: [3, 8], items: [['paper', 1, 12, 8], ['wheat', 8, 21, 7], ['bread', 1, 3, 5], ['coal', 2, 8, 6], ['rotten_flesh', 5, 24, 5], ['gunpowder', 1, 5, 3], ['tnt', 1, 2, 1], ['leather_helmet', 1, 1, 3], ['leather_chestplate', 1, 1, 3], ['leather_boots', 1, 1, 3], ['pumpkin', 1, 3, 2]] },
  shipwreck_treasure: { rolls: [3, 6], items: [['iron_ingot', 1, 5, 90], ['gold_ingot', 1, 5, 10], ['emerald', 1, 5, 40], ['diamond', 1, 1, 5]] },
};

// Items for a structure chest, spread over 27 slots
export function rollLoot(table, seed) {
  const T = LOOT[table];
  const slots = new Array(27).fill(null);
  if (!T) return slots;
  const r = mulberry32(seed >>> 0);
  const total = T.items.reduce((n, it) => n + it[3], 0);
  const rolls = T.rolls[0] + Math.floor(r() * (T.rolls[1] - T.rolls[0] + 1));
  for (let k = 0; k < rolls; k++) {
    let pick = r() * total;
    const it = T.items.find((x) => (pick -= x[3]) < 0) || T.items[0];
    const id = ID[it[0]];
    if (!id) continue;
    const count = it[1] + Math.floor(r() * (it[2] - it[1] + 1));
    let slot = Math.floor(r() * 27);
    for (let t = 0; t < 27 && slots[slot]; t++) slot = (slot + 7) % 27;
    if (!slots[slot]) slots[slot] = { id, count, dmg: 0 };
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
    const p = { ...box, x: bx, z: bz, y: g + 1, rot, style, kind, build: (ctx, pp) => K.build(ctx, pp) };
    occupied.push(box);
    plan.add(p);
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
          villager(profs[Math.floor(rng() * profs.length)], bx + fx * (hd + 2), p.y, bz + fz * (hd + 2));
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
  for (const T of TYPES) {
    const rc = Math.ceil(T.radius / CS) + 1;
    const r0x = Math.floor((cx - rc) / T.spacing), r1x = Math.floor((cx + rc) / T.spacing);
    const r0z = Math.floor((cz - rc) / T.spacing), r1z = Math.floor((cz + rc) / T.spacing);
    for (let rx = r0x; rx <= r1x; rx++) for (let rz = r0z; rz <= r1z; rz++) {
      const plan = regionPlan(world, T, rx, rz);
      if (!plan || !overlaps(plan, cbox)) continue;
      const ctx = makeCtx(world, chunk, plan);
      for (const p of plan.parts) if (overlaps(p, cbox)) p.build(ctx, p);
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
    const S = T.spacing * CS;
    for (let rx = Math.floor((x - radius) / S); rx <= Math.floor((x + radius) / S); rx++) {
      for (let rz = Math.floor((z - radius) / S); rz <= Math.floor((z + radius) / S); rz++) {
        const p = regionPlan(world, T, rx, rz);
        if (p) out.push({ type: T.name, x: p.x, z: p.z, dist: Math.hypot(p.x - x, p.z - z) });
      }
    }
  }
  return out.sort((a, b) => a.dist - b.dist);
}
