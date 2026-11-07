// Planes (1.12): a propeller plane and a fighter jet. They need no fuel. The pilot steers by looking (the plane
// turns after the view as fast as it can), W and S open and close the throttle, the guns fire on the attack
// button, missiles on the use button and flares on X (and buttons of their own on a touch screen).
// What they fire is loaded into the plane's own nine slots (E while sitting in it): bullets, missiles, flares.
//
// A missile fired with a lock (hold a target in the middle of the view until the box turns red) chases it;
// a flare dropped near a missile may draw it off. In multiplayer the one who fires a missile works out what it
// hits; everyone else sees a copy ('vfx' messages through the host), and flares are sent the same way, so the
// copy and the real missile are drawn off by the same flares.
import * as THREE from 'three';
import { G } from './game.js';
import { ID, ITEMS } from './blocks.js';
import { sfx } from './audio.js';
import { R } from './render.js';
import { moveBox, raycast, rayBox } from './physics.js';
import { BLOCKS } from './blocks.js';
import { cleanEnch } from './enchant.js';
import { MOB_TYPES, MODELS, Entities, rect, explosionFx, explosionDamage, explode } from './entities.js';
import { AMMO } from './guns.js';
import { rideable } from './mounts.js';

const rand = Math.random;
const drop = (key, min, max) => ({ key, min, max });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- what they look like (+z is the front)
const PAINT = [[214, 214, 210], [200, 46, 40], [44, 92, 190], [96, 110, 70], [40, 40, 44], [236, 190, 40]];
const gearOf = (v) => ({ coat: +String(v || '0').split('.')[0] || 0 });
const GLASS = [90, 140, 180], DARK = [52, 52, 56], TYRE = [26, 26, 28];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const gearParts = (list) => list.flatMap(([x, z, y = 3]) => [
  { name: 'strut' + x + z, size: [1, 6, 1], pos: [x, y + 3, z], color: DARK },
  { name: 'tyre' + x + z, size: [2, 4, 4], pos: [x, y, z], color: TYRE },
]);
MODELS.plane = (v) => {
  const c = PAINT[gearOf(v).coat % PAINT.length], l = shade(c, 1.12), d = shade(c, 0.75);
  return [
    { name: 'body', size: [10, 10, 44], pos: [0, 14, 0], color: c, paint: { all: (g, x, y, w, h) => rect(g, x, y + h - 2, w, 2, d) } },
    { name: 'engine', size: [10, 10, 5], pos: [0, 14, 24], color: DARK },
    { name: 'prop', size: [3, 3, 2], pos: [0, 14, 27.5], color: [90, 90, 96] },
    { name: 'blade0', parent: 'prop', size: [2, 26, 1], pos: [0, 0, 0.5], color: [70, 56, 40] },
    { name: 'blade1', parent: 'prop', size: [26, 2, 1], pos: [0, 0, 0.5], color: [70, 56, 40] },
    { name: 'cockpit', size: [8, 6, 10], pos: [0, 21, 4], color: GLASS },
    { name: 'wing', size: [112, 2, 14], pos: [0, 13, 4], color: l, paint: { top: (g, x, y, w, h) => { rect(g, x + 2, y + 2, 8, h - 4, d); rect(g, x + w - 10, y + 2, 8, h - 4, d); } } },
    { name: 'tailwing', size: [38, 2, 8], pos: [0, 16, -19], color: l },
    { name: 'fin', size: [2, 12, 9], pos: [0, 22, -19], color: c },
    ...gearParts([[-8, 8], [8, 8]]), { name: 'tailwheel', size: [2, 3, 3], pos: [0, 8, -20], color: TYRE },
  ];
};
// A fighter jet: a long pointed nose, a bubble canopy, swept wings with missiles at their tips and under them,
// twin tails leaning out, and two nozzles that glow on full throttle. Greys and a navy, as real ones are painted.
const JET_PAINT = [[128, 134, 140], [104, 112, 122], [72, 82, 98], [150, 150, 144], [96, 104, 84], [118, 124, 136]];
MODELS.fighter_jet = (v) => {
  const c = JET_PAINT[gearOf(v).coat % JET_PAINT.length], l = shade(c, 1.12), d = shade(c, 0.72);
  const missile = (x, y, z, len = 12) => [
    { name: 'ms' + x + z, size: [1.6, 1.6, len], pos: [x, y, z], color: [232, 232, 228] },
    { name: 'mt' + x + z, size: [1.6, 1.6, 2], pos: [x, y, z + len / 2 + 1], color: [190, 40, 30] },
    { name: 'mf' + x + z, size: [4, 0.4, 2], pos: [x, y, z - len / 2 + 1], color: [200, 200, 196] },
  ];
  const sides = (f) => [-1, 1].flatMap(f);
  return [
    // the fuselage, tapering to the nose
    { name: 'body', size: [9, 8, 58], pos: [0, 11, -2], color: c, paint: { all: (g, x, y, w, h) => rect(g, x, y + h - 2, w, 2, d) } },
    { name: 'spine', size: [6, 3, 34], pos: [0, 16, 0], color: l },
    { name: 'nose0', size: [7, 6, 8], pos: [0, 11, 31], color: c },
    { name: 'nose1', size: [5, 4, 7], pos: [0, 11, 38], color: c },
    { name: 'tip', size: [2, 2, 6], pos: [0, 11, 44], color: d },
    { name: 'probe', size: [0.6, 0.6, 4], pos: [0, 11, 49], color: DARK },
    { name: 'canopy', size: [5, 4, 13], pos: [0, 16.5, 23], color: [70, 96, 120], paint: { all: (g, x, y, w, h) => rect(g, x, y, w, 1, [150, 190, 220]) } },
    { name: 'frame', size: [5.4, 0.6, 1], pos: [0, 18.6, 20], color: d },
    // the air intake under it
    { name: 'intake', size: [8, 6, 16], pos: [0, 5.5, 8], color: d },
    { name: 'mouth', size: [7, 5, 1], pos: [0, 5.5, 16.2], color: [16, 16, 18] },
    // swept wings, and the strakes running forward from them
    ...sides((k) => [
      { name: 'wing' + k, size: [26, 1.5, 15], pos: [k * 15, 10, -6], rot: [0, k * 0.5, 0], color: l, paint: { top: (g, x, y, w, h) => rect(g, x, y + h - 2, w, 2, d) } },
      { name: 'strake' + k, size: [4, 1.5, 18], pos: [k * 6, 11, 11], rot: [0, k * 0.22, 0], color: l },
      { name: 'stab' + k, size: [13, 1.2, 9], pos: [k * 9.5, 10, -31], rot: [0, k * 0.45, 0], color: l },
      { name: 'tail' + k, size: [1.5, 13, 11], pos: [k * 4.6, 19, -26], rot: [0, 0, -k * 0.28], color: c },
      { name: 'nozzle' + k, size: [4.6, 4.6, 5], pos: [k * 2.6, 11, -33.5], color: [44, 44, 48] },
      { name: 'burner' + k, size: [3.4, 3.4, 1], pos: [k * 2.6, 11, -36.2], color: [255, 150, 40] },
      ...missile(k * 28, 9.4, -9),
      { name: 'pylon' + k, size: [1, 2, 6], pos: [k * 16, 8.4, -4], color: d },
      ...missile(k * 16, 6.6, -4, 14),
    ]),
    ...gearParts([[-5, 0], [5, 0], [0, 32]], 2),
  ];
};

