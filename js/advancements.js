// Achievements: things to do as you make your way through the game, each worth some experience.
//
// They follow the goals of the original game's advancements (the ones that can be done here), under
// Blockcraft's own names. Each player has their own: what is done is kept with the player (p.adv), and how
// far along the bigger ones are (p.advData), so they stay through saves and online worlds.
import { G } from './game.js';
import { ITEMS, ID, B } from './blocks.js';
import { sfx } from './audio.js';
import { structuresNear } from './structures.js';
import { BIOME_NAMES, OVERWORLD_BIOMES } from './constants.js';
import { DIM_BIOME_NAMES } from './dims.js';

// Every monster there is to hunt, and every food there is to taste
const MONSTERS = ['zombie', 'husk', 'drowned', 'zombie_villager', 'skeleton', 'stray', 'spider', 'boomer', 'witch', 'slime', 'shade', 'gloomwing', 'pillager', 'vindicator',
  'wailer', 'cinder', 'magma_slime', 'snoutling', 'snoutling_brute', 'rotting_snoutling', 'tusker', 'rotting_tusker', 'charred_skeleton', 'shademite', 'clamper', 'void_dragon'];
const FOODS = () => ITEMS.filter((it) => it && it.food).map((it) => it.key);
const NETHER_BIOMES = [20, 21, 22, 23, 24];

