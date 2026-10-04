// The words on signs: cleaned up, and drawn on a small flat panel just in front of each board.
import * as THREE from 'three';
import { BLOCKS } from './blocks.js';

// Up to four lines of 15 characters, with nothing unprintable
export function cleanSign(lines) {
  const out = (Array.isArray(lines) ? lines : []).slice(0, 4).map((l) => String(l ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 15));
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

// A panel with the lines on it, placed on the sign block `id` at x, y, z (meta: the way it faces)
export function signMesh(id, meta, x, y, z, lines) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.font = '15px VT323, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#1b1206';
  lines.forEach((l, i) => g.fillText(l, 64, 9 + i * 15, 122));
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.47), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  const d = meta & 3;   // facing south, east, north, west
  const standing = BLOCKS[id].sign === 1;
  const out = standing ? 0.07 : -0.37;   // from the middle of the block to just in front of the board
  mesh.position.set(x + 0.5 + [0, 1, 0, -1][d] * out, y + (standing ? 0.75 : 0.5), z + 0.5 + [1, 0, -1, 0][d] * out);
  mesh.rotation.y = [0, Math.PI / 2, Math.PI, -Math.PI / 2][d];
  return mesh;
}

export function disposeSignMesh(mesh) {
  if (mesh.parent) mesh.parent.remove(mesh);
  mesh.material.map.dispose();
  mesh.material.dispose();
  mesh.geometry.dispose();
}
