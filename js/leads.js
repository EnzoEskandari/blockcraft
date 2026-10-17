// Leads (1.10.4): a horse or a donkey on a lead follows whoever holds it, and can be tied to a fence post.
// Where a lead goes is kept in the animal's gear (`gear.lead`), so it is saved with the animal and sent to
// guests with it:
//   'p'        the host's own player (in singleplayer, you)
//   a number   a guest, by their number in the room
//   [x, y, z]  a fence post, with a knot on it
//   'd'        held by a guest when the world was saved: the lead falls off when the animal is next seen
// The host decides everything; guests only draw the rope.
import * as THREE from 'three';
import { G } from './game.js';
import { BLOCKS, ID, RENDER } from './blocks.js';
import { R, tintModel } from './render.js';
import { lightAt } from './entities.js';
import { sfx } from './audio.js';

const SLACK = 3;     // closer than this the lead hangs loose and the animal does as it likes
// (the lead goes tight a little past that and slack again a little inside it, so an animal at the end of
// its lead is not pulled in and let go again every frame: that made it shake)
const TIGHT = SLACK + 0.4, LOOSE = SLACK - 0.6;
const SNAP = 12;     // further than this (it is stuck, or you went through a portal) the lead comes off
const ROPE = 4.2;    // how long the rope is, for how much it sags

export const isFence = (id) => !!BLOCKS[id] && BLOCKS[id].render === RENDER.FENCE;
export const canLead = (m) => !!m && (m.type === 'horse' || m.type === 'donkey') && !!m.gear;
export const validLead = (l) => (l === 'p' || l === 'd' || (Number.isInteger(l) && l > 0) || (Array.isArray(l) && l.length === 3 && l.every(Number.isInteger)) ? l : null);
const sameSpot = (l, x, y, z) => Array.isArray(l) && l[0] === x && l[1] === y && l[2] === z;

// Whoever holds the lead, as this browser sees them (null for a post, or someone no longer here)
function holderOf(l) {
  const net = G.net;
  if (l === 'p') return !net || net.role === 'host' ? G.player : net.players.get(0) || null;
  if (Number.isInteger(l)) return net && l === net.id ? G.player : (net && net.players.get(l)) || null;
  return null;
}
// The lead is held by this browser's player
export const heldByMe = (m) => !!m.gear && m.gear.lead != null && holderOf(m.gear.lead) === G.player;
const whoIs = (who) => (who === 'local' ? 'p' : who);

// The lead falls off where the animal is (as an item someone can pick up)
function dropLead(m, why, at = m.pos) {
  m.gear.lead = null;
  m.vDirty = true;
  G.entities.dropItem(ID.lead, 1, at.x, at.y + (at === m.pos ? m.h * 0.8 : 0.5), at.z, 0, 2, 0);
  if (why === 'snap') sfx('pop', at, { vol: 0.7 });
}

// ---------------------------------------------------------------- following (the host, each frame)
// How an animal on a lead moves, given what it meant to do (mx, mz, speed): null to let it, otherwise where
// to go and how fast instead
export function leadPull(m, dt, mx = 0, mz = 0, speed = 0) {
  const g = m.gear, l = g.lead;
  if (l === 'd') { dropLead(m); return null; }
  let ax, ay, az;
  if (Array.isArray(l)) {
    // (the post was broken, or is no longer a fence; while its chunk is not there yet, it waits)
    if (!G.world.getChunk(l[0] >> 4, l[2] >> 4)) return null;
    if (!isFence(G.world.getBlock(l[0], l[1], l[2]))) { dropLead(m, 'post', { x: l[0] + 0.5, y: l[1], z: l[2] + 0.5 }); return null; }
    ax = l[0] + 0.5; ay = l[1] + 0.5; az = l[2] + 0.5;
  } else {
    const h = holderOf(l);
    if (!h || h.dead || h.gone || (h.pos && h.pos.y < -100)) { dropLead(m); return null; }
    ax = h.pos.x; ay = h.pos.y + 1; az = h.pos.z;
  }
  const dx = ax - m.pos.x, dz = az - m.pos.z, dy = ay - (m.pos.y + m.h * 0.8);
  const flat = Math.hypot(dx, dz);
  if (Math.hypot(flat, dy) > SNAP) { dropLead(m, 'snap'); m.leadTight = false; return null; }
  m.leadTight = flat > (m.leadTight ? LOOSE : TIGHT);
  if (m.leadTight) {
    // (the further it has fallen behind, the faster it comes: it keeps up with a galloping horse)
    return { mx: dx / flat, mz: dz / flat, speed: Math.min(11, Math.max(1.6, (flat - LOOSE) * 2.4)) };
  }
  // slack: it may wander, but not further away once it is near the end of the lead
  if (speed && flat > LOOSE - 0.6 && mx * dx + mz * dz < 0) return { mx: 0, mz: 0, speed: 0 };
  return null;
}

