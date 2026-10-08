// Three.js setup: chunk shader, sky, sun/moon, clouds, block highlight, first-person hand.
import * as THREE from 'three';
import { G, isTouchDevice } from './game.js';
import { atlasData, TILES, TEX, ICONS } from './textures.js';
import { BLOCKS, ITEMS, B, ID, RENDER } from './blocks.js';
import { smoothstep, mulberry32 } from './noise.js';

THREE.ColorManagement.enabled = false;

export const R = {};

const CHUNK_VS = `
attribute vec4 aTex;
attribute vec4 aColor;
attribute vec2 aLight;
uniform float uTime;
uniform float uWaterLayer;
uniform float uLavaLayer;
uniform vec3 uSunDir;
uniform float uDirK;
uniform mat4 uShadowFromView;
varying vec3 vUv;
varying vec3 vCol;
varying vec4 vL;
varying vec4 vS;
varying vec3 vShadow;
varying vec3 vView;
varying vec3 vCell;
varying vec4 vN;
void main() {
  vec3 pos = position;
  // grass, flowers and leaves stir in the wind (aTex.w says how much this corner moves)
  if (aTex.w > 0.5) {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float k = aTex.w / 255.0, t = uTime * 1.7;
    pos.x += sin(t + wp.x * 0.7 + wp.z * 0.45 + wp.y * 0.35) * 0.9 * k;
    pos.z += cos(t * 0.8 + wp.x * 0.5 - wp.z * 0.6) * 0.75 * k;
  }
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  // (light and shadow are worked out for where a thing stands, not where the wind has pushed it)
  vec4 still = modelViewMatrix * vec4(position, 1.0);
  // sky light, lamp light, how far away, and what it is (1 water, 2 lava)
  vL = vec4(aLight, length(mv.xyz), abs(aTex.z - uWaterLayer) < 0.5 ? 1.0 : abs(aTex.z - uLavaLayer) < 0.5 ? 2.0 : 0.0);
  vUv = vec3(aTex.x / 16.0, aTex.y / 16.0, aTex.z);
  vCol = aColor.rgb;
  // which way this side looks (0-5; 6: a plant, lit from above whichever way it is seen), and 8 more
  // for a side that shines by itself
  float code = floor(aColor.a * 255.0 + 0.5);
  float glow = step(7.5, code);
  float face = code - glow * 8.0;
  float plant = step(5.5, face);
  vec3 n = face < 0.5 ? vec3(1.0, 0.0, 0.0) : face < 1.5 ? vec3(-1.0, 0.0, 0.0) : face < 2.5 ? vec3(0.0, 1.0, 0.0)
    : face < 3.5 ? vec3(0.0, -1.0, 0.0) : face < 4.5 ? vec3(0.0, 0.0, 1.0) : face < 5.5 ? vec3(0.0, 0.0, -1.0) : vec3(0.0, 1.0, 0.0);
  // the shading every side has always had, and a gentler one for when the sun is doing the work
  float shade = face < 1.5 ? 0.6 : face < 2.5 ? 1.0 : face < 3.5 ? 0.5 : face < 5.5 ? 0.8 : 1.0;
  vS = vec4(plant > 0.5 ? 0.7 : max(dot(n, uSunDir), 0.0) * 1.12, mix(shade, sqrt(shade), uDirK), shade, glow);
  vShadow = (uShadowFromView * still).xyz;
  vView = still.xyz * mat3(viewMatrix);
  // where this is among the blocks (east and south wrapped, so the numbers stay small enough to be exact)
  vCell = vec3(mod(modelMatrix[3].x, 256.0), 0.0, mod(modelMatrix[3].z, 256.0)) + position / 16.0;
  vN = vec4(n, plant);
}`;

