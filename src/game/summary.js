// What the cloud keeps about a world besides the save itself: a few plain numbers that describe how
// far the player has come. Pure, so it can be tested without a network.
export function summarise(game) {
  const pr = game.progress, enc = game.encounters;
  return {
    seed: game.seed,
    day: game.day,
    level: pr.level,
    difficulty: game.difficulty,
    goals_done: game.goals.index,
    keepers_found: enc.discovered.size,
    keepers_restored: enc.restored.size,
    finished: enc.complete,
  };
}

// The moments worth a row of their own in the event log, from the game's recorded keys.
// Returns { type, detail } or null for everything too ordinary to log.
export function eventFor(key, game) {
  const at = { day: game.day, level: game.progress.level };
  if (key === 'keeper:restore') return { type: 'keeper_restored', detail: { ...at, restored: game.encounters.restored.size } };
  if (key === 'keeper:found') return { type: 'keeper_found', detail: { ...at, found: game.encounters.discovered.size } };
  if (key === 'hoard') return { type: 'hoard_opened', detail: at };
  return null;
}
