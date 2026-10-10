// The Nether and the End: terrain, and the fixed places the game needs to find
// (strongholds, the End's obsidian pillars and exit portal).
import { B, BLOCKS } from './blocks.js';
import { fbm2, hash3, mulberry32 } from './noise.js';
import { CS, CH } from './constants.js';

export const DIMS = ['overworld', 'nether', 'end'];

// Nether biomes (numbered apart from the overworld ones)
// (1.10 added four more, numbered clear of the overworld's: they are made only in land first seen with
// generator 5 or later)
export const NB = { WASTES: 20, CRIMSON: 21, WARPED: 22, SOUL: 23, BASALT: 24, END: 30, OBSIDIAN: 40, FUNGAL: 41, ASH: 42, QUARTZ: 43 };
export const DIM_BIOME_NAMES = { 20: 'Nether Wastes', 21: 'Crimson Forest', 22: 'Warped Forest', 23: 'Soul Sand Valley', 24: 'Basalt Deltas', 30: 'The End',
  40: 'Obsidian Spires', 41: 'Fungal Caverns', 42: 'Ashen Forest', 43: 'Quartz Gardens' };

export const NETHER_LAVA = 31;   // the lava sea
export const END_SPAWN = { x: 100, y: 49, z: 0 };   // the obsidian platform players arrive on

// (how strong its claim on a place must be for one of the four new lands to have it: about a third of
// the Nether between them)
export function netherBiome(world, x, z) {
  // Land first seen with generator 5 or later has the four new lands among the old; land seen before
  // that is exactly as it was
  if (world.genAt(x >> 4, z >> 4) >= 5) {
    const c = world.nNB1.noise2(x * 0.0052 - 190, z * 0.0052 + 57) + world.nNB2.noise2(x * 0.02 + 40, z * 0.02) * 0.06;
    const d = world.nNB2.noise2(x * 0.0052 + 301, z * 0.0052 + 222) + world.nNB1.noise2(x * 0.02 - 77, z * 0.02 + 5) * 0.06;
    if (c > 0.62) return NB.OBSIDIAN;
    if (c < -0.62) return NB.ASH;
    if (d > 0.57) return NB.FUNGAL;
    if (d < -0.57) return NB.QUARTZ;
  }
  const a = world.nNB1.noise2(x * 0.0045, z * 0.0045) + world.nNB2.noise2(x * 0.02, z * 0.02) * 0.08;
  const b = world.nNB2.noise2(x * 0.0045 + 71, z * 0.0045 - 33);
  if (a > 0.33) return NB.CRIMSON;
  if (a < -0.33) return NB.WARPED;
  if (b > 0.33) return NB.SOUL;
  if (b < -0.36) return NB.BASALT;
  return NB.WASTES;
}

