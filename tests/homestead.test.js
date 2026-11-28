import { describe, it, expect } from 'vitest';
import { Game, ENEMY_KINDS, VEHICLES } from '../src/game/game.js';
import { ITEMS } from '../src/game/items.js';
import { OBJECTS } from '../src/world/objects.js';
import { RECIPES } from '../src/game/crafting.js';
import { CROPS } from '../src/world/crops.js';
import { WILDLIFE } from '../src/game/wildlife.js';
import { KEEPERS, carvingId } from '../src/game/keepers.js';
import { suitsSite, attackWarnings, inWarning, rewardFor } from '../src/game/encounters.js';
import { Progress, SKILLS, STAT_CAP, MAX_LEVEL, xpToNext } from '../src/game/progress.js';
import { tickSurvival, tickStamina } from '../src/game/survival.js';
import { STOREY } from '../src/world/worldstate.js';
import { summarise, eventFor } from '../src/game/summary.js';
import { cloud, syncWorld, fetchWorld } from '../src/cloud.js';
import { buildModels, buildItemModels } from '../src/render/models.js';

const newGame = () => new Game({ seed: 1 });
const recipeFor = (id) => RECIPES.find((r) => r.out === id);

// A flat, empty square of land (side `size`) near the start; returns its corner.
function clearing(g, size) {
  for (let r = 2; r < 200; r++) {
    for (let z = -r; z <= r; z++) {
      for (let x = -r; x <= r; x++) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== r) continue;
        const h = g.gen.tile(x, z).h;
        let ok = true;
        for (let dz = 0; dz < size && ok; dz++) {
          for (let dx = 0; dx < size && ok; dx++) {
            const t = g.gen.tile(x + dx, z + dz);
            ok = !t.water && !t.lava && t.h === h && !g.world.get(x + dx, z + dz);
          }
        }
        if (ok) return [x, z];
      }
    }
  }
  throw new Error('no clearing');
}
const standAt = (g, x, z) => Object.assign(g.player, { x: x + 0.5, z: z + 0.5, y: g.ground(x + 0.5, z + 0.5), vy: 0 });
const hold = (g, id, n = 1) => {
  g.inv.slots[0] = { id, n };
  g.selected = 0;
};

describe('models', () => {
  it('has a sculpture for everything that can appear', () => {
    const world = buildModels(), items = buildItemModels(world);
    for (const id of Object.keys(ITEMS)) expect(items.get(id), 'item ' + id).toBeTruthy();
    for (const id of Object.keys(OBJECTS)) {
      if (id === 'soil' || id === 'fence' || id === 'flower') continue; // drawn from parts or variants
      expect(world.get(id), 'object ' + id).toBeTruthy();
    }
    for (const id of [...Object.keys(WILDLIFE), ...Object.keys(ENEMY_KINDS), ...Object.keys(VEHICLES)]) expect(world.get(id), id).toBeTruthy();
    for (const [id, crop] of Object.entries(CROPS)) {
      for (let stage = 0; stage <= crop.days; stage++) expect(world.get((id === 'wheat' ? 'crop' : id) + stage), id + stage).toBeTruthy();
    }
    // trees come in more than one shape
    expect(world.get('tree_oak#1')).not.toBe(world.get('tree_oak'));
    expect(world.get('tree_pine#1')).toBeTruthy();
  });

  it('has distinct open and closed door models', () => {
    const world = buildModels();
    const closed = world.get('door_closed');
    const open = world.get('door_open');
    const different = !!closed && !!open && JSON.stringify(closed.pos) !== JSON.stringify(open.pos);
    expect({ closed: !!closed, open: !!open, different }).toEqual({ closed: true, open: true, different: true });
  });
});

