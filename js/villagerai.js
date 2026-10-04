// What villagers do with their day: one without work looks for a free job block and takes up its trade,
// those with one visit it now and then, and at sunset everyone walks home to a bed (opening and shutting
// doors on the way) and sleeps until morning. Only the game that runs the world decides this; guests see it.
import { G } from './game.js';
import { BLOCKS, B } from './blocks.js';
import { sfx } from './audio.js';

const rand = Math.random;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const key3 = (x, y, z) => `${x},${y},${z}`;

// Bedtime runs from sunset to sunrise (0 is sunrise, 0.5 sunset)
export const bedtime = () => G.dim === 'overworld' && G.time >= 0.5;

// ---------------------------------------------------------------- finding a way
// Can a villager's body be in this cell? (it opens doors, so those count as open)
function passable(w, x, y, z) {
  const id = w.getBlock(x, y, z);
  if (id === 0) return true;
  const b = BLOCKS[id];
  if (b.door) return true;
  if (id === B.water || id === B.lava || id === B.fire || id === B.cactus || id === B.cobweb) return false;
  return !w.isSolid(x, y, z);
}
// Can it stand with its feet in this cell?
function standable(w, x, y, z) {
  if (!passable(w, x, y, z) || !passable(w, x, y + 1, z)) return false;
  const below = w.getBlock(x, y - 1, z);
  if (below === B.cactus || below === B.magma_block || BLOCKS[below].door) return false;
  return w.isSolid(x, y - 1, z);
}

// A* over the cells a villager can stand in: steps to the side, up one block, or down as many as three.
// Returns the cells to walk through (the start left out), or null if no way was found within `limit` cells.
export function findPath(w, sx, sy, sz, isGoal, gx, gy, gz, limit = 1500) {
  // (start from where it really stands: up or down a block if it is on a slab or in mid-step)
  if (!standable(w, sx, sy, sz)) { if (standable(w, sx, sy + 1, sz)) sy++; else if (standable(w, sx, sy - 1, sz)) sy--; else return null; }
  // (leaning on the distance still to go keeps the search short; the way found is good enough for a walk home)
  const h = (x, y, z) => (Math.abs(x - gx) + Math.abs(y - gy) + Math.abs(z - gz)) * 1.5;
  const open = [{ x: sx, y: sy, z: sz, g: 0, f: h(sx, sy, sz), from: null }];
  const best = new Map([[key3(sx, sy, sz), 0]]);
  let n = 0;
  while (open.length && n++ < limit) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (isGoal(cur.x, cur.y, cur.z)) {
      const path = [];
      for (let c = cur; c.from; c = c.from) path.push([c.x, c.y, c.z]);
      return path.reverse();
    }
    for (const [dx, dz] of DIRS) {
      const nx = cur.x + dx, nz = cur.z + dz;
      let ny = null, cost = 1;
      if (standable(w, nx, cur.y, nz)) ny = cur.y;
      else if (standable(w, nx, cur.y + 1, nz) && passable(w, cur.x, cur.y + 2, cur.z)) { ny = cur.y + 1; cost = 2; }
      else if (passable(w, nx, cur.y, nz) && passable(w, nx, cur.y + 1, nz)) {
        for (let d = 1; d <= 3; d++) {
          if (standable(w, nx, cur.y - d, nz)) { ny = cur.y - d; cost = 1 + d; break; }
          if (!passable(w, nx, cur.y - d, nz)) break;
        }
      }
      if (ny === null) continue;
      const g = cur.g + cost, k = key3(nx, ny, nz);
      if (best.has(k) && best.get(k) <= g) continue;
      best.set(k, g);
      open.push({ x: nx, y: ny, z: nz, g, f: g + h(nx, ny, nz), from: cur });
    }
  }
  return null;
}

// ---------------------------------------------------------------- beds and job blocks
const sameSpot = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const taken = (m, what, spot) => G.entities.mobs.some((o) => o !== m && o.def.villager && !o.dead && sameSpot(o[what], spot));

