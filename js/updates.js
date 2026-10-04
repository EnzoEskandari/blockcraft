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

// A cabin made of the building blocks, at sunset: plank walls, a stepped slab roof, trapdoor shutters,
// torches on its walls, signs, lamp posts and a cactus patch. put(dx, dy, dz, block, meta) works from the
// ground where the view stands (dy 0 is the grass); sign(dx, dy, dz, lines) writes on a sign.
const HOMESTEAD = {
  seed: 1707, pitch: -0.04, time: 0.455, view: [0, 2],
  build(put, sign) {
    for (let x = -14; x <= 14; x++) for (let z = -14; z <= 14; z++) {
      put(x, 0, z, 'grass'); put(x, -1, z, 'dirt'); put(x, -2, z, 'dirt');
      for (let y = 1; y <= 16; y++) put(x, y, z, null);
    }
    // the cabin, north of the view: log corners, plank walls, a doorway and two windows facing south
    for (let x = -4; x <= 4; x++) for (let z = -10; z <= -5; z++) {
      const edge = x === -4 || x === 4 || z === -10 || z === -5;
      put(x, 0, z, 'oak_planks');
      if (!edge) continue;
      const corner = (x === -4 || x === 4) && (z === -10 || z === -5);
      for (let y = 1; y <= 3; y++) put(x, y, z, corner ? 'oak_log' : 'oak_planks');
    }
    put(0, 1, -5, null); put(0, 2, -5, null);
    for (const x of [-2, 2]) put(x, 2, -5, 'glass');
    put(-3, 2, -4, 'spruce_trapdoor', 4); put(3, 2, -4, 'spruce_trapdoor', 4);   // open shutters
    put(-1, 2, -4, 'torch', 4); put(1, 2, -4, 'torch', 4);                         // torches on the wall
    put(0, 3, -4, 'wall_sign', 0); sign(0, 3, -4, ['Blockcraft 1.7', 'Building', 'Blocks']);
    put(0, 1, -7, 'torch');
    // a stepped roof of slabs: each ring half a block higher
    for (let x = -5; x <= 5; x++) for (let z = -11; z <= -4; z++) {
      const inset = Math.min(x + 5, 5 - x, z + 11, -4 - z);
      if (inset === 0) put(x, 4, z, 'spruce_slab', 0);
      else if (inset === 1) put(x, 4, z, 'spruce_slab', 1);
      else if (inset === 2) put(x, 5, z, 'spruce_slab', 0);
      else put(x, 5, z, 'spruce_slab', 1);
    }
    // a slab path to the door, lamp posts, and a sign by the path
    for (let z = -3; z <= -2; z++) put(0, 1, z, 'stone_slab', 0);
    for (const x of [-3, 3]) { put(x, 1, -1, 'oak_fence'); put(x, 2, -1, 'oak_fence'); put(x, 3, -1, 'torch'); }
    put(2, 1, -2, 'sign', 0); sign(2, 1, -2, ['Slabs', 'Trapdoors', 'Signs', 'Wall torches']);
    // behind the view: a bench of slabs with trapdoor arms, and a cactus patch (mind the spines)
    for (let x = -1; x <= 1; x++) put(x, 1, 5, 'oak_slab', 0);
    put(-2, 1, 5, 'oak_trapdoor', 4 | 1); put(2, 1, 5, 'oak_trapdoor', 4 | 3);
    for (let x = 5; x <= 8; x++) for (let z = 3; z <= 6; z++) put(x, 0, z, 'sand');
    put(6, 1, 4, 'cactus'); put(6, 2, 4, 'cactus'); put(7, 1, 6, 'cactus'); put(5, 1, 6, 'cactus'); put(5, 2, 6, 'cactus'); put(5, 3, 6, 'cactus');
    put(8, 1, 3, 'sign', 3); sign(8, 1, 3, ['Careful:', 'cactus!']);
    // a little tower of brick and stone slabs to the west
    for (let y = 1; y <= 4; y++) for (const [x, z] of [[-9, 2], [-7, 2], [-9, 4], [-7, 4]]) put(x, y, z, 'stone_bricks');
    for (let x = -10; x <= -6; x++) for (let z = 1; z <= 5; z++) put(x, 5, z, (x + z) % 2 ? 'brick_slab' : 'stone_brick_slab', 0);
    put(-8, 4, 2, 'torch', 0); put(-8, 1, 3, 'cobblestone_slab', 0);
  },
};

export const UPDATES = [
  {
    version: '1.7', name: 'Building Blocks', date: '2026-10-04',
    splashes: ['Slabs!', 'Half a block!', 'Trapdoors!', 'Read the sign!', 'Torches on walls!', 'Mind the cactus!', 'Build something!', 'Steps without jumping!'],
    scene: HOMESTEAD,
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