describe('farm', () => {
  it('grows each crop at its own pace, and a cistern waters its neighbours', () => {
    const g = newGame();
    const [x, z] = clearing(g, 3);
    standAt(g, x + 1, z);
    for (const [i, [seed, crop]] of [['turnip_seeds', 'turnip'], ['pumpkin_seeds', 'pumpkin']].entries()) {
      hold(g, 'hoe');
      g.primary(x + i * 2, z + 1);
      hold(g, seed);
      g.secondary(x + i * 2, z + 1, true);
      expect(g.world.get(x + i * 2, z + 1).species).toBe(crop);
    }
    // nothing grows dry
    g.startDay();
    expect(g.world.get(x, z + 1).crop).toBe(0);
    // the cistern between them waters both every morning
    hold(g, 'irrigator');
    g.secondary(x + 1, z + 1, true);
    expect(g.world.get(x + 1, z + 1).t).toBe('irrigator');
    g.startDay();
    g.startDay();
    expect(g.world.get(x, z + 1).crop).toBe(CROPS.turnip.days);
    expect(g.world.get(x + 2, z + 1).crop).toBe(2);
    hold(g, 'hoe');
    g.primary(x, z + 1);
    expect(g.inv.count('turnip')).toBeGreaterThanOrEqual(1);
    expect(g.inv.count('turnip_seeds')).toBeGreaterThanOrEqual(1);
    for (let d = 0; d < 3; d++) g.startDay();
    expect(g.world.get(x + 2, z + 1).crop).toBe(CROPS.pumpkin.days);
  });

  it('tames, pens, breeds and gathers from animals, and hunts wild ones', () => {
    const g = newGame();
    g.spawnTimer = Infinity;
    const [x, z] = clearing(g, 5);
    standAt(g, x + 2, z + 2);
    // a ring of fence with one gate around the middle 3x3
    for (let i = 0; i < 5; i++) {
      for (const [fx, fz] of [[x + i, z], [x + i, z + 4], [x, z + i], [x + 4, z + i]]) {
        if (!g.world.get(fx, fz)) g.world.set(fx, fz, { t: fx === x + 2 && fz === z ? 'gate' : 'fence', placed: true });
      }
    }
    expect(g.blocked(x + 2.5, z + 0.5)).toBe(true); // a shut gate stops you
    g.interact(x + 2, z);
    expect(g.blocked(x + 2.5, z + 0.5)).toBe(false);
    g.interact(x + 2, z);

    const a = g.wildlife.spawn('hen', x + 1.5, z + 1.5), b = g.wildlife.spawn('hen', x + 3.5, z + 3.5);
    hold(g, 'wheat', 5);
    g.wildlife.handle(a);
    expect(a.tame).toBe(true);
    expect(g.wildlife.list.length).toBe(2); // one fed hen is not a pair
    g.wildlife.handle(b);
    expect(g.wildlife.list.length).toBe(3);
    const chick = g.wildlife.list[2];
    expect(chick.tame).toBe(true);
    expect(chick.grownDay).toBeGreaterThan(g.day);
    g.wildlife.handle(a); // already fed today
    expect(g.inv.count('wheat')).toBe(3);

    // an open gate is not a pen
    g.day++;
    g.interact(x + 2, z);
    g.wildlife.handle(a);
    g.wildlife.handle(b);
    expect(g.wildlife.list.length).toBe(3);

    // a tame hen gives one egg a day
    g.inv.slots[0] = null;
    g.wildlife.handle(a);
    g.wildlife.handle(a);
    expect(g.inv.count('egg')).toBe(1);

    // tame animals are saved; wild ones are not
    g.wildlife.spawn('deer', x + 2.5, z + 2.5);
    const again = new Game(JSON.parse(JSON.stringify(g.serialize())));
    expect(again.wildlife.list.length).toBe(3);

    // hunting
    const deer = g.wildlife.list.find((w) => w.kind === 'deer');
    hold(g, 'iron_sword');
    g.wildlife.hit(deer);
    expect(g.wildlife.list.includes(deer)).toBe(false);
    expect(g.inv.count('hide')).toBe(1);
  });
});

describe('house', () => {
  it('roofs a tile over furniture, lifts off again, and is saved', () => {
    const g = newGame();
    const [x, z] = clearing(g, 2);
    standAt(g, x + 1, z + 1);
    hold(g, 'table');
    g.secondary(x, z, true);
    hold(g, 'roof', 2);
    expect(g.canPlace(x, z)).toBe(true); // over furniture
    g.secondary(x, z, true);
    expect(g.world.getRoof(x, z)).toBe('roof');
    expect(g.canPlace(x, z)).toBe(false);
    expect(new Game(JSON.parse(JSON.stringify(g.serialize()))).world.getRoof(x, z)).toBe('roof');
    g.primary(x, z); // holding a roof: the roof comes off, the table stays
    expect(g.world.getRoof(x, z)).toBeFalsy();
    expect(g.world.get(x, z).t).toBe('table');
    expect(g.inv.count('roof')).toBe(2);
  });

  it('stores things in a cabinet', () => {
    const g = newGame();
    const [x, z] = clearing(g, 2);
    standAt(g, x + 1, z + 1);
    hold(g, 'cabinet');
    g.secondary(x + 1, z, true);
    expect(g.world.get(x + 1, z).items.length).toBeGreaterThan(0);
  });
});

