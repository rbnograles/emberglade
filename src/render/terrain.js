import { hash2 } from '../core/noise.js';
import { BIOMES, SHORE, WATER_COLORS, SEABED_COLORS, LAVA_COLORS, ICE_COLORS } from '../world/biomes.js';
import { WATER_Y } from '../world/worldgen.js';
import { floorOf, solids } from '../world/columns.js';
import { rgb } from './voxel.js';

export const CHUNK = 16;

const linearPair = (pair) => pair.map(rgb);
const GROUND = Object.fromEntries(Object.entries(BIOMES).map(([k, b]) => [k, linearPair(b.ground)]));
const SHORE_GROUND = linearPair(SHORE.ground);
const WATER = linearPair(WATER_COLORS);
const SIDE_TINT = rgb(0x9a7a5a);
const DIRT = linearPair([0x8f633f, 0x7a5233]); // ground the player has dug shows bare earth
const SEABED = [rgb(SEABED_COLORS.shallow), rgb(SEABED_COLORS.deep)];
const LAVA = linearPair(LAVA_COLORS), ICE = linearPair(ICE_COLORS), BOIL = linearPair([0xd9703a, 0xc25a2e]);
const STONE = linearPair([0xb8b4a8, 0xa39f94]); // bare patches on the tops of the stacks
const UNDERSIDE = rgb(0x3b3632); // the underside of rock
const ROCK = { stacks: 1, table: 2, canyon: 3 }; // which layered rock a cliff is drawn in (see the terrain shader)
const DEEP = 0.62; // a bank is darker at its foot than at its lip
const WHITE = [1, 1, 1];
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// The parts of the range a..b that none of `covers` (ranges, lowest first) fill.
export function gaps(a, b, covers) {
  const out = [];
  for (const [lo, hi] of covers) {
    if (hi <= a) continue;
    if (lo >= b) break;
    if (lo > a) out.push([a, lo]);
    a = Math.max(a, hi);
    if (a >= b) break;
  }
  if (a < b) out.push([a, b]);
  return out;
}

// How deep under rock a tile is: 0 in the open, up to 4 far inside a cave.
function cover(gen, x, z) {
  if (!gen.tile(x, z).slabs) return 0;
  let best = 4;
  for (const [dx, dz] of AROUND) {
    for (let n = 1; n < best; n++) {
      if (!gen.tile(x + dx * n, z + dz * n).slabs) {
        best = n;
        break;
      }
    }
  }
  return best;
}
const dimmed = (depth) => 1 - 0.13 * depth;

function maker(withRock = false) {
  const pos = [], norm = [], col = [], idx = [], rock = [];
  // light: how bright each of the four corners is (1 = full), for shading that fades across the square
  // kind: 0 for an ordinary face, or which layered rock the shader should draw it in
  const quad = (corners, n, c, light = null, kind = 0) => {
    const base = pos.length / 3;
    corners.forEach((p, i) => {
      const k = light ? light[i] : 1;
      pos.push(p[0], p[1], p[2]);
      norm.push(n[0], n[1], n[2]);
      col.push(c[0] * k, c[1] * k, c[2] * k);
      if (withRock) rock.push(kind);
    });
    if (!light || light[0] + light[2] >= light[1] + light[3]) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  };
  const done = () => {
    const out = { pos: new Float32Array(pos), norm: new Float32Array(norm), col: new Float32Array(col), idx: new Uint32Array(idx) };
    if (withRock) out.rock = new Float32Array(rock);
    return out;
  };
  return { quad, done };
}

// One upright face of a tile toward a neighbour (dir: 0 +x, 1 -x, 2 +z, 3 -z), from y0 up to y1,
// wound to face outward. lo, hi: how bright its foot and its lip are.
function wall(land, dir, x, z, y0, y1, c, lo, hi, kind) {
  if (dir === 0) land.quad([[x + 1, y0, z], [x + 1, y1, z], [x + 1, y1, z + 1], [x + 1, y0, z + 1]], [1, 0, 0], c, [lo, hi, hi, lo], kind);
  else if (dir === 1) land.quad([[x, y0, z], [x, y0, z + 1], [x, y1, z + 1], [x, y1, z]], [-1, 0, 0], c, [lo, lo, hi, hi], kind);
  else if (dir === 2) land.quad([[x, y0, z + 1], [x + 1, y0, z + 1], [x + 1, y1, z + 1], [x, y1, z + 1]], [0, 0, 1], c, [lo, lo, hi, hi], kind);
  else land.quad([[x, y0, z], [x, y1, z], [x + 1, y1, z], [x + 1, y0, z]], [0, 0, -1], c, [lo, hi, hi, lo], kind);
}

