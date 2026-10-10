// Synthesised sound effects (Web Audio). Nothing is loaded from files.
import { G } from './game.js';

let ctx = null, master = null, noiseBuf = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = G.settings.volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}

export function setVolume(v) { if (master) master.gain.value = v; }

// Rain: a steady hiss that is turned up and down (0 = none) rather than started and stopped
let rain = null;
export function rainSound(level) {
  if (!ctx) return;
  if (!rain) {
    if (level <= 0) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master);
    src.start();
    rain = { g, lp, level: -1 };
  }
  // (only when it has changed: this is asked every frame)
  if (Math.abs(level - rain.level) < 0.02 && !(level <= 0 && rain.level > 0)) return;
  rain.level = level;
  rain.g.gain.setTargetAtTime(Math.max(0, level) * 0.16, ctx.currentTime, 0.4);
  // (muffled when it is quiet: that is rain heard from indoors)
  rain.lp.frequency.setTargetAtTime(level > 0.6 ? 6500 : 1800 + level * 4000, ctx.currentTime, 0.4);
}

// Output node for a sound at world position `pos` (null = non-positional)
function out(vol, pos) {
  if (!ctx) return null;
  let v = vol, pan = 0;
  const p = G.player;
  if (pos && p) {
    const dx = pos.x - p.pos.x, dy = pos.y - p.pos.y, dz = pos.z - p.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > 24) return null;
    v *= Math.max(0, 1 - d / 24);
    const ang = Math.atan2(dx, dz) - Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
    pan = Math.sin(ang) * -0.7 * Math.min(1, d / 3);
  }
  if (v < 0.01) return null;
  const g = ctx.createGain();
  g.gain.value = v;
  if (ctx.createStereoPanner) {
    const sp = ctx.createStereoPanner();
    sp.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(sp); sp.connect(master);
  } else g.connect(master);
  return g;
}

function noise(dest, t, dur, type, freq, q, vol, freqEnd) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

function tone(dest, t, dur, type, f0, f1, vol, lp) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lp;
    o.connect(f); f.connect(g);
  } else o.connect(g);
  g.connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
  return o;
}

// A struck thing rings at a few pitches of its own, each dying away: [hz, seconds, loudness]
function ring(dest, t, modes, type = 'sine') {
  for (const [f, dur, vol] of modes) tone(dest, t, dur, type, f * (0.97 + Math.random() * 0.06), f * 0.985, vol);
}
// Small bits falling or grinding: `n` short clicks of noise scattered over `span` seconds
function grains(dest, t, n, span, type, lo, hi, q, vol) {
  for (let i = 0; i < n; i++) noise(dest, t + (i ? Math.random() * span : 0), 0.018 + Math.random() * 0.03, type, lo + Math.random() * (hi - lo), q, vol * (0.55 + Math.random() * 0.45));
}

