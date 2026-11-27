import * as THREE from 'three';
import { toGeometry } from './chunks.js';
import { ENEMY_KINDS } from '../game/game.js';
import { WILDLIFE } from '../game/wildlife.js';
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
  // look: {skin, hair, shirt, pants, style} from the character screen
  constructor(look, itemModels) {
    this.itemModels = itemModels;
    const g = (this.group = new THREE.Group());
    g.rotation.order = 'YXZ'; // so leaning forward or back follows the way the character faces
    const skin = 0xf2c7a0, shirt = 0x4fa56a, pants = 0x5a4634, hair = 0x6b3f24;
    // the parts whose colour the player can choose, by what they are
    this.lookParts = { skin: [], hair: [], shirt: [], pants: [] };
    const body = part(0.5, 0.5, 0.3, shirt, 0, 0.75, 0), head = part(0.46, 0.42, 0.42, skin, 0, 1.21, 0);
    // hair pieces; which ones show depends on the style
    this.hairPieces = {
      top: part(0.5, 0.16, 0.46, hair, 0, 1.46, 0), back: part(0.5, 0.3, 0.12, hair, 0, 1.3, -0.19),
      long: part(0.52, 0.5, 0.12, hair, 0, 1.02, -0.2), sides: part(0.54, 0.34, 0.2, hair, 0, 1.22, -0.08),
      tuft: part(0.2, 0.2, 0.3, hair, 0, 1.55, 0.02),
    };
    g.add(body, head, ...Object.values(this.hairPieces));
    this.lookParts.shirt.push(body);
    this.lookParts.skin.push(head);
    this.lookParts.hair.push(...Object.values(this.hairPieces));
    g.add(part(0.07, 0.07, 0.02, 0x2b2b33, -0.11, 1.22, 0.215));
    g.add(part(0.07, 0.07, 0.02, 0x2b2b33, 0.11, 1.22, 0.215));
    this.legL = limb(0.22, 0.5, 0.26, pants, -0.13, 0.5);
    this.legR = limb(0.22, 0.5, 0.26, pants, 0.13, 0.5);
    this.armL = limb(0.16, 0.48, 0.22, skin, -0.34, 0.98);
    this.armR = limb(0.16, 0.48, 0.22, skin, 0.34, 0.98);
    g.add(this.legL, this.legR, this.armL, this.armR);
    this.lookParts.pants.push(this.legL.children[0], this.legR.children[0]);
    this.lookParts.skin.push(this.armL.children[0], this.armR.children[0]);
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
    // the glider's wing, shown overhead while gliding
    this.wing = part(2.2, 0.06, 0.9, 0xf2efe6, 0, 1.95, 0.05);
    this.wing.visible = false;
    g.add(this.wing);
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
    if (look) this.applyLook(look);
    else this.applyLook({ skin, hair, shirt, pants, style: 'short' });
  }

  // Recolour the body and switch hair pieces for the chosen style.
  applyLook(look) {
    for (const key of ['skin', 'hair', 'shirt', 'pants']) {
      for (const mesh of this.lookParts[key]) {
        mesh.material.color.setHex(look[key]);
        mesh.userData.base?.setHex(look[key]); // so the damage flash fades back to the new colour
      }
    }
    const shown = { short: ['top', 'back'], long: ['top', 'back', 'long', 'sides'], tuft: ['top', 'tuft'], bald: [] }[look.style] ?? ['top', 'back'];
    for (const [name, mesh] of Object.entries(this.hairPieces)) mesh.userData.hairOn = shown.includes(name);
    this.showHair();
  }

  // Hair hides under a helmet.
  showHair() {
    const helmet = this.armorParts[0][0].visible;
    for (const [name, mesh] of Object.entries(this.hairPieces)) mesh.visible = !!mesh.userData.hairOn && !(helmet && (name === 'top' || name === 'tuft'));
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
    if (this.hairPieces) this.showHair();
  }

  // Show item `id` (or nothing) in the hand. Tools are held full size, other items smaller.
  setHeld(id, isTool = false) {
    if (this.eating > 0) return; // the hand is busy eating or drinking
    if (id === this.heldId) return;
    this.heldId = id;
    this.held.visible = !!id;
    if (!id) return;
    if (!this.heldCache.has(id)) {
      const geometry = toGeometry(this.itemModels.get(id)).clone();
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      const size = bounds.getSize(new THREE.Vector3());
      const centre = bounds.getCenter(new THREE.Vector3());
      const scale = 0.6 / Math.max(size.x, size.y, size.z);
      geometry.translate(-centre.x, -bounds.min.y, -centre.z);
      geometry.scale(scale, scale, scale);
      this.heldCache.set(id, geometry);
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
    // gliding: arms up holding the wing
    this.wing.visible = !!this.gliding;
    if (this.gliding) this.armL.rotation.x = -3;
    this.swing = Math.max(0, this.swing - dt * 4);
    this.armR.rotation.x = this.swing > 0 ? -2.4 * Math.sin(this.swing * Math.PI) : s;
    this.armR.rotation.z = 0;
    if (this.gliding && this.swing <= 0) this.armR.rotation.x = -3;
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

// Animals: one mesh per entry in game.wildlife.list. They trot with a small bounce, the young are
// smaller, tame ones show a soft glow, and a struck animal flinches.
export class Animals {
  constructor(scene, game, models) {
    this.scene = scene;
    this.game = game;
    this.geometries = Object.fromEntries(Object.keys(WILDLIFE).map((kind) => [kind, toGeometry(models.get(kind))]));
    this.wild = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.tame = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a2a12 });
    this.meshes = new Map(); // animal id -> mesh
  }

  update(dt, clock) {
    const g = this.game, alive = new Set();
    for (const a of g.wildlife.list) {
      alive.add(a.id);
      let mesh = this.meshes.get(a.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.geometries[a.kind], this.wild);
        mesh.castShadow = true;
        mesh.rotation.y = a.dir;
        this.scene.add(mesh);
        this.meshes.set(a.id, mesh);
      }
      mesh.material = a.tame ? this.tame : this.wild;
      const young = (a.grownDay ?? 0) > g.day;
      const flinch = a.flee > 2.7 ? 1.2 : 1;
      const s = (young ? 0.6 : 1) * flinch;
      mesh.scale.set(s, s / (flinch * flinch), s);
      // legs bounce while moving; at rest the body breathes
      const bob = a.moving ? Math.abs(Math.sin(clock * 11 + a.id)) * 0.09 : Math.sin(clock * 2 + a.id) * 0.012;
      mesh.position.set(a.x, g.ground(a.x, a.z) + bob, a.z);
      let turn = a.dir - mesh.rotation.y;
      turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
      mesh.rotation.y += turn * Math.min(1, dt * 10);
      mesh.rotation.z = a.moving ? Math.sin(clock * 11 + a.id) * 0.05 : 0;
    }
    for (const [id, mesh] of this.meshes) {
      if (!alive.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
      }
    }
  }
}
// pace: steps per second. hop: how high a step lifts. sway: side-to-side roll while moving.
const GAITS = {
  gloomling: { pace: 9, hop: 0.3, sway: 0 }, brute: { pace: 5, hop: 0.12, sway: 0.1 },
  golem: { pace: 3.5, hop: 0.08, sway: 0.14 }, spitter: { pace: 7, hop: 0.18, sway: 0.05 },
  frostprowler: { pace: 12, hop: 0.1, sway: 0.06 }, kilncrab: { pace: 14, hop: 0.04, sway: 0.09 },
  snapper: { pace: 6, hop: 0, sway: 0.05 },
};

