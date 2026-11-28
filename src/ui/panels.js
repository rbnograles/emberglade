import { ITEMS, ARMOR_SLOTS, MAX_DEFENSE } from '../game/items.js';
import { RECIPES, ingredients } from '../game/crafting.js';
import { Inventory } from '../game/inventory.js';
import { HOTBAR } from '../game/game.js';
import { renderSlot } from './hud.js';
import { iconURL } from './icons.js';
import { ENHANCEMENTS, fits } from '../game/enhance.js';
import { touchDrag } from './dragswap.js';

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

  img.draggable = false;
  return img;
};

// Which tab a recipe sits under.
const VEHICLE_PARTS = ['hull', 'oar', 'pressure_hull', 'propeller', 'axle'];
const categoryOf = (r) => {
  const def = ITEMS[r.out];
  if (def.vehicle || def.glide || VEHICLE_PARTS.includes(r.out)) return 'vehicles';
  if (def.armor) return 'wear';
  if (def.place || def.floor || def.roof) return 'build';
  if (def.tool || def.weapon || def.flask || def.vehicle || def.glide || def.light) return 'tools';
  if (def.food) return 'food';
  return 'materials';
};
const TABS = [['all', 'All'], ['tools', 'Tools'], ['materials', 'Materials'], ['build', 'Building'], ['vehicles', 'Vehicles'], ['wear', 'Clothing'], ['food', 'Cooking'], ['enhance', 'Enhance']];

// Two cards side by side: the inventory on the left, crafting on the right.
// Items are moved by picking a stack up onto the cursor and putting it down.
export class Panels {
  constructor(game) {
    this.game = game;
    this.root = $('panel');
    this.cursorEl = $('cursor');
    this.chest = null; // Inventory view over the open chest's items
    this.hover = null; // inventory slot index under the mouse
    this.tab = 'all';
    this.onlyReady = false; // "only show what I can make"
    const follow = (e) => {
      this.cursorEl.style.left = e.clientX + 'px';
      this.cursorEl.style.top = e.clientY + 'px';
    };
    addEventListener('mousemove', follow);
    addEventListener('mousedown', follow, true);
    addEventListener('resize', () => this.fit());
  }

  get open() { return !this.root.classList.contains('hidden'); }

