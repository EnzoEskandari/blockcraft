// Mobs of the Nether and the End (and the Void Dragon), their fireballs and bullets, and where they spawn;
// and the Blight, the three-headed boss woken with soul sand and Charred Skulls.
// Names and looks are this game's own: Wailer, Cinder, Snoutling, Tusker, Clamper, Void Dragon, the Blight...
import * as THREE from 'three';
import { G } from './game.js';
import { R, itemModel, tintModel } from './render.js';
import { B, BLOCKS, ID } from './blocks.js';
import { moveBox, raycast, rayBox, boxBlocked } from './physics.js';
import { sfx } from './audio.js';
import {
  holdInHand,
  MOB_TYPES, MODELS, humanoid, rect, px, eyes, quadLegs, players, dist3, lightAt, smoke, flame, explode, Entities,
} from './entities.js';
import { CH } from './constants.js';
import { endPillars, openExitPortal, exitPortalY, netherBiome, NB, NETHER_LAVA, nearestStronghold } from './dims.js';
import { structuresNear } from './structures.js';

const rand = Math.random;
const TAU = Math.PI * 2;
const drop = (key, min, max, chance = 1) => ({ key, min, max, chance });
const isHost = () => !(G.net && G.net.role === 'client');
const tone = (c, f) => [c[0] * f, c[1] * f, c[2] * f];

// ---------------------------------------------------------------- models (measured in 1/16 block)
const PIG = [232, 150, 140];
const snoutFace = (dark) => ({
  front: (g, x, y) => { px(g, x + 1, y + 3, [240, 240, 240]); px(g, x + 2, y + 3, [30, 30, 30]); px(g, x + 5, y + 3, [30, 30, 30]); px(g, x + 6, y + 3, [240, 240, 240]); rect(g, x + 2, y + 6, 4, 1, dark); },
});
function snoutModel(skin, shirt, pants) {
  const parts = humanoid([4, 12, 4], skin, shirt, pants, snoutFace(tone(skin, 0.6)));
  parts.push({ name: 'snout', parent: 'head', size: [4, 3, 2], pos: [0, 3, 5], color: tone(skin, 0.88), paint: { front: (g, x, y) => { px(g, x, y + 1, [90, 40, 40]); px(g, x + 3, y + 1, [90, 40, 40]); } } });
  parts.push({ name: 'ear0', parent: 'head', size: [1, 4, 3], pos: [-4.5, 5, 0], rot: [0, 0, 0.5], color: skin });
  parts.push({ name: 'ear1', parent: 'head', size: [1, 4, 3], pos: [4.5, 5, 0], rot: [0, 0, -0.5], color: skin });
  return parts;
}

function tuskerModel(rot) {
  const skin = rot ? [118, 140, 100] : [156, 96, 76], dark = rot ? [86, 108, 70] : [118, 68, 52];
  return [
    { name: 'body', size: [14, 12, 22], pos: [0, 17, 0], color: skin, spots: dark },
    { name: 'mane', size: [4, 5, 16], pos: [0, 25, -2], color: rot ? [200, 204, 180] : [214, 184, 142] },
    { name: 'head', size: [12, 10, 12], pos: [0, 16, 12], off: [0, 0, 5], rot: [0.45, 0, 0], color: skin, paint: { front: eyes(true) } },
    { name: 'tusk0', parent: 'head', size: [2, 6, 2], pos: [-5, 3, 10], color: [240, 236, 220] },
    { name: 'tusk1', parent: 'head', size: [2, 6, 2], pos: [5, 3, 10], color: [240, 236, 220] },
    ...quadLegs([5, 11, 5], [-4, 4], 11, [-7, 7], dark),
  ];
}

Object.assign(MODELS, {
  wailer: () => {
    const parts = [{ name: 'body', size: [16, 16, 16], pos: [0, 8, 0], color: [238, 238, 240], noise: 0.04, paint: { front: (g, x, y) => {
      rect(g, x + 3, y + 5, 3, 1, [60, 60, 66]); rect(g, x + 10, y + 5, 3, 1, [60, 60, 66]);
      rect(g, x + 4, y + 6, 1, 4, [170, 170, 184]); rect(g, x + 11, y + 6, 1, 4, [170, 170, 184]);
      rect(g, x + 6, y + 11, 4, 2, [44, 44, 50]);
    } } }];
    [[-5, -5], [0, -5], [5, -5], [-5, 0], [0, 0], [5, 0], [-5, 5], [0, 5], [5, 5]].forEach(([x, z], i) => {
      const h = 8 + ((i * 5) % 7);
      parts.push({ name: 't' + i, size: [2, h, 2], pos: [x, 0, z], off: [0, -h / 2, 0], color: [208, 208, 214] });
    });
    return parts;
  },
  cinder: () => {
    const Y = [252, 204, 64], O = [232, 128, 28];
    const parts = [
      { name: 'head', size: [8, 8, 8], pos: [0, 20, 0], off: [0, 4, 0], color: Y, paint: { front: (g, x, y) => { rect(g, x + 1, y + 3, 2, 1, [40, 20, 10]); rect(g, x + 5, y + 3, 2, 1, [40, 20, 10]); rect(g, x + 2, y + 6, 4, 1, [160, 70, 10]); } } },
      { name: 'rods', size: [0.1, 0.1, 0.1], pos: [0, 12, 0], color: O },
    ];
    for (let i = 0; i < 8; i++) {
      const outer = i < 4, a = ((i % 4) / 4) * TAU + (outer ? 0 : Math.PI / 4);
      const r = outer ? 7 : 4.5, y = outer ? 4 : -3;
      parts.push({ name: 'rod' + i, parent: 'rods', size: [2, 8, 2], pos: [Math.cos(a) * r, y, Math.sin(a) * r], color: i % 2 ? Y : O });
    }
    return parts;
  },
  magma_slime: () => [{ name: 'body', size: [8, 8, 8], pos: [0, 4, 0], color: [96, 28, 16], noise: 0.12, paint: {
    all: (g, x, y, w, h) => { for (let r = 1; r < h; r += 3) rect(g, x, y + r, w, 1, [234, 116, 24]); },
    top: (g, x, y, w, h) => { rect(g, x + 2, y + 2, w - 4, h - 4, [150, 50, 20]); },
    front: (g, x, y, w, h) => { for (let r = 1; r < h; r += 3) rect(g, x, y + r, w, 1, [234, 116, 24]); rect(g, x + 1, y + 2, 2, 1, [255, 226, 96]); rect(g, x + 5, y + 2, 2, 1, [255, 226, 96]); },
  } }],
  snoutling: () => snoutModel(PIG, [132, 86, 40], [74, 52, 40]),
  snoutling_brute: () => snoutModel(PIG, [34, 30, 30], [60, 44, 30]),
  rotting_snoutling: () => snoutModel([146, 162, 104], [118, 94, 62], [70, 60, 50]),
  tusker: () => tuskerModel(false),
  rotting_tusker: () => tuskerModel(true),
  charred_skeleton: () => humanoid([2, 12, 2], [42, 42, 44], [36, 36, 38], [36, 36, 38], {
    front: (g, x, y) => { rect(g, x + 1, y + 3, 2, 2, [8, 8, 8]); rect(g, x + 5, y + 3, 2, 2, [8, 8, 8]); for (let i = 1; i < 7; i += 2) px(g, x + i, y + 6, [16, 16, 16]); },
  }, { body: (g, x, y, w, h) => { for (let r = 1; r < h - 3; r += 2) rect(g, x + 1, y + r, w - 2, 1, [18, 18, 20]); } }),
  strider: () => [
    { name: 'body', size: [16, 14, 16], pos: [0, 23, 0], color: [164, 52, 52], noise: 0.1, paint: { front: (g, x, y) => { rect(g, x + 3, y + 4, 3, 2, [30, 10, 10]); rect(g, x + 10, y + 4, 3, 2, [30, 10, 10]); rect(g, x + 4, y + 9, 8, 2, [96, 22, 22]); } } },
    ...[-6, -2, 2, 6].map((x, i) => ({ name: 'hair' + i, size: [1, 6, 1], pos: [x, 33, 0], color: [224, 124, 92] })),
    { name: 'leg0', size: [4, 16, 4], pos: [-4, 16, 0], off: [0, -8, 0], color: [124, 42, 42] },
    { name: 'leg1', size: [4, 16, 4], pos: [4, 16, 0], off: [0, -8, 0], color: [124, 42, 42] },
  ],
  shademite: () => [
    { name: 'body', size: [4, 3, 8], pos: [0, 2, 0], color: [42, 26, 62], spots: [124, 62, 166] },
    { name: 'head', size: [4, 3, 3], pos: [0, 2, 5], color: [32, 20, 46], paint: { front: (g, x, y) => { px(g, x, y + 1, [210, 110, 250]); px(g, x + 3, y + 1, [210, 110, 250]); } } },
    ...[-2, 0, 2].flatMap((z, i) => [
      { name: 'legL' + i, size: [4, 1, 1], pos: [-2, 1, z], off: [-2, 0, 0], color: [32, 20, 46] },
      { name: 'legR' + i, size: [4, 1, 1], pos: [2, 1, z], off: [2, 0, 0], color: [32, 20, 46] },
    ]),
  ],
  clamper: () => [
    { name: 'base', size: [16, 8, 16], pos: [0, 4, 0], color: [152, 102, 162], noise: 0.08 },
    { name: 'headc', size: [6, 6, 6], pos: [0, 9, 0], color: [222, 232, 124], paint: { front: (g, x, y) => { px(g, x + 1, y + 2, [30, 30, 30]); px(g, x + 4, y + 2, [30, 30, 30]); } } },
    { name: 'hinge', size: [0.1, 0.1, 0.1], pos: [0, 8, -8], color: [150, 100, 160] },
    { name: 'lid', parent: 'hinge', size: [16, 8, 16], pos: [0, 4, 8], color: [172, 118, 182], noise: 0.08 },
  ],
  void_crystal: () => [{ name: 'core', size: [8, 8, 8], pos: [0, 12, 0], color: [255, 96, 206], noise: 0.15 }],
  void_dragon: () => {
    const Bk = [26, 22, 32], Dk = [44, 38, 56], Pu = [168, 70, 196];
    const parts = [
      { name: 'body', size: [12, 10, 22], pos: [0, 10, 0], color: Bk, spots: Dk },
      { name: 'spine', size: [2, 3, 20], pos: [0, 16, 0], color: Dk },
      { name: 'neck', size: [6, 6, 10], pos: [0, 12, 11], off: [0, 0, 5], rot: [-0.25, 0, 0], color: Bk },
      { name: 'head', parent: 'neck', size: [8, 7, 10], pos: [0, 1, 12], off: [0, 0, 4], color: Bk, paint: { front: (g, x, y) => { rect(g, x + 1, y + 2, 2, 1, Pu); rect(g, x + 5, y + 2, 2, 1, Pu); } } },
      { name: 'jaw', parent: 'head', size: [7, 2, 9], pos: [0, -4, 4], color: Dk },
      { name: 'horn0', parent: 'head', size: [1, 3, 3], pos: [-3, 5, 0], rot: [-0.5, 0, 0], color: Dk },
      { name: 'horn1', parent: 'head', size: [1, 3, 3], pos: [3, 5, 0], rot: [-0.5, 0, 0], color: Dk },
    ];
    for (const s of [-1, 1]) {
      const n = s < 0 ? 0 : 1;
      parts.push({ name: 'wing' + n, size: [0.1, 0.1, 0.1], pos: [6 * s, 14, 4], color: Bk });
      parts.push({ name: 'wing' + n + 'a', parent: 'wing' + n, size: [22, 1, 12], pos: [11 * s, 0, -2], color: Dk, paint: { top: (g, x, y, w, h) => { for (let i = 2; i < w; i += 5) rect(g, x + i, y, 1, h, Bk); } } });
      parts.push({ name: 'wing' + n + 'b', parent: 'wing' + n, size: [0.1, 0.1, 0.1], pos: [22 * s, 0, 0], color: Bk });
      parts.push({ name: 'wing' + n + 'c', parent: 'wing' + n + 'b', size: [20, 1, 10], pos: [10 * s, 0, -3], color: Dk, paint: { top: (g, x, y, w, h) => { for (let i = 2; i < w; i += 5) rect(g, x + i, y, 1, h, Bk); } } });
    }
    let prev = null;
    for (let i = 0; i < 6; i++) {
      const sz = 6 - i * 0.7;
      parts.push({ name: 'tail' + i, parent: prev || undefined, size: [sz, sz, 6], pos: prev ? [0, 0, -6] : [0, 10, -11], off: [0, 0, -3], color: i % 2 ? Dk : Bk });
      prev = 'tail' + i;
    }
    for (const [x, z] of [[-5, 7], [5, 7], [-5, -7], [5, -7]]) parts.push({ name: 'leg' + (x > 0 ? 'R' : 'L') + (z > 0 ? 'f' : 'b'), size: [3, 7, 3], pos: [x, 5, z], off: [0, -3, 0], color: Dk });
    return parts;
  },
});

