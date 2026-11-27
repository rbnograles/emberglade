import * as THREE from 'three';
import { Game } from './game/game.js';
import { loadSave, writeSave, clearSave } from './game/save.js';
import { settings } from './settings.js';
import { sfx, unlockAudio, setNight, setRain } from './audio.js';
import { Rain, Flurry } from './render/weather.js';
import { Minimap } from './ui/minimap.js';
import { BigMap } from './ui/bigmap.js';
import { buildMenu } from './ui/menu.js';
import { OBJECTS, CROP_RIPE } from './world/objects.js';
import { WATER_Y } from './world/worldgen.js';
import { ITEMS } from './game/items.js';
import { buildModels } from './render/models.js';
import { Chunks, toGeometry } from './render/chunks.js';
import { Sky } from './render/sky.js';
import { PlayerModel, Deer, Enemies, Fish, Vehicles } from './render/characters.js';
import { VEHICLES } from './game/game.js';
import { Particles, Fires } from './render/effects.js';
import { Hud } from './ui/hud.js';
import { loadIcons, iconPixels } from './ui/icons.js';
import { Panels } from './ui/panels.js';

const $ = (id) => document.getElementById(id);
const save = loadSave();
const game = new Game(save);
const p = game.player;

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 300);
// Orbit camera: yaw turns around the player (any angle), pitch tilts from near top-down to ground level.
const DEFAULT_PITCH = 0.96, MIN_PITCH = 0.06, MAX_PITCH = 1.48, SKY_PITCH = 0.55;
const CAM_DIR = new THREE.Vector3();
// The *Goal values are what the player asked for; the camera eases toward them every frame.
let camDist = 22, camYaw = 0, camPitch = DEFAULT_PITCH;
let distGoal = camDist, yawGoal = camYaw, pitchGoal = camPitch;
let camFloor = -Infinity; // smoothed lowest height the camera may sit at
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

await loadIcons();
const models = buildModels();
const chunks = new Chunks(scene, game, models);
const sky = new Sky(scene);
const particles = new Particles(scene);
const fires = new Fires(scene);
const deer = new Deer(scene, game, models.get('deer'));
const enemies = new Enemies(scene, game, {
  gloomling: models.get('gloomling'), snapper: models.get('snapper'), golem: models.get('golem'), spitter: models.get('spitter'),
});
const fish = new Fish(scene, game, models.get('fish'));
const vehicles = new Vehicles(scene, game, { boat: models.get('boat'), submarine: models.get('submarine') });
const playerModel = new PlayerModel(settings.look);
const rain = new Rain(scene);
const snow = new Flurry(scene, 0xffffff, 0.075);
const ash = new Flurry(scene, 0x4a4246, 0.06);
scene.add(playerModel.group);

// Square frame marking the targeted tile.
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.62, 0.7, 4, 1),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false, depthTest: false }),
);
marker.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
marker.renderOrder = 10;
marker.visible = false;
scene.add(marker);

const hud = new Hud(game);
if (game.relocated) setTimeout(() => hud.toast('The world has been reshaped, so you wake at a new start. Your items came with you.'), 1200);
const minimap = new Minimap(game);
const bigmap = new BigMap(game);
$('minimap').addEventListener('mousedown', (e) => {
  e.stopPropagation();
  bigmap.toggle();
});
const torch = new THREE.PointLight(0xffb060, 0, 17, 1.4);
scene.add(torch);

const panels = new Panels(game);

// ---------- game events ----------
let hitColor = 0xffffff;
const tileHeight = (x, z) => game.gen.tile(Math.floor(x), Math.floor(z)).h;
let playerY = p.y;

