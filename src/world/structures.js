import { turnedRoof } from './castle-roofs.js';
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

// Lay one square roof from the same rotatable pieces a player can craft.
function towerRoof(dx, dz, radius) {
  const ring = Math.max(Math.abs(dx), Math.abs(dz));
  if (!ring) return 'castle_peak_' + radius;
  const tier = radius - ring;
  if (Math.abs(dx) === Math.abs(dz)) {
    const turn = dz < 0 ? (dx < 0 ? 0 : 3) : (dx < 0 ? 1 : 2);
    return turnedRoof('castle_corner_' + tier, turn);
  }
  const turn = Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 1 : 3) : (dz < 0 ? 0 : 2);
  return turnedRoof('castle_slope_' + tier, turn);
}

// A castle: a curtain wall two storeys high with a toothed parapet and a wall-walk behind it, a
// spired tower at each corner and the middle of three sides, a twin-towered gatehouse to the south,
// and in the yard a three-storey keep under a tall slate roof, a barracks, a smithy and a paddock.
function castle(rand, court) {
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
    if (cz === W && Math.abs(cx) === 3) {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        up(cx + dx, cz + dz, 2).roof = towerRoof(dx, dz, 1);
      }
    } else up(cx, cz, 2).roof = spire;
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
  plan.obj(0, W + 1, placed('stone_arch'));
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
  up(0, -7, 2).obj = placed('chart_table');
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
    // Two rings of slate meet at the peak. Each square can be lifted individually.
    up(x, z, 1).roof = towerRoof(x + 7, z - 6, 2);
  }
  plan.obj(-5, 6, placed('door', { open: false, rotation: 1 }));
  plan.obj(-8, 5, placed('bed'));
  plan.obj(-8, 7, placed('bed'));
  plan.obj(-6, 5, placed('shelf'));
  plan.obj(-7, 6, placed('stairs', { rotation: 3 }));
  up(-7, 6, 1).floor = null;
  up(-6, 7, 1).obj = placed('chest');

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

  // The upper keep rises above the outer watchtowers. Alternating stair bays
  // leave both the approach and landing clear on each floor.
  for (let l = 3; l <= 5; l++) {
    for (let z = K.z0; z <= K.z1; z++) for (let x = K.x0; x <= K.x1; x++) {
      const edge = x === K.x0 || x === K.x1 || z === K.z0 || z === K.z1;
      const c = up(x, z, l);
      if (edge) c.obj = placed((x + z) % 3 === 0 ? 'slit_window' : wall);
      else c.floor = 'wood_floor';
      if (l === 5) c.roof = courses[z - K.z0];
      if (l === 3) up(x, z, 2).roof = null;
    }
    const stairX = l % 2 ? 3 : -3;
    up(stairX, -6, l - 1).obj = placed('stone_stairs', { rotation: 3 });
    up(stairX, -6, l).floor = null;
    up(0, -9, l).obj = placed(['shelf', 'cabinet', 'chart_table'][l - 3]);
  }
  // A high lantern spire crowns the central bay of the great hall.
  for (let z = -8; z <= -6; z++) for (let x = -1; x <= 1; x++) {
    up(x, z, 5).roof = x === 0 && z === -7 ? 'spire' : null;
  }
  // Two vaulted galleries flank the keep. The side doors on its third
  // floor open onto the galleries, with the well and paddock still below.
  for (const side of [-1, 1]) {
    up(side * 4, -7, 2).obj = placed('door', { rotation: 1 });
    up(side * 4, -7, 2).floor = 'stone_floor';
    for (let wing = 5; wing <= 10; wing++) for (let z = -10; z <= -4; z++) {
      const x = side * wing, edge = wing === 10 || z === -10 || z === -4;
      if (edge && (wing === 10 || wing === 5) && (z === -10 || z === -4)) {
        solid(x, z, 'stone_pier');
        up(x, z, 1).obj = placed('stone_pier');
      }
      up(x, z, 2).floor = 'stone_floor';
      if (edge) up(x, z, 2).obj = placed(z % 2 ? 'window' : wall);
      up(x, z, 2).roof = courses[z + 10];
    }
    up(side * 8, -7, 2).obj = placed(side < 0 ? 'shelf' : 'cabinet');
    // A pair of high spires frames the roof ridge above each gallery.
    for (const end of [-10, -4]) {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const x = side * 9 + dx, z = end + dz;
        up(x, z, 2).roof = null;
        for (let l = 3; l <= 4; l++) up(x, z, l).obj = placed((!dx || !dz) && l === 4 ? 'window' : wall);
      }
      up(side * 9, end, 4).roof = spire;
    }
  }
  outerWard(plan, court, 'stone_wall');
  return plan.cells;
}

