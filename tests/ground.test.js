import { describe, it, expect } from 'vitest';
import { HEADROOM, PLAYER_HEIGHT, floorOf, surfaces, slabTopBelow, ceilingAbove, solidAt, solids } from '../src/world/columns.js';
import { Landforms, LAYERS, settle } from '../src/world/landforms.js';
import { Worldgen, WATER_Y } from '../src/world/worldgen.js';
import { BIOMES, LAND_NAMES, ROCK_COLORS, placeName, roofColour } from '../src/world/biomes.js';
import { WORLD_TYPES } from '../src/world/worldtypes.js';
import { Game, needsRelocation } from '../src/game/game.js';
import { buildTerrain, gaps, CHUNK } from '../src/render/terrain.js';

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

// The ground of a world made of landforms over one kind of base tile, read tile by tile as the
// game reads it.
function reshaped(forms, base) {
  const tiles = new Map();
  return (x, z) => {
    const key = x + ',' + z;
    if (!tiles.has(key)) {
      const form = forms.at(x, z, base) ?? {};
      tiles.set(key, { ...base, water: base.water && !form.dry, ...form });
    }
    return tiles.get(key);
  };
}

// The game's own step rules: a swimmer floats this high (the surface less the float sink), and can
// haul themselves out only onto ground no higher than BANK (the bank lip above that). On land a
// step up is at most half a tile.
const SWIM = WATER_Y - 0.95, BANK = SWIM + 1.45;

// Can someone walk from outside a landform to its top, by those rules?
// Every surface counts: the ground, and the top of any slab (a cave's roof is walked on like a bench).
// They keep to the routes and to rock at least as high as the first tier, as a climber would.
// tile(x, z): the tile at a spot, with h, water and slabs as Worldgen.tile gives them
function climbs(tile, f) {
  const first = f.tiers[0], out = first.r * (1 + f.layer.amp) + f.layer.lip;
  const sx = Math.round(f.x + Math.cos(first.a0) * out), sz = Math.round(f.z + Math.sin(first.a0) * out);
  // the highest surface of a tile that can be stepped onto from height `from` (SWIM: in the water)
  const stepTo = (t, from) => {
    const top = from === SWIM ? BANK : from + 0.5;
    let best = t.water ? SWIM : t.h;
    for (const [, hi] of t.slabs ?? []) if (hi <= top) best = Math.max(best, hi);
    return best <= top ? best : null;
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
      const onLand = reshaped(land, GROUND), atSea = reshaped(sea, SEA);
      for (const f of [...of(inland, 'plateau').slice(0, 6), ...tiered.slice(0, 4), ...of(inland, 'mesa').slice(0, 3)]) {
        expect(climbs(onLand, f), `${f.layer.id} at ${f.x},${f.z} in seed ${seed}`).toBe(true);
      }
      for (const f of of(coast, 'island').slice(0, 6)) expect(climbs(atSea, f), `island at ${f.x},${f.z} in seed ${seed}`).toBe(true);
    }
  }, 30000);
});

const SEEDS = [1, 7, 42];
const nearest = (gen, id, radius = 3000) => gen.landformsNear(0, 0, radius).find((f) => f.layer.id === id);

// Can the player get from (sx, sz) to the top of a landform? The real game judges every step:
// canEnter says whether they may move, and standY where they come to rest. They jump wherever they
// are not swimming, and nothing that grows or is built is in their way.
const JUMP = 0.9; // a little under the top of a jump
function gameClimbs(g, f, sx, sz) {
  const p = g.player, gen = g.gen;
  g.blocked = () => false;
  const put = (x, z, y) => Object.assign(p, { x: x + 0.5, z: z + 0.5, y, vy: 0 });
  const y0 = g.standY(sx + 0.5, sz + 0.5, floorOf(gen.tile(sx, sz)));
  const seen = new Set([sx + ',' + sz + ',' + y0]), queue = [[sx, sz, y0]];
  for (let i = 0; i < queue.length; i++) {
    const [x, z, y] = queue[i];
    put(x, z, y);
    const heights = g.swimming ? [y] : [y, Math.min(y + JUMP, ceilingAbove(gen.tile(x, z), y + 0.17) - PLAYER_HEIGHT)];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (Math.hypot(nx - f.x, nz - f.z) > f.reach + 10) continue;
      for (const from of heights) {
        put(x, z, from);
        if (!g.canEnter(nx + 0.5, nz + 0.5)) continue;
        const ny = g.standY(nx + 0.5, nz + 0.5, from), t = gen.tile(nx, nz);
        if (ny === f.h && !t.path && !t.slabs) return true;
        const key = nx + ',' + nz + ',' + ny;
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push([nx, nz, ny]);
      }
    }
  }
  return false;
}
// Just outside a landform, in line with its way up: out at sea beside an island, on the plain
// beside a plateau or a mesa.
const besideRoute = (f) => {
  const a = f.tiers[0].a0, d = f.reach + 3;
  return [Math.round(f.x + Math.cos(a) * d), Math.round(f.z + Math.sin(a) * d)];
};

