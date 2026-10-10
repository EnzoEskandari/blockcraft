// Riding: horses and donkeys (tamed by sitting on them until they stop throwing you, then saddled),
// striders (saddled; they walk on lava) and boats. Whoever rides moves as a player does and the mount is
// carried along under them; an animal that cannot be steered yet carries its rider where it likes.
import { G } from './game.js';
import { B, ID, ITEMS } from './blocks.js';
import { moveBox, boxBlocked } from './physics.js';
import { sfx } from './audio.js';
import { MOB_TYPES, MODELS, Entities, quadLegs, rect, px } from './entities.js';
import { BIOME } from './constants.js';

const rand = Math.random;
const drop = (key, min, max) => ({ key, min, max });

// ---------------------------------------------------------------- what they look like
const COATS = [[124, 74, 40], [92, 56, 32], [38, 34, 34], [232, 228, 220], [150, 150, 152], [214, 176, 112]];
const LEATHER = [112, 62, 30];
const ARMOR_COLORS = { leather_horse_armor: [150, 86, 44], iron_horse_armor: [206, 206, 210], golden_horse_armor: [246, 208, 62], diamond_horse_armor: [74, 220, 208] };
const dark = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
// (a model's variant: 'coat.saddled.armour')
const gearOf = (v) => { const a = String(v || '0.0.0').split('.'); return { coat: +a[0] || 0, saddle: a[1] === '1', armor: +a[2] || 0 }; };

function equine(v, donkey) {
  const g = gearOf(v);
  const coat = donkey ? [128, 114, 100] : COATS[g.coat % COATS.length], mane = donkey ? [70, 60, 54] : dark(coat, g.coat === 3 ? 0.8 : 0.5);
  const s = donkey ? 0.86 : 1;   // (a donkey is a smaller animal)
  const leg = 12 * s, bodyY = leg + 5 * s;
  const parts = [
    { name: 'body', size: [10 * s, 10 * s, 22 * s], pos: [0, bodyY, 0], color: coat },
    { name: 'neck', size: [4 * s, 11 * s, 6 * s], pos: [0, bodyY + 7 * s, 10 * s], rot: [0.5, 0, 0], color: coat },
    { name: 'head', size: [5 * s, 5 * s, 10 * s], pos: [0, bodyY + 12.5 * s, 14 * s], rot: [0.35, 0, 0], color: coat, paint: {
      front: (gx, x, y, w) => { rect(gx, x, y + 3, w, 2, dark(coat, 0.75)); px(gx, x + 1, y + 3, [30, 20, 16]); px(gx, x + w - 2, y + 3, [30, 20, 16]); },
      px: (gx, x, y) => px(gx, x + 2, y + 1, [20, 16, 14]), nx: (gx, x, y, w) => px(gx, x + w - 3, y + 1, [20, 16, 14]),
    } },
    { name: 'mane', size: [2 * s, 12 * s, 2 * s], pos: [0, bodyY + 8 * s, 6.5 * s], rot: [0.5, 0, 0], color: mane },
    { name: 'tail', size: [3 * s, 11 * s, 3 * s], pos: [0, bodyY + 1 * s, -11.5 * s], rot: [0.45, 0, 0], color: mane },
    ...[-1, 1].map((k, i) => ({ name: 'ear' + i, parent: 'head', size: [1.5, donkey ? 6 : 2.5, 1], pos: [k * 1.7 * s, (donkey ? 5 : 3.4) * s, -3 * s], color: donkey ? dark(coat, 0.8) : coat })),
    ...quadLegs([4 * s, leg, 4 * s], [-3 * s, 3 * s], leg, [-8 * s, 8 * s], dark(coat, 0.85), { all: (gx, x, y, w, h) => rect(gx, x, y + h - 2, w, 2, [36, 30, 28]) }),
  ];
  if (g.armor && ITEMS[g.armor]) {
    const c = ARMOR_COLORS[ITEMS[g.armor].key] || [200, 200, 200];
    parts.push({ name: 'barding', size: [11 * s, 7 * s, 23 * s], pos: [0, bodyY + 1.6 * s, 0], color: c, paint: { all: (gx, x, y, w, h) => rect(gx, x, y + h - 1, w, 1, dark(c, 0.7)) } });
    parts.push({ name: 'faceplate', parent: 'head', size: [5.6 * s, 3 * s, 7 * s], pos: [0, 1.6 * s, 1.5 * s], color: c });
  }
  if (g.saddle) {
    parts.push({ name: 'saddle', size: [10.6 * s, 2, 9 * s], pos: [0, bodyY + 5.5 * s, -1 * s], color: LEATHER, paint: { top: (gx, x, y, w, h) => rect(gx, x + 1, y + 1, w - 2, h - 2, dark(LEATHER, 1.25)) } });
    for (const k of [-1, 1]) parts.push({ name: 'stirrup' + k, size: [1, 6 * s, 2], pos: [k * 5.6 * s, bodyY + 2 * s, -1 * s], color: [150, 150, 156] });
  }
  return parts;
}
const PLANK = [176, 140, 86];
Object.assign(MODELS, {
  horse: (v) => equine(v, false),
  donkey: (v) => equine(v, true),
  boat: () => [
    { name: 'floor', size: [16, 2, 26], pos: [0, 1, 0], color: dark(PLANK, 0.8) },
    { name: 'side0', size: [2, 6, 28], pos: [-9, 5, 0], color: PLANK }, { name: 'side1', size: [2, 6, 28], pos: [9, 5, 0], color: PLANK },
    { name: 'bow', size: [16, 6, 2], pos: [0, 5, 13], color: PLANK }, { name: 'stern', size: [16, 6, 2], pos: [0, 5, -13], color: PLANK },
    { name: 'oar0', size: [1, 1, 18], pos: [-10.5, 8, 0], rot: [0, 0, 0], color: dark(PLANK, 0.7) }, { name: 'oar1', size: [1, 1, 18], pos: [10.5, 8, 0], color: dark(PLANK, 0.7) },
    { name: 'blade0', parent: 'oar0', size: [1, 3, 5], pos: [0, 0, -9], color: dark(PLANK, 0.7) }, { name: 'blade1', parent: 'oar1', size: [1, 3, 5], pos: [0, 0, -9], color: dark(PLANK, 0.7) },
  ],
});
// (a strider can be saddled too)
const plainStrider = MODELS.strider;
MODELS.strider = (v) => {
  const parts = plainStrider();
  if (gearOf(v).saddle) parts.push({ name: 'saddle', size: [17, 3, 10], pos: [0, 30.6, 0], color: LEATHER });
  return parts;
};

