// Turrets (1.11.1): big guns three blocks across that shoot everything in reach, players and creatures alike,
// except what is switched off on their list (use one to see it). Whoever sets one down is off its list to
// start with. They need no ammunition, and live where the world lives (the host).
// The gun turret (`turret`, 'Gun Turret' since 1.11.8) fires streams of tracer rounds, at the ground and the
// air. The missile turret (`missile_turret`, 1.11.8), olive green with six tubes and a radar dish, fires homing
// missiles (see planes.js), which flares can draw off; they hurt what is near but break no blocks.
import * as THREE from 'three';
import { G } from './game.js';
import { BLOCKS } from './blocks.js';
import { sfx } from './audio.js';
import { raycast } from './physics.js';
import { MOB_TYPES, MODELS, rect } from './entities.js';
import { launchMissile, myName } from './planes.js';

const rand = Math.random;
const players = () => (G.net ? G.net.targets() : G.player ? [G.player] : []);
const RANGE = 48, AIR_RANGE = 90;
const MIS_RANGE = 64, MIS_AIR_RANGE = 120, MIS_WAIT = 1.6;   // (the missile turret's reach, and the wait between missiles)
// Up in the air: nothing solid in the five blocks under it
function airborne(e) {
  const x = Math.floor(e.pos.x), z = Math.floor(e.pos.z), y = Math.floor(e.pos.y);
  for (let i = 1; i <= 5; i++) if (G.world.isSolid(x, y - i, z)) return false;
  return true;
}

const GREY = [112, 116, 112], DARK = [56, 58, 56], STEEL = [150, 154, 150];
MODELS.turret = () => [
  { name: 'base', size: [44, 8, 44], pos: [0, 4, 0], color: DARK, paint: { top: (g, x, y, w, h) => { rect(g, x + 2, y + 2, w - 4, 1, [200, 170, 40]); rect(g, x + 2, y + h - 3, w - 4, 1, [200, 170, 40]); } } },
  { name: 'pedestal', size: [20, 14, 20], pos: [0, 15, 0], color: GREY },
  { name: 'head', size: [1, 1, 1], pos: [0, 28, 0], color: GREY },
  { name: 'housing', parent: 'head', size: [26, 14, 26], pos: [0, 0, 0], color: GREY, paint: { front: (g, x, y, w) => rect(g, x + 4, y + 3, w - 8, 3, [30, 30, 30]) } },
  { name: 'barrel0', parent: 'head', size: [4, 4, 30], pos: [-5, 0, 22], color: STEEL },
  { name: 'barrel1', parent: 'head', size: [4, 4, 30], pos: [5, 0, 22], color: STEEL },
  { name: 'pod0', parent: 'head', size: [7, 10, 16], pos: [-17, 1, 4], color: DARK, paint: { front: (g, x, y) => { rect(g, x + 1, y + 1, 2, 2, [200, 40, 30]); rect(g, x + 4, y + 1, 2, 2, [200, 40, 30]); rect(g, x + 1, y + 6, 2, 2, [200, 40, 30]); rect(g, x + 4, y + 6, 2, 2, [200, 40, 30]); } } },
  { name: 'pod1', parent: 'head', size: [7, 10, 16], pos: [17, 1, 4], color: DARK, paint: { front: (g, x, y) => { rect(g, x + 1, y + 1, 2, 2, [200, 40, 30]); rect(g, x + 4, y + 1, 2, 2, [200, 40, 30]); rect(g, x + 1, y + 6, 2, 2, [200, 40, 30]); rect(g, x + 4, y + 6, 2, 2, [200, 40, 30]); } } },
  { name: 'radar', parent: 'head', size: [10, 6, 1], pos: [0, 11, -8], color: STEEL },
];
// The missile turret: an olive launcher on a turntable, six missile tubes with red tips showing, and a radar
// dish on a mast behind
const OLIVE = [96, 108, 70], OLIVE_D = [62, 72, 46], RED = [200, 40, 30];
MODELS.missile_turret = () => [
  { name: 'base', size: [44, 6, 44], pos: [0, 3, 0], color: OLIVE_D, paint: { top: (g, x, y, w, h) => { for (let i = 2; i < w - 2; i += 6) rect(g, x + i, y + 2, 3, 1, [210, 180, 40]); } } },
  { name: 'turntable', size: [30, 4, 30], pos: [0, 8, 0], color: [70, 72, 70] },
  { name: 'head', size: [1, 1, 1], pos: [0, 22, 0], color: OLIVE },
  { name: 'arm0', parent: 'head', size: [4, 14, 10], pos: [-14, -6, 0], color: OLIVE_D },
  { name: 'arm1', parent: 'head', size: [4, 14, 10], pos: [14, -6, 0], color: OLIVE_D },
  { name: 'pod', parent: 'head', size: [24, 16, 26], pos: [0, 2, 2], color: OLIVE, paint: {
    front: (g, x, y) => { for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { rect(g, x + 2 + c * 7, y + 2 + r * 7, 6, 6, [24, 24, 24]); rect(g, x + 4 + c * 7, y + 4 + r * 7, 2, 2, RED); } },
    top: (g, x, y, w, h) => { rect(g, x + 1, y + 1, w - 2, 1, OLIVE_D); rect(g, x + 1, y + h - 2, w - 2, 1, OLIVE_D); },
  } },
  { name: 'mast', size: [3, 16, 3], pos: [0, 18, -12], color: [70, 72, 70] },
  { name: 'radar', size: [1, 1, 1], pos: [0, 27, -12], color: [70, 72, 70] },
  { name: 'dish', parent: 'radar', size: [14, 8, 2], pos: [0, 0, 0], color: [200, 204, 196], paint: { front: (g, x, y, w, h) => rect(g, x + (w >> 1) - 1, y + (h >> 1) - 1, 2, 2, [60, 60, 60]) } },
  { name: 'feed', parent: 'radar', size: [1, 1, 5], pos: [0, 0, 3], color: [60, 60, 60] },
];

