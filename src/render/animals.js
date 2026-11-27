import { Vox } from './voxel.js';
import { hash2 } from '../core/noise.js';

// Animal sculptures, built as rigs: a body plus parts (legs, head, tail) that the view turns about
// their own pivots, so animals step, nod, graze, peck and wag instead of sliding around as one block.
// All face +x and are symmetric about the line between voxels z = -1 and z = 0 (z = 0 in model space).
// The style: big heads with eyes on the corners, soft mottled coats, and one feature that names the
// animal at a glance (antlers, comb, curled horns, long ears, a glowing crest, a brush, tusks).
const EYE = 0x241d2b, HOOF = 0x3a2f2b, BONE = 0xf3e6cc, PINK = 0xf0a3a8, WHITE = 0xffffff;

// Colour function: a stable random pick from `palette` per voxel, for a mottled coat.
const coat = (palette, seed) => (x, y, z) => palette[(hash2(x * 7 + y * 3, z * 5 + y, seed) * palette.length) | 0];

// A box on one flank (z0..z1, with z >= 0) and its mirror image on the other.
const pair = (v, x0, y0, z0, x1, y1, z1, c) => v.box(x0, y0, z0, x1, y1, z1, c).box(x0, y0, -1 - z1, x1, y1, -1 - z0, c);

// Four legs as parts: `xs` are the two columns (back, front), each `height` tall, standing at the flanks.
// Diagonal pairs step together. foot: colour of the bottom voxel.
function legs(xs, height, color, foot = HOOF) {
  const parts = [];
  xs.forEach((x, i) => {
    for (const side of [0, 1]) {
      const z = side ? -2 : 1;
      parts.push({ kind: 'leg', phase: (i + side) % 2 ? 1 : -1, pivot: [x + 0.5, height + 0.5, z + 0.5], v: new Vox().box(x, 1, z, x, height, z, color).set(x, 0, z, foot) });
    }
  });
  return parts;
}
const part = (kind, pivot, v) => ({ kind, pivot, v, phase: 1 });

function deer() {
  const fur = coat([0xb97d45, 0xa9703c, 0xc48a50], 5), cream = 0xecd9b4, dark = 0x70482b;
  const body = new Vox().blob(0, 8, 0, 5.4, 2.7, 2.4, fur, 0.1, 5);
  body.box(-3, 5, -1, 2, 5, 0, cream); // pale belly
  body.set(-2, 10, -1, cream).set(1, 10, 0, cream).set(-3, 10, 0, cream).set(0, 10, -1, cream); // fawn spots
  const head = new Vox().box(3, 9, -1, 4, 12, 0, fur).box(4, 12, -2, 6, 15, 1, fur); // neck and head
  head.box(7, 12, -1, 8, 13, 0, cream).box(8, 13, -1, 8, 13, 0, EYE); // muzzle and nose
  pair(head, 6, 14, 1, 6, 14, 1, EYE);
  pair(head, 4, 15, 2, 4, 16, 2, fur); // ears
  pair(head, 5, 16, 0, 5, 18, 0, BONE); // antlers: a beam with two tines
  pair(head, 6, 18, 0, 6, 19, 0, BONE);
  pair(head, 4, 18, 1, 4, 20, 1, BONE);
  const tail = new Vox().box(-6, 8, -1, -6, 9, 0, cream);
  return { size: 0.1, gait: 'walk', body, parts: [...legs([-4, 3], 5, dark), part('head', [3.5, 9.5, 0], head), part('tail', [-5, 9, 0], tail)] };
}

// Hens and grouse share a plump body; `comb` gives the hen her red crest, the grouse gets a red brow instead.
function fowl({ body: palette, wing, tail: tailColor, feet, comb }) {
  const red = 0xd8443c, plume = coat(palette, 8);
  const body = new Vox().blob(0, 4.5, 0, 3.4, 2.9, 2.6, plume, 0.1, 8);
  pair(body, -2, 3, 3, 1, 5, 3, wing); // folded wings
  pair(body, -3, 4, 3, -3, 4, 3, wing);
  const head = new Vox().box(2, 6, -1, 2, 7, 0, plume).box(2, 8, -2, 4, 10, 1, plume); // neck and head
  pair(head, 4, 9, 1, 4, 9, 1, EYE);
  head.box(5, 8, -1, 5, 9, 0, 0xf2a43a); // beak
  if (comb) head.box(2, 11, -1, 4, 11, 0, red).box(3, 12, -1, 3, 12, 0, red).box(4, 7, -1, 4, 7, 0, red); // comb and wattle
  else pair(head, 3, 10, 1, 4, 10, 1, red);
  const tail = new Vox().box(-4, 5, -1, -4, 8, 0, tailColor).box(-5, 7, -1, -5, 9, 0, tailColor).box(-3, 6, -2, -3, 7, 1, tailColor); // tail fan
  const leg = (z, phase) => ({ kind: 'leg', phase, pivot: [0.5, 2.5, z + 0.5], v: new Vox().box(0, 0, z, 0, 2, z, feet).set(1, 0, z, feet) });
  return { size: 0.085, gait: 'peck', body, parts: [leg(0, 1), leg(-1, -1), part('head', [2.5, 6.5, 0], head), part('tail', [-3, 6, 0], tail)] };
}

