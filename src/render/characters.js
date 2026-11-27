import * as THREE from 'three';
import { Vox } from './voxel.js';
import { toGeometry } from './chunks.js';
import { iconPixels } from '../ui/icons.js';
import { ENEMY_KINDS } from '../game/game.js';
import { WATER_Y } from '../world/worldgen.js';

const EAT_TIME = 1.1, EAT_BITES = 4;
const HURT_RED = new THREE.Color(0xff2a2a), HURT_GLOW = new THREE.Color(0x8a0f0f);

const part = (w, h, d, color, x, y, z) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
};

// A limb that swings from its top end.
const limb = (w, h, d, color, x, y) => {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  pivot.add(part(w, h, d, color, 0, -h / 2, 0));
  return pivot;
};

// Blocky character facing +z. update() animates walking and tool swings.
export class PlayerModel {
  constructor() {
    const g = (this.group = new THREE.Group());
    g.rotation.order = 'YXZ'; // so leaning forward or back follows the way the character faces
    const skin = 0xf2c7a0, shirt = 0x4fa56a, pants = 0x5a4634, hair = 0x6b3f24;
    g.add(part(0.5, 0.5, 0.3, shirt, 0, 0.75, 0));
    g.add(part(0.46, 0.42, 0.42, skin, 0, 1.21, 0));
    g.add(part(0.5, 0.16, 0.46, hair, 0, 1.46, 0));
    g.add(part(0.5, 0.3, 0.12, hair, 0, 1.3, -0.19));
    g.add(part(0.07, 0.07, 0.02, 0x2b2b33, -0.11, 1.22, 0.215));
    g.add(part(0.07, 0.07, 0.02, 0x2b2b33, 0.11, 1.22, 0.215));
    this.legL = limb(0.22, 0.5, 0.26, pants, -0.13, 0.5);
    this.legR = limb(0.22, 0.5, 0.26, pants, 0.13, 0.5);
    this.armL = limb(0.16, 0.48, 0.22, skin, -0.34, 0.98);
    this.armR = limb(0.16, 0.48, 0.22, skin, 0.34, 0.98);
    g.add(this.legL, this.legR, this.armL, this.armR);
    // Armor pieces sit just outside the body parts and are shown when worn.
    this.armorParts = [
      [part(0.52, 0.24, 0.48, 0xffffff, 0, 1.44, 0)],
      [part(0.56, 0.54, 0.36, 0xffffff, 0, 0.75, 0)],
      [part(0.26, 0.22, 0.3, 0xffffff, 0, -0.39, 0), part(0.26, 0.22, 0.3, 0xffffff, 0, -0.39, 0)],
      [part(0.4, 0.44, 0.2, 0xffffff, 0, 0.78, -0.27)], // bag on the back
    ];
    g.add(this.armorParts[0][0], this.armorParts[1][0], this.armorParts[3][0]);
    this.legL.add(this.armorParts[2][0]);
    this.legR.add(this.armorParts[2][1]);
    this.setArmor([null, null, null, null]);
    // Remember every part's own colour so a damage flash can tint it red and fade back.
    this.hurt = 0;
    this.tinted = [];
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.base = o.material.color.clone();
      this.tinted.push(o);
    });
    // The equipped item, carried in the right hand: the item's icon as a thin voxel sprite.
    this.held = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.held.castShadow = true;
    this.held.rotation.y = -Math.PI / 4; // angled forward and outward so it reads from the front and the side
    this.held.visible = false;
    this.armR.add(this.held);
    this.heldId = null;
    this.heldCache = new Map();
    this.phase = 0;
    this.swing = 0;
    this.facing = 0;
  }

  startSwing() { this.swing = 1; }

  // Eat animation: the food appears in the hand, is lifted to the mouth and bitten down to nothing.
  startEat(id) {
    this.eating = 0;
    this.setHeld(id, false);
    this.heldId = null; // so the real held item is restored afterwards
    this.consume = 'eat';
    this.eating = EAT_TIME;
  }

  // Drink animation. 'flask': tip the flask up at the mouth. 'pond': kneel and scoop water with both hands.
  startDrink(source) {
    this.eating = 0;
    this.setHeld(source === 'flask' ? 'flask' : null, false);
    this.heldId = undefined; // force the real held item back afterwards
    this.consume = source;
    this.eating = EAT_TIME;
  }

  // Took damage: flash red and flinch.
  flash() { this.hurt = 1; }

  // colors: [head, body, feet], each a hex colour or null when nothing is worn there
  setArmor(colors) {
    colors.forEach((color, i) => {
      for (const mesh of this.armorParts[i]) {
        mesh.visible = color !== null;
        if (color !== null) {
          mesh.material.color.setHex(color);
          mesh.userData.base?.setHex(color);
        }
      }
    });
  }

  // Show item `id` (or nothing) in the hand. Tools are held full size, other items smaller.
  setHeld(id, isTool = false) {
    if (this.eating > 0) return; // the hand is busy eating or drinking
    if (id === this.heldId) return;
    this.heldId = id;
    this.held.visible = !!id;
    if (!id) return;
    if (!this.heldCache.has(id)) {
      const v = new Vox();
      const { size, pixels } = iconPixels(id);
      const depth = size / 8; // keep the sprite the same thickness whatever its resolution
      for (const { x, y, color } of pixels) for (let z = 0; z < depth * 2; z++) v.set(x, y, z, color);
      this.heldCache.set(id, toGeometry(v.build(0.6 / size, { jitter: 0 })));
    }
    this.held.geometry = this.heldCache.get(id);
    this.held.scale.setScalar(isTool ? 1.15 : 0.65);
    this.held.position.set(isTool ? 0.2 : 0.12, isTool ? -0.62 : -0.56, isTool ? 0.22 : 0.16);
  }

  update(dt, moving, speed, swimming = false, clock = 0, submerged = false) {
    // under water the body lies flat and glides; the tilt eases in and out
    this.prone = (this.prone ?? 0) + ((submerged ? 1 : 0) - (this.prone ?? 0)) * Math.min(1, dt * 6);
    if (!(this.hurt > 0) && !(this.eating > 0)) this.group.rotation.x = this.prone * 1.25;
    this.phase = moving || swimming ? this.phase + dt * (swimming ? 7 : speed * 2.4) : 0;
    const s = Math.sin(this.phase) * 0.7;
    this.legL.rotation.x = s;
    this.legR.rotation.x = -s;
    this.armL.rotation.x = -s;
    this.swing = Math.max(0, this.swing - dt * 4);
    this.armR.rotation.x = this.swing > 0 ? -2.4 * Math.sin(this.swing * Math.PI) : s;
    this.armR.rotation.z = 0;
    if (swimming) {
      // afloat: arms paddle out in front, legs kick gently, and the body bobs with the water
      const paddle = Math.sin(this.phase) * 0.55;
      this.armL.rotation.x = -1.35 + paddle;
      if (this.swing <= 0) this.armR.rotation.x = -1.35 - paddle;
      this.legL.rotation.x = paddle * 0.5;
      this.legR.rotation.x = -paddle * 0.5;
      if (!submerged) this.group.position.y += Math.sin(clock * 2.6) * 0.05;
    }
    if (this.eating > 0) {
      this.eating = Math.max(0, this.eating - dt);
      const t = 1 - this.eating / EAT_TIME; // 0 -> 1 over the animation
      const lift = Math.min(1, t / 0.18) * Math.min(1, (1 - t) / 0.12); // raise, hold, lower
      const bite = Math.sin(t * Math.PI * 2 * EAT_BITES); // chomps / gulps while held up
      if (this.consume === 'pond') {
        // kneel forward over the water and scoop it up with both hands
        this.group.rotation.x = 0.75 * lift;
        this.group.position.y -= 0.22 * lift;
        this.armR.rotation.x = this.armL.rotation.x = -1.3 * lift + bite * 0.25 * lift;
        this.armR.rotation.z = -0.3 * lift;
        this.armL.rotation.z = 0.3 * lift;
        this.legL.rotation.x = this.legR.rotation.x = -0.6 * lift;
      } else {
        this.armR.rotation.x = -1.95 * lift + bite * 0.12 * lift;
        this.armR.rotation.z = -0.55 * lift; // swing the hand in toward the mouth
        this.held.position.set(0.02, -0.5, 0.1);
        if (this.consume === 'flask') {
          // tip the flask up and lean the head back a little
          this.held.rotation.z = 1.9 * lift;
          this.group.rotation.x = -0.18 * lift;
        } else {
          this.held.scale.setScalar(0.65 * (1 - 0.75 * t)); // the food gets smaller with every bite
          this.group.position.y += Math.max(0, bite) * 0.03 * lift; // little chewing bob
        }
      }
      if (this.eating === 0) {
        this.held.visible = false;
        this.held.rotation.z = 0;
        this.group.rotation.x = 0;
        this.armL.rotation.z = 0;
      }
    }
    if (this.hurt > 0 || this.wasHurt) {
      this.hurt = Math.max(0, this.hurt - dt * 2.6);
      const k = Math.min(1, this.hurt * 1.6);
      for (const o of this.tinted) {
        o.material.color.copy(o.userData.base).lerp(HURT_RED, k);
        o.material.emissive.copy(HURT_GLOW).multiplyScalar(k);
      }
      // squash and tip back, then spring up again
      const flinch = Math.sin(Math.min(1, this.hurt) * Math.PI);
      this.group.scale.set(1 + flinch * 0.12, 1 - flinch * 0.14, 1 + flinch * 0.12);
      this.group.rotation.x = -flinch * 0.25;
      this.wasHurt = this.hurt > 0;
    }
    // Turn smoothly toward the facing angle.
    let d = this.facing - this.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.group.rotation.y += d * Math.min(1, dt * 14);
  }
}