describe('the new country in a world', () => {
  it('names its places and colours its rock', () => {
    expect(BIOMES.canyon.name).toBe('Canyon Lands');
    expect(LAND_NAMES).toEqual({ stacks: 'Stack Coast', table: 'Tablelands', canyon: 'Canyon Lands' });
    for (const land of Object.keys(LAND_NAMES)) expect(ROCK_COLORS[land]).toHaveLength(4);
    expect(WORLD_TYPES.continents.rugged).toBe(1);
    expect(WORLD_TYPES.isles.rugged).toBe(1.5);
    expect(WORLD_TYPES.highlands.rugged).toBe(1.5);
  });

  it('has every kind within 3000 tiles and none at the heart of the world', () => {
    for (const seed of SEEDS) {
      const gen = new Worldgen(seed);
      for (const id of ['stack', 'island', 'plateau', 'mesa']) expect(nearest(gen, id), `${id} in seed ${seed}`).toBeTruthy();
      for (let x = -200; x <= 200; x += 8) {
        for (let z = -200; z <= 200; z += 8) {
          if (Math.hypot(x, z) > 200) continue;
          const t = gen.tile(x, z);
          expect(t.land).toBeUndefined();
          expect(t.slabs).toBeUndefined();
        }
      }
    }
  });

  it('gives the same ground for the same seed, and sound slabs everywhere', () => {
    const a = new Worldgen(7), b = new Worldgen(7);
    let slabTiles = 0;
    for (const id of ['stack', 'island', 'plateau', 'mesa']) {
      const f = nearest(a, id), reach = Math.ceil(f.reach), step = id === 'mesa' ? 3 : id === 'plateau' ? 2 : 1;
      for (let x = f.x - reach; x <= f.x + reach; x += step) {
        for (let z = f.z - reach; z <= f.z + reach; z += step) {
          const t = a.tile(x, z), u = b.tile(x, z);
          expect([u.h, u.slabs, u.land, u.path]).toEqual([t.h, t.slabs, t.land, t.path]);
          if (t.land) {
            expect(t.frost).toBe(0);
            expect(t.heat).toBe(0);
            expect(['mountain', 'snow', 'volcano']).not.toContain(t.biome);
          }
          if (!t.slabs) continue;
          slabTiles++;
          expect(slabsAreSound(t.slabs, t.water ? 0 : t.h), `${id} at ${x},${z}`).toBe(true);
        }
      }
    }
    expect(slabTiles).toBeGreaterThan(200);
  });

  it('has a walkable way up every island, plateau and mesa', () => {
    for (const seed of SEEDS) {
      const gen = new Worldgen(seed);
      for (const id of ['island', 'plateau', 'mesa']) expect(climbs((x, z) => gen.tile(x, z), nearest(gen, id)), `${id} in seed ${seed}`).toBe(true);
    }
  }, 60000);

  it('lets the player swim to an island, climb out onto its way up and walk to the top', () => {
    for (const seed of SEEDS) {
      const g = new Game({ seed }), f = nearest(g.gen, 'island'), [sx, sz] = besideRoute(f);
      Object.assign(g.player, { x: sx + 0.5, z: sz + 0.5, y: SWIM });
      expect(g.swimming, `the sea beside the island in seed ${seed}`).toBe(true);
      expect(gameClimbs(g, f, sx, sz), `island at ${f.x},${f.z} in seed ${seed}`).toBe(true);
    }
  }, 30000);

  it('lets the player walk from the plain to the top of a plateau and of a mesa', () => {
    const g = new Game({ seed: 1 });
    for (const id of ['plateau', 'mesa']) {
      const f = nearest(g.gen, id), [sx, sz] = besideRoute(f);
      expect(g.gen.tile(sx, sz).water).toBe(false);
      expect(gameClimbs(g, f, sx, sz), `${id} at ${f.x},${f.z}`).toBe(true);
    }
  }, 30000);

  it('spans the sea between stacks with arches a boat can pass under', () => {
    for (const seed of SEEDS) {
      const gen = new Worldgen(seed), stack = LAYERS.find((l) => l.id === 'stack');
      const mids = [];
      const n = Math.ceil(3000 / stack.cell);
      for (let cz = -n; cz < n; cz++) {
        for (let cx = -n; cx < n; cx++) {
          for (const axis of [0, 1]) {
            const arch = gen.forms.arch(cx, cz, axis);
            if (!arch) continue;
            const m = (arch.from + arch.to) / 2;
            mids.push(gen.tile(Math.round(arch.x + arch.dx * m), Math.round(arch.z + arch.dz * m)));
          }
        }
      }
      expect(mids.length).toBeGreaterThan(5);
      expect(mids.some((t) => t.water && t.slabs && t.slabs[0][0] - WATER_Y >= 4)).toBe(true);
    }
  });

  it('keeps settlements off it', () => {
    for (const seed of SEEDS) {
      const gen = new Worldgen(seed);
      for (const st of gen.settlementsNear(0, 0, 3000)) {
        expect(gen.natural(st.x, st.z).land).toBeUndefined();
        for (let dx = -st.radius; dx <= st.radius; dx += 3) {
          for (let dz = -st.radius; dz <= st.radius; dz += 3) {
            const t = gen.tile(st.x + dx, st.z + dz);
            if (t.settled) expect([t.land, t.slabs, t.path]).toEqual([undefined, undefined, undefined]);
          }
        }
      }
    }
  });

  it('grows nothing on a route and only stone and sticks under rock', () => {
    const gen = new Worldgen(1);
    let routes = 0, under = 0;
    for (const id of ['island', 'plateau']) {
      const f = nearest(gen, id), reach = Math.ceil(f.reach);
      for (let x = f.x - reach; x <= f.x + reach; x++) {
        for (let z = f.z - reach; z <= f.z + reach; z++) {
          const t = gen.tile(x, z), obj = gen.object(x, z);
          if (t.path) {
            routes++;
            expect(obj).toBe(null);
          } else if (t.slabs && !t.water && obj) {
            under++;
            expect(['pebble', 'stick', 'boulder'].includes(obj.t) || obj.t.startsWith('rock_')).toBe(true);
          }
        }
      }
    }
    expect(routes).toBeGreaterThan(50);
    expect(under).toBeGreaterThan(0);
  });

  it('leaves the mountains where they were', () => {
    const gen = new Worldgen(42);
    let peaks = 0;
    for (let x = -3000; x <= 3000; x += 37) {
      for (let z = -3000; z <= 3000; z += 37) {
        const t = gen.natural(x, z);
        if (t.biome !== 'mountain' && t.biome !== 'snow') continue;
        peaks++;
        expect(gen.mountainRise(x, z)).toBeGreaterThanOrEqual(0.5);
        expect(gen.plain(x, z)).toBe(false);
        expect(t.land).toBeUndefined();
      }
    }
    expect(peaks).toBeGreaterThan(20);
  });
});