// Its list: what is switched off ('player:Name' or 'mob:type'), and who set it down
const turretGear = (saved) => {
  const g = saved && typeof saved === 'object' ? saved : {};
  return { off: Array.isArray(g.off) ? g.off.filter((k) => typeof k === 'string').slice(0, 200) : [], owner: typeof g.owner === 'string' ? g.owner.slice(0, 40) : '',
    coat: 0, saddle: false, armor: 0, tame: true, spd: 1, temper: 0, lead: null };
};
MOB_TYPES.turret = { name: 'Gun Turret', hp: 150, w: 2.8, h: 3, speed: 0, sound: 'golem', pitch: 0.5, drops: [{ key: 'turret', min: 1, max: 1 }], anim: 'turret',
  turret: true, persistent: true, fireImmune: true, noFall: true, heavy: true, xp: [0, 0], ai: turretAI, gear: turretGear };
MOB_TYPES.missile_turret = { ...MOB_TYPES.turret, name: 'Missile Turret', drops: [{ key: 'missile_turret', min: 1, max: 1 }], missiles: true };
export const TURRETS = ['turret', 'missile_turret'];

// What it may shoot at: a creature by its kind, a player by name (the player inside a vehicle, not the vehicle)
export const turretKey = (e) => (e.isPlayer || e.remote ? 'player:' + (e.isPlayer && !e.remote ? myName() : e.name) : 'mob:' + e.type);
const isPlayer = (e) => !!(e.isPlayer || e.remote);
// Which group a creature is in, for the list's switches for a whole group
const groupOf = (e) => (isPlayer(e) ? 'all:players' : e.def && (e.def.hostile || e.def.bear) ? 'all:monsters' : 'all:animals');
function allowed(t, e) { const off = t.gear.off; return !off.includes(turretKey(e)) && !off.includes(groupOf(e)); }
// (vehicles and other turrets are never aimed at themselves: their riders are)
const shootable = (t, m) => m !== t && !m.dead && !m.removed && !m.def.turret && !m.def.mount && !m.def.villagerProxy;