  show(chestPos = null) {
    const obj = chestPos && this.game.world.getAt(chestPos.x, chestPos.z, chestPos.l ?? 0);
    this.chest = obj?.t === 'chest' || obj?.t === 'cabinet' || obj?.t === 'lostbag' ? new Inventory(0, obj.items) : null;
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
  grid(inv, order, other, cls = '') {
    const grid = el('div', 'grid ' + cls);
    for (const i of order) {
      const slot = el('div', 'slot');
      renderSlot(slot, inv.slots[i]);
      if (inv === this.game.inv) {
        if (i < HOTBAR) slot.dataset.key = i + 1;
        if (i === this.game.selected) slot.classList.add('selected');
        slot.addEventListener('mouseenter', () => (this.hover = i));
        slot.addEventListener('mouseleave', () => (this.hover = null));
      }
      slot.addEventListener('mousedown', (e) => {
        const game = this.game, s = inv.slots[i];
        // Shift + click an inventory item (no chest open): equip or wear it.
        if (e.shiftKey && inv === game.inv && !this.chest && !game.cursor) {
          if (s) game.equip(i);
          return;
        }
        game.clickSlot(inv, i, e.button === 2 ? 2 : 0, e.shiftKey, other);
      });
      // on touch, drag a stack onto another slot to move it there or swap the two
      slot.slotRef = { inv, i };
      touchDrag(slot, (target) => {
        const to = target.slotRef;
        if (!to || game.cursor) return;
        game.clickSlot(inv, i, 0, false, other); // pick the stack up
        game.clickSlot(to.inv, to.i, 0, false, other); // put it down there
        if (game.cursor) game.clickSlot(inv, i, 0, false, other); // what it displaced goes where it came from
      });
      grid.append(slot);
    }
    return grid;
  }

  // ---- left card: chest (if open), worn items, inventory, hotbar ----
  renderInventory() {
    const game = this.game, inv = game.inv;
    const card = el('div', 'card inventory');
    if (this.chest) {
      const head = el('header');
      head.append(el('h2', '', this.chest.slots.length > 18 ? 'Your dropped pack' : 'Chest'));
      card.append(head, this.grid(this.chest, range(this.chest.slots.length), inv));
    }

    const head = el('header');
    head.append(el('h2', '', 'Inventory'), el('span', 'count', `${inv.slots.filter(Boolean).length}/${game.capacity}`));
    const sort = el('button', 'chip', 'Sort');
    sort.addEventListener('click', () => game.sortInventory());
    head.append(sort);
    card.append(head);

    const worn = el('div', 'worn');
    ARMOR_SLOTS.forEach((name, i) => {
      const slot = el('div', 'slot');
      slot.dataset.label = name;
      renderSlot(slot, game.armor.slots[i]);
      slot.addEventListener('mousedown', () => game.clickArmor(i));
      worn.append(slot);
    });
    worn.append(el('b', 'armor-total', `Armor ${game.defense}/${MAX_DEFENSE}`));
    const trash = el('div', 'slot trash', '✕');
    trash.dataset.label = 'discard';
    trash.title = 'Pick up a stack and click here to throw it away';
    trash.addEventListener('mousedown', () => game.trashCursor());
    worn.append(trash);
    card.append(worn);

    // Only the slots you can carry are shown: a worn bag adds rows.
    card.append(this.grid(inv, range(game.capacity - HOTBAR, HOTBAR), this.chest));
    card.append(this.grid(inv, range(HOTBAR), this.chest, 'hotbar-row'));
    card.append(el('p', 'note', this.chest
      ? 'Click to pick up or put down. Right click splits. Shift + click moves to or from the chest.'
      : game.capacity < inv.slots.length
        ? 'Click to pick up or put down. Right click splits. Shift + click equips. Wear a bag for more rows.'
        : 'Click to pick up or put down. Right click splits. Shift + click equips.'));
    return card;
  }

  // ---- right card: crafting list ----
  recipeRow(r, stations) {
    const game = this.game;
    const can = game.canMake(r, stations);
    const row = el('div', 'recipe' + (can ? '' : ' dim'));
    row.append(icon(r.out, 'big'));

    const body = el('div', 'body');
    body.append(el('b', '', ITEMS[r.out].name + (r.n > 1 ? ` ×${r.n}` : '')));
    const needs = el('div', 'needs');
    for (const [id, n] of Object.entries(ingredients(r))) {
      const have = game.inv.count(id);
      const chip = el('span', have >= n ? '' : 'missing');
      chip.title = ITEMS[id].name;
      chip.append(icon(id), `${Math.min(have, 999)}/${n}`);
      needs.append(chip);
    }
    if (r.station && !stations.has(r.station)) needs.append(el('span', 'missing station', `needs ${r.station}`));
    body.append(needs);

    const craft = el('button', 'craft-btn', 'Craft');
    craft.disabled = !can;
    craft.addEventListener('click', (e) => game.quickCraft(r, e.shiftKey ? 10 : 1));
    row.append(body, craft);
    return row;
  }

  renderCrafting() {
    const game = this.game;
    const stations = game.stationsNear();
    const card = el('div', 'card crafting');

    const head = el('header');
    head.append(el('h2', '', 'Crafting'));
    const badges = el('div', 'badges');
    for (const station of ['workbench', 'campfire']) {
      const on = stations.has(station);
      badges.append(el('span', 'badge' + (on ? ' on' : ''), on ? `✓ At ${station}` : `No ${station}`));
    }
    const close = el('button', 'close', '✕');
    close.title = 'Close (Tab or Esc)';
    close.addEventListener('click', () => this.hide());
    head.append(badges, close);
    card.append(head);

    const tabs = el('div', 'tabs');
    for (const [id, label] of TABS) {
      const b = el('button', 'chip' + (id === this.tab ? ' active' : ''), label);
      b.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
      tabs.append(b);
    }
    card.append(tabs);

    const only = el('label', 'only');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = this.onlyReady;
    box.addEventListener('change', () => {
      this.onlyReady = box.checked;
      this.render();
    });
    only.append(box, 'Only show what I can make');
    card.append(only);

    if (this.tab === 'enhance') {
      // enhancements go on whatever tool or weapon is in the hand
      const held = game.held, def = held ? ITEMS[held.id] : null;
      card.append(el('p', 'note', def?.uses
        ? `In hand: ${def.name}${held.e ? ' (' + ENHANCEMENTS[held.e].name + ')' : ''}. A new enhancement replaces the old one.`
        : 'Hold a tool or weapon, then choose what to work into it. Creatures and animals drop what these need.'));
      const list = el('div', 'list');
      for (const [id, e] of Object.entries(ENHANCEMENTS)) {
        const can = fits(id, def) && held.e !== id && Object.entries(e.cost).every(([item, n]) => game.inv.has(item, n));
        const row = el('div', 'recipe' + (can ? '' : ' dim'));
        const gem = el('i', 'gem big');
        gem.style.background = '#' + e.color.toString(16).padStart(6, '0');
        const body = el('div', 'body');
        body.append(el('b', '', e.name), el('small', '', e.text + (e.on === 'weapon' ? ' · weapons only' : '')));
        const needs = el('div', 'needs');
        for (const [item, n] of Object.entries(e.cost)) {
          const have = game.inv.count(item);
          const chip = el('span', have >= n ? '' : 'missing');
          chip.title = ITEMS[item].name;
          chip.append(icon(item), `${Math.min(have, 999)}/${n}`);
          needs.append(chip);
        }
        body.append(needs);
        const apply = el('button', 'craft-btn', held?.e === id ? 'Applied' : 'Apply');
        apply.disabled = !can;
        apply.addEventListener('click', () => game.enhance(id));
        row.append(gem, body, apply);
        list.append(row);
      }
      card.append(list);
      return [card, list];
    }
    const ready = new Map(RECIPES.map((r) => [r, game.canMake(r, stations)]));
    const shown = RECIPES.filter((r) => game.knowsRecipe(r) && (this.tab === 'all' || categoryOf(r) === this.tab) && (!this.onlyReady || ready.get(r)));
    shown.sort((a, b) => ready.get(b) - ready.get(a)); // what you can make comes first
    const list = el('div', 'list');
    if (shown.length) for (const r of shown) list.append(this.recipeRow(r, stations));
    else list.append(el('p', 'note', this.onlyReady ? 'Nothing you can make here yet. Gather more, or stand near a workbench or campfire.' : 'Nothing in this group.'));
    card.append(list);
    card.append(el('p', 'note', 'Pick a recipe and press Craft. Hold Shift to make 10.'));
    return [card, list];
  }

  render() {
    this.renderCursor();
    if (!this.open) return;
    const scroll = this.root.querySelector('.list')?.scrollTop ?? 0;
    const [crafting, list] = this.renderCrafting();
    this.root.replaceChildren(this.renderInventory(), crafting);
    list.scrollTop = scroll;
    this.fit();
  }

  // On a window too narrow for both cards side by side, shrink the pair to fit instead of letting
  // one slide over the other. Phones have their own layout and are left alone.
  fit() {
    const r = this.root;
    r.style.transform = '';
    r.style.setProperty('--fit', 1);
    if (!this.open || matchMedia('(pointer: coarse)').matches) return;
    const wide = [...r.children].reduce((sum, c) => sum + c.offsetWidth, 0) + 22 * (r.children.length - 1);
    const k = Math.min(1, (innerWidth - 28) / wide);
    // scaled about its middle, so it stays centred on the screen
    r.style.setProperty('--fit', k.toFixed(3));
    if (k < 1) r.style.transform = `translate(-50%, -50%) scale(${k.toFixed(3)})`;
  }
}
