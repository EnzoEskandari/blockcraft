// Villager professions and their trades.
//
// A villager starts as a Novice with a couple of trades. Every trade earns it experience, and as it rises
// through Apprentice, Journeyman, Expert and Master it offers more: the more you trade with a villager, the
// more it can trade with you. Prices and the order things unlock follow the original game's.
import { ID } from './blocks.js';
import { mulberry32 } from './noise.js';
import { ENCH, randomBook, randomlyEnchanted } from './enchant.js';

export const LEVEL_NAMES = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'];
const LEVEL_XP = [0, 10, 70, 150, 250];         // experience a villager needs for each level
const TRADE_XP = [2, 5, 10, 15, 30];            // what one trade of each level earns it
export const levelOf = (xp) => { let l = 1; while (l < 5 && xp >= LEVEL_XP[l]) l++; return l; };
// How far along the villager is to its next level, 0 to 1 (1 for a Master)
export const levelProgress = (xp) => { const l = levelOf(xp); return l >= 5 ? 1 : (xp - LEVEL_XP[l - 1]) / (LEVEL_XP[l] - LEVEL_XP[l - 1]); };

// The villager buys things for an emerald; sells things for emeralds; sells gear enchanted as if at a
// table (the price goes up with the enchantment); a librarian puts an enchantment in a book you bring
const buys = (key, n, max = 16) => ({ b: [key, n], s: ['emerald', 1], max });
const sells = (cost, key, n = 1, max = 12) => ({ b: ['emerald', cost], s: [key, n], max });
const gear = (base, key, max = 3) => ({ gear: key, base, max });
const book = () => ({ book: true, max: 12 });
const WOOL = ['white', 'light_gray', 'gray', 'black', 'brown', 'red', 'orange', 'yellow', 'lime', 'green', 'cyan', 'light_blue', 'blue', 'purple', 'magenta', 'pink'];

// For each profession: the trades each level adds (Novice first)
export const PROFESSIONS = {
  farmer: { name: 'Farmer', levels: [
    [buys('wheat', 20), sells(1, 'bread', 6, 16)],
    [buys('pumpkin', 6, 12), sells(1, 'apple', 4, 16)],
    [buys('wheat_seeds', 24, 12), sells(3, 'cooked_chicken', 8)],
    [buys('hay_bale', 3, 12), sells(1, 'hay_bale', 2)],
    [gear(6, 'diamond_hoe'), sells(4, 'experience_bottle', 1)],
  ] },
  librarian: { name: 'Librarian', levels: [
    [buys('paper', 24), book(), sells(9, 'bookshelf', 1)],
    [buys('book', 4, 12), book(), sells(1, 'glass', 4)],
    [buys('feather', 16, 12), book(), sells(4, 'glowstone', 2)],
    [buys('leather', 6, 12), book()],
    [book(), sells(3, 'experience_bottle', 1)],
  ] },
  armorer: { name: 'Armorer', levels: [
    [buys('coal', 15), sells(5, 'iron_helmet'), sells(9, 'iron_chestplate'), sells(7, 'iron_leggings'), sells(4, 'iron_boots')],
    [buys('iron_ingot', 4, 12), sells(3, 'chainmail_leggings'), sells(1, 'chainmail_boots')],
    [buys('lava_bucket', 1, 12), buys('diamond', 1, 12), sells(1, 'chainmail_helmet'), sells(4, 'chainmail_chestplate'), sells(5, 'shield')],
    [gear(14, 'diamond_leggings'), gear(8, 'diamond_boots')],
    [gear(8, 'diamond_helmet'), gear(16, 'diamond_chestplate')],
  ] },
  weaponsmith: { name: 'Weaponsmith', levels: [
    [buys('coal', 15), sells(3, 'iron_axe'), gear(2, 'iron_sword')],
    [buys('iron_ingot', 4, 12), sells(1, 'flint_and_steel')],
    [buys('flint', 24, 12)],
    [buys('diamond', 1, 12), gear(12, 'diamond_axe')],
    [gear(8, 'diamond_sword')],
  ] },
  toolsmith: { name: 'Toolsmith', levels: [
    [buys('coal', 15), sells(1, 'stone_axe'), sells(1, 'stone_shovel'), sells(1, 'stone_pickaxe'), sells(1, 'stone_hoe')],
    [buys('iron_ingot', 4, 12), sells(3, 'iron_pickaxe')],
    [buys('flint', 30, 12), gear(1, 'iron_axe'), gear(2, 'iron_shovel'), gear(3, 'iron_pickaxe'), sells(4, 'diamond_hoe', 1, 3)],
    [buys('diamond', 1, 12), gear(12, 'diamond_axe'), gear(5, 'diamond_shovel')],
    [gear(13, 'diamond_pickaxe')],
  ] },
  butcher: { name: 'Butcher', levels: [
    [buys('chicken', 14), buys('porkchop', 7)],
    [buys('coal', 15), sells(1, 'cooked_porkchop', 5, 16), sells(1, 'cooked_chicken', 8, 16)],
    [buys('mutton', 7), buys('beef', 10)],
    [sells(1, 'steak', 5, 16)],
    [sells(1, 'cooked_mutton', 6, 16), buys('cod', 15)],
  ] },
  fletcher: { name: 'Fletcher', levels: [
    [buys('stick', 32), sells(1, 'arrow', 16), { b: ['gravel', 10], b2: ['emerald', 1], s: ['flint', 10], max: 12 }],
    [buys('flint', 26, 12), sells(2, 'bow')],
    [buys('string', 14), sells(3, 'crossbow')],
    [buys('feather', 24), gear(2, 'bow')],
    [gear(3, 'crossbow'), sells(2, 'arrow', 32)],
  ] },
  cleric: { name: 'Cleric', levels: [
    [buys('rotten_flesh', 32), sells(1, 'redstone', 2)],
    [buys('gold_ingot', 3, 12), sells(1, 'lapis_lazuli', 1)],
    [buys('bone', 12, 12), sells(4, 'glowstone', 1)],
    [buys('nether_wart', 22, 12), sells(5, 'shade_pearl', 1)],
    [buys('cinder_powder', 4, 12), sells(3, 'experience_bottle', 1)],
  ] },
  shepherd: { name: 'Shepherd', levels: [
    [buys('white_wool', 18), buys('black_wool', 18), sells(1, 'white_wool', 2, 16)],
    [{ wool: 0 }, { wool: 1 }],
    [sells(3, 'bed_foot', 1), { wool: 2 }],
    [{ wool: 3 }, { wool: 4 }],
    [{ wool: 5 }, sells(2, 'string', 8, 16)],
  ] },
  leatherworker: { name: 'Leatherworker', levels: [
    [buys('leather', 6), sells(3, 'leather_leggings'), sells(7, 'leather_chestplate')],
    [buys('flint', 26, 12), sells(5, 'leather_helmet'), sells(4, 'leather_boots')],
    [buys('beef', 8, 12), gear(4, 'leather_chestplate', 12)],
    [buys('bone', 10, 12), gear(3, 'leather_helmet', 12)],
    [gear(2, 'leather_boots', 12), gear(3, 'leather_leggings', 12)],
  ] },
  mason: { name: 'Mason', levels: [
    [buys('clay_ball', 10), sells(1, 'bricks', 10, 16)],
    [buys('stone', 20), sells(1, 'stone_bricks', 4, 16)],
    [buys('granite', 16), buys('andesite', 16), sells(1, 'mossy_stone_bricks', 4, 16)],
    [buys('nether_quartz', 12, 12), sells(1, 'terracotta', 4)],
    [sells(1, 'quartz_block', 1), sells(1, 'chiseled_sandstone', 4)],
  ] },
  // (no work yet: one who finds a free job block takes up its trade)
  nitwit: { name: 'Villager', levels: [] },
};