game.on((type, data) => {
  if (type === 'toast') hud.toast(data.text);
  // sounds
  if (type === 'hit') sfx(hitSound);
  else if (type === 'eat' || type === 'drink' || type === 'hurt' || type === 'break') sfx(type);
  else if (type === 'enemygone') sfx('gone');
  else if (type === 'spit') sfx('pick');
  else if (type === 'dive' || type === 'surface') {
    sfx('splash');
    particles.burst(p.x, WATER_Y + 0.1, p.z, 0xcfeaff, 10);
  }
  else if (type === 'record') {
    if (data.key.startsWith('craft:')) sfx('craft');
    else if (data.key.startsWith('place:') || data.key === 'plant') sfx('place');
    if (game.goals.index !== goalSeen) {
      goalSeen = game.goals.index;
      sfx('goal');
    }
  } else if (type === 'newday') sfx('morning');
  else if (type === 'hit') particles.burst(data.x + 0.5, game.gen.tile(data.x, data.z).h + 0.4, data.z + 0.5, hitColor);
  else if (type === 'swing') {
    playerModel.startSwing();
    playerModel.facing = Math.atan2(data.x + 0.5 - p.x, data.z + 0.5 - p.z);
  } else if (type === 'open') panels.show(data.what === 'chest' ? data : null);
  if (type === 'eat') {
    playerModel.startEat(data.id);
    // crumbs in the food's own colour, one puff per bite
    const pixels = iconPixels(data.id).pixels;
    const color = pixels[Math.floor(pixels.length / 2)].color;
    for (const delay of [250, 480, 710, 940]) {
      setTimeout(() => {
        const a = playerModel.group.rotation.y;
        particles.burst(p.x + Math.sin(a) * 0.3, p.y + 1.0, p.z + Math.cos(a) * 0.3, color, 3);
      }, delay);
    }
  }
  if (type === 'drink') {
    playerModel.startDrink(data.source);
    if (data.source === 'pond') {
      // turn to face the nearest water before kneeling
      let best = Infinity;
      const px = Math.floor(p.x), pz = Math.floor(p.z);
      for (let z = pz - 1; z <= pz + 1; z++) {
        for (let x = px - 1; x <= px + 1; x++) {
          const d = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z);
          if (game.gen.tile(x, z).water && d < best) {
            best = d;
            playerModel.facing = Math.atan2(x + 0.5 - p.x, z + 0.5 - p.z);
          }
        }
      }
    }
    // water drops: at the mouth for a flask, splashing up from the pond otherwise
    for (const delay of [250, 480, 710, 940]) {
      setTimeout(() => {
        const a = playerModel.group.rotation.y, reach = data.source === 'pond' ? 0.6 : 0.3;
        particles.burst(p.x + Math.sin(a) * reach, p.y + (data.source === 'pond' ? 0.4 : 1.0), p.z + Math.cos(a) * reach, 0x6fc3e8, 3);
      }, delay);
    }
  }
  if (type === 'ride') {
    sfx('place');
    hud.refresh();
  }
  if (type === 'hurt') {
    const flash = $('hurt');
    flash.style.transition = 'none';
    flash.style.opacity = 0.55;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      flash.style.transition = 'opacity 0.5s ease';
      flash.style.opacity = 0;
    }));
    playerModel.flash();
    particles.burst(p.x, p.y + 0.9, p.z, 0xe8303f, 14);
    shake = 0.3;
    hud.refresh();
  } else if (type === 'enemygone') particles.burst(data.x, game.ground(data.x, data.z) + 0.4, data.z, 0x46336b, 12);
  if (type === 'newday' && data.skipped) {
    // Sleeping or fainting jumps the clock: cover the jump with a quick fade from black.
    const fade = $('fade');
    fade.style.transition = 'none';
    fade.style.opacity = 1;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fade.style.transition = 'opacity 1.6s ease';
      fade.style.opacity = 0;
    }));
  }
  if (type === 'inv' || type === 'goal' || type === 'newday' || type === 'faint') {
    hud.refresh();
    panels.render();
  }
});

// ---------- menu ----------
let goalSeen = game.goals.index; // to chime when a goal is completed
let hitSound = 'pick';
let paused = true;
const menu = $('menu');
$('btn-play').textContent = save ? `Continue (day ${game.day})` : 'Play';


function setPaused(v) {
  paused = v;
  menu.classList.toggle('hidden', !v);
  if (v) {
    $('btn-play').textContent = 'Resume';
    $('menu-sub').textContent = `Paused on day ${game.day}. Your world is saved.`;
    writeSave(game);
  }
}
$('btn-play').addEventListener('click', () => setPaused(false));
addEventListener('mousedown', unlockAudio);
addEventListener('keydown', unlockAudio);
buildMenu(game, {
  beforeLeave: (discard) => {
    if (discard) discardOnExit = true;
    else writeSave(game);
  },
  onLook: () => playerModel.applyLook(settings.look),
});
$('btn-pause').addEventListener('mousedown', (e) => {
  e.stopPropagation();
  setPaused(true);
});
// ?play in the address skips the title menu (handy for screenshots and quick testing)
if (new URLSearchParams(location.search).has('play')) setPaused(false);
$('btn-new').addEventListener('click', () => {
  if (!confirm('Start a new world? Your current world will be deleted.')) return;
  clearSave();
  discardOnExit = true;
  location.reload();
});
let discardOnExit = false;
addEventListener('beforeunload', () => {
  if (!discardOnExit) writeSave(game);
});

