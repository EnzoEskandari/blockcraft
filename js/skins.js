// Your character: how a player looks. It is put together from parts (skin, face, hair, hat, glasses, top,
// trousers and something on the back), each chosen on its own. Most parts are free; a few are prizes for
// the hardest things in the game (each names the achievement that unlocks it). What you chose is
// remembered by this browser, shown on the title screen, and seen by everyone you play with.
//
// A look is saved and sent to other players as the keys of its parts, so keys never change.
import { load, store } from './game.js';

const WHITE = [240, 240, 240], INK = [24, 24, 28];
const dark = (c, k = 0.72) => c.map((v) => v * k);

// ---------------------------------------------------------------- the parts
export const TONES = [
  { key: 'pale', name: 'Pale', c: [238, 200, 170] }, { key: 'fair', name: 'Fair', c: [224, 178, 140] },
  { key: 'peach', name: 'Peach', c: [198, 146, 112] }, { key: 'tan', name: 'Tan', c: [176, 124, 88] },
  { key: 'brown', name: 'Brown', c: [141, 96, 66] }, { key: 'dark', name: 'Dark', c: [98, 64, 44] },
  { key: 'green', name: 'Green', c: [112, 164, 92] }, { key: 'blue', name: 'Blue', c: [110, 152, 214] },
  { key: 'grey', name: 'Grey', c: [150, 156, 164] }, { key: 'purple', name: 'Purple', c: [152, 112, 192] },
];
export const EYES = [
  { key: 'blue', name: 'Blue', c: [60, 80, 160] }, { key: 'brown', name: 'Brown', c: [84, 54, 34] },
  { key: 'green', name: 'Green', c: [50, 120, 60] }, { key: 'grey', name: 'Grey', c: [96, 104, 116] },
  { key: 'violet', name: 'Violet', c: [120, 70, 170] }, { key: 'amber', name: 'Amber', c: [196, 126, 30] },
  { key: 'black', name: 'Black', c: [26, 22, 22] }, { key: 'red', name: 'Red', c: [200, 50, 40] },
];
export const HAIR_COLOURS = [
  { key: 'brown', name: 'Brown', c: [70, 46, 30] }, { key: 'black', name: 'Black', c: [30, 24, 22] },
  { key: 'blonde', name: 'Blonde', c: [226, 190, 96] }, { key: 'ginger', name: 'Ginger', c: [186, 88, 36] },
  { key: 'sandy', name: 'Sandy', c: [150, 110, 56] }, { key: 'white', name: 'White', c: [230, 230, 234] },
  { key: 'pink', name: 'Pink', c: [236, 120, 170] }, { key: 'blue', name: 'Blue', c: [70, 130, 226] },
  { key: 'green', name: 'Green', c: [80, 180, 90] }, { key: 'purple', name: 'Purple', c: [140, 80, 190] },
];

// Faces are painted on the front of the head, eight dots square: (g, x, y, look) where look has the
// colours in use (.eye, .skin, .hair) and the tools (.rect, .px)
const eyes = (g, x, y, L, row = 4) => { L.px(g, x + 1, y + row, WHITE); L.px(g, x + 2, y + row, L.eye); L.px(g, x + 5, y + row, L.eye); L.px(g, x + 6, y + row, WHITE); };
const mouth = (L) => dark(L.skin, 0.68);
export const FACES = [
  { key: 'plain', name: 'Plain', paint: (g, x, y, L) => { eyes(g, x, y, L); L.rect(g, x + 3, y + 6, 2, 1, mouth(L)); } },
  { key: 'smile', name: 'Smile', paint: (g, x, y, L) => { eyes(g, x, y, L); L.rect(g, x + 3, y + 6, 2, 1, mouth(L)); L.px(g, x + 2, y + 5, mouth(L)); L.px(g, x + 5, y + 5, mouth(L)); } },
  { key: 'grin', name: 'Big Grin', paint: (g, x, y, L) => { eyes(g, x, y, L); L.rect(g, x + 2, y + 5, 4, 2, dark(L.skin, 0.5)); L.rect(g, x + 2, y + 5, 4, 1, WHITE); } },
  { key: 'wink', name: 'Wink', paint: (g, x, y, L) => { L.px(g, x + 1, y + 4, WHITE); L.px(g, x + 2, y + 4, L.eye); L.rect(g, x + 5, y + 4, 2, 1, dark(L.skin, 0.5)); L.rect(g, x + 3, y + 6, 2, 1, mouth(L)); L.px(g, x + 5, y + 5, mouth(L)); } },
  { key: 'cool', name: 'Cool', paint: (g, x, y, L) => { eyes(g, x, y, L); L.rect(g, x + 1, y + 3, 2, 1, dark(L.skin, 0.55)); L.rect(g, x + 5, y + 3, 2, 1, dark(L.skin, 0.55)); L.rect(g, x + 3, y + 6, 3, 1, mouth(L)); } },
  { key: 'sleepy', name: 'Sleepy', paint: (g, x, y, L) => { L.rect(g, x + 1, y + 4, 2, 1, dark(L.skin, 0.5)); L.rect(g, x + 5, y + 4, 2, 1, dark(L.skin, 0.5)); L.px(g, x + 4, y + 6, mouth(L)); } },
  { key: 'angry', name: 'Angry', paint: (g, x, y, L) => { eyes(g, x, y, L); L.px(g, x + 2, y + 3, INK); L.px(g, x + 1, y + 2, INK); L.px(g, x + 5, y + 3, INK); L.px(g, x + 6, y + 2, INK); L.rect(g, x + 3, y + 6, 2, 1, mouth(L)); L.px(g, x + 2, y + 7, mouth(L)); L.px(g, x + 5, y + 7, mouth(L)); } },
  { key: 'gasp', name: 'Surprised', paint: (g, x, y, L) => { L.rect(g, x + 1, y + 3, 2, 2, WHITE); L.rect(g, x + 5, y + 3, 2, 2, WHITE); L.px(g, x + 2, y + 4, L.eye); L.px(g, x + 5, y + 4, L.eye); L.rect(g, x + 3, y + 6, 2, 2, dark(L.skin, 0.45)); } },
  { key: 'freckles', name: 'Freckles', paint: (g, x, y, L) => { eyes(g, x, y, L); L.rect(g, x + 3, y + 6, 2, 1, mouth(L)); for (const [a, b] of [[1, 5], [2, 6], [6, 5], [5, 6]]) L.px(g, x + a, y + b, dark(L.skin, 0.8)); } },
  { key: 'blush', name: 'Rosy', paint: (g, x, y, L) => { eyes(g, x, y, L); L.rect(g, x + 3, y + 6, 2, 1, mouth(L)); L.px(g, x + 2, y + 5, mouth(L)); L.px(g, x + 5, y + 5, mouth(L)); L.px(g, x + 1, y + 5, [240, 130, 140]); L.px(g, x + 6, y + 5, [240, 130, 140]); } },
  { key: 'moustache', name: 'Moustache', paint: (g, x, y, L) => { eyes(g, x, y, L); L.rect(g, x + 2, y + 5, 4, 1, L.hair); L.px(g, x + 1, y + 6, L.hair); L.px(g, x + 6, y + 6, L.hair); L.rect(g, x + 3, y + 6, 2, 1, mouth(L)); } },
  { key: 'beard', name: 'Beard', paint: (g, x, y, L) => { eyes(g, x, y, L); L.rect(g, x + 1, y + 6, 6, 2, L.hair); L.px(g, x + 1, y + 5, L.hair); L.px(g, x + 6, y + 5, L.hair); L.rect(g, x + 3, y + 6, 2, 1, dark(L.skin, 0.62)); } },
  { key: 'cat', name: 'Cat', paint: (g, x, y, L) => { eyes(g, x, y, L); L.rect(g, x + 3, y + 5, 2, 1, [240, 140, 160]); L.px(g, x + 3, y + 6, mouth(L)); L.px(g, x + 4, y + 6, mouth(L)); L.px(g, x, y + 5, WHITE); L.px(g, x + 7, y + 5, WHITE); L.px(g, x, y + 7, WHITE); L.px(g, x + 7, y + 7, WHITE); } },
  { key: 'robot', name: 'Robot', paint: (g, x, y, L) => { L.rect(g, x + 1, y + 3, 2, 2, [90, 250, 140]); L.rect(g, x + 5, y + 3, 2, 2, [90, 250, 140]); L.rect(g, x + 2, y + 6, 4, 1, [50, 54, 60]); L.px(g, x + 3, y + 6, [120, 126, 134]); L.px(g, x + 5, y + 6, [120, 126, 134]); } },
  // prizes
  { key: 'dragon', name: 'Dragon Eyes', prize: 'dragon', paint: (g, x, y, L) => { L.rect(g, x + 1, y + 4, 2, 1, [226, 120, 255]); L.rect(g, x + 5, y + 4, 2, 1, [226, 120, 255]); L.px(g, x + 2, y + 4, [80, 20, 110]); L.px(g, x + 5, y + 4, [80, 20, 110]); L.px(g, x + 1, y + 3, INK); L.px(g, x + 6, y + 3, INK); L.rect(g, x + 3, y + 6, 2, 1, mouth(L)); } },
  { key: 'wither', name: 'Wither Stare', prize: 'blight', paint: (g, x, y, L) => { L.rect(g, x + 1, y + 3, 2, 2, INK); L.rect(g, x + 5, y + 3, 2, 2, INK); L.px(g, x + 2, y + 4, [232, 232, 236]); L.px(g, x + 5, y + 4, [232, 232, 236]); L.rect(g, x + 2, y + 6, 4, 1, INK); L.px(g, x + 3, y + 6, [232, 232, 236]); L.px(g, x + 5, y + 6, [232, 232, 236]); } },
];