// ---------------------------------------------------------------- what they are
// max: top speed; stall: below this it can't stay up; lift: speed it leaves the ground at; turn: how fast it
// turns (radians a second); gun: its guns' damage (with iron bullets), wait between shots and bullet speed
const FLIGHT = {
  plane: { max: 34, stall: 11, lift: 14, accel: 7, turn: 1.15, lock: 1.4, gun: { dmg: 4, cd: 0.1, speed: 150 } },
  fighter_jet: { max: 64, stall: 18, lift: 22, accel: 13, turn: 1.7, lock: 0.9, jet: true, gun: { dmg: 6, cd: 0.07, speed: 200 } },
};
export const PLANE_SLOTS = 9;
// What can be loaded into a plane: bullets (any kind), missiles and flares
export const planeAmmo = (s) => !!s && (s.id === ID.missile || s.id === ID.flare || (AMMO[ITEMS[s.id].key] && AMMO[ITEMS[s.id].key].kind === 'bullet'));
function cleanInv(a) {
  const out = new Array(PLANE_SLOTS).fill(null);
  if (!Array.isArray(a)) return out;
  for (let i = 0; i < PLANE_SLOTS; i++) {
    const s = a[i];
    if (!s || !ITEMS[s.id] || !(s.count > 0)) continue;
    const st = { id: s.id | 0, count: Math.min(ITEMS[s.id].stack, s.count | 0), dmg: s.dmg | 0 };
    if (s.e) { const e = cleanEnch(s.e); if (e) st.e = e; }
    if (planeAmmo(st)) out[i] = st;
  }
  return out;
}
const planeGear = (saved) => {
  const g = saved && typeof saved === 'object' ? saved : {};
  return { coat: Number.isFinite(g.coat) ? Math.abs(g.coat | 0) % PAINT.length : Math.floor(rand() * PAINT.length), inv: cleanInv(g.inv),
    tame: true, saddle: false, armor: 0, spd: 1, temper: 0, lead: null };
};
const flyer = (key, name, o) => ({ name, hp: 60, w: 3, h: 1.6, speed: 0, sound: 'boat', pitch: 0.5, drops: [drop(key, 1, 1)], anim: 'plane', plane: true, fireImmune: true, noFall: true,
  seat: 0.45, ride: {}, xp: [0, 0], ai: parked, animate: flying, gear: planeGear, fly, flight: FLIGHT[key], ...rideable, ...o });
