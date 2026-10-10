// Generated structures: villages, desert pyramids, jungle temples, witch huts, igloos,
// pillager outposts, woodland mansions, ruined portals, desert wells, shipwrecks, and (from 1.8)
// dungeons, mineshafts and buried treasure.
//
// Each structure type sits on a grid of regions. A region deterministically picks one spot,
// checks the biome there, and builds a plan (a list of parts with bounding boxes). When a chunk
// generates, every part that overlaps it is stamped with writes clipped to that chunk, so a
// structure comes out identical no matter which chunk loads first.
import { B, ID, BLOCKS, ITEMS, JOB_BLOCKS } from './blocks.js';
import { hash3, mulberry32 } from './noise.js';
import { randomBook, randomlyEnchanted } from './enchant.js';
import { CS, CH, SEA, BIOME } from './constants.js';
import { NB, NETHER_LAVA, strongholds } from './dims.js';

const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
const DIRV = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // facing meta -> (dx, dz)
// The generator version whose rules are the newest here (1.8). Land seen before it keeps the structures
// it had, built the way they were; everywhere else follows the new rules.
const NEW = 4;

function rotVec(dx, dz, r) {
  switch (r & 3) {
    case 0: return [dx, dz];
    case 1: return [-dz, dx];
    case 2: return [-dx, -dz];
    default: return [dz, -dx];
  }
}
function rotFacing(meta, r) {
  const [dx, dz] = rotVec(DIRV[meta][0], DIRV[meta][1], r);
  return DIRV.findIndex((v) => v[0] === dx && v[1] === dz);
}
// rotation that turns the local front (0, -1) into world direction (fx, fz)
function rotFor(fx, fz) {
  if (fz === -1) return 0;
  if (fx === 1) return 1;
  if (fz === 1) return 2;
  return 3;
}

// ---------------------------------------------------------------- loot
// From worst to best: villages and outposts hold everyday things and worn gear, temples and
// shipwrecks hold treasure. Each table: rolls [min, max], items [key, min, max, weight],
// sure (always in the chest) and wear (how used any tools and armour are, 0-1).
const LOOT = {
  village_house: {
    rolls: [2, 5], wear: [0.3, 0.8],
    items: [['bread', 1, 3, 10], ['wheat', 2, 6, 8], ['wheat_seeds', 2, 6, 8], ['apple', 1, 3, 8], ['cooked_porkchop', 1, 2, 3], ['coal', 1, 3, 6], ['torch', 2, 6, 5],
      ['stick', 2, 6, 4], ['oak_sapling', 1, 2, 4], ['feather', 1, 3, 3], ['white_wool', 1, 3, 3], ['leather', 1, 3, 3], ['string', 1, 2, 2], ['flint', 1, 2, 2],
      ['paper', 1, 3, 3], ['book', 1, 1, 2], ['emerald', 1, 1, 2], ['iron_ingot', 1, 1, 1], ['wooden_pickaxe', 1, 1, 2], ['stone_axe', 1, 1, 2],
      ['leather_helmet', 1, 1, 2], ['leather_boots', 1, 1, 2]],
  },
  blacksmith: {
    rolls: [3, 6], wear: [0.25, 0.7],
    items: [['iron_ingot', 1, 4, 10], ['coal', 2, 6, 8], ['bread', 1, 3, 6], ['apple', 1, 3, 5], ['gold_ingot', 1, 2, 3], ['flint', 1, 3, 3], ['obsidian', 1, 3, 2],
      ['stone_pickaxe', 1, 1, 3], ['iron_pickaxe', 1, 1, 3], ['iron_sword', 1, 1, 3], ['iron_axe', 1, 1, 2], ['iron_shovel', 1, 1, 2],
      ['iron_helmet', 1, 1, 2], ['iron_boots', 1, 1, 2], ['iron_leggings', 1, 1, 1], ['iron_chestplate', 1, 1, 1], ['chainmail_chestplate', 1, 1, 1], ['diamond', 1, 1, 1]],
  },
  outpost: {
    rolls: [2, 4], wear: [0.4, 0.85],
    items: [['arrow', 2, 8, 8], ['string', 1, 4, 6], ['wheat', 2, 5, 6], ['dark_oak_log', 2, 4, 5], ['bread', 1, 2, 4], ['bone', 1, 3, 4], ['rotten_flesh', 1, 4, 4],
      ['bow', 1, 1, 3], ['stone_sword', 1, 1, 2], ['leather_chestplate', 1, 1, 2], ['iron_ingot', 1, 2, 2], ['emerald', 1, 1, 1], ['book', 1, 1, 1]],
  },
  igloo: {
    rolls: [3, 5], wear: [0.2, 0.6],
    items: [['apple', 1, 3, 12], ['coal', 1, 4, 12], ['bread', 1, 2, 8], ['cooked_mutton', 1, 3, 6], ['wheat', 2, 3, 6], ['torch', 2, 5, 4], ['gold_ingot', 1, 2, 6],
      ['iron_ingot', 1, 2, 3], ['emerald', 1, 1, 2], ['stone_axe', 1, 1, 3], ['leather_helmet', 1, 1, 3]],
  },
  ruined_portal: {
    rolls: [4, 7], wear: [0.1, 0.6],
    items: [['obsidian', 1, 3, 30], ['flint', 1, 4, 30], ['iron_ingot', 2, 6, 25], ['flint_and_steel', 1, 1, 20], ['gold_ingot', 2, 8, 20],
      ['golden_sword', 1, 1, 12], ['golden_axe', 1, 1, 12], ['golden_pickaxe', 1, 1, 10], ['golden_helmet', 1, 1, 10], ['golden_chestplate', 1, 1, 8],
      ['golden_leggings', 1, 1, 8], ['golden_boots', 1, 1, 10], ['glowstone', 4, 12, 8], ['emerald', 1, 2, 6], ['gold_block', 1, 2, 3], ['diamond', 1, 1, 2]],
  },
  mansion: {
    rolls: [3, 7], wear: [0, 0.4],
    items: [['iron_ingot', 2, 5, 10], ['gold_ingot', 2, 5, 8], ['emerald', 1, 4, 8], ['diamond', 1, 2, 4], ['bread', 2, 4, 6], ['book', 1, 3, 6], ['bookshelf', 1, 2, 3],
      ['string', 2, 6, 6], ['bone', 2, 6, 5], ['redstone', 2, 6, 5], ['lapis_lazuli', 2, 6, 5], ['cobweb', 1, 3, 3], ['iron_leggings', 1, 1, 3], ['iron_chestplate', 1, 1, 3],
      ['chainmail_chestplate', 1, 1, 3], ['diamond_pickaxe', 1, 1, 1], ['diamond_chestplate', 1, 1, 1], ['diamond_hoe', 1, 1, 1]],
  },
  pyramid: {
    rolls: [4, 7], wear: [0, 0.25], sure: [['gold_ingot', 2, 5]],
    items: [['diamond', 1, 3, 8], ['emerald', 2, 5, 10], ['gold_ingot', 2, 7, 14], ['iron_ingot', 2, 6, 12], ['gold_block', 1, 1, 3], ['lapis_lazuli', 3, 8, 6],
      ['redstone', 3, 8, 6], ['bone', 2, 6, 10], ['rotten_flesh', 2, 6, 8], ['gunpowder', 2, 6, 8], ['tnt', 1, 3, 4], ['sand', 3, 8, 4], ['book', 1, 3, 6],
      ['shade_pearl', 1, 1, 3], ['golden_chestplate', 1, 1, 4], ['golden_leggings', 1, 1, 3], ['iron_chestplate', 1, 1, 4], ['diamond_sword', 1, 1, 2],
      ['diamond_pickaxe', 1, 1, 2], ['diamond_helmet', 1, 1, 1], ['diamond_boots', 1, 1, 1]],
  },
  jungle_temple: {
    rolls: [4, 7], wear: [0, 0.25], sure: [['diamond', 1, 2], ['emerald', 1, 3]],
    items: [['diamond', 1, 3, 8], ['emerald', 2, 5, 10], ['gold_ingot', 2, 7, 12], ['iron_ingot', 2, 6, 12], ['gold_block', 1, 1, 2], ['bone', 2, 6, 10],
      ['rotten_flesh', 2, 6, 8], ['arrow', 4, 12, 6], ['bow', 1, 1, 4], ['book', 1, 3, 6], ['jungle_log', 3, 6, 4], ['shade_pearl', 1, 1, 3],
      ['iron_pickaxe', 1, 1, 4], ['iron_helmet', 1, 1, 4], ['golden_chestplate', 1, 1, 3], ['diamond_sword', 1, 1, 2], ['diamond_axe', 1, 1, 2], ['diamond_leggings', 1, 1, 1]],
  },
  shipwreck_supply: {
    rolls: [4, 8], wear: [0, 0.4], sure: [['bread', 2, 5]],
    items: [['paper', 2, 12, 8], ['wheat', 8, 20, 6], ['coal', 3, 10, 8], ['gunpowder', 2, 6, 6], ['tnt', 1, 3, 4], ['pumpkin', 1, 3, 3], ['cooked_porkchop', 2, 5, 6],
      ['steak', 2, 5, 4], ['apple', 2, 5, 5], ['book', 1, 3, 5], ['emerald', 1, 3, 4], ['diamond', 1, 1, 2], ['leather_helmet', 1, 1, 3],
      ['chainmail_helmet', 1, 1, 3], ['chainmail_chestplate', 1, 1, 3], ['chainmail_leggings', 1, 1, 3], ['chainmail_boots', 1, 1, 3],
      ['iron_sword', 1, 1, 3], ['iron_axe', 1, 1, 3], ['iron_pickaxe', 1, 1, 3]],
  },
  stronghold_corridor: {
    rolls: [3, 6], wear: [0, 0.4],
    items: [['shade_pearl', 1, 2, 10], ['iron_ingot', 1, 5, 10], ['gold_ingot', 1, 3, 5], ['bread', 1, 3, 15], ['apple', 1, 3, 15], ['redstone', 4, 9, 5],
      ['diamond', 1, 3, 3], ['iron_pickaxe', 1, 1, 5], ['iron_sword', 1, 1, 5], ['iron_chestplate', 1, 1, 5], ['iron_helmet', 1, 1, 5], ['iron_leggings', 1, 1, 5], ['iron_boots', 1, 1, 5]],
  },
  stronghold_library: {
    rolls: [2, 8], wear: [0, 0],
    items: [['book', 1, 3, 20], ['paper', 2, 7, 20], ['bookshelf', 1, 2, 4], ['shade_pearl', 1, 1, 2]],
  },
  fortress: {
    rolls: [3, 6], wear: [0, 0.3], sure: [['gold_ingot', 1, 3]],
    items: [['diamond', 1, 3, 5], ['iron_ingot', 1, 5, 5], ['gold_ingot', 1, 3, 15], ['golden_sword', 1, 1, 5], ['golden_chestplate', 1, 1, 5],
      ['flint_and_steel', 1, 1, 5], ['nether_wart', 3, 7, 5], ['obsidian', 2, 4, 2], ['cinder_rod', 1, 2, 4], ['magma_cream', 1, 3, 4]],
  },
  bastion: {
    rolls: [4, 8], wear: [0, 0.3], sure: [['gold_block', 1, 2]], more: [['netherite_upgrade', 1, 1, 0.3], ['netherite_scrap', 1, 1, 0.12]],
    items: [['gold_ingot', 3, 9, 16], ['gold_nugget', 6, 17, 12], ['diamond', 1, 3, 6], ['golden_helmet', 1, 1, 5], ['golden_boots', 1, 1, 5], ['golden_leggings', 1, 1, 4],
      ['golden_axe', 1, 1, 4], ['diamond_sword', 1, 1, 2], ['diamond_chestplate', 1, 1, 2], ['obsidian', 2, 6, 6], ['magma_cream', 2, 6, 6], ['cinder_rod', 1, 3, 3],
      ['shade_pearl', 1, 2, 4], ['arrow', 5, 17, 6], ['gilded_blackstone', 2, 6, 5], ['string', 3, 8, 5]],
  },
  // (1.10) the reworked fortress, and the bastions: a hall's chest is good, the stable's has tack, the treasure room's is the best there is
  nether_fortress: {
    rolls: [4, 7], wear: [0, 0.25], sure: [['gold_ingot', 2, 5]],
    items: [['diamond', 1, 3, 6], ['iron_ingot', 2, 6, 5], ['gold_ingot', 2, 5, 12], ['golden_sword', 1, 1, 4], ['golden_chestplate', 1, 1, 4], ['flint_and_steel', 1, 1, 4],
      ['nether_wart', 3, 8, 6], ['obsidian', 2, 5, 3], ['cinder_rod', 1, 3, 5], ['magma_cream', 1, 3, 4], ['saddle', 1, 1, 5], ['iron_horse_armor', 1, 1, 3], ['golden_horse_armor', 1, 1, 3],
      ['diamond_horse_armor', 1, 1, 1], ['nether_quartz', 3, 9, 5], ['enchanted_book', 1, 1, 3]],
  },
  bastion_hall: {
    rolls: [5, 9], wear: [0, 0.25], sure: [['gold_ingot', 3, 8]], more: [['netherite_upgrade', 1, 1, 0.25], ['netherite_scrap', 1, 1, 0.12]],
    items: [['gold_ingot', 3, 9, 14], ['gold_nugget', 6, 17, 10], ['gold_block', 1, 2, 5], ['diamond', 1, 3, 6], ['golden_helmet', 1, 1, 4], ['golden_boots', 1, 1, 4], ['golden_leggings', 1, 1, 4],
      ['golden_axe', 1, 1, 4], ['iron_sword', 1, 1, 4], ['diamond_sword', 1, 1, 2], ['diamond_pickaxe', 1, 1, 2], ['obsidian', 3, 7, 6], ['crying_obsidian', 1, 4, 5], ['magma_cream', 2, 6, 5],
      ['cinder_rod', 1, 3, 3], ['shade_pearl', 1, 3, 5], ['arrow', 8, 20, 6], ['gilded_blackstone', 2, 6, 4], ['string', 3, 8, 4], ['golden_apple', 1, 1, 3], ['enchanted_book', 1, 1, 4], ['saddle', 1, 1, 3]],
  },
  bastion_stable: {
    rolls: [5, 8], wear: [0, 0.25], sure: [['saddle', 1, 1], ['leather', 2, 5]], more: [['netherite_upgrade', 1, 1, 0.15]],
    items: [['saddle', 1, 1, 8], ['leather_horse_armor', 1, 1, 6], ['iron_horse_armor', 1, 1, 6], ['golden_horse_armor', 1, 1, 8], ['diamond_horse_armor', 1, 1, 3], ['hay_bale', 2, 6, 8],
      ['apple', 2, 6, 6], ['wheat', 4, 12, 6], ['gold_ingot', 2, 7, 10], ['gold_nugget', 5, 14, 8], ['diamond', 1, 2, 4], ['golden_apple', 1, 1, 3], ['string', 2, 6, 4], ['porkchop', 2, 5, 5], ['leather', 2, 6, 6]],
  },
  bastion_treasure: {
    rolls: [7, 11], wear: [0, 0.1], sure: [['diamond', 3, 6], ['gold_block', 2, 4], ['golden_apple', 1, 2]],
    more: [['netherite_upgrade', 1, 1, 1], ['ancient_debris', 1, 2, 0.4], ['netherite_scrap', 1, 2, 0.35], ['netherite_ingot', 1, 1, 0.15]],
    items: [['diamond', 2, 6, 12], ['gold_block', 1, 4, 10], ['gold_ingot', 6, 16, 10], ['emerald', 2, 8, 5], ['diamond_sword', 1, 1, 6], ['diamond_pickaxe', 1, 1, 6], ['diamond_axe', 1, 1, 4],
      ['diamond_helmet', 1, 1, 5], ['diamond_chestplate', 1, 1, 5], ['diamond_leggings', 1, 1, 5], ['diamond_boots', 1, 1, 5], ['diamond_horse_armor', 1, 1, 5], ['saddle', 1, 1, 4],
      ['enchanted_book', 1, 1, 14], ['golden_apple', 1, 2, 8], ['crying_obsidian', 3, 8, 6], ['shade_pearl', 2, 6, 6], ['experience_bottle', 3, 8, 6], ['iron_block', 1, 3, 5], ['cinder_rod', 2, 5, 4]],
  },
  end_city: {
    rolls: [4, 8], wear: [0, 0.15], sure: [['diamond', 1, 3]],
    items: [['diamond', 2, 7, 10], ['iron_ingot', 4, 8, 10], ['gold_ingot', 2, 7, 15], ['emerald', 2, 6, 3], ['diamond_sword', 1, 1, 3], ['diamond_pickaxe', 1, 1, 3],
      ['diamond_helmet', 1, 1, 3], ['diamond_chestplate', 1, 1, 3], ['diamond_leggings', 1, 1, 3], ['diamond_boots', 1, 1, 3], ['iron_sword', 1, 1, 3],
      ['iron_chestplate', 1, 1, 3], ['shade_pearl', 1, 3, 5], ['clamper_shell', 1, 2, 3], ['end_rod', 2, 6, 4]],
  },
  shipwreck_treasure: {
    rolls: [5, 9], wear: [0, 0.15], sure: [['diamond', 2, 4], ['emerald', 3, 8], ['gold_ingot', 3, 8]],
    items: [['iron_ingot', 3, 9, 20], ['gold_ingot', 3, 9, 14], ['emerald', 3, 9, 14], ['diamond', 1, 4, 10], ['lapis_lazuli', 4, 10, 8], ['gold_block', 1, 2, 4],
      ['iron_block', 1, 1, 3], ['diamond_block', 1, 1, 1], ['emerald_block', 1, 1, 1], ['shade_pearl', 1, 2, 4], ['glowstone', 2, 6, 4], ['golden_helmet', 1, 1, 3],
      ['diamond_sword', 1, 1, 3], ['diamond_pickaxe', 1, 1, 3], ['diamond_chestplate', 1, 1, 2], ['diamond_helmet', 1, 1, 2], ['diamond_boots', 1, 1, 2]],
  },
};