// ---------- input ----------
const keys = new Set();
const mouse = new THREE.Vector2(0, 0);
let lmb = false;
let clicked = false; // a press not yet handled, so even a very short click counts
let target = null; // {x, z, reach}

addEventListener('keydown', (e) => {
  const K = settings.keys;
  if (e.code === 'Tab' || e.code === K.inventory || (e.code === K.jump && !paused)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Escape') {
    if (bigmap.open) bigmap.hide();
    else if (panels.open) panels.hide();
    else setPaused(!paused);
    return;
  }
  if (paused) return;
  keys.add(e.code);
  if (e.code === K.map) {
    bigmap.toggle();
    sfx('ui');
  } else if (e.code === K.inventory) {
    panels.toggle();
    sfx('ui');
  }
  else if (e.code.startsWith('Digit') && e.code !== 'Digit0') {
    const slot = Number(e.code.slice(5)) - 1;
    // Over an inventory slot in the panel: put that item in this hotbar slot and equip it.
    if (panels.open && panels.hover !== null) game.equip(panels.hover, slot);
    else game.selected = slot;
    hud.refresh();
  } else if (e.code === K.drink) {
    game.drinkWater();
    hud.refresh();
  } else if (e.code === K.eat) {
    game.eatFood();
    hud.refresh();
  } else if (e.code === K.use) {
    if (panels.open) panels.hide();
    else interact();
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => {
  keys.clear();
  lmb = false;
});

const canvas = renderer.domElement;
// Right or middle button held and dragged turns the camera; a right click without dragging is the item action.
let drag = null; // {button, x, y, moved}
addEventListener('mousemove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 5) return;
  drag.moved = true;
  drag.x = e.clientX;
  drag.y = e.clientY;
  yawGoal -= dx * 0.006;
  pitchGoal = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitchGoal + dy * 0.005));
});
canvas.addEventListener('mousedown', (e) => {
  if (paused || panels.open) return;
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (e.button === 0) lmb = clicked = true;
  else {
    e.preventDefault();
    drag = { button: e.button, x: e.clientX, y: e.clientY, moved: false };
  }
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) lmb = false;
  if (!drag || e.button !== drag.button) return;
  const wasClick = !drag.moved && drag.button === 2;
  drag = null;
  if (!wasClick || paused || panels.open) return;
  camera.updateMatrixWorld();
  target = pickTarget();
  game.secondary(target?.x ?? 0, target?.z ?? 0, !!target && target.reach);
  hud.refresh();
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => {
  if (!paused && !panels.open) distGoal = Math.max(12, Math.min(36, distGoal + Math.sign(e.deltaY) * 2));
});

// E: use what the cursor is on, otherwise the nearest usable thing.
function interact() {
  // vehicles first: get off the one you are riding, or on the nearest one
  if (game.player.riding) return void game.dismount();
  if (game.board()) return;
  if (target?.reach && game.interact(target.x, target.z)) return;
  const px = Math.floor(p.x), pz = Math.floor(p.z);
  let best = null, bestD = 2.6;
  for (let z = pz - 3; z <= pz + 3; z++) {
    for (let x = px - 3; x <= px + 3; x++) {
      const t = game.world.get(x, z)?.t;
      const d = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z);
      if ((t === 'bed' || t === 'chest' || t === 'campfire' || t === 'workbench') && d < bestD) {
        best = [x, z];
        bestD = d;
      }
    }
  }
  if (best) game.interact(best[0], best[1]);
}

// ---------- cursor targeting ----------
const raycaster = new THREE.Raycaster();