// (`scale`: drawn larger than the usual sixteenth of a block to a pixel, so a jet is as big next to you as a real one)
MOB_TYPES.plane = flyer('plane', 'Plane', { scale: 1.3, h: 2, seat: 1 });
MOB_TYPES.fighter_jet = flyer('fighter_jet', 'Fighter Jet', { hp: 80, w: 3.4, h: 2.2, seat: 1.05, scale: 1.6 });

// Nobody in it: it rolls to a stop, or falls out of the sky
function parked(m, dt) {
  m.age += dt; m.hurtTime -= dt; m.invul -= dt;
  if (m.dead) { m.removed = true; return; }
  m.vel.y = Math.max(m.vel.y - 32 * dt, -40);
  const k = Math.max(0, 1 - dt * 3);
  m.vel.x *= k; m.vel.z *= k;
  const res = moveBox(G.world, m, m.vel.x * dt, m.vel.y * dt, m.vel.z * dt);
  if (res.y) m.vel.y = 0;
  if (res.x) m.vel.x = 0;
  if (res.z) m.vel.z = 0;
  m.onGround = res.ground;
  m.spd = 0; m.thr = 0;
  if (m.onGround) { m.fp = 0; m.roll = 0; }
  m.animate(dt, 0, 99);
}
// It noses up and down and banks into its turns; the propeller turns with the throttle
function flying(m, dt) {
  const inner = m.model.inner;
  if (m.def.scale) inner.scale.setScalar(m.def.scale / 16);
  inner.rotation.x = -(m.fp || 0);
  inner.rotation.z = -(m.roll || 0);
  const P = m.model.parts;
  if (P.prop) P.prop.rotation.z += dt * (m.ridden ? 6 + 50 * (m.thr || 0) : 0);
  for (const b of [P.burner, P['burner-1'], P.burner1]) if (b) b.visible = (m.thr || 0) > 0.6;
}

// ---------------------------------------------------------------- flying it
// The pilot's own game moves them (the plane is carried along: see mounts.js)
function fly(p, dt, input) {
  const m = p.riding, S = m.def.flight, w = G.world;
  if (m.fy == null) { m.fy = p.yaw; m.fp = 0; m.spd = m.spd || 0; m.thr = 0; m.roll = 0; m.sink = 0; }
  m.thr = clamp(m.thr + (input.moveZ > 0.3 ? 0.6 : input.moveZ < -0.3 ? -0.8 : 0) * dt, 0, 1);
  // it turns after the view, as fast as it can (slowly when it is slow)
  const grounded = p.onGround;
  const agility = S.turn * dt * (0.35 + 0.65 * Math.min(1, m.spd / (S.max * 0.6)));
  const dyaw = clamp(wrap(p.yaw - m.fy), -agility, agility);
  m.fy = wrap(m.fy + dyaw);
  m.fp += clamp(clamp(p.pitch, -1.3, 1.3) - m.fp, -agility, agility);
  if (grounded && m.spd < S.lift) m.fp = 0;   // (it can't lift off until it is fast enough)
  m.roll += (clamp(-dyaw / Math.max(dt, 1e-3) * 0.6, -1.1, 1.1) - m.roll) * Math.min(1, dt * 4);
  // speed: the throttle, less when climbing and more when diving
  m.spd += clamp(m.thr * S.max - m.spd, -S.accel * dt, S.accel * dt);
  m.spd -= Math.sin(m.fp) * 9 * dt;
  if (grounded && m.thr < 0.05) m.spd -= 8 * dt;   // (brakes)
  m.spd = clamp(m.spd, 0, S.max * 1.3);
  const cp = Math.cos(m.fp);
  let vx = -Math.sin(m.fy) * cp * m.spd, vy = Math.sin(m.fp) * m.spd, vz = -Math.cos(m.fy) * cp * m.spd;
  // too slow to fly: it sinks, nose down
  const lift = clamp((m.spd - S.stall * 0.6) / (S.stall * 0.4), 0, 1);
  if (!grounded && lift < 1) { m.sink = Math.min(30, m.sink + 22 * (1 - lift) * dt); m.fp -= (1 - lift) * 0.7 * dt; } else m.sink = Math.max(0, m.sink - 30 * dt);
  vy -= m.sink;
  if (grounded && m.spd < S.lift) vy = -2;
  if (!grounded && lift < 0.3) p.hint('Stalling! Speed up');
  const before = vy;
  const res = moveBox(w, p, vx * dt, vy * dt, vz * dt, grounded ? 0.6 : 0);
  p.vel.x = vx; p.vel.y = res.y ? 0 : vy; p.vel.z = vz;
  const wasGround = p.onGround;
  p.onGround = res.ground;
  p.fallDist = 0;
  // flying into something, or coming down too hard or nose first, is a crash
  if (((res.x || res.z) && m.spd > 12) || (res.ground && !wasGround && m.spd > 10 && (before < -10 || m.fp < -0.3))) crash(p, m);
  if (res.ground) { m.sink = 0; if (m.fp < 0) m.fp = 0; }
  m.engT = (m.engT || 0) - dt;
  if (m.engT <= 0) { m.engT = S.jet ? 0.12 : 0.16; if (m.thr > 0.02 || m.spd > 1) sfx(S.jet ? 'jet' : 'engine', null, { vol: 0.25 + 0.55 * m.thr }); }
  if (p.pos.y < -30) p.hurt(4, null, null, 'void');
}
function crash(p, m) {
  explosionFx(p.pos.x, p.pos.y + 0.8, p.pos.z, 2);
  if (G.net) G.net.explosion(p.pos.x, p.pos.y + 0.8, p.pos.z, 2);
  const hard = m.spd;
  m.spd = 0; m.thr = 0; m.sink = 0;
  m.invul = 0;
  m.hurt(hard * 1.4, p.pos.x, p.pos.z, false);
  p.hurt(Math.floor(Math.max(0, hard - 12) * 0.4), null, null, 'fall');   // (a slow bump hardly hurts; a dive at full speed kills)
}

