// Boot, main loop, chunk streaming, block updates, saving.
import { G, loadSettings, store, load, remove, isTouchDevice } from './game.js';
import { cleanSign, signMesh, disposeSignMesh } from './signs.js';
import { buildTextures, buildIcons } from './textures.js';
import { BLOCKS, ITEMS, B, ID, RENDER, SMELTING, fuelValue, maxStack, canHarvest } from './blocks.js';
import { World, ckey, CH, GEN } from './world.js';
import { ench } from './enchant.js';
import { Advancements } from './advancements.js';
import { initMesher, buildChunkMesh, computeLight } from './mesher.js';
import { R, initRenderer, setChunkMeshes, disposeChunkMeshes, updateSky, render } from './render.js';
import { Player } from './player.js';
import { Entities, spawnBlockParticles, explode } from './entities.js';
import { UI } from './ui.js';
import { input, initInput, pollInput, endFrame, setTouchMode, requestLock, exitLock } from './input.js';
import { initAudio, blockSound, sfx } from './audio.js';
import { hashString } from './noise.js';
import { packSlots, unpackSlots, stack } from './inventory.js';
import { rollLoot } from './structures.js';
import { hash3 } from './noise.js';
import { Net, serverURL } from './net.js';
import './dimmobs.js';
import { startPanorama, stopPanorama, panoramaFrame } from './panorama.js';
import { findPortalFrame, portalCells, findNearbyPortal, buildPortal, END_SPAWN, endColumn, DIMS } from './dims.js';

const dayLength = () => G.settings.dayLength || 1200; // seconds; the original's day is 20 minutes
const isNight = () => G.time > 0.52 && G.time < 0.98;
// In multiplayer only the host runs the world; guests just show it
const isGuest = () => !!(G.net && G.net.role === 'client');
const SIM_R = 4;   // the host keeps chunks this far around each guest loaded and running

// Frosted ice (Frost Walker) melts back into water: "x,y,z" -> when
function tickFrost() {
  if (!S.frost.size) return;
  const w = G.world, p = G.player;
  for (const [key, t] of S.frost) {
    if (G.clock < t) continue;
    const [x, y, z] = key.split(',').map(Number);
    // (not from under the feet of whoever is standing on it)
    if (p && Math.floor(p.pos.x) === x && Math.floor(p.pos.z) === z && Math.floor(p.pos.y - 0.1) === y) { S.frost.set(key, G.clock + 1); continue; }
    S.frost.delete(key);
    if (w.getBlock(x, y, z) === B.frosted_ice) Game.placeBlock(x, y, z, B.water, 0);
  }
}

const S = {
  offsets: [],
  lastCX: null, lastCZ: null,
  urgent: new Set(),
  updates: [],
  water: new Map(),   // liquid blocks due for another look: "x,y,z" -> { x, y, z, t }
  saplings: new Map(),
  frost: new Map(),   // frosted ice due to melt: "x,y,z" -> when
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
  if (BLOCKS[oldId].sign && !BLOCKS[newId].sign && w.signs.delete(`${x},${y},${z}`)) S.signsDirty = true;
  if (G.net) G.net.blockChanged(x, y, z, newId);
  if (isGuest()) return;   // falling sand, water and the rest happen on the host
  S.updates.push(x, y, z);
  // any change can start, stop or turn a flow: the liquid here and next to it takes another look
  scheduleLiquid(w, x, y, z);
  for (const [dx, dy, dz] of NEIGHBORS6) scheduleLiquid(w, x + dx, y + dy, z + dz);
  // breaking a portal block or its frame collapses the whole portal
  if ((oldId === B.obsidian || oldId === B.nether_portal) && newId !== oldId && !S.collapsing) {
    S.collapsing = true;
    for (const [dx, dy, dz] of NEIGHBORS6) {
      if (w.getBlock(x + dx, y + dy, z + dz) !== B.nether_portal) continue;
      for (const [a, b, c] of portalCells(w, x + dx, y + dy, z + dz)) w.setBlock(a, b, c, 0);
    }
    S.collapsing = false;
  }
}

// Is the block here still held up? Torches and signs hang on the wall they were put on (or stand on the
// block below); plants need their soil.
const WALLS = [[1, 0], [-1, 0], [0, 1], [0, -1]];              // torch meta 1-4: the wall to the east, west, south, north
const SIGN_BACK = [[0, -1], [-1, 0], [0, 1], [1, 0]];          // wall sign meta 0-3 (facing south, east, north, west): the wall behind
function supported(w, x, y, z, id, def) {
  if (id === B.torch || def.sign) {
    const m = w.getMeta(x, y, z);
    if (id === B.torch && m >= 1 && m <= 4) return w.isSolid(x + WALLS[m - 1][0], y, z + WALLS[m - 1][1]);
    if (def.sign === 2) return w.isSolid(x + SIGN_BACK[m & 3][0], y, z + SIGN_BACK[m & 3][1]);
    return w.isSolid(x, y - 1, z);
  }
  if (!def.support) return true;
  const below = w.getBlock(x, y - 1, z);
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
      } else if (!supported(w, x, yy, z, id, def)) {
        Game.removeBlock(x, yy, z, true);
      }
    }
    // torches and signs on the walls of this block come off with it
    for (const [dx, dz] of WALLS) {
      const id = w.getBlock(x + dx, y, z + dz);
      if ((id === B.torch || id === B.wall_sign) && !supported(w, x + dx, y, z + dz, id, BLOCKS[id])) Game.removeBlock(x + dx, y, z + dz, true);
    }
  }
}

// ---------------------------------------------------------------- signs
// The words on nearby signs are drawn on small flat panels just in front of each board
const signMeshes = new Map();   // "x,y,z" -> { mesh, text }
function clearSignMeshes() {
  for (const m of signMeshes.values()) disposeSignMesh(m.mesh);
  signMeshes.clear();
}
function updateSigns(dt) {
  S.signT = (S.signT || 0) - dt;
  if (S.signT > 0 && !S.signsDirty) return;
  S.signT = 0.5;
  S.signsDirty = false;
  const w = G.world, p = G.player;
  for (const [key, lines] of w.signs) {
    const [x, y, z] = key.split(',').map(Number);
    const id = w.getChunk(x >> 4, z >> 4) ? w.getBlock(x, y, z) : 0;
    const near = BLOCKS[id].sign && Math.hypot(x - p.pos.x, y - p.pos.y, z - p.pos.z) < 40;
    let m = signMeshes.get(key);
    const text = lines.join('\n');
    if (m && (!near || m.text !== text)) { disposeSignMesh(m.mesh); signMeshes.delete(key); m = null; }
    if (!near) continue;
    if (!m) {
      m = { mesh: signMesh(id, w.getMeta(x, y, z), x, y, z, lines), text };
      R.scene.add(m.mesh);
      signMeshes.set(key, m);
    }
    const [sky, blk] = w.getLight(x, y, z);
    m.mesh.material.color.setScalar(Math.min(1, 0.25 + Math.max(sky / 15 * G.daylight, blk / 15)));
  }
  for (const [key, m] of signMeshes) {
    if (w.signs.has(key)) continue;
    disposeSignMesh(m.mesh);
    signMeshes.delete(key);
  }
}