// ---------------------------------------------------------------- what they are
// What a newly met animal is like (`saved`: what was kept of one met before)
const gearFor = (wild) => (saved) => {
  const g = saved && typeof saved === 'object' ? saved : {};
  return {
    coat: Number.isFinite(g.coat) ? g.coat | 0 : Math.floor(rand() * COATS.length),
    tame: wild ? !!g.tame : true, saddle: !!g.saddle, armor: ITEMS[g.armor] && ITEMS[g.armor].horseArmor ? g.armor : 0,
    spd: g.spd >= 0.7 && g.spd <= 1.4 ? g.spd : Math.round((0.85 + rand() * 0.35) * 100) / 100,   // (some are quicker than others)
    temper: Math.max(0, Math.min(100, g.temper | 0)),
  };
};
// Can whoever sits on it decide where it goes?
export const canSteer = (m) => !!m.def.boat || (!!m.gear && m.gear.saddle && m.gear.tame);

const rideable = { persistent: true, mount: true, rideTick, unseat };
Object.assign(MOB_TYPES, {
  horse: { name: 'Horse', hp: 26, w: 1.2, h: 1.6, speed: 1.9, sound: 'horse', pitch: 1, drops: [drop('leather', 0, 2)], anim: 'quad', gear: gearFor(true), seat: 1.3,
    ride: { speed: 9.2, jump: 11.5, step: 1.05 }, xp: [1, 3], ...rideable },
  donkey: { name: 'Donkey', hp: 22, w: 1.1, h: 1.4, speed: 1.6, sound: 'donkey', pitch: 1, drops: [drop('leather', 0, 2)], anim: 'quad', gear: gearFor(true), seat: 1.1,
    ride: { speed: 7, jump: 10, step: 1.05 }, xp: [1, 3], ...rideable },
  boat: { name: 'Boat', hp: 3, w: 1.3, h: 0.55, speed: 0, sound: 'boat', pitch: 1, drops: [drop('boat', 1, 1)], anim: 'boat', boat: true, fireImmune: true, seat: 0.12,
    ride: { speed: 7.6, land: 0.7, float: B.water, sink: 0.12 }, xp: [0, 0], ai: boatAI, animate: rowing, ...rideable },
});
Object.assign(MOB_TYPES.strider, { gear: gearFor(false), seat: 1.72, ride: { speed: 4.2, land: 1.3, float: B.lava, sink: 0, step: 1.05 }, ...rideable, persistent: false });

