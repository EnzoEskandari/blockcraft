// Block, item, recipe and smelting definitions.
// Block ids fit in a byte (they are stored in chunk arrays); plain items start at 256.

export const RENDER = { CUBE: 0, CROSS: 1, TORCH: 2, LIQUID: 3, BED: 4, DOOR: 5, FENCE: 6, PORTAL: 7, END_PORTAL: 8 };

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
    slow: o.slow || 0,         // movement multiplier while inside (cobweb)
    flammable: o.flammable || 0, // how readily fire burns this block away (0 = never)
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
const leaves = (extra) => ({
  opaque: false, cutout: true, hardness: 0.2, sound: 'grass', atten: 1, tool: 'hoe',
  drops: (r) => {
    const out = [];
    if (r() < 0.05) out.push([ID.oak_sapling, 1]);
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
block(16, 'birch_leaves', 'Birch Leaves', leaves(false));
block(17, 'spruce_leaves', 'Spruce Leaves', leaves(false));
block(18, 'glass', 'Glass', { opaque: false, cutout: true, cullSame: true, hardness: 0.3, sound: 'glass', drops: none });
block(19, 'coal_ore', 'Coal Ore', { hardness: 3, tool: 'pickaxe', level: 0, drops: one('coal') });
block(20, 'iron_ore', 'Iron Ore', { hardness: 3, tool: 'pickaxe', level: 1 });
block(21, 'gold_ore', 'Gold Ore', { hardness: 3, tool: 'pickaxe', level: 2 });
block(22, 'diamond_ore', 'Diamond Ore', { hardness: 3, tool: 'pickaxe', level: 2, drops: one('diamond') });
block(23, 'redstone_ore', 'Redstone Ore', { hardness: 3, tool: 'pickaxe', level: 2, drops: range('redstone', 4, 5) });
block(24, 'lapis_ore', 'Lapis Lazuli Ore', { hardness: 3, tool: 'pickaxe', level: 1, drops: range('lapis_lazuli', 4, 8) });
block(25, 'snowy_grass', 'Snowy Grass Block', { tex: { top: 'snow', bottom: 'dirt', side: 'snowy_grass_side' }, hardness: 0.6, tool: 'shovel', sound: 'snow', drops: one('dirt') });
block(26, 'snow', 'Snow Block', { hardness: 0.2, tool: 'shovel', sound: 'snow' });
block(27, 'ice', 'Ice', { hardness: 0.5, tool: 'pickaxe', sound: 'glass', drops: none });
block(28, 'cactus', 'Cactus', { tex: { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side' }, hardness: 0.4, sound: 'wool', support: () => [B.sand, B.cactus] });
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
block(45, 'dead_bush', 'Dead Bush', { ...plant, replaceable: true, drops: range('stick', 0, 2), support: () => [B.sand, B.dirt] });
block(46, 'oak_sapling', 'Oak Sapling', { ...plant, support: GROUND });
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
block(71, 'emerald_ore', 'Emerald Ore', { hardness: 3, tool: 'pickaxe', level: 2, drops: one('emerald') });
block(72, 'emerald_block', 'Block of Emerald', { hardness: 5, tool: 'pickaxe', level: 2, sound: 'metal' });
block(73, 'dirt_path', 'Dirt Path', { tex: { top: 'dirt_path_top', bottom: 'dirt', side: 'dirt_path_side' }, hardness: 0.65, tool: 'shovel', sound: 'gravel', drops: one('dirt') });
block(74, 'farmland', 'Farmland', { tex: { top: 'farmland_top', bottom: 'dirt', side: 'dirt' }, hardness: 0.6, tool: 'shovel', sound: 'gravel', drops: one('dirt') });
for (let s = 0; s < 4; s++) {
  block(75 + s, 'wheat_' + s, 'Wheat Crops', { ...plant, tex: 'wheat_' + s, noItem: true, support: () => [B.farmland], drops: wheatDrops(s) });
}
block(79, 'hay_bale', 'Hay Bale', { tex: { top: 'hay_bale_top', bottom: 'hay_bale_top', side: 'hay_bale_side' }, hardness: 0.5, sound: 'grass' });
block(80, 'bed_foot', 'Red Bed', { render: RENDER.BED, tex: { top: 'bed_foot_top', bottom: 'oak_planks', side: 'bed_side' }, solid: false, opaque: false, bed: true, facing: true, hardness: 0.2, sound: 'wool', stack: 1, art: 'bed', drops: bedDrop });
block(81, 'bed_head', 'Red Bed', { render: RENDER.BED, tex: { top: 'bed_head_top', bottom: 'oak_planks', side: 'bed_side' }, solid: false, opaque: false, bed: true, facing: true, hardness: 0.2, sound: 'wool', noItem: true, drops: bedDrop });
block(82, 'sugar_cane', 'Sugar Cane', { ...plant, support: () => [B.sand, B.grass, B.dirt, B.sugar_cane] });
block(83, 'jungle_log', 'Jungle Log', { tex: { top: 'jungle_log_top', bottom: 'jungle_log_top', side: 'jungle_log' }, hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(84, 'jungle_leaves', 'Jungle Leaves', { ...leaves(false), tint: 2 });
block(85, 'jungle_planks', 'Jungle Planks', { hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(86, 'dark_oak_log', 'Dark Oak Log', { tex: { top: 'dark_oak_log_top', bottom: 'dark_oak_log_top', side: 'dark_oak_log' }, hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
block(87, 'dark_oak_leaves', 'Dark Oak Leaves', { ...leaves(true), tint: 2 });
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
block(106, 'nether_quartz_ore', 'Nether Quartz Ore', { hardness: 3, tool: 'pickaxe', level: 0, drops: one('nether_quartz') });
block(107, 'nether_gold_ore', 'Nether Gold Ore', { hardness: 3, tool: 'pickaxe', level: 0, drops: nuggets });
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
block(140, 'spawner', 'Monster Spawner', { opaque: false, cutout: true, hardness: 5, tool: 'pickaxe', level: 0, sound: 'metal', drops: none });

// Caves & Ores: deepslate deep underground (with its own ores), copper, and the stones of cave walls
const deepOre = (o = {}) => ({ hardness: 4.5, tool: 'pickaxe', level: 0, ...o });
block(141, 'deepslate', 'Deepslate', { hardness: 3, tool: 'pickaxe', level: 0, drops: one('cobbled_deepslate') });
block(142, 'cobbled_deepslate', 'Cobbled Deepslate', { hardness: 3.5, tool: 'pickaxe', level: 0 });
block(143, 'deepslate_coal_ore', 'Deepslate Coal Ore', deepOre({ drops: one('coal') }));
block(144, 'deepslate_iron_ore', 'Deepslate Iron Ore', deepOre({ level: 1 }));
block(145, 'deepslate_gold_ore', 'Deepslate Gold Ore', deepOre({ level: 2 }));
block(146, 'deepslate_diamond_ore', 'Deepslate Diamond Ore', deepOre({ level: 2, drops: one('diamond') }));
block(147, 'deepslate_redstone_ore', 'Deepslate Redstone Ore', deepOre({ level: 2, drops: range('redstone', 4, 5) }));
block(148, 'deepslate_lapis_ore', 'Deepslate Lapis Lazuli Ore', deepOre({ level: 1, drops: range('lapis_lazuli', 4, 8) }));
block(149, 'deepslate_emerald_ore', 'Deepslate Emerald Ore', deepOre({ level: 2, drops: one('emerald') }));
block(150, 'copper_ore', 'Copper Ore', { hardness: 3, tool: 'pickaxe', level: 1 });
block(151, 'deepslate_copper_ore', 'Deepslate Copper Ore', deepOre({ level: 1 }));
block(152, 'copper_block', 'Block of Copper', { hardness: 3, tool: 'pickaxe', level: 1, sound: 'metal' });
block(153, 'tuff', 'Tuff', { hardness: 1.5, tool: 'pickaxe', level: 0 });
block(154, 'granite', 'Granite', { hardness: 1.5, tool: 'pickaxe', level: 0 });
block(155, 'diorite', 'Diorite', { hardness: 1.5, tool: 'pickaxe', level: 0 });
block(156, 'andesite', 'Andesite', { hardness: 1.5, tool: 'pickaxe', level: 0 });

// How easily fire catches each block
const FLAMMABLE = {
  oak_log: 5, birch_log: 5, spruce_log: 5, jungle_log: 5, dark_oak_log: 5,
  oak_planks: 20, birch_planks: 20, spruce_planks: 20, jungle_planks: 20, dark_oak_planks: 20,
  oak_leaves: 60, birch_leaves: 60, spruce_leaves: 60, jungle_leaves: 60, dark_oak_leaves: 60,
  tall_grass: 100, dead_bush: 100, dandelion: 100, poppy: 100, oak_sapling: 100, hay_bale: 60,
  bookshelf: 30, oak_fence: 20, crafting_table: 5, tnt: 100, cactus: 0, sugar_cane: 60, oak_door: 5, oak_door_top: 5,
  bed_foot: 20, bed_head: 20, pumpkin: 5, cobweb: 60, nether_wart_block: 0, crimson_roots: 60, warped_roots: 60,
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
item(360, 'shade_eye', 'Eye of the Shade', { stack: 16 });
item(361, 'nether_quartz', 'Nether Quartz');
item(362, 'gold_nugget', 'Gold Nugget');
item(363, 'nether_brick', 'Nether Brick');
item(364, 'magma_cream', 'Magma Cream');
item(365, 'wailer_tear', 'Wailer Tear');
item(366, 'clamper_shell', 'Clamper Shell');
item(367, 'charred_skull', 'Charred Skull');
item(368, 'copper_ingot', 'Copper Ingot');

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
  '#planks': ['oak_planks', 'birch_planks', 'spruce_planks', 'jungle_planks', 'dark_oak_planks', 'crimson_planks', 'warped_planks'],
  '#log': ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'dark_oak_log', 'crimson_stem', 'warped_stem'],
  '#wool': WOOL_COLORS.map(([k]) => k + '_wool'),
  '#coal': ['coal', 'charcoal'],
  '#cobblestone': ['cobblestone', 'cobbled_deepslate', 'blackstone'],   // what stone tools and furnaces can be made of
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
  { in: ['cobblestone', 'oak_leaves'], out: ['mossy_cobblestone', 1] },
  { shape: ['###', '###', '###'], key: { '#': 'glowstone' }, out: ['glowstone', 9], skip: true },
  // the Nether and the End
  { in: ['crimson_stem'], out: ['crimson_planks', 4] },
  { in: ['warped_stem'], out: ['warped_planks', 4] },
  { shape: ['X X', ' X '], key: { X: 'iron_ingot' }, out: ['bucket', 1] },
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

const TAG_LABELS = { '#planks': 'Planks', '#log': 'Logs', '#coal': 'Coal or Charcoal' };

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
  jungle_log: 'charcoal', dark_oak_log: 'charcoal',
  copper_ore: 'copper_ingot', cobbled_deepslate: 'deepslate',
  deepslate_coal_ore: 'coal', deepslate_iron_ore: 'iron_ingot', deepslate_gold_ore: 'gold_ingot', deepslate_diamond_ore: 'diamond',
  deepslate_redstone_ore: 'redstone', deepslate_lapis_ore: 'lapis_lazuli', deepslate_emerald_ore: 'emerald', deepslate_copper_ore: 'copper_ingot',
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