// key, tab, title, what to do, icon (an item), experience; `has`: holding any of these items does it;
// `wear`: wearing armour of this material; `all`: a list to work through (shown as 3 / 9)
export const TABS = [['story', 'Blockcraft'], ['nether', 'The Nether'], ['end', 'The End'], ['adventure', 'Adventure'], ['farming', 'Field and Stream']];
export const ADV = [
  // ---- the story of the game
  { key: 'start', tab: 'story', title: 'Blockcraft', desc: 'Make a crafting table.', icon: 'crafting_table', xp: 5, has: ['crafting_table'] },
  { key: 'stone', tab: 'story', title: 'Harder Stuff', desc: 'Dig up stone with a pickaxe.', icon: 'cobblestone', xp: 5, has: ['cobblestone', 'cobbled_deepslate', 'blackstone'] },
  { key: 'stone_pick', tab: 'story', title: 'A Better Pick', desc: 'Make a stone pickaxe.', icon: 'stone_pickaxe', xp: 5, has: ['stone_pickaxe'] },
  { key: 'iron', tab: 'story', title: 'Out of the Furnace', desc: 'Smelt an iron ingot.', icon: 'iron_ingot', xp: 10, has: ['iron_ingot'] },
  { key: 'iron_armor', tab: 'story', title: 'Dressed in Iron', desc: 'Put on a piece of iron armour.', icon: 'iron_chestplate', xp: 10, wear: 'iron' },
  { key: 'lava', tab: 'story', title: 'Handle With Care', desc: 'Fill a bucket with lava.', icon: 'lava_bucket', xp: 10, has: ['lava_bucket'] },
  { key: 'iron_pick', tab: 'story', title: 'Iron in Hand', desc: 'Make an iron pickaxe.', icon: 'iron_pickaxe', xp: 10, has: ['iron_pickaxe'] },
  { key: 'deflect', tab: 'story', title: 'Not This Time', desc: 'Stop an arrow or a fireball with a shield.', icon: 'shield', xp: 10 },
  { key: 'obsidian', tab: 'story', title: 'Black Glass', desc: 'Get a block of obsidian.', icon: 'obsidian', xp: 10, has: ['obsidian'] },
  { key: 'diamond', tab: 'story', title: 'Something Shiny', desc: 'Find a diamond.', icon: 'diamond', xp: 20, has: ['diamond'] },
  { key: 'diamond_armor', tab: 'story', title: 'Bright Blue Armour', desc: 'Put on a piece of diamond armour.', icon: 'diamond_chestplate', xp: 25, wear: 'diamond' },
  { key: 'enchant', tab: 'story', title: 'Words of Power', desc: 'Enchant something at an enchanting table.', icon: 'enchanting_table', xp: 25 },
  { key: 'nether', tab: 'story', title: 'Through the Fire', desc: 'Build a Nether portal, light it, and step through.', icon: 'flint_and_steel', xp: 25 },
  { key: 'eye', tab: 'story', title: 'Follow the Eye', desc: 'Put an Eye of the Shade in an End portal frame.', icon: 'shade_eye', xp: 25 },
  { key: 'end', tab: 'story', title: 'Past the Edge', desc: 'Jump into the End portal.', icon: 'end_stone', xp: 50 },
  // ---- the Nether
  { key: 'nether_in', tab: 'nether', title: 'The Nether', desc: 'Bring summer clothes: enter the Nether.', icon: 'netherrack', xp: 10 },
  { key: 'fireball', tab: 'nether', title: 'Right Back at You', desc: "Destroy a Wailer with its own fireball.", icon: 'wailer_tear', xp: 50, hard: true },
  { key: 'fortress', tab: 'nether', title: 'Walls of Dark Brick', desc: 'Find your way into a Nether fortress.', icon: 'nether_bricks', xp: 25 },
  { key: 'bastion', tab: 'nether', title: 'Halls of Blackstone', desc: 'Find a bastion.', icon: 'blackstone', xp: 25 },
  { key: 'bastion_loot', tab: 'nether', title: 'Their Gold, Now Yours', desc: 'Open a chest in a bastion.', icon: 'gold_block', xp: 25 },
  { key: 'rod', tab: 'nether', title: 'Rod of Embers', desc: 'Take a rod from a Cinder.', icon: 'cinder_rod', xp: 20, has: ['cinder_rod'] },
  { key: 'skull', tab: 'nether', title: 'A Grim Keepsake', desc: "Get a Charred Skeleton's skull.", icon: 'charred_skull', xp: 50, has: ['charred_skull'] },
  { key: 'blight_wake', tab: 'nether', title: 'Three Heads Are Worse Than One', desc: 'Wake the Blight: three Charred Skulls in a row on a T of soul sand.', icon: 'soul_sand', xp: 50 },
  { key: 'blight', tab: 'nether', title: "Blight's End", desc: 'Destroy the Blight.', icon: 'blight_star', xp: 100, hard: true },
  { key: 'beacon', tab: 'nether', title: 'A Light for Miles', desc: 'Stand by a beacon that is lit: one set on nine blocks of iron, gold, diamond or emerald.', icon: 'beacon', xp: 100, hard: true },
  { key: 'shortcut', tab: 'nether', title: 'A Shortcut Through Fire', desc: 'Use the Nether to travel 7,000 blocks in the Overworld.', icon: 'obsidian', xp: 100, hard: true },
  { key: 'nether_lands', tab: 'nether', title: 'Hot Spots', desc: 'Visit every kind of land in the Nether.', icon: 'crimson_nylium', xp: 100, hard: true, all: NETHER_BIOMES, names: (b) => DIM_BIOME_NAMES[b] },
  // ---- the End
  { key: 'end_in', tab: 'end', title: 'The End', desc: 'Or the beginning? Enter the End.', icon: 'end_stone', xp: 25 },
  { key: 'dragon', tab: 'end', title: 'The Void Goes Quiet', desc: 'Defeat the Void Dragon.', icon: 'dragon_egg', xp: 100, hard: true },
  { key: 'egg', tab: 'end', title: 'The Last Egg', desc: 'Hold the dragon egg.', icon: 'dragon_egg', xp: 50, has: ['dragon_egg'] },
  { key: 'gateway', tab: 'end', title: 'A Door in the Sky', desc: 'Go through an End gateway.', icon: 'shade_pearl', xp: 25 },
  { key: 'end_city', tab: 'end', title: 'City at the Edge', desc: 'Find an End city.', icon: 'violetstone', xp: 50 },
  { key: 'float', tab: 'end', title: 'Up, Up and Away', desc: "Float up 50 blocks after a Clamper's shot.", icon: 'clamper_shell', xp: 50, hard: true },
  // ---- adventure
  { key: 'adventure', tab: 'adventure', title: 'Adventure', desc: 'Kill something, or be killed by something.', icon: 'stone_sword', xp: 5 },
  { key: 'monster', tab: 'adventure', title: 'Monster Slayer', desc: 'Kill a monster.', icon: 'iron_sword', xp: 10 },
  { key: 'bestiary', tab: 'adventure', title: 'A Full Bestiary', desc: 'Kill one of every kind of monster.', icon: 'diamond_sword', xp: 100, hard: true, all: MONSTERS, names: (t) => t.replace(/_/g, ' ') },
  { key: 'trade', tab: 'adventure', title: 'A Fair Trade', desc: 'Trade with a villager.', icon: 'emerald', xp: 10 },
  { key: 'high_trade', tab: 'adventure', title: 'Top of the Market', desc: 'Trade with a villager at the very top of the world.', icon: 'emerald_block', xp: 50, hard: true },
  { key: 'sleep', tab: 'adventure', title: 'Good Night', desc: 'Sleep in a bed.', icon: 'bed_foot', xp: 10 },
  { key: 'arrow', tab: 'adventure', title: 'Straight and True', desc: 'Hit something with an arrow.', icon: 'bow', xp: 10 },
  { key: 'sniper', tab: 'adventure', title: 'From a Long Way Off', desc: 'Kill a Skeleton with an arrow from 50 blocks away.', icon: 'arrow', xp: 50, hard: true },
  { key: 'crossbow', tab: 'adventure', title: 'Thunk', desc: 'Shoot a crossbow.', icon: 'crossbow', xp: 10 },
  { key: 'pillager', tab: 'adventure', title: 'Their Own Medicine', desc: 'Kill a Pillager with a crossbow.', icon: 'crossbow', xp: 25 },
  { key: 'two_birds', tab: 'adventure', title: 'Two With One', desc: 'Kill two Gloomwings with one piercing bolt.', icon: 'gloom_membrane', xp: 65, hard: true },
  { key: 'skewer', tab: 'adventure', title: 'Skewered', desc: 'Kill five different kinds of creature with one crossbow shot.', icon: 'crossbow', xp: 85, hard: true },
  { key: 'treasure', tab: 'adventure', title: 'X Marks the Spot', desc: 'Dig up a buried treasure. The map to it lies in a sunken ship.', icon: 'treasure_map', xp: 50 },
  { key: 'trident', tab: 'adventure', title: 'Stuck the Landing', desc: 'Hit something with a thrown trident.', icon: 'trident', xp: 25 },
  { key: 'lightning', tab: 'adventure', title: 'Bolt From the Blue', desc: 'Call lightning down on a villager with a Channeling trident.', icon: 'trident', xp: 50, hard: true },
  { key: 'fall', tab: 'adventure', title: 'The Long Way Down', desc: 'Fall a hundred blocks and live.', icon: 'water_bucket', xp: 30, hard: true },
  { key: 'lands', tab: 'adventure', title: 'Seen It All', desc: 'Visit every kind of land in the Overworld.', icon: 'diamond_boots', xp: 500, hard: true, all: OVERWORLD_BIOMES, names: (b) => BIOME_NAMES[b] },
  { key: 'anvil', tab: 'adventure', title: 'Hammer and Tongs', desc: 'Mend or combine something on an anvil.', icon: 'anvil', xp: 10 },
  // ---- farming and fishing
  { key: 'eat', tab: 'farming', title: 'Field and Stream', desc: 'Eat something.', icon: 'apple', xp: 5 },
  { key: 'seed', tab: 'farming', title: 'Sow and Wait', desc: 'Plant seeds and watch them grow.', icon: 'wheat_seeds', xp: 5 },
  { key: 'fish', tab: 'farming', title: 'Something on the Line', desc: 'Catch a fish.', icon: 'fishing_rod', xp: 10 },
  { key: 'treasure', tab: 'farming', title: 'Better Than Fish', desc: 'Fish up something enchanted.', icon: 'enchanted_book', xp: 25 },
  { key: 'hoe', tab: 'farming', title: 'Seriously Dedicated', desc: 'Make a diamond hoe.', icon: 'diamond_hoe', xp: 50, has: ['diamond_hoe'] },
  { key: 'diet', tab: 'farming', title: 'A Taste of Everything', desc: 'Eat every kind of food.', icon: 'bread', xp: 100, hard: true, all: FOODS, names: (k) => (ITEMS[ID[k]] ? ITEMS[ID[k]].name : k) },
];
const BY_KEY = Object.fromEntries(ADV.map((a) => [a.key, a]));
const listOf = (a) => (typeof a.all === 'function' ? a.all() : a.all);