function rowing(m, dt, hs) {
  const P = m.model.parts, go = Math.min(1, hs / 3);
  m.row = (m.row || 0) + dt * (2 + hs * 0.9) * go;
  for (const [k, oar] of [[1, P.oar0], [-1, P.oar1]]) { oar.rotation.y = k * (0.5 + Math.sin(m.row) * 0.5 * go); oar.rotation.x = -0.25 - Math.cos(m.row) * 0.2 * go; }
  m.model.inner.position.y = m.afloat ? Math.sin(m.age * 1.7) * 0.02 : 0;
}

// ---------------------------------------------------------------- floating
// Where something that floats on `liquid` should rest, given the point `sink` below its waterline:
// 1 it is under and must rise, 0 it rests on the surface at `y`, -1 there is no liquid under it
function floatAt(w, x, y, z, liquid, sink) {
  const bx = Math.floor(x), bz = Math.floor(z), cy = Math.floor(y + sink + 0.03);
  if (w.getBlock(bx, cy, bz) === liquid) return { how: 1 };
  if (w.getBlock(bx, cy - 1, bz) === liquid) return { how: 0, y: cy - sink };
  return { how: -1 };
}

// A boat with nobody in it: it floats, drifts to a stop, and falls if there is nothing under it
function boatAI(m, dt) {
  m.age += dt; m.hurtTime -= dt; m.invul -= dt;
  if (m.dead) { m.removed = true; return; }
  const w = G.world, f = floatAt(w, m.pos.x, m.pos.y, m.pos.z, B.water, m.def.ride.sink);
  m.afloat = f.how >= 0;
  if (f.how === 1) m.vel.y = Math.min(m.vel.y + 30 * dt, 3);
  else if (f.how === 0) m.vel.y = (f.y - m.pos.y) * 10;
  else m.vel.y = Math.max(m.vel.y - 32 * dt, -40);
  const k = Math.max(0, 1 - dt * (m.afloat ? 1.5 : 6));
  m.vel.x *= k; m.vel.z *= k;
  const res = moveBox(w, m, m.vel.x * dt, m.vel.y * dt, m.vel.z * dt);
  if (res.y) m.vel.y = 0;
  if (res.x) m.vel.x = 0;
  if (res.z) m.vel.z = 0;
  m.onGround = res.ground;
  m.animate(dt, 0, 99);
}

// ---------------------------------------------------------------- being ridden
function riderOf(m) {
  if (m.riderId === 'local') return G.player.riding === m ? G.player : null;
  return (G.net && G.net.players.get(m.riderId)) || null;
}
function release(m) {
  m.riderId = null; m.ridden = false; m.tameT = 0;
  m.vDirty = true;
}
// Whoever was on it is put down (it died, or threw them)
function unseat(m, why) {
  if (m.riderId == null && !m.ridden) return;
  if (G.player.riding === m) G.player.dismount(why);
  else if (m.riderId != null && m.riderId !== 'local' && G.net) G.net.sendTo(m.riderId, { k: 'mur', id: m.netId, r: { did: 'off', why } });
  release(m);
}

// It goes where its rider goes
function carry(m, rider, dt) {
  const ox = m.pos.x, oz = m.pos.z;
  m.pos.x = rider.pos.x; m.pos.y = rider.pos.y; m.pos.z = rider.pos.z;
  let d = rider.yaw + Math.PI - m.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  m.yaw += d * Math.min(1, dt * 10);
  m.age += dt; m.hurtTime -= dt; m.invul -= dt;
  const hs = dt > 0 ? Math.min(12, Math.hypot(m.pos.x - ox, m.pos.z - oz) / dt) : 0;
  m.vel.x = m.vel.y = m.vel.z = 0;
  m.onGround = true; m.fire = 0; m.angry = false;
  m.afloat = !!m.def.boat && G.world.getBlock(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.3), Math.floor(m.pos.z)) === B.water;
  m.animate(dt, hs * 0.6, 0);
}