// ---------------------------------------------------------------- liquids
// As in Minecraft: a liquid block is a source (meta 0), flowing (meta 1-7, how far it is from a source)
// or falling (meta 8, pouring down from above). Liquid falls first; on the ground it spreads towards the
// nearest drop within a few blocks (everywhere if there is none). A flowing block only stays while a
// stronger neighbour or liquid above feeds it, so anything cut off from its source drains away. Water runs
// 7 blocks; lava 3 and slowly (7 and faster in the Nether). Two water sources make a third between them.
const FALLING = 8;
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const isLiquid = (id) => id === B.water || id === B.lava;
const liquidRules = (id) => (id === B.water ? { drop: 1, slope: 4, delay: 0.25 }
  : G.dim === 'nether' ? { drop: 1, slope: 4, delay: 0.5 } : { drop: 2, slope: 2, delay: 1.5 });
const amountOf = (meta) => (meta === 0 || meta & FALLING ? 8 : 8 - (meta & 7));

// Washed away by flowing liquid: air, grass, flowers, crops, torches, fire
function washable(id) {
  if (id === 0) return true;
  const d = BLOCKS[id];
  return !d.solid && !isLiquid(id) && (d.replaceable || d.render === RENDER.CROSS || d.render === RENDER.TORCH);
}
// Can this liquid move into the cell (or update it, if it is a weaker flow of the same liquid)?
function openFor(w, x, y, z, id) {
  const b = w.getBlock(x, y, z);
  return b === id ? w.getMeta(x, y, z) !== 0 : washable(b);
}

function scheduleLiquid(w, x, y, z) {
  const id = w.getBlock(x, y, z);
  if (!isLiquid(id)) return;
  const k = x + ',' + y + ',' + z;
  if (!S.water.has(k)) S.water.set(k, { x, y, z, t: G.clock + liquidRules(id).delay });
}

function processWater() {
  const w = G.world;
  // flowing liquid in saved edits takes a look once its chunk loads (it may have been cut off)
  if (w.liquidLoaded && w.liquidLoaded.length) { for (const [x, y, z] of w.liquidLoaded) scheduleLiquid(w, x, y, z); w.liquidLoaded.length = 0; }
  if (!S.water.size) return;
  const due = [];
  for (const [k, e] of S.water) {
    if (e.t > G.clock) continue;
    due.push(e);
    S.water.delete(k);
    if (due.length >= 400) break;
  }
  for (const e of due) {
    if (e.y < 1 || e.y >= CH - 1 || !w.getChunk(e.x >> 4, e.z >> 4)) continue;
    liquidTick(w, e.x, e.y, e.z);
  }
}

function liquidTick(w, x, y, z) {
  const id = w.getBlock(x, y, z);
  if (!isLiquid(id)) return;
  const meta = w.getMeta(x, y, z);
  if (meta !== 0) {
    const want = settledLevel(w, x, y, z, id);
    if (want < 0) { w.setBlock(x, y, z, 0); return; }
    if (want !== meta) { w.setBlock(x, y, z, id, want); return; }   // the change brings it back for another look
  }
  if (mixLiquids(w, x, y, z)) return;
  spreadLiquid(w, x, y, z, id, meta);
}

// What a flowing block should be now, from what feeds it (-1: nothing does, it dries up)
function settledLevel(w, x, y, z, id) {
  let best = 0, sources = 0;
  for (const [dx, dz] of SIDES) {
    if (w.getBlock(x + dx, y, z + dz) !== id) continue;
    const m = w.getMeta(x + dx, y, z + dz);
    if (m === 0) sources++;
    best = Math.max(best, amountOf(m));
  }
  if (id === B.water && sources >= 2) {
    const below = w.getBlock(x, y - 1, z);
    if (BLOCKS[below].solid || (below === id && w.getMeta(x, y - 1, z) === 0)) return 0;
  }
  if (w.getBlock(x, y + 1, z) === id) return FALLING;
  const amt = best - liquidRules(id).drop;
  return amt <= 0 ? -1 : 8 - amt;
}

function spreadLiquid(w, x, y, z, id, meta) {
  const r = liquidRules(id);
  const source = meta === 0;
  const below = w.getBlock(x, y - 1, z);
  if (y > 1 && id === B.lava && below === B.water) {
    // lava pouring onto water turns the water to stone
    w.setBlock(x, y - 1, z, B.stone);
    fizz(x, y - 1, z);
    return;
  }
  if (y > 1 && openFor(w, x, y - 1, z, id)) {
    flowInto(w, x, y - 1, z, id, FALLING);
    // only the edge of a lake spills sideways as well as down
    let around = 0;
    for (const [dx, dz] of SIDES) if (w.getBlock(x + dx, y, z + dz) === id && w.getMeta(x + dx, y, z + dz) === 0) around++;
    if (!source || around < 3) return;
  } else if (!source && below === id) return;   // resting on its own kind: it just joins it
  const next = meta & FALLING ? r.drop : (meta & 7) + r.drop;
  if (next > 7) return;
  for (const [dx, dz] of spreadDirections(w, x, y, z, id, r.slope)) flowInto(w, x + dx, y, z + dz, id, next);
}

// Liquid heads for the nearest place within `slope` blocks where it can fall; with none in reach it goes everywhere
function spreadDirections(w, x, y, z, id, slope) {
  let best = 1000, out = [];
  for (const [dx, dz] of SIDES) {
    const nx = x + dx, nz = z + dz;
    if (!openFor(w, nx, y, nz, id)) continue;
    const d = openFor(w, nx, y - 1, nz, id) ? 0 : slopeDistance(w, nx, y, nz, id, 1, -dx, -dz, slope);
    if (d < best) { best = d; out = []; }
    if (d === best) out.push([dx, dz]);
  }
  return out;
}
function slopeDistance(w, x, y, z, id, depth, fx, fz, slope) {
  let best = 1000;
  for (const [dx, dz] of SIDES) {
    if (dx === fx && dz === fz) continue;
    const nx = x + dx, nz = z + dz;
    if (!openFor(w, nx, y, nz, id)) continue;
    if (openFor(w, nx, y - 1, nz, id)) return depth;
    if (depth < slope) best = Math.min(best, slopeDistance(w, nx, y, nz, id, depth + 1, -dx, -dz, slope));
  }
  return best;
}