function pickTarget() {
  raycaster.setFromCamera(mouse, camera);
  // under water the cursor points at the seabed, not the surface above it
  const hit = raycaster.intersectObjects(chunks.nearMeshes(p.x, p.z, !game.submerged), false)[0];
  if (!hit) return null;
  const pt = hit.point;
  let best = null;
  if (hit.object.material === chunks.objectMat) {
    // The object mesh is merged per chunk, so find which object this point belongs to.
    const fx = Math.floor(pt.x), fz = Math.floor(pt.z);
    let bestScore = 0.35;
    for (let z = fz - 2; z <= fz + 2; z++) {
      for (let x = fx - 2; x <= fx + 2; x++) {
        const obj = game.world.get(x, z);
        if (!obj) continue;
        const r = OBJECTS[obj.t].pickR ?? 0.5;
        if (pt.y - game.gen.tile(x, z).h > 1 && r < 1) continue; // high up: only a tree can be there
        const score = Math.hypot(pt.x - x - 0.5, pt.z - z - 0.5) - r;
        if (score < bestScore) {
          best = [x, z];
          bestScore = score;
        }
      }
    }
  }
  if (!best) {
    const n = hit.face.normal;
    best = [Math.floor(pt.x - n.x * 0.01), Math.floor(pt.z - n.z * 0.01)];
  }
  return { x: best[0], z: best[1], reach: game.inReach(best[0], best[1]), px: pt.x, pz: pt.z };
}

// The creature a swing would hit: the one under the cursor if it is close enough, else one right next to the player.
function pickFoe() {
  let best = null, bestD = Infinity;
  for (const e of game.enemies) {
    const fromPlayer = Math.hypot(e.x - p.x, e.z - p.z);
    if (fromPlayer > 2.8 || Math.abs(e.y - p.y) > 2.2) continue; // must be near in depth as well
    const fromCursor = target ? Math.hypot(e.x - target.px, e.z - target.pz) : Infinity;
    if (fromCursor > 1.5 && fromPlayer > 1.5) continue;
    const d = Math.min(fromCursor, fromPlayer);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  if (best) return best;
  // fish: any one within arm's reach of a diver
  for (const f of fish.list) {
    if (Math.hypot(f.x - p.x, f.y - p.y - 0.6, f.z - p.z) < 1.9) return { fish: f, x: f.x, z: f.z };
  }
  // no creature in range: a deer under the cursor can be hunted
  for (const d of deer.list) {
    if (Math.hypot(d.x - p.x, d.z - p.z) > 2.8) continue;
    if (target && Math.hypot(d.x - target.px, d.z - target.pz) < 1.3) return { deer: d, x: d.x, z: d.z };
  }
  return null;
}

function targetLabel() {
  if (!target?.reach) return '';
  const obj = game.world.get(target.x, target.z);
  if (!obj) return '';
  if (obj.t !== 'soil') return OBJECTS[obj.t].name;
  if (obj.crop < 0) return obj.wet ? 'Soil (watered)' : 'Soil';
  if (obj.crop === CROP_RIPE) return 'Wheat (ripe, click to harvest)';
  return `Wheat sprout ${obj.crop + 1}/3 (${obj.wet ? 'watered' : 'needs water'})`;
}

const HIT_COLORS = { tree: 0x8a5a34, rock: 0x9a9fa6, boulder: 0x9a9fa6, pebble: 0x9a9fa6, soil: 0xe9c545, stick: 0x8a5a34 };
const colorFor = (t) => HIT_COLORS[t.split('_')[0]] ?? (OBJECTS[t].item ? 0xa8743c : 0x6cc257);

// ---------- placement preview ----------
// A see-through copy of the held buildable on the targeted tile: green where it can go, red where it cannot.
const GHOST_MODEL = { fence: 'fence_post', flower: 'flower0' };
const ghostGeometry = new Map();
const ghost = new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, fog: false }),
);
ghost.visible = false;
ghost.renderOrder = 9;
scene.add(ghost);