// Each frame for an animal or boat someone is on; true when that was all it had to do
function rideTick(m, dt) {
  const mine = m.ridden && G.player.riding === m;
  if (m.dead) { if (!m.proxy) unseat(m); return false; }
  if (m.proxy) {
    // a guest's copy: their own mount is carried along at once; anybody else's follows the host
    if (!mine || !canSteer(m)) return false;
    carry(m, G.player, dt);
    return true;
  }
  const rider = riderOf(m);
  const gone = !rider || rider.dead || rider.gone || (m.riderId !== 'local' && !rider.seat && G.clock - (m.rideAt || 0) > 3);
  if (gone) { release(m); return false; }
  if (!canSteer(m)) { if (!m.gear.tame) taming(m, dt); return false; }
  carry(m, rider, dt);
  return true;
}

// An untamed horse or donkey runs about with whoever is on it; after a moment it either throws them or
// gives in. Each try makes it more willing.
function taming(m, dt) {
  m.ai.panic = 1.5;
  m.tameT = (m.tameT || 0) + dt;
  if (m.tameT < 1.8 + (m.tameRoll || 0)) return;
  m.tameT = 0; m.tameRoll = rand() * 1.5;
  const g = m.gear;
  if (rand() * 100 < 15 + g.temper) {
    g.tame = true; g.temper = 100;
    m.ai.panic = 0;
    for (let i = 0; i < 10; i++) G.entities.particles.spawn(m.pos.x + (rand() - 0.5) * 1.2, m.pos.y + m.h + rand() * 0.6, m.pos.z + (rand() - 0.5) * 1.2, 0, 0.6, 0, 0.95, 0.2, 0.3, 0.1, 1.0, -0.02);
    tell(m, { did: 'tamed' });
    m.regear();
  } else {
    g.temper = Math.min(95, g.temper + 14 + Math.floor(rand() * 10));
    sfx(m.def.sound, m.pos, { neigh: true });
    unseat(m, 'buck');
  }
}
// Tells whoever is on it something
function tell(m, r) {
  if (G.player.riding === m) applyUse(G.player, m, r);
  else if (m.riderId != null && m.riderId !== 'local' && G.net) G.net.sendTo(m.riderId, { k: 'mur', id: m.netId, r });
}

// ---------------------------------------------------------------- using one
const FEED = { apple: 3, wheat: 2, bread: 4, golden_apple: 10, hay_bale: 8, carrot: 2 };
// What happens when `who` ('local' or a guest's number) uses the thing they hold on it. Done where the
// animal really lives (the host); the answer says what the player's own game must then do.
export function decideUse(m, who, item, sneak) {
  const def = m.def, g = m.gear, it = ITEMS[item], horse = m.type === 'horse' || m.type === 'donkey';
  if (m.dead) return { did: 'none' };
  if (m.riderId != null && m.riderId !== who) return { did: 'hint', text: 'Someone is already riding it' };
  if (def.boat) return seat(m, who);
  if (it && it.key === 'saddle' && !g.saddle) {
    if (horse && !g.tame) return { did: 'hint', text: 'It will not take a saddle until it is tame. Sit on it until it stops throwing you' };
    g.saddle = true; m.persistent = true; m.regear();   // (and it is yours now: it stays)
    return { did: 'gear' };
  }
  if (it && it.horseArmor && m.type === 'horse' && !g.armor) {
    if (!g.tame) return { did: 'hint', text: 'It has to be tamed first' };
    g.armor = item; m.regear();
    return { did: 'gear' };
  }
  if (it && horse && FEED[it.key] && (m.hp < m.maxHp || !g.tame)) {
    m.hp = Math.min(m.maxHp, m.hp + FEED[it.key]);
    if (!g.tame) g.temper = Math.min(95, g.temper + FEED[it.key] * 3);
    return { did: 'feed' };
  }
  if (sneak && (g.saddle || g.armor)) {
    // (taken off again: the armour first, then the saddle)
    const id = g.armor || ID.saddle;
    if (g.armor) g.armor = 0; else g.saddle = false;
    G.entities.dropItem(id, 1, m.pos.x, m.pos.y + m.h, m.pos.z, 0, 3, 0);
    m.regear();
    return { did: 'ungear' };
  }
  if (m.type === 'strider' && !g.saddle) return { did: 'hint', text: 'A strider needs a saddle before it can be ridden' };
  return seat(m, who);
}
function seat(m, who) {
  m.riderId = who; m.rideAt = G.clock; m.tameT = 0;
  m.vDirty = true;
  return { did: 'mount' };
}
// What the player's own game does with the answer
export function applyUse(p, m, r) {
  if (!r) return;
  if (r.did === 'gear' || r.did === 'feed') {
    if (!p.creative && p.inv.held) { p.inv.held.count--; if (p.inv.held.count <= 0) p.inv.slots[p.inv.selected] = null; }
    G.ui.invChanged();
    sfx(r.did === 'feed' ? 'eat' : 'saddle', m.pos);
  } else if (r.did === 'ungear') sfx('saddle', m.pos);
  else if (r.did === 'hint') p.hint(r.text);
  else if (r.did === 'mount') { p.mountUp(m); if (m.gear && !m.gear.tame) p.hint('Hold on! It will throw you until it trusts you'); else if (m.gear && !m.gear.saddle) p.hint('Without a saddle it goes where it likes'); }
  else if (r.did === 'off') p.dismount(r.why);
  else if (r.did === 'tamed') { G.ui.toast(`The ${m.def.name.toLowerCase()} is tame. Put a saddle on it to ride where you like`); sfx('levelup', null, { vol: 0.5 }); if (G.adv) G.adv.did('tame'); }
}
// The player uses what they hold on a mount
export function useMount(p, m) {
  const id = p.inv.held ? p.inv.held.id : 0;
  if (m.proxy) { G.net.send({ k: 'mu', id: m.netId, i: id, s: p.sneaking ? 1 : 0 }); return true; }
  applyUse(p, m, decideUse(m, 'local', id, p.sneaking));
  return true;
}
// What the button on a touch screen says for it
export function useLabel(p, m) {
  const it = p.inv.held ? ITEMS[p.inv.held.id] : null, g = m.gear;
  if (m.def.boat) return 'Get in';
  if (it && it.key === 'saddle' && !g.saddle) return 'Saddle';
  if (it && it.horseArmor && m.type === 'horse' && !g.armor) return 'Armour';
  if (it && FEED[it.key] && m.type !== 'strider' && (m.hp < m.maxHp || !g.tame)) return 'Feed';
  return g.tame || m.type === 'strider' ? 'Ride' : 'Tame';
}

