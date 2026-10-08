// Weather: fair days with more or less cloud, grey days, rain and thunderstorms, coming and going by
// themselves. Whoever runs the world decides what it is doing; everyone in it sees the same.
// Where you stand decides what falls: rain, snow in the cold lands, and nothing at all in the dry ones.
import * as THREE from 'three';
import { G, isTouchDevice } from './game.js';
import { R } from './render.js';
import { BLOCKS, RENDER } from './blocks.js';
import { BIOME, FROZEN } from './constants.js';
import { mulberry32 } from './noise.js';
import { sfx, rainSound } from './audio.js';

export const KINDS = ['clear', 'cloudy', 'rain', 'thunder'];
const NAMES = { clear: 'clear', cloudy: 'cloudy', rain: 'raining', thunder: 'a thunderstorm' };
// what each does to the sky: overcast, rain, cloud cover, storm darkness
const LOOK = { clear: [0, 0, 0.25, 0], cloudy: [0.55, 0, 0.8, 0], rain: [0.88, 1, 0.94, 0], thunder: [1, 1, 0.98, 1] };
const DRY = new Set([BIOME.DESERT, BIOME.SAVANNA, BIOME.BADLANDS]);

const S = { kind: 'clear', quick: 0, left: 600, bolt: null, boltT: 0, nextBolt: 8, flashes: [], mesh: null, at: null, builtT: 0, fall: 0 };
const wx = { over: 0, rain: 0, cover: 0.3, dark: 0, flash: 0 };
const rnd = (a, b) => a + Math.random() * (b - a);
const MIN = 60;

// How long each kind of weather lasts, and what follows it
function follow(kind) {
  if (kind === 'clear') return Math.random() < 0.55 ? ['cloudy', rnd(1.5, 4) * MIN] : ['rain', rnd(3, 7) * MIN];
  if (kind === 'cloudy') return Math.random() < 0.55 ? ['rain', rnd(3, 7) * MIN] : ['clear', rnd(7, 18) * MIN];
  if (kind === 'rain') return Math.random() < 0.35 ? ['thunder', rnd(2, 5) * MIN] : ['clear', rnd(7, 18) * MIN];
  return ['rain', rnd(1, 2.5) * MIN];
}

export function weatherKind() { return S.kind; }
export function weatherName() { return NAMES[S.kind]; }
// (what is saved with the world, and sent to the players in it)
export function weatherState() { return { k: S.kind, left: Math.round(S.left) }; }

// A world is opened: its weather as it was left; a world from before there was any starts fair, with the
// first change not far off
export function resetWeather(saved) {
  const k = saved && KINDS.includes(saved.k) ? saved.k : 'clear';
  S.kind = k;
  S.left = saved && saved.left > 0 ? saved.left : rnd(3, 7) * MIN;
  const L = LOOK[k];
  wx.over = L[0]; wx.rain = L[1]; wx.cover = L[2]; wx.dark = L[3]; wx.flash = 0;
  S.flashes.length = 0;
  S.nextBolt = rnd(4, 10);
  G.wx = wx;
}

// No weather at all (the picture behind the title)
export function fairWeather() {
  wx.over = wx.rain = wx.dark = wx.flash = 0; wx.cover = 0.3;
  G.wx = wx;
  hideRain();
  rainSound(0);
}

export function setWeather(kind, secs) {
  if (!KINDS.includes(kind)) return false;
  S.kind = kind;
  S.left = secs > 0 ? secs : kind === 'clear' ? rnd(7, 18) * MIN : kind === 'thunder' ? rnd(2, 5) * MIN : rnd(3, 7) * MIN;
  S.quick = 6;   // (weather that is asked for comes in within a few seconds, not drifting over as it does by itself)
  return true;
}
// (a guest is told what the weather is)
export function followWeather(kind, quick) { if (KINDS.includes(kind) && kind !== S.kind) { S.kind = kind; if (quick) S.quick = 6; } }
export const weatherQuick = () => S.quick > 0;