Object.assign(LOOT, {
  dungeon: {
    rolls: [5, 9], wear: [0, 0.4], sure: [['bone', 2, 6]],
    items: [['iron_ingot', 1, 4, 12], ['gold_ingot', 1, 3, 6], ['bread', 1, 3, 12], ['wheat', 1, 4, 10], ['coal', 2, 6, 10], ['redstone', 2, 6, 8], ['string', 2, 6, 8],
      ['gunpowder', 2, 6, 8], ['rotten_flesh', 2, 6, 8], ['bucket', 1, 1, 6], ['arrow', 4, 10, 6], ['golden_apple', 1, 1, 4], ['diamond', 1, 2, 3], ['emerald', 1, 3, 4],
      ['iron_sword', 1, 1, 3], ['iron_pickaxe', 1, 1, 3], ['iron_helmet', 1, 1, 2], ['iron_chestplate', 1, 1, 2], ['bow', 1, 1, 3], ['experience_bottle', 1, 3, 3]],
  },
  mineshaft: {
    rolls: [4, 8], wear: [0.1, 0.5], sure: [['torch', 4, 12]],
    items: [['iron_ingot', 2, 6, 14], ['gold_ingot', 1, 4, 8], ['coal', 4, 10, 14], ['redstone', 4, 9, 8], ['lapis_lazuli', 4, 9, 8], ['diamond', 1, 3, 5], ['copper_ingot', 3, 8, 8],
      ['bread', 1, 4, 10], ['oak_planks', 4, 12, 6], ['oak_fence', 2, 6, 4], ['tnt', 1, 2, 4], ['string', 2, 5, 5], ['golden_apple', 1, 1, 3], ['iron_pickaxe', 1, 1, 6],
      ['diamond_pickaxe', 1, 1, 1], ['iron_shovel', 1, 1, 3], ['bucket', 1, 1, 3], ['experience_bottle', 1, 2, 2]],
  },
  // the best there is: what a map from a shipwreck leads to
  buried_treasure: {
    rolls: [6, 10], wear: [0, 0], sure: [['diamond', 4, 9], ['emerald', 6, 14], ['gold_ingot', 6, 14], ['iron_ingot', 6, 12], ['enchanted_book', 1, 1], ['golden_apple', 1, 2]],
    items: [['diamond', 2, 5, 12], ['emerald', 4, 9, 10], ['gold_block', 1, 3, 8], ['iron_block', 1, 3, 8], ['diamond_block', 1, 1, 3], ['emerald_block', 1, 2, 3], ['golden_apple', 1, 2, 8],
      ['experience_bottle', 3, 8, 8], ['shade_pearl', 2, 4, 5], ['tnt', 2, 5, 4], ['cooked_cod', 3, 6, 4], ['cooked_salmon', 3, 6, 4], ['trident', 1, 1, 3],
      ['diamond_sword', 1, 1, 5], ['diamond_pickaxe', 1, 1, 5], ['diamond_axe', 1, 1, 3], ['diamond_helmet', 1, 1, 3], ['diamond_chestplate', 1, 1, 3], ['diamond_leggings', 1, 1, 3],
      ['diamond_boots', 1, 1, 3], ['bow', 1, 1, 3], ['crossbow', 1, 1, 2], ['fishing_rod', 1, 1, 2]],
  },
  // (outposts built from 1.8 on)
  outpost_top: {
    rolls: [4, 7], wear: [0.1, 0.5], sure: [['crossbow', 1, 1], ['arrow', 8, 20]],
    items: [['iron_ingot', 1, 4, 10], ['emerald', 1, 4, 8], ['gold_ingot', 1, 3, 6], ['dark_oak_log', 2, 6, 6], ['wheat', 3, 8, 6], ['bread', 2, 4, 6], ['string', 2, 6, 6],
      ['experience_bottle', 1, 3, 5], ['golden_apple', 1, 1, 3], ['diamond', 1, 2, 3], ['iron_sword', 1, 1, 4], ['iron_axe', 1, 1, 4], ['iron_chestplate', 1, 1, 3], ['shield', 1, 1, 3]],
  },
});
// A map in every sunken ship's treasure chest
LOOT.shipwreck_treasure.sure.push(['treasure_map', 1, 1]);

// Enchantments in loot: [chance a tool or armour piece is enchanted, lowest and highest level it is
// enchanted with, weight of a book of enchantment among the table's items]
const BOOK_LOOT = {
  blacksmith: [0.15, 5, 15, 0], outpost: [0.2, 5, 15, 2], igloo: [0.3, 10, 25, 4], ruined_portal: [0.5, 10, 25, 3], mansion: [0.4, 15, 30, 6],
  pyramid: [0.4, 15, 30, 10], jungle_temple: [0.4, 15, 30, 10], shipwreck_supply: [0.2, 5, 15, 0], shipwreck_treasure: [0.5, 15, 30, 6],
  stronghold_corridor: [0.4, 15, 30, 5], stronghold_library: [0, 0, 0, 30], fortress: [0.3, 10, 25, 3], bastion: [0.6, 20, 30, 8], end_city: [1, 20, 30, 6],
  nether_fortress: [0.4, 15, 30, 4], bastion_hall: [0.6, 20, 30, 6], bastion_stable: [0.3, 10, 25, 3], bastion_treasure: [1, 25, 30, 10],
  dungeon: [0.4, 10, 25, 8], mineshaft: [0.4, 10, 25, 6], buried_treasure: [1, 25, 30, 10], outpost_top: [0.5, 10, 25, 5],
};

// Items for a structure chest, spread over 27 slots
export function rollLoot(table, seed) {
  const T = LOOT[table];
  const slots = new Array(27).fill(null);
  if (!T) return slots;
  const r = mulberry32(seed >>> 0);
  const put = (key, min, max) => {
    const id = ID[key];
    if (!id) return;
    const def = ITEMS[id];
    const count = Math.min(def ? def.stack : 64, min + Math.floor(r() * (max - min + 1)));
    // tools and armour found lying around are used; the better the place, the less worn
    let dmg = 0;
    if (def && def.durability && T.wear) dmg = Math.floor(def.durability * (T.wear[0] + r() * (T.wear[1] - T.wear[0])));
    let slot = Math.floor(r() * 27);
    for (let t = 0; t < 27 && slots[slot]; t++) slot = (slot + 7) % 27;
    if (slots[slot]) return;
    slots[slot] = { id, count, dmg };
    // books of enchantment, and in the better places gear that is already enchanted
    const E = BOOK_LOOT[table];
    if (key === 'enchanted_book') slots[slot] = randomBook(r, true);
    else if (E && def && def.durability && r() < E[0]) slots[slot] = { ...randomlyEnchanted(r, id, E[1] + Math.floor(r() * (E[2] - E[1] + 1)), true), dmg };
  };
  for (const [key, min, max] of T.sure || []) put(key, min, max);
  // (how often a roll turns up a book of enchantment, on top of the table's own things)
  const E = BOOK_LOOT[table];
  const items = E && E[3] ? [...T.items, ['enchanted_book', 1, 1, E[3]]] : T.items;
  const total = items.reduce((n, it) => n + it[3], 0);
  const rolls = T.rolls[0] + Math.floor(r() * (T.rolls[1] - T.rolls[0] + 1));
  for (let k = 0; k < rolls; k++) {
    let pick = r() * total;
    const it = items.find((x) => (pick -= x[3]) < 0) || items[0];
    put(it[0], it[1], it[2]);
  }
  // (1.10.3) what a table has `more` of ([thing, least, most, chance]) is rolled on its own and goes into slots
  // still empty: a chest nobody has opened yet holds all it would have held before, and maybe this as well
  if (T.more) {
    const r2 = mulberry32((seed ^ 0x5eb715) >>> 0);
    for (const [key, min, max, chance] of T.more) {
      const hit = r2() < chance, n = min + Math.floor(r2() * (max - min + 1));
      let slot = Math.floor(r2() * 27);
      if (!hit || !ID[key]) continue;
      for (let t = 0; t < 27 && slots[slot]; t++) slot = (slot + 7) % 27;
      if (!slots[slot]) slots[slot] = { id: ID[key], count: n, dmg: 0 };
    }
  }
  return slots;
}

// ---------------------------------------------------------------- stamping context
function makeCtx(world, chunk, plan) {
  const x0 = chunk.cx * CS, z0 = chunk.cz * CS;
  const blocks = chunk.blocks;
  const inside = (x, z) => x >= x0 && x < x0 + CS && z >= z0 && z < z0 + CS;
  const ctx = {
    world, plan, x0, z0, inside,
    set(x, y, z, id, meta = 0) {
      if (!inside(x, z) || y < 1 || y >= CH - 1) return;
      const i = (y << 8) | ((z - z0) << 4) | (x - x0);
      blocks[i] = id;
      if (meta || chunk.meta) {
        if (!chunk.meta) chunk.meta = new Uint8Array(CS * CS * CH);
        chunk.meta[i] = meta;
      }
    },
    get(x, y, z) {
      if (!inside(x, z) || y < 0 || y >= CH) return -1;
      return blocks[(y << 8) | ((z - z0) << 4) | (x - x0)];
    },
    // (a structure begun in old land and finished in new stands on the ground that is really there)
    ground: plan.gen < NEW && world.dim === 'overworld' && world.genAt(chunk.cx, chunk.cz) >= NEW ? (x, z) => world.column(x, z).h : (x, z) => plan.ground(x, z),
    chest(x, y, z, loot, facing = 0) {
      ctx.set(x, y, z, B.chest, facing);
      if (inside(x, z)) world.lootChests.set(`${x},${y},${z}`, loot);
    },
    // a positional hash for decisions that must match across chunks
    h: (x, y, z, s = 0) => hash3(world.seed ^ (0x5717 + s), x, y, z),
  };
  return ctx;
}

// Local coordinates for a rotated building part: x across, z depth (front is -z), y up from the floor
function local(ctx, part) {
  const ox = part.x, oy = part.y, oz = part.z, rot = part.rot || 0;
  const L = {
    w(lx, lz) { const [dx, dz] = rotVec(lx, lz, rot); return [ox + dx, oz + dz]; },
    set(lx, ly, lz, id, meta = 0) {
      const [dx, dz] = rotVec(lx, lz, rot);
      const def = BLOCKS[id];
      const m = def && def.facing ? (rotFacing(meta & 3, rot) | (meta & ~3)) : meta;
      ctx.set(ox + dx, oy + ly, oz + dz, id, m);
    },
    get(lx, ly, lz) { const [dx, dz] = rotVec(lx, lz, rot); return ctx.get(ox + dx, oy + ly, oz + dz); },
    fill(lx0, ly0, lz0, lx1, ly1, lz1, id, meta = 0) {
      for (let ly = Math.min(ly0, ly1); ly <= Math.max(ly0, ly1); ly++)
        for (let lz = Math.min(lz0, lz1); lz <= Math.max(lz0, lz1); lz++)
          for (let lx = Math.min(lx0, lx1); lx <= Math.max(lx0, lx1); lx++) L.set(lx, ly, lz, id, meta);
    },
    chest(lx, ly, lz, loot, facing = 0) {
      const [dx, dz] = rotVec(lx, lz, rot);
      ctx.chest(ox + dx, oy + ly, oz + dz, loot, rotFacing(facing, rot));
    },
    door(lx, ly, lz, facing) { L.set(lx, ly, lz, B.oak_door, facing); L.set(lx, ly + 1, lz, B.oak_door_top, facing); },
    bed(lx, ly, lz, facing) {
      L.set(lx, ly, lz, B.bed_foot, facing);
      L.set(lx + DIRV[facing][0], ly, lz + DIRV[facing][1], B.bed_head, facing);
    },
    // Level the footprint: fill below the floor down to the ground, clear everything above
    prepare(hw, hd, height, found, floor) {
      for (let lz = -hd; lz <= hd; lz++) for (let lx = -hw; lx <= hw; lx++) {
        const [wx, wz] = L.w(lx, lz);
        if (!ctx.inside(wx, wz)) continue;
        const g = ctx.ground(wx, wz);
        const bottom = Math.max(Math.min(g, oy - 1), oy - 10);
        for (let y = bottom; y <= oy - 2; y++) ctx.set(wx, y, wz, found);
        if (floor !== null) ctx.set(wx, oy - 1, wz, floor);
        const top = Math.min(oy + Math.max(height, g - oy + 2), oy + 16);
        for (let y = oy; y <= top; y++) ctx.set(wx, y, wz, 0);
      }
    },
    // A short path from the front door to the road
    doorstep(hd, len, pathId) {
      // Villages in land first seen from 1.7 on: the path meets the door at the level of the floor and
      // goes up or down a block at a time to the ground, so a house on a slope can always be walked into
      if (ctx.plan.gen >= 3) {
        const f = oy - 1;
        for (let k = 1; k <= 3; k++) {   // (no further than the road, so nothing across it is cut into)
          const [wx, wz] = L.w(0, -hd - k);
          const g = ctx.ground(wx, wz);
          const t = f + Math.max(-(k - 1), Math.min(k - 1, g - f));
          if (t < SEA) break;
          for (let y = Math.min(g, t); y < t; y++) ctx.set(wx, y, wz, B.cobblestone);
          ctx.set(wx, t, wz, pathId);
          for (let y = t + 1; y <= Math.max(t + 3, g); y++) ctx.set(wx, y, wz, 0);   // (room to walk, and no higher: the eaves stay)
          if (t === g && k > len) break;
        }
        return;
      }
      for (let k = 1; k <= len; k++) {
        const [wx, wz] = L.w(0, -hd - k);
        const g = ctx.ground(wx, wz);
        if (g >= SEA) { ctx.set(wx, g, wz, pathId); ctx.set(wx, g + 1, wz, 0); ctx.set(wx, g + 2, wz, 0); }
      }
    },
  };
  return L;
}

function bboxOf(x, z, hw, hd, rot, margin = 1) {
  const ex = (rot & 1 ? hd : hw) + margin, ez = (rot & 1 ? hw : hd) + margin;
  return { minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez };
}
const overlaps = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

// ---------------------------------------------------------------- village buildings
const STYLE = {
  plains: { wall: B.oak_planks, frame: B.oak_log, floor: B.oak_planks, found: B.cobblestone, roof: B.oak_planks, win: B.glass, flat: false, path: B.dirt_path },
  desert: { wall: B.sandstone, frame: B.chiseled_sandstone, floor: B.sandstone, found: B.sandstone, roof: B.sandstone, win: 0, flat: true, accent: B.orange_terracotta, path: B.dirt_path },
  taiga: { wall: B.spruce_planks, frame: B.spruce_log, floor: B.spruce_planks, found: B.cobblestone, roof: B.spruce_planks, win: B.glass, flat: false, path: B.dirt_path },
  snowy: { wall: B.spruce_planks, frame: B.spruce_log, floor: B.spruce_planks, found: B.stone_bricks, roof: B.dark_oak_planks, win: B.glass, flat: false, path: B.dirt_path },
  // (1.8) acacia and orange roofs on the savanna, flat-roofed terracotta in the badlands, white walls and
  // wide eaves under the cherry trees, thatch in the jungle, birch cottages, and stone houses in the meadows
  savanna: { wall: B.acacia_planks, frame: B.acacia_log, floor: B.acacia_planks, found: B.cobblestone, roof: B.orange_terracotta, win: B.glass, flat: false, path: B.dirt_path },
  badlands: { wall: B.terracotta, frame: B.red_terracotta, floor: B.yellow_terracotta, found: B.red_terracotta, roof: B.terracotta, win: 0, flat: true, accent: B.yellow_terracotta, path: B.dirt_path },
  cherry: { wall: B.white_terracotta, frame: B.cherry_log, floor: B.cherry_planks, found: B.stone_bricks, roof: B.cherry_planks, win: B.glass, flat: false, eave: true, path: B.dirt_path },
  jungle: { wall: B.jungle_planks, frame: B.jungle_log, floor: B.jungle_planks, found: B.mossy_cobblestone, roof: B.hay_bale, win: 0, flat: false, path: B.dirt_path },
  birch: { wall: B.birch_planks, frame: B.birch_log, floor: B.birch_planks, found: B.cobblestone, roof: B.spruce_planks, win: B.glass, flat: false, path: B.dirt_path },
  meadow: { wall: B.stone_bricks, frame: B.spruce_log, floor: B.spruce_planks, found: B.cobblestone, roof: B.bricks, win: B.glass, flat: false, path: B.dirt_path },
};
// The half blocks each kind of village makes its stairs of
const STYLE_SLAB = { plains: B.oak_slab, desert: B.sandstone_slab, taiga: B.spruce_slab, snowy: B.spruce_slab, savanna: B.acacia_slab, badlands: B.sandstone_slab, cherry: B.cherry_slab,
  jungle: B.jungle_slab, birch: B.birch_slab, meadow: B.stone_brick_slab };

function walls(L, S, hw, hd, H, wallId) {
  for (let ly = 0; ly < H; ly++) for (let lz = -hd; lz <= hd; lz++) for (let lx = -hw; lx <= hw; lx++) {
    const edgeX = lx === -hw || lx === hw, edgeZ = lz === -hd || lz === hd;
    if (!edgeX && !edgeZ) continue;
    L.set(lx, ly, lz, edgeX && edgeZ ? S.frame : wallId || S.wall);
  }
}
function roof(L, S, hw, hd, H) {
  if (S.flat) {
    L.fill(-hw, H, -hd, hw, H, hd, S.roof);
    for (let lz = -hd; lz <= hd; lz++) for (let lx = -hw; lx <= hw; lx++) {
      if (lx === -hw || lx === hw || lz === -hd || lz === hd) L.set(lx, H + 1, lz, S.accent && (lx + lz) % 2 === 0 ? S.accent : S.roof);
    }
    return;
  }
  for (let i = 0; i <= hw + 1; i++) {
    const x0 = -hw - 1 + i, x1 = hw + 1 - i;
    if (x0 > x1) break;
    L.fill(x0, H + i, -hd - 1, x1, H + i, hd + 1, x0 === x1 && S.eave ? S.frame : S.roof);
  }
  // wide eaves, a half block thick
  if (S.eave) for (const lx of [-hw - 2, hw + 2]) L.fill(lx, H, -hd - 1, lx, H, hd + 1, B.cherry_slab, 1);
}
function windowsOn(L, S, hw, hd, ly) {
  const w = S.win;
  L.set(-hw, ly, 0, w); L.set(hw, ly, 0, w); L.set(0, ly, hd, w);
  if (hd >= 3) { L.set(-hw, ly, -hd + 2, w); L.set(hw, ly, -hd + 2, w); L.set(-hw, ly, hd - 2, w); L.set(hw, ly, hd - 2, w); }
  if (hw >= 3) { L.set(-2, ly, -hd, w); L.set(2, ly, -hd, w); L.set(-2, ly, hd, w); L.set(2, ly, hd, w); }
}

