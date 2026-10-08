// Procedural 16x16 pixel-art textures for blocks, and icons for the inventory.
import { mulberry32, hashString } from './noise.js';
import { BLOCKS, ITEMS, RENDER, WOOL_COLORS } from './blocks.js';

export const TEX = {};      // texture name -> array-texture layer
export const TILES = [];    // layer -> 16x16 canvas
export const ICONS = [];    // item id -> canvas
const ICON_URLS = [];

// ---------------------------------------------------------------- helpers
const sh = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const jit = (c, v, r) => { const k = (r() - 0.5) * 2 * v; return [c[0] + k, c[1] + k, c[2] + k]; };

class Tile {
  constructor(seed) {
    this.d = new Uint8ClampedArray(16 * 16 * 4);
    this.r = mulberry32(seed);
  }
  set(x, y, c, a) {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    const i = (y * 16 + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2];
    this.d[i + 3] = a ?? (c.length > 3 ? c[3] : 255);
  }
  each(fn) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) this.set(x, y, fn(x, y));
  }
  clear() { this.d.fill(0); }
  line(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c);
  }
}

// Tileable value noise with `cells` lattice cells across the tile; returns [0,1]
function vnoise(r, cells) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const fx = (x / 16) * cells, fy = (y / 16) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const xa = x0 % cells, xb = (x0 + 1) % cells, ya = y0 % cells, yb = (y0 + 1) % cells;
    const a = g[ya * cells + xa], b = g[ya * cells + xb], c = g[yb * cells + xa], d = g[yb * cells + xb];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

// Tileable Voronoi cells
function voronoi(r, n) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([r() * 16, r() * 16, r()]);
  return (x, y) => {
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let k = 0; k < n; k++) {
      let dx = Math.abs(x + 0.5 - pts[k][0]); dx = Math.min(dx, 16 - dx);
      let dy = Math.abs(y + 0.5 - pts[k][1]); dy = Math.min(dy, 16 - dy);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; best = k; } else if (d < d2) d2 = d;
    }
    return { d1, d2, v: pts[best][2] };
  };
}

// ---------------------------------------------------------------- painters
const GRASS = [[86, 150, 46], [102, 168, 56], [116, 182, 64], [94, 158, 52], [126, 192, 72]];

function stone(p) {
  const n = vnoise(p.r, 4), n2 = vnoise(p.r, 8);
  p.each((x, y) => {
    let v = 122 + (n(x, y) - 0.5) * 36 + (n2(x, y) - 0.5) * 18 + (p.r() - 0.5) * 10;
    if (p.r() < 0.05) v -= 16;
    return [v, v, v];
  });
}
function dirt(p) {
  const base = [134, 96, 67];
  p.each(() => {
    const r = p.r();
    if (r < 0.1) return sh(base, 0.76);
    if (r < 0.18) return sh(base, 1.14);
    if (r < 0.22) return [118, 106, 96];
    return jit(base, 7, p.r);
  });
}
function grassTop(p) {
  const n = vnoise(p.r, 4);
  p.each((x, y) => {
    const k = Math.min(4, Math.floor(n(x, y) * 2.5 + p.r() * 2.5));
    return GRASS[k];
  });
}
function grassSide(p) {
  dirt(p);
  for (let x = 0; x < 16; x++) {
    const depth = 3 + (p.r() < 0.5 ? 1 : 0) + (p.r() < 0.3 ? 1 : 0);
    for (let y = 0; y < depth; y++) p.set(x, y, GRASS[Math.floor(p.r() * GRASS.length)]);
    if (p.r() < 0.4) p.set(x, depth, sh(GRASS[0], 0.8));
  }
}
function snowySide(p) {
  dirt(p);
  for (let x = 0; x < 16; x++) {
    const depth = 2 + (p.r() < 0.5 ? 1 : 0) + (p.r() < 0.3 ? 1 : 0);
    for (let y = 0; y < depth; y++) p.set(x, y, jit([240, 248, 250], 5, p.r));
    if (p.r() < 0.2) p.set(x, depth, [210, 222, 228]);
  }
}
function cobble(p, mossy) {
  const vor = voronoi(p.r, 11);
  const moss = vnoise(p.r, 4);
  p.each((x, y) => {
    const c = vor(x, y);
    const edge = c.d2 - c.d1;
    if (edge < 0.9) return jit([60, 60, 60], 6, p.r);
    let v = (92 + c.v * 56) * (0.82 + 0.18 * Math.min(1, edge / 3)) + (p.r() - 0.5) * 14;
    let col = [v, v, v];
    if (mossy && moss(x, y) > 0.55 && p.r() < 0.85) col = mix(col, [74, 112, 48], 0.75);
    return col;
  });
}
function planks(p, base) {
  const seams = [0, 1, 2, 3].map(() => Math.floor(p.r() * 16));
  const phase = [0, 1, 2, 3].map(() => p.r() * 6);
  p.each((x, y) => {
    const board = y >> 2;
    if ((y & 3) === 3) return sh(base, 0.7);
    if (x === seams[board]) return sh(base, 0.78);
    const grain = 0.93 + 0.07 * Math.sin(x * 0.8 + phase[board] + (y & 3) * 1.9);
    return jit(sh(base, grain), 4, p.r);
  });
}
function bark(p, base, dark) {
  const cols = [];
  for (let x = 0; x < 16; x++) cols.push(p.r());
  const n = vnoise(p.r, 4);
  p.each((x, y) => {
    const v = cols[x] + (n(x, y) - 0.5) * 0.5;
    const c = v < 0.35 ? dark : v < 0.5 ? mix(base, dark, 0.5) : base;
    return jit(c, 6, p.r);
  });
}
function birchBark(p) {
  p.each(() => jit([216, 214, 206], 6, p.r));
  for (let k = 0; k < 8; k++) {
    const y = Math.floor(p.r() * 16), x0 = Math.floor(p.r() * 16), len = 2 + Math.floor(p.r() * 3);
    for (let i = 0; i < len; i++) p.set((x0 + i) & 15, y, p.r() < 0.8 ? [48, 48, 46] : [120, 118, 112]);
  }
}
function logTop(p, inner, ring, barkC) {
  p.each((x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) return jit(barkC, 6, p.r);
    return jit(Math.floor(d) % 2 ? ring : inner, 5, p.r);
  });
}
function leavesTex(p, base) {
  p.each(() => {
    if (p.r() < 0.2) return [0, 0, 0, 0];
    const f = 0.62 + p.r() * 0.5;
    return [base[0] * f, base[1] * f, base[2] * f, 255];
  });
}
function ore(p, c, hi, n) {
  stone(p);
  for (let k = 0; k < n; k++) {
    const cx = 1 + Math.floor(p.r() * 12), cy = 1 + Math.floor(p.r() * 12);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]) {
      if (p.r() < 0.72) p.set(cx + dx, cy + dy, jit(c, 12, p.r));
    }
    p.set(cx, cy, hi);
    p.set(cx + 1, cy + 1, sh(c, 0.7));
  }
}
// Deepslate: dark grey stone in wavy layers
function deepslate(p) {
  const n = vnoise(p.r, 4);
  p.each((x, y) => {
    const band = Math.sin((y + n(x, y) * 3) * 1.5) * 0.5 + 0.5;
    let v = 64 + band * 18 + (p.r() - 0.5) * 10;
    if (p.r() < 0.06) v -= 14;
    return [v, v, v + 6];
  });
}
// Speckled stones of cave walls (granite, diorite, andesite, tuff)
function speckled(p, base, dot, dot2, k) {
  const n = vnoise(p.r, 5);
  p.each((x, y) => {
    const r = p.r();
    if (r < k) return jit(dot, 8, p.r);
    if (r < k * 1.6) return jit(dot2, 8, p.r);
    return jit(sh(base, 0.9 + n(x, y) * 0.2), 5, p.r);
  });
}
// A trapdoor: a framed wooden hatch with four little windows and two iron hinges
function trapdoor(p, base) {
  p.each((x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return sh(base, 0.66);
    if ((y === 2 || y === 13) && (x === 1 || x === 2)) return [80, 80, 84];
    const win = ((x >= 3 && x <= 6) || (x >= 9 && x <= 12)) && ((y >= 3 && y <= 6) || (y >= 9 && y <= 12));
    if (win) return [0, 0, 0, 0];
    return jit(x === 7 || x === 8 || y === 7 || y === 8 ? sh(base, 0.86) : base, 5, p.r);
  });
}
function metal(p, base) {
  p.each((x, y) => {
    if (x === 0 || y === 0) return sh(base, 1.12);
    if (x === 15 || y === 15) return sh(base, 0.68);
    if ((x === 1 || y === 1) && p.r() < 0.6) return sh(base, 1.06);
    return jit(base, 6, p.r);
  });
}
function wool(p, base) {
  p.each((x, y) => sh(base, ((x + y) & 1 ? 0.95 : 1) * (0.95 + p.r() * 0.09)));
}
function furnaceSide(p) {
  p.each((x, y) => (x === 0 || x === 15 || y === 0 || y === 15) ? jit([98, 98, 98], 5, p.r) : jit([128, 128, 128], 7, p.r));
}
function furnaceFront(p, lit) {
  furnaceSide(p);
  for (let x = 1; x < 15; x++) p.set(x, 4, [96, 96, 96]);
  for (let y = 7; y < 14; y++) for (let x = 3; x < 13; x++) {
    const border = y === 7 || y === 13 || x === 3 || x === 12;
    p.set(x, y, border ? [70, 70, 70] : [22, 22, 22]);
  }
  for (let x = 4; x < 12; x += 2) p.set(x, 9, [60, 60, 60]);
  if (lit) {
    const pal = [[255, 244, 160], [255, 200, 60], [255, 140, 20], [230, 80, 10]];
    for (let y = 10; y < 13; y++) for (let x = 4; x < 12; x++) {
      if (p.r() < 0.35 + (y - 10) * 0.25) p.set(x, y, pal[Math.floor(p.r() * pal.length)]);
    }
  }
}