// What falls where the player is: 'rain', 'snow' or nothing
function fallHere() {
  const p = G.player;
  if (!p || G.dim !== 'overworld') return '';
  const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
  const ch = G.world.getChunk(x >> 4, z >> 4);
  const b = ch && ch.biomes ? ch.biomes[(z & 15) * 16 + (x & 15)] : 0;
  if (DRY.has(b)) return '';
  return FROZEN.has(b) || p.pos.y > 112 ? 'snow' : 'rain';
}

export function tickWeather(dt, host) {
  G.wx = wx;
  const here = G.dim === 'overworld';
  if (host && here) {
    S.left -= dt;
    if (S.left <= 0) [S.kind, S.left] = follow(S.kind);
  }
  // the sky drifts towards what the weather calls for; on a fair day the cloud comes and goes
  const L = here ? LOOK[S.kind] : LOOK.clear;
  S.quick = Math.max(0, S.quick - dt);
  const hurry = S.quick > 0 ? 5 : 1;
  const ease = (v, to, rate) => v + Math.max(-rate * hurry * dt, Math.min(rate * hurry * dt, to - v));
  const cover = S.kind === 'clear' ? 0.22 + 0.14 * Math.sin(((G.day || 0) + G.time) * 9.1) + 0.05 * Math.sin(((G.day || 0) + G.time) * 31) : L[2];
  wx.over = ease(wx.over, L[0], 0.07);
  wx.rain = ease(wx.rain, L[1], 0.09);
  wx.cover = ease(wx.cover, cover, 0.05);
  wx.dark = ease(wx.dark, L[3], 0.07);

  // lightning: a bolt somewhere around, the sky lit twice in quick succession, and the thunder after it
  wx.flash = Math.max(0, wx.flash - dt * 3.5);
  for (let i = S.flashes.length - 1; i >= 0; i--) {
    const f = S.flashes[i];
    f.t -= dt;
    if (f.t > 0) continue;
    if (f.flash) wx.flash = Math.max(wx.flash, f.flash);
    if (f.sound) sfx('thunder', null, { vol: f.sound });
    S.flashes.splice(i, 1);
  }
  if (here && S.kind === 'thunder' && wx.dark > 0.6) {
    S.nextBolt -= dt;
    if (S.nextBolt <= 0) { S.nextBolt = rnd(5, 16); strike(); }
  }
  if (S.bolt) {
    S.boltT -= dt;
    S.bolt.visible = S.boltT > 0.16 || (S.boltT > 0.04 && S.boltT < 0.1);
    if (S.boltT <= 0) dropBolt();
  }

  const fall = wx.rain > 0.02 ? fallHere() : '';
  drawRain(dt, fall);
  // (rain is heard clearly under the open sky, muffled under a roof, and not at all deep underground)
  const p = G.player;
  let loud = 0;
  if (fall === 'rain' && p) {
    const sky = G.world.getLight(Math.floor(p.pos.x), Math.floor(p.pos.y + 1.6), Math.floor(p.pos.z))[0];
    loud = wx.rain * (sky >= 15 ? 1 : sky >= 8 ? 0.45 : sky >= 3 ? 0.15 : 0) * (p.headInWater ? 0.2 : 1);
  }
  rainSound(loud);
}

// ---------------------------------------------------------------- lightning
function dropBolt() {
  if (!S.bolt) return;
  R.scene.remove(S.bolt);
  S.bolt.geometry.dispose();
  S.bolt = null;
}