const BUILDINGS = {
  small: { w: 5, d: 5, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 2, 7, S.found, S.floor);
    walls(L, S, 2, 2, 3);
    L.door(0, 0, -2, 2);
    windowsOn(L, S, 2, 2, 1);
    roof(L, S, 2, 2, 3);
    const v = Math.floor(ctx.h(part.x, part.y, part.z, 41) * 3);
    L.bed(1, 0, 0, 0);
    if (v === 0) L.set(-1, 0, 1, B.crafting_table);
    else if (v === 1) L.chest(-1, 0, 1, 'village_house', 3);
    else { L.set(-1, 0, 1, B.furnace, 3); L.set(-1, 0, 0, B.crafting_table); }
    L.set(-1, 0, -1, B.torch);
    L.doorstep(2, 2, S.path);
  } },
  big: { w: 7, d: 7, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(3, 3, 9, S.found, S.floor);
    walls(L, S, 3, 3, 4);
    L.door(0, 0, -3, 2);
    windowsOn(L, S, 3, 3, 1);
    windowsOn(L, S, 3, 3, 2);
    roof(L, S, 3, 3, 4);
    L.bed(2, 0, 1, 0);
    L.chest(-2, 0, 2, 'village_house', 2);
    L.set(-2, 0, 1, B.crafting_table);
    L.set(-2, 0, -1, B.furnace, 3);
    L.set(2, 0, -2, B.torch);
    if (ctx.h(part.x, part.y, part.z, 42) < 0.5) L.set(0, 0, 2, B.bookshelf);
    else L.bed(0, 0, 1, 0);
    L.doorstep(3, 2, S.path);
  } },
  // Two storeys: kitchen downstairs, bedroom upstairs, reached by steps
  tall: { w: 5, d: 7, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 3, 12, S.found, S.floor);
    walls(L, S, 2, 3, 7);
    L.fill(-1, 3, -2, 1, 3, 2, S.floor);
    for (let k = 0; k < 4; k++) L.fill(1, 0, -2 + k, 1, k, -2 + k, S.floor);
    L.fill(1, 3, -2, 1, 3, 0, 0);
    L.door(0, 0, -3, 2);
    windowsOn(L, S, 2, 3, 1);
    windowsOn(L, S, 2, 3, 5);
    roof(L, S, 2, 3, 7);
    L.set(-1, 0, 2, B.crafting_table);
    L.set(0, 0, 2, B.furnace, 2);
    L.set(-1, 0, -2, B.torch);
    L.bed(-1, 4, 1, 0);
    L.chest(0, 4, 2, 'village_house', 2);
    L.set(1, 4, 2, B.torch);
    L.doorstep(3, 2, S.path);
  } },
  // A long family house with two beds and storage
  longhouse: { w: 5, d: 9, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 4, 8, S.found, S.floor);
    walls(L, S, 2, 4, 3);
    for (const lz of [-2, 0, 2]) L.fill(-2, 1, lz, -2, 1, lz, S.win === 0 ? 0 : S.win), L.fill(2, 1, lz, 2, 1, lz, S.win === 0 ? 0 : S.win);
    L.door(0, 0, -4, 2);
    roof(L, S, 2, 4, 3);
    L.bed(-1, 0, 2, 0);
    L.bed(1, 0, 2, 0);
    L.chest(-1, 0, 0, 'village_house', 1);
    L.chest(1, 0, 0, 'village_house', 3);
    L.set(-1, 0, -2, B.crafting_table);
    L.set(1, 0, -2, B.bookshelf);
    L.set(0, 0, 1, B.torch);
    L.doorstep(4, 2, S.path);
  } },
  // A small log hut with a flat roof, hay and a chest
  hut: { w: 5, d: 5, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 2, 6, S.found, S.floor);
    walls(L, S, 2, 2, 3, S.frame);
    L.fill(0, 0, -2, 0, 1, -2, 0);
    L.set(-2, 1, 0, S.win === 0 ? 0 : S.win); L.set(2, 1, 0, S.win === 0 ? 0 : S.win);
    L.fill(-2, 3, -2, 2, 3, 2, S.roof);
    for (let lz = -2; lz <= 2; lz++) for (let lx = -2; lx <= 2; lx++) if (lx === -2 || lx === 2 || lz === -2 || lz === 2) L.set(lx, 4, lz, S.frame);
    L.set(1, 0, 1, B.hay_bale);
    L.set(1, 1, 1, B.hay_bale);
    L.chest(-1, 0, 1, 'village_house', 2);
    L.set(-1, 0, -1, B.torch);
    L.bed(1, 0, -1, 1);
    L.doorstep(2, 2, S.path);
  } },
  // A house with a covered front porch
  porch: { w: 7, d: 7, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(3, 3, 9, S.found, S.floor);
    for (let ly = 0; ly < 4; ly++) for (let lz = -1; lz <= 3; lz++) for (let lx = -3; lx <= 3; lx++) {
      const ex = lx === -3 || lx === 3, ez = lz === -1 || lz === 3;
      if (ex || ez) L.set(lx, ly, lz, ex && ez ? S.frame : S.wall);
    }
    L.door(0, 0, -1, 2);
    L.set(-2, 1, -1, S.win === 0 ? 0 : S.win); L.set(2, 1, -1, S.win === 0 ? 0 : S.win);
    L.set(-3, 1, 1, S.win === 0 ? 0 : S.win); L.set(3, 1, 1, S.win === 0 ? 0 : S.win); L.set(0, 1, 3, S.win === 0 ? 0 : S.win);
    for (let lx = -3; lx <= 3; lx++) if (lx !== 0) L.set(lx, 0, -3, B.oak_fence);
    L.set(-3, 0, -2, B.oak_fence); L.set(3, 0, -2, B.oak_fence);
    for (const lx of [-3, 3]) L.fill(lx, 1, -3, lx, 3, -3, S.frame);
    roof(L, S, 3, 3, 4);
    L.bed(2, 0, 1, 0);
    L.chest(-2, 0, 2, 'village_house', 2);
    L.set(-2, 0, 0, B.crafting_table);
    L.set(0, 0, 2, B.furnace, 2);
    L.set(2, 0, 0, B.torch);
    L.set(-2, 0, -2, B.hay_bale);
    L.doorstep(3, 2, S.path);
  } },
  library: { w: 7, d: 9, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(3, 4, 10, S.found, S.floor);
    walls(L, S, 3, 4, 5);
    L.door(0, 0, -4, 2);
    windowsOn(L, S, 3, 4, 2);
    roof(L, S, 3, 4, 5);
    for (let lz = -2; lz <= 3; lz++) { L.fill(-2, 0, lz, -2, 1, lz, B.bookshelf); L.fill(2, 0, lz, 2, 1, lz, B.bookshelf); }
    L.fill(-1, 0, 3, 1, 1, 3, B.bookshelf);
    L.set(0, 0, 1, B.crafting_table);
    L.set(-1, 0, -3, B.torch); L.set(1, 0, -3, B.torch);
    L.doorstep(4, 2, S.path);
  } },
  blacksmith: { w: 7, d: 7, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(3, 3, 7, S.found, B.cobblestone);
    for (let ly = 0; ly < 4; ly++) for (let lz = -3; lz <= 3; lz++) for (let lx = -3; lx <= 3; lx++) {
      const edge = lx === -3 || lx === 3 || lz === 3;
      const corner = (lx === -3 || lx === 3) && (lz === -3 || lz === 3);
      if (corner) L.set(lx, ly, lz, S.frame);
      else if (edge) L.set(lx, ly, lz, ly === 0 ? B.cobblestone : B.stone_bricks);
    }
    L.fill(-3, 4, -3, 3, 4, 3, B.cobblestone);
    L.set(-1, 0, 2, B.furnace, 2); L.set(1, 0, 2, B.furnace, 2);
    L.chest(2, 0, 2, 'blacksmith', 2);
    L.set(-2, 0, 2, B.crafting_table);
    L.set(2, 0, -2, B.torch);
    L.set(-2, 0, -1, B.iron_block);
  } },
  church: { w: 5, d: 9, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 4, 13, S.found, S.floor);
    walls(L, S, 2, 4, 5, B.cobblestone);
    for (let ly = 5; ly < 10; ly++) for (let lz = 1; lz <= 4; lz++) for (let lx = -2; lx <= 2; lx++) {
      if (lx === -2 || lx === 2 || lz === 1 || lz === 4) L.set(lx, ly, lz, (ly === 7 && lx === 0) || (ly === 7 && lz === 1 && lx === 0) ? B.glass : B.cobblestone);
    }
    L.fill(-2, 5, -4, 2, 5, 0, B.cobblestone);
    L.fill(-2, 10, 1, 2, 10, 4, B.cobblestone);
    L.set(0, 11, 2, B.glowstone);
    L.door(0, 0, -4, 2);
    windowsOn(L, { ...S, win: B.glass }, 2, 4, 2);
    L.set(0, 0, 3, B.glowstone);
    L.doorstep(4, 2, S.path);
  } },
  butcher: { w: 5, d: 7, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 3, 8, S.found, S.floor);
    walls(L, S, 2, 3, 3);
    L.door(0, 0, -3, 2);
    windowsOn(L, S, 2, 3, 1);
    roof(L, S, 2, 3, 3);
    L.set(1, 0, 2, B.furnace, 2);
    L.chest(-1, 0, 2, 'village_house', 2);
    L.set(1, 0, -2, B.torch);
    L.doorstep(3, 2, S.path);
  } },
  farm: { w: 9, d: 7, build(ctx, part) {
    const L = local(ctx, part);
    L.prepare(4, 3, 3, B.dirt, null);
    for (let lz = -3; lz <= 3; lz++) for (let lx = -4; lx <= 4; lx++) {
      const edge = lx === -4 || lx === 4 || lz === -3 || lz === 3;
      if (edge) { L.set(lx, -1, lz, B.oak_log); continue; }
      if (lz === 0) { L.set(lx, -1, lz, B.water); continue; }
      L.set(lx, -1, lz, B.farmland);
      const [wx, wz] = L.w(lx, lz);
      const stage = Math.min(3, Math.floor(ctx.h(wx, part.y, wz, 3) * 4.4));
      L.set(lx, 0, lz, B.wheat_0 + stage);
    }
  } },
  pen: { w: 7, d: 7, build(ctx, part) {
    const L = local(ctx, part);
    L.prepare(3, 3, 3, B.dirt, B.grass);
    for (let lz = -3; lz <= 3; lz++) for (let lx = -3; lx <= 3; lx++) {
      if ((lx === -3 || lx === 3 || lz === -3 || lz === 3) && !(lz === -3 && lx === 0)) L.set(lx, 0, lz, B.oak_fence);
    }
    L.set(2, 0, 2, B.hay_bale);
  } },
  // (1.8) a market stall: four posts, a striped awning, a chest and a bale behind the counter
  stall: { w: 5, d: 5, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 2, 5, S.found, S.floor);
    for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) L.fill(lx, 0, lz, lx, 2, lz, B.oak_fence);
    const c = [B.red_wool, B.yellow_wool, B.blue_wool, B.lime_wool, B.orange_wool, B.cyan_wool][Math.floor(ctx.h(part.x, part.y, part.z, 43) * 6)];
    for (let lz = -2; lz <= 2; lz++) for (let lx = -2; lx <= 2; lx++) L.set(lx, 3, lz, (lx + 2) % 2 ? B.white_wool : c);
    L.set(-1, 0, -1, S.wall); L.set(1, 0, -1, S.wall);
    L.chest(-1, 0, 1, 'village_house', 2);
    L.set(1, 0, 1, B.hay_bale);
    L.set(1, 1, 1, B.torch);
    L.doorstep(2, 2, S.path);
  } },
  // (1.8) a lookout tower: a room at the bottom, stairs winding up the wall, and a walk round the top
  tower: { w: 7, d: 7, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(3, 3, 14, S.found, S.floor);
    walls(L, S, 3, 3, 9);
    L.door(0, 0, -3, 2);
    for (const ly of [2, 6]) { L.set(-3, ly, 0, S.win); L.set(3, ly, 0, S.win); L.set(0, ly, 3, S.win); }
    L.fill(-3, 9, -3, 3, 9, 3, S.floor);
    const R = windingStairs(L, 2, 0, 20, STYLE_SLAB[part.style]);
    for (let k = 13; k < 18; k++) L.set(R[k % 16][0], 9, R[k % 16][1], 0);   // (where the stairs come up, with room overhead to step)
    for (let lz = -3; lz <= 3; lz++) for (let lx = -3; lx <= 3; lx++) {
      if (Math.abs(lx) !== 3 && Math.abs(lz) !== 3) continue;
      const corner = Math.abs(lx) === 3 && Math.abs(lz) === 3;
      L.set(lx, 10, lz, corner ? S.frame : B.oak_fence);
      if (corner) L.set(lx, 11, lz, B.torch);
    }
    L.bed(-1, 0, 0, 0);
    L.set(0, 0, 1, B.torch);
    L.doorstep(3, 2, S.path);
  } },
  // (1.8) a flower garden
  garden: { w: 5, d: 5, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 2, 3, B.dirt, B.grass);
    const F = [B.dandelion, B.poppy, B.cornflower, B.allium, B.tulip, B.oxeye_daisy, B.sunflower, B.tall_grass];
    for (let lz = -2; lz <= 2; lz++) for (let lx = -2; lx <= 2; lx++) {
      const [wx, wz] = L.w(lx, lz);
      if (Math.abs(lx) === 2 || Math.abs(lz) === 2) { if (!(lz === -2 && lx === 0)) L.set(lx, 0, lz, STYLE_SLAB[part.style]); }
      else if (lx || lz) L.set(lx, 0, lz, F[Math.floor(ctx.h(wx, part.y, wz, 44) * F.length)]);
    }
    L.set(0, -1, 0, S.found); L.set(0, 0, 0, B.oak_fence); L.set(0, 1, 0, B.torch);
  } },
  lamp: { w: 1, d: 1, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(0, 0, 3, S.found, S.found);
    L.set(0, 0, 0, B.oak_fence); L.set(0, 1, 0, B.oak_fence); L.set(0, 2, 0, B.torch);
  } },
  well: { w: 5, d: 5, build(ctx, part) {
    const L = local(ctx, part), S = STYLE[part.style];
    L.prepare(2, 2, 5, S.found, S.found);
    for (let lz = -2; lz <= 2; lz++) for (let lx = -2; lx <= 2; lx++) {
      const rim = lx === -2 || lx === 2 || lz === -2 || lz === 2;
      if (rim) L.set(lx, 0, lz, S.found);
      else { L.set(lx, -1, lz, B.water); L.set(lx, -2, lz, B.water); L.set(lx, -3, lz, S.found); }
    }
    for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { L.set(lx, 1, lz, B.oak_fence); L.set(lx, 2, lz, B.oak_fence); }
    L.fill(-2, 3, -2, 2, 3, 2, S.found);
  } },
};

function buildRoad(ctx, part) {
  const S = STYLE[part.style];
  for (let x = part.minX; x <= part.maxX; x++) for (let z = part.minZ; z <= part.maxZ; z++) {
    if (!ctx.inside(x, z)) continue;
    const g = ctx.ground(x, z);
    if (g < SEA) { ctx.set(x, SEA, z, S.floor); continue; }
    ctx.set(x, g, z, S.path);
    for (let y = g + 1; y <= g + 6; y++) {
      const b = ctx.get(x, y, z);
      if (b > 0 && (BLOCKS[b].replaceable || BLOCKS[b].cutout || b === B.oak_log || b === B.spruce_log || b === B.birch_log || b === B.cactus || b === B.dandelion || b === B.poppy || b === B.pumpkin)) ctx.set(x, y, z, 0);
    }
  }
}

// Villages in land first seen from 1.7 on: the house of every villager with a trade holds its job block,
// and the buildings that had no bed get one. [x, y, z] inside each kind of building.
const JOB_SPOT = { small: [1, 0, -1], big: [2, 0, -1], tall: [-1, 0, 0], longhouse: [-1, 0, -1], hut: [-1, 0, 0], porch: [-2, 0, 1], library: [0, 0, 2], blacksmith: [0, 0, 2], church: [1, 0, 3], butcher: [0, 0, 2], farm: [-4, 0, -3],
  stall: [0, 0, 1], tower: [1, 0, 1] };
const EXTRA_BED = { library: [-1, 0, -3], blacksmith: [2, 0, -1], church: [-1, 0, 1], butcher: [-1, 0, -1], porch: [1, 0, 1] };   // (the porch house gets a spare one, for the farm hands)
function furnish(ctx, part) {
  const L = local(ctx, part);
  const spot = JOB_SPOT[part.kind], job = part.prof && JOB_BLOCKS[part.prof];
  if (spot && job) L.set(spot[0], spot[1], spot[2], job, 2);
  const bed = EXTRA_BED[part.kind];
  if (bed) L.bed(bed[0], bed[1], bed[2], 0);
  // (1.8) every smithy has an anvil, for putting the enchantments of books onto tools
  if (part.kind === 'blacksmith' && ctx.plan.gen >= NEW) L.set(-2, 0, 0, B.anvil, 1);
}

const HOUSE_KINDS = [['small', 15], ['big', 10], ['tall', 10], ['longhouse', 8], ['hut', 8], ['porch', 9], ['farm', 18], ['blacksmith', 6], ['library', 6], ['church', 4], ['butcher', 6], ['pen', 8]];
const HOUSE_KINDS4 = [...HOUSE_KINDS, ['stall', 8], ['tower', 3], ['garden', 5]];
const PROF_FOR = {
  stall: ['farmer', 'fletcher', 'butcher', 'shepherd', 'leatherworker', 'mason'],
  tower: ['fletcher', 'weaponsmith', 'armorer', 'cleric'],
  small: ['fletcher', 'shepherd', 'leatherworker', 'mason', 'nitwit'],
  big: ['farmer', 'shepherd', 'fletcher', 'librarian'],
  tall: ['librarian', 'cleric', 'mason', 'farmer'],
  longhouse: ['farmer', 'shepherd', 'nitwit', 'fletcher'],
  hut: ['farmer', 'leatherworker', 'shepherd'],
  porch: ['fletcher', 'mason', 'leatherworker', 'farmer'],
  farm: ['farmer'],
  blacksmith: ['armorer', 'weaponsmith', 'toolsmith'],
  library: ['librarian'],
  church: ['cleric'],
  butcher: ['butcher'],
};

function planVillage(world, plan, x, z, col, rng) {
  const style = plan.v4 ? VILLAGE_LANDS[col.biome] || 'plains'
    : col.biome === BIOME.DESERT ? 'desert' : col.biome === BIOME.SNOWY ? 'snowy' : col.biome === BIOME.TAIGA ? 'taiga' : 'plains';
  plan.style = style;
  const cy = plan.ground(x, z) + 1;
  if (cy - 1 < SEA + 1) return false;
  const occupied = [];
  const addBuilding = (kind, bx, bz, rot) => {
    const K = BUILDINGS[kind];
    const hw = K.w >> 1, hd = K.d >> 1;
    const box = bboxOf(bx, bz, hw, hd, rot, 1);
    if (occupied.some((o) => overlaps(o, box))) return null;
    const g = plan.ground(bx, bz);
    if (g < SEA + 1) return null;
    const corners = [[box.minX, box.minZ], [box.maxX, box.minZ], [box.minX, box.maxZ], [box.maxX, box.maxZ]].map(([a, b]) => plan.ground(a, b));
    if (Math.max(...corners) - Math.min(...corners) > 6) return null;
    const p = { ...box, x: bx, z: bz, y: g + 1, rot, style, kind, build: (ctx, pp) => { K.build(ctx, pp); if (ctx.plan.gen >= 3) furnish(ctx, pp); } };
    occupied.push(box);
    plan.add(p);
    // (the steps in front of a door reach a few blocks further out than the building itself)
    p.stamp = bboxOf(bx, bz, hw, hd, rot, 7);
    plan.minX = Math.min(plan.minX, p.stamp.minX); plan.maxX = Math.max(plan.maxX, p.stamp.maxX);
    plan.minZ = Math.min(plan.minZ, p.stamp.minZ); plan.maxZ = Math.max(plan.maxZ, p.stamp.maxZ);
    return p;
  };
  const well = addBuilding('well', x, z, 0);
  if (!well) return false;
  const pick = (list) => {
    const total = list.reduce((n, l) => n + l[1], 0);
    let v = rng() * total;
    return (list.find((l) => (v -= l[1]) < 0) || list[0])[0];
  };
  let houses = 0, vi = 0;
  const villager = (prof, vx, vy, vz) => plan.mobs.push({ type: 'villager', x: vx + 0.5, y: vy, z: vz + 0.5, prof, key: `${plan.key}:${vi++}` });
  // A road from (sx, sz) heading (dx, dz), lined with houses; main roads sprout side streets
  const road = (sx, sz, dx, dz, len, branches) => {
    const px = -dz, pz = dx; // perpendicular
    const x1 = sx + dx * len, z1 = sz + dz * len;
    const box = {
      minX: Math.min(sx, x1) - Math.abs(px), maxX: Math.max(sx, x1) + Math.abs(px),
      minZ: Math.min(sz, z1) - Math.abs(pz), maxZ: Math.max(sz, z1) + Math.abs(pz),
      style, build: buildRoad,
    };
    if (occupied.some((o) => overlaps(o, box))) return;
    plan.add(box);
    occupied.push(box);
    const sideStreets = [];
    for (let d = 5; d < len - 2; d += 8 + Math.floor(rng() * 3)) {
      for (const side of [-1, 1]) {
        // leave gaps where side streets branch off
        if (branches && sideStreets.length < 2 && d > 12 && rng() < 0.3) { sideStreets.push([d, side]); continue; }
        if (rng() < 0.08) continue;
        const kind = pick(plan.v4 ? HOUSE_KINDS4 : HOUSE_KINDS);
        const K = BUILDINGS[kind];
        const hd = K.d >> 1;
        const off = hd + 3;
        const bx = sx + dx * d + px * side * off, bz = sz + dz * d + pz * side * off;
        const rot = rotFor(-px * side, -pz * side);
        const p = addBuilding(kind, bx, bz, rot);
        if (!p) continue;
        houses++;
        if (kind === 'pen') {
          const animal = ['cow', 'sheep', 'pig', 'chicken'][Math.floor(rng() * 4)];
          for (let k = 0; k < 2 + Math.floor(rng() * 2); k++) plan.mobs.push({ type: animal, x: bx + 0.5 + (k - 1), y: p.y, z: bz + 0.5, key: `${plan.key}:a${vi++}` });
        } else if (kind !== 'garden') {
          const profs = PROF_FOR[kind];
          const [fx, fz] = rotVec(0, -1, rot);
          p.prof = profs[Math.floor(rng() * profs.length)];   // (its job block goes in this building)
          villager(p.prof, bx + fx * (hd + 2), p.y, bz + fz * (hd + 2));
        }
      }
    }
    for (let d = 6; d < len; d += 12) addBuilding('lamp', sx + dx * d + px * 2, sz + dz * d + pz * 2, 0);
    for (const [d, side] of sideStreets) {
      road(sx + dx * d + px * side * 2, sz + dz * d + pz * side * 2, px * side, pz * side, 16 + Math.floor(rng() * 12), false);
    }
  };
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) road(x + dx * 4, z + dz * 4, dx, dz, 30 + Math.floor(rng() * 26), true);
  villager('nitwit', x + 3, cy, z + 3);
  villager('farmer', x - 3, cy, z - 3);
  if (houses >= 4) plan.mobs.push({ type: 'iron_golem', x: x + 4.5, y: cy, z: z - 3.5, key: `${plan.key}:golem` });
  return true;
}

