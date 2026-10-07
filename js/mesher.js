// Chunk lighting (sky + block light flood fill) and mesh building with ambient occlusion.
// Light is computed over the 3x3 chunk neighbourhood so it is exact for the centre chunk
// (light never travels further than 15 blocks).
import { CH } from './world.js';
import { BLOCKS, RENDER, B } from './blocks.js';
import { TEX } from './textures.js';

const RW = 48, RA = RW * RW, RH = CH + 2;   // region: 48x48 columns, one pad layer below and above
const RSIZE = RA * RH;
const rB = new Uint8Array(RSIZE);
const rM = new Uint8Array(RSIZE);   // block meta (liquid levels)
const rS = new Uint8Array(RSIZE);
const rL = new Uint8Array(RSIZE);
const Q = new Int32Array(RSIZE);
const topL = new Int16Array(RA);

const OPAQUE = new Uint8Array(256), SKYPASS = new Uint8Array(256), ATTEN = new Uint8Array(256);
const EMIT = new Uint8Array(256), RTYPE = new Uint8Array(256), CULLSAME = new Uint8Array(256);
const TRANS = new Uint8Array(256), TINT = new Uint8Array(256), FACING = new Uint8Array(256), SOLID = new Uint8Array(256);
const FACE = new Uint8Array(256 * 6), FRONT = new Uint8Array(256);
// Blocks with a shape of their own: id -> for each way they can face, boxes [x0, y0, z0, x1, y1, z1, layers]
const MODELS = [];

const BIOME_TINT = [
  [1, 1, 1], [0.86, 1, 0.84], [1, 0.93, 0.6], [0.76, 0.92, 0.84], [0.8, 0.9, 0.94], [0.8, 0.93, 0.86],
  [0.62, 0.74, 0.46], [0.8, 1, 0.62], [0.66, 0.84, 0.58],
  // savanna, badlands, birch forest, flower forest, cherry grove, snowy taiga, ice spikes, mushroom fields, meadow, old growth taiga, sunflower plains
  [1, 0.84, 0.44], [0.92, 0.8, 0.5], [0.9, 1, 0.8], [0.84, 1, 0.78], [0.94, 1, 0.74], [0.78, 0.9, 0.86], [0.8, 0.9, 0.94], [0.72, 0.9, 0.62], [0.78, 0.98, 0.9], [0.74, 0.9, 0.74], [1, 1, 0.9],
];
// (oceans, the beach, snowy peaks, the bamboo jungle)
Object.assign(BIOME_TINT, { 25: [0.9, 1, 0.9], 26: [0.9, 1, 0.9], 27: [0.8, 0.9, 0.94], 28: [0.9, 1, 0.8], 29: [1, 1, 0.9], 31: [0.8, 0.93, 0.86], 32: [0.8, 1, 0.62] });
const FENCE_LINK = new Uint8Array(256); // blocks a fence connects to
const AO = [0.5, 0.68, 0.84, 1];

// faces: +x, -x, +y, -y, +z, -z; corners listed BL, BR, TR, TL as seen from outside
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.6 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.6 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.8 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.8 },
];
const UV = [[0, 0], [16, 0], [16, 16], [0, 16]];
const AXIS_OFF = [1, RA, RW];
const N_OFF = [], AO1 = [], AO2 = [], CORNERS = [];
for (let f = 0; f < 6; f++) {
  const F = FACES[f];
  N_OFF[f] = F.n[0] * 1 + F.n[1] * RA + F.n[2] * RW;
  const na = F.n[0] ? 0 : F.n[1] ? 1 : 2;
  const [t1, t2] = [0, 1, 2].filter((a) => a !== na);
  AO1[f] = []; AO2[f] = []; CORNERS[f] = [];
  for (let k = 0; k < 4; k++) {
    const c = F.c[k];
    AO1[f][k] = (c[t1] ? 1 : -1) * AXIS_OFF[t1];
    AO2[f][k] = (c[t2] ? 1 : -1) * AXIS_OFF[t2];
    CORNERS[f][k] = c;
  }
}

