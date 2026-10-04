// Keyboard, mouse (pointer lock) and touch controls, merged into one per-frame input state.
import { G } from './game.js';
import { initAudio } from './audio.js';

export const input = {
  moveX: 0, moveZ: 0,
  jump: false, jumpPressed: false,
  sneak: false, sprint: false, sprintLatch: false,
  swapHands: false,   // F: swap the main hand and the off hand
  block: false,       // the shield button on a touch screen is held
  lookX: 0, lookY: 0,
  attackPressed: false, mine: false,
  usePressed: false, useHeld: false, tap: false,
  drop: false, dropAll: false, pick: false,
  aim: null,   // touch aiming point in normalised screen coordinates, or null for the crosshair
};
const IS_MAC = /Mac/.test(navigator.platform || '') || /Mac OS X/.test(navigator.userAgent);
let ctrlUse = false;

const keys = new Set();
let mouseL = false, mouseR = false;
let lastW = 0;
let mouseX = 0, mouseY = 0, mouseInside = false;

const touch = {
  joyId: null, joyX: 0, joyY: 0, joyDX: 0, joyDY: 0,
  lookId: null, lastX: 0, lastY: 0, startX: 0, startY: 0, startT: 0, dragging: false, holding: false, holdTimer: 0, tapX: 0, tapY: 0,
  jump: false, sneakLatch: false, sneakHold: false, sprintLatch: false, block: false,
};

const $ = (id) => document.getElementById(id);
const SLOP = 12;        // px a finger can wobble before it counts as turning the camera
const HOLD_MS = 280;    // how long a still finger waits before it starts mining

function playing() { return G.state === 'playing' && !G.screen; }

// A lock request that fails right after a click means this browser/frame has no pointer lock:
// fall back to edge-turning. Failures without a click just show the "click to play" hint.
export function requestLock(fromClick = false) {
  if (G.touchMode || !G.canvas.requestPointerLock) { if (fromClick) G.noLock = true; return; }
  G.lockFromClick = fromClick;
  const fail = () => { if (G.lockFromClick) G.noLock = true; };
  try {
    const r = G.canvas.requestPointerLock();
    if (r && r.catch) r.catch(fail);
  } catch { fail(); }
}

export function exitLock() {
  if (document.pointerLockElement) {
    G.suppressPause = true;
    try { document.exitPointerLock(); } catch { /* ignore */ }
  }
}

export function setTouchMode(on) {
  G.touchMode = on;
  document.body.classList.toggle('touch', on);
  G.ui && G.ui.updateTouchVisibility();
}

export function initInput() {
  const canvas = G.canvas;

  window.addEventListener('keydown', (e) => {
    initAudio();
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    const code = e.code;
    if (G.screen) {
      if (code === 'Escape' || (code === 'KeyE' && G.ui.isInventoryScreen())) { e.preventDefault(); G.ui.back(); }
      return;
    }
    if (G.state !== 'playing') return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F3'].includes(code)) e.preventDefault();
    if (G.touchMode && !e.repeat && code !== 'Escape') setTouchMode(G.settings.touch === 'on');
    if (!e.repeat) {
      if (code === 'Space') input.jumpPressed = true;
      if (code === 'KeyW') {
        const now = performance.now();
        if (now - lastW < 260) input.sprintLatch = true;
        lastW = now;
      }
      if (code === 'KeyE') { G.ui.openScreen(G.player.creative ? 'creative' : 'inventory'); return; }
      if ((code === 'KeyT' || code === 'Enter') && G.net) { e.preventDefault(); G.ui.openScreen('chat'); return; }
      if (code === 'KeyQ') { input.drop = true; input.dropAll = e.ctrlKey || e.metaKey; }
      if (code === 'KeyF') input.swapHands = true;
      if (code === 'F3') { G.settings.showCoords = !G.settings.showCoords; }
      if (code === 'Escape' && !document.pointerLockElement) { G.ui.openScreen('pause'); return; }
      if (code.startsWith('Digit')) {
        const n = +code.slice(5);
        if (n >= 1 && n <= 9) { G.player.inv.selected = n - 1; G.ui.invChanged(true); }
      }
    }
    keys.add(code);
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'KeyW') input.sprintLatch = false;
  });
  window.addEventListener('blur', () => { keys.clear(); mouseL = mouseR = false; input.sprintLatch = false; });

  canvas.addEventListener('mousedown', (e) => {
    initAudio();
    if (G.touchMode && e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
    if (!playing()) return;
    if (G.touchMode) setTouchMode(G.settings.touch === 'on');
    if (!document.pointerLockElement && !G.noLock) { requestLock(true); return; }
    if (e.button === 0 && e.ctrlKey && IS_MAC) { ctrlUse = true; mouseR = true; input.usePressed = true; }
    else if (e.button === 0) { mouseL = true; input.attackPressed = true; }
    else if (e.button === 2) { mouseR = true; input.usePressed = true; }
    else if (e.button === 1) { input.pick = true; e.preventDefault(); }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) { mouseL = false; if (ctrlUse) { ctrlUse = false; mouseR = false; } }
    if (e.button === 2) mouseR = false;
  });
  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX; mouseY = e.clientY; mouseInside = true;
    if (!playing()) return;
    const locked = !!document.pointerLockElement;
    if (!locked && !G.noLock) return;
    const k = 0.0022 * G.settings.sensitivity;
    input.lookX += e.movementX * k;
    input.lookY += e.movementY * k;
  });
  document.addEventListener('mouseleave', () => { mouseInside = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    if (!playing()) return;
    e.preventDefault();
    const inv = G.player.inv;
    inv.selected = (inv.selected + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
    G.ui.invChanged(true);
  }, { passive: false });

  document.addEventListener('pointerlockchange', () => {
    G.pointerLocked = !!document.pointerLockElement;
    if (G.pointerLocked) { G.noLock = false; G.ui.hideClickToPlay(); }
    if (!G.pointerLocked) {
      mouseL = mouseR = false;
      if (G.state === 'playing' && !G.screen && !G.suppressPause && !G.touchMode) G.ui.openScreen('pause');
      G.suppressPause = false;
    }
  });
  document.addEventListener('pointerlockerror', () => { if (G.lockFromClick) G.noLock = true; });

  initTouch();
}

