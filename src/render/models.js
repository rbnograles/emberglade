import { homesteadModels } from './homestead.js';
import { addFieldModels, addFieldItemModels } from './fieldmodels.js';
import { KEEPERS, carvingId } from '../game/keepers.js';
import { keeperModel } from './keeper-models.js';
import { Vox } from './voxel.js';
import { hash2 } from '../core/noise.js';

const TRUNK = 0x7a4b2c;
const WOOD = 0xa8743c, WOOD_DARK = 0x8a5a2c, WOOD_LIGHT = 0xd9a066;
const GREENS = [0x5fb04a, 0x6cc257, 0x4f9c3f];
const GRAYS = [0x9a9fa6, 0xa8adb4, 0x8b9098];

// Colour function: mostly a random pick from `palette`, sometimes `accent`.
const mix = (palette, seed, accent = null, chance = 0) => (x, y, z) => {
  if (accent !== null && hash2(x * 3 + y, z * 5 - y, seed + 5) < chance) return accent;
  return palette[(hash2(x * 7 + y * 3, z * 5 + y, seed) * palette.length) | 0];
};

// shape 0: one round crown. 1: tall, two crowns stacked on a long trunk. 2: broad, a forked trunk under three low crowns.
function tree(leaves, seed, accent = null, shape = 0) {
  const c = mix(leaves, seed + shape * 31, accent, 0.025);
  const v = new Vox();
  if (shape === 1) {
    v.box(-1, 0, -1, 0, 8, 0, TRUNK)
      .blob(0, 10, 0, 3.7, 3.1, 3.7, c, 0.35, seed + 1).blob(0, 14.5, 0, 2.7, 2.6, 2.7, c, 0.35, seed + 2);
  } else if (shape === 2) {
    v.box(-1, 0, -1, 0, 3, 0, TRUNK).box(1, 3, -1, 2, 5, 0, TRUNK).box(-3, 3, -1, -2, 4, 0, TRUNK)
      .blob(-3, 7, 0, 3.3, 2.7, 3.5, c, 0.35, seed + 3).blob(3, 8, 0, 3.5, 2.9, 3.3, c, 0.35, seed + 4)
      .blob(0, 9.5, 0, 3.1, 2.5, 3.1, c, 0.35, seed + 5);
  } else v.box(-1, 0, -1, 0, 5, 0, TRUNK).blob(0, 9, 0, 4.7, 4.0, 4.7, c, 0.35, seed);
  return v.build(0.25);
}

// snowy: the tips of every tier are dusted white. slim: a taller, narrower tree.
function pine(snowy = false, slim = false) {
  const lift = slim ? 3 : 0, k = slim ? 0.78 : 1;
  const v = new Vox().box(-1, 0, -1, 0, 2 + lift, 0, TRUNK);
  const green = mix([0x2f7a4a, 0x388a55, 0x286b40], 3), white = mix([0xf4f8fb, 0xe4edf3], 3);
  const c = (x, y, z) => (snowy && (y % 3 === 2 || y >= 10 || (x + z + y) % 4 === 0) ? white(x, y, z) : green(x, y, z));
  const layers = [[3, 3.6], [4, 3.1], [5, 2.5], [6, 2.9], [7, 2.3], [8, 1.7], [9, 2.0], [10, 1.4], [11, 0.9], [12, 0.75]];
  for (const [y, r] of layers) {
    for (let z = -4; z <= 3; z++) for (let x = -4; x <= 3; x++) if (Math.hypot(x + 0.5, z + 0.5) <= r * k) v.set(x, y + lift, z, c);
  }
  return v.build(0.3);
}

const bush = (berries) =>
  new Vox().blob(0, 2, 0, 2.7, 2.3, 2.7, mix([0x4fa544, 0x5cb850, 0x439a3b], 9, berries ? 0xd9304f : null, 0.13), 0.3, 9).build(0.2);

