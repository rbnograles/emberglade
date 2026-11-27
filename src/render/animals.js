import { Vox } from './voxel.js';
import { hash2 } from '../core/noise.js';

// Animal sculptures. All face +x and are symmetric about the line between voxels z = -1 and z = 0.
// The style: big heads with eyes on the corners, soft mottled coats, and one feature that names the
// animal at a glance (antlers, comb, curled horns, long ears, a glowing crest).
const EYE = 0x241d2b, HOOF = 0x3a2f2b, BONE = 0xf3e6cc, PINK = 0xf0a3a8, WHITE = 0xffffff;

// Colour function: a stable random pick from `palette` per voxel, for a mottled coat.
const coat = (palette, seed) => (x, y, z) => palette[(hash2(x * 7 + y * 3, z * 5 + y, seed) * palette.length) | 0];

// A box on one flank (z0..z1, with z >= 0) and its mirror image on the other.
const pair = (v, x0, y0, z0, x1, y1, z1, c) => v.box(x0, y0, z0, x1, y1, z1, c).box(x0, y0, -1 - z1, x1, y1, -1 - z0, c);

function deer() {
  const fur = coat([0xb97d45, 0xa9703c, 0xc48a50], 5), cream = 0xecd9b4, dark = 0x70482b;
  const v = new Vox();
  for (const x of [-4, 3]) {
    pair(v, x, 1, 1, x, 5, 1, dark);
    pair(v, x, 0, 1, x, 0, 1, HOOF);
  }
  v.blob(0, 8, 0, 5.4, 2.7, 2.4, fur, 0.1, 5);
  v.box(-3, 5, -1, 2, 5, 0, cream); // pale belly
  v.set(-2, 10, -1, cream).set(1, 10, 0, cream).set(-3, 10, 0, cream).set(0, 10, -1, cream); // fawn spots
  v.box(3, 9, -1, 4, 12, 0, fur); // neck
  v.box(4, 12, -2, 6, 15, 1, fur); // head
  v.box(7, 12, -1, 8, 13, 0, cream).box(8, 13, -1, 8, 13, 0, EYE); // muzzle and nose
  pair(v, 6, 14, 1, 6, 14, 1, EYE);
  pair(v, 4, 15, 2, 4, 16, 2, fur); // ears
  pair(v, 5, 16, 0, 5, 18, 0, BONE); // antlers: a beam with two tines
  pair(v, 6, 18, 0, 6, 19, 0, BONE);
  pair(v, 4, 18, 1, 4, 20, 1, BONE);
  v.box(-6, 8, -1, -6, 9, 0, cream); // white tail
  return v.build(0.1);
}

// Hens and grouse share a plump body; `comb` gives the hen her red crest, the grouse gets a red brow instead.
function fowl({ body, wing, tail, feet, comb }) {
  const red = 0xd8443c, plume = coat(body, 8), v = new Vox();
  pair(v, 0, 0, 0, 0, 1, 0, feet);
  pair(v, 1, 0, 0, 1, 0, 0, feet); // toes
  v.blob(0, 4.5, 0, 3.4, 2.9, 2.6, plume, 0.1, 8);
  pair(v, -2, 3, 3, 1, 5, 3, wing); // folded wings
  pair(v, -3, 4, 3, -3, 4, 3, wing);
  v.box(-4, 5, -1, -4, 8, 0, tail).box(-5, 7, -1, -5, 9, 0, tail).box(-3, 6, -2, -3, 7, 1, tail); // tail fan
  v.box(2, 6, -1, 2, 7, 0, plume); // neck
  v.box(2, 8, -2, 4, 10, 1, plume); // head
  pair(v, 4, 9, 1, 4, 9, 1, EYE);
  v.box(5, 8, -1, 5, 9, 0, 0xf2a43a); // beak
  if (comb) v.box(2, 11, -1, 4, 11, 0, red).box(3, 12, -1, 3, 12, 0, red).box(4, 7, -1, 4, 7, 0, red); // comb and wattle
  else pair(v, 3, 10, 1, 4, 10, 1, red);
  return v.build(0.085);
}

function ram() {
  const wool = coat([0xf1e8d6, 0xe4d8c2, 0xfaf3e6], 9), face = 0x54423a, horn = 0xc9a56b;
  const v = new Vox();
  for (const x of [-3, 2]) {
    pair(v, x, 1, 1, x, 3, 1, face);
    pair(v, x, 0, 1, x, 0, 1, HOOF);
  }
  v.blob(0, 6.5, 0, 4.8, 3.6, 3.4, wool, 0.45, 9); // a ragged fleece
  v.blob(-1, 9.6, 0, 3, 1.4, 2.4, wool, 0.4, 10);
  v.box(4, 6, -2, 6, 9, 1, face); // dark face
  v.box(7, 6, -1, 7, 7, 0, 0x6b564b); // muzzle
  v.box(4, 10, -2, 5, 10, 1, wool); // wool cap
  pair(v, 6, 8, 1, 6, 8, 1, 0xf2d27a); // amber eyes
  // horns curl back, down and forward again beside the cheeks
  for (const [x, y] of [[4, 10], [3, 10], [2, 9], [2, 8], [2, 7], [3, 6], [4, 6]]) pair(v, x, y, 2, x, y, 2, horn);
  v.box(-6, 7, -1, -6, 8, 0, wool); // tail
  return v.build(0.11);
}

