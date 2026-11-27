// need: event key -> count. Keys: collect:<item>, craft:<item>, place:<object>, plant, water.
export const GOALS = [
  { text: 'Gather 3 sticks from the ground', need: { 'collect:stick': 3 } },
  { text: 'Pick up 3 loose stones', need: { 'collect:stone': 3 } },
  { text: 'Craft a stone axe (Tab)', need: { 'craft:stone_axe': 1 } },
  { text: 'Chop trees for 8 wood', need: { 'collect:wood': 8 } },
  { text: 'Craft and place a campfire', need: { 'place:campfire': 1 } },
  { text: 'Craft a pickaxe, mine coal and copper ore', need: { 'collect:coal': 2, 'collect:copper_ore': 2 } },
  { text: 'Smelt 2 copper bars at the campfire', need: { 'craft:copper_bar': 2 } },
  { text: 'Craft and place a workbench', need: { 'place:workbench': 1 } },
  { text: 'Craft a watering can at the workbench', need: { 'craft:watering_can': 1 } },
  { text: 'Craft a hoe, till soil and plant 4 seeds', need: { plant: 4 } },
  { text: 'Water crops 10 times', need: { water: 10 } },
  { text: 'Harvest wheat and bake bread', need: { 'craft:bread': 1 } },
];

export class Goals {
  constructor(saved) {
    this.index = saved?.index ?? 0;
    this.progress = saved?.progress ?? {};
  }

  get current() { return GOALS[this.index] ?? null; }

  // {done, total} summed over the current goal's requirements
  get status() {
    const g = this.current;
    if (!g) return { done: 0, total: 0 };
    let done = 0, total = 0;
    for (const [k, n] of Object.entries(g.need)) {
      done += Math.min(n, this.progress[k] ?? 0);
      total += n;
    }
    return { done, total };
  }

  // Returns true when this event completes the current goal.
  record(key, n = 1) {
    const g = this.current;
    if (!g || !(key in g.need)) return false;
    this.progress[key] = Math.min(g.need[key], (this.progress[key] ?? 0) + n);
    const { done, total } = this.status;
    if (done < total) return false;
    this.index++;
    this.progress = {};
    return true;
  }

  toJSON() { return { index: this.index, progress: this.progress }; }
}