const blightFace = (big) => ({ front: (g, x, y) => {
  const W = [232, 232, 236];
  if (big) { rect(g, x + 1, y + 3, 2, 1, W); rect(g, x + 5, y + 3, 2, 1, W); rect(g, x + 2, y + 6, 4, 1, W); px(g, x + 3, y + 5, [120, 120, 126]); }
  else { px(g, x + 1, y + 2, W); px(g, x + 4, y + 2, W); rect(g, x + 2, y + 4, 2, 1, W); }
} });
Object.assign(MODELS, {
  blight: () => {
    const Bk = [38, 38, 42], Dk = [24, 24, 28];
    return [
      { name: 'spine', size: [3, 10, 3], pos: [0, 13, 0], color: Bk },
      { name: 'shoulders', size: [20, 3, 3], pos: [0, 19.5, 0], color: Bk },
      { name: 'rib0', size: [11, 2, 2], pos: [0, 16, 0], color: Dk },
      { name: 'rib1', size: [11, 2, 2], pos: [0, 13, 0], color: Dk },
      { name: 'rib2', size: [9, 2, 2], pos: [0, 10, 0], color: Dk },
      { name: 'tail', size: [3, 7, 3], pos: [0, 8, 0], off: [0, -3.5, 0], rot: [0.55, 0, 0], color: Bk },
      { name: 'head', size: [8, 8, 8], pos: [0, 21, 0], off: [0, 4, 0], color: Bk, noise: 0.06, paint: blightFace(true) },
      { name: 'headL', size: [6, 6, 6], pos: [-10, 20, 0], off: [0, 3, 0], color: Bk, noise: 0.06, paint: blightFace(false) },
      { name: 'headR', size: [6, 6, 6], pos: [10, 20, 0], off: [0, 3, 0], color: Bk, noise: 0.06, paint: blightFace(false) },
    ];
  },
  cave_spider: () => MODELS.spider().map((p) => ({ ...p, color: p.color && p.color[0] < 90 ? [22, 62, 78] : p.color })),
  mooshroom: () => [
    ...MODELS.cow().map((p) => (p.name === 'body' || p.name === 'head' ? { ...p, color: [168, 34, 30], spots: [226, 222, 214] } : p)),
    { name: 'cap0', size: [4, 3, 4], pos: [-2, 23.5, -4], color: [200, 40, 36] },
    { name: 'cap1', size: [4, 3, 4], pos: [3, 23.5, 3], color: [200, 40, 36] },
  ],
});

// ---------------------------------------------------------------- shared helpers
const holdItem = (m, key, scale = 12) => holdInHand(m.model, ID[key], scale);
const scaled = (s) => (m) => { m.model.inner.scale.setScalar(s / 16); m.baseScale = s / 16; };

// Common start of a custom-AI update; false once the mob is dead (and its death is handled)
function pre(m, dt) {
  m.age += dt; m.hurtTime -= dt; m.invul -= dt; m.attackCd -= dt;
  if (m.dead) {
    m.deathTime += dt;
    m.model.root.rotation.z = Math.min(1, m.deathTime * 3) * Math.PI / 2;
    tintModel(m.model.root, lightAt(m.pos.x, m.pos.y + 0.5, m.pos.z), 0.6);
    if (m.deathTime > 0.8) { smoke(m.pos.x, m.pos.y + m.h / 2, m.pos.z, 10, 0.6); m.removed = true; }
    return false;
  }
  m.retarget -= dt;
  if (m.retarget <= 0) { m.retarget = 0.4 + rand() * 0.3; m.target = m.pickTarget(); }
  if (m.target && (m.target.dead || m.target.removed || m.target.gone)) m.target = null;
  return true;
}
function finish(m, dt, hs) {
  const p = G.player;
  const pdist = p ? Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z) : Infinity;
  m.soundCd -= dt;
  if (m.soundCd <= 0) { m.soundCd = 6 + rand() * 10; if (pdist < 28) sfx(m.def.sound, m.pos, { vol: 0.8 }); }
  m.burnCheck(dt);
  if (m.pos.y < -30) m.removed = true;
  m.animate(dt, hs, pdist);
}
// Flying movement towards a point, bumping off blocks
function steer(m, tx, ty, tz, spd, dt, turn = 2) {
  const dx = tx - m.pos.x, dy = ty - m.pos.y, dz = tz - m.pos.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const k = Math.min(1, dt * turn);
  m.vel.x += (dx / d * spd - m.vel.x) * k;
  m.vel.y += (dy / d * spd - m.vel.y) * k;
  m.vel.z += (dz / d * spd - m.vel.z) * k;
  const res = moveBox(G.world, m, m.vel.x * dt, m.vel.y * dt, m.vel.z * dt);
  if (res.x) m.vel.x *= -0.5;
  if (res.y) m.vel.y *= -0.5;
  if (res.z) m.vel.z *= -0.5;
  return d;
}