// ---------------------------------------------------------------- the Nether
export function generateNether(world, chunk) {
  const blocks = chunk.blocks, seed = world.seed;
  const x0 = chunk.cx * CS, z0 = chunk.cz * CS;
  // density on a coarse grid (every 4 blocks), trilinearly interpolated
  const GX = 5, GY = 33;
  const grid = new Float32Array(GX * GX * GY);
  for (let iy = 0; iy < GY; iy++) for (let iz = 0; iz < GX; iz++) for (let ix = 0; ix < GX; ix++) {
    const wx = x0 + ix * 4, wy = iy * 4, wz = z0 + iz * 4;
    let d = world.nN1.noise3(wx * 0.018, wy * 0.03, wz * 0.018) + world.nN2.noise3(wx * 0.05, wy * 0.07, wz * 0.05) * 0.45;
    // solid towards the floor and the roof, open caverns in between
    if (wy < 26) d += (26 - wy) * 0.05;
    if (wy > 96) d += (wy - 96) * 0.05;
    d -= 0.14;
    grid[(iy * GX + iz) * GX + ix] = d;
  }
  const dens = (lx, y, lz) => {
    const fx = lx / 4, fy = y / 4, fz = lz / 4;
    const ix = Math.min(3, fx | 0), iy = Math.min(GY - 2, fy | 0), iz = Math.min(3, fz | 0);
    const tx = fx - ix, ty = fy - iy, tz = fz - iz;
    const g = (a, b2, c2) => grid[((iy + b2) * GX + iz + c2) * GX + ix + a];
    const c00 = g(0, 0, 0) + (g(1, 0, 0) - g(0, 0, 0)) * tx, c01 = g(0, 0, 1) + (g(1, 0, 1) - g(0, 0, 1)) * tx;
    const c10 = g(0, 1, 0) + (g(1, 1, 0) - g(0, 1, 0)) * tx, c11 = g(0, 1, 1) + (g(1, 1, 1) - g(0, 1, 1)) * tx;
    const c0 = c00 + (c01 - c00) * tz, c1 = c10 + (c11 - c10) * tz;
    return c0 + (c1 - c0) * ty;
  };

  for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
    const x = x0 + lx, z = z0 + lz;
    const biome = netherBiome(world, x, z);
    chunk.biomes[lz * CS + lx] = biome;
    for (let y = 0; y < CH; y++) {
      let id;
      if (y === 0 || y === CH - 1) id = B.bedrock;
      else if (y < 4 && hash3(seed, x, y, z) < (4 - y) * 0.25) id = B.bedrock;
      else if (y > CH - 5 && hash3(seed, x, y, z) < (y - (CH - 5)) * 0.25) id = B.bedrock;
      else if (dens(lx, y, lz) > 0) {
        id = B.netherrack;
        if (biome === NB.BASALT) id = world.nNS.noise3(x * 0.08, y * 0.08, z * 0.08) > 0.1 ? B.basalt : B.blackstone;
        else if (biome === NB.OBSIDIAN) id = world.nNS.noise3(x * 0.07, y * 0.12, z * 0.07) > 0.38 ? B.basalt : B.blackstone;
        else if (biome === NB.ASH && world.nNS.noise3(x * 0.09, y * 0.09, z * 0.09) > 0.42) id = B.blackstone;
        else if (biome === NB.SOUL && y < 60) id = world.nNS.noise3(x * 0.1, y * 0.1, z * 0.1) > 0.2 ? B.soul_soil : B.netherrack;
      } else id = y <= NETHER_LAVA ? B.lava : 0;
      blocks[(y << 8) | (lz << 4) | lx] = id;
    }
  }

  const rng = mulberry32((hash3(seed ^ 0x4e7, chunk.cx, 0, chunk.cz) * 4294967296) >>> 0);
  const at = (lx, y, lz) => (y << 8) | (lz << 4) | lx;
  // Floors get their biome's ground cover and plants
  for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
    const biome = chunk.biomes[lz * CS + lx];
    const inner = lx > 2 && lx < 13 && lz > 2 && lz < 13;
    for (let y = NETHER_LAVA; y < CH - 6; y++) {
      const i = at(lx, y, lz), up = at(lx, y + 1, lz);
      const id = blocks[i];
      // (in the quartz gardens, crystals hang from the roofs as well)
      if (biome === NB.QUARTZ && id === B.netherrack && y > 40 && blocks[at(lx, y - 1, lz)] === 0 && inner && rng() > 0.965) crystal(blocks, lx, y - 1, lz, rng, -1);
      if (!id || id === B.lava || id === B.bedrock || blocks[up] !== 0) continue;
      if (id === B.obsidian || id === B.crying_obsidian || id === B.quartz_pillar || id === B.quartz_block || id === B.charred_log || id === B.ember_log || id === B.mushroom_stem || id === B.red_mushroom_block || id === B.brown_mushroom_block) continue;   // (not on top of what was just put there)
      const r = rng();
      if (biome === NB.CRIMSON || biome === NB.WARPED) {
        const crimson = biome === NB.CRIMSON;
        blocks[i] = crimson ? B.crimson_nylium : B.warped_nylium;
        if (r < 0.12) blocks[up] = crimson ? B.crimson_roots : B.warped_roots;
        else if (r < 0.15) blocks[up] = crimson ? B.crimson_fungus : B.warped_fungus;
        else if (r < 0.165 && lx > 2 && lx < 13 && lz > 2 && lz < 13) hugeFungus(blocks, lx, y + 1, lz, crimson, rng);
      } else if (biome === NB.SOUL) {
        blocks[i] = r < 0.55 ? B.soul_sand : B.soul_soil;
        if (r > 0.995 && lx > 1 && lx < 14 && lz > 1 && lz < 14) for (let k = 1; k <= 4; k++) blocks[at(lx, y + k, lz)] = B.bone_block;
      } else if (biome === NB.BASALT) {
        if (r < 0.04) blocks[i] = B.magma_block;
        else if (r < 0.06) blocks[i] = B.lava;
      } else if (biome === NB.OBSIDIAN) {
        // black glass standing in spires over a floor that still glows in places
        if (r < 0.035) blocks[i] = B.magma_block;
        else if (r < 0.05) blocks[i] = B.lava;
        else if (r > 0.972 && inner) spire(blocks, lx, y + 1, lz, rng);
        else if (r > 0.955) blocks[up] = rng() < 0.2 ? B.crying_obsidian : B.obsidian;
      } else if (biome === NB.FUNGAL) {
        blocks[i] = B.mycelium;
        if (r < 0.09) blocks[up] = B.red_mushroom;
        else if (r < 0.125 && inner) giantMushroom(blocks, lx, y + 1, lz, rng);
        else if (r > 0.992) blocks[up] = B.shroomlight;
      } else if (biome === NB.ASH) {
        // everything here has burned: grey ash underfoot, the black trunks of what grew, embers in the wood
        blocks[i] = B.ash;
        if (blocks[at(lx, y - 1, lz)] === B.netherrack) blocks[at(lx, y - 1, lz)] = B.ash;
        if (r < 0.045 && inner) charredTree(blocks, lx, y + 1, lz, rng);
        else if (r < 0.06) blocks[up] = B.bone_block;
        else if (r > 0.99) blocks[i] = B.magma_block;
      } else if (biome === NB.QUARTZ) {
        if (r < 0.14) blocks[i] = B.nether_quartz_ore;
        if (r > 0.955 && inner) crystal(blocks, lx, y + 1, lz, rng, 1);
      } else if (r < 0.01) blocks[i] = B.soul_sand;
    }
  }
  // Ores and veins inside the rock
  const vein = (id, count, ymin, ymax, size, into) => {
    const n = Math.floor(count) + (rng() < count % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      let x = rng() * 16 | 0, y = ymin + (rng() * (ymax - ymin) | 0), z = rng() * 16 | 0;
      for (let s = 0; s < size; s++) {
        if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CH - 1) {
          const i = at(x, y, z);
          if (into.includes(blocks[i])) blocks[i] = id;
        }
        const d = rng() * 6 | 0;
        if (d === 0) x++; else if (d === 1) x--; else if (d === 2) z++; else if (d === 3) z--; else if (d === 4) y++; else y--;
      }
    }
  };
  vein(B.nether_quartz_ore, 14, 10, 117, 7, [B.netherrack]);
  vein(B.nether_gold_ore, 9, 10, 117, 5, [B.netherrack]);
  vein(B.magma_block, 3, 26, 37, 12, [B.netherrack]);
  vein(B.gravel, 1.5, 28, 40, 16, [B.netherrack]);
  vein(B.soul_sand, 1, 28, 60, 14, [B.netherrack]);
  vein(B.gilded_blackstone, 2, 10, 117, 4, [B.blackstone]);
  const mid = chunk.biomes[8 * CS + 8];
  if (mid === NB.QUARTZ) vein(B.nether_quartz_ore, 22, 10, 117, 9, [B.netherrack]);
  if (mid === NB.ASH) vein(B.nether_gold_ore, 6, 10, 117, 5, [B.netherrack, B.blackstone]);
  // Glowstone hangs from the ceilings
  for (let k = 0; k < (mid === NB.QUARTZ || mid === NB.FUNGAL ? 4 : 2); k++) {
    const lx = 2 + (rng() * 12 | 0), lz = 2 + (rng() * 12 | 0);
    for (let y = CH - 8; y > 50; y--) {
      if (blocks[at(lx, y, lz)] === 0 && (blocks[at(lx, y + 1, lz)] === B.netherrack || (mid === NB.OBSIDIAN && blocks[at(lx, y + 1, lz)] === B.blackstone))) {
        let x = lx, yy = y, z = lz;
        for (let s = 0; s < 22; s++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && yy > 40 && blocks[at(x, yy, z)] === 0) blocks[at(x, yy, z)] = B.glowstone;
          const d = rng() * 5 | 0;
          if (d === 0) x++; else if (d === 1) x--; else if (d === 2) z++; else if (d === 3) z--; else yy--;
        }
        break;
      }
    }
  }
}