// (the six views a lamp's shadows are drawn in share one picture, three across and two down; LAMP_A and
// LAMP_B turn a distance from the lamp into the depth stored there)
const LAMP_NEAR = 0.08, LAMP_FAR = 18;
const CHUNK_FS = `
uniform sampler2DArray uAtlas;
uniform sampler2D uShadowMap;
uniform sampler2D uLampMap;
uniform float uShadowOn;
uniform float uShadowTexel;
uniform mat3 uShadowLin;
uniform vec4 uLamp;
uniform vec3 uLampCell;
uniform float uLampLevel;
uniform float uDaylight;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlphaTest;
uniform float uGamma;
uniform float uAmbient;
uniform vec3 uSkyLight;
uniform vec3 uSunLight;
uniform vec3 uSunDir;
uniform vec3 uSkyGlow;
uniform float uTime;
varying vec3 vUv;
varying vec3 vCol;
varying vec4 vL;
varying vec4 vS;
varying vec3 vShadow;
varying vec3 vView;
varying vec3 vCell;
varying vec4 vN;
float curve(float l) { return mix(l / (4.0 - 3.0 * l), l, uGamma); }
// how much of the sun reaches this point: four readings of the shadow map, blended, for a soft edge
float sunAt(vec3 sc) {
  vec2 t = sc.xy / uShadowTexel - 0.5;
  vec2 f = fract(t);
  vec2 base = (floor(t) + 0.5) * uShadowTexel;
  float z = sc.z - 0.00006;
  float a = step(z, texture2D(uShadowMap, base).r);
  float b = step(z, texture2D(uShadowMap, base + vec2(uShadowTexel, 0.0)).r);
  float c = step(z, texture2D(uShadowMap, base + vec2(0.0, uShadowTexel)).r);
  float d = step(z, texture2D(uShadowMap, base + vec2(uShadowTexel)).r);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// whether the lamp can see a point (v: from the lamp to it), by the one of its six views that looks that way
float lampSees(vec3 v, float back) {
  vec3 a = abs(v);
  float m = max(a.x, max(a.y, a.z));
  vec3 F, U;
  float tile;
  if (a.x >= a.y && a.x >= a.z) { F = vec3(sign(v.x), 0.0, 0.0); U = vec3(0.0, 1.0, 0.0); tile = v.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z) { F = vec3(0.0, sign(v.y), 0.0); U = vec3(0.0, 0.0, sign(v.y)); tile = v.y > 0.0 ? 2.0 : 3.0; }
  else { F = vec3(0.0, 0.0, sign(v.z)); U = vec3(0.0, 1.0, 0.0); tile = v.z > 0.0 ? 4.0 : 5.0; }
  vec2 uv = clamp(vec2(dot(v, cross(F, U)), dot(v, U)) / m * 0.5 + 0.5, 0.003, 0.997);
  vec2 at = (vec2(mod(tile, 3.0), floor(tile / 3.0)) + uv) / vec2(3.0, 2.0);
  float mm = max(m - back, 0.1);
  float depth = 0.5 * (${((LAMP_FAR + LAMP_NEAR) / (LAMP_FAR - LAMP_NEAR)).toFixed(6)} - ${(2 * LAMP_FAR * LAMP_NEAR / (LAMP_FAR - LAMP_NEAR)).toFixed(6)} / mm) + 0.5;
  return step(depth, texture2D(uLampMap, at).r);
}
void main() {
  vec4 c;
  float sky = vL.x, blk = vL.y;
  bool water = vL.w > 0.5 && vL.w < 1.5, lava = vL.w > 1.5;
  bool surface = water && vN.y > 0.5;
  if (lava) c = texture(uAtlas, vec3(vUv.x, vUv.y - uTime * 0.08, vUv.z));   // lava creeps
  else if (surface) c = texture(uAtlas, vec3(vUv.x + uTime * 0.012, vUv.y - uTime * 0.03, vUv.z));   // still water drifts
  else if (water) c = texture(uAtlas, vec3(vUv.x, vUv.y - uTime * 0.35, vUv.z));   // and falls
  else c = texture(uAtlas, vUv);
  if (c.a < uAlphaTest) discard;
  // Shadows keep to the dots of the thing they fall on: each dot of its texture is looked up as one
  // point (its middle, a hair off the surface), so a shadow's edge runs along the dots and never
  // wavers across them. A plant is looked up a little towards the light, so as not to shade itself.
  vec3 n = vN.xyz;
  vec3 snap = (floor((vCell + n * 0.02) * 16.0) + 0.5) / 16.0 - vCell;
  // the sun (or the moon): read from the shadow map around you, and guessed from the open sky further off
  float open = smoothstep(0.7, 0.97, sky);
  float lit = open;
  if (uShadowOn > 0.5) {
    vec3 sc = vShadow + uShadowLin * (snap + uSunDir * (0.8 * vN.w));
    vec2 e = abs(sc.xy - 0.5) * 2.0;
    float edge = smoothstep(0.8, 0.98, max(max(e.x, e.y), abs(sc.z - 0.5) * 2.0));
    if (edge < 1.0) lit = mix(sunAt(sc) * smoothstep(0.12, 0.45, sky), open, edge);
  }
  // The nearest lamp casts shadows too. Lamp light spreads from block to block and knows nothing of what
  // stands in its way, so where this lamp is the one lighting a spot (the light there is what the lamp
  // would give with nothing between), the spot is dimmed if the lamp cannot in fact see it.
  float lamp = 1.0;
  if (uLamp.w > 0.01 && blk > 0.05) {
    vec3 v = vView + snap - uLamp.xyz;
    vec3 a = abs(vView + snap - uLampCell + n * 0.5);
    float given = (uLampLevel - (a.x + a.y + a.z)) / 15.0;
    float w = uLamp.w * (1.0 - smoothstep(0.1, 0.3, abs(given - blk))) * step(0.0, given);
    if (w > 0.01) {
      // (a side turned away from the lamp is in its own shadow)
      float facing = vN.w > 0.5 ? 1.0 : clamp(dot(n, -normalize(v)) * 8.0 + 0.6, 0.0, 1.0);
      lamp = mix(1.0, mix(0.25, 1.0, lampSees(v, mix(0.07, 0.9, vN.w)) * facing), w);
    }
  }
  // light from the whole sky, plus the sun where it shines; lamps and fire are warm, and add to it
  vec3 skyPart = curve(sky * uDaylight) * (uSkyLight * vS.y + uSunLight * vS.x * lit);
  vec3 blkPart = curve(blk) * lamp * vS.z * vec3(1.1, 0.96, 0.8);
  vec3 lc = 1.0 - (1.0 - min(skyPart, 1.0)) * (1.0 - min(blkPart, 1.0));
  lc = uAmbient + (1.0 - uAmbient) * lc;
  if (lava) lc = vec3(0.96 + 0.06 * sin(uTime * 1.1 + (vUv.x + vUv.y) * 6.2832));   // lava glows by itself
  else if (vS.w > 0.5) lc = max(lc, vec3(0.97));   // and so does anything that shines
  vec3 col = c.rgb * vCol * lc;
  if (surface) {
    // water mirrors the sky more the flatter you look across it, and the sun glitters on its ripples
    // (one glint to a dot of the texture, so it stays blocky)
    vec3 eye = normalize(-vView);
    vec2 cell = floor(vCell.xz * 16.0) / 16.0;
    float t = uTime;
    vec3 wn = normalize(vec3(
      0.07 * sin(cell.x * 3.1 + cell.y * 1.7 + t * 1.6) + 0.045 * sin(cell.y * 7.3 - t * 2.3),
      1.0,
      0.07 * sin(cell.y * 2.9 - cell.x * 1.3 + t * 1.4) + 0.045 * sin(cell.x * 6.1 + t * 2.1)));
    float fres = pow(1.0 - abs(dot(eye, wn)), 3.0);
    float glint = pow(max(dot(wn, normalize(uSunDir + eye)), 0.0), 320.0);
    col = mix(col, uSkyGlow * (0.35 + 0.65 * curve(sky)), fres * 0.6);
    col += uSunLight * 2.0 * glint * lit * curve(sky);
    c.a = mix(0.68, 0.95, fres) + glint * lit * 0.3;
  }
  float f = smoothstep(uFogNear, uFogFar, vL.z);
  gl_FragColor = vec4(mix(col, uFogColor, f), c.a);
}`;

// What the sun (or a lamp) sees: the shapes of the blocks, leaves and glass with their holes, and
// nothing within `uHole.w` of the lamp itself, which would otherwise be shut inside its own block
const SHADOW_VS = `
attribute vec4 aTex;
varying vec3 vUv;
varying vec3 vAt;
void main() {
  vUv = vec3(aTex.x / 16.0, aTex.y / 16.0, aTex.z);
  vAt = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SHADOW_FS = `