// The ground of one chunk as plain arrays, ready for toGeometry.
// -> { land, water, lava }: the solid ground (with sea and pond beds and all rock), the see-through
// water surface, and the glowing lava.
export function buildTerrain(gen, cx, cz) {
  const land = maker(true), water = maker(), lava = maker();
  for (let z = cz * CHUNK; z < (cz + 1) * CHUNK; z++) {
    for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) {
      const t = gen.tile(x, z);
      const k = hash2(x, z, 31), shade = 0.95 + hash2(x, z, 32) * 0.1;
      // the colour of open ground here: also the colour of the top of any rock above it
      const sky = t.land === 'stacks' && t.h >= 6 && hash2(x >> 1, z >> 1, 77) > 0.72 ? STONE : GROUND[t.biome === 'ocean' ? 'meadow' : t.biome];
      const top = [0, 1, 2].map((i) => (sky[0][i] + (sky[1][i] - sky[0][i]) * k) * shade);
      let c;
      if (t.water) {
        // bed: sandy in the shallows, fading to dark blue-grey in the deep
        const depth = Math.min(1, (WATER_Y - t.bed) / 9);
        c = [0, 1, 2].map((i) => (SEABED[0][i] + (SEABED[1][i] - SEABED[0][i]) * depth) * shade);
        // the boiling sea of the volcanic region is a murky orange-red
        const w = t.boiling
          ? [0, 1, 2].map((i) => BOIL[0][i] + (BOIL[1][i] - BOIL[0][i]) * k)
          : [0, 1, 2].map((i) => (WATER[0][i] + (WATER[1][i] - WATER[0][i]) * k) * (1 - depth * 0.35));
        // paler where it laps against land: a line of foam along every shore
        const foam = (gx, gz) => {
          for (const [ox, oz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (!gen.tile(gx + ox, gz + oz).water) return 1.55;
          return 1;
        };
        water.quad([[x, WATER_Y, z], [x, WATER_Y, z + 1], [x + 1, WATER_Y, z + 1], [x + 1, WATER_Y, z]], [0, 1, 0], w, [foam(x, z), foam(x, z + 1), foam(x + 1, z + 1), foam(x + 1, z)]);
      } else {
        const pair = t.dug < 0 ? DIRT : t.ice ? ICE : t.shore ? SHORE_GROUND : t.slabs ? GROUND[t.biome] : sky;
        c = [0, 1, 2].map((i) => (pair[0][i] + (pair[1][i] - pair[0][i]) * k) * shade);
        // lava glows: it gets its own unlit layer just above the rock
        if (t.lava) {
          const g = [0, 1, 2].map((i) => LAVA[0][i] + (LAVA[1][i] - LAVA[0][i]) * k);
          lava.quad([[x, t.h + 0.03, z], [x, t.h + 0.03, z + 1], [x + 1, t.h + 0.03, z + 1], [x + 1, t.h + 0.03, z]], [0, 1, 0], g);
        }
      }
      const h = floorOf(t);
      // under rock the ground is dim, and dimmer the farther it is from open sky
      const dim = t.slabs ? dimmed(cover(gen, x, z)) : 1;
      // the ground darkens a little at the foot of anything taller beside it: a bank, a cliff, a shore
      const nook = (gx, gz) => {
        let n = 0;
        for (const [ox, oz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (floorOf(gen.tile(gx + ox, gz + oz)) > h + 0.2) n++;
        return (1 - n * 0.13) * dim;
      };
      land.quad([[x, h, z], [x, h, z + 1], [x + 1, h, z + 1], [x + 1, h, z]], [0, 1, 0], c, [nook(x, z), nook(x, z + 1), nook(x + 1, z + 1), nook(x + 1, z)]);

      // rock above the ground: a top in the colour of open ground, and a dark underside
      if (t.slabs) {
        for (const [lo, hi] of t.slabs) {
          land.quad([[x, hi, z], [x, hi, z + 1], [x + 1, hi, z + 1], [x + 1, hi, z]], [0, 1, 0], top);
          land.quad([[x, lo, z], [x + 1, lo, z], [x + 1, lo, z + 1], [x, lo, z + 1]], [0, -1, 0], UNDERSIDE);
        }
      }

      // Upright faces toward each neighbour: every part of this tile's rock that the neighbour's
      // rock does not cover. In rugged country they are layered rock under a lip in the colour of
      // the top; elsewhere a bank in the darkened colour of the ground.
      const kind = ROCK[t.land] ?? 0;
      const mine = t.slabs ? solids(t) : null;
      AROUND.forEach(([dx, dz], dir) => {
        const nt = gen.tile(x + dx, z + dz), nh = floorOf(nt);
        if (!mine && !nt.slabs && nh >= h) return; // the usual case: nothing to draw
        const theirs = solids(nt);
        // a face seen from under the neighbour's rock is as dim as the ground there
        const roofed = nt.slabs ? dimmed(cover(gen, x + dx, z + dz)) : 1;
        (mine ?? [[-Infinity, h]]).forEach(([a, b], i) => {
          const lipColour = i === 0 ? c : top; // the ground's own colour, or the grass on top of a slab
          const bank = lipColour.map((v, j) => v * 0.45 + SIDE_TINT[j] * 0.3);
          for (const [y0, y1] of gaps(a, b, theirs)) {
            const under = nt.slabs && y1 <= nt.slabs[0][0] ? roofed : 1;
            if (!kind) {
              wall(land, dir, x, z, y0, y1, bank, DEEP * under, under, 0);
              continue;
            }
            // the top half tile of a cliff keeps the colour of what grows above it
            const lip = y1 === b ? Math.max(y0, y1 - 0.5) : y1;
            if (lip < y1) wall(land, dir, x, z, lip, y1, bank, under, under, 0);
            if (y0 < lip) wall(land, dir, x, z, y0, lip, WHITE, 0.8 * under, under, kind);
          }
        });
      });
    }
  }
  return { land: land.done(), water: water.done(), lava: lava.done() };
}
