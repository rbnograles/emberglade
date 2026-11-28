import { hash2 } from '../core/noise.js';

// Villagers: who lives in each village, and what they trade. Everything comes from the world seed,
// so a village always has the same people; only where they are standing this minute is not saved.
// buys: [item, how many they take, coins they pay]. sells: [item, how many you get, coins it costs].
export const ROLES = {
  farmer: {
    title: 'Farmer',
    buys: [['wheat', 4, 2], ['turnip', 3, 2], ['pumpkin', 2, 3], ['egg', 3, 2]],
    sells: [['bread', 1, 2], ['seeds', 4, 1], ['turnip_seeds', 3, 2], ['pumpkin_seeds', 2, 3]],
  },
  hunter: {
    title: 'Hunter',
    buys: [['hide', 2, 3], ['raw_meat', 3, 2], ['feather', 4, 2], ['fleece', 2, 3], ['raw_fish', 3, 2]],
    sells: [['leather', 1, 3], ['cooked_meat', 1, 2], ['fur_coat', 1, 14], ['trail_pack', 1, 18]],
  },
  smith: {
    title: 'Smith',
    buys: [['coal', 6, 2], ['copper_ore', 4, 3], ['iron_ore', 3, 4], ['stone', 10, 2], ['wood', 10, 2]],
    sells: [['copper_bar', 1, 4], ['iron_bar', 1, 8], ['lantern', 1, 12], ['iron_pickaxe', 1, 30]],
  },
  trader: {
    title: 'Trader',
    buys: [['pearl', 1, 6], ['crystal', 1, 5], ['flower', 6, 1], ['berries', 8, 2]],
    sells: [['flask', 1, 6], ['roof', 8, 3], ['diving_mask', 1, 20], ['glider', 1, 25]],
  },
};
// Castle guards are not one of the village trades: they hold the walls, and their quartermaster's
// stores are open to anyone who brings what the garrison needs.
export const GUARD = {
  title: 'Guard',
  buys: [['bone', 3, 2], ['brute_tusk', 1, 5], ['snapper_fang', 1, 5], ['gloom_shard', 2, 4], ['venom_sac', 1, 4]],
  sells: [['iron_sword', 1, 28], ['copper_helmet', 1, 12], ['copper_chestplate', 1, 16], ['torch', 4, 2]],
};
const ROLE_IDS = Object.keys(ROLES);
ROLES.guard = GUARD;
const GUARD_SIGHT = 9; // tiles: a guard goes for any creature this close to their post
const GUARD_HIT = 4; // damage of one blow
const NAMES = ['Ada', 'Bram', 'Cora', 'Dov', 'Esme', 'Finn', 'Greta', 'Hale', 'Ines', 'Joss', 'Kit', 'Lune', 'Mira', 'Nell', 'Odo', 'Pia', 'Quill', 'Rosa', 'Sten', 'Tess'];
const SKIN = [0xf9dcc4, 0xf2c7a0, 0xd9a47a, 0xb9794f, 0x8a5a3c, 0x5c3a26];
const HAIR = [0x2b2b33, 0x6b3f24, 0xa8743c, 0xe9c545, 0xd9432f, 0xf2efe6];
const SHIRT = { farmer: 0x6a9a4e, hunter: 0x8a5a34, smith: 0x5a6b7a, trader: 0xb0558a, guard: 0x7a2f3a };
const STYLES = ['short', 'long', 'tuft', 'bald'];
const RANGE = 70; // villagers are only kept in mind this close to the player

// The people of one village, at their starting spots.
export function villagersOf(st, seed) {
  return st.spots.map(([dx, dz], i) => {
    const pick = (list, salt) => list[(hash2(st.x + i * 17, st.z - i * 31, seed + salt) * list.length) | 0];
    const guard = st.kind === 'castle';
    const role = guard ? 'guard' : ROLE_IDS[(i + ((hash2(st.x, st.z, seed + 320) * ROLE_IDS.length) | 0)) % ROLE_IDS.length]; // no two alike
    const home = { x: st.x + dx + 0.5, z: st.z + dz + 0.5 };
    return {
      id: st.key + ':' + i, name: pick(NAMES, 321), role, guard, cool: 0, swing: 0, village: st.name, home, x: home.x, z: home.z, dir: 0, moving: false, wait: i,
      look: { skin: pick(SKIN, 322), hair: pick(HAIR, 323), shirt: SHIRT[role], pants: 0x4a3a2c, style: pick(STYLES, 324) },
    };
  });
}

