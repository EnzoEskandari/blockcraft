// Three.js setup: chunk shader, sky, sun/moon, clouds, block highlight, first-person hand.
import * as THREE from 'three';
import { G, isTouchDevice } from './game.js';
import { atlasData, TILES, TEX, ICONS } from './textures.js';
import { BLOCKS, ITEMS, RENDER } from './blocks.js';
import { smoothstep, mulberry32 } from './noise.js';

THREE.ColorManagement.enabled = false;

export const R = {};

const CHUNK_VS = `
attribute vec4 aTex;
attribute vec4 aColor;
attribute vec2 aLight;
uniform float uTime;
uniform float uWaterLayer;
varying vec3 vUv;
varying vec3 vCol;
varying vec2 vLight;
varying float vDist;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vDist = length(mv.xyz);
  float scroll = abs(aTex.z - uWaterLayer) < 0.5 ? uTime * 0.35 : 0.0;
  vUv = vec3(aTex.x / 16.0, aTex.y / 16.0 - scroll, aTex.z);
  vCol = aColor.rgb;
  vLight = aLight;
}`;

const CHUNK_FS = `
uniform sampler2DArray uAtlas;
uniform float uDaylight;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlphaTest;
uniform float uGamma;
varying vec3 vUv;
varying vec3 vCol;
varying vec2 vLight;
varying float vDist;
void main() {
  vec4 c = texture(uAtlas, vUv);
  if (c.a < uAlphaTest) discard;
  float sky = vLight.x * uDaylight;
  float blk = vLight.y;
  float l = max(sky, blk);
  float b = mix(l / (4.0 - 3.0 * l), l, uGamma);
  b = 0.045 + 0.955 * b;
  vec3 lc = vec3(b) * mix(vec3(1.0), vec3(1.1, 0.96, 0.8), clamp((blk - sky) * 1.5, 0.0, 1.0));
  vec3 col = c.rgb * vCol * lc;
  float f = smoothstep(uFogNear, uFogFar, vDist);
  gl_FragColor = vec4(mix(col, uFogColor, f), c.a);
}`;

export function pixelRatio() {
  return Math.min(window.devicePixelRatio || 1, isTouchDevice ? 1.5 : 2);
}

export function brightness(sky, blk) {
  const l = Math.max(sky / 15 * G.daylight, blk / 15);
  const g = G.settings.gamma;
  const b = (l / (4 - 3 * l)) * (1 - g) + l * g;
  return 0.045 + 0.955 * b;
}

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
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), new THREE.ShaderMaterial({
    uniforms: R.skyUniforms,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform float uSunset;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.5, d.y));
        col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.3, d.y));
        float g = pow(max(dot(d, uSunDir), 0.0), 3.0) * uSunset * (1.0 - smoothstep(-0.1, 0.6, d.y));
        col = mix(col, vec3(1.0, 0.52, 0.22), g * 0.85);
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
  const N = 64;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const r = mulberry32(1234);
  g.fillStyle = '#fff';
  for (let i = 0; i < 70; i++) {
    const x = r() * N | 0, y = r() * N | 0, w = 2 + (r() * 7 | 0), h = 2 + (r() * 5 | 0);
    for (const ox of [0, -N]) for (const oy of [0, -N]) g.fillRect(x + ox, y + oy, w, h);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  R.cloudUniforms = { uMap: { value: tex }, uOffset: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color(1, 1, 1) } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.ShaderMaterial({
    uniforms: R.cloudUniforms,
    vertexShader: `uniform vec2 uOffset; varying vec2 vUv; varying float vDist;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vUv = (w.xz + uOffset) / 768.0;
      vec4 mv = viewMatrix * w; vDist = length(mv.xz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; varying vec2 vUv; varying float vDist;
      void main(){ vec4 c = texture2D(uMap, vUv); if (c.a < 0.5) discard;
      gl_FragColor = vec4(uColor, 0.78 * (1.0 - smoothstep(260.0, 700.0, vDist))); }`,
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
    return m;
  }
  const mat = new THREE.MeshBasicMaterial({ map: canvasTexture(ICONS[id]), alphaTest: 0.5, side: THREE.DoubleSide });
  return new THREE.Mesh(planeGeo, mat);
}

export function tintModel(obj, v, red = 0) {
  const apply = (m) => { m.color.setRGB(v, v * (1 - red), v * (1 - red)); };
  obj.traverse((o) => {
    if (!o.material) return;
    if (Array.isArray(o.material)) o.material.forEach(apply); else apply(o.material);
  });
}

// ---------------------------------------------------------------- first-person hand
function buildHand() {
  R.handScene = new THREE.Scene();
  R.handCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);
  const holder = new THREE.Group();
  R.handScene.add(holder);
  R.handHolder = holder;

  const skin = document.createElement('canvas');
  skin.width = skin.height = 8;
  const g = skin.getContext('2d');
  const r = mulberry32(5);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const k = 0.92 + r() * 0.1;
    g.fillStyle = `rgb(${196 * k | 0},${142 * k | 0},${108 * k | 0})`;
    g.fillRect(x, y, 1, 1);
  }
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.62), new THREE.MeshBasicMaterial({ map: canvasTexture(skin) }));
  R.handArm = arm;
  R.handItemId = -1;
  R.handItem = null;
  R.swing = 0;
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
  } else {
    m.scale.setScalar(0.5);
    m.position.set(0.46, -0.32, -0.66);
    m.rotation.set(0.1, -1.2, 0.35);
    m.userData.baseRot = { x: 0.1, y: -1.2, z: 0.35 };
  }
  h.add(m);
  R.handItem = m;
}

