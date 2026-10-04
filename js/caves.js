// Caves & Ores: how the underground of the overworld is made (worlds made from this update on, and the
// parts of older worlds nobody had been to yet).
//
// Caves are Minecraft's classic winding tunnels: each starts somewhere underground, wanders with gentle
// slopes (now and then climbing out to the surface as a sloping entrance), branches, and sometimes opens
// into a room. Big caverns open up deep down. Below y 31 the stone turns to deepslate, and ores are spread
// the way Minecraft 1.18 spreads them, with its heights squeezed into this world's (0 to 127, sea at 62).
import { mulberry32, hash3 } from './noise.js';
import { B } from './blocks.js';
import { CS, CH, SEA, BIOME } from './constants.js';

const RANGE = 8;          // tunnels from up to 8 chunks away reach into a chunk
const LAVA_BELOW = 9;     // carved space this deep fills with lava
export const DEEPSLATE_TOP = 31;
const seedOf = (rng) => (rng() * 4294967296) >>> 0;
const nextInt = (rng, n) => Math.floor(rng() * n);

// ---------------------------------------------------------------- tunnels
const CARVABLE = new Set([B.stone, B.deepslate, B.dirt, B.grass, B.snowy_grass, B.sandstone, B.snow, B.gravel, B.sand]);

export function carveTunnels(world, chunk) {
  const ctx = { blocks: chunk.blocks, x0: chunk.cx * CS, z0: chunk.cz * CS };
  for (let sx = chunk.cx - RANGE; sx <= chunk.cx + RANGE; sx++) {
    for (let sz = chunk.cz - RANGE; sz <= chunk.cz + RANGE; sz++) {
      const rng = mulberry32((hash3(world.seed ^ 0x5ca7e, sx, 0, sz) * 4294967296) >>> 0);
      // most chunks start no caves; a few start several
      let n = nextInt(rng, nextInt(rng, nextInt(rng, 15) + 1) + 1);
      if (nextInt(rng, 7) !== 0) n = 0;
      for (let i = 0; i < n; i++) {
        const x = sx * 16 + nextInt(rng, 16), y = nextInt(rng, nextInt(rng, 120) + 8), z = sz * 16 + nextInt(rng, 16);
        let tunnels = 1;
        if (nextInt(rng, 4) === 0) {
          tunnel(ctx, seedOf(rng), x, y, z, 1 + rng() * 6, 0, 0, -1, -1, 0.5);   // a room
          tunnels += nextInt(rng, 4);
        }
        for (let j = 0; j < tunnels; j++) {
          const yaw = rng() * Math.PI * 2, pitch = (rng() - 0.5) / 4;
          let width = rng() * 2 + rng();
          if (nextInt(rng, 10) === 0) width *= rng() * rng() * 3 + 1;
          tunnel(ctx, seedOf(rng), x, y, z, width, yaw, pitch, 0, 0, 1);
        }
      }
    }
  }
}

function tunnel(ctx, seed, px, py, pz, width, yaw, pitch, start, end, vScale) {
  const midX = ctx.x0 + 8, midZ = ctx.z0 + 8;
  const rng = mulberry32(seed);
  let yawV = 0, pitchV = 0;
  if (end <= 0) { const i = RANGE * 16 - 16; end = i - nextInt(rng, i / 4); }
  let room = false;
  if (start === -1) { start = end >> 1; room = true; }
  const branchAt = nextInt(rng, end >> 1) + (end >> 2);
  const steep = nextInt(rng, 6) === 0;
  for (; start < end; start++) {
    const rh = 1.5 + Math.sin(start * Math.PI / end) * width, rv = rh * vScale;
    const cp = Math.cos(pitch);
    px += Math.cos(yaw) * cp; py += Math.sin(pitch); pz += Math.sin(yaw) * cp;
    // slopes level out quickly (slower in the odd steep tunnel), and the way turns gently
    pitch *= steep ? 0.92 : 0.7;
    pitch += pitchV * 0.1;
    yaw += yawV * 0.1;
    pitchV *= 0.9; yawV *= 0.75;
    pitchV += (rng() - rng()) * rng() * 2;
    yawV += (rng() - rng()) * rng() * 4;
    if (!room && start === branchAt && width > 1) {
      tunnel(ctx, seedOf(rng), px, py, pz, rng() * 0.5 + 0.5, yaw - Math.PI / 2, pitch / 3, start, end, 1);
      tunnel(ctx, seedOf(rng), px, py, pz, rng() * 0.5 + 0.5, yaw + Math.PI / 2, pitch / 3, start, end, 1);
      return;
    }
    if (room || nextInt(rng, 4) !== 0) {
      const dx = px - midX, dz = pz - midZ, left = end - start, reach = width + 18;
      if (dx * dx + dz * dz - left * left > reach * reach) return;   // it can't reach this chunk any more
      if (Math.abs(dx) <= 16 + rh * 2 && Math.abs(dz) <= 16 + rh * 2) carve(ctx, px, py, pz, rh, rv);
      if (room) return;
    }
  }
}

