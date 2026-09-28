// Axis-aligned box movement against the block grid, voxel ray casting, ray-box tests.
import { B } from './blocks.js';

const EPS = 1e-4;

// e: { pos: {x,y,z} (feet centre), hw: half width, h: height }
// Moves the box by (dx, dy, dz), stopping at solid blocks. Returns which axes collided.
export function moveBox(world, e, dx, dy, dz) {
  const p = e.pos, hw = e.hw, h = e.h;
  const res = { x: false, y: false, z: false, ground: false };

  if (dy !== 0) {
    const x0 = Math.floor(p.x - hw + EPS), x1 = Math.floor(p.x + hw - EPS);
    const z0 = Math.floor(p.z - hw + EPS), z1 = Math.floor(p.z + hw - EPS);
    let ny = p.y + dy;
    if (dy < 0) {
      const from = Math.floor(p.y + EPS) - 1, to = Math.floor(p.y + dy + EPS);
      outer: for (let by = from; by >= to; by--) {
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
          if (world.isSolid(x, by, z)) { ny = by + 1; res.y = true; res.ground = true; break outer; }
        }
      }
    } else {
      const top = p.y + h;
      const from = Math.floor(top - EPS) + 1, to = Math.floor(top + dy - EPS);
      outer2: for (let by = from; by <= to; by++) {
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
          if (world.isSolid(x, by, z)) { ny = by - h; res.y = true; break outer2; }
        }
      }
    }
    p.y = ny;
  }

  if (dx !== 0) {
    const y0 = Math.floor(p.y + EPS), y1 = Math.floor(p.y + h - EPS);
    const z0 = Math.floor(p.z - hw + EPS), z1 = Math.floor(p.z + hw - EPS);
    let nx = p.x + dx;
    if (dx > 0) {
      const face = p.x + hw;
      const from = Math.floor(face - EPS) + 1, to = Math.floor(face + dx - EPS);
      outer3: for (let bx = from; bx <= to; bx++) {
        for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
          if (world.isSolid(bx, y, z)) { nx = bx - hw; res.x = true; break outer3; }
        }
      }
    } else {
      const face = p.x - hw;
      const from = Math.floor(face + EPS) - 1, to = Math.floor(face + dx + EPS);
      outer4: for (let bx = from; bx >= to; bx--) {
        for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
          if (world.isSolid(bx, y, z)) { nx = bx + 1 + hw; res.x = true; break outer4; }
        }
      }
    }
    p.x = nx;
  }

  if (dz !== 0) {
    const y0 = Math.floor(p.y + EPS), y1 = Math.floor(p.y + h - EPS);
    const x0 = Math.floor(p.x - hw + EPS), x1 = Math.floor(p.x + hw - EPS);
    let nz = p.z + dz;
    if (dz > 0) {
      const face = p.z + hw;
      const from = Math.floor(face - EPS) + 1, to = Math.floor(face + dz - EPS);
      outer5: for (let bz = from; bz <= to; bz++) {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          if (world.isSolid(x, y, bz)) { nz = bz - hw; res.z = true; break outer5; }
        }
      }
    } else {
      const face = p.z - hw;
      const from = Math.floor(face + EPS) - 1, to = Math.floor(face + dz + EPS);
      outer6: for (let bz = from; bz >= to; bz--) {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          if (world.isSolid(x, y, bz)) { nz = bz + 1 + hw; res.z = true; break outer6; }
        }
      }
    }
    p.z = nz;
  }
  return res;
}

// True if the box at its current position overlaps any solid block
export function boxBlocked(world, x, y, z, hw, h) {
  const x0 = Math.floor(x - hw + EPS), x1 = Math.floor(x + hw - EPS);
  const y0 = Math.floor(y + EPS), y1 = Math.floor(y + h - EPS);
  const z0 = Math.floor(z - hw + EPS), z1 = Math.floor(z + hw - EPS);
  for (let bx = x0; bx <= x1; bx++) for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) {
    if (world.isSolid(bx, by, bz)) return true;
  }
  return false;
}

export function inWater(world, x, y, z) {
  return world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === B.water;
}

// DDA voxel traversal. pick(id) decides which blocks stop the ray.
export function raycast(world, ox, oy, oz, dx, dy, dz, maxDist, pick) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmx = dx > 0 ? (x + 1 - ox) * tdx : dx < 0 ? (ox - x) * tdx : Infinity;
  let tmy = dy > 0 ? (y + 1 - oy) * tdy : dy < 0 ? (oy - y) * tdy : Infinity;
  let tmz = dz > 0 ? (z + 1 - oz) * tdz : dz < 0 ? (oz - z) * tdz : Infinity;
  let t = 0, nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < 256 && t <= maxDist; i++) {
    const id = world.getBlock(x, y, z);
    if (id && pick(id)) return { x, y, z, nx, ny, nz, id, dist: t };
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}

// Slab test; returns entry distance or -1
export function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = 0, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [minX, minY, minZ], mx = [maxX, maxY, maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return -1;
    } else {
      let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}