// The nearest block of a kind that no other villager has claimed, within `r` blocks of (cx, cy, cz)
function nearest(m, what, test, cx, cy, cz, r, up = 5) {
  const w = G.world;
  let bestSpot = null, bd = Infinity;
  for (let y = cy - up; y <= cy + up; y++) for (let x = cx - r; x <= cx + r; x++) for (let z = cz - r; z <= cz + r; z++) {
    const id = w.getBlock(x, y, z);
    if (!id || !test(id)) continue;
    const d = Math.abs(x - m.pos.x) + Math.abs(z - m.pos.z) + Math.abs(y - m.pos.y) * 2;
    if (d < bd && !taken(m, what, [x, y, z])) { bd = d; bestSpot = [x, y, z]; }
  }
  return bestSpot;
}

// ---------------------------------------------------------------- the villager's own state
const state = (m) => m.v || (m.v = { think: rand() * 2, goal: null, path: null, i: 0, stuck: 0, lastD: 0, noBed: 0, noJob: 0, work: 20 + rand() * 60 });

function setGoal(m, kind, spot) {
  const v = state(m);
  if (v.goal && v.goal.kind === kind && sameSpot(v.goal.spot, spot)) return;
  v.goal = { kind, spot };
  v.path = null;
}

// Decide what to head for (a couple of times a second at most: looking for blocks is the costly part)
function think(m) {
  const v = state(m), w = G.world;
  const hx = Math.floor(m.home.x), hy = Math.floor(m.home.y), hz = Math.floor(m.home.z);
  // a job block that is gone: one who never traded forgets the trade, the others keep it
  if (m.job && !BLOCKS[w.getBlock(m.job[0], m.job[1], m.job[2])].job && w.getChunk(m.job[0] >> 4, m.job[2] >> 4)) {
    m.job = null;
    if (!m.vx && m.prof !== 'nitwit') m.setProf('nitwit');
    m.villagerChanged();
  }
  if (m.bed && !BLOCKS[w.getBlock(m.bed[0], m.bed[1], m.bed[2])].bed && w.getChunk(m.bed[0] >> 4, m.bed[2] >> 4)) m.bed = null;

  if (bedtime()) {
    if (!m.bed && G.clock > v.noBed) {
      m.bed = nearest(m, 'bed', (id) => id === B.bed_head, hx, hy, hz, 28, 7);
      if (!m.bed) v.noBed = G.clock + 20;   // none free: look again in a while
    }
    setGoal(m, m.bed ? 'bed' : 'home', m.bed || [hx, hy, hz]);
    return;
  }
  if (m.prof === 'nitwit') {
    // out of work: head for the nearest free job block
    if (!m.job && G.clock > v.noJob) {
      m.job = nearest(m, 'job', (id) => !!BLOCKS[id].job, Math.floor(m.pos.x), Math.floor(m.pos.y), Math.floor(m.pos.z), 16, 4);
      if (!m.job) v.noJob = G.clock + 6;
    }
    if (m.job) { setGoal(m, 'job', m.job); return; }
  } else if (!m.job) {
    // (one with a trade settles on a free block of its own kind when there is one close to home)
    if (G.clock > v.noJob) {
      v.noJob = G.clock + 25 + rand() * 10;
      m.job = nearest(m, 'job', (id) => BLOCKS[id].job === m.prof, hx, hy, hz, 12, 3);
      if (m.job) m.villagerChanged();
    }
  } else if (G.time > 0.06 && G.time < 0.42) {
    // at work now and then through the day
    if (v.goal && v.goal.kind === 'work') return;
    if (G.clock > v.work) { v.work = G.clock + 50 + rand() * 80; setGoal(m, 'work', m.job); return; }
  }
  if (v.goal && v.goal.kind !== 'work') v.goal = null;
}

