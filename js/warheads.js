// Warheads (1.11.11). A silo's missile sets how far it reaches and how much shooting it takes to bring down;
// its warhead sets how big the bang is. Concussion is the old one (hurts, breaks nothing); every other warhead
// blows a crater in the land, up to a nuke, which leaves a hole you could lose a village in and a mushroom cloud.
//
// A crater is carved all at once, straight into the chunks (a nuke takes out a couple of hundred thousand blocks:
// breaking them one by one, each sent to everyone, would stop the game). Whoever runs the world carves it and
// tells everyone else where and how big with one 'crater' message; they carve the same one, from the same seed.
// Land that is not loaded where it lands is made first, so a missile sent far away still leaves its mark there.
// Nothing comes out of a crater as items.
import * as THREE from 'three';
import { G } from './game.js';
import { B, BLOCKS } from './blocks.js';
import { CH } from './constants.js';
import { ckey } from './world.js';
import { hash3 } from './noise.js';
import { R } from './render.js';
import { sfx } from './audio.js';
import { explosionFx, explosionDamage } from './entities.js';
import { flashAt } from './planes.js';
import { forgetCmd } from './cmdblocks.js';

const rand = Math.random;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isGuest = () => !!(G.net && G.net.role === 'client');

// r: the crater's radius in blocks (0: none). tnt: what it costs in Survival.
export const WARHEADS = [
  { key: 'concussion', name: 'Concussion', about: 'hurts everything near, breaks no blocks', r: 0, tnt: 0 },
  { key: 'conventional', name: 'Conventional', about: 'a small crater', r: 4, tnt: 1 },
  { key: 'high_explosive', name: 'High Explosive', about: 'a big crater', r: 7, tnt: 4 },
  { key: 'thermobaric', name: 'Thermobaric', about: 'a huge crater and fire all round it', r: 11, tnt: 12, fire: true },
  { key: 'tactical_nuke', name: 'Tactical Nuke', about: 'a nuclear blast: a massive crater, a mushroom cloud', r: 20, tnt: 32, fire: true, nuke: true },
  { key: 'nuke', name: 'Nuke', about: 'the biggest there is: it flattens everything for a long way', r: 34, tnt: 64, fire: true, nuke: true },
];
export const warheadOf = (i) => WARHEADS[clamp(i | 0, 0, WARHEADS.length - 1)];

// ---------------------------------------------------------------- the crater
const KEEP = (id) => !id || id === B.water || id === B.bedrock || id === B.obsidian || BLOCKS[id].blastProof || BLOCKS[id].hardness < 0;
export function crater(x, y, z, r, seed, fire) {
  const w = G.world;
  if (!w || !(r > 0)) return 0;
  r = Math.min(r, 40);
  const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z), R2 = Math.ceil(r * 1.6) + 1;
  // the land there, made if nobody has it loaded (a silo's missile has it made on its way: see prepareCrater)
  const RC = Math.ceil(r * 1.15) + 1;
  for (let cx = (bx - RC) >> 4; cx <= (bx + RC) >> 4; cx++) for (let cz = (bz - RC) >> 4; cz <= (bz + RC) >> 4; cz++) if (!w.getChunk(cx, cz)) w.generate(cx, cz);
  const touched = new Set();
  const editsOf = (c) => { const k = ckey(c.cx, c.cz); let e = w.edits.get(k); if (!e) { e = new Map(); w.edits.set(k, e); } return e; };
  const clear = (c, X, Y, Z, to = 0) => {
    const i = (Y << 8) | ((Z & 15) << 4) | (X & 15), id = c.blocks[i];
    c.blocks[i] = to;
    if (c.meta) c.meta[i] = 0;
    if (BLOCKS[id].light) c.emitters--;
    editsOf(c).set(i, to);
    const key = `${X},${Y},${Z}`;
    if (BLOCKS[id].sign) w.signs.delete(key);
    w.containers.delete(key);
    w.fires.delete(key); w.crops.delete(key); w.spawners.delete(key); w.beacons.delete(key);
    if (id === B.command_block) forgetCmd(X, Y, Z);
    touched.add(c);
  };
  const R = Math.ceil(r * 1.15);
  let n = 0;
  for (let dy = -R; dy <= R; dy++) {
    const Y = by + dy;
    if (Y < 1 || Y >= CH - 1) continue;
    // (a bowl: it digs a little less deep than it reaches across)
    const sy = dy < 0 ? dy / 0.8 : dy;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const d = Math.hypot(dx, sy, dz);
      if (d > r * 1.15) continue;
      const X = bx + dx, Z = bz + dz;
      if (d > r * (0.82 + 0.33 * hash3(seed, X, Y, Z))) continue;
      const c = w.chunks.get(ckey(X >> 4, Z >> 4));
      if (!c || KEEP(c.blocks[(Y << 8) | ((Z & 15) << 4) | (X & 15)])) continue;
      clear(c, X, Y, Z);
      n++;
    }
  }
  // scorched land round it: the grass burnt off, the trees stripped, and (on whoever runs the world) fires
  if (fire) {
    const out = r * 1.6;
    const fires = [];
    for (let dx = -R2; dx <= R2; dx++) for (let dz = -R2; dz <= R2; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > out || d < r * 0.7) continue;
      const X = bx + dx, Z = bz + dz;
      const c = w.chunks.get(ckey(X >> 4, Z >> 4));
      if (!c) continue;
      for (let Y = Math.min(CH - 3, by + R2); Y > Math.max(1, by - R2); Y--) {
        const i = (Y << 8) | ((Z & 15) << 4) | (X & 15), id = c.blocks[i];
        if (!id) continue;
        const def = BLOCKS[id];
        if (/leaves/.test(def.key) || (!def.solid && def.hardness === 0 && id !== B.water && id !== B.lava)) { if (d < r * 1.3 || hash3(seed ^ 7, X, Y, Z) < 0.6) clear(c, X, Y, Z); continue; }
        if (id === B.grass || id === B.snowy_grass) clear(c, X, Y, Z, B.dirt);
        if (def.solid && hash3(seed ^ 3, X, Y, Z) < 0.07) fires.push([X, Y + 1, Z]);
        break;
      }
    }
    if (!isGuest()) for (const [X, Y, Z] of fires) if (w.getBlock(X, Y, Z) === 0) G.game.ignite(X, Y, Z);
  }
  // the chunks it went through (and their neighbours) are drawn and lit again
  for (const c of touched) for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
    const q = w.getChunk(c.cx + ox, c.cz + oz);
    if (q) { q.dirty = true; q.simDirty = true; }
  }
  if (G.game.afterCrater) G.game.afterCrater(bx, by, bz, R2);
  return n;
}