function updateGhost() {
  const def = game.held ? ITEMS[game.held.id] : null;
  const what = def?.floor ? game.held.id : def?.place;
  ghost.visible = !!what && !!target && !panels.open;
  if (!ghost.visible) return;
  const key = GHOST_MODEL[what] ?? what;
  if (!ghostGeometry.has(key)) ghostGeometry.set(key, toGeometry(models.get(key)));
  ghost.geometry = ghostGeometry.get(key);
  const ok = game.canPlace(target.x, target.z);
  ghost.material.color.setHex(ok ? 0xffffff : 0xff4a4a);
  ghost.material.opacity = ok ? 0.7 : 0.55;
  const y = game.gen.tile(target.x, target.z).h + 0.02;
  const isWall = (x, z) => !!OBJECTS[game.world.get(x, z)?.t]?.block;
  if (what !== 'door') {
    ghost.position.set(target.x + 0.5, y, target.z + 0.5);
    ghost.rotation.y = 0;
  } else if (isWall(target.x, target.z - 1) || isWall(target.x, target.z + 1)) {
    // same turn the chunk builder gives a door set between walls that run along z
    ghost.position.set(target.x + 1, y, target.z);
    ghost.rotation.y = -Math.PI / 2;
  } else {
    ghost.position.set(target.x, y, target.z);
    ghost.rotation.y = 0;
  }
}

// ---------- main loop ----------
const camTarget = new THREE.Vector3(p.x, playerY, p.z);
const lookAt = new THREE.Vector3();
let last = performance.now();
let swingCooldown = 0, saveTimer = 0, hudTimer = 0, clock = 0;
let shake = 0; // seconds of camera shake left
let haze = null; // snow or ash thick enough to close the view in
let stepTimer = 0, wasWinded = false, bubbleTimer = 0;
let wornKey = null; // armor currently shown on the character

chunks.update(p.x, p.z, 999);

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) step(dt);
  renderer.render(scene, camera);
}