// What each kind of block sounds like when stepped on or hit (k = 1) and when it breaks (k > 1: longer, with bits falling)
const MAT = {
  // a hard clack with a low knock under it; breaking, it crumbles
  stone: (d, t, k) => {
    noise(d, t, 0.035, 'bandpass', 1500 + Math.random() * 700, 0.9, 0.55);
    tone(d, t, 0.05, 'sine', 170, 95, 0.3);
    if (k > 1) { grains(d, t + 0.03, 6, 0.2, 'bandpass', 700, 2400, 1.2, 0.4); noise(d, t, 0.2, 'lowpass', 500, 0.7, 0.25, 160); }
  },
  // a hollow knock: wood rings at a couple of low pitches and stops dead; breaking, it cracks and splinters
  wood: (d, t, k) => {
    ring(d, t, [[250 + Math.random() * 50, 0.07, 0.32], [570 + Math.random() * 90, 0.045, 0.2], [1180, 0.025, 0.08]], 'triangle');
    noise(d, t, 0.022, 'bandpass', 1100, 1.2, 0.3);
    if (k > 1) { noise(d, t, 0.1, 'bandpass', 2400, 1.5, 0.35, 800); grains(d, t + 0.04, 5, 0.16, 'bandpass', 500, 1700, 2.5, 0.38); tone(d, t + 0.02, 0.09, 'triangle', 190, 130, 0.22); }
  },
  // earth and turf: a soft thud with a rustle of blades over it
  grass: (d, t, k) => {
    noise(d, t, 0.07 * k, 'lowpass', 520, 0.7, 0.5, 180);
    noise(d, t + 0.01, 0.09 * k, 'bandpass', 3400 + Math.random() * 900, 0.8, 0.14);
    if (k > 1) grains(d, t + 0.03, 4, 0.14, 'lowpass', 500, 1100, 0.8, 0.3);
  },
  // loose stones grinding together
  gravel: (d, t, k) => { grains(d, t, k > 1 ? 11 : 5, k > 1 ? 0.24 : 0.09, 'bandpass', 900, 3200, 1.4, 0.45); noise(d, t, 0.06 * k, 'lowpass', 420, 0.7, 0.26); },
  // a dry hiss that swells and fades, with almost no thud
  sand: (d, t, k) => {
    const dur = 0.11 * k, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = 'bandpass'; f.frequency.setValueAtTime(3800, t); f.frequency.exponentialRampToValueAtTime(2200, t + dur); f.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(d);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    noise(d, t, 0.04, 'lowpass', 300, 0.7, 0.14);
    if (k > 1) grains(d, t + 0.04, 5, 0.16, 'highpass', 2500, 4500, 0.7, 0.16);
  },
  // packed snow squeaks as it gives
  snow: (d, t, k) => {
    noise(d, t, 0.09 * k, 'lowpass', 1000, 0.7, 0.36, 380);
    noise(d, t + 0.012, 0.06 * k, 'bandpass', 2100 + Math.random() * 500, 7, 0.2, 1500);
  },
  // cloth: a muffled pat
  wool: (d, t, k) => { noise(d, t, 0.06 * k, 'lowpass', 340, 0.7, 0.5, 150); noise(d, t, 0.035, 'bandpass', 1300, 0.8, 0.07); },
  // a bright clink; breaking, it shatters into falling pieces
  glass: (d, t, k) => {
    ring(d, t, [[2150, 0.09, 0.14], [3420, 0.07, 0.1], [5200, 0.05, 0.07]]);
    noise(d, t, 0.018, 'highpass', 4200, 0.8, 0.3);
    if (k > 1) {
      noise(d, t, 0.08, 'highpass', 3000, 0.8, 0.45);
      for (let i = 0; i < 9; i++) { const f = 1900 + Math.random() * 4200; tone(d, t + 0.02 + Math.random() * 0.3, 0.05 + Math.random() * 0.08, 'sine', f, f * 0.98, 0.09); }
      grains(d, t + 0.05, 7, 0.3, 'highpass', 3500, 7000, 1, 0.22);
    }
  },
  // a clang that rings on at pitches out of tune with each other
  metal: (d, t, k) => {
    ring(d, t, [[520, 0.2 * k, 0.16], [1310, 0.16 * k, 0.12], [2140, 0.12 * k, 0.09], [3350, 0.07, 0.06]], 'triangle');
    noise(d, t, 0.022, 'bandpass', 2800, 1.5, 0.4);
  },
};

// (soft, low sounds carry less: these bring each kind up to about the same loudness)
const MAT_GAIN = { stone: 2.2, wood: 2.2, grass: 4, gravel: 3.2, sand: 2.4, snow: 4, wool: 5, glass: 2, metal: 2.2 };
export function blockSound(mat, kind, pos) {
  if (!MAT[mat]) mat = 'stone';
  const vol = kind === 'step' ? 0.2 : kind === 'hit' ? 0.26 : 0.6;
  const d = out(vol * MAT_GAIN[mat], pos);
  if (!d) return;
  MAT[mat](d, ctx.currentTime, kind === 'break' ? 1.6 : 1);
}