// ---------------------------------------------------------------- projectiles
const FB_COLOR = { large: 0xff9a26, small: 0xffc040, dragon: 0xb044e6 };
class Fireball {
  constructor(x, y, z, vx, vy, vz, kind, owner, shooter) {
    this.pos = { x, y, z }; this.vel = { x: vx, y: vy, z: vz };
    this.kind = kind; this.owner = owner; this.shooter = shooter || null;
    this.age = 0; this.removed = false;
    const size = kind === 'large' ? 1 : kind === 'dragon' ? 0.9 : 0.35;
    this.hw = size / 2;
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ color: FB_COLOR[kind], fog: false }));
    R.scene.add(this.mesh);
  }
  update(dt) {
    this.age += dt;
    const sx = this.vel.x * dt, sy = this.vel.y * dt, sz = this.vel.z * dt;
    const len = Math.hypot(sx, sy, sz) || 1e-6;
    const dx = sx / len, dy = sy / len, dz = sz / len;
    const P = G.entities.particles;
    if (rand() < dt * 30) {
      const c = this.kind === 'dragon' ? [0.7, 0.3, 0.9] : [1, 0.55 + rand() * 0.3, 0.1];
      P.spawn(this.pos.x, this.pos.y, this.pos.z, (rand() - 0.5), (rand() - 0.5), (rand() - 0.5), c[0], c[1], c[2], 0.12, 0.5, -0.05);
    }
    const pad = this.hw + 0.1;
    if (this.owner !== 'fx') {
      for (const m of G.entities.mobs) {
        if (m.dead || m === this.shooter) continue;
        const t = rayBox(this.pos.x, this.pos.y, this.pos.z, dx, dy, dz, m.pos.x - m.hw - pad, m.pos.y - pad, m.pos.z - m.hw - pad, m.pos.x + m.hw + pad, m.pos.y + m.h + pad, m.pos.z + m.hw + pad);
        if (t >= 0 && t <= len) { this.hitEntity(m); return; }
      }
      if (this.owner === 'mob') {
        for (const q of players()) {
          if (q.dead) continue;
          const t = rayBox(this.pos.x, this.pos.y, this.pos.z, dx, dy, dz, q.pos.x - q.hw - pad, q.pos.y - pad, q.pos.z - q.hw - pad, q.pos.x + q.hw + pad, q.pos.y + q.h + pad, q.pos.z + q.hw + pad);
          if (t >= 0 && t <= len) { this.hitEntity(q); return; }
        }
      }
    }
    const hit = raycast(G.world, this.pos.x, this.pos.y, this.pos.z, dx, dy, dz, len, (id) => BLOCKS[id].solid);
    if (hit) {
      this.pos.x += dx * hit.dist; this.pos.y += dy * hit.dist; this.pos.z += dz * hit.dist;
      this.impact(hit);
      return;
    }
    this.pos.x += sx; this.pos.y += sy; this.pos.z += sz;
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.rotation.x += dt * 4; this.mesh.rotation.y += dt * 3;
    if (this.age > 12 || this.pos.y < -10 || this.pos.y > CH + 20) this.removed = true;
  }
  hitEntity(e) {
    if (this.owner === 'fx') { this.impact(null); return; }
    const dmg = this.kind === 'small' ? 4 : 6;
    if (e.isPlayer) {
      e.hurt(dmg, this.pos.x, this.pos.z, 'fireball');
      if (this.kind === 'small') e.addEffect('burn', 5);
    } else if (this.kind === 'large' && this.owner === 'player' && e.type === 'wailer') {
      e.invul = 0; e.hurt(1000, this.pos.x, this.pos.z, true, 1, null, { fb: 1 });   // sending a wailer's fireball back kills it
    } else {
      e.invul = 0; e.hurt(dmg, this.pos.x, this.pos.z, this.owner === 'player');
      if (this.kind === 'small' && !e.def.fireImmune) e.fire = 5;
    }
    this.impact(null);
  }
  impact(hit) {
    this.removed = true;
    const { x, y, z } = this.pos;
    if (this.owner === 'fx') return;   // the host sends the explosion
    if (this.kind === 'large') {
      explode(x, y, z, 1);
      for (let k = 0; k < 6; k++) {
        const fx = Math.floor(x + (rand() - 0.5) * 4), fy = Math.floor(y + (rand() - 0.5) * 3), fz = Math.floor(z + (rand() - 0.5) * 4);
        if (G.world.getBlock(fx, fy, fz) === 0 && G.game.canBurnAt(fx, fy, fz)) G.game.ignite(fx, fy, fz);
      }
    } else if (this.kind === 'small') {
      if (hit) {
        const fx = hit.x + hit.nx, fy = hit.y + hit.ny, fz = hit.z + hit.nz;
        if (G.world.getBlock(fx, fy, fz) === 0 && G.game.canBurnAt(fx, fy, fz)) G.game.ignite(fx, fy, fz);
      }
      for (let i = 0; i < 6; i++) flame(x + (rand() - 0.5) * 0.4, y, z + (rand() - 0.5) * 0.4);
    } else {
      addCloud(x, y, z, false);
    }
  }
  // Hitting a fireball sends it back where you are looking
  reflect(dir) {
    this.vel = { x: dir.x * 14, y: dir.y * 14, z: dir.z * 14 };
    this.owner = 'player';
    this.shooter = null;
    sfx('attack', this.pos);
  }
  dispose() { R.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// Lingering purple breath: hurts anyone standing in it
class AcidCloud {
  constructor(x, y, z, fx) { this.pos = { x, y, z }; this.t = 5; this.tick = 0; this.fx = fx; this.removed = false; }
  update(dt) {
    this.t -= dt;
    const P = G.entities.particles;
    for (let i = 0; i < 4; i++) {
      const a = rand() * TAU, r = rand() * 3;
      P.spawn(this.pos.x + Math.cos(a) * r, this.pos.y + rand() * 0.6, this.pos.z + Math.sin(a) * r, 0, 0.4, 0, 0.62, 0.25, 0.8, 0.14, 0.9, -0.03);
    }
    if (!this.fx) {
      this.tick -= dt;
      if (this.tick <= 0) {
        this.tick = 0.5;
        for (const q of players()) if (!q.dead && Math.hypot(q.pos.x - this.pos.x, q.pos.z - this.pos.z) < 3 && Math.abs(q.pos.y - this.pos.y) < 2.5) q.hurt(2, null, null, 'magic');
      }
    }
    if (this.t <= 0) this.removed = true;
  }
  dispose() {}
}
function addCloud(x, y, z, fx) {
  G.entities.projectiles.push(new AcidCloud(x, y, z, fx));
  if (!fx && G.net) G.net.projectile('ac', [x, y, z]);
}

// A clamper's slow homing bullet; a hit makes you float
class ClamperBullet {
  constructor(x, y, z, target, owner) {
    this.pos = { x, y, z }; this.target = target; this.owner = owner;
    const d = target ? Math.hypot(target.pos.x - x, target.pos.y + 1 - y, target.pos.z - z) || 1 : 1;
    this.vel = target ? { x: (target.pos.x - x) / d * 5, y: (target.pos.y + 1 - y) / d * 5, z: (target.pos.z - z) / d * 5 } : { x: 0, y: 0, z: 0 };
    this.age = 0; this.removed = false;
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xf0f0c8, fog: false }));
    R.scene.add(this.mesh);
  }
  update(dt) {
    this.age += dt;
    const t = this.target;
    if (t && !t.dead) {
      const dx = t.pos.x - this.pos.x, dy = t.pos.y + 1 - this.pos.y, dz = t.pos.z - this.pos.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const k = Math.min(1, dt * 1.6);
      this.vel.x += (dx / d * 5 - this.vel.x) * k; this.vel.y += (dy / d * 5 - this.vel.y) * k; this.vel.z += (dz / d * 5 - this.vel.z) * k;
      if (d < 0.8) {
        this.removed = true;
        if (this.owner !== 'fx') { t.hurt(4, this.pos.x, this.pos.z, 'magic'); t.addEffect('levitation', 8); }
        return;
      }
    }
    const nx = this.pos.x + this.vel.x * dt, ny = this.pos.y + this.vel.y * dt, nz = this.pos.z + this.vel.z * dt;
    if (G.world.isSolid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) { this.removed = true; return; }
    this.pos.x = nx; this.pos.y = ny; this.pos.z = nz;
    if (rand() < dt * 20) G.entities.particles.spawn(nx, ny, nz, 0, 0, 0, 0.95, 0.95, 0.8, 0.08, 0.5, 0);
    this.mesh.position.set(nx, ny, nz);
    this.mesh.rotation.y += dt * 5;
    if (this.age > 10) this.removed = true;
  }
  dispose() { R.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// A skull spat by the Blight: it bursts where it lands, and whoever it strikes withers. The blue ones are
// slower and burst harder.
class BlightSkull {
  constructor(x, y, z, vx, vy, vz, blue, owner, shooter) {
    this.pos = { x, y, z }; this.vel = { x: vx, y: vy, z: vz };
    this.blue = !!blue; this.owner = owner; this.shooter = shooter || null;
    this.age = 0; this.removed = false; this.hw = 0.22;
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), new THREE.MeshBasicMaterial({ color: blue ? 0x3a66d8 : 0x1c1c20, fog: false }));
    R.scene.add(this.mesh);
  }
  update(dt) {
    this.age += dt;
    const sx = this.vel.x * dt, sy = this.vel.y * dt, sz = this.vel.z * dt;
    const len = Math.hypot(sx, sy, sz) || 1e-6;
    const dx = sx / len, dy = sy / len, dz = sz / len;
    if (rand() < dt * 30) G.entities.particles.spawn(this.pos.x, this.pos.y, this.pos.z, (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.6, this.blue ? 0.3 : 0.12, this.blue ? 0.4 : 0.12, this.blue ? 0.9 : 0.14, 0.12, 0.6, -0.02);
    const pad = this.hw + 0.1;
    if (this.owner !== 'fx') {
      const box = (e) => rayBox(this.pos.x, this.pos.y, this.pos.z, dx, dy, dz, e.pos.x - e.hw - pad, e.pos.y - pad, e.pos.z - e.hw - pad, e.pos.x + e.hw + pad, e.pos.y + e.h + pad, e.pos.z + e.hw + pad);
      for (const m of G.entities.mobs) {
        if (m.dead || m === this.shooter) continue;
        const t = box(m);
        if (t >= 0 && t <= len) { this.strike(m); return; }
      }
      for (const q of players()) {
        if (q.dead) continue;
        const t = box(q);
        if (t >= 0 && t <= len) { this.strike(q); return; }
      }
    }
    const hit = raycast(G.world, this.pos.x, this.pos.y, this.pos.z, dx, dy, dz, len, (id) => BLOCKS[id].solid);
    if (hit) { this.pos.x += dx * hit.dist; this.pos.y += dy * hit.dist; this.pos.z += dz * hit.dist; this.burst(); return; }
    this.pos.x += sx; this.pos.y += sy; this.pos.z += sz;
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.rotation.y = Math.atan2(this.vel.x, this.vel.z);
    if (this.age > 10 || this.pos.y < -10 || this.pos.y > CH + 30) this.removed = true;
  }
  strike(e) {
    if (e.isPlayer) {
      e.hurt(8, this.pos.x, this.pos.z, 'skull');
      e.addEffect('wither', 10);
    } else {
      e.invul = 0;
      e.hurt(8, this.pos.x, this.pos.z, false);
      // the Blight feeds on what its skulls kill
      const b = this.shooter;
      if (e.dead && b && !b.dead) b.hp = Math.min(b.maxHp, b.hp + 5);
    }
    this.burst();
  }
  burst() {
    this.removed = true;
    if (this.owner === 'fx') return;   // the host sends the explosion
    explode(this.pos.x, this.pos.y, this.pos.z, this.blue ? 1.7 : 1);
  }
  dispose() { R.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// An eye of the shade flies towards the nearest stronghold, then drops (or shatters)
class ThrownEye {
  constructor(p) {
    this.pos = { x: p.pos.x, y: p.eyeY, z: p.pos.z };
    this.start = { ...this.pos };
    const s = nearestStronghold(G.world, p.pos.x, p.pos.z);
    const dx = s.x - p.pos.x, dz = s.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
    this.dir = { x: dx / d, z: dz / d };
    this.reach = Math.min(12, d);
    this.sink = d < 12;   // right above it: the eye dives into the ground
    this.age = 0; this.removed = false;
    this.mesh = itemModel(ID.shade_eye);
    this.mesh.scale.setScalar(0.35);
    R.scene.add(this.mesh);
    sfx('eye', this.pos);
  }
  update(dt) {
    this.age += dt;
    const t = Math.min(1, this.age / 1.8);
    const e = 1 - (1 - t) * (1 - t);
    this.pos.x = this.start.x + this.dir.x * this.reach * e;
    this.pos.z = this.start.z + this.dir.z * this.reach * e;
    this.pos.y = this.start.y + (this.sink ? Math.sin(t * Math.PI) * 2 - t * 3 : Math.sin(t * Math.PI * 0.6) * 4);
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.quaternion.copy(R.camera.quaternion);
    if (rand() < dt * 25) G.entities.particles.spawn(this.pos.x, this.pos.y, this.pos.z, (rand() - 0.5) * 0.5, 0.2, (rand() - 0.5) * 0.5, 0.5, 0.25, 0.75, 0.07, 0.8, -0.02);
    if (this.age > 2.6) {
      this.removed = true;
      if (rand() < 0.8) G.entities.dropItem(ID.shade_eye, 1, this.pos.x, this.pos.y, this.pos.z, 0, 1, 0);
      else {
        for (let i = 0; i < 16; i++) G.entities.particles.spawn(this.pos.x, this.pos.y, this.pos.z, (rand() - 0.5) * 3, rand() * 2, (rand() - 0.5) * 3, 0.3, 0.7, 0.45, 0.08, 0.7, 0.6);
        sfx('break_tool', this.pos, { vol: 0.5 });
      }
    }
  }
  dispose() {
    R.scene.remove(this.mesh);
    const mm = this.mesh.material;
    (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose());
  }
}

export function throwEye(p) { G.entities.projectiles.push(new ThrownEye(p)); }

function shootFireball(m, t, kind, spread = 0) {
  const sx = m.pos.x, sy = m.pos.y + m.h * (kind === 'large' ? 0.45 : 0.7), sz = m.pos.z;
  const tx = t.pos.x - sx + (rand() - 0.5) * spread, ty = t.pos.y + (t.h || 1.8) * 0.5 - sy, tz = t.pos.z - sz + (rand() - 0.5) * spread;
  const d = Math.hypot(tx, ty, tz) || 1, v = kind === 'large' ? 11 : kind === 'dragon' ? 14 : 16;
  const o = m.hw + 0.6;
  const fb = new Fireball(sx + tx / d * o, sy + ty / d * o, sz + tz / d * o, tx / d * v, ty / d * v, tz / d * v, kind, 'mob', m);
  G.entities.projectiles.push(fb);
  sfx('fireball', m.pos, { vol: 0.8 });
  if (G.net) G.net.projectile('fb', [fb.pos.x, fb.pos.y, fb.pos.z, fb.vel.x, fb.vel.y, fb.vel.z, kind]);
}

// Copies of the host's projectiles on a guest's screen (they do no damage)
Entities.prototype.projectileFx = function (kind, a) {
  if (kind === 'fb') this.projectiles.push(new Fireball(a[0], a[1], a[2], a[3], a[4], a[5], a[6], 'fx'));
  else if (kind === 'ac') this.projectiles.push(new AcidCloud(a[0], a[1], a[2], true));
  else if (kind === 'cb') this.projectiles.push(new ClamperBullet(a[0], a[1], a[2], G.player, 'fx'));
  else if (kind === 'sk') this.projectiles.push(new BlightSkull(a[0], a[1], a[2], a[3], a[4], a[5], a[6], 'fx'));
};

// The fireball in front of the player, if any (to hit it back)
Entities.prototype.pickFireball = function (ox, oy, oz, dx, dy, dz, maxDist) {
  let best = null, bt = maxDist;
  for (const f of this.projectiles) {
    if (!(f instanceof Fireball) || f.removed || f.owner !== 'mob' || f.kind === 'dragon') continue;
    const r = f.hw + 0.4;
    const t = rayBox(ox, oy, oz, dx, dy, dz, f.pos.x - r, f.pos.y - r, f.pos.z - r, f.pos.x + r, f.pos.y + r, f.pos.z + r);
    if (t >= 0 && t < bt) { bt = t; best = f; }
  }
  return best;
};

// ---------------------------------------------------------------- behaviours
function wailerAI(m, dt) {
  if (!pre(m, dt)) return;
  const t = m.target;
  const f = m.flight || (m.flight = { x: m.pos.x, y: m.pos.y, z: m.pos.z, t: 0 });
  f.t -= dt;
  let see = false;
  if (t) see = dist3(m, t) < 48 && m.canSee(t);
  if (t && see) {
    m.yaw = Math.atan2(t.pos.x - m.pos.x, t.pos.z - m.pos.z);
    m.shootCd -= dt;
    if (m.shootCd < 0.8 && !m.angry) { m.angry = true; sfx('wailer', m.pos, { vol: 1.3 }); }
    if (m.shootCd <= 0) { m.shootCd = 3 + rand() * 1.5; m.angry = false; shootFireball(m, t, 'large'); }
    if (f.t <= 0) {
      const a = rand() * TAU;
      f.x = t.pos.x + Math.cos(a) * 16; f.z = t.pos.z + Math.sin(a) * 16; f.y = Math.min(118, t.pos.y + 6 + rand() * 6); f.t = 4;
    }
  } else {
    m.angry = false;
    m.shootCd = Math.max(m.shootCd, 1.5);
    if (f.t <= 0) { f.x = m.pos.x + (rand() - 0.5) * 32; f.z = m.pos.z + (rand() - 0.5) * 32; f.y = Math.max(40, Math.min(112, m.pos.y + (rand() - 0.5) * 12)); f.t = 5 + rand() * 4; }
  }
  steer(m, f.x, f.y, f.z, 2.2, dt, 1.5);
  if (!(t && see) && Math.hypot(m.vel.x, m.vel.z) > 0.3) m.yaw = Math.atan2(m.vel.x, m.vel.z);
  finish(m, dt, 0);
}

function cinderAI(m, dt) {
  if (!pre(m, dt)) return;
  const t = m.target, w = G.world;
  let ground = Math.floor(m.pos.y);
  for (let k = 0; k < 10 && ground > 1 && !w.isSolid(Math.floor(m.pos.x), ground - 1, Math.floor(m.pos.z)); k++) ground--;
  let tx = m.pos.x, tz = m.pos.z, ty = ground + 2 + Math.sin(m.age * 1.3) * 0.6;
  if (t && dist3(m, t) < 32) {
    const d = dist3(m, t);
    ty = Math.max(ty, t.pos.y + 1.5);
    if (d > 7) { tx = t.pos.x; tz = t.pos.z; }
    m.yaw = Math.atan2(t.pos.x - m.pos.x, t.pos.z - m.pos.z);
    m.shootCd -= dt;
    if (m.shootCd <= 0 && m.canSee(t)) {
      if (!m.burst) { m.burst = 3; m.angry = true; }
      m.burst--;
      shootFireball(m, t, 'small', 1.5);
      m.shootCd = m.burst > 0 ? 0.3 : 4 + rand() * 2;
      if (!m.burst) m.angry = false;
    }
  } else {
    const wd = m.wander;
    if (!wd || m.age > wd.t) m.wander = { x: m.home.x + (rand() - 0.5) * 12, z: m.home.z + (rand() - 0.5) * 12, t: m.age + 4 + rand() * 3 };
    tx = m.wander.x; tz = m.wander.z;
  }
  steer(m, tx, ty, tz, t ? 3 : 1.2, dt, 2);
  if (rand() < dt * 8) flame(m.pos.x + (rand() - 0.5) * 0.8, m.pos.y + rand() * 1.6, m.pos.z + (rand() - 0.5) * 0.8);
  if (m.angry && rand() < dt * 20) smoke(m.pos.x, m.pos.y + 1.2, m.pos.z, 1, 0.3);
  finish(m, dt, 0);
}

function striderAI(m, dt) {
  if (!pre(m, dt)) return;
  const w = G.world;
  const bx = Math.floor(m.pos.x), bz = Math.floor(m.pos.z);
  const feet = w.getBlock(bx, Math.floor(m.pos.y - 0.05), bz), inside = w.getBlock(bx, Math.floor(m.pos.y + 0.2), bz);
  const onLava = feet === B.lava && inside !== B.lava;
  const ai = m.ai;
  ai.t -= dt;
  if (ai.t <= 0) { ai.walk = rand() < 0.6; ai.dir = rand() * TAU; ai.t = 2 + rand() * 4; }
  const mx = ai.walk ? Math.sin(ai.dir) : 0, mz = ai.walk ? Math.cos(ai.dir) : 0;
  const spd = onLava ? 1.6 : 0.7;
  const k = Math.min(1, dt * 6);
  m.vel.x += (mx * spd - m.vel.x) * k;
  m.vel.z += (mz * spd - m.vel.z) * k;
  if (inside === B.lava) m.vel.y = Math.min(m.vel.y + 24 * dt, 2.5);   // bob up to the surface
  else if (onLava) { m.vel.y = 0; m.pos.y = Math.floor(m.pos.y - 0.05) + 1; }
  else m.vel.y = Math.max(m.vel.y - 32 * dt, -40);
  const res = moveBox(w, m, m.vel.x * dt, m.vel.y * dt, m.vel.z * dt);
  if (res.y) m.vel.y = 0;
  m.onGround = onLava || res.ground;
  if ((res.x || res.z) && m.onGround) m.vel.y = 7;
  if (mx || mz) m.yaw = Math.atan2(mx, mz);
  m.angry = !onLava && inside !== B.lava;   // cold and shivering out of the lava
  finish(m, dt, Math.hypot(m.vel.x, m.vel.z));
}

function clamperAI(m, dt) {
  if (!pre(m, dt)) return;
  const t = m.target;
  m.vel.x = m.vel.y = m.vel.z = 0;
  const want = !!(t && dist3(m, t) < 16 && m.canSee(t));
  m.openT = Math.max(0, Math.min(1, (m.openT || 0) + (want ? dt * 2 : -dt)));
  m.angry = m.openT > 0.3;
  if (want) {
    m.yaw = Math.atan2(t.pos.x - m.pos.x, t.pos.z - m.pos.z);
    m.shootCd -= dt;
    if (m.shootCd <= 0 && m.openT > 0.8) {
      m.shootCd = 2 + rand() * 2;
      const b = new ClamperBullet(m.pos.x, m.pos.y + 0.9, m.pos.z, t, 'mob');
      G.entities.projectiles.push(b);
      sfx('clamper', m.pos);
      if (G.net) G.net.projectile('cb', [b.pos.x, b.pos.y, b.pos.z]);
    }
  }
  finish(m, dt, 0);
}

function crystalAI(m, dt) {
  if (m.dead) { m.removed = true; return; }
  m.age += dt; m.hurtTime -= dt; m.invul -= dt;
  m.animate(dt, 0, 0);
}

function nearestCrystal(m, r) {
  let best = null, bd = r;
  for (const c of G.entities.mobs) {
    if (c.type !== 'void_crystal' || c.dead || c.removed) continue;
    const d = dist3(c, m);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function dragonAI(m, dt) {
  m.age += dt; m.hurtTime -= dt; m.invul -= dt; m.attackCd -= dt;
  if (m.dead) { dragonDying(m, dt); return; }
  const py = exitPortalY(G.world);
  let target = null, bd = 160;
  for (const q of players()) {
    if (q.dead || q.mode !== 'survival') continue;
    const d = dist3(m, q);
    if (d < bd) { bd = d; target = q; }
  }
  const s = m.state || (m.state = { phase: 'circle', t: 8, a: Math.atan2(m.pos.z, m.pos.x) });
  s.t -= dt;
  let tx = 0, ty = py + 20, tz = 0, spd = 11;
  const circle = (t) => { s.phase = 'circle'; s.t = t; };
  switch (s.phase) {
    case 'circle':
      s.a += dt * 0.28;
      tx = Math.cos(s.a) * 55; tz = Math.sin(s.a) * 55; ty = 82 + Math.sin(m.age * 0.5) * 6;
      if (s.t <= 0) {
        const r = rand();
        if (target && r < 0.45) { s.phase = 'strafe'; s.t = 9; s.fired = false; }
        else if (target && r < 0.65) { s.phase = 'charge'; s.t = 6; }
        else { s.phase = 'land'; s.t = 14; }
      }
      break;
    case 'strafe':
      if (!target) { circle(6); break; }
      tx = target.pos.x; tz = target.pos.z; ty = target.pos.y + 18;
      if (!s.fired && dist3(m, target) < 45 && m.canSee(target)) { s.fired = true; shootFireball(m, target, 'dragon'); sfx('dragon', m.pos, { vol: 1.4 }); }
      if ((s.fired && dist3(m, target) < 22) || s.t <= 0) circle(10 + rand() * 8);
      break;
    case 'charge':
      if (!target) { circle(6); break; }
      tx = target.pos.x; ty = target.pos.y + 1; tz = target.pos.z; spd = 17;
      if (dist3(m, target) < m.hw + 3 && m.attackCd <= 0) {
        m.attackCd = 2;
        target.hurt(10, m.pos.x, m.pos.z, 'mob');
        if (!target.remote) target.vel.y = 12;
        circle(10 + rand() * 6);
      }
      if (s.t <= 0) circle(8);
      break;
    case 'land':
      ty = py + 4.2; spd = 8;
      if (Math.hypot(m.pos.x, m.pos.z) < 2.5 && Math.abs(m.pos.y - ty) < 1.5) { s.phase = 'perch'; s.t = 14; s.hp0 = m.hp; s.breath = 2; }
      if (s.t <= 0) circle(8);
      break;
    case 'perch':
      ty = py + 4.2; spd = 2;
      if (target) m.yaw = Math.atan2(target.pos.x - m.pos.x, target.pos.z - m.pos.z);
      s.breath -= dt;
      if (s.breath <= 0 && target) {
        s.breath = 4;
        const bx = m.pos.x + Math.sin(m.yaw) * 7, bz = m.pos.z + Math.cos(m.yaw) * 7;
        addCloud(bx, py, bz, false);
        sfx('dragon', m.pos, { vol: 1.2 });
      }
      if (s.t <= 0 || s.hp0 - m.hp > 30) { s.phase = 'takeoff'; s.t = 4; }
      break;
    default:   // takeoff
      ty = py + 30; spd = 8;
      if (m.pos.y > py + 20 || s.t <= 0) circle(10);
  }
  const dx = tx - m.pos.x, dy = ty - m.pos.y, dz = tz - m.pos.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  if (s.phase === 'perch') { m.vel.x = m.vel.z = 0; m.vel.y = dy * 2; m.pos.x += (0.5 - m.pos.x) * dt; m.pos.z += (0.5 - m.pos.z) * dt; }
  else {
    const k = Math.min(1, dt * (s.phase === 'charge' ? 2.5 : 1.2));
    m.vel.x += (dx / d * spd - m.vel.x) * k; m.vel.y += (dy / d * spd - m.vel.y) * k; m.vel.z += (dz / d * spd - m.vel.z) * k;
    m.yaw = Math.atan2(m.vel.x, m.vel.z);
  }
  m.pos.x += m.vel.x * dt; m.pos.y += m.vel.y * dt; m.pos.z += m.vel.z * dt;
  m.angry = s.phase === 'perch';
  // the crystals on the pillars heal it
  const c = nearestCrystal(m, 32);
  m.healing = c;
  if (c && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + dt);
  m.soundCd -= dt;
  if (m.soundCd <= 0) { m.soundCd = 8 + rand() * 8; sfx('dragon', m.pos, { vol: 1.5 }); }
  m.animate(dt, 1, 0);
}

function dragonDying(m, dt) {
  m.dyingT = (m.dyingT || 0) + dt;
  m.pos.y += dt * 1.6;
  const P = G.entities.particles;
  for (let i = 0; i < 6; i++) {
    const a = rand() * TAU;
    P.spawn(m.pos.x, m.pos.y + 1.5, m.pos.z, Math.cos(a) * 8, (rand() - 0.3) * 8, Math.sin(a) * 8, 1, 0.9 + rand() * 0.1, 1, 0.25, 1.2, 0);
  }
  if (rand() < dt * 3) sfx('explode', m.pos, { vol: 0.5 });
  tintModel(m.model.root, 1.6, 0);
  if (m.dyingT > 5 && !m.finished) {
    m.finished = true;
    m.removed = true;
    if (isHost()) finishDragon();
  }
}

// The dragon is beaten: the exit portal opens with the egg on top, and a gateway to the outer islands appears
function finishDragon() {
  const w = G.world;
  const set = (x, y, z, id) => w.setBlockAnywhere(x, y, z, id);
  openExitPortal(w, set);
  const a = rand() * TAU;
  const gx = Math.round(Math.cos(a) * 96), gz = Math.round(Math.sin(a) * 96);
  set(gx, 75, gz, B.end_gateway);
  set(gx, 74, gz, B.bedrock);
  set(gx, 76, gz, B.bedrock);
  w.flags = w.flags || {};
  w.flags.dragonKilled = true;
  sfx('portal_open', G.player.pos, { vol: 1.2 });
  const msg = 'The Void Dragon has been defeated! The exit portal is open.';
  if (G.net) G.net.announce(msg); else G.ui.toast(msg);
}

// ---------------------------------------------------------------- the Blight
// It fights the way the old three-headed terror does. Woken, it swells for eleven seconds and cannot be
// hurt, then bursts. After that it flies at whoever is nearest: the middle head spits skulls at them while
// the other two pick victims of their own (anything alive that is not undead). It mends itself slowly,
// breaks whatever blocks are in its way a moment after it is hurt, and at half health grows a shell that
// arrows cannot pierce and comes down to fight at close quarters.
const BLIGHT_WAKE = 11;
function blightVictims(m) {
  const out = [];
  for (const q of players()) if (!q.dead && q.mode === 'survival' && dist3(m, q) < 64) out.push(q);
  return out;
}
function blightHead(m, i) {
  if (i === 0) return [m.pos.x, m.pos.y + m.h * 0.86, m.pos.z];
  const side = i === 1 ? -1 : 1;
  return [m.pos.x + Math.cos(m.yaw) * 1.15 * side, m.pos.y + m.h * 0.8, m.pos.z - Math.sin(m.yaw) * 1.15 * side];
}
function blightSmash(m) {
  const w = G.world;
  const x0 = Math.floor(m.pos.x - 1.4), x1 = Math.floor(m.pos.x + 1.4), z0 = Math.floor(m.pos.z - 1.4), z1 = Math.floor(m.pos.z + 1.4);
  let n = 0;
  for (let y = Math.floor(m.pos.y); y <= Math.floor(m.pos.y + m.h + 0.5); y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const id = w.getBlock(x, y, z);
    if (!id || BLOCKS[id].hardness < 0 || BLOCKS[id].render === 3) continue;   // (nothing breaks bedrock, portals or liquid)
    G.game.removeBlock(x, y, z, rand() < 0.5);
    n++;
  }
  if (n) sfx('explode', m.pos, { vol: 0.5, pitch: 1.4 });
}
function blightAI(m, dt) {
  m.age += dt; m.hurtTime -= dt; m.invul -= dt; m.attackCd -= dt;
  if (m.dead) {
    m.deathTime += dt;
    const P = G.entities.particles;
    for (let i = 0; i < 5; i++) { const a = rand() * TAU; P.spawn(m.pos.x, m.pos.y + 1.6, m.pos.z, Math.cos(a) * 6, (rand() - 0.3) * 6, Math.sin(a) * 6, 0.9, 0.9, 1, 0.2, 1, 0); }
    tintModel(m.model.root, 1.6, 0);
    if (m.deathTime > 1.6) { smoke(m.pos.x, m.pos.y + 1.5, m.pos.z, 30, 1.6); m.removed = true; }
    return;
  }
  // (only one that has just been summoned wakes: one that comes back with a saved world, a chunk loading
  // again or a new host taking over is awake already)
  const s = m.state || (m.state = { wake: m.fresh ? BLIGHT_WAKE : 0, cd: [2, 3, 3.6], targets: [null, null, null], pick: 0, regen: 0, smash: 0, stuck: 0, hp0: m.hp });
  if (s.wake > 0) {
    // waking: nothing can hurt it, and its strength fills up
    s.wake -= dt;
    m.invul = 0.3;
    m.vel.x = m.vel.y = m.vel.z = 0;
    m.hp = m.maxHp * (1 / 3 + (2 / 3) * (1 - Math.max(0, s.wake) / BLIGHT_WAKE));
    m.waking = true;
    if (s.wake <= 0) {
      m.waking = false; m.fresh = false; m.hp = m.maxHp; s.hp0 = m.hp;
      explode(m.pos.x, m.pos.y + 1.5, m.pos.z, 7);
      sfx('dragon', m.pos, { vol: 1.5, pitch: 0.6 });
    }
    m.animate(dt, 0, 0);
    return;
  }
  // it mends a point of health every second
  s.regen += dt;
  if (s.regen >= 1) { s.regen = 0; if (m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + 1); }
  const shell = m.hp <= m.maxHp / 2;
  m.angry = shell;
  // hurt: a second later it tears through the blocks round it
  if (m.hp < s.hp0 - 0.5) s.smash = Math.max(s.smash, 1);
  s.hp0 = m.hp;
  if (s.smash > 0) { s.smash -= dt; if (s.smash <= 0) blightSmash(m); }
  // victims: the nearest player for the middle head, anything living for the other two
  s.pick -= dt;
  if (s.pick <= 0) {
    s.pick = 1;
    const ps = blightVictims(m);
    let main = null, bd = 1e9;
    for (const q of ps) { const d = dist3(m, q); if (d < bd) { bd = d; main = q; } }
    const others = [...ps];
    for (const o of G.entities.mobs) if (o !== m && !o.dead && !o.removed && !o.def.undead && !o.def.boss && dist3(m, o) < 30) others.push(o);
    if (!main && others.length) main = others[0];
    s.targets[0] = main;
    for (const i of [1, 2]) {
      const t = s.targets[i];
      if (!t || t.dead || t.removed || t.gone || dist3(m, t) > 40 || rand() < 0.15) s.targets[i] = others.length ? others[(rand() * others.length) | 0] : null;
    }
  }
  const t = s.targets[0] && !s.targets[0].dead && !s.targets[0].removed && !s.targets[0].gone ? s.targets[0] : null;
  let tx = m.pos.x, ty = m.pos.y, tz = m.pos.z, spd = 0;
  if (t) {
    const dx = t.pos.x - m.pos.x, dz = t.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
    // hiding does not help: when it has not seen its victim for a couple of seconds it comes straight
    // for them, through whatever is in the way
    s.blind = m.canSee(t) ? 0 : (s.blind || 0) + dt;
    const hunt = s.blind > 2;
    const keep = hunt ? 1.5 : shell ? 3 : 9;
    tx = t.pos.x - dx / d * keep; tz = t.pos.z - dz / d * keep;
    ty = t.pos.y + (hunt ? 0.2 : shell ? 0.6 : 5);
    spd = shell ? 6 : 5;
    m.yaw = Math.atan2(dx, dz);
    if (hunt) { s.dig = (s.dig || 0) + dt; if (s.dig > 0.9) { s.dig = 0; blightSmash(m); } }
  } else {
    // nobody about: hang in the air a little above the ground
    let g = Math.floor(m.pos.y);
    for (let k = 0; k < 12 && g > 1 && !G.world.isSolid(Math.floor(m.pos.x), g - 1, Math.floor(m.pos.z)); k++) g--;
    ty = g + 3 + Math.sin(m.age) * 0.5; spd = 1.5;
  }
  const bx = m.pos.x, by = m.pos.y, bz = m.pos.z;
  const far = steer(m, tx, ty, tz, spd, dt, 2.5);
  // walled in: it breaks out
  if (t && far > 2.5 && Math.hypot(m.pos.x - bx, m.pos.y - by, m.pos.z - bz) < spd * dt * 0.25) { s.stuck += dt; if (s.stuck > 0.7) { s.stuck = 0; blightSmash(m); } } else s.stuck = Math.max(0, s.stuck - dt);
  // the three heads
  for (let i = 0; i < 3; i++) {
    s.cd[i] -= dt;
    const v = s.targets[i];
    if (s.cd[i] > 0 || !v || v.dead || v.removed || v.gone) continue;
    if (dist3(m, v) > 44 || !m.canSee(v)) { s.cd[i] = 0.4; continue; }
    s.cd[i] = i === 0 ? 2 : 2.2 + rand() * 1.6;
    const blue = i === 0 && rand() < 0.14;
    const [hx, hy, hz] = blightHead(m, i);
    const ax = v.pos.x - hx, ay = v.pos.y + (v.h || 1.8) * 0.5 - hy, az = v.pos.z - hz, ad = Math.hypot(ax, ay, az) || 1, sp = blue ? 7 : 15;
    const k = new BlightSkull(hx + ax / ad * 0.6, hy + ay / ad * 0.6, hz + az / ad * 0.6, ax / ad * sp, ay / ad * sp, az / ad * sp, blue, 'mob', m);
    G.entities.projectiles.push(k);
    sfx('fireball', m.pos, { vol: 0.9, pitch: blue ? 0.5 : 0.75 });
    if (G.net) G.net.projectile('sk', [k.pos.x, k.pos.y, k.pos.z, k.vel.x, k.vel.y, k.vel.z, blue ? 1 : 0]);
  }
  m.soundCd -= dt;
  if (m.soundCd <= 0) { m.soundCd = 5 + rand() * 6; sfx('wailer', m.pos, { vol: 1.2, pitch: 0.45 }); }
  if (m.pos.y < -30) m.removed = true;
  m.animate(dt, 0, 0);
}

// Snoutlings trade: toss them a gold ingot and they give something back
const BARTER = [
  ['shade_pearl', 1, 2, 8], ['obsidian', 1, 1, 8], ['string', 3, 9, 10], ['nether_quartz', 5, 12, 10], ['iron_ingot', 1, 3, 6], ['leather', 2, 4, 10],
  ['soul_sand', 2, 8, 8], ['gravel', 8, 16, 8], ['nether_brick', 2, 8, 8], ['blackstone', 8, 16, 8], ['magma_cream', 2, 6, 6], ['arrow', 6, 12, 6],
  ['flint', 2, 6, 6], ['gold_nugget', 4, 12, 6],
];
function snoutlingTick(m, dt) {
  if (m.barter > 0) {
    m.barter -= dt;
    m.target = null; m.retarget = 0.5; m.ai.walk = false;
    if (m.barter <= 0) {
      const total = BARTER.reduce((n, b) => n + b[3], 0);
      let r = rand() * total;
      const b = BARTER.find((x) => (r -= x[3]) < 0) || BARTER[0];
      G.entities.dropItem(ID[b[0]], b[1] + Math.floor(rand() * (b[2] - b[1] + 1)), m.pos.x, m.pos.y + 1.2, m.pos.z);
      sfx('snoutling', m.pos);
    }
    return;
  }
  if (m.angry || m.type !== 'snoutling') return;
  for (const it of G.entities.items) {
    if (it.removed || it.proxy || it.id !== ID.gold_ingot) continue;
    if (Math.hypot(it.pos.x - m.pos.x, it.pos.y - m.pos.y, it.pos.z - m.pos.z) > 2.2) continue;
    if (it.count > 1) it.count--; else it.removed = true;
    m.barter = 3;
    sfx('snoutling', m.pos, { pitch: 1.2 });
    break;
  }
}

// ---------------------------------------------------------------- animations
const anims = {
  wailer(m) { const P = m.model.parts; for (let i = 0; i < 9; i++) if (P['t' + i]) P['t' + i].rotation.x = Math.sin(m.age * 2 + i) * 0.25; },
  cinder(m) { const P = m.model.parts; P.rods.rotation.y = m.age * (m.angry ? 4 : 1.5); m.model.inner.position.y = Math.sin(m.age * 2) * 0.1; },
  strider(m, dt, hs) {
    const P = m.model.parts, sw = Math.sin(m.age * 6) * Math.min(1, hs) * 0.6;
    P.leg0.rotation.x = sw; P.leg1.rotation.x = -sw;
    m.model.inner.position.x = m.angry ? (rand() - 0.5) * 0.03 : 0;
  },
  bug(m, dt, hs) { const P = m.model.parts; for (let i = 0; i < 3; i++) { const s = Math.sin(m.age * 20 + i * 2) * Math.min(1, hs) * 0.4; P['legL' + i].rotation.y = s; P['legR' + i].rotation.y = -s; } },
  clamper(m, dt) {
    const want = m.proxy ? (m.angry ? 1 : 0) : (m.openT || 0);
    m.shown = (m.shown || 0) + (want - (m.shown || 0)) * Math.min(1, dt * 5);
    m.model.parts.hinge.rotation.x = -m.shown * 1.0;
    m.model.root.rotation.y = 0;
  },
  crystal(m) {
    const P = m.model.parts;
    P.core.rotation.x = m.age * 1.4; P.core.rotation.y = m.age * 1.9;
    m.model.inner.position.y = Math.sin(m.age * 2) * 0.12;
    if (!m.cage) {
      m.cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.2, 1.2, 1.2)), new THREE.LineBasicMaterial({ color: 0xffd8f4 }));
      m.model.root.add(m.cage);
    }
    m.cage.position.y = 0.75 + Math.sin(m.age * 2) * 0.12;
    m.cage.rotation.y = -m.age;
    tintModel(m.model.root, 1.4, m.hurtTime > 0 ? 0.6 : 0);
  },
  blight(m) {
    const P = m.model.parts;
    // (on a guest's screen: still filling up means it is waking)
    const waking = m.proxy ? (m.wakeSeen = (m.wakeSeen ?? m.hp < m.maxHp * 0.97) && m.hp < m.maxHp * 0.995 && !m.angry) : !!m.waking;
    m.model.inner.position.y = Math.sin(m.age * 2.2) * 0.12;
    P.headL.rotation.y = Math.sin(m.age * 1.3) * 0.5; P.headR.rotation.y = Math.sin(m.age * 1.1 + 2) * 0.5;
    P.headL.rotation.x = Math.sin(m.age * 0.9) * 0.2; P.headR.rotation.x = Math.sin(m.age * 1.2 + 1) * 0.2;
    P.tail.rotation.x = 0.55 + Math.sin(m.age * 2.2) * 0.15;
    const k = (m.baseScale || 1 / 16) * (waking ? 0.7 + 0.3 * (m.hp / m.maxHp) + Math.sin(m.age * 14) * 0.02 : 1);
    m.model.inner.scale.setScalar(k);
    if (waking) tintModel(m.model.root, 1 + 0.6 * Math.abs(Math.sin(m.age * 9)), 0.2);
    else if (m.angry && !m.dead) tintModel(m.model.root, 1.1 + 0.25 * Math.sin(m.age * 12), m.hurtTime > 0 ? 0.6 : 0.12);   // the shell shimmers
    if (!m.dead) {
      G.boss = { name: m.def.name, hp: Math.max(0, m.hp), max: m.maxHp, until: G.clock + 1 };
      const p = G.player;
      if (G.adv && p && !p.dead && Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z) < 40) G.adv.did('blight_wake');
    }
  },
  dragon(m) {
    const P = m.model.parts;
    const perched = m.angry;
    const f = perched ? 0.25 : Math.sin(m.age * 3.2) * 0.65;
    P.wing0.rotation.z = f; P.wing1.rotation.z = -f;
    P.wing0b.rotation.z = f * 0.9 - (perched ? 0.6 : 0); P.wing1b.rotation.z = -f * 0.9 + (perched ? 0.6 : 0);
    for (let i = 0; i < 6; i++) P['tail' + i].rotation.y = Math.sin(m.age * 1.8 - i * 0.7) * 0.18;
    P.jaw.rotation.x = perched ? 0.35 + Math.sin(m.age * 3) * 0.1 : 0.05;
    m.model.root.rotation.x = perched ? 0 : Math.atan2(-m.vel.y, Math.hypot(m.vel.x, m.vel.z) || 1) * 0.5;
    // healing beam from the nearest crystal
    const c = m.proxy ? nearestCrystal(m, 32) : m.healing;
    if (c && !m.dead) {
      if (!m.beam) {
        m.beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xff9cf0 }));
        R.scene.add(m.beam);
      }
      const pa = m.beam.geometry.attributes.position;
      pa.setXYZ(0, c.pos.x, c.pos.y + 0.8, c.pos.z); pa.setXYZ(1, m.pos.x, m.pos.y + 1.5, m.pos.z); pa.needsUpdate = true;
      m.beam.visible = true;
    } else if (m.beam) m.beam.visible = false;
    if (!m.dead) G.boss = { name: m.def.name, hp: Math.max(0, m.hp), max: m.maxHp, until: G.clock + 1 };
  },
};
const cleanup = (m) => { if (m.beam) { R.scene.remove(m.beam); m.beam.geometry.dispose(); m.beam.material.dispose(); m.beam = null; } };