export function initMesher() {
  for (const b of BLOCKS) {
    if (!b) continue;
    const i = b.id;
    OPAQUE[i] = b.opaque ? 1 : 0;
    SOLID[i] = b.solid ? 1 : 0;
    ATTEN[i] = b.atten;
    SKYPASS[i] = !b.opaque && !b.atten ? 1 : 0;
    EMIT[i] = b.light;
    RTYPE[i] = b.render;
    CULLSAME[i] = b.cullSame ? 1 : 0;
    TRANS[i] = b.translucent ? 1 : 0;
    TINT[i] = b.tint;
    FACING[i] = b.facing ? 1 : 0;
    for (let f = 0; f < 6; f++) FACE[i * 6 + f] = b.faces[f];
    FRONT[i] = b.front;
    FENCE_LINK[i] = (b.opaque && b.solid) || b.render === RENDER.FENCE ? 1 : 0;
    if (b.boxes) {
      const own = [b.faces[0], b.faces[1], b.faces[2], b.faces[3], b.facing ? b.front : b.faces[4], b.faces[5]];
      const boxes = b.boxes.map((q) => [q[0], q[1], q[2], q[3], q[4], q[5], q[6] ? ALL6(TEX[q[6]]) : own]);
      // turned a quarter at a time for the way the block faces
      const turn = (list) => list.map(([x0, y0, z0, x1, y1, z1, l]) => [16 - z1, y0, x0, 16 - z0, y1, x1, [l[5], l[4], l[2], l[3], l[0], l[1]]]);
      MODELS[i] = [boxes];
      for (let r = 1; r < 4; r++) MODELS[i][r] = turn(MODELS[i][r - 1]);
    }
  }
}

// Texture coordinates rotated in quarter turns about the tile centre (for bed tops)
function rotUV(u, v, d) {
  switch (d) {
    case 0: return [16 - u, 16 - v];
    case 1: return [v, 16 - u];
    case 3: return [16 - v, u];
    default: return [u, v];
  }
}

// An axis-aligned box inside a cell; coordinates are in 1/16 block and the texture is sampled
// from the part of the tile the box covers, so thin shapes keep their pixel art.
function emitBox(buf, X, Y, Z, x0, y0, z0, x1, y1, z1, layers, sky, blk, skip = 0, topRot = -1) {
  for (let f = 0; f < 6; f++) {
    if (skip & (1 << f)) continue;
    buf.ensure(4);
    const cs = CORNERS[f], m = FACES[f].shade * 255;
    const layer = layers[f];
    for (let k = 0; k < 4; k++) {
      const c = cs[k];
      const px = c[0] ? x1 : x0, py = c[1] ? y1 : y0, pz = c[2] ? z1 : z0;
      let u, v;
      switch (f) {
        case 0: u = 16 - pz; v = py; break;
        case 1: u = pz; v = py; break;
        case 2: u = px; v = 16 - pz; break;
        case 3: u = px; v = pz; break;
        case 4: u = px; v = py; break;
        default: u = 16 - px; v = py; break;
      }
      if (f === 2 && topRot >= 0) [u, v] = rotUV(u, v, topRot);
      buf.vert(X + px, Y + py, Z + pz, u, v, layer, m, m, m, sky, blk);
    }
    buf.quad(false, false);
  }
}
const ALL6 = (l) => [l, l, l, l, l, l];

// A box inside one block, each face lit by the brighter of its own cell and the cell it looks into
function litBox(buf, X, Y, Z, x0, y0, z0, x1, y1, z1, layers, ri, skip) {
  for (let f = 0; f < 6; f++) {
    if (skip & (1 << f)) continue;
    const bi = ri + N_OFF[f];
    emitBox(buf, X, Y, Z, x0, y0, z0, x1, y1, z1, layers, Math.max(rS[ri], rS[bi]) * 17, Math.max(rL[ri], rL[bi]) * 17, 63 ^ (1 << f));
  }
}