// ---- what stands in the new lands (each keeps inside its own chunk)
const cell = (x, y, z) => (y << 8) | (z << 4) | x;
const fits = (x, y, z) => x >= 0 && x < 16 && z >= 0 && z < 16 && y > 1 && y < CH - 2;
// A spire of obsidian: thick at the foot, a single block at the tip, with tears of light in it
function spire(blocks, lx, y, lz, rng) {
  const h = 4 + (rng() * 11 | 0);
  for (let k = 0; k < h; k++) {
    const r = k < h * 0.3 ? 1 : 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (r && Math.abs(dx) + Math.abs(dz) === 2 && (k > 1 || rng() < 0.5)) continue;
      const x = lx + dx, z = lz + dz, yy = y + k;
      if (fits(x, yy, z) && (blocks[cell(x, yy, z)] === 0 || blocks[cell(x, yy, z)] === B.lava)) blocks[cell(x, yy, z)] = rng() < 0.12 ? B.crying_obsidian : B.obsidian;
    }
  }
}
// A mushroom the size of a tree: red ones are domed, brown ones flat
function giantMushroom(blocks, lx, y, lz, rng) {
  const red = rng() < 0.55, h = 4 + (rng() * 4 | 0), cap = red ? B.red_mushroom_block : B.brown_mushroom_block;
  for (let k = 0; k < h + 3; k++) if (!fits(lx, y + k, lz) || blocks[cell(lx, y + k, lz)] !== 0) return;
  for (let k = 0; k < h; k++) blocks[cell(lx, y + k, lz)] = B.mushroom_stem;
  const put = (x, yy, z) => { if (fits(x, yy, z) && blocks[cell(x, yy, z)] === 0) blocks[cell(x, yy, z)] = cap; };
  if (red) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) put(lx + dx, y + h, lz + dz);
    for (let dy = -2; dy <= -1; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === 2 && Math.abs(dx) + Math.abs(dz) < 4) put(lx + dx, y + h + dy, lz + dz);
  } else {
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (Math.abs(dx) + Math.abs(dz) < 6) put(lx + dx, y + h - 1, lz + dz);
  }
}
// The black trunk of a burned tree, a stub of a branch or two, embers still alight in it
function charredTree(blocks, lx, y, lz, rng) {
  const h = 3 + (rng() * 5 | 0);
  const log = () => (rng() < 0.18 ? B.ember_log : B.charred_log);
  for (let k = 0; k < h; k++) if (fits(lx, y + k, lz) && blocks[cell(lx, y + k, lz)] === 0) blocks[cell(lx, y + k, lz)] = log(); else return;
  for (let b = 0; b < 2; b++) {
    if (rng() < 0.4) continue;
    const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][rng() * 4 | 0], by = y + 1 + (rng() * Math.max(1, h - 2) | 0);
    for (let k = 1; k <= 1 + (rng() * 2 | 0); k++) if (fits(lx + dx * k, by + k - 1, lz + dz * k) && blocks[cell(lx + dx * k, by + k - 1, lz + dz * k)] === 0) blocks[cell(lx + dx * k, by + k - 1, lz + dz * k)] = log();
  }
}
// A crystal of quartz growing up from the floor (dir 1) or down from the roof (dir -1)
function crystal(blocks, lx, y, lz, rng, dir) {
  const h = 2 + (rng() * 6 | 0);
  for (let k = 0; k < h; k++) {
    const yy = y + k * dir;
    if (!fits(lx, yy, lz) || blocks[cell(lx, yy, lz)] !== 0) return;
    blocks[cell(lx, yy, lz)] = k === h - 1 ? B.quartz_block : B.quartz_pillar;
    // (a thick one has shorter ones clustered at its foot)
    if (k < h / 3 && h > 4) for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) if (rng() < 0.45 && fits(lx + dx, yy, lz + dz) && blocks[cell(lx + dx, yy, lz + dz)] === 0) blocks[cell(lx + dx, yy, lz + dz)] = B.quartz_pillar;
  }
}

