// Skins: how a player looks. Most are free to wear; a few are prizes for the hardest things in the game
// (each names the achievement that unlocks it). The one you wear is remembered by this browser, shown on
// the title screen, and seen by everyone you play with.
//
// A skin's key is saved and sent to other players, so keys never change.
import { load, store } from './game.js';

const SKIN = [198, 146, 112], DARK = [141, 96, 66], PALE = [224, 178, 140];
const WHITE = [240, 240, 240];

// Each skin: colours, hair and face, something on the chest, and anything worn on top (a hat, a cape).
// `mask` paints the whole front of the head (a helmet, a visor); `all` is the colour of the rest of it.
export const SKINS = [
  { key: 'wanderer', name: 'Wanderer', skin: SKIN, shirt: [38, 138, 150], pants: [52, 58, 132], hair: [70, 46, 30] },
  { key: 'scout', name: 'Scout', skin: DARK, shirt: [220, 110, 40], pants: [70, 70, 80], hair: [30, 24, 20], long: true, eyes: [60, 40, 30],
    body: (g, x, y, w, h, { rect }) => { rect(g, x, y + h - 3, w, 1, [60, 44, 30]); rect(g, x + 3, y + h - 3, 2, 1, [220, 190, 80]); } },
  { key: 'ranger', name: 'Ranger', skin: PALE, shirt: [58, 120, 60], pants: [96, 70, 44], hair: [176, 84, 36], long: true, eyes: [50, 110, 60],
    body: (g, x, y, w, h, { rect }) => { rect(g, x, y + h - 4, w, 1, [70, 48, 30]); rect(g, x + 3, y, 2, 3, [48, 100, 50]); } },
  { key: 'miner', name: 'Miner', skin: SKIN, shirt: [112, 112, 118], pants: [62, 62, 72], hair: [60, 44, 30], beard: [60, 44, 30],
    body: (g, x, y, w, h, { rect }) => { rect(g, x + 1, y, 1, h, [84, 60, 40]); rect(g, x + 6, y, 1, h, [84, 60, 40]); },
    hat: [{ size: [9, 3, 9], y: 9.5, color: [236, 196, 40] }, { size: [10, 1, 10], y: 8.5, color: [214, 172, 30] }, { size: [2, 2, 1], y: 9.5, z: 5, color: [255, 250, 200] }] },
  { key: 'farmer', name: 'Farmer', skin: SKIN, shirt: [190, 60, 50], pants: [60, 90, 170], hair: [150, 110, 50],
    body: (g, x, y, w, h, { rect }) => { for (let i = 1; i < h; i += 3) rect(g, x, y + i, w, 1, [150, 40, 36]); rect(g, x + 2, y + 4, 4, h - 4, [60, 90, 170]); rect(g, x + 2, y, 1, 4, [60, 90, 170]); rect(g, x + 5, y, 1, 4, [60, 90, 170]); },
    hat: [{ size: [14, 1, 14], y: 8.5, color: [222, 196, 110] }, { size: [8, 3, 8], y: 10.5, color: [232, 208, 124] }] },
  { key: 'knight', name: 'Knight', skin: SKIN, shirt: [170, 174, 182], pants: [120, 124, 132], all: [150, 154, 162], arm: [170, 174, 182],
    mask: (g, x, y, { rect }) => { rect(g, x, y, 8, 8, [160, 164, 172]); rect(g, x + 1, y + 3, 6, 1, [20, 20, 24]); rect(g, x + 3, y + 4, 2, 3, [20, 20, 24]); rect(g, x, y, 8, 1, [196, 200, 208]); },
    body: (g, x, y, w, h, { rect }) => { rect(g, x + 3, y + 1, 2, 6, [190, 40, 40]); rect(g, x + 1, y + 3, 6, 2, [190, 40, 40]); },
    hat: [{ size: [2, 4, 6], y: 10, z: -1, color: [200, 40, 40] }] },
  { key: 'wizard', name: 'Wizard', skin: PALE, shirt: [104, 60, 160], pants: [84, 46, 134], hair: [226, 226, 230], long: true, beard: [232, 232, 236], eyes: [90, 60, 150],
    body: (g, x, y, w, h, { px }) => { px(g, x + 1, y + 2, [250, 220, 90]); px(g, x + 5, y + 5, [250, 220, 90]); px(g, x + 3, y + 8, [250, 220, 90]); },
    hat: [{ size: [12, 1, 12], y: 8.5, color: [84, 46, 134] }, { size: [7, 3, 7], y: 10.5, color: [104, 60, 160] }, { size: [4, 3, 4], y: 13.5, color: [104, 60, 160] }, { size: [2, 2, 2], y: 16, color: [250, 220, 90] }] },
  { key: 'pirate', name: 'Pirate', skin: SKIN, shirt: [236, 236, 230], pants: [50, 50, 62], hair: [190, 36, 36], beard: [50, 36, 26], patch: true,
    body: (g, x, y, w, h, { rect }) => { for (let i = 0; i < h; i += 2) rect(g, x, y + i, w, 1, [190, 36, 36]); rect(g, x, y + h - 3, w, 1, [40, 30, 24]); } },
  { key: 'astronaut', name: 'Astronaut', skin: SKIN, shirt: [236, 238, 242], pants: [224, 226, 232], all: [236, 238, 242], arm: [236, 238, 242],
    mask: (g, x, y, { rect, px }) => { rect(g, x, y, 8, 8, [236, 238, 242]); rect(g, x + 1, y + 2, 6, 4, [30, 50, 110]); rect(g, x + 1, y + 2, 2, 1, [150, 190, 250]); px(g, x + 2, y + 3, [150, 190, 250]); },
    body: (g, x, y, w, h, { rect, px }) => { rect(g, x + 2, y + 2, 4, 3, [180, 184, 196]); px(g, x + 2, y + 2, [220, 60, 50]); px(g, x + 4, y + 2, [60, 160, 230]); rect(g, x, y + 8, w, 1, [200, 80, 40]); } },
  { key: 'robot', name: 'Robot', skin: [150, 156, 164], shirt: [130, 136, 146], pants: [100, 106, 116], all: [150, 156, 164], arm: [150, 156, 164],
    mask: (g, x, y, { rect }) => { rect(g, x, y, 8, 8, [150, 156, 164]); rect(g, x + 1, y + 3, 2, 2, [90, 250, 140]); rect(g, x + 5, y + 3, 2, 2, [90, 250, 140]); rect(g, x + 2, y + 6, 4, 1, [50, 54, 60]); rect(g, x, y, 8, 1, [190, 196, 204]); },
    body: (g, x, y, w, h, { rect, px }) => { rect(g, x + 2, y + 2, 4, 4, [60, 64, 72]); px(g, x + 3, y + 3, [250, 80, 60]); px(g, x + 4, y + 4, [250, 220, 80]); },
    hat: [{ size: [1, 3, 1], y: 9.5, color: [90, 94, 102] }, { size: [2, 2, 2], y: 12, color: [250, 80, 60] }] },
  { key: 'ninja', name: 'Ninja', skin: SKIN, shirt: [30, 30, 36], pants: [26, 26, 30], all: [26, 26, 30], arm: [30, 30, 36],
    mask: (g, x, y, { rect, px }) => { rect(g, x, y, 8, 8, [26, 26, 30]); rect(g, x + 1, y + 3, 6, 2, SKIN); px(g, x + 2, y + 4, [30, 30, 30]); px(g, x + 5, y + 4, [30, 30, 30]); },
    body: (g, x, y, w, h, { rect }) => { rect(g, x, y + h - 4, w, 1, [180, 30, 36]); } },

  // ---- prizes
  { key: 'dragonslayer', name: 'Dragon Slayer', unlock: 'dragon', need: 'Defeat the Void Dragon', skin: PALE, shirt: [44, 36, 62], pants: [32, 26, 48], hair: [236, 236, 240], long: true, eyes: [190, 90, 240], arm: [44, 36, 62],
    body: (g, x, y, w, h, { rect, px }) => { rect(g, x, y, w, 1, [168, 70, 196]); rect(g, x + 3, y + 2, 2, 5, [168, 70, 196]); px(g, x + 2, y + 3, [168, 70, 196]); px(g, x + 5, y + 3, [168, 70, 196]); rect(g, x, y + h - 3, w, 1, [20, 16, 30]); },
    cape: [128, 52, 180], hat: [{ size: [1, 3, 2], x: -3.5, y: 9, color: [44, 38, 56] }, { size: [1, 3, 2], x: 3.5, y: 9, color: [44, 38, 56] }] },
  { key: 'witherbane', name: 'Wither Bane', unlock: 'blight', need: 'Destroy the Wither', skin: [52, 52, 56], shirt: [40, 40, 46], pants: [30, 30, 34], all: [38, 38, 42], arm: [40, 40, 46],
    mask: (g, x, y, { rect }) => { rect(g, x, y, 8, 8, [38, 38, 42]); rect(g, x + 1, y + 3, 2, 1, [232, 232, 236]); rect(g, x + 5, y + 3, 2, 1, [232, 232, 236]); rect(g, x + 2, y + 6, 4, 1, [232, 232, 236]); },
    body: (g, x, y, w, h, { rect }) => { for (let i = 1; i < 8; i += 2) rect(g, x + 1, y + i, w - 2, 1, [226, 226, 230]); rect(g, x + 3, y, 2, 9, [226, 226, 230]); },
    cape: [24, 24, 28], hat: [{ size: [10, 1, 10], y: 8.5, color: [200, 204, 214] }, { size: [2, 2, 2], x: -3, y: 10, color: [226, 240, 252] }, { size: [2, 3, 2], y: 10.5, color: [226, 240, 252] }, { size: [2, 2, 2], x: 3, y: 10, color: [226, 240, 252] }] },
  { key: 'worldwalker', name: 'World Walker', unlock: 'lands', need: 'Visit every kind of land in the Overworld', skin: DARK, shirt: [184, 152, 100], pants: [92, 70, 48], hair: [40, 30, 24], beard: [40, 30, 24], eyes: [60, 120, 70],
    body: (g, x, y, w, h, { rect }) => { rect(g, x, y, 2, h, [70, 48, 30]); rect(g, x, y + h - 4, w, 1, [70, 48, 30]); rect(g, x + 5, y + h - 4, 2, 2, [220, 190, 80]); },
    cape: [50, 112, 62], hat: [{ size: [12, 1, 12], y: 8.5, color: [110, 80, 50] }, { size: [8, 3, 8], y: 10.5, color: [124, 92, 58] }, { size: [1, 4, 2], x: 3.5, y: 11.5, color: [220, 60, 50] }] },
  { key: 'lightkeeper', name: 'Lightkeeper', unlock: 'beacon', need: 'Stand by a lit beacon', skin: PALE, shirt: [236, 244, 248], pants: [214, 226, 234], hair: [240, 208, 110], long: true, eyes: [60, 190, 220], arm: [236, 244, 248],
    body: (g, x, y, w, h, { rect }) => { rect(g, x, y, w, 1, [110, 226, 240]); rect(g, x + 3, y + 3, 2, 2, [110, 226, 240]); rect(g, x, y + h - 2, w, 1, [110, 226, 240]); },
    cape: [200, 240, 248], hat: [{ size: [8, 1, 8], y: 11, color: [255, 236, 140] }] },
  { key: 'hunter', name: 'Monster Hunter', unlock: 'bestiary', need: 'Kill one of every kind of monster', skin: SKIN, shirt: [84, 58, 40], pants: [56, 44, 36], hair: [60, 44, 32], long: true, beard: [60, 44, 32], all: null, eyes: [200, 60, 40],
    body: (g, x, y, w, h, { rect, px }) => { for (let i = 0; i < 8; i++) px(g, x + i, y + i, [40, 30, 24]); rect(g, x, y + h - 3, w, 1, [40, 30, 24]); px(g, x + 2, y + 2, [220, 190, 80]); px(g, x + 4, y + 4, [220, 190, 80]); },
    cape: [70, 50, 36], hat: [{ size: [9, 2, 9], y: 9, color: [70, 50, 36] }] },
  { key: 'chef', name: 'Master Chef', unlock: 'diet', need: 'Eat every kind of food', skin: SKIN, shirt: [244, 244, 240], pants: [60, 60, 70], hair: [50, 36, 26], beard: null, arm: [244, 244, 240],
    body: (g, x, y, w, h, { rect, px }) => { px(g, x + 2, y + 2, [60, 60, 70]); px(g, x + 5, y + 2, [60, 60, 70]); px(g, x + 2, y + 5, [60, 60, 70]); px(g, x + 5, y + 5, [60, 60, 70]); rect(g, x + 1, y + 7, 6, h - 7, [226, 226, 222]); },
    hat: [{ size: [8, 2, 8], y: 9, color: [244, 244, 240] }, { size: [10, 4, 10], y: 12, color: [250, 250, 248] }] },
];
export const SKIN_BY = Object.fromEntries(SKINS.map((s) => [s.key, s]));
export const DEFAULT_SKIN = 'wanderer';