// While a missile is on its way, the land where it will land is made a chunk at a time (so it is not all made at
// once when it gets there)
export function prepareCrater(x, z, r) {
  const w = G.world, RC = Math.ceil(r * 1.15) + 1, bx = Math.floor(x), bz = Math.floor(z);
  if (!w || !(r > 0)) return;
  for (let cx = (bx - RC) >> 4; cx <= (bx + RC) >> 4; cx++) for (let cz = (bz - RC) >> 4; cz <= (bz + RC) >> 4; cz++) if (!w.getChunk(cx, cz)) { w.generate(cx, cz); return; }
}

// ---------------------------------------------------------------- going off
// Where the world runs: the crater (sent to everyone), the damage, and the show
export function detonate(x, y, z, wh, blast, self = null) {
  const W = warheadOf(wh);
  const hurt = W.r ? Math.max(blast, W.r * (W.nuke ? 1.6 : 1.15)) : blast;
  explosionFx(x, y, z, Math.min(hurt, 12));
  if (G.net) G.net.explosion(x, y, z, Math.min(hurt, 12));
  if (W.r) {
    const seed = (Math.random() * 4294967296) >>> 0;
    crater(x, y, z, W.r, seed, !!W.fire);
    if (G.net && G.net.role === 'host') G.net.send({ k: 'crater', x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, z: Math.round(z * 10) / 10, r: W.r, s: seed, f: W.fire ? 1 : 0 });
  }
  explosionDamage(x, y, z, hurt, null, true, self);
  boomFx(x, y, z, W.nuke ? W.r : hurt, !!W.nuke);
  if (G.net) G.net.vfx('bb', [x, y, z, W.nuke ? W.r : hurt, W.nuke ? 1 : 0]);
}
// (a crater someone else's world made, carved here the same)
export function craterMsg(d) {
  const r = +d.r;
  if (![d.x, d.y, d.z, r].every(Number.isFinite) || r <= 0 || r > 40) return;
  crater(+d.x, +d.y, +d.z, r, d.s >>> 0, !!d.f);
}