// ---------------------------------------------------------------- voices
// A voice: a buzz that follows a pitch line, shaped by a mouth (`formants`: [hz, sharpness, loudness, hz it
// moves to]), with a wobble of pitch (`vib`: [times a second, hz]), a flutter of loudness (`trem`: [times a
// second, depth]), a growl (`rough`), and breath. `pitch` is a list of [how far through, hz].
function voice(dest, t, o) {
  const dur = o.dur, vol = o.vol ?? 0.3, k = o.k || 1;
  const att = Math.min(o.attack ?? 0.03, dur / 3), rel = Math.min(o.release ?? 0.08, dur / 2);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(vol, t + att);
  env.gain.setValueAtTime(vol, t + dur - rel);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  env.connect(dest);
  const throat = ctx.createGain();
  for (const [f, q, gain, f2] of o.formants) {
    const bp = ctx.createBiquadFilter(), bg = ctx.createGain();
    bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f, t);
    if (f2) bp.frequency.linearRampToValueAtTime(f2, t + dur);
    bg.gain.value = gain * 2.2;
    throat.connect(bp); bp.connect(bg); bg.connect(env);
  }
  const osc = ctx.createOscillator();
  osc.type = o.wave || 'sawtooth';
  osc.frequency.setValueAtTime(o.pitch[0][1] * k, t);
  for (const [at, hz] of o.pitch.slice(1)) osc.frequency.linearRampToValueAtTime(hz * k, t + at * dur);
  osc.connect(throat);
  const stop = t + dur + 0.03;
  const lfo = (rate, depth, param) => { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = rate; lg.gain.value = depth; l.connect(lg); lg.connect(param); l.start(t); l.stop(stop); };
  if (o.vib) lfo(o.vib[0], o.vib[1] * k, osc.frequency);
  if (o.trem) lfo(o.trem[0], o.trem[1], throat.gain);
  if (o.rough) lfo(o.rough[0], o.rough[1], throat.gain);
  if (o.breath) {
    const src = ctx.createBufferSource(), ng = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true; ng.gain.value = o.breath;
    src.connect(ng); ng.connect(throat);
    src.start(t, Math.random() * 0.5); src.stop(stop);
  }
  osc.start(t); osc.stop(stop);
}
// Air blown through nostrils: noise that flutters
function snort(dest, t, dur, freq, vol, rate = 24) {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), am = ctx.createGain();
  src.buffer = noiseBuf; src.loop = true;
  f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur); f.Q.value = 0.8;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = rate; lg.gain.value = 0.6; l.connect(lg); lg.connect(am.gain); l.start(t); l.stop(t + dur + 0.03);
  src.connect(f); f.connect(am); am.connect(g); g.connect(dest);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.03);
}
const rnd = (a, b) => a + Math.random() * (b - a);

