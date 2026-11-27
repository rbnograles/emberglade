import { fbm, hash2 } from '../core/noise.js';
import { BIOMES, SHORE } from './biomes.js';

export const WATER_Y = -0.3;

// Deterministic description of every tile: height, water, biome and natural object.
export class Worldgen {
  constructor(seed) {
    this.seed = seed | 0;
    this.cache = new Map();
  }

  tile(x, z) {
    const k = (x + 32768) * 65536 + (z + 32768);
    let t = this.cache.get(k);
    if (t) return t;
    const s = this.seed;
    const d = Math.hypot(x, z);
    // The start area is lifted so it is never under water.
    const n = fbm(x / 48, z / 48, s, 3) + Math.max(0, 1 - d / 12) * 0.5;
    const water = n < -0.3;
    const h = water ? WATER_Y : Math.min(2.5, Math.floor((n + 0.3) * 5) * 0.5);
    let biome = 'meadow';
    if (d > 14) {
      const j = (hash2(x, z, s + 7) - 0.5) * 0.05;
      const temp = fbm(x / 64 + 300, z / 64, s + 1, 2) + j;
      const wet = fbm(x / 64, z / 64 + 300, s + 2, 2) + j;
      if (temp > 0.2) biome = 'sand';
      else if (wet > 0.18) biome = 'pine';
      else if (wet < -0.18) biome = 'blossom';
      else if (temp < -0.12) biome = 'autumn';
    }
    t = { h, water, biome, shore: !water && n < -0.24, obj: undefined };
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
