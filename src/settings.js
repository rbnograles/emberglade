// Player preferences, kept in the browser separately from the saved worlds.
const KEY = 'emberglade-settings';

export const DEFAULT_KEYS = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', jump: 'Space',
  inventory: 'Tab', eat: 'KeyC', drink: 'KeyX', use: 'KeyF', camLeft: 'KeyQ', camRight: 'KeyE', camReset: 'KeyR', map: 'KeyM', sheet: 'KeyK', rotate: 'KeyT',
};

import { DEFAULT_LOOK, normalizeLook } from './game/looks.js';
export { DEFAULT_LOOK };

export const KEY_LABELS = {
  up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', sprint: 'Sprint', jump: 'Jump',
  inventory: 'Inventory / craft', eat: 'Eat', drink: 'Drink', use: 'Use (bed, chest...)',
  camLeft: 'Turn view left', camRight: 'Turn view right', camReset: 'Reset view', map: 'World map', sheet: 'Character sheet', rotate: 'Turn what you are placing',
};

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

const saved = load();
export const settings = {
  sfx: saved.sfx ?? 0.6,
  music: saved.music ?? 0.3,
  graphics: ['low', 'balanced', 'high'].includes(saved.graphics) ? saved.graphics : 'high',
  keys: { ...DEFAULT_KEYS, ...(saved.keys ?? {}) },
  look: normalizeLook(saved.look), // the look a new character starts from: the last one made on this device
};

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable: settings last for this session only
  }
}

// "KeyW" -> "W", "ShiftLeft" -> "Shift L", "Digit1" -> "1"
export const keyName = (code) =>
  code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, 'Arrow ').replace(/Left$/, ' L').replace(/Right$/, ' R').trim();