// The animals. Each is given `o.hurt` when it has just been hit: a shorter, higher cry of the same voice.
const ANIMAL = {
  // "mmmoooo": low, long and nasal, the mouth opening as it goes
  cow: (d, t, o = {}) => voice(d, t, {
    dur: o.hurt ? 0.5 : rnd(1.1, 1.5), k: (o.hurt ? 1.25 : 1) * rnd(0.94, 1.06), vol: 0.5, attack: o.hurt ? 0.03 : 0.14, release: 0.3,
    pitch: [[0, 92], [0.18, 122], [0.62, 132], [1, 98]], vib: [4.5, 2.5], breath: 0.03,
    formants: [[290, 5, 1, 440], [720, 6, 0.55, 940], [2300, 7, 0.07]],
  }),
  // two or three throaty grunts; a squeal when hurt
  pig: (d, t, o = {}) => {
    if (o.hurt) return voice(d, t, { dur: 0.32, vol: 0.34, pitch: [[0, 520], [0.3, 900], [1, 640]], vib: [22, 50], breath: 0.2, formants: [[1250, 4, 1], [2500, 5, 0.8], [3700, 6, 0.3]], attack: 0.015, release: 0.1 });
    const n = Math.random() < 0.5 ? 2 : 3, k = (o.k || 1) * rnd(0.93, 1.07);
    for (let i = 0; i < n; i++) {
      const at = t + i * rnd(0.19, 0.24);
      voice(d, at, { dur: rnd(0.11, 0.2), k, vol: 0.42, pitch: [[0, 150], [1, 104]], rough: [58, 0.75], breath: 0.3, formants: [[500, 3, 1], [1250, 4, 0.5], [2500, 5, 0.12]], attack: 0.012, release: 0.05 });
      snort(d, at, 0.1, 1400 * k, 0.1, 40);
    }
  },
  // "baaa": a wavering bleat through an open mouth
  sheep: (d, t, o = {}) => voice(d, t, {
    dur: o.hurt ? 0.38 : rnd(0.65, 0.9), k: (o.hurt ? 1.2 : 1) * rnd(0.92, 1.08), vol: 0.4, attack: 0.03, release: 0.2,
    pitch: [[0, 296], [0.12, 330], [1, 268]], vib: [12, 13], trem: [12, 0.55],
    formants: [[790, 5, 1], [1760, 7, 0.75], [2700, 8, 0.25]],
  }),
  // "bok bok bok b'gawk"
  chicken: (d, t, o = {}) => {
    const cluck = (at, dur, top, vol) => voice(d, at, { dur, vol, pitch: [[0, top * 0.55], [0.4, top], [1, top * 0.62]], formants: [[1150, 4, 1], [2450, 5, 0.7], [3600, 6, 0.3]], attack: 0.006, release: dur * 0.4, trem: dur > 0.15 ? [30, 0.3] : null });
    if (o.hurt) return cluck(t, 0.24, 980, 0.34);
    const n = 2 + Math.floor(Math.random() * 3);
    let at = t;
    for (let i = 0; i < n; i++) { cluck(at, rnd(0.06, 0.085), rnd(660, 760), 0.26); at += rnd(0.13, 0.19); }
    if (Math.random() < 0.6) cluck(at, 0.27, 920, 0.32);
  },
  // a whinny: starts high and tumbles down, shaking as it goes, then a blow through the nose
  horse: (d, t, o = {}) => {
    if (o.snort || (!o.hurt && !o.neigh && Math.random() < 0.45)) return snort(d, t, rnd(0.35, 0.5), 800, 0.36, 26);
    const dur = o.hurt ? 0.6 : rnd(1.1, 1.4), k = rnd(0.92, 1.06) * (o.k || 1);
    voice(d, t, { dur, k, vol: 0.38, attack: 0.05, release: 0.3, pitch: [[0, 640], [0.12, 1180], [0.45, 840], [1, 300]], vib: [13, 55], trem: [13, 0.45], breath: 0.22,
      formants: [[950, 3, 1, 620], [2150, 4, 0.7, 1500], [3300, 5, 0.22]] });
    if (!o.hurt) snort(d, t + dur * 0.92, 0.3, 700, 0.2, 24);
  },
  // "hee-haw": a squeaky breath in, then a low rasping bray out
  donkey: (d, t, o = {}) => {
    const k = rnd(0.94, 1.06);
    const pair = (at, s) => {
      voice(d, at, { dur: 0.3 * s, k, vol: 0.3, pitch: [[0, 440], [0.5, 580], [1, 540]], rough: [70, 0.4], breath: 0.45, formants: [[1050, 4, 1], [2300, 5, 0.8]], attack: 0.03, release: 0.06 });
      voice(d, at + 0.34 * s, { dur: 0.56 * s, k, vol: 0.46, pitch: [[0, 262], [0.2, 232], [1, 172]], rough: [46, 0.55], breath: 0.2, formants: [[660, 3, 1], [1150, 4, 0.7], [2400, 6, 0.2]], attack: 0.03, release: 0.2 });
    };
    pair(t, 1);
    if (!o.hurt) pair(t + 1.0, 0.85);
  },
  // "hrmm": a hum through the nose, asking (rising) or settled (falling); `pitch` below 1 is a no
  villager: (d, t, o = {}) => {
    const k = (o.pitch || 1) * rnd(0.95, 1.05), no = (o.pitch || 1) < 0.9;
    const line = o.hurt ? [[0, 230], [1, 150]] : no ? [[0, 176], [0.4, 150], [1, 118]] : Math.random() < 0.5 ? [[0, 148], [0.55, 172], [1, 214]] : [[0, 186], [0.35, 200], [1, 138]];
    voice(d, t, { dur: o.hurt ? 0.26 : rnd(0.36, 0.5), k: no ? rnd(0.95, 1.05) : k, vol: 0.4, attack: 0.04, release: 0.14, pitch: line, vib: [5, 2], formants: [[285, 4, 1], [1050, 6, 0.38], [2400, 8, 0.1]] });
  },
};
// (which of them cry out in their own voice when hit)
const VOICED = new Set(Object.keys(ANIMAL));