// A game on hand-made ground: flat at height 0 except where `tiles` says otherwise.
// tiles: { 'x,z': { h, slabs, water, bed, ... } }
function rockWorld(tiles = {}) {
  const g = new Game({ seed: 1 });
  const made = new Map();
  g.gen.tile = (x, z) => {
    const key = x + ',' + z;
    let t = made.get(key);
    if (!t) made.set(key, (t = { h: 0, bed: null, water: false, salt: false, biome: 'meadow', shore: false, lava: false, ice: false, boiling: false, frost: 0, heat: 0, obj: null, ...tiles[key] }));
    return t;
  };
  g.gen.object = () => null;
  g.gen.settlementAt = () => null;
  g.gen.floorAt = g.gen.roofAt = g.gen.upperAt = () => null;
  Object.assign(g.player, { x: 0.5, z: 0.5, y: 0, vy: 0 });
  return g;
}
const stand = (g, x, z, y) => Object.assign(g.player, { x: x + 0.5, z: z + 0.5, y, vy: 0 });
const settleDown = (g, jump = false) => { for (let i = 0; i < 240; i++) g.physics(1 / 60, jump); };

describe('walking over and under rock', () => {
  const ARCH = { '1,0': { slabs: [[2, 4]] }, '2,0': { h: 4 } };

  it('walks under an arch and stays on the ground', () => {
    const g = rockWorld(ARCH);
    expect(g.canEnter(1.5, 0.5)).toBe(true);
    stand(g, 1, 0, 0);
    expect(g.standY(1.5, 0.5)).toBe(0);
    settleDown(g);
    expect(g.player.y).toBe(0);
    expect(g.aloft(g.gen.tile(1, 0))).toBe(false);
  });

  it('walks onto the top of an arch from ground of the same height, and stays up', () => {
    const g = rockWorld(ARCH);
    stand(g, 2, 0, 4);
    expect(g.canEnter(1.5, 0.5)).toBe(true);
    stand(g, 1, 0, 4);
    expect(g.standY(1.5, 0.5)).toBe(4);
    settleDown(g);
    expect(g.player.y).toBe(4);
    expect(g.aloft(g.gen.tile(1, 0))).toBe(true);
    expect(g.playerLevel).toBe(0);
  });

  it('is stopped by the side of a slab at body height', () => {
    const g = rockWorld({ ...ARCH, '0,0': { h: 2.5 } });
    stand(g, 0, 0, 2.5);
    expect(g.canEnter(1.5, 0.5)).toBe(false);
  });

  it('bumps its head on the rock when it jumps beneath it', () => {
    const g = rockWorld(ARCH);
    stand(g, 1, 0, 0);
    let highest = 0;
    for (let i = 0; i < 120; i++) {
      g.physics(1 / 60, true);
      highest = Math.max(highest, g.player.y);
    }
    expect(highest).toBeGreaterThan(0.2);
    expect(highest).toBeLessThanOrEqual(2 - 1.5 + 1e-6);
  });

  it('falls to the ground on stepping off the top', () => {
    const g = rockWorld(ARCH);
    stand(g, 1, 0, 4);
    g.player.x = 0.5; // off the arch, over open ground
    settleDown(g);
    expect(g.player.y).toBe(0);
  });

  it('stands on an arch over the sea without being in the water', () => {
    const g = rockWorld({ '1,0': { h: -0.3, water: true, salt: true, bed: -4, slabs: [[2, 6]] } });
    stand(g, 1, 0, 6);
    expect(g.swimming).toBe(false);
    expect(g.inWater).toBe(false);
    settleDown(g);
    expect(g.player.y).toBe(6);
    // and swims beneath it as in any deep water
    stand(g, 1, 0, -1.25);
    expect(g.swimming).toBe(true);
    expect(g.canEnter(1.5, 0.5)).toBe(true);
  });

  it('is not blocked from above by what stands under the rock', () => {
    const g = rockWorld(ARCH);
    g.world.set(1, 0, { t: 'wood_wall', placed: true });
    stand(g, 0, 0, 0);
    expect(g.blocked(1.5, 0.5)).toBe(true);
    stand(g, 2, 0, 4);
    expect(g.blocked(1.5, 0.5)).toBe(false);
  });
});

