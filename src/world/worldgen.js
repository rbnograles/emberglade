import { fbm, hash2 } from '../core/noise.js';
import { BIOMES, SHORE } from './biomes.js';

export const WATER_Y = -0.3;
export const SWIM_DEPTH = 0.8; // water deeper than this (surface to bed) is swum, shallower is waded
const OCEAN = -0.16; // continent noise below this is sea
const MOUNTAIN = 0.2; // range noise above this is mountain
const SNOW_LINE = 9; // mountains this high are snow-capped

// Deterministic description of every tile: height, water, biome and natural object.
export class Worldgen {
  constructor(seed) {
    this.seed = seed | 0;
    this.cache = new Map();
  }

  tile(x, z) {
    // one number per tile; good for about 33 million tiles in every direction
    const k = (x + 33554432) * 67108864 + (z + 33554432);
    let t = this.cache.get(k);
    if (t) return t;
    const s = this.seed;
    const d = Math.hypot(x, z);
    // Three scales of shape: continents and oceans, mountain ranges, and local bumps with ponds.
    // The start area is lifted so it is always on dry, gentle land.
    const cont = fbm(x / 240, z / 240, s + 20, 3) + Math.max(0, 1 - d / 60) * 0.5;
    const n = fbm(x / 48, z / 48, s, 3) + Math.max(0, 1 - d / 12) * 0.5;
    let h, bed = null, water = false, salt = false, shore = false, biome = 'meadow';

    if (cont < OCEAN) {
      // Sea: the bed drops away in steps the further the continent noise falls below the coastline.
      water = salt = true;
      h = WATER_Y;
      bed = Math.max(-8, -0.7 - Math.floor((OCEAN - cont) * 36) * 0.5);
      biome = 'ocean';
    } else {
      const coast = cont < OCEAN + 0.05;
      if (n < -0.3 && !coast) {
        // freshwater pond, shallow enough to wade
        water = true;
        h = WATER_Y;
        bed = -0.9;
      } else h = Math.min(2.5, Math.max(0, Math.floor((n + 0.3) * 5) * 0.5));
      shore = !water && (coast || n < -0.24);

      if (d > 14) {
        const j = (hash2(x, z, s + 7) - 0.5) * 0.05;
        const temp = fbm(x / 64 + 300, z / 64, s + 1, 2) + j;
        const wet = fbm(x / 64, z / 64 + 300, s + 2, 2) + j;
        if (temp > 0.2) biome = 'sand';
        else if (wet > 0.18) biome = 'pine';
        else if (wet < -0.18) biome = 'blossom';
        else if (temp < -0.12) biome = 'autumn';
      }

      // Mountains rise where the range noise is high, fading in away from the start and the coast.
      const range = fbm(x / 150, z / 150, s + 30, 3);
      if (range > MOUNTAIN && !coast) {
        const fade = Math.min(1, Math.max(0, (d - 40) / 40)) * Math.min(1, (cont - OCEAN - 0.05) / 0.08);
        const rough = 0.8 + 0.2 * fbm(x / 14, z / 14, s + 31, 2);
        const rise = Math.floor((range - MOUNTAIN) * 38 * rough * fade * 2) / 2;
        if (rise >= 0.5) {
          if (water) {
            water = false;
            bed = null;
            h = 0;
          }
          h = Math.min(18, h + rise);
          shore = false;
          biome = h >= SNOW_LINE ? 'snow' : 'mountain';
        }
      }
    }
    // bed: seabed height under water (null on land). salt: sea water, not drinkable.
    t = { h, bed, water, salt, biome, shore, obj: undefined };
    if (this.cache.size > 200000) this.cache.clear();
    this.cache.set(k, t);
    return t;
  }

  // Natural object on a tile, or null. The returned object is shared: do not mutate it.
  object(x, z) {
    const t = this.tile(x, z);
    if (t.obj !== undefined) return t.obj;
    let obj = null;
    if (!t.water && Math.hypot(x, z) > 2) {
      const table = t.shore ? SHORE.spawn : BIOMES[t.biome].spawn;
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
