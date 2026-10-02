// Mobs, villagers, dropped items, arrows, thrown potions and pearls, primed TNT, particles and explosions.
import * as THREE from 'three';
import { G } from './game.js';
import { R, itemModel, tintModel, brightness } from './render.js';
import { BLOCKS, ITEMS, ID, B, WOOL_COLORS } from './blocks.js';
import { moveBox, raycast, rayBox, boxBlocked } from './physics.js';
import { sfx } from './audio.js';
import { mulberry32 } from './noise.js';
import { tileColors } from './textures.js';
import { CH, SEA, BIOME } from './constants.js';
import { makeTrades } from './villagers.js';

const rand = Math.random;
const TAU = Math.PI * 2;

export function lightAt(x, y, z) {
  const w = G.world;
  if (!w) return 1;
  const [s, b] = w.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
  return brightness(s, b);
}

// ---------------------------------------------------------------- particles
const PMAX = 1500;
class Particles {
  constructor() {
    this.list = [];
    this.pos = new Float32Array(PMAX * 3);
    this.col = new Float32Array(PMAX * 3);
    this.size = new Float32Array(PMAX);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 }, uFogColor: R.shared.uFogColor, uFogNear: R.shared.uFogNear, uFogFar: R.shared.uFogFar },
      vertexShader: `attribute vec3 aColor; attribute float aSize; uniform float uScale; varying vec3 vCol; varying float vDist;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        vDist = length(mv.xyz); gl_PointSize = max(1.5, aSize * uScale / max(0.1, -mv.z)); vCol = aColor; }`,
      fragmentShader: `uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; varying vec3 vCol; varying float vDist;
        void main(){ gl_FragColor = vec4(mix(vCol, uFogColor, smoothstep(uFogNear, uFogFar, vDist)), 1.0); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    R.scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 1) {
    if (this.list.length >= PMAX) this.list.shift();
    this.list.push({ x, y, z, vx, vy, vz, r, g, b, size, life, max: life, grav });
  }
  update(dt) {
    const L = this.list, w = G.world;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= 18 * p.grav * dt;
      const drag = Math.max(0, 1 - 1.5 * dt);
      p.vx *= drag; p.vz *= drag;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (p.grav > 0 && w && w.isSolid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        p.vx *= 0.3; p.vz *= 0.3; p.vy = 0;
      } else { p.x = nx; p.y = ny; p.z = nz; }
      L[n] = p;
      const o = n * 3;
      this.pos[o] = p.x; this.pos[o + 1] = p.y; this.pos[o + 2] = p.z;
      this.col[o] = p.r; this.col[o + 1] = p.g; this.col[o + 2] = p.b;
      this.size[n] = p.size * (0.4 + 0.6 * p.life / p.max);
      n++;
    }
    L.length = n;
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.mat.uniforms.uScale.value = R.renderer.domElement.height / (2 * Math.tan(R.camera.fov * Math.PI / 360));
  }
  clear() { this.list.length = 0; this.geo.setDrawRange(0, 0); }
}

export function blockParticles(x, y, z, id, n = 26, face = null) {
  const def = BLOCKS[id];
  if (!def || !def.faces) return;
  const cols = tileColors(def.faces[face === 'top' ? 2 : 0]);
  const L = lightAt(x + 0.5, y + 1, z + 0.5);
  const P = G.entities.particles;
  for (let i = 0; i < n; i++) {
    const c = cols[(rand() * cols.length) | 0];
    P.spawn(x + 0.1 + rand() * 0.8, y + 0.1 + rand() * 0.8, z + 0.1 + rand() * 0.8,
      (rand() - 0.5) * 3, rand() * 3.5, (rand() - 0.5) * 3, c[0] * L, c[1] * L, c[2] * L, 0.07 + rand() * 0.06, 0.4 + rand() * 0.6, 1);
  }
}
export function hitParticles(hit) {
  const def = BLOCKS[hit.id];
  const cols = tileColors(def.faces[0]);
  const L = lightAt(hit.x + 0.5 + hit.nx, hit.y + 0.5 + hit.ny, hit.z + 0.5 + hit.nz);
  for (let i = 0; i < 2; i++) {
    const c = cols[(rand() * cols.length) | 0];
    const px = hit.x + 0.5 + hit.nx * 0.52 + (hit.nx ? 0 : (rand() - 0.5));
    const py = hit.y + 0.5 + hit.ny * 0.52 + (hit.ny ? 0 : (rand() - 0.5));
    const pz = hit.z + 0.5 + hit.nz * 0.52 + (hit.nz ? 0 : (rand() - 0.5));
    G.entities.particles.spawn(px, py, pz, hit.nx * 1.5 + (rand() - 0.5), 1 + rand(), hit.nz * 1.5 + (rand() - 0.5), c[0] * L, c[1] * L, c[2] * L, 0.07, 0.35, 1);
  }
}
function smoke(x, y, z, n = 1, big = 1) {
  for (let i = 0; i < n; i++) {
    const v = 0.35 + rand() * 0.5;
    G.entities.particles.spawn(x + (rand() - 0.5) * big, y + (rand() - 0.5) * big, z + (rand() - 0.5) * big,
      (rand() - 0.5) * big * 3, rand() * 1.5, (rand() - 0.5) * big * 3, v, v, v, 0.2 * big + rand() * 0.2, 0.6 + rand() * 0.8, -0.06);
  }
}
function flame(x, y, z) {
  G.entities.particles.spawn(x, y, z, (rand() - 0.5) * 0.4, 0.8 + rand(), (rand() - 0.5) * 0.4, 1, 0.55 + rand() * 0.3, 0.1, 0.1, 0.4, -0.05);
}

// ---------------------------------------------------------------- mob models
// Parts are boxes measured in pixels (1/16 block); the model faces +z.
const FACE_NAMES = ['px', 'nx', 'top', 'bottom', 'front', 'back'];
const px = (g, x, y, c) => { g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; g.fillRect(x, y, 1, 1); };
const rect = (g, x, y, w, h, c) => { g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; g.fillRect(x, y, w, h); };

const PINK = [236, 160, 152], PINK_D = [214, 132, 126];
const BROWN = [78, 54, 36], COW_WHITE = [228, 228, 222];
const Z_SKIN = [84, 142, 72], Z_SHIRT = [38, 138, 150], Z_PANTS = [62, 56, 140];
const BONE = [196, 196, 190];
const SP_DARK = [54, 46, 42], SP_DARK2 = [38, 32, 30];
const MOSS = [94, 132, 70], MOSS2 = [116, 122, 108];

const eyes = (whiteLeft) => (g, x, y, w) => {
  const e = Math.max(1, Math.floor(w / 8));
  px(g, x + e, y + 2, whiteLeft ? [240, 240, 240] : [20, 20, 20]); px(g, x + e + 1, y + 2, whiteLeft ? [20, 20, 20] : [240, 240, 240]);
  px(g, x + w - e - 2, y + 2, [20, 20, 20]); px(g, x + w - e - 1, y + 2, [240, 240, 240]);
};

function quadLegs(size, xs, y, zs, color, paint) {
  const out = [];
  for (const z of zs) for (const x of xs) out.push({ name: 'leg' + out.length, size, pos: [x, y, z], off: [0, -size[1] / 2, 0], color, paint });
  return out;
}
const hooves = (c) => ({ all: (g, x, y, w, h) => rect(g, x, y + h - 2, w, 2, c) });

const MODELS = {
  pig: () => [
    { name: 'body', size: [10, 8, 16], pos: [0, 10, 0], color: PINK },
    { name: 'head', size: [8, 8, 8], pos: [0, 12, 8], off: [0, 0, 4], color: PINK, paint: { front: eyes(true) } },
    { name: 'snout', parent: 'head', size: [4, 3, 1], pos: [0, -1, 8.5], color: [242, 176, 170], paint: { front: (g, x, y) => { px(g, x, y + 1, [150, 80, 80]); px(g, x + 3, y + 1, [150, 80, 80]); } } },
    ...quadLegs([4, 6, 4], [-3, 3], 6, [-5, 5], PINK_D),
  ],
  cow: () => [
    { name: 'body', size: [12, 10, 18], pos: [0, 17, 0], color: BROWN, spots: COW_WHITE },
    { name: 'head', size: [8, 8, 6], pos: [0, 20, 9], off: [0, 0, 3], color: BROWN, paint: { front: (g, x, y) => {
      rect(g, x + 3, y, 2, 5, COW_WHITE); rect(g, x + 1, y + 5, 6, 3, [196, 168, 148]);
      px(g, x + 2, y + 6, [60, 40, 30]); px(g, x + 5, y + 6, [60, 40, 30]);
      px(g, x + 1, y + 3, [20, 20, 20]); px(g, x + 6, y + 3, [20, 20, 20]);
    } } },
    { name: 'horn0', parent: 'head', size: [1, 3, 1], pos: [-4.5, 4.5, 2], color: [222, 216, 200] },
    { name: 'horn1', parent: 'head', size: [1, 3, 1], pos: [4.5, 4.5, 2], color: [222, 216, 200] },
    ...quadLegs([4, 12, 4], [-4, 4], 12, [-7, 7], BROWN, hooves([50, 44, 40])),
  ],
  sheep: (v) => {
    const wool = WOOL_COLORS[v || 0][2];
    const face = [214, 204, 192];
    return [
      { name: 'body', size: [10, 10, 16], pos: [0, 15, 0], color: wool, noise: 0.12 },
      { name: 'head', size: [6, 6, 8], pos: [0, 18, 7], off: [0, 0, 4], color: face, paint: { front: eyes(true), top: (g, x, y, w, h) => rect(g, x, y, w, h - 3, wool) } },
      ...quadLegs([4, 12, 4], [-3, 3], 12, [-5, 5], face, { all: (g, x, y, w) => rect(g, x, y, w, 5, wool) }),
    ];
  },
  chicken: () => [
    { name: 'body', size: [6, 6, 8], pos: [0, 7, 0], color: [246, 246, 246] },
    { name: 'head', size: [4, 6, 3], pos: [0, 9, 4], off: [0, 3, 1.5], color: [246, 246, 246], paint: { front: (g, x, y) => { px(g, x, y + 1, [20, 20, 20]); px(g, x + 3, y + 1, [20, 20, 20]); } } },
    { name: 'beak', parent: 'head', size: [4, 2, 2], pos: [0, 4, 4], color: [238, 168, 40] },
    { name: 'wattle', parent: 'head', size: [2, 2, 2], pos: [0, 2, 3.5], color: [216, 30, 30] },
    { name: 'wing0', size: [1, 4, 6], pos: [-3.5, 10, 0], off: [0, -2, 0], color: [234, 234, 234] },
    { name: 'wing1', size: [1, 4, 6], pos: [3.5, 10, 0], off: [0, -2, 0], color: [234, 234, 234] },
    { name: 'leg0', size: [1, 5, 1], pos: [-1.5, 5, 1], off: [0, -2.5, 0], color: [232, 160, 40] },
    { name: 'leg1', size: [1, 5, 1], pos: [1.5, 5, 1], off: [0, -2.5, 0], color: [232, 160, 40] },
  ],
  zombie: () => humanoid([4, 12, 4], Z_SKIN, Z_SHIRT, Z_PANTS, {
    front: (g, x, y) => {
      rect(g, x + 1, y + 4, 2, 1, [22, 36, 20]); rect(g, x + 5, y + 4, 2, 1, [22, 36, 20]);
      rect(g, x + 2, y + 6, 4, 1, [56, 96, 48]);
    },
    top: (g, x, y, w, h) => { for (let i = 0; i < 10; i++) px(g, x + (rand() * w | 0), y + (rand() * h | 0), [60, 104, 52]); },
  }),
  skeleton: () => humanoid([2, 12, 2], BONE, BONE, BONE, {
    front: (g, x, y) => {
      rect(g, x + 1, y + 3, 2, 2, [40, 40, 40]); rect(g, x + 5, y + 3, 2, 2, [40, 40, 40]);
      rect(g, x + 3, y + 5, 2, 1, [70, 70, 70]);
      for (let i = 1; i < 7; i += 2) px(g, x + i, y + 6, [60, 60, 60]);
    },
  }, { body: (g, x, y, w, h) => { for (let r = 1; r < h - 3; r += 2) rect(g, x + 1, y + r, w - 2, 1, [70, 70, 70]); rect(g, x + (w >> 1), y, 1, h, [150, 150, 146]); } }),
  spider: () => {
    const parts = [
      { name: 'body', size: [10, 8, 12], pos: [0, 6, -9], color: SP_DARK, spots: [80, 64, 50] },
      { name: 'thorax', size: [6, 6, 6], pos: [0, 6, -1], color: SP_DARK2 },
      { name: 'head', size: [8, 8, 8], pos: [0, 6, 2], off: [0, 0, 4], color: SP_DARK, paint: { front: (g, x, y) => {
        for (const [ex, ey] of [[1, 3], [2, 3], [5, 3], [6, 3], [2, 2], [5, 2], [3, 4], [4, 4]]) px(g, x + ex, y + ey, [210, 20, 20]);
      } } },
    ];
    const zs = [2, 0.5, -1, -2.5], fan = [0.7, 0.25, -0.25, -0.7];
    zs.forEach((z, i) => {
      parts.push({ name: 'legL' + i, size: [16, 2, 2], pos: [-3, 6, z], off: [-8, 0, 0], rot: [0, fan[i], 0.6], color: SP_DARK2 });
      parts.push({ name: 'legR' + i, size: [16, 2, 2], pos: [3, 6, z], off: [8, 0, 0], rot: [0, -fan[i], -0.6], color: SP_DARK2 });
    });
    return parts;
  },
  // tall and narrow: four stubby legs, a long body and a big square head with a dark scowl
  boomer: () => [
    ...quadLegs([4, 6, 4], [-2, 2], 6, [-4, 4], [80, 120, 60], { all: (g, x, y, w, h) => rect(g, x, y + h - 1, w, 1, [52, 80, 40]) }),
    { name: 'body', size: [8, 12, 4], pos: [0, 12, 0], color: MOSS, spots: MOSS2 },
    { name: 'head', size: [8, 8, 8], pos: [0, 18, 0], off: [0, 4, 0], color: MOSS, spots: MOSS2, paint: { front: (g, x, y) => {
      const dark = [24, 34, 20];
      rect(g, x + 1, y + 2, 2, 2, dark); rect(g, x + 5, y + 2, 2, 2, dark);
      px(g, x + 1, y + 2, [255, 150, 30]); px(g, x + 6, y + 2, [255, 150, 30]);
      rect(g, x + 3, y + 4, 2, 2, dark);
      rect(g, x + 2, y + 5, 4, 2, dark);
      px(g, x + 2, y + 7, dark); px(g, x + 5, y + 7, dark);
    } } },
  ],
};

// An item in a humanoid model's right hand: the grip in the fist and the blade pointing forward, its
// flat side seen from the side as in Minecraft (blocks are held as small cubes)
export function holdInHand(model, id, scale = 10) {
  const it = itemModel(id);
  if (it.userData.cube) {
    it.scale.setScalar(scale * 0.6);
    it.position.set(0, -10, 1.5);
    it.rotation.set(0, Math.PI / 4, 0);
  } else {
    it.scale.setScalar(scale);
    it.position.set(0, -10, scale * 0.42);
    it.rotation.set(0, -Math.PI / 2, -Math.PI / 4);
  }
  model.parts.arm0.add(it);
  return it;
}

function humanoid(limb, skin, shirt, pants, headPaint, extra = {}) {
  const [lw] = limb;
  const armX = 4 + lw / 2;
  return [
    { name: 'head', size: [8, 8, 8], pos: [0, 24, 0], off: [0, 4, 0], color: skin, paint: headPaint },
    { name: 'body', size: [8, 12, 4], pos: [0, 18, 0], color: shirt, paint: extra.body ? { front: extra.body, back: extra.body } : null },
    { name: 'arm0', size: limb, pos: [-armX, 22, 0], off: [0, -4, 0], color: skin, paint: shirt !== skin ? { all: (g, x, y, w) => rect(g, x, y, w, 4, shirt) } : null },
    { name: 'arm1', size: limb, pos: [armX, 22, 0], off: [0, -4, 0], color: skin, paint: shirt !== skin ? { all: (g, x, y, w) => rect(g, x, y, w, 4, shirt) } : null },
    { name: 'leg0', size: limb, pos: [-lw / 2, 12, 0], off: [0, -6, 0], color: pants, paint: pants !== skin ? { all: (g, x, y, w, h) => rect(g, x, y + h - 2, w, 2, [64, 64, 64]) } : null },
    { name: 'leg1', size: limb, pos: [lw / 2, 12, 0], off: [0, -6, 0], color: pants, paint: pants !== skin ? { all: (g, x, y, w, h) => rect(g, x, y + h - 2, w, 2, [64, 64, 64]) } : null },
  ];
}

const modelCache = new Map();
// Armour worn over a player model: [helmet, chestplate, leggings, boots] item ids (0 for none)
const ARMOR_COLORS = { leather: [150, 94, 58], chainmail: [134, 136, 142], iron: [214, 214, 218], golden: [238, 202, 64], diamond: [92, 220, 212] };
function armorParts(ids) {
  const out = [];
  ids.forEach((id, slot) => {
    const it = id && ITEMS[id];
    if (!it || !it.armor) return;
    const c = ARMOR_COLORS[it.key.split('_')[0]] || ARMOR_COLORS.iron;
    const dark = c.map((v) => v * 0.68);
    const trim = { all: (g, x, y, w, h) => { rect(g, x, y + h - 1, w, 1, dark); if (it.key.startsWith('chainmail')) for (let i = 0; i < w; i += 2) rect(g, x + i, y, 1, h, dark); } };
    const part = (name, parent, size, pos) => out.push({ name, parent, size, pos, color: c, paint: trim, noise: 0.05 });
    if (slot === 0) {
      part('helmet', 'head', [9, 4.4, 9], [0, 6.4, 0]);
    } else if (slot === 1) {
      part('chest', 'body', [9, 12.6, 5], [0, 0, 0]);
      part('pad0', 'arm0', [5, 5, 5], [0, -0.4, 0]);
      part('pad1', 'arm1', [5, 5, 5], [0, -0.4, 0]);
    } else if (slot === 2) {
      part('belt', 'body', [8.8, 3, 4.8], [0, -4.6, 0]);
      part('pants0', 'leg0', [4.8, 9, 4.8], [0, -4.5, 0]);
      part('pants1', 'leg1', [4.8, 9, 4.8], [0, -4.5, 0]);
    } else {
      part('boot0', 'leg0', [5, 4, 5], [0, -10.2, 0]);
      part('boot1', 'leg1', [5, 4, 5], [0, -10.2, 0]);
    }
  });
  return out;
}

function modelTemplate(type, variant) {
  const key = type + ':' + (variant || 0);
  if (modelCache.has(key)) return modelCache.get(key);
  const parts = MODELS[type](variant);
  const W = 64;
  let cx = 0, cy = 0, rowH = 0;
  for (const p of parts) {
    const [w, h, d] = p.size.map((v) => Math.ceil(v));
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    p.rects = dims.map(([fw, fh]) => {
      if (cx + fw > W) { cx = 0; cy += rowH; rowH = 0; }
      const r = [cx, cy, fw, fh];
      cx += fw;
      rowH = Math.max(rowH, fh);
      return r;
    });
  }
  let H = 16;
  while (H < cy + rowH) H *= 2;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const r = mulberry32(key.length * 977 + (parseInt(variant, 10) || 0));
  for (const p of parts) {
    p.rects.forEach(([x, y, w, h], f) => {
      const nz = p.noise ?? 0.07;
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const k = 1 + (r() - 0.5) * 2 * nz;
        px(g, x + xx, y + yy, [p.color[0] * k, p.color[1] * k, p.color[2] * k]);
      }
      if (p.spots) {
        for (let s = 0; s < 3; s++) {
          const sx = x + (r() * w | 0), sy = y + (r() * h | 0), sw = 2 + (r() * 4 | 0), sh = 2 + (r() * 3 | 0);
          g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
          rect(g, sx, sy, sw, sh, p.spots);
          g.restore();
        }
      }
      const paint = p.paint && (p.paint[FACE_NAMES[f]] || (f !== 2 && f !== 3 && p.paint.all));
      if (paint) paint(g, x, y, w, h);
    });
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  for (const p of parts) {
    const geo = new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
    const uv = geo.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const [x, y, w, h] = p.rects[f];
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        const u = uv.getX(i), v = uv.getY(i);
        uv.setXY(i, (x + u * w) / W, 1 - (y + (1 - v) * h) / H);
      }
    }
    p.geo = geo;
  }
  const t = { parts, tex };
  modelCache.set(key, t);
  return t;
}

export function buildModel(type, variant) {
  const t = modelTemplate(type, variant);
  const mat = new THREE.MeshBasicMaterial({ map: t.tex });
  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(1 / 16);
  root.add(inner);
  const groups = {};
  for (const p of t.parts) {
    const grp = new THREE.Group();
    grp.position.set(p.pos[0], p.pos[1], p.pos[2]);
    if (p.rot) grp.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    const mesh = new THREE.Mesh(p.geo, mat);
    if (p.off) mesh.position.set(p.off[0], p.off[1], p.off[2]);
    grp.add(mesh);
    (p.parent ? groups[p.parent] : inner).add(grp);
    groups[p.name] = grp;
  }
  return { root, inner, parts: groups, mat };
}

// ---------------------------------------------------------------- more mob models
const V_SKIN = [184, 132, 102];
const ILL_SKIN = [140, 150, 150];
const PROF_COLORS = {
  farmer: [[128, 96, 54], [214, 190, 90]], librarian: [[226, 224, 214], [150, 40, 40]],
  armorer: [[70, 70, 76], [30, 30, 30]], weaponsmith: [[56, 56, 66], [150, 40, 40]],
  toolsmith: [[86, 86, 96], [40, 40, 40]], butcher: [[236, 236, 236], [196, 50, 50]],
  fletcher: [[142, 112, 72], [206, 186, 96]], cleric: [[122, 44, 142], [210, 170, 50]],
  shepherd: [[156, 124, 92], [240, 240, 240]], leatherworker: [[142, 82, 42], [104, 58, 28]],
  mason: [[120, 120, 124], [64, 64, 64]], nitwit: [[62, 132, 62], [40, 96, 40]],
};
const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
const longFace = (eye, brow, extra) => (g, x, y) => {
  rect(g, x + 1, y + 3, 6, 1, brow);
  px(g, x + 2, y + 4, [236, 236, 236]); px(g, x + 3, y + 4, eye); px(g, x + 4, y + 4, eye); px(g, x + 5, y + 4, [236, 236, 236]);
  rect(g, x + 2, y + 8, 4, 1, [100, 64, 54]);
  if (extra) extra(g, x, y);
};
function robed(skin, robe, accent, face, { arms = 'crossed', extras = [] } = {}) {
  const parts = [
    { name: 'head', size: [8, 10, 8], pos: [0, 24, 0], off: [0, 5, 0], color: skin, paint: { front: face, top: (g, x, y, w, h) => rect(g, x, y, w, h, shade(skin, 0.55)) } },
    { name: 'nose', parent: 'head', size: [2, 4, 2], pos: [0, 3, 5], color: shade(skin, 0.88) },
    { name: 'body', size: [8, 12, 6], pos: [0, 18, 0], color: robe, paint: { front: (g, x, y, w, h) => rect(g, x + 2, y + 3, w - 4, h - 3, accent) } },
    { name: 'leg0', size: [4, 12, 4], pos: [-2, 12, 0], off: [0, -6, 0], color: shade(robe, 0.8) },
    { name: 'leg1', size: [4, 12, 4], pos: [2, 12, 0], off: [0, -6, 0], color: shade(robe, 0.8) },
  ];
  if (arms === 'crossed') parts.push({ name: 'arms', size: [8, 4, 4], pos: [0, 20, 4], rot: [-0.6, 0, 0], color: robe, paint: { front: (g, x, y, w, h) => { rect(g, x, y, 2, h, skin); rect(g, x + w - 2, y, 2, h, skin); } } });
  else {
    const hand = { all: (g, x, y, w, h) => rect(g, x, y + h - 3, w, 3, skin) };
    parts.push({ name: 'arm0', size: [4, 12, 4], pos: [-6, 22, 0], off: [0, -4, 0], color: robe, paint: hand });
    parts.push({ name: 'arm1', size: [4, 12, 4], pos: [6, 22, 0], off: [0, -4, 0], color: robe, paint: hand });
  }
  return parts.concat(extras);
}

Object.assign(MODELS, {
  villager: (prof) => {
    const [robe, acc] = PROF_COLORS[prof] || PROF_COLORS.nitwit;
    const extras = prof === 'farmer' ? [{ name: 'hat', parent: 'head', size: [12, 1, 12], pos: [0, 10.5, 0], color: [214, 190, 90] }] : [];
    return robed(V_SKIN, robe, acc, longFace([60, 130, 60], [74, 52, 40]), { extras });
  },
  zombie_villager: () => robed(Z_SKIN, [94, 72, 50], [70, 52, 40], longFace([160, 30, 30], [40, 70, 36]), { arms: 'free' }),
  witch: () => robed([170, 122, 100], [82, 42, 112], [58, 30, 80], longFace([60, 130, 60], [60, 40, 30], (g, x, y) => px(g, x + 5, y + 6, [90, 140, 60])), {
    extras: [
      { name: 'brim', parent: 'head', size: [10, 2, 10], pos: [0, 10, 0], color: [44, 34, 54] },
      { name: 'cone1', parent: 'head', size: [7, 4, 7], pos: [0, 13, -0.5], color: [44, 34, 54], paint: { all: (g, x, y, w) => rect(g, x, y + 3, w, 1, [122, 62, 160]) } },
      { name: 'cone2', parent: 'head', size: [4, 4, 4], pos: [0, 17, -1.5], rot: [-0.15, 0, 0], color: [44, 34, 54] },
      { name: 'cone3', parent: 'head', size: [2, 2, 2], pos: [0, 20, -2.5], rot: [-0.3, 0, 0], color: [44, 34, 54] },
    ],
  }),
  pillager: () => robed(ILL_SKIN, [72, 72, 82], [120, 92, 62], longFace([90, 90, 90], [30, 30, 34]), { arms: 'free' }),
  vindicator: () => robed(ILL_SKIN, [40, 40, 50], [62, 62, 72], longFace([90, 90, 90], [30, 30, 34]), { arms: 'free' }),
  husk: () => humanoid([4, 12, 4], [158, 138, 104], [128, 106, 72], [98, 86, 62], {
    front: (g, x, y) => { rect(g, x + 1, y + 4, 2, 1, [60, 44, 30]); rect(g, x + 5, y + 4, 2, 1, [60, 44, 30]); rect(g, x + 2, y + 6, 4, 1, [110, 92, 66]); },
  }),
  drowned: () => humanoid([4, 12, 4], [86, 150, 138], [62, 112, 100], [52, 84, 92], {
    front: (g, x, y) => { rect(g, x + 1, y + 4, 2, 1, [120, 255, 230]); rect(g, x + 5, y + 4, 2, 1, [120, 255, 230]); rect(g, x + 2, y + 6, 4, 1, [40, 80, 70]); },
  }),
  stray: () => humanoid([2, 12, 2], [180, 190, 198], [108, 128, 138], [100, 116, 124], {
    front: (g, x, y) => {
      rect(g, x + 1, y + 3, 2, 2, [30, 40, 50]); rect(g, x + 5, y + 3, 2, 2, [30, 40, 50]);
      for (let i = 1; i < 7; i += 2) px(g, x + i, y + 6, [60, 70, 80]);
    },
  }),
  slime: () => [
    { name: 'body', size: [8, 8, 8], pos: [0, 4, 0], color: [112, 196, 92], noise: 0.12, paint: { front: (g, x, y) => {
      rect(g, x + 1, y + 2, 2, 2, [30, 60, 30]); rect(g, x + 5, y + 2, 2, 2, [30, 60, 30]); px(g, x + 4, y + 5, [30, 60, 30]);
    } } },
  ],
  shade: () => [
    { name: 'hem', size: [9, 12, 5], pos: [0, 9, 0], color: [34, 30, 44], noise: 0.1 },
    { name: 'body', size: [10, 14, 6], pos: [0, 22, 0], color: [28, 24, 38], noise: 0.1 },
    { name: 'head', size: [9, 9, 9], pos: [0, 29, 0], off: [0, 4.5, 0], color: [24, 20, 34], paint: { front: (g, x, y, w, h) => {
      rect(g, x + 1, y + 2, w - 2, h - 3, [8, 6, 12]);
      rect(g, x + 2, y + 4, 2, 1, [140, 255, 250]); rect(g, x + 5, y + 4, 2, 1, [140, 255, 250]);
    } } },
    { name: 'arm0', size: [2, 22, 2], pos: [-6, 28, 0], off: [0, -11, 0], color: [20, 18, 28] },
    { name: 'arm1', size: [2, 22, 2], pos: [6, 28, 0], off: [0, -11, 0], color: [20, 18, 28] },
  ],
  gloomwing: () => [
    { name: 'body', size: [5, 3, 9], pos: [0, 4, 0], color: [62, 72, 112] },
    { name: 'head', size: [7, 3, 5], pos: [0, 4, 6], color: [72, 82, 124], paint: { front: (g, x, y) => { px(g, x + 1, y + 1, [150, 255, 170]); px(g, x + 5, y + 1, [150, 255, 170]); } } },
    { name: 'wing0', size: [6, 1, 9], pos: [-2.5, 5, 0], off: [-3, 0, 0], color: [52, 62, 102] },
    { name: 'wing0b', parent: 'wing0', size: [6, 1, 7], pos: [-6, 0, 0], off: [-3, 0, -1], color: [42, 50, 88] },
    { name: 'wing1', size: [6, 1, 9], pos: [2.5, 5, 0], off: [3, 0, 0], color: [52, 62, 102] },
    { name: 'wing1b', parent: 'wing1', size: [6, 1, 7], pos: [6, 0, 0], off: [3, 0, -1], color: [42, 50, 88] },
    { name: 'tail', size: [3, 2, 6], pos: [0, 4, -4.5], off: [0, 0, -3], color: [52, 62, 102] },
  ],
  // Other players in multiplayer. The variant is "shirt colour|worn armour item ids", e.g. "2|0,301,0,0".
  player: (v) => {
    const shirts = [[38, 138, 150], [178, 60, 52], [70, 150, 60], [206, 160, 40], [120, 70, 160], [220, 110, 40], [60, 90, 180], [200, 90, 150]];
    const hair = [70, 46, 30];
    const [shirt, worn] = String(v ?? 0).split('|');
    return humanoid([4, 12, 4], [198, 146, 112], shirts[(+shirt || 0) % shirts.length], [52, 58, 132], {
      front: (g, x, y) => {
        rect(g, x, y, 8, 2, hair); px(g, x, y + 2, hair); px(g, x + 7, y + 2, hair);
        px(g, x + 1, y + 4, [240, 240, 240]); px(g, x + 2, y + 4, [60, 80, 160]); px(g, x + 5, y + 4, [60, 80, 160]); px(g, x + 6, y + 4, [240, 240, 240]);
        rect(g, x + 3, y + 6, 2, 1, [150, 90, 70]);
      },
      top: (g, x, y, w, h) => rect(g, x, y, w, h, hair),
      back: (g, x, y, w, h) => rect(g, x, y, w, h - 2, hair),
      px: (g, x, y, w) => rect(g, x, y, w, 3, hair),
      nx: (g, x, y, w) => rect(g, x, y, w, 3, hair),
    }).concat(armorParts(worn ? worn.split(',').map(Number) : []));
  },
  iron_golem: () => [
    { name: 'head', size: [8, 10, 8], pos: [0, 33, -2], off: [0, 5, 0], color: [204, 198, 188], paint: { front: (g, x, y) => {
      rect(g, x + 1, y + 3, 6, 1, [120, 112, 100]); px(g, x + 2, y + 4, [140, 30, 20]); px(g, x + 5, y + 4, [140, 30, 20]);
    } } },
    { name: 'nose', parent: 'head', size: [2, 4, 2], pos: [0, 3, 5], color: [190, 184, 174] },
    { name: 'body', size: [18, 12, 11], pos: [0, 27, 0], color: [212, 206, 196], spots: [80, 128, 56] },
    { name: 'waist', size: [9, 5, 6], pos: [0, 18.5, 0], color: [200, 194, 184] },
    { name: 'arm0', size: [4, 30, 6], pos: [-11, 31, 0], off: [0, -13, 0], color: [206, 200, 190], spots: [80, 128, 56] },
    { name: 'arm1', size: [4, 30, 6], pos: [11, 31, 0], off: [0, -13, 0], color: [206, 200, 190] },
    { name: 'leg0', size: [6, 16, 5], pos: [-4, 16, 0], off: [0, -8, 0], color: [200, 194, 184] },
    { name: 'leg1', size: [6, 16, 5], pos: [4, 16, 0], off: [0, -8, 0], color: [200, 194, 184], spots: [80, 128, 56] },
  ],
});

// ---------------------------------------------------------------- mob types
const drop = (key, min, max) => ({ key, min, max });
export const MOB_TYPES = {
  pig: { name: 'Pig', hp: 10, w: 0.9, h: 0.9, speed: 1.7, sound: 'pig', pitch: 1.1, drops: [drop('porkchop', 1, 3)], anim: 'quad' },
  cow: { name: 'Cow', hp: 10, w: 0.9, h: 1.4, speed: 1.5, sound: 'cow', pitch: 0.7, drops: [drop('beef', 1, 3), drop('leather', 0, 2)], anim: 'quad' },
  sheep: { name: 'Sheep', hp: 8, w: 0.9, h: 1.3, speed: 1.6, sound: 'sheep', pitch: 1.2, drops: [drop('mutton', 1, 2)], anim: 'quad' },
  chicken: { name: 'Chicken', hp: 4, w: 0.4, h: 0.7, speed: 1.4, sound: 'chicken', pitch: 1.6, drops: [drop('chicken', 1, 1), drop('feather', 0, 2)], anim: 'biped' },
  zombie: { name: 'Zombie', hp: 20, w: 0.6, h: 1.95, speed: 2.4, hostile: true, damage: 3, burns: true, zombieLike: true, sound: 'zombie', pitch: 0.8, drops: [drop('rotten_flesh', 0, 2)], anim: 'human' },
  husk: { name: 'Husk', hp: 20, w: 0.6, h: 1.95, speed: 2.4, hostile: true, damage: 3, hungerHit: true, zombieLike: true, sound: 'zombie', pitch: 0.65, drops: [drop('rotten_flesh', 0, 2)], anim: 'human' },
  drowned: { name: 'Drowned', hp: 20, w: 0.6, h: 1.95, speed: 1.9, hostile: true, damage: 3, burns: true, swims: true, zombieLike: true, sound: 'zombie', pitch: 1.0, drops: [drop('rotten_flesh', 0, 2)], anim: 'human' },
  zombie_villager: { name: 'Zombie Villager', hp: 20, w: 0.6, h: 1.95, speed: 2.3, hostile: true, damage: 3, burns: true, zombieLike: true, sound: 'zombie', pitch: 0.9, drops: [drop('rotten_flesh', 0, 2)], anim: 'human' },
  skeleton: { name: 'Skeleton', hp: 20, w: 0.6, h: 1.99, speed: 2.5, hostile: true, ranged: 'bow', burns: true, sound: 'skeleton', pitch: 1.3, drops: [drop('bone', 0, 2), drop('arrow', 0, 2)], anim: 'human' },
  stray: { name: 'Stray', hp: 20, w: 0.6, h: 1.99, speed: 2.5, hostile: true, ranged: 'bow', slowArrows: true, burns: true, sound: 'skeleton', pitch: 1.1, drops: [drop('bone', 0, 2), drop('arrow', 0, 2)], anim: 'human' },
  spider: { name: 'Spider', hp: 16, w: 1.3, h: 0.9, speed: 3.2, hostile: true, damage: 2, climbs: true, sound: 'spider', pitch: 1.0, drops: [drop('string', 0, 2)], anim: 'spider' },
  boomer: { name: 'Boomer', hp: 20, w: 0.6, h: 1.7, speed: 2.3, hostile: true, explodes: true, sound: 'boomer', pitch: 0.9, drops: [drop('gunpowder', 0, 2)], anim: 'quad' },
  witch: { name: 'Witch', hp: 26, w: 0.6, h: 1.95, speed: 1.9, hostile: true, potions: true, sound: 'witch', pitch: 1.2, drops: [drop('redstone', 0, 2), drop('gunpowder', 0, 2), drop('stick', 0, 2)], anim: 'villager' },
  slime: { name: 'Slime', hp: 16, w: 2, h: 2, speed: 2.2, hostile: true, slime: true, sound: 'slime', pitch: 1, drops: [], anim: 'slime' },
  shade: { name: 'Shade', hp: 40, w: 0.6, h: 2.6, speed: 3.4, hostile: true, neutral: true, damage: 6, teleports: true, sound: 'shade', pitch: 0.8, drops: [drop('shade_pearl', 0, 1)], anim: 'shade' },
  gloomwing: { name: 'Gloomwing', hp: 20, w: 0.9, h: 0.5, speed: 7, hostile: true, flies: true, sight: 32, burns: true, damage: 2, sound: 'gloomwing', pitch: 1, drops: [drop('gloom_membrane', 0, 1)], anim: 'wing' },
  pillager: { name: 'Pillager', hp: 24, w: 0.6, h: 1.95, speed: 2.3, hostile: true, always: true, ranged: 'crossbow', persistent: true, sound: 'illager', pitch: 1, drops: [drop('arrow', 0, 2)], anim: 'illager' },
  vindicator: { name: 'Vindicator', hp: 24, w: 0.6, h: 1.95, speed: 2.7, hostile: true, always: true, damage: 8, huntsVillagers: true, persistent: true, sound: 'illager', pitch: 0.85, drops: [drop('emerald', 0, 1)], anim: 'illager' },
  iron_golem: { name: 'Iron Golem', hp: 100, w: 1.4, h: 2.7, speed: 1.5, golem: true, damage: 12, persistent: true, sound: 'golem', pitch: 0.5, drops: [drop('iron_ingot', 3, 5), drop('poppy', 0, 2)], anim: 'golem' },
  villager: { name: 'Villager', hp: 20, w: 0.6, h: 1.95, speed: 1.5, villager: true, persistent: true, sound: 'villager', pitch: 1, drops: [], anim: 'villager' },
};
const PASSIVE = ['pig', 'cow', 'sheep', 'chicken'];
const SLIME_HP = { 1: 1, 2: 4, 4: 16 }, SLIME_DMG = { 1: 0, 2: 2, 4: 4 };

function sheepVariant() {
  const r = rand();
  if (r < 0.81) return 0;
  if (r < 0.86) return 1;
  if (r < 0.91) return 2;
  if (r < 0.96) return 3;
  if (r < 0.99) return 4;
  return 15;
}

// Everyone mobs can notice: the local player plus, in multiplayer, the other players the host simulates
const players = () => (G.net ? G.net.targets() : G.player ? [G.player] : []);
const isClient = () => !!(G.net && G.net.role === 'client');

// Any golden armour keeps snoutlings friendly
const wearsGold = (p) => (p.remote ? p.gold : (p.armor || []).some((s) => s && ITEMS[s.id] && ITEMS[s.id].material === 'golden'));

const chunkKey = (x, z) => ((Math.floor(x) >> 4) + 32768) * 65536 + ((Math.floor(z) >> 4) + 32768);

const dist3 = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);

class Mob {
  constructor(type, x, y, z, opts = {}) {
    const def = MOB_TYPES[type];
    this.type = type;
    this.def = def;
    this.pos = { x, y, z };
    this.vel = { x: 0, y: 0, z: 0 };
    const slimy = !!def.slime;
    this.size = slimy ? (opts.size || [1, 2, 4][Math.floor(rand() * 3)]) : 1;
    this.baby = !!opts.baby;
    const scale = slimy ? this.size : this.baby ? 0.55 : 1;
    this.hw = slimy ? 0.26 * this.size : (def.w / 2) * scale;
    this.h = slimy ? 0.52 * this.size : def.h * scale;
    this.hp = slimy ? SLIME_HP[this.size] : def.hp;
    this.maxHp = this.hp;
    this.variant = type === 'sheep' ? (opts.variant ?? sheepVariant()) : type === 'villager' ? (opts.prof || 'nitwit') : 0;
    this.prof = type === 'villager' ? this.variant : null;
    this.key = opts.key || null;
    this.home = opts.home || { x, y, z };
    this.persistent = !!def.persistent || !!opts.persistent;
    this.yaw = rand() * TAU;
    this.onGround = false;
    this.inWater = false;
    this.hurtTime = 0;
    this.invul = 0;
    this.dead = false;
    this.deathTime = 0;
    this.removed = false;
    this.phase = 0;
    this.attackCd = 0;
    this.shootCd = 2;
    this.fuse = 0;
    this.fire = 0;
    this.provoked = false;
    this.angry = false;
    this.angryTime = 0;
    this.target = null;
    this.retarget = 0;
    this.attacker = null;
    this.mount = null;
    this.rider = null;
    this.hopCd = 1;
    this.drinking = 0;
    this.soundCd = 3 + rand() * 10;
    this.ai = { t: 0, dir: this.yaw, walk: false, panic: 0 };
    this.age = 0;
    const m = buildModel(type, this.variant);
    this.model = m;
    if (scale !== 1) m.inner.scale.setScalar(scale / 16);
    this.baseScale = scale / 16;
    if (type === 'slime') { m.mat.transparent = true; m.mat.opacity = 0.82; }
    if (def.init) def.init(this, opts);
    R.scene.add(m.root);
    const hold = (itemId, s = 12) => {
      const it = itemModel(itemId);
      it.scale.setScalar(s);
      it.position.set(0, -10, 2);
      it.rotation.set(0, Math.PI / 2, Math.PI / 4);
      m.parts.arm1.add(it);
    };
    if (type === 'skeleton' || type === 'stray' || type === 'pillager') hold(ID.bow);
    if (type === 'vindicator') hold(ID.iron_axe);
    if (def.zombieLike && m.parts.arm0) { m.parts.arm0.rotation.x = -1.5; m.parts.arm1.rotation.x = -1.5; }
    if (type === 'villager') {
      this.trades = makeTrades(this.prof);
      const saved = this.key && G.world && G.world.villagerTrades && G.world.villagerTrades.get(this.key);
      if (saved) saved.forEach((u, i) => { if (this.trades[i]) this.trades[i].uses = u; });
      this.restockDay = G.day || 0;
    }
  }

  get center() { return { x: this.pos.x, y: this.pos.y + this.h / 2, z: this.pos.z }; }

  hurt(amount, fromX, fromZ, byPlayer, kb = 1, attacker = null) {
    if (this.dead || this.invul > 0) return false;
    if (this.proxy) {
      this.invul = 0.5;
      this.hurtTime = 0.35;
      this.hp = Math.max(0, this.hp - amount);
      sfx('mobhurt', this.pos, { pitch: this.def.pitch });
      if (byPlayer) { G.lastHitMob = this; G.lastHitTime = G.clock; }
      G.net.send({ k: 'hit', id: this.netId, d: amount, x: fromX, z: fromZ, kb, p: byPlayer ? 1 : 0 });
      return true;
    }
    if (this.def.damageScale) amount *= this.def.damageScale(this);
    this.hp -= amount;
    this.invul = 0.5;
    this.hurtTime = 0.35;
    const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const resist = this.def.heavy ? 0 : this.def.golem ? 0.1 : 1;
    this.vel.x += (dx / d) * 7 * kb * resist;
    this.vel.z += (dz / d) * 7 * kb * resist;
    if (!this.def.flies) this.vel.y = (4 + 1.5 * Math.min(1, kb)) * resist;
    sfx('mobhurt', this.pos, { pitch: this.def.pitch });
    if (byPlayer) {
      if (byPlayer !== 'remote') { G.lastHitMob = this; G.lastHitTime = G.clock; }
      this.provoked = true;
      if (this.def.groupAnger) for (const m of G.entities.mobs) if (m.type === this.type && !m.dead && dist3(m, this) < 20) { m.angry = true; m.angryTime = 0; m.retarget = 0; if (attacker) m.attacker = attacker; }
      if (this.def.neutral) { this.angry = true; this.angryTime = 0; }
      if (this.def.villager) for (const g of G.entities.mobs) if (g.def.golem && dist3(g, this) < 16) g.provoked = true;
    }
    if (attacker) this.attacker = attacker;
    if (!this.def.hostile && !this.def.golem) { this.ai.panic = 4; this.ai.t = 0; }
    if (this.def.teleports && rand() < 0.6 && this.hp > 0) this.teleportNear(this.pos, 10);
    if (this.hp <= 0) this.die(attacker);
    else this.retarget = 0;
    return true;
  }

  die(killer) {
    this.dead = true;
    this.deathTime = 0;
    if (this.def.onDie) this.def.onDie(this, killer);
    if (this.key && G.world) G.world.deadMobs.add(this.key);
    const dropItem = (id, n, x, y, z) => G.entities.dropItem(id, n, x, y, z);
    for (const d of this.def.drops) {
      if (d.roll !== undefined && rand() >= d.roll) continue;
      const n = d.min + Math.floor(rand() * (d.max - d.min + 1));
      if (n > 0) dropItem(ID[d.key], n, this.pos.x, this.pos.y + 0.5, this.pos.z);
    }
    if (this.type === 'sheep') dropItem(55 + this.variant, 1, this.pos.x, this.pos.y + 0.5, this.pos.z);
    if (this.def.slime) {
      if (this.size > 1) {
        const n = 2 + Math.floor(rand() * 3);
        for (let i = 0; i < n; i++) G.entities.spawnMob(this.type, this.pos.x + (rand() - 0.5) * this.hw, this.pos.y + 0.2, this.pos.z + (rand() - 0.5) * this.hw, { size: this.size / 2 });
      } else if (this.type === 'slime' && rand() < 0.7) dropItem(ID.slime_ball, 1 + Math.floor(rand() * 2), this.pos.x, this.pos.y + 0.3, this.pos.z);
      if (this.type === 'magma_slime' && this.size > 1 && rand() < 0.5) dropItem(ID.magma_cream, 1, this.pos.x, this.pos.y + 0.3, this.pos.z);
    }
    if (this.def.villager && killer && killer.def && killer.def.zombieLike && rand() < 0.5) {
      G.entities.spawnMob('zombie_villager', this.pos.x, this.pos.y, this.pos.z);
      this.removed = true;
    }
    if (this.rider) { this.rider.mount = null; this.rider = null; }
  }

  // Who this mob wants to chase or fight right now
  pickTarget() {
    const def = this.def, mobs = G.entities.mobs;
    const ps = players().filter((p) => !p.dead && p.mode === 'survival' && !(def.goldLover && !this.angry && wearsGold(p)));
    let best = null, bd = Infinity;
    const consider = (e, range) => { const d = dist3(this, e); if (d < range && d < bd) { bd = d; best = e; } };
    if (def.golem) {
      if (this.provoked) for (const p of ps) consider(p, 24);
      for (const m of mobs) if (!m.dead && m.def.hostile && m.type !== 'boomer' && !(m.def.neutral && !m.angry)) consider(m, 16);
      return best;
    }
    if (!def.hostile) return null;
    if (def.neutral && !this.angry) return null;
    if (this.type === 'spider' && G.daylight >= 0.55 && !this.provoked) return null;
    const night = G.time > 0.52 && G.time < 0.98;
    // Monsters notice players they can see nearby, and keep after one they are chasing a little further
    const range = def.sight || (def.flies ? 32 : def.always ? 16 : 12);
    const notice = (q, r) => {
      if (q === this.target) consider(q, r * 1.6);
      else if (dist3(this, q) < r && this.canSee(q)) consider(q, r);
    };
    for (const p of ps) {
      if (def.swims) {
        const wet = G.world.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.5), Math.floor(p.pos.z)) === B.water;
        if (wet || night) notice(p, 10);
      } else notice(p, range);
    }
    if (def.zombieLike || def.huntsVillagers) for (const m of mobs) if (!m.dead && m.def.villager) consider(m, 16);
    const a = this.attacker;
    if (a && !a.dead && !a.removed && !a.gone && (a.def || (a.isPlayer && a.mode === 'survival'))) consider(a, 20);
    return best;
  }

  hit(t, dmg) {
    if (t.isPlayer) {
      t.hurt(dmg, this.pos.x, this.pos.z, 'mob');
      if (this.def.hungerHit) t.addEffect('hunger', 7);
    } else t.hurt(dmg, this.pos.x, this.pos.z, false, 1, this);
  }

  // ------------------------------------------------------------ multiplayer
  // The host sends each guest [id, x, y, z, yaw, flags, hp, fuse, target player id]
  netState() {
    const r = (v) => Math.round(v * 100) / 100;
    const t = this.target;
    const flags = (this.dead ? 1 : 0) | (this.onGround ? 2 : 0) | (this.angry ? 4 : 0) | (this.drinking > 0 ? 8 : 0)
      | (this.fire > 0 ? 16 : 0) | (this.mount ? 32 : 0) | (t ? 64 : 0);
    return [this.netId, r(this.pos.x), r(this.pos.y), r(this.pos.z), r(this.yaw), flags, Math.ceil(this.hp), Math.round(this.fuse * 10) / 10,
      t && t.isPlayer ? t.netId ?? -1 : -1];
  }

  netSpawn() {
    const o = { t: this.type };
    if (this.type === 'sheep') o.v = this.variant;
    if (this.prof) o.p = this.prof;
    if (this.def.slime) o.s = this.size;
    if (this.baby) o.b = 1;
    if (this.trades) o.u = this.trades.map((tr) => tr.uses);
    o.m = this.maxHp;
    return o;
  }

  applyNet(a) {
    const n = this.net || (this.net = {});
    n.x = a[1]; n.y = a[2]; n.z = a[3];
    this.yaw = a[4];
    const f = a[5];
    if (f & 1 && !this.dead) { this.dead = true; this.deathTime = 0; }
    this.onGround = !!(f & 2);
    this.angry = !!(f & 4);
    this.drinking = f & 8 ? 1 : 0;
    this.fire = f & 16 ? 1 : 0;
    this.mount = f & 32 ? true : null;
    if (a[6] < this.hp - 0.01 && !this.dead) this.hurtTime = 0.35;
    this.hp = a[6];
    this.fuse = a[7];
    const tid = a[8];
    this.target = !(f & 64) ? null : tid === G.net.id ? G.player : (G.net.players.get(tid) || G.player);
  }

  proxyUpdate(dt) {
    this.age += dt;
    this.hurtTime -= dt;
    this.invul -= dt;
    if (this.dead) {
      this.deathTime += dt;
      this.model.root.rotation.z = Math.min(1, this.deathTime * 3) * Math.PI / 2;
      tintModel(this.model.root, lightAt(this.pos.x, this.pos.y + 0.5, this.pos.z), 0.6);
      if (this.deathTime > 0.8) { smoke(this.pos.x, this.pos.y + this.h / 2, this.pos.z, 10, 0.6); this.removed = true; }
      return;
    }
    const n = this.net;
    const ox = this.pos.x, oy = this.pos.y, oz = this.pos.z;
    if (n) {
      if (Math.hypot(n.x - ox, n.y - oy, n.z - oz) > 6) { this.pos.x = n.x; this.pos.y = n.y; this.pos.z = n.z; }
      else {
        const k = Math.min(1, dt * 12);
        this.pos.x += (n.x - ox) * k; this.pos.y += (n.y - oy) * k; this.pos.z += (n.z - oz) * k;
      }
    }
    if (dt > 0) { this.vel.x = (this.pos.x - ox) / dt; this.vel.y = (this.pos.y - oy) / dt; this.vel.z = (this.pos.z - oz) / dt; }
    if (this.fire > 0 && rand() < dt * 12) flame(this.pos.x + (rand() - 0.5) * 0.6, this.pos.y + rand() * this.h, this.pos.z + (rand() - 0.5) * 0.6);
    const p = G.player;
    const pdist = p ? Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) : Infinity;
    this.soundCd -= dt;
    if (this.soundCd <= 0) { this.soundCd = 6 + rand() * 12; if (pdist < 16) sfx(this.def.sound, this.pos, { vol: 0.8 }); }
    // Shades still notice when this player stares at them
    this.stareCd = (this.stareCd || 0) - dt;
    if (this.def.teleports && !this.angry && this.stareCd <= 0 && this.staredAt(p)) { this.stareCd = 2; G.net.send({ k: 'stare', id: this.netId }); }
    this.animate(dt, Math.min(8, Math.hypot(this.vel.x, this.vel.z)), pdist);
  }

  update(dt) {
    if (this.proxy) { this.proxyUpdate(dt); return; }
    const def = this.def, w = G.world, p = G.player;
    if (def.ai) { def.ai(this, dt); return; }   // flyers, bosses and other special mobs (dimmobs.js)
    if (def.tick) def.tick(this, dt);
    this.age += dt;
    this.hurtTime -= dt;
    this.invul -= dt;
    this.attackCd -= dt;
    if (this.dead) {
      this.deathTime += dt;
      this.model.root.rotation.z = Math.min(1, this.deathTime * 3) * Math.PI / 2;
      tintModel(this.model.root, lightAt(this.pos.x, this.pos.y + 0.5, this.pos.z), 0.6);
      if (this.deathTime > 0.8) {
        smoke(this.pos.x, this.pos.y + this.h / 2, this.pos.z, 10, 0.6);
        this.removed = true;
      }
      return;
    }

    this.retarget -= dt;
    if (this.retarget <= 0) { this.retarget = 0.35 + rand() * 0.3; this.target = this.pickTarget(); }
    let t = this.target;
    if (t && (t.dead || t.removed)) t = this.target = null;
    const dx = t ? t.pos.x - this.pos.x : 0, dz = t ? t.pos.z - this.pos.z : 0, dy = t ? t.pos.y - this.pos.y : 0;
    const dist = t ? Math.hypot(dx, dz) : Infinity;
    const pdist = p ? Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) : Infinity;
    let mx = 0, mz = 0, speed = 0;

    // A skeleton riding a spider sits on its back and only shoots
    if (this.mount) {
      const mt = this.mount;
      if (mt.dead || mt.removed) { this.mount = null; }
      else {
        this.pos.x = mt.pos.x; this.pos.y = mt.pos.y + mt.h - 0.25; this.pos.z = mt.pos.z;
        this.vel.x = this.vel.y = this.vel.z = 0;
        if (t) { this.yaw = Math.atan2(dx, dz); this.rangedAttack(t, dist, dt); }
        else this.yaw = mt.yaw;
        this.burnCheck(dt);
        this.animate(dt, 0, pdist);
        return;
      }
    }

    if (def.flies) { this.flyUpdate(dt, t); this.burnCheck(dt); this.animate(dt, 1, pdist); return; }

    // Shades become hostile when you look straight at them
    if (def.teleports) this.shadeLogic(dt, p, pdist);

    if (t && Math.abs(dy) < 14) {
      const dirX = dx / (dist || 1), dirZ = dz / (dist || 1);
      this.yaw = Math.atan2(dirX, dirZ);
      if (def.ranged) {
        if (dist > 9) { mx = dirX; mz = dirZ; speed = def.speed; }
        else if (dist < 5) { mx = -dirX; mz = -dirZ; speed = def.speed * 0.8; }
        else { mx = -dirZ; mz = dirX; speed = def.speed * 0.4 * (Math.sin(this.age * 0.8) > 0 ? 1 : -1); }
        this.rangedAttack(t, dist, dt);
      } else if (def.potions) {
        if (this.drinking > 0) {
          this.drinking -= dt;
          if (this.drinking <= 0) { this.hp = Math.min(this.maxHp, this.hp + 4); sfx('burp', this.pos); }
        } else if (this.hp < 13 && rand() < dt * 0.5) this.drinking = 1.2;
        if (dist > 9) { mx = dirX; mz = dirZ; speed = def.speed; }
        else if (dist < 4) { mx = -dirX; mz = -dirZ; speed = def.speed; }
        this.shootCd -= dt;
        if (this.shootCd <= 0 && this.drinking <= 0 && dist < 11 && this.canSee(t)) {
          this.shootCd = 2.5 + rand();
          const pe = t.effects || {};
          const kind = dist >= 8 && !(pe.slow > 0) ? 'slow' : !(pe.poison > 0) && t.hp == null && rand() < 0.5 ? 'poison' : 'harm';
          this.throwPotion(t, kind);
        }
      } else if (def.explodes) {
        if (dist < 2.8 && this.canSee(t)) {
          if (this.fuse === 0) sfx('fuse', this.pos);
          this.fuse += dt;
        } else if (dist > 5) this.fuse = Math.max(0, this.fuse - dt);
        else this.fuse = this.fuse > 0 ? this.fuse + dt : 0;
        if (this.fuse <= 0) { mx = dirX; mz = dirZ; speed = def.speed; }
        if (this.fuse >= 1.5) {
          this.removed = true;
          explode(this.pos.x, this.pos.y + 0.6, this.pos.z, 3);
          return;
        }
      } else if (def.slime) {
        this.hopCd -= dt;
        if (this.onGround && this.hopCd <= 0) {
          this.hopCd = 1 + rand() * 1.5;
          this.vel.y = 6 + this.size * 0.6;
          this.vel.x = dirX * (2.5 + this.size * 0.5); this.vel.z = dirZ * (2.5 + this.size * 0.5);
          sfx('slime', this.pos, { vol: 0.6 });
        }
        const reach = this.hw + (t.hw || 0.3) + 0.2;
        if (SLIME_DMG[this.size] && dist < reach && Math.abs(dy) < this.h && this.attackCd <= 0) { this.attackCd = 1; this.hit(t, SLIME_DMG[this.size]); }
      } else {
        mx = dirX; mz = dirZ; speed = def.speed * (this.baby ? 1.6 : 1);
        const reach = this.hw + (t.hw || 0.3) + 0.6;
        if (dist < reach && Math.abs(dy) < 1.8 && this.attackCd <= 0) {
          this.attackCd = def.golem ? 1.2 : 1;
          const dmg = def.golem ? (t.isPlayer ? 4 + Math.floor(rand() * 8) : 7 + Math.floor(rand() * 14)) : def.damage;
          this.hit(t, dmg);
          if (def.golem) { if (t.isPlayer) t.vel.y = 9; else t.vel.y = 10; sfx('golem', this.pos); }
          if (def.launch) t.vel.y = def.launch;
          if (def.witherHit && t.isPlayer) t.addEffect('wither', 6);
          if (def.zombieLike && this.model.parts.arm0) this.model.parts.arm0.rotation.x = this.model.parts.arm1.rotation.x = -2.1;
          if (this.type === 'vindicator') this.model.parts.arm1.rotation.x = -2.6;
        }
        if (this.type === 'spider' && this.onGround && dist > 2 && dist < 4 && rand() < dt * 2) {
          this.vel.y = 6.5; this.vel.x += dirX * 4; this.vel.z += dirZ * 4;
        }
      }
    } else {
      const ai = this.ai;
      ai.t -= dt;
      // villagers run from nearby zombies
      if (def.villager) {
        for (const m of G.entities.mobs) {
          if (!m.dead && (m.def.zombieLike || m.type === 'vindicator') && dist3(m, this) < 8) {
            ai.panic = 2; ai.dir = Math.atan2(this.pos.x - m.pos.x, this.pos.z - m.pos.z); ai.t = 1;
            break;
          }
        }
      }
      if (ai.panic > 0) {
        ai.panic -= dt;
        if (ai.t <= 0) { ai.dir = rand() * TAU; ai.t = 0.6 + rand() * 0.6; }
        mx = Math.sin(ai.dir); mz = Math.cos(ai.dir); speed = def.speed * 1.9;
      } else {
        if (ai.t <= 0) {
          ai.walk = rand() < (def.golem ? 0.3 : 0.45);
          ai.dir = rand() * TAU;
          // villagers and golems stay near their village
          if ((def.villager || def.golem) && Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > 14) {
            ai.walk = true; ai.dir = Math.atan2(this.home.x - this.pos.x, this.home.z - this.pos.z);
          }
          ai.t = 2 + rand() * 4;
        }
        if (def.slime) {
          this.hopCd -= dt;
          if (this.onGround && this.hopCd <= 0 && ai.walk) { this.hopCd = 1.5 + rand() * 2; this.vel.y = 5 + this.size * 0.5; this.vel.x = Math.sin(ai.dir) * 2; this.vel.z = Math.cos(ai.dir) * 2; }
        } else if (ai.walk) { mx = Math.sin(ai.dir); mz = Math.cos(ai.dir); speed = def.speed * 0.6; }
      }
      if (speed && this.onGround && !this.safeAhead(mx, mz)) { ai.dir += Math.PI; ai.t = 1; mx = -mx; mz = -mz; }
      if (speed) this.yaw = Math.atan2(mx, mz);
      this.fuse = Math.max(0, this.fuse - dt);
    }

    // Villagers restock their trades each morning
    if (def.villager && (G.day || 0) !== this.restockDay && G.time < 0.1) {
      this.restockDay = G.day || 0;
      this.trades.forEach((tr) => { tr.uses = 0; });
    }

    this.burnCheck(dt);

    // Physics
    const accel = this.onGround ? 10 : 2;
    const k = Math.min(1, accel * dt);
    if (!def.slime || !this.onGround) {
      this.vel.x += (mx * speed - this.vel.x) * (def.slime ? 0 : k);
      this.vel.z += (mz * speed - this.vel.z) * (def.slime ? 0 : k);
    } else { this.vel.x *= 0.5; this.vel.z *= 0.5; }
    const bx = Math.floor(this.pos.x), bz = Math.floor(this.pos.z);
    const mid = w.getBlock(bx, Math.floor(this.pos.y + this.h * 0.4), bz);
    this.inWater = mid === B.water;
    this.inLava = mid === B.lava || w.getBlock(bx, Math.floor(this.pos.y + 0.1), bz) === B.lava;
    if (this.inLava && !def.fireImmune) this.fire = Math.max(this.fire, 8);
    if (this.inLava) {
      this.vel.y = Math.min(this.vel.y + 18 * dt, 1.2);
      this.vel.x *= 0.7; this.vel.z *= 0.7;
    } else if (this.inWater && def.swims) {
      const want = t ? Math.sign(t.pos.y + 0.5 - this.pos.y) * 1.8 : 0;
      this.vel.y += (want - this.vel.y) * Math.min(1, dt * 3);
    } else if (this.inWater) {
      this.vel.y = Math.min(this.vel.y + 26 * dt, 2.2);
      this.vel.x *= 0.9; this.vel.z *= 0.9;
    } else {
      this.vel.y = Math.max(this.vel.y - 32 * dt, this.type === 'chicken' ? -3 : -60);
    }
    const res = moveBox(w, this, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    if (res.y) this.vel.y = 0;
    this.onGround = res.ground;
    let jump = false;
    if ((res.x || res.z) && speed) {
      if (def.climbs) this.vel.y = 4;
      else if (this.onGround || this.inWater) jump = true;
    }
    if (jump) this.vel.y = 8.6;
    if (res.x) this.vel.x = 0;
    if (res.z) this.vel.z = 0;

    // Keep out of the player
    if (p && !p.dead) {
      const ox = this.pos.x - p.pos.x, oz = this.pos.z - p.pos.z;
      const min = this.hw + p.hw;
      if (Math.abs(ox) < min && Math.abs(oz) < min && this.pos.y < p.pos.y + p.h && this.pos.y + this.h > p.pos.y) {
        const d = Math.hypot(ox, oz) || 1;
        moveBox(w, this, (ox / d) * dt * 2, 0, (oz / d) * dt * 2);
      }
    }
    if (this.pos.y < -20) { this.removed = true; return; }

    this.soundCd -= dt;
    if (this.soundCd <= 0) { this.soundCd = 6 + rand() * 12; if (pdist < 16) sfx(def.sound, this.pos, { vol: 0.8 }); }

    this.animate(dt, Math.hypot(this.vel.x, this.vel.z), pdist);
  }

  burnCheck(dt) {
    const def = this.def, w = G.world;
    if (def.fireImmune) { this.fire = 0; return; }
    if (def.burns && G.dim !== 'nether' && G.dim !== 'end' && G.daylight > 0.75 && !this.inWater) {
      const [sky] = w.getLight(Math.floor(this.pos.x), Math.floor(this.pos.y + this.h - 0.1), Math.floor(this.pos.z));
      if (sky >= 15) this.fire = 1;
    }
    if (this.fire > 0) {
      this.fire -= dt;
      if (rand() < dt * 12) flame(this.pos.x + (rand() - 0.5) * 0.6, this.pos.y + rand() * this.h, this.pos.z + (rand() - 0.5) * 0.6);
      this.burnTick = (this.burnTick || 0) + dt;
      if (this.burnTick > (this.inLava ? 0.5 : 1)) { this.burnTick = 0; this.invul = 0; this.hurt(this.inLava ? 4 : 1, this.pos.x, this.pos.z, false, 0); }
    }
  }

  rangedAttack(t, dist, dt) {
    this.shootCd -= dt;
    if (this.shootCd <= 0 && dist < 16 && this.canSee(t)) {
      const crossbow = this.def.ranged === 'crossbow';
      this.shootCd = crossbow ? 2.2 + rand() : 1.6 + rand() * 1.2;
      this.shootAt(t, crossbow ? 28 : 20, crossbow ? 4 : null);
    }
  }

  // Only a straight look into a shade's eyes makes it angry: the farther away it is, the more exactly you
  // have to aim (the same narrow cone the original game uses)
  staredAt(p) {
    if (!p || p.dead || p.mode !== 'survival') return false;
    const eyeY = this.pos.y + this.h * 0.87;
    const hx = this.pos.x - p.pos.x, hy = eyeY - p.eyeY, hz = this.pos.z - p.pos.z;
    const d = Math.hypot(hx, hy, hz);
    if (d > 64 || d < 0.5) return false;
    const look = p.lookDir();
    return (hx * look.x + hy * look.y + hz * look.z) / d > 1 - 0.025 / d && this.canSee(p);
  }

  shadeLogic(dt, p, pdist) {
    if (!this.angry && p && pdist < 64) {
      if (this.staredAt(p)) {
        this.angry = true;
        this.angryTime = 0;
        this.retarget = 0;
        sfx('shade', this.pos, { vol: 1.2 });
      }
    }
    if (this.angry) {
      this.angryTime += dt;
      if (this.angryTime > 40 || (p && p.dead)) this.angry = false;
      if (this.target && dist3(this, this.target) > 12 && rand() < dt * 0.6) this.teleportNear(this.target.pos, 4);
    }
    if (this.inWater) {
      this.waterTick = (this.waterTick || 0) + dt;
      if (this.waterTick > 1) { this.waterTick = 0; this.invul = 0; this.hurt(1, this.pos.x, this.pos.z, false, 0); this.teleportNear(this.pos, 16); }
    }
  }

  teleportNear(c, r) {
    const w = G.world;
    for (let k = 0; k < 16; k++) {
      const x = Math.floor(c.x + (rand() - 0.5) * 2 * r), z = Math.floor(c.z + (rand() - 0.5) * 2 * r);
      let y = Math.floor(c.y + 8);
      while (y > c.y - 8 && !w.isSolid(x, y - 1, z)) y--;
      if (!w.isSolid(x, y - 1, z) || w.getBlock(x, y - 1, z) === B.water) continue;
      if (boxBlocked(w, x + 0.5, y, z + 0.5, this.hw, this.h)) continue;
      for (let i = 0; i < 16; i++) G.entities.particles.spawn(this.pos.x + (rand() - 0.5), this.pos.y + rand() * this.h, this.pos.z + (rand() - 0.5), (rand() - 0.5) * 2, rand(), (rand() - 0.5) * 2, 0.55, 0.2, 0.75, 0.08, 0.7, -0.05);
      this.pos.x = x + 0.5; this.pos.y = y; this.pos.z = z + 0.5;
      this.vel.x = this.vel.y = this.vel.z = 0;
      sfx('teleport', this.pos);
      return true;
    }
    return false;
  }

  flyUpdate(dt, t) {
    const w = G.world;
    const f = this.flight || (this.flight = { mode: 'circle', t: 3 + rand() * 3, ang: rand() * TAU });
    const anchor = t ? t.pos : this.home;
    f.t -= dt;
    let tx, ty, tz, spd = this.def.speed;
    if (f.mode === 'circle') {
      f.ang += dt * 0.7;
      tx = anchor.x + Math.cos(f.ang) * 10; tz = anchor.z + Math.sin(f.ang) * 10; ty = anchor.y + 14;
      if (t && f.t <= 0) { f.mode = 'swoop'; f.t = 3; sfx('gloomwing', this.pos, { vol: 1.2 }); }
    } else if (f.mode === 'swoop' && t) {
      tx = t.pos.x; ty = t.pos.y + (t.h || 1.8) * 0.6; tz = t.pos.z; spd *= 1.6;
      if (dist3(this, t) < 1.4 + (t.hw || 0.3)) { this.hit(t, this.def.damage); f.mode = 'rise'; f.t = 1.5; }
      if (f.t <= 0) { f.mode = 'rise'; f.t = 1.5; }
    } else {
      tx = this.pos.x + Math.cos(f.ang) * 4; tz = this.pos.z + Math.sin(f.ang) * 4; ty = anchor.y + 16;
      if (f.t <= 0) { f.mode = 'circle'; f.t = 4 + rand() * 4; }
    }
    const ddx = tx - this.pos.x, ddy = ty - this.pos.y, ddz = tz - this.pos.z;
    const dl = Math.hypot(ddx, ddy, ddz) || 1;
    const kk = Math.min(1, dt * 2.5);
    this.vel.x += (ddx / dl * spd - this.vel.x) * kk;
    this.vel.y += (ddy / dl * spd - this.vel.y) * kk;
    this.vel.z += (ddz / dl * spd - this.vel.z) * kk;
    this.yaw = Math.atan2(this.vel.x, this.vel.z);
    const res = moveBox(w, this, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    if ((res.x || res.y || res.z) && f.mode === 'swoop') { f.mode = 'rise'; f.t = 1.2; }
    if (res.x) this.vel.x = 0;
    if (res.y) this.vel.y = 0;
    if (res.z) this.vel.z = 0;
    this.soundCd -= dt;
    if (this.soundCd <= 0) { this.soundCd = 5 + rand() * 8; sfx('gloomwing', this.pos, { vol: 0.7 }); }
  }

  safeAhead(mx, mz) {
    const w = G.world;
    const x = Math.floor(this.pos.x + mx * (this.hw + 0.6)), z = Math.floor(this.pos.z + mz * (this.hw + 0.6));
    const y = Math.floor(this.pos.y);
    if (w.getBlock(x, y, z) === B.water || w.getBlock(x, y - 1, z) === B.water) return false;
    if (w.getBlock(x, y, z) === B.lava || w.getBlock(x, y - 1, z) === B.lava) return this.type === 'strider';   // only striders walk on lava
    for (let d = 1; d <= 3; d++) if (w.isSolid(x, y - d, z)) return true;
    return false;
  }

  canSee(t) {
    const ex = this.pos.x, ey = this.pos.y + this.h * 0.85, ez = this.pos.z;
    const tx = t.pos.x - ex, ty = t.pos.y + (t.h || 1.8) * 0.8 - ey, tz = t.pos.z - ez;
    const d = Math.hypot(tx, ty, tz) || 1;
    return !raycast(G.world, ex, ey, ez, tx / d, ty / d, tz / d, d, (id) => BLOCKS[id].opaque);
  }

  shootAt(t, v, damage) {
    const sx = this.pos.x, sy = this.pos.y + this.h * 0.77, sz = this.pos.z;
    const tx = t.pos.x - sx, tz = t.pos.z - sz, ty = t.pos.y + (t.h || 1.8) * 0.6 - sy;
    const dh = Math.hypot(tx, tz) || 1, tt = dh / v;
    const err = 0.06 * dh;
    const vx = (tx + (rand() - 0.5) * err) / tt, vz = (tz + (rand() - 0.5) * err) / tt;
    const vy = ty / tt + 0.5 * 20 * tt;
    G.entities.spawnArrow(sx + tx / dh * 0.6, sy, sz + tz / dh * 0.6, vx, vy, vz, 'mob', { shooter: this, damage, effect: this.def.slowArrows ? 'slow' : null });
    sfx('bow', this.pos);
  }

  throwPotion(t, kind) {
    const sx = this.pos.x, sy = this.pos.y + 1.6, sz = this.pos.z;
    const tx = t.pos.x - sx, tz = t.pos.z - sz, ty = t.pos.y + 0.8 - sy;
    const dh = Math.hypot(tx, tz) || 1, v = 11, tt = dh / v;
    G.entities.spawnPotion(sx, sy, sz, tx / tt, ty / tt + 0.5 * 20 * tt, tz / tt, kind);
    sfx('bow', this.pos, { vol: 0.5 });
  }

  animate(dt, hs, dist) {
    const m = this.model, P = m.parts, def = this.def;
    this.phase += hs * dt * 5;
    const sw = Math.sin(this.phase) * Math.min(1, hs / 1.5) * 0.9;
    const root = m.root;
    root.position.set(this.pos.x, this.pos.y, this.pos.z);
    let d = this.yaw - (root.rotation.y || 0);
    d = Math.atan2(Math.sin(d), Math.cos(d));
    root.rotation.y += d * Math.min(1, dt * 8);
    const a = def.anim;
    if (def.animate) def.animate(this, dt, hs);
    if (a === 'quad') {
      if (P.leg0) { P.leg0.rotation.x = sw; P.leg3.rotation.x = sw; P.leg1.rotation.x = -sw; P.leg2.rotation.x = -sw; }
    } else if (a === 'biped') {
      P.leg0.rotation.x = sw; P.leg1.rotation.x = -sw;
      const flap = this.onGround ? 0 : Math.sin(this.age * 30) * 0.8 + 0.8;
      P.wing0.rotation.z = flap; P.wing1.rotation.z = -flap;
    } else if (a === 'human' || a === 'illager') {
      if (P.leg0) { P.leg0.rotation.x = this.mount ? -1.4 : sw; P.leg1.rotation.x = this.mount ? -1.4 : -sw; }
      if (def.zombieLike) {
        const tgt = -1.5 + Math.sin(this.age * 2) * 0.05;
        P.arm0.rotation.x += (tgt - P.arm0.rotation.x) * Math.min(1, dt * 4);
        P.arm1.rotation.x += (tgt - P.arm1.rotation.x) * Math.min(1, dt * 4);
      } else if (this.type === 'vindicator') {
        P.arm0.rotation.x = -sw;
        P.arm1.rotation.x += ((this.target ? -1.0 : sw) - P.arm1.rotation.x) * Math.min(1, dt * 5);
      } else {
        const aim = !!this.target;
        P.arm0.rotation.x = aim ? -1.4 : -sw;
        P.arm1.rotation.x = aim ? -1.5 : sw;
      }
    } else if (a === 'villager') {
      P.leg0.rotation.x = sw; P.leg1.rotation.x = -sw;
      if (P.arms) P.arms.rotation.x = -0.6 - (this.drinking > 0 ? 0.6 : 0);
    } else if (a === 'spider') {
      for (let i = 0; i < 4; i++) {
        const s = Math.sin(this.phase * 1.5 + i * 1.6) * Math.min(1, hs) * 0.35;
        P['legL' + i].rotation.y = [0.7, 0.25, -0.25, -0.7][i] + s;
        P['legR' + i].rotation.y = -[0.7, 0.25, -0.25, -0.7][i] + s;
      }
    } else if (a === 'slime') {
      const sq = this.onGround ? 1 : 1.15;
      const s = this.baseScale;
      m.inner.scale.set(s / Math.sqrt(sq), s * sq, s / Math.sqrt(sq));
    } else if (a === 'shade') {
      m.inner.position.y = 0.12 + Math.sin(this.age * 2) * 0.05;
      P.arm0.rotation.x = Math.sin(this.age * 1.5) * 0.15 + (this.angry ? -0.6 : 0);
      P.arm1.rotation.x = -Math.sin(this.age * 1.5) * 0.15 + (this.angry ? -0.6 : 0);
    } else if (a === 'wing') {
      const f = Math.sin(this.age * 9) * 0.5;
      P.wing0.rotation.z = f; P.wing1.rotation.z = -f;
      P.wing0b.rotation.z = f * 0.8; P.wing1b.rotation.z = -f * 0.8;
      root.rotation.x = Math.atan2(-this.vel.y, Math.hypot(this.vel.x, this.vel.z)) * 0.6;
    } else if (a === 'golem') {
      P.leg0.rotation.x = sw * 0.6; P.leg1.rotation.x = -sw * 0.6;
      P.arm0.rotation.x = -sw * 0.5; P.arm1.rotation.x = sw * 0.5 + (this.attackCd > 0.8 ? -1.6 : 0);
    }
    if (P.head && a !== 'spider' && a !== 'wing') {
      const p = G.player;
      const look = this.target || (p && dist < 8 ? p : null);
      if (look) {
        let hy = Math.atan2(look.pos.x - this.pos.x, look.pos.z - this.pos.z) - root.rotation.y;
        hy = Math.atan2(Math.sin(hy), Math.cos(hy));
        P.head.rotation.y = Math.max(-1, Math.min(1, hy));
      } else P.head.rotation.y *= 0.9;
    }
    if (def.explodes) {
      const s = 1 + this.fuse * 0.12;
      m.inner.scale.set(s / 16, s / 16, s / 16);
    }
    const L = lightAt(this.pos.x, this.pos.y + this.h * 0.6, this.pos.z);
    const flash = def.explodes && this.fuse > 0 && Math.floor(this.fuse * 8) % 2 === 0;
    if (flash) tintModel(root, 1.6, 0);
    else tintModel(root, this.fire > 0 ? Math.max(L, 0.8) : L, this.hurtTime > 0 ? 0.6 : 0);
  }

  dispose() {
    if (this.def.dispose) this.def.dispose(this);
    R.scene.remove(this.model.root);
    this.model.mat.dispose();
  }
}

// ---------------------------------------------------------------- dropped items
class ItemEntity {
  constructor(id, count, x, y, z, vx, vy, vz, dmg) {
    this.id = id; this.count = count; this.dmg = dmg || 0;
    this.pos = { x, y, z };
    this.vel = { x: vx, y: vy, z: vz };
    this.hw = 0.125; this.h = 0.25;
    this.age = 0;
    this.pickupDelay = 0.6;
    this.removed = false;
    this.spin = rand() * TAU;
    this.mesh = itemModel(id);
    this.cube = !!this.mesh.userData.cube;
    this.mesh.scale.setScalar(this.cube ? 0.26 : 0.4);
    R.scene.add(this.mesh);
  }
  update(dt) {
    const w = G.world;
    this.age += dt;
    if (this.proxy) {
      // a guest's copy of one of the host's items: it just follows the host
      const n = this.net;
      if (n) {
        if (Math.hypot(n.x - this.pos.x, n.y - this.pos.y, n.z - this.pos.z) > 4) { this.pos.x = n.x; this.pos.y = n.y; this.pos.z = n.z; }
        else { const k = Math.min(1, dt * 12); this.pos.x += (n.x - this.pos.x) * k; this.pos.y += (n.y - this.pos.y) * k; this.pos.z += (n.z - this.pos.z) * k; }
      }
    } else {
      const inWater = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.1), Math.floor(this.pos.z)) === B.water;
      if (inWater) this.vel.y = Math.min(this.vel.y + 20 * dt, 1.2);
      else this.vel.y -= 24 * dt;
      const res = moveBox(w, this, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
      if (res.y) this.vel.y = 0;
      const f = res.ground ? Math.max(0, 1 - 8 * dt) : Math.max(0, 1 - 0.5 * dt);
      this.vel.x *= f; this.vel.z *= f;
      if (res.x) this.vel.x = 0;
      if (res.z) this.vel.z = 0;
      // Pushed out if buried by a placed block
      if (boxBlocked(w, this.pos.x, this.pos.y, this.pos.z, this.hw, this.h)) this.pos.y += dt * 4;
    }

    const p = G.player;
    if (!p.dead && this.age > this.pickupDelay) {
      const dx = p.pos.x - this.pos.x, dy = p.pos.y + 0.8 - this.pos.y, dz = p.pos.z - this.pos.z;
      if (dx * dx + dz * dz < 2.2 && Math.abs(dy) < 1.8) {
        if (this.proxy) {
          // ask the host, so two players can't both take the same item
          if (!(this.askT > G.clock - 0.6)) {
            const room = p.inv.room(this.id);
            if (room > 0) { this.askT = G.clock; G.net.send({ k: 'pick', n: this.netId, r: room }); }
          }
        } else {
          const left = p.inv.add(this.id, this.count, this.dmg);
          if (left < this.count) {
            sfx('pop', null, { vol: 0.5 });
            G.ui && G.ui.invChanged();
          }
          this.count = left;
          if (!left) this.removed = true;
        }
      }
    }
    // Items stay on the ground until someone picks them up
    if (this.pos.y < -20) this.removed = true;
    this.spin += dt * 1.6;
    const bob = Math.sin(this.age * 2.5) * 0.06 + 0.1;
    this.mesh.position.set(this.pos.x, this.pos.y + bob + (this.cube ? 0.13 : 0.2), this.pos.z);
    if (this.cube) this.mesh.rotation.y = this.spin;
    else this.mesh.quaternion.copy(R.camera.quaternion);
    tintModel(this.mesh, lightAt(this.pos.x, this.pos.y + 0.3, this.pos.z));
  }
  dispose() {
    R.scene.remove(this.mesh);
    const m = this.mesh.material;
    (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
  }
}


// ---------------------------------------------------------------- arrows
const arrowGeo = new THREE.BoxGeometry(0.05, 0.05, 0.55);
const arrowHeadGeo = new THREE.BoxGeometry(0.09, 0.09, 0.1);
class Arrow {
  constructor(x, y, z, vx, vy, vz, owner, opts = {}) {
    this.pos = { x, y, z };
    this.vel = { x: vx, y: vy, z: vz };
    this.owner = owner;
    this.shooter = opts.shooter || null;
    this.damage = opts.damage || null;
    this.effect = opts.effect || null;
    this.stuck = false;
    this.age = 0;
    this.removed = false;
    const g = new THREE.Group();
    this.mat = new THREE.MeshBasicMaterial({ color: this.effect === 'slow' ? 0x6a7a8a : 0x8a6a3a });
    this.headMat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a });
    const shaft = new THREE.Mesh(arrowGeo, this.mat);
    const head = new THREE.Mesh(arrowHeadGeo, this.headMat);
    head.position.z = 0.3;
    g.add(shaft, head);
    this.mesh = g;
    R.scene.add(g);
    this.orient();
  }
  orient() {
    const v = this.vel;
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.lookAt(this.pos.x + v.x, this.pos.y + v.y, this.pos.z + v.z);
  }
  update(dt) {
    this.age += dt;
    const p = G.player;
    if (this.stuck) {
      if (this.owner === 'player' && !p.dead && this.age > 0.5) {
        const dx = p.pos.x - this.pos.x, dy = p.pos.y + 0.8 - this.pos.y, dz = p.pos.z - this.pos.z;
        if (dx * dx + dy * dy + dz * dz < 2.5 && p.inv.add(ID.arrow, 1) === 0) { sfx('pop', null, { vol: 0.4 }); G.ui.invChanged(); this.removed = true; }
      }
      if (this.age > 40) this.removed = true;
      return;
    }
    this.vel.y -= 20 * dt;
    const sx = this.vel.x * dt, sy = this.vel.y * dt, sz = this.vel.z * dt;
    const len = Math.hypot(sx, sy, sz);
    if (len < 1e-6) return;
    const dx = sx / len, dy = sy / len, dz = sz / len;
    const speed = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    const dmg = this.damage || Math.round(speed * 0.2) + 1;
    for (const m of G.entities.mobs) {
      if (this.owner === 'fx') break;
      if (m.dead || m === this.shooter || m === (this.shooter && this.shooter.mount)) continue;
      const t = rayBox(this.pos.x, this.pos.y, this.pos.z, dx, dy, dz, m.pos.x - m.hw, m.pos.y, m.pos.z - m.hw, m.pos.x + m.hw, m.pos.y + m.h, m.pos.z + m.hw);
      if (t >= 0 && t <= len) {
        m.hurt(this.owner === 'player' ? dmg : Math.min(dmg, 5), this.pos.x, this.pos.z, this.owner === 'player', 1, this.shooter);
        sfx('arrowhit', m.pos);
        this.removed = true;
        return;
      }
    }
    if (this.owner === 'player' && G.net) {
      for (const a of G.net.players.values()) {
        if (!a.ready || a.dead) continue;
        const t = rayBox(this.pos.x, this.pos.y, this.pos.z, dx, dy, dz, a.pos.x - a.hw, a.pos.y, a.pos.z - a.hw, a.pos.x + a.hw, a.pos.y + a.h, a.pos.z + a.hw);
        if (t >= 0 && t <= len) {
          G.net.pvp(a, dmg, this.pos.x, this.pos.z);
          sfx('arrowhit', a.pos);
          this.removed = true;
          return;
        }
      }
    }
    if (this.owner !== 'player') {
      for (const q of this.owner === 'fx' ? [p] : players()) {
        if (q.dead) continue;
        const t = rayBox(this.pos.x, this.pos.y, this.pos.z, dx, dy, dz, q.pos.x - q.hw, q.pos.y, q.pos.z - q.hw, q.pos.x + q.hw, q.pos.y + q.h, q.pos.z + q.hw);
        if (t >= 0 && t <= len) {
          if (this.owner !== 'fx') {
            q.hurt(this.damage || Math.min(dmg, 5), this.pos.x, this.pos.z, 'arrow');
            if (this.effect === 'slow') q.addEffect('slow', 10);
          }
          this.removed = true;
          return;
        }
      }
    }
    const hit = raycast(G.world, this.pos.x, this.pos.y, this.pos.z, dx, dy, dz, len, (id) => BLOCKS[id].solid);
    if (hit) {
      this.pos.x += dx * hit.dist; this.pos.y += dy * hit.dist; this.pos.z += dz * hit.dist;
      this.stuck = true; this.age = 0;
      sfx('arrowhit', this.pos);
    } else {
      this.pos.x += sx; this.pos.y += sy; this.pos.z += sz;
    }
    this.orient();
    if (this.age > 20 || this.pos.y < -20) this.removed = true;
  }
  dispose() { R.scene.remove(this.mesh); this.mat.dispose(); this.headMat.dispose(); }
}

// ---------------------------------------------------------------- thrown potions and pearls
const POTION_COLORS = { harm: [0.45, 0.05, 0.1], poison: [0.3, 0.6, 0.15], slow: [0.35, 0.45, 0.6] };
class Thrown {
  constructor(x, y, z, vx, vy, vz, kind, itemId, fx = false) {
    this.pos = { x, y, z };
    this.vel = { x: vx, y: vy, z: vz };
    this.kind = kind;
    this.fx = fx;
    this.age = 0;
    this.removed = false;
    this.mesh = itemModel(itemId);
    this.mesh.scale.setScalar(0.35);
    R.scene.add(this.mesh);
  }
  update(dt) {
    this.age += dt;
    this.vel.y -= 20 * dt;
    const sx = this.vel.x * dt, sy = this.vel.y * dt, sz = this.vel.z * dt;
    const len = Math.hypot(sx, sy, sz) || 1e-6;
    const dx = sx / len, dy = sy / len, dz = sz / len;
    const p = G.player;
    let impact = null;
    if (this.kind !== 'pearl' && !p.dead) {
      const t = rayBox(this.pos.x, this.pos.y, this.pos.z, dx, dy, dz, p.pos.x - p.hw, p.pos.y, p.pos.z - p.hw, p.pos.x + p.hw, p.pos.y + p.h, p.pos.z + p.hw);
      if (t >= 0 && t <= len) impact = t;
    }
    if (impact === null) {
      const hit = raycast(G.world, this.pos.x, this.pos.y, this.pos.z, dx, dy, dz, len, (id) => BLOCKS[id].solid);
      if (hit) impact = hit.dist;
    }
    if (impact !== null) {
      this.pos.x += dx * impact; this.pos.y += dy * impact; this.pos.z += dz * impact;
      this.land();
      this.removed = true;
      return;
    }
    this.pos.x += sx; this.pos.y += sy; this.pos.z += sz;
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.quaternion.copy(R.camera.quaternion);
    if (this.age > 10 || this.pos.y < -20) this.removed = true;
  }
  land() {
    const P = G.entities.particles, p = G.player;
    if (this.kind === 'pearl') {
      for (let i = 0; i < 20; i++) P.spawn(p.pos.x + (rand() - 0.5), p.pos.y + rand() * 1.8, p.pos.z + (rand() - 0.5), (rand() - 0.5) * 2, rand(), (rand() - 0.5) * 2, 0.3, 0.8, 0.75, 0.08, 0.7, -0.05);
      // now and then a shademite crawls out where a pearl lands
      if (!(G.net && G.net.role === 'client') && rand() < 0.05) G.entities.spawnMob('shademite', this.pos.x, this.pos.y + 0.1, this.pos.z);
      if (!p.dead) {
        p.pos.x = this.pos.x; p.pos.y = this.pos.y + 0.05; p.pos.z = this.pos.z;
        while (boxBlocked(G.world, p.pos.x, p.pos.y, p.pos.z, p.hw, p.h) && p.pos.y < 126) p.pos.y += 0.5;
        p.vel.x = p.vel.y = p.vel.z = 0;
        p.fallDist = 0;
        p.hurt(5, null, null, 'pearl');
      }
      sfx('teleport', this.pos);
      return;
    }
    const c = POTION_COLORS[this.kind];
    for (let i = 0; i < 30; i++) P.spawn(this.pos.x, this.pos.y + 0.2, this.pos.z, (rand() - 0.5) * 5, rand() * 3, (rand() - 0.5) * 5, c[0], c[1], c[2], 0.1, 0.7, 0.4);
    sfx('splash_potion', this.pos);
    if (this.fx) return;
    for (const q of players()) {
      if (q.dead) continue;
      const d = Math.hypot(q.pos.x - this.pos.x, q.pos.y + 0.9 - this.pos.y, q.pos.z - this.pos.z);
      if (d > 3.5) continue;
      if (this.kind === 'harm') q.hurt(6, null, null, 'magic');
      else if (this.kind === 'poison') q.addEffect('poison', 6);
      else q.addEffect('slow', 8);
    }
  }
  dispose() {
    R.scene.remove(this.mesh);
    const m = this.mesh.material;
    (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
  }
}

// ---------------------------------------------------------------- primed TNT
class PrimedTNT {
  constructor(x, y, z, fuse) {
    this.pos = { x, y, z };
    this.vel = { x: (rand() - 0.5) * 1.5, y: 3, z: (rand() - 0.5) * 1.5 };
    this.hw = 0.49; this.h = 0.98;
    this.fuse = fuse;
    this.removed = false;
    this.mesh = itemModel(B.tnt);
    R.scene.add(this.mesh);
  }
  update(dt) {
    this.fuse -= dt;
    this.vel.y -= 24 * dt;
    const res = moveBox(G.world, this, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    if (res.y) this.vel.y = 0;
    if (res.ground) { this.vel.x *= 0.8; this.vel.z *= 0.8; }
    const s = 1 + Math.max(0, 0.4 - this.fuse) * 0.5;
    this.mesh.scale.setScalar(s);
    this.mesh.position.set(this.pos.x, this.pos.y + 0.5, this.pos.z);
    const flash = Math.floor(this.fuse * 5) % 2 === 0;
    tintModel(this.mesh, flash ? 1.8 : lightAt(this.pos.x, this.pos.y + 0.5, this.pos.z));
    if (rand() < dt * 20) smoke(this.pos.x, this.pos.y + 1.1, this.pos.z, 1, 0.2);
    if (this.fuse <= 0) {
      this.removed = true;
      explode(this.pos.x, this.pos.y + 0.5, this.pos.z, 4);
    }
  }
  dispose() {
    R.scene.remove(this.mesh);
    this.mesh.material.forEach((m) => m.dispose());
  }
}

// ---------------------------------------------------------------- explosions
export function explosionFx(x, y, z, power) {
  const E = G.entities;
  sfx('explode', { x, y, z }, { vol: 1.3 });
  for (let i = 0; i < 40; i++) smoke(x, y, z, 1, power * 0.6);
  for (let i = 0; i < 16; i++) {
    E.particles.spawn(x + (rand() - 0.5) * power, y + (rand() - 0.5) * power, z + (rand() - 0.5) * power, 0, 0.5, 0, 1, 1, 1, 0.9 + rand() * 0.8, 0.25 + rand() * 0.2, 0);
  }
  const pd = Math.hypot(G.player.pos.x - x, G.player.pos.y - y, G.player.pos.z - z);
  G.shake = Math.max(G.shake || 0, Math.max(0, 1 - pd / 24) * 0.8);
}

// Hurts and throws back mobs and players caught in a blast (skipping one remote player, if given)
export function explosionDamage(x, y, z, r, skip = null, mobs = true) {
  const hurtOne = (e, isPlayer) => {
    const ex = e.pos.x - x, ey = e.pos.y + e.h / 2 - y, ez = e.pos.z - z;
    const d = Math.hypot(ex, ey, ez);
    if (d > r * 2) return;
    const impact = 1 - d / (r * 2);
    const dmg = Math.floor(((impact * impact + impact) / 2) * 7 * r + 1);
    const n = d || 1;
    if (isPlayer) e.hurt(dmg, x, z, 'explosion');
    else { e.invul = 0; e.hurt(dmg, x, z, false); }
    e.vel.x += (ex / n) * impact * 14;
    e.vel.y += 4 + impact * 6;
    e.vel.z += (ez / n) * impact * 14;
  };
  if (mobs) for (const m of G.entities.mobs) if (!m.dead && !m.removed) hurtOne(m, false);
  for (const q of players()) if (!q.dead && q !== skip) hurtOne(q, true);
}

export function explode(x, y, z, power) {
  const w = G.world, E = G.entities;
  explosionFx(x, y, z, power);
  if (G.net) G.net.explosion(x, y, z, power);
  const r = power;
  const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
  const R2 = Math.ceil(r);
  const removed = [];
  for (let dx = -R2; dx <= R2; dx++) for (let dy = -R2; dy <= R2; dy++) for (let dz = -R2; dz <= R2; dz++) {
    const d = Math.hypot(dx, dy, dz);
    if (d > r * (0.75 + rand() * 0.35)) continue;
    const X = bx + dx, Y = by + dy, Z = bz + dz;
    const id = w.getBlock(X, Y, Z);
    if (!id || id === B.water || id === B.bedrock || id === B.obsidian) continue;
    removed.push([X, Y, Z, id]);
  }
  for (const [X, Y, Z, id] of removed) {
    if (w.getBlock(X, Y, Z) !== id) continue;
    if (id === B.tnt) { G.game.removeBlock(X, Y, Z, false); E.tnts.push(new PrimedTNT(X + 0.5, Y, Z + 0.5, 0.4 + rand() * 1.0)); continue; }
    G.game.removeBlock(X, Y, Z, rand() < 0.3);
  }
  explosionDamage(x, y, z, r);
}

// ---------------------------------------------------------------- manager
export class Entities {
  constructor() {
    this.mobs = [];
    this.items = [];
    this.arrows = [];
    this.tnts = [];
    this.thrown = [];
    this.projectiles = [];   // fireballs, clamper bullets, thrown eyes (dimmobs.js)
    this.particles = new Particles();
    this.spawnTimer = 0;
  }

  spawnMob(type, x, y, z, opts = {}) {
    if (typeof opts !== 'object') opts = { variant: opts };
    const m = new Mob(type, x, y, z, opts);
    // lift out of any blocks it was placed inside
    let k = 0;
    while (k++ < 8 && boxBlocked(G.world, m.pos.x, m.pos.y, m.pos.z, m.hw, m.h)) m.pos.y += 1;
    this.mobs.push(m);
    return m;
  }

  // In multiplayer every item lives on the host, so everyone sees the same items; a guest asks the host to drop one
  dropItem(id, count, x, y, z, vx, vy, vz, dmg) {
    if (!id || count <= 0) return { pickupDelay: 0.6 };
    vx = vx ?? (rand() - 0.5) * 3; vy = vy ?? 3 + rand() * 2; vz = vz ?? (rand() - 0.5) * 3;
    if (isClient()) return G.net.requestDrop(id, count, x, y, z, vx, vy, vz, dmg || 0);
    const it = new ItemEntity(id, count, x, y, z, vx, vy, vz, dmg);
    this.items.push(it);
    return it;
  }
  dropShared(id, count, x, y, z, vx, vy, vz, dmg) { return this.dropItem(id, count, x, y, z, vx, vy, vz, dmg); }

  // A guest's copy of one of the host's items: [id, x, y, z, count, itemId, dmg, pickup delay left]
  spawnItemProxy(a) {
    const it = new ItemEntity(a[5], a[4], a[1], a[2], a[3], 0, 0, 0, a[6]);
    it.proxy = true;
    it.netId = a[0];
    it.net = { x: a[1], y: a[2], z: a[3] };
    it.pickupDelay = a[7] || 0;
    this.items.push(it);
    return it;
  }

  // ------------------------------------------------------------ keeping animals, villagers and items
  // Nothing is lost when an area unloads: its animals, villagers and dropped items are kept with the
  // chunk and come back when it loads again (and are saved with the world)
  keepable(e) {
    if (e.removed || e.proxy) return false;
    if (e instanceof ItemEntity) return true;
    return !e.dead && (!e.def.hostile || e.persistent) && e.type !== 'gloomwing';
  }

  entityData(e) {
    const r = (v) => Math.round(v * 100) / 100;
    if (e instanceof ItemEntity) return { i: e.id, c: e.count, d: e.dmg || 0, x: r(e.pos.x), y: r(e.pos.y), z: r(e.pos.z) };
    const d = { t: e.type, x: r(e.pos.x), y: r(e.pos.y), z: r(e.pos.z), yaw: r(e.yaw), hp: e.hp };
    if (e.type === 'sheep') d.v = e.variant;
    if (e.prof) d.p = e.prof;
    if (e.def.slime) d.s = e.size;
    if (e.baby) d.b = 1;
    if (e.key) d.k = e.key;
    if (e.home) d.h = { x: r(e.home.x), y: r(e.home.y), z: r(e.home.z) };
    if (e.persistent) d.P = 1;
    if (e.trades) d.u = e.trades.map((t) => t.uses);
    return d;
  }

  stash(e) {
    const w = G.world;
    if (this.keepable(e)) {
      const k = chunkKey(e.pos.x, e.pos.z);
      let st = w.stored.get(k);
      if (!st) { st = { m: [], i: [] }; w.stored.set(k, st); }
      (e instanceof ItemEntity ? st.i : st.m).push(this.entityData(e));
    }
    e.removed = true;
  }

  // Called just before a chunk unloads
  storeChunk(c) {
    const inside = (e) => (Math.floor(e.pos.x) >> 4) === c.cx && (Math.floor(e.pos.z) >> 4) === c.cz;
    for (const m of this.mobs) if (!m.removed && inside(m)) this.stash(m);
    for (const it of this.items) if (!it.removed && inside(it)) this.stash(it);
  }

  restoreChunk(k) {
    const w = G.world;
    const st = w.stored.get(k);
    if (!st) return;
    w.stored.delete(k);
    for (const d of st.m || []) {
      if (d.k && (w.deadMobs.has(d.k) || this.mobs.some((m) => m.key === d.k))) continue;
      const m = this.spawnMob(d.t, d.x, d.y, d.z, { variant: d.v, prof: d.p, size: d.s, baby: !!d.b, key: d.k, home: d.h, persistent: !!d.P });
      if (d.hp) m.hp = Math.min(m.maxHp, d.hp);
      m.yaw = d.yaw || 0;
      if (d.u && m.trades) d.u.forEach((u, i) => { if (m.trades[i]) m.trades[i].uses = u; });
    }
    for (const d of st.i || []) {
      const it = new ItemEntity(d.i, d.c, d.x, d.y, d.z, 0, 0, 0, d.d);
      it.age = 5;
      this.items.push(it);
    }
  }

  // Everything to save: what is stored plus what is out and about right now
  savedEntities() {
    const out = {};
    for (const [k, st] of G.world.stored) out[k] = { m: [...st.m], i: [...st.i] };
    for (const e of [...this.mobs, ...this.items]) {
      if (!this.keepable(e)) continue;
      const k = chunkKey(e.pos.x, e.pos.z);
      if (!out[k]) out[k] = { m: [], i: [] };
      (e instanceof ItemEntity ? out[k].i : out[k].m).push(this.entityData(e));
    }
    return out;
  }

  spawnArrow(x, y, z, vx, vy, vz, owner, opts) {
    this.arrows.push(new Arrow(x, y, z, vx, vy, vz, owner, opts));
    if (owner === 'mob' && G.net) G.net.projectile('ar', [x, y, z, vx, vy, vz, opts && opts.effect === 'slow' ? 1 : 0]);
  }
  spawnPotion(x, y, z, vx, vy, vz, kind, fx = false) {
    this.thrown.push(new Thrown(x, y, z, vx, vy, vz, kind, ID.potion, fx));
    if (!fx && G.net) G.net.projectile('th', [x, y, z, vx, vy, vz, kind]);
  }

  // A guest's copy of one of the host's mobs
  spawnProxy(a) {
    const o = a[9];
    const m = new Mob(o.t, a[1], a[2], a[3], { variant: o.v, prof: o.p, size: o.s, baby: !!o.b });
    m.proxy = true;
    m.netId = a[0];
    if (o.m) m.maxHp = o.m;
    if (o.u && m.trades) o.u.forEach((u, i) => { if (m.trades[i]) m.trades[i].uses = u; });
    m.applyNet(a);
    m.pos.x = a[1]; m.pos.y = a[2]; m.pos.z = a[3];
    m.model.root.rotation.y = m.yaw;
    this.mobs.push(m);
    return m;
  }
  throwPearl(x, y, z, vx, vy, vz) { this.thrown.push(new Thrown(x, y, z, vx, vy, vz, 'pearl', ID.shade_pearl)); }
  primeTNT(x, y, z) { this.tnts.push(new PrimedTNT(x + 0.5, y, z + 0.5, 4)); sfx('fuse', { x, y, z }); }

  pickMob(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = null, bt = maxDist;
    for (const m of this.mobs) {
      if (m.dead) continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, m.pos.x - m.hw, m.pos.y, m.pos.z - m.hw, m.pos.x + m.hw, m.pos.y + m.h, m.pos.z + m.hw);
      if (t >= 0 && t < bt) { bt = t; best = m; }
    }
    return best ? { mob: best, t: bt } : null;
  }

  hostilesNear(x, y, z, r) {
    return this.mobs.some((m) => !m.dead && m.def.hostile && !(m.def.neutral && !m.angry) && Math.hypot(m.pos.x - x, m.pos.y - y, m.pos.z - z) < r);
  }

  update(dt) {
    const sweep = (arr) => {
      let n = 0;
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        if (!e.removed) e.update(dt);
        if (e.removed) e.dispose(); else arr[n++] = e;
      }
      arr.length = n;
    };
    sweep(this.mobs);
    sweep(this.items);
    sweep(this.arrows);
    sweep(this.tnts);
    sweep(this.thrown);
    sweep(this.projectiles);
    this.particles.update(dt);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1;
      if (!isClient()) { this.spawnHostiles(); this.despawn(); if (this.tickSpawners) this.tickSpawners(); }
    }
  }

  // Structure inhabitants and passive animals appear when a chunk first loads
  onChunkReady(chunk) {
    if (!chunk.fresh) return;
    chunk.fresh = false;
    if (isClient()) return;   // guests get their mobs from the host
    const w = G.world;
    const k = (chunk.cx + 32768) * 65536 + (chunk.cz + 32768);
    this.restoreChunk(k);
    const pending = w.pendingSpawns.get(k);
    if (pending) {
      w.pendingSpawns.delete(k);
      for (const s of pending) {
        if (s.key && (w.deadMobs.has(s.key) || this.mobs.some((m) => m.key === s.key))) continue;
        this.spawnMob(s.type, s.x, s.y, s.z, { prof: s.prof, key: s.key, home: { x: s.x, y: s.y, z: s.z }, persistent: true });
      }
    }
    if (w.dim === 'end' && this.onEndChunk) this.onEndChunk(chunk);
    // animals are placed once per chunk, ever; after that they are kept like everything else
    if (w.dim !== 'overworld' || w.spawned.has(k)) return;
    w.spawned.add(k);
    if (rand() > 0.14) return;
    if (this.mobs.filter((m) => PASSIVE.includes(m.type)).length >= 28) return;
    const type = PASSIVE[(rand() * PASSIVE.length) | 0];
    const baseX = (rand() * 12 | 0) + 2, baseZ = (rand() * 12 | 0) + 2;
    const n = 2 + (rand() * 3 | 0);
    const variant = type === 'sheep' ? sheepVariant() : 0;
    for (let i = 0; i < n; i++) {
      const lx = Math.min(15, Math.max(0, baseX + ((rand() * 5) | 0) - 2)), lz = Math.min(15, Math.max(0, baseZ + ((rand() * 5) | 0) - 2));
      let y = Math.min(CH - 2, chunk.maxY);
      while (y > 0 && (!chunk.blocks[(y << 8) | (lz << 4) | lx] || BLOCKS[chunk.blocks[(y << 8) | (lz << 4) | lx]].replaceable)) y--;
      const top = chunk.blocks[(y << 8) | (lz << 4) | lx];
      if (top !== B.grass && top !== B.snowy_grass) continue;
      const x = chunk.cx * 16 + lx + 0.5, z = chunk.cz * 16 + lz + 0.5;
      this.spawnMob(type, x, y + 1, z, { variant });
    }
  }

  // Night mobs: picked by biome, spawned in the dark 24-44 blocks from the player
  spawnHostiles() {
    const w = G.world;
    if (w.dim !== 'overworld') { if (this.spawnDim) this.spawnDim(); return; }
    const alive = players().filter((q) => !q.dead);
    if (!alive.length) return;
    const p = alive[(rand() * alive.length) | 0];
    const hostiles = this.mobs.reduce((n, m) => n + (m.def.hostile && !m.persistent ? 1 : 0), 0);
    if (hostiles >= 16 + 8 * (alive.length - 1)) return;
    const night = G.time > 0.52 && G.time < 0.98;
    // Gloomwings hunt players who have not slept for three nights
    if (night && (G.nightsNoSleep || 0) >= 3 && rand() < 0.08 && this.mobs.filter((m) => m.type === 'gloomwing').length < 3) {
      const a = rand() * TAU;
      const gx = p.pos.x + Math.cos(a) * 10, gz = p.pos.z + Math.sin(a) * 10, gy = Math.min(CH - 4, p.pos.y + 20 + rand() * 10);
      if (!boxBlocked(w, gx, gy, gz, 0.45, 0.5)) { this.spawnMob('gloomwing', gx, gy, gz, { home: { x: p.pos.x, y: p.pos.y, z: p.pos.z } }); return; }
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const ang = rand() * TAU, dist = 24 + rand() * 20;
      const x = Math.floor(p.pos.x + Math.cos(ang) * dist), z = Math.floor(p.pos.z + Math.sin(ang) * dist);
      const c = w.getChunk(x >> 4, z >> 4);
      if (!c || !c.light) continue;
      const biome = c.biomes[((z & 15) << 4) | (x & 15)];
      // Drowned rise out of deep water now and then: at night, or in the day only where it is very deep
      if (rand() < 0.06) {
        let y = SEA;
        if (w.getBlock(x, y, z) !== B.water) continue;
        while (y > 2 && w.getBlock(x, y - 1, z) === B.water) y--;
        const depth = SEA - y;
        if (depth < 5 || (!night && depth < 12)) continue;
        if (this.mobs.filter((m) => m.type === 'drowned' && !m.dead && Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < 64).length >= 3) continue;
        this.spawnMob('drowned', x + 0.5, y, z + 0.5);
        return;
      }
      let y;
      if (rand() < 0.5) {
        y = Math.min(CH - 3, c.maxY + 1);
        while (y > 1 && !w.isSolid(x, y - 1, z)) y--;
      } else {
        y = 4 + Math.floor(rand() * Math.max(1, Math.min(CH - 8, p.pos.y + 20) - 4));
        let k = 0;
        while (k < 16 && y > 1 && !w.isSolid(x, y - 1, z)) { y--; k++; }
      }
      if (!w.isSolid(x, y - 1, z) || w.getBlock(x, y, z) !== 0 || w.getBlock(x, y + 1, z) !== 0) continue;
      const below = w.getBlock(x, y - 1, z);
      if (!BLOCKS[below].opaque) continue;
      const [sky, blk] = w.getLight(x, y, z);
      if (Math.max(Math.round(sky * G.daylight), blk) > 7) continue;
      const r = rand() * 100;
      let type, opts = {};
      if (biome === BIOME.SWAMP && r < 20) { type = 'slime'; }
      else if (r < 28) {
        type = biome === BIOME.DESERT && rand() < 0.8 ? 'husk' : rand() < 0.06 ? 'zombie_villager' : 'zombie';
        if (type !== 'zombie_villager' && rand() < 0.05) opts.baby = true;
      } else if (r < 54) type = biome === BIOME.SNOWY && rand() < 0.8 ? 'stray' : 'skeleton';
      else if (r < 76) type = 'spider';
      else if (r < 94) type = 'boomer';
      else if (r < 98) type = 'shade';
      else type = 'witch';
      const def = MOB_TYPES[type];
      if (boxBlocked(w, x + 0.5, y, z + 0.5, def.w / 2, def.h)) continue;
      const m = this.spawnMob(type, x + 0.5, y, z + 0.5, opts);
      // Now and then a skeleton rides the spider
      if (type === 'spider' && rand() < 0.02) {
        const rider = this.spawnMob('skeleton', m.pos.x, m.pos.y + m.h, m.pos.z);
        rider.mount = m; m.rider = rider;
      }
      return;
    }
  }

  despawn() {
    const w = G.world, ps = players();
    for (const m of this.mobs) {
      if (m.removed) continue;
      let d = Infinity;
      for (const q of ps) d = Math.min(d, Math.hypot(m.pos.x - q.pos.x, m.pos.z - q.pos.z));
      // wandered out of the loaded world: kept for when that area loads again
      if (!w.getChunk(Math.floor(m.pos.x) >> 4, Math.floor(m.pos.z) >> 4)) { this.stash(m); continue; }
      if (m.persistent) continue;
      if (m.def.hostile && (d > 80 || (d > 40 && rand() < 0.02))) m.removed = true;
      if (m.type === 'gloomwing' && G.daylight > 0.8 && rand() < 0.05) m.removed = true;
    }
    for (const it of this.items) if (!it.removed && !it.proxy && !w.getChunk(Math.floor(it.pos.x) >> 4, Math.floor(it.pos.z) >> 4)) this.stash(it);
  }

  // Remember villager trade usage so it survives unloading and saving
  saveVillagers() {
    const w = G.world;
    for (const m of this.mobs) if (m.def.villager && m.key && m.trades) w.villagerTrades.set(m.key, m.trades.map((t) => t.uses));
  }

  clear() {
    for (const arr of [this.mobs, this.items, this.arrows, this.tnts, this.thrown, this.projectiles]) { arr.forEach((e) => e.dispose()); arr.length = 0; }
    this.particles.clear();
  }
}

export { blockParticles as spawnBlockParticles, smoke, flame, ItemEntity, Mob, MODELS, humanoid, rect, px, eyes, quadLegs, players, dist3, SLIME_HP, SLIME_DMG, Thrown };
