import { fbm, hash2 } from '../core/noise.js';
import { HEADROOM } from './columns.js';

const TAU = Math.PI * 2;
const half = (v) => Math.round(v * 2) / 2;
const floorHalf = (v) => Math.floor(v * 2) / 2;
const RAMP = 0.4; // height a route gains for each tile of its length: always less than one half-tile step
const TRAIL = 3; // width of a route, in tiles
const LANDING = 5; // level tiles at the top of a route
const RIM = 10; // how far in from a route the rock is left whole
const SKIRT = 6; // tiles around a landform that still count as its country

// One possible landform per square of `cell` tiles, so two of a kind never overlap.
//   r, h       smallest and largest radius and height
//   amp, grain how ragged the outline is, and at what scale
//   lip        widest overhang at the top of the cliff, in tiles
//   apron      beach and shallows laid around the foot, in tiles
// Listed largest first: a tile takes the name of the largest landform that reaches it.
export const LAYERS = [
  { id: 'mesa', land: 'canyon', cell: 500, chance: 0.85, r: [110, 200], h: [30, 50], amp: 0.12, grain: 60, lip: 3, apron: 0, ramp: true, salt: 400 },
  { id: 'plateau', land: 'table', cell: 380, chance: 0.8, r: [40, 150], h: [8, 25], amp: 0.2, grain: 26, lip: 2, apron: 0, ramp: true, tiers: true, salt: 420 },
  { id: 'island', land: 'stacks', cell: 170, chance: 0.65, r: [20, 30], h: [14, 35], amp: 0.14, grain: 16, lip: 3, apron: 12, ramp: true, salt: 440 },
  { id: 'stack', land: 'stacks', cell: 44, chance: 0.6, r: [3, 11], h: [12, 35], amp: 0.22, grain: 6, lip: 3, apron: 0, ramp: false, salt: 460 },
];
const STACK = LAYERS[3];
const PILLAR_CELL = 36, BRIDGE_CELL = 90;

// Tidy the rock above one tile so it obeys the rules: sorted, never touching, and with HEADROOM
// under every slab. Rock too close to the ground joins it. -> { h, slabs } (slabs undefined if none)
export function settle(h, slabs, water) {
  const sorted = slabs.filter(([lo, hi]) => hi - lo >= 0.5).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [lo, hi] of sorted) {
    const last = out[out.length - 1];
    if (last && lo - last[1] < HEADROOM) last[1] = Math.max(last[1], hi);
    else out.push([lo, hi]);
  }
  while (out.length) {
    const [lo, hi] = out[0];
    if (water) {
      // over water the gap is measured from the surface; rock never fills the sea in
      if (lo >= HEADROOM) break;
      if (hi - HEADROOM >= 0.5) { out[0][0] = HEADROOM; break; }
      out.shift();
    } else {
      if (lo >= h + HEADROOM) break;
      if (hi > h) h = hi;
      out.shift();
    }
  }
  return { h, slabs: out.length ? out : undefined };
}

// The stacks, islands, plateaus and canyon mesas of a world, worked out from the seed alone.
// world: { seed, sea, rugged, continent(x, z), plain(x, z) }
//   sea       land noise below this is sea (from the world type)
//   rugged    how common the new country is, 1 for the usual
//   plain     true where nothing else has shaped the land: no mountain, no frost, no heat
export class Landforms {
  constructor(world) {
    this.world = world;
    this.cache = new Map();
  }

  remember(key, make) {
    let v = this.cache.get(key);
    if (v === undefined) {
      if (this.cache.size > 20000) this.cache.clear();
      this.cache.set(key, (v = make()));
    }
    return v;
  }

  // The landform of one layer in one square of its grid, or null.
  feature(layer, cx, cz) {
    return this.remember(layer.id + ':' + cx + ',' + cz, () => this.plan(layer, cx, cz));
  }