// Hair: what is painted on the head (the fringe on the front, how far down the sides and back it comes)
// and any shapes that stand off it. `tall` shapes are left off under a hat.
const fringe = (g, x, y, L) => { L.rect(g, x, y, 8, 2, L.hair); L.px(g, x, y + 2, L.hair); L.px(g, x + 7, y + 2, L.hair); };
export const HAIRS = [
  { key: 'none', name: 'Bald' },
  { key: 'short', name: 'Short', front: fringe, top: 1, side: 3, back: 6 },
  { key: 'long', name: 'Long', front: (g, x, y, L) => { fringe(g, x, y, L); L.rect(g, x, y + 2, 1, 5, L.hair); L.rect(g, x + 7, y + 2, 1, 5, L.hair); }, top: 1, side: 8, back: 8,
    parts: [{ size: [8, 4, 1], y: 0.4, z: -4.2 }] },
  { key: 'bowl', name: 'Bowl Cut', front: (g, x, y, L) => { L.rect(g, x, y, 8, 3, L.hair); L.px(g, x, y + 3, L.hair); L.px(g, x + 7, y + 3, L.hair); }, top: 1, side: 4, back: 5 },
  { key: 'side', name: 'Side Part', front: (g, x, y, L) => { L.rect(g, x, y, 8, 1, L.hair); L.rect(g, x, y + 1, 5, 1, L.hair); L.rect(g, x, y + 2, 2, 1, L.hair); L.px(g, x + 7, y + 1, L.hair); }, top: 1, side: 3, back: 6 },
  { key: 'spiky', name: 'Spiky', front: fringe, top: 1, side: 3, back: 5,
    parts: [{ size: [2, 2.4, 2], x: -2.6, y: 9, z: 1.5, tall: 1 }, { size: [2, 3, 2], y: 9.3, z: 0, tall: 1 }, { size: [2, 2.4, 2], x: 2.6, y: 9, z: 1.5, tall: 1 }, { size: [2, 2.2, 2], x: -1.4, y: 8.9, z: -2.4, tall: 1 }, { size: [2, 2.2, 2], x: 1.6, y: 8.9, z: -2.2, tall: 1 }] },
  { key: 'mohawk', name: 'Mohawk', front: (g, x, y, L) => L.rect(g, x + 3, y, 2, 1, L.hair), stripe: 1,
    parts: [{ size: [2, 3, 9], y: 9.4, z: -0.4, tall: 1 }] },
  { key: 'afro', name: 'Big Curls', front: fringe, top: 1, side: 4, back: 6, parts: [{ size: [10.4, 5.4, 10.4], y: 7.9, tall: 1 }] },
  { key: 'ponytail', name: 'Ponytail', front: fringe, top: 1, side: 3, back: 6, parts: [{ size: [2.4, 2, 2], y: 6, z: -4.8 }, { size: [2, 6, 2], y: 2.6, z: -5.6 }] },
  { key: 'pigtails', name: 'Pigtails', front: fringe, top: 1, side: 3, back: 6, parts: [{ size: [2, 5.4, 2.4], x: -5, y: 2.6 }, { size: [2, 5.4, 2.4], x: 5, y: 2.6 }] },
  { key: 'bun', name: 'Bun', front: fringe, top: 1, side: 3, back: 6, parts: [{ size: [4, 3.2, 4], y: 9.4, z: -1.4, tall: 1 }] },
];

