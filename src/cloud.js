import { summarise } from './game/summary.js';

// Optional cloud storage in the owner's Supabase project. It does nothing at all unless the two
// settings below are present when the game is built; the game then plays exactly as before, from
// the browser's own storage.
//
// With them set, each browser signs in as an anonymous guest (no email, no name) and can only read
// and write its own rows. Three things are recorded:
//   saves   - the latest copy of each world slot, so a world can be fetched on another device
//   players - one row of progress per world (day, level, keepers restored), for stats or a leaderboard
//   events  - a log of milestones (levels gained, keepers found and restored, hoards, faints)
// The tables and their access rules are in supabase/schema.sql.
const URL = import.meta.env?.VITE_SUPABASE_URL, KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;

export const cloud = {
  enabled: !!(URL && KEY),
  status: URL && KEY ? 'Connecting…' : 'Not set up',
  userId: null,
  lastSync: null,
  onChange: () => {}, // called whenever status changes, so the menu can show it
};

let ready = null; // promise of the signed-in client, made on first use

function say(status) {
  cloud.status = status;
  cloud.onChange();
}

// The client library is only downloaded when the cloud is set up, so it costs nothing otherwise.
function connect() {
  if (!cloud.enabled) return Promise.resolve(null);
  ready ??= (async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const client = createClient(URL, KEY);
      let { data: { session } } = await client.auth.getSession();
      if (!session) {
        const { data, error } = await client.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
      cloud.userId = session.user.id;
      say('Connected as a guest');
      return client;
    } catch (error) {
      say('Could not connect: ' + (error.message ?? error));
      ready = null; // try again next time
      return null;
    }
  })();
  return ready;
}

// Run one request; failures are reported in the status line and never interrupt play.
async function attempt(what, fn) {
  const client = await connect();
  if (!client) return null;
  try {
    const { data, error } = await fn(client);
    if (error) throw error;
    return data ?? true;
  } catch (error) {
    say(`${what} failed: ${error.message ?? error}`);
    return null;
  }
}

// Store the latest copy of this world and its progress row.
export async function syncWorld(game, slot) {
  if (!cloud.enabled) return false;
  const save = game.serialize(), stats = summarise(game), updated_at = new Date().toISOString();
  const saved = await attempt('Saving to the cloud', (c) =>
    c.from('saves').upsert({ user_id: cloud.userId, slot, data: save, day: stats.day, level: stats.level, updated_at }, { onConflict: 'user_id,slot' }));
  if (!saved) return false;
  await attempt('Recording progress', (c) =>
    c.from('players').upsert({ user_id: cloud.userId, slot, ...stats, updated_at }, { onConflict: 'user_id,slot' }));
  cloud.lastSync = new Date();
  say('Saved to the cloud at ' + cloud.lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  return true;
}

// The stored copy of a world slot, or null when there is none (or no cloud).
export async function fetchWorld(slot) {
  const row = await attempt('Loading from the cloud', (c) => c.from('saves').select('data, day, level, updated_at').eq('slot', slot).maybeSingle());
  return row && row !== true ? row : null;
}

// Add a line to the milestone log.
export function logEvent(type, detail = {}, slot = 1) {
  if (!cloud.enabled) return;
  attempt('Logging', (c) => c.from('events').insert({ user_id: cloud.userId, slot, type, detail }));
}

// Sign in early, so the status line is right by the time the menu is looked at.
export function startCloud() {
  if (cloud.enabled) connect();
}