// Creatures: one mesh per entry in game.enemies. Each kind moves its own way, sways while idle,
// lunges as it strikes and squashes when hit.
export class Enemies {
  constructor(scene, game, model) {
    this.scene = scene;
    this.game = game;
    this.geometries = Object.fromEntries(Object.keys(ENEMY_KINDS).map((kind) => [kind, toGeometry(model.get(kind))]));
    // spit in flight
    this.spitGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    this.spitMat = new THREE.MeshBasicMaterial({ color: 0xb8f25a });
    this.spits = [];
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
      const kind = ENEMY_KINDS[e.kind], gait = GAITS[e.kind] ?? GAITS.gloomling, t = clock + e.id;
      // moving: each kind has its own step. idle: a slow sway so nothing ever stands frozen.
      const step = e.moving ? Math.abs(Math.sin(t * gait.pace)) * gait.hop : Math.sin(t * 1.8) * 0.03;
      // striking: a quick lunge forward that settles back over a third of a second
      const lunge = Math.sin(Math.min(1, (e.strike ?? 0) / 0.35) * Math.PI) * 0.45;
      const dir = e.dir ?? 0;
      mesh.position.set(e.x + Math.cos(dir) * lunge, e.y + (kind.sea ? Math.sin(t * 5) * 0.05 : step), e.z - Math.sin(dir) * lunge);
      mesh.rotation.y = dir;
      mesh.rotation.z = (e.moving ? Math.sin(t * gait.pace) * gait.sway : 0) - lunge * 0.5;
      // squash when hit, shrink as daylight burns it away
      const s = kind.size * Math.min(1, Math.max(0.3, e.hp / (kind.hp / 2))) * (e.stun > 0 ? 1.25 : 1);
      mesh.scale.set(s, e.stun > 0 ? s * 0.7 : s * (1 + (e.moving ? 0 : Math.sin(t * 1.8) * 0.03)), s);
    }
    for (const [id, mesh] of this.meshes) {
      if (!alive.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
      }
    }
    // one little glowing cube per projectile
    const shots = this.game.projectiles;
    while (this.spits.length < shots.length) {
      const s = new THREE.Mesh(this.spitGeo, this.spitMat);
      this.scene.add(s);
      this.spits.push(s);
    }
    this.spits.forEach((s, i) => {
      s.visible = i < shots.length;
      if (s.visible) {
        s.position.set(shots[i].x, shots[i].y, shots[i].z);
        s.rotation.set(clock * 9, clock * 7, 0);
      }
    });
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
// Boats and submarines: one mesh per entry in game.vehicles.
export class Vehicles {
  constructor(scene, game, models) {
    this.scene = scene;
    this.game = game;
    this.geometries = { trail_cart: toGeometry(models.trail_cart), boat: toGeometry(models.boat), submarine: toGeometry(models.submarine) };
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.meshes = new Map();
  }

  update(clock) {
    const seen = new Set();
    for (const v of this.game.vehicles) {
      seen.add(v.id);
      let mesh = this.meshes.get(v.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.geometries[v.kind], this.material);
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.meshes.set(v.id, mesh);
      }
      // a boat rocks gently on the water
      const bob = v.kind === 'boat' ? Math.sin(clock * 2 + v.id) * 0.04 : 0;
      mesh.position.set(v.x, v.y + bob, v.z);
      mesh.rotation.y = v.dir ?? 0;
      mesh.rotation.z = v.kind === 'boat' ? Math.sin(clock * 1.6 + v.id) * 0.03 : 0;
    }
    for (const [id, mesh] of this.meshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
      }
    }
  }
}