// ---------------------------------------------------------------- flares and missiles
const FLARES = [], MISSILES = [];
const MISSILE_BOOM = 3.2;   // (a little smaller than TNT's 4)
const hash = (a, b) => { let h = (a * 73856093) ^ (b * 19349663); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const myName = () => (G.net ? G.net.name : (G.account && G.account.name) || 'me');
function addFlare(x, y, z, vx, vz, id) {
  FLARES.push({ id, x, y, z, vx, vy: 2, vz, age: 0 });
}
const missileGeo = new THREE.BoxGeometry(0.18, 0.18, 1.1), tipGeo = new THREE.BoxGeometry(0.2, 0.2, 0.22), finGeo = new THREE.BoxGeometry(0.5, 0.04, 0.2);
const missileMat = new THREE.MeshBasicMaterial({ color: 0xececec }), tipMat = new THREE.MeshBasicMaterial({ color: 0xc8281e });
// owner: 'player' (fired by you: it does the damage), 'turret' (a turret's, on the host) or 'fx' (somebody
// else's, seen here). target: { mob } or { name } or null; spec is how it is told to others.
class Missile {
  constructor(x, y, z, dx, dy, dz, speed, owner, target, id, o = {}) {
    this.pos = { x, y, z }; this.dir = { x: dx, y: dy, z: dz }; this.speed = speed;
    this.owner = owner; this.target = target; this.id = id; this.age = 0; this.tried = new Set();
    this.spare = o.spare || null; this.allow = o.allow || null; this.shooter = o.shooter || null;
    const g = new THREE.Group();
    const body = new THREE.Mesh(missileGeo, missileMat), tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.z = 0.62;
    const f0 = new THREE.Mesh(finGeo, missileMat), f1 = new THREE.Mesh(finGeo, missileMat);
    f0.position.z = f1.position.z = -0.45; f1.rotation.z = Math.PI / 2;
    g.add(body, tip, f0, f1);
    this.mesh = g;
    R.scene.add(g);
  }
  // Where what it chases is now, or null
  aim() {
    const t = this.target;
    if (!t) return null;
    if (t.flare) return t.flare.age < 4 ? { x: t.flare.x, y: t.flare.y, z: t.flare.z } : null;
    if (t.mob) return t.mob.dead || t.mob.removed ? null : { x: t.mob.pos.x, y: t.mob.pos.y + t.mob.h * 0.5, z: t.mob.pos.z };
    if (t.netId != null && G.net) { const mb = G.net.mobIndex && G.net.mobIndex.get(t.netId); return mb && !mb.dead ? { x: mb.pos.x, y: mb.pos.y + mb.h * 0.5, z: mb.pos.z } : null; }
    if (t.name) {
      if (t.name === myName()) return G.player.dead ? null : { x: G.player.pos.x, y: G.player.pos.y + 0.9, z: G.player.pos.z };
      const a = G.net && [...G.net.players.values()].find((q) => q.name === t.name);
      return a && !a.dead ? { x: a.pos.x, y: a.pos.y + 0.9, z: a.pos.z } : null;
    }
    return null;
  }
  update(dt) {
    this.age += dt;
    if (this.age > 9) { this.removed = true; return; }
    // a flare near enough may draw it off (the same flares draw off the real missile and everyone's copies)
    if (this.target && !this.target.flare) for (const f of FLARES) {
      if (this.tried.has(f.id) || Math.hypot(f.x - this.pos.x, f.y - this.pos.y, f.z - this.pos.z) > 45) continue;
      this.tried.add(f.id);
      if (hash(this.id, f.id) < 0.75) { this.target = { flare: f }; break; }
    }
    const at = this.age > 0.25 ? this.aim() : null;
    if (at) {
      let tx = at.x - this.pos.x, ty = at.y - this.pos.y, tz = at.z - this.pos.z;
      const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
      // turn towards it as fast as it can
      const k = Math.min(1, dt * 3.2);
      this.dir.x += (tx - this.dir.x) * k; this.dir.y += (ty - this.dir.y) * k; this.dir.z += (tz - this.dir.z) * k;
      const n = Math.hypot(this.dir.x, this.dir.y, this.dir.z) || 1; this.dir.x /= n; this.dir.y /= n; this.dir.z /= n;
      if (l < 2.6 && !this.target.flare) { this.blast(); return; }
      if (l < 1.5 && this.target.flare) { this.blast(); return; }
    }
    this.speed = Math.min(95, this.speed + 60 * dt);
    const len = this.speed * dt, d = this.dir;
    // what it flies into
    if (this.owner !== 'fx') {
      for (const m of G.entities.mobs) {
        if (m.dead || m === this.spare || m === this.shooter || (this.allow && !this.allow(m))) continue;
        const t = rayBox(this.pos.x, this.pos.y, this.pos.z, d.x, d.y, d.z, m.pos.x - m.hw, m.pos.y, m.pos.z - m.hw, m.pos.x + m.hw, m.pos.y + m.h, m.pos.z + m.hw);
        if (t >= 0 && t <= len) { this.pos.x += d.x * t; this.pos.y += d.y * t; this.pos.z += d.z * t; this.blast(m); return; }
      }
      if (this.owner === 'player' && G.net) for (const a of G.net.players.values()) {
        if (!a.ready || a.dead) continue;
        const t = rayBox(this.pos.x, this.pos.y, this.pos.z, d.x, d.y, d.z, a.pos.x - 0.4, a.pos.y, a.pos.z - 0.4, a.pos.x + 0.4, a.pos.y + 1.8, a.pos.z + 0.4);
        if (t >= 0 && t <= len) { G.net.pvp(a, 16, this.pos.x, this.pos.z); this.blast(); return; }
      }
    }
    const hit = raycast(G.world, this.pos.x, this.pos.y, this.pos.z, d.x, d.y, d.z, len, (id) => BLOCKS[id].solid);
    if (hit) { this.pos.x += d.x * hit.dist; this.pos.y += d.y * hit.dist; this.pos.z += d.z * hit.dist; this.blast(); return; }
    this.pos.x += d.x * len; this.pos.y += d.y * len; this.pos.z += d.z * len;
    if (Math.random() < 0.9) G.entities.particles.spawn(this.pos.x - d.x * 0.6, this.pos.y - d.y * 0.6, this.pos.z - d.z * 0.6, (rand() - 0.5) * 0.4, 0.2, (rand() - 0.5) * 0.4, 0.75, 0.75, 0.75, 0.14, 0.9, -0.08);
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.lookAt(this.pos.x + d.x, this.pos.y + d.y, this.pos.z + d.z);
  }
  // It goes off: a blast that hurts what is near (breaking no blocks), and a hard knock to what it hit
  blast(direct) {
    const { x, y, z } = this.pos;
    if (this.owner !== 'fx') {
      if (direct) { direct.invul = 0; direct.hurt(16, x, z, this.owner === 'player', 1, null, null); }
      // a plane's missile is a real explosion: it blows a crater in the ground and hurts everything near (the pilot
      // of a plane that is hit goes down with it). A turret's hurts just the same but breaks no blocks.
      if (this.owner === 'turret') {
        explosionFx(x, y, z, MISSILE_BOOM);
        if (G.net) G.net.explosion(x, y, z, MISSILE_BOOM);
        explosionDamage(x, y, z, MISSILE_BOOM, null, true, this.shooter);
      } else explode(x, y, z, MISSILE_BOOM);
    } else explosionFx(x, y, z, MISSILE_BOOM);   // (somebody else's: the blocks it breaks come from them)
    this.removed = true;
  }
  dispose() { R.scene.remove(this.mesh); }
}
let nextId = 1;
const newId = () => ((Date.now() & 0xffff) * 4096 + (nextId++ & 4095)) | 0;
// Fire a missile. target: a mob, or a remote player (by name), or null to fly straight
export function launchMissile(x, y, z, dx, dy, dz, speed, owner, target, o = {}) {
  const id = newId();
  const t = !target ? null : target.isRemotePlayer ? { name: target.name } : target.isPlayer ? { name: myName() } : { mob: target };
  MISSILES.push(new Missile(x, y, z, dx, dy, dz, speed, owner, t, id, o));
  // (and everyone else sees it: a mob target by its number, a player by name)
  const spec = !t ? 0 : t.name ? 'p:' + t.name : t.mob && t.mob.netId != null ? 'm:' + t.mob.netId : 0;
  if (G.net) G.net.vfx('ms', [x, y, z, dx, dy, dz, speed, spec, id]);
  sfx('rocket', { x, y, z });
}
function dropFlares(x, y, z, vx, vz) {
  const base = newId();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, id = base + i;
    const fx = vx * 0.3 + Math.cos(a) * 6, fz = vz * 0.3 + Math.sin(a) * 6;
    addFlare(x, y - 0.5, z, fx, fz, id);
    if (G.net) G.net.vfx('fl', [x, y - 0.5, z, fx, fz, id]);
  }
  sfx('click', null, { vol: 0.8 });
}
// Somebody else's missile or flares, seen here
G.onVfx = (t, a) => {
  if (!Array.isArray(a) || !a.slice(0, 6).every(Number.isFinite)) return;
  if (t === 'ms') {
    const s = typeof a[7] === 'string' ? a[7] : '';
    const target = s.startsWith('p:') ? { name: s.slice(2) } : s.startsWith('m:') ? { netId: +s.slice(2) } : null;
    MISSILES.push(new Missile(a[0], a[1], a[2], a[3], a[4], a[5], +a[6] || 30, 'fx', target, a[8] | 0));
    sfx('rocket', { x: a[0], y: a[1], z: a[2] }, { vol: 0.7 });
  } else if (t === 'fl') addFlare(a[0], a[1], a[2], a[3], a[4], a[5] | 0);
};

