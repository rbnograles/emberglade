import { ITEMS, ARMOR_SLOTS, MAX_DEFENSE } from '../game/items.js';
import { RECIPES, GRID, layout, ingredients } from '../game/crafting.js';
import { Inventory } from '../game/inventory.js';
import { HOTBAR } from '../game/game.js';
import { renderSlot } from './hud.js';
import { iconURL, isPixelIcon } from './icons.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const range = (n, from = 0) => Array.from({ length: n }, (_, i) => i + from);
const icon = (id, cls = '') => {
  const img = el('img', cls);
  img.src = iconURL(id);
  img.classList.toggle('px', isPixelIcon(id));
  img.draggable = false;
  return img;
};

const STATION_NAMES = { workbench: 'Workbench', campfire: 'Campfire' };

// Recipe book tabs. Each recipe falls in exactly one of the last four.
const categoryOf = (r) => {
  const def = ITEMS[r.out];
  if (def.armor) return 'wear';
  if (def.place || def.floor) return 'build';
  if (def.tool || def.weapon || def.flask || def.vehicle) return 'tools';
  return 'other';
};
const TABS = [['ready', 'Can make'], ['all', 'All'], ['tools', 'Tools'], ['build', 'Build'], ['wear', 'Wear'], ['other', 'Food & materials']];

// Inventory on the left; crafting grid, recipe book and recipe details on the right.
// Items are moved by picking a stack up onto the cursor and putting it down.
export class Panels {
  constructor(game) {
    this.game = game;
    this.root = $('panel');
    this.cursorEl = $('cursor');
    this.chest = null; // Inventory view over the open chest's items
    this.hover = null; // inventory slot index under the mouse
    this.tab = 'ready';
    this.selected = null; // recipe shown in the details box
    const follow = (e) => {
      this.cursorEl.style.left = e.clientX + 'px';
      this.cursorEl.style.top = e.clientY + 'px';
    };
    addEventListener('mousemove', follow);
    addEventListener('mousedown', follow, true);

  }

  get open() { return !this.root.classList.contains('hidden'); }

  show(chestPos = null) {
    const obj = chestPos && this.game.world.get(chestPos.x, chestPos.z);
    this.chest = obj?.t === 'chest' || obj?.t === 'lostbag' ? new Inventory(0, obj.items) : null;
    this.root.classList.remove('hidden');
    this.render();
  }

  hide() {
    this.root.classList.add('hidden');
    this.chest = null;
    this.hover = null;
    this.game.clearGrid();
    this.renderCursor();
  }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  renderCursor() {
    const c = this.open ? this.game.cursor : null;
    this.cursorEl.classList.toggle('hidden', !c);
    if (c) renderSlot(this.cursorEl, c);
  }

  // A grid of slots over `inv`; shift-click sends a stack to `other`.
  grid(inv, order, other, columns = 9) {
    const grid = el('div', 'grid');
    grid.style.gridTemplateColumns = `repeat(${columns}, 50px)`;
    for (const i of order) {
      const slot = el('div', 'slot');
      renderSlot(slot, inv.slots[i]);
      if (inv === this.game.inv && i < HOTBAR) slot.dataset.key = i + 1;
      if (inv === this.game.inv) {
        if (i === this.game.selected) slot.classList.add('selected');
        slot.addEventListener('mouseenter', () => (this.hover = i));
        slot.addEventListener('mouseleave', () => (this.hover = null));
      }
      slot.addEventListener('mousedown', (e) => {
        const game = this.game, c = game.cursor, s = inv.slots[i];
        // Shift + click an inventory item (no chest open): equip it.
        if (e.shiftKey && inv === game.inv && !this.chest && !c) {
          if (s) game.equip(i);
          return;
        }
        // In the crafting grid a held stack goes down one item per click, so no right-click is needed.
        const one = inv === game.craftGrid && c && (!s || s.id === c.id);
        game.clickSlot(inv, i, e.button === 2 || one ? 2 : 0, e.shiftKey, other);
      });
      grid.append(slot);
    }
    return grid;
  }