const PAINTERS = {
  stone,
  dirt,
  grass_top: grassTop,
  grass_side: grassSide,
  cobblestone: (p) => cobble(p, false),
  mossy_cobblestone: (p) => cobble(p, true),
  oak_planks: (p) => planks(p, [168, 134, 80]),
  birch_planks: (p) => planks(p, [200, 184, 128]),
  spruce_planks: (p) => planks(p, [116, 86, 50]),
  bedrock: (p) => {
    const n = vnoise(p.r, 8);
    const pal = [[36, 36, 36], [70, 70, 70], [104, 104, 104], [140, 140, 140]];
    p.each((x, y) => jit(pal[Math.min(3, Math.floor((n(x, y) * 0.7 + p.r() * 0.3) * 4))], 6, p.r));
  },
  water: (p) => {
    const n = vnoise(p.r, 4);
    p.each((x, y) => { const c = jit(mix([40, 78, 196], [76, 120, 232], n(x, y)), 4, p.r); return [c[0], c[1], c[2], 180]; });
  },
  sand: (p) => p.each(() => { const r = p.r(); return r < 0.14 ? [204, 190, 144] : r < 0.2 ? [232, 222, 184] : jit([219, 207, 163], 6, p.r); }),
  gravel: (p) => {
    const vor = voronoi(p.r, 22);
    const pal = [[132, 126, 122], [104, 99, 97], [152, 142, 136], [88, 84, 82], [122, 114, 104]];
    p.each((x, y) => { const c = vor(x, y); return c.d2 - c.d1 < 0.55 ? [78, 74, 72] : jit(pal[Math.floor(c.v * pal.length)], 6, p.r); });
  },
  oak_log: (p) => bark(p, [108, 86, 52], [72, 56, 34]),
  oak_log_top: (p) => logTop(p, [182, 146, 90], [152, 118, 70], [100, 80, 48]),
  birch_log: birchBark,
  birch_log_top: (p) => logTop(p, [214, 200, 150], [188, 172, 122], [210, 208, 200]),
  spruce_log: (p) => bark(p, [66, 46, 26], [42, 29, 16]),
  spruce_log_top: (p) => logTop(p, [128, 96, 58], [104, 76, 44], [60, 42, 24]),
  oak_leaves: (p) => leavesTex(p, [70, 140, 44]),
  birch_leaves: (p) => leavesTex(p, [112, 150, 64]),
  spruce_leaves: (p) => leavesTex(p, [48, 94, 60]),
  glass: (p) => {
    const glint = new Set(['2,4', '3,3', '4,2', '2,5', '5,2', '9,13', '10,12', '11,11', '12,10']);
    p.each((x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return p.r() < 0.2 ? [176, 206, 216, 255] : [218, 238, 244, 255];
      if (glint.has(x + ',' + y)) return [255, 255, 255, 170];
      return [0, 0, 0, 0];
    });
  },
  coal_ore: (p) => ore(p, [40, 40, 40], [80, 80, 80], 5),
  iron_ore: (p) => ore(p, [212, 170, 140], [240, 214, 194], 5),
  gold_ore: (p) => ore(p, [250, 220, 60], [255, 252, 180], 5),
  diamond_ore: (p) => ore(p, [80, 226, 222], [210, 255, 252], 4),
  redstone_ore: (p) => ore(p, [196, 16, 10], [255, 90, 70], 6),
  lapis_ore: (p) => ore(p, [34, 70, 190], [100, 140, 240], 5),
  snow: (p) => p.each(() => p.r() < 0.12 ? [222, 236, 242] : jit([242, 250, 252], 4, p.r)),
  snowy_grass_side: snowySide,
  ice: (p) => {
    const n = vnoise(p.r, 4);
    p.each((x, y) => {
      const c = (x + y * 2) % 11 === 0 ? [196, 222, 255] : mix([124, 166, 242], [164, 200, 255], n(x, y));
      return c;
    });
  },
  cactus_side: (p) => p.each((x, y) => {
    if (x === 0 || x === 15) return [10, 78, 20];
    if (x % 4 === 3 && y % 4 === (x >> 2) % 4) return [226, 230, 186];
    return jit(x % 4 === 1 ? [12, 100, 26] : [20, 126, 36], 7, p.r);
  }),
  cactus_top: (p) => p.each((x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) return [10, 78, 20];
    if (d > 4.5) return jit([18, 112, 32], 6, p.r);
    return jit(d < 1.5 ? [90, 172, 76] : [40, 148, 52], 6, p.r);
  }),
  cactus_bottom: (p) => p.each((x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return d > 6.5 ? [10, 78, 20] : jit([150, 180, 110], 8, p.r);
  }),
  clay: (p) => p.each(() => jit([160, 166, 178], 6, p.r)),
  sandstone_side: (p) => p.each((x, y) => {
    let c = [216, 202, 155];
    if (y < 3) c = [228, 216, 170];
    else if (y === 3) c = [194, 178, 130];
    else if (y > 11) c = p.r() < 0.3 ? [198, 184, 138] : [210, 196, 148];
    return jit(c, 5, p.r);
  }),
  sandstone_top: (p) => p.each(() => jit([226, 214, 168], 5, p.r)),
  sandstone_bottom: (p) => p.each(() => p.r() < 0.1 ? [190, 176, 130] : jit([214, 198, 150], 6, p.r)),
  bricks: (p) => {
    const cols = [];
    for (let i = 0; i < 8; i++) cols.push(jit([150, 74, 56], 16, p.r));
    p.each((x, y) => {
      const row = y >> 2;
      if ((y & 3) === 3) return jit([180, 172, 162], 6, p.r);
      const xx = (x + (row & 1) * 4) & 15;
      if ((xx & 7) === 7) return jit([180, 172, 162], 6, p.r);
      return jit(cols[row * 2 + (xx >> 3)], 7, p.r);
    });
  },
  stone_bricks: (p) => p.each((x, y) => {
    const row = y >> 3, ly = y & 7;
    const lx = (x + row * 8) & 15;
    if (ly === 7 || lx === 15) return [70, 70, 70];
    if (ly === 0 || lx === 0) return jit([152, 152, 152], 4, p.r);
    return jit([122, 122, 122], 8, p.r);
  }),
  obsidian: (p) => {
    const n = vnoise(p.r, 6);
    p.each((x, y) => {
      if (p.r() < 0.05) return [96, 74, 136];
      const v = n(x, y);
      return v > 0.62 ? [58, 38, 88] : v > 0.42 ? [32, 22, 50] : [18, 14, 28];
    });
  },
  crafting_table_top: (p) => {
    planks(p, [176, 140, 86]);
    for (let i = 0; i < 16; i++) {
      for (const [x, y] of [[i, 0], [i, 15], [0, i], [15, i]]) p.set(x, y, [92, 64, 36]);
      if (i > 0 && i < 15) { p.set(i, 5, [130, 98, 58]); p.set(i, 10, [130, 98, 58]); p.set(5, i, [130, 98, 58]); p.set(10, i, [130, 98, 58]); }
    }
  },
  crafting_table_side: (p) => {
    planks(p, [160, 122, 72]);
    for (let x = 0; x < 16; x++) { p.set(x, 0, [80, 56, 30]); p.set(x, 1, [112, 80, 44]); p.set(x, 2, [112, 80, 44]); }
    for (let y = 5; y < 11; y++) for (let x = 3; x < 7; x++) p.set(x, y, (x === 3 && y % 2) ? [120, 120, 120] : [192, 192, 192]);
    for (let y = 11; y < 14; y++) { p.set(4, y, [96, 66, 36]); p.set(5, y, [96, 66, 36]); }
    for (let x = 9; x < 14; x++) { p.set(x, 5, [110, 110, 110]); p.set(x, 6, [90, 90, 90]); }
    for (let y = 7; y < 14; y++) p.set(11, y, [120, 84, 44]);
  },
  crafting_table_front: (p) => {
    planks(p, [160, 122, 72]);
    for (let x = 0; x < 16; x++) { p.set(x, 0, [80, 56, 30]); p.set(x, 1, [112, 80, 44]); p.set(x, 2, [112, 80, 44]); }
    for (let y = 5; y < 14; y++) { p.set(3, y, [206, 196, 150]); p.set(4, y, [206, 196, 150]); if (y % 2) p.set(4, y, [70, 58, 34]); }
    for (let x = 8; x < 13; x++) for (let y = 5; y < 8; y++) p.set(x, y, [142, 102, 60]);
    for (let y = 8; y < 14; y++) p.set(10, y, [100, 70, 38]);
  },
  furnace_side: furnaceSide,
  furnace_top: (p) => p.each((x, y) => (x === 0 || x === 15 || y === 0 || y === 15) ? [92, 92, 92] : jit([114, 114, 114], 6, p.r)),
  furnace_front: (p) => furnaceFront(p, false),
  furnace_front_lit: (p) => furnaceFront(p, true),
  chest_side: (p) => p.each((x, y) => {
    if (x === 0 || x === 15 || y === 0 || y === 15 || y === 5) return [72, 48, 20];
    return jit(y % 3 === 0 ? [150, 102, 44] : [166, 114, 50], 6, p.r);
  }),
  chest_front: (p) => {
    PAINTERS.chest_side(p);
    for (let y = 3; y < 9; y++) for (let x = 6; x < 10; x++) p.set(x, y, (y === 3 || y === 8 || x === 6 || x === 9) ? [40, 40, 40] : [200, 200, 200]);
  },
  chest_top: (p) => p.each((x, y) => (x === 0 || x === 15 || y === 0 || y === 15) ? [72, 48, 20] : jit(y % 4 === 3 ? [146, 100, 42] : [166, 114, 50], 6, p.r)),
  tnt_side: (p) => {
    p.each((x, y) => {
      if (y >= 5 && y <= 10) return (y === 5 || y === 10) ? [206, 206, 206] : [240, 240, 240];
      return jit(sh([206, 56, 32], x % 4 === 3 ? 0.76 : 1), 7, p.r);
    });
    const k = [30, 30, 30];
    for (let x = 1; x <= 3; x++) p.set(x, 6, k);
    for (let y = 7; y <= 9; y++) p.set(2, y, k);
    for (let y = 6; y <= 9; y++) { p.set(5, y, k); p.set(8, y, k); }
    p.set(6, 7, k); p.set(7, 8, k);
    for (let x = 10; x <= 12; x++) p.set(x, 6, k);
    for (let y = 7; y <= 9; y++) p.set(11, y, k);
  },
  tnt_top: (p) => p.each((x, y) => {
    if ((x === 7 || x === 8) && (y === 7 || y === 8)) return [60, 60, 60];
    const d = Math.hypot((x & 7) - 3.5, (y & 7) - 3.5);
    return d < 1.6 ? [226, 200, 186] : jit(d < 3.2 ? [206, 56, 32] : [160, 40, 24], 6, p.r);
  }),
  tnt_bottom: (p) => p.each(() => jit([170, 44, 26], 8, p.r)),
  glowstone: (p) => {
    const vor = voronoi(p.r, 14);
    const pal = [[255, 240, 170], [248, 212, 120], [222, 168, 86], [180, 120, 60]];
    p.each((x, y) => { const c = vor(x, y); return c.d2 - c.d1 < 0.7 ? [150, 100, 50] : jit(pal[Math.floor(c.v * 4)], 8, p.r); });
  },
  torch: (p) => {
    p.clear();
    for (let y = 8; y < 16; y++) { p.set(7, y, [134, 100, 54]); p.set(8, y, [98, 72, 38]); }
    p.set(7, 6, [255, 240, 150]); p.set(8, 6, [255, 214, 96]);
    p.set(7, 7, [255, 192, 64]); p.set(8, 7, [240, 150, 40]);
  },
  tall_grass: (p) => {
    p.clear();
    const pal = [[96, 160, 52], [112, 176, 62], [84, 146, 46]];
    for (let k = 0; k < 11; k++) {
      const x = 1 + Math.floor(p.r() * 14), h = 5 + Math.floor(p.r() * 9), lean = p.r() < 0.5 ? -1 : 1;
      for (let i = 0; i < h; i++) p.set(x + (i > h * 0.6 ? lean : 0), 15 - i, jit(pal[Math.floor(p.r() * 3)], 8, p.r));
    }
  },
  dandelion: (p) => {
    p.clear();
    for (let y = 9; y < 16; y++) p.set(7, y, [64, 132, 40]);
    p.set(6, 13, [64, 132, 40]); p.set(5, 12, [74, 146, 46]); p.set(8, 12, [64, 132, 40]); p.set(9, 11, [74, 146, 46]);
    for (let y = 5; y < 8; y++) for (let x = 6; x < 9; x++) p.set(x, y, [250, 222, 34]);
    p.set(7, 4, [250, 222, 34]); p.set(7, 6, [255, 164, 20]); p.set(5, 6, [236, 200, 30]); p.set(9, 6, [236, 200, 30]);
  },
  poppy: (p) => {
    p.clear();
    for (let y = 8; y < 16; y++) p.set(7, y, [64, 132, 40]);
    p.set(6, 12, [74, 146, 46]); p.set(8, 11, [74, 146, 46]); p.set(9, 10, [64, 132, 40]);
    for (let y = 4; y < 8; y++) for (let x = 6; x < 10; x++) p.set(x, y, (x + y) % 3 ? [214, 22, 22] : [170, 12, 16]);
    p.set(7, 5, [40, 20, 10]); p.set(8, 5, [40, 20, 10]); p.set(7, 6, [40, 20, 10]);
    p.set(5, 5, [214, 22, 22]); p.set(10, 6, [190, 16, 18]);
  },
  dead_bush: (p) => {
    p.clear();
    const c = [128, 88, 40];
    p.line(7, 15, 7, 10, c); p.line(7, 11, 4, 7, c); p.line(7, 10, 10, 6, c);
    p.line(5, 9, 3, 8, c); p.line(9, 8, 12, 8, c); p.line(4, 7, 3, 4, c); p.line(10, 6, 11, 3, c);
  },
  oak_sapling: (p) => {
    p.clear();
    for (let y = 10; y < 16; y++) { p.set(7, y, [104, 74, 38]); p.set(8, y, [84, 58, 28]); }
    for (const [cx, cy, r] of [[5, 7, 2.6], [10, 6, 2.6], [8, 3, 2.2], [7, 9, 2]]) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (Math.hypot(x - cx, y - cy) < r && p.r() < 0.9) p.set(x, y, jit([70, 140, 40], 18, p.r));
      }
    }
  },
  pumpkin_side: (p) => p.each((x, y) => {
    let c = x % 4 === 0 ? [190, 104, 18] : [224, 134, 28];
    if (y === 0 || y === 15) c = sh(c, 0.85);
    return jit(c, 6, p.r);
  }),
  pumpkin_top: (p) => p.each((x, y) => {
    if ((x === 7 || x === 8) && (y === 7 || y === 8)) return [110, 94, 40];
    const a = Math.atan2(y - 7.5, x - 7.5);
    return jit(Math.sin(a * 6) > 0.6 ? [190, 104, 18] : [224, 134, 28], 6, p.r);
  }),
  iron_block: (p) => metal(p, [220, 220, 220]),
  gold_block: (p) => metal(p, [248, 214, 62]),
  diamond_block: (p) => metal(p, [98, 226, 220]),
  coal_block: (p) => metal(p, [28, 28, 28]),
  redstone_block: (p) => metal(p, [172, 22, 12]),
  lapis_block: (p) => metal(p, [32, 66, 170]),
  bookshelf: (p) => {
    planks(p, [168, 134, 80]);
    const cols = [[140, 40, 40], [40, 70, 140], [50, 110, 50], [150, 120, 40], [100, 50, 120], [160, 160, 150]];
    for (const [y0, y1] of [[1, 6], [9, 14]]) {
      let x = 1;
      while (x < 15) {
        const w = 1 + Math.floor(p.r() * 2);
        const c = cols[Math.floor(p.r() * cols.length)];
        const top = y0 + Math.floor(p.r() * 2);
        for (let xx = x; xx < Math.min(15, x + w); xx++) for (let y = top; y <= y1; y++) p.set(xx, y, jit(c, 8, p.r));
        x += w + (p.r() < 0.15 ? 1 : 0);
      }
    }
    for (let x = 0; x < 16; x++) { p.set(x, 0, [96, 70, 40]); p.set(x, 7, [96, 70, 40]); p.set(x, 8, [150, 118, 70]); p.set(x, 15, [96, 70, 40]); }
  },
};
for (const [k, , c] of WOOL_COLORS) PAINTERS[k + '_wool'] = (p) => wool(p, c);