function carve(ctx, px, py, pz, rh, rv) {
  const { blocks, x0, z0 } = ctx;
  const xa = Math.max(0, Math.floor(px - rh) - x0 - 1), xb = Math.min(CS, Math.floor(px + rh) - x0 + 1);
  const za = Math.max(0, Math.floor(pz - rh) - z0 - 1), zb = Math.min(CS, Math.floor(pz + rh) - z0 + 1);
  const ya = Math.max(1, Math.floor(py - rv) - 1), yb = Math.min(CH - 2, Math.floor(py + rv) + 1);
  if (xa >= xb || za >= zb || ya >= yb) return;
  // never next to water: seas, rivers and lakes keep their beds
  for (let x = xa; x < xb; x++) for (let z = za; z < zb; z++) for (let y = ya - 1; y <= yb + 1; y++) {
    if (blocks[(y << 8) | (z << 4) | x] === B.water) return;
  }
  for (let x = xa; x < xb; x++) {
    const fx = (x0 + x + 0.5 - px) / rh;
    for (let z = za; z < zb; z++) {
      const fz = (z0 + z + 0.5 - pz) / rh;
      if (fx * fx + fz * fz >= 1) continue;
      let grass = false;
      for (let y = yb - 1; y >= ya; y--) {
        const fy = (y + 0.5 - py) / rv;
        if (fy <= -0.7 || fx * fx + fy * fy + fz * fz >= 1) continue;   // flat floors
        const i = (y << 8) | (z << 4) | x;
        const b = blocks[i];
        if (!CARVABLE.has(b)) continue;
        const above = blocks[i + 256];
        if (above === B.sand || above === B.gravel) continue;   // no floating sand ceilings
        if (b === B.grass || b === B.snowy_grass) grass = true;
        blocks[i] = y < LAVA_BELOW ? B.lava : 0;
        // where a tunnel breaks through the surface, the ground it uncovers grows grass
        if (grass && blocks[i - 256] === B.dirt) blocks[i - 256] = B.grass;
      }
    }
  }
}

// ---------------------------------------------------------------- deepslate and ores
// Minecraft heights (-64 to 320, sea 63) squeezed into this world's: the 127 blocks below the sea into 62,
// the 257 above into 65
const toY = (y) => (y <= 63 ? (y + 64) * SEA / 127 : SEA + (y - 63) * (CH - 1 - SEA) / 257);
const clampMC = (y) => Math.max(-64, Math.min(320, y));

// Stone below y 31 is deepslate, mixing over the four blocks above
export function deepslateAt(seed, x, y, z) {
  return y < DEEPSLATE_TOP || (y < DEEPSLATE_TOP + 4 && hash3(seed ^ 0xdee9, x, y, z) < (DEEPSLATE_TOP + 4 - y) / 4);
}