  // ---- left column: worn items, trash, inventory ----
  renderInventory() {
    const game = this.game, inv = game.inv;
    const left = el('div', 'col');
    if (this.chest) left.append(el('h3', '', this.chest.slots.length > 18 ? 'Your dropped pack' : 'Chest'), this.grid(this.chest, range(this.chest.slots.length), inv));

    const top = el('div', 'worn-row');
    const worn = el('div', 'armor');
    ARMOR_SLOTS.forEach((name, i) => {
      const slot = el('div', 'slot');
      slot.dataset.label = name;
      renderSlot(slot, game.armor.slots[i]);
      slot.addEventListener('mousedown', () => game.clickArmor(i));
      worn.append(slot);
    });
    worn.append(el('b', '', `Armor ${game.defense}/${MAX_DEFENSE}`));
    const trash = el('div', 'slot trash', '✕');
    trash.dataset.label = 'discard';
    trash.title = 'Pick up a stack and click here to throw it away';
    trash.addEventListener('mousedown', () => game.trashCursor());
    top.append(worn, trash);
    left.append(el('h3', '', 'Worn'), top);

    const used = inv.slots.filter(Boolean).length;
    left.append(el('h3', '', `Inventory (${used}/${game.capacity})`));
    // Only the slots you can carry are shown: a worn bag adds rows.
    left.append(this.grid(inv, range(game.capacity - HOTBAR, HOTBAR), this.chest));
    if (game.capacity < inv.slots.length) left.append(el('p', 'note', 'Wear a bag (Wear tab, at a workbench) for more rows.'));
    left.append(el('h3', '', 'Hotbar'), this.grid(inv, range(HOTBAR), this.chest));
    left.append(el('p', 'note', this.chest
      ? 'Click: pick up / put down · Right click: half / one · Shift + click: move to or from the chest'
      : 'Click: pick up / put down · Right click: half / one · Shift + click or 1–9: equip or wear'));
    return left;
  }

  // ---- right column: crafting grid, recipe book, recipe details ----
  recipeTile(r, canMake) {
    const tile = el('button', 'tile' + (canMake ? '' : ' dim') + (r === this.selected ? ' selected' : ''));
    tile.title = ITEMS[r.out].name;
    tile.append(icon(r.out));
    if (r.n > 1) tile.append(el('span', '', '×' + r.n));
    if (r.station) tile.append(el('i', r.station, r.station === 'workbench' ? 'W' : 'F'));
    tile.addEventListener('click', () => {
      // The panel is rebuilt on every click, so a double click is detected by hand.
      const now = performance.now();
      const again = this.selected === r && now - (this.lastClick ?? 0) < 400;
      this.lastClick = now;
      this.selected = r;
      if (again) this.game.quickCraft(r);
      this.render();
    });
    return tile;
  }

