// Missile silos (1.11.10). A silo is set down like a turret: a concrete pit three blocks across with two blast
// doors on top. Use it to open its screen: load one missile from your inventory (short, medium or long range:
// each reaches further and blows up bigger), choose where it lands (type the place, stand there, or mark it
// with a Targeting System), and launch. The doors open, the missile goes straight up out of the pit in a burst
// of fire and smoke, arcs over and comes down on the target in a huge explosion that hurts everything near but
// breaks no blocks. Each launch takes the missile: load another for the next one.
// (1.11.11) Each launch also carries a warhead, chosen on the screen (warheads.js): Concussion is the blast above;
// the rest blow a crater in the land, up to a nuke.
//
// On the way it is a creature of its own (`ballistic_missile`), so turrets see it and shoot at it (unless they
// are set to leave alone missiles, or the one who launched it); hit enough, it blows up where it is, with a
// smaller blast. It is never saved or packed away with the land, so it keeps flying over land nobody has loaded
// (and blows up there, harming nothing loaded).
//
// It all happens where the world lives (the host): a guest's loads and launches are sent there as 'silo'.
import * as THREE from 'three';
import { G } from './game.js';
import { ID, B, BLOCKS } from './blocks.js';
import { sfx } from './audio.js';
import { raycast } from './physics.js';
import { MOB_TYPES, MODELS, rect } from './entities.js';
import { launchFlash } from './planes.js';
import { WARHEADS, warheadOf, detonate, prepareCrater } from './warheads.js';

const rand = Math.random;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// What each missile does: how far it reaches, how big its blast is, how much shooting it takes to bring down
export const SILO_MISSILES = [
  { key: 'short_range_missile', name: 'Short-Range Missile', range: 250, blast: 8, hp: 24, band: [230, 190, 40] },
  { key: 'medium_range_missile', name: 'Medium-Range Missile', range: 600, blast: 10, hp: 32, band: [230, 120, 30] },
  { key: 'long_range_missile', name: 'Long-Range Missile', range: 1500, blast: 12, hp: 40, band: [200, 40, 30] },
];
const kindOf = (id) => SILO_MISSILES.findIndex((k) => ID[k.key] === id);
const isGuest = () => !!(G.net && G.net.role === 'client');
const myName = () => (G.net ? G.net.name : (G.account && G.account.name) || 'me');