const WALL = 45, CLIFF_EDGE = 50, FLIGHTS = 10;
const FLIGHT_HEIGHT = 1.5;

// The old keep stays at its seed coordinates. Offset the larger bailey just
// enough to keep its cliff, steps and buildings inside their generation cell.
function courtOffset(anchor, grid) {
  const local = anchor - grid * CELL;
  return Math.max(CLIFF_EDGE, Math.min(CELL - 1 - CLIFF_EDGE, local)) - local;
}

function outerWard(plan, court, wall) {
  const { dx: cx, dz: cz } = court;
  const floor = (x, z) => plan.floor(x, z, 'stone_floor');
  const tower = (x, z) => {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const edge = Math.max(Math.abs(dx), Math.abs(dz)) === 2;
      for (let l = 0; l <= 3; l++) {
        const c = l ? plan.up(x + dx, z + dz, l) : plan.at(x + dx, z + dz);
        c.floor = 'stone_floor';
        c.obj = edge ? placed(l && (dx === 0 || dz === 0) ? 'slit_window' : wall) : null;
        if (l === 3) c.roof = towerRoof(dx, dz, 2);
      }
    }
    // Face the entrance into the ward. A landing alternates to either side.
    const entryZ = z > cz ? -2 : 2;
    plan.obj(x, z + entryZ, placed('door'));
    for (let l = 0; l < 3; l++) {
      const sx = x + (l % 2 ? -1 : 1);
      const c = l ? plan.up(sx, z, l) : plan.at(sx, z);
      c.obj = placed('stone_stairs', { rotation: 3 });
      plan.up(sx, z, l + 1).floor = null;
    }
    plan.up(x, z + 1, 3).obj = placed('lamp');
  };
  for (let i = -WALL; i <= WALL; i++) {
    for (const [dx, dz] of [[i, -WALL], [i, WALL], [-WALL, i], [WALL, i]]) {
      const x = cx + dx, z = cz + dz;
      floor(x, z);
      plan.obj(x, z, placed(wall));
      plan.up(x, z, 1).obj = placed('battlement');
    }
  }
  for (const dx of [-WALL + 1, WALL - 1]) {
    for (const dz of [-WALL + 1, 0, WALL - 1]) tower(cx + dx, cz + dz);
  }
  const gateZ = cz + WALL;
  for (const dx of [-5, 5]) tower(cx + dx, gateZ - 1);
  for (let dx = -1; dx <= 1; dx++) {
    plan.obj(cx + dx, gateZ, placed('stone_arch'));
    for (let dz = -2; dz <= 4; dz++) floor(cx + dx, gateZ + dz);
  }
  // A broad stone stair runs sideways along the cliff face to the gate.
  for (let dx = 1; dx <= FLIGHTS; dx++) for (let dz = 2; dz <= 4; dz++)
    plan.obj(cx + dx, gateZ + dz, placed('stone_stairs', { rotation: 2 }));

  // A paved street skirts the old citadel and joins its southern gate.
  const streetZ = Math.min(22, gateZ - 2);
  for (let z = streetZ; z < gateZ; z++) floor(cx, z);
  for (let x = Math.min(0, cx); x <= Math.max(0, cx); x++) floor(x, streetZ);
  for (let z = 14; z <= streetZ; z++) floor(0, z);

  for (let i = 1; i <= court.innerFlights; i++) for (let x = -1; x <= 1; x++)
    plan.obj(x, 14 + i, placed('stone_stairs', { rotation: 3 }));

  // Workshops, granaries, dormitories and kitchen gardens fill the new wards.
  // Reserve the original citadel and the approach before laying out a plot.
  let plot = 0;
  for (const dz of [-30, -15, 0, 15, 30]) for (const dx of [-30, -15, 0, 15, 30]) {
    const x = cx + dx, z = cz + dz;
    if (Math.abs(x) < 25 && Math.abs(z) < 24) continue;
    if (dx === 0 && z >= streetZ - 4) continue;
    if (Math.abs(z - streetZ) <= 4 && x >= Math.min(0, cx) - 5 && x <= Math.max(0, cx) + 5) continue;
    const use = plot++ % 4;
    if (use === 3) {
      field(plan, x, z, () => 0.2);
      plan.obj(x, z, placed('irrigator'));
      continue;
    }
    for (let rz = -3; rz <= 3; rz++) for (let rx = -4; rx <= 4; rx++) {
      const edge = Math.abs(rx) === 4 || Math.abs(rz) === 3;
      floor(x + rx, z + rz);
      if (edge) plan.obj(x + rx, z + rz, placed(rx % 3 === 0 && Math.abs(rz) === 3 ? 'window' : wall));
      const roof = rz === 0 ? 'castle_ridge_3' : 'castle_slope_' + (3 - Math.abs(rz));
      plan.roof(x + rx, z + rz, turnedRoof(roof, rz > 0 ? 2 : 0));
    }
    plan.obj(x, z + 3, placed('door'));
    plan.obj(x - 2, z, placed(['workbench', 'cabinet', 'bed'][use]));
    plan.obj(x + 2, z, placed(['campfire', 'chest', 'bed'][use]));
    floor(x, z + 4);
    for (let path = -6; path <= 6; path++) floor(x + path, z + 5);
    plan.obj(x - 5, z + 5, placed('lantern'));
    plan.obj(x + 5, z + 5, placed('planter'));
  }
  // Pines on the broken rock faces soften the boundary between hill and forest.
  for (let i = -WALL; i <= WALL; i += 2) {
    for (const [dx, dz] of [[i, -48], [i, 48], [-48, i], [48, i]]) {
      if (dz === 48 && dx >= -4 && dx <= FLIGHTS + 5) continue;
      const roll = hash2(cx + dx, cz + dz, 433);
      if (roll < 0.45) plan.obj(cx + dx, cz + dz, { t: 'tree_pine' });
      else if (roll < 0.7) plan.obj(cx + dx, cz + dz, { t: 'bush' });
    }
  }
}

