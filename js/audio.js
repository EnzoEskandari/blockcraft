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

const MAT = {
  stone: (d, t, k) => noise(d, t, 0.09 * k, 'bandpass', 1700 + Math.random() * 400, 1.2, 0.5),
  wood: (d, t, k) => { noise(d, t, 0.1 * k, 'bandpass', 650 + Math.random() * 150, 2, 0.6); tone(d, t, 0.06, 'triangle', 180, 140, 0.15); },
  grass: (d, t, k) => noise(d, t, 0.13 * k, 'lowpass', 2200 + Math.random() * 800, 0.7, 0.45),
  gravel: (d, t, k) => { for (let i = 0; i < 3; i++) noise(d, t + i * 0.03, 0.05 * k, 'bandpass', 1100 + Math.random() * 500, 0.8, 0.45); },
  sand: (d, t, k) => noise(d, t, 0.12 * k, 'highpass', 2600, 0.7, 0.3),
  snow: (d, t, k) => noise(d, t, 0.12 * k, 'lowpass', 1400, 0.7, 0.4),
  wool: (d, t, k) => noise(d, t, 0.09 * k, 'lowpass', 700, 0.7, 0.4),
  glass: (d, t, k) => { noise(d, t, 0.08 * k, 'highpass', 3500, 1, 0.4); tone(d, t, 0.1, 'sine', 2400, 1900, 0.12); },
  metal: (d, t, k) => { noise(d, t, 0.08 * k, 'bandpass', 2600, 3, 0.4); tone(d, t, 0.18, 'triangle', 900, 860, 0.15); },
};

export function blockSound(mat, kind, pos) {
  const vol = kind === 'step' ? 0.22 : kind === 'hit' ? 0.25 : 0.6;
  const d = out(vol, pos);
  if (!d) return;
  const t = ctx.currentTime;
  const k = kind === 'break' ? 1.6 : 1;
  (MAT[mat] || MAT.stone)(d, t, k);
  if (kind === 'break' && mat === 'glass') for (let i = 0; i < 4; i++) tone(d, t + i * 0.03, 0.12, 'sine', 2000 + Math.random() * 2500, 1500, 0.1);
}

const MOB = {
  pig: (d, t) => { tone(d, t, 0.12, 'square', 320, 210, 0.25, 900); tone(d, t + 0.16, 0.1, 'square', 300, 200, 0.2, 900); },
  cow: (d, t) => { const o = tone(d, t, 0.9, 'sawtooth', 150, 105, 0.35, 600); const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5; lg.gain.value = 6; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 0.95); },
  sheep: (d, t) => { const o = tone(d, t, 0.55, 'sawtooth', 430, 400, 0.22, 1600); const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 11; lg.gain.value = 30; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 0.6); },
  chicken: (d, t) => { for (let i = 0; i < 3; i++) tone(d, t + i * 0.08, 0.05, 'triangle', 1300, 900, 0.18); },
  zombie: (d, t) => { const o = tone(d, t, 1.0, 'sawtooth', 95, 70, 0.4, 420); const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 3; lg.gain.value = 10; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 1.05); },
  skeleton: (d, t) => { for (let i = 0; i < 5; i++) noise(d, t + i * 0.06, 0.03, 'bandpass', 3000, 4, 0.4); },
  spider: (d, t) => { noise(d, t, 0.35, 'bandpass', 500, 2, 0.4, 900); },
  boomer: (d, t) => { noise(d, t, 0.4, 'bandpass', 300, 3, 0.35, 160); },
  villager: (d, t, o) => { const k = (o && o.pitch) || 1; tone(d, t, 0.18, 'sawtooth', 210 * k, 250 * k, 0.25, 900); tone(d, t + 0.18, 0.22, 'sawtooth', 240 * k, 190 * k, 0.22, 900); },
  illager: (d, t) => { tone(d, t, 0.3, 'sawtooth', 150, 120, 0.3, 700); },
  witch: (d, t) => { for (let i = 0; i < 4; i++) tone(d, t + i * 0.09, 0.08, 'square', 700 - i * 60, 500 - i * 50, 0.15, 1500); },
  slime: (d, t) => { noise(d, t, 0.15, 'lowpass', 500, 2, 0.4, 150); tone(d, t, 0.1, 'sine', 180, 90, 0.2); },
  shade: (d, t) => { const o = tone(d, t, 1.0, 'sine', 220, 110, 0.3); const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 7; lg.gain.value = 40; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 1.05); },
  gloomwing: (d, t) => { tone(d, t, 0.5, 'sawtooth', 1400, 600, 0.18, 2600); noise(d, t, 0.4, 'highpass', 3000, 1, 0.12); },
  golem: (d, t) => { tone(d, t, 0.2, 'triangle', 90, 60, 0.4); noise(d, t, 0.12, 'bandpass', 900, 3, 0.3); },
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
    case 'mobhurt': tone(d, t, 0.15, 'square', (opts.pitch || 1) * 420, (opts.pitch || 1) * 250, 0.25, 1400); break;
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
    default: if (MOB[name]) MOB[name](d, t, opts);
  }
}
