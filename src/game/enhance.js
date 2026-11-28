// Enhancements: what creatures drop can be worked into the tool or weapon in your hand, once each.
// A new one replaces the old. cost: items used up. on: 'weapon' needs something that fights; 'any'
// also takes axes, pickaxes and hoes.
export const ENHANCEMENTS = {
  venom: { name: 'Venom edge', on: 'weapon', color: 0x8be06a, cost: { venom_sac: 2, fiber: 1 }, text: 'Poisons what it strikes: 1 damage a second for 4 seconds' },
  ember: { name: 'Ember edge', on: 'weapon', color: 0xff8a3a, cost: { emberglass: 2, coal: 1 }, text: '+2 damage, and the wound burns for 2 seconds more' },
  frost: { name: 'Frost edge', on: 'weapon', color: 0x90d7e8, cost: { rimeglass: 2, bone: 1 }, text: 'Chills what it strikes to half speed for 3 seconds' },
  gloom: { name: 'Gloom edge', on: 'weapon', color: 0x9a6fd6, cost: { gloom_shard: 3 }, text: 'Each blow that lands heals you a quarter of a heart' },
  heavy: { name: 'Tusk weight', on: 'weapon', color: 0xf3e6cc, cost: { brute_tusk: 2, leather: 1 }, text: '+1 damage, and creatures stay knocked back for longer' },
  keen: { name: 'Fang edge', on: 'weapon', color: 0xdfe6ee, cost: { snapper_fang: 2, leather: 1 }, text: '+25% damage' },
  swift: { name: 'Feather balance', on: 'any', color: 0xfff6e3, cost: { feather: 4, fiber: 1 }, text: 'Swings a third faster' },
  lasting: { name: 'Golem core', on: 'any', color: 0x7ff0ff, cost: { golem_core: 1 }, text: 'Wears out half as fast' },
};

// Can this enhancement go on this item? `def` is the item's entry in ITEMS.
export function fits(id, def) {
  const e = ENHANCEMENTS[id];
  if (!e || !def || !def.uses) return false;
  return e.on === 'any' ? !!(def.weapon || def.tool) : !!def.weapon;
}

// What creatures leave behind when they fall: [item, min, max, chance].
export const LOOT = {
  gloomling: [['gloom_shard', 1, 1, 0.6], ['coal', 1, 1, 0.4]],
  brute: [['brute_tusk', 1, 1, 0.7], ['coal', 2, 2], ['copper_ore', 1, 1, 0.5]],
  spitter: [['venom_sac', 1, 1, 0.7], ['coal', 1, 1, 0.6]],
  golem: [['stone', 3, 3], ['iron_ore', 2, 2], ['crystal', 1, 1, 0.5], ['golem_core', 1, 1, 0.35]],
  snapper: [['raw_fish', 2, 2], ['snapper_fang', 1, 1, 0.6], ['pearl', 1, 1, 0.25]],
  frostprowler: [['rimeglass', 1, 1], ['hide', 1, 1, 0.6]],
  kilncrab: [['emberglass', 1, 1], ['coal', 1, 2, 0.6]],
};
