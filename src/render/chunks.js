import { roofItem, roofTurn } from '../world/castle-roofs.js';
import * as THREE from 'three';
import { hash2 } from '../core/noise.js';
import { buildTerrain, CHUNK } from './terrain.js';
import { mergeModels, rgb } from './voxel.js';
import { ROCK_COLORS } from '../world/biomes.js';
import { OBJECTS } from '../world/objects.js';
import { STOREY, TOP_LEVEL } from '../world/worldstate.js';

// Stairs are sculpted rising toward +x. Their saved rotation (0 +x, 1 +z, 2 -x, 3 -z) as quarter turns for the mesh builder.
export const STAIR_TURN = [0, 3, 2, 1];
// Everything else is sculpted with its front toward +z; the same saved rotation names where the front faces.
export const FRONT_TURN = [1, 0, 3, 2];
// Quarter turns for the mesh builder of a placed thing. Things saved before turning existed have no rotation and stay as they were.
export const turnOf = (obj) => (obj.rotation === undefined ? 0 : (OBJECTS[obj.t].stairs ? STAIR_TURN : FRONT_TURN)[obj.rotation]);

export { CHUNK };
// How living things move in the wind: sway is how freely, stem the height (above its foot) that stays put.
const WIND_IN = { tree: { sway: 1, stem: 1.2 }, tallgrass: { sway: 1.8, stem: 0.08 }, flower: { sway: 1.5, stem: 0.08 }, bush: { sway: 0.45, stem: 0.25 }, bush_bare: { sway: 0.45, stem: 0.25 }, kelp: { sway: 1.6, stem: 0.1 } };
const RADIUS = 3;