// ---- textures for villages, farming, new biomes and structures
function wheatStage(p, s) {
  p.clear();
  const xs = [1, 3, 6, 8, 11, 13];
  const hMin = [2, 5, 8, 11][s], hVar = [3, 3, 3, 3][s];
  const stalk = [[80, 160, 40], [96, 170, 44], [150, 170, 52], [196, 168, 62]][s];
  for (const x0 of xs) {
    const h = hMin + Math.floor(p.r() * hVar);
    const x = x0 + (p.r() < 0.5 ? 0 : 1);
    for (let i = 0; i < h; i++) p.set(x, 15 - i, jit(stalk, 10, p.r));
    if (s === 3) for (let i = h - 3; i < h; i++) { p.set(x - 1, 15 - i, [178, 136, 44]); p.set(x + 1, 15 - i, [214, 184, 78]); }
    else if (s >= 1) p.set(x + (p.r() < 0.5 ? -1 : 1), 15 - Math.floor(h / 2), jit(stalk, 12, p.r));
  }
}
for (let s = 0; s < 4; s++) PAINTERS['wheat_' + s] = (p) => wheatStage(p, s);

Object.assign(PAINTERS, {
  emerald_ore: (p) => ore(p, [44, 196, 88], [170, 255, 190], 3),
  deepslate,
  cobbled_deepslate: (p) => {
    const vor = voronoi(p.r, 12);
    p.each((x, y) => {
      const c = vor(x, y);
      if (c.d2 - c.d1 < 0.9) return jit([30, 30, 34], 5, p.r);
      const v = 52 + c.v * 34 + (p.r() - 0.5) * 10;
      return [v, v, v + 5];
    });
  },
  deepslate_coal_ore: (p) => oreOn(p, deepslate, [24, 24, 24], [60, 60, 60], 5),
  deepslate_iron_ore: (p) => oreOn(p, deepslate, [206, 162, 130], [236, 208, 186], 5),
  deepslate_gold_ore: (p) => oreOn(p, deepslate, [246, 214, 54], [255, 250, 176], 5),
  deepslate_diamond_ore: (p) => oreOn(p, deepslate, [76, 222, 218], [206, 255, 250], 4),
  deepslate_redstone_ore: (p) => oreOn(p, deepslate, [196, 16, 10], [255, 90, 70], 6),
  deepslate_lapis_ore: (p) => oreOn(p, deepslate, [40, 80, 200], [110, 150, 245], 5),
  deepslate_emerald_ore: (p) => oreOn(p, deepslate, [44, 196, 88], [170, 255, 190], 3),
  copper_ore: (p) => { ore(p, [216, 120, 76], [246, 168, 120], 4); oreSpots(p, [88, 176, 146], [150, 220, 196], 2); },
  deepslate_copper_ore: (p) => { oreOn(p, deepslate, [212, 116, 72], [244, 164, 116], 4); oreSpots(p, [84, 170, 140], [146, 216, 190], 2); },
  copper_block: (p) => metal(p, [196, 110, 76]),
  tuff: (p) => speckled(p, [108, 110, 100], [84, 86, 76], [140, 140, 128], 0.12),
  granite: (p) => speckled(p, [154, 106, 88], [122, 76, 62], [188, 140, 122], 0.14),
  diorite: (p) => speckled(p, [196, 196, 196], [120, 120, 122], [236, 236, 236], 0.12),
  andesite: (p) => speckled(p, [132, 132, 134], [100, 100, 102], [160, 160, 160], 0.14),
  emerald_block: (p) => metal(p, [62, 204, 104]),
  dirt_path_top: (p) => p.each(() => p.r() < 0.15 ? [126, 102, 52] : jit([150, 124, 68], 7, p.r)),
  dirt_path_side: (p) => {
    dirt(p);
    for (let x = 0; x < 16; x++) {
      const d = 2 + (p.r() < 0.4 ? 1 : 0);
      for (let y = 0; y < d; y++) p.set(x, y, jit([150, 124, 68], 7, p.r));
    }
  },
  farmland_top: (p) => p.each((x, y) => {
    const furrow = (y % 4) < 2;
    return jit(furrow ? [78, 52, 32] : [104, 72, 46], 6, p.r);
  }),
  hay_bale_side: (p) => {
    const cols = [];
    for (let x = 0; x < 16; x++) cols.push(0.88 + p.r() * 0.2);
    p.each((x, y) => {
      if (y === 2 || y === 3 || y === 12 || y === 13) return jit([118, 78, 30], 6, p.r);
      return jit(sh([200, 164, 42], cols[x]), 6, p.r);
    });
  },
  hay_bale_top: (p) => p.each((x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) return jit([150, 118, 30], 6, p.r);
    return jit(Math.floor(d) % 2 ? [186, 150, 38] : [214, 180, 56], 6, p.r);
  }),
  bed_side: (p) => {
    p.clear();
    for (let y = 7; y < 13; y++) for (let x = 0; x < 16; x++) p.set(x, y, y === 7 ? [196, 56, 52] : jit([164, 32, 30], 6, p.r));
    for (let x = 0; x < 16; x++) p.set(x, 13, [120, 88, 50]);
    for (let y = 14; y < 16; y++) for (const x of [0, 1, 2, 13, 14, 15]) p.set(x, y, [104, 76, 42]);
  },
  bed_foot_top: (p) => p.each((x, y) => {
    if (x === 0 || x === 15) return [130, 22, 22];
    if (y % 5 === 4) return [148, 26, 26];
    return jit([172, 34, 32], 6, p.r);
  }),
  bed_head_top: (p) => p.each((x, y) => {
    if (y >= 1 && y <= 5 && x >= 2 && x <= 13) return (y === 5 || x === 2 || x === 13) ? [200, 200, 196] : jit([236, 236, 230], 4, p.r);
    if (x === 0 || x === 15) return [130, 22, 22];
    return jit([172, 34, 32], 6, p.r);
  }),
  sugar_cane: (p) => {
    p.clear();
    for (const x0 of [2, 7, 12]) {
      for (let y = 0; y < 16; y++) {
        const node = (y + x0) % 5 === 0;
        p.set(x0, y, node ? [186, 222, 140] : jit([126, 186, 86], 8, p.r));
        p.set(x0 + 1, y, node ? [160, 206, 118] : jit([104, 164, 68], 8, p.r));
      }
      p.set(x0 - 1, (x0 * 3) % 16, [110, 170, 70]);
      p.set(x0 + 2, (x0 * 5 + 7) % 16, [110, 170, 70]);
    }
  },
  jungle_log: (p) => bark(p, [112, 86, 44], [76, 56, 26]),
  jungle_log_top: (p) => logTop(p, [182, 132, 82], [156, 106, 62], [112, 86, 44]),
  jungle_leaves: (p) => leavesTex(p, [52, 150, 32]),
  jungle_planks: (p) => planks(p, [160, 114, 80]),
  dark_oak_log: (p) => bark(p, [64, 48, 30], [40, 30, 18]),
  dark_oak_log_top: (p) => logTop(p, [112, 82, 52], [90, 64, 40], [64, 48, 30]),
  dark_oak_leaves: (p) => leavesTex(p, [46, 104, 32]),
  dark_oak_planks: (p) => planks(p, [74, 52, 32]),
  netherrack: (p) => {
    const n = vnoise(p.r, 8);
    p.each((x, y) => { const v = n(x, y); return jit(v > 0.62 ? [140, 70, 68] : v < 0.35 ? [82, 32, 34] : [112, 48, 48], 8, p.r); });
  },
  terracotta: (p) => p.each(() => jit([152, 94, 68], 5, p.r)),
  orange_terracotta: (p) => p.each(() => jit([162, 84, 38], 5, p.r)),
  blue_terracotta: (p) => p.each(() => jit([76, 62, 94], 5, p.r)),
  white_terracotta: (p) => p.each(() => jit([210, 178, 162], 5, p.r)),
  chiseled_sandstone: (p) => {
    PAINTERS.sandstone_top(p);
    for (let x = 0; x < 16; x++) { p.set(x, 0, [236, 224, 180]); p.set(x, 1, [200, 184, 136]); p.set(x, 14, [200, 184, 136]); p.set(x, 15, [236, 224, 180]); }
    for (let y = 2; y < 14; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (Math.abs(d - 3.2) < 0.6) p.set(x, y, [180, 160, 108]);
      const a = Math.atan2(y - 7.5, x - 7.5);
      if (d > 4.3 && d < 5.8 && Math.abs(Math.sin(a * 4)) > 0.92) p.set(x, y, [186, 166, 114]);
    }
    p.set(7, 7, [180, 160, 108]); p.set(8, 8, [180, 160, 108]);
  },
  mossy_stone_bricks: (p) => {
    PAINTERS.stone_bricks(p);
    const n = vnoise(p.r, 4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (n(x, y) > 0.55 && p.r() < 0.8) p.set(x, y, jit([78, 112, 50], 10, p.r));
  },
  cracked_stone_bricks: (p) => {
    PAINTERS.stone_bricks(p);
    p.line(3, 1, 6, 5, [60, 60, 60]); p.line(6, 5, 5, 9, [60, 60, 60]); p.line(11, 9, 13, 14, [60, 60, 60]); p.line(12, 11, 9, 13, [60, 60, 60]);
  },
  oak_trapdoor: (p) => trapdoor(p, [168, 134, 80]),
  birch_trapdoor: (p) => trapdoor(p, [200, 184, 128]),
  spruce_trapdoor: (p) => trapdoor(p, [116, 86, 50]),
  jungle_trapdoor: (p) => trapdoor(p, [160, 114, 80]),
  dark_oak_trapdoor: (p) => trapdoor(p, [74, 52, 32]),
  oak_door_bottom: (p) => p.each((x, y) => {
    if (x === 0 || x === 15 || y === 15) return [110, 82, 46];
    if (x === 13 && (y === 1 || y === 2)) return [70, 70, 70];
    const panel = y >= 3 && y <= 12 && ((x >= 2 && x <= 6) || (x >= 9 && x <= 13));
    return jit(panel ? [150, 118, 70] : (x % 4 === 0 ? [140, 108, 62] : [168, 134, 80]), 5, p.r);
  }),
  oak_door_top: (p) => p.each((x, y) => {
    if (x === 0 || x === 15 || y === 0) return [110, 82, 46];
    const win = y >= 2 && y <= 7 && ((x >= 2 && x <= 6) || (x >= 9 && x <= 13));
    if (win) return (x === 4 || x === 11 || y === 4) ? [140, 108, 62] : [0, 0, 0, 0];
    return jit(x % 4 === 0 ? [140, 108, 62] : [168, 134, 80], 5, p.r);
  }),
  fire: (p) => {
    p.clear();
    const pal = [[255, 250, 200], [255, 220, 90], [250, 160, 30], [230, 90, 20], [180, 40, 10]];
    for (let x = 0; x < 16; x++) {
      const h = 6 + Math.floor(p.r() * 9) + (x > 3 && x < 12 ? 2 : 0);
      for (let i = 0; i < Math.min(16, h); i++) {
        const f = i / h;
        if (f > 0.7 && p.r() < 0.35) continue;
        p.set(x, 15 - i, pal[Math.min(4, Math.floor(f * 5 + p.r() * 0.8))]);
      }
    }
  },
  cobweb: (p) => {
    p.clear();
    const c = [226, 226, 226, 210];
    for (let a = 0; a < 8; a++) p.line(7.5, 7.5, 7.5 + Math.cos(a * Math.PI / 4) * 9, 7.5 + Math.sin(a * Math.PI / 4) * 9, c);
    for (const r of [2.5, 5, 7.2]) for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; p.set(Math.round(7.5 + Math.cos(t) * r), Math.round(7.5 + Math.sin(t) * r), c); }
  },
});