// ---------------------------------------------------------------- other structures
function planSingle(plan, x, z, y, hw, hd, rot, build, extra = {}) {
  plan.add({ ...bboxOf(x, z, hw, hd, rot, 2), x, z, y, rot, build, ...extra });
}

function buildPyramid(ctx, part) {
  const { x, z, y } = part;
  const mixed = (i) => (i % 5 === 3 ? B.orange_terracotta : B.sandstone);
  for (let dz = -10; dz <= 10; dz++) for (let dx = -10; dx <= 10; dx++) {
    const wx = x + dx, wz = z + dz;
    if (!ctx.inside(wx, wz)) continue;
    const g = ctx.ground(wx, wz);
    for (let yy = Math.max(Math.min(g, y - 1), y - 12); yy <= y - 1; yy++) ctx.set(wx, yy, wz, B.sandstone);
    for (let yy = y; yy <= y + 12; yy++) ctx.set(wx, yy, wz, 0);
    for (let k = 0; k <= 9; k++) {
      const s = 10 - k, m = Math.max(Math.abs(dx), Math.abs(dz));
      if (m > s) continue;
      const shell = m >= s - 1;
      if (shell || k >= 5) ctx.set(wx, y + k, wz, shell && k % 3 === 1 && m === s ? mixed(k + dx + dz) : B.sandstone);
    }
  }
  // decorated floor
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const m = Math.max(Math.abs(dx), Math.abs(dz));
    ctx.set(x + dx, y - 1, z + dz, m === 2 ? B.orange_terracotta : m === 1 ? B.sandstone : B.blue_terracotta);
  }
  // entrance through the front
  for (let dz = 6; dz <= 10; dz++) for (let dx = -1; dx <= 1; dx++) for (let k = 0; k <= 2; k++) ctx.set(x + dx, y + k, z + dz, 0);
  ctx.set(x - 2, y + 3, z + 9, B.chiseled_sandstone); ctx.set(x + 2, y + 3, z + 9, B.chiseled_sandstone);
  // corner towers
  for (const tx of [-8, 8]) {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) for (let k = 0; k <= 11; k++) {
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      ctx.set(x + tx + dx, y + k, z + 8 + dz, k === 9 || k === 10 ? (edge ? B.orange_terracotta : B.sandstone) : B.sandstone);
    }
    ctx.set(x + tx, y + 7, z + 10, B.chiseled_sandstone);
  }
  // hidden treasure chamber under the blue centre block
  const cy = y - 14;
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) for (let k = 0; k <= 4; k++) {
    const edge = Math.abs(dx) === 4 || Math.abs(dz) === 4 || k === 0 || k === 4;
    ctx.set(x + dx, cy + k, z + dz, edge ? B.sandstone : 0);
  }
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) ctx.set(x + dx, cy - 1, z + dz, B.tnt);
  for (let yy = cy + 4; yy <= y - 2; yy++) ctx.set(x, yy, z, 0);
  ctx.set(x, cy, z, B.blue_terracotta);
  ctx.chest(x + 3, cy + 1, z, 'pyramid', 1);
  ctx.chest(x - 3, cy + 1, z, 'pyramid', 3);
  ctx.chest(x, cy + 1, z + 3, 'pyramid', 2);
  ctx.chest(x, cy + 1, z - 3, 'pyramid', 0);
  // (pyramids made from 1.8 on) the trap is set: a pressure plate in the middle of the floor, over the TNT
  if (ctx.plan.gen >= NEW) ctx.set(x, cy + 1, z, B.stone_pressure_plate);
}

function buildJungleTemple(ctx, part) {
  const L = local(ctx, part);
  const stone = (lx, ly, lz) => { const [wx, wz] = L.w(lx, lz); return ctx.h(wx, part.y + ly, wz, 7) < 0.45 ? B.mossy_cobblestone : B.cobblestone; };
  L.prepare(5, 6, 11, B.cobblestone, B.mossy_stone_bricks);
  for (let ly = 0; ly <= 7; ly++) for (let lz = -6; lz <= 6; lz++) for (let lx = -5; lx <= 5; lx++) {
    const edge = lx === -5 || lx === 5 || lz === -6 || lz === 6;
    if (edge || ly === 7) L.set(lx, ly, lz, stone(lx, ly, lz));
  }
  for (let lz = -5; lz <= 5; lz++) for (let lx = -4; lx <= 4; lx++) L.set(lx, 8, lz, stone(lx, 8, lz));
  for (let lz = -4; lz <= 4; lz++) for (let lx = -3; lx <= 3; lx++) L.set(lx, 9, lz, stone(lx, 9, lz));
  // upper floor over the back half, reached by steps
  for (let lz = 0; lz <= 5; lz++) for (let lx = -4; lx <= 4; lx++) L.set(lx, 3, lz, B.mossy_stone_bricks);
  for (let k = 0; k <= 3; k++) L.fill(4, 0, -3 + k, 4, k, -3 + k, B.cobblestone);
  L.fill(0, 0, -6, 0, 2, -6, 0);
  L.set(-3, 1, -6, 0); L.set(3, 1, -6, 0); L.set(-5, 5, 0, 0); L.set(5, 5, 0, 0);
  for (const lx of [-2, 2]) L.fill(lx, 0, -3, lx, 2, -3, B.mossy_stone_bricks);
  L.chest(0, 4, 5, 'jungle_temple', 2);
  // basement room with a second chest, dropped into through a hole
  L.fill(-2, -5, 1, 2, -2, 5, B.cobblestone);
  L.fill(-1, -4, 2, 1, -2, 4, 0);
  L.set(0, -1, 3, 0);
  L.chest(0, -4, 4, 'jungle_temple', 2);
  L.set(-1, -4, 2, B.torch);
}

function buildWitchHut(ctx, part) {
  const L = local(ctx, part);
  for (let lz = -4; lz <= 4; lz++) for (let lx = -3; lx <= 3; lx++) {
    const [wx, wz] = L.w(lx, lz);
    if (!ctx.inside(wx, wz)) continue;
    for (let ly = 0; ly <= 7; ly++) ctx.set(wx, part.y + ly, wz, 0);
  }
  for (const [lx, lz] of [[-3, -4], [3, -4], [-3, 4], [3, 4], [-3, 0], [3, 0]]) {
    const [wx, wz] = L.w(lx, lz);
    const g = Math.min(ctx.ground(wx, wz), SEA - 1);
    for (let yy = g; yy < part.y; yy++) ctx.set(wx, yy, wz, B.oak_log);
  }
  L.fill(-3, 0, -4, 3, 0, 4, B.spruce_planks);
  for (let ly = 1; ly <= 3; ly++) for (let lz = -2; lz <= 4; lz++) for (let lx = -3; lx <= 3; lx++) {
    if (lx === -3 || lx === 3 || lz === -2 || lz === 4) L.set(lx, ly, lz, (lx === -3 || lx === 3) && (lz === -2 || lz === 4) ? B.oak_log : B.spruce_planks);
  }
  L.fill(0, 1, -2, 0, 2, -2, 0);
  L.set(-3, 2, 1, B.glass); L.set(3, 2, 1, B.glass); L.set(0, 2, 4, B.glass);
  L.fill(-4, 4, -3, 4, 4, 5, B.spruce_planks);
  L.fill(-3, 5, -2, 3, 5, 4, B.spruce_planks);
  L.set(2, 1, 3, B.crafting_table);
  L.set(-2, 1, 3, B.pumpkin);
  L.set(-2, 1, 0, B.torch);
  for (const lx of [-1, 1]) L.set(lx, 1, -4, B.oak_fence);
}

function buildIgloo(ctx, part) {
  const L = local(ctx, part);
  L.prepare(4, 6, 6, B.snow, B.snow);
  for (let ly = 0; ly <= 4; ly++) for (let lz = -4; lz <= 4; lz++) for (let lx = -4; lx <= 4; lx++) {
    const d = Math.sqrt(lx * lx + lz * lz + ly * ly * 1.3);
    if (d <= 3.9 && d > 2.9) L.set(lx, ly, lz, B.snow);
  }
  for (let lz = -2; lz <= 2; lz++) for (let lx = -2; lx <= 2; lx++) if (lx * lx + lz * lz <= 6) L.set(lx, -1, lz, B.white_wool);
  for (let lz = -6; lz <= -3; lz++) {
    L.set(-1, 0, lz, B.snow); L.set(1, 0, lz, B.snow); L.set(-1, 1, lz, B.snow); L.set(1, 1, lz, B.snow);
    L.set(0, 2, lz, B.snow); L.set(0, 0, lz, 0); L.set(0, 1, lz, 0);
  }
  L.set(-3, 1, 0, B.ice); L.set(3, 1, 0, B.ice);
  L.bed(-1, 0, 1, 1);
  L.set(1, 0, 1, B.crafting_table);
  L.set(2, 0, -1, B.furnace, 1);
  L.set(1, 0, -2, B.torch);
  L.chest(-2, 0, -1, 'igloo', 3);
}

