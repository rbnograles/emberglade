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

const STATION_NAMES = { workbench: 'Workbench', campfire: 'Campfire' };

// Inventory, crafting grid and recipe book, optionally with an open chest.
// Items are moved by picking a stack up onto the cursor and putting it down.
export class Panels {
  constructor(game) {
    this.game = game;
    this.root = $('panel');
    this.cursorEl = $('cursor');
    this.chest = null; // Inventory view over the open chest's items
    this.hover = null; // inventory slot index under the mouse
    const follow = (e) => {
      this.cursorEl.style.left = e.clientX + 'px';
      this.cursorEl.style.top = e.clientY + 'px';
    };
    addEventListener('mousemove', follow);
    addEventListener('mousedown', follow, true);
    $('btn-craft').addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.toggle();
    });
  }

  get open() { return !this.root.classList.contains('hidden'); }

  show(chestPos = null) {
    const obj = chestPos && this.game.world.get(chestPos.x, chestPos.z);
    this.chest = obj?.t === 'chest' ? new Inventory(0, obj.items) : null;
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

  recipeRow(r, stations) {
    const game = this.game;
    const row = el('button', 'recipe');
    const near = !r.station || stations.has(r.station);
    const need = ingredients(r);
    const have = Object.entries(need).every(([id, n]) => game.inv.has(id, n));
    row.classList.toggle('dim', !near || !have);

    const cells = layout(r);
    const size = r.shapeless || cells.some((id, i) => id && (i % GRID === 2 || i >= 6)) ? 3 : 2;
    const mini = el('div', 'mini');
    mini.style.gridTemplateColumns = `repeat(${size}, 14px)`;
    for (let y = 0; y < (r.shapeless ? 1 : size); y++) {
      for (let x = 0; x < size; x++) {
        const cell = el('i');
        const id = cells[y * GRID + x];
        if (id) {
          cell.style.backgroundImage = `url(${iconURL(id)})`;
          cell.classList.toggle('px', isPixelIcon(id));
        }
        mini.append(cell);
      }
    }
    const out = el('img');
    out.src = iconURL(r.out);
    out.classList.toggle('px', isPixelIcon(r.out));
    const text = el('div');
    text.append(el('b', '', ITEMS[r.out].name + (r.n > 1 ? ` ×${r.n}` : '')));
    const needs = el('span');
    for (const [id, n] of Object.entries(need)) needs.append(el('em', game.inv.has(id, n) ? '' : 'missing', `${n} ${ITEMS[id].name}`));
    if (r.shapeless) needs.append(el('em', 'any', 'any arrangement'));
    text.append(needs);
    row.append(mini, el('span', 'arrow', '→'), out, text);
    row.addEventListener('click', () => game.fillRecipe(r));
    return row;
  }

  render() {
    this.renderCursor();
    if (!this.open) return;
    const game = this.game, inv = game.inv;
    const stations = game.stationsNear();
    const bench = stations.has('workbench');

    const left = el('div', 'col');
    if (this.chest) {
      left.append(el('h3', '', 'Chest'), this.grid(this.chest, range(this.chest.slots.length), inv));
    }
    left.append(el('h3', '', 'Worn'));
    const armor = el('div', 'armor');
    ARMOR_SLOTS.forEach((name, i) => {
      const slot = el('div', 'slot');
      slot.dataset.label = name;
      renderSlot(slot, game.armor.slots[i]);
      slot.addEventListener('mousedown', () => game.clickArmor(i));
      armor.append(slot);
    });
    armor.append(el('b', '', `Armor ${game.defense}/${MAX_DEFENSE}`));
    left.append(armor);
    left.append(el('h3', '', 'Inventory'));
    // Only the slots you can carry are shown: a worn bag adds rows.
    left.append(this.grid(inv, range(game.capacity - HOTBAR, HOTBAR), this.chest));
    if (game.capacity < inv.slots.length) left.append(el('p', 'note', 'Wear a bag (craft one at a workbench) for more inventory rows.'));
    left.append(this.grid(inv, range(HOTBAR), this.chest));
    left.append(el('p', 'note', this.chest
      ? 'Left click: pick up or put down a stack. Right click: take half, or put down one. Shift + click: move between chest and inventory.'
      : 'To equip an item or wear armor: Shift + click it, or hover it and press 1–9. The highlighted hotbar slot is what you hold. Left click moves stacks; right click takes half.'));

    const right = el('div', 'col recipes');
    const where = [bench ? 'workbench 3×3' : 'by hand 2×2', stations.has('campfire') ? 'campfire lit' : null].filter(Boolean).join(', ');
    right.append(el('h3', '', `Crafting (${where})`));
    const craft = el('div', 'craft');
    const cells = bench ? range(GRID * GRID) : [0, 1, 3, 4];
    craft.append(this.grid(game.craftGrid, cells, inv, bench ? 3 : 2), el('span', 'arrow big', '→'));
    const result = game.craftResult();
    const output = el('div', 'slot output' + (result ? ' ready' : ''));
    renderSlot(output, result ? { id: result.out, n: result.n } : null);
    output.addEventListener('mousedown', (e) => game.clickOutput(e.shiftKey));
    craft.append(output);
    if (result) craft.append(el('b', 'take', `← Click to take ${ITEMS[result.out].name}`));
    right.append(craft);
    right.append(el('p', 'note', 'Easiest: click a recipe below to lay it out, then click the glowing result. Or pick up a stack and click grid cells to place one item at a time. Shift + click the result to craft all.'));

    right.append(el('h3', '', 'Recipe book'));
    const book = el('div', 'book');
    for (const station of [null, 'workbench', 'campfire']) {
      if (station) book.append(el('h4', '', `${STATION_NAMES[station]}${stations.has(station) ? '' : ' (stand near one)'}`));
      for (const r of RECIPES.filter((x) => x.station === station)) book.append(this.recipeRow(r, stations));
    }
    const scroll = this.root.querySelector('.book')?.scrollTop ?? 0;
    right.append(book);
    this.root.replaceChildren(left, right);
    book.scrollTop = scroll;
  }
}
