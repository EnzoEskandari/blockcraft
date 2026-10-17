// Beacons (1.10.5). A beacon stands on a pyramid of iron, gold, diamond, emerald or netherite blocks:
// a three-by-three under it is level 1, a five-by-five under that level 2, then seven-by-seven and
// nine-by-nine for levels 3 and 4. The bigger the pyramid, the further it reaches and the more powers it
// can give. Its powers are chosen on the beacon's own screen (paid for with an ingot or a gem) and kept in
// the block's meta, so they are saved with the world and every player sees the same:
//   bits 0-2  the primary power: 0 one set up before 1.10.5 (Haste and Regeneration, as beacons always gave),
//             1 Speed, 2 Haste (from level 1), 3 Resistance, 4 Jump Boost (level 2), 5 Strength (level 3)
//   bits 3-4  the secondary (level 4): 0 none, 1 Regeneration, 2 the primary power at level II
// Each player works out for themselves which beacons reach them.
import * as THREE from 'three';
import { G } from './game.js';
import { B, ID } from './blocks.js';
import { R } from './render.js';
import { CH } from './constants.js';

export const MINERAL = new Set([B.iron_block, B.gold_block, B.diamond_block, B.emerald_block, B.netherite_block]);
export const RANGE = [0, 32, 48, 64, 96];   // how far a beacon reaches, by the level of its pyramid
export const PAYMENT = new Set([ID.iron_ingot, ID.gold_ingot, ID.emerald, ID.diamond, ID.netherite_ingot]);
export const POWERS = {
  speed: { name: 'Speed', level: 1, icon: 'feather', does: 'Move a fifth faster (two fifths at II)' },
  haste: { name: 'Haste', level: 1, icon: 'golden_pickaxe', does: 'Dig faster' },
  resistance: { name: 'Resistance', level: 2, icon: 'shield', does: 'Take a fifth less harm (two fifths at II)' },
  jump: { name: 'Jump Boost', level: 2, icon: 'slime_ball', does: 'Jump half a block higher (a block at II), and fall further unhurt' },
  strength: { name: 'Strength', level: 3, icon: 'iron_sword', does: 'Hit 3 harder (6 at II)' },
  regen: { name: 'Regeneration', level: 4, icon: 'golden_apple', does: 'Mend a heart every few seconds' },
};
export const PRIMARY = [null, 'speed', 'haste', 'resistance', 'jump', 'strength'];
export const SECONDARY = [null, 'regen', 'twice'];

// What a beacon's meta says: { p, s } (p null for one from before 1.10.5)
export const decode = (meta) => ({ p: PRIMARY[meta & 7] || null, s: SECONDARY[(meta >> 3) & 3] || null });
export const encode = (p, s) => Math.max(0, PRIMARY.indexOf(p)) | (Math.max(0, SECONDARY.indexOf(s)) << 3);

// How many layers of pyramid are under it (0: none, and it is not lit)
export function pyramidLevel(w, x, y, z) {
  let level = 0;
  for (let k = 1; k <= 4; k++) {
    for (let dx = -k; dx <= k; dx++) for (let dz = -k; dz <= k; dz++) if (!MINERAL.has(w.getBlock(x + dx, y - k, z + dz))) return level;
    level = k;
  }
  return level;
}

// The powers a beacon gives at its level: [[effect, level], ...]
export function powersOf(meta, level) {
  if (level < 1) return [];
  const { p, s } = decode(meta);
  if (!p) return [['haste', 1], ['regen', 1]];
  if (POWERS[p].level > level) return [];
  const out = [[p, s === 'twice' && level >= 4 ? 2 : 1]];
  if (s === 'regen' && level >= 4) out.push(['regen', 1]);
  return out;
}

// Each frame: which beacons are lit, what they give you if you are in reach, and their beams
let checkT = 0;
const beams = new Map();   // 'x,y,z' -> mesh
export function tickBeacons(dt) {
  checkT -= dt;
  const w = G.world, p = G.player;
  if (!w || !p || !w.beacons) return;
  const check = checkT <= 0;
  if (check) checkT = 1;
  for (const [key, st] of w.beacons) {
    const [x, y, z] = key.split(',').map(Number);
    if (check) {
      if (!w.getChunk(x >> 4, z >> 4)) { st.on = false; continue; }
      if (w.getBlock(x, y, z) !== B.beacon) { w.beacons.delete(key); continue; }
      st.level = pyramidLevel(w, x, y, z);
      st.on = st.level > 0;
      if (st.on && !p.dead && Math.hypot(p.pos.x - x - 0.5, p.pos.z - z - 0.5) < RANGE[st.level]) {
        // (the power lingers a while after you leave its reach: longer from a bigger pyramid)
        for (const [fx, lv] of powersOf(w.getMeta(x, y, z), st.level)) p.addEffect(fx, 6 + 2 * st.level, lv);
        G.adv.did('beacon');
      }
    }
    if (st.on && Math.hypot(p.pos.x - x, p.pos.z - z) < 160) beamAt(key, x, y, z, st.level);
    // a few sparks still climb the beam
    if (st.on && Math.hypot(p.pos.x - x, p.pos.z - z) < 64 && Math.random() < 0.5) {
      G.entities.particles.spawn(x + 0.5 + (Math.random() - 0.5) * 0.3, y + 1 + Math.random() * 40, z + 0.5 + (Math.random() - 0.5) * 0.3, 0, 5, 0, 0.75, 0.97, 1, 0.16, 1.1, 0);
    }
  }
  // (beams of beacons gone out, gone, or left behind)
  for (const [key, mesh] of beams) {
    const st = w.beacons.get(key), [x, , z] = key.split(',').map(Number);
    if (!st || !st.on || Math.hypot(p.pos.x - x, p.pos.z - z) >= 160) { R.scene.remove(mesh); mesh.children.forEach((c) => c.material.dispose()); beams.delete(key); }
  }
}

// The beam: a bright core and a fainter glow round it, from the beacon to the top of the sky. It turns
// slowly, and is wider the bigger the pyramid.
let beamGeo = null;
function beamAt(key, x, y, z, level) {
  let b = beams.get(key);
  if (!b) {
    if (!beamGeo) beamGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    b = new THREE.Group();
    const core = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
    const glow = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x7fd8ee, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
    b.add(core, glow);
    b.renderOrder = 5;
    R.scene.add(b);
    beams.set(key, b);
  }
  const h = CH + 64 - (y + 1);
  b.position.set(x + 0.5, y + 1, z + 0.5);
  b.children[0].scale.set(0.2, h, 0.2);
  b.children[1].scale.set(0.34 + level * 0.04, h, 0.34 + level * 0.04);
  b.rotation.y = (G.clock || 0) * 0.5;
}

export function clearBeacons() {
  for (const mesh of beams.values()) { R.scene.remove(mesh); mesh.children.forEach((c) => c.material.dispose()); }
  beams.clear();
}
