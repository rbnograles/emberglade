// solid: collision radius. hp + tool: needs hits with that tool ('axe' | 'pickaxe' | null = anything).
// pick: taken instantly by hand. drops: [item, min, max]. regrow: days until it returns.
// item: placed object that is returned to the inventory when broken. pickR: cursor pick radius.
const tree = (name, extra = []) => ({
  name, solid: 0.32, hp: 4, tool: 'axe', drops: [['wood', 3, 4], ['stick', 0, 1], ...extra], regrow: 5, pickR: 1.1,
});
const rock = (name, drops) => ({ name, solid: 0.42, hp: 4, tool: 'pickaxe', drops, regrow: 6, pickR: 0.65 });
const placed = (name, solid = 0.42) => ({ name, solid, hp: 2, tool: null, pickR: 0.55 });

import { KEEPERS, carvingId, carvingName } from '../game/keepers.js';

export const OBJECTS = {
  ...Object.fromEntries(KEEPERS.map(k => [carvingId(k), { ...placed(carvingName(k), 0.22), item: carvingId(k) }])),
  rock_rime: { ...rock('Rimeglass seam', [['rimeglass', 2, 3]]), minPower: 2 },
  rock_ember: { ...rock('Emberglass vein', [['emberglass', 2, 3]]), minPower: 2 },
  weather_cairn: { name: 'Wayfarer cairn (use for rimeglass)', solid: 0.48, pickR: 0.75, cache: 'rimeglass' },
  kiln_ruin: { name: 'Abandoned kiln (use for emberglass)', solid: 0.5, pickR: 0.75, cache: 'emberglass' },
  // one-time treasures deep in the harsh regions (F to open)
  royal_hoard: { name: 'Castle hoard', solid: 0.45, pickR: 0.7, hoard: [['coin', 12, 20], ['iron_bar', 4, 6], ['crystal', 2, 3], ['pearl', 1, 2], ['golem_core', 1, 1, 0.5]] },
  frost_hoard: { name: 'Frozen hoard', solid: 0.45, pickR: 0.7, hoard: [['rimeglass', 5, 7], ['iron_bar', 2, 4], ['crystal', 1, 2], ['pearl', 1, 1, 0.5]] },
  ember_hoard: { name: 'Ember hoard', solid: 0.45, pickR: 0.7, hoard: [['emberglass', 5, 7], ['iron_bar', 2, 4], ['crystal', 2, 3], ['coal', 3, 6]] },
  // stairs: climbed, not walked round. They rise one whole storey across their tile.
  stairs: { ...placed('Timber stairs', 0), item: 'stairs', stairs: true },
  stone_stairs: { ...placed('Stone stairs', 0), item: 'stone_stairs', stairs: true, hp: 3 },
  brick_stairs: { ...placed('Brick stairs', 0), item: 'brick_stairs', stairs: true, hp: 3 },
  // the broad, easy steps of a castle approach: half a storey across their tile (rise: how far they climb)
  stone_steps: { ...placed('Stone steps', 0), item: 'stone_stairs', stairs: true, rise: 0.75, hp: 3 },
  window: { ...placed('Lattice window', 0.35), item: 'window', block: true },
  brick_wall: { ...placed('Brick wall', 0.35), item: 'brick_wall', block: true },
  stone_arch: { ...placed('Dressed stone arch', 0), item: 'stone_arch', hp: 3 },
  stone_pier: { ...placed('Stone pier', 0.32), item: 'stone_pier', hp: 3 },
  slit_window: { ...placed('Arrow loop'), item: 'slit_window', block: true, turns: true, hp: 3 },
  chart_table: { ...placed('Chart table', 0.35), item: 'chart_table' },
  table: { ...placed('Kitchen table', 0.35), item: 'table' },
  chair: { ...placed('Oak chair', 0.35), item: 'chair' },
  shelf: { ...placed('Bookcase', 0.35), item: 'shelf' },
  cabinet: { ...placed('Pantry cabinet', 0.35), item: 'cabinet' },
  lamp: { ...placed('Amber lamp', 0.35), item: 'lamp' },
  planter: { ...placed('Flower box', 0.35), item: 'planter' },
  gate: { ...placed('Pasture gate', 0), item: 'gate' },
  irrigator: { ...placed('Irrigation cistern', 0.35), item: 'irrigator' },

  tree_oak: tree('Oak tree', [['apple', 0, 2]]),
  tree_orange: tree('Maple tree'),
  tree_red: tree('Red maple'),
  tree_yellow: tree('Golden birch'),
  tree_pink: tree('Blossom tree'),
  tree_purple: tree('Wisteria tree'),
  tree_pine: tree('Pine tree'),
  tree_snowpine: tree('Snowy pine'),
  tree_dead: { name: 'Charred tree', solid: 0.3, hp: 3, tool: 'axe', drops: [['wood', 1, 2], ['coal', 1, 1]], regrow: 8, pickR: 0.7 },
  bush: { name: 'Berry bush', solid: 0.3, pick: true, hp: 2, tool: 'axe', drops: [['berries', 2, 3]], becomes: 'bush_bare', regrow: 2, pickR: 0.6 },
  bush_bare: { name: 'Bush (picked)', solid: 0.3, hp: 2, tool: 'axe', pickR: 0.6 },
  flower: { name: 'Flower', pick: true, drops: [['flower', 1, 1]], regrow: 3 },
  tallgrass: { name: 'Tall grass', pick: true, drops: [['fiber', 1, 1], ['seeds', 0, 1], ['turnip_seeds', 1, 1, 0.16], ['pumpkin_seeds', 1, 1, 0.08]], regrow: 3 },
  stick: { name: 'Stick', pick: true, drops: [['stick', 1, 1]], regrow: 3 },
  pebble: { name: 'Loose stone', pick: true, drops: [['stone', 1, 1]], regrow: 3 },
  boulder: rock('Boulder', [['stone', 2, 3]]),
  rock_coal: rock('Coal rock', [['coal', 2, 3], ['stone', 1, 1]]),
  rock_copper: rock('Copper rock', [['copper_ore', 2, 3], ['stone', 1, 1]]),
  // high mountains only; needs a copper pickaxe or better
  rock_crystal: { ...rock('Crystal rock', [['crystal', 1, 2], ['stone', 1, 1]]), minPower: 2 },
  lantern: { ...placed('Crystal lantern', 0.3), item: 'lantern' },
  coral_wall: { name: 'Coral wall', block: true, hp: 2, tool: null, pickR: 0.75, item: 'coral_wall' },
  // sea floor
  kelp: { name: 'Kelp', pick: true, drops: [['kelp', 1, 2]], regrow: 3, pickR: 0.5 },
  clam: { name: 'Clam', pick: true, drops: [['clam', 1, 1], ['pearl', 1, 1, 0.3]], regrow: 5 },
  coral: { name: 'Coral', pick: true, drops: [['coral', 1, 1]], regrow: 6, pickR: 0.55 },
  rock_iron: { ...rock('Iron rock', [['iron_ore', 2, 3], ['stone', 1, 1]]), minPower: 2 },
  campfire: { ...placed('Campfire'), item: 'campfire' },
  workbench: { ...placed('Workbench', 0.45), item: 'workbench' },
  fence: { ...placed('Fence', 0.45), hp: 1, item: 'fence' },
  bed: { ...placed('Bed', 0.45), item: 'bed' },
  chest: { ...placed('Chest'), item: 'chest' },
  // block: fills the whole tile (square collision). A closed door blocks the tile until used.
  wood_wall: { name: 'Wood wall', block: true, hp: 2, tool: null, pickR: 0.75, item: 'wood_wall' },
  stone_wall: { name: 'Stone wall', block: true, hp: 3, tool: null, pickR: 0.75, item: 'stone_wall' },
  battlement: { name: 'Battlement', block: true, top: 1.1, hp: 3, tool: null, pickR: 0.75, item: 'battlement' },
  door: { name: 'Door', door: true, hp: 2, tool: null, pickR: 0.6, item: 'door' },
  // what you were carrying when you fainted; opens like a chest and vanishes once emptied
  lostbag: { name: 'Your dropped pack', hp: 1, tool: null, pickR: 0.55 },
  soil: { name: 'Soil' },
};

export const CROP_RIPE = 3;
