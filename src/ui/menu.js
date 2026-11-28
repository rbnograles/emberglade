import { settings, saveSettings, DEFAULT_KEYS, KEY_LABELS, keyName } from '../settings.js';
import { applyVolume, sfx, unlockAudio } from '../audio.js';
import { DIFFICULTIES, RULE_FIELDS } from '../game/rules.js';
import { writeRaw, SLOTS, currentSlot, setSlot, slotSummary, exportSave, importSave } from '../game/save.js';
import { cloud, syncWorld, fetchWorld, signOut } from '../cloud.js';
import { ask } from './dialog.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
// The pause menu: world slots, character look, settings and controls, as tabs.
// hooks.beforeLeave(discard): called before the page reloads into another world.
// hooks.onTab(name): called when a tab is opened.
// hooks.save(): store the world now.
export function buildMenu(game, hooks) {
  // ---- tabs ----
  const tabs = [...document.querySelectorAll('#menu nav button')];
  const show = (name) => {
    for (const b of tabs) b.classList.toggle('active', b.dataset.tab === name);
    for (const s of document.querySelectorAll('#menu main > section')) s.classList.toggle('hidden', s.id !== 'tab-' + name);
    hooks.onTab?.(name);
  };
  for (const b of tabs) {
    b.addEventListener('click', () => {
      show(b.dataset.tab);
      sfx('ui');
    });
  }

  // ---- worlds ----
  const worlds = $('worlds');
  for (let n = 1; n <= SLOTS; n++) {
    const current = n === currentSlot(), summary = slotSummary(n);
    const card = el('button', 'world' + (current ? ' current' : ''));
    card.append(el('b', '', `World ${n}`), el('span', '', summary ?? 'Empty'), el('i', '', current ? 'Playing now' : summary ? 'Switch to this world' : 'Start a new game here'));
    card.addEventListener('click', () => {
      if (current) return;
      hooks.beforeLeave(false);
      setSlot(n);
      location.reload();
    });
    worlds.append(card);
  }
  // The world's difficulty. A world made with its own rules shows as Custom until a preset is chosen.
  const difficulty = $('difficulty');
  for (const [id, preset] of Object.entries(DIFFICULTIES)) difficulty.add(new Option(preset.name, id));
  const describeDifficulty = () => {
    const custom = game.difficulty === 'custom';
    if (custom && !difficulty.querySelector('[value=custom]')) difficulty.add(new Option('Custom', 'custom'));
    if (!custom) difficulty.querySelector('[value=custom]')?.remove();
    difficulty.value = game.difficulty;
    const r = game.rules, crowd = RULE_FIELDS.find((f) => f.key === 'enemies').choices.find(([v]) => v === r.enemies)?.[1] ?? r.enemies + '×';
    $('difficulty-help').textContent = (custom ? 'This world has its own rules. ' : DIFFICULTIES[game.difficulty].text + ' ')
      + `Needs ${r.drain}×, creatures: ${r.enemies ? `${crowd.toLowerCase()} at ${r.enemyDamage}× damage` : 'none'}, ${r.keepPack ? 'pack kept' : 'pack dropped'} on fainting.`;
  };
  describeDifficulty();
  difficulty.addEventListener('change', () => {
    game.setDifficulty(difficulty.value);
    describeDifficulty();
    hooks.save();
  });
  $('btn-export').addEventListener('click', () => exportSave(game));
  const file = el('input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.hidden = true;
  document.body.append(file);
  $('btn-import').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    if (!await ask({ title: 'Replace this world?', text: 'The imported file will take the place of the world in this slot.', yes: 'Replace', no: 'Cancel', danger: true })) return;
    if (await importSave(file.files[0])) {
      hooks.beforeLeave(true);
      location.reload();
    } else ask({ title: 'Could not import', text: 'That file is not an Emberglade world.' });
  });

  // ---- cloud ----
  const paintCloud = () => {
    $('cloud-status').textContent = cloud.status;
    for (const id of ['btn-cloud-up', 'btn-cloud-down']) $(id).hidden = !cloud.enabled;
  };
  cloud.onChange = paintCloud;
  paintCloud();

  // ---- account: signing in and up happen on the first screen of the game; here it only shows who is playing ----
  const paintAccount = () => {
    $('signed-in').hidden = !cloud.enabled;
    $('acct-who').textContent = cloud.account ? 'Signed in as ' + cloud.account : 'Log in from the main menu to play these worlds on your other devices.';
    $('btn-signout').hidden = !cloud.account;
  };
  const basePaint = cloud.onChange;
  cloud.onChange = () => {
    basePaint();
    paintAccount();
  };
  paintAccount();
  $('btn-signout').addEventListener('click', () => signOut());
  $('btn-cloud-up').addEventListener('click', () => syncWorld(game, currentSlot()));
  $('btn-cloud-down').addEventListener('click', async () => {
    const row = await fetchWorld(currentSlot());
    if (!row) return void ask({ title: 'Nothing in the cloud', text: 'No copy of this world slot has been saved to the cloud yet.' });
    const when = new Date(row.updated_at).toLocaleString();
    if (!await ask({ title: 'Load the cloud copy?', text: `It is from day ${row.day}, level ${row.level}, saved ${when}. It will replace the world in this slot on this device.`, yes: 'Replace', no: 'Cancel', danger: true })) return;
    if (writeRaw(row.data)) {
      hooks.beforeLeave(true);
      location.reload();
    } else ask({ title: 'Could not load', text: 'The cloud copy could not be read.' });
  });
  // ---- settings: sound and keys ----
  const root = $('settings');
  const slider = (label, key) => {
    const row = el('label', 'row');
    const input = el('input');
    input.type = 'range';
    input.min = 0;
    input.max = 1;
    input.step = 0.05;
    input.value = settings[key];
    input.addEventListener('input', () => {
      settings[key] = Number(input.value);
      unlockAudio();
      applyVolume();
      saveSettings();
      if (key === 'sfx') sfx('pick');
    });
    row.append(el('span', '', label), input);
    return row;
  };
  const graphics = el('label', 'row');
  const preset = el('select');
  preset.id = 'graphics';
  for (const [key, name] of [['low', 'Low · ¾ resolution, no shadows'], ['balanced', 'Balanced · native resolution'], ['high', 'High · high-density resolution']]) {
    preset.add(new Option(name, key));
  }
  preset.value = settings.graphics;
  preset.addEventListener('change', () => {
    settings.graphics = preset.value;
    hooks.onGraphics();
    saveSettings();
  });
  graphics.append(el('span', '', 'Scene quality'), preset);
  const full = el('button', 'small', 'Full screen on / off');
  full.addEventListener('click', () => hooks.onFullscreen());
  root.append(el('h4', '', 'Graphics'), graphics, full);
  root.append(el('h4', '', 'Sound'), slider('Effects', 'sfx'), slider('Music', 'music'));

  root.append(el('h4', '', 'Keys: click one, then press the new key'));
  const keys = el('div', 'keys');
  let waiting = null; // the action being rebound
  const paint = () => {
    for (const b of keys.querySelectorAll('button')) {
      b.textContent = waiting === b.dataset.action ? 'press a key…' : keyName(settings.keys[b.dataset.action]);
      b.classList.toggle('waiting', waiting === b.dataset.action);
    }
  };
  for (const action of Object.keys(DEFAULT_KEYS)) {
    const row = el('div', 'row');
    const b = el('button');
    b.dataset.action = action;
    b.addEventListener('click', () => {
      waiting = action;
      paint();
    });
    row.append(el('span', '', KEY_LABELS[action]), b);
    keys.append(row);
  }
  addEventListener('keydown', (e) => {
    if (!waiting) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code !== 'Escape') {
      // a key can only do one thing: whatever had it before takes the old key
      const other = Object.keys(settings.keys).find((a) => settings.keys[a] === e.code);
      if (other) settings.keys[other] = settings.keys[waiting];
      settings.keys[waiting] = e.code;
      saveSettings();
    }
    waiting = null;
    paint();
  }, true);
  const reset = el('button', 'small', 'Reset keys');
  reset.addEventListener('click', () => {
    Object.assign(settings.keys, DEFAULT_KEYS);
    saveSettings();
    paint();
  });
  root.append(keys, reset);
  paint();
  return { show };
}
