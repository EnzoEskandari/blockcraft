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

// Where three of the new lands meet: the striped tablelands of the badlands underfoot, a cherry grove on
// one side and a badlands village under the mountain on the other, in the late afternoon. Close by, on a
// little stone floor: two Charred Skulls on a T of soul sand, one short of waking the Wither.
// (rad: how many chunks round the spot are made; the usual three would hide all this in the mist)
const TABLELANDS = {
  seed: 2024, at: [102, 102], view: [0, 0, 9], pitch: -0.14, time: 0.4, rad: 4,
  build(put, sign, ground) {
    const ex = 7, ez = -5, g = ground(ex, ez);
    for (let x = -2; x <= 2; x++) for (let z = -1; z <= 1; z++) {
      for (let y = Math.min(g, ground(ex + x, ez + z)); y < g; y++) put(ex + x, y, ez + z, 'terracotta');
      put(ex + x, g, ez + z, 'stone_bricks');
      for (let y = 1; y <= 4; y++) put(ex + x, g + y, ez + z, null);
    }
    put(ex, g + 1, ez, 'soul_sand');
    for (const d of [-1, 0, 1]) put(ex + d, g + 2, ez, 'soul_sand');
    put(ex - 1, g + 3, ez, 'charred_skull_block', 0); put(ex, g + 3, ez, 'charred_skull_block', 0);
    put(ex + 2, g + 1, ez + 1, 'sign', 0); sign(ex + 2, g + 1, ez + 1, ['Blockcraft 1.8', 'Lands &', 'Legends']);
  },
};

// Out on a lake in the late afternoon: the new water all round, a cherry tree and a birch grove on the
// shore, and sugar cane on the beach. (The view stands above the water: the lake bed is 8 blocks down.)
const LAKESIDE = { seed: 2024, at: [2, -22], view: [0, 0, 12.5], pitch: -0.03, time: 0.42, rad: 4, build() {} };

// On a bastion's great bridge in the Nether: the hoard of gold at the middle of the span, a gate tower at
// each end, lamps along the parapets, and the lava sea a long way down. (The Nether has no ground level:
// heights are counted from 64, and the deck is at 47.)
const BASTION_BRIDGE = {
  seed: 2024, dim: 'nether', at: [552, -328], view: [5, 0, -13.1], pitch: -0.1, time: 0.3, rad: 5, fog: [0.16, 0.03, 0.02],
  build(put) {
    // glowstone on the posts of the parapet, and braziers of it in the towers' windows
    for (let a = -20; a <= 20; a += 4) for (const c of [-4, 4]) put(a, -14, c, 'glowstone');
    for (const s of [-1, 1]) for (const c of [-3, 3]) { put(s * 23, -13, c, 'shroomlight'); put(s * 23, -8, c, 'glowstone'); }
    // a few more blocks of the hoard, and a strider's saddle left on a chest
    for (const [dx, dz] of [[2, 1], [-2, -1], [1, -2]]) put(dx, -16, dz, 'gold_block');
  },
};

