// Block, item, recipe and smelting definitions.
// Block ids fit in a byte (they are stored in chunk arrays); plain items start at 256.

export const RENDER = { CUBE: 0, CROSS: 1, TORCH: 2, LIQUID: 3, BED: 4, DOOR: 5, FENCE: 6, PORTAL: 7, END_PORTAL: 8, SLAB: 9, TRAPDOOR: 10, SIGN: 11, MODEL: 12 };

export const BLOCKS = [];  // id -> block def
export const ITEMS = [];   // id -> item def (obtainable blocks are also items)
export const B = {};       // block key -> id
export const ID = {};      // any key -> id

function block(id, key, name, o = {}) {
  const d = {
    id, key, name, isBlock: true,
    tex: o.tex || key,
    render: o.render ?? RENDER.CUBE,
    solid: o.solid ?? true,
    opaque: o.opaque ?? true,
    cutout: !!o.cutout,
    translucent: !!o.translucent,
    cullSame: !!o.cullSame,
    light: o.light || 0,
    atten: o.atten || 0,
    hardness: o.hardness ?? 1,
    tool: o.tool || null,
    level: o.level ?? -1,
    drops: o.drops,
    sound: o.sound || 'stone',
    tint: o.tint || 0,
    facing: !!o.facing,
    gravity: !!o.gravity,
    replaceable: !!o.replaceable,
    support: o.support || null,
    noItem: !!o.noItem,
    stack: o.stack || 64,
    fuel: o.fuel || 0,
    color: o.color || null,
    art: o.art || null,        // 2D icon art for blocks that are not drawn as cubes
    door: !!o.door,
    bed: !!o.bed,
    slab: o.slab || null,      // half a block: the key of the full block two of them make
    trapdoor: !!o.trapdoor,
    sign: o.sign || 0,         // 1 standing on a post, 2 flat on a wall
    boxes: o.boxes || null,    // a shape of its own: boxes [x0, y0, z0, x1, y1, z1, texture?] in sixteenths of a block
    height: o.height || 1,     // how tall it is to stand on (the enchanting table is three quarters of a block)
    job: o.job || null,        // the profession a villager without work takes up at this block
    xp: o.xp || null,          // [least, most] experience for mining it
    fortune: !!o.fortune,      // the Fortune enchantment makes it drop more
    plate: !!o.plate,          // a pressure plate
    slow: o.slow || 0,         // movement multiplier while inside (cobweb)
    flammable: o.flammable || 0, // how readily fire burns this block away (0 = never)
    sapling: o.sapling || null, // the kind of tree it grows into
  };
  BLOCKS[id] = d;
  B[key] = id;
  ID[key] = id;
  if (!d.noItem) ITEMS[id] = d;
  return d;
}

const one = (key) => () => [[ID[key], 1]];
const range = (key, a, b) => (r) => { const n = a + Math.floor(r() * (b - a + 1)); return n > 0 ? [[ID[key], n]] : []; };
const none = () => [];

const plant = { render: RENDER.CROSS, solid: false, opaque: false, hardness: 0, sound: 'grass' };
// (each tree's leaves drop that tree's own sapling)
const leaves = (extra, sapling = 'oak_sapling') => ({
  opaque: false, cutout: true, hardness: 0.2, sound: 'grass', atten: 1, tool: 'hoe',
  drops: (r) => {
    const out = [];
    if (r() < 0.05) out.push([ID[sapling], 1]);
    if (extra && r() < 0.02) out.push([ID.apple, 1]);
    return out;
  },
});
const GROUND = () => [B.grass, B.dirt, B.snowy_grass];