// ---------------------------------------------------------------- the silo
const CONCRETE = [150, 152, 148], CONCRETE_D = [116, 118, 114], STEEL = [96, 100, 104], HAZ = [214, 180, 40];
MODELS.missile_silo = (v) => {
  const loaded = +String(v || '0').split('.')[0] || 0;
  const parts = [
    { name: 'base', size: [48, 14, 48], pos: [0, 7, 0], color: CONCRETE, paint: { all: (g, x, y, w, h) => { for (let i = 0; i < w; i += 8) rect(g, x + i, y + h - 2, 4, 2, HAZ); } } },
    { name: 'rim', size: [36, 2, 36], pos: [0, 15, 0], color: CONCRETE_D },
    // the doors, hinged on their outer edges
    { name: 'door0', size: [16, 2, 32], pos: [-16, 16.5, 0], off: [8, 0, 0], color: STEEL, paint: { top: (g, x, y, w, h) => { for (let i = 0; i < h; i += 6) rect(g, x, y + i, w, 2, HAZ); } } },
    { name: 'door1', size: [16, 2, 32], pos: [16, 16.5, 0], off: [-8, 0, 0], color: STEEL, paint: { top: (g, x, y, w, h) => { for (let i = 3; i < h; i += 6) rect(g, x, y + i, w, 2, HAZ); } } },
    // the control box and its aerial
    { name: 'box', size: [10, 10, 6], pos: [-17, 19, -20], color: [80, 90, 80], paint: { front: (g, x, y) => { rect(g, x + 2, y + 2, 6, 3, [30, 60, 30]); rect(g, x + 2, y + 6, 2, 2, loaded ? [80, 255, 90] : [255, 60, 40]); } } },
    { name: 'aerial', size: [1, 14, 1], pos: [-20, 31, -20], color: STEEL },
  ];
  // a loaded missile's nose waits just under the doors
  if (loaded) parts.push({ name: 'nose', size: [8, 10, 8], pos: [0, 10, 0], color: [236, 236, 236], paint: { top: (g, x, y, w, h) => rect(g, x + 2, y + 2, w - 4, h - 4, SILO_MISSILES[loaded - 1].band) } });
  return parts;
};
// gear.coat: what is loaded (0 none, 1 short, 2 medium, 3 long); gear.owner: who set it down
const siloGear = (saved) => {
  const g = saved && typeof saved === 'object' ? saved : {};
  return { coat: clamp(g.coat | 0, 0, 3), wh: clamp(g.wh | 0, 0, WARHEADS.length - 1), owner: typeof g.owner === 'string' ? g.owner.slice(0, 40) : '', saddle: false, armor: 0, tame: true, spd: 1, temper: 0, lead: null };
};
function siloAI(s, dt) {
  s.age += dt; s.hurtTime -= dt; s.invul -= dt;
  if (s.dead) {
    // (whatever was loaded comes out with it)
    if (s.gear.coat && !isGuest()) G.entities.dropItem(ID[SILO_MISSILES[s.gear.coat - 1].key], 1, s.pos.x, s.pos.y + 1, s.pos.z);
    s.removed = true;
    return;
  }
  s.vel.x = s.vel.z = 0;
  s.doors = Math.max(0, (s.doors || 0) - dt);
  s.animate(dt, 0, 99);
}
MOB_TYPES.missile_silo = { name: 'Missile Silo', hp: 200, w: 2.9, h: 1.1, speed: 0, sound: 'golem', pitch: 0.4, drops: [{ key: 'missile_silo', min: 1, max: 1 }], anim: 'silo',
  silo: true, persistent: true, fireImmune: true, noFall: true, heavy: true, blastProof: true, xp: [0, 0], ai: siloAI, gear: siloGear,
  // the doors swing open as a missile goes, and shut again
  animate: (s) => {
    const P = s.model.parts, a = Math.min(1, s.doors / 0.4, (2.5 - Math.min(2.5, s.doors)) * 3) * 1.9;
    if (P.door0) P.door0.rotation.z = a;
    if (P.door1) P.door1.rotation.z = -a;
  } };