uniform sampler2DArray uAtlas;
uniform vec4 uHole;
varying vec3 vUv;
varying vec3 vAt;
void main() {
  if (texture(uAtlas, vUv).a < 0.5) discard;
  if (uHole.w > 0.0 && distance(vAt, uHole.xyz) < uHole.w) discard;
  gl_FragColor = vec4(1.0);
}`;

export function pixelRatio() {
  return Math.min(window.devicePixelRatio || 1, isTouchDevice ? 1.5 : 2);
}

// How bright the sky's light looks: nights are dark but you can still find your way (the game itself,
// e.g. where monsters may spawn, uses the real sky light in G.daylight)
export const skyLook = (d) => (G.dim === 'nether' ? d : Math.max(d, 0.36 + (d - 0.2) * 0.8));

// How bright something standing in that light looks (animals, players, the thing in your hand): the same
// sum the blocks' shader does, with the sun counted wherever the sky is open
export function brightness(sky, blk) {
  const g = G.settings.gamma, curve = (l) => (l / (4 - 3 * l)) * (1 - g) + l * g;
  const L = R.look, s = sky / 15;
  const a = Math.min(1, curve(s * L.daylight) * (L.sky + L.sun * 0.7 * smoothstep(0.7, 0.97, s)));
  const l = 1 - (1 - a) * (1 - curve(blk / 15));
  const amb = DIM_LOOK[G.dim || 'overworld'].ambient;
  return amb + (1 - amb) * l;
}
R.look = { daylight: 1, sky: 1, sun: 0 };

export function initRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;
  container.appendChild(renderer.domElement);
  R.renderer = renderer;
  R.scene = new THREE.Scene();
  R.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 1200);
  R.camera.rotation.order = 'YXZ';
  R.scene.fog = new THREE.Fog(0xc0d8ff, 40, 100);

  const { data, layers } = atlasData();
  const atlas = new THREE.DataArrayTexture(data, 16, 16, layers);
  atlas.format = THREE.RGBAFormat;
  atlas.type = THREE.UnsignedByteType;
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.NearestMipmapLinearFilter;
  atlas.wrapS = atlas.wrapT = THREE.RepeatWrapping;
  atlas.generateMipmaps = true;
  atlas.needsUpdate = true;
  R.atlas = atlas;

  const shared = {
    uAtlas: { value: atlas },
    uDaylight: { value: 1 },
    uFogColor: { value: new THREE.Color(0xc0d8ff) },
    uFogNear: { value: 40 },
    uFogFar: { value: 100 },
    uGamma: { value: G.settings.gamma },
    uTime: { value: 0 },
    uWaterLayer: { value: TEX.water },
    uLavaLayer: { value: TEX.lava },
    uAmbient: { value: 0.22 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uDirK: { value: 0 },
    uSkyLight: { value: new THREE.Color(1, 1, 1) },
    uSunLight: { value: new THREE.Color(0, 0, 0) },
    uSkyGlow: { value: new THREE.Color(0.7, 0.8, 1) },
    uShadowMap: { value: null },
    uShadowOn: { value: 0 },
    uShadowTexel: { value: 1 / 1024 },
    uShadowFromView: { value: new THREE.Matrix4() },
    uShadowLin: { value: new THREE.Matrix3() },
    uLampMap: { value: null },
    uLamp: { value: new THREE.Vector4() },
    uLampCell: { value: new THREE.Vector3() },
    uLampLevel: { value: 14 },
  };
  R.shared = shared;
  R.opaqueMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uAlphaTest: { value: 0.5 } },
    vertexShader: CHUNK_VS, fragmentShader: CHUNK_FS,
  });
  R.transMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uAlphaTest: { value: 0.02 } },
    vertexShader: CHUNK_VS, fragmentShader: CHUNK_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });

  buildShadows();
  buildSky();
  buildClouds();
  buildHighlight();
  buildHand();
  window.addEventListener('resize', onResize);
  onResize();
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  R.renderer.setPixelRatio(pixelRatio());
  R.renderer.setSize(w, h);
  R.camera.aspect = w / h;
  R.camera.updateProjectionMatrix();
  R.handCamera.aspect = w / h;
  R.handCamera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- shadows
// The sun's view of the land around you is drawn into a depth picture; the blocks' shader looks each point
// up in it to see whether the sun reaches there. What is drawn is the far side of everything (the faces
// turned away from the sun), so nothing lit can ever shade itself.
const lightVP = new THREE.Matrix4(), tmpM = new THREE.Matrix4();
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const sx = new THREE.Vector3(), sy = new THREE.Vector3(), sc = new THREE.Vector3();
const UP_Z = new THREE.Vector3(0, 0, 1);

function buildShadows() {
  // (sixteen dots of the picture or more to a block, the same as a block's own texture)
  const size = 2048, reach = isTouchDevice ? 56 : 64;
  const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, stencilBuffer: false });
  target.texture.minFilter = target.texture.magFilter = THREE.NearestFilter;
  target.texture.generateMipmaps = false;
  target.depthTexture = new THREE.DepthTexture(size, size);
  target.depthTexture.minFilter = target.depthTexture.magFilter = THREE.NearestFilter;
  const camera = new THREE.OrthographicCamera(-reach, reach, reach, -reach, 1, 420);
  camera.layers.set(1);
  R.shadow = {
    size, reach, target, camera, age: 99, drawn: false,
    hole: { value: new THREE.Vector4() },
    // (the bodies of animals, monsters and players, and things lying on the ground: both sides, as some are flat)
    bodies: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false }),
  };
  R.shadow.blocks = new THREE.ShaderMaterial({
    uniforms: { uAtlas: R.shared.uAtlas, uHole: R.shadow.hole }, vertexShader: SHADOW_VS, fragmentShader: SHADOW_FS, side: THREE.BackSide, colorWrite: false,
  });
  R.shared.uShadowMap.value = target.depthTexture;
  R.shared.uShadowTexel.value = 1 / size;

  // The nearest lamp's shadows: what it sees in each of six directions, side by side in one picture
  const tile = isTouchDevice ? 256 : 512;
  const lt = new THREE.WebGLRenderTarget(tile * 3, tile * 2, { depthBuffer: true, stencilBuffer: false });
  lt.texture.minFilter = lt.texture.magFilter = THREE.NearestFilter;
  lt.texture.generateMipmaps = false;
  lt.depthTexture = new THREE.DepthTexture(tile * 3, tile * 2);
  lt.depthTexture.minFilter = lt.depthTexture.magFilter = THREE.NearestFilter;
  lt.scissorTest = true;
  // (looking east, west, up, down, south, north: the same order, and the same idea of "up", as the shader's)
  const views = [[1, 0, 0, 0, 1, 0], [-1, 0, 0, 0, 1, 0], [0, 1, 0, 0, 0, 1], [0, -1, 0, 0, 0, -1], [0, 0, 1, 0, 1, 0], [0, 0, -1, 0, 1, 0]];
  R.lamp = {
    tile, target: lt, views, camera: new THREE.PerspectiveCamera(90, 1, LAMP_NEAR, LAMP_FAR),
    at: null, pos: new THREE.Vector3(), cell: new THREE.Vector3(), level: 14, hole: 0.87, on: 0, scan: 0, age: 99,
  };
  R.shared.uLampMap.value = lt.depthTexture;
}

function drawShadows() {
  const S = R.shadow, cam = S.camera, L = R.shared.uSunDir.value;
  // the picture is centred on you, moved a whole pixel of it at a time so that shadows do not shimmer
  sx.crossVectors(UP_Z, L).normalize();
  sy.crossVectors(L, sx);
  const texel = 2 * S.reach / S.size, c = R.camera.position;
  const ax = Math.round(c.dot(sx) / texel) * texel - c.dot(sx), ay = Math.round(c.dot(sy) / texel) * texel - c.dot(sy);
  sc.copy(c).addScaledVector(sx, ax).addScaledVector(sy, ay);
  cam.position.copy(sc).addScaledVector(L, 210);
  cam.up.copy(UP_Z);
  cam.lookAt(sc);
  cam.updateMatrixWorld();
  lightVP.copy(BIAS).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
  R.shared.uShadowLin.value.setFromMatrix4(lightVP);
  const r = R.renderer, scene = R.scene, fog = scene.fog;
  scene.fog = null;
  S.hole.value.w = 0;
  r.setRenderTarget(S.target);
  r.clear();
  scene.overrideMaterial = S.blocks;
  cam.layers.set(1);
  r.render(scene, cam);
  // (and the bodies of animals, monsters and players: layer 2, set where their models are built)
  scene.overrideMaterial = S.bodies;
  cam.layers.set(2);
  r.render(scene, cam);
  scene.overrideMaterial = null;
  scene.fog = fog;
  r.setRenderTarget(null);
  S.drawn = true;
}

// ---------------------------------------------------------------- lamp shadows
// Which lamp is lighting the place you are in: the one whose light, spreading with nothing in its way,
// would be just what there is where you stand (a lamp through a wall would give more than there is, so it
// is passed over). Torches, glowstone and the like; not lava or fire, which light from all over.
const LAMPS = new Map();
for (const key of ['torch', 'glowstone', 'shroomlight', 'end_rod', 'furnace_lit', 'beacon']) if (B[key]) LAMPS.set(B[key], key === 'torch' || key === 'end_rod' ? 0.66 : 0.87);
const lampDir = new THREE.Vector3();
function findLamp() {
  const w = G.world, c = R.camera.position;
  if (!w) return null;
  // two places it may be lighting: where you stand, and what you are looking at (up to seven blocks off)
  const cx = Math.floor(c.x), cy = Math.floor(c.y), cz = Math.floor(c.z);
  let ax = cx, ay = cy, az = cz;
  R.camera.getWorldDirection(lampDir);
  for (let t = 0.5; t <= 7; t += 0.5) {
    const x = Math.floor(c.x + lampDir.x * t), y = Math.floor(c.y + lampDir.y * t), z = Math.floor(c.z + lampDir.z * t);
    if (w.isSolid(x, y, z)) break;
    ax = x; ay = y; az = z;
  }
  const here = w.getLight(cx, cy, cz)[1], there = w.getLight(ax, ay, az)[1];
  if (here < 3 && there < 3) return null;
  let best = null, bestScore = 0;
  const L = R.lamp, RX = 12, RY = 9;
  for (let chz = (cz - RX) >> 4; chz <= (cz + RX) >> 4; chz++) for (let chx = (cx - RX) >> 4; chx <= (cx + RX) >> 4; chx++) {
    const ch = w.getChunk(chx, chz);
    if (!ch || ch.emitters <= 0) continue;
    const blocks = ch.blocks;
    const x0 = Math.max(cx - RX, chx << 4), x1 = Math.min(cx + RX, (chx << 4) + 15), z0 = Math.max(cz - RX, chz << 4), z1 = Math.min(cz + RX, (chz << 4) + 15);
    for (let y = Math.max(1, cy - RY); y <= Math.min(126, cy + RY); y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const id = blocks[(y << 8) | ((z & 15) << 4) | (x & 15)];
      if (!LAMPS.has(id)) continue;
      const level = BLOCKS[id].light;
      const g0 = level - (Math.abs(x - cx) + Math.abs(y - cy) + Math.abs(z - cz)), g1 = level - (Math.abs(x - ax) + Math.abs(y - ay) + Math.abs(z - az));
      let score = Math.max(g0 >= 2 && g0 <= here + 1 ? g0 : 0, g1 >= 2 && g1 <= there + 1 ? g1 + 1 : 0);
      if (!score) continue;
      // (the lamp already casting keeps the job unless another is clearly the one now)
      if (L.at && L.at.x === x && L.at.y === y && L.at.z === z) score += 1.5;
      if (score > bestScore) { bestScore = score; best = { x, y, z, id }; }
    }
  }
  return best;
}

const lampTo = new THREE.Vector3();
function drawLamp() {
  const L = R.lamp, S = R.shadow, cam = L.camera, r = R.renderer, scene = R.scene, fog = scene.fog, T = L.tile;
  scene.fog = null;
  S.hole.value.set(L.pos.x, L.pos.y, L.pos.z, L.hole);
  L.target.viewport.set(0, 0, T * 3, T * 2);
  L.target.scissor.set(0, 0, T * 3, T * 2);
  r.setRenderTarget(L.target);
  r.clear();
  cam.position.copy(L.pos);
  L.views.forEach(([fx, fy, fz, ux, uy, uz], i) => {
    cam.up.set(ux, uy, uz);
    cam.lookAt(lampTo.set(L.pos.x + fx, L.pos.y + fy, L.pos.z + fz));
    cam.updateMatrixWorld();
    L.target.viewport.set((i % 3) * T, Math.floor(i / 3) * T, T, T);
    L.target.scissor.copy(L.target.viewport);
    r.setRenderTarget(L.target);
    scene.overrideMaterial = S.blocks;
    cam.layers.set(1);
    r.render(scene, cam);
    scene.overrideMaterial = S.bodies;
    cam.layers.set(2);
    r.render(scene, cam);
  });
  scene.overrideMaterial = null;
  scene.fog = fog;
  S.hole.value.w = 0;
  r.setRenderTarget(null);
}

// Where a lamp's light is taken to come from. A torch: its flame. A block that shines does so from the
// sides that are open: set into a ceiling, a floor or a wall, from the face that shows (the one on your
// side, if it shows on both); standing free, from its middle.
const lampWas = new THREE.Vector3();
function placeLamp(at) {
  const L = R.lamp, w = G.world, x = at.x + 0.5, y = at.y + 0.5, z = at.z + 0.5;
  lampWas.copy(L.pos);
  L.cell.set(x, y, z);
  L.hole = LAMPS.get(at.id);
  if (L.hole < 0.8) L.pos.set(x, at.y + 0.6, z);
  else {
    const open = (dx, dy, dz) => (w.isSolid(at.x + dx, at.y + dy, at.z + dz) ? 0 : 1);
    const ex = open(1, 0, 0), wx = open(-1, 0, 0), up = open(0, 1, 0), dn = open(0, -1, 0), so = open(0, 0, 1), no = open(0, 0, -1);
    const n = ex + wx + up + dn + so + no, c = R.camera.position;
    let sx = ex - wx, sy = up - dn, sz = so - no;
    // (open on two opposite sides only: a lamp in a thin ceiling or wall)
    if (n === 2 && !sx && !sy && !sz) { if (ex) sx = c.x > x ? 1 : -1; else if (up) sy = c.y > y ? 1 : -1; else sz = c.z > z ? 1 : -1; }
    if (n >= 1 && n <= 2 && (sx || sy || sz)) { L.pos.set(x + sx * 0.53, y + sy * 0.53, z + sz * 0.53); L.hole = 0.2; } else L.pos.set(x, y, z);
  }
  if (lampWas.distanceToSquared(L.pos) > 0.0001) L.age = 99;
}

// Each frame: choose the lamp now and then, fade its shadows in, and draw them every few frames
function updateLamp(dt, wanted) {
  const L = R.lamp, u = R.shared.uLamp.value;
  L.scan -= dt;
  if (!wanted) { L.at = null; L.on = 0; u.w = 0; return; }
  if (L.scan <= 0) {
    L.scan = 0.35;
    const found = findLamp(), was = L.at;
    if (!found) L.at = null;
    else {
      if (!was || was.x !== found.x || was.y !== found.y || was.z !== found.z) { L.on = 0; L.age = 99; }
      L.at = found;
      L.level = BLOCKS[found.id].light;
      placeLamp(found);
    }
  }
  if (!L.at) { L.on = 0; u.w = 0; return; }
  if (++L.age >= (isTouchDevice ? 4 : 2)) { L.age = 0; drawLamp(); }
  L.on = Math.min(1, L.on + dt * 2.5);
  const c = R.camera.position;
  u.set(L.pos.x - c.x, L.pos.y - c.y, L.pos.z - c.z, L.on);
  R.shared.uLampCell.value.set(L.cell.x - c.x, L.cell.y - c.y, L.cell.z - c.z);
  R.shared.uLampLevel.value = L.level;
}

// ---------------------------------------------------------------- sky
function spriteCanvas(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

function buildSky() {
  R.skyUniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uSunset: { value: 0 },
    uHalo: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), new THREE.ShaderMaterial({
    uniforms: R.skyUniforms,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform float uSunset; uniform float uHalo;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.5, d.y));
        col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.3, d.y));
        float g = pow(max(dot(d, uSunDir), 0.0), 3.0) * uSunset * (1.0 - smoothstep(-0.1, 0.6, d.y));
        col = mix(col, vec3(1.0, 0.52, 0.22), g * 0.85);
        // (the sky is brighter round the sun)
        float near = max(dot(d, uSunDir), 0.0);
        col += vec3(1.0, 0.9, 0.7) * (pow(near, 48.0) * 0.3 + pow(near, 6.0) * 0.08) * uHalo;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false,
  }));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  R.scene.add(sky);
  R.sky = sky;

  const sunTex = spriteCanvas((g) => {
    g.fillStyle = 'rgba(255,240,170,0.25)'; g.fillRect(4, 4, 24, 24);
    g.fillStyle = '#fff6c8'; g.fillRect(9, 9, 14, 14);
    g.fillStyle = '#ffffff'; g.fillRect(11, 11, 10, 10);
  });
  // Eight moon phases: full, waning, new, waxing
  R.moonPhases = [];
  for (let ph = 0; ph < 8; ph++) {
    R.moonPhases.push(spriteCanvas((g) => {
      g.fillStyle = 'rgba(200,210,240,0.15)'; g.fillRect(6, 6, 20, 20);
      g.fillStyle = '#dfe4f0'; g.fillRect(10, 10, 12, 12);
      g.fillStyle = '#b8bfd0'; g.fillRect(12, 12, 3, 3); g.fillRect(17, 16, 3, 4); g.fillRect(13, 18, 2, 2);
      const lit = [12, 9, 6, 3, 0, 3, 6, 9][ph];
      g.fillStyle = '#000000';
      if (ph > 0 && ph < 4) g.fillRect(10 + lit, 10, 12 - lit, 12);
      else if (ph === 4) g.fillRect(10, 10, 12, 12);
      else if (ph > 4) g.fillRect(10, 10, 12 - lit, 12);
    }));
  }
  const moonTex = R.moonPhases[0];
  const mk = (tex, size) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    m.renderOrder = -9;
    m.frustumCulled = false;
    R.scene.add(m);
    return m;
  };
  R.sun = mk(sunTex, 90);
  R.moon = mk(moonTex, 70);

  const starGeo = new THREE.BufferGeometry();
  const pts = [];
  const r = mulberry32(77);
  for (let i = 0; i < 900; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pts.push(s * Math.cos(th) * 420, u * 420, s * Math.sin(th) * 420);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  R.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false,
  }));
  R.stars.renderOrder = -8;
  R.stars.frustumCulled = false;
  R.scene.add(R.stars);
}

function buildClouds() {
  // a map of how thick the cloud is over each patch of sky, the same in every direction it is tiled; how
  // much of it shows is up to the weather (`uCover`: 0 a clear sky, 1 a full blanket)
  const N = 64, r = mulberry32(1234);
  const lattice = (n) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = r(); return a; };
  const coarse = lattice(16), mid = lattice(32);
  const at = (a, n, x, y) => {
    const fx = x * n / N, fy = y * n / N, x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smoothstep(0, 1, fx - x0), ty = smoothstep(0, 1, fy - y0);
    const g = (i, j) => a[((j + n) % n) * n + ((i + n) % n)];
    return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
  };
  const v = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) v[y * N + x] = at(coarse, 16, x, y) * 0.6 + at(mid, 32, x, y) * 0.34 + r() * 0.06;
  // (ranked, so that a cover of 0.3 hides exactly 70% of the sky)
  const order = [...v.keys()].sort((i, j) => v[i] - v[j]);
  const data = new Uint8Array(N * N * 4);
  order.forEach((i, rank) => { data[i * 4] = Math.round(rank / (N * N - 1) * 255); data[i * 4 + 3] = 255; });
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  R.cloudUniforms = {
    uMap: { value: tex }, uOffset: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color(1, 1, 1) },
    uShade: { value: new THREE.Color(0.8, 0.84, 0.9) }, uCover: { value: 0.3 }, uAlpha: { value: 0.8 },
  };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.ShaderMaterial({
    uniforms: R.cloudUniforms,
    // (how far off each bit of cloud is has to be worked out for each dot drawn: the sheet has only four
    // corners, all of them far away, and the distance between them is not a straight-line blend)
    vertexShader: `uniform vec2 uOffset; varying vec2 vUv; varying vec2 vFrom;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vUv = (w.xz + uOffset) / 768.0;
      vFrom = w.xz - cameraPosition.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; uniform vec3 uShade; uniform float uCover; uniform float uAlpha;
      varying vec2 vUv; varying vec2 vFrom;
      void main(){ float v = texture2D(uMap, vUv).r - (1.0 - uCover); if (v < 0.0) discard;
      // (thin at the edges, heavy and grey in the middle of a big cloud)
      vec3 col = mix(uColor, uShade, smoothstep(0.05, 0.45, v));
      gl_FragColor = vec4(col, uAlpha * (1.0 - smoothstep(260.0, 700.0, length(vFrom)))); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  m.rotation.x = -Math.PI / 2;
  m.frustumCulled = false;
  R.scene.add(m);
  R.clouds = m;
}