const hold = (g, id, n = 1) => {
  g.inv.slots[0] = { id, n };
  g.selected = 0;
};

describe('rules beside and beneath rock', () => {
  const ARCH = { '1,0': { slabs: [[2, 4]] }, '2,0': { h: 4 } };

  it('builds under an arch only where the piece fits', () => {
    const g = rockWorld(ARCH);
    hold(g, 'wood_wall');
    expect(g.canPlace(1, 0)).toBe(true); // one storey is 1.5 tall and the rock is 2 up
    g.buildShift = 1;
    expect(g.buildLevel).toBe(1);
    expect(g.canPlace(1, 0)).toBe(false);
    expect(g.placeProblem(1, 0)).toBe('No room under the rock');
  });

  it('refuses to build, dig or reach down through the rock it stands on', () => {
    const g = rockWorld(ARCH);
    stand(g, 2, 0, 4);
    hold(g, 'wood_wall');
    expect(g.overTile(1, 0)).toBe(true);
    expect(g.inReach(1, 0)).toBe(false);
    expect(g.canPlace(1, 0)).toBe(false);
    expect(g.placeProblem(1, 0)).toBe('Nothing can be built up here yet');
    expect(g.groundProblem(1, 0)).toBe('Nothing can be built up here yet');
    // the plateau beside it is ordinary ground
    expect(g.overTile(3, 0)).toBe(false);
    expect(g.inReach(3, 0)).toBe(true);
  });

  it('will not pile the ground up into the rock', () => {
    const g = rockWorld({ '1,0': { slabs: [[2, 4]] } });
    const said = [];
    g.toast = (text) => said.push(text);
    hold(g, 'dirt', 5);
    const before = g.gen.dug.get('1,0') ?? 0;
    g.fill(1, 0);
    expect(g.gen.dug.get('1,0') ?? 0).toBe(before);
    expect(said).toContain('No room under the rock');
  });

  it('moves every world saved under the old land to a fresh start', () => {
    expect(needsRelocation({ player: { x: 0, z: 0 }, gen: 5 })).toBe(true);
    expect(needsRelocation(new Game({ seed: 3 }).serialize())).toBe(false);
  });

  it('never begins a world on the rugged country', () => {
    for (let i = 0; i < 6; i++) {
      const g = new Game({ seed: 100 + i });
      const s = g.wildSpawn();
      expect(g.gen.tile(s.x, s.z).land).toBeUndefined();
    }
  });
});

