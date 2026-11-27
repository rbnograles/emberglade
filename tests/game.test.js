import { describe, it, expect } from 'vitest';
import { hash2, fbm } from '../src/core/noise.js';
import { Worldgen } from '../src/world/worldgen.js';
import { WorldState } from '../src/world/worldstate.js';
import { OBJECTS } from '../src/world/objects.js';
import { BIOMES, SHORE } from '../src/world/biomes.js';
import { Inventory } from '../src/game/inventory.js';
import { RECIPES, matchRecipe, ingredients, layout } from '../src/game/crafting.js';
import { ITEMS } from '../src/game/items.js';
import { Goals, GOALS } from '../src/game/goals.js';
import { tickSurvival, eat } from '../src/game/survival.js';
import { Game } from '../src/game/game.js';

// First tile (scanning outward) whose object satisfies `pred`
function findTile(game, pred, max = 200) {
  for (let r = 0; r < max; r++) {
    for (let z = -r; z <= r; z++) {
      for (let x = -r; x <= r; x++) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== r) continue;
        if (pred(game.world.get(x, z), game.gen.tile(x, z), x, z)) return [x, z];
      }
    }
  }
  throw new Error('no matching tile');
}
const isType = (t) => (o) => o?.t === t;
const emptyLand = (o, tile) => !o && !tile.water && !tile.shore && tile.biome !== 'sand';

describe('noise and worldgen', () => {
  it('is deterministic and bounded', () => {
    expect(hash2(3, 9, 5)).toBe(hash2(3, 9, 5));
    expect(hash2(3, 9, 5)).not.toBe(hash2(3, 9, 6));
    for (let i = 0; i < 500; i++) {
      const v = fbm(i * 0.37, i * 0.11, 4);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.01);
    }
  });

  it('generates the same world for the same seed', () => {
    const a = new Worldgen(42), b = new Worldgen(42);
    for (let x = -40; x < 40; x += 3) {
      for (let z = -40; z < 40; z += 3) {
        expect(a.tile(x, z).h).toBe(b.tile(x, z).h);
        expect(a.object(x, z)).toEqual(b.object(x, z));
      }
    }
  });

  it('keeps the start dry and clear, and never puts objects in water', () => {
    for (const seed of [1, 2, 3, 99]) {
      const g = new Worldgen(seed);
      expect(g.tile(0, 0).water).toBe(false);
      expect(g.object(0, 0)).toBe(null);
      for (let x = -60; x < 60; x++) {
        for (let z = -60; z < 60; z++) if (g.tile(x, z).water) expect(g.object(x, z)).toBe(null);
      }
    }
  });

  it('only spawns known objects, drops known items and recipes use known items', () => {
    for (const b of [...Object.values(BIOMES), SHORE]) {
      for (const [id] of b.spawn) expect(OBJECTS[id], id).toBeTruthy();
    }
    for (const o of Object.values(OBJECTS)) {
      for (const [id] of o.drops ?? []) expect(ITEMS[id], id).toBeTruthy();
      if (o.item) expect(ITEMS[o.item].place).toBeTruthy();
    }
    for (const r of RECIPES) {
      expect(ITEMS[r.out], r.out).toBeTruthy();
      for (const id of Object.keys(ingredients(r))) expect(ITEMS[id], id).toBeTruthy();
    }
  });
});

describe('world state', () => {
  it('regrows natural objects and keeps placed tiles clear', () => {
    const gen = new Worldgen(7);
    const w = new WorldState(gen);
    const g = { world: w, gen };
    const [x, z] = findTile(g, (o) => !!o);
    const natural = w.get(x, z);
    w.remove(x, z, 1, 3);
    expect(w.get(x, z)).toBe(null);
    w.newDay(3);
    expect(w.get(x, z)).toBe(null);
    w.newDay(4);
    expect(w.get(x, z)).toEqual(natural);
    w.set(x, z, { t: 'campfire', placed: true });
    w.remove(x, z, 5, 0);
    w.newDay(50);
    expect(w.get(x, z)).toBe(null);
  });

  it('grows only watered crops and survives a save round trip', () => {
    const gen = new Worldgen(7);
    const w = new WorldState(gen);
    w.set(100, 100, { t: 'soil', wet: true, crop: 0, placed: true });
    w.set(101, 100, { t: 'soil', wet: false, crop: 0, placed: true });
    w.newDay(2);
    expect(w.get(100, 100)).toMatchObject({ crop: 1, wet: false });
    expect(w.get(101, 100).crop).toBe(0);
    const copy = new WorldState(gen, JSON.parse(JSON.stringify(w.toJSON())));
    expect(copy.get(100, 100)).toEqual(w.get(100, 100));
  });
});

