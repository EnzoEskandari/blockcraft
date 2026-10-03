// The title screen's background: a slowly turning view of a place that shows off the latest update (see
// updates.js), built from its own little world behind the menus, as in Minecraft.
import { G } from './game.js';
import { World } from './world.js';
import { B } from './blocks.js';
import { R, setChunkMeshes, disposeChunkMeshes, updateSky, render } from './render.js';
import { buildChunkMesh } from './mesher.js';
import { LATEST } from './updates.js';

const RAD = 3;   // chunks made around the spot; those within RAD - 1 are drawn
const P = { world: null, todo: [], yaw: 0, shown: false };

export function startPanorama() {
  const sc = LATEST.scene;
  if (P.world || !sc) return;
  const w = new World(sc.seed, 'overworld');
  for (const [x, y, z, key] of sc.place || []) w.setBlockAnywhere(x, y, z, B[key]);
  P.world = w;
  P.yaw = sc.yaw || 0;
  P.shown = false;
  const cx = Math.floor(sc.x) >> 4, cz = Math.floor(sc.z) >> 4;
  P.todo = [];
  for (let dz = -RAD; dz <= RAD; dz++) for (let dx = -RAD; dx <= RAD; dx++) P.todo.push([cx + dx, cz + dz, Math.max(Math.abs(dx), Math.abs(dz))]);
  P.todo.sort((a, b) => a[2] - b[2]);
  P.meshQ = P.todo.filter((t) => t[2] < RAD).map(([x, z]) => [x, z]);
}

export function stopPanorama() {
  if (!P.world) return;
  for (const c of P.world.chunks.values()) disposeChunkMeshes(c);
  P.world = null;
  P.todo = [];
  document.body.classList.remove('panorama');
}

// One frame on the title screen: a little more of the place is made, then the slowly turning view
export function panoramaFrame(dt) {
  const w = P.world, sc = LATEST.scene;
  if (!w) return;
  const t0 = performance.now();
  while (P.todo.length && performance.now() - t0 < 10) { const [cx, cz] = P.todo.shift(); w.generate(cx, cz); }
  if (!P.todo.length && P.meshQ.length) {
    while (P.meshQ.length && performance.now() - t0 < 14) {
      const [cx, cz] = P.meshQ.shift();
      const c = w.getChunk(cx, cz);
      if (c) setChunkMeshes(c, buildChunkMesh(w, c));
    }
    if (!P.meshQ.length && !P.shown) { P.shown = true; document.body.classList.add('panorama'); }
  }
  if (!P.shown) return;
  G.dim = 'overworld';
  P.yaw += dt * 0.045;
  const cam = R.camera;
  cam.position.set(sc.x, sc.y, sc.z);
  cam.rotation.set(sc.pitch || 0, P.yaw, 0);
  R.handHolder.visible = false;
  updateSky(sc.time ?? 0.3, dt, false, false);
  // keep the fog within the little world that was made (dark, for a place underground)
  const far = (RAD - 1) * 16, near = far * 0.55;
  R.scene.fog.near = near; R.scene.fog.far = far;
  R.shared.uFogNear.value = near; R.shared.uFogFar.value = far;
  if (sc.fog) { R.scene.fog.color.setRGB(...sc.fog); R.shared.uFogColor.value.setRGB(...sc.fog); }
  render();
}