// The parts of a skin's model. `H` brings the model builder's own tools: { humanoid, rect, px }.
export function skinParts(S, H) {
  const { humanoid, rect, px } = H;
  const hair = S.hair, eyes = S.eyes || [60, 80, 160];
  const side = (g, x, y, w, h) => { if (S.all) rect(g, x, y, w, h, S.all); else if (hair) rect(g, x, y, w, S.long ? h : 3, hair); };
  const head = {
    front: (g, x, y) => {
      if (S.mask) { S.mask(g, x, y, H); return; }
      if (hair) { rect(g, x, y, 8, 2, hair); px(g, x, y + 2, hair); px(g, x + 7, y + 2, hair); if (S.long) { rect(g, x, y + 2, 1, 5, hair); rect(g, x + 7, y + 2, 1, 5, hair); } }
      px(g, x + 1, y + 4, WHITE); px(g, x + 2, y + 4, eyes); px(g, x + 5, y + 4, eyes); px(g, x + 6, y + 4, WHITE);
      if (S.beard) { rect(g, x + 1, y + 6, 6, 2, S.beard); rect(g, x + 3, y + 6, 2, 1, [130, 80, 66]); } else rect(g, x + 3, y + 6, 2, 1, [150, 90, 70]);
      if (S.patch) { rect(g, x, y + 3, 8, 1, [24, 24, 24]); rect(g, x + 5, y + 4, 2, 1, [24, 24, 24]); }
    },
    top: (g, x, y, w, h) => { if (S.all) rect(g, x, y, w, h, S.all); else if (hair) rect(g, x, y, w, h, hair); },
    back: (g, x, y, w, h) => { if (S.all) rect(g, x, y, w, h, S.all); else if (hair) rect(g, x, y, w, S.long ? h : h - 2, hair); },
    px: side, nx: side,
  };
  const parts = humanoid([4, 12, 4], S.arm || S.skin, S.shirt, S.pants, head, { body: S.body ? (g, x, y, w, h) => S.body(g, x, y, w, h, H) : null });
  // (someone in a suit has sleeves to the wrist, so the arms are the suit's colour; the head is still theirs)
  parts[0].color = S.all || S.skin;
  (S.hat || []).forEach((p, i) => parts.push({ name: 'hat' + i, parent: 'head', size: p.size, pos: [p.x || 0, p.y, p.z || 0], color: p.color }));
  if (S.cape) parts.push({ name: 'cape', parent: 'body', size: [8, 13, 1], pos: [0, 6, -2.6], off: [0, -6.5, 0], rot: [0.14, 0, 0], color: S.cape });
  return parts;
}

// ---------------------------------------------------------------- what this browser remembers
function state() {
  const s = load('skins');
  return { sel: s && SKIN_BY[s.sel] ? s.sel : DEFAULT_SKIN, got: s && Array.isArray(s.got) ? s.got.filter((k) => SKIN_BY[k]) : [] };
}
export const hasSkin = (key) => !!SKIN_BY[key] && (!SKIN_BY[key].unlock || state().got.includes(key));
// The skin being worn (a prize that is somehow no longer held falls back to the first one)
export function mySkin() { const s = state(); return hasSkin(s.sel) ? s.sel : DEFAULT_SKIN; }
export function chooseSkin(key) {
  if (!hasSkin(key)) return false;
  const s = state();
  s.sel = key;
  store('skins', s);
  return true;
}
// An achievement has been made: the skins it is the key to are yours. Returns the ones that are new.
export function unlockSkins(has) {
  const s = state(), fresh = [];
  for (const S of SKINS) if (S.unlock && !s.got.includes(S.key) && has(S.unlock)) { s.got.push(S.key); fresh.push(S); }
  if (fresh.length) store('skins', s);
  return fresh;
}