function flowInto(w, x, y, z, id, meta) {
  const b = w.getBlock(x, y, z);
  if (b === id) {
    const m = w.getMeta(x, y, z);
    // only ever made stronger: falling beats flowing, and nearer the source beats further
    if (m === 0 || m === meta || (meta === FALLING ? false : m === FALLING || (m & 7) <= meta)) return;
  } else if (!washable(b)) return;
  else if (b !== 0) {
    if (id === B.water && b !== B.fire) Game.removeBlock(x, y, z, true);
    else w.setBlock(x, y, z, 0);
  }
  w.setBlock(x, y, z, id, meta);
}

function fizz(x, y, z) {
  sfx('extinguish', { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, { vol: 0.6 });
  for (let i = 0; i < 6; i++) G.entities.particles.spawn(x + Math.random(), y + 1, z + Math.random(), 0, 1, 0, 0.7, 0.7, 0.7, 0.15, 0.8, -0.06);
}

// Lava touched by water from above or the side hardens: a source into obsidian, flowing lava into
// cobblestone (true if this block changed)
function mixLiquids(w, x, y, z) {
  const id = w.getBlock(x, y, z);
  if (!isLiquid(id)) return false;
  for (const [dx, dy, dz] of NEIGHBORS6) {
    const nx = x + dx, ny = y + dy, nz = z + dz;
    if (!isLiquid(w.getBlock(nx, ny, nz)) || w.getBlock(nx, ny, nz) === id) continue;
    // the lava of the pair, and the water must not be underneath it
    const [lx, ly, lz] = id === B.lava ? [x, y, z] : [nx, ny, nz];
    const waterY = id === B.lava ? ny : y;
    if (waterY < ly) continue;
    w.setBlock(lx, ly, lz, w.getMeta(lx, ly, lz) === 0 ? B.obsidian : B.cobblestone);
    fizz(lx, ly, lz);
    if (id === B.lava) return true;
  }
  return false;
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
      if (fuel.id === ID.lava_bucket) c.slots[1] = { id: ID.bucket, count: 1, dmg: 0 };   // the bucket is left behind
      else if (!fuel.count) c.slots[1] = null;
      c.changed = true;
    }
    if (c.burn > 0 && canSmelt) {
      c.cook += dt;
      if (c.cook >= 10) {
        c.cook = 0;
        inp.count--;
        if (!inp.count) c.slots[0] = null;
        if (out) out.count++; else c.slots[2] = stack(result, 1);
        c.xp = (c.xp || 0) + smeltXp(result);
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

// Fire burns neighbouring wood, leaves, wool and plants, creeps along slowly, and burns itself out: each
// flame lasts half a minute at most, and a big fire stops spreading until it has died down, so it can be
// put out (punch the flames, or pour water on them)
function tickFires(host) {
  const w = G.world;
  const many = w.fires.size > 40;
  if (host) for (const [key, f] of w.fires) {
    if (f.t === 0) { f.t = G.clock + 1.5 + Math.random() * 1.5; continue; }
    if (G.clock < f.t) continue;
    f.t = G.clock + 1.5 + Math.random() * 1.5;
    const [x, y, z] = key.split(',').map(Number);
    if (!w.getChunk(x >> 4, z >> 4)) continue;
    if (w.getBlock(x, y, z) !== B.fire) { w.fires.delete(key); continue; }
    const below = w.getBlock(x, y - 1, z);
    const fuel = flammableNear(w, x, y, z);
    if (!fuel && !BLOCKS[below].solid) { w.setBlock(x, y, z, 0); w.fires.delete(key); continue; }
    f.age += 1;
    if (below !== B.netherrack && ((!fuel && f.age > 1 + Math.random() * 3) || f.age > 10 + Math.random() * 4)) { w.setBlock(x, y, z, 0); w.fires.delete(key); continue; }
    // burn neighbours
    for (const [dx, dy, dz] of NEIGHBORS6) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const nid = w.getBlock(nx, ny, nz);
      const fl = BLOCKS[nid].flammable;
      if (!fl || Math.random() * 400 > fl) continue;
      if (nid === B.tnt) { Game.removeBlock(nx, ny, nz, false); G.entities.primeTNT(nx, ny, nz); continue; }
      Game.removeBlock(nx, ny, nz, false);
      if (!many && Math.random() < 0.45) Game.ignite(nx, ny, nz);
    }
    // spread to nearby air next to something that burns
    if (!many && fuel) {
      const sx = x + Math.floor(Math.random() * 3) - 1, sy = y + Math.floor(Math.random() * 4) - 1, sz = z + Math.floor(Math.random() * 3) - 1;
      const sid = w.getBlock(sx, sy, sz);
      if ((sid === 0 || (BLOCKS[sid].replaceable && sid !== B.water && sid !== B.lava && sid !== B.fire)) && flammableNear(w, sx, sy, sz) && Math.random() < 0.15) Game.ignite(sx, sy, sz);
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
// Blocks Silk Touch can't bring home whole
const NO_SILK = new Set([B.spawner, B.farmland, B.dirt_path, B.bedrock, B.end_portal_frame, B.end_portal_frame_filled]);
// Experience kept in a furnace for each thing it smelts, handed over when the result is taken out
const SMELT_XP = { iron_ingot: 0.7, gold_ingot: 1, copper_ingot: 0.7, diamond: 1, emerald: 1, coal: 0.1, lapis_lazuli: 0.2, redstone: 0.3, nether_quartz: 0.2, charcoal: 0.15, brick: 0.3, glass: 0.1, stone: 0.1, deepslate: 0.1, terracotta: 0.35, nether_brick: 0.1 };
const smeltXp = (id) => { const it = ITEMS[id]; return it ? SMELT_XP[it.key] ?? (it.food ? 0.35 : 0.1) : 0; };

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
    // a player needs a good enough pickaxe for stone, ores and obsidian to drop anything
    const held = byPlayer && G.player ? G.player.inv.held : null;
    if (drop && (!byPlayer || canHarvest(def, held))) {
      // Silk Touch brings the block itself; Fortune more of what ores (and gravel) give
      const silk = !!ench(held, 'silk_touch') && !def.noItem && !NO_SILK.has(id);
      const fortune = silk ? 0 : ench(held, 'fortune');
      let drops = silk ? [[id, 1]] : def.drops ? def.drops(Math.random) : [[id, 1]];
      if (fortune && def.fortune) {
        const more = Math.max(0, Math.floor(Math.random() * (fortune + 2)) - 1);
        drops = drops.map(([did, n]) => [did, n * (more + 1)]);
      } else if (fortune && id === B.gravel) drops = [[Math.random() < [0.12, 0.14, 0.25, 1][fortune] ? ID.flint : B.gravel, 1]];
      for (const [did, n] of drops) G.entities.dropItem(did, n, x + 0.5, y + 0.3, z + 0.5, (Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2);
      // ores leave experience when they give up their gems
      if (byPlayer && def.xp && !silk) G.entities.spawnXp(x + 0.5, y + 0.4, z + 0.5, def.xp[0] + Math.floor(Math.random() * (def.xp[1] - def.xp[0] + 1)), 0.2);
      if (byPlayer && G.adv) G.adv.mined(id, drops);
    }
    const key = `${x},${y},${z}`;
    const c = w.containers.get(key);
    if (c) {
      // a guest's copy may be out of date, so the host sends the real contents
      if (!isGuest()) for (const s of c.slots) if (s) G.entities.dropStack(s, x + 0.5, y + 0.5, z + 0.5);
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

  // Taking smelted things out of a furnace hands over the experience it has kept (parts of a point by chance)
  furnaceXp(c) {
    const xp = c.xp || 0;
    if (!xp) return;
    c.xp = 0;
    const n = Math.floor(xp) + (Math.random() < xp % 1 ? 1 : 0);
    const p = G.player;
    if (n) G.entities.spawnXp(p.pos.x, p.pos.y + 1, p.pos.z, n, 0);
    if (G.net && G.net.role === 'client') G.net.send({ k: 'fx0', key: `${c.x},${c.y},${c.z}` });   // the host forgets it too
  },

  // Frost Walker boots: still water around your feet freezes for a few seconds
  frostWalk(p, level) {
    const w = G.world, r = 2 + level, by = Math.floor(p.pos.y - 0.1), cx = Math.floor(p.pos.x), cz = Math.floor(p.pos.z);
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz > r * r + 1) continue;
      const x = cx + dx, z = cz + dz;
      if (w.getBlock(x, by, z) !== B.water || w.getMeta(x, by, z) !== 0 || w.getBlock(x, by + 1, z) !== 0) continue;
      this.placeBlock(x, by, z, B.frosted_ice, 0);
      S.frost.set(`${x},${by},${z}`, G.clock + 4 + Math.random() * 4);
    }
  },

  // Fire needs something solid under it or something flammable beside it
  canBurnAt(x, y, z) {
    const w = G.world;
    return BLOCKS[w.getBlock(x, y - 1, z)].solid || flammableNear(w, x, y, z);
  },

  ignite(x, y, z) {
    const w = G.world;
    if (y < 1 || y >= CH - 1) return;
    // fire inside an empty obsidian frame opens a nether portal instead
    const frame = w.dim !== 'end' ? findPortalFrame(w, x, y, z) : null;
    if (frame) {
      for (const [a, b, c] of frame.cells) w.setBlock(a, b, c, B.nether_portal, frame.axis);
      sfx('portal', { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      return;
    }
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

  toggleTrapdoor(x, y, z) {
    const w = G.world;
    const id = w.getBlock(x, y, z);
    if (!BLOCKS[id].trapdoor) return;
    w.setBlock(x, y, z, id, w.getMeta(x, y, z) ^ 4);
    sfx('door', { x, y, z });
  },

  // What is written on a sign (up to four short lines)
  signText(x, y, z) { return G.world.signs.get(`${x},${y},${z}`) || []; },
  setSign(x, y, z, lines, fromNet) {
    const w = G.world;
    if (!BLOCKS[w.getBlock(x, y, z)].sign) return;
    const clean = cleanSign(lines);
    const key = `${x},${y},${z}`;
    if (clean.some(Boolean)) w.signs.set(key, clean); else w.signs.delete(key);
    S.signsDirty = true;
    if (G.net && !fromNet) G.net.signChanged(x, y, z, clean);
  },

  useBed(x, y, z) {
    const p = G.player;
    if (G.dim !== 'overworld') {
      // beds blow up outside the overworld
      this.removeBlock(x, y, z, false);
      explode(x + 0.5, y + 0.5, z + 0.5, 5);
      for (let k = 0; k < 8; k++) {
        const fx = x + Math.floor((Math.random() - 0.5) * 6), fy = y + Math.floor((Math.random() - 0.5) * 2), fz = z + Math.floor((Math.random() - 0.5) * 6);
        if (G.world.getBlock(fx, fy, fz) === 0 && this.canBurnAt(fx, fy, fz)) this.ignite(fx, fy, fz);
      }
      return;
    }
    p.bedSpawn = { x, y, z };
    // (a villager asleep in it gets up and finds another)
    if (isGuest()) G.net.send({ k: 'vw', x, y, z }); else G.entities.wakeVillagerAt(x, y, z);
    if (!isNight()) { G.ui.toast('Respawn point set. You can only sleep at night'); return; }
    if (G.entities.hostilesNear(x + 0.5, y, z + 0.5, 8)) { G.ui.toast('You may not rest now, there are monsters nearby'); return; }
    G.ui.toast('Respawn point set');
    G.adv.did('sleep');
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
      if (loot && type === 'chest') { c.slots = rollLoot(loot, hash3(w.seed, x, y, z) * 4294967296); w.lootChests.delete(key); if (loot === 'bastion') G.adv.did('bastion_loot'); }
      w.containers.set(key, c);
    }
    return c;
  },

  listWorlds() {
    const list = load('worlds', []);
    return Array.isArray(list) ? list.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)) : [];
  },

  createWorld(name, seedText, mode) {
    keepSaves();
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
    keepSaves();
    // you come back in whichever dimension you left in
    const g = loadGlobals(id);
    const dim = (g && g.player && g.player.dim) || 'overworld';
    const data = load('world.' + dimKey(id, dim));
    startWorld({ ...meta, dim }, data, { globals: g });
  },

  // A whole world (every dimension, the player, the time) as one file to keep somewhere safe
  exportWorld(id) {
    const meta = this.listWorlds().find((w) => w.id === id);
    if (!meta) return null;
    const parts = {};
    for (const d of DIMS) { const v = load('world.' + dimKey(id, d)); if (v) parts[d] = v; }
    const g = load('world.' + id + '@g');
    if (g) parts.globals = g;
    return { blockcraft: 'world', version: 1, exported: Date.now(), meta, parts };
  },

  // Adds a world from a backup file as a new world (it never replaces one); returns its meta
  importWorld(file) {
    if (!file || file.blockcraft !== 'world' || !file.meta || !file.parts || typeof file.parts !== 'object') throw new Error('That is not a Blockcraft world backup.');
    const m = file.meta;
    const list = this.listWorlds();
    const id = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const taken = new Set(list.map((w) => w.name));
    let name = String(m.name || 'Imported World').slice(0, 32);
    if (taken.has(name)) { let n = 2; while (taken.has(`${name} (${n})`)) n++; name = `${name} (${n})`; }
    const meta = { id, name, seed: Number(m.seed) >>> 0, mode: m.mode === 'creative' ? 'creative' : 'survival', created: m.created || Date.now(), lastPlayed: Date.now() };
    const written = [];
    const put = (key, v) => { if (!store(key, v)) throw new Error('Not enough room in this browser to add that world.'); written.push(key); };
    try {
      for (const d of DIMS) if (file.parts[d]) put('world.' + dimKey(id, d), file.parts[d]);
      if (file.parts.globals) put('world.' + id + '@g', file.parts.globals);
      list.unshift(meta);
      put('worlds', list);
    } catch (err) {
      for (const k of written) if (k !== 'worlds') remove(k);
      throw err;
    }
    return meta;
  },

  deleteWorld(id) {
    store('worlds', this.listWorlds().filter((w) => w.id !== id));
    for (const d of DIMS) remove('world.' + dimKey(id, d));
    remove('world.' + id + '@g');
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
    // you always come back to life in the overworld
    if (G.dim !== 'overworld') { this.travel('overworld', 'spawn'); return; }
    G.ui.startPlaying();
    if (!G.touchMode) requestLock();
  },

  // ------------------------------------------------------------ dimensions
  // Through a portal ('portal'), into the End ('end'), or back to your bed or the world spawn ('spawn')
  travel(to, how) {
    if (S.travelling || !G.player || !G.worldMeta) return;
    S.travelling = true;
    const p = G.player, meta = G.worldMeta;
    let arrival, pos;
    if (how === 'portal') {
      const f = to === 'nether' ? 1 / 8 : 8;
      arrival = { type: 'portal', x: Math.floor(p.pos.x * f), y: Math.floor(Math.max(to === 'nether' ? 34 : 50, Math.min(CH - 12, p.pos.y))), z: Math.floor(p.pos.z * f) };
      pos = { x: arrival.x + 0.5, y: arrival.y, z: arrival.z + 0.5 };
    } else if (how === 'end') {
      arrival = { type: 'end' };
      pos = { x: END_SPAWN.x + 0.5, y: END_SPAWN.y, z: END_SPAWN.z + 0.5 };
    } else {
      arrival = { type: 'spawn' };
      pos = respawnPoint(p);
    }
    arrival.from = G.dim;   // (where you came from, for the achievements)
    const carry = playerData(p);
    carry.pos = pos;
    carry.dim = to;
    sfx('travel', null, { vol: 0.6 });
    G.ui.showBusy(DIM_TITLE[to]);
    if (meta.online) {
      if (!meta.remote) saveWorld();
      const net = G.net;
      G.net = null;
      if (net) { net.sendMe(carry); net.shutdown(); }
      teardown();
      G.state = 'title';
      exitLock();
      S.carry = { id: meta.online, d: carry };
      S.arrival = arrival;
      Game.joinWorld(meta.online, (t) => G.ui.showBusy(t), to)
        .catch((err) => { S.carry = null; S.arrival = null; G.ui.showTitle(); G.ui.openScreen('mp'); G.ui.mpStatus(err && err.message ? err.message : 'Could not travel there.'); })
        .finally(() => { S.travelling = false; });
      return;
    }
    saveWorld(carry);
    startWorld({ ...meta, dim: to }, load('world.' + dimKey(meta.id, to)), { player: carry, globals: loadGlobals(meta.id), arrival });
    S.travelling = false;
  },

  // Stepping into the exit portal after beating the dragon: the ending, then home
  finishEnd() {
    if (S.travelling || G.screen === 'credits') return;
    exitLock();
    G.ui.showCredits(() => this.travel('overworld', 'spawn'));
  },

  // End gateways jump between the main island and the outer islands
  gateway() {
    const w = G.world, p = G.player;
    if ((S.gatewayCd || 0) > G.clock) return;
    S.gatewayCd = G.clock + 4;
    const outward = Math.hypot(p.pos.x, p.pos.z) < 500;
    const a = Math.atan2(p.pos.z, p.pos.x);
    let tx = Math.round(Math.cos(a) * (outward ? 1010 : 90)), tz = Math.round(Math.sin(a) * (outward ? 1010 : 90)), ty = 70;
    if (outward) {
      for (let d = 1010; d < 1700; d += 8) {
        const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
        const c = endColumn(w, x, z);
        if (c) { tx = x; tz = z; ty = c.top + 1; break; }
      }
    } else {
      const c = endColumn(w, tx, tz);
      if (c) ty = c.top + 1;
    }
    p.pos = { x: tx + 0.5, y: ty, z: tz + 0.5 };
    p.vel = { x: 0, y: 0, z: 0 };
    p.fallDist = 0;
    p.portalCooldown = true;
    sfx('teleport', p.pos);
    S.arrival = { type: 'gateway', x: tx, y: ty, z: tz, outward };
    G.state = 'loading';
    G.ui.showLoading(0);
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
    try { r = await fetch('/api/worlds', { cache: 'no-store', headers: authHeader(G.account) }); } catch { throw new Error('Could not reach the server. Check your connection.'); }
    if (!(r.headers.get('content-type') || '').includes('json')) throw new Error(away);
    const b = await r.json();
    if (!r.ok) throw new Error(b.error || away);
    noteBuild(b.build);
    return b;
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
      const b = await r.json().catch(() => null);
      if (b && b.account && G.account) { G.account.admin = !!b.account.admin; store('account', G.account); }
    } catch { /* offline: keep it */ }
    return G.account;
  },

  // Admins: every account on the server, and doing something about one of them
  async adminPlayers() {
    const r = await fetch('/api/admin/players', { headers: authHeader(G.account), cache: 'no-store' });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error || 'Could not load the players.');
    return b.players || [];
  },
  async adminAction(action, name, reason) {
    const r = await fetch('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader(G.account) }, body: JSON.stringify({ action, name, reason }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error || 'That did not work.');
    return b.msg;
  },

  async createOnline(name, seedText, mode) {
    const r = await fetch('/api/worlds', {
      method: 'POST', headers: { 'content-type': 'application/json', ...authHeader(G.account) },
      body: JSON.stringify({ name, seed: makeSeed(seedText), mode }),
    });
    if (!r.ok) throw new Error('Could not create the world. Check your connection.');
    return r.json();
  },

  // Deletes your own world for everyone; someone else's just leaves your list (resolves { removed: true })
  async deleteOnline(id) {
    const r = await fetch('/api/worlds/' + id, { method: 'DELETE', headers: authHeader(G.account) });
    const b = await r.json().catch(() => ({}));
    // (a world only this browser still had is just forgotten here)
    if (!r.ok && r.status !== 404) throw new Error(b.error || 'Could not delete that world.');
    for (const d of DIMS) remove('online.' + dimKey(id, d));
    remove('online.' + id + '@me');
    return b;
  },

  // Online worlds this browser keeps a copy of (in case the server ever loses one)
  localOnlineWorlds() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const m = (localStorage.key(i) || '').match(/^blockcraft\.online\.([A-Z2-9]{6})$/);
        const b = m && load('online.' + m[1]);
        if (b && b.meta && b.meta.id === m[1]) out.push({ id: b.meta.id, name: b.meta.name, mode: b.meta.mode, seed: b.meta.seed, created: b.meta.created });
      }
    } catch { /* storage unavailable */ }
    return out;
  },

  // Each dimension of an online world runs on its own: the first player in it runs it. Without `dim`
  // the server puts you back wherever you last were.
  async joinWorld(id, onStatus, dim) {
    const acc = G.account;
    // this browser's copies of the world, in case the server has lost them or has older ones
    const haves = {};
    for (const d of DIMS) { const b = load('online.' + dimKey(id, d)); if (b && b.meta) haves[d] = { v: b.v || 0, meta: b.meta }; }
    // and of this player's own items there, in case the server lost them
    const rec = load('online.' + id + '@me');
    const mine = rec && rec.data && String(rec.name).toLowerCase() === String(acc.name).toLowerCase() ? rec.data : null;
    const res = await Net.connect(id, acc, haves, onStatus, dim, mine);
    noteBuild(res.build);
    G.net = res.net;
    const room = DIMS.includes(res.dim) ? res.dim : 'overworld';
    if (res.snap) { startRemoteWorld(res.snap, id, room, res.me); return; }
    const backup = load('online.' + dimKey(id, room));
    let data = null;
    if (res.host.useLocal && backup) data = backup.data;
    else if (res.host.save) { try { data = JSON.parse(res.host.save); } catch { data = null; } }
    const m = res.host.meta;
    S.saveVersion = Math.max(res.host.v || 0, (backup && backup.v) || 0);
    startWorld({ online: id, id: null, dim: room, name: m.name, seed: m.seed, mode: m.mode, created: m.created, me: acc.id, meName: acc.name }, data, { me: res.me });
  },

  // Back into the same online world after the connection dropped or the player running it left
  rejoin(id, wait, msg, sub = '') {
    if (G.worldMeta && G.worldMeta.online && !G.worldMeta.remote) saveWorld();   // keeps a copy in this browser
    const carry = G.player && !G.player.dead ? playerData(G.player) : null;
    const dim = G.dim;
    if (G.net) G.net.shutdown();
    G.net = null;
    teardown();
    G.state = 'title';
    exitLock();
    // keep trying for a few minutes while the server restarts (an update takes about a minute)
    const run = (S.rejoinRun || 0) + 1;
    S.rejoinRun = run;
    const giveUp = (text) => {
      S.rejoinRun = run + 1;
      S.carry = null;
      G.ui.showTitle();
      G.ui.openScreen('mp');
      G.ui.mpStatus(text);
    };
    const cancel = () => giveUp('Stopped reconnecting. Your world is saved; open it again whenever you like.');
    G.ui.showBusy(msg, sub, cancel);
    let tries = 0;
    const attempt = async () => {
      if (S.rejoinRun !== run) return;
      S.carry = carry ? { id, d: carry } : null;
      try { await Game.joinWorld(id, (t) => G.ui.showBusy(t), dim); } catch (err) {
        if (S.rejoinRun !== run) return;
        if (err && err.retry && ++tries < 40) {
          G.ui.showBusy(msg, `Your world is saved. Waiting for the server to come back… (try ${tries + 1})`, cancel);
          setTimeout(attempt, Math.min(1500 + tries * 1000, 8000));
          return;
        }
        giveUp(err && err.message ? err.message : 'Could not get back into the world.');
      }
    };
    setTimeout(attempt, wait);
  },

  // Sent to a guest when they join: everything they need to build the same world
  worldSnapshot(account, name) {
    const w = G.world, p = G.player;
    return {
      k: 'world', host: G.net.name, name: G.worldMeta.name, seed: w.seed, mode: G.worldMeta.mode,
      time: G.time, day: G.day || 0, nns: G.nightsNoSleep || 0,
      spawn: w.worldSpawn || p.spawn, edits: packEdits(w), guest: playerRecord(w.guests, account, name),
      legacy: w.legacy ? [...w.legacy] : null, gens: packGens(w), signs: Object.fromEntries(w.signs),
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

const DIM_TITLE = { nether: 'Entering the Nether', end: 'Entering the End', overworld: 'Returning to the Overworld' };
const dimKey = (id, dim) => (dim && dim !== 'overworld' ? `${id}~${dim}` : id);

// Worlds from before the Caves & Ores update keep their old caves and ores wherever anyone had been: every
// chunk that was ever loaded, everything built or dug and the land around it, the world spawn, beds and
// where the players were. The rest of the world gets the new caves, deepslate and ores.
function legacyChunks(data, g, me, dim = 'overworld') {
  const out = new Set((data.spawned || []).filter(Number.isFinite));
  const add = (cx, cz, r) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) out.add(ckey(cx + dx, cz + dz)); };
  for (const k of Object.keys(data.edits || {})) { const [cx, cz] = k.split(',').map(Number); if (Number.isFinite(cx + cz)) add(cx, cz, 3); }
  for (const k of Object.keys(data.entities || {})) { const n = Number(k); if (Number.isFinite(n)) add(Math.floor(n / 65536) - 32768, (n % 65536) - 32768, 1); }
  const people = [g && g.player, me, ...Object.values(data.guests || {})].filter((q) => q && typeof q === 'object');
  const here = (q) => (q.dim || 'overworld') === dim;
  const spots = dim === 'overworld' ? [g && g.worldSpawn, data.worldSpawn, ...people.map((q) => here(q) && q.pos), ...people.map((q) => q.bed)] : people.map((q) => here(q) && q.pos);
  for (const p of spots) if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) add(Math.floor(p.x) >> 4, Math.floor(p.z) >> 4, 5);
  return out;
}

