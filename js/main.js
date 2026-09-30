// Boot, main loop, chunk streaming, block updates, saving.
import { G, loadSettings, store, load, remove, isTouchDevice } from './game.js';
import { buildTextures, buildIcons } from './textures.js';
import { BLOCKS, B, SMELTING, fuelValue, maxStack } from './blocks.js';
import { World, ckey, CH } from './world.js';
import { initMesher, buildChunkMesh, computeLight } from './mesher.js';
import { R, initRenderer, setChunkMeshes, disposeChunkMeshes, updateSky, render } from './render.js';
import { Player } from './player.js';
import { Entities, spawnBlockParticles } from './entities.js';
import { UI } from './ui.js';
import { input, initInput, pollInput, endFrame, setTouchMode, requestLock, exitLock } from './input.js';
import { initAudio, blockSound, sfx } from './audio.js';
import { hashString } from './noise.js';
import { packSlots, unpackSlots, stack } from './inventory.js';
import { rollLoot } from './structures.js';
import { hash3 } from './noise.js';
import { Net, serverURL } from './net.js';

const dayLength = () => G.settings.dayLength || 1200; // seconds; the original's day is 20 minutes
const isNight = () => G.time > 0.52 && G.time < 0.98;
// In multiplayer only the host runs the world; guests just show it
const isGuest = () => !!(G.net && G.net.role === 'client');
const SIM_R = 4;   // the host keeps chunks this far around each guest loaded and running

const S = {
  offsets: [],
  lastCX: null, lastCZ: null,
  urgent: new Set(),
  updates: [],
  water: [],
  saplings: new Map(),
  saveTimer: 0,
};

// ---------------------------------------------------------------- chunk streaming
function buildOffsets() {
  const rd = G.settings.renderDist + 1;
  const out = [];
  for (let dz = -rd; dz <= rd; dz++) {
    for (let dx = -rd; dx <= rd; dx++) {
      const d = Math.hypot(dx, dz);
      if (d <= rd + 0.5) out.push([dx, dz, d]);
    }
  }
  out.sort((a, b) => a[2] - b[2]);
  S.offsets = out;
  S.lastCX = null;
}

function neighborsReady(c) {
  const w = G.world;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!w.getChunk(c.cx + dx, c.cz + dz)) return false;
  }
  return true;
}

function meshChunk(c) {
  const data = buildChunkMesh(G.world, c);
  setChunkMeshes(c, data);
  c.dirty = false;
  c.simDirty = false;
  c.meshed = true;
  G.entities.onChunkReady(c);
}

function guestChunks() {
  const out = [];
  if (G.net && G.net.role === 'host') for (const a of G.net.players.values()) if (a.ready) out.push([Math.floor(a.pos.x) >> 4, Math.floor(a.pos.z) >> 4]);
  return out;
}

// The host generates and lights (but doesn't draw) the chunks around each guest, so mobs,
// water and fire work there too
function simulateAroundGuests(budget) {
  const w = G.world;
  const t0 = performance.now();
  let ops = 0;
  for (const [gx, gz] of guestChunks()) {
    for (let dz = -SIM_R; dz <= SIM_R; dz++) for (let dx = -SIM_R; dx <= SIM_R; dx++) {
      if (ops > 0 && performance.now() - t0 > budget) return;
      const c = w.getChunk(gx + dx, gz + dz);
      if (!c) { w.generate(gx + dx, gz + dz); ops++; continue; }
      if (Math.abs(dx) < SIM_R && Math.abs(dz) < SIM_R && (!c.light || c.simDirty) && neighborsReady(c)) {
        computeLight(w, c);
        c.simDirty = false;
        G.entities.onChunkReady(c);
        ops++;
      }
    }
  }
}

function updateChunks(budget) {
  const w = G.world, p = G.player;
  const t0 = performance.now();
  const pcx = Math.floor(p.pos.x) >> 4, pcz = Math.floor(p.pos.z) >> 4;
  const rd = G.settings.renderDist;

  for (const k of S.urgent) {
    const c = w.chunks.get(k);
    if (c && neighborsReady(c)) meshChunk(c);
  }
  S.urgent.clear();

  S.unloadT = (S.unloadT || 0) + 1;
  if (pcx !== S.lastCX || pcz !== S.lastCZ || (G.net && S.unloadT > 120)) {
    S.lastCX = pcx; S.lastCZ = pcz;
    S.unloadT = 0;
    const lim = rd + 3;
    const guests = guestChunks();
    for (const [k, c] of w.chunks) {
      if (Math.hypot(c.cx - pcx, c.cz - pcz) > lim && !guests.some(([gx, gz]) => Math.max(Math.abs(c.cx - gx), Math.abs(c.cz - gz)) <= SIM_R + 2)) {
        if (!isGuest()) G.entities.storeChunk(c);
        disposeChunkMeshes(c);
        w.chunks.delete(k);
      }
    }
    for (const [k, c] of w.chunks) {
      const vis = Math.hypot(c.cx - pcx, c.cz - pcz) <= rd + 0.5;
      if (c.mesh) c.mesh.visible = vis;
      if (c.water) c.water.visible = vis;
    }
  }

  let ops = 0;
  for (const [dx, dz, d] of S.offsets) {
    if (ops > 0 && performance.now() - t0 > budget) break;
    const cx = pcx + dx, cz = pcz + dz;
    const c = w.getChunk(cx, cz);
    if (!c) { w.generate(cx, cz); ops++; continue; }
    if (c.dirty && d <= rd + 0.5 && neighborsReady(c)) { meshChunk(c); ops++; }
  }
}

