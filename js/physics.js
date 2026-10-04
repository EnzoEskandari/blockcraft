// Axis-aligned box movement against the block grid, voxel ray casting, ray-box tests.
import { B } from './blocks.js';

const EPS = 1e-4;

// Blocks are solid over part of their height: all of it, the bottom or top half (slabs), a thin layer
// (closed trapdoors), or none. world.solidSpan(x, y, z) gives that part as [bottom, top] within the cell.

// Does the block at this cell get in the way of a box spanning y0..y1?
function hits(world, x, by, z, y0, y1) {
  const s = world.solidSpan(x, by, z);
  return !!s && by + s[0] < y1 - EPS && by + s[1] > y0 + EPS;
}

function moveY(world, e, dy, res) {
  const p = e.pos, hw = e.hw, h = e.h;
  const x0 = Math.floor(p.x - hw + EPS), x1 = Math.floor(p.x + hw - EPS);
  const z0 = Math.floor(p.z - hw + EPS), z1 = Math.floor(p.z + hw - EPS);
  let ny = p.y + dy;
  if (dy < 0) {
    // the highest surface between the feet and where they would end up
    for (let by = Math.floor(p.y + EPS); by >= Math.floor(ny + EPS); by--) {
      let best = -Infinity;
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const s = world.solidSpan(x, by, z);
        if (!s) continue;
        const top = by + s[1];
        if (top <= p.y + EPS && top > ny && top > best) best = top;
      }
      if (best > -Infinity) { ny = best; res.y = true; res.ground = true; break; }
    }
  } else {
    // the lowest ceiling between the head and where it would end up
    const top = p.y + h;
    for (let by = Math.floor(top - EPS); by <= Math.floor(top + dy - EPS); by++) {
      let best = Infinity;
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const s = world.solidSpan(x, by, z);
        if (!s) continue;
        const bottom = by + s[0];
        if (bottom >= top - EPS && bottom < top + dy && bottom < best) best = bottom;
      }
      if (best < Infinity) { ny = best - h; res.y = true; break; }
    }
  }
  p.y = ny;
}

function moveX(world, e, dx, res) {
  const p = e.pos, hw = e.hw, h = e.h;
  const y0 = Math.floor(p.y + EPS), y1 = Math.floor(p.y + h - EPS);
  const z0 = Math.floor(p.z - hw + EPS), z1 = Math.floor(p.z + hw - EPS);
  let nx = p.x + dx;
  if (dx > 0) {
    const face = p.x + hw;
    outer: for (let bx = Math.floor(face - EPS) + 1; bx <= Math.floor(face + dx - EPS); bx++) {
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        if (hits(world, bx, y, z, p.y, p.y + h)) { nx = bx - hw; res.x = true; break outer; }
      }
    }
  } else {
    const face = p.x - hw;
    outer: for (let bx = Math.floor(face + EPS) - 1; bx >= Math.floor(face + dx + EPS); bx--) {
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        if (hits(world, bx, y, z, p.y, p.y + h)) { nx = bx + 1 + hw; res.x = true; break outer; }
      }
    }
  }
  p.x = nx;
}

function moveZ(world, e, dz, res) {
  const p = e.pos, hw = e.hw, h = e.h;
  const y0 = Math.floor(p.y + EPS), y1 = Math.floor(p.y + h - EPS);
  const x0 = Math.floor(p.x - hw + EPS), x1 = Math.floor(p.x + hw - EPS);
  let nz = p.z + dz;
  if (dz > 0) {
    const face = p.z + hw;
    outer: for (let bz = Math.floor(face - EPS) + 1; bz <= Math.floor(face + dz - EPS); bz++) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (hits(world, x, y, bz, p.y, p.y + h)) { nz = bz - hw; res.z = true; break outer; }
      }
    }
  } else {
    const face = p.z - hw;
    outer: for (let bz = Math.floor(face + EPS) - 1; bz >= Math.floor(face + dz + EPS); bz--) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (hits(world, x, y, bz, p.y, p.y + h)) { nz = bz + 1 + hw; res.z = true; break outer; }
      }
    }
  }
  p.z = nz;
}

