import { Vox } from './voxel.js';
import { EYE, BONE, WHITE, coat, pair, legs, part, buildRigs, addWholeModels } from './animals.js';

// Hostile creatures, built as rigs like the animals: a body plus legs, arms, head, jaw and tail that
// the view moves on their own pivots. All face +x and are symmetric about z = 0.
// Part kinds: 'leg' steps, 'arm' swings and is thrown forward to strike, 'head' nods and lunges,
// 'jaw' drops open to bite, 'tail' wags.
const AMBER = 0xffe27a, CYAN = 0x7ff0ff;

// One limb as a part. v: its voxels. pivot: where it joins the body. phase: which half of the stride it leads.
const limb = (kind, phase, pivot, v) => ({ kind, phase, pivot, v });

// gloomling: a round night creature on two stubby feet, with little arms it throws up to strike
function gloomling() {
  const dusk = coat([0x3a2a5a, 0x46336b, 0x2f2249], 21), dark = 0x231a3a;
  const body = new Vox().blob(0, 3.4, 0, 2.6, 2.3, 2.6, dusk, 0.25, 21);
  pair(body, 2, 3, 1, 2, 4, 1, 0xfff27a); // bright eyes
  pair(body, -1, 6, 1, -1, 6, 1, dark); // ear tufts
  const parts = [];
  for (const side of [0, 1]) {
    const z = side ? -2 : 1, az = side ? -4 : 3, sign = side ? -1 : 1;
    parts.push(limb('leg', sign, [0, 1.5, z + 0.5], new Vox().box(-1, 0, z, 0, 1, z, dark)));
    parts.push(limb('arm', -sign, [0.5, 4, side ? -3 : 3], new Vox().box(0, 2, az, 0, 3, az, dark).set(1, 2, az, dark)));
  }
  return { size: 0.16, gait: 'hop', body, parts };
}

// brute: a hunched, tusked beast on four thick legs
function brute() {
  const hide = coat([0x634857, 0x5a4050, 0x6e5262], 22), dark = 0x433644;
  const body = new Vox().blob(0, 5, 0, 4.4, 3, 3, hide, 0.25, 22);
  body.blob(-1, 7.6, 0, 2.6, 1.6, 2.2, hide, 0.3, 23); // the hump
  body.box(-2, 9, -1, 0, 9, 0, 0x492e46); // dark mane along it
  const head = new Vox().box(3, 3, -2, 6, 7, 1, coat([0x745963, 0x6a5059], 24));
  head.box(7, 3, -1, 7, 4, 0, 0x4b3846); // heavy jaw
  pair(head, 6, 4, 2, 6, 6, 2, BONE); // tusks
  pair(head, 6, 6, 1, 6, 6, 1, 0xe7a84c); // ember eyes
  pair(head, 3, 8, 1, 3, 8, 1, dark); // ears
  const tail = new Vox().box(-6, 5, -1, -5, 6, 0, dark);
  const four = [];
  [-3, 2].forEach((x, i) => {
    for (const side of [0, 1]) {
      const z = side ? -3 : 2;
      four.push(limb('leg', (i + side) % 2 ? 1 : -1, [x + 0.5, 3.5, z + 0.5], new Vox().box(x, 0, z, x + 1, 3, z, dark)));
    }
  });
  return { size: 0.16, gait: 'walk', body, parts: [...four, part('head', [3.5, 5, 0], head), part('tail', [-4.5, 5.5, 0], tail)] };
}

// golem: a stone figure that walks upright and brings both arms down
function golem() {
  const stone = coat([0x9a9fa6, 0xa8adb4, 0x8b9098], 61), dark = 0x7d8387;
  const body = new Vox().box(-1, 4, -2, 1, 4, 1, dark).box(-1, 5, -3, 1, 9, 2, stone);
  body.box(1, 7, -1, 1, 7, 0, CYAN); // glowing rune on the chest
  const head = new Vox().box(-1, 10, -2, 1, 12, 1, coat([0x9a9fa6, 0xa8adb4, 0x8b9098], 62));
  pair(head, 1, 11, 1, 1, 11, 1, CYAN);
  const parts = [part('head', [0, 10, 0], head)];
  for (const side of [0, 1]) {
    const sign = side ? -1 : 1;
    const leg = side ? new Vox().box(-1, 0, -2, 0, 3, -1, dark) : new Vox().box(-1, 0, 0, 0, 3, 1, dark);
    const arm = side ? new Vox().box(-1, 3, -5, 0, 9, -4, 0x8b9098) : new Vox().box(-1, 3, 3, 0, 9, 4, 0x8b9098);
    parts.push(limb('leg', sign, [0, 4, side ? -1 : 1], leg));
    parts.push(limb('arm', -sign, [0, 9, side ? -4 : 4], arm));
  }
  return { size: 0.2, gait: 'walk', body, parts };
}

