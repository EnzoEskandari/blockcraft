// The game's updates, newest first. The title screen shows off the newest one, the way Minecraft does:
// its version and name in the corner, its splash lines, and a slowly turning view of a place that fits it
// behind the menus. What's New lists them all.
//
// For a new update: add it at the top with its own splashes, notes and scene (a seed and a spot in that
// world, plus any blocks to put there, e.g. torches to light a cave; or a build(put, sign) function that
// builds the scene around the world's spawn). Small updates keep the picture of the last big one.
// a torch-lit cavern in seed 7, with copper, iron, gold and redstone in its walls
const CAVERN = {
  seed: 7, x: -4.5, y: 28.4, z: -10.5, pitch: -0.08, time: 0.3, fog: [0.03, 0.03, 0.04],
  place: [[-1, 26, -11, 'torch'], [-6, 27, -7, 'torch'], [-8, 26, -13, 'torch'], [-3, 26, -17, 'torch'], [1, 27, -5, 'torch'], [-12, 28, -7, 'torch'],
    [-14, 28, -13, 'torch'], [-10, 26, -19, 'torch'], [3, 26, -16, 'torch'], [-5, 28, -1, 'torch'], [7, 27, -11, 'torch'], [-5, 25, -23, 'torch']],
};

// The middle of a village at sunset, seen from the roof of its well: houses with their job blocks, and on
// the green an enchanting table ringed with bookshelves, an anvil and a grindstone.
// put(dx, dy, dz, block, meta) and sign(dx, dy, dz, lines) work from the ground at the well; ground(dx, dz)
// says how much higher the land is elsewhere.
const MARKET = {
  seed: 1755, at: [-104, 168], view: [0, 0, 9.2], pitch: -0.2, time: 0.468,
  build(put, sign, ground) {
    // a paved corner between two houses, just big enough for the ring of shelves
    const ex = 7, ez = -13, g = ground(ex, ez);
    for (let x = -3; x <= 3; x++) for (let z = -2; z <= 2; z++) {
      for (let y = Math.min(g, ground(ex + x, ez + z)); y < g; y++) put(ex + x, y, ez + z, 'dirt');
      put(ex + x, g, ez + z, 'stone_bricks');
      for (let y = 1; y <= 3; y++) put(ex + x, g + y, ez + z, null);
    }
    put(ex, g + 1, ez, 'enchanting_table');
    // fifteen bookshelves around it (the side towards the well is left open)
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 1; z++) {
      if (Math.abs(x) !== 2 && z !== -2) continue;
      put(ex + x, g + 1, ez + z, 'bookshelf');
      if (z === -2 || (Math.abs(x) === 2 && z === -1)) put(ex + x, g + 2, ez + z, 'bookshelf');
    }
    put(ex - 3, g + 1, ez + 2, 'anvil', 1); put(ex + 3, g + 1, ez + 2, 'grindstone', 1);
    put(ex - 2, g + 2, ez + 1, 'torch'); put(ex + 2, g + 2, ez + 1, 'torch');
    put(ex - 3, g + 1, ez - 2, 'oak_fence'); put(ex - 3, g + 2, ez - 2, 'torch'); put(ex + 3, g + 1, ez - 2, 'oak_fence'); put(ex + 3, g + 2, ez - 2, 'torch');
    put(ex, g + 1, ez + 3, 'sign', 0); sign(ex, g + 1, ez + 3, ['Blockcraft 1.7', 'Trades &', 'Enchantments']);
  },
};