export function castleGround(st, x, z, naturalHeight) {
  const localX = x - st.x, localZ = z - st.z;
  const dx = localX - st.court.dx, dz = localZ - st.court.dz;
  const outer = st.h - st.court.innerFlights * FLIGHT_HEIGHT;
  if (dz >= WALL + 2 && dz <= CLIFF_EDGE && dx >= -1 && dx <= FLIGHTS + 3) {
    return outer - Math.min(FLIGHTS, Math.max(0, dx)) * FLIGHT_HEIGHT;
  }
  const ring = Math.max(Math.abs(dx), Math.abs(dz));
  const grain = hash2(x >> 1, z >> 1, 912);
  if (ring <= WALL + 1) {
    const distance = Math.max(Math.abs(localX), Math.abs(localZ)) - 14;
    if (distance <= 0) return st.h;
    if (distance > st.court.innerFlights) return outer;
    if (Math.abs(localX) <= 1 && localZ > 14) return st.h - distance * FLIGHT_HEIGHT;
    return Math.max(outer, st.h - Math.round((distance + grain) * 3) / 2);
  }
  const fraction = Math.max(0, (CLIFF_EDGE - ring + grain - 0.5) / (CLIFF_EDGE - WALL));
  return Math.round((naturalHeight + (outer - naturalHeight) * fraction) * 2) / 2;
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
  const names = kind === 'village' ? VILLAGE_NAMES : CASTLE_NAMES;
  const st = { kind, x, z, h: here.h, name: names[(hash2(cellX, cellZ, seed + 304) * names.length) | 0], key: cellX + ',' + cellZ };
  if (kind === 'village') return { ...st, ...village(rand) };
  const court = { dx: courtOffset(x, cellX), dz: courtOffset(z, cellZ) };
  court.innerFlights = Math.min(6, Math.max(0, WALL - Math.max(Math.abs(court.dx), Math.abs(court.dz)) - 20));
  const foot = { x: x + court.dx + FLIGHTS + 1, z: z + court.dz + WALL + 4 };
  const base = Math.max(0, natural(foot.x, foot.z + 2).h);
  // Map searches need only the anchor. Draw the tile plan on first visit.
  let cells;
  return { ...st, court, foot, h: base + (FLIGHTS + court.innerFlights) * FLIGHT_HEIGHT, radius: CLIFF_EDGE,
    spots: [[-2, 11], [2, 11], [0, 0]], get cells() { return cells ??= castle(rand, court); } };
}