class MeshBuf {
  constructor(cap) { this.alloc(cap); }
  alloc(cap) {
    const old = this.pos ? this : null;
    this.cap = cap;
    const pos = new Int16Array(cap * 3), tex = new Uint8Array(cap * 4), col = new Uint8Array(cap * 4);
    const lig = new Uint8Array(cap * 2), idx = new Uint32Array(cap * 3);
    if (old) {
      pos.set(old.pos); tex.set(old.tex); col.set(old.col); lig.set(old.lig); idx.set(old.idx);
    }
    this.pos = pos; this.tex = tex; this.col = col; this.lig = lig; this.idx = idx;
  }
  reset() { this.v = 0; this.i = 0; }
  ensure(n) { if (this.v + n > this.cap) this.alloc(this.cap * 2); }
  vert(x, y, z, u, v, layer, r, g, b, sky, blk) {
    const o = this.v;
    this.pos[o * 3] = x; this.pos[o * 3 + 1] = y; this.pos[o * 3 + 2] = z;
    this.tex[o * 4] = u; this.tex[o * 4 + 1] = v; this.tex[o * 4 + 2] = layer;
    this.col[o * 4] = r; this.col[o * 4 + 1] = g; this.col[o * 4 + 2] = b; this.col[o * 4 + 3] = 255;
    this.lig[o * 2] = sky; this.lig[o * 2 + 1] = blk;
    this.v++;
  }
  quad(flip, both) {
    const b = this.v - 4, I = this.idx;
    let i = this.i;
    if (flip) { I[i++] = b + 1; I[i++] = b + 2; I[i++] = b + 3; I[i++] = b + 1; I[i++] = b + 3; I[i++] = b; }
    else { I[i++] = b; I[i++] = b + 1; I[i++] = b + 2; I[i++] = b; I[i++] = b + 2; I[i++] = b + 3; }
    if (both) { I[i++] = b; I[i++] = b + 2; I[i++] = b + 1; I[i++] = b; I[i++] = b + 3; I[i++] = b + 2; }
    this.i = i;
  }
  output() {
    if (!this.v) return null;
    const v = this.v, i = this.i;
    return {
      pos: this.pos.slice(0, v * 3), tex: this.tex.slice(0, v * 4), col: this.col.slice(0, v * 4),
      lig: this.lig.slice(0, v * 2), idx: v < 65536 ? new Uint16Array(this.idx.subarray(0, i)) : this.idx.slice(0, i),
    };
  }
}
const OB = new MeshBuf(40000);
const TB = new MeshBuf(8000);

function propagate(light, head, tail) {
  while (head !== tail) {
    const i = Q[head];
    if (++head === RSIZE) head = 0;
    const l = light[i];
    if (l <= 1) continue;
    const L = (i / RA) | 0;
    const rem = i - L * RA;
    const z = (rem / RW) | 0;
    const x = rem - z * RW;
    for (let d = 0; d < 6; d++) {
      let n;
      switch (d) {
        case 0: if (x === 0) continue; n = i - 1; break;
        case 1: if (x === RW - 1) continue; n = i + 1; break;
        case 2: if (z === 0) continue; n = i - RW; break;
        case 3: if (z === RW - 1) continue; n = i + RW; break;
        case 4: if (L <= 1) continue; n = i - RA; break;
        default: if (L >= RH - 1) continue; n = i + RA; break;
      }
      const b = rB[n];
      if (OPAQUE[b]) continue;
      const nl = l - 1 - ATTEN[b];
      if (nl > light[n]) {
        light[n] = nl;
        Q[tail] = n;
        if (++tail === RSIZE) tail = 0;
      }
    }
  }
}