// Peaceful deer that wander near the player and shy away when approached.
export class Deer {
  constructor(scene, game, model) {
    this.scene = scene;
    this.game = game;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(model.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(model.norm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(model.col, 3));
    g.setIndex(new THREE.BufferAttribute(model.idx, 1));
    this.geometry = g;
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.list = [];
  }

  spawn(px, pz) {
    const a = Math.random() * Math.PI * 2, r = 22 + Math.random() * 12;
    const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
    const biome = this.game.gen.tile(Math.floor(x), Math.floor(z)).biome;
    if (biome === 'sand' || this.game.blocked(x, z, 0.5, true)) return;
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.list.push({ mesh, x, z, tx: x, tz: z, wait: Math.random() * 3, t: Math.random() * 10, hp: 5, flee: 0 });
  }

  // A hunter's blow. Returns true when the deer falls (and removes it).
  hit(d, power, px, pz) {
    d.hp -= power;
    d.flee = 3;
    if (d.hp > 0) return false;
    this.scene.remove(d.mesh);
    this.list.splice(this.list.indexOf(d), 1);
    return true;
  }

  update(dt, px, pz) {
    if (this.list.length < 5 && Math.random() < dt * 0.5) this.spawn(px, pz);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      const fromPlayer = Math.hypot(d.x - px, d.z - pz);
      if (fromPlayer > 55) {
        this.scene.remove(d.mesh);
        this.list.splice(i, 1);
        continue;
      }
      let speed = 1.3;
      d.flee = Math.max(0, d.flee - dt);
      if (d.flee > 0) {
        // wounded: bolt away from the hunter
        d.tx = d.x + ((d.x - px) / (fromPlayer || 1)) * 8;
        d.tz = d.z + ((d.z - pz) / (fromPlayer || 1)) * 8;
        d.wait = 0;
        speed = 5.2;
      } else if (fromPlayer < 3.5) {
        // Trot directly away from the player.
        d.tx = d.x + ((d.x - px) / fromPlayer) * 6;
        d.tz = d.z + ((d.z - pz) / fromPlayer) * 6;
        d.wait = 0;
        speed = 4;
      }
      const dx = d.tx - d.x, dz = d.tz - d.z, dist = Math.hypot(dx, dz);
      let moving = false;
      if (d.wait > 0) d.wait -= dt;
      else if (dist < 0.2) {
        d.wait = 1 + Math.random() * 4;
        d.tx = d.x + (Math.random() - 0.5) * 12;
        d.tz = d.z + (Math.random() - 0.5) * 12;
      } else {
        const nx = d.x + (dx / dist) * speed * dt, nz = d.z + (dz / dist) * speed * dt;
        if (this.game.blocked(nx, nz, 0.45, true)) {
          d.tx = d.x;
          d.tz = d.z;
        } else {
          d.x = nx;
          d.z = nz;
          d.mesh.rotation.y = Math.atan2(-dz, dx);
          moving = true;
        }
      }
      d.t += dt * (moving ? speed * 5 : 0);
      const h = this.game.gen.tile(Math.floor(d.x), Math.floor(d.z)).h;
      d.mesh.position.set(d.x, h + (moving ? Math.abs(Math.sin(d.t)) * 0.08 : 0), d.z);
    }
  }
}

