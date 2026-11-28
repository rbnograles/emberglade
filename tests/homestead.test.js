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
import { ENHANCEMENTS, LOOT, fits } from '../src/game/enhance.js';
import { ROLES, villagersOf } from '../src/game/villagers.js';
import { Worldgen } from '../src/world/worldgen.js';
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
    expect(g.shiftBuildLevel(1)).toBe(2); // any storey can be aimed at from the ground
    expect(g.shiftBuildLevel(-1)).toBe(1);
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
    // a wall upstairs needs the upstairs floor under it, or a wall below it
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
describe('animal goods and enhancing', () => {
  it('names only real items in every drop, cost and trade', () => {
    for (const [kind, drops] of Object.entries(LOOT)) {
      expect(ENEMY_KINDS[kind], kind).toBeTruthy();
      for (const [id] of drops) expect(ITEMS[id], id).toBeTruthy();
    }
    for (const kind of Object.keys(ENEMY_KINDS)) expect(LOOT[kind], kind).toBeTruthy();
    for (const spec of Object.values(WILDLIFE)) for (const [id] of spec.drops) expect(ITEMS[id], id).toBeTruthy();
    for (const e of Object.values(ENHANCEMENTS)) for (const id of Object.keys(e.cost)) expect(ITEMS[id], id).toBeTruthy();
    for (const role of Object.values(ROLES)) for (const [id] of [...role.buys, ...role.sells]) expect(ITEMS[id], id).toBeTruthy();
    // feathers, wool, bone and leather all come from somewhere
    const fromAnimals = new Set(Object.values(WILDLIFE).flatMap((s) => s.drops.map(([id]) => id)));
    for (const id of ['feather', 'fleece', 'bone', 'hide']) expect(fromAnimals.has(id), id).toBe(true);
    expect(recipeFor('leather').shapeless).toEqual(['hide']);
    for (const id of ['leather_cap', 'leather_tunic', 'leather_boots']) expect(recipeFor(id), id).toBeTruthy();
  });

  it('works an enhancement into the weapon in hand, once, for its cost', () => {
    const g = newGame();
    expect(fits('venom', ITEMS.iron_sword)).toBe(true);
    expect(fits('venom', ITEMS.iron_pickaxe)).toBe(false); // weapons only
    expect(fits('lasting', ITEMS.iron_pickaxe)).toBe(true);
    expect(fits('lasting', ITEMS.berries)).toBe(false);
    hold(g, 'iron_sword');
    expect(g.enhance('keen')).toBe(false); // nothing to pay with
    g.inv.add('snapper_fang', 2);
    g.inv.add('leather', 1);
    const plain = g.attackPower;
    expect(g.enhance('keen')).toBe(true);
    expect(g.held.e).toBe('keen');
    expect(g.inv.count('snapper_fang')).toBe(0);
    expect(g.attackPower).toBeCloseTo(plain * 1.25);
    expect(g.enhance('keen')).toBe(false); // already there
    // it travels with the weapon through a save, and a new one replaces it
    const again = new Game(JSON.parse(JSON.stringify(g.serialize())));
    expect(again.held.e).toBe('keen');
    g.inv.add('feather', 4);
    g.inv.add('fiber', 1);
    expect(g.swingTime).toBeCloseTo(0.32);
    expect(g.enhance('swift')).toBe(true);
    expect(g.swingTime).toBeLessThan(0.25);
    expect(g.attackPower).toBeCloseTo(plain);
  });

  it('poisons, chills and leaves loot', () => {
    const g = newGame();
    g.spawnTimer = g.golemTimer = Infinity;
    g.time = 0.75; // night, so the creature does not burn away
    hold(g, 'stone_sword');
    g.held.e = 'venom';
    const e = g.spawnEnemy(g.player.x + 1, g.player.z, 'brute');
    const hp = e.hp;
    g.attack(e);
    expect(e.poison).toBeGreaterThan(0);
    const after = e.hp;
    for (let i = 0; i < 20; i++) g.updateEnemies(0.1);
    expect(e.hp).toBeLessThan(after - 1.5); // two seconds of venom
    expect(hp).toBeGreaterThan(after);
    g.held.e = 'frost';
    g.attack(e);
    expect(e.slow).toBeGreaterThan(0);
    // a creature under your floor cannot reach you
    const far = g.spawnEnemy(g.player.x + 0.5, g.player.z, 'gloomling');
    g.player.health = 10;
    g.player.y = g.ground(g.player.x, g.player.z) + STOREY;
    far.cool = 0;
    g.updateEnemies(0.05);
    expect(g.player.health).toBe(10);
    // killing one hands over its kind's loot
    let got = 0;
    for (let i = 0; i < 40; i++) {
      const s = g.spawnEnemy(g.player.x + 1, g.player.z, 'spitter');
      s.hp = 0.1;
      g.attack(s);
    }
    got = g.inv.count('venom_sac');
    expect(got).toBeGreaterThan(10);
  });
});

