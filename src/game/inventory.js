import { stackSize } from './items.js';

// Fixed number of slots, each null or {id, n}. `slots` may be a shared array (chests).
export class Inventory {
  constructor(size = 36, slots = null) {
    this.slots = slots ?? Array(size).fill(null);
    this.limit = this.slots.length; // add() only fills slots below this (bags raise it)
  }

  // Adds up to n items; returns how many did not fit.
  add(id, n = 1) {
    const max = stackSize(id);
    for (const s of this.slots.slice(0, this.limit)) {
      if (n <= 0) break;
      if (s && s.id === id && s.n < max) {
        const take = Math.min(n, max - s.n);
        s.n += take;
        n -= take;
      }
    }
    for (let i = 0; i < this.limit && n > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(n, max);
        this.slots[i] = { id, n: take };
        n -= take;
      }
    }
    return n;
  }

  count(id) {
    let c = 0;
    for (const s of this.slots) if (s && s.id === id) c += s.n;
    return c;
  }

  has(id, n = 1) { return this.count(id) >= n; }

  remove(id, n = 1) {
    if (!this.has(id, n)) return false;
    for (let i = this.slots.length - 1; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(n, s.n);
        s.n -= take;
        n -= take;
        if (s.n === 0) this.slots[i] = null;
      }
    }
    return true;
  }

  removeAt(i, n = 1) {
    const s = this.slots[i];
    if (!s || s.n < n) return false;
    s.n -= n;
    if (s.n === 0) this.slots[i] = null;
    return true;
  }

  swap(i, j) {
    [this.slots[i], this.slots[j]] = [this.slots[j], this.slots[i]];
  }

  // Move a whole slot into another inventory; whatever does not fit stays.
  moveTo(i, other) {
    const s = this.slots[i];
    if (!s) return;
    if (stackSize(s.id) === 1) {
      // single items (tools, armor) move as they are, so wear and tear travels with them
      const free = other.slots.findIndex((x, j) => !x && j < other.limit);
      if (free < 0) return;
      other.slots[free] = s;
      this.slots[i] = null;
      return;
    }
    const left = other.add(s.id, s.n);
    if (left === 0) this.slots[i] = null;
    else s.n = left;
  }
}