// ---------------------------------------------------------------- highlight & cracks
function buildHighlight() {
  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, fog: false }),
  );
  box.visible = false;
  R.scene.add(box);
  R.highlight = box;

  R.crackTex = [];
  for (let s = 0; s < 10; s++) {
    const t = new THREE.CanvasTexture(TILES[TEX['destroy_' + s]]);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    R.crackTex.push(t);
  }
  const crack = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006), new THREE.MeshBasicMaterial({
    map: R.crackTex[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  crack.visible = false;
  R.scene.add(crack);
  R.crack = crack;
}

export function showHighlight(hit, progress) {
  const box = R.highlight, crack = R.crack;
  if (!hit) { box.visible = false; crack.visible = false; return; }
  const def = BLOCKS[hit.id];
  box.visible = true;
  let sx = 1, sy = 1, sz = 1, oy = 0;
  if (def.render === RENDER.TORCH) { sx = sz = 0.18; sy = 0.64; oy = -0.18; }
  else if (def.render === RENDER.CROSS) { sx = sz = 0.8; sy = 0.8; oy = -0.1; }
  box.scale.set(sx, sy, sz);
  box.position.set(hit.x + 0.5, hit.y + 0.5 + oy, hit.z + 0.5);
  if (progress > 0) {
    crack.visible = true;
    crack.position.copy(box.position);
    crack.scale.set(sx, sy, sz);
    crack.material.map = R.crackTex[Math.min(9, Math.floor(progress * 10))];
  } else crack.visible = false;
}

// ---------------------------------------------------------------- textures for held/dropped items
const canvasTexCache = new Map();
export function canvasTexture(canvas) {
  let t = canvasTexCache.get(canvas);
  if (!t) {
    t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    canvasTexCache.set(canvas, t);
  }
  return t;
}

const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const planeGeo = new THREE.PlaneGeometry(1, 1);
// A small 3D model for an item: a textured cube for blocks, a flat sprite plane for the rest
export function itemModel(id) {
  const it = ITEMS[id];
  if (it && it.isBlock && it.render === RENDER.CUBE) {
    const f = it.faces;
    const order = [f[0], f[1], f[2], f[3], it.facing ? it.front : f[4], f[5]];
    const mats = order.map((l) => new THREE.MeshBasicMaterial({ map: canvasTexture(TILES[l]), alphaTest: 0.5, transparent: it.translucent }));
    const m = new THREE.Mesh(cubeGeo, mats);
    m.userData.cube = true;
    m.layers.enable(2);   // (things lying on the ground or held in a hand cast shadows)
    return m;
  }
  const mat = new THREE.MeshBasicMaterial({ map: canvasTexture(ICONS[id]), alphaTest: 0.5, side: THREE.DoubleSide });
  const m = new THREE.Mesh(planeGeo, mat);
  m.layers.enable(2);
  return m;
}

export function tintModel(obj, v, red = 0) {
  const apply = (m) => { m.color.setRGB(v, v * (1 - red), v * (1 - red)); };
  obj.traverse((o) => {
    if (!o.material) return;
    if (Array.isArray(o.material)) o.material.forEach(apply); else apply(o.material);
  });
}

// ---------------------------------------------------------------- first-person hand
// The arm in front of you, in the colour of your skin's arm
export function paintHand(c) {
  const g = R.handSkin.getContext('2d');
  const r = mulberry32(5);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const k = 0.92 + r() * 0.1;
    g.fillStyle = `rgb(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0})`;
    g.fillRect(x, y, 1, 1);
  }
  if (R.handArm && R.handArm.material.map) R.handArm.material.map.needsUpdate = true;
}

function buildHand() {
  R.handScene = new THREE.Scene();
  R.handCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);
  const holder = new THREE.Group();
  R.handScene.add(holder);
  R.handHolder = holder;

  const skin = document.createElement('canvas');
  skin.width = skin.height = 8;
  R.handSkin = skin;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.62), new THREE.MeshBasicMaterial({ map: canvasTexture(skin) }));
  R.handArm = arm;
  paintHand([196, 142, 108]);
  R.handArm = arm;
  R.handItemId = -1;
  R.handItem = null;
  R.swing = 0;
  // the off hand's item, on the left
  R.offHolder = new THREE.Group();
  R.handScene.add(R.offHolder);
  R.offItemId = -1;
  R.offItem = null;
  R.blockBlend = 0;
}