// eat: seconds spent eating so far, or -1 when not eating
export function updateHand(dt, light, bob, eat = -1) {
  R.swing = Math.max(0, R.swing - dt * 4.5);
  const s = R.swing > 0 ? 1 - R.swing : 0;
  const h = R.handHolder;
  const sw = Math.sin(s * Math.PI);
  R.eatBlend = Math.max(0, Math.min(1, (R.eatBlend || 0) + (eat >= 0 ? dt : -dt) * 7));
  const e = R.eatBlend * R.eatBlend * (3 - 2 * R.eatBlend);
  const chew = eat >= 0 ? Math.abs(Math.sin(eat * 13)) * 0.045 : 0;
  // Eating: bring the food up to the middle of the view and chew it
  h.position.set(
    -sw * 0.25 + Math.sin(bob * 2) * 0.012 - e * 0.3,
    sw * 0.12 - Math.abs(Math.cos(bob * 2)) * 0.02 + e * (0.17 - chew),
    -sw * 0.15 - e * 0.06,
  );
  h.rotation.set(sw * 0.8 + e * 0.1, sw * 0.5 + e * 0.2, sw * 0.3 - e * 0.1);
  const item = R.handItem;
  if (item && item.userData.baseRot) {
    const b = item.userData.baseRot;
    item.rotation.set(b.x - e * 0.1, b.y + e * 0.95, b.z - e * 0.3);
  }
  tintModel(h, light);
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
const fogCol = new THREE.Color();

export function updateSky(time, dt, underwater) {
  const a = time * Math.PI * 2;
  const sunDir = tmpV.set(Math.cos(a), Math.sin(a), 0.22).normalize();
  const s = sunDir.y;
  G.daylight = 0.2 + 0.8 * smoothstep(-0.18, 0.22, s);
  const day = smoothstep(-0.25, 0.25, s);
  const sunset = Math.max(0, 1 - Math.abs(s) / 0.32) * (Math.cos(a) > -2 ? 1 : 0);
  const su = R.skyUniforms;
  su.uTop.value.copy(NIGHT_TOP).lerp(DAY_TOP, day);
  su.uHorizon.value.copy(NIGHT_HOR).lerp(DAY_HOR, day);
  su.uSunDir.value.copy(sunDir);
  su.uSunset.value = sunset;

  const cam = R.camera.position;
  R.sky.position.copy(cam);
  R.sun.position.copy(cam).addScaledVector(sunDir, 350);
  R.sun.lookAt(cam);
  R.moon.position.copy(cam).addScaledVector(sunDir, -350);
  const phase = R.moonPhases[(G.day || 0) % 8];
  if (R.moon.material.map !== phase) { R.moon.material.map = phase; R.moon.material.needsUpdate = true; }
  R.moon.lookAt(cam);
  R.stars.position.copy(cam);
  R.stars.rotation.z = a;
  R.stars.material.opacity = Math.max(0, 1 - day * 1.6);

  R.clouds.position.set(cam.x, 108.5, cam.z);
  R.cloudUniforms.uOffset.value.set(G.cloudDrift || 0, 0);
  G.cloudDrift = ((G.cloudDrift || 0) + dt * 1.2) % 768;
  const cb = 0.25 + 0.75 * day;
  R.cloudUniforms.uColor.value.setRGB(cb, cb, cb * 1.02);

  fogCol.copy(su.uHorizon.value).lerp(SUNSET, sunset * 0.35);
  const rd = G.settings.renderDist;
  let near = rd * 16 * 0.55, far = rd * 16 - 6;
  if (underwater) { fogCol.setRGB(0.05, 0.12, 0.35).multiplyScalar(0.3 + 0.7 * G.daylight); near = 1; far = 18; }
  R.scene.fog.color.copy(fogCol);
  R.scene.fog.near = near;
  R.scene.fog.far = far;
  const sh = R.shared;
  sh.uFogColor.value.copy(fogCol);
  sh.uFogNear.value = near;
  sh.uFogFar.value = far;
  sh.uDaylight.value = G.daylight;
  sh.uGamma.value = G.settings.gamma;
  sh.uTime.value = (sh.uTime.value + dt) % 1000;
  R.sky.visible = !underwater;
}

export function render() {
  const r = R.renderer;
  r.clear();
  r.render(R.scene, R.camera);
  if (R.handHolder.visible) {
    r.clearDepth();
    r.render(R.handScene, R.handCamera);
  }
}