describe('inventory and crafting', () => {
  it('stacks, counts and removes', () => {
    const inv = new Inventory(2);
    expect(inv.add('wood', 150)).toBe(0);
    expect(inv.slots.map((s) => s.n)).toEqual([99, 51]);
    expect(inv.add('stone', 1)).toBe(1);
    expect(inv.remove('wood', 120)).toBe(true);
    expect(inv.count('wood')).toBe(30);
    expect(inv.remove('wood', 31)).toBe(false);
    expect(inv.add('stone_axe', 2)).toBe(1);
  });

  it('matches grid patterns anywhere, mirrored, and respects stations', () => {
    const none = new Set(), all = new Set(['workbench', 'campfire']);
    const _ = null, S = 'stone', K = 'stick';
    const out = (cells, st = none) => matchRecipe(cells, st)?.out ?? null;
    expect(out([S, S, _, S, K, _, _, _, _])).toBe('stone_axe');
    expect(out([_, _, _, _, S, S, _, K, S])).toBe('stone_axe'); // shifted and mirrored
    expect(out([S, S, _, K, K, _, _, _, _])).toBe('stone_pickaxe');
    expect(out([_, S, _, _, K, _, _, _, _])).toBe('hoe');
    expect(out([S, K, _, _, _, _, _, _, _])).toBe(null);
    expect(out(Array(9).fill(null))).toBe(null);
    expect(out([_, _, _, _, 'wood', _, _, _, _])).toBe('stick');
    const chest = layout(RECIPES.find((r) => r.out === 'chest'));
    expect(out(chest)).toBe(null);
    expect(out(chest, all)).toBe('chest');
    expect(out(['coal', _, _, _, _, _, _, _, 'copper_ore'], all)).toBe('copper_bar');
    // every recipe's own layout makes that recipe and nothing else
    for (const r of RECIPES) expect(out(layout(r), all)).toBe(r.out);
  });
});

describe('goals and survival', () => {
  it('advances through every goal', () => {
    const goals = new Goals();
    for (const g of GOALS) {
      expect(goals.current).toBe(g);
      expect(goals.record('nonsense')).toBe(false);
      const entries = Object.entries(g.need);
      entries.forEach(([k, n], i) => expect(goals.record(k, n)).toBe(i === entries.length - 1));
    }
    expect(goals.current).toBe(null);
  });

  it('starves, regenerates and eats', () => {
    const p = { health: 5, hunger: 10 };
    tickSurvival(p, 6);
    expect(p.health).toBeGreaterThan(5);
    expect(eat(p, 5)).toBe(true);
    p.hunger = 0;
    expect(tickSurvival(p, 1000)).toBe(true);
  });
});

