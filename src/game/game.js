import { Encounters } from './encounters.js';
import { Progress, xpFor } from './progress.js';
import { DIFFICULTIES } from './survival.js';
import { Wildlife } from './wildlife.js';
import { Worldgen, WATER_Y, SWIM_DEPTH } from '../world/worldgen.js';
import { hash2 } from '../core/noise.js';
import { WorldState } from '../world/worldstate.js';
import { cropFor } from '../world/crops.js';
import { OBJECTS } from '../world/objects.js';
import { ITEMS, stackSize, ARMOR_SLOTS, MAX_DEFENSE, BASE_STORAGE, FLASK_DRINKS } from './items.js';
import { Inventory } from './inventory.js';
import { matchRecipe, ingredients, layout, GRID } from './crafting.js';
import { Goals } from './goals.js';
import { tickSurvival, tickStamina, eat, drink, MAX_HEALTH, MAX_HUNGER, MAX_THIRST, MAX_STAMINA } from './survival.js';

export const DAY_SECONDS = 480;
const GEN_VERSION = 5; // bump when world generation changes shape, so old saves are moved to safe ground
export const REACH = 3.5;
export const CAN_CAPACITY = 10;
export const HOTBAR = 9;
export const CHEST_SLOTS = 18;
const STEP_LIP = 0.15; // height the player can walk up without jumping
const JUMP_SPEED = 6.2; // about 0.95 units high: clears a 0.5 step comfortably
const GRAVITY = 20;
const GLIDE_FALL = 1.2; // units per second a glider sinks
const FLOAT_SINK = 0.95; // how far below the surface a swimmer's feet hang
const BANK_LIP = 1.45; // bank height you can climb out of the water onto
const DIVE_SPEED = 2.6, RISE_SPEED = 3, BUOYANCY = 0.7; // vertical speeds under water
// float: hull height relative to the water surface. seat: where the rider sits relative to the hull.
export const VEHICLES = {
  trail_cart: { speed: 8, land: true, seat: 0.45 },
  boat: { speed: 6.2, dive: false, float: -0.2, seat: 0.25 },
  submarine: { speed: 5, dive: true, float: -0.75, seat: 0 },
};
export const MAX_BREATH = 10;
const BREATH_SECONDS = 26; // seconds of air on a full breath
const SUFFOCATE_SECONDS = 1.2; // seconds per heart lost once the air is gone
const SWIM_SECONDS = 30; // seconds of swimming on full energy before you start to drown
const DROWN_SECONDS = 1.6; // seconds per heart lost once out of energy in deep water
// brutes are bigger, slower and hit harder; they start turning up from day 4
export const ENEMY_KINDS = {
  frostprowler: { hp: 12, speed: 3.2, damage: 1.5, size: 1.1, mountain: true, loot: 'rimeglass' },
  kilncrab: { hp: 16, speed: 1.8, damage: 2, size: 1.15, mountain: true, ranged: true, loot: 'emberglass' },
  gloomling: { hp: 6, speed: 2.5, damage: 1.5, size: 1 },
  brute: { hp: 14, speed: 1.9, damage: 2.5, size: 1.6 },
  // sea: lives in deep water at any hour and hunts swimmers
  snapper: { hp: 9, speed: 2.9, damage: 1.5, size: 1, sea: true },
  // golems guard the mountains by day and night: slow, tough, and they hit hard
  golem: { hp: 22, speed: 1.5, damage: 3, size: 1, mountain: true },
  // spitters keep their distance and lob glowing spit
  spitter: { hp: 5, speed: 2.2, damage: 1.2, size: 0.85, ranged: true },
};
const FIRE_SAFE = 4; // creatures keep this far from a campfire
const EXPOSURE_SECONDS = 3; // seconds per heart lost for each missing piece of gear in a harsh region
const COLD_HUNGER = 1; // extra hunger drain when cold with no armor (x2 in total)

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

export const MARKER_COLORS = ['#ff5a7a', '#4fd0ff', '#ffd24a', '#8be06a', '#c58bff'];

export function needsRelocation(save) {
  return !!save?.player && save.gen !== GEN_VERSION;
}

// All game rules and state. No rendering: the view listens to events.
// Events: toast{text}, hit{x,z}, swing, inv, goal, newday, faint, open{what,x,z}
export class Game {
  constructor(save = null) {
    this.seed = save?.seed ?? ((Math.random() * 2 ** 31) | 0);
    this.difficulty = Object.hasOwn(DIFFICULTIES, save?.difficulty) ? save.difficulty : 'standard';
    this.gen = new Worldgen(this.seed);
    this.world = new WorldState(this.gen, save?.world, save?.floors, save?.roofs);
    this.armor = new Inventory(ARMOR_SLOTS.length, save?.armor); // worn items: head, body, feet
    this.status = 'ok'; // 'ok' | 'cold' | 'warm' | 'sheltered'
    this.statusTimer = 0;
    this.enemies = []; // night creatures, not saved
    this.nextEnemyId = 1;
    this.spawnTimer = 3;
    this.seaTimer = 6;
    this.golemTimer = 8;
    this.projectiles = []; // spit in flight: {x, z, y, vx, vz, life, damage}
    this.knock = null;
    this.vehicles = save?.vehicles ?? []; // boats and submarines: {id, kind, x, z, y, dir}
    this.nextVehicleId = 1 + Math.max(0, ...this.vehicles.map((v) => v.id));
    this.inv = new Inventory(36, save?.inv);
    this.craftGrid = new Inventory(GRID * GRID, save?.craft);
    this.cursor = null; // stack being carried by the mouse in the inventory panel
    this.goals = new Goals(save?.goals);
    this.encounters = new Encounters(save?.encounters);
    this.progress = new Progress(save?.progress);
    // places the player has pinned on the map: [{x, z, color}], also shown as beacons in the world
    this.markers = (save?.markers ?? []).map((m) => ({ ...m }));
    this.day = save?.day ?? 1;
    this.time = save?.time ?? 0.08; // 0 = 6:00, 0.25 = noon, 0.5 = 18:00
    this.selected = save?.selected ?? 0;
    this.player = save?.player ?? { x: 0.5, z: 0.5, health: MAX_HEALTH, hunger: 10, water: CAN_CAPACITY, bed: null };
    // A brand new world starts somewhere random; worlds from before this keep the old start at the origin.
    this.player.spawn ??= save ? { x: 0, z: 0 } : this.pickSpawn();
    if (!save) {
      this.player.x = this.player.spawn.x + 0.5;
      this.player.z = this.player.spawn.z + 0.5;
    }
    // A world saved under an older shape of the land may now have its player out at sea or inside a
    // mountain. Wake them at a fresh start instead; their inventory and progress come along.
    this.relocated = needsRelocation(save);
    if (this.relocated) {
      const p = this.player;
      p.spawn = this.pickSpawn();
      Object.assign(p, { x: p.spawn.x + 0.5, z: p.spawn.z + 0.5, y: undefined, vy: 0, riding: null, bed: null, lost: null });
      this.vehicles = [];
    }
    this.player.y ??= this.ground(this.player.x, this.player.z);
    this.player.vy ??= 0;
    this.player.thirst ??= MAX_THIRST;
    this.player.stamina ??= MAX_STAMINA;
    this.player.flask ??= 0;
    this.player.breath ??= MAX_BREATH;
    this.updateCapacity();
    // Saves from before bags existed may hold items in slots that now need a bag: pull them forward.
    this.inv.slots.forEach((s, i) => {
      if (!s || i < this.inv.limit) return;
      const left = this.inv.add(s.id, s.n);
      this.inv.slots[i] = left ? { id: s.id, n: left } : null;
    });
    this.damage = new Map();
    this.listeners = [];
    this.wildlife = new Wildlife(this, this.relocated ? [] : save?.livestock);
  }

