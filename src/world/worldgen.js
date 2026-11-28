import { fbm, hash2 } from '../core/noise.js';
import { BIOMES, SHORE, SEABED } from './biomes.js';
import { CELL, planSettlement, castleGround } from './structures.js';
import { WORLD_TYPES, worldType } from './worldtypes.js';
import { Landforms } from './landforms.js';

export const WATER_Y = -0.3;
export const DIG_STEP = 0.5; // how far one spadeful lowers or raises the ground
export const DIG_LIMIT = 4; // steps the ground may be moved from where nature left it, either way
export const SWIM_DEPTH = 0.8; // water deeper than this (surface to bed) is swum, shallower is waded
// Where the sea level, the mountain line and the size of the two harsh regions come from: see worldtypes.js.
const SNOW_LINE = 18; // mountains this high are snow-capped (much lower inside the frozen region)
const VOLCANO_CELL = 560; // one possible volcano per square of this many tiles, inside the volcanic region
const REGION_DISTANCE = 4300; // how far from the centre of the world the two harsh regions lie
// What still grows or lies on dry ground with rock overhead: no trees, bushes, grass or flowers.
const UNDER_ROCK = new Set(['pebble', 'stick', 'boulder']);

// Deterministic description of every tile: height, water, biome and natural object.
export class Worldgen {
  // type: an id from WORLD_TYPES, the broad shape of the world (how much sea, how mountainous, ...)
  constructor(seed, type) {
    this.seed = seed | 0;
    this.kind = worldType(type);
    this.type = WORLD_TYPES[this.kind];
    this.cache = new Map();
    this.dug = new Map(); // "x,z" -> steps the player has dug down (negative) or built up
    this.settlements = new Map(); // settlement grid square -> village, castle or null
    this.volcanoes = new Map(); // grid cell -> volcano or null
    // stacks, islands, plateaus and canyon mesas: the rugged country between the gentle lowlands
    this.forms = new Landforms({
      seed: this.seed, sea: this.type.sea, rugged: this.type.rugged,
      continent: (x, z) => this.continent(x, z), plain: (x, z) => this.plain(x, z),
    });
    // Each world has exactly one frozen region and one volcanic region, on roughly opposite sides.
    // They are put where there is the most land, so neither is lost at sea.
    const start = hash2(this.seed, 1, 900) * Math.PI * 2;
    const spots = [];
    for (let i = 0; i < 20; i++) {
      for (const dist of [REGION_DISTANCE - 500, REGION_DISTANCE + 300, REGION_DISTANCE + 1300]) {
        const a = start + (i / 20) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * dist), z = Math.round(Math.sin(a) * dist);
        let land = 0;
        for (let k = 0; k < 14; k++) {
          const r = k === 0 ? 0 : k < 7 ? 800 : 1700, b = (k / 7) * Math.PI * 2;
          if (this.continent(x + Math.cos(b) * r, z + Math.sin(b) * r) > this.type.sea + 0.004) land++;
        }
        spots.push({ x, z, land });
      }
    }
    spots.sort((p, q) => q.land - p.land);
    this.frostCentre = { x: spots[0].x, z: spots[0].z };
    const apart = spots.find((p) => Math.hypot(p.x - spots[0].x, p.z - spots[0].z) > 5600) ?? spots[spots.length - 1];
    this.heatCentre = { x: apart.x, z: apart.z };
  }

  // Land or sea. A very broad shape makes whole continents and whole oceans; a finer one on top only
  // roughens the coastline, so the land stays solid and the sea stays open.
  continent(x, z) {
    const s = this.seed;
    // one smooth, very broad wave for the continents (no inland seas), a little mid-scale shape for
    // bays and headlands, and fine noise for a ragged shoreline with the odd island
    const { scale, mid, fine } = this.type;
    return fbm(x / scale, z / scale, s + 20, 1) + fbm(x / 1400, z / 1400, s + 22, 2) * mid
      + fbm(x / 170, z / 170, s + 21, 3) * fine + Math.max(0, 1 - Math.hypot(x, z) / 60) * 0.5;
  }

  // How deep into each harsh region a spot is: 0 outside, rising to 1 at the heart. The edge is ragged.
  climate(x, z) {
    const wobble = fbm(x / 260, z / 260, this.seed + 60, 2) * 0.14;
    const depth = (c, r) => Math.max(0, Math.min(1, 1 - Math.hypot(x - c.x, z - c.z) / r + wobble));
    const frost = depth(this.frostCentre, this.type.frost);
    return { frost, heat: frost > 0 ? 0 : depth(this.heatCentre, this.type.heat) };
  }

  // How far the mountains lift the land at a spot, in tiles: 0 where there are none.
  // Great massifs in the heart of each continent: the land climbs steadily from the lowlands near
  // the coast to very high peaks far inland, with valleys and terraces cut into the slopes.
  mountainRise(x, z, cont = this.continent(x, z)) {
    const s = this.seed, OCEAN = this.type.sea, MOUNTAIN = this.type.mountain;
    if (cont < OCEAN + 0.002) return 0; // the sea and the coast
    const heart = Math.min(1, Math.max(0, (cont - OCEAN - 0.06) / 0.12));
    const range = fbm(x / 1500, z / 1500, s + 30, 3) + heart * 0.12;
    if (range <= MOUNTAIN || heart <= 0) return 0;
    const fade = Math.min(1, Math.max(0, (Math.hypot(x, z) - 40) / 40)) * heart * (2 - heart);
    const rough = 0.72 + 0.28 * fbm(x / 46, z / 46, s + 31, 3);
    return Math.floor((range - MOUNTAIN) * 230 * rough * fade * 2) / 2;
  }

  // Is this a spot nothing else has shaped: no mountain, and neither of the harsh regions?
  plain(x, z) {
    const { frost, heat } = this.climate(x, z);
    return frost <= 0 && heat <= 0 && this.mountainRise(x, z) < 0.5;
  }

  // The volcano whose slopes cover (x, z), with the distance to its centre, or null.
  volcanoAt(x, z) {
    const gx = Math.floor(x / VOLCANO_CELL), gz = Math.floor(z / VOLCANO_CELL);
    for (let cz = gz - 1; cz <= gz + 1; cz++) {
      for (let cx = gx - 1; cx <= gx + 1; cx++) {
        const key = cx + ',' + cz;
        let v = this.volcanoes.get(key);
        if (v === undefined) {
          const s = this.seed;
          v = null;
          if (hash2(cx, cz, s + 50) < 0.6) {
            const vx = Math.round((cx + 0.2 + hash2(cx, cz, s + 51) * 0.6) * VOLCANO_CELL);
            const vz = Math.round((cz + 0.2 + hash2(cx, cz, s + 52) * 0.6) * VOLCANO_CELL);
            // only on solid land, and only inside the volcanic region
            if (this.continent(vx, vz) > this.type.sea + 0.03 && this.climate(vx, vz).heat > 0.12) {
              v = { x: vx, z: vz, radius: 52 + hash2(cx, cz, s + 53) * 30, height: 28 + hash2(cx, cz, s + 54) * 16 };
            }
          }
          this.volcanoes.set(key, v);
        }
        if (!v) continue;
        const r = Math.hypot(x - v.x, z - v.z);
        if (r < v.radius) return { v, r };
      }
    }
    return null;
  }

  tile(x, z) {
    // one number per tile; good for about 33 million tiles in every direction
    const k = (x + 33554432) * 67108864 + (z + 33554432);
    let t = this.cache.get(k);
    if (t) return t;
    t = this.natural(x, z);
    // a village or castle stands on level, dry ground at the height of its middle
    const st = this.settlementAt(x, z);
    if (st) {
      const h = st.court ? castleGround(st, x, z, t.h) : st.h;
      if (st.court) {
        t.cliff = true;
        if (t.water || t.lava || t.ice) t.biome = 'meadow';
      }
      Object.assign(t, { h, bed: null, water: false, salt: false, shore: false, lava: false, ice: false, boiling: false, settled: true, slabs: undefined, land: undefined, path: undefined });
    }
    // ground the player has dug out or built up, in half-tile steps
    const steps = this.dug.size ? this.dug.get(x + ',' + z) : 0;
    if (steps) {
      t.h += steps * DIG_STEP;
      t.dug = steps;
    }
    if (this.cache.size > 200000) this.cache.clear();
    this.cache.set(k, t);
    return t;
  }

  // Lower (negative) or raise the ground of one tile by whole steps from how nature left it.
  setDug(x, z, steps) {
    if (steps) this.dug.set(x + ',' + z, steps);
    else this.dug.delete(x + ',' + z);
    this.cache.delete((x + 33554432) * 67108864 + (z + 33554432));
  }

  // The settlement planned for one square of the settlement grid, or null. Worked out once.
  settlementFor(cellX, cellZ) {
    const key = cellX + ',' + cellZ;
    if (!this.settlements.has(key)) this.settlements.set(key, planSettlement(this.seed, cellX, cellZ, (x, z) => this.natural(x, z)));
    return this.settlements.get(key);
  }

  // The settlement whose ground this tile is part of, or null.
  settlementAt(x, z) {
    const st = this.settlementFor(Math.floor(x / CELL), Math.floor(z / CELL));
    if (st?.court) return Math.max(Math.abs(x - st.x - st.court.dx), Math.abs(z - st.z - st.court.dz)) <= st.radius ? st : null;
    return st && Math.abs(x - st.x) <= st.radius + 1 && Math.abs(z - st.z) <= st.radius + 1 ? st : null;
  }

  // One cell of a settlement's plan ({ obj, floor, roof }), or null.
  settledCell(x, z) {
    const st = this.settlementAt(x, z);
    return st ? st.cells.get((x - st.x) + ',' + (z - st.z)) ?? null : null;
  }

  floorAt(x, z) { return this.settledCell(x, z)?.floor ?? null; }
  // What a settlement built on a storey above the ground here ({ obj, floor, roof }), or null.
  upperAt(x, z, level) { return this.settledCell(x, z)?.up?.[level] ?? null; }
  roofAt(x, z) { return this.settledCell(x, z)?.roof ?? null; }

  // Every settlement whose middle is within `radius` tiles.
  settlementsNear(x, z, radius) {
    const out = [];
    for (let cz = Math.floor((z - radius) / CELL); cz <= Math.floor((z + radius) / CELL); cz++) {
      for (let cx = Math.floor((x - radius) / CELL); cx <= Math.floor((x + radius) / CELL); cx++) {
        const st = this.settlementFor(cx, cz);
        if (st && Math.hypot(st.x - x, st.z - z) <= radius) out.push(st);
      }
    }
    return out;
  }

  // Every stack, island, plateau and mesa whose middle is within `radius` tiles, nearest first.
  landformsNear(x, z, radius) { return this.forms.near(x, z, radius); }

  // The land as it would be with nobody living on it. A fresh object each time; tile() is the cached, final answer.
  natural(x, z) {
    const s = this.seed;
    const OCEAN = this.type.sea;
    const d = Math.hypot(x, z);
    // Shapes at several scales: continents and vast oceans, mountain ranges, and local bumps with ponds.
    // The old start area at the origin is lifted so it is always dry, gentle land.
    const cont = this.continent(x, z);
    const n = fbm(x / 48, z / 48, s, 3) + Math.max(0, 1 - d / 12) * 0.5;
    const { frost, heat } = this.climate(x, z);
    let h, bed = null, water = false, salt = false, shore = false, biome = 'meadow', lava = false, ice = false, boiling = false;

    if (cont < OCEAN) {
      // Sea: the bed drops away in steps, down to deep trenches far from land.
      water = salt = true;
      h = WATER_Y;
      bed = Math.max(-22, -0.7 - Math.floor((OCEAN - cont) * 330) * 0.5);
      biome = 'ocean';
      // the sea of the volcanic region boils: only a submarine survives it
      boiling = heat > 0.04;
      // the sea of the frozen region is one great sheet of ice, broken by the odd patch of open water
      if (frost > 0.1 && fbm(x / 34, z / 34, s + 61, 2) < 0.3) {
        water = salt = false;
        ice = true;
        bed = null;
        h = WATER_Y + 0.1;
        biome = 'winter';
      }
    } else {
      const coast = cont < OCEAN + 0.002;
      if (n < -0.3 && !coast) {
        if (frost > 0) {
          // frozen pond: solid ice to walk on
          ice = true;
          h = 0;
        } else if (heat > 0.45) {
          // in the heart of the volcanic region the hollows hold lava instead of water
          lava = true;
          h = 0;
        } else if (heat > 0) h = 0; // the ponds have dried up
        else {
          // freshwater pond, shallow enough to wade
          water = true;
          h = WATER_Y;
          bed = -0.9;
        }
      } else h = Math.min(2.5, Math.max(0, Math.floor((n + 0.3) * 5) * 0.5));
      shore = !water && !ice && !lava && frost <= 0 && heat <= 0 && (coast || n < -0.24);

      if (frost > 0) biome = 'winter';
      else if (heat > 0) biome = 'ash';
      else if (d > 14) {
        const j = (hash2(x, z, s + 7) - 0.5) * 0.05;
        const temp = fbm(x / 64 + 300, z / 64, s + 1, 2) + j;
        const wet = fbm(x / 64, z / 64 + 300, s + 2, 2) + j + this.type.wet;
        if (temp > 0.2) biome = 'sand';
        else if (wet > 0.18) biome = 'pine';
        else if (wet < -0.18) biome = 'blossom';
        else if (temp < -0.12) biome = 'autumn';
      }

      const inland = Math.min(1, Math.max(0, (cont - OCEAN - 0.002) / 0.05));
      // Mountains: broad ranges that climb very high, fading in away from the old start and the coast.
      const rise = this.mountainRise(x, z, cont);
      if (rise >= 0.5) {
        if (water) {
          water = false;
          bed = null;
          h = 0;
        }
        ice = lava = false;
        h = Math.min(56, h + rise);
        shore = false;
        // snow caps: only the highest peaks elsewhere, nearly everything in the frozen region, none in the heat
        biome = heat <= 0 && h >= (frost > 0 ? 5 : SNOW_LINE) ? 'snow' : 'mountain';
      }

      // Volcanoes: cones with a crater of lava at the top, found only in the volcanic region.
      const vol = coast || heat <= 0 ? null : this.volcanoAt(x, z);
      if (vol) {
        const { v, r } = vol;
        const cone = (q) => v.height * Math.pow(Math.max(0, 1 - q / v.radius), 1.5);
        const rough = 1 + 0.08 * fbm(x / 9, z / 9, s + 55, 2);
        // inside the rim the ground drops to a crater floor
        const top = r < 8 ? cone(8) - 3.5 : cone(r) * rough;
        const vh = Math.floor(top * inland * 2) / 2;
        if (vh > h) {
          h = vh;
          shore = false;
          lava = false;
        }
        if (r < v.radius * 0.85 && vh >= 1) biome = 'volcano';
        if (r < 6 && vh === h) lava = true;
      }
    }
    // bed: seabed height under water (null on land). salt: sea water, not drinkable.
    // lava: burns whoever stands in it. ice: frozen water, solid to walk on.
    // frost / heat: how deep this spot is in the frozen or the volcanic region (0 = outside).
    // boiling: scalding sea in the volcanic region.
    // The rugged country: rock raised into stacks, plateaus and mesas, with slabs that overhang,
    // arch over and roof caves. Never in the harsh regions, never on a mountain.
    // slabs: rock above open space, [[lo, hi], ...]. land: which rugged country this is.
    // path: part of a route up, kept clear.
    let slabs, land, path;
    if (frost <= 0 && heat <= 0 && !ice && !lava && biome !== 'mountain' && biome !== 'snow') {
      const form = this.forms.at(x, z, { h, water, salt, bed });
      if (form) {
        if (form.dry) {
          water = salt = shore = false;
          bed = null;
          if (biome === 'ocean') biome = 'meadow'; // rock that rises from the sea is grassed over
        }
        if (form.h !== undefined) h = form.h;
        if (form.bed !== undefined) bed = form.bed;
        if (form.shore) shore = true;
        if (form.biome) biome = form.biome;
        ({ slabs, land, path } = form);
      }
    }
    return { h, bed, water, salt, biome, shore, lava, ice, boiling, frost, heat, slabs, land, path, obj: undefined };
  }
  // Natural object on a tile, or null. The returned object is shared: do not mutate it.
  object(x, z) {
    const t = this.tile(x, z);
    if (t.obj !== undefined) return t.obj;
    if (t.settled) {
      // inside a settlement only what was planned stands; nothing grows wild
      const planned = this.settledCell(x, z)?.obj;
      t.obj = planned ? { ...planned } : null;
      return t.obj;
    }
    // a route up is kept clear from end to end
    if (t.path) {
      t.obj = null;
      return null;
    }
    let obj = null;
    if ((t.salt || !t.water) && !t.lava && !t.ice && !t.boiling && Math.hypot(x, z) > 2) {
      // the seabed has its own life, changing with depth
      const depth = t.salt ? WATER_Y - t.bed : 0;
      const table = t.salt ? (depth < 2 ? SEABED.shallow : depth < 4 ? SEABED.mid : SEABED.deep) : t.shore ? SHORE.spawn : BIOMES[t.biome].spawn;
      let r = hash2(x, z, this.seed + 11);
      const trees = this.type.trees;
      for (const [id, chance] of table) {
        const p = trees !== 1 && id.startsWith('tree_') ? chance * trees : chance;
        if (r < p) {
          obj = { t: id, v: (hash2(x, z, this.seed + 12) * 4) | 0 };
          break;
        }
        r -= p;
      }
    }
    // under rock there is no light to grow by
    if (obj && t.slabs && !t.water && !UNDER_ROCK.has(obj.t) && !obj.t.startsWith('rock_')) obj = null;
    t.obj = obj;
    return obj;
  }
}