// Doors villagers have opened are shut again once nobody stands in the doorway (even if the one who opened
// it ran off or went to sleep): "x,y,z" of the lower half -> true
const opened = new Map();
let tendT = 0;
function tendDoors() {
  if (G.clock < tendT && G.clock > tendT - 2) return;
  tendT = G.clock + 0.4;
  const w = G.world;
  for (const k of opened.keys()) {
    const [x, y, z] = k.split(',').map(Number);
    if (!BLOCKS[w.getBlock(x, y, z)].door || !(w.getMeta(x, y, z) & 4)) { opened.delete(k); continue; }
    const near = G.entities.mobs.some((o) => o.def.villager && !o.dead && !o.sleeping && Math.abs(o.pos.x - x - 0.5) < 1.1 && Math.abs(o.pos.z - z - 0.5) < 1.1 && Math.abs(o.pos.y - y) < 2);
    if (!near) { G.game.toggleDoor(x, y, z); opened.delete(k); }
  }
}
function openDoor(m, x, y, z) {
  const w = G.world;
  for (const yy of [y, y + 1]) {
    const id = w.getBlock(x, yy, z);
    if (BLOCKS[id].door && !(w.getMeta(x, yy, z) & 4)) {
      G.game.toggleDoor(x, yy, z);
      opened.set(key3(x, id === B.oak_door_top ? yy - 1 : yy, z), true);
      return;
    }
  }
}

// Where the villager wants to walk this frame: { mx, mz, speed }, or null to wander as usual
export function villagerPlan(m, dt) {
  const v = state(m), w = G.world;
  v.think -= dt;
  if (v.think <= 0) { v.think = 0.8 + rand() * 0.6; think(m); }
  if (opened.size) tendDoors();
  const goal = v.goal;
  if (!goal) return null;
  const [gx, gy, gz] = goal.spot;
  const reach = goal.kind === 'home' ? 1.2 : goal.kind === 'bed' ? 1.6 : 2.2;
  const d = Math.hypot(m.pos.x - gx - 0.5, m.pos.z - gz - 0.5);
  if (d < reach && Math.abs(m.pos.y - gy) < 1.6) return arrive(m, goal);
  // work out (or rework) the way there
  if (!v.path) {
    if (G.clock < (v.retry || 0)) return goal.kind === 'work' ? null : { mx: 0, mz: 0, speed: 0 };
    const near = goal.kind === 'home' ? 0 : 1;
    v.path = findPath(w, Math.floor(m.pos.x), Math.floor(m.pos.y + 0.01), Math.floor(m.pos.z),
      (x, y, z) => Math.abs(x - gx) <= near && Math.abs(z - gz) <= near && Math.abs(y - gy) <= 1 && !(near && x === gx && z === gz && goal.kind !== 'bed'), gx, gy, gz);
    v.i = 0; v.stuck = 0; v.lastD = Infinity;
    if (!v.path) {
      // no way there: forget this bed or job block for now and try another later
      v.retry = G.clock + 5 + rand() * 5;
      if (goal.kind === 'bed') { m.bed = null; v.noBed = G.clock + 15; }
      if (goal.kind === 'job') { m.job = null; v.noJob = G.clock + 10; }
      if (goal.kind === 'work') { v.goal = null; return null; }
      return { mx: 0, mz: 0, speed: 0 };
    }
    if (!v.path.length) return arrive(m, goal);
  }
  let p = v.path[v.i];
  if (!p) { v.path = null; return { mx: 0, mz: 0, speed: 0 }; }
  let dx = p[0] + 0.5 - m.pos.x, dz = p[2] + 0.5 - m.pos.z, dd = Math.hypot(dx, dz);
  if (dd < 0.3 && Math.abs(m.pos.y - p[1]) < 1.3) {
    v.i++; v.stuck = 0; v.lastD = Infinity;
    p = v.path[v.i];
    if (!p) { v.path = null; return arrive(m, goal); }
    dx = p[0] + 0.5 - m.pos.x; dz = p[2] + 0.5 - m.pos.z; dd = Math.hypot(dx, dz);
  }
  // knocked or frightened off the way: work it out again from here
  if (dd > 1.9 || Math.abs(m.pos.y - p[1]) > 2.5) { v.path = null; return { mx: 0, mz: 0, speed: 0 }; }
  openDoor(m, p[0], p[1], p[2]);
  // making no headway for a few seconds: think again
  if (dd < v.lastD - 0.02) { v.lastD = dd; v.stuck = 0; } else { v.stuck += dt; if (v.stuck > 3) { v.path = null; v.retry = G.clock + 1; } }
  // (it only jumps where the way goes up a block)
  return { mx: dx / (dd || 1), mz: dz / (dd || 1), speed: m.def.speed * (goal.kind === 'work' ? 0.7 : 1), jump: p[1] > m.pos.y + 0.4 };
}