function buildOutpost(ctx, part) {
  const L = local(ctx, part);
  L.prepare(4, 4, 22, B.cobblestone, B.cobblestone);
  for (let ly = 0; ly <= 13; ly++) for (let lz = -3; lz <= 3; lz++) for (let lx = -3; lx <= 3; lx++) {
    const edgeX = lx === -3 || lx === 3, edgeZ = lz === -3 || lz === 3;
    if (!edgeX && !edgeZ) continue;
    let id = edgeX && edgeZ ? B.dark_oak_log : ly <= 1 ? B.cobblestone : B.dark_oak_planks;
    if ((ly === 2 || ly === 7 || ly === 12) && (lx === 0 || lz === 0) && !(ly === 2 && lz === -3 && lx === 0)) id = 0;
    L.set(lx, ly, lz, id);
  }
  L.fill(0, 0, -3, 0, 1, -3, 0);
  for (const ly of [4, 9]) L.fill(-2, ly, -2, 2, ly, 2, B.dark_oak_planks);
  L.fill(-4, 14, -4, 4, 14, 4, B.dark_oak_planks);
  for (let lz = -4; lz <= 4; lz++) for (let lx = -4; lx <= 4; lx++) {
    if (lx === -4 || lx === 4 || lz === -4 || lz === 4) L.set(lx, 15, lz, B.oak_fence);
  }
  for (const [lx, lz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) L.fill(lx, 16, lz, lx, 17, lz, B.oak_fence);
  L.fill(-4, 18, -4, 4, 18, 4, B.dark_oak_planks);
  L.fill(-3, 19, -3, 3, 19, 3, B.dark_oak_planks);
  L.chest(0, 15, 0, 'outpost', 2);
  L.set(2, 15, 2, B.torch);
}

// The cells against the inside of a square wall, once round, starting beside the middle of the front
function ring(r) {
  const out = [];
  for (let x = 1; x <= r; x++) out.push([x, -r]);
  for (let z = -r + 1; z <= r; z++) out.push([r, z]);
  for (let x = r - 1; x >= -r; x--) out.push([x, r]);
  for (let z = r - 1; z >= -r; z--) out.push([-r, z]);
  for (let x = -r + 1; x <= 0; x++) out.push([x, -r]);
  return out;
}
// Stairs of half blocks that wind up the inside of a tower: `steps` half-block steps, each one walked up
// without a jump, starting from the floor at y0
function windingStairs(L, r, y0, steps, slab) {
  const R = ring(r);
  for (let k = 0; k < steps; k++) L.set(R[k % R.length][0], y0 + (k >> 1), R[k % R.length][1], slab, k & 1);
  return R;
}

// Outposts from 1.8 on: a watchtower with one staircase that winds all the way to the lookout
function buildOutpostTower(ctx, part) {
  const L = local(ctx, part);
  const stone = (lx, ly, lz) => { const [wx, wz] = L.w(lx, lz); return ctx.h(wx, part.y + ly, wz, 71) < 0.3 ? B.mossy_cobblestone : B.cobblestone; };
  L.prepare(5, 5, 23, B.cobblestone, B.cobblestone);
  for (let ly = 0; ly <= 15; ly++) for (let lz = -4; lz <= 4; lz++) for (let lx = -4; lx <= 4; lx++) {
    const ex = Math.abs(lx) === 4, ez = Math.abs(lz) === 4;
    if (!ex && !ez) continue;
    let id = ex && ez ? B.dark_oak_log : ly <= 2 ? stone(lx, ly, lz) : ly % 5 === 0 ? B.dark_oak_log : B.birch_planks;
    if (!(ex && ez) && (ly === 7 || ly === 8 || ly === 12 || ly === 13) && (lx === 0 || lz === 0)) id = 0;   // narrow windows
    L.set(lx, ly, lz, id);
  }
  L.fill(0, 0, -4, 0, 1, -4, 0);   // the way in
  // two floors with the stairs going round them, and the lookout on top
  for (const ly of [5, 10]) L.fill(-2, ly, -2, 2, ly, 2, B.dark_oak_planks);
  L.fill(-5, 15, -5, 5, 15, 5, B.dark_oak_planks);
  const R = windingStairs(L, 3, 0, 32, B.dark_oak_slab);
  for (let k = 24; k < 30; k++) L.set(R[k % 24][0], 15, R[k % 24][1], 0);   // (the stairs come up through the lookout's floor)
  L.set(-2, 0, 2, B.torch); L.set(2, 6, 2, B.torch); L.set(-2, 11, -2, B.torch);
  L.chest(-2, 6, 2, 'outpost', 2);
  L.set(-2, 11, 2, B.crafting_table); L.set(2, 11, 2, B.hay_bale); L.set(2, 11, 1, B.hay_bale);
  // the lookout: a rail, four posts and a roof
  for (let lz = -5; lz <= 5; lz++) for (let lx = -5; lx <= 5; lx++) {
    if (Math.abs(lx) === 5 || Math.abs(lz) === 5) L.set(lx, 16, lz, B.oak_fence);
  }
  for (const [lx, lz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) L.fill(lx, 17, lz, lx, 18, lz, B.oak_fence);
  L.fill(-5, 19, -5, 5, 19, 5, B.dark_oak_slab);
  L.fill(-3, 19, -3, 3, 19, 3, B.dark_oak_planks);
  L.fill(-2, 20, -2, 2, 20, 2, B.dark_oak_slab);
  L.chest(-1, 16, 2, 'outpost_top', 2);
  L.set(-3, 16, -3, B.torch); L.set(3, 16, 3, B.torch);
  L.doorstep(4, 2, B.dirt_path);
}
function buildOutpostTent(ctx, part) {
  const L = local(ctx, part);
  L.prepare(2, 2, 4, B.dirt, null);
  for (let lz = -2; lz <= 2; lz++) {
    L.set(-2, 0, lz, B.white_wool); L.set(2, 0, lz, B.white_wool);
    L.set(-1, 1, lz, B.white_wool); L.set(1, 1, lz, B.white_wool);
    L.set(0, 2, lz, part.cap || B.gray_wool);
  }
  L.fill(-1, 0, 2, 1, 0, 2, B.white_wool); L.set(0, 1, 2, B.white_wool);
  if (part.chest) L.chest(0, 0, 1, 'outpost', 2); else { L.set(0, 0, 1, B.crafting_table); L.set(-1, 0, 0, B.hay_bale); }
}
// A cage of fences with an iron golem shut inside: let it out and it turns on its captors
function buildOutpostCage(ctx, part) {
  const L = local(ctx, part);
  L.prepare(2, 2, 5, B.cobblestone, B.cobblestone);
  for (let lz = -2; lz <= 2; lz++) for (let lx = -2; lx <= 2; lx++) {
    if (Math.abs(lx) === 2 || Math.abs(lz) === 2) L.fill(lx, 0, lz, lx, 2, lz, B.oak_fence);
  }
  L.fill(-2, 3, -2, 2, 3, 2, B.dark_oak_slab);
}

function buildMansion(ctx, part) {
  const L = local(ctx, part);
  const HW = 14, HD = 10;
  L.prepare(HW, HD, 16, B.cobblestone, B.dark_oak_planks);
  for (const base of [0, 6]) {
    for (let ly = base; ly < base + 6; ly++) for (let lz = -HD; lz <= HD; lz++) for (let lx = -HW; lx <= HW; lx++) {
      const edgeX = lx === -HW || lx === HW, edgeZ = lz === -HD || lz === HD;
      if (!edgeX && !edgeZ) continue;
      const pillar = (edgeX && edgeZ) || (edgeZ && (lx + HW) % 6 === 0) || (edgeX && (lz + HD) % 5 === 0);
      let id = pillar ? B.dark_oak_log : ly === 0 ? B.cobblestone : B.dark_oak_planks;
      const r = ly - base;
      if (!pillar && (r === 2 || r === 3) && ((edgeZ && (lx + HW) % 6 >= 2 && (lx + HW) % 6 <= 3) || (edgeX && (lz + HD) % 5 === 2))) id = B.glass;
      L.set(lx, ly, lz, id);
    }
    // central hallway with a red runner, rooms on both sides
    const floorY = base === 0 ? -1 : 6;
    if (base === 6) L.fill(-HW + 1, 6, -HD + 1, HW - 1, 6, HD - 1, B.dark_oak_planks);
    for (let lx = -HW + 1; lx <= HW - 1; lx++) L.set(lx, floorY, 0, B.red_wool);
    const r0 = base === 0 ? 0 : 7;
    for (let ly = r0; ly < r0 + 5; ly++) for (let lx = -HW + 1; lx <= HW - 1; lx++) {
      for (const lz of [-2, 2]) {
        const doorGap = (lx + HW) % 6 === 3 && ly < r0 + 2;
        L.set(lx, ly, lz, doorGap ? 0 : B.birch_planks);
      }
    }
    for (let room = 0; room < 4; room++) {
      const rx0 = -HW + 1 + room * 7, rx1 = Math.min(HW - 1, rx0 + 5);
      if (room > 0) for (let ly = r0; ly < r0 + 5; ly++) { L.fill(rx0 - 1, ly, -HD + 1, rx0 - 1, ly, -3, B.birch_planks); L.fill(rx0 - 1, ly, 3, rx0 - 1, ly, HD - 1, B.birch_planks); }
      for (const side of [-1, 1]) {
        const lzA = side < 0 ? -HD + 1 : 3, lzB = side < 0 ? -3 : HD - 1;
        const [wx, wz] = L.w(rx0, lzA);
        const kind = Math.floor(ctx.h(wx, part.y + base, wz, 11) * 5);
        const cx = rx0 + 2, cz = side < 0 ? lzA + 1 : lzB - 1;
        if (kind === 0) { L.bed(cx, r0, cz, side < 0 ? 2 : 0); L.chest(cx + 2, r0, cz, 'mansion', side < 0 ? 0 : 2); }
        else if (kind === 1) { for (let lx = rx0; lx <= rx1; lx++) L.fill(lx, r0, side < 0 ? lzA : lzB, lx, r0 + 1, side < 0 ? lzA : lzB, B.bookshelf); L.set(cx, r0, side < 0 ? lzA + 3 : lzB - 3, B.crafting_table); }
        else if (kind === 2) { L.chest(cx, r0, cz, 'mansion', side < 0 ? 0 : 2); L.set(cx + 1, r0, cz, B.hay_bale); L.set(cx - 1, r0, cz, B.hay_bale); }
        else if (kind === 3) { L.fill(cx - 1, r0, cz, cx + 1, r0, cz, B.dark_oak_planks); L.set(cx, r0 + 1, cz, B.torch); }
        else { for (let lz = Math.min(lzA, lzB); lz <= Math.max(lzA, lzB); lz++) for (let lx = rx0; lx <= rx1; lx++) L.set(lx, r0 - 1, lz, B.white_wool); }
      }
      L.set(rx0 + 1, r0, 1, B.torch);
    }
  }
  // stairs up the hallway to the upper floor
  for (let k = 0; k <= 6; k++) {
    L.fill(HW - 8 + k, 0, 0, HW - 8 + k, k, 0, B.dark_oak_planks);
    if (k >= 3) L.set(HW - 8 + k, 6, 0, 0);
  }
  L.door(0, 0, -HD, 2);
  L.set(-1, 0, -HD - 1, B.torch); L.set(1, 0, -HD - 1, B.torch);
  // roof
  L.fill(-HW, 12, -HD, HW, 12, HD, B.dark_oak_planks);
  L.fill(-HW + 1, 13, -HD + 1, HW - 1, 13, HD - 1, B.dark_oak_planks);
  L.fill(-HW + 3, 14, -HD + 3, HW - 3, 14, HD - 3, B.dark_oak_planks);
}

function buildRuinedPortal(ctx, part) {
  const L = local(ctx, part);
  for (let lz = -5; lz <= 5; lz++) for (let lx = -5; lx <= 5; lx++) {
    const d = Math.hypot(lx, lz);
    const [wx, wz] = L.w(lx, lz);
    if (!ctx.inside(wx, wz)) continue;
    const g = ctx.ground(wx, wz);
    if (ctx.h(wx, 0, wz, 21) < (1 - d / 5.5) * 0.85) ctx.set(wx, g, wz, ctx.h(wx, 1, wz, 22) < 0.12 ? B.obsidian : B.netherrack);
  }
  L.prepare(2, 1, 6, B.netherrack, B.netherrack);
  for (let ly = 0; ly <= 4; ly++) for (let lx = -2; lx <= 1; lx++) {
    const frame = lx === -2 || lx === 1 || ly === 0 || ly === 4;
    if (!frame) continue;
    const [wx, wz] = L.w(lx, 0);
    const missing = ctx.h(wx, part.y + ly, wz, 23) < 0.28;
    L.set(lx, ly, 0, missing ? 0 : B.obsidian);
  }
  L.set(-1, 0, 1, B.gold_block);
  L.set(3, 0, 1, B.obsidian); L.set(-4, 0, -1, B.obsidian);
  L.chest(2, 0, -1, 'ruined_portal', 2);
}

function buildWell(ctx, part) {
  const L = local(ctx, part);
  L.prepare(2, 2, 4, B.sandstone, B.sandstone);
  L.set(0, -1, 0, B.water); L.set(0, -2, 0, B.water); L.set(0, -3, 0, B.sandstone);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) L.fill(lx, 0, lz, lx, 1, lz, B.sandstone);
  L.fill(-1, 2, -1, 1, 2, 1, B.sandstone);
  for (const [lx, lz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) L.set(lx, 0, lz, B.sandstone);
}

function buildShipwreck(ctx, part) {
  const L = local(ctx, part);
  const fillWith = (ly) => (part.y + ly <= SEA ? B.water : 0);
  for (let lx = -8; lx <= 8; lx++) {
    const taper = Math.abs(lx) >= 6 ? 1 : 0;
    const hw = 2 - taper;
    for (let ly = 0; ly <= 7; ly++) for (let lz = -3; lz <= 3; lz++) L.set(lx, ly, lz, fillWith(ly));
    if (Math.abs(lx) <= 7) L.set(lx, 0, 0, B.spruce_log);
    for (let lz = -hw + 1; lz <= hw - 1; lz++) L.set(lx, 1, lz, B.oak_planks);
    for (let ly = 1; ly <= 3; ly++) { L.set(lx, ly, -hw, B.spruce_planks); L.set(lx, ly, hw, B.spruce_planks); }
    if (lx >= -5 && lx <= 6) for (let lz = -hw + 1; lz <= hw - 1; lz++) {
      const [wx, wz] = L.w(lx, lz);
      if (ctx.h(wx, part.y + 3, wz, 31) > 0.25) L.set(lx, 3, lz, B.oak_planks);
    }
  }
  for (let ly = 4; ly <= 5; ly++) for (let lz = -2; lz <= 2; lz++) for (let lx = -8; lx <= -5; lx++) {
    if (lx === -8 || lx === -5 || lz === -2 || lz === 2) L.set(lx, ly, lz, B.spruce_planks);
  }
  L.fill(-8, 3, -1, -6, 3, 1, B.spruce_planks);
  L.set(-5, 4, 0, fillWith(4)); L.set(-5, 5, 0, fillWith(5));
  L.fill(-8, 6, -2, -5, 6, 2, B.spruce_planks);
  for (let ly = 1; ly <= 10; ly++) L.set(2, ly, 0, B.spruce_log);
  L.fill(2, 8, -2, 2, 8, 2, B.spruce_planks);
  L.chest(5, 2, 0, 'shipwreck_supply', 3);
  L.chest(-7, 4, 0, 'shipwreck_treasure', 3);
}

// ---------------------------------------------------------------- underground (1.8)
const SPAWN_ZOMBIE = 2, SPAWN_SKELETON = 3, SPAWN_SPIDER = 4, SPAWN_CAVE_SPIDER = 5;   // (a spawner's meta: see SPAWNER_TYPES)

// A dungeon: a small room of cobblestone and moss with a monster spawner in the middle and a chest or two
function buildDungeon(ctx, part) {
  const { x, y, z, hw, hd } = part;
  const stone = (xx, yy, zz) => (ctx.h(xx, yy, zz, 81) < (yy === y ? 0.6 : 0.3) ? B.mossy_cobblestone : B.cobblestone);
  for (let zz = z - hd; zz <= z + hd; zz++) for (let xx = x - hw; xx <= x + hw; xx++) {
    if (!ctx.inside(xx, zz)) continue;
    const edge = Math.abs(xx - x) === hw || Math.abs(zz - z) === hd;
    for (let k = 0; k <= 5; k++) {
      const shell = edge || k === 0 || k === 5;
      // (walls stand only where there was rock: where a cave runs past, the room is open to it)
      if (shell && k > 0 && k < 5 && ctx.get(xx, y + k, zz) === 0) continue;
      ctx.set(xx, y + k, zz, shell ? stone(xx, y + k, zz) : 0);
    }
  }
  for (const [dx, dz] of part.doors) for (let k = 1; k <= 2; k++) ctx.set(x + dx, y + k, z + dz, 0);
  ctx.set(x, y + 1, z, B.spawner, part.spawn);
  for (const [dx, dz, f] of part.chests) ctx.chest(x + dx, y + 1, z + dz, 'dungeon', f);
}

// What a mineshaft's diggers were after: ore in the walls, more of it than anywhere else
const SHAFT_ORES = [
  ['coal_ore', 'deepslate_coal_ore', 26], ['iron_ore', 'deepslate_iron_ore', 26], ['copper_ore', 'deepslate_copper_ore', 10], ['gold_ore', 'deepslate_gold_ore', 11],
  ['redstone_ore', 'deepslate_redstone_ore', 12], ['lapis_ore', 'deepslate_lapis_ore', 9], ['diamond_ore', 'deepslate_diamond_ore', 6],
];
function shaftVein(ctx, x, y, z) {
  let pick = ctx.h(x, y, z, 91) * 100;
  let ore = SHAFT_ORES.find((o) => (pick -= o[2]) < 0) || SHAFT_ORES[0];
  if (ore[0] === 'diamond_ore' && y > 20) ore = SHAFT_ORES[1];   // (diamonds only down deep, as everywhere)
  const n = 3 + Math.floor(ctx.h(x, y, z, 92) * 5);
  for (let i = 0; i < n; i++) {
    const cur = ctx.get(x, y, z);
    if (cur === B.stone || cur === B.granite || cur === B.diorite || cur === B.andesite) ctx.set(x, y, z, B[ore[0]]);
    else if (cur === B.deepslate || cur === B.tuff) ctx.set(x, y, z, B[ore[1]]);
    const d = Math.floor(ctx.h(x + i * 7, y - i * 3, z + i * 5, 93) * 6);
    if (d === 0) x++; else if (d === 1) x--; else if (d === 2) z++; else if (d === 3) z--; else if (d === 4) y++; else y--;
  }
}

// One straight gallery of a mineshaft: three wide and three high, with timber props, cobwebs, the odd chest
// left behind, and ore showing in the walls
function buildGallery(ctx, part) {
  const { sx, sz, dx, dz, len, y } = part;
  const px = -dz, pz = dx;
  for (let t = 0; t <= len; t++) {
    const cx = sx + dx * t, cz = sz + dz * t;
    for (let w = -1; w <= 1; w++) {
      const xx = cx + px * w, zz = cz + pz * w;
      if (!ctx.inside(xx, zz)) continue;
      for (let k = 0; k <= 2; k++) { const cur = ctx.get(xx, y + k, zz); if (cur !== B.chest && cur !== B.spawner && cur !== B.oak_fence) ctx.set(xx, y + k, zz, 0); }
      // a floor of planks over a drop or a pool
      const below = ctx.get(xx, y - 1, zz);
      if (below === 0 || below === B.water || below === B.lava) ctx.set(xx, y - 1, zz, B.oak_planks);
      const r = ctx.h(xx, y, zz, 94);
      if (r < 0.035 && ctx.get(xx, y + 3, zz) > 0) ctx.set(xx, y + 2, zz, B.cobweb);
    }
    if (t % 4 === 2 && t < len) {
      // a prop: two posts and a beam
      for (const w of [-1, 1]) { ctx.set(cx + px * w, y, cz + pz * w, B.oak_fence); ctx.set(cx + px * w, y + 1, cz + pz * w, B.oak_fence); }
      for (let w = -1; w <= 1; w++) ctx.set(cx + px * w, y + 2, cz + pz * w, B.oak_planks);
      if (ctx.h(cx, y, cz, 95) < 0.14) ctx.set(cx, y + 1, cz, B.torch);   // (still burning, somehow)
    } else if (t > 2 && t < len - 1 && t % 4 !== 2) {
      if (ctx.h(cx, y, cz, 96) < 0.022) {
        const w = ctx.h(cx, y, cz, 97) < 0.5 ? -1 : 1;
        ctx.chest(cx + px * w, y, cz + pz * w, 'mineshaft', DIRV.findIndex((v) => v[0] === -px * w && v[1] === -pz * w));
      }
    }
    // ore in the walls, the roof and the floor
    for (const [w, k] of [[-2, 0], [2, 0], [-2, 1], [2, 1], [0, 3], [1, -1], [-1, 3]]) {
      const xx = cx + px * w, zz = cz + pz * w;
      if (ctx.h(xx, y + k, zz, 98) < 0.05) shaftVein(ctx, xx, y + k, zz);
    }
  }
  if (part.spawner >= 0) {
    const cx = sx + dx * part.spawner, cz = sz + dz * part.spawner;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let k = 0; k <= 2; k++) {
      if ((a || b || k) && ctx.h(cx + a, y + k, cz + b, 99) < 0.6) ctx.set(cx + a, y + k, cz + b, B.cobweb);
    }
    ctx.set(cx, y, cz, B.spawner, SPAWN_CAVE_SPIDER);
  }
}
// The room the galleries start from
function buildShaftHub(ctx, part) {
  const { x, y, z } = part;
  for (let zz = z - 4; zz <= z + 4; zz++) for (let xx = x - 4; xx <= x + 4; xx++) {
    if (!ctx.inside(xx, zz)) continue;
    const corner = Math.abs(xx - x) === 4 && Math.abs(zz - z) === 4;
    for (let k = 0; k <= 5; k++) ctx.set(xx, y + k, zz, corner && k < 5 ? B.oak_log : 0);
    ctx.set(xx, y - 1, zz, ctx.h(xx, y, zz, 90) < 0.5 ? B.dirt : B.gravel);
    if (Math.abs(xx - x) === 4 || Math.abs(zz - z) === 4) ctx.set(xx, y + 5, zz, B.oak_planks);
  }
  ctx.set(x - 3, y, z - 3, B.torch); ctx.set(x + 3, y, z + 3, B.torch);
  ctx.set(x + 3, y, z - 3, B.crafting_table);
  ctx.chest(x - 3, y, z + 3, 'mineshaft', 2);
}

function planMineshaft(world, plan, x, z, col, rng) {
  const y = 12 + Math.floor(rng() * 26);
  if (col.h < y + 20) return false;
  plan.add({ minX: x - 5, maxX: x + 5, minZ: z - 5, maxZ: z + 5, x, y, z, under: true, build: buildShaftHub });
  let count = 0;
  const grow = (sx, sz, dx, dz, depth) => {
    if (depth > 6 || count >= 44) return;
    const len = 10 + Math.floor(rng() * 4) * 4;
    const ex = sx + dx * len, ez = sz + dz * len;
    if (Math.abs(ex - x) > 66 || Math.abs(ez - z) > 66) return;
    // (never out through a hillside, or under the sea bed)
    if (plan.ground(ex, ez) < y + 12 || plan.ground(sx + dx * (len >> 1), sz + dz * (len >> 1)) < y + 12) return;
    count++;
    plan.add({
      minX: Math.min(sx, ex) - 5, maxX: Math.max(sx, ex) + 5, minZ: Math.min(sz, ez) - 5, maxZ: Math.max(sz, ez) + 5,
      sx, sz, dx, dz, len, y, under: true, spawner: rng() < 0.09 ? 4 + Math.floor(rng() * (len - 8)) : -1, build: buildGallery,
    });
    for (const turn of [0, 1, -1]) {
      if (rng() >= (turn === 0 ? 0.78 : 0.44)) continue;
      const [ndx, ndz] = turn === 0 ? [dx, dz] : turn === 1 ? [-dz, dx] : [dz, -dx];
      grow(ex, ez, ndx, ndz, depth + 1);
    }
  };
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) grow(x + dx * 5, z + dz * 5, dx, dz, 0);
  return count >= 3;
}

// Treasure buried under a beach: a chest two blocks down, with nothing above it to show where
function buildBuriedTreasure(ctx, part) {
  const { x, y, z } = part;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    ctx.set(x + dx, y - 1, z + dz, B.sandstone);
    if (dx || dz) { if (ctx.get(x + dx, y, z + dz) === 0) ctx.set(x + dx, y, z + dz, B.sand); }
  }
  for (let k = 1; k <= 2; k++) if (ctx.get(x, y + k, z) === 0 || ctx.get(x, y + k, z) === B.water) ctx.set(x, y + k, z, B.sand);
  ctx.chest(x, y, z, 'buried_treasure', 0);
}

// ---------------------------------------------------------------- the Nether
// A fortress: bridges of nether brick over the lava, a cinder spawner platform, a nether wart garden, chest rooms
function buildFortress(ctx, part) {
  const { x, z, y } = part;
  const N = B.nether_bricks, F = B.nether_brick_fence;
  const arm = 34;
  const deck = (x0, z0, x1, z1) => {
    for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) {
      if (!ctx.inside(xx, zz)) continue;
      ctx.set(xx, y, zz, N);
      for (let k = 1; k <= 5; k++) ctx.set(xx, y + k, zz, 0);
    }
  };
  const rails = (x0, z0, x1, z1) => {
    for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) {
      const edge = xx === x0 || xx === x1 || zz === z0 || zz === z1;
      if (edge && ctx.inside(xx, zz)) ctx.set(xx, y + 1, zz, F);
    }
  };
  const pillar = (px, pz) => {
    if (!ctx.inside(px, pz)) return;
    for (let yy = y - 1; yy > NETHER_LAVA - 6; yy--) {
      const cur = ctx.get(px, yy, pz);
      if (cur !== 0 && cur !== B.lava && yy < y - 2) break;
      ctx.set(px, yy, pz, N);
    }
  };
  // crossing and four bridges
  deck(x - 4, z - 4, x + 4, z + 4);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x0 = dx ? Math.min(x + 5 * dx, x + arm * dx) : x - 2, x1 = dx ? Math.max(x + 5 * dx, x + arm * dx) : x + 2;
    const z0 = dz ? Math.min(z + 5 * dz, z + arm * dz) : z - 2, z1 = dz ? Math.max(z + 5 * dz, z + arm * dz) : z + 2;
    deck(x0, z0, x1, z1);
    rails(x0, z0, x1, z1);
    for (let k = 5; k <= arm; k += 6) { pillar(x + k * dx + (dz ? -2 : 0), z + k * dz + (dx ? -2 : 0)); pillar(x + k * dx + (dz ? 2 : 0), z + k * dz + (dx ? 2 : 0)); }
  }
  for (const [px, pz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) { pillar(x + px, z + pz); for (let k = 1; k <= 3; k++) ctx.set(x + px, y + k, z + pz, N); }
  // room at each end
  const room = (cx, cz, kind) => {
    for (let zz = cz - 5; zz <= cz + 5; zz++) for (let xx = cx - 5; xx <= cx + 5; xx++) {
      if (!ctx.inside(xx, zz)) continue;
      const edge = Math.abs(xx - cx) === 5 || Math.abs(zz - cz) === 5;
      ctx.set(xx, y, zz, N);
      for (let k = 1; k <= 6; k++) ctx.set(xx, y + k, zz, edge ? (k === 3 && (xx + zz) % 3 === 0 ? F : N) : 0);
      ctx.set(xx, y + 7, zz, N);
      pillar(xx, zz);
    }
    // doorways towards the crossing
    for (let k = 1; k <= 3; k++) for (let w = -1; w <= 1; w++) {
      const dx = Math.sign(x - cx), dz = Math.sign(z - cz);
      ctx.set(cx + dx * 5 + (dz ? w : 0), y + k, cz + dz * 5 + (dx ? w : 0), 0);
    }
    if (kind === 'spawner') {
      for (let zz = cz - 1; zz <= cz + 1; zz++) for (let xx = cx - 1; xx <= cx + 1; xx++) ctx.set(xx, y + 1, zz, N);
      ctx.set(cx, y + 2, cz, B.spawner, 0);
    } else if (kind === 'garden') {
      for (let zz = cz - 3; zz <= cz + 3; zz++) for (let xx = cx - 3; xx <= cx + 3; xx++) {
        const edge = Math.abs(xx - cx) === 3 || Math.abs(zz - cz) === 3;
        ctx.set(xx, y + 1, zz, edge ? N : B.soul_sand);
        if (!edge) ctx.set(xx, y + 2, zz, B.nether_wart);
      }
    } else {
      ctx.chest(cx + 3, y + 1, cz + 3, 'fortress', 2);
      ctx.chest(cx - 3, y + 1, cz - 3, 'fortress', 0);
      ctx.set(cx, y + 1, cz, B.spawner, 0);
    }
  };
  room(x + arm + 5, z, 'spawner');
  room(x - arm - 5, z, 'garden');
  room(x, z + arm + 5, 'chests');
  room(x, z - arm - 5, 'chests');
}

