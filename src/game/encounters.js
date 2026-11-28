import { hash2 } from '../core/noise.js';
import { KEEPERS, KEEPER_BY_ID, carvingName } from './keepers.js';

const POWER = { stone: 3, copper: 5, iron: 7 };
const DISCOVERY = 20;
export const RESTORATION = 'Twelve hearths glow again. The long dusk lifts, and Emberglade is yours to tend.';

// What a keeper leaves behind: metal for the next tier, or the glass of its harsh region.
const SPOILS = {
  stone: [['copper_bar', 4, 4], ['coal', 4, 4]],
  copper: [['iron_bar', 3, 3], ['crystal', 1, 1]],
  iron: [['iron_bar', 4, 4], ['crystal', 3, 3], ['pearl', 2, 2]],
  frost: [['rimeglass', 8, 8], ['crystal', 3, 3]],
  heat: [['emberglass', 8, 8], ['crystal', 3, 3]],
};
export const rewardFor = (k) => SPOILS[k.biome] ?? SPOILS[k.tier];

export function suitsSite(k, tile) {
  if (tile.land) return false; // never on the stacks, plateaus and mesas, nor in the sea among them
  if (k.biome === 'deep') return tile.salt && tile.water && tile.bed <= -6 && !tile.boiling;
  if (tile.water || tile.lava || tile.ice || tile.shore) return false;
  if (k.biome === 'heat' || k.biome === 'frost') return tile[k.biome] > 0.3;
  return !tile.frost && !tile.heat && tile.biome === k.biome;
}

// Search a widening spiral around a seeded anchor. Each frame takes only a few samples.
function candidate(gen, k, index, n) {
  const polar = k.biome === 'frost' ? gen.frostCentre : k.biome === 'heat' ? gen.heatCentre : null;
  const angle = hash2(index, 31, gen.seed) * Math.PI * 2;
  const distance = polar ? 600 : 250 + 160 * index;
  const a = angle + n * 2.39996323;
  // Harsh regions have finite bounds. Continue sampling their interiors.
  const radius = polar ? 1850 * Math.sqrt(hash2(index, n, gen.seed + 73)) : 30 * Math.sqrt(n);
  return [Math.floor((polar?.x ?? 0) + Math.cos(angle) * distance + Math.cos(a) * radius),
    Math.floor((polar?.z ?? 0) + Math.sin(angle) * distance + Math.sin(a) * radius)];
}

const disc = (x, z, radius, inner = 0) => ({ x, z, radius, inner });
const bar = (x, z, angle, length, width) => ({ x, z, angle, length, width });

export function inWarning(p, w) {
  const dx = p.x - w.x, dz = p.z - w.z;
  if (w.radius) {
    const d = Math.hypot(dx, dz);
    return d <= w.radius && d >= w.inner;
  }
  return Math.abs(dx * Math.cos(w.angle) + dz * Math.sin(w.angle)) <= w.length / 2 &&
    Math.abs(-dx * Math.sin(w.angle) + dz * Math.cos(w.angle)) <= w.width / 2;
}

export function attackWarnings(b, p) {
  const { x, z, beat } = b, a = Math.atan2(p.z - z, p.x - x);
  const ray = (angle, length, width) => bar(x + Math.cos(angle) * length / 2, z + Math.sin(angle) * length / 2, angle, length, width);
  switch (b.spec.pattern) {
    case 'rush': return [ray(a, 7, 1.5)];
    case 'cluster': return [[0, 0], [1.7, 1], [-1.7, 1]].map(([dx, dz]) => disc(p.x + dx, p.z + dz, 1.25));
    case 'halo': return [disc(x, z, 4.1, 1.6)];
    case 'fan': return [-0.55, 0, 0.55].map(off => ray(a + off, 6, 0.85));
    case 'pincers': return [-1, 1].map(side => disc(p.x + side * 1.25 * Math.sin(a), p.z - side * 1.25 * Math.cos(a), 1.55));
    case 'cross': return [bar(x, z, beat * Math.PI / 4, 10, 1.2), bar(x, z, beat * Math.PI / 4 + Math.PI / 2, 10, 1.2)];
    case 'undertow': return [disc(x, z, beat % 2 ? 2.6 : 5.2, beat % 2 ? 0 : 2.6)];
    case 'lure': return [disc(p.x, p.z, 1.6), ray(a + Math.PI, 5, 1.7)];
    case 'shear': return [-2, 0, 2].map(off => bar(p.x + Math.cos(a) * off, p.z + Math.sin(a) * off, a + Math.PI / 2, 7, 0.85));
    case 'cleave': return [ray(a - 0.37, 4.5, 2.3), ray(a + 0.37, 4.5, 2.3)];
    case 'coil': return Array.from({ length: 5 }, (_, i) => disc(x + Math.cos(a + i * 1.2) * (1 + i * 0.5), z + Math.sin(a + i * 1.2) * (1 + i * 0.5), 1.3));
    case 'eruption': return beat % 2 ? [disc(p.x, p.z, 2.3), disc(x, z, 2)] : [disc(x, z, 5.5, 2), ray(a, 6, 1.1)];
  }
}