describe('vehicles', () => {
  it('builds boats, submarines and carts from parts', () => {
    expect(recipeFor('boat').shapeless.sort()).toEqual(['hull', 'oar']);
    expect(recipeFor('submarine').shapeless.sort()).toEqual(['pressure_hull', 'propeller']);
    expect(recipeFor('trail_cart').shapeless.sort()).toEqual(['axle', 'axle', 'hull']);
    for (const part of ['hull', 'oar', 'pressure_hull', 'propeller', 'axle']) expect(recipeFor(part), part).toBeTruthy();
  });

  it('drives a cart over land, faster than walking, and not into water', () => {
    const g = newGame();
    g.spawnTimer = Infinity;
    const [x, z] = clearing(g, 6);
    standAt(g, x, z + 2);
    hold(g, 'trail_cart');
    expect(g.canPlace(x + 1, z + 2)).toBe(true);
    g.secondary(x + 1, z + 2, true);
    expect(g.vehicles.length).toBe(1);
    expect(g.board()).toBe(true);
    const from = g.player.x;
    for (let i = 0; i < 10; i++) { g.move(0.2, 0); g.physics(0.05, false, false); }
    expect(g.player.x).toBeGreaterThan(from + 1.5);
    expect(g.vehicle.y).toBeCloseTo(g.ground(g.player.x, g.player.z));
    expect(VEHICLES.trail_cart.speed).toBeGreaterThan(6);
    // drive on until something stops it: it must never end up afloat
    for (let i = 0; i < 4000; i++) {
      const before = g.player.x;
      g.move(0.2, 0);
      if (g.player.x === before) break;
    }
    expect(g.gen.tile(Math.floor(g.player.x), Math.floor(g.player.z)).water).toBe(false);
  });
});

describe('keepers', () => {
  it('gives each of the twelve a fixed home in its own kind of place', () => {
    const a = newGame(), b = newGame();
    expect(KEEPERS.length).toBe(12);
    for (let i = 0; i < 6000 && a.encounters.sites.size < 12; i++) a.encounters.locate(a.gen, 40);
    for (let i = 0; i < 6000 && b.encounters.sites.size < 12; i++) b.encounters.locate(b.gen, 40);
    expect(a.encounters.sites.size).toBe(12);
    for (const k of KEEPERS) {
      const site = a.encounters.sites.get(k.id);
      expect(suitsSite(k, a.gen.tile(Math.floor(site.x), Math.floor(site.z))), k.id).toBe(true);
      expect(b.encounters.sites.get(k.id)).toEqual(site); // same seed, same place
    }
    // every kind of place matters
    for (const place of ['meadow', 'autumn', 'blossom', 'pine', 'sand', 'mountain', 'deep', 'frost', 'heat']) {
      expect(KEEPERS.some((k) => k.biome === place), place).toBe(true);
    }
  });

  it('is found, needs the right gear, fights back, and rewards a carving', () => {
    const g = newGame();
    g.spawnTimer = g.seaTimer = g.golemTimer = Infinity;
    const k = KEEPERS[0], carving = recipeFor(carvingId(k));
    while (!g.encounters.sites.has(k.id)) g.encounters.locate(g.gen, 40);
    const site = g.encounters.sites.get(k.id);
    Object.assign(g.player, { x: site.x + 1.5, z: site.z, y: site.y, vy: 0 });
    expect(g.knowsRecipe(carving)).toBe(false);
    g.tick(0.5);
    expect(g.encounters.discovered.has(k.id)).toBe(true);
    const boss = g.encounters.active;
    expect(boss.spec).toBe(k);

    // bare hands will not wake it
    expect(g.encounters.strike(g, boss)).toBe(false);
    expect(boss.engaged).toBe(false);
    hold(g, 'stone_sword');
    expect(g.encounters.strike(g, boss)).toBe(true);
    expect(boss.hp).toBeLessThan(k.hp);

    // it marks the ground first, then hurts whoever is still standing there
    g.player.health = 10;
    for (let i = 0; i < 200 && !boss.warnings.length; i++) g.encounters.step(g, 0.05);
    expect(boss.warnings.length).toBeGreaterThan(0);
    expect(boss.warnings.some((w) => inWarning(g.player, w))).toBe(true);
    for (let i = 0; i < 40 && boss.warnings.length; i++) g.encounters.step(g, 0.05);
    expect(g.player.health).toBeLessThan(10);

    // marked ground you are not standing on does no harm
    for (let i = 0; i < 200 && !boss.warnings.length; i++) g.encounters.step(g, 0.05);
    g.player.health = 10;
    for (const w of boss.warnings) w.x += 50;
    for (let i = 0; i < 40 && boss.warnings.length; i++) g.encounters.step(g, 0.05);
    expect(g.player.health).toBe(10);

    for (let i = 0; i < 40 && g.encounters.active; i++) g.encounters.strike(g, boss);
    expect(g.encounters.restored.has(k.id)).toBe(true);
    expect(g.encounters.active).toBe(null);
    expect(g.knowsRecipe(carving)).toBe(true);

    // progress survives a save
    const again = new Game(JSON.parse(JSON.stringify(g.serialize())));
    expect(again.encounters.restored.has(k.id)).toBe(true);
    expect(again.knowsRecipe(carving)).toBe(true);
  });

  it('every attack pattern marks some ground, and the last keeper ends the story', () => {
    for (const k of KEEPERS) {
      for (const beat of [0, 1]) {
        const marks = attackWarnings({ x: 0, z: 0, beat, spec: k }, { x: 2, z: 1 });
        expect(marks.length, k.id).toBeGreaterThan(0);
      }
    }
    const g = newGame();
    let ended = 0;
    g.on((type) => { if (type === 'restored') ended++; });
    hold(g, 'ember_pike');
    for (const k of KEEPERS) {
      for (const slot of [0, 1, 2]) g.armor.slots[slot] = null;
      if (k.gear) g.armor.slots[1] = { id: k.gear, n: 1 };
      g.encounters.active = { x: g.player.x + 1, z: g.player.z, y: g.player.y, spec: k, hp: 1, beat: 0, timer: 1, warnings: [], engaged: false, hit: 0 };
      expect(g.encounters.strike(g, g.encounters.active), k.id).toBe(true);
    }
    expect(g.encounters.complete).toBe(true);
    expect(ended).toBe(1);
  });
});

