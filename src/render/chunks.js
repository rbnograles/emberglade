import * as THREE from 'three';
import { hash2 } from '../core/noise.js';
import { BIOMES, SHORE, WATER_COLORS, SEABED_COLORS, LAVA_COLORS, ICE_COLORS } from '../world/biomes.js';
import { WATER_Y } from '../world/worldgen.js';
import { rgb, mergeModels } from './voxel.js';
import { OBJECTS } from '../world/objects.js';
import { STOREY, TOP_LEVEL } from '../world/worldstate.js';

// Stairs are sculpted rising toward +x. Their saved rotation (0 +x, 1 +z, 2 -x, 3 -z) as quarter turns for the mesh builder.
export const STAIR_TURN = [0, 3, 2, 1];
// Everything else is sculpted with its front toward +z; the same saved rotation names where the front faces.
export const FRONT_TURN = [1, 0, 3, 2];
// Quarter turns for the mesh builder of a placed thing. Things saved before turning existed have no rotation and stay as they were.
export const turnOf = (obj) => (obj.rotation === undefined ? 0 : (OBJECTS[obj.t].stairs ? STAIR_TURN : FRONT_TURN)[obj.rotation]);

export const CHUNK = 16;
const RADIUS = 3;

const linearPair = (pair) => pair.map(rgb);
const GROUND = Object.fromEntries(Object.entries(BIOMES).map(([k, b]) => [k, linearPair(b.ground)]));
const SHORE_GROUND = linearPair(SHORE.ground);
const WATER = linearPair(WATER_COLORS);
const SIDE_TINT = rgb(0x9a7a5a);
const DIRT = linearPair([0x8f633f, 0x7a5233]); // ground the player has dug shows bare earth
const SEABED = [rgb(SEABED_COLORS.shallow), rgb(SEABED_COLORS.deep)];
const LAVA = linearPair(LAVA_COLORS), ICE = linearPair(ICE_COLORS), BOIL = linearPair([0xd9703a, 0xc25a2e]);