// Every frame: missiles fly, flares burn and fall
Entities.prototype.tickAir = function (dt) {
  for (let i = 0; i < MISSILES.length; i++) { const m = MISSILES[i]; if (!m.removed) m.update(dt); }
  for (let i = MISSILES.length - 1; i >= 0; i--) if (MISSILES[i].removed) { MISSILES[i].dispose(); MISSILES.splice(i, 1); }
  for (const f of FLARES) {
    f.age += dt; f.vy -= 4 * dt; f.vx *= 1 - dt; f.vz *= 1 - dt;
    f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
    this.particles.spawn(f.x, f.y, f.z, (rand() - 0.5) * 0.6, 0.2, (rand() - 0.5) * 0.6, 1, 0.85 + rand() * 0.15, 0.4, 0.16, 0.35, -0.05);
  }
  for (let i = FLARES.length - 1; i >= 0; i--) if (FLARES[i].age > 4) FLARES.splice(i, 1);
};
Entities.prototype.clearAir = function () { for (const m of MISSILES) m.dispose(); MISSILES.length = 0; FLARES.length = 0; };

// ---------------------------------------------------------------- the pilot's controls
// The plane's slots: the stack of the first kind of ammunition that is wanted, or -1
const slotOf = (inv, ok) => inv.findIndex((s) => s && s.count > 0 && ok(s));
const isBullet = (s) => AMMO[ITEMS[s.id].key] && AMMO[ITEMS[s.id].key].kind === 'bullet';
const countOf = (inv, ok) => inv.reduce((n, s) => n + (s && ok(s) ? s.count : 0), 0);
function useUp(p, m, i) {
  if (p.creative) return;
  const s = m.gear.inv[i];
  if (--s.count <= 0) m.gear.inv[i] = null;
  m.invDirty = true;
}
const forward = (m) => { const cp = Math.cos(m.fp || 0); return { x: -Math.sin(m.fy) * cp, y: Math.sin(m.fp || 0), z: -Math.cos(m.fy) * cp }; };