  plan(layer, cx, cz) {
    const s = this.world.seed + layer.salt;
    const roll = (n) => hash2(cx, cz, s + n);
    if (roll(0) >= layer.chance) return null;
    const r = layer.r[0] + (layer.r[1] - layer.r[0]) * (layer.id === 'stack' ? roll(1) ** 2 : roll(1));
    const reach = r * (1 + layer.amp) + layer.lip + 1 + layer.apron;
    const room = layer.cell / 2 - reach;
    const x = Math.round((cx + 0.5) * layer.cell + room * (roll(2) * 2 - 1));
    const z = Math.round((cz + 0.5) * layer.cell + room * (roll(3) * 2 - 1));
    if (Math.hypot(x, z) - reach - SKIRT < 200) return null; // the heart of the world stays gentle
    if (!this.suits(layer, x, z, r)) return null;
    // never touching a larger landform: each keeps its own cliffs and its own way up
    for (const big of LAYERS.slice(0, LAYERS.indexOf(layer))) {
      const span = reach + big.cell / 2;
      for (let bz = Math.floor((z - span) / big.cell); bz <= Math.floor((z + span) / big.cell); bz++) {
        for (let bx = Math.floor((x - span) / big.cell); bx <= Math.floor((x + span) / big.cell); bx++) {
          const b = this.feature(big, bx, bz);
          if (b && Math.hypot(b.x - x, b.z - z) < b.reach + reach + SKIRT) return null;
        }
      }
    }
    let h = half(layer.h[0] + (layer.h[1] - layer.h[0]) * roll(4));
    // a route may wind at most four fifths of the way round: small islands cannot be very tall
    if (layer.ramp) h = Math.min(h, floorHalf(0.8 * TAU * RAMP * (r * (1 - layer.amp) - TRAIL - 1)));
    const count = layer.tiers ? Math.max(1, Math.min(r >= 60 ? 3 : 2, Math.floor(h / 4), 1 + Math.floor(roll(5) * 3))) : 1;
    const tiers = [];
    let a0 = roll(6) * TAU;
    for (let i = 0; i < count; i++) {
      const tr = r * 0.62 ** i, rho = tr * (1 - layer.amp) - TRAIL - 1;
      const lo = half((h * i) / count), hi = half((h * (i + 1)) / count);
      const span = (hi - lo) / RAMP / rho;
      tiers.push({ r: tr, lo, hi, rho, a0, span });
      a0 += span + (TAU - span) / 2; // the way up the next tier starts on the far side
    }
    return { layer, x, z, r, h, reach, tiers, cx, cz };
  }

  // Is this the right kind of place for a landform of this layer?
  suits(layer, x, z, r) {
    const { seed: s, sea, rugged, continent, plain } = this.world;
    const ease = 0.12 * (rugged - 1);
    if (layer.land === 'stacks') {
      // off the coast or right on it, along chosen stretches of shore
      if (fbm(x / 800, z / 800, s + 72, 2) < 0.02 - ease) return false;
      const c = continent(x, z);
      return c > sea - 0.03 && c < sea + 0.003 && plain(x, z);
    }
    // canyon country and tableland each have their own stretches; where both would be, it is canyon
    const canyon = fbm(x / 1300, z / 1300, s + 71, 2) > 0.04 - ease;
    if (layer.id === 'mesa' ? !canyon : canyon || fbm(x / 1300, z / 1300, s + 70, 2) < 0.04 - ease) return false;
    // wholly on land that nothing else has shaped
    const edge = r * (1 + layer.amp);
    for (let k = 0; k < 16; k++) {
      const a = (k / 8) * Math.PI * 2, d = k < 8 ? edge : edge * 0.5;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (continent(px, pz) <= sea + 0.004 || !plain(px, pz)) return false;
    }
    return continent(x, z) > sea + 0.004 && plain(x, z);
  }

  // The canyon cut through a mesa at this spot: 0 on the canyon floor, 1 to 3 on the terraces of
  // its walls, 4 on the uncut top.
  canyon(x, z) {
    const s = this.world.seed;
    const a = Math.abs(fbm(x / 130, z / 130, s + 81, 2));
    const w = 0.03 + 0.03 * (0.5 + 0.5 * fbm(x / 400, z / 400, s + 82, 1));
    return a < w ? 0 : Math.min(4, 1 + Math.floor((a - w) / 0.02));
  }

  // A rock pillar standing on a canyon floor, or null: one possible per small square.
  pillar(f, cx, cz) {
    return this.remember('pillar:' + cx + ',' + cz, () => {
      const s = this.world.seed + 480;
      if (hash2(cx, cz, s) > 0.5) return null;
      const x = cx * PILLAR_CELL + 8 + Math.floor(hash2(cx, cz, s + 1) * (PILLAR_CELL - 16));
      const z = cz * PILLAR_CELL + 8 + Math.floor(hash2(cx, cz, s + 2) * (PILLAR_CELL - 16));
      if (this.canyon(x, z) !== 0) return null;
      return { x, z, neck: 2 + hash2(cx, cz, s + 3) * 1.5, h: half(f.h * (0.45 + 0.3 * hash2(cx, cz, s + 4))) };
    });
  }