function hugeFungus(blocks, lx, y, lz, crimson, rng) {
  const h = 5 + (rng() * 5 | 0);
  if (y + h + 3 >= CH - 2) return;
  const stem = crimson ? B.crimson_stem : B.warped_stem, cap = crimson ? B.nether_wart_block : B.warped_wart_block;
  const at = (x, yy, z) => (yy << 8) | (z << 4) | x;
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy <= -1 ? 2 : dy === 0 ? 2 : 1;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = lx + dx, z = lz + dz, yy = y + h + dy;
      if (x < 0 || x > 15 || z < 0 || z > 15) continue;
      if (Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.6) continue;
      if (dy < 0 && Math.abs(dx) < r && Math.abs(dz) < r) continue;   // hollow underneath
      if (blocks[at(x, yy, z)] === 0) blocks[at(x, yy, z)] = rng() < 0.08 ? B.shroomlight : cap;
    }
  }
  for (let k = 0; k < h; k++) blocks[at(lx, y + k, lz)] = stem;
}

// ---------------------------------------------------------------- the End
export function endColumn(world, x, z) {
  const d = Math.hypot(x, z);
  if (d < 110) {
    const R = 82 + fbm2(world.nEnd, x * 0.02, z * 0.02, 2) * 14;
    if (d >= R) return null;
    const t = 1 - d / R;
    const top = 58 + Math.round(t * 5 + fbm2(world.nEnd, x * 0.05 + 9, z * 0.05, 2) * 2);
    return { top, bottom: top - Math.round(Math.pow(t, 0.6) * 42) - 2 };
  }
  if (d < 900) return null;   // the void between the main island and the outer islands
  const n = fbm2(world.nEnd, x * 0.011, z * 0.011, 3);
  if (n < 0.28) return null;
  const t = Math.min(1, (n - 0.28) / 0.4);
  const top = 55 + Math.round(t * 10 + fbm2(world.nEnd, x * 0.06, z * 0.06, 2) * 2);
  return { top, bottom: top - Math.round(t * 28) - 2 };
}