// ---------------------------------------------------------------- using a lead
// On an animal (decided by the host for whoever `who` is): put a lead on it, or take one off.
// Returns null when the lead has nothing to do with it (the animal is then used as usual).
export function decideLead(m, who, item) {
  if (!canLead(m)) return null;
  const g = m.gear, mine = whoIs(who);
  if (g.lead != null && g.lead !== 'd') {
    // (yours, or tied to a post: it comes off and goes back in your hand; someone else's stays)
    if (g.lead !== mine && !Array.isArray(g.lead)) return { did: 'hint', text: 'Someone else is leading it' };
    g.lead = null; m.vDirty = true;
    return { did: 'unlead' };
  }
  if (item !== ID.lead) return null;
  if (m.riderId != null) return { did: 'hint', text: 'Someone is riding it' };
  g.lead = mine; m.persistent = true; m.vDirty = true;
  return { did: 'lead' };
}

// A fence post used: the animals `who` is leading are tied to it, or, if they lead none, the ones tied
// there are taken off it and led away. How many it was, for what the player is told.
export function decideTie(who, x, y, z) {
  if (!isFence(G.world.getBlock(x, y, z))) return 0;
  const mine = whoIs(who);
  const near = G.entities.mobs.filter((m) => canLead(m) && !m.dead && !m.removed && Math.hypot(m.pos.x - x - 0.5, m.pos.z - z - 0.5) < SNAP);
  const led = near.filter((m) => m.gear.lead === mine);
  const list = led.length ? led : near.filter((m) => sameSpot(m.gear.lead, x, y, z));
  for (const m of list) { m.gear.lead = led.length ? [x, y, z] : mine; m.vDirty = true; }
  return led.length ? list.length : -list.length;
}
// What the player does: tie up (or untie) at a fence post. True if anything was there to do.
export function useFence(p, x, y, z) {
  const any = G.entities.mobs.some((m) => canLead(m) && (heldByMe(m) || sameSpot(m.gear.lead, x, y, z)));
  if (!any) return false;
  if (G.net && G.net.role === 'client') G.net.send({ k: 'tie', x, y, z });
  else decideTie('local', x, y, z);
  sfx('saddle', { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, { vol: 0.6 });
  return true;
}
// A fence post with animals tied to it: breaking it lets them go (the leads fall off on the next frame)
export const tiedAt = (x, y, z) => G.entities.mobs.some((m) => canLead(m) && sameSpot(m.gear.lead, x, y, z));

// ---------------------------------------------------------------- drawing the rope
// Each lead is a thin rope of square section, alternately light and dark along its length, hanging between
// the animal's head and the hand of whoever holds it (or a knot on the post), sagging when it is slack.
const SEG = 20, SIDES = 4, THICK = 0.035;
const ropes = new Map();   // animal -> { mesh, pos }
const knots = new Map();   // 'x,y,z' -> mesh
let knotGeo = null, knotMat = null;
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

function makeRope() {
  const n = (SEG + 1) * SIDES;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = [];
  for (let i = 0; i <= SEG; i++) for (let s = 0; s < SIDES; s++) {
    const light = (i & 1) === 0, k = (i * SIDES + s) * 3, side = s & 1 ? 0.82 : 1;
    const c = light ? [0.62, 0.46, 0.27] : [0.44, 0.31, 0.17];
    col[k] = c[0] * side; col[k + 1] = c[1] * side; col[k + 2] = c[2] * side;
  }
  for (let i = 0; i < SEG; i++) for (let s = 0; s < SIDES; s++) {
    const a = i * SIDES + s, b = i * SIDES + ((s + 1) % SIDES), c = a + SIDES, d = b + SIDES;
    idx.push(a, c, b, b, c, d);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  R.scene.add(mesh);
  return { mesh, pos };
}

// Where the rope is held: the hand of a player's body, or, seen through your own eyes, low and to the right
function handOf(h) {
  if (h === G.player) {
    const p = G.player;
    if ((G.settings.view || 'first') === 'first' || !p.body || !p.body.model) {
      const cam = R.camera;
      v1.set(0.34, -0.42, -0.55).applyQuaternion(cam.quaternion).add(cam.position);
      return v1;
    }
    return p.body.model.parts.arm0.localToWorld(v1.set(0, -10, 0));
  }
  const parts = h.model && h.model.parts;
  if (parts && parts.arm0) return parts.arm0.localToWorld(v1.set(0, -10, 0));
  return v1.set(h.pos.x, h.pos.y + 1, h.pos.z);
}

function knotAt(l) {
  const key = l.join(',');
  let k = knots.get(key);
  if (!k) {
    if (!knotGeo) {
      // (rope wound round the post: brown, the top lit and the sides in shade, a darker band round the middle)
      knotGeo = new THREE.BoxGeometry(5 / 16, 6 / 16, 5 / 16, 1, 3, 1);
      const n = knotGeo.attributes.position.count, col = new Float32Array(n * 3), nor = knotGeo.attributes.normal, pos = knotGeo.attributes.position;
      for (let i = 0; i < n; i++) {
        const k = nor.getY(i) > 0.5 ? 1 : nor.getY(i) < -0.5 ? 0.55 : Math.abs(nor.getX(i)) > 0.5 ? 0.7 : 0.82;
        const band = Math.abs(pos.getY(i)) < 0.07 ? 0.8 : 1;
        col[i * 3] = 0.6 * k * band; col[i * 3 + 1] = 0.44 * k * band; col[i * 3 + 2] = 0.26 * k * band;
      }
      knotGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      knotMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    }
    k = new THREE.Mesh(knotGeo, knotMat.clone());
    k.position.set(l[0] + 0.5, l[1] + 0.62, l[2] + 0.5);
    R.scene.add(k);
    knots.set(key, k);
  }
  k.userData.used = true;
  return k;
}

export function drawLeads() {
  for (const k of knots.values()) k.userData.used = false;
  const seen = new Set();
  for (const m of (G.entities && G.entities.mobs) || []) {
    const l = m.gear && m.gear.lead;
    if (l == null || l === 'd' || m.removed || m.dead || !m.model) continue;
    let b;
    if (Array.isArray(l)) b = knotAt(l).position;
    else { const h = holderOf(l); if (!h) continue; b = handOf(h); }
    const head = m.model.parts.head || m.model.parts.body;
    if (!head) continue;
    head.updateWorldMatrix(true, false);
    const a = head.localToWorld(v2.set(0, -1.5, 3));   // (the halter, round the muzzle)
    let r = ropes.get(m);
    if (!r) { r = makeRope(); ropes.set(m, r); }
    seen.add(m);
    shapeRope(r, a, b);
    tintModel(r.mesh, lightAt((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2));
  }
  for (const [m, r] of ropes) if (!seen.has(m)) { R.scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); ropes.delete(m); }
  for (const [key, k] of knots) {
    if (k.userData.used) tintModel(k, lightAt(k.position.x, k.position.y, k.position.z));
    else { R.scene.remove(k); k.material.dispose(); knots.delete(key); }
  }
}

const dir = new THREE.Vector3(), side1 = new THREE.Vector3(), side2 = new THREE.Vector3(), pt = new THREE.Vector3();
function shapeRope(r, a, b) {
  const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
  const d = Math.hypot(bx - ax, by - ay, bz - az);
  // (a parabola as long as the rope: the shorter the gap, the deeper it hangs)
  const sag = d < ROPE ? Math.min(1, 0.7 * Math.sqrt((3 * d * (ROPE - d)) / 8)) : 0.03 * d;
  dir.set(bx - ax, by - ay, bz - az).normalize();
  side1.crossVectors(dir, up);
  if (side1.lengthSq() < 1e-6) side1.set(1, 0, 0);
  side1.normalize();
  side2.crossVectors(dir, side1).normalize();
  const p = r.pos;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    pt.set(ax + (bx - ax) * t, ay + (by - ay) * t - 4 * sag * t * (1 - t), az + (bz - az) * t);
    for (let s = 0; s < SIDES; s++) {
      const ang = (s / SIDES) * Math.PI * 2 + Math.PI / 4, c = Math.cos(ang) * THICK, sn = Math.sin(ang) * THICK;
      const k = (i * SIDES + s) * 3;
      p[k] = pt.x + side1.x * c + side2.x * sn; p[k + 1] = pt.y + side1.y * c + side2.y * sn; p[k + 2] = pt.z + side1.z * c + side2.z * sn;
    }
  }
  r.mesh.geometry.attributes.position.needsUpdate = true;
}

// (when a world is left: no ropes or knots stay behind in the scene)
export function clearLeads() {
  for (const r of ropes.values()) { R.scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); }
  for (const k of knots.values()) { R.scene.remove(k); k.material.dispose(); }
  ropes.clear(); knots.clear();
}