// Every later update works the same way: a save says which generator version it was last played with
// (gen), and the chunks made by older ones (gens). Opening a save from an older version marks everywhere
// people had been as made by that version, so only land nobody has seen gets what the update adds.
function rememberGens(w, data, g, me) {
  w.gens = new Map();
  for (const [v, list] of Object.entries(data.gens || {})) {
    const n = Number(v);
    if (n >= 2 && n < GEN && Array.isArray(list)) for (const k of list) if (Number.isFinite(k)) w.gens.set(k, n);
  }
  const was = data.gen >= 2 ? data.gen : w.dim === 'overworld' ? 1 : 2;   // (other dimensions' saves had no number before 1.7)
  if (was >= 2 && was < GEN) {
    for (const k of legacyChunks(data, g, me, w.dim)) {
      if (!(w.legacy && w.legacy.has(k)) && !w.gens.has(k)) w.gens.set(k, was);
      if (w.dim !== 'overworld') w.spawned.add(k);   // these dimensions did not keep a list of chunks until now
    }
  }
}

function packGens(w) {
  const out = {};
  for (const [k, v] of w.gens) (out[v] || (out[v] = [])).push(k);
  return out;
}

// Time of day and the player (singleplayer), kept apart from each dimension's blocks
function loadGlobals(id) { return load('world.' + id + '@g') || load('world.' + id); }