describe('settlements', () => {
  it('puts the same villages and castles in the same places, on level dry ground, away from the start', () => {
    const a = new Worldgen(7), b = new Worldgen(7);
    const near = a.settlementsNear(0, 0, 2500);
    expect(near.filter((s) => s.kind === 'village').length).toBeGreaterThan(5);
    expect(near.filter((s) => s.kind === 'castle').length).toBeGreaterThan(1);
    expect(b.settlementsNear(0, 0, 2500).map((s) => [s.kind, s.x, s.z, s.name])).toEqual(near.map((s) => [s.kind, s.x, s.z, s.name]));
    for (const st of near.slice(0, 12)) {
      expect(Math.hypot(st.x, st.z)).toBeGreaterThanOrEqual(90);
      for (const [dx, dz] of [[0, 0], [st.radius, st.radius], [-st.radius, 0], [3, -st.radius]]) {
        const t = a.tile(st.x + dx, st.z + dz);
        expect(t.h).toBe(st.h);
        expect(t.water || t.lava).toBe(false);
      }
      for (const cell of st.cells.values()) {
        if (cell.obj) expect(OBJECTS[cell.obj.t], cell.obj.t).toBeTruthy();
        if (cell.floor) expect(ITEMS[cell.floor].floor, cell.floor).toBe(true);
        if (cell.roof) expect(ITEMS[cell.roof].roof, cell.roof).toBe(true);
      }
    }
    // the start itself stays as it was
    expect(a.settlementAt(0, 0)).toBe(null);
  });

  it('has houses you can enter, floors that can be lifted for good, and a hoard in each castle', () => {
    const g = newGame();
    const village = g.gen.settlementsNear(0, 0, 3000).find((s) => s.kind === 'village');
    const castle = g.gen.settlementsNear(0, 0, 3000).find((s) => s.kind === 'castle');
    const at = (st, dx, dz) => [st.x + dx, st.z + dz];
    // the square is paved, with the hearth in the middle
    expect(g.world.getFloor(...at(village, 1, 0))).toBe('stone_floor');
    expect(g.world.get(...at(village, 0, 0)).t).toBe('campfire');
    // a door somewhere, shut, that opens with Use and stays open after saving
    const door = [...village.cells].find(([, c]) => c.obj?.t === 'door')[0].split(',').map(Number);
    const [dx, dz] = at(village, door[0], door[1]);
    standAt(g, dx, dz + (door[1] > 0 ? -1 : 1));
    expect(g.blocked(dx + 0.5, dz + 0.5)).toBe(true);
    g.interact(dx, dz);
    expect(g.blocked(dx + 0.5, dz + 0.5)).toBe(false);
    // lifting a paving stone removes it for good
    const [fx, fz] = at(village, 5, 0);
    g.selected = 8;
    g.inv.slots.fill(null);
    g.primary(fx, fz);
    expect(g.world.getFloor(fx, fz)).toBe(null);
    const again = new Game(JSON.parse(JSON.stringify(g.serialize())));
    expect(again.world.getFloor(fx, fz)).toBe(null);
    expect(again.world.get(dx, dz).open).toBe(true);
    expect(again.world.getFloor(...at(village, 1, 0))).toBe('stone_floor');
    // the castle's hoard pays out once
    const [hx, hz] = at(castle, 0, -8);
    expect(g.world.get(hx, hz).t).toBe('royal_hoard');
    standAt(g, hx, hz + 1);
    g.interact(hx, hz);
    expect(g.inv.count('coin')).toBeGreaterThanOrEqual(12);
    expect(g.world.get(hx, hz)).toBe(null);
  });

  it('is lived in: villagers who buy and sell for coins', () => {
    const g = newGame();
    const village = g.gen.settlementsNear(0, 0, 3000).find((s) => s.kind === 'village');
    const people = villagersOf(village, g.seed);
    expect(people.length).toBeGreaterThanOrEqual(2);
    expect(new Set(people.map((v) => v.role)).size).toBe(people.length); // each has their own trade
    expect(villagersOf(village, g.seed).map((v) => [v.name, v.role])).toEqual(people.map((v) => [v.name, v.role]));
    standAt(g, village.x + 1, village.z + 2);
    g.villagers.tick(0.1);
    expect(g.villagers.list.length).toBe(people.length);
    const v = g.villagers.near(6);
    expect(v).toBeTruthy();
    const role = ROLES[v.role], [want, n, pay] = role.buys[0], [item, count, price] = role.sells[0];
    expect(g.villagers.trade(v, 'buy', 0)).toBe(false); // nothing to sell yet
    g.inv.add(want, n * 5);
    for (let i = 0; i < 5; i++) expect(g.villagers.trade(v, 'buy', 0)).toBe(true);
    expect(g.inv.count('coin')).toBe(pay * 5);
    expect(g.inv.count(want)).toBe(0);
    const before = g.inv.count(item);
    expect(g.villagers.trade(v, 'sell', 0)).toBe(pay * 5 >= price);
    if (pay * 5 >= price) expect(g.inv.count(item)).toBe(before + count);
    // walking away, they are forgotten; they are not part of the save
    standAt(g, 0, 0);
    g.villagers.scan = 0;
    g.villagers.tick(0.1);
    expect(g.villagers.list.length).toBe(0);
  });
});