function arrive(m, goal) {
  const v = state(m);
  v.path = null;
  if (goal.kind === 'bed') { sleep(m); return { mx: 0, mz: 0, speed: 0 }; }
  if (goal.kind === 'job') {
    // takes up the trade of the block it found
    const b = BLOCKS[G.world.getBlock(m.job[0], m.job[1], m.job[2])];
    if (b.job) {
      m.setProf(b.job);
      sfx('villager', m.pos, { pitch: 1.3 });
      for (let i = 0; i < 14; i++) G.entities.particles.spawn(m.pos.x + (rand() - 0.5) * 0.8, m.pos.y + 1 + rand(), m.pos.z + (rand() - 0.5) * 0.8, 0, 0.6 + rand(), 0, 0.3, 0.9, 0.3, 0.08, 0.9, -0.1);
    } else m.job = null;
    v.goal = null;
    return { mx: 0, mz: 0, speed: 0 };
  }
  if (goal.kind === 'work') { v.goal = null; m.ai.t = 3 + rand() * 4; m.ai.walk = false; return { mx: 0, mz: 0, speed: 0 }; }
  return { mx: 0, mz: 0, speed: 0 };   // home: stay put for the night
}

// ---------------------------------------------------------------- sleeping
function sleep(m) {
  const w = G.world, [bx, by, bz] = m.bed;
  // lying along the bed, head on the pillow: the foot of the bed is the next block over
  const foot = DIRS.find(([dx, dz]) => w.getBlock(bx + dx, by, bz + dz) === B.bed_foot) || [0, 1];
  m.sleeping = true;
  m.yaw = m.sleepYaw = Math.atan2(foot[0], foot[1]);   // (its feet point this way; see Mob.animate)
  m.sleepAt = [bx + 0.5 + foot[0] * 0.5, by + 0.5625, bz + 0.5 + foot[1] * 0.5];
  [m.pos.x, m.pos.y, m.pos.z] = m.sleepAt;
  m.vel.x = m.vel.y = m.vel.z = 0;
  const v = state(m);
  v.goal = null; v.path = null;
}

export function wake(m) {
  if (!m.sleeping) return;
  m.sleeping = false;
  // stand up beside the bed
  const w = G.world, x = Math.floor(m.pos.x), y = Math.floor(m.pos.y), z = Math.floor(m.pos.z);
  for (const [dx, dz] of [[0, 0], ...DIRS, [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    for (const dy of [0, 1, -1]) {
      if (standable(w, x + dx, y + dy, z + dz) && !BLOCKS[w.getBlock(x + dx, y + dy, z + dz)].bed) { m.pos.x = x + dx + 0.5; m.pos.y = y + dy; m.pos.z = z + dz + 0.5; return; }
    }
  }
  m.pos.y = y + 0.6;
}

// One frame of a sleeping villager: it stays in bed until morning (or until it is hurt, or the bed is gone)
export function villagerSleep(m) {
  const w = G.world;
  const gone = !m.bed || !BLOCKS[w.getBlock(m.bed[0], m.bed[1], m.bed[2])].bed;
  if (!bedtime() || gone) { if (gone) m.bed = null; wake(m); return; }
  m.vel.x = m.vel.y = m.vel.z = 0;
  m.yaw = m.sleepYaw;
  if (m.sleepAt) [m.pos.x, m.pos.y, m.pos.z] = m.sleepAt;
}