// The server says which version of the game it runs. If that changed since this page loaded, the game
// was updated while it was open: worlds are saved, but reloading gets the new version.
function noteBuild(b) {
  if (!b) return;
  if (!S.build) S.build = b;
  else if (S.build !== b) S.outdated = true;
}

// Ask the browser to keep this site's saves even when it is short of space (where browsers allow it)
function keepSaves() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch { /* not supported */ }
}

// Where you come back to life: your bed, or the world spawn (always in the overworld)
function respawnPoint(p) {
  const b = p.bedSpawn;
  return b ? { x: b.x + 0.5, y: b.y + 1, z: b.z + 0.5 } : { ...p.spawn };
}

// After a dimension loads: come out of a portal (found or built), onto the End platform, or through a gateway
function arrive(a) {
  const w = G.world, p = G.player;
  const set = (x, y, z, id, m = 0) => w.setBlock(x, y, z, id, m);
  if (a.type === 'portal') {
    const found = findNearbyPortal(w, a.x, a.y, a.z, G.dim === 'nether' ? 16 : 32);
    const spot = found ? { x: found.x + 0.5, y: found.y, z: found.z + 0.5 } : buildPortal(w, a.x, a.y, a.z, set);
    p.pos = { ...spot };
    p.portalCooldown = true;
  } else if (a.type === 'end') {
    const { x, y, z } = END_SPAWN;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      set(x + dx, y - 1, z + dz, B.obsidian);
      for (let k = 0; k <= 2; k++) set(x + dx, y + k, z + dz, 0);
    }
    p.pos = { x: x + 0.5, y, z: z + 0.5 };
    p.yaw = Math.PI / 2;
  } else if (a.type === 'gateway') {
    if (!w.isSolid(a.x, a.y - 1, a.z)) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) set(a.x + dx, a.y - 1, a.z + dz, B.end_stone);
    // a way back from the outer islands
    if (a.outward && w.getBlock(a.x + 3, a.y + 1, a.z) !== B.end_gateway) {
      set(a.x + 3, a.y, a.z, B.bedrock); set(a.x + 3, a.y + 1, a.z, B.end_gateway); set(a.x + 3, a.y + 2, a.z, B.bedrock);
    }
    p.pos = { x: a.x + 0.5, y: a.y, z: a.z + 0.5 };
  } else return;
  p.vel = { x: 0, y: 0, z: 0 };
  p.fallDist = 0;
}

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
    armor: packSlots(p.armor), off: packSlots(p.off)[0], bed: p.bedSpawn, dim: G.dim || 'overworld',
    // experience (level, points toward the next), what the enchanting table offers, and achievements
    xl: p.xpLevel, xp: p.xp, es: p.enchSeed, adv: [...p.adv], advp: p.advData,
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
  p.off[0] = unpackSlots([d.off || 0], 1)[0];
  p.bedSpawn = d.bed || null;
  p.xpLevel = Math.max(0, d.xl | 0); p.xp = Math.max(0, +d.xp || 0);
  if (Number.isFinite(d.es)) p.enchSeed = d.es >>> 0;
  p.adv = new Set(Array.isArray(d.adv) ? d.adv.filter((k) => typeof k === 'string') : []);
  p.advData = d.advp && typeof d.advp === 'object' ? d.advp : {};
  if (p.health <= 0) { p.health = 20; p.pos = { ...p.spawn }; }
}