describe('building help', () => {
  it('says why a piece will not go where it is aimed', () => {
    const g = newGame();
    const [x, z] = clearing(g, 4);
    standAt(g, x + 1, z + 1);
    hold(g, 'wood_wall', 3);
    expect(g.placeProblem(x + 2, z + 1)).toBe(null);
    expect(g.placeProblem(x + 1, z + 1)).toMatch(/standing/);
    expect(g.placeProblem(x + 40, z + 1)).toMatch(/Too far/);
    g.secondary(x + 2, z + 1, true);
    expect(g.placeProblem(x + 2, z + 1)).toMatch(/in the way/);
    hold(g, 'wood_floor', 3);
    g.shiftBuildLevel(1);
    expect(g.placeProblem(x + 3, z + 3)).toMatch(/Nothing to rest on/);
    expect(g.placeProblem(x + 2, z + 1)).toBe(null); // over the wall
    hold(g, 'berries');
    expect(g.placeProblem(x + 2, z + 2)).toBe(null); // not a building piece: nothing to say
  });

  it('hurts after a long fall but not a short one', () => {
    const g = newGame();
    const land = (height) => {
      g.player.health = 10;
      Object.assign(g.player, { y: g.ground(g.player.x, g.player.z) + height, vy: 0 });
      for (let i = 0; i < 400; i++) g.physics(0.01, false);
      return g.player.health;
    };
    expect(land(STOREY * 2)).toBe(10);
    expect(land(8)).toBeLessThan(10);
    expect(land(60)).toBeGreaterThanOrEqual(6); // even a cliff is not a death sentence
  });
});
describe('castle starts, guards and digging', () => {
  it('starts a new world before a castle gate when one is in reach', () => {
    let atCastle = 0;
    for (let i = 0; i < 4; i++) {
      const g = new Game(null), { x, z } = g.player.spawn;
      const castle = g.gen.settlementsNear(x, z, 30).find((st) => st.kind === 'castle');
      if (!castle) continue;
      atCastle++;
      expect(z).toBeGreaterThan(castle.z + castle.radius); // outside the wall, south of the gate
      expect(Math.abs(x - castle.x)).toBeLessThanOrEqual(2);
    }
    expect(atCastle).toBeGreaterThan(0);
  });

  it('posts guards in a castle, who trade and strike down creatures', () => {
    const g = new Game(null), { x, z } = g.player.spawn;
    const castle = g.gen.settlementsNear(x, z, 2400).find((st) => st.kind === 'castle');
    g.player.x = castle.x + 0.5;
    g.player.z = castle.z + 5.5;
    g.villagers.tick(0.1);
    const guards = g.villagers.list.filter((v) => v.guard);
    expect(guards.length).toBe(3);
    expect(guards.every((v) => v.role === 'guard' && v.village === castle.name)).toBe(true);
    g.inv.add('coin', 40);
    expect(g.villagers.trade(guards[0], 'sell', 0)).toBe(true);
    expect(g.inv.count('iron_sword')).toBe(1);
    const foe = g.spawnEnemy(guards[0].x + 1, guards[0].z);
    const kills = g.goals.toJSON(), xp = g.progress.xp;
    for (let i = 0; i < 200 && g.enemies.includes(foe); i++) g.villagers.tick(0.1);
    expect(g.enemies.includes(foe)).toBe(false);
    expect(g.progress.xp).toBe(xp); // a guard's kill is not the player's
    expect(g.goals.toJSON()).toEqual(kills);
  });

  it('digs the ground down with a shovel and builds it back up with dirt', () => {
    const g = new Game({ seed: 1 }), p = g.player;
    let tx = 0, tz = 0;
    // a bare, dry tile beside the player
    search: for (tz = -3; tz <= 3; tz++) for (tx = -3; tx <= 3; tx++) {
      const t = g.gen.tile(tx, tz);
      if (!t.water && !g.world.get(tx, tz) && t.h > 1 && (tx || tz)) break search;
    }
    p.x = tx + 1.5;
    p.z = tz + 0.5;
    const before = g.gen.tile(tx, tz).h;
    g.inv.slots[0] = { id: 'shovel', n: 1 };
    g.selected = 0;
    let ground = 0;
    g.world.onChange((x, z, isGround) => { if (isGround) ground++; });
    g.primary(tx, tz);
    expect(g.gen.tile(tx, tz).h).toBe(before - 0.5);
    expect(g.ground(tx + 0.5, tz + 0.5)).toBe(before - 0.5);
    expect(g.inv.count('dirt')).toBe(1);
    expect(g.inv.slots[0].d).toBe(149);
    expect(ground).toBe(1);
    // it survives a save
    const copy = new Game(JSON.parse(JSON.stringify(g.serialize())));
    expect(copy.gen.tile(tx, tz).h).toBe(before - 0.5);
    // dirt puts it back
    g.selected = g.inv.slots.findIndex((s) => s?.id === 'dirt');
    g.secondary(tx, tz, true);
    expect(g.gen.tile(tx, tz).h).toBe(before);
    expect(g.inv.count('dirt')).toBe(0);
    expect(g.serialize().dug).toEqual({});
    // not the tile you stand on
    g.selected = 0;
    g.primary(Math.floor(p.x), Math.floor(p.z));
    expect(g.gen.tile(Math.floor(p.x), Math.floor(p.z)).dug).toBeUndefined();
  });
});

