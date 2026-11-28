import { hash2 } from '../core/noise.js';

// Settlements that the world generator scatters over the land: villages and castle ruins.
// Each is planned on a flat square around its anchor tile and described as cells of
// { obj, floor, roof } keyed "dx,dz" from that anchor. Everything is decided from the world seed,
// so the same world always has the same places, and nothing here is saved.
export const CELL = 192; // one possible settlement per square of this many tiles
const MARGIN = 20; // anchors keep this far inside their square, so a settlement never crosses into the next
const LOWLAND = new Set(['meadow', 'autumn', 'blossom', 'pine', 'sand']);
const STYLES = [
  { wall: 'wood_wall', floor: 'wood_floor', roof: 'roof' },
  { wall: 'stone_wall', floor: 'stone_floor', roof: 'slate_roof' },
  { wall: 'brick_wall', floor: 'brick_floor', roof: 'tile_roof' },
];
const VILLAGE_NAMES = ['Alderwick', 'Bramblecote', 'Cinderford', 'Dapplemere', 'Elmhollow', 'Fernbridge', 'Gorsefield', 'Hazelbank', 'Ivystead', 'Juniper Rest', 'Kestrel Green', 'Larkmoor'];
const CASTLE_NAMES = ['Ashen Keep', 'Brackenhold', 'Coldwatch', 'Dunmere Keep', 'Emberwatch', 'Fallowgard', 'Greyharrow', 'Hollowmere'];

const placed = (t, extra = {}) => ({ t, placed: true, ...extra });

// A plan being drawn: cells are made on demand.
class Plan {
  constructor() { this.cells = new Map(); }
  at(x, z) {
    const k = x + ',' + z;
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = { obj: null, floor: null, roof: null, up: null }));
    return c;
  }
  floor(x, z, id) { this.at(x, z).floor = id; }
  obj(x, z, o) { this.at(x, z).obj = o; }
  roof(x, z, id) { this.at(x, z).roof = id; }
  // the cell of a storey above the ground (1 or 2), made on demand
  up(x, z, level) {
    const c = this.at(x, z);
    c.up ??= {};
    return (c.up[level] ??= { obj: null, floor: null, roof: null });
  }
}

// A five by five house with its door toward the village's cross street (the row z = 0).
function house(plan, cx, cz, style, rand) {
  const toStreet = cz > 0 ? -1 : 1; // which way the street lies
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, z = cz + dz, edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      plan.floor(x, z, style.floor);
      plan.roof(x, z, style.roof);
      if (edge) plan.obj(x, z, placed(style.wall));
    }
  }
  const doorZ = cz + toStreet * 2;
  plan.obj(cx, doorZ, placed('door', { open: false, rotation: 0 }));
  plan.obj(cx - 2, cz, placed('window'));
  plan.obj(cx + 2, cz, placed('window'));
  // inside: a bed at the back, a table, and something of the owner's
  plan.obj(cx - 1, cz - toStreet, placed('bed'));
  plan.obj(cx + 1, cz - toStreet, placed(rand() < 0.5 ? 'table' : 'shelf'));
  plan.obj(cx + 1, cz, placed(rand() < 0.5 ? 'chair' : 'lamp'));
  // a short path from the door to the street
  for (let z = doorZ + toStreet; z !== 0; z += toStreet) plan.floor(cx, z, 'stone_floor');
}

// A fenced field of ripe crops with a gate toward the street.
function field(plan, cx, cz, rand) {
  const toStreet = cz > 0 ? -1 : 1, crop = rand() < 0.5 ? ['wheat', 3] : rand() < 0.5 ? ['turnip', 2] : ['pumpkin', 5];
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx, z = cz + dz, edge = Math.abs(dx) === 3 || Math.abs(dz) === 2;
      if (edge) plan.obj(x, z, placed(dx === 0 && dz === toStreet * 2 ? 'gate' : 'fence'));
      else plan.obj(x, z, { t: 'soil', placed: true, wet: false, crop: crop[1], species: crop[0] });
    }
  }
}