function ram() {
  const wool = coat([0xf1e8d6, 0xe4d8c2, 0xfaf3e6], 9), face = 0x54423a, horn = 0xc9a56b;
  const body = new Vox().blob(0, 6.5, 0, 4.8, 3.6, 3.4, wool, 0.45, 9); // a ragged fleece
  body.blob(-1, 9.6, 0, 3, 1.4, 2.4, wool, 0.4, 10);
  const head = new Vox().box(4, 6, -2, 6, 9, 1, face); // dark face
  head.box(7, 6, -1, 7, 7, 0, 0x6b564b); // muzzle
  head.box(4, 10, -2, 5, 10, 1, wool); // wool cap
  pair(head, 6, 8, 1, 6, 8, 1, 0xf2d27a); // amber eyes
  // horns curl back, down and forward again beside the cheeks
  for (const [x, y] of [[4, 10], [3, 10], [2, 9], [2, 8], [2, 7], [3, 6], [4, 6]]) pair(head, x, y, 2, x, y, 2, horn);
  const tail = new Vox().box(-6, 7, -1, -6, 8, 0, wool);
  return { size: 0.11, gait: 'walk', body, parts: [...legs([-3, 2], 3, face), part('head', [4, 7.5, 0], head), part('tail', [-5, 8, 0], tail)] };
}

function hare() {
  const fur = coat([0xd9b78a, 0xcda878, 0xe4c79c], 11), cream = 0xf4e6cc;
  const body = new Vox().blob(-1.5, 3.4, 0, 3.2, 3.0, 2.5, fur, 0.1, 11); // big haunches
  body.blob(1.5, 3, 0, 2.8, 2.3, 2.2, fur, 0.1, 12); // chest
  pair(body, -3, 0, 1, -1, 0, 1, cream); // long hind feet
  pair(body, 3, 0, 0, 4, 0, 0, cream); // front paws
  const head = new Vox().blob(4, 6.2, 0, 2.2, 2.1, 2.2, fur, 0.05, 13);
  head.box(5, 4, -1, 5, 5, 0, cream).box(6, 5, -1, 6, 5, 0, PINK); // cheeks and nose
  pair(head, 5, 6, 1, 5, 6, 1, EYE);
  pair(head, 3, 8, 1, 3, 12, 1, fur); // tall ears with pink inside
  pair(head, 4, 9, 1, 4, 11, 1, PINK);
  const tail = new Vox().box(-6, 3, -1, -6, 4, 0, WHITE); // cotton tail
  return { size: 0.075, gait: 'hop', body, parts: [part('head', [3, 5, 0], head), part('tail', [-5, 3.5, 0], tail)] };
}

function newt() {
  const hide = coat([0x4a3b40, 0x574448, 0x3f3236], 14), glow = 0xff8a3a, hot = 0xffc864;
  const body = new Vox().box(-3, 1, -2, 3, 2, 1, hide).box(-2, 3, -1, 2, 3, 0, hide); // low, long body
  pair(body, -2, 1, 1, 2, 1, 1, 0xb4532c); // ember stripe along each flank
  for (const x of [-2, 0, 2]) body.box(x, 4, -1, x, 4, 0, glow); // crest of coals down the back
  const head = new Vox().box(4, 1, -2, 6, 3, 1, hide).box(7, 1, -1, 7, 2, 0, hide); // head and snout
  pair(head, 6, 3, 1, 6, 3, 1, hot); // glowing eyes
  head.box(4, 4, -1, 4, 4, 0, glow);
  const tail = new Vox().box(-6, 1, -1, -4, 2, 0, hide).box(-8, 1, -1, -7, 1, 0, hide).set(-9, 1, 0, glow).set(-5, 3, -1, glow); // tapering tail
  const parts = [part('head', [4, 2, 0], head), part('tail', [-3.5, 1.5, 0], tail)];
  [-3, 2].forEach((x, i) => {
    for (const side of [0, 1]) {
      const z = side ? -3 : 2, toe = side ? -4 : 3;
      // splayed legs with warm toes; they paddle fore and aft
      parts.push({ kind: 'leg', phase: (i + side) % 2 ? 1 : -1, pivot: [x + 0.5, 1.5, side ? -2 : 2], v: new Vox().box(x, 0, z, x, 1, z, hide).set(x + 1, 0, toe, glow) });
    }
  });
  return { size: 0.085, gait: 'crawl', body, parts };
}

