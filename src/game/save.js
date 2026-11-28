// Three world slots in the browser's localStorage, plus export / import as a file.
const BASE = 'emberglade-save-v1';
const SLOT_KEY = 'emberglade-slot';
export const SLOTS = 3;

export function currentSlot() {
  try {
    const n = Number(localStorage.getItem(SLOT_KEY)) || 1;
    return n >= 1 && n <= SLOTS ? n : 1;
  } catch {
    return 1;
  }
}

export function setSlot(n) {
  try {
    localStorage.setItem(SLOT_KEY, String(n));
  } catch {
    // storage unavailable: stays on the current slot
  }
}

// Slot 1 keeps the original key so worlds saved before slots existed still load.
const keyFor = (slot) => (slot === 1 ? BASE : `${BASE}-slot${slot}`);

export function loadSave(slot = currentSlot()) {
  try {
    const raw = localStorage.getItem(keyFor(slot));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeSave(game) {
  try {
    localStorage.setItem(keyFor(currentSlot()), JSON.stringify(game.serialize()));
  } catch {
    // storage unavailable or full: the game keeps running without saving
  }
}

export function clearSave(slot = currentSlot()) {
  try {
    localStorage.removeItem(keyFor(slot));
  } catch {
    // nothing to clear
  }
}

// "Day 4" for a used slot, or null when empty.
export function slotSummary(slot) {
  const save = loadSave(slot);
  return save ? `Day ${save.day ?? 1}` : null;
}

// What the menus show about a slot: { day, level, name, cls, worldType, difficulty }, or null when it is empty.
export function slotInfo(slot) {
  const save = loadSave(slot);
  if (!save) return null;
  return {
    day: save.day ?? 1, level: save.progress?.level ?? 1, name: save.character?.name ?? null, cls: save.character?.cls ?? null,
    worldType: save.worldType ?? 'continents', difficulty: save.rules ? save.difficulty ?? 'custom' : save.difficulty ?? 'standard',
  };
}

// ---- starting a new world ----
// The new-game screen cannot build a world in place: the page reloads into it. What was chosen
// waits here across that reload, and is taken exactly once.
const NEW_KEY = 'emberglade-newgame';

// setup: { slot, seed, worldType, difficulty, rules, character }
export function stashNewGame(setup) {
  try {
    localStorage.setItem(NEW_KEY, JSON.stringify(setup));
    return true;
  } catch {
    return false;
  }
}

// The waiting setup, if it is for the slot now being loaded; it is removed either way.
export function takeNewGame() {
  try {
    const raw = localStorage.getItem(NEW_KEY);
    localStorage.removeItem(NEW_KEY);
    const setup = raw ? JSON.parse(raw) : null;
    return setup && typeof setup === 'object' && setup.slot === currentSlot() ? setup : null;
  } catch {
    return null;
  }
}

// Set before reloading into a world that should start playing at once, without the title screen.
const PLAY_KEY = 'emberglade-autoplay';
export function playAfterReload() {
  try {
    sessionStorage.setItem(PLAY_KEY, '1');
  } catch {
    // no session storage: the title screen shows, which is harmless
  }
}
export function takeAutoplay() {
  try {
    const on = sessionStorage.getItem(PLAY_KEY) === '1';
    sessionStorage.removeItem(PLAY_KEY);
    return on;
  } catch {
    return false;
  }
}

// Offer the current world as a .json file download.
export function exportSave(game) {
  exportSaveData(game.serialize());
}

export function exportSaveData(save) {
  const blob = new Blob([JSON.stringify(save)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `emberglade-world-${currentSlot()}-day${save.day ?? 1}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Replace the current slot with a world fetched from elsewhere (the cloud). Returns true when it looked valid.
export function writeRaw(data) {
  try {
    if (typeof data?.seed !== 'number' || !data.player || !Array.isArray(data.inv)) return false;
    localStorage.setItem(keyFor(currentSlot()), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
// Replace the current slot with a world read from an exported file. Resolves true when it looked valid.
export async function importSave(file) {
  try {
    const data = JSON.parse(await file.text());
    if (typeof data.seed !== 'number' || !data.player || !Array.isArray(data.inv)) return false;
    localStorage.setItem(keyFor(currentSlot()), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
