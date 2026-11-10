// The finishing pass of Realistic graphics (1.13; Options > Lighting > Realistic, not offered on touch devices).
// The world is drawn into a picture of its own instead of straight to the screen, with how far away every dot
// is kept beside it. From those two this adds what a camera would give:
//   - shade in creases and corners and under things, worked out from the distances (ambient occlusion);
//   - a glow round whatever is very bright: the sun, lava, lamps, fire, explosions, snow in sunlight (bloom);
//   - shafts of light from a low sun past whatever stands in front of it;
//   - smoothed edges (FXAA), a film's contrast and colour, and darker corners.
// Nothing here knows about blocks: it works on the finished picture. With Realistic off none of it exists.
import * as THREE from 'three';

const VS = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Half size: what is bright enough to glow (rgb), and how open each spot is to the sky (a)
const PRE_FS = `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform mat4 uProjInv;
uniform vec2 uPx;
varying vec2 vUv;
vec3 viewAt(vec2 uv) {
  float z = texture2D(tDepth, uv).r;
  vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // (only what is brighter than a white cloud in daylight glows much: lamps, lava, fire, the sun)
  vec3 glow = c * (smoothstep(0.9, 1.0, l) * 0.1 + smoothstep(0.985, 1.0, max(c.r, max(c.g, c.b))) * smoothstep(0.55, 0.95, max(c.r, c.g) - c.b + 0.45) * 0.65);
  float z = texture2D(tDepth, vUv).r, ao = 1.0;
  if (z < 0.99999) {
    vec3 p = viewAt(vUv);
    // (which way the surface faces, from its neighbours on the nearer side each way: no seams at edges)
    vec3 px = viewAt(vUv + vec2(uPx.x, 0.0)) - p, mx = p - viewAt(vUv - vec2(uPx.x, 0.0));
    vec3 py = viewAt(vUv + vec2(0.0, uPx.y)) - p, my = p - viewAt(vUv - vec2(0.0, uPx.y));
    vec3 n = normalize(cross(abs(px.z) < abs(mx.z) ? px : mx, abs(py.z) < abs(my.z) ? py : my));
    float dist = -p.z;
    // samples on a spiral round the spot, turned a different way at every dot so the pattern does not show
    float turn = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float reach = 0.7 / max(dist, 0.3) * 0.55;   // (about 0.7 of a block, on the screen)
    float sum = 0.0;
    for (int i = 0; i < 10; i++) {
      float f = (float(i) + 0.5) / 10.0, a = turn + float(i) * 2.399963;
      vec3 d = viewAt(vUv + vec2(cos(a), sin(a) * (uPx.y / uPx.x)) * reach * sqrt(f)) - p;
      float len2 = dot(d, d);
      sum += max(dot(n, d) * inversesqrt(len2 + 1e-5) - 0.12, 0.0) / (1.0 + len2 * 2.2);
    }
    ao = 1.0 - clamp(sum / 10.0 * 2.3, 0.0, 0.72);
    ao = mix(ao, 1.0, smoothstep(45.0, 100.0, dist));
  }
  gl_FragColor = vec4(glow, ao);
}`;

// The picture so far, copied into a second one with its distances (water is then drawn into the copy, looking
// at the first for what lies behind it and what it mirrors: see the water in render.js)
const COPY_FS = `
uniform sampler2D tColor;
uniform sampler2D tDepth;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tColor, vUv);
  gl_FragDepth = texture2D(tDepth, vUv).r;
}`;

// A blur along one direction (run across, then down)
const BLUR_FS = `
uniform sampler2D tMap;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
  vec4 s = texture2D(tMap, vUv) * 0.227027;
  s += (texture2D(tMap, vUv + uStep * 1.3846) + texture2D(tMap, vUv - uStep * 1.3846)) * 0.316216;
  s += (texture2D(tMap, vUv + uStep * 3.2308) + texture2D(tMap, vUv - uStep * 3.2308)) * 0.070270;
  gl_FragColor = s;
}`;