function flower(color) {
  return new Vox()
    .box(0, 0, 0, 0, 3, 0, 0x4f9c3f).set(1, 1, 0, 0x6cc257)
    .set(0, 4, 0, 0xf7d94c).set(1, 4, 0, color).set(-1, 4, 0, color).set(0, 4, 1, color).set(0, 4, -1, color).set(0, 5, 0, color)
    .build(0.1, { center: false });
}

function tallgrass() {
  const v = new Vox();
  const c = mix([0x6cc257, 0x7fd066, 0x58ad47], 4);
  for (const [x, z, h] of [[-2, -1, 4], [0, 1, 6], [2, -2, 3], [1, 2, 5], [-1, 2, 3], [-3, 1, 5], [3, 0, 4]]) v.box(x, 0, z, x, h - 1, z, c);
  return v.build(0.1);
}

const rock = (accent) =>
  new Vox().blob(0, 1.2, 0, 2.3, 2.0, 2.1, mix(GRAYS, 6, accent, 0.24), 0.35, accent ?? 6).build(0.25);

function campfire() {
  const v = new Vox();
  const stone = mix(GRAYS, 2);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    v.set(Math.round(Math.cos(a) * 3.2 - 0.5), 0, Math.round(Math.sin(a) * 3.2 - 0.5), stone);
  }
  v.box(-2, 0, -1, 1, 0, -1, WOOD).box(-2, 0, 0, 1, 0, 0, WOOD_DARK).box(-1, 1, -2, -1, 1, 1, WOOD_DARK).box(0, 1, -2, 0, 1, 1, WOOD);
  v.set(-1, 2, -1, 0xe8833a).set(0, 2, 0, 0xe8833a);
  return v.build(0.125);
}

function workbench() {
  const v = new Vox();
  for (const [x, z] of [[0, 0], [3, 0], [0, 3], [3, 3]]) v.box(x, 0, z, x, 2, z, WOOD_DARK);
  v.box(0, 3, 0, 3, 3, 3, mix([WOOD_LIGHT, 0xcf9459], 8)).set(1, 4, 1, 0x9a9fa6).set(2, 4, 1, WOOD_DARK).set(2, 4, 2, WOOD_DARK);
  return v.build(0.2);
}

const bed = () =>
  new Vox()
    .box(0, 0, 0, 3, 0, 4, WOOD_DARK).box(0, 1, 0, 3, 1, 1, 0xf2efe6).box(0, 1, 2, 3, 1, 4, 0xd9534f)
    .box(1, 2, 0, 2, 2, 0, 0xffffff).box(0, 1, 4, 3, 1, 4, 0xc24540)
    .build(0.2);

const chest = () =>
  new Vox().box(0, 0, 0, 3, 2, 2, WOOD).box(0, 3, 0, 3, 3, 2, WOOD_DARK).box(1, 2, 2, 2, 2, 2, 0xf2c94c).build(0.2);

const soil = (a, b) => new Vox().box(0, 0, 0, 3, 0, 3, (x) => (x % 2 ? a : b)).build(0.24, { ysize: 0.07, jitter: 0.03 });

function crop(stage) {
  const v = new Vox();
  const spots = [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, 0]];
  const heights = [1, 3, 5, 6];
  for (const [x, z] of spots) {
    for (let y = 0; y < heights[stage]; y++) {
      const gold = stage === 3 && y >= 3;
      v.set(x, y, z, gold ? 0xe9c545 : 0x7fc84f);
      if (gold && y < 5) v.set(x + 1, y, z, 0xf2d86a);
    }
    if (stage === 2) v.set(x + 1, 3, z, 0x8fd65a);
  }
  return v.build(0.1);
}

function deer() {
  const body = 0xa8703f, dark = 0x7a4b2c;
  const v = new Vox().box(0, 4, 0, 6, 6, 2, body).box(1, 4, 1, 5, 4, 1, 0xd9b48a);
  for (const [x, z] of [[0, 0], [0, 2], [6, 0], [6, 2]]) v.box(x, 0, z, x, 3, z, dark);
  v.box(6, 7, 0, 7, 8, 2, body).box(7, 9, 0, 8, 10, 2, body).set(9, 9, 1, 0x2b2b33).set(-1, 6, 1, 0xffffff);
  v.set(7, 11, 0, WOOD_LIGHT).set(7, 11, 2, WOOD_LIGHT).set(7, 12, 0, WOOD_LIGHT).set(7, 12, 2, WOOD_LIGHT);
  return v.build(0.14);
}

