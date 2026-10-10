// Chunk storage and terrain generation.
import { Simplex, mulberry32, hash3, fbm2, smoothstep } from './noise.js';
import { B, BLOCKS } from './blocks.js';
import { CS, CH, SEA, BIOME, BIOME_NAMES, FROZEN } from './constants.js';
import { stampStructures, structurePartsNear } from './structures.js';
import { generateNether, generateEnd, netherBiome, endColumn } from './dims.js';
import { carveTunnels, placeOres, deepslateAt, MORE_DIAMONDS } from './caves.js';

export { CS, CH, SEA, BIOME, BIOME_NAMES };

export const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
export const bidx = (x, y, z) => (y << 8) | (z << 4) | x;
const CAVERN_TOP = 44;   // big caverns stay below this
// The generator's version. It goes up whenever an update changes how new land is made (1: before Caves &
// Ores, 2: Caves & Ores, 3: villages with job blocks, 4: Lands & Legends, with its new lands and
// structures, 5: the Nether's new lands, bastions and fortresses); worlds remember which version made
// each chunk.
export const GEN = 5;

// ---- the lands of 1.8: what grows where. [chance of a tree (or spike, or reef) on a column, the kinds]
const TREES = {
  [BIOME.SAVANNA]: [0.007, () => 'acacia'],
  [BIOME.BIRCH_FOREST]: [0.05, () => 'birch'],
  [BIOME.FLOWER_FOREST]: [0.018, (r) => (r < 0.4 ? 'birch' : 'oak')],
  [BIOME.CHERRY_GROVE]: [0.026, () => 'cherry'],
  [BIOME.SNOWY_TAIGA]: [0.035, () => 'spruce'],
  [BIOME.ICE_SPIKES]: [0.011, () => 'ice_spike'],
  [BIOME.MUSHROOM]: [0.005, (r) => (r < 0.5 ? 'red_mushroom' : 'brown_mushroom')],
  [BIOME.MEADOW]: [0.0009, (r) => (r < 0.5 ? 'birch' : 'oak')],
  [BIOME.OLD_TAIGA]: [0.034, (r) => (r < 0.42 ? 'big_spruce' : r < 0.94 ? 'spruce' : 'boulder')],
  [BIOME.SUNFLOWER]: [0.003, () => 'oak'],
  [BIOME.BAMBOO]: [0.02, (r) => (r < 0.5 ? 'bush' : 'jungle')],
  [BIOME.SNOWY_PEAKS]: [0.004, () => 'spruce'],
  [BIOME.FROZEN_OCEAN]: [0.0016, () => 'iceberg', true],
  [BIOME.WARM_OCEAN]: [0.02, () => 'coral', true],
};
// [grass, flowers] on a grass block, and which flowers
const COVER = {
  [BIOME.SAVANNA]: [0.4, 0.004, ['dandelion']],
  [BIOME.BIRCH_FOREST]: [0.14, 0.03, ['dandelion', 'poppy', 'allium', 'oxeye_daisy']],
  [BIOME.FLOWER_FOREST]: [0.14, 0.2, ['dandelion', 'poppy', 'allium', 'oxeye_daisy', 'cornflower', 'tulip', 'tulip']],
  [BIOME.CHERRY_GROVE]: [0.16, 0.06, ['allium', 'tulip', 'oxeye_daisy']],
  [BIOME.MEADOW]: [0.34, 0.15, ['cornflower', 'oxeye_daisy', 'dandelion', 'allium', 'poppy']],
  [BIOME.OLD_TAIGA]: [0.24, 0.012, ['red_mushroom']],
  [BIOME.SUNFLOWER]: [0.24, 0.07, ['sunflower', 'sunflower', 'sunflower', 'dandelion']],
  [BIOME.BAMBOO]: [0.26, 0.01, ['dandelion']],
  [BIOME.MUSHROOM]: [0, 0.03, ['red_mushroom']],
  [BIOME.BEACH]: [0, 0, []],
};
// The stripes of the badlands, from the bottom up
const BANDS = ['terracotta', 'orange_terracotta', 'terracotta', 'terracotta', 'yellow_terracotta', 'terracotta', 'white_terracotta', 'orange_terracotta',
  'red_terracotta', 'terracotta', 'orange_terracotta', 'terracotta', 'terracotta', 'white_terracotta', 'red_terracotta', 'orange_terracotta'].map((k) => B[k]);

const FULL = [0, 1], BOTTOM_HALF = [0, 0.5], TOP_HALF = [0.5, 1], TRAP_BOTTOM = [0, 0.1875], TRAP_TOP = [0.8125, 1];

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CS * CS * CH);
    this.meta = null;
    this.light = null;      // packed (sky << 4) | block, filled by the mesher
    this.biomes = new Uint8Array(CS * CS);
    this.maxY = 0;
    this.emitters = 0;
    this.mesh = null;
    this.water = null;
    this.dirty = true;
    this.meshed = false;
    this.fresh = true;      // no mobs spawned yet
  }
}

export class World {
  constructor(seed, dim = 'overworld') {
    this.seed = seed >>> 0;
    this.dim = dim;
    const r = mulberry32(this.seed);
    this.nCont = new Simplex(r);
    this.nMount = new Simplex(r);
    this.nRidge = new Simplex(r);
    this.nDetail = new Simplex(r);
    this.nTemp = new Simplex(r);
    this.nHumid = new Simplex(r);
    this.nCave1 = new Simplex(r);
    this.nCave2 = new Simplex(r);
    this.nCave3 = new Simplex(r);
    this.nSurf = new Simplex(r);
    // the Nether and the End have their own noise, seeded from the same world seed
    const rd = mulberry32((this.seed ^ 0x6e7468) >>> 0);
    this.nN1 = new Simplex(rd); this.nN2 = new Simplex(rd); this.nNB1 = new Simplex(rd); this.nNB2 = new Simplex(rd); this.nNS = new Simplex(rd);
    this.nEnd = new Simplex(rd);
    // (1.8) which of a climate's lands a place is, and where the badlands rise and islands lie
    const rv = mulberry32((this.seed ^ 0x1a4d5) >>> 0);
    this.nVar = new Simplex(rv); this.nVar2 = new Simplex(rv); this.nRise = new Simplex(rv);
    this._near = new Map();
    this.chunks = new Map();
    this.edits = new Map();       // ckey -> Map(idx -> id | meta << 8)
    this.containers = new Map();  // "x,y,z" -> chest / furnace state
    this.onChange = null;         // (x, y, z, oldId, newId) => void
    this.structureCache = new Map();  // structure plans by region
    this.pendingSpawns = new Map();   // ckey -> mobs a structure wants spawned when the chunk loads
    this.lootChests = new Map();      // "x,y,z" -> loot table for structure chests not opened yet
    this.crops = new Map();           // "x,y,z" -> growth time for wheat that is still growing
    this.fires = new Map();           // "x,y,z" -> fire state
    this.deadMobs = new Set();        // keys of structure mobs that were killed (they don't come back)
    this.golemDue = new Map();        // except a village's iron golem: its key -> seconds until another comes
    this.stored = new Map();          // ckey -> animals, villagers and items kept while that chunk is unloaded
    this.spawned = new Set();         // ckeys of chunks that have had their animals placed
    this.spawners = new Map();        // "x,y,z" -> monster spawner state
    this.flags = {};                  // world events, e.g. the dragon beaten
    this.liquidLoaded = [];           // flowing liquid in chunks just loaded, for the liquid simulation
    this.signs = new Map();           // "x,y,z" -> the lines written on the sign there
    this.beacons = new Map();         // "x,y,z" -> { on } for every beacon in the loaded world
    // Chunks made the way they were before the Caves & Ores update (the parts of older worlds people had
    // already been to keep their caves and ores); every other chunk gets the new caves, deepslate and ores
    this.legacy = null;               // Set of ckeys, or null
    // From then on every update that changes how land is made works the same way: the chunks people had
    // already been to keep being made as they were (ckey -> the generator version they were first seen
    // with), like Minecraft keeps the chunks it has saved. Only land nobody has seen gets the new things.
    this.gens = new Map();
  }

