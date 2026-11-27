export const WILDLIFE = {
  deer: { name: 'Deer', biomes: ['meadow', 'autumn', 'blossom', 'pine'], hp: 5, speed: 1.3, shy: 3.5, drops: [['raw_meat', 1, 2], ['hide', 1, 1]] },
  hen: { name: 'Crested hen', biomes: ['meadow', 'blossom'], hp: 3, speed: 0.8, shy: 1.2, feed: 'wheat', produce: 'egg', drops: [['raw_meat', 1, 1]] },
  ram: { name: 'Bramble ram', biomes: ['pine', 'mountain', 'autumn'], hp: 8, speed: 0.7, shy: 2, feed: 'wheat', produce: 'fleece', drops: [['raw_meat', 1, 2], ['fleece', 1, 2]] },
  hare: { name: 'Dune hare', biomes: ['sand', 'autumn', 'blossom'], hp: 3, speed: 1.7, shy: 5, feed: 'wheat', drops: [['hide', 1, 1]] },
  ptarmigan: { name: 'Rime grouse', biomes: ['snow', 'winter'], hp: 4, speed: 1.1, shy: 4, feed: 'wheat', produce: 'egg', drops: [['raw_meat', 1, 2]] },
  salamander: { name: 'Cinder newt', biomes: ['ash', 'volcano'], hp: 4, speed: 0.85, shy: 2.5, drops: [['emberglass', 1, 1]] },
};

// A pen is a closed boundary of fences, walls and shut gates around both animals.
function penContains(game, a, b) {
  const key = (x, z) => x + ',' + z;
  const queue = [[Math.floor(a.x), Math.floor(a.z)]], seen = new Set();
  const target = key(Math.floor(b.x), Math.floor(b.z));
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i], k = key(x, z);
    if (seen.has(k)) continue;
    const obj = game.world.get(x, z);
    if (obj?.t === 'fence' || (obj?.t === 'gate' && !obj.open) || obj?.t === 'door' || obj?.t.endsWith('_wall')) continue;
    seen.add(k);
    if (seen.size > 256) return false;
    queue.push([x+1,z], [x-1,z], [x,z+1], [x,z-1]);
  }
  return seen.has(target);
}

export class Wildlife {
  constructor(game, saved = []) {
    this.game = game;
    this.list = saved.map(a => ({ ...a }));
    this.nextId = 1 + this.list.reduce((n, a) => Math.max(n, a.id), 0);
    this.spawnWait = 0;
  }

  spawn(kind, x, z, extra = {}) {
    const animal = { id: this.nextId++, kind, x, z, dir: 0, hp: WILDLIFE[kind].hp, rest: 1, roam: 0, flee: 0, ...extra };
    this.list.push(animal);
    return animal;
  }

  near(x, z, range = 1.2) {
    const p = this.game.player;
    let best = null;
    for (const a of this.list) {
      if (Math.hypot(a.x-p.x, a.z-p.z) > 2.8 || Math.abs(this.game.ground(a.x, a.z)-p.y) > 2.2) continue;
      const d = Math.hypot(a.x-x, a.z-z);
      if (d <= range) { best = a; range = d; }
    }
    return best;
  }

  handle(a) {
    if (!a) return false;
    const g = this.game, spec = WILDLIFE[a.kind];
    const adult = (a.grownDay ?? 0) <= g.day;
    if (spec.feed && g.held?.id === spec.feed) {
      if (!adult || a.fed === g.day) {
        g.toast(adult ? 'Already fed today' : 'This youngster is still growing');
        return true;
      }
      const mate = this.list.find(b => b !== a && b.kind === a.kind && b.tame && b.fed === g.day &&
        b.bred !== g.day && Math.hypot(a.x-b.x, a.z-b.z) < 5 && penContains(g, a, b));
      g.inv.removeAt(g.selected, 1);
      a.tame = true;
      a.fed = g.day;
      if (mate) {
        a.bred = mate.bred = g.day;
        this.spawn(a.kind, a.x, a.z, { tame: true, grownDay: g.day + 2, fed: g.day });
        g.toast('A new ' + spec.name.toLowerCase() + ' was born!');
      } else g.toast(spec.name + ' fed. Lead a pair into a closed pen with wheat.');
      g.emit('inv');
      return true;
    }
    if (a.tame && adult && spec.produce && a.harvested !== g.day) {
      if (g.give(spec.produce, 1)) a.harvested = g.day;
      return true;
    }
    g.toast(spec.name + (spec.feed && !a.tame ? ' likes wheat' : a.tame ? ' is resting' : ' watches you'));
    return true;
  }

  hit(a) {
    const g = this.game;
    a.hp -= g.attackPower;
    a.flee = 3;
    if (a.hp <= 0) {
      this.list.splice(this.list.indexOf(a), 1);
      g.giveDrops(WILDLIFE[a.kind].drops);
      g.record('hunt');
    }
    g.wearTool();
    g.emit('swing', { x: a.x - 0.5, z: a.z - 0.5 });
    g.emit('hit', { x: Math.floor(a.x), z: Math.floor(a.z) });
  }

  tick(dt) {
    const g = this.game, p = g.player;
    this.spawnWait -= dt;
    if (this.spawnWait <= 0) {
      this.spawnWait = 1.4;
      if (this.list.filter(a => !a.tame).length < 8) {
        const angle = Math.random() * Math.PI * 2, radius = 6 + Math.random() * 16;
        const x = p.x + Math.cos(angle)*radius, z = p.z + Math.sin(angle)*radius;
        const tile = g.gen.tile(Math.floor(x), Math.floor(z));
        const kinds = Object.keys(WILDLIFE).filter(k => WILDLIFE[k].biomes.includes(tile.biome));
        if (kinds.length && !tile.water && !tile.lava && !g.blocked(x,z,0.3,true)) {
          this.spawn(kinds[Math.floor(Math.random()*kinds.length)], x, z);
        }
      }
    }
    for (let i = this.list.length-1; i >= 0; i--) {
      const a = this.list[i], spec = WILDLIFE[a.kind], dx = p.x-a.x, dz = p.z-a.z, d = Math.hypot(dx,dz);
      if (d > 48) {
        if (!a.tame) this.list.splice(i,1);
        continue;
      }
      a.moving = false;
      a.flee = Math.max(0,a.flee-dt);
      let speed = spec.speed;
      const bait = spec.feed && g.held?.id === spec.feed && d < 8;
      if (a.flee || (!a.tame && !bait && d < spec.shy)) {
        a.dir = Math.atan2(dz,-dx);
        speed *= 2.8;
      } else if (bait) {
        if (d < 1.4) continue;
        a.dir = Math.atan2(-dz,dx);
        speed *= 1.5;
      } else {
        if (a.rest > 0) { a.rest -= dt; continue; }
        if (a.roam <= 0) {
          a.dir = Math.random()*Math.PI*2;
          a.roam = 0.4 + Math.random()*2;
        }
        a.roam -= dt;
        if (a.roam <= 0) a.rest = 0.8 + Math.random()*2;
      }
      const distance = speed * Math.min(dt,0.12);
      const x = a.x + Math.cos(a.dir)*distance, z = a.z - Math.sin(a.dir)*distance;
      if (!g.blocked(x,z,0.29,true) && !g.gen.tile(Math.floor(x),Math.floor(z)).lava && Math.abs(g.ground(x,z)-g.ground(a.x,a.z)) <= 0.55) {
        a.x = x; a.z = z; a.moving = true;
      } else { a.roam = 0; a.rest = 0.4; }
    }
  }
}