function strike() {
  const p = G.player;
  if (!p) return;
  dropBolt();
  const ang = Math.random() * Math.PI * 2, dist = rnd(24, 110);
  const x = p.pos.x + Math.cos(ang) * dist, z = p.pos.z + Math.sin(ang) * dist;
  let y = Math.min(118, Math.floor(p.pos.y) + 40);
  while (y > 1 && !G.world.getBlock(Math.floor(x), y, Math.floor(z))) y--;
  // a jagged path down from the cloud, drawn as two crossed ribbons
  const pts = [];
  let px = x + rnd(-14, 14), pz = z + rnd(-14, 14);
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const jx = i === steps ? 0 : rnd(-3.5, 3.5) * (1 - t * 0.5), jz = i === steps ? 0 : rnd(-3.5, 3.5) * (1 - t * 0.5);
    pts.push([px + (x - px) * t + jx, 110 + (y + 1 - 110) * t, pz + (z - pz) * t + jz]);
  }
  const pos = [], idx = [];
  const w = 0.3 + dist * 0.006;
  for (let i = 0; i < steps; i++) {
    const a = pts[i], b = pts[i + 1];
    for (const [ox, oz] of [[w, 0], [0, w]]) {
      const o = pos.length / 3;
      pos.push(a[0] - ox, a[1], a[2] - oz, a[0] + ox, a[1], a[2] + oz, b[0] + ox, b[1], b[2] + oz, b[0] - ox, b[1], b[2] - oz);
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xf2f4ff, side: THREE.DoubleSide, fog: false, transparent: true, opacity: 0.95, depthWrite: false }));
  m.frustumCulled = false;
  R.scene.add(m);
  S.bolt = m;
  S.boltT = 0.3;
  // nearer strikes are brighter and louder, and their thunder comes sooner
  const near = 1 - (dist - 24) / 86;
  S.flashes.push({ t: 0, flash: 0.55 + 0.45 * near }, { t: 0.13, flash: 0.4 + 0.4 * near }, { t: 0.25 + dist / 60, sound: 0.45 + 0.55 * near });
}

// ---------------------------------------------------------------- rain and snow
// As in the original: a sheet of falling streaks over each column of blocks around you, from the sky down
// to the first thing in the way, each turned to face you.
const REACH = isTouchDevice ? 6 : 8, SIDE = REACH * 2 + 1, COLS = SIDE * SIDE;
const tops = new Int16Array(COLS), phase = new Float32Array(COLS);

