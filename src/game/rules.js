// The rules a world is played under. A difficulty is a named set of them; the new-game screen can
// also tune each one by hand, which makes the world "custom".
//   drain        how fast food, water and energy run down
//   enemyDamage  how hard hostile creatures hit
//   enemies      how many hostile creatures there are (0 = none at all)
//   dayLength    how long a day lasts, against the standard eight minutes
//   keepPack     true: fainting never leaves your pack behind
//   xp           how fast experience is earned
export const STANDARD_RULES = { drain: 1, enemyDamage: 1, enemies: 1, dayLength: 1, keepPack: false, xp: 1 };

export const DIFFICULTIES = {
  peaceful: {
    name: 'Peaceful', text: 'No hostile creatures. Build, farm and explore at your own pace.',
    rules: { drain: 0.5, enemyDamage: 0.5, enemies: 0, dayLength: 1, keepPack: true, xp: 1 },
  },
  relaxed: {
    name: 'Relaxed', text: 'Gentle needs and few, weaker creatures. Fainting never costs you your pack.',
    rules: { drain: 0.5, enemyDamage: 0.75, enemies: 0.5, dayLength: 1, keepPack: true, xp: 1 },
  },
  standard: {
    name: 'Standard', text: 'Emberglade as it was made to be played.',
    rules: { ...STANDARD_RULES },
  },
  challenging: {
    name: 'Challenging', text: 'You tire and hunger sooner, and the night brings more creatures that hit harder.',
    rules: { drain: 1.5, enemyDamage: 1.25, enemies: 1.5, dayLength: 1, keepPack: false, xp: 1 },
  },
  brutal: {
    name: 'Brutal', text: 'Short days, long odds. Swarming creatures, heavy blows and needs that never let up.',
    rules: { drain: 2, enemyDamage: 1.75, enemies: 2, dayLength: 0.75, keepPack: false, xp: 1.25 },
  },
};
// kept for the code that only ever asked how fast needs drain
for (const preset of Object.values(DIFFICULTIES)) preset.drain = preset.rules.drain;

// What the custom rules screen offers. `choices` are [value, label]; otherwise a slider from min to max.
export const RULE_FIELDS = [
  { key: 'drain', name: 'Hunger, thirst and energy', min: 0.25, max: 2.5, step: 0.25, unit: '×', text: 'How quickly your needs run down.' },
  { key: 'enemyDamage', name: 'Creature damage', min: 0.25, max: 2.5, step: 0.25, unit: '×', text: 'How hard hostile creatures hit.' },
  { key: 'enemies', name: 'Hostile creatures', choices: [[0, 'None'], [0.5, 'Few'], [1, 'Normal'], [1.5, 'Many'], [2, 'Swarming']], text: 'How many come for you at night, at sea and in the mountains.' },
  { key: 'dayLength', name: 'Day length', choices: [[0.5, 'Short · 4 min'], [0.75, 'Brisk · 6 min'], [1, 'Normal · 8 min'], [1.5, 'Long · 12 min'], [2, 'Very long · 16 min']], text: 'How long one day and night last.' },
  { key: 'xp', name: 'Experience', min: 0.5, max: 3, step: 0.25, unit: '×', text: 'How fast you level up.' },
  { key: 'keepPack', name: 'Keep your pack when you faint', toggle: true, text: 'Off: everything outside your hotbar is left where you fell.' },
];

const clamp = (v, lo, hi, fallback) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback);

// A complete, in-range set of rules from whatever was stored.
export function normalizeRules(raw = {}, base = STANDARD_RULES) {
  return {
    drain: clamp(raw.drain, 0.25, 2.5, base.drain),
    enemyDamage: clamp(raw.enemyDamage, 0, 2.5, base.enemyDamage),
    enemies: clamp(raw.enemies, 0, 2, base.enemies),
    dayLength: clamp(raw.dayLength, 0.5, 2, base.dayLength),
    keepPack: typeof raw.keepPack === 'boolean' ? raw.keepPack : base.keepPack,
    xp: clamp(raw.xp, 0.5, 3, base.xp),
  };
}

// The preset these rules are exactly, or 'custom'.
export function presetOf(rules) {
  for (const [id, preset] of Object.entries(DIFFICULTIES)) {
    if (Object.keys(STANDARD_RULES).every((k) => preset.rules[k] === rules[k])) return id;
  }
  return 'custom';
}

export const difficultyName = (id) => DIFFICULTIES[id]?.name ?? 'Custom';

// The rules and difficulty id of a saved (or about to be made) world.
// A world from before rules existed only names its difficulty, and takes on that preset.
export function rulesFor(saved) {
  if (saved?.rules && typeof saved.rules === 'object') {
    const rules = normalizeRules(saved.rules);
    return { rules, difficulty: presetOf(rules) };
  }
  const id = Object.hasOwn(DIFFICULTIES, saved?.difficulty) ? saved.difficulty : 'standard';
  return { rules: { ...DIFFICULTIES[id].rules }, difficulty: id };
}