// Glasses and the like, painted over the eyes (and round the sides of the head)
const frames = (g, x, y, L, k) => { L.rect(g, x + 1, y + 3, 2, 1, k); L.rect(g, x + 5, y + 3, 2, 1, k); L.rect(g, x + 3, y + 4, 2, 1, k); L.px(g, x, y + 4, k); L.px(g, x + 7, y + 4, k); };
const shades = (g, x, y, L, a, b, k) => { L.rect(g, x + 1, y + 3, 2, 2, a); L.rect(g, x + 5, y + 3, 2, 2, b); L.rect(g, x + 3, y + 3, 2, 1, k); L.px(g, x, y + 3, k); L.px(g, x + 7, y + 3, k); };
const arm = (k, row = 3) => (g, x, y, w, h, L) => L.rect(g, x, y + row, w, 1, k);
export const SPECS = [
  { key: 'none', name: 'None' },
  { key: 'glasses', name: 'Glasses', front: (g, x, y, L) => frames(g, x, y, L, INK), side: arm(INK, 4) },
  { key: 'gold', name: 'Gold Rims', front: (g, x, y, L) => frames(g, x, y, L, [226, 186, 60]), side: arm([226, 186, 60], 4) },
  { key: 'shades', name: 'Sunglasses', front: (g, x, y, L) => { shades(g, x, y, L, INK, INK, INK); L.px(g, x + 1, y + 3, [90, 94, 110]); L.px(g, x + 5, y + 3, [90, 94, 110]); }, side: arm(INK) },
  { key: 'threed', name: '3D Glasses', front: (g, x, y, L) => shades(g, x, y, L, [220, 50, 50], [50, 120, 230], WHITE), side: arm(WHITE) },
  { key: 'pink', name: 'Pink Shades', front: (g, x, y, L) => { shades(g, x, y, L, [240, 110, 180], [240, 110, 180], [250, 220, 90]); L.px(g, x + 1, y + 3, [255, 190, 226]); L.px(g, x + 5, y + 3, [255, 190, 226]); }, side: arm([250, 220, 90]) },
  { key: 'visor', name: 'Visor', front: (g, x, y, L) => { L.rect(g, x, y + 3, 8, 2, [60, 210, 230]); L.rect(g, x + 1, y + 3, 3, 1, [190, 246, 252]); }, side: (g, x, y, w, h, L) => L.rect(g, x, y + 3, w, 2, [40, 44, 52]) },
  { key: 'goggles', name: 'Goggles', front: (g, x, y, L) => { L.rect(g, x, y + 3, 8, 2, [96, 66, 40]); L.rect(g, x + 1, y + 3, 2, 2, [250, 190, 70]); L.rect(g, x + 5, y + 3, 2, 2, [250, 190, 70]); L.px(g, x + 1, y + 3, [255, 236, 170]); L.px(g, x + 5, y + 3, [255, 236, 170]); }, side: (g, x, y, w, h, L) => L.rect(g, x, y + 3, w, 2, [96, 66, 40]) },
  { key: 'monocle', name: 'Monocle', front: (g, x, y, L) => { const k = [226, 186, 60]; L.rect(g, x + 5, y + 3, 2, 1, k); L.rect(g, x + 5, y + 5, 2, 1, k); L.px(g, x + 4, y + 4, k); L.px(g, x + 7, y + 4, k); L.px(g, x + 7, y + 6, k); } },
  { key: 'patch', name: 'Eye Patch', front: (g, x, y, L) => { L.rect(g, x, y + 3, 8, 1, INK); L.rect(g, x + 5, y + 4, 2, 1, INK); }, side: arm(INK) },
];