export const UPDATES = [
  {
    // a small update: it keeps the Trades & Enchantments picture
    version: '1.7.1', name: 'Join Codes', date: '2026-10-05',
    splashes: ['Got the code?', 'Six letters!', 'Enchanted!', 'Level 30!', 'Hire a villager!', 'From Novice to Master!', 'Gone fishing!', 'Achievement made!', 'Trade up!'],
    scene: MARKET,
    notes: [
      'Join a friend’s online world by typing its six-letter join code in the Multiplayer screen. No link needed (links still work).',
      'Your own world’s code is shown in the Multiplayer list and in the game menu while you play, so you can just read it out.',
      'Tidying the Multiplayer list: anyone can take a world off their own list (its code brings it back), and whoever made a world can choose between taking it off their list and deleting it for everyone.',
    ],
  },
  {
    version: '1.7', name: 'Trades & Enchantments', date: '2026-10-04',
    splashes: ['Enchanted!', 'Level 30!', 'Fifteen bookshelves!', 'Hire a villager!', 'From Novice to Master!', 'Good night, villagers!', 'Gone fishing!', 'More diamonds!',
      'Achievement made!', 'Mind the anvil!', 'Sharpness V!', 'Trade up!'],
    scene: MARKET,
    notes: [
      'Enchanting: an enchanting table (a book, two diamonds and four obsidian) puts enchantments on tools, weapons, armour and books for levels and lapis lazuli. Bookshelves around it bring better ones: fifteen for level 30. All 39 of Minecraft\'s classic enchantments are in, from Sharpness and Fortune to Mending.',
      'Experience: killing monsters, mining ores, smelting, fishing and trading leave orbs that fill the green bar. Dying drops some of it where you fell.',
      'An anvil combines items and enchanted books and mends things; a grindstone takes enchantments off.',
      'Villagers have levels, from Novice to Master: the more you trade with one, the more it has to offer. Librarians sell enchanted books, smiths enchanted gear.',
      'Job blocks: a villager with no work takes up the trade of a free composter, lectern, blast furnace, grindstone, smithing table, smoker, fletching table, brewing stand, loom, cauldron or stonecutter nearby.',
      'At sunset villagers walk home, open and shut their doors, and sleep in their beds until morning.',
      'New villages have job blocks in their houses and steps to every door. Villages you have already seen stay as they are.',
      'Achievements: 53 things to do, each worth experience. Press L, or find them in the game menu.',
      'A fishing rod, a crossbow and a trident, each with its own enchantments.',
      'Half as many diamonds again.',
      'From now on updates only change land nobody has been to: everywhere you have explored stays exactly as it was.',
    ],
  },
  {
    // a small update: it keeps the Caves & Ores picture
    version: '1.6.3', name: 'Building Blocks', date: '2026-10-04',
    splashes: ['Slabs!', 'Half a block!', 'Trapdoors!', 'Read the sign!', 'Torches on walls!', 'Mind the cactus!', 'Caves & Ores!', 'Bring torches!'],
    scene: CAVERN,
    notes: [
      'Slabs: half blocks in 17 materials (three blocks in a row make six). Place them in the bottom or top half; two of a kind make the full block. You walk up them without jumping.',
      'Trapdoors in five woods (six planks make two): click to open and shut, in the top or bottom half of a block.',
      'Signs (six planks and a stick make three): stand them on a block or hang them on a wall, and write four lines. Click a sign to change what it says.',
      'Torches go on walls now: on the side of any solid block, glass and leaves included. They fall off if the wall is taken away.',
      'Cactus pricks: touching one hurts you, and monsters and animals too.',
    ],
  },
  {
    // a small update: it keeps the Caves & Ores picture
    version: '1.6.2', name: 'Steady Hands & Calmer Fire', date: '2026-10-04',
    splashes: ['Steady hands!', 'Fire, but calmer!', 'Punch the flames!', 'Shields up!', 'Press F!', 'Caves & Ores!', 'Bring torches!'],
    scene: CAVERN,
    notes: [
      'What you hold no longer shakes when you walk or run: it sways gently with your steps.',
      'Fire spreads much more slowly, each flame burns out within about half a minute, and a big fire stops growing until it has died down. Punch flames or pour water on them to put them out.',
    ],
  },
  {
    // a small update: it keeps the Caves & Ores picture
    version: '1.6.1', name: 'Shields & Off Hand', date: '2026-10-04',
    splashes: ['Shields up!', 'Two hands now!', 'Press F!', 'Torch in the other hand!', 'Light it up or else!', 'Caves & Ores!', 'Now with deepslate!', 'Bring torches!'],
    scene: CAVERN,
    notes: [
      'Shields: craft one from six planks and an iron ingot. Hold right click (or the shield button on iPad) to raise it and stop hits, arrows, fireballs and blasts from the front. Axes knock it down for a few seconds.',
      'An off hand: press F to swap what you hold into it (on iPad, tap the slot left of the hotbar). Blocks and items there are used when your main hand has nothing to do, so you can place torches while holding a pickaxe.',
      'Other players see your shield and off-hand item.',
      'Monsters now appear by light level, like Minecraft: anywhere with no torchlight and little sky light, day or night. Dark caves and unlit rooms are dangerous in the daytime, and torches keep them away.',
    ],
  },
  {
    version: '1.6', name: 'Caves & Ores', date: '2026-10-02',
    splashes: ['Caves & Ores!', 'Now with deepslate!', 'Copper!', 'Mind the drop!', 'Bring torches!', 'Diamonds live deep!', 'Tunnels everywhere!'],
    scene: CAVERN,
    notes: [
      'New caves: winding tunnels that slope down gently, branch, and open onto the surface, with big caverns deep down. No more surprise pits.',
      'Deepslate below y 31, with its own ores, plus tuff, granite, diorite and andesite in the cave walls.',
      'Ores where Minecraft puts them: diamonds and redstone deep down, iron and copper in the middle and up in the mountains, coal higher up, emeralds in mountains.',
      'Copper ore, copper ingots and blocks of copper. Stone tools and furnaces can be made from cobbled deepslate too.',
      'Places you have already been in your worlds keep their old caves and ores. The new ones are everywhere else.',
      'Boomers can no longer see through glass or leaves, and calm down if you step back a little.',
      'Admins: /kill, /kick, /ban and more in multiplayer chat, and an Admin page listing every account.',
      'Updates now show up on the title screen, with a picture to match.',
    ],
  },
  {
    version: '1.5', name: 'Water, Light & Friends', date: '2026-10-01',
    notes: [
      'Water and lava flow like Minecraft: from a source, towards drops, and drain away when cut off.',
      'Brighter caves and moonlit nights. Monsters notice you later and hit softer; a calmer Nether.',
      'A tall Boomer. Being on fire shows flames.',
      'Online worlds are private until you share their link. Other players show their armour and what they hold.',
    ],
  },
  {
    version: '1.4', name: 'The Nether & The End', date: '2026-09-29',
    notes: ['Portals, the Nether and the End, with their creatures, fortresses, bastions and end cities.', 'Strongholds, Eyes of the Shade, the Void Dragon and the credits.'],
  },
  {
    version: '1.3', name: 'Accounts', date: '2026-09-29',
    notes: ['Sign in so your items stay yours in every online world. Better loot in structures.'],
  },
  {
    version: '1.2', name: 'Online Worlds', date: '2026-09-28',
    notes: ['Online worlds that are always there, each with its own link.'],
  },
  {
    version: '1.1', name: 'Multiplayer', date: '2026-09-28',
    notes: ['Play together, with PvP and shared items. Better controls on iPad.'],
  },
  {
    version: '1.0', name: 'Blockcraft', date: '2026-09-27',
    notes: ['The first version: survival and creative, villages, temples, mobs and more.'],
  },
];
export const LATEST = UPDATES[0];