function spawnAreaProgress() {
  const w = G.world, p = G.player;
  const pcx = Math.floor(p.pos.x) >> 4, pcz = Math.floor(p.pos.z) >> 4;
  let n = 0, done = 0;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    n++;
    const c = w.getChunk(pcx + dx, pcz + dz);
    if (c && c.meshed) done++;
  }
  return done / n;
}

// ---------------------------------------------------------------- block changes
function onBlockChange(x, y, z, oldId, newId) {
  const w = G.world;
  const cx = x >> 4, cz = z >> 4;
  S.urgent.add(ckey(cx, cz));
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const c = w.getChunk(cx + dx, cz + dz);
    if (c) { c.simDirty = true; if (dx || dz) c.dirty = true; }
  }
  if (G.net) G.net.blockChanged(x, y, z, newId);
  if (isGuest()) return;   // falling sand, water and the rest happen on the host
  S.updates.push(x, y, z);
  if (newId === 0 || newId === B.water) {
    const t = G.clock + 0.25;
    S.water.push([x, y, z, t], [x, y - 1, z, t], [x + 1, y, z, t], [x - 1, y, z, t], [x, y, z + 1, t], [x, y, z - 1, t]);
  }
}

function supported(def, below) {
  if (!def.support) return true;
  if (def.support === 'solid') return BLOCKS[below].opaque || below === B.oak_fence;
  return def.support().includes(below);
}

function processUpdates() {
  const w = G.world;
  let n = 0;
  while (S.updates.length && n++ < 300) {
    const z = S.updates.pop(), y = S.updates.pop(), x = S.updates.pop();
    for (let yy = y; yy <= y + 1; yy++) {
      const id = w.getBlock(x, yy, z);
      if (!id) continue;
      const def = BLOCKS[id];
      const below = w.getBlock(x, yy - 1, z);
      if (def.gravity && (below === 0 || (BLOCKS[below].replaceable && !BLOCKS[below].solid))) {
        let ny = yy - 1;
        while (ny > 0) {
          const b = w.getBlock(x, ny - 1, z);
          if (b !== 0 && !(BLOCKS[b].replaceable && !BLOCKS[b].solid)) break;
          ny--;
        }
        w.setBlock(x, yy, z, 0);
        w.setBlock(x, ny, z, id);
      } else if (!supported(def, below)) {
        Game.removeBlock(x, yy, z, true);
      }
    }
  }
}

// Simple flowing water: sources spread up to 4 blocks sideways and fall straight down
function processWater() {
  const w = G.world;
  if (!S.water.length) return;
  const keep = [];
  let n = 0;
  for (const e of S.water) {
    if (e[3] > G.clock || n > 200) { keep.push(e); continue; }
    n++;
    const [x, y, z] = e;
    if (y < 1 || y >= CH - 1) continue;
    const id = w.getBlock(x, y, z);
    if (id !== 0 && !(BLOCKS[id].replaceable && id !== B.water)) continue;
    if (!w.getChunk(x >> 4, z >> 4)) continue;
    let level = -1;
    if (w.getBlock(x, y + 1, z) === B.water) level = 1;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (w.getBlock(x + dx, y, z + dz) !== B.water) continue;
      const l = w.getMeta(x + dx, y, z + dz) & 7;
      const underN = w.getBlock(x + dx, y - 1, z + dz);
      if (l < 4 && (underN !== 0 || l === 0)) level = level < 0 ? l + 1 : Math.min(level, l + 1);
    }
    if (level >= 0) w.setBlock(x, y, z, B.water, level);
  }
  S.water = keep;
}

function tickFurnaces(dt) {
  const w = G.world;
  for (const c of w.containers.values()) {
    if (c.type !== 'furnace') continue;
    const [inp, fuel, out] = c.slots;
    const result = inp ? SMELTING.get(inp.id) : null;
    const canSmelt = !!result && (!out || (out.id === result && out.count < maxStack(result)));
    if (c.burn > 0) c.burn = Math.max(0, c.burn - dt);
    if (c.burn <= 0 && canSmelt && fuel && fuelValue(fuel.id)) {
      c.burnMax = c.burn = fuelValue(fuel.id);
      fuel.count--;
      if (!fuel.count) c.slots[1] = null;
      c.changed = true;
    }
    if (c.burn > 0 && canSmelt) {
      c.cook += dt;
      if (c.cook >= 10) {
        c.cook = 0;
        inp.count--;
        if (!inp.count) c.slots[0] = null;
        if (out) out.count++; else c.slots[2] = stack(result, 1);
        c.changed = true;
      }
    } else c.cook = Math.max(0, c.cook - dt * 2);
    const id = w.getBlock(c.x, c.y, c.z);
    const lit = c.burn > 0;
    if (lit && id === B.furnace) w.setBlock(c.x, c.y, c.z, B.furnace_lit, w.getMeta(c.x, c.y, c.z));
    else if (!lit && id === B.furnace_lit) w.setBlock(c.x, c.y, c.z, B.furnace, w.getMeta(c.x, c.y, c.z));
  }
}