// ---------------------------------------------------------------- the missile in flight
const PAINT_W = [236, 236, 236];
MODELS.ballistic_missile = (v) => {
  const sv = String(v || '0').split('.');
  const k = SILO_MISSILES[clamp(+sv[0] || 0, 0, 2)], W = warheadOf(+sv[2] || 0);
  // (a nuclear warhead's nose is yellow and black)
  const nose = W.nuke ? [236, 200, 30] : k.band, np = W.nuke ? { all: (g, x, y, w, h) => { for (let i = 0; i < w; i += 2) rect(g, x + i, y, 1, h, [30, 30, 30]); } } : null;
  return [
    { name: 'body', size: [6, 6, 34], pos: [0, 5, 0], color: PAINT_W, paint: { all: (g, x, y, w, h) => rect(g, x, y + 4, w, 2, [40, 40, 44]) } },
    { name: 'band', size: [6.4, 6.4, 3], pos: [0, 5, 9], color: k.band },
    { name: 'nose0', size: [5, 5, 4], pos: [0, 5, 19], color: nose, ...(np ? { paint: np } : {}) },
    { name: 'nose1', size: [3, 3, 3], pos: [0, 5, 22.5], color: nose },
    { name: 'finA', size: [16, 1, 6], pos: [0, 5, -14], color: [200, 200, 196] },
    { name: 'finB', size: [1, 16, 6], pos: [0, 5, -14], color: [200, 200, 196] },
    { name: 'nozzle', size: [5, 5, 2], pos: [0, 5, -18], color: [50, 50, 54] },
  ];
};
const addMat = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false };
const flameGeo = [new THREE.BoxGeometry(3.5, 3.5, 20).translate(0, 0, -10), new THREE.BoxGeometry(8, 8, 34).translate(0, 0, -17)];
const flameMat = [new THREE.MeshBasicMaterial({ color: 0xfff4c8, ...addMat, opacity: 0.95 }), new THREE.MeshBasicMaterial({ color: 0xff6a14, ...addMat, opacity: 0.6 })];
const missileGear = (saved) => {
  const g = saved && typeof saved === 'object' ? saved : {};
  const n = (v) => (Number.isFinite(+v) ? +v : 0);
  const p = g.path && typeof g.path === 'object' ? g.path : {};
  const wh = clamp(g.wh | 0, 0, WARHEADS.length - 1);
  return { coat: clamp(g.coat | 0, 0, 2), wh, by: typeof g.by === 'string' ? g.by.slice(0, 40) : '', t: n(g.t),
    path: { sx: n(p.sx), sy: n(p.sy), sz: n(p.sz), tx: n(p.tx), ty: n(p.ty), tz: n(p.tz), T: Math.max(1, n(p.T)), h: n(p.h) }, saddle: false, armor: wh, tame: true, spd: 1, temper: 0, lead: null };
};
// Where it is along its arc, u from 0 (leaving the silo) to 1 (landing): straight up out of the pit, over in
// an arc, and steeply down at the end
function along(P, u) {
  const s = u * u * (3 - 2 * u);
  return { x: P.sx + (P.tx - P.sx) * s, y: P.sy + (P.ty - P.sy) * u + 4 * P.h * u * (1 - u), z: P.sz + (P.tz - P.sz) * s };
}
function missileAI(m, dt) {
  m.age += dt; m.hurtTime -= dt; m.invul -= dt;
  const k = SILO_MISSILES[m.gear.coat];
  if (m.dead) {
    // shot down: it goes off where it is, smaller, and (whatever its warhead) breaks nothing
    if (!isGuest()) detonate(m.pos.x, m.pos.y + 0.5, m.pos.z, 0, k.blast * 0.45, m);
    m.removed = true;
    return;
  }
  const P = m.gear.path;
  m.gear.t += dt;
  if (!isGuest() && warheadOf(m.gear.wh).r) prepareCrater(P.tx, P.tz, warheadOf(m.gear.wh).r);
  const u = Math.min(1, m.gear.t / P.T);
  const at = along(P, u), ahead = along(P, Math.min(1, u + 0.01));
  const dx = at.x - m.pos.x, dy = at.y - m.pos.y, dz = at.z - m.pos.z;
  m.vel.x = dx / Math.max(dt, 1e-3); m.vel.y = dy / Math.max(dt, 1e-3); m.vel.z = dz / Math.max(dt, 1e-3);   // (for turrets aiming ahead of it)
  m.pos.x = at.x; m.pos.y = at.y; m.pos.z = at.z;
  const fx = ahead.x - at.x, fy = ahead.y - at.y, fz = ahead.z - at.z;
  if (Math.hypot(fx, fz) > 1e-4) m.yaw = Math.atan2(fx, fz);
  m.fp = Math.atan2(fy, Math.hypot(fx, fz) || 1e-4);
  // it lands (or flies into something on the way)
  const hitSomething = u > 0.15 && BLOCKS[G.world.getBlock(Math.floor(at.x), Math.floor(at.y + 0.4), Math.floor(at.z))].solid;
  if (u >= 1 || hitSomething) {
    if (!isGuest()) detonate(at.x, at.y + 0.5, at.z, m.gear.wh, k.blast, m);
    m.removed = true;
    return;
  }
  // smoke behind it, thick
  const Pp = G.entities.particles, back = { x: -Math.sin(m.yaw) * Math.cos(m.fp), y: -Math.sin(m.fp), z: -Math.cos(m.yaw) * Math.cos(m.fp) };
  const shade = 0.3 + 0.7 * clamp(G.daylight ?? 1, 0, 1);
  for (let i = 0; i < 3; i++) {
    const v = (0.72 + rand() * 0.15) * shade, b = 2.4 + rand() * 2;
    Pp.spawn(m.pos.x + back.x * b, m.pos.y + 0.6 + back.y * b, m.pos.z + back.z * b, (rand() - 0.5) * 0.8, 0.3, (rand() - 0.5) * 0.8, v, v, v, 0.5 + rand() * 0.4, 2 + rand() * 1.5, -0.06);
  }
  m.animate(dt, 0, 99);
}
MOB_TYPES.ballistic_missile = { name: 'Silo Missile', hp: 30, w: 1.2, h: 1.2, speed: 0, sound: 'golem', pitch: 1, drops: [], anim: 'missile', icbm: true, flies: true,
  fireImmune: true, noFall: true, heavy: true, xp: [0, 0], ai: missileAI, gear: missileGear,
  // pointing along its arc, flame roaring out of the back
  animate: (m) => {
    const inner = m.model.inner;
    inner.scale.setScalar(2.2 / 16);
    // (a guest's copy works out which way it points from how it moves, and makes its own smoke)
    if (m.proxy && Math.hypot(m.vel.x, m.vel.y, m.vel.z) > 2) {
      m.fp = Math.atan2(m.vel.y, Math.hypot(m.vel.x, m.vel.z));
      const v = 0.72 * (0.3 + 0.7 * clamp(G.daylight ?? 1, 0, 1));
      for (let i = 0; i < 2; i++) G.entities.particles.spawn(m.pos.x, m.pos.y + 0.6, m.pos.z, (rand() - 0.5) * 0.8, 0.3, (rand() - 0.5) * 0.8, v, v, v, 0.5 + rand() * 0.4, 2 + rand() * 1.5, -0.06);
    }
    inner.rotation.x = -(m.fp || 0);
    if (!m.flame || m.flame.parent !== inner) {
      m.flame = new THREE.Group();
      m.flame.add(new THREE.Mesh(flameGeo[0], flameMat[0]), new THREE.Mesh(flameGeo[1], flameMat[1]));
      m.flame.position.set(0, 5, -19);
      inner.add(m.flame);
    }
    m.flame.scale.set(0.85 + rand() * 0.3, 0.85 + rand() * 0.3, 0.7 + rand() * 0.6);
  } };