function step(dt) {
  const K = settings.keys;
  clock += dt;
  // movement
  let dx = 0, dz = 0;
  if (!panels.open) {
    dx = (keys.has(K.right) || keys.has('ArrowRight') ? 1 : 0) - (keys.has(K.left) || keys.has('ArrowLeft') ? 1 : 0);
    dz = (keys.has(K.down) || keys.has('ArrowDown') ? 1 : 0) - (keys.has(K.up) || keys.has('ArrowUp') ? 1 : 0);
  }
  const moving = dx !== 0 || dz !== 0;
  const sprinting = moving && keys.has(K.sprint) && game.canSprint;
  const swimming = game.swimming;
  const riding = game.vehicle;
  playerModel.gliding = game.gliding;
  const speed = riding ? VEHICLES[riding.kind].speed : game.gliding ? 7.5 : swimming ? 2.4 : game.inWater ? 3.2 : sprinting ? 6.5 : 4.2;
  if (!panels.open) {
    yawGoal += ((keys.has(K.camLeft) ? 1 : 0) - (keys.has(K.camRight) ? 1 : 0)) * 1.9 * dt;
    if (keys.has(K.camReset)) {
      // unwind to the nearest full turn so the reset takes the short way round
      yawGoal = Math.round(camYaw / (2 * Math.PI)) * 2 * Math.PI;
      pitchGoal = DEFAULT_PITCH;
    }
  }
  if (moving) {
    // Movement is relative to where the camera is looking.
    const len = Math.hypot(dx, dz), c = Math.cos(camYaw), s = Math.sin(camYaw);
    const mx = (dx * c + dz * s) / len, mz = (-dx * s + dz * c) / len;
    game.move(mx * speed * dt, mz * speed * dt);
    if (playerModel.swing <= 0) playerModel.facing = Math.atan2(mx, mz);
  }
  const wasGrounded = p.vy === 0;
  // in deep water the jump key swims up and the sprint key dives
  game.physics(dt, !panels.open && keys.has(K.jump), !panels.open && keys.has(K.sprint));
  const submerged = game.underwater; // diving, or below the surface in a submarine
  // on a boat you stand on deck facing the way it sails; inside a submarine you are out of sight
  playerModel.group.visible = !(riding && riding.kind === 'submarine');
  $('underwater').style.opacity = submerged ? Math.min(0.38, 0.16 + (WATER_Y - p.y) * 0.03) : 0;
  // from below, the surface thins out so the diver and the seabed stay clear
  const waterOpacity = chunks.waterMat.opacity;
  chunks.waterMat.opacity = waterOpacity + ((submerged ? 0.28 : 0.68) - waterOpacity) * Math.min(1, dt * 5);
  bubbleTimer -= dt;
  if (submerged && bubbleTimer <= 0) {
    bubbleTimer = 0.55;
    particles.burst(p.x, p.y + 1.2, p.z, 0xd8f2ff, 2);
  }
  if (wasGrounded && p.vy > 0) sfx('jump');
  // footsteps, quicker when sprinting
  stepTimer -= dt;
  if (moving && p.vy === 0 && !game.swimming && !riding && stepTimer <= 0) {
    stepTimer = sprinting ? 0.24 : 0.34;
    sfx('step');
  }
  if (p.winded && !wasWinded) sfx('winded');
  wasWinded = !!p.winded;
  playerY = p.y;
  playerModel.group.position.set(p.x, playerY, p.z);
  playerModel.update(dt, moving && !riding, speed, swimming, clock, game.submerged);
  playerModel.setHeld(game.held?.id ?? null, !!(game.held && (ITEMS[game.held.id].tool || ITEMS[game.held.id].weapon)));
  const worn = game.armor.slots.map((s) => s?.id ?? '').join();
  if (worn !== wornKey) {
    wornKey = worn;
    playerModel.setArmor(game.armor.slots.map((s) => (s ? ITEMS[s.id].color : null)));
  }

  game.tick(dt, sprinting);
  chunks.update(p.x, p.z);

  // camera
  // Ease everything: turning, tilting, zooming and following. Height follows more slowly than
  // position so steps and jumps do not shake the view.
  camYaw += (yawGoal - camYaw) * ease(10, dt);
  camPitch += (pitchGoal - camPitch) * ease(10, dt);
  camDist += (distGoal - camDist) * ease(8, dt);
  const follow = ease(9, dt);
  camTarget.x += (p.x - camTarget.x) * follow;
  camTarget.z += (p.z - camTarget.z) * follow;
  camTarget.y += (playerY + 0.8 - camTarget.y) * ease(4, dt);
  const cp = Math.cos(camPitch);
  CAM_DIR.set(Math.sin(camYaw) * cp, Math.sin(camPitch), Math.cos(camYaw) * cp);
  camera.position.copy(camTarget).addScaledVector(CAM_DIR, camDist);
  // Keep the camera above the terrain. The floor is the highest ground around the camera and is
  // itself eased, so crossing ledges lifts the view gently instead of snapping.
  let floor = -Infinity;
  for (let oz = -1; oz <= 1; oz++) {
    for (let ox = -1; ox <= 1; ox++) floor = Math.max(floor, game.ground(camera.position.x + ox, camera.position.z + oz));
  }
  floor += 0.9;
  camFloor = camFloor === -Infinity ? floor : camFloor + (floor - camFloor) * ease(5, dt);
  camera.position.y = Math.max(camera.position.y, camFloor);
  // Tilted low, the camera also looks upward so the sky fills the view.
  lookAt.copy(camTarget);
  lookAt.y += Math.max(0, SKY_PITCH - camPitch) * 13; // gentle enough that the horizon stays in view
  if (shake > 0) {
    // a short jolt when hit, fading out
    shake = Math.max(0, shake - dt);
    const amount = shake * 0.9;
    camera.position.x += (Math.random() - 0.5) * amount;
    camera.position.y += (Math.random() - 0.5) * amount;
    camera.position.z += (Math.random() - 0.5) * amount;
  }
  camera.lookAt(lookAt);
  camera.updateMatrixWorld();

  // targeting and tool use
  target = panels.open ? null : pickTarget();
  marker.visible = !!target?.reach;
  if (marker.visible) {
    const tt = game.gen.tile(target.x, target.z);
    marker.position.set(target.x + 0.5, (tt.water && game.submerged ? tt.bed : tt.h) + 0.04, target.z + 0.5);
  }
  updateGhost();
  swingCooldown -= dt;
  const wantUse = (lmb || clicked) && !panels.open;
  if (swingCooldown <= 0) clicked = false;
  // a vehicle under the cursor is picked back up with a click (not while riding it)
  if (wantUse && swingCooldown <= 0 && !riding && target) {
    const v = game.vehicles.find((x) => Math.hypot(x.x - target.px, x.z - target.pz) < 1.3 && Math.hypot(x.x - p.x, x.z - p.z) < 3.2);
    if (v) {
      swingCooldown = 0.4;
      game.pickupVehicle(v);
      hud.refresh(); // the cooldown just set keeps this click from also swinging at something
    }
  }
  const foe = wantUse && swingCooldown <= 0 && !riding ? pickFoe() : null;
  if (foe) {
    swingCooldown = 0.32;
    hitColor = 0x6b4f9a;
    hitSound = 'hit';
    if (foe.fish) {
      fish.hit(foe.fish);
      game.give('raw_fish', 1);
      game.wearTool();
      game.emit('swing', { x: foe.x - 0.5, z: foe.z - 0.5 });
      particles.burst(foe.x, foe.fish.y, foe.z, 0xf2a03d, 6);
      sfx('hit');
    } else if (foe.deer) {
      // hunting: the deer bolts when hit and drops meat and hide when it falls
      if (deer.hit(foe.deer, game.attackPower, p.x, p.z)) {
        game.give('raw_meat', 1 + Math.floor(Math.random() * 2));
        game.give('hide', 1);
      }
      game.wearTool();
      game.emit('swing', { x: foe.x - 0.5, z: foe.z - 0.5 });
      game.emit('hit', { x: Math.floor(foe.x), z: Math.floor(foe.z) });
    } else game.attack(foe);
  } else if (wantUse && target?.reach && swingCooldown <= 0 && !riding) {
    swingCooldown = 0.32;
    const obj = game.world.get(target.x, target.z);
    hitColor = obj ? colorFor(obj.t) : 0xffffff;
    hitSound = !obj ? 'pick' : obj.t.startsWith('tree_') ? 'chop' : OBJECTS[obj.t].tool === 'pickaxe' ? 'mine' : OBJECTS[obj.t].hp ? 'hit' : 'pick';
    game.primary(target.x, target.z);
  }

  sky.update(game.time, p.x, playerY, p.z, camDist, camera.position, clock, game.raining, haze);
  fires.update(chunks.fires(), p.x, p.z, clock, game.isNight);
  // a held torch lights the way
  const lit = game.held && ITEMS[game.held.id].light;
  torch.position.set(p.x, playerY + 1.7, p.z);
  // a submarine carries its own lamp
  const lamp = riding && riding.kind === 'submarine';
  torch.intensity = lamp ? 12 : lit ? (game.isNight ? 9 : 2) * (1 + Math.sin(clock * 12) * 0.06) : 0;
  setNight(game.isNight);
  particles.update(dt);
  deer.update(dt, p.x, p.z);
  enemies.update(dt, clock);
  fish.update(dt, p.x, p.y, p.z);
  vehicles.update(clock);
  bigmap.update();
  // weather: rain streaks over the view, and the water surface rises and falls a little
  // rain falls as real streaks with splashes; the tallest water is what a drop lands on
  rain.update(dt, game.raining, p.x, playerY, p.z, (x, z) => game.ground(x, z));
  // snow thickens toward the heart of the frozen region; ash drifts over the volcanic lands
  const here = game.gen.tile(Math.floor(p.x), Math.floor(p.z));
  snow.update(dt, here.frost > 0 ? Math.min(1, 0.12 + here.frost * 1.15) : 0, p.x, playerY, p.z, clock);
  ash.update(dt, here.heat > 0 ? Math.min(0.6, 0.08 + here.heat * 0.6) : 0, p.x, playerY, p.z, clock);
  haze = snow.level > 0.02 ? { level: snow.level * snow.level, color: 0xe8f0f5 } : ash.level > 0.02 ? { level: ash.level * 0.8, color: 0x6b5048 } : null;
  setRain(submerged ? 0 : Math.max(rain.level, snow.level * snow.level * 0.8)); // the hiss doubles as blizzard wind
  const swell = Math.sin(clock * 1.3) * 0.035;
  for (const c of chunks.map.values()) c.water.position.y = swell;

  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.25;
    minimap.draw(camYaw);
    hud.refresh();
  }
  hud.setHint(targetLabel());
  saveTimer += dt;
  if (saveTimer > 30) {
    saveTimer = 0;
    writeSave(game);
  }
}

// One simulated step so the world is visible behind the title menu.
step(0);
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  window.__emberglade = { game, chunks, camera, scene, setPaused, setView: (yaw, pitch) => ((yawGoal = yaw), (pitchGoal = pitch)), camState: () => ({ camYaw, camPitch, camDist, y: camera.position.y }) };
}
