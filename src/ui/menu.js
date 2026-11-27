import * as THREE from 'three';
import { settings, saveSettings, DEFAULT_KEYS, DEFAULT_LOOK, KEY_LABELS, keyName } from '../settings.js';
import { applyVolume, sfx, unlockAudio } from '../audio.js';
import { DIFFICULTIES } from '../game/survival.js';
import { writeSave, writeRaw, SLOTS, currentSlot, setSlot, slotSummary, exportSave, importSave } from '../game/save.js';
import { cloud, syncWorld, fetchWorld } from '../cloud.js';
import { PlayerModel } from '../render/characters.js';
import { ask } from './dialog.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// What the character screen offers.
const LOOK_CHOICES = {
  skin: ['Skin', [0xf9dcc4, 0xf2c7a0, 0xd9a47a, 0xb9794f, 0x8a5a3c, 0x5c3a26]],
  hair: ['Hair', [0x2b2b33, 0x6b3f24, 0xa8743c, 0xe9c545, 0xd9432f, 0xf2efe6, 0x4f7ad0, 0xe274a2]],
  shirt: ['Shirt', [0x4fa56a, 0x3d7fbd, 0xd9534f, 0xf2c94c, 0x9a6fd6, 0xf2efe6, 0x2b2b33, 0xe8833a]],
  pants: ['Trousers', [0x5a4634, 0x2f4a6b, 0x3f3f46, 0x6b7078, 0x7a5233, 0x2f6a4a]],
};
const STYLES = [['short', 'Short'], ['long', 'Long'], ['tuft', 'Tuft'], ['bald', 'Bald']];

// Title / pause menu: world slots, character look, settings and controls, as tabs.
// hooks.beforeLeave(discard): called before the page reloads into another world.
// hooks.onLook(): called when the character's look changes.
export function buildMenu(game, hooks) {
  // ---- tabs ----
  const tabs = [...document.querySelectorAll('#menu nav button')];
  const show = (name) => {
    for (const b of tabs) b.classList.toggle('active', b.dataset.tab === name);
    for (const s of document.querySelectorAll('#menu main > section')) s.classList.toggle('hidden', s.id !== 'tab-' + name);
    sfx('ui');
  };
  for (const b of tabs) b.addEventListener('click', () => show(b.dataset.tab));

  // ---- worlds ----
  const worlds = $('worlds');
  for (let n = 1; n <= SLOTS; n++) {
    const current = n === currentSlot(), summary = slotSummary(n);
    const card = el('button', 'world' + (current ? ' current' : ''));
    card.append(el('b', '', `World ${n}`), el('span', '', summary ?? 'Empty: a new world starts here'), el('i', '', current ? 'Playing now' : 'Switch to this world'));
    card.addEventListener('click', () => {
      if (current) return;
      hooks.beforeLeave(false);
      setSlot(n);
      location.reload();
    });
    worlds.append(card);
  }
  const difficulty = $('difficulty');
  for (const [id, preset] of Object.entries(DIFFICULTIES)) {
    difficulty.add(new Option(preset.name, id));
  }
  difficulty.value = game.difficulty;
  const describeDifficulty = () => {
    $('difficulty-help').textContent = `Food, water and energy drain at ${DIFFICULTIES[game.difficulty].drain}× the standard rate.`;
  };
  describeDifficulty();
  difficulty.addEventListener('change', () => {
    game.difficulty = difficulty.value;
    describeDifficulty();
    writeSave(game);
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
  // ---- character ----
  buildCharacter(hooks.onLook);

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
}

// Colour swatches and hair styles, with the character turning slowly in a small preview.
function buildCharacter(onLook) {
  const canvas = $('look-preview');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, canvas.width / canvas.height, 0.1, 20);
  camera.position.set(0, 1.25, 4.6);
  camera.lookAt(0, 0.85, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb59a78, 1.1));
  const sun = new THREE.DirectionalLight(0xfff3dd, 2.2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const model = new PlayerModel(settings.look);
  scene.add(model.group);

  const options = $('look-options');
  const refresh = () => {
    model.applyLook(settings.look);
    saveSettings();
    onLook();
    for (const b of options.querySelectorAll('[data-key]')) b.classList.toggle('active', String(settings.look[b.dataset.key]) === b.dataset.value);
  };
  for (const [key, [label, colours]] of Object.entries(LOOK_CHOICES)) {
    options.append(el('h4', '', label));
    const row = el('div', 'swatches');
    for (const c of colours) {
      const b = el('button', 'swatch');
      b.style.background = hex(c);
      b.dataset.key = key;
      b.dataset.value = String(c);
      b.title = label;
      b.addEventListener('click', () => {
        settings.look[key] = c;
        refresh();
      });
      row.append(b);
    }
    options.append(row);
  }
  options.append(el('h4', '', 'Hair style'));
  const styles = el('div', 'swatches');
  for (const [id, label] of STYLES) {
    const b = el('button', 'style', label);
    b.dataset.key = 'style';
    b.dataset.value = id;
    b.addEventListener('click', () => {
      settings.look.style = id;
      refresh();
    });
    styles.append(b);
  }
  options.append(styles);
  const buttons = el('div', 'row-buttons');
  const random = el('button', '', 'Surprise me');
  random.addEventListener('click', () => {
    for (const [key, [, colours]] of Object.entries(LOOK_CHOICES)) settings.look[key] = colours[(Math.random() * colours.length) | 0];
    settings.look.style = STYLES[(Math.random() * STYLES.length) | 0][0];
    refresh();
  });
  const reset = el('button', '', 'Reset');
  reset.addEventListener('click', () => {
    Object.assign(settings.look, DEFAULT_LOOK);
    refresh();
  });
  buttons.append(random, reset);
  options.append(buttons);
  refresh();

  // Only draw while the character tab is on screen.
  let last = performance.now();
  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if ($('menu').classList.contains('hidden') || $('tab-character').classList.contains('hidden')) return;
    model.facing += dt * 0.8;
    model.update(dt, true, 2.2);
    renderer.render(scene, camera);
  };
  requestAnimationFrame(frame);
}