// Every model the chunk builder can place, by key.
export function buildModels() {
  const m = new Map();
  // Each kind of tree comes in several shapes; "kind#n" are the alternates the chunk builder picks between.
  for (const [id, leaves, seed, accent] of [
    ['tree_oak', GREENS, 11, 0xd94f4f], ['tree_orange', [0xe8872e, 0xf09a3e, 0xd97523], 12, null],
    ['tree_red', [0xd9432f, 0xe85a3a, 0xc23628], 13, null], ['tree_yellow', [0xe9c535, 0xf2d54e, 0xd9b02a], 14, null],
    ['tree_pink', [0xf08cb4, 0xf7a6c6, 0xe274a2], 15, 0xfff0f5], ['tree_purple', [0x9a6fd6, 0xad85e2, 0x8558c4], 16, 0xf2e6ff],
  ]) {
    m.set(id, tree(leaves, seed, accent));
    m.set(id + '#1', tree(leaves, seed, accent, 1));
    m.set(id + '#2', tree(leaves, seed, accent, 2));
  }
  m.set('tree_pine', pine());
  m.set('tree_pine#1', pine(false, true));
  m.set('tree_snowpine', pine(true));
  m.set('tree_snowpine#1', pine(true, true));
  // charred tree: a bare black trunk with a few stubs of branch
  m.set('tree_dead', new Vox()
    .box(-1, 0, -1, 0, 7, 0, 0x3a3236).box(1, 4, -1, 2, 4, -1, 0x2b2529).box(2, 5, -1, 2, 6, -1, 0x2b2529)
    .box(-3, 5, 0, -2, 5, 0, 0x2b2529).box(-3, 6, 0, -3, 7, 0, 0x2b2529).box(-1, 8, 0, -1, 9, 0, 0x2b2529)
    .build(0.25));
  m.set('bush', bush(true));
  m.set('bush_bare', bush(false));
  [0xe8556a, 0xffffff, 0xa77be0, 0xf2a03d].forEach((c, i) => m.set('flower' + i, flower(c)));
  m.set('tallgrass', tallgrass());
  m.set('stick', new Vox().box(-4, 0, 0, 3, 0, 0, WOOD_DARK).set(1, 0, 1, WOOD_DARK).set(2, 0, 2, WOOD_DARK).build(0.1));
  m.set('pebble', new Vox().blob(0, 0.8, 0, 1.8, 1.3, 1.6, mix(GRAYS, 5), 0.3, 5).build(0.12));
  m.set('boulder', rock(null));
  m.set('rock_coal', rock(0x2b2b33));
  m.set('rock_copper', rock(0xe0803a));
  m.set('campfire', campfire());
  m.set('workbench', workbench());
  m.set('fence_post', new Vox().box(0, 0, 0, 1, 5, 1, 0x9a6a3c).build(0.125));
  m.set('fence_arm', new Vox().box(1, 2, -1, 3, 2, 0, WOOD).box(1, 4, -1, 3, 4, 0, WOOD).build(0.125, { center: false }));
  m.set('bed', bed());
  m.set('chest', chest());
  m.set('wood_wall', new Vox().box(0, 0, 0, 3, 5, 3, (x, y) => (y % 2 ? 0xb9834a : 0xa8743c)).build(0.25, { jitter: 0.07 }));
  m.set('stone_wall', new Vox().box(0, 0, 0, 3, 5, 3, (x, y, z) => GRAYS[(x + y * 2 + z) % 3]).build(0.25, { jitter: 0.07 }));
  // door: two posts and a lintel across the tile (along x) with a panel standing ajar
  m.set('door', new Vox()
    .box(0, 0, 3, 0, 11, 4, WOOD_DARK).box(7, 0, 3, 7, 11, 4, WOOD_DARK).box(1, 11, 3, 6, 11, 4, WOOD_DARK)
    .box(1, 0, 5, 1, 10, 9, WOOD_LIGHT).set(1, 5, 8, 0xf2c94c)
    .build(0.125, { center: false }));
  m.set('wood_floor', new Vox().box(0, 0, 0, 3, 0, 3, (x) => (x % 2 ? 0xc9955a : 0xb9834a)).build(0.25, { ysize: 0.06, jitter: 0.04 }));
  m.set('stone_floor', new Vox().box(0, 0, 0, 3, 0, 3, (x, y, z) => GRAYS[(x + z) % 3]).build(0.25, { ysize: 0.06, jitter: 0.04 }));
  m.set('lostbag', new Vox().blob(0, 1.6, 0, 2.2, 2.0, 2.0, mix([0xc9a56a, 0xb9955a, 0xd9b57a], 31), 0.2, 31).box(-1, 3, -1, 0, 4, 0, 0x8a5a34).build(0.16));
  m.set('soil', soil(0x7a5233, 0x6b4529));
  m.set('soil_wet', soil(0x4f3320, 0x432a19));
  for (let s = 0; s < 4; s++) m.set('crop' + s, crop(s));
  // ---- sea floor ----
  {
    const kelp = new Vox();
    const green = mix([0x3f8f5a, 0x4fa56a, 0x357a4c], 41);
    for (const [x, z, h] of [[0, 0, 13], [2, 1, 9], [-2, -1, 11], [1, -2, 7]]) {
      for (let y = 0; y < h; y++) kelp.set(x + ((y >> 1) & 1), y, z, green); // strands that sway side to side
    }
    m.set('kelp', kelp.build(0.11));
    m.set('clam', new Vox().blob(0, 0.8, 0, 2.0, 1.2, 1.7, mix([0xf2e6d8, 0xe8d4c4, 0xf7efe6], 42), 0.2, 42).box(-1, 1, 1, 0, 1, 1, 0xe8a0b4).build(0.11));
    const coral = new Vox();
    const pink = mix([0xf0728a, 0xf78fa3, 0xf2a03d], 43);
    coral.box(0, 0, 0, 0, 4, 0, pink).box(-2, 2, 0, -1, 2, 0, pink).box(-2, 3, 0, -2, 6, 0, pink).box(1, 3, 0, 2, 3, 0, pink)
      .box(2, 4, 0, 2, 7, 0, pink).box(0, 2, 1, 0, 2, 2, pink).box(0, 3, 2, 0, 5, 2, pink).box(0, 5, 0, 0, 6, 0, pink);
    m.set('coral', coral.build(0.13));
    m.set('rock_iron', rock(0x8a3f2c));
    // snapper: a long dark fish facing +x with a pale jaw
    m.set('snapper', new Vox()
      .box(0, 1, 0, 8, 3, 2, mix([0x2f5f6a, 0x386e7a, 0x28525c], 44)).box(7, 1, 0, 9, 1, 2, 0xe6ecef)
      .box(-2, 1, 1, -1, 3, 1, 0x28525c).box(3, 4, 1, 5, 4, 1, 0x28525c).set(8, 3, 0, 0xfff27a).set(8, 3, 2, 0xfff27a)
      .build(0.16));
    m.set('fish', new Vox()
      .box(0, 0, 0, 3, 1, 0, mix([0xf2a03d, 0xf7b85c, 0xe88a2a], 45)).set(-1, 0, 0, 0xe88a2a).set(-1, 1, 0, 0xe88a2a).set(3, 1, 0, 0x2b2b33)
      .build(0.12));
  }
  // ---- vehicles (facing +x) ----
  m.set('boat', new Vox()
    .box(0, 0, 1, 8, 0, 4, WOOD_DARK).box(0, 1, 0, 8, 1, 0, WOOD).box(0, 1, 5, 8, 1, 5, WOOD)
    .box(0, 1, 1, 0, 1, 4, WOOD).box(8, 1, 1, 8, 1, 4, WOOD).box(9, 1, 2, 9, 1, 3, WOOD_LIGHT).box(3, 1, 1, 3, 1, 4, WOOD_LIGHT)
    .build(0.2));
  {
    const hull = mix([0xe8b83a, 0xf2c94c, 0xd9a82a], 51);
    m.set('submarine', new Vox()
      .box(1, 1, 0, 9, 4, 3, hull).box(0, 2, 1, 0, 3, 2, hull).box(10, 2, 1, 10, 3, 2, hull)
      .box(4, 5, 1, 6, 6, 2, hull).box(5, 7, 1, 5, 8, 1, 0x6b7078)
      .box(8, 2, 0, 9, 3, 0, 0x9fdcf5).box(8, 2, 3, 9, 3, 3, 0x9fdcf5).box(10, 2, 1, 10, 3, 2, 0x9fdcf5)
      .box(1, 0, 1, 9, 0, 2, 0xd9803a).box(-1, 1, 1, -1, 4, 2, 0x6b7078)
      .build(0.2));
  }
  // ---- newer creatures and mountain things ----
  m.set('golem', new Vox()
    .box(0, 0, 0, 1, 2, 1, 0x7d8387).box(4, 0, 0, 5, 2, 1, 0x7d8387).box(0, 3, 0, 5, 7, 2, mix(GRAYS, 61))
    .box(-2, 3, 0, -1, 6, 1, 0x8b9098).box(6, 3, 0, 7, 6, 1, 0x8b9098).box(1, 8, 0, 4, 10, 2, mix(GRAYS, 62))
    .set(2, 9, 3, 0x7ff0ff).set(4, 9, 3, 0x7ff0ff).box(2, 5, 3, 3, 5, 3, 0x7ff0ff)
    .build(0.2));
  m.set('spitter', new Vox()
    .blob(0, 2, 0, 2.2, 2.4, 2.2, mix([0x4f7a3a, 0x5c8a44, 0x436a30], 63), 0.25, 63)
    .set(2, 3, -1, 0xffe27a).set(2, 3, 0, 0xffe27a).box(2, 1, -1, 2, 1, 0, 0xb8f25a)
    .build(0.16));
  m.set('rock_crystal', new Vox()
    .blob(0, 1, 0, 2.2, 1.5, 2.0, mix(GRAYS, 64), 0.3, 64)
    .box(0, 2, 0, 0, 6, 0, 0x9fe8ff).box(-1, 2, -1, -1, 4, -1, 0x7fd4f2).box(1, 2, 1, 1, 5, 1, 0xc8f4ff)
    .build(0.22));
  m.set('lantern', new Vox()
    .box(0, 0, 0, 2, 0, 2, 0x6b7078).box(0, 4, 0, 2, 4, 2, 0x6b7078).box(1, 5, 1, 1, 5, 1, 0x6b7078)
    .box(0, 1, 0, 0, 3, 0, 0x6b7078).box(2, 1, 0, 2, 3, 0, 0x6b7078).box(0, 1, 2, 0, 3, 2, 0x6b7078).box(2, 1, 2, 2, 3, 2, 0x6b7078)
    .box(1, 1, 1, 1, 3, 1, 0xc8f4ff)
    .build(0.16));
  m.set('coral_wall', new Vox().box(0, 0, 0, 3, 5, 3, (x, y, z) => [0xf0728a, 0xf78fa3, 0xf2a03d][(x * 3 + y * 5 + z * 7) % 3]).build(0.25, { jitter: 0.07 }));
  m.set('deer', deer());
  // gloomling: a dark blob facing +x with two bright eyes
  m.set('gloomling', new Vox()
    .blob(0, 2, 0, 2.6, 2.3, 2.6, mix([0x3a2a5a, 0x46336b, 0x2f2249], 21), 0.25, 21)
    .set(2, 2, -2, 0xfff27a).set(2, 2, 1, 0xfff27a).set(2, 3, -2, 0xfff27a).set(2, 3, 1, 0xfff27a)
    .build(0.16));
  homesteadModels(m);
  for (const k of KEEPERS) m.set(carvingId(k), keeperModel(k, true));
  addFieldModels(m);
  return m;
}

