const KEY = 'emberglade-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeSave(game) {
  try {
    localStorage.setItem(KEY, JSON.stringify(game.serialize()));
  } catch {
    // storage unavailable or full: the game keeps running without saving
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
