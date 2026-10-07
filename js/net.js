// Multiplayer. One player hosts: their browser runs the world (mobs, water, fire, furnaces, time of day)
// and the others join as guests. Guests send what they do to the host and draw what the host tells them.
// Messages travel through the Blockcraft server (server.js), which only relays them within a room code.
import * as THREE from 'three';
import { G, store } from './game.js';
import { R, itemModel, tintModel } from './render.js';
import { buildModel, holdInHand, lightAt, explosionFx, explosionDamage, spawnBlockParticles } from './entities.js';
import { BLOCKS, B, ITEMS } from './blocks.js';
import { packSlots, unpackSlots } from './inventory.js';
import { cleanEnch } from './enchant.js';
import { rayBox } from './physics.js';
import { sfx, blockSound } from './audio.js';

const r2 = (v) => Math.round(v * 100) / 100;
const MOB_RANGE = 72;          // guests see the host's mobs this far away
const FX_RANGE = 64;           // and arrows, potions and explosions this far
const ITEM_RANGE = 48;         // and dropped items this far
const CONTAINER_BLOCKS = new Set([B.chest, B.furnace, B.furnace_lit]);

export function serverURL() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  if (!/^https?:$/.test(location.protocol)) return null;
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}

function containerSig(c) {
  return JSON.stringify([packSlots(c.slots), Math.round((c.burn || 0) * 10), Math.round(c.burnMax || 0), Math.round((c.cook || 0) * 10)]);
}

// ---------------------------------------------------------------- other players
function nameTag(text) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = '600 30px system-ui, sans-serif';
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + 20;
  c.height = 42;
  g.font = font;
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.fillText(text, 10, 22);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false });
  const s = new THREE.Sprite(mat);
  s.scale.set((c.width / c.height) * 0.28, 0.28, 1);
  s.renderOrder = 20;
  return s;
}