// ---------- item models, for inventory and crafting icons ----------
// One small voxel sculpture per item, so every icon shares the look of the world itself.
// Things that exist in the world reuse their world model.
const STONE = 0x9aa0a8, COPPER = 0xd9803a, IRON = 0xdfe6ee, STRAW = 0xd9c27a, FUR = 0xb08a5a, CRYSTAL = 0x9fdcf5;
const HANDLE = 0x8a5a34;

const handle = (v, top = 8) => v.box(0, 0, 0, 0, top, 0, HANDLE);
const axe = (c) => handle(new Vox()).box(1, 6, 0, 3, 8, 0, c).box(1, 5, 0, 2, 5, 0, c).set(4, 6, 0, c).set(4, 7, 0, c).build(0.1);
const pickaxe = (c) => handle(new Vox()).box(-3, 8, 0, 3, 8, 0, c).set(-4, 7, 0, c).set(4, 7, 0, c).set(-3, 9, 0, c).set(3, 9, 0, c).box(-1, 9, 0, 1, 9, 0, c).build(0.1);
const sword = (c) => new Vox().box(0, 0, 0, 0, 1, 0, HANDLE).box(-2, 2, 0, 2, 2, 0, 0x6b7078).box(0, 3, 0, 0, 10, 0, c).box(-1, 3, 0, -1, 8, 0, c).set(0, 11, 0, c).build(0.1);
const hat = (c) => new Vox().box(0, 0, 0, 5, 0, 5, c).box(1, 1, 1, 4, 3, 4, c).box(1, 1, 1, 4, 1, 4, 0x5c3a20).build(0.1);
const tunic = (c) => new Vox().box(1, 0, 0, 4, 5, 2, c).box(-1, 3, 0, 0, 5, 2, c).box(5, 3, 0, 6, 5, 2, c).box(2, 5, 0, 3, 5, 0, 0x2b2b33).build(0.1);
const boots = (c) => new Vox().box(0, 0, 0, 1, 3, 1, c).box(0, 0, 2, 1, 1, 3, c).box(3, 0, 0, 4, 3, 1, c).box(3, 0, 2, 4, 1, 3, c).build(0.1);
const bag = (c) => new Vox().blob(0, 2.6, 0, 2.6, 2.8, 2.0, mix([c], 71), 0.1, 71).box(-2, 4, 2, 1, 4, 2, 0x5c3a20).box(-1, 3, 2, 0, 3, 2, 0xf2c94c).build(0.1);
const lump = (palette, seed, accent = null) => new Vox().blob(0, 1.5, 0, 2.6, 1.9, 2.3, mix(palette, seed, accent, 0.3), 0.35, seed).build(0.1);
const ingot = (c, light) => new Vox().box(0, 0, 0, 5, 0, 2, c).box(0, 1, 0, 5, 1, 2, c).box(1, 2, 0, 4, 2, 2, light).build(0.1);
const fishy = (palette) => new Vox().box(0, 0, 0, 5, 2, 1, mix(palette, 72)).box(-2, 0, 0, -1, 2, 1, palette[0]).set(5, 2, 1, 0x2b2b33).box(1, 3, 0, 3, 3, 1, palette[0]).build(0.1);
const haunch = (meat, bone) => new Vox().blob(0, 2, 0, 2.6, 2.2, 1.8, mix([meat], 73), 0.2, 73).box(2, 1, 0, 4, 1, 0, bone).box(4, 0, 0, 5, 2, 0, bone).build(0.1);

