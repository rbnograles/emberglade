// Grid crafting. The grid is always 3x3 cells (row-major); by hand only the top-left 2x2 is usable.
// pattern: rows of legend characters, '.' = empty. Shaped recipes may sit anywhere in the grid and may be mirrored.
// shapeless: list of items, any arrangement. station: null, 'workbench' or 'campfire' (must be standing near one).
import { KEEPERS, carvingId } from './keepers.js';

export const GRID = 3;
const LEGEND = { '#': 'stone', '|': 'stick', W: 'wood', C: 'copper_bar', F: 'fiber', K: 'coal', H: 'hide', I: 'iron_bar', P: 'pearl', X: 'crystal', O: 'coral' };

export const RECIPES = [
  ...KEEPERS.map(k => ({ out: carvingId(k), n: 1, station: 'workbench', keeper: k.id, shapeless: ['stone', 'wood', 'wood', k.medium] })),
  { out: 'fiber', n: 4, shapeless: ['fleece'], station: null },
  { out: 'leather', n: 1, shapeless: ['hide'], station: 'campfire' },
  { out: 'leather_cap', n: 1, shapeless: ['leather', 'leather'], station: 'workbench' },
  { out: 'leather_tunic', n: 1, shapeless: ['leather', 'leather', 'leather', 'fiber'], station: 'workbench' },
  { out: 'leather_boots', n: 1, shapeless: ['leather', 'leather', 'fiber'], station: 'workbench' },
  { out: 'omelet', n: 1, shapeless: ['egg', 'egg'], station: 'campfire' },
  { out: 'rime_pack', n: 1, shapeless: ['trail_pack', 'fleece', 'rimeglass', 'rimeglass'], station: 'workbench' },
  { out: 'rime_pickaxe', n: 1, shapeless: ['iron_pickaxe', 'rimeglass', 'rimeglass', 'rimeglass'], station: 'workbench' },
  { out: 'ember_axe', n: 1, shapeless: ['iron_axe', 'emberglass', 'emberglass', 'emberglass'], station: 'workbench' },
  { out: 'ember_pike', n: 1, shapeless: ['iron_bar', 'emberglass', 'emberglass', 'stick'], station: 'workbench' },
  { out: 'stick', n: 2, shapeless: ['wood'], station: null },
  { out: 'stone_axe', n: 1, pattern: ['##', '#|'], station: null },
  { out: 'stone_pickaxe', n: 1, pattern: ['##', '||'], station: null },
  { out: 'hoe', n: 1, pattern: ['#', '|'], station: null },
  { out: 'campfire', n: 1, pattern: ['WW', '##'], station: null },
  { out: 'flask', n: 1, pattern: ['F', 'W'], station: null },
  { out: 'torch', n: 2, pattern: ['K', '|'], station: null },
  { out: 'workbench', n: 1, pattern: ['WW', 'WW'], station: null },
  { out: 'watering_can', n: 1, pattern: ['C.C', '.W.'], station: 'workbench' },
  { out: 'fence', n: 4, pattern: ['W|W', 'W|W'], station: 'workbench' },
  { out: 'bed', n: 1, pattern: ['FFF', 'WWW'], station: 'workbench' },
  { out: 'chest', n: 1, pattern: ['WWW', 'W.W', 'WWW'], station: 'workbench' },
  { out: 'copper_axe', n: 1, pattern: ['CC', 'C|', '.|'], station: 'workbench' },
  { out: 'copper_pickaxe', n: 1, pattern: ['CCC', '.|.', '.|.'], station: 'workbench' },
  { out: 'stone_sword', n: 1, pattern: ['#', '#', '|'], station: 'workbench' },
  { out: 'copper_sword', n: 1, pattern: ['C', 'C', '|'], station: 'workbench' },
  { out: 'wood_wall', n: 4, pattern: ['WWW', 'WWW'], station: 'workbench' },
  { out: 'stone_wall', n: 4, pattern: ['###', '###'], station: 'workbench' },
  { out: 'wood_floor', n: 4, pattern: ['WWW'], station: 'workbench' },
  { out: 'stone_floor', n: 4, pattern: ['###'], station: 'workbench' },
  { out: 'door', n: 1, pattern: ['WW', 'WW', 'WW'], station: 'workbench' },
  { out: 'woven_bag', n: 1, pattern: ['F.F', 'FFF'], station: 'workbench' },
  { out: 'trail_pack', n: 1, pattern: ['F|F', 'FHF', 'FFF'], station: 'workbench' },
  { out: 'fur_hat', n: 1, pattern: ['FHF', 'F.F'], station: 'workbench' },
  { out: 'fur_coat', n: 1, pattern: ['H.H', 'FHF', 'FFF'], station: 'workbench' },
  { out: 'fur_boots', n: 1, pattern: ['H.H', 'F.F'], station: 'workbench' },
  { out: 'heat_hood', n: 1, pattern: ['FXF', 'F.F'], station: 'workbench' },
  { out: 'heat_suit', n: 1, pattern: ['X.X', 'FXF', 'FFF'], station: 'workbench' },
  { out: 'heat_boots', n: 1, pattern: ['X.X', 'F.F'], station: 'workbench' },
  { out: 'woven_hat', n: 1, pattern: ['FFF', 'F.F'], station: 'workbench' },
  { out: 'woven_tunic', n: 1, pattern: ['F.F', 'FFF', 'FFF'], station: 'workbench' },
  { out: 'woven_boots', n: 1, pattern: ['F.F', 'F.F'], station: 'workbench' },
  { out: 'copper_helmet', n: 1, pattern: ['CCC', 'C.C'], station: 'workbench' },
  { out: 'copper_chestplate', n: 1, pattern: ['C.C', 'CCC', 'CCC'], station: 'workbench' },
  { out: 'copper_boots', n: 1, pattern: ['C.C', 'C.C'], station: 'workbench' },
  { out: 'glider', n: 1, pattern: ['FFF', '|H|'], station: 'workbench' },
  { out: 'lantern', n: 1, pattern: ['I', 'X', 'I'], station: 'workbench' },
  { out: 'coral_wall', n: 4, pattern: ['OO', 'OO'], station: 'workbench' },
  { out: 'stairs', n: 1, shapeless: ['wood', 'wood', 'stick'], station: 'workbench' },
  { out: 'stone_stairs', n: 1, shapeless: ['stone', 'stone', 'stone', 'stick'], station: 'workbench' },
  { out: 'brick_stairs', n: 1, shapeless: ['stone', 'stone', 'coal', 'stick'], station: 'workbench' },
  { out: 'window', n: 1, shapeless: ['stick', 'stick', 'stick', 'wood'], station: 'workbench' },
  { out: 'brick_wall', n: 4, shapeless: ['stone', 'stone', 'coal', 'stone', 'stone'], station: 'workbench' },
  { out: 'brick_floor', n: 4, shapeless: ['stone', 'coal', 'stone'], station: 'workbench' },
  { out: 'table', n: 1, shapeless: ['wood', 'wood', 'stick', 'stick'], station: 'workbench' },
  { out: 'chair', n: 1, shapeless: ['wood', 'stick', 'stick'], station: 'workbench' },
  { out: 'shelf', n: 1, shapeless: ['wood', 'wood', 'wood', 'stick', 'stick'], station: 'workbench' },
  { out: 'cabinet', n: 1, shapeless: ['chest', 'wood', 'stick'], station: 'workbench' },
  { out: 'lamp', n: 1, shapeless: ['torch', 'copper_bar', 'stick'], station: 'workbench' },
  { out: 'planter', n: 1, shapeless: ['wood', 'flower', 'flower'], station: 'workbench' },
  { out: 'gate', n: 1, shapeless: ['fence', 'stick'], station: 'workbench' },
  { out: 'roof', n: 4, shapeless: ['wood', 'fiber', 'fiber'], station: 'workbench' },
  { out: 'slate_roof', n: 4, shapeless: ['stone', 'stone', 'fiber'], station: 'workbench' },
  { out: 'tile_roof', n: 4, shapeless: ['stone', 'coal', 'fiber'], station: 'workbench' },
  { out: 'irrigator', n: 1, shapeless: ['watering_can', 'stone', 'stone', 'copper_bar'], station: 'workbench' },
  { out: 'hull', n: 1, shapeless: ['wood', 'wood', 'wood', 'wood', 'wood'], station: 'workbench' },
  { out: 'oar', n: 1, shapeless: ['wood', 'fiber', 'stick'], station: 'workbench' },
  { out: 'pressure_hull', n: 1, shapeless: ['iron_bar', 'iron_bar', 'iron_bar', 'iron_bar', 'iron_bar', 'pearl'], station: 'workbench' },
  { out: 'propeller', n: 1, shapeless: ['copper_bar', 'copper_bar', 'copper_bar'], station: 'workbench' },
  { out: 'axle', n: 1, shapeless: ['wood', 'wood', 'iron_bar'], station: 'workbench' },
  { out: 'trail_cart', n: 1, shapeless: ['hull', 'axle', 'axle'], station: 'workbench' },
  { out: 'boat', n: 1, shapeless: ['hull', 'oar'], station: 'workbench' },
  { out: 'submarine', n: 1, shapeless: ['pressure_hull', 'propeller'], station: 'workbench' },
  { out: 'iron_axe', n: 1, pattern: ['II', 'I|', '.|'], station: 'workbench' },
  { out: 'iron_pickaxe', n: 1, pattern: ['III', '.|.', '.|.'], station: 'workbench' },
  { out: 'iron_sword', n: 1, pattern: ['I', 'I', '|'], station: 'workbench' },
  { out: 'diving_mask', n: 1, pattern: ['FPF'], station: 'workbench' },
  { out: 'iron_bar', n: 1, shapeless: ['iron_ore', 'coal'], station: 'campfire' },
  { out: 'cooked_fish', n: 1, shapeless: ['raw_fish'], station: 'campfire' },
  { out: 'copper_bar', n: 1, shapeless: ['copper_ore', 'coal'], station: 'campfire' },
  { out: 'roasted_apple', n: 1, shapeless: ['apple'], station: 'campfire' },
  { out: 'cooked_meat', n: 1, shapeless: ['raw_meat'], station: 'campfire' },
  { out: 'bread', n: 1, shapeless: ['wheat', 'wheat', 'wheat'], station: 'campfire' },
];

