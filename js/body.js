// Your own body, for the views from outside (second and third person): built like any other player's
// and moved the same way.
import { G } from './game.js';
import { R, tintModel } from './render.js';
import { buildModel, holdInHand, lightAt } from './entities.js';
import { mySkin } from './skins.js';

// Where a player's body stands and how it leans: upright, lying asleep, fallen, sitting on a mount (its
// seat this far up) or stretched out swimming
export function poseBody(m, dt, o) {
  const root = m.root;
  root.rotation.order = 'YXZ';
  const lean = o.asleep ? -Math.PI / 2 : o.swim ? 1.3 : 0;
  m.lean = (m.lean ?? lean) + (lean - (m.lean ?? lean)) * (o.asleep ? 1 : Math.min(1, dt * 8));
  root.position.set(o.x, o.y + (o.asleep ? 0.3 : o.seat ? o.seat - 0.62 : m.lean > 0.05 ? 0.55 * (m.lean / 1.3) : 0), o.z);
  root.rotation.set(m.lean, o.yaw + Math.PI, o.fall * Math.PI / 2);
}

export class Body {
  constructor() {
    this.model = null;
    this.key = '';
    this.phase = 0;
    this.last = null;
    this.deathT = 0;
    this.held = 0; this.heldMesh = null;
    this.off = 0; this.offMesh = null;
  }

  // (built again when what you wear changes: your look, or your armour)
  build(key) {
    this.dispose();
    this.key = key;
    this.model = buildModel('player', key);
    this.model.root.rotation.order = 'YXZ';   // (turned to face first, then leant: for swimming and lying down)
    R.scene.add(this.model.root);
  }

  hold(left, id) {
    const was = left ? this.offMesh : this.heldMesh;
    if (was) { was.parent.remove(was); was.material.dispose(); }
    let mesh = null;
    if (id) { try { mesh = holdInHand(this.model, id, 10, left); } catch { /* not something that can be drawn */ } }
    if (left) { this.offMesh = mesh; this.off = id; } else { this.heldMesh = mesh; this.held = id; }
  }

  update(dt, p, show) {
    if (!show) { if (this.model) this.model.root.visible = false; this.last = null; return; }
    const worn = p.armor.some((a) => a) ? p.armor.map((a) => (a ? a.id : 0)).join(',') : '';
    const key = worn ? `${mySkin()}|${worn}` : mySkin();
    if (key !== this.key || !this.model) this.build(key);
    const m = this.model, root = m.root, P = m.parts;
    root.visible = true;
    // how fast you are going, for the swing of your arms and legs
    const hs = this.last && dt > 0 ? Math.min(8, Math.hypot(p.pos.x - this.last.x, p.pos.z - this.last.z) / dt) : 0;
    this.last = { x: p.pos.x, z: p.pos.z };
    this.phase += hs * dt * 4;
    const sw = Math.sin(this.phase) * Math.min(1, hs / 2) * 0.9;
    const asleep = !!G.sleeping;
    this.deathT = p.dead ? this.deathT + dt : 0;
    poseBody(m, dt, { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, asleep, fall: p.dead ? Math.min(1, this.deathT * 3) : 0, seat: p.riding ? p.riding.def.seat : 0, swim: p.swimming, phase: this.phase });
    const swim = p.swimming ? Math.sin(this.phase * 0.9 + G.clock * 5) : 0;
    P.leg0.rotation.x = p.riding ? -1.4 : p.swimming ? swim * 0.5 : sw; P.leg1.rotation.x = p.riding ? -1.4 : p.swimming ? -swim * 0.5 : -sw;
    const held = p.inv.held ? p.inv.held.id : 0, off = p.off[0] ? p.off[0].id : 0, shield = p.shieldHand || 0;
    P.arm1.rotation.x = p.swimming ? -2.6 + swim * 0.9 : shield === 2 ? -0.75 : -sw * 0.8 - (off ? 0.3 : 0);
    // the right arm swings when you hit, and holds what you hold
    const s = R.swing > 0 ? 1 - R.swing : 1;
    P.arm0.rotation.x = s < 1 ? -Math.sin(s * Math.PI) * 1.7 - 0.3 : p.swimming ? -2.6 - swim * 0.9 : shield === 1 ? -0.75 : sw * 0.8 - (held ? 0.3 : 0);
    P.body.rotation.x = p.sneaking ? 0.45 : 0;
    m.inner.position.y = p.sneaking ? -0.15 : 0;
    P.head.rotation.x = Math.max(-1.4, Math.min(1.4, -p.pitch));
    if (held !== this.held) this.hold(false, held);
    if (off !== this.off) this.hold(true, off);
    tintModel(root, lightAt(p.pos.x, p.pos.y + 1.2, p.pos.z), p.hurtTime > 0 ? 0.6 : 0);
  }

  dispose() {
    for (const mesh of [this.heldMesh, this.offMesh]) if (mesh) { mesh.parent.remove(mesh); mesh.material.dispose(); }
    this.heldMesh = this.offMesh = null;
    this.held = this.off = 0;
    if (this.model) { R.scene.remove(this.model.root); this.model.mat.dispose(); this.model = null; }
    this.key = '';
  }
}
