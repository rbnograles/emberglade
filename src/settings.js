// Player preferences, kept in the browser separately from the saved worlds.
const KEY = 'emberglade-settings';

export const DEFAULT_KEYS = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', jump: 'Space',
  inventory: 'Tab', eat: 'KeyC', drink: 'KeyX', use: 'KeyF', camLeft: 'KeyQ', camRight: 'KeyE', camReset: 'KeyR', map: 'KeyM',
};

export const DEFAULT_LOOK = { skin: 0xf2c7a0, hair: 0x6b3f24, shirt: 0x4fa56a, pants: 0x5a4634, style: 'short' };

export const KEY_LABELS = {
  up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', sprint: 'Sprint', jump: 'Jump',
  inventory: 'Inventory / craft', eat: 'Eat', drink: 'Drink', use: 'Use (bed, chest...)',
  camLeft: 'Turn view left', camRight: 'Turn view right', camReset: 'Reset view', map: 'World map',
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
  look: { ...DEFAULT_LOOK, ...(saved.look ?? {}) }, // the character's colours and hair
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
