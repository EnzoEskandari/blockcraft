// The shapes of things held in a hand, lying on the ground or thrown: blocks in their own shape with
// each side shaded as it is in the world, and everything else cut out of its picture a dot thick.
import * as THREE from 'three';
import { ITEMS, RENDER } from './blocks.js';
import { TILES, TEX, ICONS } from './textures.js';

// sides: +x, -x, +y, -y, +z, -z; corners bottom left, bottom right, top right, top left seen from outside
const SIDES = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
// (the top catches the light, the sides less, one pair more than the other, as on blocks in the world)
const SHADE = [0.64, 0.64, 1, 0.5, 0.82, 0.82];

class Shape {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.idx = []; }
  // four corners, anticlockwise seen from outside
  quad(p, uv, shade) {
    const o = this.pos.length / 3;
    for (let k = 0; k < 4; k++) { this.pos.push(p[k][0], p[k][1], p[k][2]); this.uv.push(uv[k][0], uv[k][1]); this.col.push(shade, shade, shade); }
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  // (moved so its middle is at the centre, and sized so `unit` of its own measure is one across)
  geometry(unit) {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < this.pos.length; i++) { const a = i % 3; lo[a] = Math.min(lo[a], this.pos[i]); hi[a] = Math.max(hi[a], this.pos[i]); }
    const pos = new Float32Array(this.pos.length);
    for (let i = 0; i < pos.length; i++) { const a = i % 3; pos[i] = (this.pos[i] - (lo[a] + hi[a]) / 2) / unit; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setIndex(this.idx);
    return g;
  }
}

function pixelTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

// ---------------------------------------------------------------- blocks
// A block's boxes, [x0, y0, z0, x1, y1, z1, the texture layer of each side], in sixteenths of a block
function boxesOf(it) {
  const f = it.faces;
  const own = [f[0], f[1], f[2], f[3], it.facing ? it.front : f[4], f[5]];
  const all = (l) => [l, l, l, l, l, l];
  switch (it.render) {
    case RENDER.CUBE: return [[0, 0, 0, 16, 16, 16, own]];
    case RENDER.SLAB: return [[0, 0, 0, 16, 8, 16, own]];
    case RENDER.TRAPDOOR: return [[0, 0, 0, 16, 3, 16, own]];
    // (a length of fence: two posts and the rails between them)
    case RENDER.FENCE: return [[1, 0, 6, 5, 16, 10, own], [11, 0, 6, 15, 16, 10, own], [0, 12, 7, 16, 15, 9, own], [0, 5, 7, 16, 8, 9, own]];
    case RENDER.MODEL: return it.boxes ? it.boxes.map((q) => [q[0], q[1], q[2], q[3], q[4], q[5], q[6] ? all(TEX[q[6]]) : own]) : [[0, 0, 0, 16, 16, 16, own]];
    default: return null;
  }
}

function blockShape(it) {
  const boxes = boxesOf(it);
  // every texture the block uses, side by side in one picture
  const layers = [...new Set(boxes.flatMap((b) => b[6]))];
  const strip = document.createElement('canvas');
  strip.width = 16 * layers.length; strip.height = 16;
  const g = strip.getContext('2d');
  layers.forEach((l, i) => g.drawImage(TILES[l], i * 16, 0));
  const s = new Shape();
  for (const [x0, y0, z0, x1, y1, z1, l] of boxes) {
    for (let f = 0; f < 6; f++) {
      const at = layers.indexOf(l[f]);
      const p = [], uv = [];
      for (const c of SIDES[f]) {
        const px = c[0] ? x1 : x0, py = c[1] ? y1 : y0, pz = c[2] ? z1 : z0;
        // (the part of the texture the box covers, as the same block is drawn in the world)
        let u, v;
        switch (f) {
          case 0: u = 16 - pz; v = py; break;
          case 1: u = pz; v = py; break;
          case 2: u = px; v = 16 - pz; break;
          case 3: u = px; v = pz; break;
          case 4: u = px; v = py; break;
          default: u = 16 - px; v = py; break;
        }
        p.push([px, py, pz]); uv.push([u, v]);
      }
      // (kept a hair inside its own texture, so its neighbour in the picture never shows at an edge)
      const mu = (uv[0][0] + uv[1][0] + uv[2][0] + uv[3][0]) / 4, mv = (uv[0][1] + uv[1][1] + uv[2][1] + uv[3][1]) / 4;
      for (const q of uv) { q[0] = (at * 16 + q[0] + Math.sign(mu - q[0]) * 0.02) / strip.width; q[1] = (q[1] + Math.sign(mv - q[1]) * 0.02) / 16; }
      s.quad(p, uv, SHADE[f]);
    }
  }
  return { geo: s.geometry(16), map: pixelTexture(strip), cube: true, cut: true, clear: it.translucent };
}