// [in stone, in deepslate, veins per chunk (Minecraft's), size, 'u'niform or 't'riangle, from, to (Minecraft
//  heights), chance a block touching a cave is left out, only in this biome]
// (the stones of cave walls come first so the ores land on top of them)
const FEATURES = [
  [B.dirt, B.dirt, 7, 33, 'u', 0, 160, 0],
  [B.gravel, B.gravel, 14, 33, 'u', -64, 320, 0],
  [B.granite, 0, 2, 64, 'u', 0, 60, 0], [B.granite, 0, 1 / 6, 64, 'u', 64, 128, 0],
  [B.diorite, 0, 2, 64, 'u', 0, 60, 0], [B.diorite, 0, 1 / 6, 64, 'u', 64, 128, 0],
  [B.andesite, 0, 2, 64, 'u', 0, 60, 0], [B.andesite, 0, 1 / 6, 64, 'u', 64, 128, 0],
  [0, B.tuff, 2, 64, 'u', -64, 0, 0],
  [B.coal_ore, B.deepslate_coal_ore, 30, 17, 'u', 136, 320, 0],
  [B.coal_ore, B.deepslate_coal_ore, 20, 17, 't', 0, 192, 0.5],
  [B.iron_ore, B.deepslate_iron_ore, 90, 9, 't', 80, 384, 0],
  [B.iron_ore, B.deepslate_iron_ore, 10, 9, 't', -24, 56, 0],
  [B.iron_ore, B.deepslate_iron_ore, 10, 4, 'u', -64, 72, 0],
  [B.copper_ore, B.deepslate_copper_ore, 16, 10, 't', -16, 112, 0],
  [B.gold_ore, B.deepslate_gold_ore, 4, 9, 't', -64, 32, 0.5],
  [B.gold_ore, B.deepslate_gold_ore, 0.5, 9, 'u', -64, -48, 0.5],
  [B.redstone_ore, B.deepslate_redstone_ore, 4, 8, 'u', -64, 15, 0],
  [B.redstone_ore, B.deepslate_redstone_ore, 8, 8, 't', -96, -32, 0],
  [B.lapis_ore, B.deepslate_lapis_ore, 2, 7, 't', -32, 32, 0],
  [B.lapis_ore, B.deepslate_lapis_ore, 4, 7, 'u', -64, 64, 1],
  [B.diamond_ore, B.deepslate_diamond_ore, 7, 4, 't', -144, 16, 0.5],
  [B.diamond_ore, B.deepslate_diamond_ore, 1 / 9, 12, 't', -144, 16, 0.7],
  [B.diamond_ore, B.deepslate_diamond_ore, 4, 8, 't', -144, 16, 1],
  [B.emerald_ore, B.deepslate_emerald_ore, 100, 3, 't', -16, 480, 0, BIOME.MOUNTAINS],
];
// This world has less room in height than Minecraft's, so each kind gets fewer veins in the same
// proportion: blocks are just as likely to be ore as there
for (const f of FEATURES) {
  const lo = clampMC(f[5]), hi = clampMC(f[6]);
  f[2] *= hi > lo ? (toY(hi) - toY(lo)) / (hi - lo) : 0.5;
}

// Diamonds were too hard to find: half as many veins again (1.6.4). They are worked out with their own
// random numbers, after everything else, so every ore already in a world stays exactly where it was and
// the extra diamonds only ever take the place of plain stone.
export const MORE_DIAMONDS = 0.5;
// (a touch over half as many veins, since some of the extra ones land on ore or caves that are already there)
const EXTRA = FEATURES.filter((f) => f[0] === B.diamond_ore).map((f) => { const g = [...f]; g[2] *= MORE_DIAMONDS * 1.08; return g; });

export function placeOres(world, chunk) {
  const seed = world.seed;
  // veins from neighbouring chunks spill over the border, so they are worked out too
  const around = (features, salt, layer, fi0) => {
    for (let sx = chunk.cx - 1; sx <= chunk.cx + 1; sx++) {
      for (let sz = chunk.cz - 1; sz <= chunk.cz + 1; sz++) {
        scatter(world, chunk, features, fi0, mulberry32((hash3(seed ^ salt, sx, layer, sz) * 4294967296) >>> 0), sx, sz);
      }
    }
  };
  around(FEATURES, 0x0be5, 1, 0);
  around(EXTRA, 0xd1a5, 2, FEATURES.length);
}