export class Encounters {
  constructor(saved = {}) {
    this.discovered = new Set((saved.discovered ?? []).filter(id => KEEPER_BY_ID[id]));
    this.restored = new Set((saved.restored ?? []).filter(id => KEEPER_BY_ID[id]));
    this.visits = new Set(saved.visits ?? []);
    this.sites = new Map();
    this.search = KEEPERS.map(() => 0);
    this.active = null;
    this.scanIn = 0;
  }

  toJSON() { return { discovered: [...this.discovered], restored: [...this.restored], visits: [...this.visits] }; }
  get complete() { return this.restored.size === KEEPERS.length; }

  locate(gen, budget = 4) {
    if (this.sites.size === KEEPERS.length) return;
    for (const [i, k] of KEEPERS.entries()) {
      if (this.sites.has(k.id)) continue;
      for (let j = 0; j < budget; j++) {
        const [x, z] = candidate(gen, k, i, this.search[i]++);
        const tile = gen.tile(x, z);
        if (!suitsSite(k, tile) || gen.object(x, z)) continue;
        const y = tile.water ? tile.bed : tile.h;
        this.sites.set(k.id, { x: x + 0.5, z: z + 0.5, y });
        break;
      }
    }
  }

  visit(game, key) {
    if (this.visits.has(key)) return;
    this.visits.add(key);
    game.record(key);
  }

  step(game, dt) {
    this.locate(game.gen);
    const p = game.player;
    if (this.active && Math.hypot(p.x - this.active.x, p.z - this.active.z) > DISCOVERY + 4) this.active = null;
    this.scanIn -= dt;
    if (this.scanIn <= 0) {
      this.scanIn = 0.4;
      const tile = game.gen.tile(Math.floor(p.x), Math.floor(p.z));
      if (tile.frost > 0.3) this.visit(game, 'visit:frost');
      if (tile.heat > 0.3) this.visit(game, 'visit:heat');
      if (game.gliding) this.visit(game, 'travel:glide');
      for (const [id, site] of this.sites) {
        if (Math.hypot(site.x - p.x, site.z - p.z) > DISCOVERY) continue;
        const spec = KEEPER_BY_ID[id];
        if (!this.discovered.has(id)) {
          this.discovered.add(id);
          game.toast(spec.site + ' discovered. Marked on your world map.');
          game.record('keeper:found');
        }
        if (!this.active && !this.restored.has(id)) {
          this.active = { ...site, spec, hp: spec.hp, beat: 0, timer: 1.4, warnings: [], engaged: false, hit: 0 };
        }
      }
    }
    const b = this.active;
    if (!b) return;
    b.hit = Math.max(0, b.hit - dt);
    if (!b.engaged) return;
    b.timer -= dt;
    if (b.timer > 0) return;
    if (!b.warnings.length) {
      b.warnings = attackWarnings(b, p);
      b.timer = 1.05;
      return;
    }
    const hit = Math.abs(p.y - b.y) <= 2.5 && b.warnings.some(w => inWarning(p, w));
    b.warnings = [];
    b.beat++;
    b.timer = b.hp < b.spec.hp / 2 ? 0.75 : 1.35;
    if (hit) game.hurt(b.spec.tier === 'iron' ? 3 : 2, b);
  }

  strike(game, b) {
    if (b !== this.active || Math.hypot(b.x - game.player.x, b.z - game.player.z) > 2.8 || Math.abs(b.y - game.player.y) > 2.2) return false;
    const k = b.spec;
    const hasGear = !k.gear || game.armor.slots.some(s => s?.id === k.gear);
    if (game.attackPower < POWER[k.tier] || !hasGear) {
      if (!b.warned) game.toast('To wake ' + k.name + ', bring ' + gearHint(k) + '.');
      b.warned = true;
      return false;
    }
    game.emit('swing', { x: b.x - 0.5, z: b.z - 0.5 });
    b.engaged = true;
    b.hp -= game.attackPower * (game.progress.has('giant_slayer') ? 1.3 : 1);
    b.hit = 0.25;
    game.wearTool();
    if (b.hp <= 0) {
      this.restored.add(k.id);
      b.hp = 0;
      this.active = null;
      game.record('keeper:restore');
      game.toast(k.site + ' restored. Workbench recipe learned: ' + carvingName(k) + '.');
      game.giveDrops(rewardFor(k));
      if (this.complete) game.emit('restored');
    }
    return true;
  }
}

export function gearHint(k) {
  const extra = { diving_mask: 'a worn diving mask', fur_coat: 'a worn fur coat', heat_suit: 'a worn crystal suit' };
  return 'a ' + k.tier + ' sword or better' + (k.gear ? ' and ' + extra[k.gear] : '');
}