  // A natural bridge across a canyon, or null: one possible per square.
  bridge(f, cx, cz) {
    return this.remember('bridge:' + cx + ',' + cz, () => {
      const s = this.world.seed + 490;
      if (hash2(cx, cz, s) > 0.9) return null;
      const x = cx * BRIDGE_CELL + 30 + Math.floor(hash2(cx, cz, s + 1) * (BRIDGE_CELL - 60));
      const z = cz * BRIDGE_CELL + 30 + Math.floor(hash2(cx, cz, s + 2) * (BRIDGE_CELL - 60));
      if (this.canyon(x, z) !== 0) return null;
      // it runs straight across: along the steepest way out of the canyon
      const n = (px, pz) => Math.abs(fbm(px / 130, pz / 130, this.world.seed + 81, 2));
      const gx = n(x + 3, z) - n(x - 3, z), gz = n(x, z + 3) - n(x, z - 3), g = Math.hypot(gx, gz);
      if (g < 1e-4) return null;
      return { x, z, dx: gx / g, dz: gz / g, len: 28, top: half(f.h / 2) };
    });
  }

  // A sea arch from the stack in one square to the stack in the next (axis 0: +x, 1: +z), or null.
  arch(cx, cz, axis) {
    return this.remember('arch:' + cx + ',' + cz + ',' + axis, () => {
      const a = this.feature(STACK, cx, cz), b = this.feature(STACK, cx + (axis ? 0 : 1), cz + (axis ? 1 : 0));
      if (!a || !b || hash2(cx, cz, this.world.seed + 470 + axis) > 0.7) return null;
      const span = Math.hypot(b.x - a.x, b.z - a.z), gap = span - a.r - b.r;
      if (gap < 5 || gap > 30) return null;
      return { x: a.x, z: a.z, dx: (b.x - a.x) / span, dz: (b.z - a.z) / span, from: a.r * 0.5, to: span - b.r * 0.5, top: Math.min(a.h, b.h) };
    });
  }

  // Every landform whose middle is within `radius` tiles of a spot, nearest first.
  near(x, z, radius) {
    const out = [];
    for (const layer of LAYERS) {
      for (let cz = Math.floor((z - radius) / layer.cell); cz <= Math.floor((z + radius) / layer.cell); cz++) {
        for (let cx = Math.floor((x - radius) / layer.cell); cx <= Math.floor((x + radius) / layer.cell); cx++) {
          const f = this.feature(layer, cx, cz);
          if (f && Math.hypot(f.x - x, f.z - z) <= radius) out.push(f);
        }
      }
    }
    return out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  }