export function toGeometry({ pos, norm, col, idx, sway, rock }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (sway) g.setAttribute('sway', new THREE.BufferAttribute(sway, 1));
  if (rock) g.setAttribute('rock', new THREE.BufferAttribute(rock, 1));
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
    this.roofGroups = Array.from({ length: TOP_LEVEL + 1 }, () => new THREE.Group());
    this.storeyGroups = [null, ...Array.from({ length: TOP_LEVEL }, () => new THREE.Group())];
    this.roofGroup = this.roofGroups[0];
    this.scene.add(...this.roofGroups, ...this.storeyGroups.slice(1));
    this.dirty = new Set();
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.objectMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    // See-through: anything standing between the camera and the player is thinned to a fine dither
    // inside a circle around them, so the character is never lost behind a tree or a wall.
    // peek = (player's screen x, y in pixels, radius in pixels, player's distance from the camera)
    this.peek = { value: new THREE.Vector4(0, 0, 0, 0) };
    // The same thinning for the ground itself: rock higher than the player's head (world height
    // peekY) that stands between them and the camera, so they are never lost under an arch, in a
    // cave or behind a stack. The ground underfoot is never above their head, so it stays whole.
    this.peekY = { value: 1e9 };
    // the layers of the cliffs: four colours each for limestone, earth and sandstone, in that order
    this.rockTints = { value: [ROCK_COLORS.stacks, ROCK_COLORS.table, ROCK_COLORS.canyon].flat().map((hex) => new THREE.Color(...rgb(hex))) };
    // Seconds, for everything that moves by itself: wind in the leaves, waves, the glow of lava.
    this.time = { value: 0 };
    // Wind: each corner carries a sway weight (none for trunks, walls and rocks; more the higher up
    // a crown or a blade of grass it is). Gusts roll across the land, so neighbours move together.
    const WIND = `
      float gust = sin(uTime * 1.5 + windAt.x * 0.55 + windAt.z * 0.4) + 0.5 * sin(uTime * 2.7 + windAt.z * 0.9);
      transformed.x += gust * 0.03 * sway;
      transformed.z += cos(uTime * 1.2 + windAt.x * 0.5 - windAt.z * 0.3) * 0.022 * sway;`;
    const windy = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float sway;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 windAt = (modelMatrix * vec4(position, 1.0)).xyz;${WIND}`);
    };
    // the shadow of a swaying tree sways with it
    this.objectDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    this.objectDepth.onBeforeCompile = windy;
    this.objectMat.onBeforeCompile = (shader) => {
      windy(shader);
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
    };
    // Where in the world a pixel is, snapped to an eighth of a tile, so every effect below is drawn
    // in little squares that match the voxels. Kept within one 64-tile block so the numbers stay
    // small enough to be exact on a phone.
    const PLACE = {
      vertexHead: '#include <common>\nvarying vec3 vPlace;',
      vertexBody: '#include <begin_vertex>\nvPlace = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      fragmentHead: `#include <common>
        varying vec3 vPlace;
        uniform float uTime;
        float grainAt(vec3 q) { return fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`,
    };
    const placed = (shader, vertexExtra = '') => {
      shader.uniforms.uTime = this.time;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', PLACE.vertexHead + '\nuniform float uTime;')
        .replace('#include <begin_vertex>', PLACE.vertexBody + vertexExtra);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', PLACE.fragmentHead);
    };

    // Ground: a fine grain, so grass, sand and rock are not flat sheets of one colour; cliffs of
    // the rugged country in layers of rock; and rock thinned away where it would hide the player.
    this.terrainMat.onBeforeCompile = (shader) => {
      placed(shader, '\nvRock = rock;');
      shader.uniforms.peek = this.peek;
      shader.uniforms.peekY = this.peekY;
      shader.uniforms.rockTints = this.rockTints;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float rock;\nvarying float vRock;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vRock;
          uniform vec4 peek;
          uniform float peekY;
          uniform vec3 rockTints[12];
          float peekBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
          float peekDither(vec2 p) { return peekBayer2(0.5 * p) * 0.25 + peekBayer2(p) + 0.03; }`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (peek.z > 0.0 && vPlace.y > peekY && vViewPosition.z < peek.w - 0.7) {
            float d = distance(gl_FragCoord.xy, peek.xy) / peek.z;
            float keep = mix(0.14, 1.0, smoothstep(0.45, 1.0, d));
            if (keep < peekDither(gl_FragCoord.xy)) discard;
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          if (vRock > 0.5) {
            // layers a tile and a half deep, lying a little higher or lower from one place to the next
            float shift = floor(grainAt(vec3(floor(vPlace.x / 6.0), 3.0, floor(vPlace.z / 6.0))) * 3.0) * 0.5;
            float layer = floor((vPlace.y + shift) / 1.5);
            int tint = (int(vRock + 0.5) - 1) * 4 + int(grainAt(vec3(layer, 5.0, 1.0)) * 3.999);
            diffuseColor.rgb *= rockTints[tint];
          }
          vec3 cell = floor(mod(vPlace, 64.0) * 8.0 + 0.001);
          float grain = grainAt(cell), blotch = grainAt(floor(cell / 4.0));
          diffuseColor.rgb *= 0.95 + 0.07 * grain + 0.035 * blotch;`);
    };

    // Lava: slow bright veins crawling through it, and a pulse like breathing.
    this.lavaMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    this.lavaMat.onBeforeCompile = (shader) => {
      placed(shader);
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 at = floor(mod(vPlace.xz, 64.0) * 4.0) / 4.0;
        float vein = sin(at.x * 2.3 + uTime * 0.5 + sin(at.y * 1.7 - uTime * 0.35) * 1.6) * sin(at.y * 2.1 + uTime * 0.4);
        diffuseColor.rgb *= 0.82 + 0.1 * sin(uTime * 1.1 + at.x + at.y);
        diffuseColor.rgb += vec3(0.5, 0.32, 0.08) * smoothstep(0.55, 1.0, vein);
        diffuseColor.rgb *= mix(1.0, 0.6, smoothstep(0.5, 1.0, -vein));`);
    };

    // Water: the surface rises and falls in long waves, and ripples cross it that catch the light.
    this.waterMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.68, depthWrite: false });
    this.waterMat.onBeforeCompile = (shader) => {
      placed(shader, `
        transformed.y += (sin(vPlace.x * 0.8 + uTime * 1.3) + sin(vPlace.z * 1.05 + uTime * 1.0)) * 0.03;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 at = floor(mod(vPlace.xz, 64.0) * 8.0) / 8.0;
        float ripple = sin(at.x * 3.1 + uTime * 1.6 + sin(at.y * 2.3 + uTime * 0.8) * 1.3) * sin(at.y * 2.7 - uTime * 1.2 + sin(at.x * 1.9) * 1.1);
        float glint = smoothstep(0.8, 1.0, ripple);
        diffuseColor.rgb *= 1.0 + 0.07 * sin(at.x * 0.6 + at.y * 0.5 + uTime * 0.6); // slow light and dark bands
        diffuseColor.rgb += glint * 0.2;
        diffuseColor.rgb *= mix(1.0, 0.9, smoothstep(0.75, 1.0, -ripple)); // the troughs between
        diffuseColor.a = min(1.0, diffuseColor.a + glint * 0.22);`);
    };
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
          if (!c.upper[l]) continue;
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
    objects.customDepthMaterial = this.objectDepth;
    const roof = new THREE.Mesh(new THREE.BufferGeometry(), this.objectMat);
    roof.castShadow = true;
    this.roofGroup.add(roof);
    const c = { cx, cz, terrain, water, lava, objects, roof, upper: [null], upperRoof: [null], fires: [] };
    this.buildObjects(c);
    this.scene.add(terrain, water, lava, objects);
    this.map.set(cx + ',' + cz, c);
  }

  // -> {land, water, lava}: the geometry of one chunk's ground (see terrain.js)
  buildTerrain(cx, cz) {
    const built = buildTerrain(this.gen, cx, cz);
    return { land: toGeometry(built.land), water: toGeometry(built.water), lava: toGeometry(built.lava) };
  }

  buildObjects(c) {
    const list = [], roofs = [];
    const upper = Array.from({ length: TOP_LEVEL + 1 }, () => []);
    const upperRoofs = upper.map(() => []);
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
        if (roof) roofs.push({ m: M.get(roofItem(roof)), rot: roofTurn(roof), x: x + 0.5, y: this.gen.tile(x, z).h + 1.55, z: z + 0.5 });
        for (let l = 1; l <= TOP_LEVEL; l++) {
          const cell = this.world.cell(x, z, l);
          if (!cell) continue;
          const base = this.gen.tile(x, z).h + l * STOREY;
          if (cell.floor && M.has(cell.floor)) upper[l].push({ m: M.get(cell.floor), x: x + 0.5, y: base, z: z + 0.5 });
          if (cell.obj) piece(cell.obj, x, z, base, upper[l]);
          if (cell.roof && M.has(roofItem(cell.roof))) upperRoofs[l].push({ m: M.get(roofItem(cell.roof)), rot: roofTurn(cell.roof), x: x + 0.5, y: base + 1.55, z: z + 0.5 });
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
          if (obj.crop >= 0) add((!obj.species || obj.species === 'wheat' ? 'crop' : obj.species) + obj.crop, { y: y + 0.07, sway: 1.2, stem: 0.15 });
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
            ...WIND_IN[obj.t.startsWith('tree_') && obj.t !== 'tree_dead' ? 'tree' : obj.t],
          });
        }
      }
    }
    c.objects.geometry.dispose();
    c.objects.geometry = toGeometry(mergeModels(list));
    c.roof.geometry.dispose();
    c.roof.geometry = toGeometry(mergeModels(roofs));
    for (let l = 1; l <= TOP_LEVEL; l++) {
      if (!c.upper[l]) {
        if (!upper[l].length && !upperRoofs[l].length) continue;
        c.upper[l] = new THREE.Mesh(new THREE.BufferGeometry(), this.objectMat);
        c.upperRoof[l] = new THREE.Mesh(new THREE.BufferGeometry(), this.objectMat);
        c.upper[l].castShadow = c.upper[l].receiveShadow = c.upperRoof[l].castShadow = true;
        this.storeyGroups[l].add(c.upper[l]);
        this.roofGroups[l].add(c.upperRoof[l]);
      }
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
          for (let l = 1; l <= TOP_LEVEL; l++) if (c.upper[l] && this.storeyGroups[l].visible) out.push(c.upper[l]);
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
