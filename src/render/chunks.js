import * as THREE from 'three';
import { hash2 } from '../core/noise.js';
import { BIOMES, SHORE, WATER_COLORS, SEABED_COLORS } from '../world/biomes.js';
import { WATER_Y } from '../world/worldgen.js';
import { rgb, mergeModels } from './voxel.js';
import { OBJECTS } from '../world/objects.js';

export const CHUNK = 16;
const RADIUS = 3;

const linearPair = (pair) => pair.map(rgb);
const GROUND = Object.fromEntries(Object.entries(BIOMES).map(([k, b]) => [k, linearPair(b.ground)]));
const SHORE_GROUND = linearPair(SHORE.ground);
const WATER = linearPair(WATER_COLORS);
const SIDE_TINT = rgb(0x9a7a5a);
const SEABED = [rgb(SEABED_COLORS.shallow), rgb(SEABED_COLORS.deep)];

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
    this.dirty = new Set();
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.objectMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.waterMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.68, depthWrite: false });
    this.world.onChange((x, z) => {
      // Neighbours too, so fences across a chunk border reconnect.
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        this.dirty.add(Math.floor((x + dx) / CHUNK) + ',' + Math.floor((z + dz) / CHUNK));
      }
    });
  }

  // budget: how many missing chunks to build this frame
  update(px, pz, budget = 2) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
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
        this.scene.remove(c.terrain, c.water, c.objects);
        c.terrain.geometry.dispose();
        c.water.geometry.dispose();
        c.objects.geometry.dispose();
        this.map.delete(key);
      }
    }
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
    const objects = new THREE.Mesh(new THREE.BufferGeometry(), this.objectMat);
    objects.castShadow = true;
    objects.receiveShadow = true;
    const c = { cx, cz, terrain, water, objects, fires: [] };
    this.buildObjects(c);
    this.scene.add(terrain, water, objects);
    this.map.set(cx + ',' + cz, c);
  }

  // -> {land, water}: the solid ground (including the sea and pond beds) and the see-through water surface.
  buildTerrain(cx, cz) {
    const maker = () => {
      const pos = [], norm = [], col = [], idx = [];
      const quad = (corners, n, c) => {
        const base = pos.length / 3;
        for (const p of corners) {
          pos.push(p[0], p[1], p[2]);
          norm.push(n[0], n[1], n[2]);
          col.push(c[0], c[1], c[2]);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      };
      const done = () => toGeometry({
        pos: new Float32Array(pos), norm: new Float32Array(norm), col: new Float32Array(col), idx: new Uint32Array(idx),
      });
      return { quad, done };
    };
    const land = maker(), water = maker();
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
          const depth = Math.min(1, (WATER_Y - t.bed) / 5);
          c = [0, 1, 2].map((i) => (SEABED[0][i] + (SEABED[1][i] - SEABED[0][i]) * depth) * shade);
          const w = [0, 1, 2].map((i) => (WATER[0][i] + (WATER[1][i] - WATER[0][i]) * k) * (1 - depth * 0.35));
          water.quad([[x, WATER_Y, z], [x, WATER_Y, z + 1], [x + 1, WATER_Y, z + 1], [x + 1, WATER_Y, z]], [0, 1, 0], w);
        } else {
          const pair = t.shore ? SHORE_GROUND : GROUND[t.biome];
          c = [0, 1, 2].map((i) => (pair[0][i] + (pair[1][i] - pair[0][i]) * k) * shade);
        }
        const h = t.water ? t.bed : t.h;
        land.quad([[x, h, z], [x, h, z + 1], [x + 1, h, z + 1], [x + 1, h, z]], [0, 1, 0], c);
        const side = c.map((v, i) => v * 0.45 + SIDE_TINT[i] * 0.3);
        // Walls down to lower neighbours, wound to face outward.
        let nh = floor(x + 1, z);
        if (nh < h) land.quad([[x + 1, nh, z], [x + 1, h, z], [x + 1, h, z + 1], [x + 1, nh, z + 1]], [1, 0, 0], side);
        nh = floor(x - 1, z);
        if (nh < h) land.quad([[x, nh, z], [x, nh, z + 1], [x, h, z + 1], [x, h, z]], [-1, 0, 0], side);
        nh = floor(x, z + 1);
        if (nh < h) land.quad([[x, nh, z + 1], [x + 1, nh, z + 1], [x + 1, h, z + 1], [x, h, z + 1]], [0, 0, 1], side);
        nh = floor(x, z - 1);
        if (nh < h) land.quad([[x, nh, z], [x, h, z], [x + 1, h, z], [x + 1, nh, z]], [0, 0, -1], side);
      }
    }
    return { land: land.done(), water: water.done() };
  }

  buildObjects(c) {
    const list = [];
    c.fires = [];
    const M = this.models;
    for (let z = c.cz * CHUNK; z < (c.cz + 1) * CHUNK; z++) {
      for (let x = c.cx * CHUNK; x < (c.cx + 1) * CHUNK; x++) {
        const obj = this.world.get(x, z);
        const floor = this.world.getFloor(x, z);
        if (!obj && !floor) continue;
        const y = this.gen.tile(x, z).h, px = x + 0.5, pz = z + 0.5;
        const add = (key, extra = {}) => list.push({ m: M.get(key), x: px, y, z: pz, ...extra });
        if (floor) add(floor);
        if (!obj) continue;
        if (obj.t === 'soil') {
          add(obj.wet ? 'soil_wet' : 'soil');
          if (obj.crop >= 0) add('crop' + obj.crop, { y: y + 0.07 });
        } else if (obj.t === 'fence') {
          add('fence_post');
          [[1, 0], [0, -1], [-1, 0], [0, 1]].forEach(([dx, dz], rot) => {
            if (this.world.get(x + dx, z + dz)?.t === 'fence') add('fence_arm', { rot });
          });
        } else if (obj.t === 'door') {
          // The model spans the tile along x and is built around its corner; turn it when the walls run along z.
          const wallsAlongZ = OBJECTS[this.world.get(x, z - 1)?.t]?.block || OBJECTS[this.world.get(x, z + 1)?.t]?.block;
          if (wallsAlongZ) list.push({ m: M.get('door'), x: x + 1, y, z, rot: 3 });
          else list.push({ m: M.get('door'), x, y, z });
        } else if (obj.placed && obj.t !== 'flower') {
          add(obj.t);
          if (obj.t === 'campfire') c.fires.push({ x: px, y, z: pz });
        } else {
          // Natural objects get a stable random turn, size and (if small) nudge.
          const small = obj.t === 'flower' || obj.t === 'tallgrass' || obj.t === 'stick' || obj.t === 'pebble';
          const j = small ? 0.25 : 0;
          list.push({
            m: M.get(obj.t === 'flower' ? 'flower' + (obj.v ?? 0) : obj.t),
            x: px + (hash2(x, z, 93) - 0.5) * j, y, z: pz + (hash2(x, z, 94) - 0.5) * j,
            rot: (hash2(x, z, 91) * 4) | 0, scale: 0.85 + hash2(x, z, 92) * 0.3,
          });
        }
      }
    }
    c.objects.geometry.dispose();
    c.objects.geometry = toGeometry(mergeModels(list));
  }

  // Meshes of the 3x3 chunks around a position, for cursor picking.
  nearMeshes(px, pz) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
    const out = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.map.get(ccx + dx + ',' + (ccz + dz));
        if (c) out.push(c.terrain, c.water, c.objects);
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