block(0, 'air', 'Air', { solid: false, opaque: false, noItem: true, hardness: 0 });
block(1, 'stone', 'Stone', { hardness: 1.5, tool: 'pickaxe', level: 0, drops: one('cobblestone') });
block(2, 'grass', 'Grass Block', { tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, hardness: 0.6, tool: 'shovel', sound: 'grass', tint: 1, drops: one('dirt') });
block(3, 'dirt', 'Dirt', { hardness: 0.5, tool: 'shovel', sound: 'gravel' });
block(4, 'cobblestone', 'Cobblestone', { hardness: 2, tool: 'pickaxe', level: 0 });
block(5, 'oak_planks', 'Oak Planks', { hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(6, 'birch_planks', 'Birch Planks', { hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(7, 'spruce_planks', 'Spruce Planks', { hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(8, 'bedrock', 'Bedrock', { hardness: -1 });
block(9, 'water', 'Water', { render: RENDER.LIQUID, solid: false, opaque: false, translucent: true, atten: 1, hardness: -1, noItem: true, replaceable: true });
block(10, 'sand', 'Sand', { hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true });
block(11, 'gravel', 'Gravel', { hardness: 0.6, tool: 'shovel', sound: 'gravel', gravity: true, drops: (r) => [[r() < 0.12 ? ID.flint : ID.gravel, 1]] });
block(12, 'oak_log', 'Oak Log', { tex: { top: 'oak_log_top', bottom: 'oak_log_top', side: 'oak_log' }, hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(13, 'birch_log', 'Birch Log', { tex: { top: 'birch_log_top', bottom: 'birch_log_top', side: 'birch_log' }, hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(14, 'spruce_log', 'Spruce Log', { tex: { top: 'spruce_log_top', bottom: 'spruce_log_top', side: 'spruce_log' }, hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(15, 'oak_leaves', 'Oak Leaves', { ...leaves(true), tint: 2 });
block(16, 'birch_leaves', 'Birch Leaves', leaves(false, 'birch_sapling'));
block(17, 'spruce_leaves', 'Spruce Leaves', leaves(false, 'spruce_sapling'));
block(18, 'glass', 'Glass', { opaque: false, cutout: true, cullSame: true, hardness: 0.3, sound: 'glass', drops: none });
block(19, 'coal_ore', 'Coal Ore', { hardness: 3, tool: 'pickaxe', level: 0, drops: one('coal'), xp: [0, 2], fortune: true });
block(20, 'iron_ore', 'Iron Ore', { hardness: 3, tool: 'pickaxe', level: 1 });
block(21, 'gold_ore', 'Gold Ore', { hardness: 3, tool: 'pickaxe', level: 2 });
block(22, 'diamond_ore', 'Diamond Ore', { hardness: 3, tool: 'pickaxe', level: 2, drops: one('diamond'), xp: [3, 7], fortune: true });
block(23, 'redstone_ore', 'Redstone Ore', { hardness: 3, tool: 'pickaxe', level: 2, drops: range('redstone', 4, 5), xp: [1, 5], fortune: true });
block(24, 'lapis_ore', 'Lapis Lazuli Ore', { hardness: 3, tool: 'pickaxe', level: 1, drops: range('lapis_lazuli', 4, 8), xp: [2, 5], fortune: true });
block(25, 'snowy_grass', 'Snowy Grass Block', { tex: { top: 'snow', bottom: 'dirt', side: 'snowy_grass_side' }, hardness: 0.6, tool: 'shovel', sound: 'snow', drops: one('dirt') });
block(26, 'snow', 'Snow Block', { hardness: 0.2, tool: 'shovel', sound: 'snow' });
block(27, 'ice', 'Ice', { hardness: 0.5, tool: 'pickaxe', sound: 'glass', drops: none });
block(28, 'cactus', 'Cactus', { tex: { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side' }, hardness: 0.4, sound: 'wool', support: () => [B.sand, B.red_sand, B.cactus] });
block(29, 'clay', 'Clay', { hardness: 0.6, tool: 'shovel', sound: 'gravel', drops: range('clay_ball', 4, 4) });
block(30, 'sandstone', 'Sandstone', { tex: { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone_side' }, hardness: 0.8, tool: 'pickaxe', level: 0 });
block(31, 'bricks', 'Bricks', { hardness: 2, tool: 'pickaxe', level: 0 });
block(32, 'stone_bricks', 'Stone Bricks', { hardness: 1.5, tool: 'pickaxe', level: 0 });
block(33, 'mossy_cobblestone', 'Mossy Cobblestone', { hardness: 2, tool: 'pickaxe', level: 0 });
block(34, 'obsidian', 'Obsidian', { hardness: 50, tool: 'pickaxe', level: 3 });
block(35, 'crafting_table', 'Crafting Table', { tex: { top: 'crafting_table_top', bottom: 'oak_planks', side: 'crafting_table_side', front: 'crafting_table_front' }, hardness: 2.5, tool: 'axe', sound: 'wood', fuel: 15 });
block(36, 'furnace', 'Furnace', { tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front' }, facing: true, hardness: 3.5, tool: 'pickaxe', level: 0 });
block(37, 'furnace_lit', 'Lit Furnace', { tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front_lit' }, facing: true, light: 13, hardness: 3.5, tool: 'pickaxe', level: 0, noItem: true, drops: one('furnace') });
block(38, 'chest', 'Chest', { tex: { top: 'chest_top', bottom: 'chest_top', side: 'chest_side', front: 'chest_front' }, facing: true, hardness: 2.5, tool: 'axe', sound: 'wood', fuel: 15 });
block(39, 'tnt', 'TNT', { tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, hardness: 0, sound: 'grass' });
block(40, 'glowstone', 'Glowstone', { light: 15, hardness: 0.3, sound: 'glass' });
block(41, 'torch', 'Torch', { render: RENDER.TORCH, solid: false, opaque: false, light: 14, hardness: 0, sound: 'wood', support: 'solid' });
block(42, 'tall_grass', 'Grass', { ...plant, tint: 2, replaceable: true, drops: (r) => (r() < 0.125 ? [[ID.wheat_seeds, 1]] : []), support: GROUND });
block(43, 'dandelion', 'Dandelion', { ...plant, support: GROUND });
block(44, 'poppy', 'Poppy', { ...plant, support: GROUND });
block(45, 'dead_bush', 'Dead Bush', { ...plant, replaceable: true, drops: range('stick', 0, 2), support: () => [B.sand, B.red_sand, B.dirt, B.terracotta, B.podzol] });
block(46, 'oak_sapling', 'Oak Sapling', { ...plant, support: GROUND, sapling: 'oak' });
block(47, 'pumpkin', 'Pumpkin', { tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side' }, hardness: 1, tool: 'axe', sound: 'wood' });
block(48, 'iron_block', 'Block of Iron', { hardness: 5, tool: 'pickaxe', level: 1, sound: 'metal' });
block(49, 'gold_block', 'Block of Gold', { hardness: 3, tool: 'pickaxe', level: 2, sound: 'metal' });
block(50, 'diamond_block', 'Block of Diamond', { hardness: 5, tool: 'pickaxe', level: 2, sound: 'metal' });
block(51, 'coal_block', 'Block of Coal', { hardness: 5, tool: 'pickaxe', level: 0, fuel: 800 });
block(52, 'redstone_block', 'Block of Redstone', { hardness: 5, tool: 'pickaxe', level: 0, sound: 'metal' });
block(53, 'lapis_block', 'Block of Lapis Lazuli', { hardness: 3, tool: 'pickaxe', level: 1 });
block(54, 'bookshelf', 'Bookshelf', { tex: { top: 'oak_planks', bottom: 'oak_planks', side: 'bookshelf' }, hardness: 1.5, tool: 'axe', sound: 'wood', fuel: 15 });

export const WOOL_COLORS = [
  ['white', 'White', [233, 236, 236]], ['light_gray', 'Light Gray', [142, 142, 134]],
  ['gray', 'Gray', [62, 68, 71]], ['black', 'Black', [21, 21, 26]],
  ['brown', 'Brown', [114, 71, 40]], ['red', 'Red', [160, 39, 34]],
  ['orange', 'Orange', [240, 118, 19]], ['yellow', 'Yellow', [248, 197, 39]],
  ['lime', 'Lime', [112, 185, 25]], ['green', 'Green', [84, 109, 27]],
  ['cyan', 'Cyan', [21, 137, 145]], ['light_blue', 'Light Blue', [58, 175, 217]],
  ['blue', 'Blue', [53, 57, 157]], ['purple', 'Purple', [121, 42, 172]],
  ['magenta', 'Magenta', [189, 68, 179]], ['pink', 'Pink', [237, 141, 172]],
];
WOOL_COLORS.forEach(([k, n, c], i) => {
  block(55 + i, k + '_wool', n + ' Wool', { hardness: 0.8, sound: 'wool', color: c });
});

// ---- blocks added with villages, farming, new biomes and structures
const wheatDrops = (stage) => (r) => stage < 3 ? [[ID.wheat_seeds, 1]] : [[ID.wheat, 1], [ID.wheat_seeds, 1 + Math.floor(r() * 3)]];
const bedDrop = () => [[ID.bed_foot, 1]];
block(71, 'emerald_ore', 'Emerald Ore', { hardness: 3, tool: 'pickaxe', level: 2, drops: one('emerald'), xp: [3, 7], fortune: true });
block(72, 'emerald_block', 'Block of Emerald', { hardness: 5, tool: 'pickaxe', level: 2, sound: 'metal' });
block(73, 'dirt_path', 'Dirt Path', { tex: { top: 'dirt_path_top', bottom: 'dirt', side: 'dirt_path_side' }, hardness: 0.65, tool: 'shovel', sound: 'gravel', drops: one('dirt') });
block(74, 'farmland', 'Farmland', { tex: { top: 'farmland_top', bottom: 'dirt', side: 'dirt' }, hardness: 0.6, tool: 'shovel', sound: 'gravel', drops: one('dirt') });
for (let s = 0; s < 4; s++) {
  block(75 + s, 'wheat_' + s, 'Wheat Crops', { ...plant, tex: 'wheat_' + s, noItem: true, support: () => [B.farmland], drops: wheatDrops(s) });
}
block(79, 'hay_bale', 'Hay Bale', { tex: { top: 'hay_bale_top', bottom: 'hay_bale_top', side: 'hay_bale_side' }, hardness: 0.5, sound: 'grass' });
block(80, 'bed_foot', 'Red Bed', { render: RENDER.BED, tex: { top: 'bed_foot_top', bottom: 'oak_planks', side: 'bed_side' }, solid: false, opaque: false, bed: true, facing: true, hardness: 0.2, sound: 'wool', stack: 1, art: 'bed', drops: bedDrop });
block(81, 'bed_head', 'Red Bed', { render: RENDER.BED, tex: { top: 'bed_head_top', bottom: 'oak_planks', side: 'bed_side' }, solid: false, opaque: false, bed: true, facing: true, hardness: 0.2, sound: 'wool', noItem: true, drops: bedDrop });
block(82, 'sugar_cane', 'Sugar Cane', { ...plant, support: () => [B.sand, B.red_sand, B.grass, B.dirt, B.podzol, B.sugar_cane] });
block(83, 'jungle_log', 'Jungle Log', { tex: { top: 'jungle_log_top', bottom: 'jungle_log_top', side: 'jungle_log' }, hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(84, 'jungle_leaves', 'Jungle Leaves', { ...leaves(false, 'jungle_sapling'), tint: 2 });
block(85, 'jungle_planks', 'Jungle Planks', { hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(86, 'dark_oak_log', 'Dark Oak Log', { tex: { top: 'dark_oak_log_top', bottom: 'dark_oak_log_top', side: 'dark_oak_log' }, hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(87, 'dark_oak_leaves', 'Dark Oak Leaves', { ...leaves(true, 'dark_oak_sapling'), tint: 2 });
block(88, 'dark_oak_planks', 'Dark Oak Planks', { hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(89, 'netherrack', 'Netherrack', { hardness: 0.4, tool: 'pickaxe', level: 0 });
block(90, 'terracotta', 'Terracotta', { hardness: 1.25, tool: 'pickaxe', level: 0 });
block(91, 'orange_terracotta', 'Orange Terracotta', { hardness: 1.25, tool: 'pickaxe', level: 0 });
block(92, 'blue_terracotta', 'Blue Terracotta', { hardness: 1.25, tool: 'pickaxe', level: 0 });
block(93, 'white_terracotta', 'White Terracotta', { hardness: 1.25, tool: 'pickaxe', level: 0 });
block(94, 'chiseled_sandstone', 'Chiseled Sandstone', { tex: { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'chiseled_sandstone' }, hardness: 0.8, tool: 'pickaxe', level: 0 });
block(95, 'mossy_stone_bricks', 'Mossy Stone Bricks', { hardness: 1.5, tool: 'pickaxe', level: 0 });
block(96, 'cracked_stone_bricks', 'Cracked Stone Bricks', { hardness: 1.5, tool: 'pickaxe', level: 0 });
block(97, 'oak_door', 'Oak Door', { render: RENDER.DOOR, tex: 'oak_door_bottom', opaque: false, cutout: true, door: true, facing: true, hardness: 3, tool: 'axe', sound: 'wood', art: 'door', stack: 64 });
block(98, 'oak_door_top', 'Oak Door', { render: RENDER.DOOR, tex: 'oak_door_top', opaque: false, cutout: true, door: true, facing: true, hardness: 3, tool: 'axe', sound: 'wood', noItem: true, drops: one('oak_door') });
block(99, 'oak_fence', 'Oak Fence', { render: RENDER.FENCE, tex: 'oak_planks', opaque: false, hardness: 2, tool: 'axe', sound: 'wood', fuel: 15, art: 'fence' });
block(100, 'cobweb', 'Cobweb', { ...plant, hardness: 4, tool: 'sword', slow: 0.25, drops: one('string') });
block(101, 'fire', 'Fire', { render: RENDER.CROSS, solid: false, opaque: false, light: 15, hardness: 0, noItem: true, replaceable: true, sound: 'grass', drops: none });

// ---- the Nether and the End
const nuggets = (r) => [[ID.gold_nugget, 2 + Math.floor(r() * 5)]];
const NYLIUM = () => [B.crimson_nylium, B.warped_nylium, B.soul_soil];
block(102, 'lava', 'Lava', { render: RENDER.LIQUID, solid: false, opaque: false, atten: 1, light: 15, hardness: -1, noItem: true, replaceable: true });
block(103, 'nether_portal', 'Nether Portal', { render: RENDER.PORTAL, solid: false, opaque: false, translucent: true, light: 11, hardness: -1, noItem: true, drops: none, sound: 'glass' });
block(104, 'soul_sand', 'Soul Sand', { hardness: 0.5, tool: 'shovel', sound: 'sand' });
block(105, 'soul_soil', 'Soul Soil', { hardness: 0.5, tool: 'shovel', sound: 'sand' });
block(106, 'nether_quartz_ore', 'Nether Quartz Ore', { hardness: 3, tool: 'pickaxe', level: 0, drops: one('nether_quartz'), xp: [2, 5], fortune: true });
block(107, 'nether_gold_ore', 'Nether Gold Ore', { hardness: 3, tool: 'pickaxe', level: 0, drops: nuggets, xp: [0, 1], fortune: true });
block(108, 'magma_block', 'Magma Block', { light: 3, hardness: 0.5, tool: 'pickaxe', level: 0 });
block(109, 'basalt', 'Basalt', { tex: { top: 'basalt_top', bottom: 'basalt_top', side: 'basalt_side' }, hardness: 1.25, tool: 'pickaxe', level: 0 });
block(110, 'blackstone', 'Blackstone', { hardness: 1.5, tool: 'pickaxe', level: 0 });
block(111, 'gilded_blackstone', 'Gilded Blackstone', { hardness: 1.5, tool: 'pickaxe', level: 0, drops: (r) => (r() < 0.1 ? nuggets(r) : [[ID.gilded_blackstone, 1]]) });
block(112, 'crimson_nylium', 'Crimson Nylium', { tex: { top: 'crimson_nylium', bottom: 'netherrack', side: 'crimson_nylium_side' }, hardness: 0.4, tool: 'pickaxe', level: 0, drops: one('netherrack') });
block(113, 'warped_nylium', 'Warped Nylium', { tex: { top: 'warped_nylium', bottom: 'netherrack', side: 'warped_nylium_side' }, hardness: 0.4, tool: 'pickaxe', level: 0, drops: one('netherrack') });
block(114, 'crimson_stem', 'Crimson Stem', { tex: { top: 'crimson_stem_top', bottom: 'crimson_stem_top', side: 'crimson_stem' }, hardness: 2, tool: 'axe', sound: 'wood' });
block(115, 'warped_stem', 'Warped Stem', { tex: { top: 'warped_stem_top', bottom: 'warped_stem_top', side: 'warped_stem' }, hardness: 2, tool: 'axe', sound: 'wood' });
block(116, 'crimson_planks', 'Crimson Planks', { hardness: 2, tool: 'axe', sound: 'wood' });
block(117, 'warped_planks', 'Warped Planks', { hardness: 2, tool: 'axe', sound: 'wood' });
block(118, 'nether_wart_block', 'Nether Wart Block', { hardness: 1, tool: 'hoe', sound: 'grass' });
block(119, 'warped_wart_block', 'Warped Wart Block', { hardness: 1, tool: 'hoe', sound: 'grass' });
block(120, 'shroomlight', 'Shroomlight', { light: 15, hardness: 1, tool: 'hoe', sound: 'grass' });
block(121, 'nether_bricks', 'Nether Bricks', { hardness: 2, tool: 'pickaxe', level: 0 });
block(122, 'nether_brick_fence', 'Nether Brick Fence', { render: RENDER.FENCE, tex: 'nether_bricks', opaque: false, hardness: 2, tool: 'pickaxe', level: 0, art: 'fence' });
block(123, 'crimson_roots', 'Crimson Roots', { ...plant, replaceable: true, support: NYLIUM });
block(124, 'warped_roots', 'Warped Roots', { ...plant, replaceable: true, support: NYLIUM });
block(125, 'crimson_fungus', 'Crimson Fungus', { ...plant, support: NYLIUM });
block(126, 'warped_fungus', 'Warped Fungus', { ...plant, support: NYLIUM });
block(127, 'nether_wart', 'Nether Wart', { ...plant, support: () => [B.soul_sand], drops: (r) => [[ID.nether_wart, 2 + Math.floor(r() * 3)]] });
block(128, 'bone_block', 'Bone Block', { tex: { top: 'bone_block_top', bottom: 'bone_block_top', side: 'bone_block_side' }, hardness: 2, tool: 'pickaxe', level: 0 });
block(129, 'quartz_block', 'Block of Quartz', { hardness: 0.8, tool: 'pickaxe', level: 0 });
block(130, 'end_stone', 'End Stone', { hardness: 3, tool: 'pickaxe', level: 0 });
block(131, 'end_stone_bricks', 'End Stone Bricks', { hardness: 3, tool: 'pickaxe', level: 0 });
block(132, 'end_portal_frame', 'End Portal Frame', { tex: { top: 'end_portal_frame_top', bottom: 'end_stone', side: 'end_portal_frame_side' }, light: 1, hardness: -1, drops: none });
block(133, 'end_portal_frame_filled', 'End Portal Frame', { tex: { top: 'end_portal_frame_eye', bottom: 'end_stone', side: 'end_portal_frame_side' }, light: 1, hardness: -1, noItem: true, drops: none });
block(134, 'end_portal', 'End Portal', { render: RENDER.END_PORTAL, solid: false, opaque: false, light: 15, hardness: -1, noItem: true, drops: none });
block(135, 'end_gateway', 'End Gateway', { render: RENDER.END_PORTAL, tex: 'end_portal', solid: false, opaque: false, light: 15, hardness: -1, noItem: true, drops: none });
block(136, 'violetstone', 'Violetstone', { hardness: 1.5, tool: 'pickaxe', level: 0 });
block(137, 'violetstone_pillar', 'Violetstone Pillar', { tex: { top: 'violetstone_pillar_top', bottom: 'violetstone_pillar_top', side: 'violetstone_pillar' }, hardness: 1.5, tool: 'pickaxe', level: 0 });
block(138, 'end_rod', 'End Rod', { render: RENDER.TORCH, solid: false, opaque: false, light: 14, hardness: 0, sound: 'glass' });
block(139, 'dragon_egg', 'Dragon Egg', { light: 1, hardness: 3, stack: 1 });
block(140, 'spawner', 'Monster Spawner', { opaque: false, cutout: true, hardness: 5, tool: 'pickaxe', level: 0, sound: 'metal', drops: none, xp: [15, 43] });

// Caves & Ores: deepslate deep underground (with its own ores), copper, and the stones of cave walls
const deepOre = (o = {}) => ({ hardness: 4.5, tool: 'pickaxe', level: 0, ...o });
block(141, 'deepslate', 'Deepslate', { hardness: 3, tool: 'pickaxe', level: 0, drops: one('cobbled_deepslate') });
block(142, 'cobbled_deepslate', 'Cobbled Deepslate', { hardness: 3.5, tool: 'pickaxe', level: 0 });
block(143, 'deepslate_coal_ore', 'Deepslate Coal Ore', deepOre({ drops: one('coal'), xp: [0, 2], fortune: true }));
block(144, 'deepslate_iron_ore', 'Deepslate Iron Ore', deepOre({ level: 1 }));
block(145, 'deepslate_gold_ore', 'Deepslate Gold Ore', deepOre({ level: 2 }));
block(146, 'deepslate_diamond_ore', 'Deepslate Diamond Ore', deepOre({ level: 2, drops: one('diamond'), xp: [3, 7], fortune: true }));
block(147, 'deepslate_redstone_ore', 'Deepslate Redstone Ore', deepOre({ level: 2, drops: range('redstone', 4, 5), xp: [1, 5], fortune: true }));
block(148, 'deepslate_lapis_ore', 'Deepslate Lapis Lazuli Ore', deepOre({ level: 1, drops: range('lapis_lazuli', 4, 8), xp: [2, 5], fortune: true }));
block(149, 'deepslate_emerald_ore', 'Deepslate Emerald Ore', deepOre({ level: 2, drops: one('emerald'), xp: [3, 7], fortune: true }));
block(150, 'copper_ore', 'Copper Ore', { hardness: 3, tool: 'pickaxe', level: 1 });
block(151, 'deepslate_copper_ore', 'Deepslate Copper Ore', deepOre({ level: 1 }));
block(152, 'copper_block', 'Block of Copper', { hardness: 3, tool: 'pickaxe', level: 1, sound: 'metal' });
block(153, 'tuff', 'Tuff', { hardness: 1.5, tool: 'pickaxe', level: 0 });
block(154, 'granite', 'Granite', { hardness: 1.5, tool: 'pickaxe', level: 0 });
block(155, 'diorite', 'Diorite', { hardness: 1.5, tool: 'pickaxe', level: 0 });
block(156, 'andesite', 'Andesite', { hardness: 1.5, tool: 'pickaxe', level: 0 });

// Building pieces. Slabs are half a block (meta 1: the top half); two of a kind make the full block.
export const SLABS = [
  ['oak_planks', 'oak_slab', 'Oak Slab'], ['birch_planks', 'birch_slab', 'Birch Slab'], ['spruce_planks', 'spruce_slab', 'Spruce Slab'],
  ['jungle_planks', 'jungle_slab', 'Jungle Slab'], ['dark_oak_planks', 'dark_oak_slab', 'Dark Oak Slab'], ['crimson_planks', 'crimson_slab', 'Crimson Slab'],
  ['warped_planks', 'warped_slab', 'Warped Slab'], ['stone', 'stone_slab', 'Stone Slab'], ['cobblestone', 'cobblestone_slab', 'Cobblestone Slab'],
  ['sandstone', 'sandstone_slab', 'Sandstone Slab'], ['bricks', 'brick_slab', 'Brick Slab'], ['stone_bricks', 'stone_brick_slab', 'Stone Brick Slab'],
  ['nether_bricks', 'nether_brick_slab', 'Nether Brick Slab'], ['quartz_block', 'quartz_slab', 'Quartz Slab'],
  ['cobbled_deepslate', 'cobbled_deepslate_slab', 'Cobbled Deepslate Slab'], ['blackstone', 'blackstone_slab', 'Blackstone Slab'],
  ['end_stone_bricks', 'end_stone_brick_slab', 'End Stone Brick Slab'],
];
SLABS.forEach(([full, key, name], i) => {
  const f = BLOCKS[B[full]];
  block(157 + i, key, name, { render: RENDER.SLAB, tex: f.tex, opaque: false, atten: 1, slab: full, hardness: f.hardness, tool: f.tool, level: f.level, sound: f.sound, fuel: f.fuel ? 7 : 0 });
});
// Trapdoors: meta bits 0-1 the side the hinge is on, 4 open, 8 in the top half of its block
['oak', 'birch', 'spruce', 'jungle', 'dark_oak'].forEach((wood, i) => {
  const name = wood.split('_').map((s) => s[0].toUpperCase() + s.slice(1)).join(' ');
  block(174 + i, wood + '_trapdoor', name + ' Trapdoor', { render: RENDER.TRAPDOOR, opaque: false, cutout: true, trapdoor: true, hardness: 3, tool: 'axe', sound: 'wood', fuel: 15 });
});
// Signs: meta is the way they face. The words are kept by the world, not in the block.
block(179, 'sign', 'Sign', { render: RENDER.SIGN, tex: 'oak_planks', solid: false, opaque: false, sign: 1, hardness: 1, tool: 'axe', sound: 'wood', art: 'sign', stack: 16, fuel: 10 });
block(180, 'wall_sign', 'Sign', { render: RENDER.SIGN, tex: 'oak_planks', solid: false, opaque: false, sign: 2, hardness: 1, tool: 'axe', sound: 'wood', noItem: true, drops: one('sign') });

// Enchanting and mending
block(181, 'enchanting_table', 'Enchanting Table', { render: RENDER.MODEL, tex: { top: 'enchanting_table_top', bottom: 'obsidian', side: 'enchanting_table_side' }, opaque: false, atten: 1, light: 7,
  hardness: 5, tool: 'pickaxe', level: 0, height: 0.75, boxes: [[0, 0, 0, 16, 12, 16]] });
block(182, 'anvil', 'Anvil', { render: RENDER.MODEL, tex: 'anvil', art: 'anvil', opaque: false, atten: 1, hardness: 5, tool: 'pickaxe', level: 0, sound: 'metal', facing: true,
  boxes: [[2, 0, 2, 14, 4, 14], [4, 4, 3, 12, 5, 13], [6, 5, 4, 10, 10, 12], [3, 10, 0, 13, 16, 16]] });
// The blocks villagers work at: one without a job who finds a free one takes up its trade
const wood = { hardness: 2.5, tool: 'axe', sound: 'wood', fuel: 15 };
const stoneJob = { hardness: 3.5, tool: 'pickaxe', level: 0 };
block(183, 'composter', 'Composter', { ...wood, render: RENDER.MODEL, tex: 'composter', opaque: false, atten: 1, job: 'farmer',
  boxes: [[0, 0, 0, 16, 2, 16], [0, 2, 0, 2, 16, 16], [14, 2, 0, 16, 16, 16], [2, 2, 0, 14, 16, 2], [2, 2, 14, 14, 16, 16], [2, 2, 2, 14, 9, 14, 'compost']] });
block(184, 'lectern', 'Lectern', { ...wood, render: RENDER.MODEL, tex: { top: 'lectern_top', bottom: 'oak_planks', side: 'lectern_side' }, opaque: false, atten: 1, facing: true, job: 'librarian',
  boxes: [[0, 0, 0, 16, 2, 16], [4, 2, 4, 12, 13, 12], [0, 13, 1, 16, 16, 15]] });
block(185, 'blast_furnace', 'Blast Furnace', { ...stoneJob, tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'blast_furnace_side', front: 'blast_furnace_front' }, facing: true, job: 'armorer' });
block(186, 'grindstone', 'Grindstone', { ...stoneJob, render: RENDER.MODEL, tex: 'grindstone', opaque: false, atten: 1, facing: true, job: 'weaponsmith',
  boxes: [[2, 0, 6, 4, 9, 10, 'oak_log'], [12, 0, 6, 14, 9, 10, 'oak_log'], [4, 4, 2, 12, 16, 14]] });
block(187, 'smithing_table', 'Smithing Table', { ...wood, tex: { top: 'smithing_table_top', bottom: 'dark_oak_planks', side: 'smithing_table_side' }, job: 'toolsmith' });
block(188, 'smoker', 'Smoker', { ...stoneJob, tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'smoker_side', front: 'smoker_front' }, facing: true, job: 'butcher' });
block(189, 'fletching_table', 'Fletching Table', { ...wood, tex: { top: 'fletching_table_top', bottom: 'birch_planks', side: 'fletching_table_side' }, job: 'fletcher' });
block(190, 'brewing_stand', 'Brewing Stand', { render: RENDER.MODEL, tex: 'brewing_stand', art: 'brewing_stand', opaque: false, atten: 1, light: 1, hardness: 0.5, tool: 'pickaxe', level: 0, job: 'cleric', height: 0.875,
  boxes: [[1, 0, 1, 15, 2, 15, 'cobblestone'], [7, 2, 7, 9, 14, 9], [2, 2, 6, 6, 9, 10, 'glass'], [10, 2, 6, 14, 9, 10, 'glass'], [6, 2, 11, 10, 9, 15, 'glass']] });
block(191, 'loom', 'Loom', { ...wood, tex: { top: 'oak_planks', bottom: 'oak_planks', side: 'loom_side', front: 'loom_front' }, facing: true, job: 'shepherd' });
block(192, 'cauldron', 'Cauldron', { render: RENDER.MODEL, tex: 'cauldron', art: 'cauldron', opaque: false, atten: 1, hardness: 2, tool: 'pickaxe', level: 0, sound: 'metal', job: 'leatherworker',
  boxes: [[0, 3, 0, 2, 16, 16], [14, 3, 0, 16, 16, 16], [2, 3, 0, 14, 16, 2], [2, 3, 14, 14, 16, 16], [2, 3, 2, 14, 4, 14], [0, 0, 0, 4, 3, 4], [12, 0, 0, 16, 3, 4], [0, 0, 12, 4, 3, 16], [12, 0, 12, 16, 3, 16]] });
block(193, 'stonecutter', 'Stonecutter', { ...stoneJob, render: RENDER.MODEL, tex: { top: 'stonecutter_top', bottom: 'stone', side: 'stonecutter_side' }, opaque: false, atten: 1, job: 'mason', height: 0.5625,
  boxes: [[0, 0, 0, 16, 9, 16], [1, 9, 7, 15, 15, 9, 'stonecutter_saw']] });
// Ice made by Frost Walker boots: it melts again after a few seconds
block(194, 'frosted_ice', 'Frosted Ice', { tex: 'ice', hardness: 0.5, tool: 'pickaxe', sound: 'glass', drops: none, noItem: true });

// ---- Lands & Legends (1.8): the blocks of the new lands, and of the Wither
const SOIL = () => [B.grass, B.dirt, B.snowy_grass, B.podzol, B.mycelium];
const capDrops = (r) => { const n = Math.floor(r() * 3) - 1; return n > 0 ? [[ID.red_mushroom, n]] : []; };
block(195, 'acacia_log', 'Acacia Log', { tex: { top: 'acacia_log_top', bottom: 'acacia_log_top', side: 'acacia_log' }, hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(196, 'acacia_leaves', 'Acacia Leaves', { ...leaves(false, 'acacia_sapling'), tex: 'oak_leaves', tint: 2 });
block(197, 'acacia_planks', 'Acacia Planks', { hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(198, 'cherry_log', 'Cherry Log', { tex: { top: 'cherry_log_top', bottom: 'cherry_log_top', side: 'cherry_log' }, hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(199, 'cherry_leaves', 'Cherry Leaves', leaves(false, 'cherry_sapling'));
block(200, 'cherry_planks', 'Cherry Planks', { hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(201, 'red_sand', 'Red Sand', { hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true });
block(202, 'red_terracotta', 'Red Terracotta', { hardness: 1.25, tool: 'pickaxe', level: 0 });
block(203, 'yellow_terracotta', 'Yellow Terracotta', { hardness: 1.25, tool: 'pickaxe', level: 0 });
block(204, 'packed_ice', 'Packed Ice', { hardness: 0.5, tool: 'pickaxe', sound: 'glass' });
block(205, 'mycelium', 'Mycelium', { tex: { top: 'mycelium_top', bottom: 'dirt', side: 'mycelium_side' }, hardness: 0.6, tool: 'shovel', sound: 'grass', drops: one('dirt') });
block(206, 'red_mushroom_block', 'Red Mushroom Block', { hardness: 0.2, tool: 'axe', sound: 'wood', drops: capDrops });
block(207, 'brown_mushroom_block', 'Brown Mushroom Block', { hardness: 0.2, tool: 'axe', sound: 'wood', drops: capDrops });
block(208, 'mushroom_stem', 'Mushroom Stem', { hardness: 0.2, tool: 'axe', sound: 'wood', drops: none });
block(209, 'red_mushroom', 'Red Mushroom', { ...plant, support: SOIL });
block(210, 'podzol', 'Podzol', { tex: { top: 'podzol_top', bottom: 'dirt', side: 'podzol_side' }, hardness: 0.5, tool: 'shovel', sound: 'gravel', drops: one('dirt') });
block(211, 'fern', 'Fern', { ...plant, tint: 2, replaceable: true, drops: (r) => (r() < 0.125 ? [[ID.wheat_seeds, 1]] : []), support: SOIL });
block(212, 'cornflower', 'Cornflower', { ...plant, support: SOIL });
block(213, 'allium', 'Allium', { ...plant, support: SOIL });
block(214, 'tulip', 'Tulip', { ...plant, support: SOIL });
block(215, 'oxeye_daisy', 'Oxeye Daisy', { ...plant, support: SOIL });
block(216, 'sunflower', 'Sunflower', { ...plant, support: SOIL });
block(217, 'lily_pad', 'Lily Pad', { render: RENDER.MODEL, opaque: false, hardness: 0, sound: 'grass', height: 0.0625, boxes: [[0, 0, 0, 16, 1, 16]], support: () => [B.water, B.ice, B.frosted_ice] });
block(218, 'bamboo', 'Bamboo', { ...plant, fuel: 3, support: () => [B.grass, B.dirt, B.podzol, B.sand, B.bamboo] });
block(219, 'tube_coral_block', 'Tube Coral Block', { hardness: 1.5, tool: 'pickaxe', level: 0 });
block(220, 'fire_coral_block', 'Fire Coral Block', { hardness: 1.5, tool: 'pickaxe', level: 0 });
block(221, 'brain_coral_block', 'Brain Coral Block', { hardness: 1.5, tool: 'pickaxe', level: 0 });
// A Charred Skull set down: three of them on a T of soul sand wake the Wither
block(222, 'charred_skull_block', 'Charred Skull', { render: RENDER.MODEL, tex: { top: 'skull_side', bottom: 'skull_side', side: 'skull_side', front: 'skull_front' }, opaque: false, facing: true, hardness: 1, sound: 'stone',
  noItem: true, drops: one('charred_skull'), height: 0.5, boxes: [[4, 0, 4, 12, 8, 12]] });
// A beacon on a three-by-three of iron, gold, diamond or emerald blocks lends strength to everyone near it
block(223, 'beacon', 'Beacon', { render: RENDER.MODEL, tex: 'glass', art: 'beacon', opaque: false, light: 15, hardness: 3, sound: 'glass',
  boxes: [[2, 0, 2, 14, 3, 14, 'obsidian'], [3, 3, 3, 13, 13, 13, 'beacon'], [0, 0, 0, 2, 16, 2], [14, 0, 0, 16, 16, 2], [0, 0, 14, 2, 16, 16], [14, 0, 14, 16, 16, 16], [2, 14, 0, 14, 16, 16], [0, 14, 2, 2, 16, 14], [14, 14, 2, 16, 16, 14]] });
// Pressure plates: stepping on one sets off TNT beside or under it and opens doors next to it
const plate = (tex, o) => ({ render: RENDER.MODEL, tex, opaque: false, solid: false, plate: true, support: 'solid', boxes: [[1, 0, 1, 15, 1, 15]], ...o });
block(224, 'stone_pressure_plate', 'Stone Pressure Plate', plate('stone', { hardness: 0.5, tool: 'pickaxe', level: 0 }));
block(225, 'oak_pressure_plate', 'Oak Pressure Plate', plate('oak_planks', { hardness: 0.5, tool: 'axe', sound: 'wood', fuel: 15 }));
for (const [i, full, key, name] of [[226, 'acacia_planks', 'acacia_slab', 'Acacia Slab'], [227, 'cherry_planks', 'cherry_slab', 'Cherry Slab']]) {
  const f = BLOCKS[B[full]];
  block(i, key, name, { render: RENDER.SLAB, tex: f.tex, opaque: false, atten: 1, slab: full, hardness: f.hardness, tool: f.tool, level: f.level, sound: f.sound, fuel: 7 });
}
// (1.10) what bastions and the reworked fortresses are built of, and the Nether's new lands
const brickish = { hardness: 1.5, tool: 'pickaxe', level: 0 };
block(228, 'polished_blackstone_bricks', 'Polished Blackstone Bricks', brickish);
block(229, 'cracked_polished_blackstone_bricks', 'Cracked Polished Blackstone Bricks', brickish);
block(230, 'chiseled_polished_blackstone', 'Chiseled Polished Blackstone', brickish);
block(231, 'crying_obsidian', 'Crying Obsidian', { hardness: 50, tool: 'pickaxe', level: 3, light: 10 });
block(232, 'red_nether_bricks', 'Red Nether Bricks', { hardness: 2, tool: 'pickaxe', level: 0 });
block(233, 'cracked_nether_bricks', 'Cracked Nether Bricks', { hardness: 2, tool: 'pickaxe', level: 0 });
block(234, 'ash', 'Ash', { hardness: 0.5, tool: 'shovel', sound: 'sand' });
block(235, 'charred_log', 'Charred Log', { tex: { top: 'charred_log_top', bottom: 'charred_log_top', side: 'charred_log' }, hardness: 2, tool: 'axe', sound: 'wood', fuel: 20 });
block(236, 'ember_log', 'Smouldering Log', { tex: { top: 'charred_log_top', bottom: 'charred_log_top', side: 'ember_log' }, light: 7, hardness: 2, tool: 'axe', sound: 'wood', fuel: 20 });
block(237, 'quartz_pillar', 'Quartz Pillar', { tex: { top: 'quartz_pillar_top', bottom: 'quartz_pillar_top', side: 'quartz_pillar' }, hardness: 0.8, tool: 'pickaxe', level: 0 });
// (1.10.2) a sapling for every kind of tree: each grows into its own tree
block(238, 'birch_sapling', 'Birch Sapling', { ...plant, support: GROUND, sapling: 'birch' });
block(239, 'spruce_sapling', 'Spruce Sapling', { ...plant, support: () => [...GROUND(), B.podzol], sapling: 'spruce' });
block(240, 'jungle_sapling', 'Jungle Sapling', { ...plant, support: GROUND, sapling: 'jungle' });
block(241, 'dark_oak_sapling', 'Dark Oak Sapling', { ...plant, support: GROUND, sapling: 'dark_oak' });
block(242, 'acacia_sapling', 'Acacia Sapling', { ...plant, support: GROUND, sapling: 'acacia' });
block(243, 'cherry_sapling', 'Cherry Sapling', { ...plant, support: GROUND, sapling: 'cherry' });

export const JOB_BLOCKS = {};   // profession -> block id
for (const b of BLOCKS) if (b && b.job) JOB_BLOCKS[b.job] = b.id;

// How easily fire catches each block
const FLAMMABLE = {
  oak_log: 5, birch_log: 5, spruce_log: 5, jungle_log: 5, dark_oak_log: 5,
  oak_planks: 20, birch_planks: 20, spruce_planks: 20, jungle_planks: 20, dark_oak_planks: 20,
  oak_leaves: 60, birch_leaves: 60, spruce_leaves: 60, jungle_leaves: 60, dark_oak_leaves: 60,
  tall_grass: 100, dead_bush: 100, dandelion: 100, poppy: 100, oak_sapling: 100, hay_bale: 60,
  birch_sapling: 100, spruce_sapling: 100, jungle_sapling: 100, dark_oak_sapling: 100, acacia_sapling: 100, cherry_sapling: 100,
  bookshelf: 30, oak_fence: 20, crafting_table: 5, tnt: 100, cactus: 0, sugar_cane: 60, oak_door: 5, oak_door_top: 5,
  bed_foot: 20, bed_head: 20, pumpkin: 5, cobweb: 60, nether_wart_block: 0, crimson_roots: 60, warped_roots: 60,
  oak_slab: 20, birch_slab: 20, spruce_slab: 20, jungle_slab: 20, dark_oak_slab: 20,
  oak_trapdoor: 20, birch_trapdoor: 20, spruce_trapdoor: 20, jungle_trapdoor: 20, dark_oak_trapdoor: 20, sign: 20, wall_sign: 20,
  composter: 20, lectern: 30, smithing_table: 5, fletching_table: 5, loom: 20,
  acacia_log: 5, cherry_log: 5, acacia_planks: 20, cherry_planks: 20, acacia_leaves: 60, cherry_leaves: 60, acacia_slab: 20, cherry_slab: 20,
  fern: 100, cornflower: 100, allium: 100, tulip: 100, oxeye_daisy: 100, sunflower: 100, bamboo: 60, oak_pressure_plate: 20,
};
for (const [k, v] of Object.entries(FLAMMABLE)) if (BLOCKS[B[k]]) BLOCKS[B[k]].flammable = v;
WOOL_COLORS.forEach(([k]) => { BLOCKS[B[k + '_wool']].flammable = 60; });

// ---------------------------------------------------------------- items
function item(id, key, name, o = {}) {
  const d = {
    id, key, name, isBlock: false,
    stack: o.stack ?? 64,
    icon: o.icon || key,
    food: o.food || 0,
    sat: o.sat || 0,
    hungerChance: o.hungerChance || 0,
    fuel: o.fuel || 0,
    tool: o.tool || null,
    tier: o.tier ?? -1,
    speed: o.speed || 1,
    durability: o.durability || 0,
    damage: o.damage || 1,
    attackSpeed: o.attackSpeed || 4,
    armor: o.armor || null,    // { slot: 0 helmet | 1 chestplate | 2 leggings | 3 boots, points, toughness }
    hidden: !!o.hidden,
    horseArmor: o.horseArmor || 0,   // the share of a blow this takes off a horse wearing it
  };
  ITEMS[id] = d;
  ID[key] = id;
  return d;
}

item(256, 'stick', 'Stick', { fuel: 5 });
item(257, 'coal', 'Coal', { fuel: 80 });
item(258, 'charcoal', 'Charcoal', { fuel: 80 });
item(259, 'iron_ingot', 'Iron Ingot');
item(260, 'gold_ingot', 'Gold Ingot');
item(261, 'diamond', 'Diamond');
item(262, 'redstone', 'Redstone Dust');
item(263, 'lapis_lazuli', 'Lapis Lazuli');
item(264, 'flint', 'Flint');
item(265, 'clay_ball', 'Clay Ball');
item(266, 'brick', 'Brick');
item(267, 'string', 'String');
item(268, 'feather', 'Feather');
item(269, 'gunpowder', 'Gunpowder');
item(270, 'bone', 'Bone');
item(271, 'leather', 'Leather');
item(272, 'rotten_flesh', 'Rotten Flesh', { food: 4, sat: 0.8, hungerChance: 0.8 });
item(273, 'apple', 'Apple', { food: 4, sat: 2.4 });
item(274, 'porkchop', 'Raw Porkchop', { food: 3, sat: 1.8 });
item(275, 'cooked_porkchop', 'Cooked Porkchop', { food: 8, sat: 12.8 });
item(276, 'beef', 'Raw Beef', { food: 3, sat: 1.8 });
item(277, 'steak', 'Steak', { food: 8, sat: 12.8 });
item(278, 'chicken', 'Raw Chicken', { food: 2, sat: 1.2, hungerChance: 0.3 });
item(279, 'cooked_chicken', 'Cooked Chicken', { food: 6, sat: 7.2 });
item(280, 'mutton', 'Raw Mutton', { food: 2, sat: 1.2 });
item(281, 'cooked_mutton', 'Cooked Mutton', { food: 6, sat: 9.6 });
item(282, 'arrow', 'Arrow');
item(283, 'bow', 'Bow', { stack: 1, durability: 384, fuel: 15 });
item(284, 'flint_and_steel', 'Flint and Steel', { stack: 1, durability: 64 });
item(285, 'emerald', 'Emerald');
item(286, 'wheat_seeds', 'Wheat Seeds');
item(287, 'wheat', 'Wheat');
item(288, 'bread', 'Bread', { food: 5, sat: 6 });
item(289, 'paper', 'Paper');
item(290, 'book', 'Book');
item(291, 'slime_ball', 'Slimeball');
item(292, 'gloom_membrane', 'Gloom Membrane');
item(293, 'shade_pearl', 'Shade Pearl', { stack: 16 });
item(294, 'potion', 'Potion', { stack: 1, hidden: true });
item(295, 'bucket', 'Bucket', { stack: 16 });
item(296, 'water_bucket', 'Water Bucket', { stack: 1 });
item(297, 'lava_bucket', 'Lava Bucket', { stack: 1, fuel: 1000 });
item(298, 'cinder_rod', 'Cinder Rod', { fuel: 120 });
item(299, 'cinder_powder', 'Cinder Powder');
// (1.7: enchanting, fishing, and two more weapons)
item(325, 'enchanted_book', 'Enchanted Book', { stack: 1, hidden: true });   // (the creative inventory lists one for each enchantment instead)
item(326, 'fishing_rod', 'Fishing Rod', { stack: 1, durability: 64, fuel: 15 });
item(327, 'crossbow', 'Crossbow', { stack: 1, durability: 465, fuel: 15 });
item(328, 'trident', 'Trident', { stack: 1, durability: 250, tool: 'trident', damage: 12, attackSpeed: 1.1 });
item(329, 'cod', 'Raw Cod', { food: 2, sat: 0.4 });
item(330, 'cooked_cod', 'Cooked Cod', { food: 5, sat: 6 });
item(331, 'salmon', 'Raw Salmon', { food: 2, sat: 0.4 });
item(332, 'cooked_salmon', 'Cooked Salmon', { food: 6, sat: 9.6 });
item(333, 'experience_bottle', 'Experience Bottle');
// (1.8) a map to buried treasure (which one is kept in the stack's wear number), what the Wither leaves, and a golden apple
item(334, 'treasure_map', 'Treasure Map', { stack: 1 });
item(335, 'blight_star', 'Nether Star');
item(336, 'golden_apple', 'Golden Apple', { food: 4, sat: 9.6 });
item(360, 'shade_eye', 'Eye of the Shade', { stack: 16 });
item(361, 'nether_quartz', 'Nether Quartz');
item(362, 'gold_nugget', 'Gold Nugget');
item(363, 'nether_brick', 'Nether Brick');
item(364, 'magma_cream', 'Magma Cream');
item(365, 'wailer_tear', 'Wailer Tear');
item(366, 'clamper_shell', 'Clamper Shell');
item(367, 'charred_skull', 'Charred Skull');
item(368, 'copper_ingot', 'Copper Ingot');
item(369, 'shield', 'Shield', { stack: 1, durability: 336 });
// (1.10) riding: a saddle for a horse, a donkey or a strider; armour for a horse (how much of a blow it takes away); a boat
item(370, 'saddle', 'Saddle', { stack: 1 });
item(371, 'leather_horse_armor', 'Leather Horse Armour', { stack: 1, horseArmor: 0.12 });
item(372, 'iron_horse_armor', 'Iron Horse Armour', { stack: 1, horseArmor: 0.2 });
item(373, 'golden_horse_armor', 'Golden Horse Armour', { stack: 1, horseArmor: 0.28 });
item(374, 'diamond_horse_armor', 'Diamond Horse Armour', { stack: 1, horseArmor: 0.44 });
item(375, 'boat', 'Boat', { stack: 1 });

export const TOOL_MATERIALS = [
  { key: 'wooden', name: 'Wooden', tier: 0, speed: 2, durability: 59, dmg: 0, ing: '#planks' },
  { key: 'stone', name: 'Stone', tier: 1, speed: 4, durability: 131, dmg: 1, ing: '#cobblestone' },
  { key: 'iron', name: 'Iron', tier: 2, speed: 6, durability: 250, dmg: 2, ing: 'iron_ingot' },
  { key: 'golden', name: 'Golden', tier: 0, speed: 12, durability: 32, dmg: 0, ing: 'gold_ingot' },
  { key: 'diamond', name: 'Diamond', tier: 3, speed: 8, durability: 1561, dmg: 3, ing: 'diamond' },
];
// dmg / speed are listed per material in TOOL_MATERIALS order: wooden, stone, iron, golden, diamond
export const TOOL_TYPES = [
  { key: 'sword', name: 'Sword', dmg: [5, 6, 8, 5, 10], speed: [2.5, 2.5, 2.5, 2.8, 2.5], shape: ['X', 'X', 'S'] },
  { key: 'pickaxe', name: 'Pickaxe', dmg: [3, 4, 5, 3, 6], speed: [2, 2, 2, 2.2, 2], shape: ['XXX', ' S ', ' S '] },
  { key: 'axe', name: 'Axe', dmg: [6, 8, 9, 6, 11], speed: [1.5, 1.5, 1.6, 1.8, 1.6], shape: ['XX', 'XS', ' S'] },
  { key: 'shovel', name: 'Shovel', dmg: [3, 4, 5, 3, 6], speed: [2, 2, 2, 2.2, 2], shape: ['X', 'S', 'S'] },
];
TOOL_MATERIALS.forEach((m, mi) => {
  TOOL_TYPES.forEach((t, ti) => {
    item(300 + mi * 4 + ti, `${m.key}_${t.key}`, `${m.name} ${t.name}`, {
      stack: 1, tool: t.key, tier: m.tier, speed: m.speed, durability: m.durability,
      damage: t.dmg[mi], attackSpeed: t.speed[mi], icon: 'tool', fuel: m.key === 'wooden' ? 10 : 0,
    }).material = m.key;
  });
});

// Hoes (kept outside the tool id block above so older saves keep their ids)
TOOL_MATERIALS.forEach((m, mi) => {
  item(320 + mi, `${m.key}_hoe`, `${m.name} Hoe`, {
    stack: 1, tool: 'hoe', tier: m.tier, speed: m.speed, durability: m.durability,
    damage: 1, attackSpeed: [1, 2, 3, 1, 4][mi], icon: 'tool', fuel: m.key === 'wooden' ? 10 : 0,
  }).material = m.key;
});

// Armour: points, toughness and durability follow the original game
export const ARMOR_MATERIALS = [
  { key: 'leather', name: 'Leather', points: [1, 3, 2, 1], tough: 0, dur: 5, ing: 'leather' },
  { key: 'chainmail', name: 'Chainmail', points: [2, 5, 4, 1], tough: 0, dur: 15, ing: null },
  { key: 'iron', name: 'Iron', points: [2, 6, 5, 2], tough: 0, dur: 15, ing: 'iron_ingot' },
  { key: 'golden', name: 'Golden', points: [2, 5, 3, 1], tough: 0, dur: 7, ing: 'gold_ingot' },
  { key: 'diamond', name: 'Diamond', points: [3, 8, 6, 3], tough: 2, dur: 33, ing: 'diamond' },
];
export const ARMOR_PIECES = [
  { key: 'helmet', name: 'Helmet', mul: 11, shape: ['XXX', 'X X'] },
  { key: 'chestplate', name: 'Chestplate', mul: 16, shape: ['X X', 'XXX', 'XXX'] },
  { key: 'leggings', name: 'Leggings', mul: 15, shape: ['XXX', 'X X', 'X X'] },
  { key: 'boots', name: 'Boots', mul: 13, shape: ['X X', 'X X'] },
];
ARMOR_MATERIALS.forEach((m, mi) => {
  ARMOR_PIECES.forEach((pc, pi) => {
    item(340 + mi * 4 + pi, `${m.key}_${pc.key}`, `${m.name} ${pc.name}`, {
      stack: 1, durability: m.dur * pc.mul, icon: 'armor',
      armor: { slot: pi, points: m.points[pi], toughness: m.tough },
    }).material = m.key;
  });
});

export function itemDef(id) { return ITEMS[id] || null; }
export function maxStack(id) { const d = ITEMS[id]; return d ? d.stack : 64; }
export function itemName(id) { const d = ITEMS[id]; return d ? d.name : '?'; }
export function fuelValue(id) { const d = ITEMS[id]; return d ? d.fuel : 0; }

// ---------------------------------------------------------------- recipes
const TAGS = {
  '#planks': ['oak_planks', 'birch_planks', 'spruce_planks', 'jungle_planks', 'dark_oak_planks', 'crimson_planks', 'warped_planks', 'acacia_planks', 'cherry_planks'],
  '#log': ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'dark_oak_log', 'crimson_stem', 'warped_stem', 'acacia_log', 'cherry_log'],
  '#wool': WOOL_COLORS.map(([k]) => k + '_wool'),
  '#coal': ['coal', 'charcoal'],
  '#cobblestone': ['cobblestone', 'cobbled_deepslate', 'blackstone'],   // what stone tools and furnaces can be made of
  '#wooden_slab': ['oak_slab', 'birch_slab', 'spruce_slab', 'jungle_slab', 'dark_oak_slab', 'crimson_slab', 'warped_slab', 'acacia_slab', 'cherry_slab'],
  '#mineral_block': ['iron_block', 'gold_block', 'diamond_block', 'emerald_block'],
};

const RECIPE_DEFS = [
  { in: ['oak_log'], out: ['oak_planks', 4] },
  { in: ['birch_log'], out: ['birch_planks', 4] },
  { in: ['spruce_log'], out: ['spruce_planks', 4] },
  { in: ['jungle_log'], out: ['jungle_planks', 4] },
  { in: ['dark_oak_log'], out: ['dark_oak_planks', 4] },
  { shape: ['###'], key: { '#': 'wheat' }, out: ['bread', 1] },
  { shape: ['###'], key: { '#': 'sugar_cane' }, out: ['paper', 3] },
  { in: ['paper', 'paper', 'paper', 'leather'], out: ['book', 1] },
  { shape: ['PPP', 'BBB', 'PPP'], key: { P: '#planks', B: 'book' }, out: ['bookshelf', 1] },
  { shape: ['WWW', 'PPP'], key: { W: '#wool', P: '#planks' }, out: ['bed_foot', 1] },
  { shape: ['PP', 'PP', 'PP'], key: { P: '#planks' }, out: ['oak_door', 3] },
  { shape: ['PPP', 'PPP', ' S '], key: { P: '#planks', S: 'stick' }, out: ['sign', 3] },
  ...['oak', 'birch', 'spruce', 'jungle', 'dark_oak'].map((wood) => ({ shape: ['PPP', 'PPP'], key: { P: wood + '_planks' }, out: [wood + '_trapdoor', 2] })),
  ...SLABS.map(([full, key]) => ({ shape: ['###'], key: { '#': full }, out: [key, 6] })),
  { shape: ['PSP', 'PSP'], key: { P: '#planks', S: 'stick' }, out: ['oak_fence', 3] },
  { shape: ['###', '###', '###'], key: { '#': 'wheat' }, out: ['hay_bale', 1] },
  { in: ['hay_bale'], out: ['wheat', 9] },
  { shape: ['#', '#'], key: { '#': '#planks' }, out: ['stick', 4] },
  { shape: ['##', '##'], key: { '#': '#planks' }, out: ['crafting_table', 1] },
  { shape: ['###', '# #', '###'], key: { '#': '#cobblestone' }, out: ['furnace', 1] },
  { shape: ['###', '# #', '###'], key: { '#': '#planks' }, out: ['chest', 1] },
  { shape: ['C', 'S'], key: { C: '#coal', S: 'stick' }, out: ['torch', 4] },
  { shape: ['##', '##'], key: { '#': 'stone' }, out: ['stone_bricks', 4] },
  { shape: ['##', '##'], key: { '#': 'sand' }, out: ['sandstone', 1] },
  { shape: ['##', '##'], key: { '#': 'brick' }, out: ['bricks', 1] },
  { shape: ['##', '##'], key: { '#': 'clay_ball' }, out: ['clay', 1] },
  { shape: ['##', '##'], key: { '#': 'string' }, out: ['white_wool', 1] },
  { shape: ['XSX', 'SXS', 'XSX'], key: { X: 'gunpowder', S: 'sand' }, out: ['tnt', 1] },
  { shape: [' S#', 'S #', ' S#'], key: { S: 'stick', '#': 'string' }, out: ['bow', 1] },
  { shape: ['F', 'S', 'E'], key: { F: 'flint', S: 'stick', E: 'feather' }, out: ['arrow', 4] },
  { in: ['iron_ingot', 'flint'], out: ['flint_and_steel', 1] },
  { shape: ['#I#', '###', ' # '], key: { '#': '#planks', I: 'iron_ingot' }, out: ['shield', 1] },
  { in: ['cobblestone', 'oak_leaves'], out: ['mossy_cobblestone', 1] },
  { shape: ['###', '###', '###'], key: { '#': 'glowstone' }, out: ['glowstone', 9], skip: true },
  // the Nether and the End
  { in: ['crimson_stem'], out: ['crimson_planks', 4] },
  { in: ['warped_stem'], out: ['warped_planks', 4] },
  { shape: ['X X', ' X '], key: { X: 'iron_ingot' }, out: ['bucket', 1] },
  { shape: ['P P', 'PPP'], key: { P: '#planks' }, out: ['boat', 1] },
  { shape: ['LLL', 'LIL'], key: { L: 'leather', I: 'iron_ingot' }, out: ['saddle', 1] },
  { shape: ['L L', 'LLL', 'L L'], key: { L: 'leather' }, out: ['leather_horse_armor', 1] },
  { shape: ['BB', 'BB'], key: { B: 'blackstone' }, out: ['polished_blackstone_bricks', 4] },
  { shape: ['B', 'B'], key: { B: 'blackstone_slab' }, out: ['chiseled_polished_blackstone', 1] },
  { shape: ['NW', 'WN'], key: { N: 'nether_brick', W: 'nether_wart' }, out: ['red_nether_bricks', 1] },
  { shape: ['Q', 'Q'], key: { Q: 'quartz_block' }, out: ['quartz_pillar', 2] },
  { in: ['cinder_rod'], out: ['cinder_powder', 2] },
  { in: ['shade_pearl', 'cinder_powder'], out: ['shade_eye', 1] },
  { shape: ['##', '##'], key: { '#': 'nether_brick' }, out: ['nether_bricks', 1] },
  { shape: ['#N#', '#N#'], key: { '#': 'nether_bricks', N: 'nether_brick' }, out: ['nether_brick_fence', 6] },
  { shape: ['##', '##'], key: { '#': 'nether_quartz' }, out: ['quartz_block', 1] },
  { shape: ['##', '##'], key: { '#': 'magma_cream' }, out: ['magma_block', 1] },
  { shape: ['##', '##'], key: { '#': 'end_stone' }, out: ['end_stone_bricks', 4] },
  { shape: ['###', '###', '###'], key: { '#': 'gold_nugget' }, out: ['gold_ingot', 1] },
  { in: ['gold_ingot'], out: ['gold_nugget', 9] },
  { shape: ['###', '###', '###'], key: { '#': 'bone' }, out: ['bone_block', 1] },
  { in: ['bone_block'], out: ['bone', 9] },
  // enchanting and mending
  { shape: [' B ', 'DOD', 'OOO'], key: { B: 'book', D: 'diamond', O: 'obsidian' }, out: ['enchanting_table', 1] },
  { shape: ['BBB', ' I ', 'III'], key: { B: 'iron_block', I: 'iron_ingot' }, out: ['anvil', 1] },
  // the blocks villagers work at
  { shape: ['S S', 'S S', 'SSS'], key: { S: '#wooden_slab' }, out: ['composter', 1] },
  { shape: ['SSS', ' B ', ' S '], key: { S: '#wooden_slab', B: 'bookshelf' }, out: ['lectern', 1] },
  { shape: ['III', 'IFI', 'SSS'], key: { I: 'iron_ingot', F: 'furnace', S: 'stone' }, out: ['blast_furnace', 1] },
  { shape: ['TST', 'P P'], key: { T: 'stick', S: 'stone_slab', P: '#planks' }, out: ['grindstone', 1] },
  { shape: ['II', 'PP', 'PP'], key: { I: 'iron_ingot', P: '#planks' }, out: ['smithing_table', 1] },
  { shape: [' L ', 'LFL', ' L '], key: { L: '#log', F: 'furnace' }, out: ['smoker', 1] },
  { shape: ['FF', 'PP', 'PP'], key: { F: 'flint', P: '#planks' }, out: ['fletching_table', 1] },
  { shape: [' R ', 'CCC'], key: { R: 'cinder_rod', C: '#cobblestone' }, out: ['brewing_stand', 1] },
  { shape: ['SS', 'PP'], key: { S: 'string', P: '#planks' }, out: ['loom', 1] },
  { shape: ['I I', 'I I', 'III'], key: { I: 'iron_ingot' }, out: ['cauldron', 1] },
  { shape: [' I ', 'SSS'], key: { I: 'iron_ingot', S: 'stone' }, out: ['stonecutter', 1] },
  // the new lands
  { in: ['acacia_log'], out: ['acacia_planks', 4] },
  { in: ['cherry_log'], out: ['cherry_planks', 4] },
  { shape: ['###'], key: { '#': 'acacia_planks' }, out: ['acacia_slab', 6] },
  { shape: ['###'], key: { '#': 'cherry_planks' }, out: ['cherry_slab', 6] },
  { shape: ['#', '#'], key: { '#': 'bamboo' }, out: ['stick', 1] },
  { shape: ['##', '##'], key: { '#': 'red_sand' }, out: ['red_terracotta', 1] },
  { shape: ['###', '###', '###'], key: { '#': 'ice' }, out: ['packed_ice', 1] },
  { shape: ['##'], key: { '#': 'stone' }, out: ['stone_pressure_plate', 1] },
  { shape: ['##'], key: { '#': '#planks' }, out: ['oak_pressure_plate', 1] },
  { shape: ['GGG', 'GAG', 'GGG'], key: { G: 'gold_ingot', A: 'apple' }, out: ['golden_apple', 1] },
  { shape: ['GGG', 'GSG', 'OOO'], key: { G: 'glass', S: 'blight_star', O: 'obsidian' }, out: ['beacon', 1] },
  // fishing and the crossbow
  { shape: ['  S', ' ST', 'S T'], key: { S: 'stick', T: 'string' }, out: ['fishing_rod', 1] },
  { shape: ['SIS', 'TIT', ' S '], key: { S: 'stick', I: 'iron_ingot', T: 'string' }, out: ['crossbow', 1] },
];
for (const [block, ingot] of [['emerald_block', 'emerald'], ['iron_block', 'iron_ingot'], ['gold_block', 'gold_ingot'], ['diamond_block', 'diamond'], ['coal_block', 'coal'], ['redstone_block', 'redstone'], ['lapis_block', 'lapis_lazuli'], ['copper_block', 'copper_ingot']]) {
  RECIPE_DEFS.push({ shape: ['###', '###', '###'], key: { '#': ingot }, out: [block, 1] });
  RECIPE_DEFS.push({ in: [block], out: [ingot, 9] });
}
for (const m of TOOL_MATERIALS) {
  RECIPE_DEFS.push({ shape: ['XX', ' S', ' S'], key: { X: m.ing, S: 'stick' }, out: [`${m.key}_hoe`, 1] });
}
for (const m of ARMOR_MATERIALS) {
  if (!m.ing) continue;
  for (const pc of ARMOR_PIECES) RECIPE_DEFS.push({ shape: pc.shape, key: { X: m.ing }, out: [`${m.key}_${pc.key}`, 1] });
}
for (const m of TOOL_MATERIALS) {
  for (const t of TOOL_TYPES) {
    RECIPE_DEFS.push({ shape: t.shape, key: { X: m.ing, S: 'stick' }, out: [`${m.key}_${t.key}`, 1] });
  }
}

// Is this item the named thing, or one of a group ('#planks')?
export const inTag = (tag, id) => (TAGS[tag] || [tag]).some((k) => ID[k] === id);

const TAG_LABELS = { '#planks': 'Planks', '#log': 'Logs', '#coal': 'Coal or Charcoal', '#wooden_slab': 'Wooden Slabs' };
export const tagIds = (tag) => (TAGS[tag] || [tag]).map((k) => ID[k]);

function ingredientSet(k) {
  const keys = TAGS[k] || [k];
  return new Set(keys.map((x) => ID[x]));
}

// Ingredients as totals, for the recipe book: [{ ids, n, label }]
function ingredientGroups(keys) {
  const m = new Map();
  for (const k of keys) m.set(k, (m.get(k) || 0) + 1);
  return [...m].map(([k, n]) => ({ ids: [...ingredientSet(k)], n, label: TAG_LABELS[k] || null }));
}

export const RECIPES = [];
for (const r of RECIPE_DEFS) {
  if (r.skip) continue;
  const out = { id: ID[r.out[0]], count: r.out[1] };
  if (r.in) {
    RECIPES.push({ shapeless: true, ings: r.in.map(ingredientSet), out, groups: ingredientGroups(r.in), size: r.in.length <= 4 ? 2 : 3 });
  } else {
    const h = r.shape.length;
    const w = Math.max(...r.shape.map((s) => s.length));
    const cells = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = r.shape[y][x] || ' ';
        cells.push(ch === ' ' ? null : ingredientSet(r.key[ch]));
      }
    }
    const keys = r.shape.join('').split('').filter((ch) => ch !== ' ').map((ch) => r.key[ch]);
    RECIPES.push({ shapeless: false, w, h, cells, out, groups: ingredientGroups(keys), size: Math.max(w, h) });
  }
}

// ids: flat n*n array of item ids (0 = empty). Returns {id, count} or null.
export function matchRecipe(ids, n) {
  let minR = n, maxR = -1, minC = n, maxC = -1, count = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (ids[r * n + c]) {
        count++;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR < 0) return null;
  const h = maxR - minR + 1, w = maxC - minC + 1;
  for (const rec of RECIPES) {
    if (rec.shapeless) {
      if (rec.ings.length !== count) continue;
      const used = new Array(rec.ings.length).fill(false);
      let ok = true;
      for (let i = 0; i < n * n && ok; i++) {
        const id = ids[i];
        if (!id) continue;
        let found = false;
        for (let k = 0; k < rec.ings.length; k++) {
          if (!used[k] && rec.ings[k].has(id)) { used[k] = true; found = true; break; }
        }
        if (!found) ok = false;
      }
      if (ok) return rec.out;
      continue;
    }
    if (rec.w !== w || rec.h !== h) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let r = 0; r < h && ok; r++) {
        for (let c = 0; c < w && ok; c++) {
          const exp = rec.cells[r * w + (mirror ? w - 1 - c : c)];
          const act = ids[(minR + r) * n + minC + c];
          if (!exp) { if (act) ok = false; }
          else if (!exp.has(act)) ok = false;
        }
      }
      if (ok) return rec.out;
    }
  }
  return null;
}

// ---------------------------------------------------------------- smelting
const SMELT_DEFS = {
  iron_ore: 'iron_ingot', gold_ore: 'gold_ingot', sand: 'glass', cobblestone: 'stone',
  clay_ball: 'brick', porkchop: 'cooked_porkchop', beef: 'steak', chicken: 'cooked_chicken',
  mutton: 'cooked_mutton', oak_log: 'charcoal', birch_log: 'charcoal', spruce_log: 'charcoal',
  diamond_ore: 'diamond', coal_ore: 'coal', clay: 'terracotta', emerald_ore: 'emerald', lapis_ore: 'lapis_lazuli', redstone_ore: 'redstone',
  netherrack: 'nether_brick', nether_quartz_ore: 'nether_quartz', nether_gold_ore: 'gold_ingot', crimson_stem: 'charcoal', warped_stem: 'charcoal',
  jungle_log: 'charcoal', dark_oak_log: 'charcoal', acacia_log: 'charcoal', cherry_log: 'charcoal', red_sand: 'glass',
  copper_ore: 'copper_ingot', cobbled_deepslate: 'deepslate', cod: 'cooked_cod', salmon: 'cooked_salmon',
  deepslate_coal_ore: 'coal', deepslate_iron_ore: 'iron_ingot', deepslate_gold_ore: 'gold_ingot', deepslate_diamond_ore: 'diamond',
  deepslate_redstone_ore: 'redstone', deepslate_lapis_ore: 'lapis_lazuli', deepslate_emerald_ore: 'emerald', deepslate_copper_ore: 'copper_ingot',
  polished_blackstone_bricks: 'cracked_polished_blackstone_bricks', nether_bricks: 'cracked_nether_bricks', charred_log: 'charcoal', ember_log: 'charcoal',
};

// Mining a block drops it only with a good enough pickaxe (stone needs wood, iron ore stone,
// diamonds iron, obsidian diamond); other tools and blocks always drop
export function canHarvest(def, held) {
  if (def.tool !== 'pickaxe' || def.level < 0) return true;
  const it = held ? ITEMS[held.id] : null;
  return !!(it && !it.isBlock && it.tool === 'pickaxe' && it.tier >= def.level);
}
export const SMELTING = new Map();
for (const [a, b] of Object.entries(SMELT_DEFS)) SMELTING.set(ID[a], ID[b]);

// Order used by the creative inventory
export function creativeList() {
  const out = [];
  for (let i = 1; i < BLOCKS.length; i++) if (BLOCKS[i] && !BLOCKS[i].noItem) out.push(i);
  for (let i = 256; i < ITEMS.length; i++) if (ITEMS[i] && !ITEMS[i].hidden) out.push(i);
  return out;
}
