// One tile read as a column: solid ground at the bottom, and sometimes slabs of rock above it with
// open space between (an arch, a cave roof, an overhang). tile.slabs is [[lo, hi], ...], lowest first.
export const HEADROOM = 2; // clear height kept under every slab, in tiles
export const PLAYER_HEIGHT = 1.5; // how tall the player's body is

// The solid floor of a tile: the bed under water, the ground elsewhere.
export const floorOf = (t) => (t.water ? t.bed : t.h);

// Heights that can be stood on, lowest first.
export function surfaces(t) {
  const out = [floorOf(t)];
  if (t.slabs) for (const s of t.slabs) out.push(s[1]);
  return out;
}

// The top of the highest slab at or below `y`, or -Infinity when there is none.
export function slabTopBelow(t, y) {
  let top = -Infinity;
  if (t.slabs) for (const s of t.slabs) if (s[1] <= y) top = s[1];
  return top;
}

// The underside of the first slab that reaches above `y`, or Infinity under open sky.
export function ceilingAbove(t, y) {
  if (t.slabs) for (const s of t.slabs) if (s[1] > y) return s[0];
  return Infinity;
}

// Does any slab lie between two heights? (The ground itself is the caller's business.)
export function solidAt(t, y0, y1) {
  if (t.slabs) for (const s of t.slabs) if (s[0] < y1 && s[1] > y0) return true;
  return false;
}

// Every solid range of the tile, lowest first. The ground reaches down for ever.
export function solids(t) {
  return t.slabs ? [[-Infinity, floorOf(t)], ...t.slabs] : [[-Infinity, floorOf(t)]];
}
