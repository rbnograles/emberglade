import { classOf } from './classes.js';

// Everything the character creator offers, and the look a character has until told otherwise.
// Colours are 0xRRGGBB numbers; the rest are ids from the lists below.
export const DEFAULT_LOOK = {
  skin: 0xf2c7a0, hair: 0x6b3f24, shirt: 0x4fa56a, pants: 0x5a4634, style: 'short',
  eyes: 0x2b2b33, brows: 'soft', beard: 'none', mark: 'none', build: 'average', height: 'average',
  boots: 0x4a3828, accessory: 'none', accent: 0xd9534f,
};

export const LOOK_COLOURS = {
  skin: [0xf9dcc4, 0xf2c7a0, 0xe6b088, 0xd9a47a, 0xb9794f, 0x8a5a3c, 0x5c3a26, 0x3e2619],
  hair: [0x2b2b33, 0x4a2f1e, 0x6b3f24, 0xa8743c, 0xe9c545, 0xd9432f, 0xf2efe6, 0x9aa0a8, 0x4f7ad0, 0xe274a2, 0x4fa58c, 0x8a5fd0],
  eyes: [0x2b2b33, 0x5a3a22, 0x3d7fbd, 0x3f8f5a, 0x7a8894, 0xc98a2b, 0x8a5fd0],
  shirt: [0x4fa56a, 0x3d7fbd, 0xd9534f, 0xf2c94c, 0x9a6fd6, 0xf2efe6, 0x2b2b33, 0xe8833a, 0x3f8f8a, 0x8a5a3c],
  pants: [0x5a4634, 0x2f4a6b, 0x3f3f46, 0x6b7078, 0x7a5233, 0x2f6a4a, 0x6b2f3a, 0xd9cdb0],
  boots: [0x4a3828, 0x2b2b33, 0x7a5233, 0x8f8f96, 0x9a3b2f, 0xe6d7b8],
  accent: [0xd9534f, 0xf2c94c, 0x3d7fbd, 0x4fa56a, 0x9a6fd6, 0xf2efe6, 0x2b2b33, 0xe8833a],
};

// [id, label] in the order they are offered
export const LOOK_CHOICES = {
  style: [['short', 'Short'], ['long', 'Long'], ['bob', 'Bob'], ['ponytail', 'Ponytail'], ['bun', 'Bun'], ['braids', 'Braids'], ['tuft', 'Tuft'], ['spiky', 'Spiky'], ['mohawk', 'Mohawk'], ['bald', 'Bald']],
  brows: [['none', 'None'], ['soft', 'Soft'], ['bold', 'Bold']],
  beard: [['none', 'None'], ['stubble', 'Stubble'], ['moustache', 'Moustache'], ['goatee', 'Goatee'], ['full', 'Full beard']],
  mark: [['none', 'None'], ['freckles', 'Freckles'], ['blush', 'Rosy cheeks'], ['scar', 'Scar'], ['paint', 'War paint']],
  build: [['slim', 'Slim'], ['average', 'Average'], ['stocky', 'Stocky']],
  height: [['short', 'Short'], ['average', 'Average'], ['tall', 'Tall']],
  accessory: [['none', 'None'], ['scarf', 'Scarf'], ['cape', 'Cape'], ['headband', 'Headband'], ['glasses', 'Glasses'], ['hat', 'Hat']],
};

export const LOOK_LABELS = {
  skin: 'Skin', hair: 'Hair colour', eyes: 'Eyes', shirt: 'Shirt', pants: 'Trousers', boots: 'Boots', accent: 'Accessory colour',
  style: 'Hair style', brows: 'Brows', beard: 'Beard', mark: 'Face', build: 'Build', height: 'Height', accessory: 'Accessory',
};

// How the creator groups them.
export const LOOK_TABS = [
  ['Body', ['skin', 'build', 'height']],
  ['Hair', ['style', 'hair', 'beard']],
  ['Face', ['eyes', 'brows', 'mark']],
  ['Outfit', ['shirt', 'pants', 'boots', 'accessory', 'accent']],
];

// A whole, valid look from whatever was stored: unknown ids and missing parts fall back to the default.
export function normalizeLook(raw = {}) {
  const look = {};
  for (const [key, fallback] of Object.entries(DEFAULT_LOOK)) {
    const v = raw?.[key];
    if (key in LOOK_CHOICES) look[key] = LOOK_CHOICES[key].some(([id]) => id === v) ? v : fallback;
    else look[key] = Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : fallback;
  }
  return look;
}

// A look picked at random from everything on offer. rand: () => [0, 1)
export function randomLook(rand = Math.random) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const look = {};
  for (const key of Object.keys(DEFAULT_LOOK)) look[key] = key in LOOK_CHOICES ? pick(LOOK_CHOICES[key])[0] : pick(LOOK_COLOURS[key]);
  // most people have no beard, mark or accessory; keep those the exception
  if (rand() < 0.6) look.beard = 'none';
  if (rand() < 0.6) look.mark = 'none';
  if (rand() < 0.4) look.accessory = 'none';
  return look;
}

const NAMES = ['Ash', 'Briar', 'Cinder', 'Dara', 'Elm', 'Fen', 'Garnet', 'Hollis', 'Ivo', 'Juno', 'Kestrel', 'Linden', 'Maren', 'Nettle', 'Orin', 'Piper', 'Quill', 'Rowan', 'Sorrel', 'Tamsin', 'Umber', 'Vesper', 'Wren', 'Yarrow'];
export const randomName = (rand = Math.random) => NAMES[Math.floor(rand() * NAMES.length)];

// A name fit to show and store: trimmed, single spaces, at most 16 characters.
export function cleanName(raw, fallback = 'Wanderer') {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
  return name || fallback;
}

// A whole, valid character ({ name, cls, look }) from whatever was stored, or null when there is none.
export function normalizeCharacter(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return { name: cleanName(raw.name), cls: classOf(raw.cls) ? raw.cls : null, look: normalizeLook(raw.look) };
}
