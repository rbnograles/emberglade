// ground: two top colours blended per tile. spawn: [objectId, chance per tile]
export const BIOMES = {
  meadow: {
    name: 'Green Meadow', ground: [0x9bd66f, 0x8dcb62],
    spawn: [['tree_oak', 0.03], ['bush', 0.025], ['flower', 0.05], ['tallgrass', 0.06], ['stick', 0.02], ['pebble', 0.018], ['boulder', 0.006]],
  },
  autumn: {
    name: 'Autumn Woods', ground: [0xd6cf6e, 0xc9c05e],
    spawn: [['tree_orange', 0.03], ['tree_red', 0.025], ['tree_yellow', 0.03], ['bush', 0.03], ['stick', 0.03], ['tallgrass', 0.04], ['pebble', 0.012], ['flower', 0.02]],
  },
  blossom: {
    name: 'Blossom Grove', ground: [0xa9e092, 0x9bd583],
    spawn: [['tree_pink', 0.035], ['tree_purple', 0.035], ['flower', 0.09], ['bush', 0.02], ['tallgrass', 0.03], ['stick', 0.015], ['pebble', 0.01]],
  },
  pine: {
    name: 'Pine Forest', ground: [0x7fc06e, 0x73b463],
    spawn: [['tree_pine', 0.09], ['tree_oak', 0.015], ['bush', 0.02], ['stick', 0.03], ['boulder', 0.01], ['pebble', 0.015], ['tallgrass', 0.03], ['rock_coal', 0.004]],
  },
  sand: {
    name: 'Sandy Flats', ground: [0xf2e4b8, 0xead9a8],
    spawn: [['boulder', 0.02], ['rock_coal', 0.022], ['rock_copper', 0.02], ['pebble', 0.03], ['stick', 0.008]],
  },
};

BIOMES.mountain = {
  name: 'Mountains', ground: [0x9aa1a3, 0x8d9496],
  spawn: [['boulder', 0.05], ['rock_coal', 0.03], ['rock_copper', 0.025], ['rock_crystal', 0.008], ['tree_pine', 0.03], ['pebble', 0.03], ['stick', 0.01]],
};
BIOMES.snow = {
  name: 'Snowy Peaks', ground: [0xf4f8fb, 0xe4edf3],
  spawn: [['boulder', 0.025], ['rock_crystal', 0.03], ['tree_pine', 0.012], ['rock_coal', 0.012]],
};
BIOMES.volcano = {
  name: 'Volcano', ground: [0x4d4549, 0x443c40],
  spawn: [['rock_coal', 0.025], ['boulder', 0.02], ['rock_iron', 0.012], ['rock_crystal', 0.005], ['pebble', 0.012]],
};
BIOMES.ash = {
  name: 'Ashlands', ground: [0x5a5054, 0x4f464a],
  spawn: [['tree_dead', 0.03], ['boulder', 0.02], ['rock_coal', 0.02], ['rock_iron', 0.008], ['pebble', 0.015], ['stick', 0.01]],
};
BIOMES.winter = {
  name: 'Frozen Wastes', ground: [0xeef4f8, 0xdfe9f0],
  spawn: [['tree_snowpine', 0.05], ['boulder', 0.012], ['stick', 0.02], ['pebble', 0.015], ['rock_coal', 0.006]],
};
BIOMES.winter.spawn.push(['rock_rime', 0.016], ['weather_cairn', 0.0009], ['frost_hoard', 0.0007]);
BIOMES.ash.spawn.push(['rock_ember', 0.016], ['kiln_ruin', 0.0009], ['ember_hoard', 0.0007]);
BIOMES.volcano.spawn.push(['rock_ember', 0.016], ['kiln_ruin', 0.0009], ['ember_hoard', 0.0007]);
BIOMES.canyon = {
  name: 'Canyon Lands', ground: [0xd9a066, 0xcf9459],
  spawn: [['tree_dead', 0.012], ['boulder', 0.03], ['pebble', 0.03], ['rock_copper', 0.02], ['rock_coal', 0.015], ['stick', 0.01]],
};
// sea tiles; ground is only used by the minimap
BIOMES.ocean = { name: 'Open Ocean', ground: [0x4f9fd6, 0x4a98cf], spawn: [] };

export const SHORE = { ground: BIOMES.sand.ground, spawn: [['pebble', 0.05], ['stick', 0.02]] };
// what grows and lies on the sea floor, by depth
export const SEABED = {
  shallow: [['kelp', 0.05], ['clam', 0.035], ['pebble', 0.02]],
  mid: [['kelp', 0.045], ['coral', 0.04], ['clam', 0.025], ['rock_iron', 0.008]],
  deep: [['rock_iron', 0.035], ['coral', 0.025], ['boulder', 0.02], ['clam', 0.01]],
};
export const WATER_COLORS = [0x82cbec, 0x74c0e6];
export const LAVA_COLORS = [0xff7a1a, 0xffb02e];
export const ICE_COLORS = [0xbfe6f5, 0xa9d8ee];
export const SEABED_COLORS = { shallow: 0xeadfae, deep: 0x4f8fb5 }; // sand near the surface, blue-grey far below

// The three kinds of rugged country, by the `land` of a tile: the name shown on screen, and the
// colours of the layers in their cliffs.
export const LAND_NAMES = { stacks: 'Stack Coast', table: 'Tablelands', canyon: 'Canyon Lands' };
export const ROCK_COLORS = {
  stacks: [0xb8b4a8, 0xa39f94, 0xc6c2b5, 0x8f8c84], // grey limestone
  table: [0x8a6a4a, 0x7a5c40, 0x9a7854, 0x6b5038], // brown earth
  canyon: [0xd08f58, 0xb9743f, 0xe0a56a, 0xa5633a], // sandstone
};
