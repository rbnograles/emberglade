// Each keeper guards one fixed site. Its carving becomes available at the workbench when the site is restored.
export const KEEPERS = [
  { id: 'briarhart', name: 'Briarhart', site: 'Clover Ring', biome: 'meadow', habitat: 'Green Meadow', shape: 'stag', color: 0x89704d, accent: 0x99d166, attack: 'Bramble rush', pattern: 'rush', tier: 'stone', hp: 24, medium: 'fiber' },
  { id: 'acornback', name: 'Acornback', site: 'Amber Hollow', biome: 'autumn', habitat: 'Autumn Woods', shape: 'boar', color: 0xad6340, accent: 0xffb54c, attack: 'Falling acorns', pattern: 'cluster', tier: 'stone', hp: 27, medium: 'apple' },
  { id: 'petalveil', name: 'Petalveil', site: 'Orchid Bower', biome: 'blossom', habitat: 'Blossom Grove', shape: 'moth', color: 0xb072c4, accent: 0xffb5df, attack: 'Petal halo', pattern: 'halo', tier: 'stone', hp: 27, medium: 'flower' },
  { id: 'conecrest', name: 'Conecrest', site: 'Needle Roost', biome: 'pine', habitat: 'Pine Forest', shape: 'owl', color: 0x427361, accent: 0xeac377, attack: 'Three quills', pattern: 'fan', tier: 'copper', hp: 36, medium: 'coal' },
  { id: 'dunepincer', name: 'Dunepincer', site: 'Ochre Bowl', biome: 'sand', habitat: 'Sandy Flats', shape: 'scorpion', color: 0xc88945, accent: 0x775044, attack: 'Twin pincers', pattern: 'pincers', tier: 'copper', hp: 35, medium: 'copper_ore' },
  { id: 'cliffbell', name: 'Cliffbell', site: 'Bellstone Ledge', biome: 'mountain', habitat: 'Mountains', shape: 'ram', color: 0x8795a3, accent: 0xf4dc9b, attack: 'Ringing fault', pattern: 'cross', tier: 'copper', hp: 41, medium: 'copper_bar' },
  { id: 'brinewheel', name: 'Brinewheel', site: 'Pearl Basin', biome: 'deep', habitat: 'Deep Sea', shape: 'shell', color: 0x469995, accent: 0xffb58d, attack: 'Tidal eye', pattern: 'undertow', tier: 'iron', gear: 'diving_mask', hp: 49, medium: 'clam' },
  { id: 'lampfin', name: 'Lampfin', site: 'Lantern Trench', biome: 'deep', habitat: 'Deep Sea', shape: 'angler', color: 0x555985, accent: 0x91f6cd, attack: 'Lure flash', pattern: 'lure', tier: 'iron', gear: 'diving_mask', hp: 49, medium: 'pearl' },
  { id: 'rimewing', name: 'Rimewing', site: 'Rime Perch', biome: 'frost', habitat: 'Frozen Wastes', shape: 'heron', color: 0x719ab8, accent: 0xe2fbff, attack: 'Shearing ice', pattern: 'shear', tier: 'iron', gear: 'fur_coat', hp: 56, medium: 'hide' },
  { id: 'driftmuzzle', name: 'Driftmuzzle', site: 'Snow Lanterns', biome: 'frost', habitat: 'Frozen Wastes', shape: 'walrus', color: 0x847b99, accent: 0xffeed5, attack: 'Tusk cleave', pattern: 'cleave', tier: 'iron', gear: 'fur_coat', hp: 56, medium: 'crystal' },
  { id: 'cindercoil', name: 'Cindercoil', site: 'Cinder Kiln', biome: 'heat', habitat: 'Volcanic Lands', shape: 'wyrm', color: 0x854952, accent: 0xff9e43, attack: 'Coiling embers', pattern: 'coil', tier: 'iron', gear: 'heat_suit', hp: 63, medium: 'iron_ore' },
  { id: 'kilncrown', name: 'Kilncrown', site: 'Basalt Hearth', biome: 'heat', habitat: 'Volcanic Lands', shape: 'tortoise', color: 0x58465a, accent: 0xff7744, attack: 'Hearth eruption', pattern: 'eruption', tier: 'iron', gear: 'heat_suit', hp: 70, medium: 'iron_bar' },
];

export const KEEPER_BY_ID = Object.fromEntries(KEEPERS.map(k => [k.id, k]));
export const carvingId = k => k.id + '_carving';
export const carvingName = k => k.name + ' carving';