function fox() {
  const fur = coat([0xe07a2f, 0xd66d27, 0xea8b3d], 17), sock = 0x3a2a2a;
  const body = new Vox().blob(0, 5.5, 0, 4.6, 2.1, 2.0, fur, 0.1, 17);
  body.box(3, 4, -1, 4, 5, 0, WHITE); // white bib
  const head = new Vox().box(4, 6, -2, 6, 9, 1, fur);
  head.box(7, 6, -1, 8, 7, 0, WHITE).box(8, 7, -1, 8, 7, 0, EYE); // pointed muzzle and nose
  pair(head, 5, 6, 1, 6, 6, 1, WHITE); // white cheeks
  pair(head, 6, 8, 1, 6, 8, 1, EYE);
  pair(head, 4, 10, 1, 4, 11, 1, fur); // tall ears with dark tips
  pair(head, 4, 12, 1, 4, 12, 1, sock);
  const tail = new Vox().blob(-7, 6, 0, 3, 1.8, 1.8, fur, 0.15, 18).blob(-9.6, 6.6, 0, 1.6, 1.4, 1.4, WHITE, 0.1, 19); // the brush
  return { size: 0.085, gait: 'walk', body, parts: [...legs([-3, 2], 4, sock, sock), part('head', [4, 7, 0], head), part('tail', [-4.5, 6, 0], tail)] };
}

function boar() {
  const hide = coat([0x7a5a45, 0x6b4d3a, 0x86654e], 20), dark = 0x4a362b;
  const body = new Vox().blob(0, 5.5, 0, 5, 3.3, 3, hide, 0.3, 20);
  body.box(-3, 9, -1, 2, 9, 0, dark); // bristle ridge
  const head = new Vox().box(4, 3, -2, 7, 7, 1, hide);
  head.box(8, 3, -1, 8, 5, 0, PINK); // flat snout
  pair(head, 7, 4, 2, 7, 5, 2, BONE); // tusks
  pair(head, 6, 6, 1, 6, 6, 1, EYE);
  pair(head, 4, 8, 1, 4, 8, 1, dark); // small ears
  const tail = new Vox().box(-6, 7, -1, -6, 7, 0, dark).set(-7, 8, 0, dark);
  return { size: 0.11, gait: 'walk', body, parts: [...legs([-3, 2], 3, dark), part('head', [4, 5, 0], head), part('tail', [-5, 7, 0], tail)] };
}

// A treasure chest half buried in its region: iced over, or banded with glowing seams.
function hoard(sides, lid, trim, heap) {
  const v = new Vox().box(-3, 0, -2, 3, 3, 1, sides).box(-3, 4, -2, 3, 4, 1, lid);
  for (const x of [-3, 0, 3]) v.box(x, 0, -2, x, 4, 1, trim); // bands
  v.box(-1, 3, 2, 0, 4, 2, 0xf2c94c); // lock
  v.box(-4, 0, -3, -4, 1, 2, heap).box(4, 0, -1, 4, 0, 2, heap).box(-2, 5, -2, 1, 5, -1, heap).set(2, 5, 0, heap);
  return v.build(0.14);
}

const RIGS = {
  deer: deer(),
  hen: fowl({ body: [0xf4ead8, 0xe9dcc4, 0xfff6e6], wing: 0xd9b98a, tail: 0xb8683c, feet: 0xe8a23a, comb: true }),
  ptarmigan: fowl({ body: [0xf2f6f9, 0xe2ebf1, 0xffffff], wing: 0xc6d3dc, tail: 0x3a3f4a, feet: 0xe9eef2, comb: false }),
  ram: ram(),
  hare: hare(),
  salamander: newt(),
  fox: fox(),
  boar: boar(),
};

// kind -> { gait, body: model, parts: [{ kind, phase, model, pivot: [x, y, z] in world units }] }.
// Models are built around the animal's own origin (not re-centred), so every part lines up.
export const ANIMAL_RIGS = Object.fromEntries(Object.entries(RIGS).map(([id, rig]) => [id, {
  gait: rig.gait,
  body: rig.body.build(rig.size, { center: false }),
  parts: rig.parts.map((p) => ({ kind: p.kind, phase: p.phase, model: p.v.build(rig.size, { center: false }), pivot: p.pivot.map((n) => n * rig.size) })),
}]));

export function addAnimalModels(m) {
  // the whole animal in one piece, for anything that wants a still sculpture
  for (const [id, rig] of Object.entries(RIGS)) {
    const whole = new Vox();
    for (const v of [rig.body, ...rig.parts.map((p) => p.v)]) for (const [key, voxel] of v.m) whole.m.set(key, voxel);
    m.set(id, whole.build(rig.size, { center: false }));
  }
  m.set('frost_hoard', hoard(coat([0x8fc7e0, 0xa9d8ec, 0x7ab4d0], 15), 0x5f7f9a, 0xd8f3fb, WHITE));
  m.set('ember_hoard', hoard(coat([0x33282e, 0x3d2f35, 0x2a2026], 16), 0x4a3238, 0xff8a3a, 0xffc864));
}
