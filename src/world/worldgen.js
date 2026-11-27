import { fbm, hash2 } from '../core/noise.js';
import { BIOMES, SHORE, SEABED } from './biomes.js';

export const WATER_Y = -0.3;
export const SWIM_DEPTH = 0.8; // water deeper than this (surface to bed) is swum, shallower is waded
const OCEAN = -0.05; // continent noise below this is sea: a little under half the world
const MOUNTAIN = 0.16; // range noise above this is mountain
const SNOW_LINE = 18; // mountains this high are snow-capped (lower in the frozen north)
const WINTER = -0.2; // climate noise below this is the frozen wastes
const VOLCANO_CELL = 640; // one possible volcano per square of this many tiles

// Deterministic description of every tile: height, water, biome and natural object.
export class Worldgen {
  constructor(seed) {
    this.seed = seed | 0;
    this.cache = new Map();
    this.volcanoes = new Map(); // grid cell -> volcano or null
  }

  continent(x, z) {
    return fbm(x / 520, z / 520, this.seed + 20, 4) + Math.max(0, 1 - Math.hypot(x, z) / 60) * 0.5;
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
          if (hash2(cx, cz, s + 50) < 0.5) {
            const vx = Math.round((cx + 0.2 + hash2(cx, cz, s + 51) * 0.6) * VOLCANO_CELL);
            const vz = Math.round((cz + 0.2 + hash2(cx, cz, s + 52) * 0.6) * VOLCANO_CELL);
            // only on solid land, and well away from the old starting point
            if (this.continent(vx, vz) > OCEAN + 0.1 && Math.hypot(vx, vz) > 220) {
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
    const s = this.seed;
    const d = Math.hypot(x, z);
    // Shapes at several scales: continents and vast oceans, mountain ranges, climate, and local bumps with ponds.
    // The old start area at the origin is lifted so it is always dry, gentle land.
    const cont = this.continent(x, z);
    const n = fbm(x / 48, z / 48, s, 3) + Math.max(0, 1 - d / 12) * 0.5;
    let h, bed = null, water = false, salt = false, shore = false, biome = 'meadow', lava = false, ice = false;

    if (cont < OCEAN) {
      // Sea: the bed drops away in steps, down to deep trenches far from land.
      water = salt = true;
      h = WATER_Y;
      bed = Math.max(-22, -0.7 - Math.floor((OCEAN - cont) * 60) * 0.5);
      biome = 'ocean';
    } else {
      const coast = cont < OCEAN + 0.035;
      const winter = d > 60 && fbm(x / 700 + 50, z / 700, s + 40, 2) + (hash2(x, z, s + 41) - 0.5) * 0.03 < WINTER;
      if (n < -0.3 && !coast) {
        if (winter) {
          // frozen pond: solid ice to walk on
          ice = true;
          h = 0;
        } else {
          // freshwater pond, shallow enough to wade
          water = true;
          h = WATER_Y;
          bed = -0.9;
        }
      } else h = Math.min(2.5, Math.max(0, Math.floor((n + 0.3) * 5) * 0.5));
      shore = !water && !ice && !winter && (coast || n < -0.24);

      if (winter) biome = 'winter';
      else if (d > 14) {
        const j = (hash2(x, z, s + 7) - 0.5) * 0.05;
        const temp = fbm(x / 64 + 300, z / 64, s + 1, 2) + j;
        const wet = fbm(x / 64, z / 64 + 300, s + 2, 2) + j;
        if (temp > 0.2) biome = 'sand';
        else if (wet > 0.18) biome = 'pine';
        else if (wet < -0.18) biome = 'blossom';
        else if (temp < -0.12) biome = 'autumn';
      }

      // Mountains: broad ranges that climb very high, fading in away from the old start and the coast.
      const range = fbm(x / 300, z / 300, s + 30, 4);
      const inland = Math.min(1, (cont - OCEAN - 0.035) / 0.1);
      if (range > MOUNTAIN && !coast) {
        const fade = Math.min(1, Math.max(0, (d - 40) / 40)) * inland;
        const rough = 0.8 + 0.2 * fbm(x / 14, z / 14, s + 31, 2);
        const rise = Math.floor((range - MOUNTAIN) * 125 * rough * fade * 2) / 2;
        if (rise >= 0.5) {
          if (water) {
            water = false;
            bed = null;
            h = 0;
          }
          ice = false;
          h = Math.min(56, h + rise);
          shore = false;
          biome = h >= (winter ? 6 : SNOW_LINE) ? 'snow' : 'mountain';
        }
      }

      // Volcanoes: lone cones with a crater of lava at the top.
      const vol = coast ? null : this.volcanoAt(x, z);
      if (vol) {
        const { v, r } = vol;
        const cone = (q) => v.height * Math.pow(Math.max(0, 1 - q / v.radius), 1.5);
        const rough = 1 + 0.08 * fbm(x / 9, z / 9, s + 55, 2);
        // inside the rim the ground drops to a crater floor
        const top = r < 8 ? cone(8) - 3.5 : cone(r) * rough;
        const vh = Math.floor(top * inland * 2) / 2;
        if (vh > h) {
          if (water) {
            water = false;
            bed = null;
          }
          ice = false;
          h = vh;
          shore = false;
        }
        if (r < v.radius * 0.85 && vh >= 1) biome = 'volcano';
        if (r < 6 && vh === h) lava = true;
      }
    }
    // bed: seabed height under water (null on land). salt: sea water, not drinkable.
    // lava: burns whoever stands in it. ice: a frozen pond, solid to walk on.
    t = { h, bed, water, salt, biome, shore, lava, ice, obj: undefined };
    if (this.cache.size > 200000) this.cache.clear();
    this.cache.set(k, t);
    return t;
  }
  // Natural object on a tile, or null. The returned object is shared: do not mutate it.
  object(x, z) {
    const t = this.tile(x, z);
    if (t.obj !== undefined) return t.obj;
    let obj = null;
    if ((t.salt || !t.water) && !t.lava && !t.ice && Math.hypot(x, z) > 2) {
      // the seabed has its own life, changing with depth
      const depth = t.salt ? WATER_Y - t.bed : 0;
      const table = t.salt ? (depth < 2 ? SEABED.shallow : depth < 4 ? SEABED.mid : SEABED.deep) : t.shore ? SHORE.spawn : BIOMES[t.biome].spawn;
      let r = hash2(x, z, this.seed + 11);
      for (const [id, p] of table) {
        if (r < p) {
          obj = { t: id, v: (hash2(x, z, this.seed + 12) * 4) | 0 };
          break;
        }
        r -= p;
      }
    }
    t.obj = obj;
    return obj;
  }
}