describe('game rules', () => {
  const newGame = () => new Game({ seed: 1234 });

  it('picks sticks by hand and counts them toward the goal', () => {
    const g = newGame();
    const [x, z] = findTile(g, isType('stick'));
    g.primary(x, z);
    expect(g.inv.count('stick')).toBe(1);
    expect(g.world.get(x, z)).toBe(null);
    expect(g.goals.status.done).toBe(1);
  });

  it('needs an axe to fell a tree', () => {
    const g = newGame();
    const [x, z] = findTile(g, (o) => o?.t.startsWith('tree_'));
    for (let i = 0; i < 6; i++) g.primary(x, z);
    expect(g.world.get(x, z)).not.toBe(null);
    g.inv.add('stone_axe', 1);
    for (let i = 0; i < 4; i++) g.primary(x, z);
    expect(g.world.get(x, z)).toBe(null);
    expect(g.inv.count('wood')).toBeGreaterThanOrEqual(3);
  });

  it('places and picks up a campfire, and blocks movement through it', () => {
    const g = newGame();
    g.inv.add('campfire', 1);
    g.secondary(1, 0, true);
    expect(g.world.get(1, 0).t).toBe('campfire');
    expect(g.inv.count('campfire')).toBe(0);
    expect(g.stationsNear().has('campfire')).toBe(true);
    expect(g.blocked(1.5, 0.5)).toBe(true);
    g.primary(1, 0);
    g.primary(1, 0);
    expect(g.world.get(1, 0)).toBe(null);
    expect(g.inv.count('campfire')).toBe(1);
  });

  it('needs a jump to climb a ledge, but walks down freely', () => {
    const g = newGame();
    // a tile whose east neighbour is one step higher, with nothing in the way
    const [x, z] = findTile(g, (o, t, x, z) => !o && !t.water && g.gen.tile(x + 1, z).h === t.h + 0.5 && !g.world.get(x + 1, z)
      && !g.blocked(x + 0.5, z + 0.5) && !g.blocked(x + 1.5, z + 0.5));
    const p = g.player;
    Object.assign(p, { x: x + 0.5, z: z + 0.5, y: g.ground(x + 0.5, z + 0.5), vy: 0 });
    for (let i = 0; i < 60; i++) { g.move(0.05, 0); g.physics(1 / 60, false); }
    expect(p.x).toBeLessThan(x + 1);
    for (let i = 0; i < 60; i++) { g.move(0.05, 0); g.physics(1 / 60, true); }
    expect(p.x).toBeGreaterThan(x + 1);
    for (let i = 0; i < 60; i++) g.physics(1 / 60, false);
    expect(p.y).toBe(g.ground(p.x, p.z));
    // back on top of the ledge, then walk off it
    Object.assign(p, { x: x + 1.5, y: g.ground(x + 1.5, z + 0.5), vy: 0 });
    for (let i = 0; i < 40; i++) { g.move(-0.05, 0); g.physics(1 / 60, false); }
    expect(p.x).toBeLessThan(x + 1);
    expect(p.y).toBe(g.ground(p.x, p.z));
  });

  it('crafts through the grid with the cursor stack', () => {
    const g = newGame();
    g.inv.add('stone', 5);
    g.inv.add('stick', 3);
    // pick up the stones, drop three into the grid one at a time (right click), put the rest back
    g.clickSlot(g.inv, 0);
    expect(g.cursor).toEqual({ id: 'stone', n: 5 });
    for (const cell of [0, 1, 3]) g.clickSlot(g.craftGrid, cell, 2);
    g.clickSlot(g.inv, 0);
    expect(g.cursor).toBe(null);
    expect(g.craftResult()).toBe(null);
    g.clickSlot(g.inv, 1, 2); // take half the sticks (2)
    g.clickSlot(g.craftGrid, 4, 2);
    expect(g.craftResult().out).toBe('stone_axe');
    g.clickSlot(g.inv, 1); // put the remaining stick back
    g.clickOutput();
    expect(g.cursor).toEqual({ id: 'stone_axe', n: 1 });
    expect(g.craftGrid.slots.every((s) => !s)).toBe(true);
    expect(g.goals.progress).toEqual({}); // goal 3 not current yet, nothing recorded
    g.clearGrid();
    expect(g.inv.count('stone_axe')).toBe(1);
    expect(g.inv.count('stone')).toBe(2);
    expect(g.inv.count('stick')).toBe(2);

    // recipe book fill + shift-craft everything
    g.inv.add('wood', 7);
    g.craftGrid.slots[0] = { id: 'wood', n: 3 };
    g.inv.remove('wood', 3);
    g.clickOutput(true);
    expect(g.inv.count('stick')).toBe(8);
    expect(g.fillRecipe(RECIPES.find((r) => r.out === 'workbench'))).toBe(true);
    expect(g.craftResult().out).toBe('workbench');
    expect(g.fillRecipe(RECIPES.find((r) => r.out === 'chest'))).toBe(false); // no workbench nearby
    expect(g.inv.count('wood')).toBe(4);
  });

  it('equips from the inventory into the hotbar', () => {
    const g = newGame();
    g.inv.slots[0] = { id: 'stick', n: 2 };
    g.inv.slots[3] = { id: 'hoe', n: 1 };
    g.inv.slots[20] = { id: 'stone_axe', n: 1 };
    g.equip(20); // storage item swaps into the selected hotbar slot
    expect(g.held.id).toBe('stone_axe');
    expect(g.inv.slots[20]).toEqual({ id: 'stick', n: 2 });
    g.equip(3); // hotbar item is just selected
    expect(g.selected).toBe(3);
    expect(g.held.id).toBe('hoe');
    g.equip(20, 5); // number key over a slot: goes to that hotbar slot
    expect(g.selected).toBe(5);
    expect(g.held.id).toBe('stick');
  });

  it('eats with the eat key, wears armor and stays warm', () => {
    const g = newGame();
    expect(g.eatHeld()).toBe(false); // nothing held
    g.inv.slots[0] = { id: 'berries', n: 2 };
    g.player.hunger = 5;
    expect(g.eatHeld()).toBe(true);
    expect(g.player.hunger).toBe(6);
    expect(g.inv.count('berries')).toBe(1);

    // C eats from anywhere in the inventory, picking the food that fits the hunger
    g.selected = 4; // empty hand
    g.inv.slots[20] = { id: 'bread', n: 1 };
    g.player.hunger = 8.5;
    expect(g.inv.slots[g.foodSlot()].id).toBe('berries'); // bread would be wasted
    g.player.hunger = 2;
    expect(g.inv.slots[g.foodSlot()].id).toBe('bread');
    expect(g.eatFood()).toBe(true);
    expect(g.player.hunger).toBe(8);
    g.inv.remove('berries', 1);
    expect(g.eatFood()).toBe(false); // nothing left
    g.selected = 0;

    g.inv.slots[1] = { id: 'copper_helmet', n: 1 };
    g.inv.slots[2] = { id: 'woven_hat', n: 1 };
    g.selected = 1;
    g.secondary(0, 0, false); // right click wears it
    expect(g.armor.slots[0].id).toBe('copper_helmet');
    expect(g.defense).toBe(2);
    g.equip(2); // swapping helmets returns the old one to that slot
    expect(g.armor.slots[0].id).toBe('woven_hat');
    expect(g.inv.slots[2].id).toBe('copper_helmet');
    g.cursor = { id: 'woven_boots', n: 1 };
    g.clickArmor(0); // boots do not go on the head
    expect(g.cursor.id).toBe('woven_boots');
    g.clickArmor(2);
    expect(g.cursor).toBe(null);
    expect(g.defense).toBe(2);

    g.time = 0.7; // night, out in the open
    expect(g.updateStatus()).toBe('cold');
    expect(g.hungerRate).toBeCloseTo(2);
    g.world.set(2, 0, { t: 'campfire', placed: true });
    expect(g.updateStatus()).toBe('warm');
    expect(g.hungerRate).toBe(1);
    g.world.remove(2, 0);
    g.world.setFloor(0, 0, 'wood_floor');
    expect(g.updateStatus()).toBe('sheltered');
    g.time = 0.2;
    expect(g.updateStatus()).toBe('ok');
    const copy = new Game(JSON.parse(JSON.stringify(g.serialize())));
    expect(copy.defense).toBe(2);
    expect(copy.world.getFloor(0, 0)).toBe('wood_floor');
  });

  it('night creatures chase, bite, respect armor and bases, and die', () => {
    const g = newGame();
    const step = (seconds) => { for (let i = 0; i < seconds * 30; i++) g.updateEnemies(1 / 30); };
    g.spawnTimer = Infinity; // no random spawns in this test
    g.time = 0.7;

    // chases and bites
    const e = g.spawnEnemy(4.5, 0.5);
    step(3);
    expect(Math.hypot(e.x - g.player.x, e.z - g.player.z)).toBeLessThan(1.2);
    expect(g.player.health).toBeLessThan(10);

    // armor reduces the bite
    g.player.health = 10;
    g.hurt(2);
    expect(g.player.health).toBe(8);
    g.armor.slots[1] = { id: 'copper_chestplate', n: 1 };
    g.hurt(2);
    expect(g.player.health).toBeCloseTo(6.4);

    // a sword kills faster than bare hands, and knocks back
    g.inv.slots[0] = { id: 'stone_sword', n: 1 };
    expect(g.attackPower).toBe(3);
    g.attack(e);
    expect(e.hp).toBe(3);
    expect(e.stun).toBeGreaterThan(0);
    g.attack(e);
    expect(g.enemies.length).toBe(0);

    // walls keep them out
    for (let z = -2; z <= 2; z++) g.world.set(2, z, { t: 'stone_wall', placed: true });
    const blocked = g.spawnEnemy(4.5, 0.5);
    step(3);
    expect(blocked.x).toBeGreaterThan(3);
    g.removeEnemy(blocked);
    for (let z = -2; z <= 2; z++) g.world.remove(2, z);

    // campfire light keeps them back, and nothing spawns near one
    g.world.set(0, 1, { t: 'campfire', placed: true });
    const shy = g.spawnEnemy(7.5, 0.5);
    step(4);
    expect(Math.hypot(shy.x - 0.5, shy.z - 1.5)).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < 200; i++) g.trySpawnEnemy();
    expect(g.enemies.every((x) => !g.nearCampfire(x.x, x.z, 8) || x === shy)).toBe(true);

    // daylight burns them away
    g.time = 0.2;
    step(3);
    expect(g.enemies.length).toBe(0);
  });

  it('gets thirsty, drinks at ponds and from a flask', () => {
    const g = newGame();
    const p = g.player;
    g.tick(64); // two water points' worth of time
    expect(p.thirst).toBeCloseTo(8);
    expect(g.drinkSource()).toBe(null);
    expect(g.drinkWater()).toBe(false);
    g.inv.add('flask', 1);
    expect(g.drinkWater()).toBe(false); // flask starts empty

    const [wx, wz] = findTile(g, (o, t, x, z) => !t.water && g.gen.tile(x + 1, z).water);
    Object.assign(p, { x: wx + 0.5, z: wz + 0.5 });
    expect(g.drinkSource()).toBe('pond');
    expect(g.drinkWater()).toBe(true);
    expect(p.thirst).toBe(10);
    expect(p.flask).toBe(3);

    Object.assign(p, { x: 0.5, z: 0.5, thirst: 2 });
    expect(g.drinkSource()).toBe('flask');
    g.selected = g.inv.slots.findIndex((s) => s?.id === 'flask');
    g.secondary(0, 0, false); // right click with the flask drinks too
    expect(p.thirst).toBe(7);
    expect(p.flask).toBe(2);

    // running dry hurts, like starving
    p.thirst = 0;
    p.health = 5;
    p.hunger = 10;
    g.tick(8);
    expect(p.health).toBeLessThan(4.2);
  });

  it('tires from sprinting and recovers', () => {
    const g = newGame();
    const p = g.player;
    expect(g.canSprint).toBe(true);
    for (let i = 0; i < 70; i++) g.tick(0.1, true); // 7 seconds flat out
    expect(p.stamina).toBe(0);
    expect(p.winded).toBe(true);
    expect(g.canSprint).toBe(false);
    for (let i = 0; i < 10; i++) g.tick(0.1, false);
    expect(g.canSprint).toBe(false); // still winded after one second
    for (let i = 0; i < 10; i++) g.tick(0.1, false);
    expect(g.canSprint).toBe(true);
    for (let i = 0; i < 40; i++) g.tick(0.1, false);
    expect(p.stamina).toBe(10);
  });

  it('carries more with a bag and will not drop one that is in use', () => {
    const g = newGame();
    expect(g.capacity).toBe(18);
    expect(g.inv.add('stone', 99 * 18)).toBe(0);
    expect(g.inv.add('wood', 1)).toBe(1); // full without a bag
    g.inv.remove('stone', 99);
    g.inv.add('woven_bag', 1);
    g.wear(g.inv.slots.findIndex((s) => s?.id === 'woven_bag'));
    expect(g.capacity).toBe(27);
    expect(g.inv.add('wood', 99 * 10)).toBe(0);
    g.clickArmor(3); // try to take it off while the extra row is in use
    expect(g.armor.slots[3].id).toBe('woven_bag');
    expect(g.cursor).toBe(null);
    for (let i = 18; i < 27; i++) g.inv.slots[i] = null;
    g.clickArmor(3);
    expect(g.cursor.id).toBe('woven_bag');
    expect(g.capacity).toBe(18);
    const copy = new Game(JSON.parse(JSON.stringify(g.serialize())));
    expect(copy.capacity).toBe(18);
  });

  it('wears tools out, and the wear travels with the tool', () => {
    const g = newGame();
    g.inv.slots[0] = { id: 'stone_sword', n: 1, d: 2 };
    g.time = 0.7;
    g.spawnTimer = Infinity;
    const e = g.spawnEnemy(1.5, 0.5, 'brute');
    expect(e.hp).toBe(14);
    g.attack(e);
    expect(g.inv.slots[0].d).toBe(1);
    const chest = new Inventory(4);
    g.inv.moveTo(0, chest); // into a chest and back keeps the wear
    expect(chest.slots[0]).toEqual({ id: 'stone_sword', n: 1, d: 1 });
    chest.moveTo(0, g.inv);
    g.attack(e);
    expect(g.inv.slots[0]).toBe(null); // broke on its last use
    expect(e.hp).toBe(8);
    // an axe wears while chopping
    g.inv.slots[0] = { id: 'stone_axe', n: 1 };
    const [x, z] = findTile(g, (o) => o?.t.startsWith('tree_'));
    g.primary(x, z);
    expect(g.inv.slots[0].d).toBe(59);
  });

  it('leaves a pack behind when you faint, and gives it back', () => {
    const g = newGame();
    const p = g.player;
    g.inv.slots[0] = { id: 'stone_axe', n: 1 };
    g.inv.slots[10] = { id: 'wood', n: 12 };
    g.inv.slots[11] = { id: 'coal', n: 3 };
    Object.assign(p, { x: 6.5, z: 6.5 });
    g.hurt(99);
    expect(p.lost).toBeTruthy();
    expect(g.inv.slots[0].id).toBe('stone_axe'); // the hotbar stays with you
    expect(g.inv.count('wood')).toBe(0);
    const { x, z } = p.lost;
    const bag = g.world.get(x, z);
    expect(bag.t).toBe('lostbag');
    g.primary(x, z); // cannot be broken while full
    expect(g.world.get(x, z)).toBe(bag);
    const view = new Inventory(0, bag.items);
    view.moveTo(0, g.inv);
    view.moveTo(1, g.inv);
    expect(g.inv.count('wood')).toBe(12);
    expect(g.inv.count('coal')).toBe(3);
    g.primary(x, z);
    expect(g.world.get(x, z)).toBe(null);
    expect(p.lost).toBe(null);
  });

  it('tracks the later goals', () => {
    const g = newGame();
    const goalIndex = (text) => GOALS.findIndex((x) => x.text.startsWith(text));
    g.goals.index = goalIndex('Wear a bag');
    g.inv.slots[0] = { id: 'woven_bag', n: 1 };
    g.wear(0);
    expect(g.goals.index).toBe(goalIndex('Wear any piece'));
    g.inv.slots[0] = { id: 'woven_hat', n: 1 };
    g.wear(0);
    expect(g.goals.index).toBe(goalIndex('Build a shelter'));
    g.inv.slots[0] = { id: 'wood_wall', n: 6 };
    g.inv.slots[1] = { id: 'door', n: 1 };
    g.inv.slots[2] = { id: 'wood_floor', n: 2 };
    g.selected = 0;
    const walls = [[-1, -2], [0, -2], [1, -2], [-1, 2], [0, 2], [1, 2]];
    for (const [x, z] of [...walls, [1, 1], [0, 1], [-1, 1]]) g.world.set(x, z, { t: 'empty' }); // clear the site
    for (const [x, z] of walls) g.secondary(x, z, true);
    g.selected = 1;
    g.secondary(1, 1, true);
    g.selected = 2;
    g.secondary(0, 1, true);
    g.secondary(-1, 1, true);
    expect(g.goals.index).toBe(goalIndex('Sleep in a bed'));
    g.time = 0.7;
    g.sleep();
    expect(g.goals.current).toBe(null);
  });

  it('builds walls, floors and doors', () => {
    const g = newGame();
    g.inv.slots[0] = { id: 'wood_wall', n: 2 };
    g.inv.slots[1] = { id: 'wood_floor', n: 2 };
    g.inv.slots[2] = { id: 'door', n: 1 };
    g.inv.slots[3] = { id: 'bed', n: 1 };
    g.selected = 0;
    g.secondary(1, 0, true);
    expect(g.world.get(1, 0).t).toBe('wood_wall');
    expect(g.blocked(1.05, 0.05, 0.1)).toBe(true); // the corner of a wall tile is solid too
    g.selected = 2;
    g.secondary(0, 1, true);
    expect(g.blocked(0.5, 1.5)).toBe(false); // the player walks through a door
    expect(g.blocked(0.5, 1.5, 0.28, true)).toBe(true); // animals do not
    g.selected = 1;
    g.secondary(-1, 0, true);
    expect(g.world.getFloor(-1, 0)).toBe('wood_floor');
    g.selected = 3;
    g.secondary(-1, 0, true); // furniture stands on a floor
    expect(g.world.get(-1, 0).t).toBe('bed');
    g.primary(-1, 0);
    g.primary(-1, 0); // bed comes up first...
    expect(g.world.get(-1, 0)).toBe(null);
    expect(g.world.getFloor(-1, 0)).toBe('wood_floor');
    g.primary(-1, 0); // ...then the floor
    expect(g.world.getFloor(-1, 0)).toBe(null);
    expect(g.inv.count('wood_floor')).toBe(2);
    g.primary(1, 0);
    g.primary(1, 0);
    expect(g.inv.count('wood_wall')).toBe(2);
  });

  it('farms: till, plant, water, grow, harvest', () => {
    const g = newGame();
    const [x, z] = findTile(g, emptyLand);
    g.inv.add('hoe', 1);
    g.inv.add('seeds', 1);
    g.inv.add('watering_can', 1);
    g.selected = 0;
    g.primary(x, z);
    expect(g.world.get(x, z).t).toBe('soil');
    g.selected = 1;
    g.secondary(x, z, true);
    expect(g.world.get(x, z).crop).toBe(0);
    g.selected = 2;
    for (let d = 0; d < 3; d++) {
      g.secondary(x, z, true);
      expect(g.world.get(x, z).wet).toBe(true);
      g.startDay();
    }
    expect(g.world.get(x, z).crop).toBe(3);
    expect(g.player.water).toBe(7);
    g.primary(x, z);
    expect(g.inv.count('wheat')).toBeGreaterThanOrEqual(1);
    expect(g.world.get(x, z).crop).toBe(-1);
  });

  it('eats, sleeps only late, faints and round-trips a save', () => {
    const g = newGame();
    g.inv.add('bread', 1);
    g.player.hunger = 2;
    g.secondary(0, 0, false);
    expect(g.player.hunger).toBe(8);
    g.time = 0.2;
    expect(g.sleep()).toBe(false);
    g.time = 0.7;
    expect(g.sleep()).toBe(true);
    expect(g.day).toBe(2);
    g.player.hunger = 0;
    g.player.health = 0.01;
    g.tick(1);
    expect(g.day).toBe(3);
    expect(g.player.health).toBe(6);
    const copy = new Game(JSON.parse(JSON.stringify(g.serialize())));
    expect(copy.serialize()).toEqual(g.serialize());
  });
});
