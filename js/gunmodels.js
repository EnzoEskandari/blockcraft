// Guns held in your hand (1.10.11): solid models made of boxes, the barrel pointing ahead (-z), instead of the
// flat picture other things are held as. Sizes are in pixels (a sixteenth of a block); y 0 is where the hand
// grips. Each box: [width, height, length, x, y, z, colour].
import * as THREE from 'three';

const M = [176, 176, 182], D = [92, 92, 98], K = [40, 40, 44], WD = [140, 90, 48], WL = [168, 112, 62];
const MODELS = {
  pistol: [[2, 2, 9, 0, 3, -3.5, M], [1.8, 1, 7, 0, 1.6, -3, D], [1.8, 5, 2.4, 0, -1.2, 1.2, WD], [0.6, 1.4, 2, 0, 0.6, -1, K], [0.4, 0.6, 0.4, 0, 4.2, -7.6, K]],
  revolver: [[1.2, 1.2, 8, 0, 3, -6, M], [2.6, 2.6, 3, 0, 2.6, -1, D], [1.8, 2.2, 4, 0, 2.6, 1, M], [1.8, 5, 2.4, 0, -1, 2.4, WD], [0.6, 1.2, 1.6, 0, 0.8, -0.2, K],
    [0.4, 0.8, 0.4, 0, 4, -9.6, K]],
  smg: [[2, 2.6, 9, 0, 2.6, -2.5, K], [1, 1, 3, 0, 2.9, -8.5, D], [1.6, 4, 2, 0, -0.6, 0.6, K], [1.4, 5, 1.6, 0, -1, -3.4, D], [1, 1, 4, 0, 2.6, 4, K],
    [1.2, 2.6, 1, 0, 1.8, 6, K]],
  assault_rifle: [[2, 2.6, 10, 0, 2.6, -1, K], [1, 1, 6, 0, 2.9, -12, D], [2.2, 2, 5, 0, 2.5, -7.5, WD], [1.8, 3, 6, 0, 1.8, 7, WD], [1.6, 3.5, 1.8, 0, 0, 2, K],
    [1.4, 4, 2, 0, -0.6, -2, D], [1.4, 2, 2, 0, -2.8, -1.2, D], [0.4, 1.4, 0.4, 0, 4.4, -12, K], [1.2, 1.2, 1.4, 0, 4.4, 2, K]],
  rifle: [[2, 2.6, 11, 0, 2, 3, WD], [1, 1, 13, 0, 3, -8.5, M], [2, 1.4, 7, 0, 2.2, -6, WL], [0.6, 0.6, 1.5, 1.4, 3.4, 1, M], [1.4, 2.6, 4, 0, 0.4, 7.5, WD]],
  sniper_rifle: [[1, 1, 15, 0, 3, -10.5, K], [2, 2.6, 8, 0, 2.6, 1, D], [1.8, 3.4, 6, 0, 1.8, 8, D], [1.6, 3.5, 1.8, 0, 0, 2.6, K],
    [1.4, 1.4, 8, 0, 5.2, -0.5, K], [1.8, 1.8, 1.4, 0, 5.2, -4.6, K], [1.8, 1.8, 1.4, 0, 5.2, 3.6, K], [0.6, 1.2, 0.6, 0, 4, -0.5, K], [1.4, 1.4, 0.2, 0, 5.2, -5.4, [120, 200, 240]]],
  shotgun: [[1.2, 1.2, 12, 0, 3.4, -7, M], [1, 1, 10, 0, 2.2, -6, D], [1.8, 1.6, 4, 0, 2.2, -5, WD], [2, 2.6, 4, 0, 2.8, 1, D], [1.8, 3, 7, 0, 2, 6.5, WD],
    [0.6, 1.2, 1.6, 0, 0.9, 1, K]],
  minigun: [[3.8, 3.8, 5, 0, 3, 1.5, D], [1.2, 3, 1.2, 0, -0.5, 2.5, K], [2.6, 2.6, 1, 0, 3, -6, K], [2.6, 2.6, 1, 0, 3, -11, K], [1.4, 1.4, 2, 0, 3, 5, K]],
  rocket_launcher: [[3.4, 3.4, 18, 0, 3.5, -3, [86, 112, 70]], [3.6, 3.6, 1.2, 0, 3.5, -12, [62, 84, 50]], [3.6, 3.6, 1.2, 0, 3.5, 6, [62, 84, 50]],
    [2.2, 2.2, 1.6, 0, 3.5, -12.8, [200, 50, 40]], [1.2, 3, 1.4, 0, 0.3, -0.5, K], [1.2, 3, 1.4, 0, 0.3, -6, K], [1, 2, 1, -2.2, 5.2, -4, K]],
};
// (six barrels round the minigun's middle)
for (let k = 0; k < 6; k++) {
  const a = k / 6 * Math.PI * 2;
  MODELS.minigun.push([0.8, 0.8, 13, Math.cos(a) * 1.1, 3 + Math.sin(a) * 1.1, -6, M]);
}
// Where each one's barrel ends: the flash appears there
const MUZZLE = {};
for (const [k, boxes] of Object.entries(MODELS)) {
  let z = 0, y = 0;
  for (const b of boxes) if (b[5] - b[2] / 2 < z) { z = b[5] - b[2] / 2; y = b[4]; }
  MUZZLE[k] = [0, y, z];
}

// Faces in the order BoxGeometry makes them (+x, -x, +y, -y, +z, -z) and how bright each is
const SHADE = [0.78, 0.78, 1, 0.5, 0.88, 0.88];
const CACHE = {};
function geometryOf(key) {
  if (CACHE[key]) return CACHE[key];
  const pos = [], col = [], idx = [];
  for (const [w, h, l, x, y, z, c] of MODELS[key]) {
    const g = new THREE.BoxGeometry(w, h, l);
    const p = g.attributes.position.array, base = pos.length / 3;
    for (let i = 0; i < p.length; i += 3) {
      pos.push(p[i] + x, p[i + 1] + y, p[i + 2] + z);
      const s = SHADE[Math.floor(i / 3 / 4)];
      col.push(c[0] / 255 * s, c[1] / 255 * s, c[2] / 255 * s);
    }
    for (const i of g.index.array) idx.push(base + i);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return (CACHE[key] = geo);
}

export const hasGunModel = (key) => !!MODELS[key];

// A gun to hold, with a muzzle flash (hidden until it fires) at the end of its barrel
export function gunModel(key) {
  // (a mesh, not a group, so it can be put away like any held item: its material disposed)
  const g = new THREE.Mesh(geometryOf(key), new THREE.MeshBasicMaterial({ vertexColors: true }));
  const flash = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), new THREE.MeshBasicMaterial({ color: 0xffd860, transparent: true, opacity: 0.9 }));
  const [mx, my, mz] = MUZZLE[key];
  flash.position.set(mx, my, mz - 1.4);
  flash.rotation.z = Math.PI / 4;
  flash.visible = false;
  flash.userData.flash = true;
  g.add(flash);
  g.userData.gun = true;
  g.userData.flash = flash;
  return g;
}