// ---------------------------------------------------------------- fire
const NEIGHBORS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function flammableNear(w, x, y, z) {
  for (const [dx, dy, dz] of NEIGHBORS6) if (BLOCKS[w.getBlock(x + dx, y + dy, z + dz)].flammable) return true;
  return false;
}

// Fire burns neighbouring wood, leaves, wool and plants, spreads a little, and dies out on bare ground
function tickFires(host) {
  const w = G.world;
  const many = w.fires.size > 300;
  if (host) for (const [key, f] of w.fires) {
    if (f.t === 0) { f.t = G.clock + 0.5 + Math.random(); continue; }
    if (G.clock < f.t) continue;
    f.t = G.clock + 0.6 + Math.random() * 0.8;
    const [x, y, z] = key.split(',').map(Number);
    if (!w.getChunk(x >> 4, z >> 4)) continue;
    if (w.getBlock(x, y, z) !== B.fire) { w.fires.delete(key); continue; }
    const below = w.getBlock(x, y - 1, z);
    const fuel = flammableNear(w, x, y, z);
    if (!fuel && !BLOCKS[below].solid) { w.setBlock(x, y, z, 0); w.fires.delete(key); continue; }
    f.age += 1;
    if (below !== B.netherrack && ((!fuel && f.age > 4 + Math.random() * 5) || f.age > 40)) { w.setBlock(x, y, z, 0); w.fires.delete(key); continue; }
    // burn neighbours
    for (const [dx, dy, dz] of NEIGHBORS6) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const nid = w.getBlock(nx, ny, nz);
      const fl = BLOCKS[nid].flammable;
      if (!fl || Math.random() * 300 > fl) continue;
      if (nid === B.tnt) { Game.removeBlock(nx, ny, nz, false); G.entities.primeTNT(nx, ny, nz); continue; }
      Game.removeBlock(nx, ny, nz, false);
      if (!many && Math.random() < 0.6) Game.ignite(nx, ny, nz);
    }
    // spread to nearby air next to something that burns
    if (!many && fuel) {
      for (let k = 0; k < 2; k++) {
        const sx = x + Math.floor(Math.random() * 3) - 1, sy = y + Math.floor(Math.random() * 4) - 1, sz = z + Math.floor(Math.random() * 3) - 1;
        const sid = w.getBlock(sx, sy, sz);
        if ((sid === 0 || (BLOCKS[sid].replaceable && sid !== B.water && sid !== B.fire)) && flammableNear(w, sx, sy, sz) && Math.random() < 0.25) Game.ignite(sx, sy, sz);
      }
    }
  }
  // flames and smoke, and anything standing in fire catches alight
  const p = G.player;
  let shown = 0;
  for (const key of w.fires.keys()) {
    if (shown++ > 60) break;
    const [x, y, z] = key.split(',').map(Number);
    if (Math.abs(x - p.pos.x) > 24 || Math.abs(z - p.pos.z) > 24) continue;
    if (!host && w.getBlock(x, y, z) !== B.fire) { w.fires.delete(key); continue; }
    if (Math.random() < 0.3) G.entities.particles.spawn(x + Math.random(), y + 0.3 + Math.random() * 0.6, z + Math.random(), 0, 1.2, 0, 1, 0.55 + Math.random() * 0.3, 0.1, 0.1, 0.45, -0.05);
    if (Math.random() < 0.08) G.entities.particles.spawn(x + Math.random(), y + 0.9, z + Math.random(), 0, 1, 0, 0.3, 0.3, 0.3, 0.18, 1.2, -0.08);
  }
  if (host) for (const m of G.entities.mobs) {
    if (m.dead) continue;
    const id = w.getBlock(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.1), Math.floor(m.pos.z));
    if (id === B.fire) m.fire = Math.max(m.fire, 4);
  }
}

// Wheat grows one stage every minute or two
function tickCrops() {
  const w = G.world;
  for (const [key, t] of w.crops) {
    if (t === 0) { w.crops.set(key, G.clock + 40 + Math.random() * 80); continue; }
    if (G.clock < t) continue;
    const [x, y, z] = key.split(',').map(Number);
    if (!w.getChunk(x >> 4, z >> 4)) continue;
    const id = w.getBlock(x, y, z);
    if (id < B.wheat_0 || id > B.wheat_2) { w.crops.delete(key); continue; }
    w.setBlock(x, y, z, id + 1);
    if (id + 1 >= B.wheat_3) w.crops.delete(key);
    else w.crops.set(key, G.clock + 40 + Math.random() * 80);
  }
}

