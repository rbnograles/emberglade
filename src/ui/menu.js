import { settings, saveSettings, DEFAULT_KEYS, KEY_LABELS, keyName } from '../settings.js';
import { applyVolume, sfx, unlockAudio } from '../audio.js';
import { SLOTS, currentSlot, setSlot, slotSummary, exportSave, importSave } from '../game/save.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

// Builds the Settings box in the title / pause menu: volume, keys, world slots, export and import.
// beforeLeave(): called before the page reloads into another world, so the current one is saved first.
export function buildSettings(game, beforeLeave) {
  const root = document.getElementById('settings');
  root.replaceChildren();

  // ---- sound ----
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
  root.append(el('h4', '', 'Sound'), slider('Effects', 'sfx'), slider('Music', 'music'));

  // ---- keys ----
  root.append(el('h4', '', 'Keys (click one, then press the new key)'));
  const keys = el('div', 'keys');
  let waiting = null; // {action, button} while a rebind is in progress
  const paint = () => {
    for (const b of keys.querySelectorAll('button')) {
      b.textContent = waiting?.action === b.dataset.action ? 'press a key…' : keyName(settings.keys[b.dataset.action]);
      b.classList.toggle('waiting', waiting?.action === b.dataset.action);
    }
  };
  for (const action of Object.keys(DEFAULT_KEYS)) {
    const row = el('div', 'row');
    const b = el('button');
    b.dataset.action = action;
    b.addEventListener('click', () => {
      waiting = { action };
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
      // a key can only do one thing: whatever had it before swaps to the old key
      const other = Object.keys(settings.keys).find((a) => settings.keys[a] === e.code);
      if (other) settings.keys[other] = settings.keys[waiting.action];
      settings.keys[waiting.action] = e.code;
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

  // ---- worlds ----
  root.append(el('h4', '', 'Worlds'));
  const worlds = el('div', 'worlds');
  for (let n = 1; n <= SLOTS; n++) {
    const b = el('button', n === currentSlot() ? 'active' : '', `World ${n}: ${slotSummary(n) ?? 'empty'}`);
    b.addEventListener('click', () => {
      if (n === currentSlot()) return;
      beforeLeave();
      setSlot(n);
      location.reload();
    });
    worlds.append(b);
  }
  const exportBtn = el('button', 'small', 'Export this world');
  exportBtn.addEventListener('click', () => exportSave(game));
  const importBtn = el('button', 'small', 'Import a world file');
  const file = el('input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.hidden = true;
  importBtn.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    if (!confirm('Replace the world in this slot with the imported file?')) return;
    if (await importSave(file.files[0])) {
      beforeLeave(true);
      location.reload();
    } else alert('That file is not an Emberglade world.');
  });
  root.append(worlds, exportBtn, importBtn, file);
}