export class Advancements {
  constructor() { this.t = 0; this.shots = new Map(); this.peak = null; this.floatFrom = null; }

  done(key) { return G.player.adv.has(key); }
  // How far along an achievement with several parts is: [done, of]
  progress(a) {
    const l = listOf(a), have = new Set(G.player.advData[a.key] || []);
    return [l.filter((x) => have.has(x)).length, l.length];
  }
  missing(a) { const have = new Set(G.player.advData[a.key] || []); return listOf(a).filter((x) => !have.has(x)); }

  // One made: a note on the screen, its experience, and (online) everyone hears of it
  grant(key) {
    const p = G.player, a = BY_KEY[key];
    if (!p || !a || p.adv.has(key) || G.state !== 'playing') return;
    p.adv.add(key);
    sfx('achieve', null, { vol: 0.8 });
    G.ui.achievement(a);
    if (a.xp) G.entities.spawnXp(p.pos.x, p.pos.y + 1.2, p.pos.z, a.xp, 0.6);
    if (G.net) G.net.announce(`${G.net.name} has made the achievement [${a.title}]`);
    if (G.game.saveSoon) G.game.saveSoon();
  }
  // One part of an achievement that has many (a monster killed, a land visited, a food eaten)
  part(key, what) {
    const p = G.player, a = BY_KEY[key];
    if (!p || p.adv.has(key) || !listOf(a).includes(what)) return;
    const d = p.advData[key] || (p.advData[key] = []);
    if (d.includes(what)) return;
    d.push(what);
    if (this.progress(a)[0] >= listOf(a).length) { this.grant(key); delete p.advData[key]; }
  }