// ---------------------------------------------------------------- mob types
Object.assign(MOB_TYPES, {
  wailer: { name: 'Wailer', hp: 10, w: 4, h: 4, speed: 2, hostile: true, flies: true, sight: 40, fireImmune: true, ai: wailerAI, animate: anims.wailer, anim: 'wailer', sound: 'wailer', pitch: 1, init: scaled(4),
    drops: [drop('wailer_tear', 0, 1), drop('gunpowder', 0, 2)] },
  cinder: { name: 'Cinder', hp: 20, w: 0.6, h: 1.8, speed: 2.3, hostile: true, sight: 16, fireImmune: true, ai: cinderAI, animate: anims.cinder, anim: 'cinder', sound: 'cinder', pitch: 1,
    drops: [drop('cinder_rod', 0, 1)] },
  magma_slime: { name: 'Magma Slime', hp: 16, w: 2, h: 2, speed: 2.4, hostile: true, slime: true, fireImmune: true, sound: 'slime', pitch: 0.7, drops: [], anim: 'slime' },
  snoutling: { name: 'Snoutling', hp: 16, w: 0.6, h: 1.95, speed: 2.6, hostile: true, goldLover: true, damage: 4, fireImmune: false, tick: snoutlingTick, sound: 'snoutling', pitch: 1, anim: 'human',
    init: (m) => holdItem(m, 'golden_sword'), drops: [drop('gold_nugget', 0, 2)] },
  snoutling_brute: { name: 'Snoutling Brute', hp: 50, w: 0.6, h: 1.95, speed: 2.7, hostile: true, always: true, persistent: true, damage: 9, axe: true, sound: 'snoutling', pitch: 0.7, anim: 'human',
    init: (m) => holdItem(m, 'golden_axe'), drops: [drop('golden_axe', 0, 1), drop('gold_ingot', 1, 3)] },
  rotting_snoutling: { name: 'Rotting Snoutling', hp: 20, w: 0.6, h: 1.95, speed: 2.4, hostile: true, neutral: true, groupAnger: true, damage: 4, fireImmune: true, sound: 'zombie', pitch: 1.2, anim: 'human',
    init: (m) => holdItem(m, 'golden_sword'), drops: [drop('rotten_flesh', 0, 1), drop('gold_nugget', 0, 1)] },
  tusker: { name: 'Tusker', hp: 40, w: 1.4, h: 1.4, speed: 2.4, hostile: true, damage: 5, launch: 6, sound: 'tusker', pitch: 1, anim: 'quad',
    drops: [drop('porkchop', 2, 4), drop('leather', 0, 1)] },
  rotting_tusker: { name: 'Rotting Tusker', hp: 40, w: 1.4, h: 1.4, speed: 2.5, hostile: true, damage: 5, launch: 6, fireImmune: true, sound: 'tusker', pitch: 0.8, anim: 'quad',
    drops: [drop('rotten_flesh', 1, 3)] },
  charred_skeleton: { name: 'Charred Skeleton', hp: 20, w: 0.7, h: 2.4, speed: 2.6, hostile: true, damage: 6, witherHit: true, fireImmune: true, sound: 'skeleton', pitch: 0.8, anim: 'human',
    init: (m) => { scaled(1.2)(m); holdItem(m, 'stone_sword'); }, drops: [drop('coal', 0, 1), drop('bone', 0, 2), drop('charred_skull', 0, 1, 0.04)] },
  strider: { name: 'Strider', hp: 20, w: 0.9, h: 1.7, speed: 1.6, fireImmune: true, ai: striderAI, animate: anims.strider, anim: 'strider', sound: 'strider', pitch: 1,
    drops: [drop('string', 2, 5)] },
  shademite: { name: 'Shademite', hp: 8, w: 0.4, h: 0.3, speed: 3.4, hostile: true, damage: 2, animate: anims.bug, anim: 'bug', sound: 'spider', pitch: 2, drops: [] },
  clamper: { name: 'Clamper', hp: 30, w: 1, h: 1, speed: 0, hostile: true, always: true, persistent: true, ai: clamperAI, animate: anims.clamper, anim: 'clamper', sound: 'clamper', pitch: 1,
    damageScale: (m) => ((m.openT || (m.angry ? 1 : 0)) > 0.3 ? 1 : 0.2), drops: [drop('clamper_shell', 0, 1, 0.5)] },
  void_crystal: { name: 'Void Crystal', hp: 1, w: 1.2, h: 1.6, speed: 0, persistent: true, ai: crystalAI, animate: anims.crystal, anim: 'crystal', sound: 'glass', pitch: 1,
    onDie: (m) => {
      m.removed = true;
      if (!isHost()) return;
      // a crystal blows up when hit, and hurts the dragon if it was healing from it
      const d = G.entities.mobs.find((x) => x.type === 'void_dragon' && !x.dead);
      if (d && d.healing === m) { d.invul = 0; d.hurt(10, m.pos.x, m.pos.z, false); }
      explode(m.pos.x, m.pos.y + 0.5, m.pos.z, 6);
    },
    drops: [] },
  void_dragon: { name: 'Void Dragon', hp: 200, w: 5, h: 3, speed: 11, persistent: true, heavy: true, boss: true, fireImmune: true, ai: dragonAI, animate: anims.dragon, anim: 'dragon', sound: 'dragon', pitch: 1,
    init: scaled(3), dispose: cleanup, drops: [] },
});
Object.assign(MOB_TYPES, {
  blight: { name: 'The Blight', hp: 300, w: 1.1, h: 3.3, speed: 5, hostile: true, always: true, persistent: true, heavy: true, boss: true, flies: true, fireImmune: true, blastProof: true, undead: true, xp: 50,
    ai: blightAI, animate: anims.blight, anim: 'blight', sound: 'wailer', pitch: 0.45, init: scaled(1.9),
    // behind its shell (at half health) nothing shot or thrown gets through; nothing at all while it wakes
    damageScale: (m, fx) => (m.waking ? 0 : m.angry && fx && (fx.arrow || fx.bolt || fx.shot || fx.fb) ? 0 : 1),
    onDie: (m) => { if (isHost()) { const msg = 'The Blight has been destroyed!'; if (G.net) G.net.announce(msg); else G.ui.toast(msg); } },
    drops: [drop('blight_star', 1, 1)] },
  cave_spider: { ...MOB_TYPES.spider, name: 'Cave Spider', hp: 12, w: 0.8, h: 0.55, damage: 2, poisonHit: true, pitch: 1.4, init: scaled(0.62), arthropod: true },
  mooshroom: { ...MOB_TYPES.cow, name: 'Mooshroom' },
});
// What each mob counts as for Smite (undead), Bane of Arthropods and Impaling, and the experience the
// special ones leave (other monsters leave 5, animals 1 to 3)
for (const k of ['zombie', 'husk', 'drowned', 'zombie_villager', 'skeleton', 'stray', 'gloomwing', 'charred_skeleton', 'rotting_snoutling', 'rotting_tusker']) MOB_TYPES[k].undead = true;
for (const k of ['spider', 'shademite']) MOB_TYPES[k].arthropod = true;
for (const k of ['drowned', 'clamper']) MOB_TYPES[k].aquatic = true;
Object.assign(MOB_TYPES.cinder, { xp: 10 });
Object.assign(MOB_TYPES.snoutling_brute, { xp: 20 });
Object.assign(MOB_TYPES.shademite, { xp: 3 });
Object.assign(MOB_TYPES.strider, { xp: [1, 2] });
Object.assign(MOB_TYPES.void_crystal, { xp: 0 });
Object.assign(MOB_TYPES.void_dragon, { xp: 1000 });