// A guest's copy of the world the host is running
function startRemoteWorld(snap, onlineId, dim = 'overworld', me = null) {
  initAudio();
  teardown();
  G.worldMeta = { id: null, remote: true, online: onlineId, dim, name: snap.name, seed: snap.seed, mode: snap.mode === 'creative' ? 'creative' : 'survival' };
  G.dim = dim;
  const w = new World(snap.seed, dim);
  if (Array.isArray(snap.legacy) && snap.legacy.length) w.legacy = new Set(snap.legacy);   // the host's old-cave chunks
  for (const [v, list] of Object.entries(snap.gens || {})) if (Array.isArray(list)) for (const k of list) w.gens.set(k, Number(v));   // and chunks from other older versions
  if (snap.signs && typeof snap.signs === 'object') w.signs = new Map(Object.entries(snap.signs).map(([k, v]) => [k, cleanSign(v)]));
  S.signsDirty = true;
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
  w.worldSpawn = snap.spawn || null;
  const pd = me || snap.guest;
  if (pd) applyPlayerData(p, pd);
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
  stopPanorama();
  clearSignMeshes();
  if (G.world) for (const c of G.world.chunks.values()) disposeChunkMeshes(c);
  if (G.entities) G.entities.clear();
  G.world = null;
  S.urgent.clear();
  S.updates.length = 0;
  S.water.clear();
  S.saplings.clear();
  S.frost.clear();
  G.sleeping = null;
}