// Hats: shapes standing on the head. A `mask` covers the whole face and `all` the rest of the head (a
// helmet); `open` ones leave tall hair showing.
const box = (size, y, color, x = 0, z = 0) => ({ size, y, color, x, z });
export const HATS = [
  { key: 'none', name: 'None' },
  { key: 'cap', name: 'Cap', parts: [box([8.8, 2.6, 8.8], 7.9, [200, 50, 46]), box([6, 1, 3.4], 7.1, [170, 38, 36], 0, 5.8), box([1.4, 1, 1.4], 9.6, [240, 240, 240])] },
  { key: 'bluecap', name: 'Blue Cap', parts: [box([8.8, 2.6, 8.8], 7.9, [50, 96, 200]), box([6, 1, 3.4], 7.1, [38, 76, 168], 0, 5.8), box([1.4, 1, 1.4], 9.6, [240, 240, 240])] },
  { key: 'beanie', name: 'Bobble Hat', parts: [box([9, 3.4, 9], 7.6, [236, 130, 40]), box([9.4, 1.2, 9.4], 6.2, [250, 240, 220]), box([2.4, 2.4, 2.4], 10.4, [250, 240, 220])] },
  { key: 'tophat', name: 'Top Hat', parts: [box([11, 1, 11], 8.5, [30, 30, 36]), box([7, 6, 7], 12, [36, 36, 42]), box([7.3, 1.2, 7.3], 9.7, [190, 40, 46])] },
  { key: 'straw', name: 'Straw Hat', parts: [box([14, 1, 14], 8.5, [222, 196, 110]), box([8, 3, 8], 10.5, [232, 208, 124]), box([8.3, 1, 8.3], 9.4, [150, 60, 50])] },
  { key: 'cowboy', name: 'Cowboy Hat', parts: [box([13, 1, 11], 8.5, [124, 84, 48]), box([7, 3.6, 7], 10.8, [138, 96, 56]), box([7.3, 1, 7.3], 9.5, [70, 46, 28]), box([1, 2, 11], 9.2, [124, 84, 48], -6), box([1, 2, 11], 9.2, [124, 84, 48], 6)] },
  { key: 'wizard', name: 'Wizard Hat', parts: [box([12, 1, 12], 8.5, [84, 46, 134]), box([7, 3, 7], 10.5, [104, 60, 160]), box([4, 3, 4], 13.5, [104, 60, 160]), box([2, 2, 2], 16, [250, 220, 90])] },
  { key: 'miner', name: 'Miner Helmet', parts: [box([9, 3, 9], 9.5, [236, 196, 40]), box([10, 1, 10], 8.5, [214, 172, 30]), box([2, 2, 1], 9.5, [255, 250, 200], 0, 5)] },
  { key: 'pirate', name: 'Pirate Hat', parts: [box([12, 1, 9], 8.5, [34, 30, 34]), box([10, 3.4, 5], 10.6, [40, 36, 40]), box([10.4, 1, 5.4], 12, [226, 190, 80]), box([2, 2, 0.8], 10.4, [236, 236, 230], 0, 2.6)] },
  { key: 'party', name: 'Party Hat', parts: [box([5, 2, 5], 9, [240, 90, 160]), box([3.6, 2, 3.6], 11, [70, 200, 230]), box([2.2, 2, 2.2], 13, [240, 90, 160]), box([1.6, 1.6, 1.6], 14.8, [250, 226, 90])] },
  { key: 'headphones', name: 'Headphones', open: 1, parts: [box([9.6, 1, 2], 8.6, [40, 42, 50]), box([1.6, 4, 3.4], 4, [226, 60, 60], -4.7), box([1.6, 4, 3.4], 4, [226, 60, 60], 4.7)] },
  { key: 'catears', name: 'Cat Ears', open: 1, parts: [box([2.4, 2, 1.4], 9, [40, 36, 40], -2.6), box([2.4, 2, 1.4], 9, [40, 36, 40], 2.6), box([1.2, 1.2, 1.5], 8.8, [240, 150, 180], -2.6), box([1.2, 1.2, 1.5], 8.8, [240, 150, 180], 2.6)] },
  { key: 'bunny', name: 'Bunny Ears', open: 1, parts: [box([1.8, 5.4, 1.2], 10.7, [244, 244, 244], -2), box([1.8, 5.4, 1.2], 10.7, [244, 244, 244], 2), box([0.9, 3.6, 1.3], 10.6, [246, 170, 190], -2), box([0.9, 3.6, 1.3], 10.6, [246, 170, 190], 2)] },
  { key: 'flowers', name: 'Flower Crown', open: 1, parts: [box([9, 1, 9], 7.2, [70, 150, 60]), box([1.6, 1.6, 1.6], 7.4, [240, 80, 90], -2.6, 4.2), box([1.6, 1.6, 1.6], 7.4, [250, 220, 80], 0, 4.4), box([1.6, 1.6, 1.6], 7.4, [240, 140, 200], 2.6, 4.2), box([1.6, 1.6, 1.6], 7.4, [240, 240, 240], -4.3, 0), box([1.6, 1.6, 1.6], 7.4, [240, 80, 90], 4.3, 0)] },
  { key: 'antenna', name: 'Antenna', open: 1, parts: [box([1, 3, 1], 9.5, [90, 94, 102]), box([2, 2, 2], 12, [250, 80, 60])] },
  { key: 'knight', name: 'Knight Helmet', all: [150, 154, 162], parts: [box([2, 4, 6], 10, [200, 40, 40], 0, -1)],
    mask: (g, x, y, L) => { L.rect(g, x, y, 8, 8, [160, 164, 172]); L.rect(g, x + 1, y + 3, 6, 1, [20, 20, 24]); L.rect(g, x + 3, y + 4, 2, 3, [20, 20, 24]); L.rect(g, x, y, 8, 1, [196, 200, 208]); } },
  { key: 'space', name: 'Space Helmet', all: [236, 238, 242],
    mask: (g, x, y, L) => { L.rect(g, x, y, 8, 8, [236, 238, 242]); L.rect(g, x + 1, y + 2, 6, 4, [30, 50, 110]); L.rect(g, x + 1, y + 2, 2, 1, [150, 190, 250]); L.px(g, x + 2, y + 3, [150, 190, 250]); } },
  { key: 'ninja', name: 'Ninja Hood', all: [26, 26, 30],
    mask: (g, x, y, L) => { L.rect(g, x, y, 8, 8, [26, 26, 30]); L.rect(g, x + 1, y + 3, 6, 2, L.skin); L.px(g, x + 2, y + 4, L.eye); L.px(g, x + 5, y + 4, L.eye); } },
  // prizes
  { key: 'crown', name: 'Crown', prize: 'dragon', open: 1, parts: [box([8.6, 1.6, 8.6], 8.8, [240, 200, 60]), box([1.6, 1.6, 1.6], 10.4, [240, 200, 60], -3.5, 3.5), box([1.6, 1.6, 1.6], 10.4, [240, 200, 60], 3.5, 3.5), box([1.6, 2.2, 1.6], 10.7, [240, 200, 60], 0, 3.5), box([1.6, 1.6, 1.6], 10.4, [240, 200, 60], -3.5, -3.5), box([1.6, 1.6, 1.6], 10.4, [240, 200, 60], 3.5, -3.5), box([1.2, 1.2, 0.8], 8.8, [200, 60, 220], 0, 4.4)] },
  { key: 'horns', name: 'Dragon Horns', prize: 'dragon', open: 1, parts: [box([1.4, 3, 2], 9, [44, 38, 56], -3.4), box([1.4, 3, 2], 9, [44, 38, 56], 3.4), box([1.2, 2, 1.6], 11.2, [168, 70, 196], -3.4, -0.8), box([1.2, 2, 1.6], 11.2, [168, 70, 196], 3.4, -0.8)] },
  { key: 'withercrown', name: 'Wither Crown', prize: 'blight', parts: [box([10, 1, 10], 8.5, [200, 204, 214]), box([2, 2, 2], 10, [226, 240, 252], -3), box([2, 3, 2], 10.5, [226, 240, 252]), box([2, 2, 2], 10, [226, 240, 252], 3)] },
  { key: 'explorer', name: 'Explorer Hat', prize: 'lands', parts: [box([12, 1, 12], 8.5, [110, 80, 50]), box([8, 3, 8], 10.5, [124, 92, 58]), box([1, 4, 2], 11.5, [220, 60, 50], 3.5)] },
  { key: 'halo', name: 'Halo', prize: 'beacon', open: 1, parts: [box([8, 0.8, 8], 11, [255, 236, 140])] },
  { key: 'hood', name: 'Hunter Hood', prize: 'bestiary', all: [70, 50, 36], parts: [box([9, 2, 9], 8.6, [70, 50, 36]), box([1.4, 2, 1.4], 10, [226, 220, 200], -3, 2), box([1.4, 2, 1.4], 10, [226, 220, 200], 3, 2)],
    mask: (g, x, y, L) => { L.rect(g, x, y, 8, 8, L.skin); L.face(g, x, y); L.rect(g, x, y, 8, 2, [70, 50, 36]); L.rect(g, x, y + 2, 1, 6, [70, 50, 36]); L.rect(g, x + 7, y + 2, 1, 6, [70, 50, 36]); } },
  { key: 'chef', name: 'Chef Hat', prize: 'diet', parts: [box([8, 2, 8], 9, [244, 244, 240]), box([10, 4, 10], 12, [250, 250, 248])] },
];