// A bastion: a blackstone keep with gold inside, guarded by snoutlings
function buildBastion(ctx, part) {
  const { x, z, y } = part;
  const H = 8, R = 9;
  const stone = (xx, yy, zz) => (ctx.h(xx, yy, zz, 41) < 0.12 ? B.gilded_blackstone : ctx.h(xx, yy, zz, 42) < 0.25 ? B.basalt : B.blackstone);
  for (let zz = z - R; zz <= z + R; zz++) for (let xx = x - R; xx <= x + R; xx++) {
    if (!ctx.inside(xx, zz)) continue;
    const edge = Math.abs(xx - x) === R || Math.abs(zz - z) === R;
    // foundation down into the lava
    for (let yy = y - 1; yy > NETHER_LAVA - 4; yy--) {
      const cur = ctx.get(xx, yy, zz);
      if (cur !== 0 && cur !== B.lava && yy < y - 3) break;
      ctx.set(xx, yy, zz, B.blackstone);
    }
    for (let k = 0; k <= H * 2 + 1; k++) {
      const floor = k === 0 || k === H;
      let id = floor ? B.blackstone : edge ? stone(xx, y + k, zz) : 0;
      if (edge && (k === 3 || k === H + 3) && (xx + zz) % 4 === 0) id = 0;   // windows
      if (k === H * 2 + 1) id = edge ? stone(xx, y + k, zz) : B.blackstone;
      ctx.set(xx, y + k, zz, id);
    }
  }
  // a hole in the upper floor with a ladder of blocks, a gold pile, and chests
  for (let k = 1; k < H; k++) ctx.set(x + R - 2, y + k, z, k % 2 ? B.basalt : 0);
  for (let k = 0; k <= 1; k++) for (let w = -1; w <= 1; w++) ctx.set(x + R - 2 + w, y + H, z + k, 0);
  for (let w = -1; w <= 1; w++) for (let k = 1; k <= 3; k++) ctx.set(x + w, y + k, z - R, 0);   // gate
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) ctx.set(x + dx, y + H + 1, z + dz, B.gold_block);
  ctx.set(x, y + H + 2, z, B.gold_block);
  ctx.chest(x - R + 2, y + 1, z + R - 2, 'bastion', 0);
  ctx.chest(x + R - 2, y + H + 1, z + R - 2, 'bastion', 0);
  ctx.chest(x - R + 2, y + H + 1, z - R + 2, 'bastion', 2);
  ctx.set(x - 3, y + 1, z - 3, B.magma_block);
  ctx.set(x + 3, y + 1, z + 3, B.magma_block);
}

// ---------------------------------------------------------------- the Nether, from 1.10
// Fills a box: `pick` is a block, or a function giving the block for each place (undefined: leave it)
function fill(ctx, x0, y0, z0, x1, y1, z1, pick) {
  for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) {
    if (!ctx.inside(xx, zz)) continue;
    for (let yy = y0; yy <= y1; yy++) { const id = typeof pick === 'function' ? pick(xx, yy, zz) : pick; if (id !== undefined) ctx.set(xx, yy, zz, id); }
  }
}
// A column carried down from just under `y` to the rock (or into the lava sea)
function footing(ctx, x, y, z, stone) {
  if (!ctx.inside(x, z)) return;
  for (let yy = y - 1; yy > NETHER_LAVA - 6; yy--) {
    const cur = ctx.get(x, yy, z);
    if (cur !== 0 && cur !== B.lava && yy < y - 2) break;
    ctx.set(x, yy, z, stone(ctx, x, yy, z));
  }
}

// ---- the fortress: a maze of dark brick on a grid of cells thirteen across. A straight run is an open
// bridge on pillars; a turning, a meeting of ways or a dead end is a roofed room: a crossing, a platform
// with a cinder spawner, a garden of nether wart, a treasury or a lava well.
const FORT_S = 13;
const fortBrick = (ctx, x, y, z) => { const h = ctx.h(x, y, z, 61); return h < 0.1 ? B.cracked_nether_bricks : h < 0.14 ? B.red_nether_bricks : B.nether_bricks; };

function planNetherFortress(world, plan, x, z, c, rng) {
  if (near(plan, world, 'fortress', x, z, 110)) return false;   // (one of the old kind is already here)
  const y = 58 + Math.floor(rng() * 12), N = 3;
  const cells = new Map(), K = (i, j) => i + ',' + j;
  const start = { i: 0, j: 0, links: [] };
  cells.set(K(0, 0), start);
  const stack = [start];
  while (stack.length && cells.size < 24) {
    const cur = stack[stack.length - 1];
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dj]) => Math.abs(cur.i + di) <= N && Math.abs(cur.j + dj) <= N && !cells.has(K(cur.i + di, cur.j + dj)));
    if (!open.length) { stack.pop(); continue; }
    // (it likes to run straight on: that is what makes the long bridges)
    const from = cur.links[0];
    let pick = open[Math.floor(rng() * open.length)];
    if (from && rng() < 0.6) { const on = open.find(([di, dj]) => di === -from[0] && dj === -from[1]); if (on) pick = on; }
    const next = { i: cur.i + pick[0], j: cur.j + pick[1], links: [[-pick[0], -pick[1]]] };
    cur.links.push(pick);
    cells.set(K(next.i, next.j), next);
    if (rng() < 0.22) stack.pop();   // (now and then it goes back and branches from further up)
    stack.push(next);
  }
  const list = [...cells.values()];
  const ends = ['spawner', 'treasury', 'garden', 'spawner', 'well', 'treasury', 'garden', 'crossing'];
  let e = 0;
  for (const cl of list) {
    const straight = cl.links.length === 2 && cl.links[0][0] === -cl.links[1][0] && cl.links[0][1] === -cl.links[1][1];
    cl.kind = straight ? 'bridge' : cl.links.length === 1 ? ends[e++ % ends.length] : 'crossing';
  }
  // (whatever its shape, it has a spawner and a treasury)
  for (const want of ['spawner', 'treasury', 'garden']) {
    if (list.some((cl) => cl.kind === want)) continue;
    const spare = list.find((cl) => cl.kind === 'crossing' && cl !== start) || list.find((cl) => cl.kind === 'bridge');
    if (spare) spare.kind = want;
  }
  for (const cl of list) {
    const cx = x + cl.i * FORT_S, cz = z + cl.j * FORT_S;
    plan.add({ minX: cx - 6, maxX: cx + 6, minZ: cz - 6, maxZ: cz + 6, x: cx, z: cz, y, kind: cl.kind, links: cl.links, build: buildFortCell });
  }
  plan.fortress = { minX: plan.minX, maxX: plan.maxX, minZ: plan.minZ, maxZ: plan.maxZ, y };
  return true;
}

function buildFortCell(ctx, part) {
  const { x, z, y, kind, links } = part;
  const has = (di, dj) => links.some(([a, b]) => a === di && b === dj);
  const N = (xx, yy, zz) => ctx.set(xx, yy, zz, fortBrick(ctx, xx, yy, zz));
  const F = B.nether_brick_fence;
  if (kind === 'bridge') {
    // an open bridge: a deck five wide between low walls with fence posts, on pillars and arches
    const along = links[0][0] !== 0;
    for (let a = -6; a <= 6; a++) for (let c = -3; c <= 3; c++) {
      const xx = x + (along ? a : c), zz = z + (along ? c : a);
      if (!ctx.inside(xx, zz)) continue;
      const edge = Math.abs(c) === 3;
      N(xx, y, zz);
      for (let k = 1; k <= 6; k++) ctx.set(xx, y + k, zz, edge && k === 1 ? fortBrick(ctx, xx, y + k, zz) : edge && k === 2 && (a & 1) === 0 ? F : 0);
      // (the arch under it, thickest at the pillars)
      const d = Math.min(Math.abs(a - 3), Math.abs(a + 3));
      if (d <= 1) N(xx, y - 1, zz);
      if (d === 0) { N(xx, y - 2, zz); if (edge || c === 0) footing(ctx, xx, y - 2, zz, fortBrick); }
    }
    return;
  }
  // a room: walls five out from the middle, with a way through on each side that leads somewhere
  const open = kind === 'spawner';
  for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
    const xx = x + dx, zz = z + dz;
    if (!ctx.inside(xx, zz)) continue;
    const ax = Math.abs(dx), az = Math.abs(dz), m = Math.max(ax, az);
    const side = ax >= az ? [Math.sign(dx), 0] : [0, Math.sign(dz)], across = ax >= az ? az : ax, way = ax !== az && has(side[0], side[1]);
    if (m === 6) {
      // (the last step to the edge of the cell: a short passage, only where the way goes on)
      if (!way || across > 3) continue;
      N(xx, y, zz);
      for (let k = 1; k <= 5; k++) ctx.set(xx, y + k, zz, across === 3 && k <= (open ? 1 : 5) ? fortBrick(ctx, xx, y + k, zz) : 0);
      if (!open) N(xx, y + 6, zz);
      continue;
    }
    N(xx, y, zz);
    for (let k = 1; k <= 6; k++) {
      let id = 0;
      if (m === 5) {
        const door = way && across <= 2 && k <= 4;
        if (door) id = 0;
        else if (open) id = k === 1 ? fortBrick(ctx, xx, y + k, zz) : k === 2 && ((dx + dz) & 1) === 0 ? F : 0;
        else id = k >= 2 && k <= 3 && ax !== az && across % 3 === 1 ? F : fortBrick(ctx, xx, y + k, zz);   // (barred windows)
      }
      ctx.set(xx, y + k, zz, id);
    }
    if (!open) N(xx, y + 7, zz);
    if (m === 5 && ax === az) footing(ctx, xx, y, zz, fortBrick);
  }
  footing(ctx, x, y, z, fortBrick);
  if (kind === 'spawner') {
    // a raised platform under the open roof of the cavern, the spawner on a dais of steps
    fill(ctx, x - 2, y + 1, z - 2, x + 2, y + 1, z + 2, (xx, yy, zz) => (Math.max(Math.abs(xx - x), Math.abs(zz - z)) === 2 ? B.nether_brick_slab : fortBrick(ctx, xx, yy, zz)));
    ctx.set(x, y + 2, z, B.spawner, 0);
  } else if (kind === 'garden') {
    // beds of soul sand thick with nether wart, either side of a path
    fill(ctx, x - 4, y, z - 4, x + 4, y, z + 4, (xx, yy, zz) => (Math.abs(xx - x) >= 2 ? B.soul_sand : undefined));
    fill(ctx, x - 4, y + 1, z - 4, x + 4, y + 1, z + 4, (xx, yy, zz) => (Math.abs(xx - x) >= 2 && ctx.h(xx, yy, zz, 62) < 0.8 ? B.nether_wart : undefined));
  } else if (kind === 'treasury') {
    fill(ctx, x - 1, y, z - 1, x + 1, y, z + 1, B.red_nether_bricks);
    ctx.set(x, y + 1, z, B.gold_block);
    ctx.chest(x - 4, y + 1, z - 4, 'nether_fortress', 2);
    ctx.chest(x + 4, y + 1, z + 4, 'nether_fortress', 0);
    ctx.chest(x + 4, y + 1, z - 4, 'nether_fortress', 2);
  } else if (kind === 'well') {
    // a well of lava with a low rim
    fill(ctx, x - 2, y - 1, z - 2, x + 2, y - 1, z + 2, (xx, yy, zz) => fortBrick(ctx, xx, yy, zz));
    fill(ctx, x - 2, y + 1, z - 2, x + 2, y + 1, z + 2, (xx, yy, zz) => (Math.max(Math.abs(xx - x), Math.abs(zz - z)) === 2 ? B.nether_brick_slab : undefined));
    fill(ctx, x - 1, y, z - 1, x + 1, y, z + 1, B.lava);
  } else {
    // a crossing: a post hanging from the roof, and sometimes something left in a corner
    ctx.set(x, y + 6, z, F); ctx.set(x, y + 5, z, F);
    if (ctx.h(x, y, z, 63) < 0.35) ctx.chest(x + 4, y + 1, z - 4, 'nether_fortress', 2);
  }
}

// ---- bastions: the snoutlings' strongholds of black brick, in four kinds. All keep gold; the treasure
// room keeps the best of it.
const bastStone = (ctx, x, y, z) => {
  const h = ctx.h(x, y, z, 71);
  return h < 0.13 ? B.cracked_polished_blackstone_bricks : h < 0.24 ? B.blackstone : h < 0.27 ? B.gilded_blackstone : h < 0.32 ? B.basalt : B.polished_blackstone_bricks;
};
// A hollow hall: floor and walls of bastion stone, a roof if asked, battlements if not
function hall(ctx, x0, y0, z0, x1, y1, z1, roof = true) {
  fill(ctx, x0, y0, z0, x1, y1, z1, (x, y, z) => {
    const wall = x === x0 || x === x1 || z === z0 || z === z1;
    if (y === y0) return bastStone(ctx, x, y, z);
    if (y === y1) return roof ? bastStone(ctx, x, y, z) : wall && ((x + z) & 1) === 0 ? bastStone(ctx, x, y, z) : 0;
    return wall ? bastStone(ctx, x, y, z) : 0;
  });
  for (let xx = x0; xx <= x1; xx++) for (let zz = z0; zz <= z1; zz++) if ((xx === x0 || xx === x1 || zz === z0 || zz === z1) && ((xx - x0) % 3 === 0 || (zz - z0) % 3 === 0)) footing(ctx, xx, y0, zz, bastStone);
}
// A doorway cut through a wall, and the rock cleared in front of it so there is a way up to it
function gate(ctx, x, y, z, dx, dz, wide = 1, high = 4) {
  for (let w = -wide; w <= wide; w++) {
    for (let k = 1; k <= high; k++) ctx.set(x + (dz ? w : 0), y + k, z + (dx ? w : 0), 0);
    for (let out = 1; out <= 5; out++) { for (let k = 1; k <= high; k++) ctx.set(x + dx * out + (dz ? w : 0), y + k, z + dz * out + (dx ? w : 0), 0); if (ctx.get(x + dx * out + (dz ? w : 0), y, z + dz * out + (dx ? w : 0)) <= 0) ctx.set(x + dx * out + (dz ? w : 0), y, z + dz * out + (dx ? w : 0), B.blackstone); }
  }
}
// A flight of half steps up along x from (x, y, z), climbing `rise` blocks
function steps(ctx, x, y, z, dir, rise, width = 2) {
  for (let i = 0; i < rise * 2; i++) for (let w = 0; w < width; w++) {
    const xx = x + dir * i, top = y + (i >> 1);
    for (let yy = y + 1; yy <= top; yy++) ctx.set(xx, yy, z + w, bastStone(ctx, xx, yy, z + w));
    ctx.set(xx, top + 1, z + w, i & 1 ? bastStone(ctx, xx, top + 1, z + w) : B.blackstone_slab);
    for (let k = 2; k <= 4; k++) ctx.set(xx, top + k, z + w, 0);
  }
}
const goldPile = (ctx, x, y, z) => { for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) ctx.set(x + dx, y, z + dz, B.gold_block); ctx.set(x, y + 1, z, B.gold_block); };

