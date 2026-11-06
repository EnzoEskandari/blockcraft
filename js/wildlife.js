// Pandas and polar bears (1.11). Pandas live in bamboo jungles (and now and then in a jungle) and want
// nothing but to eat bamboo; polar bears live where it snows, leave you alone, and fight back if hit.
// Like horses (mounts.js), they are placed when a chunk is first seen, and wander in near players on land
// that has been seen already (`tickWild`), since explored land never gets anything new placed on it.
import { G } from './game.js';
import { B } from './blocks.js';
import { BIOME } from './constants.js';
import { boxBlocked } from './physics.js';
import { MOB_TYPES, MODELS, Entities, quadLegs, rect, px } from './entities.js';

const rand = Math.random;
const drop = (key, min, max) => ({ key, min, max });
const WHITE = [238, 238, 232], BLACK = [30, 30, 34], BEAR = [236, 236, 226], BEAR_D = [212, 212, 200];

Object.assign(MODELS, {
  panda: () => [
    { name: 'body', size: [14, 12, 20], pos: [0, 14, 0], color: WHITE },
    { name: 'shoulders', size: [14.4, 12.4, 6], pos: [0, 14, 6], color: BLACK },
    { name: 'head', size: [10, 9, 8], pos: [0, 16, 11], off: [0, 0, 4], color: WHITE, paint: { front: (g, x, y, w) => {
      // the black patches round its eyes, and a black nose
      rect(g, x + 1, y + 3, 3, 3, BLACK); rect(g, x + w - 4, y + 3, 3, 3, BLACK);
      px(g, x + 2, y + 4, [240, 240, 240]); px(g, x + w - 3, y + 4, [240, 240, 240]);
      rect(g, x + (w >> 1) - 1, y + 6, 2, 1, BLACK);
    } } },
    { name: 'ear0', parent: 'head', size: [3, 3, 1], pos: [-4, 5, 2], color: BLACK },
    { name: 'ear1', parent: 'head', size: [3, 3, 1], pos: [4, 5, 2], color: BLACK },
    ...quadLegs([5, 9, 5], [-4, 4], 9, [-7, 7], BLACK),
  ],
  polar_bear: () => [
    { name: 'body', size: [14, 14, 24], pos: [0, 17, 0], color: BEAR },
    { name: 'head', size: [9, 8, 8], pos: [0, 19, 13], off: [0, 0, 4], color: BEAR, paint: { front: (g, x, y, w) => { px(g, x + 1, y + 2, BLACK); px(g, x + w - 2, y + 2, BLACK); } } },
    { name: 'snout', parent: 'head', size: [5, 4, 3], pos: [0, -1.5, 5.5], color: BEAR_D, paint: { front: (g, x, y, w) => rect(g, x + (w >> 1) - 1, y, 2, 1, BLACK) } },
    { name: 'ear0', parent: 'head', size: [2, 2, 1], pos: [-3.5, 4.5, 1], color: BEAR_D },
    { name: 'ear1', parent: 'head', size: [2, 2, 1], pos: [3.5, 4.5, 1], color: BEAR_D },
    ...quadLegs([5, 10, 5], [-4.5, 4.5], 10, [-8, 8], BEAR, { all: (g, x, y, w, h) => rect(g, x, y + h - 1, w, 1, BEAR_D) }),
  ],
});

Object.assign(MOB_TYPES, {
  panda: { name: 'Panda', hp: 20, w: 1.3, h: 1.25, speed: 1.1, sound: 'cow', pitch: 1.35, drops: [drop('bamboo', 0, 2)], anim: 'quad', xp: [1, 3] },
  // `bear`: it minds its own business until hit, then goes for whoever hit it (see Mob.pickTarget)
  polar_bear: { name: 'Polar Bear', hp: 30, w: 1.4, h: 1.4, speed: 2.8, bear: true, damage: 6, sound: 'cow', pitch: 0.45, drops: [drop('cod', 0, 2), drop('salmon', 0, 2)], anim: 'quad', xp: [1, 3] },
});

const SNOWY = [BIOME.SNOWY, BIOME.ICE_SPIKES, BIOME.SNOWY_TAIGA, BIOME.FROZEN_OCEAN, BIOME.SNOWY_PEAKS];
// The wild animal for a chunk's first animals in this biome, or null for the usual farm animals
export function pickWild(biome) {
  const r = rand();
  if (biome === BIOME.BAMBOO) return r < 0.6 ? 'panda' : null;
  if (biome === BIOME.JUNGLE) return r < 0.12 ? 'panda' : null;
  if (SNOWY.includes(biome)) return r < 0.45 ? 'polar_bear' : null;
  return null;
}
// What they can stand on when placed (polar bears on snow and ice as well)
const WILD_GROUND = { polar_bear: [B.grass, B.snowy_grass, B.podzol, B.snow, B.ice, B.packed_ice] };
// How many come together
const wildCount = (type) => (type === 'polar_bear' ? 1 + Math.floor(rand() * 2) : type === 'panda' ? 1 + Math.floor(rand() * 3) : 0);

Entities.prototype.wildGround = WILD_GROUND;
Entities.prototype.wildCount = wildCount;

// On land already seen, now and then a panda or a polar bear or two wanders in from out of sight, by day, while
// there are few of them about
Entities.prototype.tickWild = function () {
  const w = G.world;
  if (!w || w.dim !== 'overworld' || !(G.daylight > 0.6)) return;
  this.wildCd = (this.wildCd || 30) - 1;
  if (this.wildCd > 0) return;
  this.wildCd = 30;
  if (this.mobs.filter((m) => m.type === 'panda' || m.type === 'polar_bear').length >= 6) return;
  const ps = [G.player, ...(G.net ? [...G.net.players.values()] : [])].filter((q) => q && !q.dead && q.pos);
  const q = ps[Math.floor(rand() * ps.length)];
  if (!q) return;
  const a = rand() * Math.PI * 2, d = 36 + rand() * 18;
  const x = Math.floor(q.pos.x + Math.cos(a) * d), z = Math.floor(q.pos.z + Math.sin(a) * d);
  const ch = w.getChunk(x >> 4, z >> 4);
  if (!ch || !ch.meshed) return;
  const type = pickWild(ch.biomes[((z & 15) << 4) | (x & 15)]);
  if (!type) return;
  const ground = WILD_GROUND[type] || [B.grass, B.podzol];
  for (let i = 0, n = wildCount(type); i < n; i++) {
    const hx = x + Math.floor(rand() * 5) - 2, hz = z + Math.floor(rand() * 5) - 2;
    let y = Math.min(126, ch.maxY + 1);
    while (y > 1 && !w.isSolid(hx, y - 1, hz)) y--;
    if (!ground.includes(w.getBlock(hx, y - 1, hz)) || w.getLight(hx, y, hz)[0] < 15 || boxBlocked(w, hx + 0.5, y, hz + 0.5, 0.7, 1.4)) continue;
    this.spawnMob(type, hx + 0.5, y, hz + 0.5);
  }
};