describe('a castle worth the name', () => {
  const castleOf = (g) => g.gen.settlementsNear(g.player.spawn.x, g.player.spawn.z, 2400).find((st) => st.kind === 'castle');

  it('has towers, a wall-walk and a keep on the storeys above the ground', () => {
    const g = new Game(null), c = castleOf(g), w = g.world;
    // a corner tower stands three storeys under a spire
    expect(w.getAt(c.x + 13, c.z + 13, 1)).toBeTruthy();
    expect(w.getAt(c.x + 13, c.z + 13, 2)).toBeTruthy();
    expect(w.getRoof(c.x + 13, c.z + 13, 2)).toMatch(/^spire/);
    // the curtain wall is two storeys with teeth on top and a walk behind them
    expect(w.getAt(c.x + 6, c.z - 13, 1)).toBeTruthy();
    expect(w.getAt(c.x + 6, c.z - 13, 2).t).toBe('battlement');
    expect(w.getFloor(c.x + 6, c.z - 12, 2)).toBe('stone_floor');
    // the keep has floors upstairs and a pitched roof over the top one
    expect(w.getFloor(c.x, c.z - 7, 1)).toBe('wood_floor');
    expect(w.getFloor(c.x, c.z - 7, 2)).toBe('wood_floor');
    expect(w.getRoof(c.x, c.z - 7, 2)).toBe('pitch_ridge');
  });

  it('can be climbed: the keep stairs lead up two floors, and the yard stairs to the wall-walk', () => {
    const g = new Game(null), c = castleOf(g), p = g.player, h = c.h;
    const walk = (x0, z0, x1, z1) => {
      p.x = x0; p.z = z0;
      for (let i = 0; i < 400 && Math.hypot(x1 - p.x, z1 - p.z) > 0.08; i++) {
        const d = Math.hypot(x1 - p.x, z1 - p.z), s = Math.min(0.05, d);
        g.move(((x1 - p.x) / d) * s, ((z1 - p.z) / d) * s);
        g.physics(0.016, false);
      }
    };
    // keep: up the east stair to the first floor
    p.y = h;
    walk(c.x + 3.5, c.z - 4.5, c.x + 3.5, c.z - 6.5);
    expect(g.playerLevel).toBe(1);
    // across the first floor and up the west stair to the second
    walk(p.x, p.z, c.x - 1.5, c.z - 6.5);
    walk(p.x, p.z, c.x - 1.5, c.z - 4.5);
    walk(p.x, p.z, c.x - 2.5, c.z - 4.5);
    walk(p.x, p.z, c.x - 2.5, c.z - 6.5);
    expect(g.playerLevel).toBe(2);
    // yard: two flights inside the west wall reach the wall-walk
    p.y = h;
    walk(c.x - 11.5, c.z + 8.5, c.x - 11.5, c.z + 3.5);
    expect(g.playerLevel).toBe(2);
    expect(g.world.getFloor(Math.floor(p.x), Math.floor(p.z), 2)).toBe('stone_floor');
  });

  it('keeps what the player changes upstairs, and leaves the rest of the castle standing', () => {
    const g = new Game(null), c = castleOf(g), x = c.x + 6, z = c.z - 13;
    g.world.setAt(x, z, 2, null); // knock a tooth off the wall
    expect(g.world.getAt(x, z, 2)).toBeNull();
    const copy = new Game(JSON.parse(JSON.stringify(g.serialize())));
    expect(copy.world.getAt(x, z, 2)).toBeNull();
    expect(copy.world.getAt(x + 1, z, 2).t).toBe('battlement');
    expect(Object.keys(copy.serialize().upper).length).toBe(1);
  });
});