// ---------------------------------------------------------------- the Nether and the End
function netherrackBase(p) { PAINTERS.netherrack(p); }
// A few more ore flecks on a finished tile (copper's green-blue patina)
function oreSpots(p, c, hi, n) {
  for (let k = 0; k < n; k++) {
    const cx = 1 + Math.floor(p.r() * 13), cy = 1 + Math.floor(p.r() * 13);
    p.set(cx, cy, jit(c, 10, p.r)); p.set(cx + 1, cy, hi);
  }
}
function oreOn(p, base, c, hi, n) {
  base(p);
  for (let k = 0; k < n; k++) {
    const cx = 1 + Math.floor(p.r() * 12), cy = 1 + Math.floor(p.r() * 12);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]) if (p.r() < 0.72) p.set(cx + dx, cy + dy, jit(c, 12, p.r));
    p.set(cx, cy, hi);
  }
}
function stem(p, base, dark, glow) {
  bark(p, base, dark);
  for (let k = 0; k < 7; k++) p.set(Math.floor(p.r() * 16), Math.floor(p.r() * 16), glow);
}
function stemTop(p, inner, ring, barkC) { logTop(p, inner, ring, barkC); }
function wart(p, base) {
  const n = vnoise(p.r, 4);
  p.each((x, y) => jit(sh(base, 0.75 + n(x, y) * 0.45), 10, p.r));
}
function nylium(p, top) { p.each(() => (p.r() < 0.2 ? sh(top, 0.7) : jit(top, 12, p.r))); }
function nyliumSide(p, top) {
  netherrackBase(p);
  for (let x = 0; x < 16; x++) {
    const depth = 2 + (p.r() < 0.5 ? 1 : 0) + (p.r() < 0.3 ? 2 : 0);
    for (let y = 0; y < depth; y++) p.set(x, y, jit(top, 12, p.r));
  }
}
function starfield(p, base, stars) {
  p.each(() => jit(base, 6, p.r));
  for (let k = 0; k < 22; k++) p.set(Math.floor(p.r() * 16), Math.floor(p.r() * 16), stars[Math.floor(p.r() * stars.length)]);
}
function plantCross(p, stemC, headC, head) {
  p.clear();
  for (let y = 8; y < 16; y++) p.set(7, y, stemC);
  if (head) {
    for (let y = 4; y < 8; y++) for (let x = 4; x < 12; x++) if (Math.abs(x - 7.5) + Math.abs(y - 6) < 4.5) p.set(x, y, jit(headC, 14, p.r));
    p.set(6, 5, [250, 200, 120]); p.set(9, 6, [250, 200, 120]);
  } else {
    for (let k = 0; k < 9; k++) {
      const x = 2 + Math.floor(p.r() * 12), h = 4 + Math.floor(p.r() * 8);
      for (let i = 0; i < h; i++) p.set(x + (i > h * 0.6 ? (x < 8 ? -1 : 1) : 0), 15 - i, jit(headC, 14, p.r));
    }
  }
}
Object.assign(PAINTERS, {
  lava: (p) => {
    const n = vnoise(p.r, 4), n2 = vnoise(p.r, 8);
    p.each((x, y) => {
      const v = n(x, y) * 0.7 + n2(x, y) * 0.3;
      return v > 0.66 ? [255, 214, 90] : v > 0.5 ? [248, 146, 30] : v > 0.32 ? [214, 92, 16] : [170, 52, 10];
    });
  },
  nether_portal: (p) => {
    const n = vnoise(p.r, 4);
    p.each((x, y) => {
      const v = (Math.sin((x + y) * 0.9 + n(x, y) * 6) + 1) / 2;
      const c = mix([86, 20, 170], [190, 110, 255], v);
      return [c[0], c[1], c[2], 190];
    });
  },
  soul_sand: (p) => {
    p.each(() => jit([84, 64, 50], 8, p.r));
    for (let k = 0; k < 4; k++) {
      const cx = 2 + Math.floor(p.r() * 11), cy = 2 + Math.floor(p.r() * 11);
      p.set(cx, cy, [44, 32, 26]); p.set(cx + 2, cy, [44, 32, 26]); p.set(cx + 1, cy + 2, [44, 32, 26]); p.set(cx, cy + 2, [52, 38, 30]); p.set(cx + 2, cy + 2, [52, 38, 30]);
    }
  },
  soul_soil: (p) => p.each(() => (p.r() < 0.15 ? [58, 44, 34] : jit([92, 72, 56], 8, p.r))),
  nether_quartz_ore: (p) => oreOn(p, netherrackBase, [232, 226, 216], [255, 255, 250], 6),
  nether_gold_ore: (p) => oreOn(p, netherrackBase, [248, 206, 60], [255, 246, 160], 7),
  magma_block: (p) => {
    const vor = voronoi(p.r, 10);
    p.each((x, y) => { const c = vor(x, y); return c.d2 - c.d1 < 1.1 ? jit([255, 132, 20], 18, p.r) : jit([110, 40, 22], 10, p.r); });
  },
  basalt_side: (p) => p.each((x) => jit(x % 4 === 0 ? [60, 60, 66] : x % 4 === 2 ? [96, 96, 102] : [78, 78, 84], 8, p.r)),
  basalt_top: (p) => p.each((x, y) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); return jit(Math.floor(d) % 3 === 0 ? [64, 64, 70] : [88, 88, 94], 7, p.r); }),
  blackstone: (p) => { const n = vnoise(p.r, 6); p.each((x, y) => jit(n(x, y) > 0.6 ? [58, 50, 60] : [36, 30, 38], 6, p.r)); },
  gilded_blackstone: (p) => { PAINTERS.blackstone(p); for (let k = 0; k < 14; k++) p.set(Math.floor(p.r() * 16), Math.floor(p.r() * 16), p.r() < 0.5 ? [248, 200, 60] : [200, 140, 30]); },
  crimson_nylium: (p) => nylium(p, [150, 26, 30]),
  crimson_nylium_side: (p) => nyliumSide(p, [150, 26, 30]),
  warped_nylium: (p) => nylium(p, [30, 118, 110]),
  warped_nylium_side: (p) => nyliumSide(p, [30, 118, 110]),
  crimson_stem: (p) => stem(p, [112, 40, 64], [72, 22, 40], [220, 80, 60]),
  crimson_stem_top: (p) => stemTop(p, [150, 60, 80], [120, 40, 60], [112, 40, 64]),
  warped_stem: (p) => stem(p, [52, 84, 96], [30, 56, 66], [60, 220, 190]),
  warped_stem_top: (p) => stemTop(p, [56, 110, 110], [40, 88, 90], [52, 84, 96]),
  crimson_planks: (p) => planks(p, [120, 50, 76]),
  warped_planks: (p) => planks(p, [40, 118, 110]),
  nether_wart_block: (p) => wart(p, [132, 20, 22]),
  warped_wart_block: (p) => wart(p, [22, 128, 120]),
  shroomlight: (p) => { const vor = voronoi(p.r, 9); p.each((x, y) => { const c = vor(x, y); return c.d2 - c.d1 < 0.8 ? [210, 110, 40] : jit(c.v > 0.5 ? [255, 190, 96] : [246, 150, 60], 10, p.r); }); },
  nether_bricks: (p) => p.each((x, y) => {
    const row = y >> 2, xx = (x + (row & 1) * 4) & 15;
    if ((y & 3) === 3 || (xx & 7) === 7) return jit([30, 14, 18], 4, p.r);
    return jit((row + (xx >> 3)) % 3 === 0 ? [78, 36, 44] : [62, 28, 36], 6, p.r);
  }),
  crimson_roots: (p) => plantCross(p, [150, 30, 40], [190, 40, 50], false),
  warped_roots: (p) => plantCross(p, [30, 130, 120], [40, 170, 150], false),
  crimson_fungus: (p) => plantCross(p, [180, 110, 90], [200, 40, 40], true),
  warped_fungus: (p) => plantCross(p, [180, 110, 90], [30, 150, 130], true),
  nether_wart: (p) => {
    p.clear();
    for (let k = 0; k < 5; k++) {
      const x = 2 + k * 3, h = 5 + Math.floor(p.r() * 5);
      for (let i = 0; i < h; i++) p.set(x, 15 - i, [110, 20, 24]);
      p.set(x - 1, 15 - h, [170, 34, 40]); p.set(x, 15 - h, [190, 40, 46]); p.set(x + 1, 15 - h, [170, 34, 40]); p.set(x, 14 - h, [150, 30, 36]);
    }
  },
  bone_block_side: (p) => p.each((x, y) => jit((y & 7) === 0 ? [196, 192, 170] : [228, 224, 206], 5, p.r)),
  bone_block_top: (p) => p.each((x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return jit(d < 3 ? [180, 176, 156] : d > 6.6 ? [212, 208, 190] : [230, 226, 208], 5, p.r); }),
  quartz_block: (p) => p.each((x, y) => jit(x === 0 || y === 0 || x === 15 || y === 15 ? [210, 202, 194] : [236, 230, 222], 3, p.r)),
  end_stone: (p) => { const vor = voronoi(p.r, 12); p.each((x, y) => { const c = vor(x, y); return c.d2 - c.d1 < 0.7 ? [196, 196, 140] : jit(c.v > 0.5 ? [226, 228, 168] : [214, 216, 156], 6, p.r); }); },
  end_stone_bricks: (p) => p.each((x, y) => {
    const row = y >> 2, xx = (x + (row & 1) * 4) & 15;
    if ((y & 3) === 3 || (xx & 7) === 7) return jit([180, 180, 128], 4, p.r);
    return jit([226, 228, 170], 5, p.r);
  }),
  end_portal_frame_side: (p) => p.each((x, y) => {
    if (y < 3) return jit([46, 92, 80], 6, p.r);
    return jit(y === 3 ? [180, 184, 130] : [210, 212, 156], 6, p.r);
  }),
  end_portal_frame_top: (p) => p.each((x, y) => {
    const e = x < 2 || y < 2 || x > 13 || y > 13;
    const inner = x >= 4 && x <= 11 && y >= 4 && y <= 11;
    return e ? jit([60, 118, 100], 6, p.r) : inner ? [30, 44, 40] : jit([46, 92, 80], 6, p.r);
  }),
  end_portal_frame_eye: (p) => {
    PAINTERS.end_portal_frame_top(p);
    for (let y = 4; y <= 11; y++) for (let x = 4; x <= 11; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d < 3.8) p.set(x, y, d < 1.3 ? [10, 20, 18] : d < 2.6 ? [40, 170, 120] : [24, 110, 80]);
    }
  },
  end_portal: (p) => starfield(p, [8, 14, 24], [[140, 220, 210], [80, 160, 200], [200, 250, 240], [60, 110, 170]]),
  violetstone: (p) => p.each((x, y) => {
    const lx = x & 7, ly = y & 7;
    if (lx === 0 || ly === 0) return jit([150, 104, 150], 5, p.r);
    if (lx === 7 || ly === 7) return jit([124, 80, 124], 5, p.r);
    return jit([170, 124, 170], 6, p.r);
  }),
  violetstone_pillar: (p) => p.each((x) => jit(x === 0 || x === 15 ? [124, 80, 124] : x % 5 === 2 ? [150, 104, 150] : [172, 128, 172], 5, p.r)),
  violetstone_pillar_top: (p) => p.each((x, y) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); return jit(Math.floor(d) % 3 === 0 ? [140, 96, 140] : [172, 128, 172], 5, p.r); }),
  end_rod: (p) => {
    p.clear();
    for (let y = 1; y < 15; y++) { p.set(7, y, [246, 240, 232]); p.set(8, y, [214, 204, 196]); }
    for (let x = 6; x <= 9; x++) { p.set(x, 14, [160, 120, 170]); p.set(x, 15, [120, 86, 130]); }
  },
  dragon_egg: (p) => { p.each(() => jit([22, 12, 28], 5, p.r)); for (let k = 0; k < 16; k++) p.set(Math.floor(p.r() * 16), Math.floor(p.r() * 16), [120, 40, 150]); },
  spawner: (p) => p.each((x, y) => {
    if (x % 5 === 0 || y % 5 === 0 || x === 15 || y === 15) return jit([34, 42, 56], 6, p.r);
    return [0, 0, 0, 0];
  }),
});