function buildRain() {
  // streaks of rain on the left half of the picture, flakes of snow on the right
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d'), r = mulberry32(9);
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(r() * 32), y = Math.floor(r() * 128), len = 6 + Math.floor(r() * 10);
    g.fillStyle = `rgba(${140 + r() * 40 | 0},${175 + r() * 30 | 0},250,${0.42 + r() * 0.3})`;
    for (const oy of [0, -128]) g.fillRect(x, y + oy, 1, len);
  }
  for (let i = 0; i < 44; i++) {
    const x = 32 + Math.floor(r() * 31), y = Math.floor(r() * 127), big = r() < 0.12;
    g.fillStyle = `rgba(255,255,255,${0.55 + r() * 0.35})`;
    g.fillRect(x, y, big ? 2 : 1, big ? 2 : 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapT = THREE.RepeatWrapping;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COLS * 12), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(COLS * 8), 2));
  geo.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(COLS * 4), 1));
  const idx = new Uint16Array(COLS * 6);
  for (let i = 0; i < COLS; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const r2 = mulberry32(31);
  for (let i = 0; i < COLS; i++) phase[i] = r2();
  S.uniforms = { uMap: { value: tex }, uFall: { value: 0 }, uSnow: { value: 0 }, uLight: { value: 1 }, uAmount: { value: 0 } };
  const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: S.uniforms,
    vertexShader: `attribute float aFade; uniform float uFall; uniform float uSnow; varying vec2 vUv; varying float vFade;
      void main(){ vUv = vec2(uv.x * 0.5 + uSnow * 0.5, uv.y + uFall); vFade = aFade;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uLight; uniform float uAmount; varying vec2 vUv; varying float vFade;
      void main(){ vec4 c = texture2D(uMap, vUv); float a = c.a * vFade * uAmount; if (a < 0.02) discard;
      gl_FragColor = vec4(c.rgb * uLight, a); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  m.frustumCulled = false;
  m.renderOrder = 4;
  m.visible = false;
  R.scene.add(m);
  S.mesh = m;
}

function hideRain() { if (S.mesh) S.mesh.visible = false; }

// The highest thing in a column that rain cannot fall through (0 where the land is not there yet)
const STOPS = new Uint8Array(256);
for (const b of BLOCKS) if (b && b.id && (b.solid || [RENDER.LIQUID, RENDER.CUBE, RENDER.SLAB].includes(b.render))) STOPS[b.id] = 1;
function topOf(x, z) {
  const ch = G.world.getChunk(x >> 4, z >> 4);
  if (!ch) return 0;
  const col = ((z & 15) << 4) | (x & 15), blocks = ch.blocks;
  for (let y = Math.min(127, ch.maxY); y > 0; y--) if (STOPS[blocks[(y << 8) | col]]) return y;
  return 0;
}

function drawRain(dt, fall) {
  if (!fall) { hideRain(); return; }
  if (!S.mesh) buildRain();
  const m = S.mesh, cam = R.camera.position, u = S.uniforms;
  const cx = Math.floor(cam.x), cy = Math.floor(cam.y), cz = Math.floor(cam.z);
  const snow = fall === 'snow';
  S.fall = (S.fall + dt * (snow ? 0.22 : 2.6)) % 64;
  u.uFall.value = S.fall;
  u.uSnow.value = snow ? 1 : 0;
  u.uAmount.value = G.wx.rain * (snow ? 0.9 : 1);
  u.uLight.value = 0.5 + 0.5 * R.look.daylight;
  // how high the ground stands in each column: looked up again when you step to another block, and
  // every so often in case something was built or dug
  S.builtT -= dt;
  const key = cx + ',' + cy + ',' + cz;
  if (S.at !== key || S.builtT <= 0) {
    S.at = key; S.builtT = 0.8;
    for (let dz = -REACH, i = 0; dz <= REACH; dz++) for (let dx = -REACH; dx <= REACH; dx++, i++) tops[i] = topOf(cx + dx, cz + dz);
  }
  const pos = m.geometry.attributes.position.array, uv = m.geometry.attributes.uv.array, fade = m.geometry.attributes.aFade.array;
  const hi = cy + 15, lo = cy - 14;
  for (let dz = -REACH, i = 0; dz <= REACH; dz++) for (let dx = -REACH; dx <= REACH; dx++, i++) {
    const o = i * 12;
    const y0 = Math.max(tops[i] + 1, lo), y1 = hi;
    const ox = cx + dx + 0.5 - cam.x, oz = cz + dz + 0.5 - cam.z, d = Math.hypot(ox, oz);
    if (y0 >= y1 || d > REACH + 0.5) { for (let k = 0; k < 12; k++) pos[o + k] = 0; continue; }
    // turned side on to the line from you to the column
    const nx = d > 0.01 ? -oz / d * 0.5 : 0.5, nz = d > 0.01 ? ox / d * 0.5 : 0;
    const X = cx + dx + 0.5, Z = cz + dz + 0.5;
    pos[o] = X - nx; pos[o + 1] = y0; pos[o + 2] = Z - nz;
    pos[o + 3] = X + nx; pos[o + 4] = y0; pos[o + 5] = Z + nz;
    pos[o + 6] = X + nx; pos[o + 7] = y1; pos[o + 8] = Z + nz;
    pos[o + 9] = X - nx; pos[o + 10] = y1; pos[o + 11] = Z - nz;
    // (the streaks keep their place in the world as you move up and down, and no two columns fall in step)
    const u0 = phase[i] * 0.5, v0 = y0 / 8 + phase[i] * 7, v1 = y1 / 8 + phase[i] * 7;
    const q = i * 8;
    uv[q] = u0; uv[q + 1] = v0; uv[q + 2] = u0 + 0.5; uv[q + 3] = v0; uv[q + 4] = u0 + 0.5; uv[q + 5] = v1; uv[q + 6] = u0; uv[q + 7] = v1;
    // (thinning out with distance, and nothing right in your face)
    const f = Math.min(1 - Math.max(0, (d - REACH * 0.6) / (REACH * 0.4)), Math.max(0, (d - 0.9) / 1.3));
    fade[i * 4] = fade[i * 4 + 1] = fade[i * 4 + 2] = fade[i * 4 + 3] = Math.max(0, f);
  }
  m.geometry.attributes.position.needsUpdate = true;
  m.geometry.attributes.uv.needsUpdate = true;
  m.geometry.attributes.aFade.needsUpdate = true;
  m.visible = true;
}