// The picture as it reaches the screen
const FINAL_FS = `
uniform sampler2D tColor;
uniform sampler2D tNear;   // glow blurred a little (rgb), shade (a)
uniform sampler2D tFar;    // glow blurred a lot
uniform vec2 uPx;
uniform vec3 uSun;         // where the sun is on the screen (x, y) and how much of its shafts to show (z)
uniform vec3 uSunTint;
varying vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// smoothed edges: where neighbours differ, blend along the edge (FXAA, the short form)
vec3 smoothEdges() {
  vec3 m = texture2D(tColor, vUv).rgb;
  float lm = luma(m);
  float lnw = luma(texture2D(tColor, vUv + vec2(-1.0, -1.0) * uPx).rgb), lne = luma(texture2D(tColor, vUv + vec2(1.0, -1.0) * uPx).rgb);
  float lsw = luma(texture2D(tColor, vUv + vec2(-1.0, 1.0) * uPx).rgb), lse = luma(texture2D(tColor, vUv + vec2(1.0, 1.0) * uPx).rgb);
  float lo = min(lm, min(min(lnw, lne), min(lsw, lse))), hi = max(lm, max(max(lnw, lne), max(lsw, lse)));
  if (hi - lo < max(0.04, hi * 0.11)) return m;
  vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
  float shrink = max((lnw + lne + lsw + lse) * 0.03125, 0.0078125);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + shrink), -8.0, 8.0) * uPx;
  vec3 a = 0.5 * (texture2D(tColor, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tColor, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tColor, vUv - dir * 0.5).rgb + texture2D(tColor, vUv + dir * 0.5).rgb);
  float lb = luma(b);
  return lb < lo || lb > hi ? a : b;
}
void main() {
  vec3 col = smoothEdges();
  vec4 near = texture2D(tNear, vUv);
  vec3 far = texture2D(tFar, vUv).rgb;
  // shade in the creases (less of it where the picture is already bright: light fills a crease)
  col *= mix(near.a, 1.0, smoothstep(0.75, 1.0, luma(col)) * 0.6);
  col += near.rgb * 0.4 + far * 0.45;
  // shafts of light: the glow between here and the sun, gathered along the way
  if (uSun.z > 0.003) {
    vec2 to = (uSun.xy - vUv);
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    vec3 rays = vec3(0.0);
    float w = 1.0;
    for (int i = 0; i < 16; i++) {
      vec2 at = vUv + to * ((float(i) + jitter) / 16.0) * 0.92;
      rays += texture2D(tFar, at).rgb * w;
      w *= 0.93;
    }
    col += rays * uSunTint * (uSun.z * 0.05) * smoothstep(1.3, 0.2, length(to * vec2(1.0, uPx.x / uPx.y)));
  }
  // a film's look: deeper darks and fuller colour, warm lights and cool shade, darker corners
  col = max(col, 0.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
  float l = luma(col);
  col = mix(vec3(l), col, 1.09);
  col += vec3(0.018, 0.004, -0.02) * (l - 0.45) * 1.6;
  vec2 q = vUv - 0.5;
  col *= 1.0 - 0.24 * pow(dot(q, q) * 2.0, 1.4);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const P = { ok: null, w: 0, h: 0 };
const sunAt = new THREE.Vector3();

function target(w, h, depth) {
  const t = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: !!depth, stencilBuffer: false });
  t.texture.generateMipmaps = false;
  if (depth) { t.depthTexture = new THREE.DepthTexture(w, h); t.depthTexture.type = THREE.UnsignedIntType; t.depthTexture.minFilter = t.depthTexture.magFilter = THREE.NearestFilter; }
  return t;
}
function build() {
  const mat = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
  P.pre = mat(PRE_FS, { tColor: { value: null }, tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uPx: { value: new THREE.Vector2() } });
  P.copy = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: COPY_FS, uniforms: { tColor: { value: null }, tDepth: { value: null } }, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true });
  P.blur = mat(BLUR_FS, { tMap: { value: null }, uStep: { value: new THREE.Vector2() } });
  P.final = mat(FINAL_FS, { tColor: { value: null }, tNear: { value: null }, tFar: { value: null }, uPx: { value: new THREE.Vector2() },
    uSun: { value: new THREE.Vector3() }, uSunTint: { value: new THREE.Color(1, 0.9, 0.7) } });
  P.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), P.pre);
  P.quad.frustumCulled = false;
  P.scene = new THREE.Scene();
  P.scene.add(P.quad);
  P.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
}
function size(w, h) {
  if (P.w === w && P.h === h) return;
  for (const t of [P.main, P.back, P.a, P.b, P.c, P.d]) if (t) t.dispose();
  P.w = w; P.h = h;
  const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1), qw = Math.max(2, w >> 2), qh = Math.max(2, h >> 2);
  P.main = target(w, h, true);
  P.back = target(w, h, true);
  P.main.texture.minFilter = P.main.texture.magFilter = THREE.LinearFilter;
  P.a = target(hw, hh); P.b = target(hw, hh);
  P.c = target(qw, qh); P.d = target(qw, qh);
}
function pass(r, material, to) {
  P.quad.material = material;
  r.setRenderTarget(to);
  r.render(P.scene, P.cam);
}

// The picture the world is to be drawn into this frame (null if this card cannot do it: then it is drawn as usual)
export function postTarget(r) {
  if (P.ok === false) return null;
  try {
    if (!P.scene) build();
    const v = r.getDrawingBufferSize(new THREE.Vector2());
    size(v.x, v.y);
    P.ok = true;
    return P.main;
  } catch (err) {
    console.warn('Blockcraft: Realistic graphics could not start here.', err);
    P.ok = false;
    return null;
  }
}

// Everything but the water has been drawn: copy it, and hand back the copy to draw the water (and the hand) into,
// with the first picture and its distances for the water to look at
export function postWater(r) {
  P.copy.uniforms.tColor.value = P.main.texture;
  P.copy.uniforms.tDepth.value = P.main.depthTexture;
  pass(r, P.copy, P.back);
  return { target: P.back, scene: P.main.texture, depth: P.main.depthTexture, w: P.w, h: P.h };
}

// The world has been drawn into the picture: finish it and put it on the screen.
// sunDir: towards the sun (or the moon); shafts: how strongly its shafts show (0 for none); tint: their colour
export function postFinish(r, camera, sunDir, shafts, tint) {
  P.final.uniforms.uPx.value.set(1 / P.w, 1 / P.h);
  P.pre.uniforms.tColor.value = P.back.texture;
  P.pre.uniforms.tDepth.value = P.main.depthTexture;   // (the world's distances, from before the hand was drawn over them)
  P.pre.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
  P.pre.uniforms.uPx.value.set(1 / P.w, 1 / P.h);
  pass(r, P.pre, P.a);
  // a little blur at half size (this one carries the shade), then a lot at quarter size
  const blur = (from, to, x, y) => { P.blur.uniforms.tMap.value = from.texture; P.blur.uniforms.uStep.value.set(x, y); pass(r, P.blur, to); };
  blur(P.a, P.b, 1 / P.a.width, 0);
  blur(P.b, P.a, 0, 1 / P.a.height);
  blur(P.a, P.c, 1.6 / P.c.width, 0);
  blur(P.c, P.d, 0, 1.6 / P.c.height);
  blur(P.d, P.c, 3.2 / P.c.width, 0);
  blur(P.c, P.d, 0, 3.2 / P.c.height);
  // where the sun is on the screen (shafts only when it is in front of you)
  sunAt.copy(sunDir).multiplyScalar(400).add(camera.position).project(camera);
  const front = sunAt.z < 1 ? 1 : 0;
  P.final.uniforms.uSun.value.set(sunAt.x * 0.5 + 0.5, sunAt.y * 0.5 + 0.5, shafts * front);
  P.final.uniforms.uSunTint.value.copy(tint);
  P.final.uniforms.tColor.value = P.back.texture;
  P.final.uniforms.tNear.value = P.a.texture;
  P.final.uniforms.tFar.value = P.d.texture;
  pass(r, P.final, null);
}

export function postDispose() {
  for (const t of [P.main, P.back, P.a, P.b, P.c, P.d]) if (t) t.dispose();
  P.main = P.back = P.a = P.b = P.c = P.d = null;
  P.w = P.h = 0;
}