function tickSaplings() {
  const w = G.world;
  for (const [key, t] of S.saplings) {
    if (G.clock < t) continue;
    S.saplings.delete(key);
    const [x, y, z] = key.split(',').map(Number);
    if (w.getBlock(x, y, z) !== B.oak_sapling) continue;
    let clear = true;
    for (let i = 1; i < 6; i++) if (w.getBlock(x, y + i, z) !== 0) clear = false;
    if (!clear) { S.saplings.set(key, G.clock + 60); continue; }
    w.setBlock(x, y, z, 0);
    w.placeTree(null, Math.random() < 0.15 ? 'birch' : 'oak', x, y, z, Math.random());
  }
}

// ---------------------------------------------------------------- game API used by the UI and player
export const Game = {
  removeBlock(x, y, z, drop, byPlayer) {
    const w = G.world;
    const id = w.getBlock(x, y, z);
    if (!id) return;
    const def = BLOCKS[id];
    if (byPlayer) {
      blockSound(def.sound, 'break', { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      spawnBlockParticles(x, y, z, id);
    }
    if (G.net && byPlayer) G.net.breaking = true;
    w.setBlock(x, y, z, 0);
    if (G.net) G.net.breaking = false;
    // doors and beds are two blocks; break the other half too
    if (def.door) {
      const oy = id === B.oak_door ? y + 1 : y - 1;
      if (BLOCKS[w.getBlock(x, oy, z)].door) w.setBlock(x, oy, z, 0);
    } else if (def.bed) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (BLOCKS[w.getBlock(x + dx, y, z + dz)].bed) { w.setBlock(x + dx, y, z + dz, 0); break; }
    }
    if (drop) {
      const drops = def.drops ? def.drops(Math.random) : [[id, 1]];
      for (const [did, n] of drops) G.entities.dropItem(did, n, x + 0.5, y + 0.3, z + 0.5, (Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2);
    }
    const key = `${x},${y},${z}`;
    const c = w.containers.get(key);
    if (c) {
      // a guest's copy may be out of date, so the host sends the real contents
      if (!isGuest()) for (const s of c.slots) if (s) G.entities.dropItem(s.id, s.count, x + 0.5, y + 0.5, z + 0.5, undefined, undefined, undefined, s.dmg);
      w.containers.delete(key);
      if (G.ui.container && G.ui.container.data === c) G.ui.back();
    }
    S.saplings.delete(key);
  },

  placeBlock(x, y, z, id, meta) {
    G.world.setBlock(x, y, z, id, meta);
    this.trackBlock(x, y, z, id);
  },

  // Saplings, crops and fire the world has to keep ticking
  trackBlock(x, y, z, id) {
    const key = `${x},${y},${z}`;
    if (id === B.oak_sapling) S.saplings.set(key, G.clock + 60 + Math.random() * 120);
    if (id >= B.wheat_0 && id <= B.wheat_2) G.world.crops.set(key, 0);
    if (id === B.fire && !G.world.fires.has(key)) G.world.fires.set(key, { t: 0, age: 0 });
  },

  // Fire needs something solid under it or something flammable beside it
  canBurnAt(x, y, z) {
    const w = G.world;
    return BLOCKS[w.getBlock(x, y - 1, z)].solid || flammableNear(w, x, y, z);
  },

  ignite(x, y, z) {
    const w = G.world;
    if (y < 1 || y >= CH - 1) return;
    w.setBlock(x, y, z, B.fire);
    w.fires.set(`${x},${y},${z}`, { t: 0, age: 0 });
  },

  toggleDoor(x, y, z) {
    const w = G.world;
    const id = w.getBlock(x, y, z);
    if (!BLOCKS[id].door) return;
    const by = id === B.oak_door_top ? y - 1 : y;
    const m = w.getMeta(x, by, z) ^ 4;
    w.setBlock(x, by, z, B.oak_door, m);
    if (w.getBlock(x, by + 1, z) === B.oak_door_top) w.setBlock(x, by + 1, z, B.oak_door_top, m);
    sfx('door', { x, y, z });
  },

  useBed(x, y, z) {
    const p = G.player;
    p.bedSpawn = { x, y, z };
    if (!isNight()) { G.ui.toast('Respawn point set. You can only sleep at night'); return; }
    if (G.entities.hostilesNear(x + 0.5, y, z + 0.5, 8)) { G.ui.toast('You may not rest now, there are monsters nearby'); return; }
    G.ui.toast('Respawn point set');
    G.sleeping = { t: 0, x: x + 0.5, y: y + 0.6, z: z + 0.5 };
    p.pos = { x: x + 0.5, y: y + 0.56, z: z + 0.5 };
    p.vel = { x: 0, y: 0, z: 0 };
    p.pitch = 0.2;
  },

  wakeUp() {
    if (!G.sleeping) return;
    G.sleeping = null;
    G.ui.sleepOverlay(0);
    const p = G.player;
    p.pos.y = Math.floor(p.pos.y) + 0.5625;
    p.vel = { x: 0, y: 0, z: 0 };
    p.fallDist = 0;
  },

  container(x, y, z, type) {
    if (isGuest()) return G.net.openContainer(x, y, z, type);
    const w = G.world;
    const key = `${x},${y},${z}`;
    let c = w.containers.get(key);
    if (!c) {
      c = type === 'chest'
        ? { type, slots: new Array(27).fill(null) }
        : { type, slots: [null, null, null], burn: 0, burnMax: 0, cook: 0 };
      c.x = x; c.y = y; c.z = z;
      // structure chests are filled the first time they are opened
      const loot = w.lootChests.get(key);
      if (loot && type === 'chest') { c.slots = rollLoot(loot, hash3(w.seed, x, y, z) * 4294967296); w.lootChests.delete(key); }
      w.containers.set(key, c);
    }
    return c;
  },

  listWorlds() {
    const list = load('worlds', []);
    return Array.isArray(list) ? list.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)) : [];
  },

  createWorld(name, seedText, mode) {
    const seed = makeSeed(seedText);
    const meta = { id: Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), name, seed, mode: mode === 'creative' ? 'creative' : 'survival', created: Date.now(), lastPlayed: Date.now() };
    const list = this.listWorlds();
    list.unshift(meta);
    store('worlds', list);
    startWorld(meta, null);
  },

  loadWorld(id) {
    const meta = this.listWorlds().find((w) => w.id === id);
    if (!meta) return;
    startWorld(meta, load('world.' + id));
  },

  deleteWorld(id) {
    store('worlds', this.listWorlds().filter((w) => w.id !== id));
    remove('world.' + id);
  },

  quitToTitle() {
    saveWorld();
    if (G.net) G.net.close();
    teardown();
    G.state = 'title';
    exitLock();
    G.ui.showTitle();
  },

  respawn() {
    G.sleeping = null;
    G.player.respawn();
    G.ui.startPlaying();
    if (!G.touchMode) requestLock();
  },

  renderDistChanged() { buildOffsets(); },

  // ------------------------------------------------------------ online worlds
  // Online worlds live on the Blockcraft server, each with its own permanent link. Whoever is in the
  // world first runs it and sends the save to the server every few seconds; the rest join them.
  playerData,

  async listOnline() {
    const away = 'Online worlds only work on the Blockcraft website (your onrender.com link).';
    if (!serverURL()) throw new Error(away);
    let r;
    try { r = await fetch('/api/worlds', { cache: 'no-store' }); } catch { throw new Error('Could not reach the server. Check your connection.'); }
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error(away);
    return r.json();
  },

  // ------------------------------------------------------------ accounts
  // Signing in makes you the same player on any device; your items are saved under your account
  async signIn(name, password, create) {
    let r;
    try {
      r = await fetch(create ? '/api/signup' : '/api/login', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password }),
      });
    } catch { throw new Error('Could not reach the server. Check your connection.'); }
    const b = await r.json().catch(() => ({}));
    if (!r.ok || !b.token) throw new Error(b.error || 'Accounts only work on the Blockcraft website.');
    G.account = { ...b.account, token: b.token };
    store('account', G.account);
    return G.account;
  },

  async signOut() {
    const a = G.account;
    G.account = null;
    remove('account');
    if (a) fetch('/api/logout', { method: 'POST', headers: authHeader(a) }).catch(() => {});
  },

  // Still signed in? (a session lasts until you sign out)
  async checkAccount() {
    const a = G.account;
    if (!a) return null;
    try {
      const r = await fetch('/api/me', { headers: authHeader(a), cache: 'no-store' });
      if (r.status === 401) { G.account = null; remove('account'); return null; }
    } catch { /* offline: keep it */ }
    return G.account;
  },

  async createOnline(name, seedText, mode) {
    const r = await fetch('/api/worlds', {
      method: 'POST', headers: { 'content-type': 'application/json', ...authHeader(G.account) },
      body: JSON.stringify({ name, seed: makeSeed(seedText), mode }),
    });
    if (!r.ok) throw new Error('Could not create the world. Check your connection.');
    return r.json();
  },

  async deleteOnline(id) {
    const r = await fetch('/api/worlds/' + id, { method: 'DELETE', headers: authHeader(G.account) });
    if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || 'Could not delete that world.'); }
    remove('online.' + id);
  },

  async joinWorld(id, onStatus) {
    const acc = G.account;
    // this browser's copy of the world, in case the server has lost or has an older one
    const backup = load('online.' + id);
    const have = backup && backup.meta ? { v: backup.v || 0, meta: backup.meta } : null;
    const { net, host, snap } = await Net.connect(id, acc, have, onStatus);
    G.net = net;
    if (snap) { startRemoteWorld(snap, id); return; }
    let data = null;
    if (host.useLocal && backup) data = backup.data;
    else if (host.save) { try { data = JSON.parse(host.save); } catch { data = null; } }
    const m = host.meta;
    S.saveVersion = Math.max(m.v || 0, (backup && backup.v) || 0);
    startWorld({ online: id, id: null, name: m.name, seed: m.seed, mode: m.mode, created: m.created, me: acc.id, meName: acc.name }, data);
  },

  // Back into the same online world after the connection dropped or the player running it left
  rejoin(id, wait, msg) {
    if (G.worldMeta && G.worldMeta.online && !G.worldMeta.remote) saveWorld();   // keeps a copy in this browser
    const carry = G.player && !G.player.dead ? playerData(G.player) : null;
    if (G.net) G.net.shutdown();
    G.net = null;
    teardown();
    G.state = 'title';
    exitLock();
    G.ui.showBusy(msg);
    setTimeout(async () => {
      S.carry = carry ? { id, d: carry } : null;
      try { await Game.joinWorld(id, (t) => G.ui.showBusy(t)); } catch (err) {
        S.carry = null;
        G.ui.showTitle();
        G.ui.openScreen('mp');
        G.ui.mpStatus(err && err.message ? err.message : 'Could not get back into the world.');
      }
    }, wait);
  },

  // Sent to a guest when they join: everything they need to build the same world
  worldSnapshot(account, name) {
    const w = G.world, p = G.player;
    return {
      k: 'world', host: G.net.name, name: G.worldMeta.name, seed: w.seed, mode: G.worldMeta.mode,
      time: G.time, day: G.day || 0, nns: G.nightsNoSleep || 0,
      spawn: w.worldSpawn || p.spawn, edits: packEdits(w), guest: playerRecord(w.guests, account, name),
    };
  },

  saveNow() { saveWorld(); },

  // Sent back to the title screen (signed in somewhere else)
  leaveOnline(msg) {
    teardown();
    G.state = 'title';
    exitLock();
    G.ui.showTitle();
    G.ui.openScreen('mp');
    G.ui.mpStatus(msg);
  },
};