// What a lock can be on: monsters, flying things, other people's planes and cars, and other players
function lockable(m, mine) {
  if (m === mine || m.dead) return false;
  if (m.def.mount) return !!m.ridden;
  return !!(m.def.hostile || m.def.flies || m.def.bear);
}
// Called every frame for the player: in a plane, the guns, missiles, flares and the lock; and the cockpit view
export function planeFrame(p, input, dt) {
  const m = p.riding && p.riding.def.plane ? p.riding : null;
  hud(p, m);
  if (!m || p.dead || G.screen) return !!m;
  const S = m.def.flight, inv = m.gear.inv;
  if (m.fy == null) return true;
  const f = forward(m);
  m.gunCd = (m.gunCd || 0) - dt; m.misCd = (m.misCd || 0) - dt; m.flareCd = (m.flareCd || 0) - dt;
  // the lock: whatever stays nearest the middle of the view, close enough, for long enough
  const cands = [];
  for (const e of G.entities.mobs) if (lockable(e, m)) cands.push(e);
  if (G.net) for (const a of G.net.players.values()) if (a.ready && !a.dead && !a.hidden) cands.push(a);
  let best = null, ba = 0.2;
  for (const e of cands) {
    const ex = e.pos.x - p.pos.x, ey = e.pos.y + 0.8 - p.eyeY, ez = e.pos.z - p.pos.z, d = Math.hypot(ex, ey, ez);
    if (d < 6 || d > 180) continue;
    const ang = Math.acos(clamp((ex * f.x + ey * f.y + ez * f.z) / d, -1, 1));
    if (ang < ba) { ba = ang; best = e; }
  }
  const L = m.lock || (m.lock = { target: null, t: 0, beep: 0 });
  if (best && best === L.target) L.t += dt; else { L.target = best; L.t = 0; }
  L.locked = !!L.target && L.t >= S.lock;
  L.beep -= dt;
  if (L.target && L.beep <= 0) { L.beep = L.locked ? 0.12 : 0.3; sfx('click', null, { vol: L.locked ? 0.5 : 0.25 }); }
  // guns: the attack button, held
  if ((input.mine || input.attackPressed || input.jump || touchHeld.guns) && m.gunCd <= 0) {   // (click or Space)
    const i = slotOf(inv, isBullet);
    if (i < 0 && !p.creative) { if (input.attackPressed || input.jumpPressed) p.hint('No bullets: press E and load some'); }
    else {
      const a = AMMO[i >= 0 ? ITEMS[inv[i].id].key : 'bullet'];
      const rx = Math.cos(m.fy), rz = -Math.sin(m.fy);   // (to the right of where it points)
      // (the two guns, one on each wing, are aimed in to meet at the circle in the middle of the view, 60 blocks ahead)
      const cx = p.pos.x + f.x * 60, cy = p.eyeY + f.y * 60, cz = p.pos.z + f.z * 60;
      for (const side of [-1, 1]) {
        const ox = p.pos.x + rx * side * 1.2 + f.x * 2, oy = p.eyeY - 0.6 + f.y * 2, oz = p.pos.z + rz * side * 1.2 + f.z * 2;
        const ax = cx - ox, ay = cy - oy, az = cz - oz, al = Math.hypot(ax, ay, az), sp = 0.008, v = S.gun.speed + m.spd;
        const dx = ax / al + (rand() - 0.5) * sp, dy = ay / al + (rand() - 0.5) * sp, dz = az / al + (rand() - 0.5) * sp;
        G.entities.spawnArrow(ox, oy, oz, dx * v, dy * v, dz * v, 'player',
          { bullet: 'bullet', damage: Math.round(S.gun.dmg * a.mul * 10) / 10, keep: true, pierce: a.pierce || 0, flame: !!a.fire, boom: a.boom || 0 });
      }
      sfx('gun_light', null, { vol: 0.7 });
      if (i >= 0) useUp(p, m, i);
      m.gunCd = S.gun.cd;
    }
  }
  // a missile: the use button
  if ((input.usePressed || input.missile || touchPressed.missile) && m.misCd <= 0) {   // (right-click or R)
    const i = slotOf(inv, (s) => s.id === ID.missile);
    if (i < 0 && !p.creative) p.hint('No missiles: press E and load some');
    else {
      const tgt = L.locked ? L.target : null;
      const remote = tgt && G.net && [...G.net.players.values()].includes(tgt) ? { isRemotePlayer: true, name: tgt.name } : tgt;
      launchMissile(p.pos.x + f.x * 3, p.eyeY - 1 + f.y * 3, p.pos.z + f.z * 3, f.x, f.y, f.z, m.spd + 20, 'player', remote, { spare: m });
      if (i >= 0) useUp(p, m, i);
      m.misCd = 0.7;
      if (!tgt) p.hint('Fired without a lock: it flies straight');
    }
  }
  // flares: X
  if ((input.flare || input.swapHands || touchPressed.flare) && m.flareCd <= 0) {   // (X or F)
    const i = slotOf(inv, (s) => s.id === ID.flare);
    if (i < 0 && !p.creative) p.hint('No flares: press E and load some');
    else { dropFlares(p.pos.x, p.pos.y, p.pos.z, p.vel.x, p.vel.z); if (i >= 0) useUp(p, m, i); m.flareCd = 1.5; }
  }
  touchPressed.missile = touchPressed.flare = false;
  // (a guest's plane lives on the host: what was used up is sent there now and then)
  m.invT = (m.invT || 0) - dt;
  if (m.invDirty && m.proxy && G.net && m.invT <= 0) { m.invT = 1; m.invDirty = false; G.net.send({ k: 'pinv', id: m.netId, inv: m.gear.inv }); }
  return true;
}