// 1.7: the enchanting table, the anvil and the blocks villagers work at
Object.assign(PAINTERS, {
  enchanting_table_top: (p) => p.each((x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return jit([28, 22, 44], 5, p.r);
    if ((x < 4 || x > 11) && (y < 4 || y > 11)) return jit([92, 224, 216], 10, p.r);        // diamond corners
    if (x === 1 || y === 1 || x === 14 || y === 14) return jit([214, 174, 62], 8, p.r);     // gold trim
    if (x >= 5 && x <= 10 && y >= 5 && y <= 10) return (x === 7 || x === 8) ? [150, 120, 70] : jit([238, 230, 206], 5, p.r);   // the open book
    return jit([156, 30, 36], 8, p.r);
  }),
  // (the table is 12 high: only the lower twelve rows of its side show)
  enchanting_table_side: (p) => p.each((x, y) => {
    if (y < 4) return [0, 0, 0, 0];
    if (y < 7) return (x % 5 === 2 && y === 5) ? jit([92, 224, 216], 8, p.r) : jit([156, 30, 36], 8, p.r);
    if (y === 7) return jit([214, 174, 62], 8, p.r);
    const v = p.r();
    return v > 0.9 ? [70, 50, 104] : v > 0.6 ? [34, 24, 54] : [20, 16, 32];
  }),
  anvil: (p) => metal(p, [74, 74, 80]),
  composter: (p) => {
    planks(p, [136, 100, 58]);
    for (let x = 0; x < 16; x++) for (const y of [0, 5, 10, 15]) p.set(x, y, jit([84, 58, 30], 5, p.r));
    for (let y = 0; y < 16; y++) { p.set(0, y, [92, 64, 34]); p.set(15, y, [92, 64, 34]); }
  },
  compost: (p) => p.each(() => { const v = p.r(); return v > 0.7 ? jit([92, 110, 44], 10, p.r) : v > 0.35 ? jit([84, 62, 34], 8, p.r) : jit([58, 42, 24], 6, p.r); }),
  lectern_top: (p) => {
    planks(p, [168, 134, 80]);
    for (let y = 3; y < 13; y++) for (let x = 2; x < 14; x++) {
      const spine = x === 7 || x === 8;
      p.set(x, y, spine ? [120, 60, 40] : (y % 2 && x > 2 && x < 13 && !(x === 6 || x === 9)) ? [150, 150, 150] : [240, 236, 222]);
    }
  },
  lectern_side: (p) => {
    planks(p, [168, 134, 80]);
    for (let x = 0; x < 16; x++) { p.set(x, 0, [100, 74, 40]); p.set(x, 15, [100, 74, 40]); }
    const cols = [[140, 40, 40], [40, 70, 140], [50, 110, 50], [150, 120, 40]];
    for (let x = 5; x < 11; x++) for (let y = 5; y < 11; y++) p.set(x, y, jit(cols[(x - 5) >> 1 & 3], 8, p.r));
  },
  blast_furnace_side: (p) => p.each((x, y) => {
    if (y === 0 || y === 15 || y === 7 || y === 8) return jit([70, 70, 76], 5, p.r);
    if ((x === 2 || x === 13) && (y === 3 || y === 11)) return [176, 176, 184];   // rivets
    return jit(x === 0 || x === 15 ? [92, 92, 98] : [118, 118, 126], 6, p.r);
  }),
  blast_furnace_front: (p) => {
    p.each((x, y) => (y === 0 || y === 15 ? jit([70, 70, 76], 5, p.r) : jit(x === 0 || x === 15 ? [92, 92, 98] : [118, 118, 126], 6, p.r)));
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
      const border = y === 3 || y === 12 || x === 3 || x === 12;
      p.set(x, y, border ? [58, 58, 64] : y > 8 ? [[255, 200, 60], [255, 140, 20], [230, 80, 10]][Math.floor(p.r() * 3)] : (x % 2 ? [40, 40, 44] : [24, 24, 26]));
    }
  },
  grindstone: (p) => p.each((x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d < 1.6) return [96, 70, 40];   // the axle
    const ring = Math.sin(d * 2.2) * 6;
    return jit([150 + ring, 150 + ring, 152 + ring], 7, p.r);
  }),
  smithing_table_top: (p) => p.each((x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return jit([44, 44, 50], 4, p.r);
    if ((x === 2 || x === 13) && (y === 2 || y === 13)) return [170, 170, 178];
    return jit([70, 72, 82], 6, p.r);
  }),
  smithing_table_side: (p) => {
    planks(p, [76, 54, 34]);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) p.set(x, y, y === 3 ? [40, 40, 46] : jit([70, 72, 82], 6, p.r));
    for (const x of [2, 7, 12]) p.set(x, 1, [170, 170, 178]);
  },
  smoker_side: (p) => {
    furnaceSide(p);
    for (let x = 0; x < 16; x++) for (const y of [0, 1, 14, 15]) p.set(x, y, jit(y === 0 || y === 15 ? [84, 62, 36] : [112, 86, 52], 6, p.r));
  },
  smoker_front: (p) => {
    furnaceSide(p);
    for (let x = 0; x < 16; x++) for (const y of [0, 1, 14, 15]) p.set(x, y, jit(y === 0 || y === 15 ? [84, 62, 36] : [112, 86, 52], 6, p.r));
    for (let y = 4; y < 12; y++) for (let x = 3; x < 13; x++) p.set(x, y, y === 4 || y === 11 || x === 3 || x === 12 ? [66, 66, 66] : (y % 2 ? [30, 30, 30] : [96, 60, 30]));
  },
  fletching_table_top: (p) => {
    planks(p, [206, 190, 134]);
    for (let i = 0; i < 16; i++) for (const [x, y] of [[i, 0], [i, 15], [0, i], [15, i]]) p.set(x, y, [150, 132, 84]);
    for (let k = 3; k < 13; k++) p.set(k, k, [120, 90, 50]);                 // an arrow laid across it
    for (const [x, y] of [[12, 11], [11, 12], [13, 12], [12, 13]]) p.set(x, y, [236, 236, 236]);
    for (const [x, y] of [[3, 2], [2, 3], [2, 2]]) p.set(x, y, [150, 150, 156]);
  },
  fletching_table_side: (p) => {
    planks(p, [206, 190, 134]);
    for (let x = 0; x < 16; x++) { p.set(x, 0, [150, 132, 84]); p.set(x, 1, [176, 158, 104]); }
    for (let y = 4; y < 13; y++) p.set(4 + Math.round(Math.sin((y - 4) / 8 * Math.PI) * 3), y, [108, 78, 40]);   // a bow
    for (let y = 4; y < 13; y++) p.set(4, y, [236, 236, 236]);
    for (let x = 9; x < 14; x++) p.set(x, 8, [120, 90, 50]);
    p.set(14, 8, [150, 150, 156]); p.set(9, 7, [236, 236, 236]); p.set(9, 9, [236, 236, 236]);
  },
  brewing_stand: (p) => metal(p, [206, 172, 64]),
  loom_side: (p) => {
    planks(p, [168, 134, 80]);
    for (let i = 0; i < 16; i++) for (const [x, y] of [[i, 0], [i, 15], [0, i], [15, i]]) p.set(x, y, [112, 84, 46]);
  },
  loom_front: (p) => {
    planks(p, [168, 134, 80]);
    for (let i = 0; i < 16; i++) for (const [x, y] of [[i, 0], [i, 15], [0, i], [15, i]]) p.set(x, y, [112, 84, 46]);
    for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) p.set(x, y, y > 8 ? jit(x % 4 < 2 ? [176, 40, 40] : [60, 90, 180], 8, p.r) : (x % 2 ? [236, 232, 220] : [70, 52, 30]));
  },
  cauldron: (p) => metal(p, [62, 62, 68]),
  stonecutter_top: (p) => {
    stone(p);
    for (let x = 1; x < 15; x++) { p.set(x, 7, [40, 40, 40]); p.set(x, 8, [40, 40, 40]); }
  },
  stonecutter_side: (p) => {
    stone(p);
    for (let x = 0; x < 16; x++) for (let y = 7; y < 10; y++) p.set(x, y, jit([150, 118, 70], 6, p.r));
  },
  // (the saw stands in a box 14 wide and 6 high: the lower rows of the middle of the tile)
  stonecutter_saw: (p) => p.each((x, y) => {
    const d = Math.hypot(x - 7.5, y - 15);
    if (d > 7 || y < 9) return [0, 0, 0, 0];
    if (d > 6 && (x + y) % 2) return [0, 0, 0, 0];   // teeth
    return d < 1.5 ? [90, 90, 96] : jit([196, 196, 204], 8, p.r);
  }),
});

// Block-breaking crack stages
function crackPixels() {
  const r = mulberry32(4242);
  const pix = [], seen = new Set();
  for (let w = 0; w < 7; w++) {
    let x = 7.5, y = 7.5, ang = r() * Math.PI * 2;
    for (let s = 0; s < 14; s++) {
      ang += (r() - 0.5) * 1.3;
      x += Math.cos(ang); y += Math.sin(ang);
      const ix = Math.round(x), iy = Math.round(y);
      if (ix < 0 || iy < 0 || ix > 15 || iy > 15) break;
      const k = iy * 16 + ix;
      if (!seen.has(k)) { seen.add(k); pix.push([ix, iy, s]); }
    }
  }
  return pix.sort((a, b) => a[2] - b[2]);
}
// ---- Lands & Legends (1.8)
const flower = (p, stem, draw) => {
  p.clear();
  for (let y = stem; y < 16; y++) p.set(7, y, [64, 132, 40]);
  p.set(6, 13, [74, 146, 46]); p.set(8, 12, [64, 132, 40]); p.set(9, 11, [74, 146, 46]);
  draw();
};
const coral = (p, base, light) => {
  const vor = voronoi(p.r, 14);
  p.each((x, y) => { const c = vor(x, y); return c.d2 - c.d1 < 0.7 ? sh(base, 0.72) : jit(mix(base, light, c.v), 6, p.r); });
};
const capTop = (p, base, spots) => {
  const n = vnoise(p.r, 4);
  p.each((x, y) => jit(sh(base, 0.9 + n(x, y) * 0.2), 5, p.r));
  if (spots) for (const [x, y, w] of [[2, 2, 3], [10, 3, 2], [6, 8, 3], [12, 11, 3], [2, 11, 2]]) for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) p.set(x + i, y + j, jit([236, 232, 226], 5, p.r));
};
const soilSide = (p, pal, depth0) => {
  dirt(p);
  for (let x = 0; x < 16; x++) {
    const depth = depth0 + (p.r() < 0.5 ? 1 : 0) + (p.r() < 0.3 ? 1 : 0);
    for (let y = 0; y < depth; y++) p.set(x, y, jit(pal[Math.floor(p.r() * pal.length)], 5, p.r));
  }
};
const MYC = [[112, 98, 116], [126, 110, 128], [100, 88, 106], [138, 122, 136]];
const POD = [[92, 66, 28], [108, 80, 36], [78, 54, 22], [122, 92, 44]];
Object.assign(PAINTERS, {
  acacia_log: (p) => bark(p, [104, 98, 90], [70, 64, 58]),
  acacia_planks: (p) => planks(p, [176, 96, 52]),
  cherry_log: (p) => bark(p, [58, 36, 44], [38, 22, 30]),
  cherry_planks: (p) => planks(p, [228, 180, 172]),
  cherry_leaves: (p) => {
    leavesTex(p, [240, 158, 196]);
    for (let k = 0; k < 14; k++) { const x = Math.floor(p.r() * 16), y = Math.floor(p.r() * 16); if (p.d[(y * 16 + x) * 4 + 3]) p.set(x, y, p.r() < 0.5 ? [255, 214, 232] : [222, 118, 168]); }
  },
  red_sand: (p) => p.each(() => { const r = p.r(); return r < 0.14 ? [170, 86, 32] : r < 0.2 ? [206, 122, 62] : jit([190, 102, 44], 6, p.r); }),
  red_terracotta: (p) => p.each(() => jit([142, 60, 46], 5, p.r)),
  yellow_terracotta: (p) => p.each(() => jit([186, 132, 36], 5, p.r)),
  packed_ice: (p) => {
    const n = vnoise(p.r, 4);
    p.each((x, y) => ((x * 3 + y) % 13 === 0 ? [176, 204, 250] : jit(mix([126, 160, 232], [154, 186, 246], n(x, y)), 3, p.r)));
  },
  mycelium_top: (p) => { const n = vnoise(p.r, 4); p.each((x, y) => MYC[Math.min(3, Math.floor(n(x, y) * 2 + p.r() * 2))]); },
  mycelium_side: (p) => soilSide(p, MYC, 3),
  red_mushroom_block: (p) => capTop(p, [196, 38, 34], true),
  brown_mushroom_block: (p) => capTop(p, [146, 110, 82], false),
  mushroom_stem: (p) => { p.each((x) => jit(x % 4 === 0 ? [198, 192, 180] : [222, 216, 204], 4, p.r)); },
  red_mushroom: (p) => {
    p.clear();
    for (let y = 10; y < 16; y++) { p.set(7, y, [226, 220, 206]); p.set(8, y, [204, 198, 184]); }
    for (let x = 4; x < 12; x++) for (let y = 7; y < 10; y++) p.set(x, y, [200, 40, 36]);
    for (let x = 5; x < 11; x++) p.set(x, 6, [214, 52, 44]);
    p.set(5, 8, [240, 236, 230]); p.set(8, 7, [240, 236, 230]); p.set(10, 8, [240, 236, 230]);
  },
  podzol_top: (p) => { const n = vnoise(p.r, 4); p.each((x, y) => jit(POD[Math.min(3, Math.floor(n(x, y) * 2 + p.r() * 2))], 4, p.r)); },
  podzol_side: (p) => soilSide(p, POD, 3),
  fern: (p) => {
    p.clear();
    const pal = [[84, 150, 50], [102, 168, 60], [70, 132, 44]];
    for (let y = 4; y < 16; y++) p.set(7, y, pal[2]);
    for (let k = 0; k < 6; k++) {
      const y = 5 + k * 2, w = 2 + Math.floor((k + 1) * 0.9);
      for (let i = 1; i <= w; i++) { p.set(7 - i, y + (i > 2 ? 1 : 0), pal[(i + k) % 3]); p.set(7 + i, y + (i > 2 ? 1 : 0), pal[(i + k + 1) % 3]); }
    }
  },
  cornflower: (p) => flower(p, 8, () => {
    for (const [x, y] of [[6, 5], [7, 4], [8, 5], [7, 6], [5, 6], [9, 6], [6, 7], [8, 7], [7, 5]]) p.set(x, y, (x + y) % 2 ? [70, 106, 232] : [52, 78, 196]);
    p.set(7, 5, [30, 40, 120]);
  }),
  allium: (p) => flower(p, 7, () => {
    for (let y = 2; y < 7; y++) for (let x = 5; x < 10; x++) if (Math.hypot(x - 7, y - 4) < 2.6) p.set(x, y, (x * 3 + y) % 4 ? [188, 120, 236] : [150, 84, 206]);
    p.set(6, 3, [222, 172, 250]);
  }),
  tulip: (p) => flower(p, 8, () => {
    for (let y = 4; y < 8; y++) for (let x = 6; x < 9; x++) p.set(x, y, x === 7 ? [226, 52, 40] : [196, 34, 30]);
    p.set(6, 3, [226, 52, 40]); p.set(8, 3, [226, 52, 40]); p.set(7, 4, [240, 96, 70]);
  }),
  oxeye_daisy: (p) => flower(p, 8, () => {
    for (const [x, y] of [[7, 3], [7, 7], [5, 5], [9, 5], [6, 4], [8, 4], [6, 6], [8, 6], [6, 5], [8, 5], [7, 4], [7, 6]]) p.set(x, y, [240, 240, 236]);
    p.set(7, 5, [240, 196, 40]);
  }),
  sunflower: (p) => {
    p.clear();
    for (let y = 6; y < 16; y++) { p.set(7, y, [70, 140, 44]); p.set(8, y, [56, 118, 36]); }
    for (const [x, y] of [[5, 11], [4, 10], [10, 12], [11, 11], [6, 13], [9, 9]]) p.set(x, y, [84, 156, 50]);
    for (let y = 0; y < 8; y++) for (let x = 3; x < 12; x++) {
      const d = Math.hypot(x - 7.5, y - 3.5);
      if (d < 1.8) p.set(x, y, (x + y) % 2 ? [110, 70, 30] : [84, 52, 22]);
      else if (d < 4.2 && (x + y) % 2 === 0 || d < 3.2) p.set(x, y, d < 3 ? [250, 206, 36] : [240, 176, 20]);
    }
  },
  lily_pad: (p) => {
    p.clear();
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) {
      const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
      if (d > 6.6 || (dy > 0 && Math.abs(dx) < dy * 0.28)) continue;
      p.set(x, y, d > 5.6 ? [26, 96, 34] : (x + y * 2) % 7 === 0 ? [58, 150, 60] : jit([40, 124, 46], 5, p.r));
    }
  },
  bamboo: (p) => {
    p.clear();
    for (const x0 of [3, 8, 12]) {
      for (let y = 0; y < 16; y++) {
        const node = (y + x0 * 2) % 6 === 0;
        p.set(x0, y, node ? [150, 190, 70] : jit([104, 160, 40], 6, p.r));
        p.set(x0 + 1, y, node ? [128, 170, 56] : jit([84, 136, 30], 6, p.r));
      }
      const ly = (x0 * 5) % 12;
      p.set(x0 + 2, ly, [96, 170, 50]); p.set(x0 + 3, ly + 1, [80, 150, 44]); p.set(x0 - 1, ly + 5, [96, 170, 50]);
    }
  },
  tube_coral_block: (p) => coral(p, [48, 86, 206], [72, 120, 236]),
  fire_coral_block: (p) => coral(p, [166, 36, 46], [214, 60, 56]),
  brain_coral_block: (p) => coral(p, [206, 92, 160], [236, 132, 190]),
  skull_side: (p) => { const n = vnoise(p.r, 4); p.each((x, y) => { const v = 40 + n(x, y) * 14; return [v, v, v + 2]; }); },
  skull_front: (p) => {
    const n = vnoise(p.r, 4);
    p.each((x, y) => { const v = 40 + n(x, y) * 14; return [v, v, v + 2]; });
    // (the skull itself is the middle 8 by 8 of the tile: the lower half, between 4 and 12 across)
    for (let y = 10; y < 12; y++) { p.set(5, y, [8, 8, 8]); p.set(6, y, [8, 8, 8]); p.set(9, y, [8, 8, 8]); p.set(10, y, [8, 8, 8]); }
    p.set(7, 12, [14, 14, 14]); p.set(8, 12, [14, 14, 14]);
    for (let x = 5; x < 11; x += 2) p.set(x, 14, [14, 14, 14]);
  },
  beacon: (p) => {
    const n = vnoise(p.r, 4);
    p.each((x, y) => { const d = Math.hypot(x - 7.5, y - 7.5) / 9; return mix([220, 255, 255], [96, 214, 230], Math.min(1, d + n(x, y) * 0.25)); });
  },
});