const authHeader = (a) => (a && a.token ? { authorization: 'Bearer ' + a.token } : {});

// A player's saved inventory in an online world, by account. Worlds from before accounts saved it by
// name: the account with that username (usernames are unique) takes it over the first time.
function playerRecord(guests, account, name) {
  if (!guests || !account) return null;
  if (guests[account]) return guests[account];
  const old = Object.keys(guests).find((k) => !k.startsWith('u_') && k.toLowerCase() === String(name).toLowerCase());
  if (!old) return null;
  guests[account] = guests[old];
  delete guests[old];
  return guests[account];
}

function makeSeed(seedText) {
  if (!seedText) return (Math.random() * 4294967296) >>> 0;
  if (/^-?\d+$/.test(seedText)) return Number(BigInt.asUintN(32, BigInt(seedText)));
  return hashString(seedText);
}

function packEdits(w) {
  const edits = {};
  for (const [k, m] of w.edits) {
    const cx = Math.floor(k / 65536) - 32768, cz = (k % 65536) - 32768;
    const arr = [];
    for (const [i, v] of m) arr.push(i, v);
    edits[cx + ',' + cz] = arr;
  }
  return edits;
}

function unpackEdits(w, edits) {
  for (const [k, arr] of Object.entries(edits || {})) {
    const [cx, cz] = k.split(',').map(Number);
    const m = new Map();
    for (let i = 0; i < arr.length; i += 2) m.set(arr[i], arr[i + 1]);
    w.edits.set(ckey(cx, cz), m);
  }
}