// ---------------------------------------------------------------- everything else
// A picture cut out and given thickness: its front and back, and an edge wherever a dot meets nothing
function cutOut(canvas, thick = 1) {
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 128;
  const s = new Shape();
  const z = thick / 2, e = 0.02;
  for (let y = 0; y < h; y++) {
    const y0 = h - 1 - y, y1 = h - y;   // (the picture's first row is its top)
    // the front and the back, a strip for each run of dots along the row
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      let x1 = x;
      while (on(x1 + 1, y)) x1++;
      const a = x, b = x1 + 1;
      const uv = [[(a + e) / w, (y0 + e) / h], [(b - e) / w, (y0 + e) / h], [(b - e) / w, (y1 - e) / h], [(a + e) / w, (y1 - e) / h]];
      s.quad([[a, y0, z], [b, y0, z], [b, y1, z], [a, y1, z]], uv, 1);
      s.quad([[b, y0, -z], [a, y0, -z], [a, y1, -z], [b, y1, -z]], [uv[1], uv[0], uv[3], uv[2]], 0.86);
      x = x1;
    }
    // the edges, each the colour of the dot it belongs to
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      const c = [(x + 0.5) / w, (y0 + 0.5) / h], uv = [c, c, c, c];
      if (!on(x + 1, y)) s.quad([[x + 1, y0, z], [x + 1, y0, -z], [x + 1, y1, -z], [x + 1, y1, z]], uv, 0.72);
      if (!on(x - 1, y)) s.quad([[x, y0, -z], [x, y0, z], [x, y1, z], [x, y1, -z]], uv, 0.72);
      if (!on(x, y - 1)) s.quad([[x, y1, z], [x + 1, y1, z], [x + 1, y1, -z], [x, y1, -z]], uv, 0.94);
      if (!on(x, y + 1)) s.quad([[x, y0, -z], [x + 1, y0, -z], [x + 1, y0, z], [x, y0, z]], uv, 0.56);
    }
  }
  if (!s.idx.length) s.quad([[0, 0, 0], [w, 0, 0], [w, h, 0], [0, h, 0]], [[0, 0], [1, 0], [1, 1], [0, 1]], 1);
  // (set in a square the size of the whole picture, so a thing sits in the hand where it is drawn)
  const pos = s.pos;
  for (let i = 0; i < pos.length; i += 3) { pos[i] = (pos[i] - w / 2) / w; pos[i + 1] = (pos[i + 1] - h / 2) / h; pos[i + 2] /= w; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(s.uv), 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(s.col), 3));
  g.setIndex(s.idx);
  return { geo: g, map: pixelTexture(canvas), cube: false, cut: false, clear: false };
}

const SHAPES = [];
// The shape and picture of an item, made once and shared by every one of them
export function itemShape(id) {
  if (SHAPES[id]) return SHAPES[id];
  const it = ITEMS[id];
  let shape = null;
  if (it && it.isBlock && boxesOf(it)) shape = blockShape(it);
  else shape = cutOut(ICONS[id] || TILES[0], it && it.isBlock && it.render === RENDER.TORCH ? 2 : 1);
  SHAPES[id] = shape;
  return shape;
}

// A small model of an item. Blocks (`userData.cube`) are a block across; the rest stand in a square
// one across, facing +z. Each has a material of its own, so each can be lit for where it is.
export function itemModel(id) {
  const s = itemShape(id);
  const mat = new THREE.MeshBasicMaterial({ map: s.map, vertexColors: true, alphaTest: s.cut ? 0.5 : 0, transparent: s.clear });
  const m = new THREE.Mesh(s.geo, mat);
  m.userData.cube = s.cube;
  m.layers.enable(2);   // (things lying on the ground or held in a hand cast shadows)
  return m;
}

// The arm in front of you: four dots square and `len` long, with the hand at its far end (-z). Its
// picture is four dots across with a row to each dot of its length, the hand's rows first.
export function armGeometry(len) {
  const s = new Shape();
  for (let f = 0; f < 6; f++) {
    const p = [], uv = [];
    for (const c of SIDES[f]) {
      const x = c[0] * 4, y = c[1] * 4, z = c[2] * len;
      p.push([x, y, z]);
      if (f < 2) uv.push([y / 4, 1 - z / len]);
      else if (f < 4) uv.push([x / 4, 1 - z / len]);
      else if (f === 5) uv.push([x / 4, 1 - (1 - y / 4) * 3 / len]);   // (the end of the fist)
      else uv.push([x / 4, y / 4 * 3 / len]);
    }
    s.quad(p, uv, SHADE[f]);
  }
  return s.geometry(1);
}