const CRACKS = crackPixels();
for (let s = 0; s < 10; s++) {
  PAINTERS['destroy_' + s] = (p) => {
    p.clear();
    const n = Math.ceil(CRACKS.length * (s + 1) / 10);
    for (let i = 0; i < n; i++) p.set(CRACKS[i][0], CRACKS[i][1], [20, 20, 20], 210);
  };
}

// Transparent pixels take the tile's average colour so mipmaps don't darken edges
function bleed(d) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  if (!n || n === 256) return;
  r /= n; g /= n; b /= n;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 0) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
}

export function buildTextures() {
  let layer = 0;
  for (const [name, fn] of Object.entries(PAINTERS)) {
    const t = new Tile(hashString(name));
    fn(t);
    if (!name.startsWith('destroy_')) bleed(t.d);
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    c.getContext('2d').putImageData(new ImageData(t.d, 16, 16), 0, 0);
    TEX[name] = layer;
    TILES[layer] = c;
    layer++;
  }
  // Resolve per-face layers: faces are +x, -x, +y, -y, +z, -z
  for (const b of BLOCKS) {
    if (!b) continue;
    if (b.id === 0) { b.faces = [0, 0, 0, 0, 0, 0]; continue; }
    const t = typeof b.tex === 'string' ? { top: b.tex, bottom: b.tex, side: b.tex } : b.tex;
    const side = TEX[t.side], top = TEX[t.top], bottom = TEX[t.bottom];
    if (side === undefined || top === undefined || bottom === undefined) console.warn('missing texture', b.key);
    b.faces = [side, side, top, bottom, side, side];
    b.front = t.front ? TEX[t.front] : side;
    if (b.key === 'crafting_table') { b.faces[4] = b.front; b.faces[5] = b.front; }
  }
}

// Raw RGBA data for a WebGL texture array (rows flipped so v=0 is the bottom)
export function atlasData() {
  const n = TILES.length;
  const data = new Uint8Array(16 * 16 * 4 * n);
  for (let l = 0; l < n; l++) {
    const img = TILES[l].getContext('2d').getImageData(0, 0, 16, 16).data;
    for (let y = 0; y < 16; y++) {
      const src = (15 - y) * 64;
      data.set(img.subarray(src, src + 64), l * 1024 + y * 64);
    }
  }
  return { data, layers: n };
}

// ---------------------------------------------------------------- item art
export function drawAscii(rows, pal, size = 16) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  let minX = size, maxX = -1, minY = size, maxY = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '.' && row[x] !== ' ') { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
  });
  const ox = Math.floor((size - (maxX - minX + 1)) / 2) - minX;
  const oy = Math.floor((size - (maxY - minY + 1)) / 2) - minY;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      g.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
      g.fillRect(x + ox, y + oy, 1, 1);
    }
  });
  return c;
}

const ART = {
  sword: [
    '................', '.............OOO', '............OLLO', '...........OLHO.',
    '..........OLHO..', '.........OLHO...', '........OLHO....', '.......OLHO.....',
    '..OO..OLHO......', '..OhOOLHO.......', '...OhHHO........', '....OhO.........',
    '...OSOhO........', '..OSO.OhO.......', '.OSO...OO.......', '.OO.............',
  ],
  pickaxe: [
    '................', '.....OOOOOO.....', '....OLLLLHHO....', '.....OOOOhHHO...',
    '........OShHO...', '.......OSO.OhO..', '......OSO..OhHO.', '.....OSO....OhO.',
    '....OSO.....OhO.', '...OSO......OhO.', '..OSO........O..', '.OSO............',
    '.OO.............',
  ],
  axe: [
    '................', '.......OOO......', '......OLLHO.....', '.....OLHHHhO....',
    '.....OLHHSSO....', '......OHSShO....', '.......OSOhO....', '......OSO.O.....',
    '.....OSO........', '....OSO.........', '...OSO..........', '..OSO...........',
    '..OO............',
  ],
  shovel: [
    '................', '...........OOO..', '..........OLLHO.', '.........OLHHHO.',
    '.........OHHHhO.', '........OSOhhO..', '.......OSO.OO...', '......OSO.......',
    '.....OSO........', '....OSO.........', '...OSO..........', '..OSO...........',
    '.OSO............', '.OO.............',
  ],
  stick: [
    '...........OO...', '..........OSsO..', '.........OSsO...', '........OSsO....',
    '.......OSsO.....', '......OSsO......', '.....OSsO.......', '....OSsO........',
    '...OSsO.........', '...OOO..........',
  ],
  lump: [
    '.....OOOO.......', '....OLHHHO......', '...OLHHhHHO.....', '...OHHHHHhO.....',
    '..OHHhHHHHHO....', '..OHHHHHhHHO....', '..OHhHHHHHhO....', '...OHHHHHHO.....',
    '....OhHHhO......', '.....OOOO.......',
  ],
  shield: [
    '..OOOOOOOOOOOO..', '..OHHHHLLHHHHO..', '..OHHHHLLHHHHO..', '..OHHHHLLHHHHO..', '..OLLLLLLLLLLO..', '..OLLLLLLLLLLO..',
    '..OhhhhLLhhhhO..', '..OhhhhLLhhhhO..', '..OhhhhLLhhhhO..', '...OhhhLLhhhO...', '...OhhhLLhhhO...', '....OhhLLhhO....',
    '.....OhLLhO.....', '......OLLO......', '.......OO.......',
  ],
  ingot: [
    '........OOOOO...', '......OOLLLLLO..', '....OOLLLLLLHO..', '..OOLLLLLLLHHhO.',
    '..OHHHHHHHHHhO..', '..OhHHHHHHHhO...', '..OhhhhhhhhO....', '...OOOOOOOO.....',
  ],
  gem: [
    '....OOOOOOOO....', '...OLLHHHHLLO...', '..OLLHHHHHHHLO..', '.OLHHHHHHHHHHhO.',
    '.OOOOOOOOOOOOOO.', '..OhHHHHHHHHhO..', '...OhHHHHHHhO...', '....OhHHHHhO....',
    '.....OhHHhO.....', '......OhhO......', '.......OO.......',
  ],
  dust: [
    '.......O........', '......OHO...O...', '..O..OHLHO.OHO..', '.OHO.OHHHOOHHO..',
    '..O.OHHhHHHHhO..', '...OHHHHHhHHHO..', '..OHHhHHHHHHhHO.', '..OHHHHHhHHHHHO.',
    '...OOOOOOOOOOO..',
  ],
  apple: [
    '.......Os.......', '.......OsGG.....', '....OOOsOOO.....', '...OHHHOHHHO....',
    '..OHLHHHHHHhO...', '..OHLHHHHHHhO...', '..OHHHHHHHHhO...', '..OHHHHHHHhhO...',
    '...OHHHHHhhO....', '...OhHHHhhhO....', '....OhhOhhO.....', '.....OO.OO......',
  ],
  meat: [
    '.....OOOOO......', '....OFFFFFO.....', '...OFHHHHHFO....', '...OFHhHHHHFO...',
    '...OFHHHHhHHFO..', '....OFHHHHHHFO..', '....OFHHhHHHFO..', '.....OFHHHHFO...',
    '......OFFFFO....', '.......OOOO.....',
  ],
  drumstick: [
    '....OOOO........', '...OHHHHO.......', '..OHLHHHHO......', '..OHHHHHhO......',
    '..OHHHHhhO......', '...OHHhhO.......', '....OOOBO.......', '.......OBO......',
    '........OBOO....', '.........OBBO...', '.........OBBO...', '..........OO....',
  ],
  bone: [
    '...........OO...', '..........OBBO..', '.........OBBBO..', '........OBBBO...',
    '.......OBBO.....', '......OBBO......', '.....OBBO.......', '....OBBO........',
    '..OBBBO.........', '.OBBBO..........', '..OBO...........', '...O............',
  ],
  string: [
    '.........WW.....', '........W..W....', '.......W....W...', '......W......W..',
    '.....W..........', '....W...........', '...W............', '.WW.............',
  ],
  feather: [
    '............OO..', '...........OWWO.', '..........OWWWO.', '.........OWWWO..',
    '........OWWWO...', '.......OWWWO....', '......OWWWO.....', '.....OWWWO......',
    '....OWWsO.......', '...OWWsO........', '....OsO.........', '...Os...........',
    '..Os............',
  ],
  leather: [
    '...OO....OO.....', '..OHHOOOOHHO....', '..OHHHHHHHHO....', '...OHHHHHHO.....',
    '...OHHhHHHO.....', '...OHHHHhHO.....', '..OHHHHHHHHO....', '..OHHOOOOHHO....',
    '...OO....OO.....',
  ],
  arrow: [
    '...........OOO..', '...........OLHO.', '..........OLHHO.', '.........OSOOO..',
    '........OSO.....', '.......OSO......', '......OSO.......', '.....OSO........',
    '....OSO.........', '.WWOSO..........', '.WWSO...........', '..WWW...........',
    '...WW...........',
  ],
  bow: [
    '...OOOOO........', '..OSSSSSOO......', '..OW....SSO.....', '...OW....OSO....',
    '....OW....OSO...', '.....W.....OSO..', '......W.....OSO.', '.......W....OSO.',
    '........W...OSO.', '.........W..OSO.', '..........W.OSO.', '...........WOSO.',
    '............OSO.', '.............O..',
  ],
  flint_and_steel: [
    '..OOOO..........', '.OIIIIO.........', '.OI..IO.........', '.OI..IO..OOO....',
    '.OIIIIO.OFFFO...', '..OIIO..OFFFFO..', '...OIO.OFFFFFO..', '....OO.OFFFFO...',
    '.......OFFFO....', '........OOO.....',
  ],
};