function startWorld(meta, data, opts = {}) {
  initAudio();
  teardown();
  const dim = meta.dim || 'overworld';
  G.worldMeta = meta;
  G.dim = dim;
  const w = new World(meta.seed, dim);
  w.onChange = onBlockChange;
  w.villagerTrades = new Map(Object.entries((data && data.villagers) || {}));
  w.deadMobs = new Set((data && data.deadMobs) || []);
  w.guests = (data && data.guests) || {};
  w.stored = new Map(Object.entries((data && data.entities) || {}).map(([k, v]) => [Number(k), v]));
  w.spawned = new Set((data && data.spawned) || []);
  w.flags = (data && data.flags) || {};
  w.signs = new Map(Object.entries((data && data.signs) || {}).map(([k, v]) => [k, cleanSign(v)]));
  S.signsDirty = true;
  if (dim === 'overworld' && data) {
    w.legacy = data.gen >= 2 ? (data.legacy && data.legacy.length ? new Set(data.legacy) : null)
      : legacyChunks(data, opts.globals || data, opts.me || opts.player);
  }
  if (data) rememberGens(w, data, opts.globals || data, opts.me || opts.player);
  G.world = w;
  const p = new Player();
  p.mode = meta.mode;
  G.player = p;
  if (!G.entities) G.entities = new Entities();
  G.clock = 0;
  const g = opts.globals || data;   // time of day, the world spawn and (singleplayer) the player
  if (data) {
    unpackEdits(w, data.edits);
    // (frosted ice that never got to melt, because the game was closed, is water again)
    for (const m of w.edits.values()) for (const [i, v] of m) if ((v & 255) === B.frosted_ice) m.set(i, B.water);
    for (const c of data.containers || []) {
      const [x, y, z] = c.k.split(',').map(Number);
      const n = c.type === 'chest' ? 27 : 3;
      w.containers.set(c.k, { type: c.type, slots: unpackSlots(c.slots, n), burn: c.burn || 0, burnMax: c.burnMax || 0, cook: c.cook || 0, xp: +c.xp || 0, x, y, z });
    }
    for (const k of data.saplings || []) S.saplings.set(k, 30 + Math.random() * 120);
  }
  if (g) {
    G.day = g.day || 0;
    G.nightsNoSleep = g.nightsNoSleep || 0;
    G.time = g.time ?? 0.03;
  } else {
    G.time = 0.03;
    G.day = 0;
    G.nightsNoSleep = 0;
  }
  // where new players appear (always somewhere in the overworld)
  let sp = g && (g.worldSpawn || (g.player && g.player.spawn));
  if (!sp && dim === 'overworld') { const f = w.findSpawn(); sp = { x: f.x, y: f.h + 1, z: f.z }; }
  w.worldSpawn = sp || null;
  // in an online world everyone's inventory is kept under their account
  const pd = opts.player || (meta.online ? opts.me || playerRecord(w.guests, meta.me, meta.meName) : g && g.player);
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
  if (opts.arrival) S.arrival = opts.arrival;
  buildOffsets();
  G.state = 'loading';
  G.ui.showLoading(0);
}

