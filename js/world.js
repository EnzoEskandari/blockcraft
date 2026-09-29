// Chunk storage and terrain generation.
import { Simplex, mulberry32, hash3, fbm2, smoothstep } from './noise.js';
import { B, BLOCKS } from './blocks.js';
import { CS, CH, SEA, BIOME, BIOME_NAMES } from './constants.js';
import { stampStructures, structurePartsNear } from './structures.js';

export { CS, CH, SEA, BIOME, BIOME_NAMES };

export const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
export const bidx = (x, y, z) => (y << 8) | (z << 4) | x;

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
  constructor(seed) {
    this.seed = seed >>> 0;
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
    this.stored = new Map();          // ckey -> animals, villagers and items kept while that chunk is unloaded
    this.spawned = new Set();         // ckeys of chunks that have had their animals placed
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
    if (b.door) return !(c.meta && (c.meta[i] & 4));
    return b.solid;
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
  column(x, z) {
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
    for (let r = 0; r < 4000; r += 8) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos(a * Math.PI / 4) * r), z = Math.round(Math.sin(a * Math.PI / 4) * r);
        const c = this.column(x, z);
        if (c.h > SEA + 1 && c.h < 90 && c.biome !== BIOME.DESERT) return { x: x + 0.5, z: z + 0.5, h: c.h };
      }
    }
    return { x: 0.5, z: 0.5, h: 80 };
  }

  // ------------------------------------------------------------ generation
  generate(cx, cz) {
    const chunk = new Chunk(cx, cz);
    const blocks = chunk.blocks;
    const seed = this.seed;
    const x0 = cx * CS, z0 = cz * CS;
    const R = 3, W = CS + 2 * R;
    const H = new Int16Array(W * W), BI = new Uint8Array(W * W);
    let maxH = SEA;
    for (let dz = 0; dz < W; dz++) {
      for (let dx = 0; dx < W; dx++) {
        const c = this.column(x0 + dx - R, z0 + dz - R);
        H[dz * W + dx] = c.h;
        BI[dz * W + dx] = c.biome;
        if (c.h > maxH) maxH = c.h;
      }
    }

    // Cave density on a coarse grid, trilinearly interpolated
    const GX = 5, GY = Math.min(33, (maxH >> 2) + 2);
    const grid = new Float32Array(GX * GX * GY);
    for (let iy = 0; iy < GY; iy++) {
      for (let iz = 0; iz < GX; iz++) {
        for (let ix = 0; ix < GX; ix++) {
          const wx = x0 + ix * 4, wy = iy * 4, wz = z0 + iz * 4;
          const a = this.nCave1.noise3(wx * 0.015, wy * 0.022, wz * 0.015);
          const b = this.nCave2.noise3(wx * 0.015, wy * 0.022, wz * 0.015);
          let f = a * a + b * b - 0.006;
          if (wy < 56) {
            const c3 = this.nCave3.noise3(wx * 0.011, wy * 0.02, wz * 0.011);
            f = Math.min(f, (0.6 - c3) * 0.1);
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
        if (h < SEA - 1) {
          top = fill = sn > 0.35 ? B.gravel : sn < -0.45 ? B.clay : B.sand;
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
          else if (y < h - depth) id = (under && y >= h - depth - 3) ? under : B.stone;
          else if (y < h) id = fill;
          else if (y === h) id = top;
          else id = (y === SEA && biome === BIOME.SNOWY) ? B.ice : B.water;

          if (y > 0 && y <= h && id !== B.bedrock) {
            const nearWater = h <= SEA + 1;
            if (!(nearWater && y >= h - 5) && !(y === h && h <= SEA + 2) && cave(lx, y, lz) < 0) id = 0;
          }
          blocks[(y << 8) | (lz << 4) | lx] = id;
        }
      }
    }

    this.generateOres(chunk);

    // Trees: origins may lie up to R blocks outside so canopies cross chunk borders cleanly.
    // No trees grow on structure footprints (village houses, roads, temples...).
    const keepClear = structurePartsNear(this, cx, cz, R + 3);
    for (let dz = 0; dz < W; dz++) {
      for (let dx = 0; dx < W; dx++) {
        const x = x0 + dx - R, z = z0 + dz - R;
        const h = H[dz * W + dx], biome = BI[dz * W + dx];
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
        if (blocks[above] !== 0) continue;
        const r = hash3(seed ^ 0x9a55, x, 5, z);
        const byWater = h === SEA || h === SEA + 1 ? (H[hi - 1] < SEA || H[hi + 1] < SEA || H[hi - W] < SEA || H[hi + W] < SEA) : false;
        if (byWater && (topId === B.sand || topId === B.grass || topId === B.dirt) && r > 0.85) {
          const n = 1 + (hash3(seed, x, 17, z) * 3 | 0);
          for (let i = 0; i < n && h + 1 + i < CH; i++) blocks[((h + 1 + i) << 8) | (lz << 4) | lx] = B.sugar_cane;
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

    // Player edits from the save file
    const edits = this.edits.get(ckey(cx, cz));
    if (edits) {
      for (const [i, v] of edits) {
        blocks[i] = v & 255;
        if (v >> 8) {
          if (!chunk.meta) chunk.meta = new Uint8Array(CS * CS * CH);
          chunk.meta[i] = v >> 8;
        }
      }
    }

    let maxY = 0, emitters = 0;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b) {
        maxY = i >> 8;
        if (BLOCKS[b].light) emitters++;
        if (b === B.fire) this.fires.set(`${x0 + (i & 15)},${i >> 8},${z0 + ((i >> 4) & 15)}`, { t: 0, age: 0 });
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
    for (const [id, count, ymin, ymax, size] of ORES) {
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
        if (force ? (cur === 0 || BLOCKS[cur].replaceable || BLOCKS[cur].cutout || cur === B.oak_sapling) : (cur === 0 || BLOCKS[cur].replaceable)) chunk.blocks[i] = id;
      } else {
        const cur = this.getBlock(wx, wy, wz);
        if (force ? (cur === 0 || BLOCKS[cur].replaceable || BLOCKS[cur].cutout || cur === B.oak_sapling) : (cur === 0 || BLOCKS[cur].replaceable)) this.setBlock(wx, wy, wz, id);
      }
    };
    const rr = (i) => hash3(this.seed, x + i * 17, y, z - i * 31);
    // Grass under the trunk turns to dirt
    if (chunk) {
      const lx = x - x0, lz = z - z0;
      if (lx >= 0 && lx < CS && lz >= 0 && lz < CS) {
        const i = ((y - 1) << 8) | (lz << 4) | lx;
        if (chunk.blocks[i] === B.grass || chunk.blocks[i] === B.snowy_grass) chunk.blocks[i] = B.dirt;
        else if (chunk.blocks[i] === 0) return; // cave under the trunk
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