// Night creatures: one mesh per entry in game.enemies, hopping as they move.
export class Enemies {
  constructor(scene, game, model) {
    this.scene = scene;
    this.game = game;
    // one shape per kind of creature (brutes reuse the gloomling, scaled up)
    this.geometries = { gloomling: toGeometry(model.gloomling), brute: toGeometry(model.gloomling), snapper: toGeometry(model.snapper) };
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a1f44 });
    this.meshes = new Map(); // enemy id -> mesh
  }

  update(dt, clock) {
    const alive = new Set();
    for (const e of this.game.enemies) {
      alive.add(e.id);
      let mesh = this.meshes.get(e.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.geometries[e.kind], this.material);
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.meshes.set(e.id, mesh);
      }
      // land creatures hop along the ground; sea creatures glide at their own depth
      const sea = ENEMY_KINDS[e.kind].sea;
      const hop = sea ? Math.sin(clock * 5 + e.id) * 0.05 : e.moving ? Math.abs(Math.sin(clock * 9 + e.id)) * 0.3 : 0;
      mesh.position.set(e.x, e.y + hop, e.z);
      mesh.rotation.y = e.dir ?? 0;
      // squash when hit, shrink as daylight burns it away
      const kind = ENEMY_KINDS[e.kind];
      const s = kind.size * Math.min(1, Math.max(0.3, e.hp / (kind.hp / 2))) * (e.stun > 0 ? 1.25 : 1);
      mesh.scale.set(s, e.stun > 0 ? s * 0.7 : s, s);
    }
    for (const [id, mesh] of this.meshes) {
      if (!alive.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
      }
    }
  }
}
// Schools of small fish in the sea. Harmless, quick to dart away, and good eating if you can catch one.
export class Fish {
  constructor(scene, game, model) {
    this.scene = scene;
    this.game = game;
    this.geometry = toGeometry(model);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.list = [];
  }