// What the off hand holds, shown at the bottom left (a shield faces you, ready to come up)
export function setOffItem(id) {
  if (id === R.offItemId) return;
  R.offItemId = id;
  const h = R.offHolder;
  while (h.children.length) h.remove(h.children[0]);
  R.offItem = null;
  if (!id) return;
  const m = itemModel(id);
  if (m.userData.cube) {
    m.scale.setScalar(0.2);
    m.position.set(-0.46, -0.4, -0.7);
    m.rotation.set(0.05, -Math.PI / 4 - 0.15, 0);
  } else if (id === ID.shield) {
    m.scale.setScalar(0.5);
    m.position.set(-0.56, -0.47, -0.72);
    m.rotation.set(0, 0.45, 0.08);
  } else {
    m.scale.setScalar(0.42);
    m.position.set(-0.5, -0.36, -0.7);
    m.rotation.set(0.1, 1.2, -0.35);
  }
  h.add(m);
  R.offItem = m;
}

export function setHeldItem(id) {
  if (id === R.handItemId) return;
  R.handItemId = id;
  const h = R.handHolder;
  while (h.children.length) h.remove(h.children[0]);
  R.handItem = null;
  if (!id) {
    const arm = R.handArm;
    arm.position.set(0.44, -0.45, -0.58);
    arm.rotation.set(-0.25, -0.18, 0.3);
    h.add(arm);
    return;
  }
  const m = itemModel(id);
  if (m.userData.cube) {
    m.scale.setScalar(0.24);
    m.position.set(0.44, -0.38, -0.66);
    m.rotation.set(0.05, Math.PI / 4 + 0.15, 0);
  } else if (id === ID.shield) {
    m.scale.setScalar(0.5);
    m.position.set(0.56, -0.45, -0.72);
    m.rotation.set(0, -0.45, -0.08);
  } else {
    m.scale.setScalar(0.5);
    m.position.set(0.46, -0.32, -0.66);
    m.rotation.set(0.1, -1.2, 0.35);
    m.userData.baseRot = { x: 0.1, y: -1.2, z: 0.35 };
  }
  h.add(m);
  R.handItem = m;
}