// Getting off (a guest tells the host, who lets the animal go)
export function leaveMount(m) {
  if (m.proxy) { m.ridden = false; if (G.net) G.net.send({ k: 'mo', id: m.netId }); } else release(m);
}

// A boat set down where the player points: on the water, or on the ground
export function placeBoat(x, y, z, yaw) {
  if (G.net && G.net.role === 'client') { G.net.send({ k: 'bo', x, y, z, yaw }); return; }
  const m = G.entities.spawnMob('boat', x, y, z);
  m.yaw = yaw; m.model.root.rotation.y = yaw;
  sfx('splash', m.pos, { vol: 0.5 });
}

// ---------------------------------------------------------------- the rider's movement
// The player on a mount they can steer: they move much as on foot, with the mount's pace and jump, and
// boats and striders ride on top of water and lava.
export function rideMove(p, dt, input) {
  const m = p.riding, R = m.def.ride, w = G.world;
  let fwd = input.moveZ, str = input.moveX * 0.6;
  const len = Math.hypot(fwd, str);
  if (len > 1) { fwd /= len; str /= len; }
  if (fwd < 0) fwd *= 0.4;   // (backing up is slow)
  const f = R.float ? floatAt(w, p.pos.x, p.pos.y, p.pos.z, R.float, R.sink) : null;
  const afloat = !!f && f.how >= 0;
  const bx = Math.floor(p.pos.x), bz = Math.floor(p.pos.z);
  const wet = !R.float && w.getBlock(bx, Math.floor(p.pos.y + 0.6), bz) === B.water;
  let speed = R.float ? (afloat ? R.speed : R.land) : R.speed * (m.gear ? m.gear.spd : 1) * (wet ? 0.4 : 1);
  if (p.effects.slow > 0) speed *= 0.7;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  const wx = (-sy * fwd + cy * str) * speed, wz = (-cy * fwd - sy * str) * speed;
  // (a boat gathers way and loses it slowly; an animal answers at once)
  const k = Math.min(1, (m.def.boat ? (afloat ? 1.6 : 6) : p.onGround ? 9 : 3) * dt);
  p.vel.x += (wx - p.vel.x) * k;
  p.vel.z += (wz - p.vel.z) * k;
  if (f && f.how === 1) p.vel.y = Math.min(p.vel.y + 30 * dt, 3);
  else if (f && f.how === 0) p.vel.y = (f.y - p.pos.y) * 10;
  else if (wet) p.vel.y = Math.min(p.vel.y + 26 * dt, 2.2);   // (a horse swims)
  else {
    p.vel.y = Math.max(p.vel.y - 32 * dt, -78);
    if (input.jump && p.onGround && R.jump) { p.vel.y = R.jump; sfx('gallop', null, { vol: 0.5 }); }
  }
  const oy = p.pos.y, ox = p.pos.x, oz = p.pos.z;
  const res = moveBox(w, p, p.vel.x * dt, p.vel.y * dt, p.vel.z * dt, afloat || wet ? 0.6 : R.step || 0);
  if (res.x) p.vel.x = 0;
  if (res.z) p.vel.z = 0;
  if (res.y) p.vel.y = 0;
  const wasGround = p.onGround;
  p.onGround = res.ground || (afloat && f.how === 0);
  // (falls are easier on a mount, but a long one still hurts)
  const fell = oy - p.pos.y;
  if (!p.onGround && fell > 0 && !afloat && !wet) p.fallDist += fell;
  if (afloat || wet) p.fallDist = 0;
  if (p.onGround && !wasGround) {
    if (p.fallDist > 6 && !p.creative) { p.hurt(Math.floor((p.fallDist - 6) / 2) + 1, null, null, 'fall'); sfx('fall'); }
    p.fallDist = 0;
  }
  const moved = Math.hypot(p.pos.x - ox, p.pos.z - oz);
  p.stepDist += moved;
  if (p.stepDist > (m.def.boat ? 3.2 : 2.4) && (p.onGround || afloat)) {
    p.stepDist = 0;
    if (m.def.boat) { if (afloat) sfx('paddle', null, { vol: 0.5 }); } else if (!R.float) sfx('gallop', null, { vol: 0.45 });
  }
  p.bobAmt *= Math.max(0, 1 - dt * 8);
  if (p.pos.y < -30) p.hurt(4, null, null, 'void');
}