function hare() {
  const fur = coat([0xd9b78a, 0xcda878, 0xe4c79c], 11), cream = 0xf4e6cc;
  const v = new Vox();
  v.blob(-1.5, 3.4, 0, 3.2, 3.0, 2.5, fur, 0.1, 11); // big haunches
  v.blob(1.5, 3, 0, 2.8, 2.3, 2.2, fur, 0.1, 12); // chest
  pair(v, -3, 0, 1, -1, 0, 1, cream); // long hind feet
  pair(v, 3, 0, 0, 4, 0, 0, cream); // front paws
  v.blob(4, 6.2, 0, 2.2, 2.1, 2.2, fur, 0.05, 13); // head
  v.box(5, 4, -1, 5, 5, 0, cream).box(6, 5, -1, 6, 5, 0, PINK); // cheeks and nose
  pair(v, 5, 6, 1, 5, 6, 1, EYE);
  pair(v, 3, 8, 1, 3, 12, 1, fur); // tall ears with pink inside
  pair(v, 4, 9, 1, 4, 11, 1, PINK);
  v.box(-6, 3, -1, -6, 4, 0, WHITE); // cotton tail
  return v.build(0.075);
}

function newt() {
  const hide = coat([0x4a3b40, 0x574448, 0x3f3236], 14), glow = 0xff8a3a, hot = 0xffc864;
  const v = new Vox();
  v.box(-3, 1, -2, 3, 2, 1, hide).box(-2, 3, -1, 2, 3, 0, hide); // low, long body
  pair(v, -2, 1, 1, 2, 1, 1, 0xb4532c); // ember stripe along each flank
  v.box(4, 1, -2, 6, 3, 1, hide).box(7, 1, -1, 7, 2, 0, hide); // head and snout
  pair(v, 6, 3, 1, 6, 3, 1, hot); // glowing eyes
  for (const x of [-2, 0, 2, 4]) v.box(x, 4, -1, x, 4, 0, glow); // crest of coals down the back
  v.box(-6, 1, -1, -4, 2, 0, hide).box(-8, 1, -1, -7, 1, 0, hide).set(-9, 1, 0, glow).set(-5, 3, -1, glow); // tapering tail
  for (const x of [-3, 2]) {
    pair(v, x, 0, 2, x, 1, 2, hide); // splayed legs
    pair(v, x + 1, 0, 3, x + 1, 0, 3, glow); // warm toes
  }
  return v.build(0.085);
}

// A treasure chest half buried in its region: iced over, or banded with glowing seams.
function hoard(sides, lid, trim, heap) {
  const v = new Vox().box(-3, 0, -2, 3, 3, 1, sides).box(-3, 4, -2, 3, 4, 1, lid);
  for (const x of [-3, 0, 3]) v.box(x, 0, -2, x, 4, 1, trim); // bands
  v.box(-1, 3, 2, 0, 4, 2, 0xf2c94c); // lock
  v.box(-4, 0, -3, -4, 1, 2, heap).box(4, 0, -1, 4, 0, 2, heap).box(-2, 5, -2, 1, 5, -1, heap).set(2, 5, 0, heap);
  return v.build(0.14);
}

export function addAnimalModels(m) {
  m.set('deer', deer());
  m.set('hen', fowl({ body: [0xf4ead8, 0xe9dcc4, 0xfff6e6], wing: 0xd9b98a, tail: 0xb8683c, feet: 0xe8a23a, comb: true }));
  m.set('ptarmigan', fowl({ body: [0xf2f6f9, 0xe2ebf1, 0xffffff], wing: 0xc6d3dc, tail: 0x3a3f4a, feet: 0xe9eef2, comb: false }));
  m.set('ram', ram());
  m.set('hare', hare());
  m.set('salamander', newt());
  m.set('frost_hoard', hoard(coat([0x8fc7e0, 0xa9d8ec, 0x7ab4d0], 15), 0x5f7f9a, 0xd8f3fb, WHITE));
  m.set('ember_hoard', hoard(coat([0x33282e, 0x3d2f35, 0x2a2026], 16), 0x4a3238, 0xff8a3a, 0xffc864));
}
