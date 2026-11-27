import { ITEMS, FLASK_DRINKS } from '../game/items.js';
import { GOALS } from '../game/goals.js';
import { BIOMES } from '../world/biomes.js';
import { HOTBAR, CAN_CAPACITY } from '../game/game.js';
import { iconURL, isPixelIcon } from './icons.js';

const $ = (id) => document.getElementById(id);

// Tooltip text: the item's name and what it does.
export function describe(slot) {
  const def = ITEMS[slot.id], parts = [def.name];
  if (def.food) parts.push(`+${def.food} food`);
  if (def.weapon) parts.push(`damage ${def.weapon}`);
  if (def.power) parts.push(`strength ${def.power}`);
  if (def.def) parts.push(`armor ${def.def}`);
  if (def.bag) parts.push(`+${def.bag} slots`);
  if (def.uses) parts.push(`${slot.d ?? def.uses}/${def.uses} uses left`);
  return parts.join(' \u00B7 ');
}

// Fills a slot element with an item icon and count.
export function renderSlot(el, slot) {
  el.replaceChildren();
  el.title = slot ? describe(slot) : '';
  if (!slot) return;
  const img = document.createElement('img');
  img.src = iconURL(slot.id);
  img.classList.toggle('px', isPixelIcon(slot.id));
  img.draggable = false;
  el.append(img);
  const uses = ITEMS[slot.id].uses;
  if (uses && slot.d !== undefined) {
    // wear bar: green when fresh, red when nearly broken
    const bar = document.createElement('u');
    const left = Math.max(0, slot.d / uses);
    bar.style.width = Math.round(left * 100) + '%';
    bar.style.background = left > 0.5 ? '#7ad04f' : left > 0.2 ? '#f2c94c' : '#e8505b';
    el.append(bar);
  }
  if (slot.n > 1) {
    const n = document.createElement('span');
    n.textContent = slot.n;
    el.append(n);
  }
}

function segments(parent) {
  return Array.from({ length: 10 }, () => {
    const seg = document.createElement('i');
    seg.append(document.createElement('b'));
    parent.append(seg);
    return seg.firstChild;
  });
}

const setBar = (segs, value) => segs.forEach((s, i) => (s.style.width = Math.round(Math.max(0, Math.min(1, value - i)) * 100) + '%'));