describe('levels, stats and skills', () => {
  it('levels up to 100 and hands out stat and skill points', () => {
    const pr = new Progress();
    expect(pr.level).toBe(1);
    expect(pr.addXp(xpToNext(1) - 1)).toBe(0);
    expect(pr.addXp(1)).toBe(1);
    expect(pr.statPoints).toBe(1);
    expect(pr.skillPoints).toBe(0);
    pr.addXp(xpToNext(2));
    expect(pr.skillPoints).toBe(1); // level 3
    expect(pr.addXp(1e9)).toBe(MAX_LEVEL - 3);
    expect(pr.level).toBe(100);
    expect(pr.addXp(500)).toBe(0); // nothing past the top
    expect(pr.statPoints).toBe(99);
    // a stat stops at its cap, and every skill in the tree can be afforded by level 100
    for (let i = 0; i < 30; i++) pr.raise('vitality');
    expect(pr.stats.vitality).toBe(STAT_CAP);
    expect(pr.maxHealth).toBe(20);
    expect(pr.learn('keen_edge')).toBe(false); // needs Tough hide first
    for (const s of SKILLS) expect(pr.learn(s.id), s.id).toBe(true);
    expect(pr.skillPoints).toBeGreaterThanOrEqual(0);
    const again = new Progress(JSON.parse(JSON.stringify(pr)));
    expect(again.level).toBe(100);
    expect(again.has('giant_slayer')).toBe(true);
    expect(again.stats.vitality).toBe(STAT_CAP);
  });

  it('earns experience from play, and the points change the game', () => {
    const g = newGame();
    let ups = 0;
    g.on((type) => { if (type === 'levelup') ups++; });
    for (let i = 0; i < 30; i++) g.record('craft:stick');
    expect(g.progress.level).toBeGreaterThan(1);
    expect(ups).toBe(g.progress.level - 1);
    g.gainXp(1e9);
    expect(g.raiseStat('nonsense')).toBe(false);

    // vitality: more health to fill
    for (let i = 0; i < 10; i++) g.raiseStat('vitality');
    expect(g.maxHealth).toBe(15);
    g.player.health = 10;
    g.player.hunger = g.player.thirst = 10;
    for (let i = 0; i < 400; i++) tickSurvival(g.player, 0.5, false, 1, 0, { maxHealth: g.maxHealth });
    expect(g.player.health).toBe(15);

    // endurance: a bigger pool lasts longer at a sprint
    const plain = { stamina: 10, hunger: 10 }, fit = { stamina: 15, hunger: 10 };
    let a = 0, b = 0;
    while (!tickStamina(plain, 0.1, true)) a++;
    while (!tickStamina(fit, 0.1, true, 1, { max: 15 })) b++;
    expect(b).toBeGreaterThan(a * 1.4);

    // hardiness: hunger comes slower
    for (let i = 0; i < 20; i++) g.raiseStat('hardiness');
    expect(g.progress.needsScale).toBeCloseTo(0.6);

    // strength and Keen edge: harder blows. Tough hide: armor without wearing any.
    hold(g, 'iron_sword');
    const base = g.attackPower;
    for (let i = 0; i < 5; i++) g.raiseStat('strength');
    expect(g.attackPower).toBeCloseTo(base * 1.2);
    expect(g.defense).toBe(0);
    expect(g.learnSkill('tough_hide')).toBe(true);
    expect(g.defense).toBe(1);
    g.learnSkill('keen_edge');
    expect(g.attackPower).toBeCloseTo(base * 1.2 * 1.15);

    // Hearty meals: food fills more
    g.learnSkill('forager');
    g.learnSkill('iron_stomach');
    g.player.hunger = 0;
    hold(g, 'berries');
    const plainMeal = ITEMS.berries.food;
    g.eatHeld();
    expect(g.player.hunger).toBeCloseTo(plainMeal * 1.25);

    // it all comes back from a save
    const again = new Game(JSON.parse(JSON.stringify(g.serialize())));
    expect(again.progress.level).toBe(100);
    expect(again.maxHealth).toBe(15);
    expect(again.defense).toBe(1);
  });
});