export function computeLight(world, chunk) {
  const cx = chunk.cx, cz = chunk.cz;
  const near = [];
  let yTop = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const ch = world.getChunk(cx + dx, cz + dz);
    near.push(ch);
    if (ch && ch.maxY > yTop) yTop = ch.maxY;
  }
  yTop = Math.min(CH - 1, yTop + 1);
  const LTop = yTop + 1; // region layer of yTop

  rB.fill(B.bedrock, 0, RA);
  rB.fill(0, (LTop + 1) * RA);
  let n = 0;
  for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) {
    const ch = near[n++];
    const ox = dx * 16, oz = dz * 16;
    if (!ch) {
      for (let y = 0; y <= yTop; y++) for (let z = 0; z < 16; z++) rB.fill(B.stone, (y + 1) * RA + (oz + z) * RW + ox, (y + 1) * RA + (oz + z) * RW + ox + 16);
      continue;
    }
    const src = ch.blocks, msrc = ch.meta;
    for (let y = 0; y <= yTop; y++) {
      const base = (y + 1) * RA + oz * RW + ox;
      for (let z = 0; z < 16; z++) {
        const s = (y << 8) | (z << 4), d = base + z * RW;
        for (let x = 0; x < 16; x++) rB[d + x] = src[s + x];
        if (msrc) for (let x = 0; x < 16; x++) rM[d + x] = msrc[s + x];
        else rM.fill(0, d, d + 16);
      }
    }
  }

  // Sky light: straight down through clear blocks, then flood fill sideways
  rS.fill(0, 0, (LTop + 1) * RA);
  rS.fill(15, (LTop + 1) * RA);
  for (let col = 0; col < RA; col++) {
    let L = LTop;
    while (L >= 1 && SKYPASS[rB[L * RA + col]]) { rS[L * RA + col] = 15; L--; }
    topL[col] = L;
  }
  let head = 0, tail = 0;
  for (let z = 0; z < RW; z++) {
    for (let x = 0; x < RW; x++) {
      const col = z * RW + x;
      const t = topL[col];
      let m = -1;
      if (x > 0 && topL[col - 1] > m) m = topL[col - 1];
      if (x < RW - 1 && topL[col + 1] > m) m = topL[col + 1];
      if (z > 0 && topL[col - RW] > m) m = topL[col - RW];
      if (z < RW - 1 && topL[col + RW] > m) m = topL[col + RW];
      let from = t + 1;
      if (from < 1) from = 1;
      if (t >= 1 && !OPAQUE[rB[t * RA + col]] && m < t + 1) m = t + 1;
      for (let L = from; L <= m; L++) { Q[tail++] = L * RA + col; }
    }
  }
  propagate(rS, head, tail);

  // Block light from emitters (torches, glowstone, furnaces)
  rL.fill(0);
  head = 0; tail = 0;
  n = 0;
  for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) {
    const ch = near[n++];
    if (!ch || ch.emitters <= 0) continue;
    const src = ch.blocks;
    for (let i = 0; i <= (ch.maxY << 8 | 255); i++) {
      const e = EMIT[src[i]];
      if (!e) continue;
      const y = i >> 8, z = (i >> 4) & 15, x = i & 15;
      const ri = (y + 1) * RA + (dz * 16 + z) * RW + dx * 16 + x;
      rL[ri] = e;
      Q[tail++] = ri;
    }
  }
  propagate(rL, head, tail);

  // Keep the centre chunk's light for entities and spawning
  if (!chunk.light) chunk.light = new Uint8Array(16 * 16 * CH);
  const out = chunk.light;
  for (let y = 0; y < CH; y++) {
    for (let z = 0; z < 16; z++) {
      const ri = (y + 1) * RA + (z + 16) * RW + 16, o = (y << 8) | (z << 4);
      for (let x = 0; x < 16; x++) out[o + x] = (rS[ri + x] << 4) | rL[ri + x];
    }
  }
}