// Drops with a chance (the charred skull) are rolled here, since the base code only knows min/max
for (const t of Object.values(MOB_TYPES)) {
  for (const d of t.drops || []) if (d.chance !== undefined && d.chance < 1) { d.roll = d.chance; d.min = 1; d.max = 1; }
}

// ---------------------------------------------------------------- spawning
function floorNear(w, x, y, z) {
  for (let k = 0; k < 28; k++, y--) {
    if (y < 2) return -1;
    if (w.getBlock(x, y, z) === 0 && w.getBlock(x, y + 1, z) === 0 && w.isSolid(x, y - 1, z) && w.getBlock(x, y - 1, z) !== B.lava) return y;
  }
  return -1;
}

export function inFortress(w, x, y, z) {
  for (const s of structuresNear(w, x, z, 90)) {
    const f = s.type === 'fortress' && s.plan && s.plan.fortress;
    if (f && x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ && Math.abs(y - f.y) < 14) return true;
  }
  return false;
}

function spawnNether(E, w, p) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const a = rand() * TAU, d = 24 + rand() * 24;
    const x = Math.floor(p.pos.x + Math.cos(a) * d), z = Math.floor(p.pos.z + Math.sin(a) * d);
    if (!w.getChunk(x >> 4, z >> 4)) continue;
    if (rand() < 0.1) {
      // striders walk the lava sea
      if (E.mobs.filter((m) => m.type === 'strider').length >= 5) continue;
      for (let y = 45; y > NETHER_LAVA - 3; y--) {
        if (w.getBlock(x, y, z) === B.lava && w.getBlock(x, y + 1, z) === 0 && w.getBlock(x, y + 2, z) === 0) { E.spawnMob('strider', x + 0.5, y + 1, z + 0.5); return; }
      }
      continue;
    }
    const y = floorNear(w, x, Math.min(CH - 6, Math.floor(p.pos.y + (rand() - 0.5) * 40)), z);
    if (y < 0) continue;
    if (w.getLight(x, y, z)[1] > 11) continue;
    const biome = netherBiome(w, x, z);
    const r = rand() * 100;
    let type;
    if (inFortress(w, x, y, z)) type = r < 35 ? 'cinder' : r < 70 ? 'charred_skeleton' : r < 85 ? 'magma_slime' : 'skeleton';
    else if (biome === NB.CRIMSON) type = r < 45 ? 'snoutling' : r < 80 ? 'tusker' : 'rotting_snoutling';
    else if (biome === NB.WARPED) type = 'shade';
    else if (biome === NB.SOUL) type = r < 55 ? 'skeleton' : r < 85 ? 'wailer' : 'shade';
    else if (biome === NB.BASALT) type = r < 75 ? 'magma_slime' : 'wailer';
    else type = r < 45 ? 'rotting_snoutling' : r < 60 ? 'wailer' : r < 72 ? 'magma_slime' : r < 90 ? 'snoutling' : r < 97 ? 'shade' : 'rotting_tusker';
    let sy = y;
    if (type === 'wailer') {
      sy = y + 5;
      if (boxBlocked(w, x + 0.5, sy, z + 0.5, 2.2, 4.4) || E.mobs.filter((m) => m.type === 'wailer').length >= 2) continue;
    } else if (boxBlocked(w, x + 0.5, y, z + 0.5, MOB_TYPES[type].w / 2, MOB_TYPES[type].h)) continue;
    const n = type === 'rotting_snoutling' ? 1 + (rand() * 2 | 0) : 1;
    for (let i = 0; i < n; i++) E.spawnMob(type, x + 0.5 + (i ? (rand() - 0.5) * 3 : 0), sy, z + 0.5 + (i ? (rand() - 0.5) * 3 : 0));
    return;
  }
}