// e: { pos: {x,y,z} (feet centre), hw: half width, h: height }
// Moves the box by (dx, dy, dz), stopping at solid blocks. Returns which axes collided.
// step: how high a ledge it walks up without jumping when it is on the ground (0.6 takes slabs in stride)
export function moveBox(world, e, dx, dy, dz, step = 0) {
  const p = e.pos;
  const res = { x: false, y: false, z: false, ground: false };
  if (dy !== 0) moveY(world, e, dy, res);
  if (dx === 0 && dz === 0) return res;
  const bx = p.x, by = p.y, bz = p.z;
  if (dx !== 0) moveX(world, e, dx, res);
  if (dz !== 0) moveZ(world, e, dz, res);
  if (step > 0 && (res.x || res.z) && (res.ground || e.onGround)) {
    // blocked: go back, lift, try again a step higher, and settle down onto whatever is there
    const ax = p.x, az = p.z, far = Math.abs(ax - bx) + Math.abs(az - bz);
    const r2 = { x: false, y: false, z: false, ground: false };
    p.x = bx; p.z = bz;
    moveY(world, e, step, r2);
    const lifted = p.y - by;
    r2.y = false;
    if (dx !== 0) moveX(world, e, dx, r2);
    if (dz !== 0) moveZ(world, e, dz, r2);
    if (lifted > EPS) moveY(world, e, -lifted, r2);
    if (Math.abs(p.x - bx) + Math.abs(p.z - bz) > far + EPS && p.y > by + EPS && r2.ground) {
      res.x = r2.x; res.z = r2.z; res.ground = true;
    } else { p.x = ax; p.y = by; p.z = az; }
  }
  return res;
}

// True if the box at its current position overlaps any solid block
export function boxBlocked(world, x, y, z, hw, h) {
  const x0 = Math.floor(x - hw + EPS), x1 = Math.floor(x + hw - EPS);
  const y0 = Math.floor(y + EPS), y1 = Math.floor(y + h - EPS);
  const z0 = Math.floor(z - hw + EPS), z1 = Math.floor(z + hw - EPS);
  for (let bx = x0; bx <= x1; bx++) for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) {
    if (hits(world, bx, by, bz, y, y + h)) return true;
  }
  return false;
}

// Is the box (grown a little) against or on top of a block of this kind? (a cactus pricks whatever touches it)
export function touching(world, e, id, grow = 0.08) {
  const p = e.pos, hw = e.hw + grow;
  for (let bx = Math.floor(p.x - hw); bx <= Math.floor(p.x + hw); bx++) {
    for (let by = Math.floor(p.y - grow); by <= Math.floor(p.y + e.h + grow); by++) {
      for (let bz = Math.floor(p.z - hw); bz <= Math.floor(p.z + hw); bz++) if (world.getBlock(bx, by, bz) === id) return true;
    }
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
    if (id && pick(id)) {
      // slabs and trapdoors only fill part of their block: the ray has to hit that part
      const box = world.pickBox ? world.pickBox(x, y, z, id) : null;
      if (!box) return { x, y, z, nx, ny, nz, id, dist: t };
      const tb = rayBox(ox, oy, oz, dx, dy, dz, x + box[0], y + box[1], z + box[2], x + box[3], y + box[4], z + box[5]);
      if (tb >= 0 && tb <= maxDist) {
        const hx = ox + dx * tb, hy = oy + dy * tb, hz = oz + dz * tb, e = 1e-4;
        let fx = nx, fy = ny, fz = nz;
        if (Math.abs(hx - (x + box[0])) < e) [fx, fy, fz] = [-1, 0, 0];
        else if (Math.abs(hx - (x + box[3])) < e) [fx, fy, fz] = [1, 0, 0];
        else if (Math.abs(hy - (y + box[1])) < e) [fx, fy, fz] = [0, -1, 0];
        else if (Math.abs(hy - (y + box[4])) < e) [fx, fy, fz] = [0, 1, 0];
        else if (Math.abs(hz - (z + box[2])) < e) [fx, fy, fz] = [0, 0, -1];
        else if (Math.abs(hz - (z + box[5])) < e) [fx, fy, fz] = [0, 0, 1];
        return { x, y, z, nx: fx, ny: fy, nz: fz, id, dist: tb };
      }
    }
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