function village(rand) {
  const plan = new Plan(), style = STYLES[(rand() * STYLES.length) | 0];
  // the cross street and a paved square where it meets
  for (let i = -11; i <= 11; i++) {
    plan.floor(i, 0, 'stone_floor');
    plan.floor(0, i, 'stone_floor');
  }
  for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) plan.floor(x, z, 'stone_floor');
  plan.obj(0, 0, placed('campfire')); // the village hearth: warmth, cooking, and no creatures nearby
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) plan.obj(x, z, placed('lamp'));
  plan.obj(3, 1, placed('workbench'));
  // four plots round the square: houses, and one field if the dice say so
  const plots = [[-7, -6], [7, -6], [-7, 6], [7, 6]];
  const fieldAt = rand() < 0.75 ? (rand() * 4) | 0 : -1;
  plots.forEach(([x, z], i) => {
    if (i === fieldAt) field(plan, x, z, rand);
    else house(plan, x, z, style, rand);
  });
  for (const [x, z] of [[-5, 1], [5, -1], [1, 6], [-1, -6]]) if (!plan.at(x, z).obj) plan.obj(x, z, placed('planter'));
  // where its people stand about: on the square
  const spots = [[-1, 1], [1, -1], [2, 1], [-2, -1]];
  return { cells: plan.cells, radius: 12, spots: spots.slice(0, 2 + ((rand() * 3) | 0)) };
}