// The treasure room: a keep with a pool of lava for a floor, and in the middle of it a tower holding
// the hoard, reached by the gallery round the walls
function buildBastionTreasure(ctx, part) {
  const { x, z, y } = part, R = 10, H = 16;
  hall(ctx, x - R, y, z - R, x + R, y + H, z + R, false);
  // the pool, and a walk along the walls
  fill(ctx, x - R + 3, y - 1, z - R + 3, x + R - 3, y - 1, z + R - 3, (xx, yy, zz) => bastStone(ctx, xx, yy, zz));
  fill(ctx, x - R + 3, y, z - R + 3, x + R - 3, y, z + R - 3, B.lava);
  // the tower in the middle, and the hoard on it
  fill(ctx, x - 2, y, z - 2, x + 2, y + 6, z + 2, (xx, yy, zz) => (yy === y + 3 && Math.max(Math.abs(xx - x), Math.abs(zz - z)) === 2 ? B.chiseled_polished_blackstone : bastStone(ctx, xx, yy, zz)));
  fill(ctx, x - 3, y + 7, z - 3, x + 3, y + 7, z + 3, (xx, yy, zz) => bastStone(ctx, xx, yy, zz));
  goldPile(ctx, x, y + 8, z);
  ctx.chest(x - 2, y + 8, z - 2, 'bastion_treasure', 0);
  ctx.chest(x + 2, y + 8, z + 2, 'bastion_treasure', 2);
  ctx.set(x + 2, y + 8, z - 2, B.gold_block); ctx.set(x - 2, y + 8, z + 2, B.gold_block);
  // a gallery round the walls at the height of the hoard, a bridge out to it, and steps up
  fill(ctx, x - R + 1, y + 7, z - R + 1, x + R - 1, y + 7, z + R - 1, (xx, yy, zz) => (Math.max(Math.abs(xx - x), Math.abs(zz - z)) >= R - 2 ? bastStone(ctx, xx, yy, zz) : undefined));
  fill(ctx, x - 1, y + 7, z - R + 3, x + 1, y + 7, z - 4, (xx, yy, zz) => bastStone(ctx, xx, yy, zz));
  steps(ctx, x - R + 3, y, z + R - 2, 1, 7, 2);
  // gold let into the walls, light from lava behind bars high up
  for (const [dx, dz] of [[R, 0], [-R, 0], [0, R], [0, -R]]) { ctx.set(x + dx, y + 11, z + dz, B.gold_block); ctx.set(x + dx, y + 10, z + dz, B.chiseled_polished_blackstone); ctx.set(x + dx, y + 12, z + dz, B.chiseled_polished_blackstone); }
  gate(ctx, x, y, z - R, 0, -1, 1, 4);
}
// The bridge: a great causeway between two gate towers, with the gold at the middle of the span
function buildBastionBridge(ctx, part) {
  const { x, z, y } = part, L = 22;
  // the deck, its parapets, and the arches under it
  fill(ctx, x - L, y - 3, z - 4, x + L, y + 8, z + 4, (xx, yy, zz) => {
    const c = Math.abs(zz - z), a = xx - x, t = Math.abs(((a + L) % 11) - 5);   // (0 at each pier)
    if (yy > y) return c === 4 && yy === y + 1 ? bastStone(ctx, xx, yy, zz) : c === 4 && yy === y + 2 && (a & 3) === 0 ? B.chiseled_polished_blackstone : 0;
    if (yy === y) return bastStone(ctx, xx, yy, zz);
    return y - yy <= (t <= 1 ? 3 : t === 2 ? 2 : t === 3 ? 1 : 0) ? bastStone(ctx, xx, yy, zz) : undefined;
  });
  for (let a = -L; a <= L; a++) if (Math.abs(((a + L) % 11) - 5) === 0) for (let c = -4; c <= 4; c++) footing(ctx, x + a, y - 3, z + c, bastStone);
  // the towers at each end, a room above the gate
  for (const s of [-1, 1]) {
    const tx = x + s * (L + 7);
    hall(ctx, tx - 7, y, z - 5, tx + 7, y + 13, z + 5, false);
    fill(ctx, tx - 7, y + 6, z - 5, tx + 7, y + 6, z + 5, (xx, yy, zz) => bastStone(ctx, xx, yy, zz));
    gate(ctx, tx - s * 7, y, z, -s, 0, 2, 4);
    gate(ctx, tx + s * 7, y, z, s, 0, 2, 4);
    steps(ctx, tx - 6 * s, y, z + 3, s, 6, 2);
    ctx.chest(tx, y + 7, z - 4, 'bastion_hall', 2);
    ctx.set(tx + s * 3, y + 7, z - 4, B.gold_block);
    fill(ctx, tx - 7, y + 9, z - 5, tx + 7, y + 10, z + 5, (xx, yy, zz) => ((xx === tx - 7 || xx === tx + 7 || zz === z - 5 || zz === z + 5) && (xx + zz) % 3 === 0 ? B.nether_brick_fence : undefined));
  }
  // the middle of the span: the hoard under a snout of gold set in the parapet
  goldPile(ctx, x, y + 1, z);
  ctx.chest(x - 2, y + 1, z + 3, 'bastion_hall', 2);
  ctx.chest(x + 2, y + 1, z - 3, 'bastion_hall', 0);
  for (const c of [-4, 4]) { fill(ctx, x - 1, y + 1, z + c, x + 1, y + 4, z + c, (xx, yy, zz) => (yy === y + 3 && xx !== x ? B.gold_block : yy === y + 2 && xx === x ? B.gold_block : B.chiseled_polished_blackstone)); }
}
// The stables: a long hall with a way down the middle and pens of tuskers either side, a loft over one end
function buildBastionStable(ctx, part) {
  const { x, z, y } = part, L = 16, W = 8, H = 9;
  hall(ctx, x - L, y, z - W, x + L, y + H, z + W, true);
  // pens: low walls with a gap, three a side
  for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) {
    const px = x + k * 10, front = z + s * 2;
    fill(ctx, px - 4, y + 1, front, px + 4, y + 2, front, (xx, yy) => (Math.abs(xx - px) <= 1 ? 0 : yy === y + 1 ? B.polished_blackstone_bricks : B.nether_brick_fence));
    for (const e of [-5, 5]) fill(ctx, px + e, y + 1, Math.min(front, z + s * (W - 1)), px + e, y + 2, Math.max(front, z + s * (W - 1)), (xx, yy) => (yy === y + 1 ? B.polished_blackstone_bricks : B.nether_brick_fence));
    ctx.set(px - 3, y + 1, z + s * (W - 1), B.hay_bale); ctx.set(px - 3, y + 2, z + s * (W - 1), B.hay_bale); ctx.set(px - 2, y + 1, z + s * (W - 1), B.hay_bale);
  }
  // the loft, with the tack and the takings
  fill(ctx, x + L - 8, y + 5, z - W + 1, x + L - 1, y + 5, z + W - 1, (xx, yy, zz) => bastStone(ctx, xx, yy, zz));
  steps(ctx, x + L - 18, y, z - 1, 1, 5, 2);
  fill(ctx, x + L - 9, y + 6, z - 1, x + L - 8, y + 8, z, 0);
  ctx.chest(x + L - 2, y + 6, z - W + 2, 'bastion_stable', 3);
  ctx.chest(x + L - 2, y + 6, z + W - 2, 'bastion_stable', 3);
  ctx.chest(x - L + 2, y + 1, z, 'bastion_hall', 1);
  goldPile(ctx, x + L - 4, y + 6, z);
  // light: lava behind bars in the end walls, shroomlights in the roof
  for (let k = -1; k <= 1; k++) { ctx.set(x + k * 10, y + H, z, B.shroomlight); }
  gate(ctx, x - L, y, z, -1, 0, 2, 4);
  gate(ctx, x, y, z - W, 0, -1, 1, 4);
}
// The housing: four blocks of rooms, two floors high, round a yard with a fire of gold in the middle
function buildBastionHousing(ctx, part) {
  const { x, z, y } = part, R = 16;
  // the yard, walled, open to the roof of the cavern
  hall(ctx, x - R, y, z - R, x + R, y + 6, z + R, false);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const bx = x + sx * 10, bz = z + sz * 10;
    hall(ctx, bx - 6, y, bz - 6, bx + 6, y + 11, bz + 6, true);
    fill(ctx, bx - 6, y + 5, bz - 6, bx + 6, y + 5, bz + 6, (xx, yy, zz) => bastStone(ctx, xx, yy, zz));
    // a door to the yard below, windows above, steps inside
    gate(ctx, bx - sx * 6, y, bz, -sx, 0, 1, 3);
    for (let k = 2; k <= 3; k++) { ctx.set(bx - sx * 6, y + 6 + k, bz - 1, B.nether_brick_fence); ctx.set(bx - sx * 6, y + 6 + k, bz + 1, B.nether_brick_fence); ctx.set(bx, y + 6 + k, bz - sz * 6, B.nether_brick_fence); }
    steps(ctx, bx - 5, y, bz + sz * 4 - (sz > 0 ? 1 : 0), 1, 5, 2);
    // what they keep: a chest downstairs in two of them, upstairs in the others
    const up = sx === sz;
    ctx.chest(bx + sx * 4, y + (up ? 6 : 1), bz - sz * 4, 'bastion_hall', sx > 0 ? 1 : 3);
    ctx.set(bx + sx * 4, y + (up ? 1 : 6), bz - sz * 4, B.gold_block);
    ctx.set(bx, y + 11, bz, B.shroomlight);
  }
  // the middle of the yard: gold on a plinth, lava round it
  fill(ctx, x - 2, y, z - 2, x + 2, y, z + 2, (xx, yy, zz) => (Math.max(Math.abs(xx - x), Math.abs(zz - z)) === 2 ? B.chiseled_polished_blackstone : B.lava));
  fill(ctx, x, y, z, x, y + 2, z, B.polished_blackstone_bricks);
  goldPile(ctx, x, y + 3, z);
  gate(ctx, x, y, z - R, 0, -1, 2, 4);
  gate(ctx, x, y, z + R, 0, 1, 2, 4);
}
const BASTIONS = {
  treasure: { r: 11, build: buildBastionTreasure, mobs: [['snoutling_brute', 0, 8, -1], ['snoutling_brute', 1, 8, 1], ['snoutling', -8, 8, 0], ['snoutling', 8, 8, -2], ['snoutling', -8, 1, -8], ['snoutling', 8, 1, 8], ['snoutling', 0, 1, -8]] },
  bridge: { r: 37, build: buildBastionBridge, mobs: [['snoutling_brute', 1, 1, 0], ['snoutling', -8, 1, 1], ['snoutling', 9, 1, -1], ['snoutling', -29, 1, 0], ['snoutling', 29, 1, 0], ['snoutling', -29, 7, -2], ['snoutling', 29, 7, -2]] },
  stable: { r: 17, build: buildBastionStable, mobs: [['tusker', -10, 1, 5], ['tusker', 0, 1, 5], ['tusker', 10, 1, -5], ['tusker', -10, 1, -5], ['snoutling', 0, 1, 0], ['snoutling', -6, 1, 0], ['snoutling', 6, 1, 0], ['snoutling_brute', 12, 6, 0]] },
  housing: { r: 17, build: buildBastionHousing, mobs: [['snoutling', -10, 1, -10], ['snoutling', 10, 1, -10], ['snoutling', -10, 6, 10], ['snoutling', 10, 6, 10], ['snoutling', 3, 1, 3], ['snoutling', -3, 1, -3], ['snoutling_brute', 0, 1, 5], ['tusker', 4, 1, -5]] },
};
function planNetherBastion(world, plan, x, z, c, rng) {
  if (near(plan, world, 'nether_fortress', x, z, 110) || near(plan, world, 'fortress', x, z, 100) || near(plan, world, 'bastion', x, z, 60)) return false;
  const kind = ['treasure', 'bridge', 'stable', 'housing'][Math.floor(rng() * 4)], V = BASTIONS[kind];
  const y = kind === 'bridge' ? 46 + Math.floor(rng() * 10) : 36 + Math.floor(rng() * 12);
  plan.kind = kind;
  plan.add({ minX: x - V.r - 6, maxX: x + V.r + 6, minZ: z - V.r - 6, maxZ: z + V.r + 6, x, z, y, build: V.build });
  V.mobs.forEach(([type, dx, dy, dz], i) => plan.mobs.push({ type, x: x + dx + 0.5, y: y + dy, z: z + dz + 0.5, key: `${plan.key}:${type[0]}${i}` }));
  return true;
}

// ---------------------------------------------------------------- the End
// An end city tower of violetstone on an outer island, with a treasure room and clampers on the walls
function buildEndCity(ctx, part) {
  const { x, z, y } = part;
  const P = B.violetstone, PP = B.violetstone_pillar, S = B.end_stone_bricks;
  const levels = part.levels;
  let base = y;
  for (let lv = 0; lv < levels; lv++) {
    const r = lv === levels - 1 ? 5 : 3 + (lv % 2);
    const h = lv === levels - 1 ? 6 : 7;
    for (let zz = z - r; zz <= z + r; zz++) for (let xx = x - r; xx <= x + r; xx++) {
      if (!ctx.inside(xx, zz)) continue;
      const edge = Math.abs(xx - x) === r || Math.abs(zz - z) === r;
      const corner = Math.abs(xx - x) === r && Math.abs(zz - z) === r;
      for (let k = 0; k <= h; k++) {
        let id = k === 0 || k === h ? P : edge ? (corner ? PP : P) : 0;
        if (edge && !corner && k >= 2 && k <= 4 && ((xx - x) % 2 === 0 && (zz - z) % 2 === 0)) id = 0;
        ctx.set(xx, base + k, zz, id);
      }
      if (lv === 0) for (let yy = base - 1; yy > base - 8; yy--) { if (ctx.get(xx, yy, zz) === B.end_stone) break; ctx.set(xx, yy, zz, S); }
    }
    // stairs up through the middle
    if (lv < levels - 1) for (let k = 1; k <= h; k++) { ctx.set(x + (k % 2), base + k, z, 0); ctx.set(x, base + k, z + 1, P); }
    ctx.set(x - r + 1, base + h - 1, z - r + 1, B.end_rod);
    ctx.set(x + r - 1, base + h - 1, z + r - 1, B.end_rod);
    base += h;
  }
  // doorway at the bottom, treasure at the top
  for (let k = 1; k <= 3; k++) ctx.set(x, y + k, z - 3, 0);
  const top = base - 6;
  ctx.chest(x - 3, top + 1, z + 3, 'end_city', 2);
  ctx.chest(x + 3, top + 1, z + 3, 'end_city', 2);
  ctx.set(x, top + 1, z, B.end_rod);
}

// ---------------------------------------------------------------- strongholds (overworld, underground)
function buildStronghold(ctx, part) {
  const { x, z, y } = part;
  const brick = (xx, yy, zz) => { const r = ctx.h(xx, yy, zz, 51); return r < 0.18 ? B.mossy_stone_bricks : r < 0.3 ? B.cracked_stone_bricks : B.stone_bricks; };
  const box = (x0, y0, z0, x1, y1, z1) => {
    for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) {
      if (!ctx.inside(xx, zz)) continue;
      const shell = xx === x0 || xx === x1 || yy === y0 || yy === y1 || zz === z0 || zz === z1;
      ctx.set(xx, yy, zz, shell ? brick(xx, yy, zz) : 0);
    }
  };
  // the portal room
  box(x - 6, y - 1, z - 8, x + 6, y + 7, z + 8);
  for (let zz = z + 1; zz <= z + 7; zz++) for (let xx = x - 3; xx <= x + 3; xx++) ctx.set(xx, y, zz, B.stone_bricks);   // raised floor
  for (let zz = z + 3; zz <= z + 5; zz++) for (let xx = x - 1; xx <= x + 1; xx++) { ctx.set(xx, y, zz, B.lava); ctx.set(xx, y - 1, zz, B.stone_bricks); }
  const cz = z + 4;
  const ring = [];
  for (let d = -1; d <= 1; d++) ring.push([x + d, cz - 2], [x + d, cz + 2], [x - 2, cz + d], [x + 2, cz + d]);
  for (const [fx, fz] of ring) ctx.set(fx, y + 1, fz, ctx.h(fx, y, fz, 52) < 0.1 ? B.end_portal_frame_filled : B.end_portal_frame);
  for (let k = 0; k <= 2; k++) ctx.set(x, y + k - 0, z - 1 + k, B.stone_bricks);   // steps up
  ctx.set(x, y + 1, z - 3, B.spawner, 1);
  ctx.set(x - 5, y + 3, z, B.torch); ctx.set(x + 5, y + 3, z, B.torch);
  // corridors out to side rooms
  box(x - 3, y - 1, z - 26, x + 3, y + 4, z - 8);
  for (let k = 0; k <= 2; k++) for (let w = -1; w <= 1; w++) ctx.set(x + w, y + k, z - 8, 0);
  box(x - 26, y - 1, z - 3, x - 6, y + 4, z + 3);
  for (let k = 0; k <= 2; k++) for (let w = -1; w <= 1; w++) ctx.set(x - 6, y + k, z + w, 0);
  box(x + 6, y - 1, z - 3, x + 26, y + 4, z + 3);
  for (let k = 0; k <= 2; k++) for (let w = -1; w <= 1; w++) ctx.set(x + 6, y + k, z + w, 0);
  for (const [tx, tz] of [[x, z - 17], [x - 16, z], [x + 16, z]]) ctx.set(tx, y + 2, tz + (tz === z ? 2 : 0) + (tx === x ? 0 : 0), B.torch);
  // a library at one end and store rooms at the others
  box(x - 36, y - 1, z - 6, x - 26, y + 7, z + 6);
  for (let k = 0; k <= 2; k++) for (let w = -1; w <= 1; w++) ctx.set(x - 26, y + k, z + w, 0);
  for (let zz = z - 5; zz <= z + 5; zz++) for (let k = 0; k <= 4; k++) { ctx.set(x - 35, y + k, zz, B.bookshelf); if (Math.abs(zz - z) > 1) ctx.set(x - 31, y + k, zz, B.bookshelf); }
  ctx.chest(x - 33, y, z - 4, 'stronghold_library', 1);
  ctx.set(x - 28, y + 2, z + 4, B.torch);
  box(x + 26, y - 1, z - 4, x + 34, y + 5, z + 4);
  for (let k = 0; k <= 2; k++) for (let w = -1; w <= 1; w++) ctx.set(x + 26, y + k, z + w, 0);
  ctx.chest(x + 32, y, z + 2, 'stronghold_corridor', 3);
  ctx.chest(x + 32, y, z - 2, 'stronghold_corridor', 3);
  box(x - 5, y - 1, z - 36, x + 5, y + 5, z - 26);
  for (let k = 0; k <= 2; k++) for (let w = -1; w <= 1; w++) ctx.set(x + w, y + k, z - 26, 0);
  ctx.chest(x - 3, y, z - 33, 'stronghold_corridor', 0);
  ctx.set(x + 3, y + 2, z - 33, B.torch);
}

function strongholdPlans(world) {
  if (world._strongholdPlans) return world._strongholdPlans;
  world._strongholdPlans = strongholds(world).map((s) => ({
    type: 'stronghold', key: `stronghold:${s.i}`, x: s.x, z: s.z, mobs: [],
    minX: s.x - 37, maxX: s.x + 35, minZ: s.z - 37, maxZ: s.z + 9,
    ground: () => s.y,
    parts: [{ minX: s.x - 37, maxX: s.x + 35, minZ: s.z - 37, maxZ: s.z + 9, x: s.x, z: s.z, y: s.y, build: buildStronghold }],
  }));
  return world._strongholdPlans;
}