export function buildItemModels(world) {
  const m = new Map();
  const use = (id, key = id) => m.set(id, world.get(key));
  for (const k of KEEPERS) use(carvingId(k));
  // straight from the world
  for (const id of ['campfire', 'workbench', 'bed', 'chest', 'wood_wall', 'stone_wall', 'coral_wall', 'door', 'wood_floor', 'stone_floor',
    'lantern', 'boat', 'submarine', 'kelp', 'clam', 'coral']) use(id);
  for (const id of ['roof', 'stairs', 'window', 'brick_floor', 'brick_wall', 'table', 'chair', 'shelf', 'cabinet',
    'lamp', 'planter', 'gate', 'irrigator', 'turnip', 'pumpkin', 'turnip_seeds', 'pumpkin_seeds',
    'hull', 'oar', 'pressure_hull', 'propeller', 'axle', 'trail_cart']) use(id);
  use('fence', 'fence_post');
  use('flower', 'flower0');
  use('fiber', 'tallgrass');
  use('wheat', 'crop3');
  use('stone', 'pebble');
  use('raw_fish', 'fish');

  m.set('stick', new Vox().box(0, 0, 0, 0, 8, 0, HANDLE).set(1, 5, 0, HANDLE).set(1, 6, 0, 0x6cc257).build(0.1));
  m.set('wood', new Vox().box(0, 0, 0, 6, 2, 2, mix([0x7a4b2c, 0x8a5a34], 74)).box(0, 0, 0, 0, 2, 2, 0xd9a066).box(6, 0, 0, 6, 2, 2, 0xd9a066).set(6, 1, 1, 0x8a5a34).build(0.1));
  m.set('seeds', new Vox().set(0, 0, 0, 0xd9a066).set(2, 0, 1, 0xcf9459).set(1, 0, 3, 0xd9a066).set(3, 0, 3, 0xb9834a).set(4, 0, 0, 0xcf9459).set(2, 1, 2, 0x7ac74f).build(0.1));
  m.set('coal', lump([0x2b2b33, 0x3a3a44, 0x1f1f26], 75));
  m.set('copper_ore', lump(GRAYS, 76, COPPER));
  m.set('iron_ore', lump(GRAYS, 77, 0x8a3f2c));
  m.set('copper_bar', ingot(COPPER, 0xf0a05a));
  m.set('iron_bar', ingot(0xb8c0c8, IRON));
  m.set('hide', new Vox().box(0, 0, 0, 6, 0, 5, mix([FUR, 0xa07a4c], 78)).set(-1, 0, 0, FUR).set(7, 0, 0, FUR).set(-1, 0, 5, FUR).set(7, 0, 5, FUR).build(0.1));
  m.set('pearl', new Vox().blob(0, 1.5, 0, 1.6, 1.6, 1.6, mix([0xffffff, 0xf2eef7, 0xe6f2ff], 79), 0.05, 79).build(0.1));
  m.set('crystal', new Vox().box(0, 0, 0, 0, 6, 0, 0x9fe8ff).box(-1, 0, -1, -1, 4, -1, 0x7fd4f2).box(1, 0, 1, 1, 5, 1, 0xc8f4ff).box(-2, 0, 1, -2, 2, 1, 0x9fe8ff).build(0.1));

  // food
  m.set('berries', new Vox().blob(-1.2, 1.3, 0, 1.4, 1.4, 1.4, mix([0xd9304f, 0xe8556a], 80), 0.05, 80).blob(1.4, 1.3, 0.6, 1.4, 1.4, 1.4, mix([0xd9304f, 0xc22841], 81), 0.05, 81)
    .blob(0.2, 3, -0.3, 1.3, 1.3, 1.3, mix([0xe8556a, 0xd9304f], 82), 0.05, 82).set(0, 4, 0, 0x4f9c3f).set(1, 5, 0, 0x4f9c3f).build(0.1));
  const apple = (c) => new Vox().blob(0, 2.4, 0, 2.5, 2.4, 2.5, mix(c, 83), 0.08, 83).set(0, 5, 0, 0x5c3a20).set(1, 5, 0, 0x5cb850).build(0.1);
  m.set('apple', apple([0xd94f4f, 0xe86a5a]));
  m.set('roasted_apple', apple([0xb86a2a, 0x9a5220]));
  m.set('bread', new Vox().blob(0, 1.6, 0, 3.4, 1.9, 2.0, mix([0xd9a066, 0xcf9459], 84), 0.08, 84).set(-2, 3, 0, 0xf2d6a0).set(0, 3, 0, 0xf2d6a0).set(2, 3, 0, 0xf2d6a0).build(0.1));
  m.set('raw_meat', haunch(0xd9606a, 0xf2efe6));
  m.set('cooked_meat', haunch(0x9a5a2c, 0xf2efe6));
  m.set('cooked_fish', fishy([0xb9834a, 0xa8743c]));

  // tools and weapons, one shape per kind in three metals
  for (const [tier, c] of [['stone', STONE], ['copper', COPPER], ['iron', IRON]]) {
    m.set(tier + '_axe', axe(c));
    m.set(tier + '_pickaxe', pickaxe(c));
    m.set(tier + '_sword', sword(c));
  }
  m.set('hoe', handle(new Vox()).box(1, 8, 0, 3, 8, 0, STONE).set(3, 7, 0, STONE).build(0.1));
  m.set('torch', new Vox().box(0, 0, 0, 0, 5, 0, HANDLE).box(-1, 6, -1, 1, 7, 1, 0xff8a2a).box(0, 8, 0, 0, 9, 0, 0xffe27a).build(0.1));
  m.set('flask', new Vox().box(0, 0, 0, 3, 4, 2, 0x6fc3e8).box(0, 3, 0, 3, 4, 2, 0xa9dcf5).box(1, 5, 0, 2, 6, 2, 0x6fc3e8).box(1, 7, 1, 2, 7, 1, 0x8a5a34).build(0.1));
  m.set('watering_can', new Vox().box(0, 0, 0, 4, 4, 3, mix([COPPER, 0xc9722f], 85)).box(5, 2, 1, 7, 2, 2, COPPER).box(8, 3, 1, 8, 4, 2, COPPER).box(-2, 1, 1, -1, 1, 2, 0x8a5a34)
    .box(-2, 2, 1, -2, 4, 2, 0x8a5a34).box(-1, 4, 1, -1, 4, 2, 0x8a5a34).build(0.1));
  m.set('glider', new Vox().box(-6, 4, 0, 6, 4, 3, mix([0xf2efe6, 0xe6e0d0], 86)).box(-2, 0, 1, -2, 3, 1, HANDLE).box(2, 0, 1, 2, 3, 1, HANDLE).box(-2, 0, 1, 2, 0, 1, HANDLE).build(0.1));

  // things to wear
  for (const [name, c] of [['woven', STRAW], ['fur', FUR]]) {
    m.set(name + '_hat', hat(c));
    m.set(name + (name === 'fur' ? '_coat' : '_tunic'), tunic(c));
    m.set(name + '_boots', boots(c));
  }
  m.set('copper_helmet', hat(COPPER));
  m.set('copper_chestplate', tunic(COPPER));
  m.set('copper_boots', boots(COPPER));
  m.set('heat_hood', hat(CRYSTAL));
  m.set('heat_suit', tunic(CRYSTAL));
  m.set('heat_boots', boots(CRYSTAL));
  m.set('woven_bag', bag(STRAW));
  m.set('trail_pack', bag(0x8a5a34));
  addFieldItemModels(m);
  m.set('rime_pickaxe', pickaxe(0x90d7e8));
  m.set('ember_axe', axe(0xff9845));
  m.set('diving_mask', new Vox().box(0, 0, 0, 6, 3, 0, 0x2b2b33).box(1, 1, 0, 2, 2, 0, 0x6fc3e8).box(4, 1, 0, 5, 2, 0, 0x6fc3e8).box(-1, 1, 1, -1, 2, 3, 0x2b2b33).box(7, 1, 1, 7, 2, 3, 0x2b2b33).build(0.1));
  return m;
}