  // A friendly place to begin: gentle lowland with trees close by and fresh water not far off.
  pickSpawn() {
    const lowland = new Set(['meadow', 'autumn', 'blossom', 'pine']);
    for (let attempt = 0; attempt < 1500; attempt++) {
      const x = Math.round((Math.random() - 0.5) * 9000), z = Math.round((Math.random() - 0.5) * 9000);
      const t = this.gen.tile(x, z);
      if (t.water || t.shore || !lowland.has(t.biome) || this.gen.object(x, z)) continue;
      // well clear of the two harsh regions: they are places to travel to, not to wake up beside
      const far = (c, r) => Math.hypot(x - c.x, z - c.z) > r;
      if (!far(this.gen.frostCentre, 3400) || !far(this.gen.heatCentre, 3000)) continue;
      // and within a few minutes' walk of the sea, so both the land and the ocean are there to explore
      let sea = false;
      for (let k = 0; k < 16 && !sea; k++) {
        const b = (k / 8) * Math.PI * 2, r = k < 8 ? 350 : 700;
        sea = this.gen.tile(Math.round(x + Math.cos(b) * r), Math.round(z + Math.sin(b) * r)).salt;
      }
      if (!sea) continue;
      let trees = 0, pond = false;
      for (let dz = -24; dz <= 24; dz += 2) {
        for (let dx = -24; dx <= 24; dx += 2) {
          const n = this.gen.tile(x + dx, z + dz);
          if (n.water && !n.salt) pond = true;
          if (Math.abs(dx) <= 10 && Math.abs(dz) <= 10 && this.gen.object(x + dx, z + dz)?.t.startsWith('tree_')) trees++;
        }
      }
      if (trees >= 3 && pond) return { x, z };
    }
    return { x: 0, z: 0 };
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data = {}) { for (const fn of this.listeners) fn(type, data); }
  toast(text) { this.emit('toast', { text }); }

  get held() { return this.inv.slots[this.selected]; }
  // rain: every third day or so, for the middle part of the day; it waters the fields
  get raining() {
    // it never rains in the frozen region (it snows) or over the volcanic lands
    const t = this.gen.tile(Math.floor(this.player.x), Math.floor(this.player.z));
    return hash2(this.day, 7, this.seed) < 0.3 && this.time > 0.14 && this.time < 0.4 && t.frost <= 0 && t.heat <= 0;
  }
  get canSprint() { return !this.player.winded && this.player.stamina > 0 && !this.inWater && !this.player.riding; }
  get isNight() { return this.time > 0.56 && this.time < 0.96; }

  serialize() {
    return {
      seed: this.seed, difficulty: this.difficulty, gen: GEN_VERSION, world: this.world.toJSON(), floors: Object.fromEntries(this.world.floors), roofs: Object.fromEntries(this.world.roofs),
      livestock: this.wildlife.list.filter(a => a.tame), markers: this.markers, progress: this.progress.toJSON(),
      armor: this.armor.slots, vehicles: this.vehicles, inv: this.inv.slots, craft: this.craftGrid.slots, goals: this.goals.toJSON(), encounters: this.encounters.toJSON(),
      day: this.day, time: this.time, selected: this.selected, player: this.player,
    };
  }

  // ---- vehicles ----
  // The vehicle the player is riding, or null.
  get vehicle() {
    const id = this.player.riding;
    return id ? this.vehicles.find((v) => v.id === id) ?? null : null;
  }

  // In a submarine below the surface (for the underwater look; the crew still has air).
  get underwater() {
    const v = this.vehicle;
    return this.submerged || (!!v && v.kind === 'submarine' && v.y < WATER_Y - 1.4);
  }

  launchProblem(kind, tx, tz) {
    const tile = this.gen.tile(tx, tz);
    if (VEHICLES[kind].land) {
      return !tile.water && !tile.lava && this.inReach(tx, tz) && !this.blocked(tx + 0.5, tz + 0.5)
        ? null : 'Park the cart on clear ground nearby';
    }
    if (!tile.water || Math.hypot(tx + 0.5 - this.player.x, tz + 0.5 - this.player.z) > REACH + 0.5) {
      return 'Aim at water close to you to launch it';
    }
    if (VEHICLES[kind].dive && WATER_Y - tile.bed < 2) return 'A submarine needs deeper water';
    return null;
  }

  launch(tx, tz) {
    const held = this.held, kind = held && ITEMS[held.id].vehicle;
    if (!kind) return false;
    const problem = this.launchProblem(kind, tx, tz);
    if (problem) {
      this.toast(problem);
      return false;
    }
    this.inv.removeAt(this.selected, 1);
    this.vehicles.push({ id: this.nextVehicleId++, kind, x: tx + 0.5, z: tz + 0.5, y: VEHICLES[kind].land ? this.ground(tx, tz) : WATER_Y + VEHICLES[kind].float, dir: 0 });
    this.toast(`${ITEMS[held.id].name} launched. Press F next to it to get ${kind === 'boat' ? 'on' : 'in'}`);
    this.record('place:' + kind);
    this.emit('inv');
    return true;
  }