// ---------------------------------------------------------------- structure types
// Each kind has its rules as they were up to 1.7 (ok, and plan with plan.v4 unset) and, where 1.8 changed
// them, its rules from then on (ok4, and plan with plan.v4 set). New kinds are added at the end only: a
// kind's place in this list is part of how its spots are picked.
const isLand = (c) => c.h > SEA + 1;
const near = (plan, world, name, x, z, dist) => nearStructure(world, name, x, z, dist, plan.v4);
// The kind of village each land has (1.8)
const VILLAGE_LANDS = {
  [BIOME.PLAINS]: 'plains', [BIOME.SUNFLOWER]: 'plains', [BIOME.MEADOW]: 'meadow', [BIOME.DESERT]: 'desert', [BIOME.BADLANDS]: 'badlands', [BIOME.SAVANNA]: 'savanna',
  [BIOME.TAIGA]: 'taiga', [BIOME.OLD_TAIGA]: 'taiga', [BIOME.SNOWY]: 'snowy', [BIOME.SNOWY_TAIGA]: 'snowy', [BIOME.CHERRY_GROVE]: 'cherry', [BIOME.JUNGLE]: 'jungle', [BIOME.BAMBOO]: 'jungle',
  [BIOME.BIRCH_FOREST]: 'birch', [BIOME.FLOWER_FOREST]: 'birch',
};
const OUTPOST_LANDS = [BIOME.PLAINS, BIOME.DESERT, BIOME.TAIGA, BIOME.SNOWY, BIOME.DARK_FOREST, BIOME.SAVANNA, BIOME.MEADOW, BIOME.BADLANDS, BIOME.CHERRY_GROVE, BIOME.SUNFLOWER, BIOME.SNOWY_TAIGA, BIOME.OLD_TAIGA];
const TYPES = [
  { name: 'village', spacing: 20, sep: 5, chance: 1, radius: 100, ok: (c) => [BIOME.PLAINS, BIOME.DESERT, BIOME.TAIGA, BIOME.SNOWY].includes(c.biome) && isLand(c) && c.h < 92,
    ok4: (c) => !!VILLAGE_LANDS[c.biome] && isLand(c) && c.h < 92,
    plan: (world, plan, x, z, c, rng) => planVillage(world, plan, x, z, c, rng) },
  { name: 'pyramid', spacing: 14, sep: 4, chance: 0.8, radius: 14, ok: (c) => c.biome === BIOME.DESERT && isLand(c),
    plan: (world, plan, x, z) => { plan.add({ minX: x - 11, maxX: x + 11, minZ: z - 11, maxZ: z + 11, x, z, y: plan.ground(x, z) + 1, build: buildPyramid }); return true; } },
  { name: 'jungle_temple', spacing: 14, sep: 4, chance: 0.8, radius: 10, ok: (c) => c.biome === BIOME.JUNGLE && isLand(c),
    ok4: (c) => (c.biome === BIOME.JUNGLE || c.biome === BIOME.BAMBOO) && isLand(c),
    plan: (world, plan, x, z, c, rng) => { planSingle(plan, x, z, plan.ground(x, z) + 1, 5, 6, Math.floor(rng() * 4), buildJungleTemple); return true; } },
  { name: 'witch_hut', spacing: 10, sep: 3, chance: 0.8, radius: 7, ok: (c) => c.biome === BIOME.SWAMP,
    plan: (world, plan, x, z, c, rng) => {
      const y = Math.max(plan.ground(x, z), SEA) + 3;
      planSingle(plan, x, z, y, 3, 4, Math.floor(rng() * 4), buildWitchHut);
      plan.mobs.push({ type: 'witch', x: x + 0.5, y: y + 1, z: z + 0.5, key: `${plan.key}:witch` });
      return true;
    } },
  { name: 'igloo', spacing: 10, sep: 3, chance: 0.6, radius: 7, ok: (c) => c.biome === BIOME.SNOWY && isLand(c),
    ok4: (c) => (c.biome === BIOME.SNOWY || c.biome === BIOME.SNOWY_TAIGA || c.biome === BIOME.ICE_SPIKES) && isLand(c),
    plan: (world, plan, x, z, c, rng) => { planSingle(plan, x, z, plan.ground(x, z) + 1, 4, 6, Math.floor(rng() * 4), buildIgloo); return true; } },
  { name: 'outpost', spacing: 18, sep: 5, chance: 0.5, radius: 18, ok: (c) => [BIOME.PLAINS, BIOME.DESERT, BIOME.TAIGA, BIOME.SNOWY, BIOME.DARK_FOREST].includes(c.biome) && isLand(c) && c.h < 95,
    ok4: (c) => OUTPOST_LANDS.includes(c.biome) && isLand(c) && c.h < 95,
    plan: (world, plan, x, z, c, rng) => {
      if (near(plan, world, 'village', x, z, 180)) return false;
      const y = plan.ground(x, z) + 1;
      if (plan.v4) {
        // a watchtower with a camp round it: tents, and a cage with a captured iron golem
        const rot = Math.floor(rng() * 4);
        planSingle(plan, x, z, y, 5, 5, rot, buildOutpostTower);
        const spots = [[11, 3], [-11, -2], [3, 12], [-2, -12]];
        const first = Math.floor(rng() * 4);
        spots.forEach(([ox, oz], i) => {
          const px = x + ox, pz = z + oz, g = plan.ground(px, pz);
          if (g < SEA + 1 || Math.abs(g + 1 - y) > 5) return;
          if (i === first) {
            planSingle(plan, px, pz, g + 1, 2, 2, 0, buildOutpostCage);
            plan.mobs.push({ type: 'iron_golem', x: px + 0.5, y: g + 1, z: pz + 0.5, key: `${plan.key}:golem` });
          } else planSingle(plan, px, pz, g + 1, 2, 2, i & 1, buildOutpostTent, { chest: i === (first + 1) % 4, cap: [B.gray_wool, B.red_wool, B.black_wool, B.brown_wool][i] });
        });
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.9; const px = Math.round(x + Math.cos(a) * 8), pz = Math.round(z + Math.sin(a) * 8); plan.mobs.push({ type: 'pillager', x: px + 0.5, y: plan.ground(px, pz) + 1, z: pz + 0.5, key: `${plan.key}:p${k}` }); }
        plan.mobs.push({ type: 'pillager', x: x + 0.5, y: y + 6, z: z + 0.5, key: `${plan.key}:f1` });
        plan.mobs.push({ type: 'pillager', x: x + 0.5, y: y + 11, z: z + 0.5, key: `${plan.key}:f2` });
        plan.mobs.push({ type: 'pillager', x: x + 1.5, y: y + 16, z: z - 0.5, key: `${plan.key}:top` });
        plan.mobs.push({ type: 'vindicator', x: x - 1.5, y: y + 16, z: z - 1.5, key: `${plan.key}:chief` });
        return true;
      }
      planSingle(plan, x, z, y, 4, 4, Math.floor(rng() * 4), buildOutpost);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; plan.mobs.push({ type: 'pillager', x: x + Math.cos(a) * 7 + 0.5, y: plan.ground(Math.round(x + Math.cos(a) * 7), Math.round(z + Math.sin(a) * 7)) + 1, z: z + Math.sin(a) * 7 + 0.5, key: `${plan.key}:p${k}` }); }
      plan.mobs.push({ type: 'pillager', x: x + 1.5, y: y + 15, z: z + 1.5, key: `${plan.key}:top` });
      return true;
    } },
  { name: 'mansion', spacing: 32, sep: 8, chance: 1, radius: 20, ok: (c) => c.biome === BIOME.DARK_FOREST && isLand(c),
    plan: (world, plan, x, z, c, rng) => {
      const rot = Math.floor(rng() * 4);
      const y = plan.ground(x, z) + 1;
      planSingle(plan, x, z, y, 14, 10, rot, buildMansion);
      for (const [lx, ly] of [[-8, 0], [6, 0], [-6, 7], [8, 7]]) {
        const [dx, dz] = rotVec(lx, 0, rot);
        plan.mobs.push({ type: 'vindicator', x: x + dx + 0.5, y: y + ly, z: z + dz + 0.5, key: `${plan.key}:v${lx}` });
      }
      return true;
    } },
  { name: 'ruined_portal', spacing: 12, sep: 3, chance: 0.5, radius: 7, ok: (c) => isLand(c) && c.biome !== BIOME.MOUNTAINS,
    ok4: (c) => isLand(c) && c.biome !== BIOME.MOUNTAINS && c.biome !== BIOME.SNOWY_PEAKS,
    plan: (world, plan, x, z, c, rng) => {
      if (near(plan, world, 'village', x, z, 70)) return false;
      planSingle(plan, x, z, plan.ground(x, z) + 1, 5, 5, Math.floor(rng() * 4), buildRuinedPortal);
      return true;
    } },
  { name: 'well', spacing: 6, sep: 1, chance: 0.2, radius: 4, ok: (c) => c.biome === BIOME.DESERT && isLand(c),
    plan: (world, plan, x, z) => {
      if (near(plan, world, 'village', x, z, 70) || near(plan, world, 'pyramid', x, z, 25)) return false;
      planSingle(plan, x, z, plan.ground(x, z) + 1, 2, 2, 0, buildWell);
      return true;
    } },
  { name: 'shipwreck', spacing: 12, sep: 3, chance: 0.6, radius: 11, ok: (c) => c.h <= SEA + 1 && c.h >= SEA - 18,
    plan: (world, plan, x, z, c, rng) => {
      if (near(plan, world, 'village', x, z, 70)) return false;
      planSingle(plan, x, z, plan.ground(x, z) + 1, 8, 3, Math.floor(rng() * 4), buildShipwreck);
      return true;
    } },
];
TYPES.push(
  // (the first kinds of fortress and bastion: from 1.10 they stand only where some of their land had already been seen)
  { name: 'fortress', dim: 'nether', until: 5, spacing: 13, sep: 4, chance: 0.75, radius: 46, ok: () => true,
    plan: (world, plan, x, z, c, rng) => {
      const y = 62 + Math.floor(rng() * 10);
      plan.add({ minX: x - 45, maxX: x + 45, minZ: z - 45, maxZ: z + 45, x, z, y, build: buildFortress });
      plan.fortress = { minX: x - 45, maxX: x + 45, minZ: z - 45, maxZ: z + 45, y };
      return true;
    } },
  { name: 'bastion', dim: 'nether', until: 5, spacing: 15, sep: 4, chance: 0.6, radius: 11, ok: (c) => c.biome !== NB.BASALT,
    plan: (world, plan, x, z, c, rng) => {
      if (near(plan, world, 'fortress', x, z, 90)) return false;
      const y = 40 + Math.floor(rng() * 16);
      plan.add({ minX: x - 10, maxX: x + 10, minZ: z - 10, maxZ: z + 10, x, z, y, build: buildBastion });
      for (let k = 0; k < 4; k++) plan.mobs.push({ type: 'snoutling', x: x + 0.5 + (k % 2 ? 3 : -3), y: y + 1 + (k > 1 ? 8 : 0), z: z + 0.5 + (k < 2 ? 3 : -3), key: `${plan.key}:s${k}` });
      plan.mobs.push({ type: 'snoutling_brute', x: x + 0.5, y: y + 9, z: z + 3.5, key: `${plan.key}:brute` });
      return true;
    } },
  { name: 'end_city', dim: 'end', spacing: 20, sep: 5, chance: 0.9, radius: 6, ok: (c) => c.h > 50,
    plan: (world, plan, x, z, c, rng) => {
      if (Math.hypot(x, z) < 1000) return false;
      const levels = 3 + Math.floor(rng() * 3);
      const y = c.h + 1;
      plan.add({ minX: x - 6, maxX: x + 6, minZ: z - 6, maxZ: z + 6, x, z, y, levels, build: buildEndCity });
      for (let k = 0; k < levels; k++) {
        const side = k % 2 ? 1 : -1;
        plan.mobs.push({ type: 'clamper', x: x + 0.5 + side * 4.5, y: y + 2 + k * 7, z: z + 0.5, key: `${plan.key}:c${k}` });
      }
      return true;
    } },
);
// ---- from 1.8 (only ever in land made from then on)
TYPES.push(
  { name: 'dungeon', since: NEW, spacing: 5, sep: 1, chance: 0.6, radius: 5, ok: (c) => c.h > 30,
    plan: (world, plan, x, z, c, rng) => {
      const top = Math.min(c.h - 12, 54);
      if (top < 15) return false;
      const y = 10 + Math.floor(rng() * (top - 10));
      const hw = 3 + Math.floor(rng() * 2), hd = 3 + Math.floor(rng() * 2);
      const r = rng();
      const chests = [[-(hw - 1), 1 - (hd - 1), 3]];
      if (rng() < 0.6) chests.push([hw - 1, hd - 2, 1]);
      const doors = [[[hw, 0]], [[-hw, 0]], [[0, hd]], [[0, -hd]], [[hw, 0], [0, -hd]], [[-hw, 0], [0, hd]]][Math.floor(rng() * 6)];
      plan.add({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, x, y, z, hw, hd, chests, doors, under: true,
        spawn: r < 0.5 ? SPAWN_ZOMBIE : r < 0.75 ? SPAWN_SKELETON : SPAWN_SPIDER, build: buildDungeon });
      return true;
    } },
  { name: 'mineshaft', since: NEW, spacing: 17, sep: 6, chance: 0.7, radius: 78, ok: (c) => c.h > 44, plan: planMineshaft },
  { name: 'buried_treasure', since: NEW, spacing: 6, sep: 2, chance: 0.65, radius: 2, ok: (c) => c.biome === BIOME.BEACH && c.h >= SEA,
    plan: (world, plan, x, z, c) => {
      plan.add({ minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1, x, y: c.h - 2, z, under: true, build: buildBuriedTreasure });
      plan.chest = { x, y: c.h - 2, z };
      return true;
    } },
);
// (new kinds go on the end: a kind's place in the list is part of how its spots are picked)
TYPES.push(
  // (1.10) the fortress and the bastions as they are now: only in land nobody had seen before
  { name: 'nether_fortress', dim: 'nether', since: 5, spacing: 13, sep: 4, chance: 0.75, radius: 46, ok: () => true, plan: planNetherFortress },
  { name: 'nether_bastion', dim: 'nether', since: 5, spacing: 14, sep: 4, chance: 0.7, radius: 44, ok: (c) => c.biome !== NB.BASALT, plan: planNetherBastion },
);
const dimOf = (T) => T.dim || 'overworld';
const TYPE_BY_NAME = Object.fromEntries(TYPES.map((t, i) => [t.name, { ...t, index: i }]));
TYPES.forEach((t, i) => { t.index = i; });

// The plan a region makes of its structure under the old rules or the new ones, or null
function buildPlan(world, T, rx, rz, v4) {
  const salt = 0x9e37 + T.index * 7919;
  if (hash3(world.seed ^ salt, rx, 0, rz) > T.chance) return null;
  const span = T.spacing - T.sep;
  const ocx = rx * T.spacing + Math.floor(hash3(world.seed ^ salt, rx, 1, rz) * span);
  const ocz = rz * T.spacing + Math.floor(hash3(world.seed ^ salt, rx, 2, rz) * span);
  const x = ocx * CS + 8, z = ocz * CS + 8;
  // (old rules are worked out on the land as it was, wherever that is)
  const colAt = v4 || world.dim !== 'overworld' ? (px, pz) => world.column(px, pz) : (px, pz) => world.columnOld(px, pz);
  const col = colAt(x, z);
  if (!(v4 && T.ok4 ? T.ok4(col) : T.ok(col))) return null;
  const hcache = new Map();
  const plan = {
    type: T.name, key: `${T.name}:${rx}:${rz}`, rx, rz, x, z, v4, parts: [], mobs: [],
    minX: x, maxX: x, minZ: z, maxZ: z,
    ground(px, pz) {
      const k = px + ',' + pz;
      let h = hcache.get(k);
      if (h === undefined) { h = colAt(px, pz).h; hcache.set(k, h); }
      return h;
    },
    add(p) {
      this.parts.push(p);
      this.minX = Math.min(this.minX, p.minX); this.maxX = Math.max(this.maxX, p.maxX);
      this.minZ = Math.min(this.minZ, p.minZ); this.maxZ = Math.max(this.maxZ, p.maxZ);
    },
  };
  const rng = mulberry32((hash3(world.seed ^ salt, rx, 3, rz) * 4294967296) >>> 0);
  if (!T.plan(world, plan, x, z, col, rng)) return null;
  return plan;
}

// What a region held under the rules up to 1.7 (whether or not it is still there)
function oldPlan(world, T, rx, rz) {
  if (T.since >= NEW) return null;
  const key = `old:${T.name}:${rx}:${rz}`;
  const cache = world.structureCache;
  if (cache.has(key)) return cache.get(key);
  cache.set(key, null);
  const plan = buildPlan(world, T, rx, rz, false);
  if (plan) plan.gen = world.genOver(plan.minX, plan.maxX, plan.minZ, plan.maxZ);
  cache.set(key, plan);
  return plan;
}

// The structure a region really has. A world that began in 1.8 or later follows the new rules. In an
// older one, a structure of the old rules that reaches into land someone has seen stays, built as it
// always was; anywhere else the new rules decide, and their structures keep wholly to unseen land.
function regionPlan(world, T, rx, rz) {
  const key = `${T.name}:${rx}:${rz}`;
  const cache = world.structureCache;
  if (cache.has(key)) return cache.get(key);
  cache.set(key, null);
  let plan = null;
  if (T.until || T.since > NEW) {
    // Kinds that changed after 1.8: the old kind stands only where part of its land had been seen before
    // the change (so it is finished as it was begun), the new kind only where none of its land had been
    plan = buildPlan(world, T, rx, rz, true);
    if (plan) {
      const g = world.genOver(plan.minX, plan.maxX, plan.minZ, plan.maxZ);
      if (T.until ? g >= T.until : g < T.since) plan = null; else plan.gen = g;
    }
  } else if (!world.mixed) {
    plan = buildPlan(world, T, rx, rz, true);
    if (plan) plan.gen = NEW;
  } else {
    const old = oldPlan(world, T, rx, rz);
    if (old && old.gen < NEW) plan = old;
    else {
      const nw = buildPlan(world, T, rx, rz, true);
      if (nw && world.genOver(nw.minX, nw.maxX, nw.minZ, nw.maxZ) >= NEW) { plan = nw; plan.gen = NEW; }
    }
  }
  cache.set(key, plan);
  return plan;
}

// Is a structure of the given type centred within `dist` blocks of (x, z)? (v4: among the structures
// that are really there; otherwise among those of the old rules, as an old structure being planned saw them)
function nearStructure(world, name, x, z, dist, v4 = true) {
  const T = TYPE_BY_NAME[name];
  const S = T.spacing * CS;
  const r0x = Math.floor((x - dist) / S), r1x = Math.floor((x + dist) / S);
  const r0z = Math.floor((z - dist) / S), r1z = Math.floor((z + dist) / S);
  for (let rx = r0x; rx <= r1x; rx++) for (let rz = r0z; rz <= r1z; rz++) {
    const p = v4 ? regionPlan(world, TYPES[T.index], rx, rz) : oldPlan(world, TYPES[T.index], rx, rz);
    if (p && Math.hypot(p.x - x, p.z - z) < dist) return true;
  }
  return false;
}

// Called for every newly generated chunk
export function stampStructures(world, chunk) {
  const cx = chunk.cx, cz = chunk.cz;
  const cminX = cx * CS, cmaxX = cminX + CS - 1, cminZ = cz * CS, cmaxZ = cminZ + CS - 1;
  const cbox = { minX: cminX, maxX: cmaxX, minZ: cminZ, maxZ: cmaxZ };
  if (world.dim === 'overworld') {
    for (const plan of strongholdPlans(world)) {
      if (!overlaps(plan, cbox)) continue;
      const ctx = makeCtx(world, chunk, plan);
      for (const p of plan.parts) if (overlaps(p, cbox)) p.build(ctx, p);
    }
  }
  for (const T of TYPES) {
    if (dimOf(T) !== world.dim) continue;
    const rc = Math.ceil(T.radius / CS) + 1;
    const r0x = Math.floor((cx - rc) / T.spacing), r1x = Math.floor((cx + rc) / T.spacing);
    const r0z = Math.floor((cz - rc) / T.spacing), r1z = Math.floor((cz + rc) / T.spacing);
    for (let rx = r0x; rx <= r1x; rx++) for (let rz = r0z; rz <= r1z; rz++) {
      const plan = regionPlan(world, T, rx, rz);
      if (!plan || !overlaps(plan, cbox)) continue;
      const ctx = makeCtx(world, chunk, plan);
      for (const p of plan.parts) if (overlaps(plan.gen >= 3 && p.stamp ? p.stamp : p, cbox)) p.build(ctx, p);
      for (const m of plan.mobs) {
        if (m.x >= cminX && m.x < cmaxX + 1 && m.z >= cminZ && m.z < cmaxZ + 1) {
          const k = ckey(cx, cz);
          if (!world.pendingSpawns.has(k)) world.pendingSpawns.set(k, []);
          world.pendingSpawns.get(k).push(m);
        }
      }
    }
  }
}

// Footprints of structure parts near a chunk, so terrain generation can keep trees off them. A chunk
// made by an older version asks what it asked then: the structures of the old rules.
export function structurePartsNear(world, cx, cz, margin, g4 = true) {
  const box = { minX: cx * CS - margin, maxX: cx * CS + CS - 1 + margin, minZ: cz * CS - margin, maxZ: cz * CS + CS - 1 + margin };
  const out = [];
  for (const T of TYPES) {
    if (dimOf(T) !== world.dim || (!g4 && T.since >= NEW)) continue;
    const rc = Math.ceil((T.radius + margin) / CS) + 1;
    const r0x = Math.floor((cx - rc) / T.spacing), r1x = Math.floor((cx + rc) / T.spacing);
    const r0z = Math.floor((cz - rc) / T.spacing), r1z = Math.floor((cz + rc) / T.spacing);
    for (let rx = r0x; rx <= r1x; rx++) for (let rz = r0z; rz <= r1z; rz++) {
      const plan = g4 ? regionPlan(world, T, rx, rz) : oldPlan(world, T, rx, rz);
      if (!plan || !overlaps(plan, box)) continue;
      for (const p of plan.parts) if (!p.under && overlaps(p, box)) out.push(p);
    }
  }
  return out;
}

// Where a structure's creature was first put, from its key ('village:3:-2:golem'), or null
export function structureMob(world, key) {
  const m = /^([a-z_]+):(-?\d+):(-?\d+):/.exec(key || '');
  const T = m && TYPES.find((t) => t.name === m[1]);
  if (!T || dimOf(T) !== world.dim) return null;
  const plan = regionPlan(world, T, +m[2], +m[3]);
  return (plan && plan.mobs.find((s) => s.key === key)) || null;
}

// Nearest structures of a type (used by the locate helper in the debug screen)
export function structuresNear(world, x, z, radius, only = null) {
  const out = [];
  for (const T of TYPES) {
    if (dimOf(T) !== world.dim || (only && T.name !== only)) continue;
    const S = T.spacing * CS;
    for (let rx = Math.floor((x - radius) / S); rx <= Math.floor((x + radius) / S); rx++) {
      for (let rz = Math.floor((z - radius) / S); rz <= Math.floor((z + radius) / S); rz++) {
        const p = regionPlan(world, T, rx, rz);
        if (p) out.push({ type: T.name, x: p.x, z: p.z, dist: Math.hypot(p.x - x, p.z - z), plan: p });
      }
    }
  }
  return out.sort((a, b) => a.dist - b.dist);
}

// ---------------------------------------------------------------- treasure maps
// A map is for one buried treasure: the number of its region is kept in the map (in the stack's wear
// number, which a map has no other use for).
const mapCode = (rx, rz) => (rx + 8192) * 16384 + (rz + 8192) + 1;
// The map found in a chest at (x, z): to the nearest buried treasure, or 0 if there is none for a long way
export function treasureFor(world, x, z) {
  if (world.dim !== 'overworld') return 0;
  for (const radius of [400, 1100, 2400]) {
    const found = structuresNear(world, x, z, radius, 'buried_treasure')[0];
    if (found) return mapCode(found.plan.rx, found.plan.rz);
  }
  return 0;
}
// Where a map's treasure lies: { x, y, z }, or null if this world has none there
export function treasureAt(world, code) {
  if (world.dim !== 'overworld' || !(code > 0)) return null;
  const rx = Math.floor((code - 1) / 16384) - 8192, rz = ((code - 1) % 16384) - 8192;
  const plan = regionPlan(world, TYPES[TYPE_BY_NAME.buried_treasure.index], rx, rz);
  return plan ? plan.chest : null;
}