  // How the landforms reshape one tile, or null where there are none.
  // base: the tile before them: { h, water, salt, bed }
  // -> { land, h, slabs, dry, bed, shore, biome, path }; only the fields that change are set
  at(x, z, base) {
    let land = null, rock = 0, path = null, beach = false, shallow = false, biome = null;
    const slabs = [];
    for (const layer of LAYERS) {
      const f = this.feature(layer, Math.floor(x / layer.cell), Math.floor(z / layer.cell));
      if (!f) continue;
      const dx = x - f.x, dz = z - f.z, dist = Math.hypot(dx, dz);
      if (dist > f.reach + SKIRT) continue;
      land ??= layer.land;
      const s = this.world.seed + layer.salt;
      const rag = Math.max(-1, Math.min(1, fbm(x / layer.grain, z / layer.grain, s + 10, 3) * 1.6));
      const scale = 1 + layer.amp * rag;
      // the routes up: a level cut in from outside, then a trail winding up just inside the edge
      let whole = false;
      if (layer.ramp) {
        for (const t of f.tiers) {
          const c = Math.cos(t.a0), sn = Math.sin(t.a0);
          const along = dx * c + dz * sn, across = Math.abs(dz * c - dx * sn);
          if (across <= TRAIL / 2 && along >= t.rho && along <= t.r * (1 + layer.amp) + layer.lip + 1) path = Math.max(path ?? 0, t.lo);
          if (dist < t.rho - RIM || dist >= t.r * (1 + layer.amp)) continue;
          const rel = (((Math.atan2(dz, dx) - t.a0) % TAU) + TAU) % TAU;
          // the trail ends on a short landing at the top, and the rim beside it is never cut by a canyon
          if (dist >= t.rho && dist < t.rho + TRAIL && rel <= t.span + LANDING / t.rho) {
            path = Math.max(path ?? 0, t.lo + Math.min(t.hi - t.lo, floorHalf(RAMP * rel * t.rho + 1e-6)));
          }
          if (rel <= t.span + 0.3 || rel >= TAU - 0.1) whole = true;
        }
      }
      let top = 0;
      for (let i = f.tiers.length - 1; i >= 0 && !top; i--) if (dist < f.tiers[i].r * scale) top = f.tiers[i].hi;
      const out = dist - f.r * scale; // tiles beyond the foot of the cliff (negative inside)
      if (layer.id === 'mesa' && out < SKIRT) biome = 'canyon';
      if (!top) {
        // the top juts out past the foot in places, thinning toward its lip
        const n = fbm(x / 9, z / 9, s + 15, 2);
        const wide = n > 0 ? Math.min(layer.lip, 1 + Math.floor(n * 8)) : 0;
        if (out < wide) slabs.push([f.tiers[0].hi - Math.max(1, 2 + wide - 1.5 * Math.floor(out)), f.tiers[0].hi]);
        if (layer.apron && out < layer.apron / 2) beach = true;
        else if (layer.apron && out < layer.apron) shallow = true;
        continue;
      }
      if (layer.id === 'stack' && base.salt && out > -1.2 && top >= 5) {
        // the sea has eaten a notch into the foot of the stack
        slabs.push([HEADROOM, top]);
        continue;
      }
      if (layer.id === 'mesa') {
        if (!whole) top = Math.min(top, half((f.h * this.canyon(x, z)) / 4));
        const p = this.pillar(f, Math.floor(x / PILLAR_CELL), Math.floor(z / PILLAR_CELL));
        if (p) {
          const d = Math.hypot(x - p.x, z - p.z);
          if (d < p.neck) top = Math.max(top, p.h);
          else if (d < p.neck + 2.2) slabs.push([p.h - 3 + Math.floor(d - p.neck), p.h]);
        }
        const b = this.bridge(f, Math.floor(x / BRIDGE_CELL), Math.floor(z / BRIDGE_CELL));
        if (b) {
          const along = (x - b.x) * b.dx + (z - b.z) * b.dz, across = Math.abs((z - b.z) * b.dx - (x - b.x) * b.dz);
          if (Math.abs(along) <= b.len && across <= TRAIL / 2) slabs.push([b.top - 2 - half(2 * (along / b.len) ** 2), b.top]);
        }
      }
      rock = Math.max(rock, top);
    }
    // sea arches between neighbouring stacks
    const cx = Math.floor(x / STACK.cell), cz = Math.floor(z / STACK.cell);
    for (const [ax, az, axis] of [[cx, cz, 0], [cx, cz, 1], [cx - 1, cz, 0], [cx, cz - 1, 1]]) {
      const a = this.arch(ax, az, axis);
      if (!a) continue;
      const along = (x - a.x) * a.dx + (z - a.z) * a.dz, across = Math.abs((z - a.z) * a.dx - (x - a.x) * a.dz);
      if (along < a.from || along > a.to || across > TRAIL / 2) continue;
      const u = (along - (a.from + a.to) / 2) / ((a.to - a.from) / 2);
      slabs.push([half(a.top - 2 - (a.top - 2 - HEADROOM) * u * u), a.top]);
      land ??= 'stacks';
    }
    if (!land) return null;
    const ground = base.water ? 0 : base.h;
    // a route is kept clear of everything: no rock over it, nothing growing on it
    if (path !== null) return path > 0 ? { land, path: true, dry: true, h: Math.max(ground, path), biome } : { land, path: true, biome };
    if (rock > 0) {
      // caves: winding passages at ground level through any rock tall enough to hold them
      const s = this.world.seed;
      const vein = Math.abs(fbm(x / 45, z / 45, s + 85, 2));
      if (vein < 0.03 && fbm(x / 260, z / 260, s + 86, 2) > 0) {
        const roof = ground + 3 + half(2 * (1 - vein / 0.03));
        if (rock >= roof + 2) return { land, biome, ...settle(base.h, [...slabs, [roof, rock]], base.water) };
      }
      return { land, biome, dry: true, ...settle(rock, slabs, false) };
    }
    if (base.water && beach) return { land, biome, dry: true, shore: true, ...settle(0, slabs, false) };
    const out = { land, biome, ...settle(base.h, slabs, base.water) };
    if (base.water && shallow) out.bed = Math.max(base.bed, -0.9);
    return out;
  }
}