// Everything a villager of this profession could ever offer, in order, each marked with the level that
// unlocks it. `seed` settles the parts that differ between villagers (which book, which colours of wool,
// how well the gear is enchanted), so the same villager always offers the same things.
export function makeTrades(prof, seed = 1) {
  const P = PROFESSIONS[prof] || PROFESSIONS.nitwit;
  const rng = mulberry32((seed >>> 0) || 1);
  const out = [];
  P.levels.forEach((list, li) => {
    for (const t of list) {
      let buy, buy2 = null, sell, max = t.max || 12;
      if (t.book) {
        // an enchantment in a book: dearer the higher its level, twice as dear when the table never gives it
        const bk = randomBook(rng, true);
        const [k, l] = Object.entries(bk.e)[0];
        const price = Math.min(64, (2 + 3 * l + Math.floor(rng() * (5 + l * 10))) * (ENCH[k].treasure ? 2 : 1));
        buy = { id: ID.emerald, count: price }; buy2 = { id: ID.book, count: 1 }; sell = bk;
      } else if (t.gear) {
        const lvl = 5 + Math.floor(rng() * 15);
        buy = { id: ID.emerald, count: Math.min(64, t.base + lvl) };
        sell = randomlyEnchanted(rng, ID[t.gear], lvl);
      } else if (t.wool !== undefined) {
        const c = WOOL[1 + ((Math.floor(rng() * 15) + t.wool * 3) % 15)];
        buy = { id: ID.emerald, count: 1 }; sell = { id: ID[c + '_wool'], count: 2 }; max = 16;
      } else {
        buy = { id: ID[t.b[0]], count: t.b[1] };
        if (t.b2) buy2 = { id: ID[t.b2[0]], count: t.b2[1] };
        sell = { id: ID[t.s[0]], count: t.s[1] };
      }
      if (!buy.id || !sell.id || (buy2 && !buy2.id)) continue;
      out.push({ buy, buy2, sell, uses: 0, max, lvl: li + 1, xp: TRADE_XP[li] });
    }
  });
  return out;
}