function playerData(p) {
  return {
    pos: { ...p.pos }, yaw: p.yaw, pitch: p.pitch, health: p.health, food: p.food, saturation: p.saturation,
    inv: packSlots(p.inv.slots), selected: p.inv.selected, spawn: p.spawn, flying: p.flying,
    armor: packSlots(p.armor), bed: p.bedSpawn,
  };
}

function applyPlayerData(p, d) {
  Object.assign(p.pos, d.pos);
  p.yaw = d.yaw || 0; p.pitch = d.pitch || 0;
  p.health = d.health ?? 20; p.food = d.food ?? 20; p.saturation = d.saturation ?? 5;
  p.inv.slots = unpackSlots(d.inv, 36);
  p.inv.selected = d.selected || 0;
  p.spawn = d.spawn || { ...p.pos };
  p.flying = !!d.flying && p.creative;
  p.armor = unpackSlots(d.armor, 4);
  p.bedSpawn = d.bed || null;
  if (p.health <= 0) { p.health = 20; p.pos = { ...p.spawn }; }
}

// A guest's copy of the world the host is running
function startRemoteWorld(snap, onlineId) {
  initAudio();
  teardown();
  G.worldMeta = { id: null, remote: true, online: onlineId, name: snap.name, seed: snap.seed, mode: snap.mode === 'creative' ? 'creative' : 'survival' };
  const w = new World(snap.seed);
  w.onChange = onBlockChange;
  w.villagerTrades = new Map();
  w.deadMobs = new Set();
  w.guests = {};
  unpackEdits(w, snap.edits);
  G.world = w;
  const p = new Player();
  p.mode = G.worldMeta.mode;
  G.player = p;
  if (!G.entities) G.entities = new Entities();
  G.clock = 0;
  G.time = snap.time ?? 0.03;
  G.day = snap.day || 0;
  G.nightsNoSleep = snap.nns || 0;
  if (snap.guest) applyPlayerData(p, snap.guest);
  else {
    const sp = snap.spawn || { x: 0, y: 80, z: 0 };
    p.pos = { x: sp.x + (Math.random() - 0.5) * 3, y: sp.y, z: sp.z + (Math.random() - 0.5) * 3 };
    p.spawn = { ...sp };
    p.yaw = Math.PI * 0.75;
  }
  takeCarry(p, onlineId);
  buildOffsets();
  G.state = 'loading';
  G.ui.showLoading(0);
}