// Tops. `sleeves`: the colour of long sleeves (short ones show the arm); `legs`: a whole suit, which
// covers the legs too, whatever trousers are chosen; `paint` draws on the chest (and back).
const tee = (key, name, c) => ({ key, name, c });
const stripes = (a, step = 2) => (g, x, y, w, h, L) => { for (let i = 0; i < h; i += step) L.rect(g, x, y + i, w, 1, a); };
export const TOPS = [
  tee('teal', 'Teal Shirt', [38, 138, 150]), tee('red', 'Red Shirt', [190, 52, 46]), tee('green', 'Green Shirt', [70, 150, 60]),
  tee('yellow', 'Yellow Shirt', [226, 186, 50]), tee('purple', 'Purple Shirt', [124, 72, 168]), tee('orange', 'Orange Shirt', [226, 116, 40]),
  tee('blue', 'Blue Shirt', [58, 92, 190]), tee('pink', 'Pink Shirt', [232, 120, 170]), tee('black', 'Black Shirt', [40, 40, 46]), tee('white', 'White Shirt', [238, 238, 234]),
  { key: 'stripes', name: 'Stripy Shirt', c: [236, 236, 230], paint: stripes([200, 50, 50]) },
  { key: 'sailor', name: 'Sailor Shirt', c: [236, 236, 230], paint: stripes([40, 60, 140]) },
  { key: 'jersey', name: 'Football Shirt', c: [40, 150, 80], paint: (g, x, y, w, h, L) => { L.rect(g, x, y, w, 1, WHITE); L.rect(g, x + 3, y + 3, 2, 5, WHITE); L.px(g, x + 2, y + 4, WHITE); } },
  { key: 'hoodie', name: 'Hoodie', c: [116, 122, 134], sleeves: [116, 122, 134], paint: (g, x, y, w, h, L) => { L.rect(g, x + 2, y + 7, 4, 3, [96, 102, 114]); L.px(g, x + 3, y, WHITE); L.px(g, x + 3, y + 1, WHITE); L.px(g, x + 4, y, WHITE); L.px(g, x + 4, y + 1, WHITE); L.rect(g, x, y + h - 1, w, 1, [96, 102, 114]); } },
  { key: 'suit', name: 'Smart Suit', c: [40, 42, 52], sleeves: [40, 42, 52], paint: (g, x, y, w, h, L) => { L.rect(g, x + 3, y, 2, 5, WHITE); L.rect(g, x + 3, y + 1, 2, 4, [190, 40, 46]); L.px(g, x + 2, y, WHITE); L.px(g, x + 5, y, WHITE); L.px(g, x + 3, y + 7, [226, 190, 80]); } },
  { key: 'labcoat', name: 'Lab Coat', c: [240, 242, 244], sleeves: [240, 242, 244], paint: (g, x, y, w, h, L) => { L.rect(g, x + 3, y, 2, 4, [90, 160, 220]); L.rect(g, x + 4, y + 4, 1, h - 4, [200, 204, 210]); L.rect(g, x + 1, y + 3, 2, 1, [60, 90, 180]); } },
  { key: 'overalls', name: 'Dungarees', c: [190, 60, 50], paint: (g, x, y, w, h, L) => { for (let i = 1; i < h; i += 3) L.rect(g, x, y + i, w, 1, [150, 40, 36]); L.rect(g, x + 2, y + 4, 4, h - 4, [60, 90, 170]); L.rect(g, x + 2, y, 1, 4, [60, 90, 170]); L.rect(g, x + 5, y, 1, 4, [60, 90, 170]); L.px(g, x + 2, y + 4, [226, 190, 80]); L.px(g, x + 5, y + 4, [226, 190, 80]); } },
  { key: 'vest', name: 'Scout Vest', c: [220, 110, 40], paint: (g, x, y, w, h, L) => { L.rect(g, x, y + h - 3, w, 1, [60, 44, 30]); L.rect(g, x + 3, y + h - 3, 2, 1, [220, 190, 80]); } },
  { key: 'tunic', name: 'Ranger Tunic', c: [58, 120, 60], paint: (g, x, y, w, h, L) => { L.rect(g, x, y + h - 4, w, 1, [70, 48, 30]); L.rect(g, x + 3, y, 2, 3, [48, 100, 50]); } },
  { key: 'miner', name: 'Miner Gear', c: [112, 112, 118], paint: (g, x, y, w, h, L) => { L.rect(g, x + 1, y, 1, h, [84, 60, 40]); L.rect(g, x + 6, y, 1, h, [84, 60, 40]); } },
  { key: 'pirate', name: 'Pirate Shirt', c: [236, 236, 230], paint: (g, x, y, w, h, L) => { stripes([190, 36, 36])(g, x, y, w, h, L); L.rect(g, x, y + h - 3, w, 1, [40, 30, 24]); L.px(g, x + 4, y + h - 3, [226, 190, 80]); } },
  { key: 'hero', name: 'Hero Suit', c: [200, 44, 44], sleeves: [200, 44, 44], legs: [40, 70, 180], paint: (g, x, y, w, h, L) => { L.rect(g, x + 2, y + 2, 4, 3, [250, 220, 70]); L.px(g, x + 3, y + 5, [250, 220, 70]); L.px(g, x + 4, y + 5, [250, 220, 70]); L.rect(g, x, y + h - 2, w, 1, [250, 220, 70]); } },
  { key: 'armour', name: 'Knight Armour', c: [170, 174, 182], sleeves: [170, 174, 182], legs: [120, 124, 132], paint: (g, x, y, w, h, L) => { L.rect(g, x + 3, y + 1, 2, 6, [190, 40, 40]); L.rect(g, x + 1, y + 3, 6, 2, [190, 40, 40]); } },
  { key: 'robe', name: 'Wizard Robe', c: [104, 60, 160], sleeves: [104, 60, 160], legs: [84, 46, 134], paint: (g, x, y, w, h, L) => { L.px(g, x + 1, y + 2, [250, 220, 90]); L.px(g, x + 5, y + 5, [250, 220, 90]); L.px(g, x + 3, y + 8, [250, 220, 90]); } },
  { key: 'spacesuit', name: 'Space Suit', c: [236, 238, 242], sleeves: [236, 238, 242], legs: [224, 226, 232], gloves: [200, 204, 214], paint: (g, x, y, w, h, L) => { L.rect(g, x + 2, y + 2, 4, 3, [180, 184, 196]); L.px(g, x + 2, y + 2, [220, 60, 50]); L.px(g, x + 4, y + 2, [60, 160, 230]); L.rect(g, x, y + 8, w, 1, [200, 80, 40]); } },
  { key: 'robot', name: 'Robot Body', c: [130, 136, 146], sleeves: [150, 156, 164], legs: [100, 106, 116], gloves: [110, 116, 126], paint: (g, x, y, w, h, L) => { L.rect(g, x + 2, y + 2, 4, 4, [60, 64, 72]); L.px(g, x + 3, y + 3, [250, 80, 60]); L.px(g, x + 4, y + 4, [250, 220, 80]); } },
  { key: 'ninja', name: 'Ninja Suit', c: [30, 30, 36], sleeves: [30, 30, 36], legs: [26, 26, 30], paint: (g, x, y, w, h, L) => L.rect(g, x, y + h - 4, w, 1, [180, 30, 36]) },
  // prizes
  { key: 'dragon', name: 'Dragon Armour', prize: 'dragon', c: [44, 36, 62], sleeves: [44, 36, 62], legs: [32, 26, 48], paint: (g, x, y, w, h, L) => { L.rect(g, x, y, w, 1, [168, 70, 196]); L.rect(g, x + 3, y + 2, 2, 5, [168, 70, 196]); L.px(g, x + 2, y + 3, [168, 70, 196]); L.px(g, x + 5, y + 3, [168, 70, 196]); L.rect(g, x, y + h - 3, w, 1, [20, 16, 30]); } },
  { key: 'wither', name: 'Wither Bones', prize: 'blight', c: [40, 40, 46], sleeves: [40, 40, 46], legs: [30, 30, 34], paint: (g, x, y, w, h, L) => { for (let i = 1; i < 8; i += 2) L.rect(g, x + 1, y + i, w - 2, 1, [226, 226, 230]); L.rect(g, x + 3, y, 2, 9, [226, 226, 230]); } },
  { key: 'explorer', name: 'Explorer Coat', prize: 'lands', c: [184, 152, 100], sleeves: [184, 152, 100], paint: (g, x, y, w, h, L) => { L.rect(g, x, y, 2, h, [70, 48, 30]); L.rect(g, x, y + h - 4, w, 1, [70, 48, 30]); L.rect(g, x + 5, y + h - 4, 2, 2, [220, 190, 80]); } },
  { key: 'light', name: 'Robe of Light', prize: 'beacon', c: [236, 244, 248], sleeves: [236, 244, 248], legs: [214, 226, 234], paint: (g, x, y, w, h, L) => { L.rect(g, x, y, w, 1, [110, 226, 240]); L.rect(g, x + 3, y + 3, 2, 2, [110, 226, 240]); L.rect(g, x, y + h - 2, w, 1, [110, 226, 240]); } },
  { key: 'hunter', name: 'Hunter Leathers', prize: 'bestiary', c: [84, 58, 40], sleeves: [84, 58, 40], paint: (g, x, y, w, h, L) => { for (let i = 0; i < 8; i++) L.px(g, x + i, y + i, [40, 30, 24]); L.rect(g, x, y + h - 3, w, 1, [40, 30, 24]); L.px(g, x + 2, y + 2, [220, 190, 80]); L.px(g, x + 4, y + 4, [220, 190, 80]); } },
  { key: 'chef', name: 'Chef Whites', prize: 'diet', c: [244, 244, 240], sleeves: [244, 244, 240], paint: (g, x, y, w, h, L) => { for (const [a, b] of [[2, 2], [5, 2], [2, 5], [5, 5]]) L.px(g, x + a, y + b, [60, 60, 70]); L.rect(g, x + 1, y + 7, 6, h - 7, [226, 226, 222]); } },
];

