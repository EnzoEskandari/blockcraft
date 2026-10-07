// World constants shared by generation, structures and rendering.

export const CS = 16;   // chunk width
export const CH = 128;  // world height
export const SEA = 62;  // sea level

export const BIOME = { PLAINS: 0, FOREST: 1, DESERT: 2, TAIGA: 3, SNOWY: 4, MOUNTAINS: 5, SWAMP: 6, JUNGLE: 7, DARK_FOREST: 8,
  // (1.8; the Nether's lands are 20 to 24 and the End is 30)
  SAVANNA: 9, BADLANDS: 10, BIRCH_FOREST: 11, FLOWER_FOREST: 12, CHERRY_GROVE: 13, SNOWY_TAIGA: 14, ICE_SPIKES: 15, MUSHROOM: 16, MEADOW: 17, OLD_TAIGA: 18, SUNFLOWER: 19,
  OCEAN: 25, DEEP_OCEAN: 26, FROZEN_OCEAN: 27, WARM_OCEAN: 28, BEACH: 29, SNOWY_PEAKS: 31, BAMBOO: 32 };
export const BIOME_NAMES = ['Plains', 'Forest', 'Desert', 'Taiga', 'Snowy Tundra', 'Mountains', 'Swamp', 'Jungle', 'Dark Forest',
  'Savanna', 'Badlands', 'Birch Forest', 'Flower Forest', 'Cherry Grove', 'Snowy Taiga', 'Ice Spikes', 'Mushroom Fields', 'Meadow', 'Old Growth Taiga', 'Sunflower Plains'];
Object.assign(BIOME_NAMES, { 25: 'Ocean', 26: 'Deep Ocean', 27: 'Frozen Ocean', 28: 'Warm Ocean', 29: 'Beach', 31: 'Snowy Peaks', 32: 'Bamboo Jungle' });
export const OVERWORLD_BIOMES = Object.keys(BIOME_NAMES).map(Number);
// Lands where water freezes over and strays walk
export const FROZEN = new Set([BIOME.SNOWY, BIOME.SNOWY_TAIGA, BIOME.ICE_SPIKES, BIOME.FROZEN_OCEAN, BIOME.SNOWY_PEAKS]);