describe('map markers', () => {
  it('pins, removes, cycles colours, drops the oldest and is saved', () => {
    const g = newGame();
    const first = g.toggleMarker(40.2, -17.9);
    expect(first).toMatchObject({ x: 40.5, z: -17.5 });
    expect(g.toggleMarker(42, -17, 4)).toBe(null); // close enough to the first: it comes off
    expect(g.markers.length).toBe(0);
    for (let i = 0; i < 5; i++) g.toggleMarker(i * 100, 0);
    expect(new Set(g.markers.map((m) => m.color)).size).toBe(5);
    g.toggleMarker(900, 900); // a sixth pushes out the oldest and takes its colour
    expect(g.markers.length).toBe(5);
    expect(g.markers.some((m) => m.x === 0.5)).toBe(false);
    expect(new Set(g.markers.map((m) => m.color)).size).toBe(5);
    const again = new Game(JSON.parse(JSON.stringify(g.serialize())));
    expect(again.markers).toEqual(g.markers);
  });
});

describe('harsh regions', () => {
  it('pay off: glass tools, one-time hoards and keeper spoils', () => {
    const g = newGame();
    expect(ITEMS.rime_pickaxe.power).toBeGreaterThan(ITEMS.iron_pickaxe.power);
    expect(ITEMS.ember_axe.power).toBeGreaterThan(ITEMS.iron_axe.power);
    expect(recipeFor('rime_pickaxe').shapeless).toContain('rimeglass');
    expect(recipeFor('ember_axe').shapeless).toContain('emberglass');
    const [x, z] = clearing(g, 2);
    standAt(g, x + 1, z + 1);
    g.world.set(x, z, { t: 'frost_hoard' });
    expect(g.interact(x, z)).toBe(true);
    expect(g.inv.count('rimeglass')).toBeGreaterThanOrEqual(5);
    expect(g.inv.count('iron_bar')).toBeGreaterThanOrEqual(2);
    expect(g.world.get(x, z)).toBe(null); // gone for good
    // every keeper leaves something, and the harsh ones leave their region's glass
    for (const k of KEEPERS) expect(rewardFor(k).length, k.id).toBeGreaterThan(0);
    const frost = KEEPERS.find((k) => k.biome === 'frost');
    hold(g, 'ember_pike');
    g.armor.slots[1] = { id: frost.gear, n: 1 };
    const before = g.inv.count('rimeglass');
    g.encounters.active = { x: g.player.x + 1, z: g.player.z, y: g.player.y, spec: frost, hp: 1, beat: 0, timer: 1, warnings: [], engaged: false, hit: 0 };
    g.encounters.strike(g, g.encounters.active);
    expect(g.inv.count('rimeglass')).toBe(before + 8);
  });

  it('hold their own ore, caches and creatures', () => {
    const g = newGame();
    expect(OBJECTS.rock_rime.drops[0][0]).toBe('rimeglass');
    expect(OBJECTS.rock_ember.drops[0][0]).toBe('emberglass');
    expect(ENEMY_KINDS.frostprowler.loot).toBe('rimeglass');
    expect(ENEMY_KINDS.kilncrab.loot).toBe('emberglass');
    expect(recipeFor('rime_pack')).toBeTruthy();
    expect(recipeFor('ember_pike')).toBeTruthy();
    // a wayfarer cairn gives rimeglass once a day
    const [x, z] = clearing(g, 2);
    standAt(g, x + 1, z + 1);
    g.world.set(x, z, { t: 'weather_cairn' });
    g.interact(x, z);
    g.interact(x, z);
    expect(g.inv.count('rimeglass')).toBe(2);
    g.day++;
    g.interact(x, z);
    expect(g.inv.count('rimeglass')).toBe(4);
  });
});