// Ten obsidian pillars ring the main island, each with a crystal on top
export function endPillars(world) {
  const out = [];
  const off = hash3(world.seed, 3, 5, 7) * Math.PI * 2;
  for (let i = 0; i < 10; i++) {
    const a = off + i * Math.PI / 5;
    out.push({ x: Math.round(Math.cos(a) * 42), z: Math.round(Math.sin(a) * 42), r: 2 + (i % 3), top: 76 + ((i * 7) % 10) * 3, i });
  }
  return out;
}

export function exitPortalY(world) {
  const c = endColumn(world, 0, 0);
  return (c ? c.top : 60) + 1;
}

export function generateEnd(world, chunk) {
  const blocks = chunk.blocks;
  const x0 = chunk.cx * CS, z0 = chunk.cz * CS;
  const at = (lx, y, lz) => (y << 8) | (lz << 4) | lx;
  for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
    chunk.biomes[lz * CS + lx] = NB.END;
    const c = endColumn(world, x0 + lx, z0 + lz);
    if (!c) continue;
    for (let y = Math.max(1, c.bottom); y <= c.top; y++) blocks[at(lx, y, lz)] = B.end_stone;
  }
  // pillars
  for (const p of endPillars(world)) {
    if (p.x + p.r < x0 || p.x - p.r > x0 + 15 || p.z + p.r < z0 || p.z - p.r > z0 + 15) continue;
    for (let dz = -p.r; dz <= p.r; dz++) for (let dx = -p.r; dx <= p.r; dx++) {
      if (dx * dx + dz * dz > p.r * p.r + 1) continue;
      const lx = p.x + dx - x0, lz = p.z + dz - z0;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
      for (let y = 40; y <= p.top; y++) blocks[at(lx, y, lz)] = B.obsidian;
    }
    const lx = p.x - x0, lz = p.z - z0;
    if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) blocks[at(lx, p.top + 1, lz)] = B.bedrock;
  }
  // the exit portal's bedrock basin (it lights up when the dragon dies)
  const py = exitPortalY(world);
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    const lx = dx - x0, lz = dz - z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
    const d = Math.hypot(dx, dz);
    if (d > 3.5) continue;
    blocks[at(lx, py - 1, lz)] = B.bedrock;
    for (let y = py; y <= py + 4; y++) blocks[at(lx, y, lz)] = 0;
    if (d > 2.5) blocks[at(lx, py, lz)] = B.bedrock;
  }
  if (x0 <= 0 && x0 + 15 >= 0 && z0 <= 0 && z0 + 15 >= 0) {
    for (let y = py; y <= py + 3; y++) blocks[at(-x0, y, -z0)] = B.bedrock;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const lx = dx - x0, lz = dz - z0;
      if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) blocks[at(lx, py + 2, lz)] = B.torch;
    }
  }
}