// ---------------------------------------------------------------- touch
function initTouch() {
  const layer = $('touch-layer');
  const stick = $('stick'), knob = $('stick-knob');
  const R = 56;

  layer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    initAudio();
    if (!G.touchMode && G.settings.touch !== 'off') setTouchMode(true);
    if (!playing()) return;
    const W = window.innerWidth, H = window.innerHeight;
    for (const t of e.changedTouches) {
      if (touch.joyId === null && t.clientX < Math.min(W * 0.34, 340) && t.clientY > H * 0.45) {
        touch.joyId = t.identifier;
        touch.joyX = t.clientX; touch.joyY = t.clientY;
        touch.joyDX = touch.joyDY = 0;
        touch.joyT = performance.now();
        touch.joyMoved = 0;
        stick.style.left = t.clientX + 'px';
        stick.style.top = t.clientY + 'px';
        stick.classList.add('active');
        knob.style.transform = 'translate(-50%, -50%)';
      } else if (touch.lookId === null) {
        touch.lookId = t.identifier;
        touch.lastX = touch.startX = t.clientX;
        touch.lastY = touch.startY = t.clientY;
        touch.startT = performance.now();
        touch.dragging = false;
        touch.holding = false;
        clearTimeout(touch.holdTimer);
        // A finger that stays put starts mining whatever is under it
        touch.holdTimer = setTimeout(() => { if (touch.lookId !== null && !touch.dragging) touch.holding = true; }, HOLD_MS);
      }
    }
  }, { passive: false });

  layer.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === touch.joyId) {
        let dx = t.clientX - touch.joyX, dy = t.clientY - touch.joyY;
        const d = Math.hypot(dx, dy);
        touch.joyMoved = Math.max(touch.joyMoved, d);
        if (d > R) { dx = dx / d * R; dy = dy / d * R; }
        touch.joyDX = dx / R; touch.joyDY = dy / R;
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (t.identifier === touch.lookId) {
        // While mining with finger aim, sliding moves the aim to the next block instead of the camera
        if (touch.holding && G.settings.touchAim === 'finger') { touch.lastX = t.clientX; touch.lastY = t.clientY; continue; }
        if (!touch.dragging) {
          // small wobbles don't turn the view, so taps land exactly where the finger went down
          if (Math.hypot(t.clientX - touch.startX, t.clientY - touch.startY) < SLOP) continue;
          touch.dragging = true;
          clearTimeout(touch.holdTimer);
          touch.lastX = t.clientX; touch.lastY = t.clientY;
          continue;
        }
        const dx = t.clientX - touch.lastX, dy = t.clientY - touch.lastY;
        touch.lastX = t.clientX; touch.lastY = t.clientY;
        const k = 0.0052 * G.settings.touchSens;
        input.lookX += dx * k;
        input.lookY += dy * k;
      }
    }
  }, { passive: false });

  const end = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === touch.joyId) {
        touch.joyId = null;
        touch.joyDX = touch.joyDY = 0;
        stick.classList.remove('active');
        stick.style.left = stick.style.top = '';
        knob.style.transform = 'translate(-50%, -50%)';
        touch.sprintLatch = false;
        $('t-sprint').classList.remove('latched');
      } else if (t.identifier === touch.lookId) {
        clearTimeout(touch.holdTimer);
        const dur = performance.now() - touch.startT;
        if (!touch.holding && !touch.dragging && dur < 450 && playing()) {
          input.tap = true;
          touch.tapX = touch.startX; touch.tapY = touch.startY;
        }
        touch.lookId = null;
        touch.holding = false;
        touch.dragging = false;
      }
    }
  };
  layer.addEventListener('touchend', end, { passive: false });
  layer.addEventListener('touchcancel', end, { passive: false });

  const hold = (id, on, off) => {
    const el = $(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); initAudio(); on(); el.classList.add('down'); }, { passive: false });
    const up = (e) => { e.preventDefault(); off && off(); el.classList.remove('down'); };
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    el.addEventListener('mousedown', (e) => { e.preventDefault(); on(); });
    el.addEventListener('mouseup', (e) => { e.preventDefault(); off && off(); });
  };
  hold('t-jump', () => { touch.jump = true; input.jumpPressed = true; }, () => { touch.jump = false; });
  hold('t-sneak', () => {
    if (G.player && G.player.flying) touch.sneakHold = true;
    else { touch.sneakLatch = !touch.sneakLatch; $('t-sneak').classList.toggle('latched', touch.sneakLatch); }
  }, () => { touch.sneakHold = false; });
  hold('t-sprint', () => {
    touch.sprintLatch = !touch.sprintLatch;
    $('t-sprint').classList.toggle('latched', touch.sprintLatch);
  });
  hold('t-inv', () => { if (playing()) G.ui.openScreen(G.player.creative ? 'creative' : 'inventory'); });
  hold('t-pause', () => { if (playing()) G.ui.openScreen('pause'); });
  hold('t-drop', () => { if (playing()) input.drop = true; });
  hold('t-shield', () => { touch.block = true; }, () => { touch.block = false; });

  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
}

