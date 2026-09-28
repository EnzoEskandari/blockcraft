// Villager professions and their trades. Prices follow the original game's early trades.
import { ID } from './blocks.js';

// [buyKey, buyCount, buy2Key | null, buy2Count, sellKey, sellCount, maxUses]
export const PROFESSIONS = {
  farmer: { name: 'Farmer', trades: [
    ['wheat', 20, null, 0, 'emerald', 1, 16], ['pumpkin', 6, null, 0, 'emerald', 1, 12],
    ['emerald', 1, null, 0, 'bread', 6, 16], ['emerald', 1, null, 0, 'apple', 4, 16],
    ['emerald', 3, null, 0, 'cooked_chicken', 8, 12],
  ] },
  librarian: { name: 'Librarian', trades: [
    ['paper', 24, null, 0, 'emerald', 1, 16], ['book', 4, null, 0, 'emerald', 1, 12],
    ['emerald', 1, null, 0, 'bookshelf', 1, 12], ['emerald', 1, null, 0, 'glass', 4, 12],
    ['emerald', 4, null, 0, 'glowstone', 2, 12],
  ] },
  armorer: { name: 'Armorer', trades: [
    ['coal', 15, null, 0, 'emerald', 1, 16], ['iron_ingot', 4, null, 0, 'emerald', 1, 12],
    ['emerald', 5, null, 0, 'iron_helmet', 1, 12], ['emerald', 9, null, 0, 'iron_chestplate', 1, 12],
    ['emerald', 7, null, 0, 'iron_leggings', 1, 12], ['emerald', 4, null, 0, 'iron_boots', 1, 12],
    ['emerald', 4, null, 0, 'chainmail_chestplate', 1, 12], ['emerald', 2, null, 0, 'chainmail_boots', 1, 12],
    ['emerald', 13, null, 0, 'diamond_chestplate', 1, 3],
  ] },
  weaponsmith: { name: 'Weaponsmith', trades: [
    ['coal', 15, null, 0, 'emerald', 1, 16], ['emerald', 3, null, 0, 'iron_axe', 1, 12],
    ['emerald', 3, null, 0, 'iron_sword', 1, 12], ['emerald', 1, null, 0, 'flint_and_steel', 1, 12],
    ['emerald', 12, null, 0, 'diamond_sword', 1, 3],
  ] },
  toolsmith: { name: 'Toolsmith', trades: [
    ['coal', 15, null, 0, 'emerald', 1, 16], ['emerald', 1, null, 0, 'stone_pickaxe', 1, 12],
    ['emerald', 1, null, 0, 'stone_axe', 1, 12], ['emerald', 3, null, 0, 'iron_pickaxe', 1, 12],
    ['emerald', 3, null, 0, 'iron_shovel', 1, 12], ['emerald', 17, null, 0, 'diamond_pickaxe', 1, 3],
  ] },
  butcher: { name: 'Butcher', trades: [
    ['chicken', 14, null, 0, 'emerald', 1, 16], ['porkchop', 7, null, 0, 'emerald', 1, 16],
    ['beef', 10, null, 0, 'emerald', 1, 16], ['emerald', 1, null, 0, 'cooked_porkchop', 5, 16],
    ['emerald', 1, null, 0, 'steak', 5, 16],
  ] },
  fletcher: { name: 'Fletcher', trades: [
    ['stick', 32, null, 0, 'emerald', 1, 16], ['string', 14, null, 0, 'emerald', 1, 16],
    ['feather', 24, null, 0, 'emerald', 1, 16], ['emerald', 1, null, 0, 'arrow', 16, 12],
    ['emerald', 2, null, 0, 'bow', 1, 12], ['gravel', 10, 'emerald', 1, 'flint', 10, 12],
  ] },
  cleric: { name: 'Cleric', trades: [
    ['rotten_flesh', 32, null, 0, 'emerald', 1, 16], ['gold_ingot', 3, null, 0, 'emerald', 1, 12],
    ['emerald', 1, null, 0, 'redstone', 2, 12], ['emerald', 1, null, 0, 'lapis_lazuli', 1, 12],
    ['emerald', 4, null, 0, 'glowstone', 1, 12], ['emerald', 5, null, 0, 'shade_pearl', 1, 12],
  ] },
  shepherd: { name: 'Shepherd', trades: [
    ['white_wool', 18, null, 0, 'emerald', 1, 16], ['emerald', 1, null, 0, 'red_wool', 1, 16],
    ['emerald', 1, null, 0, 'blue_wool', 1, 16], ['emerald', 1, null, 0, 'yellow_wool', 1, 16],
    ['emerald', 3, null, 0, 'bed_foot', 1, 12],
  ] },
  leatherworker: { name: 'Leatherworker', trades: [
    ['leather', 6, null, 0, 'emerald', 1, 16], ['emerald', 3, null, 0, 'leather_leggings', 1, 12],
    ['emerald', 7, null, 0, 'leather_chestplate', 1, 12], ['emerald', 5, null, 0, 'leather_helmet', 1, 12],
    ['emerald', 4, null, 0, 'leather_boots', 1, 12],
  ] },
  mason: { name: 'Mason', trades: [
    ['clay_ball', 10, null, 0, 'emerald', 1, 16], ['stone', 20, null, 0, 'emerald', 1, 16],
    ['emerald', 1, null, 0, 'bricks', 10, 16], ['emerald', 1, null, 0, 'stone_bricks', 4, 16],
    ['emerald', 1, null, 0, 'terracotta', 4, 12],
  ] },
  nitwit: { name: 'Nitwit', trades: [] },
};

export function makeTrades(prof) {
  const P = PROFESSIONS[prof] || PROFESSIONS.nitwit;
  return P.trades.map(([b, bn, b2, b2n, s, sn, max]) => ({
    buy: { id: ID[b], count: bn },
    buy2: b2 ? { id: ID[b2], count: b2n } : null,
    sell: { id: ID[s], count: sn },
    uses: 0,
    max,
  }));
}
