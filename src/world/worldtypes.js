// The shapes a world can take. Each is a set of numbers the world generator reads; the land itself
// still comes from the seed, so every type has endless different worlds.
//   sea       land noise below this is sea: higher drowns more of the world
//   scale     how broad the continents are, in tiles
//   mid, fine how ragged the coast is at two finer scales (more makes bays, headlands and islets)
//   mountain  range noise above this is mountain: lower raises more of the land
//   frost, heat  radius of the frozen and the volcanic region, in tiles
//   wet       pushes the lowlands toward forest (+) or open country (-)
//   trees     how thickly trees grow, against the usual
//   rugged    how common the stack coasts, tablelands and canyon lands are, against the usual
const CLASSIC = { sea: -0.05, scale: 6000, mid: 0.035, fine: 0.02, mountain: 0.13, frost: 2600, heat: 2200, wet: 0, trees: 1, rugged: 1 };

export const WORLD_TYPES = {
  continents: {
    name: 'Classic Continents', text: 'Broad lands and open seas in even measure, with every kind of country to find.',
    ...CLASSIC,
  },
  isles: {
    name: 'Thousand Isles', text: 'A scatter of islands large and small. A boat is the first thing worth building.',
    ...CLASSIC, sea: 0.15, scale: 2200, mid: 0.11, fine: 0.045, mountain: 0.2, rugged: 1.5,
  },
  ocean: {
    name: 'Endless Ocean', text: 'Water to every horizon and a few lonely shores. For divers and sailors.',
    ...CLASSIC, sea: 0.3, scale: 5200, mid: 0.09, fine: 0.05,
  },
  mainland: {
    name: 'Great Mainland', text: 'Almost all land: one vast country to cross on foot, with the sea a rare sight.',
    ...CLASSIC, sea: -0.42, mid: 0.03, mountain: 0.24,
  },
  highlands: {
    name: 'Highlands', text: 'Mountains crowd the land. Ore and crystal are near; flat ground is not.',
    ...CLASSIC, sea: -0.14, mountain: -0.06, rugged: 1.5,
  },
  frostbound: {
    name: 'Frostbound', text: 'The frozen wastes have swallowed half the world. Warm clothes are not optional.',
    ...CLASSIC, frost: 4700, heat: 1300,
  },
  emberlands: {
    name: 'Emberlands', text: 'Ash and fire reach far across the land, and the volcanoes are many.',
    ...CLASSIC, frost: 1400, heat: 4500,
  },
  wildwood: {
    name: 'Wildwood', text: 'Deep forest nearly everywhere. Wood is endless; open ground has to be cleared.',
    ...CLASSIC, sea: -0.16, mountain: 0.22, wet: 0.24, trees: 1.7,
  },
};

export const DEFAULT_WORLD_TYPE = 'continents';
export const worldType = (id) => (Object.hasOwn(WORLD_TYPES, id) ? id : DEFAULT_WORLD_TYPE);

// A seed from what the player typed: a whole number is used as it is, anything else is hashed,
// and nothing at all gives a random one.
export function seedFrom(text, rand = Math.random) {
  const s = String(text ?? '').trim();
  if (!s) return (rand() * 2 ** 31) | 0;
  if (/^-?\d{1,10}$/.test(s)) return Number(s) | 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h | 0;
}