function turretAI(t, dt) {
  t.age += dt; t.hurtTime -= dt; t.invul -= dt;
  if (t.dead) { t.removed = true; return; }
  t.vel.x = t.vel.z = 0;
  t.retarget = (t.retarget || 0) - dt; t.gunCd = (t.gunCd || 0) - dt; t.misCd = (t.misCd || 0) - dt;
  const mis = !!t.def.missiles, range = mis ? MIS_RANGE : RANGE, airRange = mis ? MIS_AIR_RANGE : AIR_RANGE;
  const eye = { x: t.pos.x, y: t.pos.y + 1.8, z: t.pos.z };
  const seen = (x, y, z) => { const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z, d = Math.hypot(dx, dy, dz); return !raycast(G.world, eye.x, eye.y, eye.z, dx / d, dy / d, dz / d, d - 0.8, (id) => BLOCKS[id].solid); };
  if (t.retarget <= 0) {
    t.retarget = 0.3;
    if (t.age % 10 < 0.3) knownPlayers(null);   // (now and then: who is here, for its list)
    let best = null, bd = Infinity;
    const consider = (e, air) => {
      const d = Math.hypot(e.pos.x - eye.x, e.pos.y - eye.y, e.pos.z - eye.z);
      if (d < (air ? airRange : range) && d < bd && seen(e.pos.x, e.pos.y + 0.9, e.pos.z)) { bd = d; best = e; }
    };
    for (const m of G.entities.mobs) if (shootable(t, m) && allowed(t, m)) consider(m, !!m.def.flies || airborne(m));
    for (const q of players()) if (!q.dead && q.mode !== 'creative' && q.mode !== 'spectator' && allowed(t, q)) consider(q, airborne(q));
    t.target = best;
  }
  const e = t.target;
  if (!e || e.dead || e.removed) { t.target = null; t.animate(dt, 0, 99); return; }
  // aim (a little ahead of what is moving)
  const v = e.vel || { x: 0, y: 0, z: 0 }, lead = Math.hypot(e.pos.x - eye.x, e.pos.z - eye.z) / 110;
  const ax = e.pos.x + (v.x || 0) * lead - eye.x, ay = e.pos.y + 0.9 + (v.y || 0) * lead - eye.y, az = e.pos.z + (v.z || 0) * lead - eye.z;
  const d = Math.hypot(ax, ay, az) || 1;
  t.yaw = Math.atan2(ax, az);
  t.aimPitch = Math.asin(ay / d);
  const air = (e.def && e.def.flies) || airborne(e);
  // a stream of glowing tracer rounds, twenty a second from its two barrels in turn. Each hits for less than it
  // used to (what is hit can't be hurt again for a moment anyway, so it does a little less harm than before)
  if (mis) {
    // a homing missile from one of its six tubes in turn, faster at what flies (to catch a jet)
    if (t.misCd <= 0) {
      t.misCd = MIS_WAIT;
      t.shots = (t.shots || 0) + 1;
      const k = t.shots % 6, col = (k % 3) - 1, row = k < 3 ? 0.5 : 0, cs = Math.cos(t.yaw), sn = Math.sin(t.yaw);
      const target = e.isPlayer && !e.remote ? e : e.remote ? { isRemotePlayer: true, name: e.name } : e;
      launchMissile(eye.x + cs * col * 0.45 + ax / d * 1.8, eye.y + 0.3 + row + ay / d * 1.8, eye.z - sn * col * 0.45 + az / d * 1.8, ax / d, ay / d + (air ? 0.15 : 0.05), az / d, air ? 90 : 40, 'turret', target,
        { shooter: t, allow: (x) => shootable(t, x) && allowed(t, x) });
      t.kick = 0.25;
    }
    t.animate(dt, 0, 99);
    return;
  }
  if (t.gunCd <= 0) {
    t.gunCd = 0.05;
    t.shots = (t.shots || 0) + 1;
    const side = t.shots & 1 ? 1 : -1, cs = Math.cos(t.yaw), sn = Math.sin(t.yaw);
    const ox = cs * side * 0.5, oz = -sn * side * 0.5;   // (the barrel it comes from)
    const sp = 120, s = 0.035;
    const dx = ax / d + (rand() - 0.5) * s, dy = ay / d + (rand() - 0.5) * s, dz = az / d + (rand() - 0.5) * s;
    G.entities.spawnArrow(eye.x + ox + ax / d * 2.2, eye.y + ay / d * 2.2, eye.z + oz + az / d * 2.2, dx * sp, dy * sp, dz * sp, 'turret',
      { bullet: 'bullet', tracer: true, damage: 4, keep: true, shooter: t, allow: (x) => (x.isPlayer || x.remote ? allowed(t, x) : shootable(t, x) && allowed(t, x)) });
    t.flash = 0.04; t.flashSide = side;
    if (t.shots % 2) sfx('gun_light', t.pos, { vol: 0.7 });
  }
  t.animate(dt, 0, 99);
}
// The head follows its aim
// A muzzle flash that lights up the night: a bright core in a wide orange glow at the barrel that fired
const flashCore = new THREE.MeshBasicMaterial({ color: 0xfff4c0, fog: false });
const flashGlow = new THREE.MeshBasicMaterial({ color: 0xff8a1e, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const flashGeo = [new THREE.BoxGeometry(7, 7, 10), new THREE.BoxGeometry(26, 26, 22)];
// (and the ground round it flickers orange while it fires)
let groundGlow = null;
const groundGeo = new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2);
function glowMat() {
  if (groundGlow) return groundGlow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,150,50,0.9)'); grad.addColorStop(0.4, 'rgba(255,110,30,0.4)'); grad.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  groundGlow = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  return groundGlow;
}
MOB_TYPES.turret.animate = (t, dt) => {
  const h = t.model.parts.head;
  if (h) h.rotation.x = -(t.aimPitch || 0);
  if (h && (!t.flashMesh || t.flashMesh.parent !== h)) {   // (and again if its model is made anew)
    const g = new THREE.Group();
    g.add(new THREE.Mesh(flashGeo[0], flashCore), new THREE.Mesh(flashGeo[1], flashGlow));
    g.visible = false;
    h.add(g);
    t.flashMesh = g;
    const glow = new THREE.Mesh(groundGeo, glowMat());
    glow.position.y = 0.05;
    glow.visible = false;
    t.model.root.add(glow);
    t.glowMesh = glow;
  }
  if (t.flashMesh) {
    t.flash = (t.flash || 0) - (dt || 0);
    t.flashMesh.visible = t.flash > 0;
    t.glowMesh.visible = t.flash > -0.15;   // (it stays lit between shots)
    if (t.flash > 0) { t.flashMesh.position.set(t.flashSide * 5, 0, 42); t.flashMesh.rotation.z = rand() * 3; const k = 0.8 + rand() * 0.5; t.flashMesh.scale.setScalar(k); }
  }
  if (t.model.parts.radar) t.model.parts.radar.rotation.y = t.age * 3;
};
// The missile turret's launcher follows its aim and kicks back as a missile goes; its dish turns
MOB_TYPES.missile_turret.animate = (t, dt) => {
  const P = t.model.parts;
  t.kick = Math.max(0, (t.kick || 0) - (dt || 0));
  if (P.head) P.head.rotation.x = -(t.aimPitch || 0);
  if (P.pod) P.pod.position.z = 2 - t.kick * 10;
  if (P.radar) P.radar.rotation.y = t.age * 2;
};

