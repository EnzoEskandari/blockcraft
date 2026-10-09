// Your own body, for the views from outside (second and third person): built like any other player's
// and moved the same way.
import { G } from './game.js';
import { R, tintModel } from './render.js';
import { buildModel, holdInHand, lightAt } from './entities.js';
import { mySkin } from './skins.js';

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
    root.position.set(p.pos.x, p.pos.y + (asleep ? 0.3 : 0), p.pos.z);
    root.rotation.set(asleep ? -Math.PI / 2 : 0, p.yaw + Math.PI, p.dead ? Math.min(1, this.deathT * 3) * Math.PI / 2 : 0);
    P.leg0.rotation.x = sw; P.leg1.rotation.x = -sw;
    const held = p.inv.held ? p.inv.held.id : 0, off = p.off[0] ? p.off[0].id : 0, shield = p.shieldHand || 0;
    P.arm1.rotation.x = shield === 2 ? -0.75 : -sw * 0.8 - (off ? 0.3 : 0);
    // the right arm swings when you hit, and holds what you hold
    const s = R.swing > 0 ? 1 - R.swing : 1;
    P.arm0.rotation.x = s < 1 ? -Math.sin(s * Math.PI) * 1.7 - 0.3 : shield === 1 ? -0.75 : sw * 0.8 - (held ? 0.3 : 0);
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
