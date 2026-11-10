// Warheads (1.11.11; craters in land nobody has loaded wait until it is, since 1.12.3). A silo's missile sets how far it reaches and how much shooting it takes to bring down;
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
// A crater is a bowl (it digs a little less deep than it reaches across) with a ragged edge that comes from its
// seed, so it is the same wherever it is carved. K is { x, y, z, r, s (seed), f (fire) }, x y z whole numbers.
const KEEP = (id) => !id || id === B.water || id === B.bedrock || id === B.obsidian || BLOCKS[id].blastProof || BLOCKS[id].hardness < 0;
const reachOf = (K) => (K.f ? Math.ceil(K.r * 1.6) + 1 : Math.ceil(K.r * 1.15) + 1);   // (how far out it changes anything)
function inBowl(K, X, Y, Z) {
  const dx = X - K.x, dy = Y - K.y, dz = Z - K.z, r = K.r;
  const d = Math.hypot(dx, dy < 0 ? dy / 0.8 : dy, dz);
  return d <= r * 1.15 && d <= r * (0.82 + 0.33 * hash3(K.s, X, Y, Z));
}
const editsOf = (w, c) => { const k = ckey(c.cx, c.cz); let e = w.edits.get(k); if (!e) { e = new Map(); w.edits.set(k, e); } return e; };

// The part of a crater that lies in one chunk. `late`: the chunk is only now being made (the crater was there
// first), so whatever has been built or dug there since stays as it is, and nothing is lit or counted yet.
// Returns the places where fires start (when it is not late).
function carveChunk(w, c, K, late) {
  const edits = editsOf(w, c), x0 = c.cx * 16, z0 = c.cz * 16, r = K.r, R = Math.ceil(r * 1.15);
  const fires = [];
  let changed = false;
  const clear = (X, Y, Z, i, id, to = 0) => {
    c.blocks[i] = to;
    if (c.meta) c.meta[i] = 0;
    edits.set(i, to);
    if (!changed) { changed = true; w.packed.delete(ckey(c.cx, c.cz)); }
    if (late) return;
    if (BLOCKS[id].light) c.emitters--;
    const key = `${X},${Y},${Z}`;
    if (BLOCKS[id].sign) w.signs.delete(key);
    w.containers.delete(key);
    w.fires.delete(key); w.crops.delete(key); w.spawners.delete(key); w.beacons.delete(key);
    if (id === B.command_block) forgetCmd(X, Y, Z);
  };
  const xa = Math.max(x0, K.x - R), xb = Math.min(x0 + 15, K.x + R), za = Math.max(z0, K.z - R), zb = Math.min(z0 + 15, K.z + R);
  for (let Y = Math.max(1, K.y - R); Y <= Math.min(CH - 2, K.y + R); Y++) for (let Z = za; Z <= zb; Z++) for (let X = xa; X <= xb; X++) {
    const i = (Y << 8) | ((Z & 15) << 4) | (X & 15), id = c.blocks[i];
    if (KEEP(id) || (late && edits.has(i)) || !inBowl(K, X, Y, Z)) continue;
    clear(X, Y, Z, i, id);
  }
  // scorched land round it: the grass burnt off, the trees stripped, and (where the world runs) fires
  if (K.f) {
    const R2 = reachOf(K), out = r * 1.6;
    for (let Z = Math.max(z0, K.z - R2); Z <= Math.min(z0 + 15, K.z + R2); Z++) for (let X = Math.max(x0, K.x - R2); X <= Math.min(x0 + 15, K.x + R2); X++) {
      const d = Math.hypot(X - K.x, Z - K.z);
      if (d > out || d < r * 0.7) continue;
      for (let Y = Math.min(CH - 3, K.y + R2); Y > Math.max(1, K.y - R2); Y--) {
        const i = (Y << 8) | ((Z & 15) << 4) | (X & 15), id = c.blocks[i];
        if (!id) continue;
        if (late && edits.has(i)) break;
        const def = BLOCKS[id];
        if (/leaves/.test(def.key) || (!def.solid && def.hardness === 0 && id !== B.water && id !== B.lava)) { if (d < r * 1.3 || hash3(K.s ^ 7, X, Y, Z) < 0.6) clear(X, Y, Z, i, id); continue; }
        if (id === B.grass || id === B.snowy_grass) clear(X, Y, Z, i, id, B.dirt);
        if (def.solid && hash3(K.s ^ 3, X, Y, Z) < 0.07) fires.push([X, Y + 1, Z]);
        break;
      }
    }
  }
  if (changed && !late) for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
    const q = w.getChunk(c.cx + ox, c.cz + oz);
    if (q) { q.dirty = true; q.simDirty = true; }   // (drawn and lit again, with its neighbours)
  }
  return fires;
}