// Called once per frame before the player update
export function pollInput(dt) {
  const k = (c) => keys.has(c);
  let mx = 0, mz = 0;
  if (k('KeyW') || k('ArrowUp')) mz += 1;
  if (k('KeyS') || k('ArrowDown')) mz -= 1;
  if (k('KeyA')) mx -= 1;
  if (k('KeyD')) mx += 1;
  if (k('ArrowLeft')) input.lookX -= dt * 2.4;
  if (k('ArrowRight')) input.lookX += dt * 2.4;
  if (touch.joyId !== null) { mx += touch.joyDX; mz -= touch.joyDY; }
  input.moveX = mx;
  input.moveZ = mz;
  input.jump = k('Space') || touch.jump;
  input.sneak = k('ShiftLeft') || k('ShiftRight') || touch.sneakLatch || touch.sneakHold;
  input.block = touch.block;
  input.sprint = k('ControlLeft') || k('ControlRight') || touch.sprintLatch
    || (touch.joyId !== null && touch.joyDY < -0.92 && Math.abs(touch.joyDX) < 0.45);
  input.mine = mouseL || touch.holding;
  input.useHeld = mouseR;

  // Without pointer lock the view turns when the cursor nears the screen edge
  if (G.noLock && !G.touchMode && mouseInside && playing()) {
    const W = window.innerWidth, H = window.innerHeight, m = 40;
    if (mouseX < m) input.lookX -= dt * 2 * (1 - mouseX / m);
    if (mouseX > W - m) input.lookX += dt * 2 * (1 - (W - mouseX) / m);
    if (mouseY < m) input.lookY -= dt * 1.5 * (1 - mouseY / m);
    if (mouseY > H - m) input.lookY += dt * 1.5 * (1 - (H - mouseY) / m);
  }
  // Touch screens aim at the finger (tap where you want to place, hold where you want to mine)
  input.aim = null;
  if (G.touchMode && G.settings.touchAim === 'finger') {
    const ndc = (x, y) => ({ x: (x / window.innerWidth) * 2 - 1, y: -((y / window.innerHeight) * 2 - 1) });
    if (input.tap) input.aim = ndc(touch.tapX, touch.tapY);
    else if (touch.lookId !== null) input.aim = ndc(touch.lastX, touch.lastY);
  }
  if (!playing()) { input.moveX = input.moveZ = 0; input.jump = input.mine = input.useHeld = input.block = false; }
}

export function endFrame() {
  input.lookX = input.lookY = 0;
  input.jumpPressed = input.attackPressed = input.usePressed = input.tap = false;
  input.drop = input.dropAll = input.pick = input.swapHands = false;
}

export function resetTouch() {
  touch.sneakLatch = false;
  touch.sneakHold = false;
  touch.jump = false;
  touch.sprintLatch = false;
  touch.block = false;
  for (const id of ['t-sneak', 't-sprint']) { const s = $(id); if (s) s.classList.remove('latched'); }
}