  // Which version of the generator makes this chunk
  genAt(cx, cz) {
    const k = ckey(cx, cz);
    if (this.legacy && this.legacy.has(k)) return 1;
    return this.gens.get(k) || GEN;
  }

  // The oldest generator among the chunks an area covers: a village someone has seen a part of is
  // finished the way it was begun
  genOver(minX, maxX, minZ, maxZ) {
    if (!this.gens.size && !(this.legacy && this.legacy.size)) return GEN;
    let g = GEN;
    for (let cx = minX >> 4; cx <= maxX >> 4; cx++) for (let cz = minZ >> 4; cz <= maxZ >> 4; cz++) g = Math.min(g, this.genAt(cx, cz));
    return g;
  }

  getChunk(cx, cz) { return this.chunks.get(ckey(cx, cz)); }

  getBlock(x, y, z) {
    if (y < 0) return B.bedrock;
    if (y >= CH) return 0;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c) return 0;
    return c.blocks[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }

  // Unloaded chunks count as solid so nothing falls out of the world
  isSolid(x, y, z) {
    if (y < 0) return true;
    if (y >= CH) return false;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c) return true;
    const i = (y << 8) | ((z & 15) << 4) | (x & 15);
    const b = BLOCKS[c.blocks[i]];
    if (b.door || b.trapdoor) return !(c.meta && (c.meta[i] & 4));   // open: you walk through
    return b.solid;
  }

  // The solid part of the block at a cell, as [bottom, top] within the cell (0 to 1), or null if things
  // pass through it: slabs are half a block, a closed trapdoor a thin layer, an open one nothing
  solidSpan(x, y, z) {
    if (y < 0) return FULL;
    if (y >= CH) return null;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c) return FULL;
    const i = (y << 8) | ((z & 15) << 4) | (x & 15);
    const b = BLOCKS[c.blocks[i]];
    if (!b.solid) return null;
    const m = c.meta ? c.meta[i] : 0;
    if (b.door) return m & 4 ? null : FULL;
    if (b.slab) return m & 1 ? TOP_HALF : BOTTOM_HALF;
    if (b.trapdoor) return m & 4 ? null : m & 8 ? TRAP_TOP : TRAP_BOTTOM;
    if (b.height < 1) return b.span || (b.span = [0, b.height]);   // the enchanting table, the stonecutter
    return FULL;
  }

  // The part of a block you can point at, when it doesn't fill its cell: [x0, y0, z0, x1, y1, z1] within it
  pickBox(x, y, z, id) {
    const b = BLOCKS[id];
    if (b.height < 1) return [0, 0, 0, 1, b.height, 1];
    if (!b.slab && !b.trapdoor) return null;
    const m = this.getMeta(x, y, z);
    if (b.slab) return m & 1 ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
    if (m & 4) return [[0, 0, 0, 1, 1, 0.1875], [0.8125, 0, 0, 1, 1, 1], [0, 0, 0.8125, 1, 1, 1], [0, 0, 0, 0.1875, 1, 1]][m & 3];
    return m & 8 ? [0, 0.8125, 0, 1, 1, 1] : [0, 0, 0, 1, 0.1875, 1];
  }

  getMeta(x, y, z) {
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c || !c.meta || y < 0 || y >= CH) return 0;
    return c.meta[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }

  // Returns [sky, block] light levels (0-15)
  getLight(x, y, z) {
    if (y >= CH) return [15, 0];
    if (y < 0) return [0, 0];
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c || !c.light) return [15, 0];
    const v = c.light[(y << 8) | ((z & 15) << 4) | (x & 15)];
    return [v >> 4, v & 15];
  }

  setBlock(x, y, z, id, meta = 0) {
    if (y < 0 || y >= CH - 1) return false;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(ckey(cx, cz));
    if (!c) return false;
    const i = (y << 8) | ((z & 15) << 4) | (x & 15);
    const old = c.blocks[i];
    if (old === id && (!c.meta || c.meta[i] === meta)) return false;
    c.blocks[i] = id;
    if (meta || c.meta) {
      if (!c.meta) c.meta = new Uint8Array(CS * CS * CH);
      c.meta[i] = meta;
    }
    if (BLOCKS[old].light) c.emitters--;
    if (BLOCKS[id].light) c.emitters++;
    if (id === B.beacon) this.beacons.set(`${x},${y},${z}`, {});
    if (y > c.maxY) c.maxY = y;
    const k = ckey(cx, cz);
    let e = this.edits.get(k);
    if (!e) { e = new Map(); this.edits.set(k, e); }
    e.set(i, id | (meta << 8));
    if (this.onChange) this.onChange(x, y, z, old, id);
    return true;
  }

  // A change from another player: applied now if the chunk is loaded, otherwise kept for when it generates
  setBlockAnywhere(x, y, z, id, meta = 0) {
    if (y < 0 || y >= CH - 1) return false;
    if (this.chunks.get(ckey(x >> 4, z >> 4))) return this.setBlock(x, y, z, id, meta);
    const k = ckey(x >> 4, z >> 4);
    let e = this.edits.get(k);
    if (!e) { e = new Map(); this.edits.set(k, e); }
    e.set((y << 8) | ((z & 15) << 4) | (x & 15), id | (meta << 8));
    return false;
  }

  // ------------------------------------------------------------ terrain shape
  // The height of the ground and the kind of land at a place. Land that was first seen before 1.8 keeps
  // the shape it had; land nobody has seen gets the new lands, easing into the old over a couple of chunks.
  column(x, z) {
    if (this.dim === 'nether') return { h: 64, biome: netherBiome(this, x, z) };
    if (this.dim === 'end') { const e = endColumn(this, x, z); return { h: e ? e.top : 0, biome: 30 }; }
    if (!this.mixed) return this.columnNew(x, z);
    const cx = x >> 4, cz = z >> 4;
    if (this.genAt(cx, cz) < 4) return this.columnOld(x, z);
    const k = ckey(cx, cz);
    let near = this._near.get(k);
    if (near === undefined) {
      near = [];
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (this.genAt(cx + dx, cz + dz) < 4) near.push((cx + dx) * 16, (cz + dz) * 16);
      if (!near.length) near = null;
      this._near.set(k, near);
    }
    if (!near) return this.columnNew(x, z);
    let d = 64;
    for (let i = 0; i < near.length; i += 2) {
      const ox = near[i], oz = near[i + 1];
      d = Math.min(d, Math.max(x < ox ? ox - x : x > ox + 15 ? x - ox - 15 : 0, z < oz ? oz - z : z > oz + 15 ? z - oz - 15 : 0));
    }
    // (the first four blocks are exactly the old land, so trees and slopes meet across the border)
    const t = smoothstep(4, 30, d);
    if (t <= 0) return this.columnOld(x, z);
    const n = this.columnNew(x, z);
    if (t >= 1) return n;
    const o = this.columnOld(x, z);
    return { h: Math.round(o.h + (n.h - o.h) * t), biome: t < 0.5 ? o.biome : n.biome };
  }

  // Does this world hold land from before 1.8 (generators 1 to 3), whose shape and structures follow the
  // old rules? (Land marked as generator 4 is shaped the same as today's: only the Nether changed in 5.)
  get mixed() {
    if (this._mixedN !== this.gens.size) {
      this._mixedN = this.gens.size;
      this._mixed = false;
      for (const v of this.gens.values()) if (v < 4) { this._mixed = true; break; }
    }
    return this._mixed || !!(this.legacy && this.legacy.size);
  }

  // The land of 1.8: the same continents, mountains and climates as before, with each climate split into
  // several kinds of land, oceans told apart, mushroom islands far out to sea and badlands that rise in steps
  columnNew(x, z) {
    const c = fbm2(this.nCont, x * 0.0028, z * 0.0028, 4);
    const d = fbm2(this.nDetail, x * 0.025, z * 0.025, 3);
    const mRaw = fbm2(this.nMount, x * 0.0032 + 100, z * 0.0032 - 50, 3);
    const mountain = smoothstep(0.12, 0.5, mRaw) * smoothstep(-0.25, 0.05, c);
    const ridge = 1 - Math.abs(this.nRidge.noise2(x * 0.011, z * 0.011));
    let h = c < -0.25 ? SEA - 2 + (c + 0.25) * 60 : SEA + 1 + (c + 0.25) * 24;
    h += d * 4 + mountain * (ridge * ridge * 44 + 6);
    const temp = this.nTemp.noise2(x * 0.0013, z * 0.0013) + d * 0.04;
    const humid = this.nHumid.noise2(x * 0.0016 + 30, z * 0.0016);
    const v = this.nVar.noise2(x * 0.0012 + 71, z * 0.0012 - 13) + d * 0.03;
    const v2 = this.nVar2.noise2(x * 0.001 - 40, z * 0.001 + 90) + d * 0.03;
    let biome = -1;
    // mushroom islands, far from any shore
    if (c < -0.36) {
      const isle = smoothstep(0.52, 0.72, this.nRise.noise2(x * 0.0034 + 500, z * 0.0034 - 500)) * smoothstep(-0.36, -0.44, c);
      if (isle > 0) {
        h += (SEA + 2 + d * 3 + isle * 5 - h) * isle;
        if (isle > 0.5) biome = BIOME.MUSHROOM;
      }
    }
    const land = Math.round(h) >= SEA - 1 || c >= -0.22;
    if (biome < 0 && !land) {
      biome = temp < -0.5 ? BIOME.FROZEN_OCEAN : h < SEA - 14 ? BIOME.DEEP_OCEAN : temp > 0.26 ? BIOME.WARM_OCEAN : BIOME.OCEAN;
    } else if (biome < 0) {
      const hills = mountain > 0.03 && mountain < 0.34 && h >= 70;   // the feet of the mountains
      if (h >= 88 && mountain > 0.3) biome = h >= 103 ? BIOME.SNOWY_PEAKS : BIOME.MOUNTAINS;
      else if (temp > 0.31 && humid < 0.08) {
        const rise = smoothstep(0.1, 0.24, v) * smoothstep(SEA - 1, SEA + 5, h);   // (no tablelands standing in the sea)
        if (rise > 0) {
          // the badlands: flats of red sand, and tablelands that go up in two steps
          const t = this.nRise.noise2(x * 0.011 + 300, z * 0.011);
          h += (smoothstep(0.02, 0.2, t) * 11 + smoothstep(0.42, 0.56, t) * 9) * rise;
        }
        biome = v > 0.17 ? BIOME.BADLANDS : BIOME.DESERT;
      } else if (temp > 0.2 && humid > 0.3) biome = v > 0.26 ? BIOME.BAMBOO : BIOME.JUNGLE;
      else if (temp < -0.5) biome = v > 0.38 ? BIOME.ICE_SPIKES : v < -0.12 ? BIOME.SNOWY_TAIGA : BIOME.SNOWY;
      else if (temp < -0.27) biome = v > 0.2 ? BIOME.OLD_TAIGA : BIOME.TAIGA;
      else if (humid > 0.2 && h <= SEA + 5) biome = BIOME.SWAMP;
      else if (humid > 0.36) biome = BIOME.DARK_FOREST;
      else if (temp > 0.2 && humid < 0.14) biome = BIOME.SAVANNA;
      else if ((hills && v2 < 0.05) || v2 > 0.52) biome = BIOME.CHERRY_GROVE;
      else if (humid > -0.04) biome = v > 0.3 ? BIOME.BIRCH_FOREST : v < -0.36 ? BIOME.FLOWER_FOREST : BIOME.FOREST;
      else biome = hills || v < -0.42 ? BIOME.MEADOW : v2 < -0.42 ? BIOME.SUNFLOWER : BIOME.PLAINS;
    }
    h = Math.max(4, Math.min(CH - 14, Math.round(h)));
    // the strip where the land meets the sea
    if (h <= SEA + 1 && h >= SEA - 1 && biome < BIOME.OCEAN && !FROZEN.has(biome) && biome !== BIOME.MOUNTAINS && biome !== BIOME.SWAMP && biome !== BIOME.MUSHROOM && biome !== BIOME.BADLANDS) biome = BIOME.BEACH;
    return { h, biome };
  }

  // The land as it was made up to 1.7
  columnOld(x, z) {
    const c = fbm2(this.nCont, x * 0.0028, z * 0.0028, 4);
    const d = fbm2(this.nDetail, x * 0.025, z * 0.025, 3);
    const mRaw = fbm2(this.nMount, x * 0.0032 + 100, z * 0.0032 - 50, 3);
    const mountain = smoothstep(0.12, 0.5, mRaw) * smoothstep(-0.25, 0.05, c);
    const ridge = 1 - Math.abs(this.nRidge.noise2(x * 0.011, z * 0.011));
    let h = c < -0.25 ? SEA - 2 + (c + 0.25) * 60 : SEA + 1 + (c + 0.25) * 24;
    h += d * 4 + mountain * (ridge * ridge * 44 + 6);
    h = Math.max(4, Math.min(CH - 14, Math.round(h)));
    const temp = this.nTemp.noise2(x * 0.0013, z * 0.0013) + d * 0.04;
    const humid = this.nHumid.noise2(x * 0.0016 + 30, z * 0.0016);
    let biome;
    if (h >= 88 && mountain > 0.3) biome = BIOME.MOUNTAINS;
    else if (temp > 0.28 && humid < 0.18) biome = BIOME.DESERT;
    else if (temp > 0.2 && humid > 0.3) biome = BIOME.JUNGLE;
    else if (temp < -0.38) biome = BIOME.SNOWY;
    else if (temp < -0.14) biome = BIOME.TAIGA;
    else if (humid > 0.28 && h <= SEA + 4) biome = BIOME.SWAMP;
    else if (humid > 0.34) biome = BIOME.DARK_FOREST;
    else if (humid > 0.1) biome = BIOME.FOREST;
    else biome = BIOME.PLAINS;
    return { h, biome };
  }

  findSpawn() {
    if (this.dim !== 'overworld') return { x: 0.5, z: 0.5, h: 70 };
    for (let r = 0; r < 4000; r += 8) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos(a * Math.PI / 4) * r), z = Math.round(Math.sin(a * Math.PI / 4) * r);
        const c = this.column(x, z);
        if (c.h > SEA + 1 && c.h < 90 && ![BIOME.DESERT, BIOME.BADLANDS, BIOME.ICE_SPIKES, BIOME.MUSHROOM, BIOME.BEACH].includes(c.biome)) return { x: x + 0.5, z: z + 0.5, h: c.h };
      }
    }
    return { x: 0.5, z: 0.5, h: 80 };
  }

  // ------------------------------------------------------------ generation
  generate(cx, cz) {
    if (this.dim !== 'overworld') return this.generateOther(cx, cz);
    const chunk = new Chunk(cx, cz);
    const blocks = chunk.blocks;
    const seed = this.seed;
    const x0 = cx * CS, z0 = cz * CS;
    const R = 3, W = CS + 2 * R;
    const H = new Int16Array(W * W), BI = new Uint8Array(W * W);
    // land first seen before 1.8 is made exactly as it was then
    const g4 = this.genAt(cx, cz) >= 4;
    let maxH = SEA;
    for (let dz = 0; dz < W; dz++) {
      for (let dx = 0; dx < W; dx++) {
        const c = g4 ? this.column(x0 + dx - R, z0 + dz - R) : this.columnOld(x0 + dx - R, z0 + dz - R);
        H[dz * W + dx] = c.h;
        BI[dz * W + dx] = c.biome;
        if (c.h > maxH) maxH = c.h;
      }
    }

    // Cave density on a coarse grid, trilinearly interpolated. Older chunks: noodle tunnels and caverns
    // as before; newer ones: only the big caverns deep down (their tunnels are carved further on)
    const legacy = !!(this.legacy && this.legacy.has(ckey(cx, cz)));
    const GX = 5, GY = legacy ? Math.min(33, (maxH >> 2) + 2) : CAVERN_TOP / 4 + 2;
    const grid = new Float32Array(GX * GX * GY);
    for (let iy = 0; iy < GY; iy++) {
      for (let iz = 0; iz < GX; iz++) {
        for (let ix = 0; ix < GX; ix++) {
          const wx = x0 + ix * 4, wy = iy * 4, wz = z0 + iz * 4;
          let f;
          if (legacy) {
            const a = this.nCave1.noise3(wx * 0.015, wy * 0.022, wz * 0.015);
            const b = this.nCave2.noise3(wx * 0.015, wy * 0.022, wz * 0.015);
            f = a * a + b * b - 0.006;
            if (wy < 56) {
              const c3 = this.nCave3.noise3(wx * 0.011, wy * 0.02, wz * 0.011);
              f = Math.min(f, (0.6 - c3) * 0.1);
            }
          } else {
            // caverns fade out towards y 44 and above the bedrock
            const c3 = this.nCave3.noise3(wx * 0.011, wy * 0.02, wz * 0.011);
            f = (0.56 - c3) * 0.1 + smoothstep(CAVERN_TOP - 16, CAVERN_TOP, wy) * 0.06 + Math.max(0, 8 - wy) * 0.01;
          }
          grid[(iy * GX + iz) * GX + ix] = f;
        }
      }
    }
    const cave = (lx, y, lz) => {
      const fx = lx / 4, fy = y / 4, fz = lz / 4;
      const ix = Math.min(3, fx | 0), iy = Math.min(GY - 2, fy | 0), iz = Math.min(3, fz | 0);
      const tx = fx - ix, ty = fy - iy, tz = fz - iz;
      const g = (a, b2, c2) => grid[((iy + b2) * GX + iz + c2) * GX + ix + a];
      const c00 = g(0, 0, 0) + (g(1, 0, 0) - g(0, 0, 0)) * tx;
      const c01 = g(0, 0, 1) + (g(1, 0, 1) - g(0, 0, 1)) * tx;
      const c10 = g(0, 1, 0) + (g(1, 1, 0) - g(0, 1, 0)) * tx;
      const c11 = g(0, 1, 1) + (g(1, 1, 1) - g(0, 1, 1)) * tx;
      const c0 = c00 + (c01 - c00) * tz, c1 = c10 + (c11 - c10) * tz;
      return c0 + (c1 - c0) * ty;
    };

    for (let lz = 0; lz < CS; lz++) {
      for (let lx = 0; lx < CS; lx++) {
        const x = x0 + lx, z = z0 + lz;
        const hi = (lz + R) * W + lx + R;
        const h = H[hi], biome = BI[hi];
        chunk.biomes[lz * CS + lx] = biome;
        const slope = Math.max(Math.abs(h - H[hi - 1]), Math.abs(h - H[hi + 1]), Math.abs(h - H[hi - W]), Math.abs(h - H[hi + W]));
        const sn = this.nSurf.noise2(x * 0.05, z * 0.05);
        let top = B.grass, fill = B.dirt, depth = 3 + (hash3(seed, x, 1, z) * 2 | 0), under = 0;
        let bands = -1, icy = biome === BIOME.SNOWY;
        if (g4 && biome > BIOME.DARK_FOREST) {
          // ---- the lands of 1.8
          icy = FROZEN.has(biome) && (biome !== BIOME.FROZEN_OCEAN || this.nSurf.noise2(x * 0.021 + 9, z * 0.021) > -0.12);
          if (biome === BIOME.BADLANDS) {
            bands = (this.nSurf.noise2(x * 0.008, z * 0.008) * 3 + 16) | 0;
            if (h <= SEA + 4 + (sn * 2 | 0) && slope < 2) { top = fill = B.red_sand; depth = 2; }
            else depth = 0;
          } else if (h < SEA - 1) {
            top = fill = biome === BIOME.WARM_OCEAN ? B.sand : biome === BIOME.MUSHROOM ? (sn > 0 ? B.dirt : B.clay)
              : biome === BIOME.FROZEN_OCEAN || biome === BIOME.DEEP_OCEAN ? (sn < -0.5 ? B.clay : B.gravel)
              : sn > 0.35 ? B.gravel : sn < -0.45 ? B.clay : B.sand;
          } else if (biome === BIOME.BEACH) { top = fill = B.sand; under = B.sandstone; }
          else if (biome === BIOME.SNOWY_TAIGA) top = B.snowy_grass;
          else if (biome === BIOME.ICE_SPIKES) top = B.snow;
          else if (biome === BIOME.MUSHROOM) top = B.mycelium;
          else if (biome === BIOME.OLD_TAIGA) top = this.nSurf.noise2(x * 0.09 + 40, z * 0.09) > -0.15 ? B.podzol : B.grass;
          else if (biome === BIOME.SNOWY_PEAKS || h > 92) {
            if (slope >= 3) { top = fill = B.stone; }
            if (h >= 100 + (sn * 4 | 0)) top = slope >= 4 ? B.stone : sn > 0.45 ? B.packed_ice : B.snow;
            else if (h >= 96 && slope < 3) top = B.snowy_grass;
          }
        } else if (h < SEA - 1) {
          top = fill = g4 && biome === BIOME.SWAMP ? (sn > 0.25 ? B.clay : B.dirt) : sn > 0.35 ? B.gravel : sn < -0.45 ? B.clay : B.sand;
        } else if (g4 && biome === BIOME.SWAMP && h <= SEA + 1) {
          top = B.grass;   // (swamps made from 1.8 on are grass down to the water, with lily pads on it)
        } else if (h <= SEA + 1 && biome !== BIOME.SNOWY && biome !== BIOME.MOUNTAINS) {
          top = fill = B.sand;
        } else if (biome === BIOME.DESERT) {
          top = fill = B.sand; depth = 4; under = B.sandstone;
        } else if (biome === BIOME.SNOWY) {
          top = B.snowy_grass;
        } else if (biome === BIOME.MOUNTAINS || h > 92) {
          if (slope >= 3) { top = fill = B.stone; }
          if (h >= 100 + (sn * 4 | 0)) top = slope >= 4 ? B.stone : B.snow;
          else if (h >= 96 && slope < 3) top = B.snowy_grass;
        }
        const colTop = Math.max(h, SEA);
        for (let y = 0; y <= colTop; y++) {
          let id;
          if (y === 0) id = B.bedrock;
          else if (y < 4 && hash3(seed, x, y, z) < (4 - y) * 0.25) id = B.bedrock;
          else if (bands >= 0 && y <= h && y >= h - 20 && (depth === 0 || y < h - depth)) id = y < h - 16 - (bands & 3) ? B.stone : BANDS[(y + bands) & 15];
          else if (y < h - depth) id = (under && y >= h - depth - 3) ? under : B.stone;
          else if (y < h) id = fill;
          else if (y === h) id = top;
          else id = (y === SEA && icy) ? B.ice : B.water;

          if (y > 0 && y <= h && id !== B.bedrock) {
            const nearWater = h <= SEA + 1;
            // deep caves hold lava, the way to obsidian
            if (legacy) {
              if (!(nearWater && y >= h - 5) && !(y === h && h <= SEA + 2) && cave(lx, y, lz) < 0) id = y <= 10 ? B.lava : 0;
            } else {
              if (id === B.stone && deepslateAt(seed, x, y, z)) id = B.deepslate;
              if (y < CAVERN_TOP && !(nearWater && y >= h - 5) && cave(lx, y, lz) < 0) id = y < 9 ? B.lava : 0;
            }
          }
          blocks[(y << 8) | (lz << 4) | lx] = id;
        }
      }
    }

    if (legacy) this.generateOres(chunk);
    else { carveTunnels(this, chunk); placeOres(this, chunk); }

    // Trees: origins may lie up to R blocks outside so canopies cross chunk borders cleanly.
    // No trees grow on structure footprints (village houses, roads, temples...).
    const keepClear = structurePartsNear(this, cx, cz, R + 3, g4);
    for (let dz = 0; dz < W; dz++) {
      for (let dx = 0; dx < W; dx++) {
        const x = x0 + dx - R, z = z0 + dz - R;
        const h = H[dz * W + dx], biome = BI[dz * W + dx];
        if (biome > BIOME.DARK_FOREST) {
          // the lands of 1.8 (they are only ever found in land made from then on)
          const T = TREES[biome];
          if (!T || hash3(seed ^ 0x7ee5, x, 7, z) >= T[0]) continue;
          if (T[2] ? (h > SEA - 4 || h < SEA - 22) : (h <= SEA + 1 || h > 108)) continue;
          if (keepClear.length && keepClear.some((p) => x >= p.minX - 3 && x <= p.maxX + 3 && z >= p.minZ - 3 && z <= p.maxZ + 3)) continue;
          this.placeTree(chunk, T[1](hash3(seed ^ 0x51, x, 3, z)), x, h + 1, z, hash3(seed, x, 11, z));
          continue;
        }
        if (h <= SEA + 1 || h > 108) continue;
        if (keepClear.length && keepClear.some((p) => x >= p.minX - 3 && x <= p.maxX + 3 && z >= p.minZ - 3 && z <= p.maxZ + 3)) continue;
        const chance = [0.004, 0.05, 0, 0.03, 0.012, 0.008, 0.02, 0.07, 0.06][biome];
        if (hash3(seed ^ 0x7ee5, x, 7, z) >= chance) continue;
        const r = hash3(seed ^ 0x51, x, 3, z);
        let type = 'oak';
        if (biome === BIOME.FOREST && r < 0.25) type = 'birch';
        else if (biome === BIOME.JUNGLE) type = r < 0.35 ? 'bush' : 'jungle';
        else if (biome === BIOME.DARK_FOREST) type = r < 0.8 ? 'dark_oak' : 'oak';
        else if (biome === BIOME.SWAMP) type = 'swamp_oak';
        else if (biome >= BIOME.TAIGA && biome <= BIOME.MOUNTAINS) type = 'spruce';
        this.placeTree(chunk, type, x, h + 1, z, hash3(seed, x, 11, z));
      }
    }

    // Ground cover inside this chunk
    for (let lz = 0; lz < CS; lz++) {
      for (let lx = 0; lx < CS; lx++) {
        const x = x0 + lx, z = z0 + lz;
        const hi = (lz + R) * W + lx + R;
        const h = H[hi], biome = BI[hi];
        if (h >= CH - 4) continue;
        const topId = blocks[(h << 8) | (lz << 4) | lx];
        const above = (h + 1) << 8 | (lz << 4) | lx;
        const r = hash3(seed ^ 0x9a55, x, 5, z);
        if (g4 && h < SEA) {
          // lily pads lie on the still water of a swamp
          const pad = ((SEA + 1) << 8) | (lz << 4) | lx;
          if (biome === BIOME.SWAMP && h >= SEA - 3 && r < 0.07 && blocks[pad - 256] === B.water && blocks[pad] === 0) blocks[pad] = B.lily_pad;
          continue;
        }
        if (blocks[above] !== 0) continue;
        const byWater = h === SEA || h === SEA + 1 ? (H[hi - 1] < SEA || H[hi + 1] < SEA || H[hi - W] < SEA || H[hi + W] < SEA) : false;
        if (byWater && (topId === B.sand || topId === B.grass || topId === B.dirt) && r > 0.85) {
          const n = 1 + (hash3(seed, x, 17, z) * 3 | 0);
          for (let i = 0; i < n && h + 1 + i < CH; i++) blocks[((h + 1 + i) << 8) | (lz << 4) | lx] = B.sugar_cane;
          continue;
        }
        if (g4 && biome > BIOME.DARK_FOREST) {
          const C = COVER[biome];
          if (biome === BIOME.BADLANDS) {
            if (topId === B.red_sand) {
              if (r < 0.004) { const n = 1 + (hash3(seed, x, 13, z) * 3 | 0); for (let i = 0; i < n; i++) blocks[((h + 1 + i) << 8) | (lz << 4) | lx] = B.cactus; }
              else if (r < 0.02) blocks[above] = B.dead_bush;
            }
          } else if (biome === BIOME.BAMBOO && topId === B.grass && r > 0.78) {
            const n = 3 + (hash3(seed, x, 17, z) * 7 | 0);
            for (let i = 0; i < n && h + 1 + i < CH - 1; i++) { const j = ((h + 1 + i) << 8) | (lz << 4) | lx; if (blocks[j] !== 0) break; blocks[j] = B.bamboo; }
          } else if (C && (topId === B.grass || topId === B.podzol || topId === B.mycelium)) {
            if (r < C[1]) blocks[above] = B[C[2][(hash3(seed, x, 9, z) * C[2].length) | 0]];
            else if (r < C[1] + C[0]) blocks[above] = biome === BIOME.OLD_TAIGA || (biome === BIOME.BAMBOO && hash3(seed, x, 19, z) < 0.4) ? B.fern : B.tall_grass;
            else if (r > 0.9993 && topId === B.grass) blocks[above] = B.pumpkin;
          }
          continue;
        }
        if (topId === B.grass) {
          const grassP = [0.22, 0.12, 0, 0.08, 0, 0.05, 0.1, 0.3, 0.08][biome];
          const flowerP = [0.025, 0.02, 0, 0.004, 0, 0.002, 0.01, 0.01, 0.004][biome];
          if (r < flowerP) blocks[above] = hash3(seed, x, 9, z) < 0.5 ? B.dandelion : B.poppy;
          else if (r < flowerP + grassP) blocks[above] = B.tall_grass;
          else if (r > 0.9993) blocks[above] = B.pumpkin;
        } else if (topId === B.sand && biome === BIOME.DESERT) {
          if (r < 0.006) {
            const n = 1 + (hash3(seed, x, 13, z) * 3 | 0);
            for (let i = 0; i < n && h + 1 + i < CH; i++) blocks[((h + 1 + i) << 8) | (lz << 4) | lx] = B.cactus;
          } else if (r < 0.014) blocks[above] = B.dead_bush;
        }
      }
    }

    stampStructures(this, chunk);
    return this.finishChunk(chunk);
  }

  // The Nether and the End
  generateOther(cx, cz) {
    const chunk = new Chunk(cx, cz);
    if (this.dim === 'nether') generateNether(this, chunk);
    else generateEnd(this, chunk);
    stampStructures(this, chunk);
    return this.finishChunk(chunk);
  }

  finishChunk(chunk) {
    const cx = chunk.cx, cz = chunk.cz, blocks = chunk.blocks;
    const x0 = cx * CS, z0 = cz * CS;
    // Player edits from the save file
    const edits = this.edits.get(ckey(cx, cz));
    if (edits) {
      for (const [i, v] of edits) {
        const id = v & 255;
        blocks[i] = id;
        if (v >> 8 || chunk.meta) {
          if (!chunk.meta) chunk.meta = new Uint8Array(CS * CS * CH);
          chunk.meta[i] = v >> 8;
        }
        // flowing water or lava gets another look (it may have been cut off from its source)
        if (v >> 8 && (id === B.water || id === B.lava)) this.liquidLoaded.push([x0 + (i & 15), i >> 8, z0 + ((i >> 4) & 15)]);
      }
    }

    let maxY = 0, emitters = 0;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b) {
        maxY = i >> 8;
        if (BLOCKS[b].light) emitters++;
        if (b === B.fire) this.fires.set(`${x0 + (i & 15)},${i >> 8},${z0 + ((i >> 4) & 15)}`, { t: 0, age: 0 });
        if (b === B.spawner) this.spawners.set(`${x0 + (i & 15)},${i >> 8},${z0 + ((i >> 4) & 15)}`, {});
        if (b === B.beacon) this.beacons.set(`${x0 + (i & 15)},${i >> 8},${z0 + ((i >> 4) & 15)}`, {});
        if (b >= B.wheat_0 && b <= B.wheat_2) {
          const key = `${x0 + (i & 15)},${i >> 8},${z0 + ((i >> 4) & 15)}`;
          if (!this.crops.has(key)) this.crops.set(key, 0);
        }
      }
    }
    chunk.maxY = maxY;
    chunk.emitters = emitters;
    this.chunks.set(ckey(cx, cz), chunk);
    return chunk;
  }

  generateOres(chunk) {
    const blocks = chunk.blocks;
    const rng = mulberry32((hash3(this.seed ^ 0x0e5, chunk.cx, 0, chunk.cz) * 4294967296) >>> 0);
    const ORES = [
      [B.coal_ore, 20, 5, 120, 10], [B.iron_ore, 14, 5, 64, 7], [B.gold_ore, 2.5, 5, 32, 7],
      [B.redstone_ore, 5, 5, 16, 6], [B.diamond_ore, 1.2, 5, 16, 5], [B.lapis_ore, 1.3, 5, 32, 5],
      [B.gravel, 6, 5, 90, 20], [B.dirt, 6, 5, 90, 20],
    ];
    if (chunk.biomes[136] === BIOME.MOUNTAINS) ORES.push([B.emerald_ore, 4, 4, 32, 1]);
    const scatter = (rng, ores) => {
      for (const [id, count, ymin, ymax, size] of ores) {
        const n = Math.floor(count) + (rng() < count % 1 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          let x = rng() * 16 | 0, y = ymin + (rng() * (ymax - ymin) | 0), z = rng() * 16 | 0;
          for (let s = 0; s < size; s++) {
            if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CH) {
              const i = (y << 8) | (z << 4) | x;
              if (blocks[i] === B.stone) blocks[i] = id;
            }
            const d = rng() * 6 | 0;
            if (d === 0) x++; else if (d === 1) x--; else if (d === 2) z++; else if (d === 3) z--; else if (d === 4) y++; else y--;
          }
        }
      }
    };
    scatter(rng, ORES);
    // half as many diamond veins again (1.6.4), from their own random numbers: the ores already there stay put
    scatter(mulberry32((hash3(this.seed ^ 0xd1a5, chunk.cx, 0, chunk.cz) * 4294967296) >>> 0), [[B.diamond_ore, 1.2 * MORE_DIAMONDS, 5, 16, 5]]);
  }

  // Writes the parts of a tree that fall inside `chunk` (or into the live world when chunk is null)
  placeTree(chunk, type, x, y, z, r) {
    const x0 = chunk ? chunk.cx * CS : 0, z0 = chunk ? chunk.cz * CS : 0;
    const put = (wx, wy, wz, id, force) => {
      if (wy < 1 || wy >= CH - 1) return;
      if (chunk) {
        const lx = wx - x0, lz = wz - z0;
        if (lx < 0 || lx >= CS || lz < 0 || lz >= CS) return;
        const i = (wy << 8) | (lz << 4) | lx;
        const cur = chunk.blocks[i];
        if (force ? (cur === 0 || BLOCKS[cur].replaceable || BLOCKS[cur].cutout || BLOCKS[cur].sapling) : (cur === 0 || BLOCKS[cur].replaceable)) chunk.blocks[i] = id;
      } else {
        const cur = this.getBlock(wx, wy, wz);
        if (force ? (cur === 0 || BLOCKS[cur].replaceable || BLOCKS[cur].cutout || BLOCKS[cur].sapling) : (cur === 0 || BLOCKS[cur].replaceable)) this.setBlock(wx, wy, wz, id);
      }
    };
    const rr = (i) => hash3(this.seed, x + i * 17, y, z - i * 31);
    // Grass under the trunk turns to dirt
    if (chunk) {
      const lx = x - x0, lz = z - z0;
      if (lx >= 0 && lx < CS && lz >= 0 && lz < CS) {
        const i = ((y - 1) << 8) | (lz << 4) | lx;
        if (chunk.blocks[i] === B.grass || chunk.blocks[i] === B.snowy_grass) chunk.blocks[i] = B.dirt;
        else if (chunk.blocks[i] === 0 && type !== 'iceberg') return; // cave under the trunk
      }
    }
    const blob = (cx, cy, cz, rad, leaf, squash = 1) => {
      const R = Math.ceil(rad);
      for (let dy = -1; dy <= 1; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const d = Math.sqrt(dx * dx + dz * dz + (dy * dy) / squash);
        if (d <= rad - (dy > 0 ? 1 : 0) && rr(dx * 7 + dz * 3 + dy * 11 + cy) > 0.08) put(cx + dx, cy + dy, cz + dz, leaf, false);
      }
    };
    if (type === 'jungle') {
      const th = 9 + (r * 7 | 0);
      blob(x, y + th, z, 3.2, B.jungle_leaves);
      blob(x, y + th - 2, z, 3.6, B.jungle_leaves);
      if (th > 11) blob(x + (rr(1) < 0.5 ? 2 : -2), y + th - 5, z + (rr(2) < 0.5 ? 2 : -2), 2.2, B.jungle_leaves);
      for (let i = 0; i < th; i++) put(x, y + i, z, B.jungle_log, true);
      return;
    }
    if (type === 'bush') {
      put(x, y, z, B.jungle_log, true);
      blob(x, y + 1, z, 2.2, B.jungle_leaves);
      blob(x, y, z, 2.5, B.jungle_leaves);
      return;
    }
    if (type === 'dark_oak') {
      const th = 6 + (r * 3 | 0);
      blob(x, y + th, z, 3.4, B.dark_oak_leaves);
      blob(x, y + th + 1, z, 2.4, B.dark_oak_leaves);
      for (let i = 0; i < th; i++) {
        put(x, y + i, z, B.dark_oak_log, true);
        if (i < th - 1) { put(x + 1, y + i, z, B.dark_oak_log, true); put(x, y + i, z + 1, B.dark_oak_log, true); put(x + 1, y + i, z + 1, B.dark_oak_log, true); }
      }
      return;
    }
    if (type === 'swamp_oak') {
      const th = 5 + (r * 3 | 0);
      blob(x, y + th - 1, z, 3.3, B.oak_leaves, 0.6);
      blob(x, y + th, z, 2.2, B.oak_leaves);
      for (let i = 0; i < th; i++) put(x, y + i, z, B.oak_log, true);
      return;
    }
    if (type === 'spruce') {
      const th = 6 + (r * 4 | 0);
      const radii = [0, 1, 1, 2, 1, 2, 3, 2, 3, 2];
      const leafLayers = Math.min(radii.length, th - 1);
      for (let i = 0; i < leafLayers; i++) {
        const ly = y + th - i, rad = radii[i];
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (rad >= 2 && Math.abs(dx) === rad && Math.abs(dz) === rad) continue;
          put(x + dx, ly, z + dz, B.spruce_leaves, false);
        }
      }
      for (let i = 0; i < th; i++) put(x, y + i, z, B.spruce_log, true);
      return;
    }
    // ---- the trees and landmarks of the lands of 1.8 (none reaches more than three blocks from its column)
    if (type === 'acacia') {
      const th = 4 + (r * 3 | 0), bend = 2 + (rr(3) * 2 | 0);
      const dx = rr(1) < 0.5 ? -1 : 1, dz = rr(2) < 0.5 ? 0 : (rr(4) < 0.5 ? -1 : 1);
      const tx = x + dx, tz = z + dz, ty = y + th;
      for (let ly = 0; ly <= 1; ly++) {
        const rad = ly ? 1 : 2;
        for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) {
          if (rad === 2 && Math.abs(a) === 2 && Math.abs(b) === 2) continue;
          put(tx + a, ty + ly, tz + b, B.acacia_leaves, false);
        }
      }
      for (let i = 0; i < th; i++) put(i < bend ? x : tx, y + i, i < bend ? z : tz, B.acacia_log, true);
      return;
    }
    if (type === 'cherry') {
      const th = 4 + (r * 2 | 0);
      blob(x, y + th, z, 3.1, B.cherry_leaves, 0.5);
      blob(x, y + th + 1, z, 2.2, B.cherry_leaves);
      blob(x + (rr(1) < 0.5 ? 1 : -1), y + th - 1, z + (rr(2) < 0.5 ? 1 : -1), 2, B.cherry_leaves);
      for (let i = 0; i < th; i++) put(x, y + i, z, B.cherry_log, true);
      const bx = rr(3) < 0.5 ? 1 : -1;
      put(x + bx, y + th - 2, z, B.cherry_log, true); put(x + bx * 2, y + th - 1, z, B.cherry_log, true);
      return;
    }
    if (type === 'big_spruce') {
      const th = 13 + (r * 8 | 0);
      // (two by two: the trunk stands on this column and the three beside it)
      for (let i = 0; i < th - 2; i++) {
        const top = th - i, rad = top <= 2 ? 0.8 : top <= 12 ? 1.2 + (top % 4 === 3 ? 1.6 : top % 4 === 0 ? 1 : 0.2) : -1;
        if (rad < 0 || i < 4) continue;
        for (let a = -2; a <= 3; a++) for (let b = -2; b <= 3; b++) if (Math.hypot(a - 0.5, b - 0.5) <= rad + 0.6) put(x + a, y + i, z + b, B.spruce_leaves, false);
      }
      for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) { put(x + a, y + th - 2, z + b, B.spruce_leaves, false); put(x + a, y + th - 1, z + b, B.spruce_leaves, false); }
      for (let i = 0; i < th - 2; i++) for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) put(x + a, y + i, z + b, B.spruce_log, true);
      // podzol spreads under the old giants
      for (let a = -1; a <= 2; a++) for (let b = -1; b <= 2; b++) {
        if (!chunk) continue;
        const lx = x + a - x0, lz = z + b - z0;
        if (lx < 0 || lx >= CS || lz < 0 || lz >= CS) continue;
        const i = ((y - 1) << 8) | (lz << 4) | lx;
        if (chunk.blocks[i] === B.grass || chunk.blocks[i] === B.dirt) chunk.blocks[i] = (a === 0 || a === 1) && (b === 0 || b === 1) ? B.dirt : B.podzol;
      }
      return;
    }
    if (type === 'red_mushroom' || type === 'brown_mushroom') {
      const th = 4 + (r * 3 | 0);
      if (type === 'red_mushroom') {
        for (let ly = th - 3; ly < th; ly++) for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
          if ((Math.abs(a) === 2 || Math.abs(b) === 2) && !(Math.abs(a) === 2 && Math.abs(b) === 2)) put(x + a, y + ly, z + b, B.red_mushroom_block, false);
        }
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) put(x + a, y + th, z + b, B.red_mushroom_block, false);
      } else {
        for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) if (!(Math.abs(a) === 3 && Math.abs(b) === 3)) put(x + a, y + th, z + b, B.brown_mushroom_block, false);
      }
      for (let i = 0; i < th; i++) put(x, y + i, z, B.mushroom_stem, true);
      return;
    }
    if (type === 'ice_spike') {
      const tall = r > 0.88, th = tall ? 16 + (rr(1) * 14 | 0) : 5 + (r * 7 | 0), rad = tall ? 2.4 : 1.2 + rr(2);
      for (let i = -2; i < th; i++) {
        const k = Math.max(0, rad * (1 - Math.max(0, i) / th) * (tall && i > 4 ? 0.7 : 1));
        const R2 = Math.ceil(k);
        for (let a = -R2; a <= R2; a++) for (let b = -R2; b <= R2; b++) if (Math.hypot(a, b) <= k + 0.3) put(x + a, y + i, z + b, B.packed_ice, true);
      }
      return;
    }
    if (type === 'iceberg') {
      const top = SEA + 2 + (r * 7 | 0), rad = 1.6 + rr(1) * 1.4;
      for (let wy = SEA - 5; wy <= top; wy++) {
        const k = wy <= SEA ? rad : rad * (1 - (wy - SEA) / (top - SEA + 1.5));
        const R2 = Math.ceil(k);
        for (let a = -R2; a <= R2; a++) for (let b = -R2; b <= R2; b++) {
          if (Math.hypot(a + (rr(wy) - 0.5) * 0.6, b) <= k + 0.25) put(x + a, wy, z + b, wy >= top - 1 && wy > SEA ? B.snow : rr(a * 3 + b * 5 + wy) < 0.2 ? B.ice : B.packed_ice, true);
        }
      }
      return;
    }
    if (type === 'coral') {
      const kinds = [B.tube_coral_block, B.fire_coral_block, B.brain_coral_block];
      const id = kinds[(r * 3) | 0], id2 = kinds[(rr(1) * 3) | 0];
      if (y + 6 >= SEA - 1) return;
      if (rr(2) < 0.45) {
        // a mound
        for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = 0; c <= 2; c++) if (Math.hypot(a, b, c * 1.3) <= 1.5 + rr(a * 7 + b * 3 + c) * 0.9) put(x + a, y + c, z + b, rr(a + b * 5 + c * 9) < 0.25 ? id2 : id, false);
      } else {
        // a branching trunk
        const th = 2 + (rr(3) * 3 | 0);
        for (let i = 0; i < th; i++) put(x, y + i, z, id, false);
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (rr(a * 3 + b * 7 + 5) < 0.4) continue;
          const up = 1 + (rr(a + b * 2 + 9) * 2 | 0);
          put(x + a, y + th - 1, z + b, id, false);
          for (let i = 0; i < up; i++) put(x + a * 2, y + th - 1 + i, z + b * 2, i === up - 1 ? id2 : id, false);
        }
      }
      return;
    }
    if (type === 'boulder') {
      const rad = 1.4 + r * 1.1;
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (let c = -1; c <= 2; c++) {
        if (Math.hypot(a, b, c * 1.2) <= rad + rr(a * 5 + b * 3 + c * 7) * 0.5 && Math.max(Math.abs(a), Math.abs(b)) <= 3) put(x + a, y + c, z + b, rr(a + b * 9 + c * 4) < 0.7 ? B.mossy_cobblestone : B.cobblestone, true);
      }
      return;
    }
    const birch = type === 'birch';
    const th = birch ? 5 + (r * 3 | 0) : 4 + (r * 3 | 0);
    const leaf = birch ? B.birch_leaves : B.oak_leaves, log = birch ? B.birch_log : B.oak_log;
    for (let ly = y + th - 3; ly <= y + th; ly++) {
      const top = ly >= y + th - 1;
      const rad = top ? 1 : 2;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
        if (corner && (ly === y + th || rr(dx * 5 + dz + ly * 3) < 0.5)) continue;
        put(x + dx, ly, z + dz, leaf, false);
      }
    }
    for (let i = 0; i < th; i++) put(x, y + i, z, log, true);
  }
}