// ---------------------------------------------------------------- loading and launching
// Where a missile would land at x, z: on top of the ground there
function groundAt(x, z) {
  const w = G.world, X = Math.floor(x), Z = Math.floor(z);
  if (w.getChunk(X >> 4, Z >> 4)) { for (let y = 127; y > 1; y--) if (BLOCKS[w.getBlock(X, y, Z)].solid) return y + 1; }
  return Math.max(1, w.column(X, Z).h + 1);
}
export function launchSilo(s, x, z, by, wh = 0) {
  wh = clamp(wh | 0, 0, WARHEADS.length - 1);
  if (isGuest()) { G.net.send({ k: 'silo', id: s.netId, a: 'launch', x, z, wh }); return 'Launching…'; }
  if (!s || s.dead || !s.def.silo) return 'There is no silo';
  if (!s.gear.coat) return 'Load a missile first';
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 'Choose a target first';
  const k = SILO_MISSILES[s.gear.coat - 1], dist = Math.hypot(x - s.pos.x, z - s.pos.z);
  if (dist > k.range) return `Too far: a ${k.name} reaches ${k.range} blocks`;
  const sy = s.pos.y + 0.6, ty = groundAt(x, z);
  const T = 4 + dist / 75, h = clamp(40 + dist * 0.3, 40, Math.max(20, 240 - Math.max(sy, ty)));
  // (a rewind point first, so whatever it blows up can be put back: see rewind.js)
  if (WARHEADS[wh].r && G.game.rewindPoint) G.game.rewindPoint(`Before a ${WARHEADS[wh].name} launch`, true);
  const m = G.entities.spawnMob('ballistic_missile', s.pos.x, sy, s.pos.z, { stay: true, gear: { coat: s.gear.coat - 1, wh, by: by || '', t: 0, path: { sx: s.pos.x, sy, sz: s.pos.z, tx: Math.floor(x) + 0.5, ty, tz: Math.floor(z) + 0.5, T, h } } });
  m.hp = m.maxHp = k.hp;
  s.gear.coat = 0; s.vDirty = true;
  s.doors = 2.5;
  launchFlash(s.pos.x, s.pos.y + 2, s.pos.z, 0, 1, 0, 3);
  sfx('rocket', s.pos, { vol: 2, pitch: 0.6 });
  if (G.net) G.net.vfx('sl', [s.pos.x, s.pos.y + 2, s.pos.z]);
  return `${WARHEADS[wh].name} launched at ${Math.floor(x)}, ${Math.floor(z)} (${Math.round(dist)} blocks away)`;
}
// (somebody else's launch, seen here)
export function siloLaunchFx(a) { launchFlash(a[0], a[1], a[2], 0, 1, 0, 3); sfx('rocket', { x: a[0], y: a[1], z: a[2] }, { vol: 2, pitch: 0.6 }); }
const otherVfx = G.onVfx;
G.onVfx = (t, a) => { if (t === 'sl') { if (Array.isArray(a) && a.slice(0, 3).every(Number.isFinite)) siloLaunchFx(a); return; } if (otherVfx) otherVfx(t, a); };
export function loadSilo(s, kind) {
  if (!s || s.dead || !SILO_MISSILES[kind]) return;
  if (isGuest()) { G.net.send({ k: 'silo', id: s.netId, a: 'load', kind }); s.gear.coat = kind + 1; return; }
  s.gear.coat = kind + 1; s.vDirty = true;
}
export function unloadSilo(s) {
  if (!s || s.dead) return;
  if (isGuest()) { G.net.send({ k: 'silo', id: s.netId, a: 'unload' }); s.gear.coat = 0; return; }
  s.gear.coat = 0; s.vDirty = true;
}
// A guest's doings at a silo, where the world lives
export function siloMsg(s, d, by) {
  if (!s || !s.def || !s.def.silo) return;
  if (d.a === 'load') loadSilo(s, d.kind | 0);
  else if (d.a === 'unload') unloadSilo(s);
  else if (d.a === 'launch') launchSilo(s, +d.x, +d.z, by, d.wh | 0);
}
export function placeSilo(x, y, z, yaw) {
  const owner = myName();
  if (G.net && G.net.role === 'client') { G.net.send({ k: 'bo', x, y, z, yaw, t: 'missile_silo', o: owner }); return; }
  spawnSilo(x, y, z, yaw, owner);
}
export function spawnSilo(x, y, z, yaw, owner) {
  const s = G.entities.spawnMob('missile_silo', x, y, z, { gear: { owner, coat: 0 } });
  s.yaw = yaw;
  sfx('anvil', s.pos, { vol: 0.6 });
  return s;
}