const MOB = {
  ...ANIMAL,
  zombie: (d, t) => { const o = tone(d, t, 1.0, 'sawtooth', 95, 70, 0.4, 420); const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 3; lg.gain.value = 10; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 1.05); },
  skeleton: (d, t) => { for (let i = 0; i < 5; i++) noise(d, t + i * 0.06, 0.03, 'bandpass', 3000, 4, 0.4); },
  spider: (d, t) => { noise(d, t, 0.35, 'bandpass', 500, 2, 0.4, 900); },
  boomer: (d, t) => { noise(d, t, 0.4, 'bandpass', 300, 3, 0.35, 160); },
  illager: (d, t) => { tone(d, t, 0.3, 'sawtooth', 150, 120, 0.3, 700); },
  witch: (d, t) => { for (let i = 0; i < 4; i++) tone(d, t + i * 0.09, 0.08, 'square', 700 - i * 60, 500 - i * 50, 0.15, 1500); },
  slime: (d, t) => { noise(d, t, 0.15, 'lowpass', 500, 2, 0.4, 150); tone(d, t, 0.1, 'sine', 180, 90, 0.2); },
  shade: (d, t) => { const o = tone(d, t, 1.0, 'sine', 220, 110, 0.3); const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 7; lg.gain.value = 40; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 1.05); },
  gloomwing: (d, t) => { tone(d, t, 0.5, 'sawtooth', 1400, 600, 0.18, 2600); noise(d, t, 0.4, 'highpass', 3000, 1, 0.12); },
  golem: (d, t) => { tone(d, t, 0.2, 'triangle', 90, 60, 0.4); noise(d, t, 0.12, 'bandpass', 900, 3, 0.3); },
  // the Nether and the End
  wailer: (d, t) => { const o = tone(d, t, 1.4, 'sine', 700, 340, 0.3); const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 6; lg.gain.value = 60; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 1.45); },
  cinder: (d, t) => { noise(d, t, 0.6, 'bandpass', 900, 1.5, 0.3, 300); tone(d, t, 0.5, 'sawtooth', 110, 90, 0.15, 500); },
  // (pig folk: the pig's grunt, deeper, with a snuffle)
  snoutling: (d, t, o) => { ANIMAL.pig(d, t, { k: 0.78 * ((o && o.pitch) || 1) }); snort(d, t + 0.5, 0.22, 900, 0.16, 30); },
  // a boar's deep, growling grunt
  tusker: (d, t) => { voice(d, t, { dur: 0.6, vol: 0.5, pitch: [[0, 96], [0.3, 84], [1, 66]], rough: [34, 0.8], breath: 0.3, formants: [[420, 3, 1], [950, 4, 0.5], [2100, 6, 0.1]], attack: 0.03, release: 0.2 }); snort(d, t + 0.05, 0.3, 600, 0.2, 30); },
  // a warbling chirrup
  strider: (d, t) => voice(d, t, { dur: 0.36, vol: 0.3, wave: 'triangle', pitch: [[0, 520], [0.5, 720], [1, 560]], trem: [18, 0.5], vib: [18, 30], formants: [[900, 3, 1], [1900, 4, 0.6]], attack: 0.02, release: 0.12 }),
  clamper: (d, t) => { noise(d, t, 0.2, 'bandpass', 1200, 4, 0.3); tone(d, t, 0.15, 'triangle', 300, 420, 0.15); },
  dragon: (d, t) => { noise(d, t, 1.8, 'lowpass', 600, 1, 0.8, 90); tone(d, t, 1.6, 'sawtooth', 70, 45, 0.5, 400); },
};