// After reconnecting, a player keeps exactly what they had a moment ago
function takeCarry(p, onlineId) {
  const c = S.carry;
  S.carry = null;
  if (c && onlineId && c.id === onlineId) applyPlayerData(p, c.d);
}

// ---------------------------------------------------------------- worlds
function teardown() {
  if (G.world) for (const c of G.world.chunks.values()) disposeChunkMeshes(c);
  if (G.entities) G.entities.clear();
  G.world = null;
  S.urgent.clear();
  S.updates.length = 0;
  S.water.length = 0;
  S.saplings.clear();
  G.sleeping = null;
}

function startWorld(meta, data) {
  initAudio();
  teardown();
  G.worldMeta = meta;
  const w = new World(meta.seed);
  w.onChange = onBlockChange;
  w.villagerTrades = new Map(Object.entries((data && data.villagers) || {}));
  w.deadMobs = new Set((data && data.deadMobs) || []);
  w.guests = (data && data.guests) || {};
  w.stored = new Map(Object.entries((data && data.entities) || {}).map(([k, v]) => [Number(k), v]));
  w.spawned = new Set((data && data.spawned) || []);
  G.world = w;
  const p = new Player();
  p.mode = meta.mode;
  G.player = p;
  if (!G.entities) G.entities = new Entities();
  G.clock = 0;
  if (data) {
    unpackEdits(w, data.edits);
    for (const c of data.containers || []) {
      const [x, y, z] = c.k.split(',').map(Number);
      const n = c.type === 'chest' ? 27 : 3;
      w.containers.set(c.k, { type: c.type, slots: unpackSlots(c.slots, n), burn: c.burn || 0, burnMax: c.burnMax || 0, cook: c.cook || 0, x, y, z });
    }
    for (const k of data.saplings || []) S.saplings.set(k, 30 + Math.random() * 120);
    G.day = data.day || 0;
    G.nightsNoSleep = data.nightsNoSleep || 0;
    G.time = data.time ?? 0.03;
  } else {
    G.time = 0.03;
    G.day = 0;
    G.nightsNoSleep = 0;
  }
  // where new players appear
  let sp = (data && data.worldSpawn) || (data && data.player && data.player.spawn);
  if (!sp) { const f = w.findSpawn(); sp = { x: f.x, y: f.h + 1, z: f.z }; }
  w.worldSpawn = sp;
  // in an online world everyone's inventory is kept under their name
  const pd = data && (meta.online ? playerRecord(w.guests, meta.me, meta.meName) : data.player);
  if (pd) applyPlayerData(p, pd);
  else {
    p.pos = { ...sp };
    p.spawn = { ...sp };
    p.yaw = Math.PI * 0.75;
    if (p.creative) {
      ['grass', 'dirt', 'stone', 'cobblestone', 'oak_planks', 'oak_log', 'glass', 'torch', 'bricks'].forEach((k, i) => { p.inv.slots[i] = stack(B[k], 64); });
    }
  }
  takeCarry(p, meta.online);
  buildOffsets();
  G.state = 'loading';
  G.ui.showLoading(0);
}

function saveWorld() {
  if (!G.worldMeta || !G.world || !G.player) return;
  // a guest's world belongs to the host, who keeps their inventory too
  if (G.worldMeta.remote) { if (G.net) G.net.saveGuest(); return; }
  const w = G.world, p = G.player;
  G.entities.saveVillagers();
  const edits = packEdits(w);
  const containers = [];
  for (const [k, c] of w.containers) containers.push({ k, type: c.type, slots: packSlots(c.slots), burn: c.burn, burnMax: c.burnMax, cook: c.cook });
  const data = {
    v: 1,
    time: G.time,
    player: playerData(p),
    guests: w.guests || {},
    worldSpawn: w.worldSpawn,
    entities: G.entities.savedEntities(),
    spawned: [...w.spawned],
    day: G.day || 0, nightsNoSleep: G.nightsNoSleep || 0,
    villagers: Object.fromEntries(w.villagerTrades),
    deadMobs: [...w.deadMobs],
    edits, containers, saplings: [...S.saplings.keys()],
  };
  const meta = G.worldMeta;
  if (meta.online) {
    // the server keeps online worlds; this browser keeps a spare copy
    delete data.player;
    w.guests[meta.me] = playerData(p);
    S.saveVersion = (S.saveVersion || 0) + 1;
    if (G.net) G.net.uploadSave(JSON.stringify(data), S.saveVersion);
    store('online.' + meta.online, { v: S.saveVersion, meta: { id: meta.online, name: meta.name, seed: meta.seed, mode: meta.mode, created: meta.created }, data });
    return;
  }
  const ok = store('world.' + G.worldMeta.id, data);
  const list = Game.listWorlds();
  const m = list.find((x) => x.id === G.worldMeta.id);
  if (m) { m.lastPlayed = Date.now(); store('worlds', list); }
  if (!ok) G.ui.toast('Could not save: browser storage is full or blocked');
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  frame(dt);
}