function cubeFace(buf, x, y, z, f, layer, ri, tr, tg, tb) {
  buf.ensure(4);
  const bi = ri + N_OFF[f];
  const shade = FACES[f].shade;
  const cs = CORNERS[f];
  let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
  for (let k = 0; k < 4; k++) {
    const s1 = bi + AO1[f][k], s2 = bi + AO2[f][k], c = s1 + AO2[f][k];
    const o1 = OPAQUE[rB[s1]], o2 = OPAQUE[rB[s2]], o3 = OPAQUE[rB[c]];
    const ao = o1 && o2 ? 0 : 3 - o1 - o2 - o3;
    let sky = rS[bi], blk = rL[bi], cnt = 1;
    if (!o1) { sky += rS[s1]; blk += rL[s1]; cnt++; }
    if (!o2) { sky += rS[s2]; blk += rL[s2]; cnt++; }
    if (!o3 && !(o1 && o2)) { sky += rS[c]; blk += rL[c]; cnt++; }
    const m = shade * AO[ao] * 255;
    const cr = cs[k];
    buf.vert((x + cr[0]) * 16, (y + cr[1]) * 16, (z + cr[2]) * 16, UV[k][0], UV[k][1], layer,
      tr * m, tg * m, tb * m, (sky * 17 / cnt) | 0, (blk * 17 / cnt) | 0);
    if (k === 0) a0 = ao; else if (k === 1) a1 = ao; else if (k === 2) a2 = ao; else a3 = ao;
  }
  buf.quad(a0 + a2 < a1 + a3, false);
}

const WATER = B.water;

// Liquid surface height (in 1/16 block) of a region cell for the corner averaging: full under more of the
// same liquid, 8/9 for a source or falling block, less the further it has flowed; 0 for open space and -1
// for a solid block (left out)
function liquidH(i, id) {
  const b = rB[i];
  if (b === id) {
    if (rB[i + RA] === id) return 16;
    const m = rM[i];
    return (m === 0 || m & 8 ? 8 : 8 - (m & 7)) * 16 / 9;
  }
  return SOLID[b] ? -1 : 0;
}
// Minecraft's corner height: deep (source-like) neighbours weigh ten times as much as shallow ones
function cornerH(hc, ha, hb, diag, id) {
  if (ha >= 16 || hb >= 16) return 16;
  let sum = 0, wt = 0;
  const add = (h) => { if (h >= 12.8) { sum += h * 10; wt += 10; } else if (h >= 0) { sum += h; wt += 1; } };
  if (ha > 0 || hb > 0) {
    const hd = liquidH(diag, id);
    if (hd >= 16) return 16;
    add(hd);
  }
  add(hc); add(ha); add(hb);
  return wt ? sum / wt : hc;
}

