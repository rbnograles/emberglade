import { summarise } from './game/summary.js';

// Optional cloud storage in the owner's Supabase project. It does nothing at all unless the two
// settings below are present when the game is built; the game then plays exactly as before, from
// the browser's own storage.
//
// With them set, each browser signs in as an anonymous guest (no email, no name) and can only read
// and write its own rows. A guest can make an account, a name and a password kept in the project's
// own tables (supabase/accounts.sql), and log in to it on other devices; no email is involved.
// Three things are recorded:
//   saves   - the latest copy of each world slot, so a world can be fetched on another device
//   players - one row of progress per world (day, level, keepers restored), for stats or a leaderboard
//   events  - a log of milestones (levels gained, keepers found and restored, hoards, faints)
// The tables and their access rules are in supabase/schema.sql.
// Never under test: the tests must not reach a real project, even on a machine that has the settings.
const TESTING = import.meta.env?.MODE === 'test';
const URL = TESTING ? null : import.meta.env?.VITE_SUPABASE_URL, KEY = TESTING ? null : import.meta.env?.VITE_SUPABASE_ANON_KEY;

export const cloud = {
  enabled: !!(URL && KEY),
  status: URL && KEY ? 'Connecting…' : 'Not set up',
  userId: null,
  account: null, // the name signed in as; null for a guest
  hold: false, // true while a newly signed-in device has not yet chosen between its own world and the account's
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
      await adopt(client, session);
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

// Take on whoever this session belongs to: a guest, or a guest who is logged in to an account and
// so uses that account's rows. (A session with an email is an account from before names were used.)
async function adopt(client, session) {
  cloud.userId = session.user.id;
  cloud.account = session.user.is_anonymous ? null : session.user.email ?? null;
  if (session.user.is_anonymous) {
    try {
      const { data } = await client.rpc('account_whoami');
      if (data?.user_id) {
        cloud.userId = data.user_id;
        cloud.account = data.username;
      }
    } catch {
      // accounts are not set up in this project: everyone is a guest
    }
  }
  say(cloud.account ? 'Signed in as ' + cloud.account : 'Playing as a guest on this device');
}

// ---- accounts: the same worlds on every device you log in on ----
// Each returns { ok, message }; the message is ready to show to the player.

// What an account name may be, checked here before the database checks it again.
export const NAME_RULE = /^[A-Za-z0-9_]{3,20}$/;

// Ask the database to make or open an account for this guest session.
async function accountCall(fn, name, password, done) {
  const client = await connect();
  if (!client) return { ok: false, message: cloud.status };
  const { data, error } = await client.rpc(fn, { p_name: name, p_pass: password });
  if (error) {
    const missing = error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '');
    return { ok: false, message: missing ? 'Accounts are not switched on yet: supabase/accounts.sql has to be run in the Supabase project first.' : error.message };
  }
  if (!data?.ok) return { ok: false, message: data?.message ?? 'That did not work. Try again.' };
  cloud.userId = data.user_id;
  cloud.account = data.username;
  say('Signed in as ' + cloud.account);
  return { ok: true, message: done };
}

// Make an account from this guest: the worlds this guest has in the cloud become the account's.
export function createAccount(name, password) {
  if (!NAME_RULE.test(name)) return Promise.resolve({ ok: false, message: 'A name is 3 to 20 letters, numbers or underscores.' });
  return accountCall('register_account', name, password, 'Account created. This device is signed in.');
}

export async function signIn(name, password) {
  if (!name.includes('@')) return accountCall('login_account', name, password, 'Signed in.');
  // an email address: an account made before names were used
  const client = await connect();
  if (!client) return { ok: false, message: cloud.status };
  const { data, error } = await client.auth.signInWithPassword({ email: name, password });
  if (error) return { ok: false, message: error.message };
  await adopt(client, data.session);
  return { ok: true, message: 'Signed in.' };
}

// Back to a guest: this device keeps its worlds, but stops sharing them with the account.
// The guest session itself is ended too, so the device starts again as somebody new.
export async function signOut() {
  const client = await connect();
  if (!client) return;
  try {
    await client.rpc('logout_account');
  } catch {
    // nothing to log out of
  }
  await client.auth.signOut();
  ready = null;
  cloud.userId = cloud.account = null;
  cloud.hold = false;
  await connect();
}

// Store the latest copy of this world and its progress row.
// auto: one of the game's own periodic saves, which wait while a choice between worlds is pending.
export async function syncWorld(game, slot, auto = false) {
  if (!cloud.enabled || (auto && cloud.hold)) return false;
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