function spawnEnd(E, w, p) {
  if (E.mobs.filter((m) => m.type === 'shade' && !m.dead).length >= 14) return;
  for (let attempt = 0; attempt < 4; attempt++) {
    const a = rand() * TAU, d = 16 + rand() * 30;
    const x = Math.floor(p.pos.x + Math.cos(a) * d), z = Math.floor(p.pos.z + Math.sin(a) * d);
    if (!w.getChunk(x >> 4, z >> 4)) continue;
    const y = floorNear(w, x, Math.min(CH - 6, Math.floor(p.pos.y) + 12), z);
    if (y < 0 || w.getBlock(x, y - 1, z) !== B.end_stone || w.getBlock(x, y + 2, z) !== 0) continue;
    E.spawnMob('shade', x + 0.5, y, z + 0.5);
    return;
  }
}

Entities.prototype.spawnDim = function () {
  const w = G.world;
  const alive = players().filter((q) => !q.dead);
  if (!alive.length) return;
  const p = alive[(rand() * alive.length) | 0];
  const hostiles = this.mobs.reduce((n, m) => n + (m.def.hostile && !m.persistent ? 1 : 0), 0);
  if (w.dim === 'nether') { if (hostiles < 9 + 5 * (alive.length - 1) && rand() < 0.45) spawnNether(this, w, p); }
  else if (w.dim === 'end' && hostiles < 20 + 8 * (alive.length - 1)) spawnEnd(this, w, p);
};