  // The nearest vehicle within reach of the player (a submarine may be below you).
  vehicleNear(range = 2.6) {
    const p = this.player;
    let best = null, bestD = range;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < bestD && Math.abs(v.y - p.y) < 3) {
        best = v;
        bestD = d;
      }
    }
    return best;
  }

  board(v = this.vehicleNear()) {
    if (!v || this.player.riding) return false;
    const p = this.player;
    p.riding = v.id;
    p.x = v.x;
    p.z = v.z;
    p.vy = 0;
    this.record('ride:' + v.kind);
    this.emit('ride', { kind: v.kind });
    return true;
  }

  // Step out: onto land beside the vehicle if there is any, otherwise into the water where it floats.
  dismount() {
    const v = this.vehicle, p = this.player;
    if (!v) return false;
    p.riding = null;
    const px = Math.floor(v.x), pz = Math.floor(v.z);
    // generous reach, so a boat nosed up to a ragged coast can always be left
    let best = null, bestD = 3;
    for (let z = pz - 3; z <= pz + 3; z++) {
      for (let x = px - 3; x <= px + 3; x++) {
        const d = Math.hypot(x + 0.5 - v.x, z + 0.5 - v.z);
        if (d < bestD && !this.gen.tile(x, z).water && !this.blocked(x + 0.5, z + 0.5)) {
          best = [x, z];
          bestD = d;
        }
      }
    }
    if (best && v.y > WATER_Y - 1.4) {
      p.x = best[0] + 0.5;
      p.z = best[1] + 0.5;
      p.y = this.ground(p.x, p.z);
    } else p.y = this.deepAt(v.x, v.z) ? Math.min(WATER_Y - FLOAT_SINK, v.y) : this.standY(v.x, v.z);
    this.emit('ride', { kind: null });
    return true;
  }

  // Take a vehicle you are not riding back into the inventory.
  pickupVehicle(v) {
    if (this.player.riding === v.id) return false;
    if (this.inv.add(v.kind, 1) > 0) {
      this.toast('Inventory full');
      return false;
    }
    this.vehicles.splice(this.vehicles.indexOf(v), 1);
    this.toast(`Picked up the ${ITEMS[v.kind].name.toLowerCase()}`);
    this.emit('inv');
    return true;
  }

  // ---- movement ----  // animal: doors count as walls for animals
  blocked(x, z, r = 0.28, animal = false) {
    const cx = Math.floor(x), cz = Math.floor(z);
    for (let tz = cz - 1; tz <= cz + 1; tz++) {
      for (let tx = cx - 1; tx <= cx + 1; tx++) {
        if (this.gen.tile(tx, tz).water) {
          // the player wades and swims; animals and creatures stay out of the water
          if (animal) {
            const nx = Math.max(tx, Math.min(x, tx + 1)), nz = Math.max(tz, Math.min(z, tz + 1));
            if (Math.hypot(x - nx, z - nz) < r) return true;
          }
          continue;
        }
        const obj = this.world.get(tx, tz);
        if (!obj) continue;
        const od = OBJECTS[obj.t];
        if (od.block || (obj.t === 'gate' && !obj.open) || (animal && (od.door || obj.t === 'fence'))) {
          const nx = Math.max(tx, Math.min(x, tx + 1)), nz = Math.max(tz, Math.min(z, tz + 1));
          if (Math.hypot(x - nx, z - nz) < r) return true;
        } else if (od.solid && Math.hypot(x - tx - 0.5, z - tz - 0.5) < r + od.solid) return true;
      }
    }
    return false;
  }

  ground(x, z) { return this.gen.tile(Math.floor(x), Math.floor(z)).h; }

  // Is the water at this spot deep enough that the player has to swim?
  deepAt(x, z) {
    const t = this.gen.tile(Math.floor(x), Math.floor(z));
    return t.water && WATER_Y - t.bed > SWIM_DEPTH;
  }

  // Height the player's feet rest at: the ground, the bed of shallow water, or afloat in deep water.
  standY(x, z) {
    const t = this.gen.tile(Math.floor(x), Math.floor(z));
    if (!t.water) {
      if (this.world.get(Math.floor(x), Math.floor(z))?.t === 'stairs') return t.h + Math.floor((x - Math.floor(x)) * 4 + 1) * 0.25;
      return t.h;
    }
    return WATER_Y - t.bed > SWIM_DEPTH ? WATER_Y - FLOAT_SINK : t.bed;
  }

  // riding a vehicle keeps you out of the water
  get inWater() { return !this.player.riding && this.gen.tile(Math.floor(this.player.x), Math.floor(this.player.z)).water; }
  get swimming() { return !this.player.riding && this.deepAt(this.player.x, this.player.z); }
  // head under the surface
  get submerged() { return this.swimming && this.player.y < WATER_Y - FLOAT_SINK - 0.35; }

  // Ledges higher than a small lip stop the player unless they have jumped high enough.
  canEnter(x, z) {
    // deep water is open at any depth; the bed pushes a diver up where it rises
    if (this.deepAt(x, z)) return !this.blocked(x, z);
    // from the water you can haul yourself out onto a low bank
    return !this.blocked(x, z) && this.standY(x, z) <= this.player.y + (this.inWater ? BANK_LIP : STEP_LIP);
  }

  move(dx, dz) {
    const p = this.player;
    const v = this.vehicle;
    if (v) {
      // a boat goes anywhere there is water; a submarine needs room to dive
      const ok = (x, z) => {
        const tile = this.gen.tile(Math.floor(x), Math.floor(z));
        if (VEHICLES[v.kind].land) return !tile.water && !tile.lava && !this.blocked(x, z) && tile.h <= v.y + 0.55;
        return VEHICLES[v.kind].dive ? this.deepAt(x, z) : tile.water;
      };
      if (ok(p.x + dx, p.z)) p.x += dx;
      if (ok(p.x, p.z + dz)) p.z += dz;
      if (dx || dz) v.dir = Math.atan2(-dz, dx);
      v.x = p.x;
      v.z = p.z;
      return;
    }
    const stuck = this.blocked(p.x, p.z); // e.g. something regrew on top of us: let the player walk out
    if (stuck || this.canEnter(p.x + dx, p.z)) p.x += dx;
    if (stuck || this.canEnter(p.x, p.z + dz)) p.z += dz;
  }

  // Gravity and jumping. Call after move() each frame.
  // In deep water there is no gravity: dive goes down, jump goes up, and you drift up slowly otherwise.
  physics(dt, jump, dive = false) {
    const p = this.player;
    const v = this.vehicle;
    if (v) {
      // a boat rides the surface; a submarine holds whatever depth you leave it at
      const spec = VEHICLES[v.kind];
      if (spec.dive) {
        const bed = this.gen.tile(Math.floor(p.x), Math.floor(p.z)).bed ?? WATER_Y;
        const rate = dive ? -DIVE_SPEED : jump ? RISE_SPEED : 0;
        v.y = Math.min(WATER_Y + spec.float, Math.max(bed + 0.3, v.y + rate * dt));
      } else v.y = spec.land ? this.ground(p.x, p.z) : WATER_Y + spec.float;
      v.x = p.x;
      v.z = p.z;
      p.y = v.y + spec.seat;
      p.vy = 0;
      return;
    }
    if (this.swimming) {
      const top = WATER_Y - FLOAT_SINK, bed = this.gen.tile(Math.floor(p.x), Math.floor(p.z)).bed;
      if (p.y > top + 0.05) {
        // dropping in from a bank
        p.vy -= GRAVITY * dt;
        p.y = Math.max(top, p.y + p.vy * dt);
        return;
      }
      const v = dive ? -DIVE_SPEED : jump ? RISE_SPEED : BUOYANCY;
      p.y = Math.min(top, Math.max(bed, p.y + v * dt));
      p.vy = 0;
      // reaching a deep bed counts once per dive
      const atBed = p.y <= bed + 0.3 && bed <= -2.5;
      if (atBed && !this.atBed) this.record('dive');
      this.atBed = atBed;
      return;
    }
    const g = this.standY(p.x, p.z);
    if (p.y <= g + 1e-4 && p.vy <= 0) {
      p.y = g;
      p.vy = jump && !this.swimming ? JUMP_SPEED : 0;
    } else {
      p.vy -= GRAVITY * dt;
      // a glider held in the hand turns a fall into a long, slow descent
      this.gliding = jump && p.vy < 0 && !!(this.held && ITEMS[this.held.id].glide);
      if (this.gliding) p.vy = Math.max(p.vy, -GLIDE_FALL);
    }
    if (p.y <= g + 1e-4) this.gliding = false;
    p.y = Math.max(g, p.y + p.vy * dt);
  }

  inReach(tx, tz) {
    if (Math.hypot(tx + 0.5 - this.player.x, tz + 0.5 - this.player.z) > REACH) return false;
    // the seabed is only in reach when you have dived down near it
    const t = this.gen.tile(tx, tz);
    return !t.water || this.player.y - t.bed <= 1.6;
  }

  // ---- items ----
  give(id, n) {
    if (n <= 0) return;
    const left = this.inv.add(id, n);
    const got = n - left;
    if (got > 0) {
      this.toast(`+${got} ${ITEMS[id].name}`);
      if (ITEMS[id].food && !this.player.tipEat) {
        this.player.tipEat = true; // shown once per world
        this.toast('Tip: press C to eat when the orange food bar runs low');
      }
      this.record('collect:' + id, got);
    }
    if (left > 0) this.toast('Inventory full');
    this.emit('inv');
    return got;
  }

  // Pin a place on the map, or take the pin away if one is already within `near` tiles of it.
  // Returns the new marker, or null when one was removed. The oldest goes when all colours are in use.
  toggleMarker(x, z, near = 4) {
    const old = this.markers.findIndex((m) => Math.hypot(m.x - x, m.z - z) <= near);
    if (old >= 0) {
      this.markers.splice(old, 1);
      this.toast('Marker removed');
      return null;
    }
    if (this.markers.length >= MARKER_COLORS.length) this.markers.shift();
    const color = MARKER_COLORS.find((c) => !this.markers.some((m) => m.color === c));
    const marker = { x: Math.floor(x) + 0.5, z: Math.floor(z) + 0.5, color };
    this.markers.push(marker);
    this.toast('Marker placed. Follow its beacon.');
    return marker;
  }

  giveDrops(drops) {
    // [item, min, max] or [item, min, max, chance]
    const bonus = this.progress.has('forager') && Math.random() < 0.2 ? 1 : 0; // Bountiful: one extra of the first thing
    drops.forEach(([id, min, max, chance = 1], i) => {
      if (Math.random() < chance) this.give(id, rand(min, max) + (i === 0 ? bonus : 0));
    });
  }

  get maxHealth() { return this.progress.maxHealth; }
  get maxStamina() { return this.progress.maxStamina; }
  get mealScale() { return this.progress.has('iron_stomach') ? 1.25 : 1; }

  // Experience toward the next level; each level brings a stat point, every third a skill point.
  gainXp(n) {
    const gained = this.progress.addXp(n);
    if (!gained) return;
    this.player.health = this.maxHealth; // a new level restores you
    this.toast('Level ' + this.progress.level + '! Press K to spend your points.');
    this.emit('levelup', { level: this.progress.level });
  }

  // Spend a stat point or learn a skill. Returns true when it was spent.
  raiseStat(stat) {
    if (!this.progress.raise(stat)) return false;
    this.emit('progress');
    return true;
  }

  learnSkill(id) {
    if (!this.progress.learn(id)) return false;
    this.emit('progress');
    return true;
  }

  record(key, n = 1) {
    this.gainXp(xpFor(key));
    const previous = this.goals.index;
    this.goals.record(key, n);
    // Discoveries and victories can happen before the guide reaches that chapter.
    while (this.goals.current?.milestone) {
      const goal = this.goals.current;
      const count = goal.milestone === 'keeper:restore' ? this.encounters.restored.size :
        goal.milestone === 'keeper:found' ? this.encounters.discovered.size : Number(this.encounters.visits.has(goal.milestone));
      this.goals.progress[goal.milestone] = Math.min(count, goal.need[goal.milestone]);
      if (!this.goals.record(goal.milestone, 0)) break;
    }
    if (this.goals.index !== previous) {
      this.gainXp(xpFor('goal') * (this.goals.index - previous));
      this.toast(this.goals.current ? 'Goal complete!' : 'All goals complete. Enjoy your homestead!');
    }
    this.emit('goal');
    this.emit('record', { key });
  }

  // ---- crafting grid and the stack held on the cursor ----
  craftResult() {
    const recipe = matchRecipe(this.craftGrid.slots.map((s) => s?.id ?? null), this.stationsNear());
    return recipe && this.knowsRecipe(recipe) ? recipe : null;
  }

  consumeGrid(recipe) {
    this.craftGrid.slots.forEach((s, i) => s && this.craftGrid.removeAt(i, 1));
    this.record('craft:' + recipe.out, 1);
  }

  // Click the output slot: take one craft onto the cursor, or with shift craft as many as fit into the inventory.
  clickOutput(shift = false) {
    const r = this.craftResult();
    if (!r) return;
    if (shift) {
      for (let i = 0; i < 99 && this.craftResult() === r; i++) {
        const left = this.inv.add(r.out, r.n);
        if (left > 0) {
          this.inv.remove(r.out, r.n - left);
          break;
        }
        this.consumeGrid(r);
      }
    } else {
      const c = this.cursor;
      if (c && (c.id !== r.out || c.n + r.n > stackSize(r.out))) {
        // The cursor is busy with something else: the result goes straight to the inventory.
        const left = this.inv.add(r.out, r.n);
        if (left > 0) {
          this.inv.remove(r.out, r.n - left);
          this.toast('Inventory full');
          return;
        }
      } else this.cursor = { id: r.out, n: (c?.n ?? 0) + r.n };
      this.consumeGrid(r);
    }
    this.emit('inv');
  }

  // Click a slot of `inv`. Left: pick up / put down / merge / swap. Right: take half / put one.
  // Shift: send the whole stack to `other`.
  clickSlot(inv, i, button = 0, shift = false, other = null) {
    const s = inv.slots[i];
    let c = this.cursor;
    if (shift) {
      if (s && other) inv.moveTo(i, other);
    } else if (button === 0) {
      if (!c || !s) {
        inv.slots[i] = c;
        c = s;
      } else if (s.id === c.id && s.n < stackSize(s.id)) {
        const take = Math.min(c.n, stackSize(s.id) - s.n);
        s.n += take;
        c.n -= take;
      } else {
        inv.slots[i] = c;
        c = s;
      }
    } else if (!c) {
      if (s) {
        const half = Math.ceil(s.n / 2);
        c = { id: s.id, n: half };
        inv.removeAt(i, half);
      }
    } else if (!s) {
      inv.slots[i] = { id: c.id, n: 1 };
      c.n--;
    } else if (s.id === c.id && s.n < stackSize(s.id)) {
      s.n++;
      c.n--;
    }
    this.cursor = c && c.n > 0 ? c : null;
    this.emit('inv');
  }

  // Equip inventory slot `i`: hotbar slots are simply selected, others are swapped into hotbar `slot` first.
  equip(i, slot = this.selected) {
    const s = this.inv.slots[i];
    if (s && ITEMS[s.id].armor) return this.wear(i);
    if (i < HOTBAR && slot === this.selected) this.selected = i;
    else {
      this.inv.swap(i, slot);
      this.selected = slot;
    }
    const held = this.held;
    if (held) this.toast(`Equipped ${ITEMS[held.id].name}`);
    this.emit('inv');
  }

  // Put everything in the grid and on the cursor back into the inventory (what does not fit stays in the grid).
  clearGrid() {
    if (this.cursor) {
      const left = this.inv.add(this.cursor.id, this.cursor.n);
      this.cursor = left > 0 ? { id: this.cursor.id, n: left } : null;
      if (this.cursor && this.craftGrid.add(this.cursor.id, this.cursor.n) === 0) this.cursor = null;
    }
    this.craftGrid.slots.forEach((_, i) => this.craftGrid.moveTo(i, this.inv));
    this.emit('inv');
  }

  // One-click crafting from the recipe book: lay the recipe out and take the result, once or as often as possible.
  // times: how many to make (true = as many as possible)
  quickCraft(recipe, times = 1) {
    const all = times === true || times > 1, limit = times === true ? 99 : times;
    let made = 0;
    do {
      if (!this.fillRecipe(recipe, made > 0)) break;
      const before = this.inv.count(recipe.out);
      this.clickOutput(true);
      if (this.inv.count(recipe.out) === before) {
        this.clearGrid(); // no room for the result
        this.toast('Inventory full');
        break;
      }
      made++;
    } while (all && made < limit);
    if (made) this.toast(`Crafted ${made * recipe.n} ${ITEMS[recipe.out].name}`);
    return made;
  }

  // Tidy the storage rows (not the hotbar): merge stacks, then group by name.
  sortInventory() {
    const cap = this.capacity, items = [];
    for (let i = HOTBAR; i < this.inv.slots.length; i++) {
      const s = this.inv.slots[i];
      if (!s) continue;
      const same = stackSize(s.id) > 1 && items.find((x) => x.id === s.id && x.n < stackSize(s.id));
      if (same) {
        const take = Math.min(s.n, stackSize(s.id) - same.n);
        same.n += take;
        s.n -= take;
      }
      if (s.n > 0) items.push(s);
      this.inv.slots[i] = null;
    }
    items.sort((a, b) => ITEMS[a.id].name.localeCompare(ITEMS[b.id].name) || b.n - a.n);
    items.forEach((s, i) => (this.inv.slots[HOTBAR + i] = s));
    this.emit('inv');
    return cap;
  }

  // Throw away whatever is on the cursor.
  trashCursor() {
    if (!this.cursor) return;
    this.toast(`Discarded ${this.cursor.n} ${ITEMS[this.cursor.id].name}`);
    this.cursor = null;
    this.emit('inv');
  }

  // Can this recipe be made right now (station nearby and ingredients in the inventory)?
  knowsRecipe(recipe) { return !recipe.keeper || this.encounters.restored.has(recipe.keeper); }

  canMake(recipe, stations = this.stationsNear()) {
    if (!this.knowsRecipe(recipe)) return false;
    if (recipe.station && !stations.has(recipe.station)) return false;
    return Object.entries(ingredients(recipe)).every(([id, n]) => this.inv.has(id, n));
  }

  // Recipe book shortcut: lay the recipe's ingredients out in the grid if the inventory has them.
  // quiet: no messages when it cannot be done.
  fillRecipe(recipe, quiet = false) {
    if (!this.knowsRecipe(recipe)) return false;
    this.clearGrid();
    if (recipe.station && !this.stationsNear().has(recipe.station)) {
      if (!quiet) this.toast(`Stand near a ${recipe.station} to make this`);
      return false;
    }
    if (this.craftGrid.slots.some(Boolean)) return false;
    const need = ingredients(recipe);
    const missing = Object.entries(need).find(([id, n]) => !this.inv.has(id, n));
    if (missing) {
      if (!quiet) this.toast(`Not enough ${ITEMS[missing[0]].name}`);
      return false;
    }
    layout(recipe).forEach((id, i) => {
      if (!id) return;
      this.inv.remove(id, 1);
      this.craftGrid.slots[i] = { id, n: 1 };
    });
    this.emit('inv');
    return true;
  }

  stationsNear() {
    const s = new Set();
    const px = Math.floor(this.player.x), pz = Math.floor(this.player.z);
    for (let z = pz - 3; z <= pz + 3; z++) {
      for (let x = px - 3; x <= px + 3; x++) {
        const o = this.world.get(x, z);
        if (o && (o.t === 'workbench' || o.t === 'campfire')) s.add(o.t);
      }
    }
    return s;
  }

  // ---- eating and armor ----
  eatHeld() {
    const held = this.held, food = held && ITEMS[held.id].food;
    if (!food) {
      this.toast('Select some food in the hotbar first');
      return false;
    }
    if (!eat(this.player, food * this.mealScale, ITEMS[held.id].water)) {
      this.toast("You're full");
      return false;
    }
    this.inv.removeAt(this.selected, 1);
    this.toast(`Ate ${ITEMS[held.id].name}`);
    this.emit('eat', { id: held.id });
    this.emit('inv');
    return true;
  }

  // The inventory slot C would eat from: the held item if it is food, otherwise the food that
  // best fits how hungry you are (the biggest that is not wasted, else the smallest). -1 if none.
  foodSlot() {
    if (this.held && ITEMS[this.held.id].food) return this.selected;
    const missing = MAX_HUNGER - this.player.hunger;
    let best = -1, bestScore = -Infinity;
    this.inv.slots.forEach((s, i) => {
      const food = s && ITEMS[s.id].food;
      if (!food) return;
      const score = food <= missing ? food : -food;
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    return best;
  }

  // Eat from anywhere in the inventory (the C key and the Eat button).
  eatFood() {
    const i = this.foodSlot();
    if (i < 0) {
      this.toast('No food. Pick berries from bushes or apples from oak trees');
      return false;
    }
    const s = this.inv.slots[i];
    if (!eat(this.player, ITEMS[s.id].food * this.mealScale, ITEMS[s.id].water)) {
      this.toast("You're full");
      return false;
    }
    this.inv.removeAt(i, 1);
    this.toast(`Ate ${ITEMS[s.id].name}`);
    this.emit('eat', { id: s.id });
    this.emit('inv');
    return true;
  }

  // Put on the armor or bag in inventory slot i; whatever was worn there goes back into that slot.
  wear(i) {
    const s = this.inv.slots[i];
    const slot = s ? ARMOR_SLOTS.indexOf(ITEMS[s.id].armor) : -1;
    if (slot < 0) return false;
    const old = this.armor.slots[slot];
    this.inv.slots[i] = old;
    this.armor.slots[slot] = s;
    if (!this.bagStillFits()) {
      this.inv.slots[i] = s;
      this.armor.slots[slot] = old;
      this.toast('Empty the extra bag rows first');
      return false;
    }
    this.updateCapacity();
    this.toast(`Wearing ${ITEMS[s.id].name}`);
    this.record(ITEMS[s.id].bag ? 'wear:back' : 'wear:armor');
    this.emit('inv');
    return true;
  }

  // Click a worn slot in the panel: put the held piece on, or take the worn one off.
  clickArmor(slot) {
    const c = this.cursor, worn = this.armor.slots[slot];
    if (c && ITEMS[c.id].armor !== ARMOR_SLOTS[slot]) return;
    this.armor.slots[slot] = c;
    if (!this.bagStillFits()) {
      this.armor.slots[slot] = worn;
      this.toast('Empty the extra bag rows first');
      return;
    }
    this.cursor = worn;
    this.updateCapacity();
    this.emit('inv');
  }

  // Usable inventory slots: hotbar + base storage + whatever the worn bag adds.
  get capacity() {
    const bag = this.armor.slots[ARMOR_SLOTS.indexOf('back')];
    return HOTBAR + BASE_STORAGE + (bag ? ITEMS[bag.id].bag : 0);
  }

  // A bag can only come off (or be swapped for a smaller one) when the slots it adds are empty.
  bagStillFits() {
    const cap = this.capacity;
    return this.inv.slots.every((s, i) => i < cap || !s);
  }

  updateCapacity() { this.inv.limit = this.capacity; }

  get defense() {
    return this.armor.slots.reduce((sum, s) => sum + (s ? ITEMS[s.id].def ?? 0 : 0), 0) + (this.progress.has('tough_hide') ? 1 : 0);
  }

  // ---- water ----
  // fresh: only ponds count (sea water is salty)
  waterNear(fresh = false) {
    const px = Math.floor(this.player.x), pz = Math.floor(this.player.z);
    for (let z = pz - 1; z <= pz + 1; z++) {
      for (let x = px - 1; x <= px + 1; x++) {
        const t = this.gen.tile(x, z);
        if (t.water && !(fresh && t.salt)) return true;
      }
    }
    return false;
  }

  hasFlask() { return this.inv.has('flask'); }

  // What the drink key would do right now: 'pond', 'flask' or null.
  drinkSource() {
    if (this.waterNear(true)) return 'pond';
    return this.hasFlask() && this.player.flask > 0 ? 'flask' : null;
  }

  // Drink from a pond next to you (which also fills the flask), otherwise from the flask.
  drinkWater() {
    const p = this.player, source = this.drinkSource();
    if (source === 'pond') {
      drink(p, MAX_THIRST);
      if (this.hasFlask()) p.flask = FLASK_DRINKS;
      this.toast(this.hasFlask() ? 'You drink from the pond and fill your flask' : 'You drink from the pond');
    } else if (source === 'flask') {
      p.flask--;
      drink(p, 5);
      this.toast(`You drink from your flask (${p.flask} left)`);
    } else {
      if (this.waterNear()) this.toast('Sea water is too salty to drink. Find a pond');
      else this.toast(this.hasFlask() ? 'Your flask is empty. Stand next to a pond to drink' : 'Stand next to a pond to drink');
      return false;
    }
    this.emit('drink', { source });
    this.record('drink');
    this.emit('inv');
    return true;
  }

  // Nights are cold: out in the open you get hungry faster. A campfire nearby or a built floor
  // under your feet keeps you warm, and armor cuts the effect.
  updateStatus() {
    const p = this.player, px = Math.floor(p.x), pz = Math.floor(p.z);
    // the frozen wastes and the snowy peaks are cold at any hour
    const biome = this.gen.tile(px, pz).biome;
    const freezing = biome === 'winter' || biome === 'snow';
    if (!this.isNight && !freezing) return (this.status = 'ok');
    if (this.world.getFloor(px, pz)) return (this.status = 'sheltered');
    for (let z = pz - 5; z <= pz + 5; z++) {
      for (let x = px - 5; x <= px + 5; x++) if (this.world.get(x, z)?.t === 'campfire') return (this.status = 'warm');
    }
    return (this.status = 'cold');
  }

  // ---- the harsh regions ----
  // What the frozen and volcanic regions demand where the player stands, and whether they are covered.
  // need: pieces of the right gear required (1 at the edge, 3 in the heart). have: pieces worn.
  // short: how many are missing; each missing piece costs a heart every few seconds.
  exposure() {
    const p = this.player, px = Math.floor(p.x), pz = Math.floor(p.z);
    const t = this.gen.tile(px, pz);
    const kind = t.frost > 0 ? 'frost' : t.heat > 0 ? 'heat' : null;
    if (!kind) return { kind: null, need: 0, have: 0, short: 0, depth: 0 };
    const depth = kind === 'frost' ? t.frost : t.heat;
    let need = Math.min(3, 1 + Math.floor(depth * 3));
    // a fire or a floor underfoot beats the cold; only a submarine's hull beats the heat
    if (kind === 'frost' && (this.world.getFloor(px, pz) || this.nearCampfire(p.x, p.z, 5))) need = 0;
    if (kind === 'heat' && this.vehicle?.kind === 'submarine') need = 0;
    const prop = kind === 'frost' ? 'warm' : 'cool';
    const have = this.armor.slots.reduce((sum, s) => sum + (s ? ITEMS[s.id][prop] ?? 0 : 0), 0);
    return { kind, need, have, short: Math.max(0, need - have), depth };
  }

  get hungerRate() {
    return this.status === 'cold' ? 1 + COLD_HUNGER * (1 - Math.min(1, this.defense / MAX_DEFENSE)) : 1;
  }

  // ---- left click: use tool / harvest ----
  primary(tx, tz) {
    const def = this.held ? ITEMS[this.held.id] : null;
    const obj = this.world.get(tx, tz);
    const tile = this.gen.tile(tx, tz);
    this.emit('swing', { x: tx, z: tz });

    const roof = this.world.getRoof(tx, tz);
    if (roof && (def?.roof || (!obj && !def))) {
      this.world.setRoof(tx, tz, null);
      this.give(roof, 1);
      return;
    }
    if (!obj) {
      const floor = this.world.getFloor(tx, tz);
      if (floor) {
        this.world.setFloor(tx, tz, null);
        this.emit('hit', { x: tx, z: tz });
        this.give(floor, 1);
        return;
      }
      if (def?.tool === 'hoe') {
        if (tile.water || tile.shore || tile.biome === 'sand') this.toast("Can't till here");
        else {
          this.world.set(tx, tz, { t: 'soil', wet: false, crop: -1, placed: true });
          this.wearTool();
        }
      }
      return;
    }

    const od = OBJECTS[obj.t];
    if (obj.t === 'soil') {
      const species = obj.species ?? 'wheat';
      if (obj.crop >= cropFor(obj).days) {
        this.world.set(tx, tz, { ...obj, crop: -1 });
        this.emit('hit', { x: tx, z: tz });
        this.give(species, rand(1, 2));
        this.give(cropFor(obj).seed, rand(1, 2));
      } else if (obj.crop >= 0) this.toast('Not ready yet');
      else if (def?.tool === 'hoe') this.world.remove(tx, tz);
      return;
    }

    if (od.pick) {
      if (od.becomes) this.world.set(tx, tz, { t: od.becomes, since: this.day, regrow: od.regrow });
      else this.world.remove(tx, tz, this.day, od.regrow);
      this.emit('hit', { x: tx, z: tz });
      this.giveDrops(od.drops);
      return;
    }

    if (!od.hp) return;
    let power = 1;
    if (od.tool) {
      if (def?.tool !== od.tool) {
        this.toast(od.tool === 'axe' ? 'You need an axe' : 'You need a pickaxe');
        return;
      }
      if (od.minPower && def.power < od.minPower) {
        this.toast('This needs a copper pickaxe or better');
        return;
      }
      power = def.power;
      this.wearTool();
    }
    if ((obj.t === 'chest' || obj.t === 'cabinet' || obj.t === 'lostbag') && obj.items.some(Boolean)) {
      this.toast(obj.t === 'chest' ? 'Empty the chest first' : 'Open it with F and take your things first');
      return;
    }
    const key = tx + ',' + tz;
    const hp = (this.damage.get(key) ?? od.hp) - power;
    this.emit('hit', { x: tx, z: tz });
    if (hp > 0) {
      this.damage.set(key, hp);
      return;
    }
    this.damage.delete(key);
    const bed = this.player.bed;
    if (obj.t === 'bed' && bed && bed.x === tx && bed.z === tz) this.player.bed = null;
    this.world.remove(tx, tz, this.day, od.regrow);
    if (obj.t === 'lostbag') this.player.lost = null;
    if (od.item) this.give(od.item, 1);
    else if (od.drops) this.giveDrops(od.drops);
  }

  // Using a tool or weapon wears it down; at zero it breaks.
  wearTool() {
    const s = this.held, uses = s && ITEMS[s.id].uses;
    if (!uses) return;
    if (this.progress.has('tool_care') && Math.random() < 0.35) return;
    s.d = (s.d ?? uses) - 1;
    if (s.d > 0) return;
    this.inv.slots[this.selected] = null;
    this.toast(`Your ${ITEMS[s.id].name} broke`);
    this.emit('break');
    this.emit('inv');
  }

  // Could the held item be placed on this tile? Shared by placing and by the placement preview.
  canPlace(tx, tz) {
    const def = this.held ? ITEMS[this.held.id] : null;
    if (def?.vehicle) return !this.launchProblem(def.vehicle, tx, tz);
    if (!def || (!def.place && !def.floor && !def.roof) || !this.inReach(tx, tz)) return false;
    const obj = this.world.get(tx, tz);
    if (this.gen.tile(tx, tz).water || this.gen.tile(tx, tz).lava) return false;
    if (def.roof) return !this.world.getRoof(tx, tz) && (!obj || obj.placed);
    if (def.floor) return !this.world.getFloor(tx, tz) && !(obj && !obj.placed) && obj?.t !== 'soil';
    const p = this.player;
    return !obj && !(tx === Math.floor(p.x) && tz === Math.floor(p.z));
  }

  // ---- right click: place / plant / water / eat / interact ----
  secondary(tx, tz, hasTarget) {
    const held = this.held;
    const def = held ? ITEMS[held.id] : null;
    const p = this.player;

    if (hasTarget && held?.id === 'wheat' && this.wildlife.handle(this.wildlife.near(tx + 0.5, tz + 0.5))) return;
    if (def?.food) return void this.eatHeld();
    if (def?.armor) return void this.wear(this.selected);
    if (def?.flask) return void this.drinkWater();
    if (def?.vehicle) return void this.launch(tx, tz);
    if (!hasTarget) return;
    const obj = this.world.get(tx, tz);
    const tile = this.gen.tile(tx, tz);

    if (def?.tool === 'can') {
      if (tile.water) {
        p.water = CAN_CAPACITY;
        this.toast('Watering can filled');
      } else if (obj?.t === 'soil') {
        if (p.water <= 0) this.toast('Empty. Refill at a pond');
        else if (obj.wet) this.toast('Already watered');
        else {
          p.water--;
          this.world.set(tx, tz, { ...obj, wet: true });
          this.emit('swing', { x: tx, z: tz });
          if (obj.crop >= 0) this.record('water');
        }
      }
      this.emit('inv');
      return;
    }

    if (def?.plant && obj?.t === 'soil') {
      if (obj.crop >= 0) return;
      this.inv.removeAt(this.selected, 1);
      this.world.set(tx, tz, { ...obj, crop: 0, species: def.plant });
      this.record('plant');
      this.emit('inv');
      return;
    }

    if (def?.roof) {
      if (!this.canPlace(tx, tz)) return;
      this.world.setRoof(tx, tz, held.id);
      this.inv.removeAt(this.selected, 1);
      this.emit('inv');
      return;
    }
    if (def?.floor) {
      if (!this.canPlace(tx, tz)) return;
      this.inv.removeAt(this.selected, 1);
      this.world.setFloor(tx, tz, held.id);
      this.record('place:floor');
      this.emit('inv');
      return;
    }

    if (def?.place && !obj) {
      if (!this.canPlace(tx, tz)) return;
      const placed = { t: def.place, placed: true };
      if (def.place === 'chest' || def.place === 'cabinet') placed.items = Array(CHEST_SLOTS).fill(null);
      if (def.place === 'flower') placed.v = (Math.random() * 4) | 0;
      if (def.place === 'bed') p.bed = { x: tx, z: tz };
      this.inv.removeAt(this.selected, 1);
      this.world.set(tx, tz, placed);
      this.record('place:' + def.place);
      if (OBJECTS[def.place].block) this.record('place:wall');
      this.emit('inv');
      return;
    }

    this.interact(tx, tz);
  }

  // ---- E: use a placed object ----
  interact(tx, tz) {
    const obj = this.world.get(tx, tz);
    if (!obj) return false;
    if (OBJECTS[obj.t].hoard) {
      // a one-time treasure: it is gone for good once opened
      this.world.set(tx, tz, { t: 'empty' });
      this.toast(OBJECTS[obj.t].name + ' opened!');
      this.giveDrops(OBJECTS[obj.t].hoard);
      this.record('hoard');
      return true;
    }
    if (OBJECTS[obj.t].cache) {
      if (obj.claimedDay === this.day) { this.toast('Return after daybreak for more'); return true; }
      if (this.give(OBJECTS[obj.t].cache, 2)) this.world.set(tx, tz, { ...obj, claimedDay: this.day });
      return true;
    }
    if (obj.t === 'gate') {
      if (obj.open && tx === Math.floor(this.player.x) && tz === Math.floor(this.player.z)) return false;
      this.world.set(tx, tz, { ...obj, open: !obj.open });
    } else if (obj.t === 'bed') {
      this.player.bed = { x: tx, z: tz };
      this.sleep();
    } else if (obj.t === 'chest' || obj.t === 'cabinet' || obj.t === 'lostbag') this.emit('open', { what: 'chest', x: tx, z: tz });
    else if (obj.t === 'campfire' || obj.t === 'workbench') this.emit('open', { what: 'craft' });
    else return false;
    return true;
  }

  sleep() {
    if (this.time < 0.5) {
      this.toast('You can only sleep in the evening or at night');
      return false;
    }
    this.startDay(true);
    this.player.health = Math.min(this.maxHealth, this.player.health + 3);
    this.toast(`Good morning! Day ${this.day}`);
    this.record('sleep');
    return true;
  }

  // skipped: the clock jumped (sleep or fainting) rather than ticking over naturally
  startDay(skipped = false) {
    this.time = 0;
    this.day++;
    this.world.newDay(this.day);
    this.emit('newday', { skipped });
  }

  // ---- night creatures ----
  // Gloomlings appear in the dark, hop toward the player and bite. They never cross walls or doors,
  // never step on built floors or into campfire light, and burn away at dawn.
  nearCampfire(x, z, radius) {
    const cx = Math.floor(x), cz = Math.floor(z), r = Math.ceil(radius);
    for (let tz = cz - r; tz <= cz + r; tz++) {
      for (let tx = cx - r; tx <= cx + r; tx++) {
        if (this.world.get(tx, tz)?.t === 'campfire' && Math.hypot(tx + 0.5 - x, tz + 0.5 - z) <= radius) return true;
      }
    }
    return false;
  }

  // Can a creature stand here?
  enemyCanStand(x, z) {
    if (this.gen.tile(Math.floor(x), Math.floor(z)).lava) return false; // nothing walks into lava
    return !this.blocked(x, z, 0.3, true) && !this.world.getFloor(Math.floor(x), Math.floor(z)) && !this.nearCampfire(x, z, FIRE_SAFE);
  }

  spawnEnemy(x, z, kind = 'gloomling') {
    const e = { id: this.nextEnemyId++, kind, x, z, y: this.ground(x, z), hp: ENEMY_KINDS[kind].hp, cool: 0.6, stun: 0, kx: 0, kz: 0, tx: x, tz: z, wait: 0 };
    this.enemies.push(e);
    return e;
  }

  trySpawnEnemy() {
    const p = this.player, a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 7;
    const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    if (!this.enemyCanStand(x, z) || this.nearCampfire(x, z, 8)) return null;
    const roll = Math.random();
    const kind = this.day >= 4 && roll < 0.22 ? 'brute' : this.day >= 3 && roll > 0.78 ? 'spitter' : 'gloomling';
    return this.spawnEnemy(x, z, kind);
  }

  // A snapper appears out in the deep while you are swimming in the sea.
  trySpawnSeaEnemy() {
    const p = this.player, a = Math.random() * Math.PI * 2, r = 9 + Math.random() * 6;
    const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    const t = this.gen.tile(Math.floor(x), Math.floor(z));
    if (!t.salt || t.boiling || t.bed > -2.5) return null; // nothing lives in the boiling sea
    const e = this.spawnEnemy(x, z, 'snapper');
    e.y = t.bed + 1;
    return e;
  }

  removeEnemy(e) {
    this.enemies.splice(this.enemies.indexOf(e), 1);
    this.emit('enemygone', { x: e.x, z: e.z });
  }

  updateEnemies(dt) {
    const p = this.player, night = this.isNight;
    const seaCount = this.enemies.filter((e) => ENEMY_KINDS[e.kind].sea).length;
    const inSea = this.swimming && this.gen.tile(Math.floor(p.x), Math.floor(p.z)).salt;
    if (inSea && seaCount < (night ? 2 : 1)) {
      this.seaTimer -= dt;
      if (this.seaTimer <= 0) {
        this.seaTimer = 14;
        this.trySpawnSeaEnemy();
      }
    }
    const golems = this.enemies.filter((e) => ENEMY_KINDS[e.kind].mountain).length;
    const here = this.gen.tile(Math.floor(p.x), Math.floor(p.z)).biome;
    if (['mountain', 'snow', 'winter', 'ash', 'volcano'].includes(here) && golems < 2) {
      this.golemTimer -= dt;
      if (this.golemTimer <= 0) {
        this.golemTimer = 16;
        const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 6;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        const tile = this.gen.tile(Math.floor(x), Math.floor(z));
        const kind = tile.frost > 0 ? 'frostprowler' : tile.heat > 0 ? 'kilncrab' :
          ['mountain', 'snow'].includes(tile.biome) ? 'golem' : null;
        if (kind && !tile.lava && this.enemyCanStand(x, z)) this.spawnEnemy(x, z, kind);
      }
    }
    // the first night is quiet, to give a new player time to find their feet
    if (night && this.day >= 2 && this.enemies.length - seaCount - golems < Math.min(8, 2 + Math.floor(this.day / 2))) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 5;
        this.trySpawnEnemy();
      }
    }
    for (const e of [...this.enemies]) {
      const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
      const sea = !!ENEMY_KINDS[e.kind].sea;
      // land creatures hunt at night; sea creatures hunt whoever is in deep water
      const spec = ENEMY_KINDS[e.kind];
      const hunting = sea ? this.swimming : spec.mountain ? true : night;
      const canStand = (x, z) => (sea ? this.deepAt(x, z) : this.enemyCanStand(x, z));
      if (!night && !sea && !spec.mountain) e.hp -= dt * 3; // daylight burns the night creatures away
      if (e.hp <= 0 || d > 48) {
        this.removeEnemy(e);
        continue;
      }
      e.cool -= dt;
      e.strike = Math.max(0, (e.strike ?? 0) - dt);
      let mx = 0, mz = 0;
      if (e.stun > 0) {
        // knocked back by a hit
        e.stun -= dt;
        mx = e.kx * dt;
        mz = e.kz * dt;
      } else if (spec.ranged && hunting && d < 16) {
        // keep about six tiles away: close in when far, back off when near, and spit when in range
        const dir = d > 7 ? 1 : d < 4.5 ? -1 : 0;
        mx = (dx / d) * spec.speed * dir * dt;
        mz = (dz / d) * spec.speed * dir * dt;
        if (d < 9 && e.cool <= 0) {
          e.cool = 2.6;
          e.strike = 0.35;
          this.projectiles.push({ x: e.x, z: e.z, y: e.y + 0.6, vx: (dx / d) * 6.5, vz: (dz / d) * 6.5, life: 2, damage: spec.damage });
          this.emit('spit', { x: e.x, z: e.z });
        }
      } else if (hunting && d < (sea ? 11 : spec.mountain ? 10 : 16) && d > 0.6) {
        mx = (dx / d) * ENEMY_KINDS[e.kind].speed * dt;
        mz = (dz / d) * ENEMY_KINDS[e.kind].speed * dt;
      } else if (d >= 16) {
        // idle wander
        if ((e.wait -= dt) <= 0) {
          e.wait = 2 + Math.random() * 3;
          e.tx = e.x + (Math.random() - 0.5) * 8;
          e.tz = e.z + (Math.random() - 0.5) * 8;
        }
        const wx = e.tx - e.x, wz = e.tz - e.z, wd = Math.hypot(wx, wz);
        if (wd > 0.2) {
          mx = (wx / wd) * dt;
          mz = (wz / wd) * dt;
        }
      }
      if (mx && canStand(e.x + mx, e.z)) e.x += mx;
      if (mz && canStand(e.x, e.z + mz)) e.z += mz;
      let reach = d;
      if (sea) {
        // rise or sink toward the swimmer, staying between the bed and the surface
        const bed = this.gen.tile(Math.floor(e.x), Math.floor(e.z)).bed ?? -1;
        const want = hunting && d < 11 ? p.y + 0.4 : bed + 1;
        const goal = Math.max(bed + 0.3, Math.min(WATER_Y - 0.8, want));
        e.y += Math.max(-2 * dt, Math.min(2 * dt, goal - e.y));
        reach = Math.hypot(d, p.y + 0.4 - e.y);
      } else e.y = this.ground(e.x, e.z);
      e.moving = mx !== 0 || mz !== 0;
      if (mx || mz) e.dir = Math.atan2(-mz, mx);
      if (hunting && !spec.ranged && reach < 0.95 && e.cool <= 0 && e.stun <= 0) {
        e.cool = 1.3;
        e.strike = 0.35;
        this.hurt(ENEMY_KINDS[e.kind].damage, e);
      }
    }
  }

  // Spit in flight: it stops at walls and hurts the player if it lands.
  updateProjectiles(dt) {
    const p = this.player;
    for (const s of [...this.projectiles]) {
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.life -= dt;
      const hit = Math.hypot(s.x - p.x, s.z - p.z) < 0.55 && Math.abs(s.y - p.y - 0.7) < 1.2;
      const wall = OBJECTS[this.world.get(Math.floor(s.x), Math.floor(s.z))?.t]?.block;
      if (hit) this.hurt(s.damage, s);
      if (hit || wall || s.life <= 0) this.projectiles.splice(this.projectiles.indexOf(s), 1);
    }
  }

  // Damage to the player, reduced by armor (10% per point, up to 60%).
  // from: {x, z} of whatever hit the player, used to shove them away from it.
  hurt(amount, from = null) {
    const p = this.player;
    p.health = Math.max(0, p.health - amount * (1 - Math.min(0.6, this.defense * 0.1)));
    if (from) {
      const d = Math.hypot(p.x - from.x, p.z - from.z) || 1;
      this.knock = { x: ((p.x - from.x) / d) * 5, z: ((p.z - from.z) / d) * 5, t: 0.14 };
    }
    this.emit('hurt');
    if (p.health <= 0) this.faint();
  }

  // Strength of a swing with the held item.
  get attackPower() {
    const def = this.held ? ITEMS[this.held.id] : null;
    return (def?.weapon ?? (def?.tool === 'axe' || def?.tool === 'pickaxe' ? 2 : 1)) * this.progress.damageScale;
  }

  attack(e) {
    const p = this.player, d = Math.hypot(e.x - p.x, e.z - p.z) || 1;
    this.emit('swing', { x: e.x - 0.5, z: e.z - 0.5 });
    e.hp -= this.attackPower;
    this.wearTool();
    e.stun = 0.25;
    e.kx = ((e.x - p.x) / d) * 7;
    e.kz = ((e.z - p.z) / d) * 7;
    this.emit('hit', { x: Math.floor(e.x), z: Math.floor(e.z) });
    if (e.hp <= 0) {
      this.removeEnemy(e);
      this.record('kill');
      if (ENEMY_KINDS[e.kind].loot) this.give(ENEMY_KINDS[e.kind].loot, 1);
      else if (e.kind === 'golem') {
        this.give('stone', 3);
        this.give('iron_ore', 2);
        if (Math.random() < 0.5) this.give('crystal', 1);
      } else if (e.kind === 'spitter') {
        if (Math.random() < 0.6) this.give('coal', 1);
      } else if (e.kind === 'snapper') {
        this.give('raw_fish', 2);
        if (Math.random() < 0.25) this.give('pearl', 1);
      } else if (e.kind === 'brute') {
        this.give('coal', 2);
        if (Math.random() < 0.5) this.give('copper_ore', 1);
      } else if (Math.random() < 0.4) this.give('coal', 1);
    }
  }

  // ---- per-frame simulation ----
  tick(dt, sprinting = false) {
    this.time += dt / DAY_SECONDS;
    if (this.time >= 1) {
      this.startDay();
    }
    this.statusTimer -= dt;
    if (this.statusTimer <= 0) {
      this.statusTimer = 0.5;
      this.updateStatus();
    }
    if (this.knock) {
      // brief shove from the last hit; walls and ledges still stop it
      this.move(this.knock.x * dt, this.knock.z * dt);
      if ((this.knock.t -= dt) <= 0) this.knock = null;
    }
    // rain soaks every tilled plot, once when it starts
    const rain = this.raining;
    if (rain && !this.wasRaining) {
      for (const [key, o] of [...this.world.over]) {
        if (o.t !== 'soil' || o.wet) continue;
        const [x, z] = key.split(',').map(Number);
        this.world.set(x, z, { ...o, wet: true });
      }
      this.toast('It starts to rain');
    }
    this.wasRaining = rain;
    // standing in lava burns, again and again until you get out
    const here = this.gen.tile(Math.floor(this.player.x), Math.floor(this.player.z));
    this.burnTimer = Math.max(0, (this.burnTimer ?? 0) - dt);
    if (here.lava && this.player.y <= here.h + 0.1 && this.burnTimer <= 0) {
      this.burnTimer = 0.6;
      this.toast('The lava burns!');
      this.hurt(2);
    }
    // the sea of the volcanic region boils: swimming in it, wading in it or sailing a wooden boat over it
    // scalds, and no gear helps. Only a submarine can cross it.
    const sea = this.gen.tile(Math.floor(this.player.x), Math.floor(this.player.z));
    this.scalding = sea.boiling && this.vehicle?.kind !== 'submarine';
    this.scaldTimer = Math.max(0, (this.scaldTimer ?? 0) - dt);
    if (this.scalding && this.scaldTimer <= 0) {
      this.scaldTimer = 0.5;
      this.toast(this.vehicle ? 'The boiling sea is cooking your boat. Only a submarine can cross it!' : 'The sea is boiling! Get out!');
      this.player.health = Math.max(0, this.player.health - 1.5);
      this.emit('hurt');
    }
    // the frozen and volcanic regions wear down anyone without the gear for them
    const ex = this.exposure();
    this.exposed = ex;
    if (ex.short > 0) {
      this.player.health = Math.max(0, this.player.health - (dt * ex.short * (this.progress.has('weatherproof') ? 0.65 : 1)) / EXPOSURE_SECONDS);
      this.exposureTimer = (this.exposureTimer ?? 0) - dt;
      if (this.exposureTimer <= 0) {
        this.exposureTimer = 1.6;
        this.emit('hurt');
      }
    }
    this.wildlife.tick(dt);
    this.encounters.step(this, dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    // breath: runs down with your head under water, comes back quickly at the surface
    const pl = this.player, under = this.submerged;
    if (under) {
      // a diving mask stretches each breath
      const head = this.armor.slots[0];
      const stretch = ((head && ITEMS[head.id].air) || 1) * (this.progress.has('deep_lungs') ? 1.5 : 1);
      pl.breath = Math.max(0, pl.breath - (dt * MAX_BREATH) / (BREATH_SECONDS * stretch));
      if (pl.breath <= 0) pl.health = Math.max(0, pl.health - dt / SUFFOCATE_SECONDS);
    } else pl.breath = Math.min(MAX_BREATH, pl.breath + (dt * MAX_BREATH) / 3);
    if (under !== this.wasUnder) this.emit(under ? 'dive' : 'surface');
    this.wasUnder = under;
    const drain = DIFFICULTIES[this.difficulty].drain;
    if (this.swimming) {
      // swimming uses energy; with none left you start to drown
      const p = this.player;
      p.stamina = Math.max(0, p.stamina - (dt * drain * (this.progress.has('swimmer') ? 0.6 : 1) * MAX_STAMINA) / SWIM_SECONDS);
      if (p.stamina <= 0) {
        p.health = Math.max(0, p.health - dt / DROWN_SECONDS);
        if (!this.drowning) this.toast('You are drowning! Get to land');
        this.drowning = true;
      }
    } else {
      this.drowning = false;
      const mods = { max: this.maxStamina, regen: this.progress.has('second_wind') ? 1.4 : 1, sprintCost: this.progress.has('pathfinder') ? 0.7 : 1 };
      if (tickStamina(this.player, dt, sprinting, drain, mods)) this.toast('Out of breath. Walk for a moment to recover');
    }
    const needs = drain * this.progress.needsScale;
    if (tickSurvival(this.player, dt, sprinting, this.hungerRate, needs, { maxHealth: this.maxHealth, regen: this.progress.has('mender') ? 2 : 1 })) this.faint();
  }

  // Everything outside the hotbar is left in a pack where you fell (hotbar and worn items stay with you).
  dropPack() {
    const p = this.player, px = Math.floor(p.x), pz = Math.floor(p.z);
    const carried = this.inv.slots.slice(HOTBAR).filter(Boolean);
    if (!carried.length) return false;
    for (let r = 0; r <= 3; r++) {
      for (let z = pz - r; z <= pz + r; z++) {
        for (let x = px - r; x <= px + r; x++) {
          if (this.world.get(x, z) || this.gen.tile(x, z).water) continue;
          const items = Array(27).fill(null);
          carried.forEach((s, i) => (items[i] = s));
          for (let i = HOTBAR; i < this.inv.slots.length; i++) this.inv.slots[i] = null;
          this.world.set(x, z, { t: 'lostbag', placed: true, items });
          p.lost = { x, z };
          return true;
        }
      }
    }
    return false;
  }

  faint() {
    const p = this.player;
    p.riding = null;
    const dropped = this.dropPack();
    p.health = 6;
    p.hunger = 6;
    p.thirst = 6;
    p.stamina = this.maxStamina;
    p.winded = false;
    p.breath = MAX_BREATH;
    if (p.bed) {
      p.x = p.bed.x + 0.5;
      p.z = p.bed.z + 1.5;
    } else {
      p.x = p.spawn.x + 0.5;
      p.z = p.spawn.z + 0.5;
    }
    p.y = this.ground(p.x, p.z);
    p.vy = 0;
    for (const e of [...this.enemies]) this.removeEnemy(e);
    this.startDay(true);
    this.toast(dropped ? 'You fainted. Your pack is where you fell (red dot on the map)' : 'You fainted and woke up the next morning');
    this.emit('faint');
  }
}