// Fills the exit portal once the dragon is beaten, with the egg on top
export function openExitPortal(world, set) {
  const py = exitPortalY(world);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    if ((dx || dz) && Math.hypot(dx, dz) <= 2.5) set(dx, py, dz, B.end_portal);
  }
  set(0, py + 4, 0, B.dragon_egg);
}

// ---------------------------------------------------------------- strongholds
// Three strongholds, 640-960 blocks from the centre of the world; eyes of the shade point to the nearest
export function strongholds(world) {
  if (world._strongholds) return world._strongholds;
  const a0 = hash3(world.seed, 11, 0, 13) * Math.PI * 2;
  const out = [];
  for (let i = 0; i < 3; i++) {
    const a = a0 + i * Math.PI * 2 / 3 + (hash3(world.seed, i, 1, 2) - 0.5) * 0.5;
    const d = 640 + hash3(world.seed, i, 3, 4) * 320;
    out.push({ x: Math.round(Math.cos(a) * d), z: Math.round(Math.sin(a) * d), y: 28, i });
  }
  world._strongholds = out;
  return out;
}

export function nearestStronghold(world, x, z) {
  let best = null, bd = Infinity;
  for (const s of strongholds(world)) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// ---------------------------------------------------------------- nether portals
// Is (x, y, z) inside an empty obsidian frame? Returns the portal's blocks or null.
export function findPortalFrame(world, x, y, z) {
  const air = (id) => id === 0 || id === B.fire;
  const obs = (id) => id === B.obsidian;
  for (const axis of [0, 1]) {
    const dx = axis === 0 ? 1 : 0, dz = axis === 1 ? 1 : 0;
    const g = (a, yy) => world.getBlock(x + dx * a, yy, z + dz * a);
    if (!air(g(0, y))) continue;
    let by = y;
    while (by > y - 22 && air(g(0, by - 1))) by--;
    if (!obs(g(0, by - 1))) continue;
    let left = 0, right = 0;
    while (left > -22 && air(g(left - 1, by))) left--;
    while (right < 22 && air(g(right + 1, by))) right++;
    if (!obs(g(left - 1, by)) || !obs(g(right + 1, by))) continue;
    const w = right - left + 1;
    if (w < 2 || w > 21) continue;
    let h = 0;
    while (h < 22 && air(g(left, by + h))) h++;
    if (h < 3 || h > 21) continue;
    let ok = true;
    for (let a = left; a <= right && ok; a++) {
      if (!obs(g(a, by - 1)) || !obs(g(a, by + h))) ok = false;
      for (let k = 0; k < h && ok; k++) if (!air(g(a, by + k))) ok = false;
    }
    for (let k = 0; k < h && ok; k++) if (!obs(g(left - 1, by + k)) || !obs(g(right + 1, by + k))) ok = false;
    if (!ok) continue;
    const cells = [];
    for (let a = left; a <= right; a++) for (let k = 0; k < h; k++) cells.push([x + dx * a, by + k, z + dz * a]);
    return { axis, cells };
  }
  return null;
}

// Every portal block connected to (x, y, z)
export function portalCells(world, x, y, z) {
  const out = [], seen = new Set([`${x},${y},${z}`]), q = [[x, y, z]];
  while (q.length && out.length < 500) {
    const [a, b, c] = q.pop();
    if (world.getBlock(a, b, c) !== B.nether_portal) continue;
    out.push([a, b, c]);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const k = `${a + dx},${b + dy},${c + dz}`;
      if (!seen.has(k)) { seen.add(k); q.push([a + dx, b + dy, c + dz]); }
    }
  }
  return out;
}