export function sfx(name, pos, opts = {}) {
  if (!ctx) return;
  const d = out(opts.vol ?? 1, pos);
  if (!d) return;
  const t = ctx.currentTime;
  switch (name) {
    case 'hurt': {
      // a short voiced "oof": falling pitch through two vowel-like formants
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(230, t);
      o.frequency.exponentialRampToValueAtTime(120, t + 0.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      for (const [f, q, v] of [[600, 5, 1], [1000, 6, 0.5]]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
        const bg = ctx.createGain(); bg.gain.value = v;
        o.connect(bp); bp.connect(bg); bg.connect(g);
      }
      g.connect(d);
      o.start(t); o.stop(t + 0.25);
      break;
    }
    case 'mobhurt':
      if (opts.voice === 'boat') MAT.wood(d, t, 1.6);
      else if (VOICED.has(opts.voice)) ANIMAL[opts.voice](d, t, { hurt: true });
      else tone(d, t, 0.15, 'square', (opts.pitch || 1) * 420, (opts.pitch || 1) * 250, 0.25, 1400);
      break;
    case 'gallop': for (let i = 0; i < 2; i++) { noise(d, t + i * 0.09, 0.05, 'lowpass', 420, 0.8, 1.6, 140); noise(d, t + i * 0.09, 0.02, 'bandpass', 1500, 1.2, 0.5); tone(d, t + i * 0.09, 0.04, 'sine', 120, 70, 0.4); } break;
    case 'paddle': noise(d, t, 0.32, 'lowpass', 1100, 0.8, 0.9, 380); noise(d, t + 0.05, 0.2, 'bandpass', 2400, 0.8, 0.25); tone(d, t, 0.05, 'triangle', 220, 160, 0.2); break;
    case 'saddle': noise(d, t, 0.1, 'bandpass', 900, 1.5, 1.2, 500); noise(d, t + 0.06, 0.05, 'bandpass', 2600, 3, 0.6); break;
    case 'pop': tone(d, t, 0.07, 'sine', 700, 1100, 0.25); break;
    case 'eat': noise(d, t, 0.07, 'bandpass', 700 + Math.random() * 900, 1.8, 0.5); noise(d, t + 0.03, 0.05, 'highpass', 2500, 0.8, 0.15); break;
    case 'burp': tone(d, t, 0.25, 'sawtooth', 120, 80, 0.3, 500); break;
    case 'explode':
      noise(d, t, 1.6, 'lowpass', 1400, 0.8, 1.0, 60);
      tone(d, t, 0.8, 'sine', 70, 30, 0.8);
      break;
    case 'fuse': noise(d, t, 1.5, 'highpass', 3000, 0.7, 0.3); break;
    case 'bow': tone(d, t, 0.15, 'triangle', 420, 180, 0.3); noise(d, t, 0.1, 'highpass', 2000, 1, 0.2); break;
    case 'arrowhit': noise(d, t, 0.06, 'bandpass', 1400, 2, 0.4); break;
    case 'click': tone(d, t, 0.04, 'sine', 900, 800, 0.15); break;
    case 'splash': noise(d, t, 0.45, 'lowpass', 1300, 0.8, 0.5, 400); break;
    case 'swim': noise(d, t, 0.2, 'lowpass', 900, 0.8, 0.2); break;
    case 'attack': noise(d, t, 0.06, 'bandpass', 800, 1, 0.3); break;
    case 'ignite': noise(d, t, 0.2, 'highpass', 2500, 1, 0.3); tone(d, t, 0.05, 'square', 2000, 1500, 0.1); break;
    case 'furnace': noise(d, t, 0.3, 'lowpass', 500, 0.7, 0.2); break;
    case 'chest': tone(d, t, 0.2, 'triangle', 200, 140, 0.25, 800); noise(d, t, 0.15, 'bandpass', 600, 2, 0.2); break;
    case 'fall': tone(d, t, 0.15, 'sine', 160, 60, 0.5); noise(d, t, 0.1, 'lowpass', 800, 0.8, 0.4); break;
    case 'break_tool': tone(d, t, 0.2, 'square', 1200, 400, 0.2); break;
    case 'door': noise(d, t, 0.12, 'bandpass', 500, 2, 0.5); tone(d, t, 0.08, 'triangle', 160, 120, 0.2); break;
    case 'armor': noise(d, t, 0.15, 'bandpass', 2200, 3, 0.3); tone(d, t, 0.12, 'triangle', 700, 650, 0.12); break;
    case 'teleport': tone(d, t, 0.4, 'sine', 300, 1200, 0.25); noise(d, t, 0.3, 'bandpass', 1500, 4, 0.15); break;
    case 'splash_potion': for (let i = 0; i < 4; i++) tone(d, t + i * 0.02, 0.15, 'sine', 2200 + Math.random() * 2000, 1500, 0.1); noise(d, t, 0.3, 'highpass', 2500, 1, 0.3); break;
    case 'fireball': noise(d, t, 0.5, 'lowpass', 900, 0.8, 0.5, 200); tone(d, t, 0.3, 'sawtooth', 160, 60, 0.2, 400); break;
    case 'extinguish': noise(d, t, 0.5, 'highpass', 2600, 0.8, 0.35); break;
    case 'shield': tone(d, t, 0.12, 'square', 190, 90, 0.35, 700); noise(d, t, 0.09, 'bandpass', 900, 1.5, 0.5); break;
    case 'burn': for (let i = 0; i < 3; i++) noise(d, t + Math.random() * 0.25, 0.04, 'bandpass', 1800 + Math.random() * 2500, 3, 0.25); noise(d, t, 0.4, 'lowpass', 500, 0.7, 0.12); break;
    case 'bucket': noise(d, t, 0.25, 'lowpass', 1100, 0.8, 0.35, 500); break;
    case 'portal': { const o = tone(d, t, 2.5, 'sine', 180, 260, 0.2); const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 4; lg.gain.value = 30; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 2.55); break; }
    case 'travel': tone(d, t, 1.2, 'sine', 140, 900, 0.4); noise(d, t, 1.2, 'bandpass', 1200, 2, 0.3); break;
    case 'eye': tone(d, t, 0.3, 'triangle', 900, 1400, 0.2); break;
    case 'frame': tone(d, t, 0.25, 'triangle', 500, 700, 0.3); noise(d, t, 0.1, 'bandpass', 2000, 3, 0.2); break;
    case 'xp': tone(d, t, 0.09, 'sine', 1200 * (opts.pitch || 1), 1900 * (opts.pitch || 1), 0.22); break;
    case 'levelup': for (let i = 0; i < 4; i++) tone(d, t + i * 0.09, 0.35, 'triangle', [523, 659, 784, 1047][i], [523, 659, 784, 1047][i] * 1.01, 0.2); break;
    case 'enchant': for (let i = 0; i < 6; i++) tone(d, t + i * 0.05, 0.3, 'sine', 900 + Math.random() * 1800, 600 + Math.random() * 900, 0.1); tone(d, t, 0.7, 'sine', 110, 220, 0.2); break;
    case 'anvil': tone(d, t, 0.5, 'triangle', 820, 780, 0.3); noise(d, t, 0.12, 'bandpass', 2400, 4, 0.5); tone(d, t + 0.02, 0.4, 'square', 1640, 1600, 0.06); break;
    case 'achieve': for (let i = 0; i < 3; i++) tone(d, t + i * 0.12, 0.5, 'triangle', [659, 880, 1319][i], [659, 880, 1319][i], 0.22); break;
    case 'thunder': noise(d, t, 2.2, 'lowpass', 900, 0.7, 1.0, 70); noise(d, t, 0.25, 'highpass', 2000, 0.8, 0.5); break;
    case 'cast': noise(d, t, 0.2, 'highpass', 1800, 1, 0.25, 4000); break;
    case 'bite': noise(d, t, 0.3, 'lowpass', 1500, 0.8, 0.45, 500); tone(d, t, 0.1, 'sine', 500, 300, 0.2); break;
    case 'load': noise(d, t, 0.08, 'bandpass', 900, 3, 0.4); tone(d, t + 0.05, 0.08, 'square', 300, 240, 0.15, 900); break;
    case 'portal_open': for (let i = 0; i < 5; i++) tone(d, t + i * 0.12, 0.9, 'sine', 220 * (1 + i * 0.25), 330 * (1 + i * 0.25), 0.18); break;
    default: if (MOB[name]) MOB[name](d, t, opts);
  }
}

// For tools/sounds.html: runs `make` with the sound going into a recording `seconds` long instead of the
// speakers, and gives back the recording (an AudioBuffer)
export async function recordSound(make, seconds = 2) {
  const keep = [ctx, master, noiseBuf];
  const off = new OfflineAudioContext(1, Math.ceil(44100 * seconds), 44100);
  ctx = off; master = off.createGain(); master.connect(off.destination);
  noiseBuf = off.createBuffer(1, off.sampleRate, off.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  try { make(); } finally { [ctx, master, noiseBuf] = keep; }
  return off.startRendering();
}