// Is a missile coming for me (or for the plane I am in)?
function incoming(p) {
  const me = myName(), mine = p.riding;
  return MISSILES.some((x) => x.owner !== 'player' && x.target && !x.target.flare && ((x.target.name && x.target.name === me) || (mine && (x.target.mob === mine || (x.target.netId != null && x.target.netId === mine.netId)))));
}

// ---------------------------------------------------------------- the plane's slots
// E in a plane opens its nine slots beside your inventory
G.openPlaneInv = () => {
  const m = G.player.riding;
  if (!m || !m.def.plane) return false;
  G.ui.openScreen('plane', { slots: m.gear.inv, title: m.def.name, ok: planeAmmo, onClose: () => {
    m.gear.inv = cleanInv(m.gear.inv);
    if (m.proxy && G.net) G.net.send({ k: 'pinv', id: m.netId, inv: m.gear.inv });
    else m.vDirty = true;
  } });
  return true;
};
// The host takes a guest's plane's slots as they say (it is the one they are flying)
export function takePlaneInv(m, inv) { if (m && m.def.plane) { m.gear.inv = cleanInv(inv); m.vDirty = true; } }

// ---------------------------------------------------------------- the cockpit view
let H = null;
const touchHeld = { guns: false }, touchPressed = { missile: false, flare: false };
function makeHud() {
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:var(--ui-font);color:#7dff8a;text-shadow:0 0 3px #000,1px 1px 0 #000;font-size:20px';
  const el = (css, text = '') => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;' + css; d.textContent = text; root.appendChild(d); return d; };
  H = {
    root,
    nose: el('width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid #7dff8a;border-radius:50%'),
    box: el('border:2px solid #ffd84a;display:none'),
    tag: el('font-size:16px;display:none'),
    stats: el('left:16px;bottom:120px;line-height:1.15;white-space:pre'),
    ammo: el('right:16px;bottom:120px;line-height:1.15;white-space:pre;text-align:right'),
    warn: el('left:50%;top:22%;transform:translateX(-50%);font-size:34px;color:#ff4a3a;display:none', 'MISSILE'),
    keys: el('left:50%;top:calc(12px + env(safe-area-inset-top, 0px));transform:translateX(-50%);font-size:19px;white-space:nowrap;color:#e8ffe8;background:rgba(0,0,0,0.45);padding:3px 10px', 'Guns: click or Space  ·  Missile: right-click or R  ·  Flares: X or F  ·  Load ammo: E  ·  Throttle: W/S'),
    buttons: document.createElement('div'),
  };
  // touch: buttons of its own while flying
  H.buttons.style.cssText = 'position:absolute;right:calc(16px + env(safe-area-inset-right, 0px));top:30%;display:flex;flex-direction:column;gap:12px;pointer-events:auto';
  const btn = (label, colour, down, up) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.className = 'btn';
    b.style.cssText = `min-width:118px;height:58px;font-size:24px;opacity:0.9;background:${colour};color:#fff`;
    b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); if (up) up(); }, { passive: false });
    b.addEventListener('mousedown', (e) => { e.preventDefault(); down(); });
    b.addEventListener('mouseup', (e) => { e.preventDefault(); if (up) up(); });
    H.buttons.appendChild(b);
  };
  btn('Guns', 'rgba(150,40,30,0.8)', () => { touchHeld.guns = true; }, () => { touchHeld.guns = false; });
  btn('Missile', 'rgba(170,110,20,0.8)', () => { touchPressed.missile = true; });
  btn('Flares', 'rgba(200,170,30,0.8)', () => { touchPressed.flare = true; });
  btn('Ammo', 'rgba(60,60,60,0.8)', () => { G.openPlaneInv(); });
  root.appendChild(H.buttons);
  (document.getElementById('hud') || document.body).appendChild(root);
}
const v3 = new THREE.Vector3();
// Where a point in the world is on the screen, in pixels (null if behind the camera)
function onScreen(x, y, z) {
  v3.set(x, y, z).project(R.camera);
  if (v3.z > 1) return null;
  return { x: (v3.x + 1) / 2 * innerWidth, y: (1 - v3.y) / 2 * innerHeight };
}
function hud(p, m) {
  if (!m) { if (H) H.root.style.display = 'none'; touchHeld.guns = false; return; }
  if (!H) makeHud();
  H.root.style.display = G.screen ? 'none' : '';
  if (m.fy == null) return;
  const f = forward(m);
  const n = onScreen(p.pos.x + f.x * 60, p.eyeY + f.y * 60, p.pos.z + f.z * 60);
  H.nose.style.display = n ? '' : 'none';
  if (n) { H.nose.style.left = n.x + 'px'; H.nose.style.top = n.y + 'px'; }
  const L = m.lock;
  if (L && L.target) {
    const t = L.target, c = onScreen(t.pos.x, t.pos.y + 0.9, t.pos.z);
    if (c) {
      const d = Math.hypot(t.pos.x - p.pos.x, t.pos.y - p.pos.y, t.pos.z - p.pos.z), s = clamp(1400 / d, 26, 90);
      H.box.style.display = H.tag.style.display = '';
      H.box.style.cssText = `position:absolute;display:block;border:2px solid ${L.locked ? '#ff3a2a' : '#ffd84a'};left:${c.x - s / 2}px;top:${c.y - s / 2}px;width:${s}px;height:${s}px`;
      H.tag.style.left = c.x - s / 2 + 'px'; H.tag.style.top = c.y + s / 2 + 4 + 'px';
      H.tag.style.color = L.locked ? '#ff3a2a' : '#ffd84a';
      H.tag.textContent = (L.locked ? 'LOCKED ' : 'LOCKING ') + Math.round(d) + 'm';
    } else H.box.style.display = H.tag.style.display = 'none';
  } else H.box.style.display = H.tag.style.display = 'none';
  const inv = m.gear.inv;
  H.stats.textContent = `SPD ${Math.round(m.spd * 3.6)} km/h\nALT ${Math.round(p.pos.y)}\nTHR ${Math.round(m.thr * 100)}%`;
  H.ammo.textContent = p.creative ? 'GUN ∞\nMSL ∞\nFLR ∞' : `GUN ${countOf(inv, isBullet)}\nMSL ${countOf(inv, (s) => s.id === ID.missile)}\nFLR ${countOf(inv, (s) => s.id === ID.flare)}`;
  const warn = incoming(p);
  H.warn.style.display = warn && Math.floor(performance.now() / 250) % 2 ? '' : 'none';
  if (warn) { m.warnT = (m.warnT || 0) - 1 / 60; if (m.warnT <= 0) { m.warnT = 0.4; sfx('click', null, { vol: 0.9 }); } }
  H.buttons.style.display = G.touchMode ? 'flex' : 'none';
  H.keys.style.display = G.touchMode ? 'none' : '';
}

// The turret uses the same missiles (see turret.js)
export { MISSILES, myName };