  // a spot in open sea near (x, z), or null
  seaSpot(x, z) {
    const t = this.game.gen.tile(Math.floor(x), Math.floor(z));
    if (!t.salt || WATER_Y - t.bed < 1.2) return null;
    return { x, z, y: t.bed + 0.4 + Math.random() * (WATER_Y - t.bed - 0.9) };
  }

  hit(f) {
    this.scene.remove(f.mesh);
    this.list.splice(this.list.indexOf(f), 1);
  }

  update(dt, px, py, pz) {
    if (this.list.length < 10 && Math.random() < dt * 2) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 16;
      const spot = this.seaSpot(px + Math.cos(a) * r, pz + Math.sin(a) * r);
      if (spot) {
        const mesh = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(mesh);
        this.list.push({ mesh, ...spot, tx: spot.x, ty: spot.y, tz: spot.z, t: Math.random() * 10 });
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      const away = Math.hypot(f.x - px, f.z - pz);
      if (away > 40) {
        this.scene.remove(f.mesh);
        this.list.splice(i, 1);
        continue;
      }
      const near = Math.hypot(away, f.y - py - 0.6) < 2.2;
      const dx = f.tx - f.x, dy = f.ty - f.y, dz = f.tz - f.z, dist = Math.hypot(dx, dy, dz);
      if (near || dist < 0.3) {
        // pick somewhere new to swim to: away from the player if they are close
        const a = near ? Math.atan2(f.z - pz, f.x - px) + (Math.random() - 0.5) : Math.random() * Math.PI * 2;
        const spot = this.seaSpot(f.x + Math.cos(a) * (3 + Math.random() * 4), f.z + Math.sin(a) * (3 + Math.random() * 4));
        if (spot) Object.assign(f, { tx: spot.x, ty: spot.y, tz: spot.z });
      } else {
        const speed = (near ? 4.5 : 1.6) * dt / dist;
        f.x += dx * speed;
        f.y += dy * speed;
        f.z += dz * speed;
        f.mesh.rotation.y = Math.atan2(-dz, dx);
      }
      f.t += dt * 9;
      f.mesh.position.set(f.x, f.y + Math.sin(f.t) * 0.03, f.z);
    }
  }
}