  recipeDetails(r, stations) {
    const game = this.game;
    const box = el('div', 'details');
    if (!r) {
      box.append(el('p', 'note', 'Pick a recipe to see what it needs. Double-click a recipe to craft it straight away.'));
      return box;
    }
    const cells = layout(r);
    const size = r.shapeless || cells.some((id, i) => id && (i % GRID === 2 || i >= 6)) ? 3 : 2;
    const mini = el('div', 'mini');
    mini.style.gridTemplateColumns = `repeat(${size}, 22px)`;
    for (let y = 0; y < (r.shapeless ? 1 : size); y++) {
      for (let x = 0; x < size; x++) {
        const cell = el('i');
        const id = cells[y * GRID + x];
        if (id) {
          cell.style.backgroundImage = `url(${iconURL(id)})`;
          cell.classList.toggle('px', isPixelIcon(id));
          cell.title = ITEMS[id].name;
        }
        mini.append(cell);
      }
    }

    const info = el('div', 'info');
    info.append(el('b', '', ITEMS[r.out].name + (r.n > 1 ? ` ×${r.n}` : '')));
    const needs = el('div', 'needs');
    for (const [id, n] of Object.entries(ingredients(r))) {
      const have = game.inv.count(id);
      const row = el('span', have >= n ? '' : 'missing');
      row.append(icon(id), `${ITEMS[id].name} ${Math.min(have, 999)}/${n}`);
      needs.append(row);
    }
    info.append(needs);
    const near = !r.station || stations.has(r.station);
    const where = r.station ? `Needs a ${STATION_NAMES[r.station].toLowerCase()} nearby` + (near ? ' ✓' : '') : r.shapeless ? 'By hand, any arrangement' : 'By hand';
    info.append(el('p', 'where' + (near ? '' : ' missing'), where));

    const buttons = el('div', 'buttons');
    const canMake = game.canMake(r, stations);
    const add = (label, fn, primary = false) => {
      const b = el('button', primary ? 'primary' : '', label);
      b.disabled = !canMake;
      b.addEventListener('click', fn);
      buttons.append(b);
    };
    add('Craft', () => game.quickCraft(r), true);
    add('Craft all', () => game.quickCraft(r, true));
    add('Lay out', () => game.fillRecipe(r));
    box.append(mini, info, buttons);
    return box;
  }

  renderCrafting() {
    const game = this.game, inv = game.inv;
    const stations = game.stationsNear();
    const bench = stations.has('workbench');
    const right = el('div', 'col recipes');

    const where = [bench ? 'Workbench 3×3' : 'By hand 2×2', stations.has('campfire') ? 'campfire lit' : null].filter(Boolean).join(' + ');
    right.append(el('h3', '', `Crafting · ${where}`));
    const craft = el('div', 'craft');
    craft.append(this.grid(game.craftGrid, bench ? range(GRID * GRID) : [0, 1, 3, 4], inv, bench ? 3 : 2), el('span', 'arrow big', '→'));
    const result = game.craftResult();
    const output = el('div', 'slot output' + (result ? ' ready' : ''));
    renderSlot(output, result ? { id: result.out, n: result.n } : null);
    output.addEventListener('mousedown', (e) => game.clickOutput(e.shiftKey));
    craft.append(output);
    craft.append(el('b', 'take', result ? `← Click to take ${ITEMS[result.out].name}` : ''));
    right.append(craft);

    right.append(el('h3', '', 'Recipes'));
    const ready = new Map(RECIPES.map((r) => [r, game.canMake(r, stations)]));
    const tabs = el('div', 'tabs');
    for (const [id, label] of TABS) {
      const count = id === 'ready' ? ` (${[...ready.values()].filter(Boolean).length})` : '';
      const b = el('button', id === this.tab ? 'active' : '', label + count);
      b.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
      tabs.append(b);
    }
    right.append(tabs);

    const shown = RECIPES.filter((r) => this.tab === 'all' || (this.tab === 'ready' ? ready.get(r) : categoryOf(r) === this.tab));
    shown.sort((a, b) => ready.get(b) - ready.get(a)); // what you can make comes first
    const book = el('div', 'book');
    if (shown.length) for (const r of shown) book.append(this.recipeTile(r, ready.get(r)));
    else book.append(el('p', 'note', 'Nothing yet. Gather sticks, stones and wood, or stand near a workbench or campfire.'));
    const scroll = this.root.querySelector('.book')?.scrollTop ?? 0;
    right.append(book, this.recipeDetails(this.selected, stations));
    right.append(el('p', 'note', 'W = needs a workbench nearby · F = needs a campfire nearby'));
    return [right, book, scroll];
  }

  render() {
    this.renderCursor();
    if (!this.open) return;
    const [right, book, scroll] = this.renderCrafting();
    this.root.replaceChildren(this.renderInventory(), right);
    book.scrollTop = scroll;
  }
}