// One game frame; also callable directly (G.step) to drive the game without animation frames
function frame(dt) {
  if (G.state === 'loading') {
    updateChunks(40);
    if (G.net) G.net.update(dt);
    const prog = spawnAreaProgress();
    G.ui.showLoading(prog);
    if (prog >= 1) {
      G.state = 'playing';
      G.ui.startPlaying();
      G.ui.invChanged();
      if (!G.touchMode) requestLock();
      // an online world is on the server from the moment someone is in it
      if (G.worldMeta && G.worldMeta.online && !G.worldMeta.remote) saveWorld();
    }
    return;
  }
  if (G.state !== 'playing') return;
  G.clock += dt;
  pollInput(dt);
  // the world keeps going for everyone else while one player has the menu open
  const paused = (G.screen === 'pause' || G.screen === 'options') && !G.net;
  const host = !isGuest();
  if (!paused) {
    const before = G.time;
    G.time += dt / dayLength();
    if (G.time >= 1) {
      G.time -= 1;
      G.day = (G.day || 0) + 1;
      G.nightsNoSleep = (G.nightsNoSleep || 0) + 1;
    }
    if (G.sleeping) {
      // Sleep: the screen fades out, then the night is skipped. In multiplayer everyone has to be in bed.
      const s = G.sleeping;
      s.t += dt;
      const everyone = !G.net || G.net.allAsleep();
      G.ui.sleepOverlay(Math.min(everyone ? 1 : 0.6, s.t / 2));
      G.player.pos.x = s.x; G.player.pos.y = s.y; G.player.pos.z = s.z;
      if (G.net && !everyone && s.t > 1.5 && !s.told) { s.told = true; G.ui.toast('Waiting for everyone to sleep · jump to get up'); }
      if (G.net && input.jumpPressed && s.t > 0.5) Game.wakeUp();
      else if (everyone && host && s.t >= 2.6) {
        if (before > 0.5) G.day = (G.day || 0) + 1;
        G.time = 0.0;
        G.nightsNoSleep = 0;
        Game.wakeUp();
        G.ui.toast('Good morning');
        if (G.net) { G.net.send({ k: 't', t: G.time, d: G.day, n: 0 }); G.net.send({ k: 'wake' }); }
      }
      input.moveX = input.moveZ = 0; input.jump = false;
    }
    G.player.update(dt, input);
    G.entities.update(dt);
    if (host) {
      processUpdates();
      processWater();
      tickFurnaces(dt);
      tickSaplings();
      tickCrops();
    }
    tickFires(host);
  }
  if (G.net) {
    G.net.update(dt);
    if (host) simulateAroundGuests(4);
  }
  updateChunks(paused ? 14 : 7);
  G.player.updateCamera(dt);
  updateSky(G.time, paused ? 0 : dt, G.player.headInWater);
  G.ui.update(dt);
  render();
  endFrame();
  S.saveTimer += dt;
  if (S.saveTimer > (G.net ? 10 : 30)) { S.saveTimer = 0; saveWorld(); }
}

// ---------------------------------------------------------------- boot
function boot(hotData) {
  loadSettings();
  buildTextures();
  buildIcons();
  initMesher();
  initRenderer(document.getElementById('app'));
  G.canvas = R.renderer.domElement;
  G.game = Game;
  G.step = frame;
  G.ui = new UI();
  G.ui.init();
  initInput();
  const t = G.settings.touch;
  setTouchMode(t === 'on' || (t === 'auto' && isTouchDevice));
  G.ui.showTitle();
  document.getElementById('boot').hidden = true;
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') saveWorld(); });
  window.addEventListener('pagehide', () => { if (G.state === 'playing') saveWorld(); });
  try {
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
      window.claude.hot.snapshot(() => {
        if (G.state === 'playing') saveWorld();
        return { worldId: G.state === 'playing' && G.worldMeta ? G.worldMeta.id : null };
      });
    }
  } catch { /* hot reload unavailable */ }
  if (hotData && hotData.worldId) Game.loadWorld(hotData.worldId);
  G.account = load('account');
  // a world link (…?world=ID) goes straight into that online world
  const link = new URLSearchParams(location.search).get('world');
  if (link && !(hotData && hotData.worldId)) G.ui.openOnline(link.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
  requestAnimationFrame(loop);
}

function start(data) {
  try { boot(data || {}); }
  catch (err) {
    console.error(err);
    const b = document.getElementById('boot');
    b.hidden = false;
    b.textContent = 'Blockcraft could not start: ' + (err && err.message ? err.message : err) + '. This game needs WebGL 2 (Safari 15+, Chrome, Edge or Firefox).';
  }
}

const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(start);
else start((hot && hot.data) || {});