Object.assign(ART, {
  bucket: [
    '................', '..OOOOOOOOOOOO..', '..OLFFFFFFFFhO..', '..OHFFFFFFFFhO..', '...OHHHHHHHhO...',
    '...OHHHHHHHhO...', '....OHHHHHhO....', '....OHHHHHhO....', '.....OOOOOO.....',
  ],
  nugget: ['.....OOO........', '....OLHHO.......', '...OHHHHO.......', '...OHHHO........', '....OOO.........'],
  tear: ['.......O........', '......OWO.......', '.....OWLWO......', '....OWLLLWO.....', '....OWWLWWO.....', '.....OWWWO......', '......OOO.......'],
  shell: ['...OOOOOOOOOO...', '..OLLHHHHHHHhO..', '.OLHHHHHHHHHHhO.', '.OHHHHHHHHHHHhO.', '.OhhhhhhhhhhhhO.', '..OOOOOOOOOOOO..'],
  skull: [
    '...OOOOOOOOOO...', '..OHHHHHHHHHHO..', '..OHHHHHHHHHHO..', '..OHEEHHHHEEhO..', '..OHEEHHHHEEhO..',
    '..OHHHHHHHHHhO..', '..OHHHHEEHHHhO..', '..OhHHHHHHHhhO..', '...OhEhEhEhhO...', '....OOOOOOOO....',
  ],
  hoe: [
    '................', '......OOOOO.....', '.....OHHHHhO....', '......OOOSHO....',
    '........OSO.....', '.......OSO......', '......OSO.......', '.....OSO........',
    '....OSO.........', '...OSO..........', '..OSO...........', '..OO............',
  ],
  helmet: [
    '....OOOOOOOO....', '...OHHHHHHHHO...', '..OHLHHHHHHHhO..', '..OHLHHHHHHHhO..',
    '..OHHOOOOOOHhO..', '..OHO......OhO..', '..OHO......OhO..', '..OOO......OOO..',
  ],
  chestplate: [
    '..OOO......OOO..', '.OHHHO....OHHHO.', '.OHLHHOOOOHHHhO.', '.OHLHHHHHHHHHhO.',
    '..OOLHHHHHHhOO..', '....OLHHHHhO....', '....OHHHHHhO....', '....OHHHHHhO....',
    '....OHHHHHhO....', '....OHHHHHhO....', '....OhhhhhhO....', '....OOOOOOOO....',
  ],
  leggings: [
    '...OOOOOOOOOO...', '...OHHHHHHHHO...', '...OHLHHHHHhO...', '...OHLHOOHHhO...',
    '...OHLHOOHHhO...', '...OHHO..OHhO...', '...OHHO..OHhO...', '...OHHO..OHhO...',
    '...OHHO..OHhO...', '...OhhO..OhhO...', '...OOOO..OOOO...',
  ],
  boots: [
    '...OOO....OOO...', '...OHO....OHO...', '...OHO....OHO...', '...OHO....OHO...',
    '..OHHO....OHHO..', '.OHLHO....OHLHO.', '.OHHhO....OHHhO.', '.OOOOO....OOOOO.',
  ],
  seeds: [
    '......O...O.....', '.....OSO.OSO....', '......O...O.....', '..O.............',
    '.OSO.....O......', '..O.....OSO.....', '.........O......', '....O...........',
    '...OSO......O...', '....O......OSO..', '............O...',
  ],
  wheat: [
    '.....Y.Y.Y......', '....YYYYYYY.....', '...YYGYYYGYY....', '....YYYYYYY.....',
    '.....YGYGY......', '......YYY.......', '......SSS.......', '......SGS.......',
    '.....SSGSS......', '....SS.G.SS.....', '...SS..G..SS....', '..SS...G...SS...',
    '..S....G....S...',
  ],
  bread: [
    '....OOOOOOOO....', '..OOLLLHLLLHOO..', '.OLLHHHLHHHLHHO.', '.OHHHHHHHHHHHhO.',
    '.OHHHHHHHHHHhhO.', '..OhhhhhhhhhhO..', '...OOOOOOOOOO...',
  ],
  map: [
    '................', '.OOOOOOOOOOOOOO.', '.OWWWWWWWWWWWWO.', '.OWGGWWWWBBBWWO.', '.OWGGGWWBBBBBWO.', '.OWWGGWWWBBBWWO.',
    '.OWWWWLWWWWWWWO.', '.OWWLLWWWWRWRWO.', '.OWLWWWWWWWRWWO.', '.OWWLLLLWWRWRWO.', '.OWWWWWWLLWWWWO.', '.OWBBWWWWWWGGWO.',
    '.OWBBBWWWWGGGWO.', '.OWWWWWWWWWWWWO.', '.OOOOOOOOOOOOOO.', '................',
  ],
  star: [
    '................', '.......OO.......', '......OLLO......', '......OLHO......', '.OOOOOLHHOOOOOO.', '.OLLLLHHHHHHHhO.',
    '..OLHHHHHHHHhO..', '...OHHHHHHHhO...', '....OHHHHHhO....', '....OHHHHHhO....', '...OHHHhOHHhO...', '...OHHhO.OHhO...',
    '..OHhOO...OOhO..', '..OOO.......OO..', '................', '................',
  ],
  paper: [
    '....OOOOOOOO....', '....OWWWWWWO....', '....OWLLLLWO....', '....OWWWWWWO....',
    '....OWLLLLWO....', '....OWWWWWWO....', '....OWLLLLWO....', '....OWWWWWWO....',
    '....OWLLLWWO....', '....OWWWWWWO....', '....OOOOOOOO....',
  ],
  book: [
    '...OOOOOOOOOO...', '...ORRRRRRRRWO..', '...ORGGGGGRRWO..', '...ORRRRRRRRWO..',
    '...ORRRRRRRRWO..', '...ORRRRRRRRWO..', '...ORRRRRRRRWO..', '...ORRRRRRRRWO..',
    '...ORRRRRRRRWO..', '...OOOOOOOOOWO..', '....OOOOOOOOOO..',
  ],
  membrane: [
    '..OOO......OOO..', '..OMMO....OMMO..', '..OMMMOOOOMMMO..', '...OMMMMMMMMO...',
    '...OMLMMMMLMO...', '....OMMMMMMO....', '.....OMMMMO.....', '......OMMO......',
    '.......OO.......',
  ],
  pearl: [
    '.....OOOO.......', '....OTTTTO......', '...OTLLTTTO.....', '...OTLTTTTO.....',
    '...OTTTTTTO.....', '...OTTTTTdO.....', '....OTTTdO......', '.....OOOO.......',
  ],
  potion: [
    '......OOO.......', '......OWO.......', '......OWO.......', '.....OWWWO......',
    '....OPPPPPO.....', '...OPLPPPPPO....', '...OPLPPPPPO....', '...OPPPPPPPO....',
    '...OPPPPPPPO....', '....OPPPPPO.....', '.....OOOOO......',
  ],
  bed: [
    '.OWWWRRRRRRRRRO.', '.OWWWRRRRRRRRRO.', '.ORRRRRRRRRRRRO.', '.OBBBBBBBBBBBBO.',
    '.OB..........BO.',
  ],
  door: [
    '....OOOOOOOO....', '....OPPPPPPO....', '....OPWWWWPO....', '....OPWWWWPO....',
    '....OPPPPPPO....', '....OPPPPPPO....', '....OPPPPPPO....', '....OPPPPKPO....',
    '....OPPPPPPO....', '....OPPPPPPO....', '....OPPPPPPO....', '....OOOOOOOO....',
  ],
  sign: [
    '.OOOOOOOOOOOOOO.', '.OPPPPPPPPPPPPO.', '.OPKKPKKKPKKKPO.', '.OPPPPPPPPPPPPO.', '.OPKKKPKKPKKPPO.', '.OPPPPPPPPPPPPO.',
    '.OPKKPKKKKPKPPO.', '.OPPPPPPPPPPPPO.', '.OOOOOOOOOOOOOO.', '......OSSO......', '......OSSO......', '......OSSO......',
    '......OSSO......', '......OOOO......',
  ],
  fence: [
    '...OO......OO...', '..OPPO....OPPO..', '..OPPOOOOOOPPO..', '..OPPPPPPPPPPO..',
    '..OPPOOOOOOPPO..', '..OPPO....OPPO..', '..OPPOOOOOOPPO..', '..OPPPPPPPPPPO..',
    '..OPPOOOOOOPPO..', '..OPPO....OPPO..', '..OPPO....OPPO..', '..OOOO....OOOO..',
  ],
});
// 1.7: fishing, the crossbow and the trident
Object.assign(ART, {
  fishing_rod: [
    '..............SO', '.............SOW', '............SO.W', '...........SO..W',
    '..........SO...W', '.........SO....W', '........SO.....W', '.......SO......W',
    '......SO.......W', '.....SO......ORO', '....SO.......ORO', '...SO.........O.',
    '..SO............', '.SO.............', 'SO..............',
  ],
  crossbow: [
    '.OOOOOOOOO......', 'OSSSSSSSSSO.....', 'OSOWWWWWWOSO....', 'OSW.OIIO.WSO....',
    'OSW..OSO..WO....', 'OSW..OSSO.W.....', 'OSW...OSSOW.....', 'OSW....OSSO.....',
    'OSOW....OSSO....', '.OSOWWWW.OSSO...', '..OSSSO...OSSO..', '...OOO.....OSSO.',
    '............OSO.', '.............O..',
  ],
  trident: [
    '..........O..O.O', '.........OLO.OLO', '..........OLOLHO', '.......O...OLHO.',
    '......OLO.OLHO..', '.......OLOLHHO..', '........OLHHOO..', '.......OSOLO....',
    '......OSO.OLO...', '.....OSO...O....', '....OSO.........', '...OSO..........',
    '..OSO...........', '.OSO............', '.OO.............',
  ],
  fish: [
    '.....OOOOOO.....', '...OOHHHHHHOO.OO', '..OHLHHHHHHHHOHO', '.OHEHHHHHHHHHHHO',
    '..OHHHHHHHHHHOHO', '...OOhhhhhhOO.OO', '.....OOOOOO.....',
  ],
  anvil: [
    '.OOOOOOOOOOOOOO.', '.OLLLLLLLLLLLhO.', '.OHHHHHHHHHHHhO.', '..OOhHHHHHhOOO..',
    '....OHHHHhO.....', '....OHHHHhO.....', '...OHHHHHHhO....', '..OLLLLLLLLhO...',
    '..OHHHHHHHHhO...', '..OOOOOOOOOOO...',
  ],
  beacon: [
    '................', '..OOOOOOOOOOOO..', '..OWWWWWWWWWWO..', '..OWLLWWWWWWWO..', '..OWLOOOOOOWWO..', '..OWWOCCCCOWWO..',
    '..OWWOCLLCOWWO..', '..OWWOCLLCOWWO..', '..OWWOCCCCOWWO..', '..OWWOOOOOOWWO..', '..OWWWWWWWWWWO..', '..OWBBBBBBBBWO..',
    '..OWBBBBBBBBWO..', '..OOOOOOOOOOOO..', '................', '................',
  ],
  cauldron: [
    '.OOOOOOOOOOOOOO.', '.OLO........OhO.', '.OHO........OhO.', '.OHO........OhO.',
    '.OHO........OhO.', '.OHO........OhO.', '.OHOOOOOOOOOOhO.', '.OHHHHHHHHHHHhO.',
    '.OhhhhhhhhhhhhO.', '.OOO........OOO.', '.OhO........OhO.', '.OOO........OOO.',
  ],
  brewing_stand: [
    '.......OO.......', '......OYYO......', '......OYYO......', '..OO..OYYO..OO..',
    '.OWWO.OYYO.OWWO.', '.OWWO.OYYO.OWWO.', 'OPPPPOOYYOOPPPPO', 'OPLPPOOYYOOPLPPO',
    'OPPPPOOYYOOPPPPO', '.OOOOOOOOOOOOOO.', '.OGGGGGGGGGGGGO.', '.OOOOOOOOOOOOOO.',
  ],
});
const BLOCK_ART_PAL = {
  bed: { O: [60, 30, 20], W: [236, 236, 230], R: [176, 34, 32], B: [120, 88, 50] },
  door: { O: [80, 58, 32], P: [168, 134, 80], W: [190, 220, 230], K: [60, 60, 60] },
  fence: { O: [80, 58, 32], P: [168, 134, 80] },
  sign: { O: [80, 58, 32], P: [176, 142, 88], K: [70, 52, 30], S: [137, 103, 55] },
  anvil: { O: [22, 22, 26], H: [74, 74, 80], h: [50, 50, 56], L: [110, 110, 118] },
  cauldron: { O: [20, 20, 24], H: [62, 62, 68], h: [42, 42, 48], L: [96, 96, 104] },
  beacon: { O: [70, 110, 130], W: [206, 236, 244], C: [110, 226, 240], L: [240, 255, 255], B: [26, 20, 36] },
  brewing_stand: { O: [40, 34, 20], Y: [226, 190, 70], W: [200, 220, 232], P: [150, 40, 160], L: [232, 124, 242], G: [128, 128, 128] },
};
const ARMOR_PAL = {
  leather: [[150, 86, 44], [100, 56, 26], [192, 122, 72]],
  chainmail: [[136, 136, 140], [78, 78, 82], [200, 200, 206]],
};
const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];

// Faint outline of an armour piece, shown in empty armour slots
export function armorSilhouette(slot) {
  const g = [120, 120, 120];
  return drawAscii(ART[ARMOR_SLOTS[slot]], { O: [96, 96, 96], H: g, h: g, L: g }).toDataURL();
}

// The faint shield drawn in the empty off-hand slot
export function shieldSilhouette() {
  const g = [120, 120, 120];
  return drawAscii(ART.shield, { O: [96, 96, 96], H: g, h: g, L: g }).toDataURL();
}