export const LEGS = [
  { key: 'jeans', name: 'Jeans', c: [52, 58, 132] }, { key: 'black', name: 'Black', c: [40, 40, 48] }, { key: 'grey', name: 'Grey', c: [92, 94, 104] },
  { key: 'brown', name: 'Brown', c: [96, 70, 44] }, { key: 'khaki', name: 'Khaki', c: [176, 152, 104] }, { key: 'green', name: 'Green', c: [60, 104, 56] },
  { key: 'red', name: 'Red', c: [168, 48, 44] }, { key: 'white', name: 'White', c: [232, 232, 228] }, { key: 'purple', name: 'Purple', c: [104, 60, 150] },
  { key: 'shorts', name: 'Shorts', c: [52, 58, 132], short: 1 }, { key: 'redshorts', name: 'Red Shorts', c: [190, 52, 46], short: 1 },
];

const cape = (c) => [{ name: 'cape', size: [8, 13, 1], pos: [0, 6, -2.6], off: [0, -6.5, 0], rot: [0.14, 0, 0], color: c }];
export const BACKS = [
  { key: 'none', name: 'Nothing' },
  { key: 'backpack', name: 'Backpack', parts: [{ name: 'pack', size: [6, 7, 3], pos: [0, 0.5, -3.4], color: [150, 96, 50] }, { name: 'packflap', size: [6.4, 2.4, 3.4], pos: [0, 3, -3.4], color: [120, 74, 38] }] },
  { key: 'redcape', name: 'Red Cape', parts: cape([190, 44, 44]) },
  { key: 'bluecape', name: 'Blue Cape', parts: cape([50, 84, 190]) },
  { key: 'greencape', name: 'Green Cape', parts: cape([50, 132, 70]) },
  // prizes
  { key: 'dragon', name: 'Dragon Cape', prize: 'dragon', parts: cape([128, 52, 180]) },
  { key: 'wither', name: 'Wither Cape', prize: 'blight', parts: cape([24, 24, 28]) },
  { key: 'explorer', name: 'Explorer Cloak', prize: 'lands', parts: cape([50, 112, 62]) },
  { key: 'light', name: 'Cape of Light', prize: 'beacon', parts: cape([200, 240, 248]) },
  { key: 'pelt', name: 'Hunter Pelt', prize: 'bestiary', parts: cape([70, 50, 36]) },
];

// Every kind of part, in the order they are kept in a look (and shown on the Character page)
export const SLOTS = [
  { key: 'tone', name: 'Skin', items: TONES, swatch: 1 }, { key: 'face', name: 'Face', items: FACES }, { key: 'eye', name: 'Eyes', items: EYES, swatch: 1 },
  { key: 'hair', name: 'Hair', items: HAIRS }, { key: 'hairc', name: 'Hair Colour', items: HAIR_COLOURS, swatch: 1 }, { key: 'hat', name: 'Hat', items: HATS },
  { key: 'specs', name: 'Glasses', items: SPECS }, { key: 'top', name: 'Top', items: TOPS }, { key: 'legs', name: 'Trousers', items: LEGS }, { key: 'back', name: 'Back', items: BACKS },
];
const BY = Object.fromEntries(SLOTS.map((s) => [s.key, Object.fromEntries(s.items.map((i) => [i.key, i]))]));
export const item = (slot, key) => BY[slot][key] || SLOTS.find((s) => s.key === slot).items[0];