// ---------------------------------------------------------------- the Targeting System
// Hold it and use it on a spot (up to 600 blocks away) to mark it as the target; a silo's screen offers it
export function markTarget(p) {
  const d = p.lookDir(), hit = raycast(G.world, p.pos.x, p.eyeY, p.pos.z, d.x, d.y, d.z, 600, (id) => BLOCKS[id].solid || id === B.water);
  if (!hit) { p.hint('Nothing there to mark (it is too far, or not loaded)'); return; }
  p.mark = { x: hit.x, y: hit.y + 1, z: hit.z };
  const far = Math.round(Math.hypot(hit.x - p.pos.x, hit.z - p.pos.z));
  p.hint(`Target marked at ${hit.x}, ${hit.y + 1}, ${hit.z} (${far} blocks away). Use a missile silo to launch at it`);
  sfx('click', null, { pitch: 1.6 });
  const P = G.entities.particles;
  for (let i = 0; i < 24; i++) P.spawn(hit.x + 0.5, hit.y + 1.1, hit.z + 0.5, (rand() - 0.5) * 3, 2 + rand() * 3, (rand() - 0.5) * 3, 1, 0.1, 0.1, 0.25, 1.2, 0.3);
}

// ---------------------------------------------------------------- the silo's screen
let section = null;
const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
const count = (p, id) => p.inv.slots.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
function takeOne(p, id) {
  for (let i = 0; i < p.inv.slots.length; i++) { const s = p.inv.slots[i]; if (s && s.id === id) { if (--s.count <= 0) p.inv.slots[i] = null; G.ui.invChanged(); return true; } }
  return false;
}
export function openSilo(s, note = '') {
  const p = G.player;
  if (!section) {
    section = el('section');
    section.className = 'screen dim';
    section.id = 's-silo';
    section.hidden = true;
    const anchor = document.getElementById('s-container');
    anchor.parentNode.insertBefore(section, anchor);
  }
  section.textContent = '';
  section.appendChild(el('h2', null, 'Missile Silo'));
  const box = el('div', 'width:min(760px,100%);margin:6px auto;padding:10px 16px;box-sizing:border-box;background:rgba(0,0,0,0.45);font:16px/1.4 monospace;max-height:76vh;overflow:auto;touch-action:pan-y;text-align:left;color:#eee');
  section.appendChild(box);
  const loaded = s.gear.coat ? SILO_MISSILES[s.gear.coat - 1] : null;
  // 1. the missile
  box.appendChild(el('div', 'color:#ffd866;margin-bottom:6px', '1. Load a missile'));
  box.appendChild(el('div', 'margin-bottom:6px', loaded ? `Loaded: ${loaded.name} (reaches ${loaded.range} blocks, takes ${loaded.hp} damage to shoot down)` : 'Empty. Each launch uses one missile.'));
  const loads = el('div', 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px');
  const creative = p.creative;
  SILO_MISSILES.forEach((k, i) => {
    const have = count(p, ID[k.key]);
    const b = el('button', 'font:15px monospace;padding:6px 10px;color:#fff;background:#2b2b2b;border:2px solid #666;cursor:pointer', `${k.name.replace(' Missile', '')}: ${k.range} blocks (${creative ? 'Creative' : 'you have ' + have})`);
    b.type = 'button';
    b.disabled = !!loaded || (!creative && !have);
    if (b.disabled) b.style.opacity = '0.45';
    b.addEventListener('click', () => { if (!creative && !takeOne(p, ID[k.key])) return; loadSilo(s, i); sfx('anvil', null, { vol: 0.4, pitch: 1.4 }); openSilo(s); });
    loads.appendChild(b);
  });
  if (loaded) {
    const b = el('button', 'font:15px monospace;padding:6px 10px;color:#fff;background:#2b2b2b;border:2px solid #666;cursor:pointer', 'Take it out');
    b.type = 'button';
    b.addEventListener('click', () => { if (!creative) { const left = p.inv.add(ID[loaded.key], 1); if (left) G.entities.dropItem(ID[loaded.key], 1, p.pos.x, p.pos.y + 1, p.pos.z); G.ui.invChanged(); } unloadSilo(s); openSilo(s); });
    loads.appendChild(b);
  }
  box.appendChild(loads);
  // 2. the warhead (what it costs in Survival is taken at launch)
  box.appendChild(el('div', 'color:#ffd866;margin-bottom:6px', '2. Choose the warhead'));
  const tnt = count(p, ID.tnt);
  let wh = clamp(s.gear.wh | 0, 0, WARHEADS.length - 1);
  const whs = el('div', 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px');
  const whAbout = el('div', 'margin-bottom:10px;min-height:20px');
  const whBtns = WARHEADS.map((W, i) => {
    const b = el('button', 'font:15px monospace;padding:6px 10px;color:#fff;cursor:pointer', W.name + (creative || !W.tnt ? '' : ` (${W.tnt} TNT)`));
    b.type = 'button';
    b.addEventListener('click', () => { wh = i; s.gear.wh = i; showWh(); });
    whs.appendChild(b);
    return b;
  });
  const showWh = () => {
    whBtns.forEach((b, i) => {
      const W = WARHEADS[i], on = i === wh;
      b.style.background = on ? (W.nuke ? '#6b5200' : '#3d5a2a') : '#2b2b2b';
      b.style.border = on ? '2px solid ' + (W.nuke ? '#ffd23a' : '#9f9') : '2px solid #666';
    });
    const W = WARHEADS[wh];
    const short = !creative && W.tnt > tnt;
    whAbout.textContent = `${W.name}: ${W.about}${W.r ? ` (crater ${W.r * 2} blocks across)` : ''}.` + (creative || !W.tnt ? '' : ` Costs ${W.tnt} TNT, you have ${tnt}.`);
    whAbout.style.color = short ? '#ff7b6b' : W.nuke ? '#ffd23a' : '#ddd';
    info();
  };
  box.appendChild(whs);
  box.appendChild(whAbout);
  // 3. the target
  box.appendChild(el('div', 'color:#ffd866;margin-bottom:6px', '3. Choose where it lands'));
  const row = el('div', 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px');
  const inp = (label, v) => { const i = el('input', 'width:110px;font:18px monospace;padding:4px;background:#111;color:#7dff8a;border:2px solid #555'); i.type = 'number'; i.value = v; row.append(el('span', null, label), i); return i; };
  const t0 = s.target || p.mark || null;
  const ix = inp('X', t0 ? t0.x : ''), iz = inp('Z', t0 ? t0.z : '');
  box.appendChild(row);
  const quick = el('div', 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px');
  const qb = (label, fn) => { const b = el('button', 'font:15px monospace;padding:5px 9px;color:#cfe;background:#2b2b2b;border:1px solid #666;cursor:pointer', label); b.type = 'button'; b.addEventListener('click', fn); quick.appendChild(b); };
  if (p.mark) qb(`Marked target (${p.mark.x}, ${p.mark.z})`, () => { ix.value = p.mark.x; iz.value = p.mark.z; info(); });
  qb('Where I am standing', () => { ix.value = Math.floor(p.pos.x); iz.value = Math.floor(p.pos.z); info(); });
  box.appendChild(quick);
  box.appendChild(el('div', 'color:#aaa;font-size:14px;margin-bottom:6px', 'Tip: hold a Targeting System and click a spot far away to mark it, then come back here.'));
  const status = el('div', 'margin:6px 0;min-height:22px');
  box.appendChild(status);
  const info = () => {
    const x = parseFloat(ix.value), z = parseFloat(iz.value);
    if (!Number.isFinite(x) || !Number.isFinite(z)) { status.textContent = 'No target yet.'; status.style.color = '#aaa'; return null; }
    const dist = Math.round(Math.hypot(x - s.pos.x, z - s.pos.z));
    if (!loaded) { status.textContent = `${dist} blocks away.`; status.style.color = '#ddd'; return null; }
    if (dist > loaded.range) { status.textContent = `${dist} blocks away: too far for this missile (it reaches ${loaded.range}).`; status.style.color = '#ff7b6b'; return null; }
    const W = WARHEADS[wh], danger = Math.max(25, W.r * (W.nuke ? 4 : 2.5));
    const me = Math.round(Math.hypot(x - p.pos.x, z - p.pos.z));
    status.textContent = `${dist} blocks away: in range.${dist < danger ? ' Careful: that is right next to the silo!' : me < danger ? ' Careful: you are standing in the blast!' : ''}`; status.style.color = dist < danger || me < danger ? '#ffb347' : '#8f8';
    return { x, z };
  };
  ix.addEventListener('input', info); iz.addEventListener('input', info);
  showWh();
  box.appendChild(el('div', 'color:#aaa;font-size:14px', 'Turrets can shoot a missile down on its way if they hit it enough: then it blows up in the air and breaks nothing. If a warhead wrecks something by mistake, Rewind in the Game Menu puts the world back.'));
  if (note) box.appendChild(el('div', 'color:#ffd866;margin-top:8px', note));
  // 3. launch
  const btns = el('div');
  btns.className = 'row';
  const go = el('button', 'background:#8a1d14;color:#fff', 'LAUNCH');
  go.className = 'btn'; go.type = 'button';
  go.addEventListener('click', () => {
    const t = info();
    if (!t) { sfx('click', null, { pitch: 0.5 }); return; }
    const W = WARHEADS[wh];
    if (!creative && W.tnt) {
      if (count(p, ID.tnt) < W.tnt) { status.textContent = `A ${W.name} warhead needs ${W.tnt} TNT.`; status.style.color = '#ff7b6b'; sfx('click', null, { pitch: 0.5 }); return; }
      for (let i = 0; i < W.tnt; i++) takeOne(p, ID.tnt);
    }
    s.target = { x: Math.floor(t.x), z: Math.floor(t.z) };
    const msg = launchSilo(s, t.x, t.z, myName(), wh);
    G.ui.back();
    p.hint(msg);
  });
  const done = el('button', null, 'Done');
  done.className = 'btn'; done.type = 'button';
  done.addEventListener('click', () => G.ui.back());
  btns.append(go, done);
  section.appendChild(btns);
  if (G.screen !== 'silo') G.ui.openScreen('silo');
}