// ---------------------------------------------------------------- the show
export function boomFx(x, y, z, r, nuke) {
  if (nuke) { nukeFx(x, y, z, r); return; }
  flashAt(x, y + 1, z, r * 2.5, r * 4, 0.9);
  const P = G.entities.particles;
  for (let i = 0; i < 90; i++) {   // a fireball
    const a = rand() * Math.PI * 2, e = rand() * 1.2, sp = 4 + rand() * r * 1.4;
    P.spawn(x, y + 0.5, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 2, Math.sin(a) * Math.cos(e) * sp, 1, 0.35 + rand() * 0.5, 0.05, 0.5 + rand() * 0.6, 0.4 + rand() * 0.5, -0.3);
  }
  const shade = 0.3 + 0.7 * clamp(G.daylight ?? 1, 0, 1);
  for (let i = 0; i < 60; i++) {   // and a towering cloud of smoke
    const v = (0.35 + rand() * 0.2) * shade;
    P.spawn(x + (rand() - 0.5) * r, y + rand() * r * 0.6, z + (rand() - 0.5) * r, (rand() - 0.5) * 4, 3 + rand() * 6, (rand() - 0.5) * 4, v, v, v, 0.9 + rand() * 0.9, 2.5 + rand() * 2, -0.25, 0.5);
  }
  const pd = Math.hypot(G.player.pos.x - x, G.player.pos.y - y, G.player.pos.z - z);
  G.shake = Math.max(G.shake || 0, Math.max(0, 1 - pd / (r * 10)) * 1.6);
  sfx('explode', { x, y, z }, { vol: 2, pitch: 0.6 });
}