// A portal block near (x, y, z) in loaded chunks, to arrive through
export function findNearbyPortal(world, x, y, z, r) {
  let best = null, bd = Infinity;
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    const c = world.getChunk((x + dx) >> 4, (z + dz) >> 4);
    if (!c) continue;
    for (let yy = 2; yy < CH - 2; yy++) {
      if (world.getBlock(x + dx, yy, z + dz) !== B.nether_portal) continue;
      if (world.getBlock(x + dx, yy - 1, z + dz) === B.nether_portal) continue;   // the bottom block
      const d = dx * dx + dz * dz + (yy - y) * (yy - y) * 0.25;
      if (d < bd) { bd = d; best = { x: x + dx, y: yy, z: z + dz }; }
    }
  }
  return best;
}

// Builds a 4x5 obsidian portal at a safe spot near (x, z); returns where to stand
export function buildPortal(world, x, y, z, set) {
  const isAir = (xx, yy, zz) => { const id = world.getBlock(xx, yy, zz); return id === 0 || BLOCKS[id].replaceable && id !== B.lava; };
  const solid = (xx, yy, zz) => world.isSolid(xx, yy, zz) && world.getBlock(xx, yy, zz) !== B.lava;
  let spot = null;
  for (let r = 0; r <= 12 && !spot; r++) {
    for (let dx = -r; dx <= r && !spot; dx++) for (let dz = -r; dz <= r && !spot; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      for (let k = 0; k < 90 && !spot; k++) {
        const yy = y + (k % 2 ? -((k + 1) >> 1) : k >> 1);
        if (yy < 5 || yy > CH - 8) continue;
        const px = x + dx, pz = z + dz;
        let ok = true;
        for (let a = -1; a <= 2 && ok; a++) {
          if (!solid(px + a, yy - 1, pz)) ok = false;
          for (let h = 0; h < 4 && ok; h++) if (!isAir(px + a, yy + h, pz) || !isAir(px + a, yy + h, pz + 1)) ok = false;
        }
        if (ok) spot = { x: px, y: yy, z: pz };
      }
    }
  }
  if (!spot) {
    // nowhere to stand: make a platform in the open
    spot = { x, y: Math.max(40, Math.min(CH - 12, y)), z };
    for (let a = -2; a <= 3; a++) for (let b = -2; b <= 2; b++) {
      set(spot.x + a, spot.y - 1, spot.z + b, B.obsidian);
      for (let h = 0; h < 5; h++) set(spot.x + a, spot.y + h, spot.z + b, 0);
    }
  }
  const { x: sx, y: sy, z: sz } = spot;
  for (let a = -1; a <= 2; a++) for (let h = -1; h <= 3; h++) {
    const frame = a === -1 || a === 2 || h === -1 || h === 3;
    set(sx + a, sy + h, sz, frame ? B.obsidian : B.nether_portal, 0);
  }
  return { x: sx + 0.5, y: sy, z: sz + 0.5 };
}

// Twelve filled frames around a 3x3 hole open the way to the End
export function activateEndPortal(world, x, y, z) {
  const F = B.end_portal_frame_filled;
  for (let cx = x - 2; cx <= x + 2; cx++) for (let cz = z - 2; cz <= z + 2; cz++) {
    const ring = [];
    for (let d = -1; d <= 1; d++) ring.push([cx + d, cz - 2], [cx + d, cz + 2], [cx - 2, cz + d], [cx + 2, cz + d]);
    if (!ring.some(([a, b]) => a === x && b === z)) continue;
    if (!ring.every(([a, b]) => world.getBlock(a, y, b) === F)) continue;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) world.setBlock(cx + dx, y, cz + dz, B.end_portal);
    return true;
  }
  return false;
}