// Another player as seen by this browser. On the host it is also what mobs chase and hurt.
export class Avatar {
  constructor(id, name, slot) {
    this.id = id;
    this.netId = id;
    this.name = name;
    this.slot = slot;
    this.isPlayer = true;
    this.remote = true;
    this.def = { name };
    this.ready = false;
    this.gone = false;
    this.pos = { x: 0, y: -200, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.hw = 0.3;
    this.h = 1.8;
    this.yaw = 0; this.pitch = 0;
    this.held = 0;
    this.dead = false;
    this.mode = 'survival';
    this.sleeping = false;
    this.sneaking = false;
    this.burning = false;
    this.hp = 20;
    this.effects = {};
    this.state = null;
    this.swings = 0;
    this.swingT = 1;
    this.phase = 0;
    this.hurtTime = 0;
    this.deathTime = 0;
    this.model = buildModel('player', slot);
    R.scene.add(this.model.root);
    this.tag = nameTag(name);
    R.scene.add(this.tag);
    this.heldShown = -1;
    this.heldMesh = null;
    this.offId = 0;
    this.offShown = -1;
    this.offMesh = null;
    this.shield = 0;
    this.worn = '';
    this.model.root.visible = this.tag.visible = false;
  }

  // Armour shows on the model: it is rebuilt with whatever is worn now
  wear(worn) {
    this.worn = worn;
    const old = this.model;
    if (this.heldMesh) { this.heldMesh.parent.remove(this.heldMesh); this.heldMesh = null; }
    if (this.offMesh) { this.offMesh.parent.remove(this.offMesh); this.offMesh = null; }
    this.offShown = -1;
    this.model = buildModel('player', worn ? `${this.slot}|${worn}` : this.slot);
    const root = this.model.root;
    root.position.copy(old.root.position);
    root.rotation.copy(old.root.rotation);
    root.visible = old.root.visible;
    R.scene.remove(old.root);
    old.mat.dispose();
    R.scene.add(root);
    this.heldShown = -1;
  }

  get eyeY() { return this.pos.y + 1.62 - (this.sneaking ? 0.12 : 0); }
  lookDir() {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }

  // On the host, whatever happens to this player is sent to their browser
  hurt(dmg, fromX, fromZ, kind, axe = false, by = null) {
    if (this.dead || this.mode !== 'survival') return;
    // (m: which mob did it, so the guest's Thorns can hurt it back)
    G.net.sendTo(this.id, { k: 'hurt', d: dmg, x: fromX, z: fromZ, c: kind, ax: axe ? 1 : undefined, m: by && by.netId != null ? by.netId : undefined });
    this.hurtTime = 0.35;
  }
  addEffect(n, t) { G.net.sendTo(this.id, { k: 'fx', n, t }); }

  // [x, y, z, yaw, pitch, held, flags, swings, hp, creative, [helmet, chestplate, leggings, boots], off hand]
  applyState(s) {
    const first = !this.state;
    this.state = s;
    this.yaw = s[3]; this.pitch = s[4];
    this.held = s[5];
    const f = s[6];
    const dead = !!(f & 1);
    if (dead && !this.dead) this.deathTime = 0;
    this.dead = dead;
    this.sneaking = !!(f & 2);
    this.sleeping = !!(f & 4);
    this.burning = !!(f & 16);
    this.gold = !!(f & 32);
    this.shield = f & 64 ? 1 : f & 128 ? 2 : 0;   // a shield is up: in the main hand, or the off hand
    this.offId = s[11] | 0;
    if (s[7] !== this.swings) { if (!first) this.swingT = 0; this.swings = s[7]; }
    if (s[8] < this.hp) this.hurtTime = 0.35;
    this.hp = s[8];
    this.mode = s[9] ? 'creative' : 'survival';
    const worn = Array.isArray(s[10]) && s[10].some((v) => v) ? s[10].slice(0, 4).map((v) => v | 0).join(',') : '';
    if (worn !== this.worn) this.wear(worn);
    if (first || Math.hypot(s[0] - this.pos.x, s[1] - this.pos.y, s[2] - this.pos.z) > 8) { this.pos.x = s[0]; this.pos.y = s[1]; this.pos.z = s[2]; }
    this.ready = true;
  }

  update(dt) {
    const m = this.model, root = m.root, P = m.parts, s = this.state;
    if (!s) return;
    const ox = this.pos.x, oz = this.pos.z;
    const k = Math.min(1, dt * 14);
    this.pos.x += (s[0] - this.pos.x) * k;
    this.pos.y += (s[1] - this.pos.y) * k;
    this.pos.z += (s[2] - this.pos.z) * k;
    const hs = dt > 0 ? Math.min(8, Math.hypot(this.pos.x - ox, this.pos.z - oz) / dt) : 0;
    this.hurtTime -= dt;
    if (this.dead) this.deathTime += dt;
    const show = !this.dead || this.deathTime < 1.2;
    root.visible = show;
    this.tag.visible = show && !this.sneaking && !this.dead;

    this.phase += hs * dt * 4;
    const sw = Math.sin(this.phase) * Math.min(1, hs / 2) * 0.9;
    root.position.set(this.pos.x, this.pos.y + (this.sleeping ? 0.3 : 0), this.pos.z);
    let d = this.yaw + Math.PI - root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    root.rotation.y += d * Math.min(1, dt * 12);
    root.rotation.x = this.sleeping ? -Math.PI / 2 : 0;
    root.rotation.z = this.dead ? Math.min(1, this.deathTime * 3) * Math.PI / 2 : 0;
    P.leg0.rotation.x = sw; P.leg1.rotation.x = -sw;
    P.arm1.rotation.x = this.shield === 2 ? -0.75 : -sw * 0.8 - (this.offId ? 0.3 : 0);
    // the right arm swings and holds things
    if (this.swingT < 1) {
      this.swingT = Math.min(1, this.swingT + dt / 0.3);
      P.arm0.rotation.x = -Math.sin(this.swingT * Math.PI) * 1.7 - 0.3;
    } else P.arm0.rotation.x = this.shield === 1 ? -0.75 : sw * 0.8 - (this.held ? 0.3 : 0);
    P.body.rotation.x = this.sneaking ? 0.45 : 0;
    m.inner.position.y = this.sneaking ? -0.15 : 0;
    P.head.rotation.x = Math.max(-1.4, Math.min(1.4, -this.pitch));
    if (this.held !== this.heldShown) this.showHeld();
    if (this.offId !== this.offShown) {
      this.offShown = this.offId;
      if (this.offMesh) { this.offMesh.parent.remove(this.offMesh); this.offMesh = null; }
      if (this.offId) { try { this.offMesh = holdInHand(this.model, this.offId, 10, true); } catch { /* not something that can be drawn */ } }
    }
    if (this.burning && Math.random() < dt * 12) {
      G.entities.particles.spawn(this.pos.x + (Math.random() - 0.5) * 0.6, this.pos.y + Math.random() * 1.8, this.pos.z + (Math.random() - 0.5) * 0.6, 0, 1, 0, 1, 0.6, 0.1, 0.1, 0.4, -0.05);
    }
    tintModel(root, lightAt(this.pos.x, this.pos.y + 1.2, this.pos.z), this.hurtTime > 0 ? 0.6 : 0);
    this.tag.position.set(this.pos.x, this.pos.y + (this.sleeping ? 0.9 : 2.15), this.pos.z);
  }

  showHeld() {
    this.heldShown = this.held;
    if (this.heldMesh) { this.heldMesh.parent.remove(this.heldMesh); this.heldMesh = null; }
    if (!this.held) return;
    try { this.heldMesh = holdInHand(this.model, this.held); } catch { /* not something that can be drawn */ }
  }

  dispose() {
    this.gone = true;
    R.scene.remove(this.model.root);
    R.scene.remove(this.tag);
    this.model.mat.dispose();
    this.tag.material.map.dispose();
    this.tag.material.dispose();
  }
}

// ---------------------------------------------------------------- session
export class Net {
  constructor(role, name) {
    this.role = role;
    this.name = name;
    this.id = role === 'host' ? 0 : -1;
    this.code = null;
    this.ws = null;
    this.players = new Map();     // id -> Avatar (everyone but this browser's player)
    this.out = [];                // block changes waiting to be sent
    this.stateT = 0; this.mobT = 0; this.timeT = 0; this.contT = 0; this.saveT = 0;
    this.lastSwing = 0; this.swings = 0;
    this.mobSeq = 0;
    this.mobIndex = new Map();
    this.proxies = new Map();     // guest: host mob id -> Mob copy
    this.watch = new Map();       // host: container key -> Set of guest ids looking at it
    this.openKey = null;          // guest: container this player has open
    this.tradeSig = '';
    this.itemSeq = 0;
    this.itemIndex = new Map();   // host: item id -> item
    this.itemProxies = new Map(); // guest: host item id -> item copy
    this.drops = [];              // guest: items waiting to be dropped by the host
    this.applying = false;
    this.breaking = false;
    this.closed = false;
    this.hostName = role === 'host' ? name : '';
    this.pendingHello = [];       // host: players who arrived while the world was still loading
    this.peerInfo = new Map();    // host: who each connection really is (from the server, not from them)
  }

