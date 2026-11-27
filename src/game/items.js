// tool/power: what it harvests. food: hunger restored. place: object id it becomes. stack: max per slot.
export const ITEMS = {
  stick: { name: 'Stick' },
  stone: { name: 'Stone' },
  wood: { name: 'Wood' },
  fiber: { name: 'Fiber' },
  seeds: { name: 'Seeds', hint: 'RMB: plant on soil' },
  wheat: { name: 'Wheat' },
  coal: { name: 'Coal' },
  copper_ore: { name: 'Copper ore' },
  copper_bar: { name: 'Copper bar' },
  berries: { name: 'Berries', food: 1, water: 0.5, hint: 'C or right click: eat' },
  apple: { name: 'Apple', food: 2, water: 1, hint: 'C or right click: eat' },
  raw_meat: { name: 'Raw meat', food: 2, hint: 'C: eat (better cooked at a campfire)' },
  cooked_meat: { name: 'Cooked meat', food: 7, hint: 'C or right click: eat' },
  hide: { name: 'Hide' },
  torch: { name: 'Torch', light: true, hint: 'Hold it to light your way at night' },
  roasted_apple: { name: 'Roasted apple', food: 4, hint: 'C or right click: eat' },
  bread: { name: 'Bread', food: 6, hint: 'C or right click: eat' },
  flower: { name: 'Flower', place: 'flower', hint: 'RMB: place' },
  stone_axe: { name: 'Stone axe', tool: 'axe', power: 1, uses: 60, stack: 1, hint: 'LMB: chop trees' },
  copper_axe: { name: 'Copper axe', tool: 'axe', power: 2, uses: 200, stack: 1, hint: 'LMB: chop trees' },
  stone_pickaxe: { name: 'Stone pickaxe', tool: 'pickaxe', power: 1, uses: 60, stack: 1, hint: 'LMB: mine rocks' },
  copper_pickaxe: { name: 'Copper pickaxe', tool: 'pickaxe', power: 2, uses: 200, stack: 1, hint: 'LMB: mine rocks' },
  stone_sword: { name: 'Stone sword', weapon: 3, uses: 80, stack: 1, hint: 'LMB: attack' },
  copper_sword: { name: 'Copper sword', weapon: 5, uses: 240, stack: 1, hint: 'LMB: attack' },
  hoe: { name: 'Hoe', tool: 'hoe', uses: 80, stack: 1, hint: 'LMB: till grass into soil' },
  watering_can: { name: 'Watering can', tool: 'can', stack: 1, hint: 'RMB: water crops, refill at a pond' },
  campfire: { name: 'Campfire', place: 'campfire', hint: 'RMB: place' },
  workbench: { name: 'Workbench', place: 'workbench', hint: 'RMB: place' },
  fence: { name: 'Fence', place: 'fence', hint: 'RMB: place' },
  bed: { name: 'Bed', place: 'bed', hint: 'RMB: place' },
  chest: { name: 'Chest', place: 'chest', hint: 'RMB: place' },
  // base building. floor: laid under a tile (things can stand on it) and counts as shelter.
  wood_wall: { name: 'Wood wall', place: 'wood_wall', hint: 'RMB: place' },
  stone_wall: { name: 'Stone wall', place: 'stone_wall', hint: 'RMB: place' },
  door: { name: 'Door', place: 'door', hint: 'RMB: place (you can walk through, animals cannot)' },
  wood_floor: { name: 'Wood floor', floor: true, hint: 'RMB: lay floor (shelter from the cold)' },
  stone_floor: { name: 'Stone floor', floor: true, hint: 'RMB: lay floor (shelter from the cold)' },
  flask: { name: 'Water flask', flask: true, stack: 1, hint: 'X: drink. Refills when you drink at a pond' },
  // bags are worn on the back and add inventory slots
  woven_bag: { name: 'Woven bag', armor: 'back', bag: 9, color: 0xd9c27a, stack: 1, hint: 'RMB: wear (+9 slots)' },
  trail_pack: { name: 'Trail pack', armor: 'back', bag: 18, color: 0x8a5a34, stack: 1, hint: 'RMB: wear (+18 slots)' },
  // armor: which body slot it goes on, its armor points and the colour shown on the character
  woven_hat: { name: 'Woven hat', armor: 'head', def: 1, color: 0xd9c27a, stack: 1, hint: 'RMB: wear' },
  woven_tunic: { name: 'Woven tunic', armor: 'body', def: 1, color: 0xd9c27a, stack: 1, hint: 'RMB: wear' },
  woven_boots: { name: 'Woven boots', armor: 'feet', def: 1, color: 0xd9c27a, stack: 1, hint: 'RMB: wear' },
  copper_helmet: { name: 'Copper helmet', armor: 'head', def: 2, color: 0xd9803a, stack: 1, hint: 'RMB: wear' },
  copper_chestplate: { name: 'Copper chestplate', armor: 'body', def: 2, color: 0xd9803a, stack: 1, hint: 'RMB: wear' },
  copper_boots: { name: 'Copper boots', armor: 'feet', def: 2, color: 0xd9803a, stack: 1, hint: 'RMB: wear' },
};

export const ARMOR_SLOTS = ['head', 'body', 'feet', 'back'];
export const BASE_STORAGE = 9; // storage slots without a bag (the hotbar is extra)
export const FLASK_DRINKS = 3;
export const MAX_DEFENSE = 6;

export const stackSize = (id) => ITEMS[id].stack ?? 99;
