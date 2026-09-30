// Shared game state and small storage helpers.

export const isTouchDevice = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;

export const G = {
  state: 'title',        // title | loading | playing
  screen: null,          // name of the open overlay screen, or null
  world: null,
  dim: 'overworld',      // overworld | nether | end
  player: null,
  entities: null,
  time: 0.03,            // fraction of the day; 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight
  daylight: 1,
  worldMeta: null,
  touchMode: false,
  pointerLocked: false,
  settings: {
    renderDist: isTouchDevice ? 5 : 7,
    fov: 70,
    sensitivity: 1,
    touchSens: 1,
    volume: 0.7,
    autoJump: isTouchDevice,
    touch: 'auto',        // auto | on | off
    touchAim: 'finger',   // finger | crosshair
    dayLength: 1200,      // seconds per day
    showCoords: false,
    gamma: 0.5,
    viewBob: true,
  },
};

export function store(key, value) {
  try { localStorage.setItem('blockcraft.' + key, JSON.stringify(value)); return true; } catch { return false; }
}
export function load(key, fallback = null) {
  try {
    const v = localStorage.getItem('blockcraft.' + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
export function remove(key) {
  try { localStorage.removeItem('blockcraft.' + key); } catch { /* storage unavailable */ }
}

export function loadSettings() {
  const s = load('settings');
  if (s && typeof s === 'object') Object.assign(G.settings, s);
}
export function saveSettings() { store('settings', G.settings); }
