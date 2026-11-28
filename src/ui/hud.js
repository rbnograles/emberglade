import { ITEMS, FLASK_DRINKS, ARMOR_SLOTS } from '../game/items.js';
import { GOALS } from '../game/goals.js';
import { xpToNext, MAX_LEVEL } from '../game/progress.js';
import { BIOMES } from '../world/biomes.js';
import { HOTBAR, CAN_CAPACITY } from '../game/game.js';
import { OBJECTS } from '../world/objects.js';
import { cropFor } from '../world/crops.js';
import { iconURL } from './icons.js';
import { touchActionState } from './touch-actions.js';

const $ = (id) => document.getElementById(id);

export function objectToolVerb(tool, obj) {
  if (!obj) return tool === 'hoe' ? 'Till' : 'Tool';
  if (obj.t === 'soil') {
    if (obj.crop >= cropFor(obj).days) return 'Harvest';
    return obj.crop < 0 && tool === 'hoe' ? 'Restore ground' : 'Tool';
  }
  const def = OBJECTS[obj.t];
  if (def.pick && !(obj.t === 'bush' && tool === 'axe')) return obj.t === 'bush' ? 'Gather berries' : 'Pick up';
  if (def.tool === 'axe') return 'Chop';
  if (def.tool === 'pickaxe') return 'Mine';
  return obj.placed ? 'Take' : 'Tool';
}

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

// Ten segments always stand for the whole bar, however large max has grown.
const setBar = (segs, value, max = 10) => segs.forEach((s, i) => (s.style.width = Math.round(Math.max(0, Math.min(1, (value * 10) / max - i)) * 100) + '%'));

const RING = 2 * Math.PI * 45; // length of the portrait's experience ring, in its own units

// The character's face as 16 x 16 pixel art in the colours chosen on the character screen.
export function drawFace(look) {
  const c = $('face').getContext('2d');
  const css = (n) => '#' + n.toString(16).padStart(6, '0');
  const fill = (color, x, y, w, h) => {
    c.fillStyle = css(color);
    c.fillRect(x, y, w, h);
  };
  const shade = (n, k) => (((n >> 16) * k) << 16) | ((((n >> 8) & 255) * k) << 8) | ((n & 255) * k);
  c.clearRect(0, 0, 16, 16);
  fill(look.shirt, 3, 14, 10, 2); // shoulders
  fill(shade(look.skin, 0.86), 6, 13, 4, 1); // neck
  fill(look.skin, 3, 4, 10, 9); // face
  if (look.style !== 'bald') {
    fill(look.hair, 3, 2, 10, 3); // hair on top
    fill(look.hair, 2, 3, 1, 4);
    fill(look.hair, 13, 3, 1, 4);
    if (look.style === 'long') {
      fill(look.hair, 2, 5, 2, 9);
      fill(look.hair, 12, 5, 2, 9);
    } else if (look.style === 'tuft') fill(look.hair, 6, 0, 4, 2);
    else fill(look.hair, 3, 5, 2, 1); // a short fringe
  }
  fill(0x2b2b33, 5, 8, 2, 2); // eyes
  fill(0x2b2b33, 9, 8, 2, 2);
  fill(0xffffff, 5, 8, 1, 1);
  fill(0xffffff, 9, 8, 1, 1);
  fill(shade(look.skin, 0.72), 7, 11, 2, 1); // mouth
}