// bob: where you are in your stride, sway: how strongly the hands move with it (0 standing still, 1 walking)
// eat: seconds spent eating so far, or -1 when not eating; shield: 1 raised in the main hand, 2 in the off hand
export function updateHand(dt, light, bob, sway, eat = -1, shield = 0) {
  R.swing = Math.max(0, R.swing - dt * 4.5);
  const s = R.swing > 0 ? 1 - R.swing : 0;
  const h = R.handHolder;
  const sw = Math.sin(s * Math.PI);
  R.eatBlend = Math.max(0, Math.min(1, (R.eatBlend || 0) + (eat >= 0 ? dt : -dt) * 7));
  const e = R.eatBlend * R.eatBlend * (3 - 2 * R.eatBlend);
  const chew = eat >= 0 ? Math.abs(Math.sin(eat * 13)) * 0.045 : 0;
  // Eating: bring the food up to the middle of the view and chew it
  // the hands sway gently in step with the walk (the same stride that bobs the view)
  // (at half the pace of the view bob and without its sharp bounce, or held things look like they shake)
  const swayX = Math.sin(bob * 0.5) * 0.014 * sway, swayY = -(0.5 - 0.5 * Math.cos(bob)) * 0.018 * sway;
  h.position.set(
    -sw * 0.25 + swayX - e * 0.3,
    sw * 0.12 + swayY + e * (0.17 - chew),
    -sw * 0.15 - e * 0.06,
  );
  h.rotation.set(sw * 0.8 + e * 0.1, sw * 0.5 + e * 0.2, sw * 0.3 - e * 0.1);
  const item = R.handItem;
  if (item && item.userData.baseRot) {
    const b = item.userData.baseRot;
    item.rotation.set(b.x - e * 0.1, b.y + e * 0.95, b.z - e * 0.3);
  }
  // A raised shield comes up in front of you, from whichever side holds it
  R.blockBlend = Math.max(0, Math.min(1, R.blockBlend + (shield ? dt : -dt) * 8));
  if (shield) R.blockSide = shield;
  const k = R.blockBlend * R.blockBlend * (3 - 2 * R.blockBlend);
  const main = R.blockSide === 1 ? k : 0, offk = R.blockSide === 2 ? k : 0;
  h.position.x -= main * 0.2; h.position.y += main * 0.13;
  h.rotation.y += main * 0.35;
  const o = R.offHolder;
  o.position.set(swayX + offk * 0.2, swayY + offk * 0.13, 0);
  o.rotation.set(0, -offk * 0.35, 0);
  tintModel(h, light);
  tintModel(o, light);
}

