// solid: collision radius. hp + tool: needs hits with that tool ('axe' | 'pickaxe' | null = anything).
// pick: taken instantly by hand. drops: [item, min, max]. regrow: days until it returns.
// item: placed object that is returned to the inventory when broken. pickR: cursor pick radius.
const tree = (name, extra = []) => ({
  name, solid: 0.32, hp: 4, tool: 'axe', drops: [['wood', 3, 4], ['stick', 0, 1], ...extra], regrow: 5, pickR: 1.1,
});
const rock = (name, drops) => ({ name, solid: 0.42, hp: 4, tool: 'pickaxe', drops, regrow: 6, pickR: 0.65 });
const placed = (name, solid = 0.42) => ({ name, solid, hp: 2, tool: null, pickR: 0.55 });

export const OBJECTS = {
  tree_oak: tree('Oak tree', [['apple', 0, 2]]),
  tree_orange: tree('Maple tree'),
  tree_red: tree('Red maple'),
  tree_yellow: tree('Golden birch'),
  tree_pink: tree('Blossom tree'),
  tree_purple: tree('Wisteria tree'),
  tree_pine: tree('Pine tree'),
  bush: { name: 'Berry bush', solid: 0.3, pick: true, drops: [['berries', 2, 3]], becomes: 'bush_bare', regrow: 2, pickR: 0.6 },
  bush_bare: { name: 'Bush (picked)', solid: 0.3, pickR: 0.6 },
  flower: { name: 'Flower', pick: true, drops: [['flower', 1, 1]], regrow: 3 },
  tallgrass: { name: 'Tall grass', pick: true, drops: [['fiber', 1, 1], ['seeds', 0, 1]], regrow: 3 },
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
  // block: fills the whole tile (square collision). door: the player passes, animals do not.
  wood_wall: { name: 'Wood wall', block: true, hp: 2, tool: null, pickR: 0.75, item: 'wood_wall' },
  stone_wall: { name: 'Stone wall', block: true, hp: 3, tool: null, pickR: 0.75, item: 'stone_wall' },
  door: { name: 'Door', door: true, hp: 2, tool: null, pickR: 0.6, item: 'door' },
  // what you were carrying when you fainted; opens like a chest and vanishes once emptied
  lostbag: { name: 'Your dropped pack', hp: 1, tool: null, pickR: 0.55 },
  soil: { name: 'Soil' },
};

export const CROP_RIPE = 3;