  // ------------------------------------------------------------ connecting
  // Enter an online world. If nobody is in it, this player runs it (resolves { net, host }),
  // otherwise they join whoever does (resolves { net, snap }).
  // `mine` is this browser's copy of the player's own record, used only if the server lost theirs.
  // A failure worth trying again (server restarting or unreachable) rejects with err.retry set.
  static connect(worldId, account, haves, onStatus = () => {}, dim = null, mine = null) {
    const url = serverURL();
    if (!url) return Promise.reject(new Error('Multiplayer only works on the Blockcraft website.'));
    if (!account) return Promise.reject(new Error('Sign in to play online.'));
    const name = account.name;
    const net = new Net('pending', name);
    net.code = worldId;
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (msg, retry = false) => { if (!settled) { settled = true; reject(Object.assign(new Error(msg), { retry })); } net.shutdown(); };
      let ws;
      try { ws = new WebSocket(url); } catch { fail('Could not reach the multiplayer server.', true); return; }
      net.ws = ws;
      let timer = setTimeout(() => fail('The multiplayer server did not answer. Check your connection and try again.', true), 25000);
      ws.onopen = () => {
        onStatus('Joining…');
        ws.send(JSON.stringify({ t: 'world', id: worldId, dim, token: account.token, haves, mine }));
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        clearTimeout(timer);
        if (!settled) fail('Could not reach the multiplayer server. It only runs on the Blockcraft website.', true);
        else net.lost();
      };
      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'error') { clearTimeout(timer); fail(m.msg, !!m.retry); return; }
        if (m.t === 'hostworld') {
          clearTimeout(timer);
          net.role = 'host'; net.id = 0; net.hostName = name;
          settled = true;
          resolve({ net, host: m, dim: m.dim, me: m.me || null, build: m.build });
          return;
        }
        if (m.t === 'joined') {
          net.role = 'client'; net.id = m.id;
          onStatus('Downloading the world…');
          // the world comes from the player who is running it: a big one over a slow connection takes a while
          clearTimeout(timer);
          timer = setTimeout(() => fail('The player running this world did not send it in time. Ask them to keep Blockcraft open on their screen, then try again.', true), 90000);
          net.send({ k: 'hello', name });
          net.onWorld = (snap) => { clearTimeout(timer); settled = true; resolve({ net, snap, dim: m.dim, me: m.me || null, build: m.build }); };
          net.onKick = (msg) => { clearTimeout(timer); fail(msg); };
          return;
        }
        net.onRaw(m);
      };
    });
  }

  // The host sends the whole world to the server so it is kept even when everyone leaves
  uploadSave(data, v) { this.raw({ t: 'save', data, v }); }
  // Every player keeps their own record (inventory, position, dimension) on the server, and a copy here
  // in case the server ever loses it
  sendMe(data) {
    this.raw({ t: 'me', data });
    if (this.code && G.account) store('online.' + this.code + '@me', { name: G.account.name, data });
  }

  raw(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  // Guests talk to the host; the host talks to everyone
  send(d) { this.raw({ t: 'to', to: this.role === 'client' ? 0 : '*', d }); }
  sendTo(id, d) { this.raw({ t: 'to', to: id, d }); }
  sendExcept(id, d) {
    const ids = [...this.players.keys()].filter((x) => x !== id);
    if (ids.length) this.raw({ t: 'to', to: ids, d });
  }
  sendNear(x, z, range, d, except = null) {
    const ids = [];
    for (const a of this.players.values()) if (a.id !== except && a.ready && Math.hypot(a.pos.x - x, a.pos.z - z) < range) ids.push(a.id);
    if (ids.length) this.raw({ t: 'to', to: ids, d });
  }

  shutdown() {
    this.closed = true;
    if (this.ws) { this.ws.onclose = null; try { this.ws.close(); } catch { /* already closed */ } }
    for (const a of this.players.values()) a.dispose();
    this.players.clear();
  }

  // Leaving on purpose (quit to title)
  close() {
    if (this.role === 'client') this.saveGuest();
    this.shutdown();
    if (G.net === this) G.net = null;
  }

  // The connection dropped by itself (or the server is restarting for an update): get back in. Whoever ran
  // the world goes first so they keep running it with their newest copy; everyone else follows.
  lost() {
    if (this.closed) return;
    this.shutdown();
    if (G.net === this) G.net = null;
    const wait = this.role === 'host' ? 700 : 2500 + Math.min(this.id, 8) * 400;
    G.game.rejoin(this.code, wait, this.restarting ? 'Blockcraft is updating' : 'Lost connection', 'Your world is saved. Reconnecting…');
  }

  onRaw(m) {
    if (m.t === 'msg') { this.onMsg(m.from, m.d); return; }
    if (m.t === 'peer') { this.peerInfo.set(m.id, { name: m.name, account: m.account }); return; }   // they say hello once their page is ready
    if (m.t === 'replaced') {
      // save everything first (the world if we run it, our inventory if not), then step aside
      if (this.role === 'host') G.game.saveNow();
      else this.saveGuest();
      this.shutdown();
      if (G.net === this) G.net = null;
      G.game.leaveOnline('You joined this world from another tab or device, so you left it here.');
      return;
    }
    if (m.t === 'restart') {
      // the server is about to restart (an update): send everything now
      this.restarting = true;
      if (this.role === 'host') G.game.saveNow();
      else this.saveGuest();
      return;
    }
    if (m.t === 'cmd') { G.ui.toast(String(m.msg || ''), 7); return; }   // (shown to you alone, not in the chat)
    if (m.t === 'admin') { this.adminDid(m); return; }
    if (m.t === 'left') { this.removePlayer(m.id); return; }
    if (m.t === 'rehost') {
      // whoever was running the world left: reconnect, and the first one back takes over
      this.saveGuest();
      this.shutdown();
      if (G.net === this) G.net = null;
      G.game.rejoin(this.code, m.wait || 0, `${this.hostName || 'The host'} left. Taking over the world…`);
    }
  }

  // An admin killed, kicked or banned this player
  adminDid(m) {
    const by = String(m.by || 'An admin').slice(0, 16);
    if (m.a === 'mode') { G.game.setMode(m.mode); return; }
    if (m.a === 'goto') {
      const p = G.player;
      if (p && Number.isFinite(m.x + m.y + m.z)) { p.pos.x = m.x + 0.5; p.pos.y = m.y + 0.2; p.pos.z = m.z + 0.5; p.vel.x = p.vel.y = p.vel.z = 0; p.fallDist = 0; p.safeLanding = G.clock + 15; }
      return;
    }
    if (m.a === 'kill') {
      const p = G.player;
      if (p && !p.dead) { p.lastAttacker = by; p.die('admin'); }
      return;
    }
    // whoever ran the world saves it for everyone else first
    if (this.role === 'host') G.game.saveNow(); else this.saveGuest();
    this.shutdown();
    if (G.net === this) G.net = null;
    if (m.a === 'ban') G.game.signOut();
    G.game.leaveOnline(m.a === 'ban' ? `You were banned from multiplayer by ${by}${m.reason ? ': ' + String(m.reason).slice(0, 80) : '.'}` : `You were kicked from the world by ${by}.`);
  }

  // ------------------------------------------------------------ players
  // Who mobs can see: on the host that is everyone, on a guest only this player
  targets() {
    const out = [G.player];
    if (this.role === 'host') for (const a of this.players.values()) if (a.ready && !a.gone) out.push(a);
    return out;
  }

  addPlayer(id, name, slot) {
    let a = this.players.get(id);
    if (a && a.name === name) return a;
    if (a) a.dispose();
    a = new Avatar(id, name, slot);
    this.players.set(id, a);
    return a;
  }

  removePlayer(id) {
    const a = this.players.get(id);
    if (!a) return;
    a.dispose();
    this.players.delete(id);
    for (const s of this.watch.values()) s.delete(id);
    if (this.role === 'host') {
      this.chat(null, `${a.name} left the game`);
      this.send({ k: 'chat', t: `${a.name} left the game`, sys: 1 });
      this.sendRoster();
    }
  }

  sendRoster() {
    const l = [[0, this.name, 0]];
    for (const a of this.players.values()) l.push([a.id, a.name, a.slot]);
    this.send({ k: 'roster', l });
  }

  allAsleep() {
    if (this.role !== 'host') return false;
    for (const a of this.players.values()) if (a.ready && !a.sleeping && !a.dead) return false;
    return true;
  }

  localState() {
    const p = G.player;
    const held = p.inv.held;
    const gold = p.armor.some((a) => a && ITEMS[a.id] && ITEMS[a.id].material === 'golden');
    const flags = (p.dead ? 1 : 0) | (p.sneaking && !p.flying ? 2 : 0) | (G.sleeping ? 4 : 0) | (p.flying ? 8 : 0) | (p.burning > 0 ? 16 : 0) | (gold ? 32 : 0)
      | (p.shieldUp ? (p.shieldHand === 1 ? 64 : 128) : 0);
    return [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), r2(p.pitch), held ? held.id : 0, flags, this.swings, Math.ceil(p.health), p.creative ? 1 : 0,
      p.armor.map((a) => (a ? a.id : 0)), p.off[0] ? p.off[0].id : 0];
  }

  chat(from, text) { G.ui.chatLine(from ? `<${from}> ${text}` : text, !from); }

  say(text) {
    text = String(text).trim().slice(0, 120);
    if (!text) return;
    // commands (/list, and for admins /kill, /ban...) go to the server, not to everyone
    if (text[0] === '/') { this.raw({ t: 'cmd', text }); return; }
    this.chat(this.name, text);
    if (this.role === 'host') this.send({ k: 'chat', n: this.name, t: text });
    else this.send({ k: 'chat', t: text });
  }

  announce(text) {
    this.chat(null, text);
    this.send({ k: 'chat', t: text, sys: 1 });
  }

  saveGuest() {
    if (!G.player || !G.world) return;
    this.sendMe(G.game.playerData(G.player));
  }

  // ------------------------------------------------------------ hooks called by the game
  // What someone wrote on a sign goes to everyone (through the host)
  signChanged(x, y, z, lines) { this.send({ k: 'sign', x, y, z, l: lines }); }

  blockChanged(x, y, z, id) {
    if (this.applying) return;
    this.out.push([x, y, z, id, G.world.getMeta(x, y, z), this.breaking ? 1 : 0]);
  }

  explosion(x, y, z, power) {
    const d = { k: 'boom', x: r2(x), y: r2(y), z: r2(z), pw: power };
    if (this.role === 'client') this.send(d);
    else this.sendNear(x, z, FX_RANGE, d);
  }

  projectile(kind, a) {
    if (this.role !== 'host') return;
    this.sendNear(a[0], a[2], FX_RANGE, { k: kind, a: a.map((v) => (typeof v === 'number' ? r2(v) : v)) });
  }

  // Guest: the host drops the item, so everyone sees the same one
  requestDrop(id, count, x, y, z, vx, vy, vz, dmg, e) {
    const stub = { pickupDelay: 0.6, e: e || 0, a: [id, count, dmg, r2(x), r2(y), r2(z), r2(vx), r2(vy), r2(vz)] };
    this.drops.push(stub);
    return stub;
  }

  // ------------------------------------------------------------ fighting other players
  pickPlayer(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = null, bt = maxDist;
    for (const a of this.players.values()) {
      if (!a.ready || a.dead) continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, a.pos.x - a.hw, a.pos.y, a.pos.z - a.hw, a.pos.x + a.hw, a.pos.y + a.h, a.pos.z + a.hw);
      if (t >= 0 && t < bt) { bt = t; best = a; }
    }
    return best ? { player: best, t: bt } : null;
  }

  pvp(a, dmg, x, z, fire = 0) {
    a.hurtTime = 0.35;
    const d = { d: Math.round(dmg * 100) / 100, x: r2(x), z: r2(z), ...(fire ? { f: fire } : {}) };
    if (this.role === 'host') this.sendTo(a.id, { k: 'hurt', ...d, c: 'player', by: this.name });
    else this.send({ k: 'pvp', to: a.id, ...d });
  }

  // Hurt by another player: knocked back even in Creative, damaged in Survival
  hurtByPlayer(d, by) {
    const p = G.player;
    if (!p || p.dead) return;
    if (p.creative) {
      const dx = p.pos.x - d.x, dz = p.pos.z - d.z, n = Math.hypot(dx, dz) || 1;
      p.vel.x += (dx / n) * 6; p.vel.z += (dz / n) * 6; p.vel.y = Math.max(p.vel.y, 5.5);
      return;
    }
    p.lastAttacker = by;
    p.hurt(+d.d || 0, d.x, d.z, 'player');
    if (d.f > 0) p.addEffect('burn', Math.min(8, +d.f));   // Fire Aspect
  }

  // A guest opening a chest or furnace gets the host's copy
  openContainer(x, y, z, type) {
    const w = G.world;
    const key = `${x},${y},${z}`;
    let c = w.containers.get(key);
    if (!c) {
      c = type === 'chest' ? { type, slots: new Array(27).fill(null) } : { type, slots: [null, null, null], burn: 0, burnMax: 0, cook: 0 };
      c.x = x; c.y = y; c.z = z;
      w.containers.set(key, c);
    }
    c.pending = true;
    c.sig = containerSig(c);
    this.openKey = key;
    this.send({ k: 'co', x, y, z, t: type });
    return c;
  }

  // ------------------------------------------------------------ incoming
  applyBlocks(l, from) {
    const w = G.world;
    if (!w) return;
    const p = G.player;
    this.applying = true;
    try {
      for (const [x, y, z, id, meta, brk] of l) {
        const key = `${x},${y},${z}`;
        const old = w.getBlock(x, y, z);
        w.setBlockAnywhere(x, y, z, id, meta);
        if (brk && old && p && Math.abs(x - p.pos.x) < 40 && Math.abs(z - p.pos.z) < 40) {
          spawnBlockParticles(x, y, z, old);
          blockSound(BLOCKS[old].sound, 'break', { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
        }
        if (id === B.fire) w.fires.set(key, { t: 0, age: 0 });
        if (this.role !== 'host') continue;
        // what Game.placeBlock and Game.ignite would have set up
        G.game.trackBlock(x, y, z, id);
        const c = w.containers.get(key);
        if (c && !CONTAINER_BLOCKS.has(id)) {
          // a guest broke a chest or furnace: its contents spill out
          for (const s of c.slots) if (s) G.entities.dropStack(s, x + 0.5, y + 0.5, z + 0.5);
          w.containers.delete(key);
          if (G.ui.container && G.ui.container.data === c) G.ui.back();
        }
      }
    } finally { this.applying = false; }
  }

  onMsg(from, d) {
    if (!d || typeof d !== 'object') return;
    if (this.role === 'host') this.onHostMsg(from, d);
    else this.onGuestMsg(d);
  }

  onHostMsg(from, d) {
    const a = this.players.get(from);
    const w = G.world;
    switch (d.k) {
      case 'hello': {
        // still loading the world ourselves: answer once it is ready
        if (!w || G.state === 'title' || !G.player) { this.pendingHello.push([from, d]); return; }
        const used = new Set([...this.players.values()].map((x) => x.slot));
        let slot = 1;
        while (used.has(slot)) slot++;
        // the server told us who this is when they connected; their items are saved under that account
        const info = this.peerInfo.get(from);
        if (!info) return;
        const name = info.name;
        const a = this.addPlayer(from, name, slot);
        a.account = info.account;
        this.sendTo(from, G.game.worldSnapshot(info.account, name));
        this.sendRoster();
        this.announce(`${name} joined the game`);
        break;
      }
      case 'p': if (a) a.applyState(d.s); break;
      case 'bs':
        if (!Array.isArray(d.l)) return;
        this.applyBlocks(d.l, from);
        this.sendExcept(from, { k: 'bs', l: d.l });
        break;
      case 'pvp': {
        if (!a) return;
        if (d.to === 0) this.hurtByPlayer(d, a.name);
        else if (this.players.has(d.to)) this.sendTo(d.to, { k: 'hurt', d: d.d, x: d.x, z: d.z, c: 'player', by: a.name, f: d.f });
        break;
      }
      case 'drop':
        for (const s of Array.isArray(d.l) ? d.l : []) {
          const [id, count, dmg, x, y, z, vx, vy, vz, pd, e] = s;
          if (!ITEMS[id] || !(count > 0) || count > 64 * 40) continue;
          const it = G.entities.dropItem(id, count | 0, x, y, z, vx, vy, vz, dmg, cleanEnch(e));
          if (it) it.pickupDelay = Math.min(3, +pd || 0.6);
        }
        break;
      case 'pick': {
        const it = this.itemIndex.get(d.n);
        if (!a || !it || it.removed || it.age < it.pickupDelay - 0.3) return;
        if (Math.hypot(a.pos.x - it.pos.x, a.pos.z - it.pos.z) > 5) return;
        const give = Math.min(it.count, Math.max(0, d.r | 0));
        if (!give) return;
        it.count -= give;
        if (!it.count) it.removed = true;
        this.sendTo(from, { k: 'got', i: it.id, c: give, d: it.dmg || 0, e: it.e || undefined });
        break;
      }
      case 'hit': {
        const m = this.mobIndex.get(d.id);
        if (!m || m.dead || m.removed) return;
        if (m.invul < 0.15) m.invul = 0;   // the guest already waited out the cooldown; allow for network jitter
        const f = d.f && typeof d.f === 'object' ? d.f : null;
        m.hurt(+d.d || 0, d.x, d.z, d.p ? 'remote' : false, d.kb ?? 1, a || null, f ? { fire: Math.min(8, +f.fire || 0), loot: Math.min(3, f.loot | 0), arrow: +f.arrow || 0, bolt: f.bolt ? 1 : 0, shot: f.shot | 0, fb: f.fb ? 1 : 0 } : null);
        break;
      }
      case 'stare': {
        const m = this.mobIndex.get(d.id);
        if (!m || m.dead || m.angry) return;
        m.angry = true; m.angryTime = 0; m.retarget = 0; m.attacker = a;
        sfx('shade', m.pos, { vol: 1.2 });
        break;
      }
      case 'co': {
        const c = G.game.container(d.x | 0, d.y | 0, d.z | 0, d.t === 'furnace' ? 'furnace' : 'chest');
        const key = `${d.x | 0},${d.y | 0},${d.z | 0}`;
        for (const s of this.watch.values()) s.delete(from);
        if (!this.watch.has(key)) this.watch.set(key, new Set());
        this.watch.get(key).add(from);
        c.netSig = containerSig(c);
        this.sendTo(from, { k: 'c', key, ...this.containerMsg(c) });
        break;
      }
      case 'cc': for (const s of this.watch.values()) s.delete(from); break;
      // a guest took what a furnace had smelted, and the experience it kept
      case 'fx0': { const c = w && w.containers.get(String(d.key)); if (c) c.xp = 0; break; }
      case 'c': {
        const c = w && w.containers.get(d.key);
        if (!c || !Array.isArray(d.s)) return;
        unpackSlots(d.s, c.slots.length).forEach((s, i) => { c.slots[i] = s; });
        c.netSig = containerSig(c);
        const watchers = [...(this.watch.get(d.key) || [])].filter((id) => id !== from);
        if (watchers.length) this.raw({ t: 'to', to: watchers, d: { k: 'c', key: d.key, ...this.containerMsg(c) } });
        if (G.ui.container && G.ui.container.data === c) G.ui.refreshContainer();
        break;
      }
      // a guest traded with one of the villagers: it wears the offer out and the villager learns from it
      case 'tu': {
        const m = this.mobIndex.get(d.id);
        if (m && m.trades && !m.dead) m.traded(d.i | 0, Math.max(1, Math.min(64, d.n | 0)));
        break;
      }
      // a guest wants the bed a villager is sleeping in
      case 'vw': G.entities.wakeVillagerAt(d.x | 0, d.y | 0, d.z | 0); break;
      case 'sign':
        G.game.setSign(d.x | 0, d.y | 0, d.z | 0, d.l, true);
        this.sendExcept(from, { k: 'sign', x: d.x | 0, y: d.y | 0, z: d.z | 0, l: G.game.signText(d.x | 0, d.y | 0, d.z | 0) });
        break;
      case 'chat': {
        if (!a) return;
        const t = String(d.t || '').slice(0, 120);
        if (d.sys) { this.chat(null, t); this.sendExcept(from, { k: 'chat', t, sys: 1 }); }
        else { this.chat(a.name, t); this.sendExcept(from, { k: 'chat', n: a.name, t }); }
        break;
      }
      case 'boom':
        explosionFx(d.x, d.y, d.z, d.pw);
        explosionDamage(d.x, d.y, d.z, d.pw, a, false);
        this.sendNear(d.x, d.z, FX_RANGE, d, from);
        break;
      case 'save': if (a && a.account && d.d && w) { w.guests[a.account] = d.d; } break;
      default: break;
    }
  }

  onGuestMsg(d) {
    const w = G.world, p = G.player;
    switch (d.k) {
      case 'world': this.hostName = d.host || 'the host'; if (this.onWorld) { const f = this.onWorld; this.onWorld = null; f(d); } break;
      case 'kick': if (this.onKick) this.onKick(d.msg); break;
      case 'roster': {
        const keep = new Set();
        for (const [id, name, slot] of d.l) {
          if (id === this.id) continue;
          keep.add(id);
          this.addPlayer(id, name, slot);
        }
        for (const id of [...this.players.keys()]) if (!keep.has(id)) { this.players.get(id).dispose(); this.players.delete(id); }
        break;
      }
      case 'ps': for (const s of d.l) { const a = this.players.get(s[0]); if (a) a.applyState(s.slice(1)); } break;
      case 'bs': if (w) this.applyBlocks(d.l, 0); break;
      case 'm': {
        if (!w) return;
        for (const a of d.l) {
          const m = this.proxies.get(a[0]);
          if (m && !m.removed) { m.applyNet(a); if (a[9] && m.def.villager) m.applyVillager(a[9]); }   // (a villager sent again has changed: a new level, a new job)
          else if (a[9]) this.proxies.set(a[0], G.entities.spawnProxy(a));
        }
        for (const id of d.g) {
          const m = this.proxies.get(id);
          if (m && !m.dead) m.removed = true;
          this.proxies.delete(id);
        }
        for (const a of d.it || []) {
          const it = this.itemProxies.get(a[0]);
          if (it && !it.removed) { it.net = { x: a[1], y: a[2], z: a[3] }; it.count = a[4]; }
          else if (a.length > 5) this.itemProxies.set(a[0], G.entities.spawnItemProxy(a));
        }
        for (const id of d.ig || []) {
          const it = this.itemProxies.get(id);
          if (it) it.removed = true;
          this.itemProxies.delete(id);
        }
        break;
      }
      case 'hurt':
        if (!p || p.dead) return;
        if (d.c === 'player') this.hurtByPlayer(d, d.by);
        else p.hurt(+d.d || 0, d.x ?? null, d.z ?? null, d.c, !!d.ax, d.m != null ? this.proxies.get(d.m) || null : null);
        break;
      // a mob this player killed: its experience, and the kill counts for their achievements
      case 'xp': if (p) G.entities.gotKill({ t: String(d.t || ''), x: +d.x || 0, y: +d.y || 0, z: +d.z || 0, n: Math.min(2000, d.n | 0), a: +d.a || 0, b: d.b ? 1 : 0, s: d.s | 0, f: d.f ? 1 : 0 }); break;
      case 'fx': if (p && !p.dead) p.addEffect(d.n, +d.t || 0); break;
      case 'got': {
        if (!p) return;
        const e = cleanEnch(d.e);
        const left = p.inv.add(d.i, d.c, d.d, e);
        sfx('pop', null, { vol: 0.5 });
        G.ui.invChanged();
        if (left) G.entities.dropItem(d.i, left, p.pos.x, p.pos.y + 1, p.pos.z, undefined, undefined, undefined, d.d, e);
        break;
      }
      case 't':
        G.time = d.t; G.day = d.d; G.nightsNoSleep = d.n;
        break;
      case 'wake':
        if (G.sleeping) { G.game.wakeUp(); G.ui.toast('Good morning'); }
        break;
      case 'c': {
        const c = w && w.containers.get(d.key);
        if (!c) return;
        unpackSlots(d.s, c.slots.length).forEach((s, i) => { c.slots[i] = s; });
        c.burn = d.b || 0; c.burnMax = d.bm || 0; c.cook = d.ck || 0; c.xp = +d.xp || 0;
        c.pending = false;
        c.sig = containerSig(c);
        if (G.ui.container && G.ui.container.data === c) G.ui.refreshContainer();
        break;
      }
      case 'cx': {
        const c = w && w.containers.get(d.key);
        if (c && G.ui.container && G.ui.container.data === c) G.ui.back();
        if (w) w.containers.delete(d.key);
        break;
      }
      case 'chat': this.chat(d.sys ? null : d.n, String(d.t || '')); break;
      case 'sign': G.game.setSign(d.x | 0, d.y | 0, d.z | 0, d.l, true); break;
      case 'boom': explosionFx(d.x, d.y, d.z, d.pw); break;
      case 'ar': { const a = d.a; G.entities.spawnArrow(a[0], a[1], a[2], a[3], a[4], a[5], 'fx', { effect: a[6] ? 'slow' : null }); break; }
      case 'th': { const a = d.a; G.entities.spawnPotion(a[0], a[1], a[2], a[3], a[4], a[5], a[6], true); break; }
      case 'fb': case 'ac': case 'cb': case 'sk': G.entities.projectileFx(d.k, d.a); break;
      default: break;
    }
  }

  containerMsg(c) {
    return { s: packSlots(c.slots), b: Math.round((c.burn || 0) * 10) / 10, bm: c.burnMax || 0, ck: Math.round((c.cook || 0) * 10) / 10, xp: Math.round((c.xp || 0) * 100) / 100 };
  }

  // ------------------------------------------------------------ every frame
  update(dt) {
    if (this.closed || !G.world || !G.player) return;
    // the server is told where this player is every few seconds (for admins, and for where they were last seen)
    this.atT = (this.atT || 0) - dt;
    if (this.atT <= 0) { this.atT = 3; const q = G.player.pos; this.raw({ t: 'at', x: q.x, y: q.y, z: q.z }); }
    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = 5; this.saveGuest(); }
    for (const a of this.players.values()) a.update(dt);
    // count this player's arm swings so others see them
    if (R.swing > this.lastSwing + 0.2) this.swings = (this.swings + 1) % 1000;
    this.lastSwing = R.swing;

    this.stateT -= dt;
    if (this.stateT <= 0) {
      this.stateT = 1 / 15;
      const me = this.localState();
      if (this.role === 'client') this.send({ k: 'p', s: me });
      else if (this.players.size) {
        const l = [[0, ...me]];
        for (const a of this.players.values()) if (a.state) l.push([a.id, ...a.state]);
        this.send({ k: 'ps', l });
      }
    }
    if (this.out.length) {
      this.send({ k: 'bs', l: this.out });
      this.out = [];
    }
    if (this.drops.length) {
      this.send({ k: 'drop', l: this.drops.map((s) => [...s.a, s.pickupDelay, s.e]) });
      this.drops = [];
    }
    if (this.role === 'host') this.hostTick(dt);
    else this.guestTick(dt);
  }

  hostTick(dt) {
    if (this.pendingHello.length && G.player) {
      const list = this.pendingHello;
      this.pendingHello = [];
      for (const [from, d] of list) this.onHostMsg(from, d);
    }
    this.mobT -= dt;
    if (this.mobT <= 0) { this.mobT = 0.1; this.syncMobs(); }
    this.timeT -= dt;
    if (this.timeT <= 0 && this.players.size) {
      this.timeT = 1;
      this.send({ k: 't', t: G.time, d: G.day || 0, n: G.nightsNoSleep || 0 });
    }
    this.contT -= dt;
    if (this.contT <= 0) {
      this.contT = 0.2;
      const w = G.world;
      for (const [key, ids] of this.watch) {
        if (!ids.size) { this.watch.delete(key); continue; }
        const c = w.containers.get(key);
        if (!c) { this.raw({ t: 'to', to: [...ids], d: { k: 'cx', key } }); this.watch.delete(key); continue; }
        const sig = containerSig(c);
        if (sig !== c.netSig) { c.netSig = sig; this.raw({ t: 'to', to: [...ids], d: { k: 'c', key, ...this.containerMsg(c) } }); }
      }
    }
  }

  syncMobs() {
    const mobs = G.entities.mobs, items = G.entities.items;
    this.mobIndex.clear();
    for (const m of mobs) {
      if (!m.netId) m.netId = ++this.mobSeq;
      this.mobIndex.set(m.netId, m);
    }
    this.itemIndex.clear();
    for (const it of items) {
      if (!it.netId) it.netId = ++this.itemSeq;
      this.itemIndex.set(it.netId, it);
    }
    for (const a of this.players.values()) {
      if (!a.ready) continue;
      const known = a.known || (a.known = new Set());
      const l = [], seen = new Set();
      for (const m of mobs) {
        if (m.removed) continue;
        const d = Math.hypot(m.pos.x - a.pos.x, m.pos.z - a.pos.z);
        if (d > (known.has(m.netId) ? MOB_RANGE + 8 : MOB_RANGE)) continue;
        seen.add(m.netId);
        const st = m.netState();
        if (!known.has(m.netId) || m.vDirty) { st.push(m.netSpawn()); known.add(m.netId); }
        l.push(st);
      }
      const g = [];
      for (const id of known) if (!seen.has(id)) { g.push(id); known.delete(id); }
      // items: sent when they first come in range, then only when they move or change
      const ki = a.knownItems || (a.knownItems = new Map());
      const it = [], ig = [], iseen = new Set();
      for (const e of items) {
        if (e.removed) continue;
        const d = Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z);
        if (d > (ki.has(e.netId) ? ITEM_RANGE + 8 : ITEM_RANGE)) continue;
        iseen.add(e.netId);
        const x = r2(e.pos.x), y = r2(e.pos.y), z = r2(e.pos.z);
        const sig = `${x},${y},${z},${e.count}`;
        if (!ki.has(e.netId)) it.push([e.netId, x, y, z, e.count, e.id, e.dmg || 0, Math.max(0, r2(e.pickupDelay - e.age)), ...(e.e ? [e.e] : [])]);
        else if (ki.get(e.netId) !== sig) it.push([e.netId, x, y, z, e.count]);
        ki.set(e.netId, sig);
      }
      for (const id of ki.keys()) if (!iseen.has(id)) { ig.push(id); ki.delete(id); }
      if (l.length || g.length || it.length || ig.length) this.sendTo(a.id, { k: 'm', l, g, it, ig });
    }
    for (const m of mobs) m.vDirty = false;
  }

  guestTick(dt) {
    this.contT -= dt;
    if (this.contT <= 0) {
      this.contT = 0.15;
      const ui = G.ui.container;
      const c = ui && (ui.kind === 'chest' || ui.kind === 'furnace') ? ui.data : null;
      const key = c ? `${c.x},${c.y},${c.z}` : null;
      if (key !== this.openKey) {
        if (this.openKey) this.send({ k: 'cc' });
        this.openKey = key;
      }
      if (c && !c.pending) {
        const sig = containerSig(c);
        if (sig !== c.sig) { c.sig = sig; this.send({ k: 'c', key, s: packSlots(c.slots) }); }
      }
    }
  }
}
