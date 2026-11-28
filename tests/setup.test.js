import { describe, it, expect } from 'vitest';
import { Game, DAY_SECONDS } from '../src/game/game.js';
import { DIFFICULTIES, STANDARD_RULES, RULE_FIELDS, normalizeRules, presetOf, rulesFor } from '../src/game/rules.js';
import { CLASSES, CLASS_POINTS } from '../src/game/classes.js';
import { DEFAULT_LOOK, LOOK_CHOICES, LOOK_COLOURS, LOOK_TABS, normalizeLook, randomLook, cleanName, normalizeCharacter } from '../src/game/looks.js';
import { STATS, Progress } from '../src/game/progress.js';
import { ITEMS } from '../src/game/items.js';
import { WORLD_TYPES, worldType, seedFrom } from '../src/world/worldtypes.js';
import { Worldgen } from '../src/world/worldgen.js';

const copy = (v) => JSON.parse(JSON.stringify(v));

describe('rules and difficulties', () => {
  it('gives every difficulty a full set of rules, and standard the standard ones', () => {
    for (const preset of Object.values(DIFFICULTIES)) expect(Object.keys(preset.rules).sort()).toEqual(Object.keys(STANDARD_RULES).sort());
    expect(DIFFICULTIES.standard.rules).toEqual(STANDARD_RULES);
    expect(DIFFICULTIES.peaceful.rules.enemies).toBe(0);
  });

  it('names the preset a set of rules matches, and calls anything else custom', () => {
    for (const [id, preset] of Object.entries(DIFFICULTIES)) expect(presetOf(preset.rules)).toBe(id);
    expect(presetOf({ ...STANDARD_RULES, xp: 2 })).toBe('custom');
  });

  it('keeps stored rules in range and fills in what is missing', () => {
    expect(normalizeRules({ drain: 99, enemies: -3, xp: 'lots', keepPack: 'yes' })).toEqual({ ...STANDARD_RULES, drain: 2.5, enemies: 0 });
    expect(rulesFor({ difficulty: 'brutal' })).toEqual({ difficulty: 'brutal', rules: DIFFICULTIES.brutal.rules });
    expect(rulesFor({ difficulty: 'nonsense' }).difficulty).toBe('standard');
    expect(rulesFor({ difficulty: 'standard', rules: { ...STANDARD_RULES, dayLength: 2 } }).difficulty).toBe('custom');
  });

  it('offers a control for every rule', () => {
    expect(RULE_FIELDS.map((f) => f.key).sort()).toEqual(Object.keys(STANDARD_RULES).sort());
  });

  it('plays by them: day length, experience and the pack', () => {
    const slow = new Game(null, { seed: 1, rules: { ...STANDARD_RULES, dayLength: 2 } });
    const t0 = slow.time;
    slow.tick(DAY_SECONDS / 100);
    expect(slow.time - t0).toBeCloseTo(0.005, 6);

    const quick = new Game(null, { seed: 1, rules: { ...STANDARD_RULES, xp: 2.5 } });
    quick.gainXp(1);
    quick.gainXp(1);
    expect(quick.progress.xp).toBe(5);

    const safe = new Game(null, { seed: 1, difficulty: 'relaxed' });
    safe.inv.slots[20] = { id: 'wood', n: 5 };
    safe.faint();
    expect(safe.inv.slots[20]).toEqual({ id: 'wood', n: 5 });
    expect(safe.player.lost ?? null).toBe(null);

    const harsh = new Game(null, { seed: 1 });
    harsh.inv.slots[20] = { id: 'wood', n: 5 };
    harsh.faint();
    expect(harsh.inv.slots[20]).toBe(null);
  });

  it('spawns no hostile creatures in a peaceful world, and clears them when switched to it', () => {
    const g = new Game(null, { seed: 1 });
    g.day = 6;
    g.time = 0.7;
    g.spawnEnemy(g.player.x + 6, g.player.z, 'gloomling');
    expect(g.enemies.length).toBe(1);
    expect(g.setDifficulty('peaceful')).toBe(true);
    expect(g.enemies.length).toBe(0);
    for (let i = 0; i < 400; i++) g.updateEnemies(0.1);
    expect(g.enemies.length).toBe(0);
    expect(g.setDifficulty('nonsense')).toBe(false);
  });

  it('saves and reloads custom rules', () => {
    const rules = { ...STANDARD_RULES, enemyDamage: 2, keepPack: true };
    const g = new Game(null, { seed: 3, rules });
    expect(g.difficulty).toBe('custom');
    const again = new Game(copy(g.serialize()));
    expect(again.rules).toEqual(rules);
    expect(again.difficulty).toBe('custom');
  });
});