// ---------------------------------------------------------------- its list
// Everything it could shoot at, for the list: the players here (you first) and every kind of creature
// The world remembers the name of everyone who has been in it, for turrets' lists
export function rememberPlayer(name) {
  const flags = G.world.flags || (G.world.flags = {});
  const seen = Array.isArray(flags.players) ? flags.players : (flags.players = []);
  if (typeof name === 'string' && name && !seen.includes(name) && seen.length < 500) seen.push(name.slice(0, 40));
}
// The names of everyone who has been in this world, and everyone here now
export function knownPlayers(t) {
  const w = G.world, flags = w.flags || (w.flags = {});
  const seen = Array.isArray(flags.players) ? flags.players : (flags.players = []);
  const here = [myName(), ...(G.net ? [...G.net.players.values()].filter((a) => !a.hidden).map((a) => a.name) : [])].filter(Boolean);
  for (const n of here) if (!seen.includes(n) && seen.length < 500) seen.push(n);
  const listed = t ? t.gear.off.filter((k) => k.startsWith('player:')).map((k) => k.slice(7)) : [];
  return [...new Set([myName(), ...here, ...seen, ...listed])].filter(Boolean);
}
function choices(t) {
  const players = knownPlayers(t).map((n) => ({ key: 'player:' + n, label: n + (n === myName() ? ' (you)' : '') }));
  const monsters = [], animals = [];
  for (const [type, def] of Object.entries(MOB_TYPES)) {
    if (def.turret || def.mount || def.plane) continue;
    (def.hostile || def.bear ? monsters : animals).push({ key: 'mob:' + type, label: def.name });
  }
  return [
    { title: 'Players', all: { key: 'all:players', label: 'All players' }, items: players },
    { title: 'Monsters', all: { key: 'all:monsters', label: 'All monsters' }, items: monsters },
    { title: 'Animals and villagers', all: { key: 'all:animals', label: 'All animals and villagers' }, items: animals },
  ];
}
let section = null;
// Use a turret: its list, ticked for what it shoots at
export function openTurret(t) {
  if (!section) {
    section = document.createElement('section');
    section.className = 'screen dim';
    section.id = 's-turret';
    section.hidden = true;
    const anchor = document.getElementById('s-container');
    anchor.parentNode.insertBefore(section, anchor);
  }
  section.textContent = '';
  const h2 = document.createElement('h2');
  h2.textContent = t.def.name + ': what it shoots at';
  section.appendChild(h2);
  const note = document.createElement('div');
  note.className = 'hint';
  note.textContent = 'Untick anything it should leave alone. Unticking a whole group leaves all of it alone, whatever is ticked below.';
  section.appendChild(note);
  const list = document.createElement('div');
  list.style.cssText = 'max-height:62vh;overflow:auto;padding:8px 16px;background:rgba(0,0,0,0.35);margin:8px auto;width:min(760px,100%);box-sizing:border-box;font-size:20px;touch-action:pan-y';
  let grid = null;
  const row = (c, strong) => {
    const lab = document.createElement('label');
    lab.style.cssText = 'display:flex;gap:8px;align-items:center;cursor:pointer;min-height:30px' + (strong ? ';font-size:22px;color:#ffe14a' : '');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !t.gear.off.includes(c.key);
    box.addEventListener('change', () => {
      const off = t.gear.off.filter((k) => k !== c.key);
      if (!box.checked) off.push(c.key);
      setOff(t, off);
    });
    box.style.cssText = 'width:20px;height:20px';
    lab.append(box, document.createTextNode(c.label));
    (strong ? list : grid).appendChild(lab);
  };
  // each group: its heading, a switch for the whole group, and one for each in it
  for (const g of choices(t)) {
    const head = document.createElement('div');
    head.textContent = g.title;
    head.style.cssText = 'margin:10px 0 4px;font:400 13px var(--title-font);color:#ddd';
    list.appendChild(head);
    row(g.all, true);
    grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:2px 16px;padding-left:12px';
    list.appendChild(grid);
    for (const c of g.items) row(c);
  }
  section.appendChild(list);
  const btns = document.createElement('div');
  btns.className = 'row';
  const mk = (label, fn) => { const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = label; b.addEventListener('click', fn); btns.appendChild(b); };
  mk('Shoot Everything', () => { setOff(t, []); openTurret(t); });
  mk('Done', () => G.ui.back());
  section.appendChild(btns);
  G.ui.openScreen('turret');
}
// A change to the list: made where the turret lives (a guest asks the host)
function setOff(t, off) {
  t.gear.off = off;
  if (t.proxy && G.net) G.net.send({ k: 'tlist', id: t.netId, off });
  else t.vDirty = true;
}
export function takeTurretList(t, off) {
  if (!t || !t.def.turret || !Array.isArray(off)) return;
  t.gear.off = off.filter((k) => typeof k === 'string').slice(0, 200);
  t.vDirty = true;
}
// Set down: it remembers who did it, and leaves them alone
export function placeTurret(x, y, z, yaw, type = 'turret') {
  const owner = myName();
  if (G.net && G.net.role === 'client') { G.net.send({ k: 'bo', x, y, z, yaw, t: type, o: owner }); return; }
  spawnTurret(x, y, z, yaw, owner, type);
}
export function spawnTurret(x, y, z, yaw, owner, type = 'turret') {
  const t = G.entities.spawnMob(TURRETS.includes(type) ? type : 'turret', x, y, z, { gear: { owner, off: ['player:' + owner] } });
  t.yaw = yaw;
  sfx('anvil', t.pos, { vol: 0.6 });
  return t;
}