export function buildChunkMesh(world, chunk) {
  computeLight(world, chunk);
  OB.reset(); TB.reset();
  const meta = chunk.meta, biomes = chunk.biomes;
  const maxY = Math.min(chunk.maxY, CH - 2);
  for (let y = 0; y <= maxY; y++) {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const ri = (y + 1) * RA + (z + 16) * RW + x + 16;
        const id = rB[ri];
        if (!id) continue;
        const rt = RTYPE[id];
        const tint = TINT[id] ? BIOME_TINT[biomes[z * 16 + x]] : null;
        if (rt === RENDER.CUBE) {
          const buf = TRANS[id] ? TB : OB;
          const cull = CULLSAME[id] || TRANS[id];
          let front = -1;
          if (FACING[id]) front = [4, 1, 5, 0][meta ? meta[(y << 8) | (z << 4) | x] & 3 : 0];
          for (let f = 0; f < 6; f++) {
            const nb = rB[ri + N_OFF[f]];
            if (OPAQUE[nb] || (cull && nb === id)) continue;
            if (f === 3 && y === 0) continue;
            const layer = f === front ? FRONT[id] : FACE[id * 6 + f];
            if (tint && (TINT[id] === 2 || f === 2)) cubeFace(buf, x, y, z, f, layer, ri, tint[0], tint[1], tint[2]);
            else cubeFace(buf, x, y, z, f, layer, ri, 1, 1, 1);
          }
        } else if (rt === RENDER.CROSS) {
          const layer = FACE[id * 6];
          const sky = rS[ri] * 17, blk = rL[ri] * 17;
          const t = tint || [1, 1, 1];
          const r = t[0] * 240, g = t[1] * 240, b = t[2] * 240;
          const X = x * 16, Y = y * 16, Z = z * 16;
          OB.ensure(8);
          OB.vert(X, Y, Z, 0, 0, layer, r, g, b, sky, blk);
          OB.vert(X + 16, Y, Z + 16, 16, 0, layer, r, g, b, sky, blk);
          OB.vert(X + 16, Y + 16, Z + 16, 16, 16, layer, r, g, b, sky, blk);
          OB.vert(X, Y + 16, Z, 0, 16, layer, r, g, b, sky, blk);
          OB.quad(false, true);
          OB.vert(X, Y, Z + 16, 0, 0, layer, r, g, b, sky, blk);
          OB.vert(X + 16, Y, Z, 16, 0, layer, r, g, b, sky, blk);
          OB.vert(X + 16, Y + 16, Z, 16, 16, layer, r, g, b, sky, blk);
          OB.vert(X, Y + 16, Z + 16, 0, 16, layer, r, g, b, sky, blk);
          OB.quad(false, true);
        } else if (rt === RENDER.TORCH) {
          const layer = FACE[id * 6];
          const sky = rS[ri] * 17, blk = rL[ri] * 17;
          const X = x * 16, Y = y * 16, Z = z * 16;
          // meta 1-4: on a wall (to the east, west, south, north): it leans out from the wall, foot against it
          const wm = meta ? meta[(y << 8) | (z << 4) | x] : 0;
          const wd = wm >= 1 && wm <= 4 ? [[1, 0], [-1, 0], [0, 1], [0, -1]][wm - 1] : null;
          for (const f of [0, 1, 2, 4, 5]) {
            OB.ensure(4);
            const cs = CORNERS[f], m = FACES[f].shade * 255;
            for (let k = 0; k < 4; k++) {
              const c = cs[k];
              let px = c[0] ? 9 : 7, py = c[1] ? 10 : 0, pz = c[2] ? 9 : 7;
              if (wd) {
                const out = c[1] ? 3.5 : 7;   // how far from the middle of the block, towards the wall
                px += wd[0] * out; pz += wd[1] * out; py += 3.5;
              }
              const u = k === 0 || k === 3 ? 7 : 9;
              const v = f === 2 ? (k < 2 ? 8 : 10) : (k < 2 ? 0 : 10);
              OB.vert(X + px, Y + py, Z + pz, u, v, layer, m, m, m, sky, blk);
            }
            OB.quad(false, false);
          }
        } else if (rt === RENDER.BED || rt === RENDER.DOOR || rt === RENDER.FENCE) {
          const sky = rS[ri] * 17, blk = rL[ri] * 17;
          const X = x * 16, Y = y * 16, Z = z * 16;
          const m = meta ? meta[(y << 8) | (z << 4) | x] : 0;
          if (rt === RENDER.BED) {
            let skip = 0;
            for (let f = 0; f < 6; f++) {
              const nb = rB[ri + N_OFF[f]];
              if (f !== 2 && (OPAQUE[nb] || RTYPE[nb] === RENDER.BED)) skip |= 1 << f;
            }
            const layers = [FACE[id * 6], FACE[id * 6 + 1], FACE[id * 6 + 2], FACE[id * 6 + 3], FACE[id * 6 + 4], FACE[id * 6 + 5]];
            emitBox(OB, X, Y, Z, 0, 0, 0, 16, 9, 16, layers, sky, blk, skip, m & 3);
          } else if (rt === RENDER.DOOR) {
            const d = m & 3, open = m & 4;
            let b;
            if (!open) b = [[0, 0, 0, 16, 16, 3], [13, 0, 0, 16, 16, 16], [0, 0, 13, 16, 16, 16], [0, 0, 0, 3, 16, 16]][d];
            else b = [[0, 0, 0, 3, 16, 16], [0, 0, 0, 16, 16, 3], [13, 0, 0, 16, 16, 16], [0, 0, 13, 16, 16, 16]][d];
            emitBox(OB, X, Y, Z, b[0], b[1], b[2], b[3], b[4], b[5], ALL6(FACE[id * 6]), sky, blk);
          } else {
            const layers = ALL6(FACE[id * 6]);
            emitBox(OB, X, Y, Z, 6, 0, 6, 10, 16, 10, layers, sky, blk);
            const links = [[1, 10, 16, 7, 9, true], [-1, 0, 6, 7, 9, true], [RW, 7, 9, 10, 16, false], [-RW, 7, 9, 0, 6, false]];
            for (const [off, a0, a1, b0, b1, alongX] of links) {
              if (!FENCE_LINK[rB[ri + off]]) continue;
              for (const [y0, y1] of [[6, 9], [12, 15]]) {
                if (alongX) emitBox(OB, X, Y, Z, a0, y0, b0, a1, y1, b1, layers, sky, blk);
                else emitBox(OB, X, Y, Z, a0, y0, b0, a1, y1, b1, layers, sky, blk);
              }
            }
          }
        } else if (rt === RENDER.LIQUID) {
          // water is see-through and drawn with the transparent pass; lava is opaque
          const buf = TRANS[id] || id === WATER ? TB : OB;
          const layer = FACE[id * 6];
          // The surface height at each corner is shared by the four blocks around it (as in Minecraft),
          // so neighbouring water meets with no gaps and slopes down the way it flows.
          let h00 = 16, h10 = 16, h01 = 16, h11 = 16;
          if (rB[ri + RA] !== id) {
            const hc = liquidH(ri, id);
            const hxm = liquidH(ri - 1, id), hxp = liquidH(ri + 1, id), hzm = liquidH(ri - RW, id), hzp = liquidH(ri + RW, id);
            h00 = cornerH(hc, hxm, hzm, ri - 1 - RW, id);
            h10 = cornerH(hc, hxp, hzm, ri + 1 - RW, id);
            h01 = cornerH(hc, hxm, hzp, ri - 1 + RW, id);
            h11 = cornerH(hc, hxp, hzp, ri + 1 + RW, id);
          }
          for (let f = 0; f < 6; f++) {
            const nb = rB[ri + N_OFF[f]];
            if (nb === id || (OPAQUE[nb] && f !== 2)) continue;
            if (f === 3 && y === 0) continue;
            if (f === 2 && OPAQUE[nb] && h00 + h10 + h01 + h11 >= 64) continue;
            const bi = ri + N_OFF[f];
            const sky = Math.max(rS[bi], rS[ri]) * 17, blk = Math.max(rL[bi], rL[ri]) * 17;
            const m = FACES[f].shade * 255;
            const cs = CORNERS[f];
            buf.ensure(4);
            for (let k = 0; k < 4; k++) {
              const c = cs[k];
              const py = c[1] ? (c[0] ? (c[2] ? h11 : h10) : (c[2] ? h01 : h00)) : 0;
              buf.vert((x + c[0]) * 16, y * 16 + py, (z + c[2]) * 16, UV[k][0], f === 2 || f === 3 ? UV[k][1] : (UV[k][1] ? py : 0), layer, m, m, m, sky, blk);
            }
            buf.quad(false, false);
          }
        } else if (rt === RENDER.SLAB || rt === RENDER.TRAPDOOR || rt === RENDER.SIGN) {
          const X = x * 16, Y = y * 16, Z = z * 16;
          const m = meta ? meta[(y << 8) | (z << 4) | x] : 0;
          const layers = [FACE[id * 6], FACE[id * 6 + 1], FACE[id * 6 + 2], FACE[id * 6 + 3], FACE[id * 6 + 4], FACE[id * 6 + 5]];
          if (rt === RENDER.SLAB) {
            // half a block: faces against solid blocks and matching slabs are left out
            const top = m & 1;
            let skip = 0;
            for (let f = 0; f < 6; f++) {
              const nb = rB[ri + N_OFF[f]];
              if (f === 2 ? top && OPAQUE[nb] : f === 3 ? !top && OPAQUE[nb]
                : OPAQUE[nb] || (RTYPE[nb] === RENDER.SLAB && (rM[ri + N_OFF[f]] & 1) === top)) skip |= 1 << f;
            }
            litBox(OB, X, Y, Z, 0, top ? 8 : 0, 0, 16, top ? 16 : 8, 16, layers, ri, skip);
          } else if (rt === RENDER.TRAPDOOR) {
            // shut: a thin lid at the bottom or top of its block; open: standing against its hinge side
            const b = m & 4 ? [[0, 0, 0, 16, 16, 3], [13, 0, 0, 16, 16, 16], [0, 0, 13, 16, 16, 16], [0, 0, 0, 3, 16, 16]][m & 3]
              : m & 8 ? [0, 13, 0, 16, 16, 16] : [0, 0, 0, 16, 3, 16];
            litBox(OB, X, Y, Z, b[0], b[1], b[2], b[3], b[4], b[5], layers, ri, 0);
          } else if (BLOCKS[id].sign === 1) {
            // a board on a post, facing south, east, north or west (meta 0-3)
            const alongX = !(m & 1);
            litBox(OB, X, Y, Z, 7, 0, 7, 9, 8, 9, layers, ri, 0);
            if (alongX) litBox(OB, X, Y, Z, 0, 8, 7, 16, 16, 9, layers, ri, 0);
            else litBox(OB, X, Y, Z, 7, 8, 0, 9, 16, 16, layers, ri, 0);
          } else {
            // a board flat against the wall behind it
            const b = [[0, 4, 0, 16, 12, 2], [0, 4, 0, 2, 12, 16], [0, 4, 14, 16, 12, 16], [14, 4, 0, 16, 12, 16]][m & 3];
            litBox(OB, X, Y, Z, b[0], b[1], b[2], b[3], b[4], b[5], layers, ri, 0);
          }
        } else if (rt === RENDER.MODEL) {
          // a shape of its own, made of boxes (the anvil, the enchanting table, the blocks villagers work at)
          const m = meta ? meta[(y << 8) | (z << 4) | x] : 0;
          for (const b of MODELS[id][FACING[id] ? m & 3 : 0]) litBox(OB, x * 16, y * 16, z * 16, b[0], b[1], b[2], b[3], b[4], b[5], b[6], ri, 0);
        } else if (rt === RENDER.PORTAL) {
          // a thin glowing sheet across the frame (meta 0: along x, 1: along z)
          const layer = FACE[id * 6];
          const alongZ = meta && (meta[(y << 8) | (z << 4) | x] & 1);
          const sky = rS[ri] * 17, blk = 255;
          const layers = [layer, layer, layer, layer, layer, layer];
          let skip = 0;
          for (let f = 0; f < 6; f++) if (rB[ri + N_OFF[f]] === id) skip |= 1 << f;
          if (alongZ) emitBox(TB, x * 16, y * 16, z * 16, 6, 0, 0, 10, 16, 16, layers, sky, blk, skip);
          else emitBox(TB, x * 16, y * 16, z * 16, 0, 0, 6, 16, 16, 10, layers, sky, blk, skip);
        } else if (rt === RENDER.END_PORTAL) {
          // end portals are a flat starry surface; gateways are a full starry cube
          const layer = FACE[id * 6];
          const layers = [layer, layer, layer, layer, layer, layer];
          let skip = 0;
          for (let f = 0; f < 6; f++) { const nb = rB[ri + N_OFF[f]]; if (nb === id || OPAQUE[nb]) skip |= 1 << f; }
          if (id === B.end_portal) emitBox(OB, x * 16, y * 16, z * 16, 0, 0, 0, 16, 12, 16, layers, 255, 255, skip | 0b111011);
          else emitBox(OB, x * 16, y * 16, z * 16, 0, 0, 0, 16, 16, 16, layers, 255, 255, skip);
        }
      }
    }
  }
  return { opaque: OB.output(), trans: TB.output() };
}