// A castle: a curtain wall two storeys high with a toothed parapet and a wall-walk behind it, a
// spired tower at each corner and the middle of three sides, a twin-towered gatehouse to the south,
// and in the yard a three-storey keep under a tall slate roof, a barracks, a smithy and a paddock.
function castle(rand) {
  const plan = new Plan(), brick = rand() < 0.5, wall = brick ? 'brick_wall' : 'stone_wall', spire = brick ? 'spire' : 'spire_red';
  const W = 13; // the curtain wall runs along |x| = W and |z| = W
  const solid = (x, z, t = wall) => plan.obj(x, z, placed(t));
  const up = (x, z, l) => plan.up(x, z, l);
  // a square tower, three storeys of wall under a spire
  const tower = (cx, cz) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, z = cz + dz;
      plan.floor(x, z, 'stone_floor');
      solid(x, z);
      up(x, z, 1).obj = placed(dx && dz ? wall : dx || dz ? 'window' : wall);
      up(x, z, 1).floor = null;
      up(x, z, 2).obj = placed(wall);
      up(x, z, 2).floor = null;
    }
    up(cx, cz, 2).roof = spire;
  };

  // the yard: a cobbled road from the gate to the keep, and a ring of cobbles under the wall-walk
  for (let z = -W; z <= W; z++) for (let x = -W; x <= W; x++) {
    const ring = Math.max(Math.abs(x), Math.abs(z));
    if (ring === W) {
      plan.floor(x, z, 'stone_floor');
      solid(x, z);
      up(x, z, 1).obj = placed(wall);
      up(x, z, 2).obj = placed('battlement');
    } else if (ring === W - 1) {
      plan.floor(x, z, 'stone_floor');
      up(x, z, 2).floor = 'stone_floor'; // the wall-walk
    }
  }
  for (let z = -2; z <= W - 1; z++) for (let x = -1; x <= 1; x++) plan.floor(x, z, 'stone_floor');
  for (let x = -11; x <= 11; x++) plan.floor(x, 2, 'stone_floor');

  for (const [x, z] of [[-W, -W], [W, -W], [-W, W], [W, W], [-W, 0], [W, 0], [0, -W]]) tower(x, z);

  // the gatehouse: two towers with the gate between them, a room over the arch, teeth on top
  tower(-3, W);
  tower(3, W);
  for (let x = -1; x <= 1; x++) {
    for (const z of [W - 1, W, W + 1]) plan.floor(x, z, 'stone_floor');
    plan.obj(x, W, x ? placed(wall) : placed('door', { open: false, rotation: 0 }));
    up(x, W, 1).obj = placed(x ? wall : 'window');
    up(x, W, 2).obj = placed('battlement');
    up(x, W - 1, 2).floor = 'stone_floor';
  }
  plan.obj(-1, W + 1, placed('lantern'));
  plan.obj(1, W + 1, placed('lantern'));

  // stairs up to the wall-walk, inside the west wall: one flight to a landing, a second to the top
  const sx = -(W - 1);
  plan.obj(sx, 7, placed('stone_stairs', { rotation: 3 }));
  up(sx, 6, 1).floor = 'stone_floor';
  up(sx, 5, 1).obj = placed('stone_stairs', { rotation: 3 });
  for (const z of [7, 6, 5]) up(sx, z, 2).floor = null;

  // ---- the keep: nine by seven, three storeys, the hoard in the hall ----
  const K = { x0: -4, x1: 4, z0: -10, z1: -4 };
  const courses = ['pitch_n0', 'pitch_n1', 'pitch_n2', 'pitch_ridge', 'pitch_s2', 'pitch_s1', 'pitch_s0'];
  for (let z = K.z0; z <= K.z1; z++) for (let x = K.x0; x <= K.x1; x++) {
    const edge = x === K.x0 || x === K.x1 || z === K.z0 || z === K.z1;
    const corner = (x === K.x0 || x === K.x1) && (z === K.z0 || z === K.z1);
    // windows in every other bay of the upper storeys, and beside the door below
    const bay = edge && !corner && (x + z) % 2 === 0;
    plan.floor(x, z, 'brick_floor');
    if (edge) solid(x, z, bay && z !== K.z1 ? 'window' : wall);
    for (const l of [1, 2]) {
      up(x, z, l).floor = edge ? null : 'wood_floor';
      up(x, z, l).obj = edge ? placed(bay ? 'window' : wall) : null;
    }
    up(x, z, 2).roof = courses[z - K.z0];
  }
  plan.obj(0, K.z1, placed('door', { open: false, rotation: 0 }));
  plan.obj(-2, K.z1, placed('window'));
  plan.obj(2, K.z1, placed('window'));
  // the hall
  plan.obj(0, -8, { t: 'royal_hoard' });
  plan.obj(-1, -9, placed('lantern'));
  plan.obj(1, -9, placed('lantern'));
  plan.obj(-2, -6, placed('table'));
  plan.obj(-2, -7, placed('chair'));
  plan.obj(2, -8, placed('shelf'));
  // stairs: hall to the first floor on the east side, first floor to the second on the west
  plan.obj(3, -6, placed('stone_stairs', { rotation: 3 }));
  up(3, -6, 1).floor = null;
  up(-3, -6, 1).obj = placed('stone_stairs', { rotation: 3 });
  up(-3, -6, 2).floor = null;
  // upstairs: a bedchamber, then a lookout room under the roof
  up(0, -9, 1).obj = placed('bed');
  up(1, -9, 1).obj = placed('shelf');
  up(-2, -8, 1).obj = placed('table');
  up(2, -6, 1).obj = placed('lamp');
  up(0, -7, 2).obj = placed('table');
  up(1, -7, 2).obj = placed('chair');
  up(2, -9, 2).obj = placed('lamp');
  for (const [x, z] of [[-3, -3], [3, -3]]) plan.obj(x, z, placed('planter'));
  for (const [x, z] of [[-2, -3], [2, -3]]) plan.obj(x, z, placed('lantern'));

  // ---- the barracks, west of the road: stone below, timber above ----
  for (let z = 4; z <= 8; z++) for (let x = -9; x <= -5; x++) {
    const edge = x === -9 || x === -5 || z === 4 || z === 8, corner = (x === -9 || x === -5) && (z === 4 || z === 8);
    plan.floor(x, z, 'wood_floor');
    if (edge) solid(x, z, 'stone_wall');
    up(x, z, 1).obj = edge ? placed(!corner && (x + z) % 2 === 0 ? 'window' : 'wood_wall') : null;
    up(x, z, 1).floor = edge ? null : 'wood_floor';
    up(x, z, 1).roof = 'roof';
  }
  plan.obj(-5, 6, placed('door', { open: false, rotation: 1 }));
  plan.obj(-8, 5, placed('bed'));
  plan.obj(-8, 7, placed('bed'));
  plan.obj(-6, 5, placed('shelf'));

  // ---- the smithy, east of the road: a timber shed with a forge and a bench ----
  for (let z = 4; z <= 8; z++) for (let x = 5; x <= 9; x++) {
    const edge = x === 5 || x === 9 || z === 4 || z === 8;
    plan.floor(x, z, 'stone_floor');
    plan.roof(x, z, 'tile_roof');
    if (edge) solid(x, z, (x + z) % 4 === 0 && z !== 4 && z !== 8 ? 'window' : 'wood_wall');
  }
  plan.obj(5, 6, placed('door', { open: false, rotation: 1 }));
  plan.obj(7, 5, placed('campfire'));
  plan.obj(8, 7, placed('workbench'));
  plan.obj(6, 7, placed('cabinet'));

  // ---- the paddock, the well and the green ----
  for (let z = -9; z <= -5; z++) for (let x = 7; x <= 11; x++) {
    if (x === 7 || x === 11 || z === -9 || z === -5) plan.obj(x, z, placed(x === 7 && z === -7 ? 'gate' : 'fence'));
  }
  plan.obj(-8, -6, placed('irrigator')); // the castle well
  for (const [x, z] of [[-9, -6], [-7, -6], [-8, -7], [-8, -5]]) plan.floor(x, z, 'stone_floor');
  for (const [x, z] of [[-6, -2], [6, -2], [-10, 0], [10, 0]]) plan.obj(x, z, placed('planter'));
  for (const [x, z] of [[-2, 1], [2, 1], [-2, 9], [2, 9], [-10, 3], [10, 3]]) plan.obj(x, z, placed('lantern'));
  plan.obj(-3, 3, placed('table'));
  plan.obj(-4, 3, placed('chair'));

  // its guards: two inside the gate, one before the keep
  return { cells: plan.cells, radius: W + 1, spots: [[-2, 11], [2, 11], [0, 0]] };
}
// The settlement planned for one square of the grid, or null. `natural(x, z)` gives the untouched
// terrain, so the choice of site never depends on settlements themselves.
export function planSettlement(seed, cellX, cellZ, natural) {
  const roll = hash2(cellX, cellZ, seed + 301);
  const kind = roll < 0.3 ? 'village' : roll < 0.4 ? 'castle' : null;
  if (!kind) return null;
  const span = CELL - MARGIN * 2;
  const x = cellX * CELL + MARGIN + Math.floor(hash2(cellX, cellZ, seed + 302) * span);
  const z = cellZ * CELL + MARGIN + Math.floor(hash2(cellX, cellZ, seed + 303) * span);
  if (Math.hypot(x, z) < 90) return null; // the start stays wild
  const here = natural(x, z);
  if (here.water || here.shore || here.lava || here.frost > 0 || here.heat > 0) return null;
  if (kind === 'village' ? !LOWLAND.has(here.biome) : !(LOWLAND.has(here.biome) || (here.biome === 'mountain' && here.h < 9))) return null;
  // the ground around must be land and close to level, or the place would sit on a cliff or in a lake
  const reach = kind === 'village' ? 12 : 14;
  for (const [dx, dz] of [[-reach, -reach], [reach, -reach], [-reach, reach], [reach, reach], [0, -reach], [0, reach], [-reach, 0], [reach, 0]]) {
    const t = natural(x + dx, z + dz);
    if (t.water || t.lava || Math.abs(t.h - here.h) > 1.5) return null;
  }
  let n = 0;
  const rand = () => hash2(cellX * 7 + n, cellZ * 13 - n++, seed + 310);
  const made = kind === 'village' ? village(rand) : castle(rand);
  const names = kind === 'village' ? VILLAGE_NAMES : CASTLE_NAMES;
  return { kind, x, z, h: here.h, name: names[(hash2(cellX, cellZ, seed + 304) * names.length) | 0], key: cellX + ',' + cellZ, ...made };
}
