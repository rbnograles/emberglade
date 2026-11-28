import { describe, it, expect } from 'vitest';
import { HEADROOM, PLAYER_HEIGHT, floorOf, surfaces, slabTopBelow, ceilingAbove, solidAt, solids } from '../src/world/columns.js';
import { Landforms, LAYERS, settle } from '../src/world/landforms.js';

const land = (h, slabs) => ({ h, water: false, bed: null, slabs });
const sea = (bed, slabs) => ({ h: -0.3, water: true, bed, slabs });

describe('a tile read as a column of rock and air', () => {
  it('knows its floor and the heights that can be stood on', () => {
    expect(HEADROOM).toBe(2);
    expect(PLAYER_HEIGHT).toBe(1.5);
    expect(floorOf(land(3))).toBe(3);
    expect(floorOf(sea(-4))).toBe(-4);
    expect(surfaces(land(1))).toEqual([1]);
    expect(surfaces(land(1, [[4, 6], [9, 10]]))).toEqual([1, 6, 10]);
  });

  it('finds the rock under and over a height', () => {
    const t = land(0, [[4, 6], [9, 10]]);
    expect(slabTopBelow(t, 3)).toBe(-Infinity);
    expect(slabTopBelow(t, 6)).toBe(6);
    expect(slabTopBelow(t, 20)).toBe(10);
    expect(slabTopBelow(land(0), 20)).toBe(-Infinity);
    expect(ceilingAbove(t, 0)).toBe(4);
    expect(ceilingAbove(t, 6)).toBe(9);
    expect(ceilingAbove(t, 10)).toBe(Infinity);
    expect(ceilingAbove(land(0), 0)).toBe(Infinity);
  });

  it('tells whether rock lies between two heights', () => {
    const t = land(0, [[4, 6]]);
    expect(solidAt(t, 0, 4)).toBe(false); // touching the underside is not inside it
    expect(solidAt(t, 0, 4.5)).toBe(true);
    expect(solidAt(t, 6, 8)).toBe(false); // standing on top is not inside it
    expect(solidAt(t, 5, 5.5)).toBe(true);
    expect(solidAt(land(0), 0, 100)).toBe(false);
  });

  it('lists its solid ranges from the bottom up', () => {
    expect(solids(land(2))).toEqual([[-Infinity, 2]]);
    expect(solids(sea(-4, [[2, 5]]))).toEqual([[-Infinity, -4], [2, 5]]);
  });
});

// Worlds with nothing in them but what the landforms need: all land, or all shallow sea.
const allLand = (seed) => new Landforms({ seed, sea: 0, rugged: 1, continent: () => 1, plain: () => true });
const allSea = (seed) => new Landforms({ seed, sea: 0, rugged: 1, continent: () => -0.01, plain: () => true });
const GROUND = { h: 0, water: false, salt: false, bed: null };
const SEA = { h: -0.3, water: true, salt: true, bed: -4 };
const topOf = (form) => Math.max(form.h ?? -Infinity, ...(form.slabs ?? []).map((s) => s[1]));
const of = (list, id) => list.filter((f) => f.layer.id === id);

// Do the slabs of a reshaped tile obey the rules? floor: the ground they stand over.
function slabsAreSound(slabs, floor) {
  for (const [lo, hi] of slabs) {
    if ((lo * 2) % 1 || (hi * 2) % 1 || hi - lo < 0.5 || lo < floor + HEADROOM) return false;
    floor = hi;
  }
  return true;
}

// Can someone who steps up no more than half a tile walk from outside a landform to its top?
// Every surface counts: the ground, and the top of any slab (a cave's roof is walked on like a bench).
// They keep to the routes and to rock at least as high as the first tier, as a climber would.
function routeClimbs(forms, f, base) {
  const first = f.tiers[0], out = first.r * (1 + f.layer.amp) + f.layer.lip;
  const sx = Math.round(f.x + Math.cos(first.a0) * out), sz = Math.round(f.z + Math.sin(first.a0) * out);
  const tiles = new Map();
  const tile = (x, z) => {
    const key = x + ',' + z;
    if (!tiles.has(key)) tiles.set(key, forms.at(x, z, base) ?? {});
    return tiles.get(key);
  };
  // the highest surface of a tile that can be stepped onto from height `from`
  const stepTo = (t, from) => {
    let best = base.water && !t.dry ? 0 : t.h ?? base.h;
    for (const [, hi] of t.slabs ?? []) if (hi <= from + 0.5) best = Math.max(best, hi);
    return best <= from + 0.5 ? best : null;
  };
  const seen = new Set([sx + ',' + sz]), queue = [[sx, sz, stepTo(tile(sx, sz), 99)]];
  while (queue.length) {
    const [x, z, y] = queue.shift();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, key = nx + ',' + nz;
      if (seen.has(key) || Math.hypot(nx - f.x, nz - f.z) > f.reach) continue;
      const t = tile(nx, nz), ny = stepTo(t, y);
      if (ny === null || (!t.path && ny < first.hi)) continue;
      if (ny === f.h && !t.path) return true;
      seen.add(key);
      queue.push([nx, nz, ny]);
    }
  }
  return false;
}