// Pattern as rows of item ids (null = empty).
export const patternRows = (r) => r.pattern.map((row) => [...row].map((ch) => LEGEND[ch] ?? null));

// Where a recipe's ingredients go in the 3x3 grid: array of 9 ids/null.
export function layout(r) {
  const cells = Array(GRID * GRID).fill(null);
  if (r.shapeless) r.shapeless.forEach((id, i) => (cells[i] = id));
  else patternRows(r).forEach((row, y) => row.forEach((id, x) => (cells[y * GRID + x] = id)));
  return cells;
}

// Ingredient totals: {id: count}
export function ingredients(r) {
  const need = {};
  for (const id of layout(r)) if (id) need[id] = (need[id] ?? 0) + 1;
  return need;
}

// Crops the grid to the bounding box of its filled cells -> rows of ids, or null when empty.
function trim(cells) {
  let x0 = GRID, x1 = -1, y0 = GRID, y1 = -1;
  cells.forEach((id, i) => {
    if (!id) return;
    const x = i % GRID, y = (i / GRID) | 0;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  });
  if (x1 < 0) return null;
  const rows = [];
  for (let y = y0; y <= y1; y++) rows.push(cells.slice(y * GRID + x0, y * GRID + x1 + 1).map((id) => id ?? null));
  return rows;
}

const same = (a, b) => a.length === b.length && a.every((row, y) => row.length === b[y].length && row.every((id, x) => id === b[y][x]));

// cells: 9 item ids or null. Returns the recipe the grid currently makes, or null.
export function matchRecipe(cells, stations) {
  const rows = trim(cells);
  if (!rows) return null;
  const flat = cells.filter(Boolean).sort().join(',');
  const mirrored = rows.map((row) => [...row].reverse());
  for (const r of RECIPES) {
    if (r.station && !stations.has(r.station)) continue;
    if (r.shapeless) {
      if ([...r.shapeless].sort().join(',') === flat) return r;
    } else {
      const want = patternRows(r);
      if (same(rows, want) || same(mirrored, want)) return r;
    }
  }
  return null;
}
