import { cropFor } from './crops.js';

// Player changes layered over the generated world.
// An override is an object {t, ...}; t === 'empty' means the natural object was removed.
// {since, regrow} on an override makes it disappear again (the natural object returns) after `regrow` days.
export class WorldState {
  constructor(gen, saved, savedFloors, savedRoofs) {
    this.roofs = new Map(Object.entries(savedRoofs ?? {}));
    this.gen = gen;
    this.over = new Map(saved ? Object.entries(saved) : []);
    // Built floors are a separate layer under the objects: "x,z" -> floor item id.
    this.floors = new Map(savedFloors ? Object.entries(savedFloors) : []);
    this.listeners = [];
  }

  getRoof(x, z) { return this.roofs.get(x + ',' + z); }

  setRoof(x, z, id) {
    if (id) this.roofs.set(x + ',' + z, id);
    else this.roofs.delete(x + ',' + z);
    this.changed(x, z);
  }

  getFloor(x, z) { return this.floors.get(x + ',' + z) ?? null; }

  setFloor(x, z, id) {
    if (id) this.floors.set(x + ',' + z, id);
    else this.floors.delete(x + ',' + z);
    this.changed(x, z);
  }

  onChange(fn) { this.listeners.push(fn); }
  changed(x, z) { for (const fn of this.listeners) fn(x, z); }

  get(x, z) {
    const o = this.over.get(x + ',' + z);
    if (o) return o.t === 'empty' ? null : o;
    return this.gen.object(x, z);
  }

  set(x, z, obj) {
    this.over.set(x + ',' + z, obj);
    this.changed(x, z);
  }

  // Clear a tile. Natural objects come back after `regrow` days; placed ones leave it empty.
  remove(x, z, day = 0, regrow = 0) {
    const key = x + ',' + z;
    const cur = this.over.get(key);
    if (!this.gen.object(x, z)) this.over.delete(key);
    else if ((cur && cur.placed) || !regrow) this.over.set(key, { t: 'empty' });
    else this.over.set(key, { t: 'empty', since: day, regrow });
    this.changed(x, z);
  }

  // Morning: regrow nature, grow watered crops, dry the soil.
  newDay(day) {
    for (const [key, o] of [...this.over]) {
      const [x, z] = key.split(',').map(Number);
      if (o.regrow && day - o.since >= o.regrow) {
        this.over.delete(key);
        this.changed(x, z);
      } else if (o.t === 'soil' && (o.wet || o.crop >= 0)) {
        const irrigated = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) =>
          this.over.get((x + dx) + ',' + (z + dz))?.t === 'irrigator');
        if ((o.wet || irrigated) && o.crop >= 0 && o.crop < cropFor(o).days) o.crop++;
        o.wet = false;
        this.changed(x, z);
      }
    }
  }

  toJSON() { return Object.fromEntries(this.over); }
}
