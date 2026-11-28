// What a new character can be. A class is a head start, not a lock: three stat points already
// spent, and a few things in the pack on the first morning. Everything else is open to everyone.
export const CLASS_POINTS = 3;

export const CLASSES = {
  forager: {
    name: 'Forager', motto: 'The land provides, if you know where to look.',
    text: 'Goes longer between meals and starts with food and a flask.',
    stats: { hardiness: 2, vitality: 1 },
    kit: [['berries', 8], ['apple', 4], ['flask', 1]],
  },
  warrior: {
    name: 'Warrior', motto: 'Let the night come.',
    text: 'Hits harder, takes more, and starts armed.',
    stats: { strength: 2, vitality: 1 },
    kit: [['stone_sword', 1], ['leather_cap', 1], ['cooked_meat', 2]],
  },
  wayfarer: {
    name: 'Wayfarer', motto: 'Every horizon is an invitation.',
    text: 'Quick on their feet, with torches for the dark and bread for the road.',
    stats: { agility: 2, endurance: 1 },
    kit: [['torch', 6], ['woven_boots', 1], ['bread', 3]],
  },
  mason: {
    name: 'Mason', motto: 'A wall before nightfall.',
    text: 'Tireless and strong, with a pickaxe and enough to raise a first shelter.',
    stats: { endurance: 2, strength: 1 },
    kit: [['stone_pickaxe', 1], ['wood', 24], ['stone', 16]],
  },
  farmer: {
    name: 'Farmer', motto: 'Plant today, feast all season.',
    text: 'Steady and hardy, with a hoe, a watering can and seed for the first field.',
    stats: { endurance: 2, hardiness: 1 },
    kit: [['hoe', 1], ['watering_can', 1], ['seeds', 8], ['turnip_seeds', 4]],
  },
  mariner: {
    name: 'Mariner', motto: 'The sea is only another road.',
    text: 'A strong swimmer with a diving mask and a catch to start on.',
    stats: { endurance: 2, agility: 1 },
    kit: [['diving_mask', 1], ['cooked_fish', 3], ['kelp', 4]],
  },
};

export const classOf = (id) => (Object.hasOwn(CLASSES, id) ? CLASSES[id] : null);