export function swingHand() { if (R.swing <= 0.3) R.swing = 1; }

// ---------------------------------------------------------------- chunks
function geometry(d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
  g.setAttribute('aTex', new THREE.BufferAttribute(d.tex, 4));
  g.setAttribute('aColor', new THREE.BufferAttribute(d.col, 4, true));
  g.setAttribute('aLight', new THREE.BufferAttribute(d.lig, 2, true));
  g.setIndex(new THREE.BufferAttribute(d.idx, 1));
  return g;
}

function placeMesh(geo, mat, chunk) {
  const m = new THREE.Mesh(geo, mat);
  if (mat === R.opaqueMat) m.layers.enable(1);   // (solid blocks cast shadows)
  m.position.set(chunk.cx * 16, 0, chunk.cz * 16);
  m.scale.setScalar(1 / 16);
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  R.scene.add(m);
  return m;
}

export function setChunkMeshes(chunk, data) {
  disposeChunkMeshes(chunk);
  if (data.opaque) chunk.mesh = placeMesh(geometry(data.opaque), R.opaqueMat, chunk);
  if (data.trans) chunk.water = placeMesh(geometry(data.trans), R.transMat, chunk);
}

export function disposeChunkMeshes(chunk) {
  for (const k of ['mesh', 'water']) {
    const m = chunk[k];
    if (m) { R.scene.remove(m); m.geometry.dispose(); chunk[k] = null; }
  }
}

// ---------------------------------------------------------------- per-frame sky + fog
const tmpV = new THREE.Vector3();
const DAY_TOP = new THREE.Color(0.38, 0.6, 1.0), NIGHT_TOP = new THREE.Color(0.01, 0.015, 0.05);
const DAY_HOR = new THREE.Color(0.72, 0.84, 1.0), NIGHT_HOR = new THREE.Color(0.03, 0.04, 0.09);
const SUNSET = new THREE.Color(1.0, 0.55, 0.28);
const GREY_TOP = new THREE.Color(0.46, 0.5, 0.57), GREY_HOR = new THREE.Color(0.62, 0.65, 0.69), FLASH = new THREE.Color(0.9, 0.92, 1);
const LOW_SUN = new THREE.Color(1.34, 0.74, 0.38), HIGH_SUN = new THREE.Color(1.1, 1.02, 0.9);
const SHADE_SKY = new THREE.Color(0.84, 0.93, 1.12), NIGHT_SKY = new THREE.Color(0.8, 0.88, 1.15);
const fogCol = new THREE.Color(), tmpC = new THREE.Color();
// The weather as the sky sees it: how overcast (0-1), how hard it is raining, how much cloud, how dark a
// storm, and a flash of lightning dying away. weather.js keeps it; with none, a fair day.
const CALM = { over: 0, rain: 0, cover: 0.3, dark: 0, flash: 0 };

// How each dimension looks: the Nether is a red haze lit by lava, the End a dark violet void
const DIM_LOOK = {
  overworld: { ambient: 0.22 },   // the darkest cave is dark, not black
  nether: { ambient: 0.32, fog: new THREE.Color(0.2, 0.03, 0.02), near: 0.25, far: 0.75 },
  end: { ambient: 0.28, fog: new THREE.Color(0.06, 0.04, 0.09), near: 0.4, far: 0.95, sky: new THREE.Color(0.05, 0.03, 0.08) },
};

