import { Worldgen, WATER_Y, SWIM_DEPTH } from '../world/worldgen.js';
import { WorldState } from '../world/worldstate.js';
import { OBJECTS, CROP_RIPE } from '../world/objects.js';
import { ITEMS, stackSize, ARMOR_SLOTS, MAX_DEFENSE, BASE_STORAGE, FLASK_DRINKS } from './items.js';
import { Inventory } from './inventory.js';
import { matchRecipe, ingredients, layout, GRID } from './crafting.js';
import { Goals } from './goals.js';
import { tickSurvival, tickStamina, eat, drink, MAX_HEALTH, MAX_HUNGER, MAX_THIRST, MAX_STAMINA } from './survival.js';

export const DAY_SECONDS = 480;
export const REACH = 3.5;
export const CAN_CAPACITY = 10;
export const HOTBAR = 9;
export const CHEST_SLOTS = 18;
const STEP_LIP = 0.15; // height the player can walk up without jumping
const JUMP_SPEED = 6.2; // about 0.95 units high: clears a 0.5 step comfortably
const GRAVITY = 20;
const FLOAT_SINK = 0.95; // how far below the surface a swimmer's feet hang
const BANK_LIP = 1.45; // bank height you can climb out of the water onto
const DIVE_SPEED = 2.6, RISE_SPEED = 3, BUOYANCY = 0.7; // vertical speeds under water
export const MAX_BREATH = 10;
const BREATH_SECONDS = 26; // seconds of air on a full breath
const SUFFOCATE_SECONDS = 1.2; // seconds per heart lost once the air is gone
const SWIM_SECONDS = 22; // seconds of swimming on full energy before you start to drown
const DROWN_SECONDS = 1.6; // seconds per heart lost once out of energy in deep water
// brutes are bigger, slower and hit harder; they start turning up from day 4
export const ENEMY_KINDS = {
  gloomling: { hp: 6, speed: 2.5, damage: 1.5, size: 1 },
  brute: { hp: 14, speed: 1.9, damage: 2.5, size: 1.6 },
};
const FIRE_SAFE = 4; // creatures keep this far from a campfire
const COLD_HUNGER = 1.5; // extra hunger drain when cold with no armor (x2.5 in total)

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// All game rules and state. No rendering: the view listens to events.
// Events: toast{text}, hit{x,z}, swing, inv, goal, newday, faint, open{what,x,z}
export class Game {
  constructor(save = null) {
    this.seed = save?.seed ?? ((Math.random() * 2 ** 31) | 0);
    this.gen = new Worldgen(this.seed);
    this.world = new WorldState(this.gen, save?.world, save?.floors);
    this.armor = new Inventory(ARMOR_SLOTS.length, save?.armor); // worn items: head, body, feet
    this.status = 'ok'; // 'ok' | 'cold' | 'warm' | 'sheltered'
    this.statusTimer = 0;
    this.enemies = []; // night creatures, not saved
    this.nextEnemyId = 1;
    this.spawnTimer = 3;
    this.knock = null;
    this.inv = new Inventory(36, save?.inv);
    this.craftGrid = new Inventory(GRID * GRID, save?.craft);
    this.cursor = null; // stack being carried by the mouse in the inventory panel
    this.goals = new Goals(save?.goals);
    this.day = save?.day ?? 1;
    this.time = save?.time ?? 0.08; // 0 = 6:00, 0.25 = noon, 0.5 = 18:00
    this.selected = save?.selected ?? 0;
    this.player = save?.player ?? { x: 0.5, z: 0.5, health: MAX_HEALTH, hunger: 10, water: CAN_CAPACITY, bed: null };
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
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data = {}) { for (const fn of this.listeners) fn(type, data); }
  toast(text) { this.emit('toast', { text }); }

  get held() { return this.inv.slots[this.selected]; }
  get canSprint() { return !this.player.winded && this.player.stamina > 0 && !this.inWater; }
  get isNight() { return this.time > 0.56 && this.time < 0.96; }

  serialize() {
    return {
      seed: this.seed, world: this.world.toJSON(), floors: Object.fromEntries(this.world.floors),
      armor: this.armor.slots, inv: this.inv.slots, craft: this.craftGrid.slots, goals: this.goals.toJSON(),
      day: this.day, time: this.time, selected: this.selected, player: this.player,
    };
  }

  // ---- movement ----
  // animal: doors count as walls for animals
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
        if (od.block || (animal && od.door)) {
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
    if (!t.water) return t.h;
    return WATER_Y - t.bed > SWIM_DEPTH ? WATER_Y - FLOAT_SINK : t.bed;
  }