describe('classes', () => {
  it('each spend exactly the starting points on real stats and pack real items', () => {
    for (const cls of Object.values(CLASSES)) {
      expect(Object.values(cls.stats).reduce((a, b) => a + b, 0)).toBe(CLASS_POINTS);
      for (const stat of Object.keys(cls.stats)) expect(STATS[stat]).toBeTruthy();
      for (const [id, n] of cls.kit) {
        expect(ITEMS[id], id).toBeTruthy();
        expect(n).toBeGreaterThan(0);
      }
    }
  });

  it('start a new character with the stats spent, nothing owed, and the kit in the pack', () => {
    const g = new Game(null, { seed: 1, character: { name: 'Wren', cls: 'warrior', look: DEFAULT_LOOK } });
    expect(g.progress.stats.strength).toBe(2);
    expect(g.progress.stats.vitality).toBe(1);
    expect(g.progress.statPoints).toBe(0);
    expect(g.inv.count('stone_sword')).toBe(1);
    expect(g.player.health).toBe(g.maxHealth);
    // the kit is handed out once: a reloaded world does not get it again
    const again = new Game(copy(g.serialize()));
    expect(again.inv.count('stone_sword')).toBe(1);
    expect(again.progress.statPoints).toBe(0);
    expect(again.character).toEqual({ name: 'Wren', cls: 'warrior', look: DEFAULT_LOOK });
  });

  it('leave later levels to be spent freely', () => {
    const p = new Progress({ stats: CLASSES.mason.stats, bonus: CLASS_POINTS });
    p.addXp(1000);
    expect(p.statPoints).toBe(p.level - 1);
  });

  it('are optional: a world with no character has none', () => {
    const g = new Game({ seed: 1 });
    expect(g.character).toBe(null);
    expect(g.progress.statPoints).toBe(0);
  });
});

describe('looks', () => {
  it('has a default for every part, offered by the creator exactly once', () => {
    const offered = LOOK_TABS.flatMap(([, keys]) => keys).sort();
    expect(offered).toEqual(Object.keys(DEFAULT_LOOK).sort());
    for (const key of offered) expect(LOOK_CHOICES[key] ?? LOOK_COLOURS[key], key).toBeTruthy();
    expect(normalizeLook(DEFAULT_LOOK)).toEqual(DEFAULT_LOOK);
  });

  it('repairs a look with unknown or missing parts, keeping the good ones', () => {
    const look = normalizeLook({ skin: 0x5c3a26, style: 'beehive', beard: 'full', boots: 'red' });
    expect(look).toEqual({ ...DEFAULT_LOOK, skin: 0x5c3a26, beard: 'full' });
    // a look saved before the creator grew still loads
    expect(normalizeLook({ skin: 1, hair: 2, shirt: 3, pants: 4, style: 'tuft' }).style).toBe('tuft');
  });

  it('makes random looks that are always valid', () => {
    for (let i = 0; i < 50; i++) {
      const look = randomLook();
      expect(normalizeLook(look)).toEqual(look);
    }
  });

  it('tidies names', () => {
    expect(cleanName('  Ash   of the   Glade and beyond ')).toBe('Ash of the Glade');
    expect(cleanName('   ')).toBe('Wanderer');
    expect(normalizeCharacter({ name: 'X', cls: 'wizard' })).toEqual({ name: 'X', cls: null, look: DEFAULT_LOOK });
    expect(normalizeCharacter(null)).toBe(null);
  });
});

describe('world types', () => {
  const share = (type, test, seed = 77) => {
    const gen = new Worldgen(seed, type);
    let hit = 0, n = 0;
    for (let z = -6000; z <= 6000; z += 300) {
      for (let x = -6000; x <= 6000; x += 300) {
        hit += test(gen.natural(x, z)) ? 1 : 0;
        n++;
      }
    }
    return hit / n;
  };

  it('leaves the classic world exactly as it was', () => {
    const a = new Worldgen(42), b = new Worldgen(42, 'continents'), c = new Worldgen(42, 'no such type');
    expect(worldType('no such type')).toBe('continents');
    for (const [x, z] of [[0, 0], [300, -120], [-2500, 900], [4100, 4100]]) {
      expect(b.natural(x, z)).toEqual(a.natural(x, z));
      expect(c.natural(x, z)).toEqual(a.natural(x, z));
    }
  });

  it('shapes the sea: oceans drown most of the world, the mainland almost none of it', () => {
    const sea = (t) => t.salt;
    expect(share('ocean', sea)).toBeGreaterThan(0.65);
    expect(share('isles', sea)).toBeGreaterThan(share('continents', sea));
    expect(share('mainland', sea)).toBeLessThan(0.15);
  });

  it('shapes the land: more mountain, frost, fire or forest where the type says so', () => {
    const high = (t) => t.biome === 'mountain' || t.biome === 'snow';
    expect(share('highlands', high)).toBeGreaterThan(share('continents', high) * 1.4);
    expect(share('frostbound', (t) => t.frost > 0)).toBeGreaterThan(share('continents', (t) => t.frost > 0) * 1.8);
    expect(share('emberlands', (t) => t.heat > 0)).toBeGreaterThan(share('continents', (t) => t.heat > 0) * 1.8);
    expect(share('wildwood', (t) => t.biome === 'pine')).toBeGreaterThan(share('continents', (t) => t.biome === 'pine') * 2);
  });

  it('starts every type of world on dry, friendly land, and remembers the type', () => {
    for (const type of Object.keys(WORLD_TYPES)) {
      const g = new Game(null, { seed: 2026, worldType: type });
      const t = g.gen.tile(g.player.spawn.x, g.player.spawn.z);
      expect(t.water, type).toBe(false);
      expect(t.frost, type).toBe(0);
      expect(t.heat, type).toBe(0);
      const again = new Game(copy(g.serialize()));
      expect(again.gen.kind).toBe(type);
      expect(again.gen.tile(40, 40)).toEqual(g.gen.tile(40, 40));
    }
  }, 120000);

  it('turns what the player types into a seed', () => {
    expect(seedFrom('12345')).toBe(12345);
    expect(seedFrom(' emberglade ')).toBe(seedFrom('emberglade'));
    expect(seedFrom('emberglade')).not.toBe(seedFrom('Emberglade'));
    expect(Number.isInteger(seedFrom(''))).toBe(true);
  });
});