// What each prize is for, in words
export const PRIZES = {
  dragon: 'Defeat the Void Dragon', blight: 'Destroy the Wither', lands: 'Visit every kind of land in the Overworld',
  beacon: 'Stand by a lit beacon', bestiary: 'Kill one of every kind of monster', diet: 'Eat every kind of food',
};

// ---------------------------------------------------------------- looks
const L = (tone, face, eye, hair, hairc, hat, specs, top, legs, back) => ({ tone, face, eye, hair, hairc, hat, specs, top, legs, back });
// Ready-made characters (the keys are the skins of 1.9, which a look can still be named by)
export const CHARACTERS = [
  { key: 'wanderer', name: 'Wanderer', look: L('peach', 'plain', 'blue', 'short', 'brown', 'none', 'none', 'teal', 'jeans', 'none') },
  { key: 'scout', name: 'Scout', look: L('brown', 'smile', 'brown', 'long', 'black', 'none', 'none', 'vest', 'grey', 'backpack') },
  { key: 'ranger', name: 'Ranger', look: L('fair', 'freckles', 'green', 'long', 'ginger', 'none', 'none', 'tunic', 'brown', 'greencape') },
  { key: 'miner', name: 'Miner', look: L('peach', 'beard', 'brown', 'short', 'brown', 'miner', 'none', 'miner', 'grey', 'none') },
  { key: 'farmer', name: 'Farmer', look: L('tan', 'smile', 'blue', 'short', 'sandy', 'straw', 'none', 'overalls', 'jeans', 'none') },
  { key: 'knight', name: 'Knight', look: L('peach', 'plain', 'blue', 'short', 'brown', 'knight', 'none', 'armour', 'grey', 'redcape') },
  { key: 'wizard', name: 'Wizard', look: L('fair', 'beard', 'violet', 'long', 'white', 'wizard', 'none', 'robe', 'purple', 'none') },
  { key: 'pirate', name: 'Pirate', look: L('peach', 'beard', 'brown', 'short', 'ginger', 'pirate', 'patch', 'pirate', 'black', 'none') },
  { key: 'astronaut', name: 'Astronaut', look: L('peach', 'plain', 'blue', 'short', 'brown', 'space', 'none', 'spacesuit', 'white', 'none') },
  { key: 'robot', name: 'Robot', look: L('grey', 'robot', 'green', 'none', 'black', 'antenna', 'none', 'robot', 'grey', 'none') },
  { key: 'ninja', name: 'Ninja', look: L('peach', 'plain', 'black', 'short', 'black', 'ninja', 'none', 'ninja', 'black', 'none') },
  { key: 'hero', name: 'Hero', look: L('tan', 'grin', 'blue', 'side', 'black', 'none', 'none', 'hero', 'jeans', 'redcape') },
  { key: 'rocker', name: 'Rocker', look: L('pale', 'cool', 'green', 'mohawk', 'pink', 'none', 'shades', 'black', 'black', 'none') },
  { key: 'professor', name: 'Professor', look: L('fair', 'moustache', 'grey', 'afro', 'white', 'none', 'gold', 'labcoat', 'khaki', 'none') },
  { key: 'dragonslayer', name: 'Dragon Slayer', look: L('fair', 'dragon', 'violet', 'long', 'white', 'horns', 'none', 'dragon', 'black', 'dragon') },
  { key: 'witherbane', name: 'Wither Bane', look: L('grey', 'wither', 'black', 'none', 'black', 'withercrown', 'none', 'wither', 'black', 'wither') },
  { key: 'worldwalker', name: 'World Walker', look: L('brown', 'beard', 'green', 'short', 'black', 'explorer', 'none', 'explorer', 'brown', 'explorer') },
  { key: 'lightkeeper', name: 'Lightkeeper', look: L('fair', 'smile', 'blue', 'long', 'blonde', 'halo', 'none', 'light', 'white', 'light') },
  { key: 'hunter', name: 'Monster Hunter', look: L('peach', 'angry', 'red', 'long', 'brown', 'hood', 'none', 'hunter', 'brown', 'pelt') },
  { key: 'chef', name: 'Master Chef', look: L('peach', 'moustache', 'brown', 'short', 'black', 'chef', 'none', 'chef', 'black', 'none') },
];
const CHAR_BY = Object.fromEntries(CHARACTERS.map((c) => [c.key, c]));
export const DEFAULT_LOOK = CHARACTERS[0].look;

// A look as text, for saving and for telling other players: 'L1:' and the key of each part in order
export const codeOf = (look) => 'L1:' + SLOTS.map((s) => look[s.key]).join('.');
// The look a piece of text names (also the name of a ready-made character), or null if it is neither.
// Parts this version does not know are swapped for the plain ones.
export function lookOf(code) {
  if (typeof code !== 'string') return null;
  if (CHAR_BY[code]) return { ...CHAR_BY[code].look };
  if (!code.startsWith('L1:')) return null;
  const keys = code.slice(3).split('.');
  const look = {};
  SLOTS.forEach((s, i) => { look[s.key] = BY[s.key][keys[i]] ? keys[i] : DEFAULT_LOOK[s.key]; });
  return look;
}
// (what the game passes around: tidied text for a look, '' for anything else)
export const validSkin = (code) => { const l = lookOf(code); return l ? codeOf(l) : ''; };
// The prizes a look needs
export const prizesIn = (look) => SLOTS.map((s) => item(s.key, look[s.key]).prize).filter(Boolean);

// The colour of the bare arm or sleeve (for the arm in front of you)
export function armColour(look) {
  const top = item('top', look.top);
  return top.sleeves || item('tone', look.tone).c;
}