export function updateSky(time, dt, underwater, inLava) {
  const look = DIM_LOOK[G.dim || 'overworld'];
  R.shared.uAmbient.value = look.ambient;
  if (G.dim === 'nether' || G.dim === 'end') {
    // no sun, moon or weather; a fixed dim light and thick coloured fog
    G.daylight = G.dim === 'end' ? 0.55 : 0;
    const su = R.skyUniforms;
    const skyCol = look.sky || look.fog;
    su.uTop.value.copy(skyCol); su.uHorizon.value.copy(look.fog); su.uSunset.value = 0; su.uHalo.value = 0;
    const cam = R.camera.position;
    R.sky.position.copy(cam);
    R.sun.visible = R.moon.visible = R.clouds.visible = false;
    R.stars.visible = G.dim === 'end';
    R.stars.position.copy(cam);
    R.stars.material.opacity = 0.5;
    const rd = G.settings.renderDist;
    let near = rd * 16 * look.near, far = rd * 16 * look.far;
    fogCol.copy(look.fog);
    if (inLava) { fogCol.setRGB(0.6, 0.15, 0.02); near = 0.2; far = 2.5; }
    else if (underwater) { fogCol.setRGB(0.05, 0.12, 0.35).multiplyScalar(0.4); near = 1; far = 18; }
    R.scene.fog.color.copy(fogCol); R.scene.fog.near = near; R.scene.fog.far = far;
    const sh = R.shared;
    sh.uFogColor.value.copy(fogCol); sh.uFogNear.value = near; sh.uFogFar.value = far;
    sh.uDaylight.value = skyLook(G.daylight); sh.uGamma.value = G.settings.gamma;
    sh.uDirK.value = 0; sh.uSunLight.value.setRGB(0, 0, 0); sh.uSkyLight.value.setRGB(1, 1, 1);
    R.look.daylight = sh.uDaylight.value; R.look.sky = 1; R.look.sun = 0;
    sh.uTime.value = (sh.uTime.value + dt) % 1000;
    R.frameDt = dt;
    R.sky.visible = true;
    return;
  }
  R.sun.visible = R.moon.visible = R.clouds.visible = R.stars.visible = true;
  const wx = G.wx || CALM;
  const a = time * Math.PI * 2;
  const sunDir = tmpV.set(Math.cos(a), Math.sin(a), 0.22).normalize();
  const s = sunDir.y;
  G.daylight = 0.2 + 0.8 * smoothstep(-0.18, 0.22, s);
  const day = smoothstep(-0.25, 0.25, s);
  const sunset = Math.max(0, 1 - Math.abs(s) / 0.32) * (1 - wx.over);
  const su = R.skyUniforms;
  // a grey sky under heavy cloud, darker still in a storm; lightning whitens it for an instant
  su.uTop.value.copy(NIGHT_TOP).lerp(DAY_TOP, day).lerp(tmpC.copy(GREY_TOP).multiplyScalar((0.12 + 0.88 * day) * (1 - 0.45 * wx.dark)), wx.over);
  su.uHorizon.value.copy(NIGHT_HOR).lerp(DAY_HOR, day).lerp(tmpC.copy(GREY_HOR).multiplyScalar((0.12 + 0.88 * day) * (1 - 0.45 * wx.dark)), wx.over);
  if (wx.flash > 0) { su.uTop.value.lerp(FLASH, wx.flash * 0.55); su.uHorizon.value.lerp(FLASH, wx.flash * 0.55); }
  su.uSunDir.value.copy(sunDir);
  su.uSunset.value = sunset;
  su.uHalo.value = smoothstep(-0.08, 0.12, s) * (1 - wx.over);

  const cam = R.camera.position;
  R.sky.position.copy(cam);
  R.sun.position.copy(cam).addScaledVector(sunDir, 350);
  R.sun.lookAt(cam);
  R.moon.position.copy(cam).addScaledVector(sunDir, -350);
  const phase = R.moonPhases[(G.day || 0) % 8];
  if (R.moon.material.map !== phase) { R.moon.material.map = phase; R.moon.material.needsUpdate = true; }
  R.moon.lookAt(cam);
  R.sun.material.opacity = R.moon.material.opacity = 1 - wx.over;
  R.stars.position.copy(cam);
  R.stars.rotation.z = a;
  R.stars.material.opacity = Math.max(0, 1 - day * 1.6) * (1 - wx.over);

  const cu = R.cloudUniforms;
  R.clouds.position.set(cam.x, 132.5, cam.z);   // (above the highest peaks)
  cu.uOffset.value.set(G.cloudDrift || 0, 0);
  G.cloudDrift = ((G.cloudDrift || 0) + dt * (1.2 + wx.rain * 1.6)) % 768;
  const cb = (0.25 + 0.75 * day) * (1 - 0.3 * wx.over - 0.3 * wx.dark) + wx.flash * 0.5;
  cu.uColor.value.setRGB(cb, cb, cb * 1.02);
  cu.uShade.value.setRGB(cb * (0.84 - 0.2 * wx.over), cb * (0.87 - 0.2 * wx.over), cb * (0.93 - 0.2 * wx.over));
  cu.uCover.value = wx.cover;
  cu.uAlpha.value = 0.8 + 0.14 * wx.over;

  fogCol.copy(su.uHorizon.value).lerp(SUNSET, sunset * 0.35);
  const rd = G.settings.renderDist;
  let near = rd * 16 * (0.55 - 0.2 * wx.rain), far = (rd * 16 - 6) * (1 - 0.18 * wx.rain);
  if (inLava) { fogCol.setRGB(0.6, 0.15, 0.02); near = 0.2; far = 2.5; }
  else if (underwater) { fogCol.setRGB(0.05, 0.12, 0.35).multiplyScalar(0.3 + 0.7 * G.daylight); near = 1; far = 18; }
  R.scene.fog.color.copy(fogCol);
  R.scene.fog.near = near;
  R.scene.fog.far = far;
  const sh = R.shared;
  sh.uFogColor.value.copy(fogCol);
  sh.uFogNear.value = near;
  sh.uFogFar.value = far;
  // Light. By day part of it comes straight from the sun: warm, strongest on the sides turned to it, and
  // cut off by whatever stands in the way. The rest comes from the whole sky and is a little blue. The moon
  // does the same more faintly, and under heavy cloud there is no sun to speak of, only the grey sky.
  const moon = s < 0, night = 1 - smoothstep(0.45, 0.85, G.daylight);
  const dirK = smoothstep(0.04, 0.3, Math.abs(s)) * (1 - 0.94 * wx.over);
  const frac = (moon ? 0.34 : 0.46) * dirK;
  const dl = Math.min(1, skyLook(G.daylight) * (1 - 0.16 * wx.over - 0.2 * wx.dark) + wx.flash * 0.8);
  sh.uSunDir.value.copy(sunDir).multiplyScalar(moon ? -1 : 1);
  sh.uDirK.value = dirK;
  if (moon) sh.uSunLight.value.setRGB(0.72, 0.84, 1.25);
  else sh.uSunLight.value.copy(LOW_SUN).lerp(HIGH_SUN, smoothstep(0.08, 0.5, s));
  sh.uSunLight.value.multiplyScalar(frac);
  sh.uSkyLight.value.setRGB(1, 1, 1).lerp(SHADE_SKY, dirK * (1 - night)).lerp(NIGHT_SKY, night).multiplyScalar(1 - frac);
  sh.uSkyGlow.value.copy(su.uHorizon.value).lerp(su.uTop.value, 0.35).lerp(SUNSET, sunset * 0.3);
  sh.uDaylight.value = dl;
  sh.uGamma.value = G.settings.gamma;
  sh.uTime.value = (sh.uTime.value + dt) % 1000;
  R.frameDt = dt;
  R.look.daylight = dl; R.look.sky = 1 - frac; R.look.sun = frac;
  R.sky.visible = !underwater;
}

export function render() {
  const r = R.renderer, S = R.shadow, sh = R.shared;
  // the shadows are redrawn as you and the sun move (every frame on a computer, every other on a tablet)
  const want = G.settings.shadows !== false && sh.uDirK.value > 0.02 && G.dim !== 'nether' && G.dim !== 'end';
  if (want && (++S.age >= (isTouchDevice ? 2 : 1) || !S.drawn)) { S.age = 0; drawShadows(); }
  if (!want) S.drawn = false;
  sh.uShadowOn.value = want && S.drawn ? 1 : 0;
  updateLamp(R.frameDt || 0, G.settings.shadows !== false && G.state === 'playing');
  R.camera.updateMatrixWorld();
  sh.uShadowFromView.value.copy(lightVP).multiply(R.camera.matrixWorld);
  r.clear();
  r.render(R.scene, R.camera);
  if (R.handHolder.visible) {
    r.clearDepth();
    r.render(R.handScene, R.handCamera);
  }
}
