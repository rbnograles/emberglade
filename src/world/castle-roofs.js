export const ROOF_COURSES = ['Eave', 'Middle', 'Upper', 'Crown'].flatMap((course, tier) =>
  (tier === 3 ? ['ridge', 'peak'] : ['slope', 'corner', 'ridge', 'peak']).map(shape => ({
    id: 'castle_' + shape + '_' + tier, shape, tier,
    name: course + ' slate ' + shape,
  }))
);

// Old and generated roofs use plain item IDs. Only turned pieces need a suffix.
export const turnedRoof = (id, turn) => turn ? id + '@' + turn : id;
export const roofItem = roof => roof.split('@')[0];
export const roofTurn = roof => Number(roof.split('@')[1] ?? 0);