// A generator that knows only flat meadow at height 0, except where `tiles` says otherwise.
const flatGen = (tiles = {}) => ({
  tile: (x, z) => ({ h: 0, bed: null, water: false, salt: false, biome: 'meadow', shore: false, lava: false, ice: false, boiling: false, ...tiles[x + ',' + z] }),
});
const quads = (mesh) => mesh.idx.length / 6;
const rockCorners = (mesh) => mesh.rock.filter((r) => r > 0).length;

describe('drawing the ground', () => {
  it('finds the parts of a range that nothing covers', () => {
    expect(gaps(0, 10, [])).toEqual([[0, 10]]);
    expect(gaps(0, 10, [[-Infinity, 4]])).toEqual([[4, 10]]);
    expect(gaps(0, 10, [[-Infinity, 2], [5, 7]])).toEqual([[2, 5], [7, 10]]);
    expect(gaps(3, 5, [[-Infinity, 0], [3, 5]])).toEqual([]);
    expect(gaps(-Infinity, 4, [[-Infinity, 6]])).toEqual([]);
  });

  it('draws flat ground as one square per tile', () => {
    const { land, water, lava } = buildTerrain(flatGen(), 0, 0);
    expect(quads(land)).toBe(CHUNK * CHUNK);
    expect(quads(water)).toBe(0);
    expect(quads(lava)).toBe(0);
    expect(land.rock.length).toBe(land.pos.length / 3);
    expect(rockCorners(land)).toBe(0);
  });

  it('draws a lone slab with a top, an underside and four sides', () => {
    const { land } = buildTerrain(flatGen({ '5,5': { slabs: [[3, 5]] } }), 0, 0);
    expect(quads(land)).toBe(CHUNK * CHUNK + 6);
  });

  it('draws nothing between two slabs that touch', () => {
    const { land } = buildTerrain(flatGen({ '5,5': { slabs: [[3, 5]] }, '6,5': { slabs: [[3, 5]] } }), 0, 0);
    expect(quads(land)).toBe(CHUNK * CHUNK + 2 * 2 + 6);
  });

  it('draws a cliff beside a slab only where the rock next to it is open', () => {
    // a plateau tile 5 high beside a tile whose slab covers 3..5: the cliff shows from 0 to 3 only
    const { land } = buildTerrain(flatGen({ '5,5': { h: 5 }, '6,5': { slabs: [[3, 5]] } }), 0, 0);
    const xs = [];
    for (let i = 0; i < land.pos.length; i += 3) if (land.pos[i] === 6 && land.norm[i] === 1) xs.push(land.pos[i + 1]);
    expect(Math.max(...xs)).toBe(3);
    expect(Math.min(...xs)).toBe(0);
  });

  it('marks the cliffs of rugged country as layered rock, with a lip in the colour of the top', () => {
    const { land } = buildTerrain(flatGen({ '5,5': { slabs: [[3, 5]], land: 'stacks' } }), 0, 0);
    // each of the four sides is a half-tile lip plus the rock below it
    expect(quads(land)).toBe(CHUNK * CHUNK + 2 + 8);
    expect(rockCorners(land)).toBe(16);
    expect(new Set(land.rock)).toEqual(new Set([0, 1]));
  });

  it('darkens the ground under rock', () => {
    const open = buildTerrain(flatGen(), 0, 0).land, roofed = buildTerrain(flatGen({ '5,5': { slabs: [[3, 5]] } }), 0, 0).land;
    // the first square drawn for tile (5,5) is its ground: 4 corners, in the same place in both meshes
    const at = (5 * CHUNK + 5) * 4 * 3;
    expect(roofed.col[at + 1]).toBeLessThan(open.col[at + 1]);
  });

  it('keeps the dark stone walls of a castle cliff, and the earthy bank everywhere else', () => {
    // the +x face of a raised tile: the vertices at x = 6 that face along +x
    const wallColour = (tile) => {
      const { land } = buildTerrain(flatGen({ '5,5': tile }), 0, 0);
      const out = [];
      for (let i = 0; i < land.pos.length; i += 3) if (land.pos[i] === 6 && land.pos[i + 2] >= 5 && land.pos[i + 2] <= 6 && land.norm[i] === 1) out.push(Array.from(land.col.slice(i, i + 3)));
      return out;
    };
    const stone = wallColour({ h: 3, cliff: true }), earth = wallColour({ h: 3 });
    expect(stone.length).toBe(4);
    // lip vertices (the brighter pair) are the full colour; the foot is dimmer
    const lip = (w) => w.reduce((a, b) => (b[1] > a[1] ? b : a));
    const [r, g, b] = lip(stone);
    expect(r).toBeGreaterThan(0.14); expect(r).toBeLessThan(0.18);
    expect(Math.abs(r - g)).toBeLessThan(0.03); expect(Math.abs(g - b)).toBeLessThan(0.03);
    const e = lip(earth);
    expect(e[0]).toBeGreaterThan(r + 0.05); // the ordinary bank is lighter and warmer, not grey
    expect(e[0]).toBeGreaterThan(e[2] + 0.1);
  });
});

describe('naming and mapping the rugged country', () => {
  it('names a place by its country, or by its biome anywhere else', () => {
    expect(placeName({ biome: 'meadow', land: 'table' })).toBe('Tablelands');
    expect(placeName({ biome: 'ocean', land: 'stacks' })).toBe('Stack Coast');
    expect(placeName({ biome: 'canyon', land: 'canyon' })).toBe('Canyon Lands');
    expect(placeName({ biome: 'pine' })).toBe(BIOMES.pine.name);
  });

  it('maps a tile under rock as rock, whatever lies beneath', () => {
    expect(roofColour({ biome: 'ocean', water: true, land: 'stacks', slabs: [[2, 9]] })).toBe(ROCK_COLORS.stacks[0]);
    expect(roofColour({ biome: 'canyon', land: 'canyon', slabs: [[4, 20]] })).toBe(ROCK_COLORS.canyon[0]);
    expect(roofColour({ biome: 'meadow', land: 'table' })).toBe(null);
    expect(roofColour({ biome: 'meadow' })).toBe(null);
  });
});