  get inWater() { return this.gen.tile(Math.floor(this.player.x), Math.floor(this.player.z)).water; }
  get swimming() { return this.deepAt(this.player.x, this.player.z); }
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
    const stuck = this.blocked(p.x, p.z); // e.g. something regrew on top of us: let the player walk out
    if (stuck || this.canEnter(p.x + dx, p.z)) p.x += dx;
    if (stuck || this.canEnter(p.x, p.z + dz)) p.z += dz;
  }

  // Gravity and jumping. Call after move() each frame.
  // In deep water there is no gravity: dive goes down, jump goes up, and you drift up slowly otherwise.
  physics(dt, jump, dive = false) {
    const p = this.player;
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
    } else p.vy -= GRAVITY * dt;
    p.y = Math.max(g, p.y + p.vy * dt);
  }

  inReach(tx, tz) {
    return Math.hypot(tx + 0.5 - this.player.x, tz + 0.5 - this.player.z) <= REACH;
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
  }

  giveDrops(drops) {
    for (const [id, min, max] of drops) this.give(id, rand(min, max));
  }

  record(key, n = 1) {
    if (this.goals.record(key, n)) {
      this.toast(this.goals.current ? 'Goal complete!' : 'All goals complete. Enjoy your homestead!');
    }
    this.emit('goal');
    this.emit('record', { key });
  }

  // ---- crafting grid and the stack held on the cursor ----
  craftResult() {
    return matchRecipe(this.craftGrid.slots.map((s) => s?.id ?? null), this.stationsNear());
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
  quickCraft(recipe, all = false) {
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
    } while (all && made < 99);
    if (made) this.toast(`Crafted ${made * recipe.n} ${ITEMS[recipe.out].name}`);
    return made;
  }

  // Throw away whatever is on the cursor.
  trashCursor() {
    if (!this.cursor) return;
    this.toast(`Discarded ${this.cursor.n} ${ITEMS[this.cursor.id].name}`);
    this.cursor = null;
    this.emit('inv');
  }

  // Can this recipe be made right now (station nearby and ingredients in the inventory)?
  canMake(recipe, stations = this.stationsNear()) {
    if (recipe.station && !stations.has(recipe.station)) return false;
    return Object.entries(ingredients(recipe)).every(([id, n]) => this.inv.has(id, n));
  }

  // Recipe book shortcut: lay the recipe's ingredients out in the grid if the inventory has them.
  // quiet: no messages when it cannot be done.
  fillRecipe(recipe, quiet = false) {
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
    if (!eat(this.player, food, ITEMS[held.id].water)) {
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
    if (!eat(this.player, ITEMS[s.id].food, ITEMS[s.id].water)) {
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
    return this.armor.slots.reduce((sum, s) => sum + (s ? ITEMS[s.id].def ?? 0 : 0), 0);
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
    if (!this.isNight) return (this.status = 'ok');
    if (this.world.getFloor(px, pz)) return (this.status = 'sheltered');
    for (let z = pz - 5; z <= pz + 5; z++) {
      for (let x = px - 5; x <= px + 5; x++) if (this.world.get(x, z)?.t === 'campfire') return (this.status = 'warm');
    }
    return (this.status = 'cold');
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
      if (obj.crop === CROP_RIPE) {
        this.world.set(tx, tz, { ...obj, crop: -1 });
        this.emit('hit', { x: tx, z: tz });
        this.give('wheat', rand(1, 2));
        this.give('seeds', rand(1, 2));
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
      power = def.power;
      this.wearTool();
    }
    if ((obj.t === 'chest' || obj.t === 'lostbag') && obj.items.some(Boolean)) {
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
    if (!def || (!def.place && !def.floor) || !this.inReach(tx, tz)) return false;
    const obj = this.world.get(tx, tz);
    if (this.gen.tile(tx, tz).water) return false;
    if (def.floor) return !this.world.getFloor(tx, tz) && !(obj && !obj.placed) && obj?.t !== 'soil';
    const p = this.player;
    return !obj && !(tx === Math.floor(p.x) && tz === Math.floor(p.z));
  }

  // ---- right click: place / plant / water / eat / interact ----
  secondary(tx, tz, hasTarget) {
    const held = this.held;
    const def = held ? ITEMS[held.id] : null;
    const p = this.player;

    if (def?.food) return void this.eatHeld();
    if (def?.armor) return void this.wear(this.selected);
    if (def?.flask) return void this.drinkWater();
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

    if (held?.id === 'seeds' && obj?.t === 'soil') {
      if (obj.crop >= 0) return;
      this.inv.removeAt(this.selected, 1);
      this.world.set(tx, tz, { ...obj, crop: 0 });
      this.record('plant');
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
      if (def.place === 'chest') placed.items = Array(CHEST_SLOTS).fill(null);
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
    if (obj.t === 'bed') {
      this.player.bed = { x: tx, z: tz };
      this.sleep();
    } else if (obj.t === 'chest' || obj.t === 'lostbag') this.emit('open', { what: 'chest', x: tx, z: tz });
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
    this.player.health = Math.min(MAX_HEALTH, this.player.health + 3);
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
    return !this.blocked(x, z, 0.3, true) && !this.world.getFloor(Math.floor(x), Math.floor(z)) && !this.nearCampfire(x, z, FIRE_SAFE);
  }

  spawnEnemy(x, z, kind = 'gloomling') {
    const e = { id: this.nextEnemyId++, kind, x, z, hp: ENEMY_KINDS[kind].hp, cool: 0.6, stun: 0, kx: 0, kz: 0, tx: x, tz: z, wait: 0 };
    this.enemies.push(e);
    return e;
  }

  trySpawnEnemy() {
    const p = this.player, a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 7;
    const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    if (!this.enemyCanStand(x, z) || this.nearCampfire(x, z, 8)) return null;
    return this.spawnEnemy(x, z, this.day >= 4 && Math.random() < 0.25 ? 'brute' : 'gloomling');
  }

  removeEnemy(e) {
    this.enemies.splice(this.enemies.indexOf(e), 1);
    this.emit('enemygone', { x: e.x, z: e.z });
  }

  updateEnemies(dt) {
    const p = this.player, night = this.isNight;
    if (night && this.enemies.length < Math.min(8, 3 + Math.floor(this.day / 2))) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 5;
        this.trySpawnEnemy();
      }
    }
    for (const e of [...this.enemies]) {
      const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
      if (!night) e.hp -= dt * 3; // daylight burns them away
      if (e.hp <= 0 || d > 48) {
        this.removeEnemy(e);
        continue;
      }
      e.cool -= dt;
      let mx = 0, mz = 0;
      if (e.stun > 0) {
        // knocked back by a hit
        e.stun -= dt;
        mx = e.kx * dt;
        mz = e.kz * dt;
      } else if (night && d < 16 && d > 0.6) {
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
      if (mx && this.enemyCanStand(e.x + mx, e.z)) e.x += mx;
      if (mz && this.enemyCanStand(e.x, e.z + mz)) e.z += mz;
      e.moving = mx !== 0 || mz !== 0;
      if (mx || mz) e.dir = Math.atan2(-mz, mx);
      if (night && d < 0.95 && e.cool <= 0 && e.stun <= 0) {
        e.cool = 1.3;
        this.hurt(ENEMY_KINDS[e.kind].damage, e);
      }
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
    return def?.weapon ?? (def?.tool === 'axe' || def?.tool === 'pickaxe' ? 2 : 1);
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
      if (e.kind === 'brute') {
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
    this.updateEnemies(dt);
    // breath: runs down with your head under water, comes back quickly at the surface
    const pl = this.player, under = this.submerged;
    if (under) {
      pl.breath = Math.max(0, pl.breath - (dt * MAX_BREATH) / BREATH_SECONDS);
      if (pl.breath <= 0) pl.health = Math.max(0, pl.health - dt / SUFFOCATE_SECONDS);
    } else pl.breath = Math.min(MAX_BREATH, pl.breath + (dt * MAX_BREATH) / 3);
    if (under !== this.wasUnder) this.emit(under ? 'dive' : 'surface');
    this.wasUnder = under;
    if (this.swimming) {
      // swimming uses energy; with none left you start to drown
      const p = this.player;
      p.stamina = Math.max(0, p.stamina - (dt * MAX_STAMINA) / SWIM_SECONDS);
      if (p.stamina <= 0) {
        p.health = Math.max(0, p.health - dt / DROWN_SECONDS);
        if (!this.drowning) this.toast('You are drowning! Get to land');
        this.drowning = true;
      }
    } else {
      this.drowning = false;
      if (tickStamina(this.player, dt, sprinting)) this.toast('Out of breath. Walk for a moment to recover');
    }
    if (tickSurvival(this.player, dt, sprinting, this.hungerRate)) this.faint();
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
    const dropped = this.dropPack();
    p.health = 6;
    p.hunger = 6;
    p.thirst = 6;
    p.stamina = MAX_STAMINA;
    p.winded = false;
    p.breath = MAX_BREATH;
    if (p.bed) {
      p.x = p.bed.x + 0.5;
      p.z = p.bed.z + 1.5;
    } else {
      p.x = 0.5;
      p.z = 0.5;
    }
    p.y = this.ground(p.x, p.z);
    p.vy = 0;
    for (const e of [...this.enemies]) this.removeEnemy(e);
    this.startDay(true);
    this.toast(dropped ? 'You fainted. Your pack is where you fell (red dot on the map)' : 'You fainted and woke up the next morning');
    this.emit('faint');
  }
}