// Carves a crater. The land that is loaded is carved now. Land nobody has loaded is not made for it (a nuke
// reaches some sixty chunks: making them all at once stopped the game for seconds): the crater is kept with the
// world (flags.craters, with the chunks it still has to be carved in) and each of those is carved as it is made,
// whenever someone first goes there. What had been built there before goes now; what is built after stays.
const MAX_WAITING = 200;
export function crater(x, y, z, r, seed, fire) {
  const w = G.world;
  if (!w || !(r > 0)) return;
  const K = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), r: Math.min(r, 40), s: seed >>> 0, f: fire ? 1 : 0 };
  const R2 = reachOf(K), left = [], fires = [];
  for (let cx = (K.x - R2) >> 4; cx <= (K.x + R2) >> 4; cx++) for (let cz = (K.z - R2) >> 4; cz <= (K.z + R2) >> 4; cz++) {
    const k = ckey(cx, cz), c = w.chunks.get(k);
    if (c) { fires.push(...carveChunk(w, c, K, false)); continue; }
    left.push(k);
    // (what people built or dug there before, known from the save without the land: gone where the bowl is)
    const e = w.edits.get(k);
    if (e) for (const [i, v] of e) {
      const X = cx * 16 + (i & 15), Y = i >> 8, Z = cz * 16 + ((i >> 4) & 15);
      if (KEEP(v & 255) || !inBowl(K, X, Y, Z)) continue;
      e.set(i, 0);
      w.packed.delete(k);
      const key = `${X},${Y},${Z}`;
      w.signs.delete(key); w.containers.delete(key);
      if ((v & 255) === B.command_block) forgetCmd(X, Y, Z);
    }
  }
  if (left.length) {
    const list = Array.isArray(w.flags.craters) ? w.flags.craters : (w.flags.craters = []);
    list.push({ ...K, left });
    if (list.length > MAX_WAITING) list.splice(0, list.length - MAX_WAITING);
  }
  if (!isGuest()) for (const [X, Y, Z] of fires) if (w.getBlock(X, Y, Z) === 0) G.game.ignite(X, Y, Z);
  if (G.game.afterCrater) G.game.afterCrater();
}
// A chunk has just been made (World.finishChunk, after the saved changes are put in): any crater waiting for it
// is carved in it now
export function carveWaiting(w, c) {
  const list = w.flags && w.flags.craters;
  if (!Array.isArray(list) || !list.length) return;
  const k = ckey(c.cx, c.cz);
  for (let n = 0; n < list.length; n++) {
    const K = list[n], at = Array.isArray(K.left) ? K.left.indexOf(k) : -1;
    if (at < 0) continue;
    K.left.splice(at, 1);
    if ([K.x, K.y, K.z, K.r].every(Number.isFinite) && K.r > 0 && K.r <= 40) carveChunk(w, c, K, true);
    if (!K.left.length) list.splice(n--, 1);
  }
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
    // (whole numbers, so it is carved at the very same blocks for everyone)
    const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
    crater(cx, cy, cz, W.r, seed, !!W.fire);
    if (G.net && G.net.role === 'host') G.net.send({ k: 'crater', x: cx, y: cy, z: cz, r: W.r, s: seed, f: W.fire ? 1 : 0 });
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
