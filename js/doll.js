// Your character in the inventory (1.10.4), as in Minecraft: drawn in 3D beside the armour slots, wearing
// what you wear and holding what you hold, and turning to look at the pointer. It is drawn off screen by
// the game's own renderer and copied into a small canvas in the panel, only while the inventory is open.
import * as THREE from 'three';
import { G } from './game.js';
import { R, tintModel } from './render.js';
import { buildModel, holdInHand } from './entities.js';
import { mySkin } from './skins.js';

let pointer = { x: 0, y: 0 };
addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });

export class InventoryDoll {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    this.key = '';
    this.model = null;
    this.held = -1; this.off = -1;
    this.rt = null;
    this.t = 0;
  }

  build(key) {
    if (this.model) { this.scene.remove(this.model.root); this.model.mat.dispose(); }
    this.model = buildModel('player', key);
    this.model.root.rotation.order = 'YXZ';
    this.scene.add(this.model.root);
    this.key = key;
    this.held = this.off = -1;
  }

  update(dt) {
    const p = G.player, c = this.canvas;
    if (!p || !R.renderer) return;
    // (thirty pictures a second is plenty for it, and reading one back from the graphics card costs a little)
    this.t += dt;
    this.wait = (this.wait || 0) - dt;
    if (this.wait > 0 && this.model) return;
    this.wait = 1 / 30;
    // (sized to the box it sits in, in real pixels)
    const box = c.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) return;
    const k = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(box.width * k), H = Math.round(box.height * k);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; this.img = null; }
    if (!this.rt || this.rt.width !== W || this.rt.height !== H) {
      if (this.rt) this.rt.dispose();
      this.rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
      this.px = new Uint8Array(W * H * 4);
    }
    const worn = p.armor.some((a) => a) ? p.armor.map((a) => (a ? a.id : 0)).join(',') : '';
    const key = worn ? `${mySkin()}|${worn}` : mySkin();
    if (key !== this.key || !this.model) this.build(key);
    const m = this.model, P = m.parts;
    const held = p.inv.held ? p.inv.held.id : 0, off = p.off[0] ? p.off[0].id : 0;
    for (const [left, id] of [[false, held], [true, off]]) {
      if ((left ? this.off : this.held) === id) continue;
      const was = left ? this.offMesh : this.heldMesh;
      if (was) { was.parent.remove(was); was.material.dispose(); }
      let mesh = null;
      if (id) { try { mesh = holdInHand(m, id, 10, left); } catch { /* not something that can be drawn */ } }
      if (left) { this.offMesh = mesh; this.off = id; } else { this.heldMesh = mesh; this.held = id; }
    }
    // turned towards the pointer: the body a little, the head more
    const lx = Math.max(-1, Math.min(1, (pointer.x - (box.left + box.width / 2)) / 260));
    const ly = Math.max(-1, Math.min(1, (pointer.y - (box.top + box.height * 0.2)) / 260));
    m.root.position.set(0, 0, 0);
    m.root.rotation.set(0, Math.PI + lx * 0.45, 0);
    P.head.rotation.set(ly * 0.5, lx * 0.5, 0);
    P.arm0.rotation.x = (held ? -0.3 : 0) + Math.sin(this.t * 1.2) * 0.04;
    P.arm1.rotation.x = (off ? -0.3 : 0) - Math.sin(this.t * 1.2) * 0.04;
    P.arm0.rotation.z = 0.06; P.arm1.rotation.z = -0.06;
    P.leg0.rotation.x = P.leg1.rotation.x = 0;
    P.body.rotation.x = 0;
    tintModel(m.root, 1);
    // (a little over two blocks high fits the whole of you, hat and all)
    const half = 1.2, aspect = W / H;
    Object.assign(this.cam, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
    this.cam.position.set(0, 1.02, -6);
    this.cam.lookAt(0, 1.02, 0);
    this.cam.updateProjectionMatrix();
    const r = R.renderer;
    const was = r.getRenderTarget(), clear = r.getClearColor(new THREE.Color()), alpha = r.getClearAlpha();
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(this.scene, this.cam);
    r.readRenderTargetPixels(this.rt, 0, 0, W, H, this.px);
    r.setRenderTarget(was);
    r.setClearColor(clear, alpha);
    // (the picture comes back upside down)
    if (!this.img) this.img = this.g.createImageData(W, H);
    const d = this.img.data, row = W * 4;
    for (let y = 0; y < H; y++) d.set(this.px.subarray((H - 1 - y) * row, (H - y) * row), y * row);
    this.g.putImageData(this.img, 0, 0);
  }

  dispose() {
    if (this.model) { this.scene.remove(this.model.root); this.model.mat.dispose(); this.model = null; }
    for (const mesh of [this.heldMesh, this.offMesh]) if (mesh) mesh.material.dispose();
    if (this.rt) { this.rt.dispose(); this.rt = null; }
  }
}