describe('cloud', () => {
  it('sums a world up in plain numbers and picks out the milestones', () => {
    const g = newGame();
    g.gainXp(200);
    g.encounters.discovered.add(KEEPERS[0].id);
    g.encounters.restored.add(KEEPERS[0].id);
    expect(summarise(g)).toEqual({
      seed: 1, day: g.day, level: g.progress.level, difficulty: 'standard', goals_done: g.goals.index,
      keepers_found: 1, keepers_restored: 1, finished: false,
    });
    expect(eventFor('keeper:restore', g)).toMatchObject({ type: 'keeper_restored', detail: { restored: 1 } });
    expect(eventFor('hoard', g).type).toBe('hoard_opened');
    expect(eventFor('collect:stick', g)).toBe(null); // everyday things are not logged
  });

  it('stays out of the way when no project is set up', async () => {
    expect(cloud.enabled).toBe(false);
    expect(cloud.status).toBe('Not set up');
    expect(await syncWorld(newGame(), 1)).toBe(false);
    expect(await fetchWorld(1)).toBe(null);
  });
});

describe('multi-storey building', () => {
  const EAST = Math.PI / 2; // facing +x
  // A strip of ground floor two tiles deep with a staircase at its west end:
  //   S B C      S = stairs (climbing east), B and C = floored tiles, and the row behind them floored too
  function site() {
    const g = newGame();
    g.spawnTimer = g.golemTimer = Infinity;
    const [x, z] = clearing(g, 6);
    const S = [x + 1, z + 2], B = [x + 2, z + 2], C = [x + 3, z + 2], B2 = [x + 2, z + 3], C2 = [x + 3, z + 3];
    standAt(g, x + 2, z + 4);
    for (const [fx, fz] of [B, C, B2, C2]) {
      hold(g, 'wood_floor');
      g.secondary(fx, fz, true, EAST);
    }
    hold(g, 'stairs');
    g.secondary(S[0], S[1], true, EAST);
    return { g, S, B, C, B2, C2, ground: g.ground(x + 2.5, z + 2.5) };
  }
  const walk = (g, dx, dz, steps) => {
    for (let i = 0; i < steps; i++) {
      g.move(dx, dz);
      g.physics(0.016, false);
    }
  };
  const climb = (g, S) => {
    Object.assign(g.player, { x: S[0] + 0.05, z: S[1] + 0.5, y: g.ground(S[0] + 0.5, S[1] + 0.5), vy: 0 });
    walk(g, 0.04, 0, 40); // to the middle of the tile beyond the stairs
  };

  it('builds upward only where there is support, and keeps what it cannot place', () => {
    const { g, S, B, C } = site();
    expect(g.world.get(S[0], S[1]).rotation).toBe(0); // climbs the way the builder faced
    hold(g, 'wood_floor', 5);
    expect(g.buildLevel).toBe(0);
    expect(g.shiftBuildLevel(-1)).toBe(0); // nothing below the ground
    expect(g.shiftBuildLevel(1)).toBe(1);
    expect(g.shiftBuildLevel(1)).toBe(1); // only one storey away from your own
    expect(g.canPlace(B[0], B[1])).toBe(true); // over a ground floor
    expect(g.canPlace(S[0], S[1])).toBe(false); // the stairwell stays open
    expect(g.canPlace(B[0], B[1] - 1)).toBe(false); // over bare ground: nothing to rest on
    g.secondary(B[0], B[1] - 1, true, EAST);
    expect(g.inv.count('wood_floor')).toBe(5); // nothing spent on a refusal
    g.secondary(B[0], B[1], true, EAST);
    g.secondary(C[0], C[1], true, EAST);
    expect(g.world.getFloor(B[0], B[1], 1)).toBe('wood_floor');
    expect(g.world.getFloor(B[0], B[1])).toBe('wood_floor'); // the ground floor is its own layer
    expect(g.inv.count('wood_floor')).toBe(3);
    // a wall upstairs needs the upstairs floor under it
    hold(g, 'wood_wall', 2);
    expect(g.canPlace(C[0], C[1])).toBe(true);
    expect(g.canPlace(C[0], C[1] - 1)).toBe(false);
    // holding something that is not for building always aims at your own storey
    hold(g, 'stone_axe');
    expect(g.buildLevel).toBe(0);
  });

  it('climbs the stairs, walks over the room below and falls off the edge', () => {
    const { g, S, B, C, ground } = site();
    hold(g, 'wood_floor', 2);
    g.shiftBuildLevel(1);
    g.secondary(B[0], B[1], true, EAST);
    g.secondary(C[0], C[1], true, EAST);
    g.shiftBuildLevel(-1);
    hold(g, 'wood_wall');
    g.secondary(C[0], C[1], true, EAST); // a ground-storey wall under the upper floor
    expect(g.blocked(C[0] + 0.5, C[1] + 0.5, 0.28, false, 0)).toBe(true);
    expect(g.blocked(C[0] + 0.5, C[1] + 0.5, 0.28, false, 1)).toBe(false);

    // the side and the high end of the stairs are solid; only the low end lets you on
    Object.assign(g.player, { x: S[0] + 0.5, z: S[1] - 0.4, y: ground, vy: 0 });
    walk(g, 0, 0.04, 20);
    expect(g.player.z).toBeLessThan(S[1]);

    climb(g, S);
    expect(g.player.y).toBeCloseTo(ground + STOREY);
    expect(g.playerLevel).toBe(1);
    expect(Math.floor(g.player.x)).toBe(B[0]);
    walk(g, 0.04, 0, 25); // on over the wall below
    expect(Math.floor(g.player.x)).toBe(C[0]);
    expect(g.player.y).toBeCloseTo(ground + STOREY);
    // someone on the ground walks under the upper floor without popping up onto it
    expect(g.standY(B[0] + 0.5, B[1] + 0.5, ground)).toBe(ground);
    // and stepping off the end of the floor drops you back to the ground
    walk(g, 0.04, 0, 60);
    for (let i = 0; i < 80; i++) g.physics(0.016, false);
    expect(g.player.y).toBeCloseTo(g.ground(g.player.x, g.player.z));
    expect(g.playerLevel).toBe(0);
  });

  it('takes one storey apart at a time and hands back the same pieces', () => {
    const { g, S, B, C, ground } = site();
    hold(g, 'wood_floor', 2);
    g.shiftBuildLevel(1);
    g.secondary(B[0], B[1], true, EAST);
    g.secondary(C[0], C[1], true, EAST);
    climb(g, S);
    g.inv.slots.fill(null);
    hold(g, 'brick_wall');
    g.secondary(C[0], C[1], true, EAST);
    expect(g.world.getAt(C[0], C[1], 1).t).toBe('brick_wall');
    expect(g.blocked(C[0] + 0.5, C[1] + 0.5, 0.28, false, 1)).toBe(true);
    hold(g, 'slate_roof');
    g.secondary(C[0], C[1], true, EAST);
    expect(g.world.getRoof(C[0], C[1], 1)).toBe('slate_roof');
    g.inv.slots.fill(null);
    g.selected = 8; // an empty hand, and it stays empty as the pieces come back into the first slots
    // the wall first (it takes its hits), then the roof with empty hands, then the floor
    for (let i = 0; i < 6 && g.world.getAt(C[0], C[1], 1); i++) g.primary(C[0], C[1]);
    expect(g.inv.count('brick_wall')).toBe(1);
    g.primary(C[0], C[1]);
    expect(g.inv.count('slate_roof')).toBe(1);
    g.primary(C[0], C[1]);
    expect(g.inv.count('wood_floor')).toBe(1);
    expect(g.world.getFloor(C[0], C[1], 1)).toBe(null);
    expect(g.world.getFloor(C[0], C[1])).toBe('wood_floor'); // the storey below is untouched
    g.primary(B[0], B[1]); // you cannot pull the floor out from under yourself
    expect(g.world.getFloor(B[0], B[1], 1)).toBe('wood_floor');
    expect(g.player.y).toBeCloseTo(ground + STOREY);
  });

  it('shelters, opens doors, sleeps and wakes upstairs, and survives saving', () => {
    const { g, S, B, C, B2, C2, ground } = site();
    hold(g, 'wood_floor', 4);
    g.shiftBuildLevel(1);
    for (const [fx, fz] of [B, C, B2, C2]) g.secondary(fx, fz, true, EAST);
    climb(g, S);
    g.time = 0.7;
    g.updateStatus();
    expect(g.status).toBe('sheltered');
    hold(g, 'door');
    g.secondary(C[0], C[1], true, EAST);
    expect(g.blocked(C[0] + 0.5, C[1] + 0.5, 0.28, false, 1)).toBe(true);
    g.interact(C[0], C[1]);
    expect(g.world.getAt(C[0], C[1], 1).open).toBe(true);
    expect(g.blocked(C[0] + 0.5, C[1] + 0.5, 0.28, false, 1)).toBe(false);
    hold(g, 'bed');
    g.secondary(B2[0] + 1, B2[1] - 1 === C[1] ? B2[1] : B2[1], true, EAST); // on C2's neighbour row
    const bed = g.player.bed;
    expect(bed.l).toBe(1);
    // a roof may not share a tile with the floor above it, and the top storey takes no stairs
    hold(g, 'tile_roof');
    expect(g.canPlace(B[0], B[1])).toBe(true);
    g.secondary(B[0], B[1], true, EAST);
    hold(g, 'wood_floor');
    g.shiftBuildLevel(1);
    expect(g.buildLevel).toBe(2);
    expect(g.canPlace(B[0], B[1])).toBe(false);

    const again = new Game(JSON.parse(JSON.stringify(g.serialize())));
    expect(again.world.getFloor(C[0], C[1], 1)).toBe('wood_floor');
    expect(again.world.getAt(C[0], C[1], 1)).toMatchObject({ t: 'door', open: true });
    expect(again.world.getRoof(B[0], B[1], 1)).toBe('tile_roof');
    expect(again.player.bed).toEqual(bed);
    expect(again.playerLevel).toBe(1);

    // a world saved before upper storeys existed loads as it was; nonsense entries are dropped
    const old = JSON.parse(JSON.stringify(g.serialize()));
    delete old.upper;
    const legacy = new Game(old);
    expect(legacy.world.upper.size).toBe(0);
    expect(legacy.world.getFloor(B[0], B[1])).toBe('wood_floor');
    expect(legacy.world.get(S[0], S[1]).t).toBe('stairs');
    const odd = JSON.parse(JSON.stringify(g.serialize()));
    Object.assign(odd.upper, { 'a,b,c': { floor: 'wood_floor' }, '1,2,9': { floor: 'wood_floor' }, '3,4,1': null });
    expect(new Game(odd).world.upper.size).toBe(g.world.upper.size);

    // fainting wakes you beside the bed, on its own storey when there is floor there
    g.faint();
    const wake = [Math.floor(g.player.x), Math.floor(g.player.z)];
    const floored = !!g.world.getFloor(wake[0], wake[1], 1);
    expect(g.player.y).toBeCloseTo(g.ground(g.player.x, g.player.z) + (floored ? STOREY : 0));
    expect(ground).toBe(g.ground(B[0] + 0.5, B[1] + 0.5));
  });

  it('comes in wood, stone and brick, each with walls, floors, stairs and a roof', () => {
    for (const [wall, floor, stairs, roof] of [
      ['wood_wall', 'wood_floor', 'stairs', 'roof'], ['stone_wall', 'stone_floor', 'stone_stairs', 'slate_roof'], ['brick_wall', 'brick_floor', 'brick_stairs', 'tile_roof'],
    ]) {
      expect(OBJECTS[wall].block, wall).toBe(true);
      expect(ITEMS[floor].floor, floor).toBe(true);
      expect(OBJECTS[stairs].stairs, stairs).toBe(true);
      expect(ITEMS[roof].roof, roof).toBe(true);
      for (const id of [wall, floor, stairs, roof]) expect(recipeFor(id), id).toBeTruthy();
    }
  });
});