export class Villagers {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.known = new Set(); // villages whose people are in the list
    this.scan = 0;
  }

  // The villager close enough to talk to, or null.
  near(range = 2.2) {
    const p = this.game.player;
    let best = null;
    for (const v of this.list) {
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d <= range && Math.abs(this.game.ground(v.x, v.z) - p.y) < 1.2) {
        best = v;
        range = d;
      }
    }
    return best;
  }

  // One exchange with a villager. kind: 'sell' (you buy what they sell) or 'buy' (they buy from you).
  trade(v, kind, index) {
    const g = this.game, offer = ROLES[v.role][kind === 'sell' ? 'sells' : 'buys'][index];
    if (!offer) return false;
    const [item, n, coins] = offer;
    const pay = kind === 'sell' ? ['coin', coins] : [item, n], gain = kind === 'sell' ? [item, n] : ['coin', coins];
    if (!g.inv.has(...pay)) {
      g.toast(kind === 'sell' ? 'Not enough coins' : 'You do not have enough of that');
      return false;
    }
    g.inv.remove(...pay);
    g.give(...gain);
    g.record('trade');
    g.emit('inv');
    return true;
  }

  // A guard's duty: run down the nearest creature that has come near the post, and strike it.
  // Returns true while there is one to deal with. What a guard kills leaves nothing for the player.
  defend(v, dt) {
    const g = this.game;
    v.cool = Math.max(0, v.cool - dt);
    let foe = null, best = GUARD_SIGHT;
    for (const e of g.enemies) {
      const d = Math.hypot(e.x - v.home.x, e.z - v.home.z);
      if (d < best) {
        foe = e;
        best = d;
      }
    }
    if (!foe) return false;
    const dx = foe.x - v.x, dz = foe.z - v.z, d = Math.hypot(dx, dz) || 0.001;
    v.dir = Math.atan2(dx, dz);
    v.goal = null;
    if (d > 1.3) {
      const step = Math.min(d - 1.1, dt * 2.6), nx = v.x + (dx / d) * step, nz = v.z + (dz / d) * step;
      if (!g.blocked(nx, nz, 0.25, true)) {
        v.x = nx;
        v.z = nz;
        v.moving = true;
      }
    } else if (v.cool <= 0) {
      v.cool = 0.8;
      v.swing = 0.3;
      foe.hp -= GUARD_HIT;
      foe.stun = Math.max(foe.stun ?? 0, 0.25);
      g.emit('hit', { x: Math.floor(foe.x), z: Math.floor(foe.z), object: 'guard', destroyed: foe.hp <= 0 });
      if (foe.hp <= 0) g.removeEnemy(foe);
    }
    return true;
  }

  tick(dt) {
    const g = this.game, p = g.player;
    this.scan -= dt;
    if (this.scan <= 0) {
      // every second or so: welcome the people of villages coming into range, forget those left behind
      this.scan = 1;
      const here = g.gen.settlementsNear(p.x, p.z, RANGE); // villages and castles alike
      const keys = new Set(here.map((st) => st.key));
      for (const st of here) {
        if (this.known.has(st.key)) continue;
        this.known.add(st.key);
        this.list.push(...villagersOf(st, g.seed));
      }
      for (const key of [...this.known]) {
        if (keys.has(key)) continue;
        this.known.delete(key);
        this.list = this.list.filter((v) => !v.id.startsWith(key + ':'));
      }
    }
    for (const v of this.list) {
      const toPlayer = Math.hypot(p.x - v.x, p.z - v.z);
      v.moving = false;
      v.swing = Math.max(0, v.swing - dt);
      if (v.guard && this.defend(v, dt)) continue;
      if (toPlayer < 3) {
        // someone is here: stop and face them
        v.dir = Math.atan2(p.x - v.x, p.z - v.z);
        continue;
      }
      if ((v.wait -= dt) > 0) continue;
      if (!v.goal) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 2.5;
        v.goal = { x: v.home.x + Math.cos(a) * r, z: v.home.z + Math.sin(a) * r };
      }
      const dx = v.goal.x - v.x, dz = v.goal.z - v.z, d = Math.hypot(dx, dz);
      if (d < 0.15) {
        v.goal = null;
        v.wait = 1.5 + Math.random() * 4;
        continue;
      }
      const step = Math.min(d, dt * 0.9), nx = v.x + (dx / d) * step, nz = v.z + (dz / d) * step;
      if (g.blocked(nx, nz, 0.25, true)) {
        v.goal = null;
        v.wait = 1;
        continue;
      }
      v.x = nx;
      v.z = nz;
      v.dir = Math.atan2(dx, dz);
      v.moving = true;
    }
  }
}
