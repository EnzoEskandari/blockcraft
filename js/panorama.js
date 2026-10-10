// The title screen's background: a slowly turning view of a place that shows off the latest update (see
// updates.js), built from its own little world behind the menus, as in Minecraft.
import { G } from './game.js';
import { World } from './world.js';
import { B } from './blocks.js';
import { R, setChunkMeshes, disposeChunkMeshes, updateSky, render } from './render.js';
import { buildChunkMesh } from './mesher.js';
import { LATEST } from './updates.js';
import { signMesh, disposeSignMesh } from './signs.js';
import { fairWeather } from './weather.js';

let RAD = 3;   // chunks made around the spot; those within RAD - 1 are drawn (a scene can ask for a wider view)
const P = { world: null, todo: [], yaw: 0, shown: false, at: null, signs: [] };

export function startPanorama() {
  const sc = LATEST.scene;
  if (P.world || !sc) return;
  RAD = sc.rad || 3;
  fairWeather();
  const w = new World(sc.seed, sc.dim || 'overworld');   // (a scene may be in the Nether)
  for (const [x, y, z, key] of sc.place || []) w.setBlockAnywhere(x, y, z, B[key]);
  // where the view is from: a set spot, or (for a scene that is built) the world's spawn, with the scene around it
  P.at = { x: sc.x, y: sc.y, z: sc.z };
  if (sc.build) {
    // built around the world's spawn, or around a spot the scene names (`at`: the middle of a village, say)
    const sp = sc.at ? { x: sc.at[0], z: sc.at[1], h: w.column(sc.at[0], sc.at[1]).h } : w.findSpawn();
    const ox = Math.floor(sp.x), oz = Math.floor(sp.z), g = sp.h;
    sc.build((dx, dy, dz, key, meta = 0) => w.setBlockAnywhere(ox + dx, g + dy, oz + dz, key ? B[key] : 0, meta),
      (dx, dy, dz, lines) => w.signs.set(`${ox + dx},${g + dy},${oz + dz}`, lines),
      (dx, dz) => w.column(ox + dx, oz + dz).h - g);   // how much higher the ground is there
    const v = sc.view || [0, 0];   // where in the scene the view stands (and how high above the ground)
    P.at = { x: ox + v[0] + 0.5, y: g + (v[2] ?? 2.62), z: oz + v[1] + 0.5 };
  }
  P.world = w;
  P.yaw = sc.yaw || 0;
  P.shown = false;
  const cx = Math.floor(P.at.x) >> 4, cz = Math.floor(P.at.z) >> 4;
  P.todo = [];
  for (let dz = -RAD; dz <= RAD; dz++) for (let dx = -RAD; dx <= RAD; dx++) P.todo.push([cx + dx, cz + dz, Math.max(Math.abs(dx), Math.abs(dz))]);
  P.todo.sort((a, b) => a[2] - b[2]);
  P.meshQ = P.todo.filter((t) => t[2] < RAD).map(([x, z]) => [x, z]);
}

export function stopPanorama() {
  if (!P.world) return;
  for (const c of P.world.chunks.values()) disposeChunkMeshes(c);
  for (const m of P.signs) disposeSignMesh(m);
  P.signs = [];
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
    if (!P.meshQ.length && !P.shown) {
      P.shown = true;
      document.body.classList.add('panorama');
      // the words on the scene's signs
      for (const [key, lines] of w.signs) {
        const [x, y, z] = key.split(',').map(Number);
        const id = w.getBlock(x, y, z);
        if (!id) continue;
        const m = signMesh(id, w.getMeta(x, y, z), x, y, z, lines);
        R.scene.add(m);
        P.signs.push(m);
      }
    }
  }
  if (!P.shown) return;
  G.dim = sc.dim || 'overworld';
  P.yaw += dt * 0.045;
  const cam = R.camera;
  cam.position.set(P.at.x, P.at.y, P.at.z);
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