function saveWorld(playerOverride) {
  if (!G.worldMeta || !G.world || !G.player) return;
  // a guest's world belongs to the host, who keeps their inventory too
  if (G.worldMeta.remote) { if (G.net) G.net.saveGuest(); return; }
  const w = G.world, p = G.player;
  G.entities.saveVillagers();
  const edits = packEdits(w);
  const containers = [];
  for (const [k, c] of w.containers) containers.push({ k, type: c.type, slots: packSlots(c.slots), burn: c.burn, burnMax: c.burnMax, cook: c.cook, ...(c.xp ? { xp: Math.round(c.xp * 100) / 100 } : {}) });
  // this dimension's blocks and creatures
  const data = {
    v: 2,
    dim: G.dim,
    guests: w.guests || {},
    entities: G.entities.savedEntities(),
    spawned: [...w.spawned],
    villagers: Object.fromEntries(w.villagerTrades),
    deadMobs: [...w.deadMobs],
    flags: w.flags || {},
    edits, containers, saplings: [...S.saplings.keys()],
    signs: Object.fromEntries(w.signs),
    // made by the Caves & Ores generator, except these chunks (older worlds' places people had been)
    // and by the current generator, except the chunks first seen with an older one
    gen: GEN, legacy: w.legacy ? [...w.legacy] : [], gens: packGens(w),
  };
  // the time of day, the world spawn, and the player
  const globals = {
    time: G.time, day: G.day || 0, nightsNoSleep: G.nightsNoSleep || 0,
    worldSpawn: w.worldSpawn, player: playerOverride || playerData(p), saved: Date.now(),
  };
  const meta = G.worldMeta;
  if (meta.online) {
    // the server keeps online worlds (and each player's own record); this browser keeps a spare copy
    const room = { ...data, time: globals.time, day: globals.day, nightsNoSleep: globals.nightsNoSleep, worldSpawn: globals.worldSpawn };
    S.saveVersion = (S.saveVersion || 0) + 1;
    if (G.net) { G.net.uploadSave(JSON.stringify(room), S.saveVersion); G.net.sendMe(globals.player); }
    store('online.' + dimKey(meta.online, G.dim), { v: S.saveVersion, meta: { id: meta.online, name: meta.name, seed: meta.seed, mode: meta.mode, created: meta.created }, data: room });
    return;
  }
  // singleplayer: each dimension has its own save; the overworld's also holds the globals (older saves read it)
  const ok = store('world.' + dimKey(meta.id, G.dim), G.dim === 'overworld' ? { ...data, ...globals } : data) && store('world.' + meta.id + '@g', globals);
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
  // the title screen and its menus: the turning picture of the latest update behind them
  if (G.state === 'title') { panoramaFrame(dt); return; }
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
      if (S.arrival) { const a = S.arrival; S.arrival = null; arrive(a); if (a.from) G.adv.entered(G.dim, a.from); if (a.type === 'gateway') G.adv.did('gateway'); }
      // an online world is on the server from the moment someone is in it
      if (G.worldMeta && G.worldMeta.online && !G.worldMeta.remote) saveWorld();
      if (S.outdated && !S.toldOutdated) {
        S.toldOutdated = true;
        G.ui.toast('Blockcraft was updated! Your world is saved. Reload the page to get the new version.');
        G.ui.toastTimer = 8;
      }
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
    tickFrost();
    G.adv.tick(dt);
    updateSigns(dt);
  }
  if (G.net) {
    G.net.update(dt);
    if (host) simulateAroundGuests(4);
  }
  updateChunks(paused ? 14 : 7);
  G.player.updateCamera(dt);
  updateSky(G.time, paused ? 0 : dt, G.player.headInWater, G.player.headInLava);
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
  G.adv = new Advancements();
  G.step = frame;
  G.startPanorama = startPanorama;
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
  // which version of the game this page is (to notice later if the server gets updated)
  if (serverURL()) fetch('/api/build', { cache: 'no-store' }).then((r) => r.json()).then((b) => noteBuild(b.build)).catch(() => {});
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