// On a touch screen there are no keys or mouse buttons, so messages name the on-screen buttons instead.
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const TOUCH_WORDS = [
  [/\bLMB\b/g, 'Tool'], [/\bRMB\b/g, 'Place'], [/\b([Pp])ress F\b/g, (m, p) => (p === 'P' ? 'Tap' : 'tap') + ' Use'], [/\bF: /g, 'Use: '], [/\(F to /g, '(Use to '],
  [/\b([Pp])ress X\b/g, (m, p) => (p === 'P' ? 'Tap' : 'tap') + ' Drink'], [/\b([Pp])ress C\b/g, (m, p) => (p === 'P' ? 'Tap' : 'tap') + ' Eat'],
  [/\b([Pp])ress K\b/g, (m, p) => (p === 'P' ? 'Tap' : 'tap') + ' Skills'], [/\b([Pp])ress M\b/g, (m, p) => (p === 'P' ? 'Tap' : 'tap') + ' Map'],
  [/\bclick\b/g, 'tap'], [/\bClick\b/g, 'Tap'], [/\bhold Space\b/g, 'hold Jump'], [/\bHold Shift\b/g, 'Hold Run'], [/\bShift\b/g, 'Run'], [/\bSpace\b/g, 'Jump'],
];
export const touchWords = (text) => (TOUCH ? TOUCH_WORDS.reduce((s, [from, to]) => s.replace(from, to), text) : text);

export class Hud {
  constructor(game) {
    this.game = game;
    this.touchActions = Object.fromEntries(['eat', 'drink'].map((name) => [name,
      document.querySelector(`#touch-controls [data-action="${name}"]`)]));
    this.hearts = segments($('hearts'));
    this.hunger = segments($('hunger'));
    this.thirst = segments($('thirst'));
    this.stamina = segments($('stamina'));
    this.air = segments($('air'));
    // the worn gear beside the portrait: head, body, feet and back
    this.gear = ARMOR_SLOTS.map((name) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.label = name;
      $('gear').append(slot);
      return slot;
    });
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
    const scald = g.scalding ? 'The sea is boiling! Only a submarine can cross it' : '';
    const state = scald ? 'harsh' : harsh ? (ex.short ? 'harsh' : 'safe') : ride ? ride.kind : g.submerged ? 'dive' : g.swimming ? 'swim' : g.status;
    status.className = scald || harsh || STATUS[state] ? state : 'hidden';
    status.textContent = scald || harsh || (STATUS[state] ?? '');
    // what the eat and drink keys would use right now, for the prompt below
    const foodSlot = g.foodSlot(), food = foodSlot >= 0 ? g.inv.slots[foodSlot] : null;
    const source = g.drinkSource();
    const touchActions = touchActionState(g);
    for (const [name, state] of Object.entries(touchActions)) {
      const button = this.touchActions[name];
      if (!button) continue;
      button.textContent = state.label;
      button.hidden = !state.visible;
      button.setAttribute('aria-hidden', String(!state.visible));
    }
    // One prompt at a time: thirst first, since it runs out sooner.
    const prompt = $('hungry');
    if (p.thirst < 4) {
      prompt.textContent = touchWords(source ? 'You are thirsty. Press X to drink' : 'You are thirsty. Stand next to a pond and press X');
    } else if (p.hunger < 4) {
      prompt.textContent = touchWords(food ? `You are hungry. Press C to eat ${ITEMS[food.id].name}` : 'You are hungry. Pick berries from bushes or apples from oak trees');
    }
    prompt.classList.toggle('hidden', p.thirst >= 4 && p.hunger >= 4);
    setBar(this.hearts, p.health, g.maxHealth);
    setBar(this.hunger, p.hunger);
    setBar(this.thirst, p.thirst);
    setBar(this.stamina, p.stamina, g.maxStamina);
    const pr = g.progress, need = xpToNext(pr.level), points = pr.statPoints + pr.skillPoints;
    this.gear.forEach((slot, i) => {
      const worn = g.armor.slots[i];
      if (slot.dataset.id !== (worn?.id ?? '')) {
        slot.dataset.id = worn?.id ?? '';
        renderSlot(slot, worn);
      }
      if (!worn) slot.title = 'Nothing worn on your ' + ARMOR_SLOTS[i];
    });
    // the portrait: the ring fills with experience toward the next level
    const full = pr.level >= MAX_LEVEL ? 1 : pr.xp / need;
    $('xp-ring').style.strokeDashoffset = RING * (1 - full);
    $('level').textContent = 'Lv ' + pr.level;
    $('level-points').textContent = points > 0 ? '+' + points : '';
    $('portrait').title = (pr.level >= MAX_LEVEL ? 'Highest level reached' : pr.xp + ' / ' + need + ' experience') + '. Press K for your character sheet.';
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
      text = def.name + (def.hint ? ' — ' + touchWords(def.hint) : '');
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
    el.textContent = touchWords(text);
    const box = $('toasts');
    box.append(el);
    while (box.children.length > 6) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2700);
  }
}