// spitter: a bulb on two roots, with a mouth on a stalk that rears back and spits
function spitter() {
  const leaf = coat([0x4f7a3a, 0x5c8a44, 0x436a30], 63), dark = 0x35552a;
  const body = new Vox().blob(0, 3.4, 0, 2.2, 2.2, 2.2, leaf, 0.25, 63);
  const head = new Vox().box(1, 4, -1, 3, 6, 0, 0x6a9a4e).box(4, 4, -1, 4, 6, 0, 0xb8f25a); // stalk and lips
  pair(head, 3, 7, 0, 3, 7, 0, AMBER);
  const frond = new Vox().box(-3, 5, -1, -2, 7, 0, dark).box(-4, 7, -1, -4, 8, 0, dark);
  const parts = [part('head', [1, 5, 0], head), part('tail', [-2, 5, 0], frond)];
  for (const side of [0, 1]) {
    const z = side ? -2 : 1;
    parts.push(limb('leg', side ? -1 : 1, [0, 1.5, z + 0.5], new Vox().box(-1, 0, z, 0, 1, z, dark)));
  }
  return { size: 0.16, gait: 'hop', body, parts };
}

// snapper: a long sea hunter whose lower jaw drops open as it bites
function snapper() {
  const scale = coat([0x2f5f6a, 0x386e7a, 0x28525c], 44), dark = 0x28525c;
  const body = new Vox().box(-3, 1, -2, 3, 4, 1, scale).box(-1, 5, -1, 1, 5, 0, dark); // body and back fin
  const head = new Vox().box(4, 2, -2, 6, 4, 1, scale).box(7, 3, -1, 7, 3, 0, scale);
  pair(head, 5, 4, 1, 5, 4, 1, AMBER);
  const jaw = new Vox().box(4, 1, -2, 7, 1, 1, 0xe6ecef);
  pair(jaw, 6, 2, 1, 6, 2, 1, WHITE); // teeth
  const tail = new Vox().box(-5, 2, -1, -4, 3, 0, dark).box(-7, 1, -1, -6, 4, 0, dark);
  return { size: 0.16, gait: 'swim', body, parts: [part('head', [4, 3, 0], head), part('jaw', [4, 1.5, 0], jaw), part('tail', [-3.5, 2.5, 0], tail)] };
}

// frostprowler: a lean ice wolf with a spiked mane
function frostprowler() {
  const pelt = coat([0x88bbcc, 0x7aaec0, 0x98c8d6], 25), dark = 0x467e94;
  const body = new Vox().blob(0, 5.2, 0, 4.4, 2.2, 2.1, pelt, 0.12, 25);
  for (const x of [-2, 0, 2]) body.box(x, 7, -1, x, 8, 0, 0xd8f3fb); // frost spikes along the back
  const head = new Vox().box(3, 5, -2, 6, 8, 1, 0xcae9eb);
  head.box(7, 5, -1, 8, 6, 0, 0x507386).box(8, 6, -1, 8, 6, 0, EYE); // muzzle and nose
  pair(head, 6, 7, 1, 6, 7, 1, CYAN);
  pair(head, 3, 9, 1, 3, 10, 1, dark); // ears
  const tail = new Vox().box(-7, 5, -1, -5, 6, 0, 0x8fcbd7).box(-8, 6, -1, -8, 7, 0, BONE);
  return { size: 0.16, gait: 'walk', body, parts: [...legs([-3, 2], 4, dark, dark), part('head', [3.5, 6, 0], head), part('tail', [-4.5, 5.5, 0], tail)] };
}

// kilncrab: a wide shell of cooled rock on six legs, with two claws it snaps as it spits embers
function kilncrab() {
  const shale = 0x4b4954, rock = coat([0x4b4954, 0x55525e, 0x413f49], 26), ember = 0xad573f;
  const body = new Vox().blob(0, 3, 0, 3.4, 2, 4.1, rock, 0.15, 26);
  body.box(0, 4, -2, 1, 5, 1, 0xc15831); // the glowing seam on its back
  pair(body, 2, 5, 1, 2, 5, 1, 0xffcb59); // eyes on stalks
  const parts = [];
  for (const side of [0, 1]) {
    const sign = side ? -1 : 1;
    const zs = (z) => (side ? -1 - z : z); // mirror a z onto this side
    [-3, -1, 1].forEach((x, i) => {
      const leg = new Vox().set(x, 2, zs(4), shale).set(x, 1, zs(5), 0x9b5146).set(x, 0, zs(5), shale);
      parts.push(limb('leg', (i + side) % 2 ? 1 : -1, [x + 0.5, 2.5, sign * 4], leg));
    });
    const claw = new Vox().box(3, 2, Math.min(zs(3), zs(4)), 5, 3, Math.max(zs(3), zs(4)), ember).set(6, 3, zs(3), 0xf29a41).set(6, 2, zs(4), 0xf29a41);
    parts.push(limb('arm', sign, [3, 2.5, sign * 3.5], claw));
  }
  return { size: 0.15, gait: 'scuttle', body, parts };
}

const RIGS = {
  gloomling: gloomling(), brute: brute(), golem: golem(), spitter: spitter(),
  snapper: snapper(), frostprowler: frostprowler(), kilncrab: kilncrab(),
};

export const ENEMY_RIGS = buildRigs(RIGS);
export const addCreatureModels = (m) => addWholeModels(m, RIGS);