export function toGeometry({ pos, norm, col, idx }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// Builds and streams chunk meshes (terrain + objects) around the player.
export class Chunks {
  constructor(scene, game, models) {
    this.scene = scene;
    this.gen = game.gen;
    this.world = game.world;
    this.models = models;
    this.map = new Map();
    this.game = game;
    // Each storey above the ground, and each storey's roofs, are drawn in a group of their own, so
    // everything above the player can be lifted out of view when they step indoors.
    this.roofGroups = [0, 1, 2].map(() => new THREE.Group());
    this.storeyGroups = [null, new THREE.Group(), new THREE.Group()];
    this.roofGroup = this.roofGroups[0];
    this.scene.add(...this.roofGroups, this.storeyGroups[1], this.storeyGroups[2]);
    this.dirty = new Set();
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.objectMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    // See-through: anything standing between the camera and the player is thinned to a fine dither
    // inside a circle around them, so the character is never lost behind a tree or a wall.
    // peek = (player's screen x, y in pixels, radius in pixels, player's distance from the camera)
    this.peek = { value: new THREE.Vector4(0, 0, 0, 0) };
    this.objectMat.onBeforeCompile = (shader) => {
      shader.uniforms.peek = this.peek;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec4 peek;
          // 4x4 ordered (Bayer) dither threshold for this pixel, in 0..1
          float peekBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
          float peekDither(vec2 p) { return peekBayer2(0.5 * p) * 0.25 + peekBayer2(p) + 0.03; }`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (peek.z > 0.0 && vViewPosition.z < peek.w - 0.7) {
            float d = distance(gl_FragCoord.xy, peek.xy) / peek.z;
            // nearly clear at the centre, solid again at the rim
            float keep = mix(0.14, 1.0, smoothstep(0.45, 1.0, d));
            if (keep < peekDither(gl_FragCoord.xy)) discard;
          }`);
    };    this.lavaMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    this.waterMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.68, depthWrite: false });
    this.groundDirty = new Set();
    this.world.onChange((x, z, ground = false) => {
      if (ground) for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) this.groundDirty.add(Math.floor((x + dx) / CHUNK) + ',' + Math.floor((z + dz) / CHUNK));
      // Neighbours too, so fences across a chunk border reconnect.
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        this.dirty.add(Math.floor((x + dx) / CHUNK) + ',' + Math.floor((z + dz) / CHUNK));
      }
    });
  }

  // budget: how many missing chunks to build this frame
  update(px, pz, budget = 2) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
    // Under a roof or the floor of the storey above, hide what is overhead so the room can be seen.
    const tx = Math.floor(px), tz = Math.floor(pz), level = this.game.playerLevel;
    const covered = !!this.world.getRoof(tx, tz, level) || (level < TOP_LEVEL && !!this.world.getFloor(tx, tz, level + 1));
    for (let l = 0; l <= TOP_LEVEL; l++) {
      this.roofGroups[l].visible = !(covered && l >= level);
      if (l > 0) this.storeyGroups[l].visible = !(covered && l > level);
    }
    const missing = [];
    for (let dz = -RADIUS; dz <= RADIUS; dz++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        if (!this.map.has(ccx + dx + ',' + (ccz + dz))) missing.push([dx * dx + dz * dz, ccx + dx, ccz + dz]);
      }
    }
    missing.sort((a, b) => a[0] - b[0]);
    for (const [, cx, cz] of missing.slice(0, budget)) this.create(cx, cz);

    for (const [key, c] of this.map) {
      if (Math.abs(c.cx - ccx) > RADIUS + 1 || Math.abs(c.cz - ccz) > RADIUS + 1) {
        this.scene.remove(c.terrain, c.water, c.lava, c.objects);
        c.terrain.geometry.dispose();
        c.water.geometry.dispose();
        c.lava.geometry.dispose();
        this.roofGroup.remove(c.roof);
        c.roof.geometry.dispose();
        for (let l = 1; l <= TOP_LEVEL; l++) {
          this.storeyGroups[l].remove(c.upper[l]);
          this.roofGroups[l].remove(c.upperRoof[l]);
          c.upper[l].geometry.dispose();
          c.upperRoof[l].geometry.dispose();
        }
        c.objects.geometry.dispose();
        this.map.delete(key);
      }
    }
    // dug or filled ground: the land itself is drawn again
    for (const key of this.groundDirty) {
      const c = this.map.get(key);
      if (!c) continue;
      const built = this.buildTerrain(c.cx, c.cz);
      for (const part of ['terrain', 'water', 'lava']) c[part].geometry.dispose();
      c.terrain.geometry = built.land;
      c.water.geometry = built.water;
      c.lava.geometry = built.lava;
    }
    this.groundDirty.clear();
    for (const key of this.dirty) {
      const c = this.map.get(key);
      if (c) this.buildObjects(c);
    }
    this.dirty.clear();
  }

  create(cx, cz) {
    const built = this.buildTerrain(cx, cz);
    const terrain = new THREE.Mesh(built.land, this.terrainMat);
    terrain.receiveShadow = true;
    const water = new THREE.Mesh(built.water, this.waterMat);
    water.renderOrder = 1;
    const lava = new THREE.Mesh(built.lava, this.lavaMat);
    const objects = new THREE.Mesh(new THREE.BufferGeometry(), this.objectMat);
    objects.castShadow = true;
    objects.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.BufferGeometry(), this.objectMat);
    roof.castShadow = true;
    this.roofGroup.add(roof);
    const c = { cx, cz, terrain, water, lava, objects, roof, upper: [null], upperRoof: [null], fires: [] };
    for (let l = 1; l <= TOP_LEVEL; l++) {
      c.upper[l] = new THREE.Mesh(new THREE.BufferGeometry(), this.objectMat);
      c.upperRoof[l] = new THREE.Mesh(new THREE.BufferGeometry(), this.objectMat);
      c.upper[l].castShadow = c.upper[l].receiveShadow = c.upperRoof[l].castShadow = true;
      this.storeyGroups[l].add(c.upper[l]);
      this.roofGroups[l].add(c.upperRoof[l]);
    }
    this.buildObjects(c);
    this.scene.add(terrain, water, lava, objects);
    this.map.set(cx + ',' + cz, c);
  }

  // -> {land, water}: the solid ground (including the sea and pond beds) and the see-through water surface.
  buildTerrain(cx, cz) {
    const maker = () => {
      const pos = [], norm = [], col = [], idx = [];
      // light: how bright each of the four corners is (1 = full), for shading that fades across the square
      const quad = (corners, n, c, light = null) => {
        const base = pos.length / 3;
        corners.forEach((p, i) => {
          const k = light ? light[i] : 1;
          pos.push(p[0], p[1], p[2]);
          norm.push(n[0], n[1], n[2]);
          col.push(c[0] * k, c[1] * k, c[2] * k);
        });
        if (!light || light[0] + light[2] >= light[1] + light[3]) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      };
      const done = () => toGeometry({
        pos: new Float32Array(pos), norm: new Float32Array(norm), col: new Float32Array(col), idx: new Uint32Array(idx),
      });
      return { quad, done };
    };
    const land = maker(), water = maker(), lava = maker();
    // the solid surface of a tile: the bed under water, the ground elsewhere
    const floor = (x, z) => {
      const t = this.gen.tile(x, z);
      return t.water ? t.bed : t.h;
    };
    for (let z = cz * CHUNK; z < (cz + 1) * CHUNK; z++) {
      for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) {
        const t = this.gen.tile(x, z);
        const k = hash2(x, z, 31), shade = 0.95 + hash2(x, z, 32) * 0.1;
        let c;
        if (t.water) {
          // bed: sandy in the shallows, fading to dark blue-grey in the deep
          const depth = Math.min(1, (WATER_Y - t.bed) / 9);
          c = [0, 1, 2].map((i) => (SEABED[0][i] + (SEABED[1][i] - SEABED[0][i]) * depth) * shade);
          // the boiling sea of the volcanic region is a murky orange-red
          const w = t.boiling
            ? [0, 1, 2].map((i) => BOIL[0][i] + (BOIL[1][i] - BOIL[0][i]) * k)
            : [0, 1, 2].map((i) => (WATER[0][i] + (WATER[1][i] - WATER[0][i]) * k) * (1 - depth * 0.35));
          water.quad([[x, WATER_Y, z], [x, WATER_Y, z + 1], [x + 1, WATER_Y, z + 1], [x + 1, WATER_Y, z]], [0, 1, 0], w);
        } else {
          const pair = t.dug < 0 ? DIRT : t.ice ? ICE : t.shore ? SHORE_GROUND : GROUND[t.biome];
          c = [0, 1, 2].map((i) => (pair[0][i] + (pair[1][i] - pair[0][i]) * k) * shade);
          // lava glows: it gets its own unlit layer just above the rock
          if (t.lava) {
            const g = [0, 1, 2].map((i) => LAVA[0][i] + (LAVA[1][i] - LAVA[0][i]) * k);
            lava.quad([[x, t.h + 0.03, z], [x, t.h + 0.03, z + 1], [x + 1, t.h + 0.03, z + 1], [x + 1, t.h + 0.03, z]], [0, 1, 0], g);
          }
        }
        const h = t.water ? t.bed : t.h;
        // the ground darkens a little at the foot of anything taller beside it: a bank, a cliff, a shore
        const nook = (gx, gz) => {
          let n = 0;
          for (const [ox, oz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (floor(gx + ox, gz + oz) > h + 0.2) n++;
          return 1 - n * 0.13;
        };
        land.quad([[x, h, z], [x, h, z + 1], [x + 1, h, z + 1], [x + 1, h, z]], [0, 1, 0], c, [nook(x, z), nook(x, z + 1), nook(x + 1, z + 1), nook(x + 1, z)]);
        const side = c.map((v, i) => v * 0.45 + SIDE_TINT[i] * 0.3);
        const DEEP = 0.62; // a bank is darker at its foot than at its lip
        // Walls down to lower neighbours, wound to face outward.
        let nh = floor(x + 1, z);
        if (nh < h) land.quad([[x + 1, nh, z], [x + 1, h, z], [x + 1, h, z + 1], [x + 1, nh, z + 1]], [1, 0, 0], side, [DEEP, 1, 1, DEEP]);
        nh = floor(x - 1, z);
        if (nh < h) land.quad([[x, nh, z], [x, nh, z + 1], [x, h, z + 1], [x, h, z]], [-1, 0, 0], side, [DEEP, DEEP, 1, 1]);
        nh = floor(x, z + 1);
        if (nh < h) land.quad([[x, nh, z + 1], [x + 1, nh, z + 1], [x + 1, h, z + 1], [x, h, z + 1]], [0, 0, 1], side, [DEEP, DEEP, 1, 1]);
        nh = floor(x, z - 1);
        if (nh < h) land.quad([[x, nh, z], [x, h, z], [x + 1, h, z], [x + 1, nh, z]], [0, 0, -1], side, [DEEP, 1, 1, DEEP]);
      }
    }
    return { land: land.done(), water: water.done(), lava: lava.done() };
  }

  buildObjects(c) {
    const list = [], roofs = [];
    const upper = [null, [], []], upperRoofs = [null, [], []];
    c.fires = [];
    const M = this.models;
    // One built piece on an upper storey. Doors and stairs are turned the way they were placed.
    const piece = (obj, x, z, y, out) => {
      const px = x + 0.5, pz = z + 0.5;
      if (obj.t === 'gate') out.push({ m: M.get(obj.open ? 'gate_open' : 'gate'), x: px, y, z: pz });
      else if (obj.t === 'door') {
        const model = M.get(obj.open === true ? 'door_open' : 'door_closed');
        if ((obj.rotation ?? 0) === 1) out.push({ m: model, x: x + 1, y, z, rot: 3 });
        else out.push({ m: model, x, y, z });
      } else if (obj.t === 'fence') out.push({ m: M.get('fence_post'), x: px, y, z: pz });
      else if (M.has(obj.t)) {
        out.push({ m: M.get(obj.t), x: px, y, z: pz, rot: OBJECTS[obj.t].stairs ? STAIR_TURN[obj.rotation ?? 0] : turnOf(obj) });
        if (obj.t === 'campfire') c.fires.push({ x: px, y, z: pz });
        if (obj.t === 'lantern' || obj.t === 'lamp') c.fires.push({ x: px, y, z: pz, lantern: true });
      }
    };
    for (let z = c.cz * CHUNK; z < (c.cz + 1) * CHUNK; z++) {
      for (let x = c.cx * CHUNK; x < (c.cx + 1) * CHUNK; x++) {
        const obj = this.world.get(x, z);
        const floor = this.world.getFloor(x, z);
        const roof = this.world.getRoof(x, z);
        if (roof) roofs.push({ m: M.get(roof), x: x + 0.5, y: this.gen.tile(x, z).h + 1.55, z: z + 0.5 });
        for (let l = 1; l <= TOP_LEVEL; l++) {
          const cell = this.world.cell(x, z, l);
          if (!cell) continue;
          const base = this.gen.tile(x, z).h + l * STOREY;
          if (cell.floor && M.has(cell.floor)) upper[l].push({ m: M.get(cell.floor), x: x + 0.5, y: base, z: z + 0.5 });
          if (cell.obj) piece(cell.obj, x, z, base, upper[l]);
          if (cell.roof && M.has(cell.roof)) upperRoofs[l].push({ m: M.get(cell.roof), x: x + 0.5, y: base + 1.55, z: z + 0.5 });
        }
        if (!obj && !floor) continue;
        // things in the sea rest on the bed
        const tile = this.gen.tile(x, z);
        const y = tile.water ? tile.bed : tile.h, px = x + 0.5, pz = z + 0.5;
        const add = (key, extra = {}) => list.push({ m: M.get(key), x: px, y, z: pz, ...extra });
        if (floor) add(floor);
        if (!obj) continue;
        if (obj.t === 'soil') {
          add(obj.wet ? 'soil_wet' : 'soil');
          if (obj.crop >= 0) add((!obj.species || obj.species === 'wheat' ? 'crop' : obj.species) + obj.crop, { y: y + 0.07 });
        } else if (obj.t === 'gate') {
          add(obj.open ? 'gate_open' : 'gate');
        } else if (obj.t === 'fence') {
          add('fence_post');
          [[1, 0], [0, -1], [-1, 0], [0, 1]].forEach(([dx, dz], rot) => {
            if (this.world.get(x + dx, z + dz)?.t === 'fence') add('fence_arm', { rot });
          });
        } else if (obj.t === 'door') {
          // Old saves have no rotation: retain their wall-derived orientation.
          const wallsAlongZ = OBJECTS[this.world.get(x, z - 1)?.t]?.block || OBJECTS[this.world.get(x, z + 1)?.t]?.block;
          const rotation = obj.rotation ?? (wallsAlongZ ? 1 : 0);
          const model = M.get(obj.open === true ? 'door_open' : 'door_closed');
          if (rotation === 1) list.push({ m: model, x: x + 1, y, z, rot: 3 });
          else list.push({ m: model, x, y, z });
        } else if (obj.placed && obj.t !== 'flower') {
          add(obj.t, { rot: OBJECTS[obj.t].stairs ? STAIR_TURN[obj.rotation ?? 0] : turnOf(obj) });
          if (obj.t === 'campfire') c.fires.push({ x: px, y, z: pz });
          if (obj.t === 'lantern' || obj.t === 'lamp') c.fires.push({ x: px, y, z: pz, lantern: true });
        } else {
          // Natural objects get a stable random turn, size and (if small) nudge.
          const small = obj.t === 'flower' || obj.t === 'tallgrass' || obj.t === 'stick' || obj.t === 'pebble' || obj.t === 'clam';
          const j = small ? 0.25 : 0;
          const tall = obj.t.startsWith('tree_');
          const alt = obj.t + '#' + ((hash2(x, z, 95) * 3) | 0);
          list.push({
            m: M.get(obj.t === 'flower' ? 'flower' + (obj.v ?? 0) : M.has(alt) ? alt : obj.t),
            x: px + (hash2(x, z, 93) - 0.5) * j, y, z: pz + (hash2(x, z, 94) - 0.5) * j,
            rot: (hash2(x, z, 91) * 4) | 0, scale: tall ? 0.8 + hash2(x, z, 92) * 0.5 : 0.85 + hash2(x, z, 92) * 0.3,
          });
        }
      }
    }
    c.objects.geometry.dispose();
    c.objects.geometry = toGeometry(mergeModels(list));
    c.roof.geometry.dispose();
    c.roof.geometry = toGeometry(mergeModels(roofs));
    for (let l = 1; l <= TOP_LEVEL; l++) {
      c.upper[l].geometry.dispose();
      c.upper[l].geometry = toGeometry(mergeModels(upper[l]));
      c.upperRoof[l].geometry.dispose();
      c.upperRoof[l].geometry = toGeometry(mergeModels(upperRoofs[l]));
    }
  }

  // Meshes of the 3x3 chunks around a position, for cursor picking.
  // withWater: include the water surface (leave it out to point through it at the bed)
  nearMeshes(px, pz, withWater = true) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
    const out = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.map.get(ccx + dx + ',' + (ccz + dz));
        if (c) {
          out.push(c.terrain, c.objects);
          // built storeys can be pointed at too, unless they are hidden for being overhead
          for (let l = 1; l <= TOP_LEVEL; l++) if (this.storeyGroups[l].visible) out.push(c.upper[l]);
          if (withWater) out.push(c.water);
        }
      }
    }
    return out;
  }

  fires() {
    const out = [];
    for (const c of this.map.values()) out.push(...c.fires);
    return out;
  }
}