export class Hud {
  constructor(game) {
    this.game = game;
    this.hearts = segments($('hearts'));
    this.hunger = segments($('hunger'));
    this.thirst = segments($('thirst'));
    this.stamina = segments($('stamina'));
    this.air = segments($('air'));
    // Hotbar: click a slot to select it, or drag it onto another slot to swap the two.
    this.dragFrom = null;
    addEventListener('mouseup', () => (this.dragFrom = null));
    this.slots = Array.from({ length: HOTBAR }, (_, i) => {
      const el = document.createElement('div');
      el.className = 'slot';
      el.dataset.key = i + 1;
      el.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.dragFrom = i;
        game.selected = i;
        this.refresh();
      });
      el.addEventListener('mouseup', () => {
        if (this.dragFrom === null || this.dragFrom === i) return;
        game.inv.swap(this.dragFrom, i);
        game.selected = i;
        game.emit('inv');
      });
      $('hotbar').append(el);
      return el;
    });
    this.refresh();
  }

  refresh() {
    const g = this.game, p = g.player;
    const tile = g.gen.tile(Math.floor(p.x), Math.floor(p.z));
    $('biome').textContent = BIOMES[tile.biome].name;
    const goal = g.goals.current;
    if (goal) {
      const { done, total } = g.goals.status;
      $('goal-title').textContent = `GOAL ${g.goals.index + 1}/${GOALS.length}`;
      $('goal-text').textContent = total > 1 ? `${goal.text} (${done}/${total})` : goal.text;
    } else {
      $('goal-title').textContent = 'ALL GOALS COMPLETE';
      $('goal-text').textContent = 'The glade is yours. Keep building!';
    }
    const minutes = Math.floor(((6 + g.time * 24) % 24) * 60);
    const clock = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    $('day').textContent = `${g.isNight ? '☾' : '☀'} DAY ${g.day} · ${clock}`;
    const STATUS = {
      cold: 'Cold: you get hungry faster. Find a campfire, a floor, or armor',
      warm: 'Warm by the fire',
      sheltered: 'Sheltered indoors',
      swim: 'Swimming: your energy drains. Hold Shift to dive',
      dive: 'Under water: watch your air. Space swims up',
      boat: 'Sailing. F to get off',
      submarine: 'Submarine: Shift dives, Space rises, F to get out',
    };
    const status = $('status');
    const ride = g.vehicle;
    // the harsh regions come first: they kill fastest
    const ex = g.exposed ?? g.exposure();
    const missing = ex.short > 0 ? `need ${ex.short} more ${ex.kind === 'frost' ? 'fur' : 'crystal'} piece${ex.short > 1 ? 's' : ''}` : '';
    const harsh = ex.kind === 'frost' ? (ex.short ? `Freezing! You ${missing}, or a campfire` : ex.need ? 'Your furs keep out the cold' : '')
      : ex.kind === 'heat' ? (ex.short ? `Scorching! You ${missing}` : ex.need ? 'Your crystal gear keeps out the heat' : '') : '';
    const state = harsh ? (ex.short ? 'harsh' : 'safe') : ride ? ride.kind : g.submerged ? 'dive' : g.swimming ? 'swim' : g.status;
    status.className = harsh || STATUS[state] ? state : 'hidden';
    status.textContent = harsh || (STATUS[state] ?? '');
    // what the eat and drink keys would use right now, for the prompt below
    const foodSlot = g.foodSlot(), food = foodSlot >= 0 ? g.inv.slots[foodSlot] : null;
    const source = g.drinkSource();
    // One prompt at a time: thirst first, since it runs out sooner.
    const prompt = $('hungry');
    if (p.thirst < 4) {
      prompt.textContent = source ? 'You are thirsty. Press X to drink' : 'You are thirsty. Stand next to a pond and press X';
    } else if (p.hunger < 4) {
      prompt.textContent = food ? `You are hungry. Press C to eat ${ITEMS[food.id].name}` : 'You are hungry. Pick berries from bushes or apples from oak trees';
    }
    prompt.classList.toggle('hidden', p.thirst >= 4 && p.hunger >= 4);
    setBar(this.hearts, p.health);
    setBar(this.hunger, p.hunger);
    setBar(this.thirst, p.thirst);
    setBar(this.stamina, p.stamina);
    setBar(this.air, p.breath);
    $('air').classList.toggle('hidden', p.breath >= 10 && !g.submerged); // only shown while diving or catching breath
    $('stamina').classList.toggle('winded', !!p.winded);
    this.slots.forEach((el, i) => {
      renderSlot(el, g.inv.slots[i]);
      el.classList.toggle('selected', i === g.selected);
    });
  }

  // Bottom line: what is under the cursor and what the held item does.
  setHint(targetLabel) {
    const g = this.game, held = g.held;
    let text = '';
    if (held) {
      const def = ITEMS[held.id];
      text = def.name + (def.hint ? ' — ' + def.hint : '');
      if (def.tool === 'can') text += ` (${g.player.water}/${CAN_CAPACITY})`;
      if (def.flask) text += ` (${g.player.flask}/${FLASK_DRINKS})`;
    }
    const full = [targetLabel, text].filter(Boolean).join('   •   ');
    const el = $('hint');
    if (el.textContent !== full) el.textContent = full;
    el.style.visibility = full ? 'visible' : 'hidden';
  }

  toast(text) {
    const el = document.createElement('div');
    el.textContent = text;
    const box = $('toasts');
    box.append(el);
    while (box.children.length > 6) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2700);
  }
}