// The veins that start in chunk (sx, sz), as far as they reach into `chunk`
function scatter(world, chunk, features, fi0, rng, sx, sz) {
  const blocks = chunk.blocks, x0 = chunk.cx * CS, z0 = chunk.cz * CS, seed = world.seed;
  let biome = -1;
  features.forEach(([ore, deep, count, size, dist, lo, hi, airSkip, onlyIn], fi) => {
    let n = Math.floor(count) + (rng() < count % 1 ? 1 : 0);
    if (onlyIn !== undefined) {
      if (biome < 0) biome = world.column(sx * 16 + 8, sz * 16 + 8).biome;
      if (biome !== onlyIn) n = 0;
    }
    for (let k = 0; k < n; k++) {
      const x = sx * 16 + nextInt(rng, 16), z = sz * 16 + nextInt(rng, 16);
      const mcY = dist === 'u' ? lo + rng() * (hi - lo) : lo + (rng() + rng()) * (hi - lo) / 2;
      vein(rng, blocks, x0, z0, seed, fi0 + fi, x, mcY < -64 || mcY > 320 ? -99 : Math.round(toY(mcY)), z, size, ore, deep, airSkip);
    }
  });
}

// Minecraft's ore vein: a short line of overlapping blobs, fattest in the middle
function vein(rng, blocks, x0, z0, seed, fi, x, y, z, size, ore, deep, airSkip) {
  const a = rng() * Math.PI, f = size / 8;
  const xa = x + Math.sin(a) * f, xb = x - Math.sin(a) * f, za = z + Math.cos(a) * f, zb = z - Math.cos(a) * f;
  const ya = y + nextInt(rng, 3) - 2, yb = y + nextInt(rng, 3) - 2;
  const blobs = [];
  for (let n = 0; n < size; n++) {
    const t = n / size;
    const r = ((Math.sin(Math.PI * t) + 1) * (rng() * size / 16) + 1) / 2;
    blobs.push([xa + (xb - xa) * t, ya + (yb - ya) * t, za + (zb - za) * t, r]);
  }
  if (y < 1) return;   // below the bottom of the world (its blobs were still drawn, so other veins stay the same)
  // (only the part inside this chunk is filled in)
  if (Math.max(xa, xb) + size / 8 < x0 || Math.min(xa, xb) - size / 8 >= x0 + CS || Math.max(za, zb) + size / 8 < z0 || Math.min(za, zb) - size / 8 >= z0 + CS) return;
  for (const [bx, by, bz, r] of blobs) {
    const wxa = Math.max(x0, Math.floor(bx - r)), wxb = Math.min(x0 + CS - 1, Math.floor(bx + r));
    const wza = Math.max(z0, Math.floor(bz - r)), wzb = Math.min(z0 + CS - 1, Math.floor(bz + r));
    if (wxa > wxb || wza > wzb) continue;
    for (let wx = wxa; wx <= wxb; wx++) {
      const lx = wx - x0;
      const dx = (wx + 0.5 - bx) / r;
      for (let wy = Math.max(1, Math.floor(by - r)); wy <= Math.min(CH - 2, Math.floor(by + r)); wy++) {
        const dy = (wy + 0.5 - by) / r;
        for (let wz = wza; wz <= wzb; wz++) {
          const lz = wz - z0;
          const dz = (wz + 0.5 - bz) / r;
          if (dx * dx + dy * dy + dz * dz >= 1) continue;
          const i = (wy << 8) | (lz << 4) | lx;
          const cur = blocks[i];
          const put = cur === B.stone ? ore : cur === B.deepslate ? deep : 0;
          if (!put) continue;
          // some ores are rarely found right on a cave wall
          if (airSkip && touchesAir(blocks, lx, wy, lz) && hash3(seed ^ (0xa1 + fi), wx, wy, wz) < airSkip) continue;
          blocks[i] = put;
        }
      }
    }
  }
}

function touchesAir(blocks, x, y, z) {
  const i = (y << 8) | (z << 4) | x;
  return blocks[i + 256] === 0 || blocks[i - 256] === 0
    || (x > 0 && blocks[i - 1] === 0) || (x < 15 && blocks[i + 1] === 0)
    || (z > 0 && blocks[i - 16] === 0) || (z < 15 && blocks[i + 16] === 0);
}
