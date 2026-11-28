import { cropFor } from './crops.js';

export const TOP_LEVEL = 2; // storeys are 0 (ground), 1 and 2
export const STOREY = 1.5; // height of one storey, the same as a wall

// Player changes layered over the generated world.
// An override is an object {t, ...}; t === 'empty' means the natural object was removed.
// {since, regrow} on an override makes it disappear again (the natural object returns) after `regrow` days.
export class WorldState {
  constructor(gen, saved, savedFloors, savedRoofs, savedUpper) {
    this.roofs = new Map(Object.entries(savedRoofs ?? {}));
    // Storeys above the ground: "x,z,level" -> { obj, floor, roof }, for level 1 and 2. The ground
    // storey stays in the maps it always used, so worlds saved before upper storeys load unchanged.
    this.upper = new Map();
    for (const [key, cell] of Object.entries(savedUpper ?? {})) {
      const [x, z, l] = key.split(',').map(Number);
      if (![x, z, l].every(Number.isInteger) || l < 1 || l > TOP_LEVEL || !cell || typeof cell !== 'object') continue; // malformed: skipped, never a crash
      this.upper.set(key, { obj: cell.obj ?? null, floor: cell.floor ?? null, roof: cell.roof ?? null });
    }
    this.gen = gen;
    this.over = new Map(saved ? Object.entries(saved) : []);
    // Built floors are a separate layer under the objects: "x,z" -> floor item id.
    this.floors = new Map(savedFloors ? Object.entries(savedFloors) : []);
    this.listeners = [];
  }

  // One cell of an upper storey, made on demand when written to and dropped again once it is empty.
  cell(x, z, level, make = false) {
    const key = x + ',' + z + ',' + level;
    let c = this.upper.get(key);
    if (!c && make) this.upper.set(key, (c = { obj: null, floor: null, roof: null }));
    return c ?? null;
  }

  put(x, z, level, field, value) {
    const c = this.cell(x, z, level, !!value);
    if (!c) return;
    c[field] = value ?? null;
    if (!c.obj && !c.floor && !c.roof) this.upper.delete(x + ',' + z + ',' + level);
    this.changed(x, z);
  }

  // level 0 is the ground storey; 1 and 2 are the storeys above it
  // On the ground a settlement's own floors and roofs show through unless the player has changed
  // them; 'none' marks one that was taken up, so it does not grow back.
  getRoof(x, z, level = 0) {
    if (level) return this.cell(x, z, level)?.roof ?? null;
    const mine = this.roofs.get(x + ',' + z);
    return mine === 'none' ? null : mine ?? this.gen.roofAt?.(x, z) ?? null;
  }

  setRoof(x, z, id, level = 0) {
    if (level) return void this.put(x, z, level, 'roof', id);
    if (id) this.roofs.set(x + ',' + z, id);
    else if (this.gen.roofAt?.(x, z)) this.roofs.set(x + ',' + z, 'none');
    else this.roofs.delete(x + ',' + z);
    this.changed(x, z);
  }

  getFloor(x, z, level = 0) {
    if (level) return this.cell(x, z, level)?.floor ?? null;
    const mine = this.floors.get(x + ',' + z);
    return mine === 'none' ? null : mine ?? this.gen.floorAt?.(x, z) ?? null;
  }

  setFloor(x, z, id, level = 0) {
    if (level) return void this.put(x, z, level, 'floor', id);
    if (id) this.floors.set(x + ',' + z, id);
    else if (this.gen.floorAt?.(x, z)) this.floors.set(x + ',' + z, 'none');
    else this.floors.delete(x + ',' + z);
    this.changed(x, z);
  }

  // The object standing on a storey. Nature only ever grows on the ground.
  getAt(x, z, level = 0) { return level ? this.cell(x, z, level)?.obj ?? null : this.get(x, z); }

  setAt(x, z, level, obj) {
    if (level) this.put(x, z, level, 'obj', obj);
    else this.set(x, z, obj);
  }

  removeAt(x, z, level, day = 0, regrow = 0) {
    if (level) this.put(x, z, level, 'obj', null);
    else this.remove(x, z, day, regrow);
  }

  upperJSON() { return Object.fromEntries(this.upper); }

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