  // ---------------------------------------------------------------- things the game reports
  did(key) {
    if (key === 'lightning_villager') this.grant('lightning');
    else this.grant(key);
  }
  hit() {}
  // an arrow, bolt or thrown trident of yours struck something
  shot(mob, far, arrow) {
    if (arrow.trident) this.grant('trident'); else this.grant('arrow');
  }
  // something you killed (info: t type, a how far the arrow flew, b by a crossbow bolt, s which shot, f by its own fireball)
  kill(info) {
    this.grant('adventure');
    if (MONSTERS.includes(info.t)) { this.grant('monster'); this.part('bestiary', info.t); }
    if (info.t === 'skeleton' && info.a >= 50) this.grant('sniper');
    if (info.t === 'wailer' && info.f) this.grant('fireball');
    if (info.t === 'void_dragon') this.grant('dragon');
    if (info.t === 'blight') this.grant('blight');
    if (info.b) {
      if (info.t === 'pillager') this.grant('pillager');
      // everything one crossbow shot has killed
      const s = this.shots.get(info.s) || [];
      s.push(info.t);
      this.shots.set(info.s, s);
      if (this.shots.size > 20) this.shots.delete(this.shots.keys().next().value);
      if (s.filter((t) => t === 'gloomwing').length >= 2) this.grant('two_birds');
      if (new Set(s).size >= 5) this.grant('skewer');
    }
  }
  died() { this.grant('adventure'); }
  mined() {}
  smelted() {}
  fished(stack) {
    if (stack.id === ID.cod || stack.id === ID.salmon) this.grant('fish');
    if (stack.e) this.grant('treasure');
  }
  traded() {
    this.grant('trade');
    if (G.player.pos.y >= 119) this.grant('high_trade');
  }
  ate(id) { this.grant('eat'); if (ITEMS[id]) this.part('diet', ITEMS[id].key); }
  // arriving in a dimension
  entered(dim, from) {
    const p = G.player, d = p.advData;
    if (dim === 'nether') { this.grant('nether'); this.grant('nether_in'); if (from === 'overworld' && d.leftAt === undefined) d.leftAt = [Math.round(p.pos.x * 8), Math.round(p.pos.z * 8)]; }
    if (dim === 'end') { this.grant('end'); this.grant('end_in'); }
    if (dim === 'overworld' && from === 'nether' && d.leftAt) {
      // (how far from where you went in to where you came out)
      if (Math.hypot(p.pos.x - d.leftAt[0], p.pos.z - d.leftAt[1]) >= 7000) this.grant('shortcut');
      delete d.leftAt;
    }
  }

