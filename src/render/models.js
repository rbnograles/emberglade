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

function tree(leaves, seed, accent = null) {
  return new Vox()
    .box(-1, 0, -1, 0, 5, 0, TRUNK)
    .blob(0, 9, 0, 4.7, 4.0, 4.7, mix(leaves, seed, accent, 0.025), 0.35, seed)
    .build(0.25);
}

function pine() {
  const v = new Vox().box(-1, 0, -1, 0, 2, 0, TRUNK);
  const c = mix([0x2f7a4a, 0x388a55, 0x286b40], 3);
  const layers = [[3, 3.6], [4, 3.1], [5, 2.5], [6, 2.9], [7, 2.3], [8, 1.7], [9, 2.0], [10, 1.4], [11, 0.9], [12, 0.75]];
  for (const [y, r] of layers) {
    for (let z = -4; z <= 3; z++) for (let x = -4; x <= 3; x++) if (Math.hypot(x + 0.5, z + 0.5) <= r) v.set(x, y, z, c);
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
  m.set('tree_oak', tree(GREENS, 11, 0xd94f4f));
  m.set('tree_orange', tree([0xe8872e, 0xf09a3e, 0xd97523], 12));
  m.set('tree_red', tree([0xd9432f, 0xe85a3a, 0xc23628], 13));
  m.set('tree_yellow', tree([0xe9c535, 0xf2d54e, 0xd9b02a], 14));
  m.set('tree_pink', tree([0xf08cb4, 0xf7a6c6, 0xe274a2], 15, 0xfff0f5));
  m.set('tree_purple', tree([0x9a6fd6, 0xad85e2, 0x8558c4], 16, 0xf2e6ff));
  m.set('tree_pine', pine());
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
  m.set('deer', deer());
  // gloomling: a dark blob facing +x with two bright eyes
  m.set('gloomling', new Vox()
    .blob(0, 2, 0, 2.6, 2.3, 2.6, mix([0x3a2a5a, 0x46336b, 0x2f2249], 21), 0.25, 21)
    .set(2, 2, -2, 0xfff27a).set(2, 2, 1, 0xfff27a).set(2, 3, -2, 0xfff27a).set(2, 3, 1, 0xfff27a)
    .build(0.16));
  return m;
}