// Monster spawners (cinders in fortresses, shademites in strongholds)
const SPAWNER_TYPES = ['cinder', 'shademite', 'zombie', 'skeleton', 'spider', 'cave_spider'];
Entities.prototype.tickSpawners = function () {
  const w = G.world;
  if (!w.spawners || !w.spawners.size) return;
  const ps = players().filter((q) => !q.dead);
  for (const [key, st] of w.spawners) {
    const [x, y, z] = key.split(',').map(Number);
    if (!ps.some((q) => Math.hypot(q.pos.x - x, q.pos.y - y, q.pos.z - z) < 16)) continue;
    if (w.getBlock(x, y, z) !== B.spawner) { w.spawners.delete(key); continue; }
    st.t = (st.t ?? 5) - 1;
    if (st.t > 0) continue;
    st.t = 10 + rand() * 20;
    const type = SPAWNER_TYPES[w.getMeta(x, y, z) % SPAWNER_TYPES.length];
    if (this.mobs.filter((m) => m.type === type && Math.hypot(m.pos.x - x, m.pos.z - z) < 9).length >= 6) continue;
    for (let k = 0; k < 3; k++) {
      const sx = x + 0.5 + (rand() - 0.5) * 7, sz = z + 0.5 + (rand() - 0.5) * 7, sy = y + Math.floor(rand() * 3) - 1;
      const def = MOB_TYPES[type];
      if (boxBlocked(w, sx, sy, sz, def.w / 2, def.h) || !w.isSolid(Math.floor(sx), sy - 1, Math.floor(sz))) continue;
      this.spawnMob(type, sx, sy, sz);
      for (let i = 0; i < 8; i++) this.particles.spawn(sx, sy + 0.5, sz, (rand() - 0.5) * 2, rand() * 2, (rand() - 0.5) * 2, 0.4, 0.4, 0.4, 0.1, 0.6, -0.05);
    }
  }
};

// The dragon and its crystals appear when their part of the End first loads
Entities.prototype.onEndChunk = function (chunk) {
  const w = G.world;
  const stored = (key) => { for (const st of w.stored.values()) if ((st.m || []).some((d) => d.k === key)) return true; return false; };
  const has = (key) => w.deadMobs.has(key) || this.mobs.some((m) => m.key === key) || stored(key);
  if (chunk.cx === 0 && chunk.cz === 0 && !has('dragon')) this.spawnMob('void_dragon', 0.5, 95, 0.5, { key: 'dragon', persistent: true });
  for (const pl of endPillars(w)) {
    if ((pl.x >> 4) !== chunk.cx || (pl.z >> 4) !== chunk.cz) continue;
    const key = 'crystal:' + pl.i;
    if (!has(key)) this.spawnMob('void_crystal', pl.x + 0.5, pl.top + 2, pl.z + 0.5, { key, persistent: true });
  }
};