// A nuke: a blinding flash, a fireball that swells and rises into the cap of a mushroom cloud on a column of
// smoke, a shock ring racing out along the ground, and the sound arriving late if you are far off
const CLOUDS = [];
const sphere = new THREE.IcosahedronGeometry(1, 1);
// (smoke: lit from above, dark underneath, so it reads as a solid billow even without the world's lighting)
const puff = (() => {
  const g = new THREE.IcosahedronGeometry(1, 1), n = g.attributes.normal, col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) { const k = 0.5 + 0.5 * (0.5 + 0.5 * n.getY(i)) + 0.06 * n.getX(i); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
})();
function smokeBlob(color) {
  return new THREE.Mesh(puff, new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, opacity: 1, depthWrite: true, fog: false }));
}
const ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
function blob(color, opacity, additive) {
  return new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: !additive, ...(additive ? { blending: THREE.AdditiveBlending } : {}) }));
}
function nukeFx(x, y, z, r) {
  flashAt(x, y + r * 0.5, z, r * 6, r * 14, 1.6);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const fire = blob(0xffd27a, 1, true), core = blob(0xffffff, 1, true);
  const stem = [], cap = [];
  for (let i = 0; i < 9; i++) { const b = smokeBlob(i % 2 ? 0x9a8878 : 0xa89686); stem.push(b); g.add(b); }
  for (let i = 0; i < 14; i++) { const b = smokeBlob(i % 3 ? 0xb4a493 : 0xc8b8a6); b.userData.a = (i / 14) * Math.PI * 2; b.userData.k = 0.8 + rand() * 0.4; b.userData.up = rand(); cap.push(b); g.add(b); }
  const glow = blob(0xff7a22, 0.8, true);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
  ring.position.y = 1;
  g.add(fire, core, glow, ring);
  R.scene.add(g);
  CLOUDS.push({ g, t: 0, r, fire, core, glow, stem, cap, ring });
  // the flash, the shake and the sound (which takes its time to get here)
  const pd = Math.hypot(G.player.pos.x - x, G.player.pos.z - z);
  whiteout(clamp(1.3 - pd / (r * 12), 0, 1));
  const delay = Math.min(6, pd / 340);
  setTimeout(() => {
    G.shake = Math.max(G.shake || 0, clamp(1.6 - pd / (r * 14), 0.15, 1.6) * 2);
    sfx('explode', { x, y, z }, { vol: 3, pitch: 0.35 });
    sfx('explode', { x, y, z }, { vol: 2.5, pitch: 0.5 });
  }, delay * 1000);
  const P = G.entities.particles;
  for (let i = 0; i < 160; i++) {
    const a = rand() * Math.PI * 2, e = rand() * 0.9, sp = 6 + rand() * r * 1.2;
    P.spawn(x, y + 1, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 3, Math.sin(a) * Math.cos(e) * sp, 1, 0.4 + rand() * 0.5, 0.08, 0.7 + rand() * 0.9, 0.8 + rand() * 0.8, -0.2);
  }
}
let white = null;
function whiteout(k) {
  if (k <= 0.02) return;
  if (!white) { white = document.createElement('div'); white.style.cssText = 'position:fixed;inset:0;background:#fff;pointer-events:none;z-index:50;opacity:0;transition:opacity 2.5s ease-out'; document.body.appendChild(white); }
  white.style.transition = 'none';
  white.style.opacity = String(Math.min(0.95, k));
  requestAnimationFrame(() => requestAnimationFrame(() => { white.style.transition = 'opacity 2.8s ease-out'; white.style.opacity = '0'; }));
}
export function tickWarheads(dt) {
  for (let i = CLOUDS.length - 1; i >= 0; i--) {
    const c = CLOUDS[i];
    c.t += dt;
    const t = c.t, r = c.r;
    const rise = Math.min(1, t / 9), top = r * (0.4 + 3.4 * (1 - (1 - rise) * (1 - rise)));
    // the fireball: white hot, swelling, then rising and cooling into the cap
    const fb = r * (0.25 + 0.75 * Math.min(1, t / 1.2));
    c.fire.scale.setScalar(fb);
    c.fire.position.y = Math.max(fb * 0.6, top * 0.85);
    c.fire.material.opacity = clamp(1 - (t - 1.5) / 5, 0, 1);
    c.fire.material.color.setRGB(1, clamp(0.85 - t * 0.08, 0.35, 1), clamp(0.5 - t * 0.12, 0.05, 1));
    c.core.scale.setScalar(fb * 0.7);
    c.core.position.y = c.fire.position.y;
    c.core.material.opacity = clamp(1 - t / 1.4, 0, 1);
    // the column of smoke, and the cap rolling out over the top of it (glowing orange underneath at first)
    const fade = clamp((32 - t) / 8, 0, 1), show = (b, k) => { const o = k * fade; b.material.opacity = o; b.material.depthWrite = o > 0.98; b.visible = o > 0.01; };
    const hot = clamp(1 - (t - 1) / 7, 0, 1);
    c.stem.forEach((b, k) => {
      const f = (k + 0.5) / c.stem.length, wob = 1 + 0.12 * Math.sin(k * 2.1 + t * 0.7);
      b.position.set(Math.sin(k * 1.3) * r * 0.04, top * f * 0.92, Math.cos(k * 1.9) * r * 0.04);
      b.scale.set(r * (0.22 + 0.1 * (1 - f) + 0.08 * f) * wob, top / c.stem.length * 0.75, r * (0.22 + 0.1 * (1 - f) + 0.08 * f) / wob);
      b.material.color.setRGB(0.6 + 0.4 * hot * (1 - f), 0.53 + 0.15 * hot * (1 - f), 0.47);
      show(b, clamp((t - 0.6) / 2, 0, 1));
    });
    const spread = r * (0.6 + 1.1 * Math.min(1, t / 12));
    c.cap.forEach((b) => {
      const a = b.userData.a + t * 0.04, k = b.userData.k;
      b.position.set(Math.cos(a) * spread * 0.55, top + (b.userData.up - 0.3) * r * 0.35, Math.sin(a) * spread * 0.55);
      b.scale.set(spread * 0.5 * k, r * 0.42 * k, spread * 0.5 * k);
      b.material.color.setRGB(0.72 + 0.28 * hot, 0.62 + 0.1 * hot, 0.55 - 0.2 * hot);
      show(b, clamp((t - 0.8) / 2, 0, 1));
    });
    // glowing from within for a while
    c.glow.position.y = top * 0.9;
    c.glow.scale.set(spread * 0.6, r * 0.3, spread * 0.6);
    c.glow.material.opacity = 0.6 * clamp(1 - (t - 1) / 6, 0, 1);
    // the shock ring
    const rr = r * 7 * Math.min(1, t / 2.2);
    c.ring.scale.setScalar(Math.max(0.01, rr));
    c.ring.material.opacity = 0.8 * clamp(1 - t / 2.4, 0, 1);
    if (t > 32) {
      R.scene.remove(c.g);
      c.g.traverse((o) => { if (o.material) o.material.dispose(); });
      CLOUDS.splice(i, 1);
    }
  }
}
export function clearWarheads() {
  for (const c of CLOUDS) { R.scene.remove(c.g); c.g.traverse((o) => { if (o.material) o.material.dispose(); }); }
  CLOUDS.length = 0;
}
// (someone else's blast, seen here)
const otherVfx = G.onVfx;
G.onVfx = (t, a) => {
  if (t === 'bb') { if (Array.isArray(a) && a.slice(0, 4).every(Number.isFinite) && a[3] > 0 && a[3] <= 80) boomFx(a[0], a[1], a[2], a[3], !!a[4]); return; }
  if (otherVfx) otherVfx(t, a);
};