describe('settling the rock above a tile', () => {
  it('joins rock that is too close to the ground onto the ground', () => {
    expect(settle(0, [[1, 3]], false)).toEqual({ h: 3, slabs: undefined });
    expect(settle(4, [[3, 4]], false)).toEqual({ h: 4, slabs: undefined });
  });
  it('sorts slabs and merges those without headroom between them', () => {
    expect(settle(0, [[5, 6], [2, 3]], false)).toEqual({ h: 0, slabs: [[2, 3], [5, 6]] });
    expect(settle(0, [[2, 3], [4, 6]], false)).toEqual({ h: 0, slabs: [[2, 6]] });
  });
  it('never fills the sea in: rock over water is trimmed to leave headroom', () => {
    expect(settle(-0.3, [[1, 5]], true)).toEqual({ h: -0.3, slabs: [[2, 5]] });
    expect(settle(-0.3, [[1, 2]], true)).toEqual({ h: -0.3, slabs: undefined });
  });
});

describe('landforms planned from the seed', () => {
  it('gives the same answer for the same seed', () => {
    const a = allLand(5), b = allLand(5);
    const f = of(a.near(0, 0, 4000), 'plateau')[0];
    for (let x = f.x - 60; x <= f.x + 60; x += 7) {
      for (let z = f.z - 60; z <= f.z + 60; z += 7) expect(a.at(x, z, GROUND)).toEqual(b.at(x, z, GROUND));
    }
  });

  it('raises plateaus and mesas inland, stacks and islands at sea', () => {
    for (const seed of [5, 11]) {
      const inland = allLand(seed).near(0, 0, 4000), coast = allSea(seed).near(0, 0, 1500);
      expect(of(inland, 'plateau').length).toBeGreaterThan(5);
      expect(of(inland, 'mesa').length).toBeGreaterThan(5);
      expect(of(inland, 'stack').length + of(inland, 'island').length).toBe(0);
      expect(of(coast, 'stack').length).toBeGreaterThan(50);
      expect(of(coast, 'island').length).toBeGreaterThan(5);
    }
  });

  it('makes each as tall as it says, within the range of its kind', () => {
    const land = allLand(5), sea = allSea(5);
    for (const [forms, base, id] of [[land, GROUND, 'plateau'], [sea, SEA, 'stack'], [sea, SEA, 'island']]) {
      const layer = LAYERS.find((l) => l.id === id);
      for (const f of of(forms.near(0, 0, 3000), id).slice(0, 8)) {
        expect(f.h).toBeGreaterThanOrEqual(layer.h[0]);
        expect(f.h).toBeLessThanOrEqual(layer.h[1]);
        expect(topOf(forms.at(f.x, f.z, base))).toBe(f.h);
      }
    }
  });

  it('keeps clear of the heart of the world and of each other', () => {
    const all = [...allLand(5).near(0, 0, 4000)];
    for (const f of [...all, ...allSea(5).near(0, 0, 1500)]) expect(Math.hypot(f.x, f.z) - f.reach).toBeGreaterThanOrEqual(200);
    for (const a of all) {
      for (const b of all) if (a.layer !== b.layer) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(a.reach + b.reach);
    }
  });

  it('only makes slabs that obey the rules', () => {
    const sea = allSea(11), land = allLand(11);
    let slabTiles = 0;
    for (const [forms, base, id, step] of [[sea, SEA, 'stack', 1], [sea, SEA, 'island', 1], [land, GROUND, 'plateau', 2], [land, GROUND, 'mesa', 3]]) {
      for (const f of of(forms.near(0, 0, 4000), id).slice(0, 3)) {
        const reach = Math.ceil(f.reach);
        for (let x = f.x - reach; x <= f.x + reach; x += step) {
          for (let z = f.z - reach; z <= f.z + reach; z += step) {
            const form = forms.at(x, z, base);
            if (!form?.slabs) continue;
            slabTiles++;
            const dry = form.dry || !base.water;
            expect(slabsAreSound(form.slabs, dry ? form.h : 0), `${id} at ${x},${z}`).toBe(true);
          }
        }
      }
    }
    expect(slabTiles).toBeGreaterThan(500);
  });

  it('turns none of the ground under an arch or a lip into land', () => {
    const sea = allSea(5);
    const f = of(sea.near(0, 0, 1500), 'stack')[0];
    let over = 0;
    for (let x = f.x - 20; x <= f.x + 20; x++) {
      for (let z = f.z - 20; z <= f.z + 20; z++) {
        const form = sea.at(x, z, SEA);
        if (form?.slabs && !form.dry) {
          over++;
          expect(form.h).toBe(SEA.h);
        }
      }
    }
    expect(over).toBeGreaterThan(0);
  });
  it('has a walkable way up every plateau, tier by tier, and every mesa and island', () => {
    for (const seed of [1, 7]) {
      const land = allLand(seed), sea = allSea(seed);
      const inland = land.near(0, 0, 4000), coast = sea.near(0, 0, 1500);
      const tiered = of(inland, 'plateau').filter((f) => f.tiers.length > 1);
      expect(tiered.length).toBeGreaterThan(3);
      for (const f of [...of(inland, 'plateau').slice(0, 6), ...tiered.slice(0, 4), ...of(inland, 'mesa').slice(0, 3)]) {
        expect(routeClimbs(land, f, GROUND), `${f.layer.id} at ${f.x},${f.z} in seed ${seed}`).toBe(true);
      }
      for (const f of of(coast, 'island').slice(0, 6)) expect(routeClimbs(sea, f, SEA), `island at ${f.x},${f.z} in seed ${seed}`).toBe(true);
    }
  }, 30000);
});