const STICK = { S: [137, 103, 55], s: [96, 70, 34] };
const OUT = [34, 26, 18];
const pal3 = (H, h, L, extra = {}) => ({ O: OUT, H, h, L, ...extra });
const ITEM_ART = {
  stick: ['stick', { O: OUT, ...STICK }],
  coal: ['lump', pal3([52, 52, 52], [26, 26, 26], [96, 96, 96], { O: [14, 14, 14] })],
  charcoal: ['lump', pal3([74, 60, 46], [46, 36, 28], [112, 94, 76])],
  flint: ['lump', pal3([72, 72, 74], [42, 42, 44], [132, 132, 138], { O: [20, 20, 22] })],
  clay_ball: ['lump', pal3([165, 170, 184], [130, 134, 148], [202, 206, 216], { O: [90, 94, 104] })],
  lapis_lazuli: ['lump', pal3([40, 72, 194], [24, 44, 130], [96, 128, 234], { O: [14, 24, 70] })],
  iron_ingot: ['ingot', pal3([210, 210, 210], [140, 140, 140], [246, 246, 246], { O: [70, 70, 70] })],
  gold_ingot: ['ingot', pal3([250, 214, 60], [200, 144, 20], [255, 248, 170], { O: [110, 70, 10] })],
  copper_ingot: ['ingot', pal3([214, 120, 80], [160, 78, 48], [246, 170, 128], { O: [90, 40, 24] })],
  shield: ['shield', pal3([156, 116, 64], [118, 86, 44], [206, 206, 212], { O: [44, 32, 18] })],
  brick: ['ingot', pal3([172, 82, 56], [122, 56, 38], [204, 112, 82], { O: [70, 30, 20] })],
  diamond: ['gem', pal3([82, 230, 220], [38, 168, 158], [212, 255, 250], { O: [16, 80, 76] })],
  redstone: ['dust', pal3([204, 22, 12], [132, 10, 6], [255, 86, 64], { O: [70, 6, 4] })],
  gunpowder: ['dust', pal3([112, 112, 112], [72, 72, 72], [164, 164, 164], { O: [40, 40, 40] })],
  apple: ['apple', pal3([222, 32, 32], [150, 16, 20], [255, 152, 152], { s: [100, 70, 30], G: [60, 150, 40], O: [70, 10, 10] })],
  porkchop: ['meat', pal3([240, 150, 150], [202, 102, 112], null, { F: [250, 230, 225], O: [110, 50, 50] })],
  cooked_porkchop: ['meat', pal3([192, 122, 72], [142, 82, 46], null, { F: [232, 202, 150], O: [80, 44, 20] })],
  beef: ['meat', pal3([202, 52, 52], [150, 30, 36], null, { F: [240, 210, 210], O: [90, 20, 20] })],
  steak: ['meat', pal3([142, 86, 50], [100, 56, 30], null, { F: [202, 162, 112], O: [60, 32, 14] })],
  mutton: ['meat', pal3([212, 82, 72], [160, 50, 46], null, { F: [240, 230, 220], O: [100, 30, 26] })],
  cooked_mutton: ['meat', pal3([162, 96, 60], [122, 66, 40], null, { F: [212, 182, 132], O: [70, 40, 18] })],
  rotten_flesh: ['meat', pal3([122, 142, 72], [90, 102, 50], null, { F: [162, 122, 92], O: [50, 56, 24] })],
  chicken: ['drumstick', pal3([242, 192, 172], [210, 150, 130], [255, 226, 212], { B: [240, 240, 230], O: [120, 80, 70] })],
  cooked_chicken: ['drumstick', pal3([202, 142, 70], [150, 96, 46], [232, 182, 112], { B: [240, 236, 222], O: [90, 56, 20] })],
  bone: ['bone', { O: [96, 96, 88], B: [236, 236, 226] }],
  string: ['string', { W: [240, 240, 240] }],
  feather: ['feather', { O: [120, 120, 120], W: [246, 246, 246], s: [200, 200, 200] }],
  leather: ['leather', pal3([142, 86, 46], [106, 62, 30], [170, 110, 60], { O: [60, 34, 14] })],
  arrow: ['arrow', { O: OUT, ...STICK, L: [214, 214, 214], H: [140, 140, 140], W: [242, 242, 242] }],
  bow: ['bow', { O: OUT, ...STICK, W: [222, 222, 222] }],
  flint_and_steel: ['flint_and_steel', { O: OUT, I: [176, 176, 176], F: [64, 64, 66] }],
  emerald: ['gem', pal3([60, 206, 96], [26, 140, 60], [180, 255, 200], { O: [10, 70, 30] })],
  wheat_seeds: ['seeds', { O: [60, 90, 20], S: [110, 160, 50] }],
  wheat: ['wheat', { Y: [220, 190, 70], G: [160, 128, 40], S: [190, 168, 60] }],
  bread: ['bread', { O: [90, 50, 20], H: [200, 140, 60], L: [232, 182, 102], h: [150, 100, 40] }],
  paper: ['paper', { O: [150, 150, 150], W: [242, 242, 232], L: [190, 190, 190] }],
  book: ['book', { O: [60, 30, 20], R: [120, 60, 40], G: [220, 190, 70], W: [240, 234, 220] }],
  slime_ball: ['lump', pal3([112, 200, 90], [70, 150, 60], [190, 250, 170], { O: [40, 100, 40] })],
  gloom_membrane: ['membrane', { O: [60, 64, 90], M: [150, 160, 190], L: [206, 214, 232] }],
  shade_pearl: ['pearl', { O: [16, 40, 40], T: [40, 120, 110], L: [130, 226, 206], d: [20, 70, 60] }],
  potion: ['potion', { O: [40, 40, 50], W: [200, 220, 232], P: [150, 40, 160], L: [232, 124, 242] }],
  bucket: ['bucket', { O: [60, 60, 64], H: [206, 206, 210], h: [150, 150, 156], L: [240, 240, 244], F: [44, 44, 48] }],
  water_bucket: ['bucket', { O: [60, 60, 64], H: [206, 206, 210], h: [150, 150, 156], L: [240, 240, 244], F: [52, 96, 220] }],
  lava_bucket: ['bucket', { O: [60, 60, 64], H: [206, 206, 210], h: [150, 150, 156], L: [240, 240, 244], F: [240, 120, 20] }],
  cinder_rod: ['stick', { O: [120, 60, 10], S: [255, 210, 70], s: [230, 140, 30] }],
  cinder_powder: ['dust', pal3([250, 190, 50], [214, 120, 20], [255, 240, 150], { O: [120, 60, 10] })],
  shade_eye: ['pearl', { O: [16, 40, 30], T: [60, 150, 90], L: [180, 240, 160], d: [10, 30, 20] }],
  nether_quartz: ['gem', pal3([236, 228, 218], [196, 186, 176], [255, 255, 250], { O: [120, 110, 100] })],
  gold_nugget: ['nugget', { O: [120, 80, 10], H: [250, 214, 60], L: [255, 250, 180] }],
  nether_brick: ['ingot', pal3([86, 38, 46], [58, 24, 32], [120, 60, 70], { O: [30, 12, 16] })],
  magma_cream: ['lump', pal3([214, 120, 30], [150, 60, 20], [255, 214, 90], { O: [60, 20, 10] })],
  wailer_tear: ['tear', { O: [150, 180, 190], W: [240, 252, 255], L: [200, 230, 240] }],
  clamper_shell: ['shell', { O: [60, 30, 70], H: [170, 110, 180], h: [120, 70, 130], L: [214, 170, 220] }],
  charred_skull: ['skull', { O: [16, 16, 16], H: [52, 52, 54], h: [30, 30, 32], E: [8, 8, 8] }],
  treasure_map: ['map', { O: [120, 96, 60], W: [226, 208, 160], L: [150, 122, 80], G: [110, 160, 80], B: [80, 130, 200], R: [200, 30, 30] }],
  blight_star: ['star', { O: [60, 70, 90], H: [226, 240, 252], h: [150, 176, 214], L: [255, 255, 255] }],
  golden_apple: ['apple', pal3([250, 214, 60], [204, 150, 24], [255, 248, 180], { s: [100, 70, 30], G: [60, 150, 40], O: [110, 76, 10] })],
  enchanted_book: ['book', { O: [40, 16, 60], R: [134, 62, 196], G: [250, 220, 90], W: [240, 234, 220] }],
  experience_bottle: ['potion', { O: [40, 50, 30], W: [200, 220, 232], P: [150, 214, 40], L: [236, 255, 150] }],
  fishing_rod: ['fishing_rod', { O: OUT, ...STICK, W: [226, 226, 226], R: [200, 40, 40] }],
  crossbow: ['crossbow', { O: OUT, ...STICK, W: [222, 222, 222], I: [176, 176, 180] }],
  trident: ['trident', { O: [16, 60, 56], S: [60, 150, 140], L: [150, 232, 220], H: [84, 190, 178] }],
  cod: ['fish', pal3([196, 170, 126], [150, 124, 86], [230, 212, 176], { E: [20, 20, 20], O: [84, 66, 40] })],
  cooked_cod: ['fish', pal3([226, 214, 190], [186, 170, 140], [246, 240, 226], { E: [60, 50, 40], O: [120, 104, 80] })],
  salmon: ['fish', pal3([214, 92, 76], [160, 60, 52], [240, 150, 130], { E: [20, 20, 20], O: [96, 34, 30] })],
  cooked_salmon: ['fish', pal3([232, 142, 96], [186, 100, 62], [246, 186, 146], { E: [60, 40, 30], O: [120, 62, 34] })],
};
const TOOL_PAL = {
  wooden: [[150, 112, 60], [104, 76, 38], [190, 152, 96]],
  stone: [[128, 128, 128], [88, 88, 88], [170, 170, 170]],
  iron: [[214, 214, 214], [150, 150, 150], [250, 250, 250]],
  golden: [[250, 218, 70], [210, 150, 30], [255, 250, 180]],
  diamond: [[74, 226, 212], [30, 160, 150], [200, 255, 250]],
};

function isoIcon(top, left, right, half = false) {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const T = [32, 2], R = [61, 16.5], M = [32, 31], L = [3, 16.5];
  // (a slab: the top sits halfway down, and only the lower half of each side shows)
  const face = (img, o, u, v, shade, lower) => {
    g.setTransform(u[0] / 16, u[1] / 16, v[0] / 16, v[1] / 16, o[0], o[1]);
    if (lower) g.drawImage(img, 0, 8, 16, 8, 0, 8, 16, 8); else g.drawImage(img, 0, 0);
    if (shade) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(0,0,0,${shade})`;
      g.fillRect(0, lower ? 8 : 0, 16, lower ? 8 : 16);
      g.globalCompositeOperation = 'source-over';
    }
  };
  face(top, half ? [L[0], L[1] + 15] : L, [T[0] - L[0], T[1] - L[1]], [M[0] - L[0], M[1] - L[1]], 0);
  face(left, L, [M[0] - L[0], M[1] - L[1]], [0, 30], 0.22, half);
  face(right, M, [R[0] - M[0], R[1] - M[1]], [0, 30], 0.42, half);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

export function buildIcons() {
  for (const it of ITEMS) {
    if (!it) continue;
    let canvas;
    if (it.isBlock && it.art) {
      canvas = drawAscii(ART[it.art], BLOCK_ART_PAL[it.art]);
    } else if (it.isBlock) {
      if (it.render === RENDER.CUBE || it.render === RENDER.SLAB || it.render === RENDER.MODEL) {
        const f = it.faces;
        canvas = isoIcon(TILES[f[2]], TILES[it.facing ? it.front : f[4]], TILES[f[0]], it.render === RENDER.SLAB);
      } else {
        canvas = TILES[it.faces[0]];
      }
    } else if (it.tool && TOOL_PAL[it.material]) {
      const [H, h, L] = TOOL_PAL[it.material];
      canvas = drawAscii(ART[it.tool], { O: OUT, H, h, L, ...STICK });
    } else if (it.armor) {
      const [H, h, L] = ARMOR_PAL[it.material] || TOOL_PAL[it.material];
      canvas = drawAscii(ART[ARMOR_SLOTS[it.armor.slot]], { O: OUT, H, h, L });
    } else {
      const art = ITEM_ART[it.key];
      canvas = art ? drawAscii(ART[art[0]], art[1]) : drawAscii(ART.lump, pal3([255, 0, 255], [128, 0, 128], [255, 128, 255]));
    }
    ICONS[it.id] = canvas;
  }
}

export function iconURL(id) {
  if (!ICON_URLS[id]) ICON_URLS[id] = ICONS[id] ? ICONS[id].toDataURL() : '';
  return ICON_URLS[id];
}

// Opaque pixel colours of an item icon, used for eating crumbs
const ICON_COLS = [];
export function iconColors(id) {
  if (ICON_COLS[id]) return ICON_COLS[id];
  const c = ICONS[id];
  const out = [];
  if (c) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) out.push([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]);
  }
  ICON_COLS[id] = out.length ? out : [[0.6, 0.4, 0.3]];
  return ICON_COLS[id];
}

// Average colour of a tile, used for particles
const AVG = [];
export function tileColors(layer) {
  if (AVG[layer]) return AVG[layer];
  const d = TILES[layer].getContext('2d').getImageData(0, 0, 16, 16).data;
  const out = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) out.push([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]);
  AVG[layer] = out.length ? out : [[0.5, 0.5, 0.5]];
  return AVG[layer];
}