describe('turning things and building upward freely', () => {
  const EAST = Math.PI / 2, SOUTH = 0; // facing +x, facing +z
  const setup = () => {
    const g = newGame();
    g.spawnTimer = g.golemTimer = Infinity;
    const [x, z] = clearing(g, 6);
    standAt(g, x + 2, z + 4);
    return { g, x, z };
  };

  it('turns a chest to face the builder, or wherever the rotate key says', () => {
    const { g, x, z } = setup();
    hold(g, 'chest', 3);
    expect(g.placeRotation('chest', SOUTH)).toBe(3); // builder faces +z, so the front faces back at them
    g.secondary(x + 2, z + 2, true, SOUTH);
    expect(g.world.get(x + 2, z + 2).rotation).toBe(3);
    expect(g.turnPlacing(SOUTH)).toBe(0); // a quarter turn on from there
    expect(g.turnPlacing(SOUTH)).toBe(1);
    g.secondary(x + 3, z + 2, true, EAST); // which way the builder faces no longer matters
    expect(g.world.get(x + 3, z + 2).rotation).toBe(1);
    // taking something else in hand forgets the turn; stairs still climb the way you face
    hold(g, 'stairs');
    expect(g.placeRotation('stairs', EAST)).toBe(0);
    expect(g.turnPlacing(EAST)).toBe(1);
    // walls look the same from every side, so they are not turned and keep no rotation
    hold(g, 'wood_wall');
    expect(g.turnPlacing(EAST)).toBeNull();
    g.secondary(x + 1, z + 2, true, EAST);
    expect(g.world.get(x + 1, z + 2).rotation).toBeUndefined();
  });

  it('stacks walls three high from the ground with no floors, and lets you stand on a wall', () => {
    const { g, x, z } = setup();
    const W = [x + 2, z + 2];
    hold(g, 'stone_wall', 3);
    g.secondary(W[0], W[1], true, EAST);
    g.shiftBuildLevel(1);
    expect(g.canPlace(W[0] + 1, W[1])).toBe(false); // not in thin air
    g.secondary(W[0], W[1], true, EAST); // straight on top of the wall below
    expect(g.world.getAt(W[0], W[1], 1).t).toBe('stone_wall');
    g.shiftBuildLevel(1);
    expect(g.buildLevel).toBe(2); // the third storey, still standing on the ground
    g.secondary(W[0], W[1], true, EAST);
    expect(g.world.getAt(W[0], W[1], 2).t).toBe('stone_wall');
    expect(g.inv.count('stone_wall')).toBe(0);
    // a floor may carry on sideways from what is built beside it
    hold(g, 'wood_floor');
    g.shiftBuildLevel(1);
    expect(g.canPlace(W[0] + 1, W[1])).toBe(true);
    // the top of a wall holds you up once you are that high, and not before
    const ground = g.ground(W[0] + 0.5, W[1] + 0.5);
    expect(g.standY(W[0] + 0.5, W[1] + 0.5, ground)).toBe(ground);
    expect(g.standY(W[0] + 0.5, W[1] + 0.5, ground + STOREY)).toBe(ground + STOREY);
  });
});

describe('MagicaVoxel files', () => {
  it('writes a sculpture and reads the same one back, the right way up and round', async () => {
    const { Vox } = await import('../src/render/voxel.js');
    const { parseVox, writeVox } = await import('../src/render/voxfile.js');
    // an L: a red post three tall, with a blue foot sticking out toward the front (+z)
    const made = new Vox().box(5, 0, 2, 5, 2, 2, 0xd9432f).set(5, 0, 3, 0x3d7fbd).set(6, 0, 2, 0x8be06a);
    const bytes = writeVox(made);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('VOX ');
    const read = parseVox(bytes);
    const cells = [...read.m.values()].map((c) => c.join()).sort();
    // the same shape, moved to start at the origin
    expect(cells).toEqual(['0,0,0,14238511', '0,1,0,14238511', '0,2,0,14238511', '0,0,1,4030397', '1,0,0,9166954'].sort());
    // in the file itself, height is z and the front is toward -y, as MagicaVoxel has it
    const view = new DataView(bytes.buffer);
    expect([view.getInt32(32, true), view.getInt32(36, true), view.getInt32(40, true)]).toEqual([2, 2, 3]);
    expect(() => parseVox(new Uint8Array(40))).toThrow(/not a MagicaVoxel/);
  });
});
