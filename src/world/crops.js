export const CROPS = {
  wheat: { name: 'Wheat', seed: 'seeds', days: 3 },
  turnip: { name: 'Turnip', seed: 'turnip_seeds', days: 2 },
  pumpkin: { name: 'Pumpkin', seed: 'pumpkin_seeds', days: 5 },
};

export function cropFor(soil) { return CROPS[soil.species] ?? CROPS.wheat; }
