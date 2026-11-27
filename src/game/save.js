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

export function clearSave() {
  try {
    localStorage.removeItem(keyFor(currentSlot()));
  } catch {
    // nothing to clear
  }
}

// "Day 4" for a used slot, or null when empty.
export function slotSummary(slot) {
  const save = loadSave(slot);
  return save ? `Day ${save.day ?? 1}` : null;
}

// Offer the current world as a .json file download.
export function exportSave(game) {
  const blob = new Blob([JSON.stringify(game.serialize())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `emberglade-world-${currentSlot()}-day${game.day}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