  // ---------------------------------------------------------------- things looked for now and then
  tick(dt) {
    const p = G.player, w = G.world;
    if (!p || !w || p.dead || G.state !== 'playing') return;
    // a long fall survived: from the highest point since the feet last touched something
    if (p.flying || p.creative) this.peak = null;
    else if (p.onGround || p.inWater) {
      if (this.peak !== null && this.peak - p.pos.y >= 100 && p.health > 0) this.grant('fall');
      this.peak = null;
    } else this.peak = Math.max(this.peak ?? p.pos.y, p.pos.y);
    // floating up after a clamper's shot
    if (p.effects.levitation > 0) {
      if (this.floatFrom === null) this.floatFrom = p.pos.y;
      else if (p.pos.y - this.floatFrom >= 50) this.grant('float');
    } else this.floatFrom = null;

    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    // what is carried and worn
    const have = new Set();
    for (const s of p.inv.slots) if (s) have.add(s.id);
    if (p.off[0]) have.add(p.off[0].id);
    const worn = new Set(p.armor.filter(Boolean).map((s) => ITEMS[s.id].material));
    for (const a of ADV) {
      if (p.adv.has(a.key)) continue;
      if (a.has && a.has.some((k) => have.has(ID[k]))) this.grant(a.key);
      else if (a.wear && worn.has(a.wear)) this.grant(a.key);
    }
    // where you are: the kind of land, and the great buildings of the Nether and the End
    const bx = Math.floor(p.pos.x), bz = Math.floor(p.pos.z);
    const chunk = w.getChunk(bx >> 4, bz >> 4);
    if (chunk) {
      const biome = chunk.biomes[((bz & 15) << 4) | (bx & 15)];
      if (G.dim === 'overworld') this.part('lands', biome);
      else if (G.dim === 'nether') this.part('nether_lands', biome);
    }
    if (G.dim === 'end' && w.flags && w.flags.dragonKilled && this.dragonSeen) this.grant('dragon');
    if (G.dim === 'end' && G.boss) this.dragonSeen = true;   // (you were there for the fight)
    if (G.dim !== 'overworld' && (!p.adv.has('fortress') || !p.adv.has('bastion') || !p.adv.has('end_city'))) {
      for (const s of structuresNear(w, p.pos.x, p.pos.z, 48)) {
        const pl = s.plan;
        if (p.pos.x < pl.minX || p.pos.x > pl.maxX || p.pos.z < pl.minZ || p.pos.z > pl.maxZ) continue;
        if (s.type === 'fortress' || s.type === 'bastion' || s.type === 'end_city') this.grant(s.type);
      }
    }
  }
}