// ---------------------------------------------------------------- where horses come from
const OPEN = [BIOME.PLAINS, BIOME.SAVANNA, BIOME.MEADOW, BIOME.SUNFLOWER];
// (land seen for the first time: now and then the animals placed there are horses or donkeys)
Entities.prototype.pickPassive = function (biome) {
  if (!OPEN.includes(biome)) return null;
  const r = rand();
  return r < 0.22 ? 'horse' : r < 0.29 ? 'donkey' : null;
};
// Land people have already been to gets no new animals, so a herd wanders in from beyond what is in
// sight: at most one each day, by day, on open grassland near a player, while there are few about
Entities.prototype.tickHerds = function () {
  const w = G.world;
  if (!w || w.dim !== 'overworld' || !(G.daylight > 0.8)) return;
  this.herdCd = (this.herdCd || 20) - 1;
  if (this.herdCd > 0) return;
  this.herdCd = 20;
  const flags = w.flags || (w.flags = {});
  if (flags.herdDay === (G.day || 0)) return;
  if (this.mobs.filter((m) => m.type === 'horse' || m.type === 'donkey').length >= 3) return;
  const ps = [G.player, ...(G.net ? [...G.net.players.values()] : [])].filter((q) => q && !q.dead && q.pos);
  const q = ps[Math.floor(rand() * ps.length)];
  if (!q) return;
  const a = rand() * Math.PI * 2, d = 38 + rand() * 18;
  const x = Math.floor(q.pos.x + Math.cos(a) * d), z = Math.floor(q.pos.z + Math.sin(a) * d);
  const ch = w.getChunk(x >> 4, z >> 4);
  if (!ch || !ch.meshed || !OPEN.includes(ch.biomes[((z & 15) << 4) | (x & 15)])) return;
  const type = rand() < 0.25 ? 'donkey' : 'horse', n = type === 'donkey' ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 2);
  let made = 0;
  for (let i = 0; i < n; i++) {
    const hx = x + Math.floor(rand() * 7) - 3, hz = z + Math.floor(rand() * 7) - 3;
    let y = Math.min(126, ch.maxY + 1);
    while (y > 1 && !w.isSolid(hx, y - 1, hz)) y--;
    const top = w.getBlock(hx, y - 1, hz);
    if ((top !== B.grass && top !== B.podzol) || w.getLight(hx, y, hz)[0] < 15 || boxBlocked(w, hx + 0.5, y, hz + 0.5, 0.6, 1.6)) continue;
    this.spawnMob(type, hx + 0.5, y, hz + 0.5);
    made++;
  }
  if (made) flags.herdDay = G.day || 0;
};