export const UPDATES = [
  {
    // a small update: it keeps the Nether & Noise picture
    version: '1.10.1', name: 'Rings & Swings', date: '2026-10-09',
    splashes: ['Saddle up!', 'Neigh!', 'Hee-haw!', 'Mind the lava!', 'Knock it back!', 'Row, row, row!', 'Black brick and gold!', 'Four new lands!', 'It moos now!', 'Two eyes each!',
      'Swim for it!', 'Ride a strider!', 'What a hoard!', 'Baa!'],
    scene: BASTION_BRIDGE,
    notes: [
      'Your bare arm is back where it was and swings the way it used to when you mine or punch.',
      'Cherry and acacia logs show rings on their cut ends, like every other log, instead of looking like planks.',
    ],
  },
  {
    version: '1.10', name: 'Nether & Noise', date: '2026-10-09',
    splashes: ['Saddle up!', 'Neigh!', 'Hee-haw!', 'Mind the lava!', 'Knock it back!', 'Row, row, row!', 'Black brick and gold!', 'Four new lands!', 'It moos now!', 'Two eyes each!',
      'Swim for it!', 'Ride a strider!', 'What a hoard!', 'Baa!'],
    scene: BASTION_BRIDGE,
    notes: [
      'The biggest update yet. Everything you have built and everywhere you have been stays exactly as it was: the new lands, bastions and fortresses are in parts of the Nether nobody has visited yet.',
      'Horses and donkeys roam the plains, savannas and meadows. Get on one and hold on: it throws you off until it trusts you (feeding it apples, wheat or bread helps). Once it is tame, put a saddle on it and ride it where you like. Horses are quick and jump two blocks; each one has its own pace. Sneak to get off.',
      'Saddles are made from three leather and an iron ingot, and turn up in chests. Horse armour (leather, iron, golden, diamond) protects a horse: leather armour can be made, the rest is found. Sneak and use an empty hand to take a saddle or armour off again.',
      'Boats: five planks in a U. Set one down on water and get in. A boat is the fastest way over water by far, and it gives you the boat back when you break it.',
      'Swimming: sprint with your head under water and you swim where you look, faster than paddling along the top. Getting through water on foot is slower than it was, by a little over half.',
      'Striders can be saddled and ridden across lava, and they keep you out of it.',
      'Bastions are new: strongholds of black brick held by snoutlings, in four kinds. The bridge, the stables (with tuskers in the pens and tack in the loft), the housing round its yard, and the treasure room, whose hoard stands on a tower in a pool of lava and is the best loot in the game.',
      'Fortresses are rebuilt: a maze of bridges and roofed rooms that is different every time, with cinder spawners on open platforms, gardens of nether wart, treasuries and lava wells.',
      'Four new lands in the Nether: the Obsidian Spires, the Fungal Caverns with mushrooms the size of trees, the burned-out Ashen Forest, and the Quartz Gardens where crystals grow from floor and roof.',
      'New blocks: polished blackstone bricks (plain, cracked and chiseled), crying obsidian, red and cracked nether bricks, ash, charred and smouldering logs, quartz pillars.',
      'A wailer\'s fireball can be knocked back properly now: swing or tap when it is close and in front of you (you no longer have to hit it dead centre), on a laptop or an iPad, in your own world or someone else\'s. Send it near the wailer and it flies straight at it.',
      'Sounds: cows moo, sheep bleat, pigs grunt and squeal, chickens cluck, villagers hum, and each cries out in its own voice when hit. Stone, wood, earth, gravel, sand, snow, wool, glass and metal each sound like themselves when you walk on, hit or break them.',
      'Sheep, villagers, witches and pillagers have two eyes again instead of one in the middle.',
      'On iPad the button that appears beside a villager also works for animals and boats: Tame, Saddle, Feed, Ride, Get in, Get off.',
    ],
  },
  {
    // a small update: it keeps the A New Look picture
    version: '1.9.7', name: 'Points of View', date: '2026-10-08',
    splashes: ['Look at yourself!', 'Press V!', 'Nice hat!', 'The golem is back!', 'Hold it up!', 'Shiny!', 'Max it out!', 'Leaves on the wind!',
      'Mind your shadow!', 'Light a torch!', 'Looks like rain!', 'Golden hour!'],
    scene: LAKESIDE,
    notes: [
      'Two new views. Third person looks at you from behind; second person faces you. You see your own character, with its armour and whatever it is holding. Switch with V (or F5) on a keyboard, the eye button on iPad, or View in Options. Every world starts in first person.',
      'From outside, the camera stays this side of walls and ceilings, and on iPad you still tap the thing you want to hit, mine or use.',
      'On iPad a tap on a villager now hits it, as it does any other creature. To trade, stand by a villager and press the Trade button that appears.',
      'A village whose iron golem is killed gets a new one five minutes later, as long as a villager still lives there. Golems lost before this update are counted from now.',
      'Fixed: in a room with more than one lamp, shadows faded out and back in when you looked from one lamp to another. The lamp that casts the shadows is now chosen by where you stand, not where you look.',
    ],
  },
  {
    // a small update: it keeps the A New Look picture
    version: '1.9.6', name: 'In Your Hands', date: '2026-10-08',
    splashes: ['Hold it up!', 'Shiny!', 'Look at that glint!', 'Three sides to everything!', 'Max it out!', 'How many fps?', 'Leaves on the wind!', 'Mind your shadow!',
      'Light a torch!', 'Looks like rain!', 'Cherry petals!', 'Golden hour!'],
    scene: LAKESIDE,
    notes: [
      'What you hold looks solid now. Tools, food and other items have thickness and shaded edges instead of being flat like paper.',
      'Blocks in your hand are shaded on each side and turned so you see the top, the front and one side. A furnace or chest shows its front.',
      'Slabs, fences, trapdoors, pressure plates, anvils, cauldrons, lecterns, enchanting tables and the like are held in their real shape, not as a flat picture.',
      'The same goes for things lying on the ground (which now all turn slowly, as blocks did) and for what other players, skeletons and vindicators carry.',
      'Your bare arm has shaded sides, shows your sleeve with your hand at the end of it, and jabs forward when you punch.',
      'Obsidian, blackstone and coal blocks catch the light: a few dots glint, and which ones changes as you walk past. Blocks of iron, gold, diamond, emerald, lapis, redstone, copper and quartz, and ice, have a soft sheen and the odd sparkle. The flecks in ore sparkle too. It works by sunlight, moonlight and torchlight, and is off with Lighting set to Simple.',
    ],
  },
  {
    // a small update: it keeps the A New Look picture
    version: '1.9.5', name: 'Graphics Options', date: '2026-10-08',
    splashes: ['Max it out!', 'Turn it down!', 'How many fps?', 'Steady now!', 'Leaves on the wind!', 'Mind your shadow!', 'Light a torch!', 'Looks like rain!',
      'Same you, any device!', 'Cherry petals!', 'Golden hour!', 'Faster!'],
    scene: LAKESIDE,
    notes: [
      'Options has three new graphics buttons, so you can turn everything up for looks or down for speed.',
      'Lighting: Simple (the plain lighting the game used to have, and the fastest), Fancy (light from where the sun and moon stand, with shadows) or Max (water also mirrors the sky and glitters).',
      'Shadows: Off, Low, Medium, High or Max. Higher settings are sharper, softer-edged and reach further; lamps cast shadows from Medium up. If the game cannot keep up it now turns shadows down a step at a time instead of straight off.',
      'Textures: Fast (leaves are drawn solid, which helps most in forests), Fancy, or Max (far-off blocks stay sharp).',
      'Frame Rate: Matches Screen, or Unlimited, which draws frames as fast as your device can. The number is shown with Show Coordinates turned on. A screen cannot show more frames than it refreshes, so Unlimited is for seeing what your device can do, and it uses more battery.',
      'Shadows are drawn only for the part of the world you are looking at, which is less work.',
    ],
  },
  {
    // a small update: it keeps the A New Look picture
    version: '1.9.4', name: 'Steady Shadows', date: '2026-10-08',
    splashes: ['Steady now!', 'Leaves on the wind!', 'Mind your shadow!', 'Light a torch!', 'Looks like rain!', 'Same you, any device!', 'Cherry petals!', 'Surprise me!',
      'Golden hour!', 'Who are you today?', 'A gust!', 'Faster!'],
    scene: LAKESIDE,
    notes: [
      'Shadows hold still while you walk. They no longer shift or shimmer each time the game redraws them, which showed most far from where a world began.',
      'Shadows in the distance fade out smoothly around you instead of appearing and vanishing in a line as you move.',
      'Where several torches light the same room, their shadows are fainter and no longer swap from one torch to another as you look around; one lamp\'s shadows fade out before the next one\'s fade in.',
      'Long shadows creep with the sun in smaller steps.',
    ],
  },
  {
    // a small update: it keeps the A New Look picture
    version: '1.9.3', name: 'Wind & Leaves', date: '2026-10-07',
    splashes: ['Faster!', 'Leaves on the wind!', 'Mind your shadow!', 'Light a torch!', 'Looks like rain!', 'Same you, any device!', 'Cherry petals!', 'Surprise me!',
      'Golden hour!', 'Who are you today?', 'A gust!', 'The Wither!'],
    scene: LAKESIDE,
    notes: [
      'Much faster. The shadows of the land are now drawn only when they change, not every frame, which was most of what made the game slow.',
      'Shadows have soft edges and glide as the sun moves, or as an animal walks, instead of jumping from dot to dot.',
      'More wind: grass, flowers and leaves sway further, and gusts pass through them.',
      'Leaves drift down from the trees, each the colour of the tree it fell from. Cherry trees shed the most.',
      'Fixed: the on and off switches in Options (Auto-Jump, View Bobbing, Show Coordinates) did nothing and were not saved.',
      'Turning Shadows off in Options now makes the game faster still, for slower devices.',
    ],
  },
  {
    // a small update: it keeps the A New Look picture
    version: '1.9.2', name: 'Lamps & Shadows', date: '2026-10-07',
    splashes: ['Mind your shadow!', 'Light a torch!', 'Looks like rain!', 'Same you, any device!', 'Glowstone glows!', 'Thunder!', 'Nice hat!', 'Surprise me!',
      'Golden hour!', 'Who are you today?', 'Bring a coat!', 'The Wither!'],
    scene: LAKESIDE,
    notes: [
      'Your character is saved with your account. Sign in on another device and you look the same there, prizes and all.',
      'Shadows are steady and straight now: they keep to the pixels of the blocks they fall on, and no longer wobble when leaves move.',
      'More things cast shadows: grass, flowers, sugar cane and other plants, and items lying on the ground.',
      'Lamps cast shadows too. Indoors or at night, the torch or glowstone lighting the place you are in throws real shadows from blocks, furniture, animals and players.',
      'Glowstone, torches and fire shine at full brightness, and a lit furnace glows at the front. Glowstone has a brighter, warmer texture.',
      'Lava has a finer, smoother texture.',
      'Rain is much easier to see, and it falls as snow in the cold lands.',
    ],
  },
  {
    // a small update: it keeps the A New Look picture
    version: '1.9.1', name: 'Sun & Storms', date: '2026-10-07',
    splashes: ['Looks like rain!', 'Mind your shadow!', 'Thunder!', 'Golden hour!', 'Nice hat!', 'Who are you today?', 'Sunglasses!', 'Surprise me!',
      'Win the crown!', 'Bring a coat!', 'Sleep through the storm!', 'The Wither!'],
    scene: LAKESIDE,
    notes: [
      'Real sunlight. The sun and the moon light the world from where they stand in the sky: the sides of things that face them are bright, and everything casts a shadow that moves through the day. Hills, trees, houses, animals and players all do. Evenings are golden and the shade is cool.',
      'Lamps, torches and fire glow warm against the dark, and now show in daytime shade too.',
      'The blocks are back to the textures they always had; the repainted ones from 1.9 are gone. Grass, flowers and leaves still stir in the wind.',
      'Water has its old look back, with new light on it: clear when you look down into it, a mirror of the sky when you look across it, and glittering where the sun catches it.',
      'Weather. Days can be clear, cloudy or wet, and the clouds come and go. Rain falls (snow in the cold lands, and nothing in the deserts), and thunderstorms bring a dark sky, lightning and thunder. You can sleep through a storm.',
      'Make your own character. Choose a skin colour, a face and eye colour, hair and its colour, a hat, glasses, a top, trousers and something for your back, or tap Surprise Me. There are twenty ready-made characters to start from, and everyone you play with sees yours.',
      'Prizes are now things to wear: crowns, horns, capes, armour and more for defeating the Void Dragon, destroying the Wither, visiting every land, lighting a beacon, killing one of every monster and eating every food. Any you had already won are still yours.',
      'Tap your character on the title screen to change it. (The Skins button is gone.)',
      'Options has a Shadows switch. On a device that cannot keep up, the game turns shadows off by itself.',
    ],
  },
  {
    version: '1.9', name: 'A New Look', date: '2026-10-07',
    splashes: ['Fresh paint!', 'Look at that water!', 'Mind the lava!', 'Who are you today?', 'Nice cape!', 'Seventeen skins!', 'The Wither!', 'Leaves in the wind!',
      'Now in colour!', 'Dress up!', 'Win the crown!', 'Sharper pixels!'],
    scene: LAKESIDE,
    notes: [
      'Grass, flowers and leaves stir in the wind.',
      'Skins: choose how you look. Eleven characters to start with, from Wanderer and Ranger to Knight, Wizard, Astronaut and Robot. Everyone you play with sees your skin.',
      'Prizes with capes, crowns and hats for the hardest things in the game: defeating the Void Dragon, destroying the Wither, visiting every land, lighting a beacon, killing one of every monster and eating every food. Ones you have already done count.',
      'Your character stands on the title screen.',
      'The Blight is now called the Wither, and what it leaves is a Nether Star.',
    ],
  },
  {
    // a small update: it keeps the Lands & Legends picture
    version: '1.8.1', name: 'Creative & Recipes', date: '2026-10-06',
    splashes: ['Search for it!', 'Eighteen new lands!', 'Cherry blossom!', 'X marks the spot!', 'Mind the pressure plate!', 'Three heads!', 'Down the mine!', 'Mooshroom!',
      'To the badlands!', 'Ten kinds of village!', 'Light the beacon!', 'Ice spikes!'],
    scene: TABLELANDS,
    notes: [
      'Creative mode has the same inventory as survival now, with armour, the off hand and crafting. Every block and item is in the panel beside it: pick one up, or Shift-click (on iPad, tap) to put a stack straight in your inventory. A bin throws things away.',
      'Search: type a name to find an item or a recipe.',
      'Pick a recipe you cannot make yet and it shows what it takes: laid out as you would craft it, with a tick or a cross by each thing and how many you have.',
      'On iPad, hold your finger on a villager (or any creature) to hit it. A tap on a villager still opens its trades.',
    ],
  },
  {
    version: '1.8', name: 'Lands & Legends', date: '2026-10-06',
    splashes: ['Eighteen new lands!', 'Cherry blossom!', 'X marks the spot!', 'Mind the pressure plate!', 'Three heads!', 'Down the mine!', 'Mooshroom!', 'To the badlands!',
      'Ten kinds of village!', 'Light the beacon!', 'Bring a shovel!', 'Ice spikes!'],
    scene: TABLELANDS,
    notes: [
      'Eighteen new lands, 27 in all: savanna, badlands with striped tablelands, birch and flower forests, cherry groves, meadows, sunflower plains, snowy taiga, ice spikes, old growth taiga with giant spruces, bamboo jungle, mushroom islands (no monsters there, only mooshrooms), snowy peaks, beaches, and four kinds of ocean with icebergs and coral reefs.',
      'New blocks to build with: acacia and cherry wood, red sand and new terracotta, packed ice, mushroom blocks, podzol, coral, bamboo, lily pads and six new flowers.',
      'Six new kinds of village, ten in all: savanna, badlands, cherry, jungle, birch and meadow villages, each built of its own land, with market stalls, flower gardens and lookout towers you can climb. Every smithy has an anvil.',
      'Dungeons underground: mossy rooms with a monster spawner and chests.',
      'Mineshafts: timbered galleries deep down, with far more ore in their walls than anywhere else, chests left behind, and cave spiders.',
      'Buried treasure: every sunken ship carries a treasure map. Hold it and use it to read it; the red cross is where to dig. The chest has the best loot in the game.',
      'The Wither, a three-headed boss. Set three blocks of soul sand in a row on top of a fourth, put three Charred Skulls on top, and stand back. It leaves a Nether Star, for making a beacon.',
      'A beacon on nine blocks of iron, gold, diamond or emerald mends everyone near it and quickens their digging.',
      'Outposts are proper watchtowers now, with one staircase winding to the top, tents, and a captured iron golem. Desert temples have their trap set: a pressure plate over the TNT.',
      'Pressure plates (two stone, or two planks) set off TNT and open doors. Golden apples (an apple ringed with gold) mend you.',
      'The anvil (three iron blocks over an iron ingot over three more) puts the enchantments of a book onto anything they suit; it says so now when a book does not suit.',
      'All of this appears in land nobody has been to yet. Everything you have built and everywhere you have explored stays exactly as it was.',
    ],
  },
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
