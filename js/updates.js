// The game's updates, newest first. The title screen shows off the newest one, the way Minecraft does:
// its version and name in the corner, its splash lines, and a slowly turning view of a place that fits it
// behind the menus. What's New lists them all.
//
// For a new update: add it at the top with its own splashes, notes and scene (a seed and a spot in that
// world, plus any blocks to put there, e.g. torches to light a cave).
// a torch-lit cavern in seed 7, with copper, iron, gold and redstone in its walls
const CAVERN = {
  seed: 7, x: -4.5, y: 28.4, z: -10.5, pitch: -0.08, time: 0.3, fog: [0.03, 0.03, 0.04],
  place: [[-1, 26, -11, 'torch'], [-6, 27, -7, 'torch'], [-8, 26, -13, 'torch'], [-3, 26, -17, 'torch'], [1, 27, -5, 'torch'], [-12, 28, -7, 'torch'],
    [-14, 28, -13, 'torch'], [-10, 26, -19, 'torch'], [3, 26, -16, 'torch'], [-5, 28, -1, 'torch'], [7, 27, -11, 'torch'], [-5, 25, -23, 'torch']],
};

export const UPDATES = [
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
