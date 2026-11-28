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
    if (!c) this.cells.set(k, (c = { obj: null, floor: null, roof: null }));
    return c;
  }
  floor(x, z, id) { this.at(x, z).floor = id; }
  obj(x, z, o) { this.at(x, z).obj = o; }
  roof(x, z, id) { this.at(x, z).roof = id; }
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

function castle(rand) {
  const plan = new Plan(), wall = rand() < 0.5 ? 'stone_wall' : 'brick_wall', R = 8;
  for (let z = -R; z <= R; z++) {
    for (let x = -R; x <= R; x++) {
      const ring = Math.abs(x) === R || Math.abs(z) === R, tower = Math.abs(x) >= R - 1 && Math.abs(z) >= R - 1;
      plan.floor(x, z, 'stone_floor');
      // a ruin: here and there the curtain wall has fallen
      if (tower || (ring && rand() > 0.12)) plan.obj(x, z, placed(wall));
    }
  }
  plan.obj(0, R, placed('door', { open: false, rotation: 0 })); // the gate, facing south
  plan.obj(-1, R, placed(wall));
  plan.obj(1, R, placed(wall));
  // the keep in the middle, roofed, with the hoard inside
  for (let z = -4; z <= 0; z++) {
    for (let x = -2; x <= 2; x++) {
      const edge = Math.abs(x) === 2 || z === -4 || z === 0;
      plan.floor(x, z, 'brick_floor');
      plan.roof(x, z, 'slate_roof');
      if (edge) plan.obj(x, z, placed(wall));
    }
  }
  plan.obj(0, 0, placed('door', { open: false, rotation: 0 }));
  plan.obj(0, -2, { t: 'royal_hoard' });
  plan.obj(-1, -3, placed('lantern'));
  plan.obj(1, -3, placed('lantern'));
  for (const [x, z] of [[-4, 4], [4, 4]]) plan.obj(x, z, placed('lantern'));
  return { cells: plan.cells, radius: R, spots: [] };
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
  const reach = kind === 'village' ? 12 : 8;
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