// The parts of a look's model. `H` brings the model builder's own tools: { humanoid, rect, px }.
// `bare`: an armour helmet is worn over it, so the hat and tall hair are left off.
export function lookParts(look, H, bare = false) {
  const { humanoid, rect, px } = H;
  const tone = item('tone', look.tone).c, hairC = item('hairc', look.hairc).c;
  const face = item('face', look.face), hair = item('hair', look.hair), hat = bare ? HATS[0] : item('hat', look.hat);
  const specs = item('specs', look.specs), top = item('top', look.top), legs = item('legs', look.legs), back = item('back', look.back);
  const C = { rect, px, skin: tone, hair: hairC, eye: item('eye', look.eye).c, face: null };
  // the face with everything worn on it (a hood that shows the face draws it too)
  C.face = (g, x, y) => {
    face.paint(g, x, y, C);
    if (hair.front) hair.front(g, x, y, C);
    if (specs.front) specs.front(g, x, y, C);
  };
  const rows = (n) => (g, x, y, w, h) => { if (n) rect(g, x, y, w, Math.min(h, n), hairC); };
  const side = (g, x, y, w, h) => {
    if (hat.all) { rect(g, x, y, w, h, hat.all); return; }
    rows(hair.side)(g, x, y, w, h);
    if (specs.side) specs.side(g, x, y, w, h, C);
  };
  const head = {
    front: (g, x, y) => { if (hat.mask) hat.mask(g, x, y, C); else C.face(g, x, y); },
    top: (g, x, y, w, h) => { if (hat.all) rect(g, x, y, w, h, hat.all); else if (hair.top) rect(g, x, y, w, h, hairC); else if (hair.stripe) rect(g, x + 3, y, 2, h, hairC); },
    back: (g, x, y, w, h) => { if (hat.all) rect(g, x, y, w, h, hat.all); else if (hair.stripe) rect(g, x + 3, y, 2, 3, hairC); else rows(hair.back)(g, x, y, w, h); },
    px: side, nx: side,
  };
  const pants = top.legs || legs.c, shorts = !top.legs && legs.short;
  const parts = humanoid([4, 12, 4], tone, top.c, pants, head, { body: top.paint ? (g, x, y, w, h) => top.paint(g, x, y, w, h, C) : null });
  // sleeves to the wrist, with the hand showing below them
  if (top.sleeves) for (const p of [parts[2], parts[3]]) { p.color = top.sleeves; p.paint = { all: (g, x, y, w, h) => rect(g, x, y + h - 2, w, 2, top.gloves || tone) }; }
  if (shorts) for (const p of [parts[4], parts[5]]) { p.color = tone; p.paint = { all: (g, x, y, w, h) => { rect(g, x, y, w, 5, legs.c); rect(g, x, y + h - 2, w, 2, [64, 64, 64]); } }; }
  const tall = hat.parts && !hat.open;
  if (!hat.all) (hair.parts || []).forEach((p, i) => { if (!((tall || bare) && p.tall)) parts.push({ name: 'hair' + i, parent: 'head', size: p.size, pos: [p.x || 0, p.y, p.z || 0], color: hairC }); });
  (hat.parts || []).forEach((p, i) => parts.push({ name: 'hat' + i, parent: 'head', size: p.size, pos: [p.x || 0, p.y, p.z || 0], color: p.color }));
  for (const p of back.parts || []) parts.push({ parent: 'body', ...p });
  return parts;
}

// ---------------------------------------------------------------- what this browser remembers
// { look: the parts worn, got: the prizes won (by achievement) }; a skin chosen in 1.9 becomes its look.
// Signed in, the same is kept with the account, so the character is the same on every device.
const OLD_PRIZE = { dragonslayer: 'dragon', witherbane: 'blight', worldwalker: 'lands', lightkeeper: 'beacon', hunter: 'bestiary', chef: 'diet' };
function state() {
  const s = load('skins') || {};
  const got = [...new Set((Array.isArray(s.got) ? s.got : []).map((k) => OLD_PRIZE[k] || k).filter((k) => PRIZES[k]))];
  const look = (s.look && typeof s.look === 'object' ? lookOf(codeOf(s.look)) : lookOf(s.sel)) || { ...DEFAULT_LOOK };
  // (a prize that is somehow no longer held is taken off)
  for (const sl of SLOTS) { const it = item(sl.key, look[sl.key]); if (it.prize && !got.includes(it.prize)) look[sl.key] = DEFAULT_LOOK[sl.key]; }
  // `who`: the account this look belongs to; `dirty`: changed here and not yet saved to that account
  return { look, got, who: typeof s.who === 'string' ? s.who : '', dirty: !!s.dirty };
}
// Called when the look or the prizes change in this browser (the game sends them to the account)
export const skinSync = { changed: null };
function keep(s) {
  s.dirty = true;
  store('skins', s);
  if (skinSync.changed) skinSync.changed();
}
// What goes to the account, and the note that it got there
export const accountLook = () => { const s = state(); return { code: codeOf(s.look), got: s.got }; };
export function lookSaved() { const s = state(); s.dirty = false; store('skins', s); }
// Signed in as account `id`, which holds `server` ({ code, got }, or nothing yet). The account's look is
// taken on, unless this browser has changes of that same account's still waiting to be sent. Returns
// true when what is here has to be sent up.
export function adoptAccountLook(id, server) {
  const s = state(), mine = s.who === id;
  const theirs = server ? lookOf(server.code) : null;
  const prizes = (server && Array.isArray(server.got) ? server.got : []).filter((k) => PRIZES[k]);
  if (!theirs) {
    // nothing kept there yet: what this browser has becomes the account's (prizes won as someone else stay behind)
    if (s.who && !mine) s.got = [];
    s.who = id; s.dirty = true;
    store('skins', s);
    return true;
  }
  const got = mine ? [...new Set([...s.got, ...prizes])] : prizes;
  if (mine && s.dirty) { s.got = got; store('skins', s); return true; }
  s.look = theirs; s.got = got; s.who = id; s.dirty = got.length > prizes.length;
  store('skins', s);
  return s.dirty;
}
export const myLook = () => state().look;
export const mySkin = () => codeOf(state().look);
export const hasPrize = (key) => state().got.includes(key);
export const owns = (it) => !it.prize || hasPrize(it.prize);
// Wear one part, or a whole look (only what is owned)
export function wear(slot, key) {
  const s = state(), it = BY[slot] && BY[slot][key];
  if (!it || !owns(it)) return false;
  s.look[slot] = key;
  keep(s);
  return true;
}
export function wearLook(look) {
  const s = state();
  if (prizesIn(look).some((p) => !s.got.includes(p))) return false;
  s.look = lookOf(codeOf(look));
  keep(s);
  return true;
}
// A character put together at random from what is owned
export function randomLook() {
  const s = state(), look = {};
  for (const sl of SLOTS) {
    const can = sl.items.filter((it) => !it.prize || s.got.includes(it.prize));
    // (a bare head and nothing on the back more often than not, or everyone looks overdressed)
    look[sl.key] = (['hat', 'specs', 'back'].includes(sl.key) && Math.random() < 0.5 ? sl.items[0] : can[Math.floor(Math.random() * can.length)]).key;
  }
  return look;
}
// An achievement has been made: the things it is the key to are yours. Returns the prizes that are new,
// each as { key, items: the names of what it unlocked }.
export function unlockSkins(has) {
  const s = state(), fresh = [];
  for (const key of Object.keys(PRIZES)) {
    if (s.got.includes(key) || !has(key)) continue;
    s.got.push(key);
    fresh.push({ key, items: SLOTS.flatMap((sl) => sl.items.filter((it) => it.prize === key).map((it) => it.name)) });
  }
  if (fresh.length) keep(s);
  return fresh;
}
