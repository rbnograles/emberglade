// Levels, stat points and the skill tree. Pure rules: the Game asks this what the player's bonuses are.
export const MAX_LEVEL = 100;
export const STAT_CAP = 20; // points one stat can hold
const SKILL_EVERY = 3; // a skill point every third level; a stat point every level

export const STATS = {
  vitality: { name: 'Vitality', text: '+0.5 max health per point' },
  endurance: { name: 'Endurance', text: '+0.5 max energy per point' },
  hardiness: { name: 'Hardiness', text: 'Hunger and thirst come 2% slower per point' },
  strength: { name: 'Strength', text: '+4% damage per point' },
  agility: { name: 'Agility', text: '+1% movement speed per point' },
};

// Three branches, each a chain: a skill needs the one before it. cost is in skill points.
export const BRANCHES = { survivor: 'Survivor', explorer: 'Explorer', warrior: 'Warrior' };
export const SKILLS = [
  { id: 'forager', branch: 'survivor', cost: 1, name: 'Bountiful', text: '20% chance of one extra from anything you gather' },
  { id: 'iron_stomach', branch: 'survivor', cost: 2, name: 'Hearty meals', text: 'Food fills you 25% more' },
  { id: 'second_wind', branch: 'survivor', cost: 3, name: 'Second wind', text: 'Energy comes back 40% faster' },
  { id: 'mender', branch: 'survivor', cost: 4, name: 'Mender', text: 'Health returns twice as fast when fed and watered' },
  { id: 'deep_lungs', branch: 'explorer', cost: 1, name: 'Deep lungs', text: 'Hold your breath 50% longer' },
  { id: 'swimmer', branch: 'explorer', cost: 2, name: 'Strong swimmer', text: 'Swimming tires you 40% slower' },
  { id: 'weatherproof', branch: 'explorer', cost: 3, name: 'Weatherproof', text: 'Frost and heat wear you down 35% slower' },
  { id: 'pathfinder', branch: 'explorer', cost: 4, name: 'Pathfinder', text: 'Sprinting costs 30% less energy' },
  { id: 'tough_hide', branch: 'warrior', cost: 1, name: 'Tough hide', text: '+1 armor, always' },
  { id: 'keen_edge', branch: 'warrior', cost: 2, name: 'Keen edge', text: '+15% damage' },
  { id: 'tool_care', branch: 'warrior', cost: 3, name: 'Tool care', text: 'Tools and weapons wear out 35% slower' },
  { id: 'giant_slayer', branch: 'warrior', cost: 4, name: 'Giant slayer', text: '+30% damage to keepers' },
];
const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

// Experience for the things a player does, matched on the start of the recorded event key.
const XP = [
  ['keeper:restore', 150], ['keeper:found', 30], ['hoard', 40], ['goal', 25], ['kill', 8], ['sleep', 10], ['hunt', 4],
  ['craft:', 3], ['enhance', 10], ['trade', 2], ['plant', 2], ['place:', 2], ['collect:', 1], ['water', 1],
];
export const xpFor = (key) => XP.find(([start]) => key.startsWith(start))?.[1] ?? 0;

// Experience needed to go from `level` to the next one.
export const xpToNext = (level) => 20 + level * 10;

export class Progress {
  constructor(saved = {}) {
    this.level = Math.max(1, Math.min(MAX_LEVEL, saved.level ?? 1));
    this.xp = saved.xp ?? 0;
    this.stats = Object.fromEntries(Object.keys(STATS).map((id) => [id, Math.min(STAT_CAP, saved.stats?.[id] ?? 0)]));
    this.skills = new Set((saved.skills ?? []).filter((id) => SKILL_BY_ID[id]));
  }

  toJSON() { return { level: this.level, xp: this.xp, stats: this.stats, skills: [...this.skills] }; }

  get statPoints() { return this.level - 1 - Object.values(this.stats).reduce((a, b) => a + b, 0); }
  get skillPoints() { return Math.floor(this.level / SKILL_EVERY) - [...this.skills].reduce((sum, id) => sum + SKILL_BY_ID[id].cost, 0); }

  // Returns how many levels were gained.
  addXp(n) {
    if (this.level >= MAX_LEVEL || n <= 0) return 0;
    this.xp += n;
    let gained = 0;
    while (this.level < MAX_LEVEL && this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      gained++;
    }
    if (this.level >= MAX_LEVEL) this.xp = 0;
    return gained;
  }

  raise(stat) {
    if (!(stat in this.stats) || this.statPoints < 1 || this.stats[stat] >= STAT_CAP) return false;
    this.stats[stat]++;
    return true;
  }

  has(id) { return this.skills.has(id); }

  // The skill before this one in its branch, if any.
  needs(id) {
    const chain = SKILLS.filter((s) => s.branch === SKILL_BY_ID[id].branch);
    return chain[chain.findIndex((s) => s.id === id) - 1] ?? null;
  }

  canLearn(id) {
    const skill = SKILL_BY_ID[id], before = skill && this.needs(id);
    return !!skill && !this.has(id) && this.skillPoints >= skill.cost && (!before || this.has(before.id));
  }

  learn(id) {
    if (!this.canLearn(id)) return false;
    this.skills.add(id);
    return true;
  }

  // ---- what the points are worth ----
  get maxHealth() { return 10 + this.stats.vitality * 0.5; }
  get maxStamina() { return 10 + this.stats.endurance * 0.5; }
  get needsScale() { return 1 - this.stats.hardiness * 0.02; }
  get damageScale() { return (1 + this.stats.strength * 0.04) * (this.has('keen_edge') ? 1.15 : 1); }
  get speedScale() { return 1 + this.stats.agility * 0.01; }
}
