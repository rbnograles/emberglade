import { roofTurn } from './world/castle-roofs.js';
import * as THREE from 'three';
import { installControllers } from './ui/controllers.js';
import { ask } from './ui/dialog.js';
import { startCloud, syncWorld, logEvent } from './cloud.js';
import { eventFor } from './game/summary.js';
import { Sheet } from './ui/sheet.js';
import { Compass } from './ui/compass.js';
import { confirmRelocation } from './ui/relocation.js';
import { Game, needsRelocation } from './game/game.js';
import { loadSave, writeSave, clearSave, currentSlot, takeNewGame, takeAutoplay } from './game/save.js';
import { settings, saveSettings, keyName } from './settings.js';
import { normalizeLook } from './game/looks.js';
import { sfx, unlockAudio, setNight, setRain } from './audio.js';
import { Rain, Flurry } from './render/weather.js';
import { Minimap } from './ui/minimap.js';
import { KeeperView } from './render/keeper-view.js';
import { Waypoints } from './render/waypoints.js';
import { RESTORATION } from './game/encounters.js';
import { BigMap } from './ui/bigmap.js';
import { buildMenu } from './ui/menu.js';
import { FrontDoor } from './ui/frontdoor.js';
import { Creator } from './ui/creator.js';
import { cropFor } from './world/crops.js';
import { OBJECTS } from './world/objects.js';
import { WATER_Y } from './world/worldgen.js';
import { STOREY } from './world/worldstate.js';
import { ITEMS } from './game/items.js';
import { buildModels, buildItemModels } from './render/models.js';
import { loadVoxModels } from './render/voxfile.js';
import { renderItemIcons } from './render/itemicons.js';
import { Chunks, toGeometry, PEEK_STEP } from './render/chunks.js';
import { Sky } from './render/sky.js';
import { PlayerModel, Animals, Enemies, Fish, Vehicles, VillagerFigures } from './render/characters.js';
import { openTrade } from './ui/trade.js';
import { VEHICLES } from './game/game.js';
import { Particles, Sparks, Fires, hitEffect } from './render/effects.js';
import '@fontsource/nunito/latin-500.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import { Hud, drawFace, objectToolVerb } from './ui/hud.js';
import { startTooltips } from './ui/tooltip.js';
startTooltips();
import { needAction, NEED_LABEL } from './ui/touch-actions.js';
import { setRenderedIcons, iconURL } from './ui/icons.js';
import { Panels } from './ui/panels.js';

const $ = (id) => document.getElementById(id);
const save = loadSave();
if (needsRelocation(save)) await confirmRelocation(save);
// What the new-game screen chose, when the page has just reloaded into a world that does not exist yet.
const stashed = takeNewGame();
const setup = save ? null : stashed;
const game = new Game(save, setup);
// ?play in the address skips the title screen and plays whatever is here (handy for screenshots and quick testing).
const quickPlay = new URLSearchParams(location.search).has('play');
// With no save and no new game, this world is only a backdrop for the title screen: it is never stored.
const hasWorld = !!(save || setup || quickPlay);
const keep = () => {
  if (hasWorld) writeSave(game);
};
// Worlds from before characters were made play as the look kept on this device.
game.character ??= { name: 'Wanderer', cls: null, look: normalizeLook(settings.look) };
const look = game.character.look;
if (setup) keep(); // so the new world exists from its first moment
const p = game.player;
if (import.meta.env.DEV) window.__game = game; // a handle for poking at the game from the browser console while developing

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true });
function applyGraphics() {
  const low = settings.graphics === 'low';
  const density = settings.graphics === 'high' ? 2 : 1;
  renderer.setPixelRatio(Math.min(devicePixelRatio, density) * (low ? 0.75 : 1));
  renderer.shadowMap.enabled = !low;
}
applyGraphics();
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

// Models sculpted in MagicaVoxel and listed in public/models/models.json stand in for the game's own.
const custom = await loadVoxModels();
const models = buildModels();
for (const [id, model] of custom) {
  if (models.has(id)) models.set(id, model);
}
const itemModels = buildItemModels(models);
for (const [id, model] of custom) {
  if (itemModels.has(id)) itemModels.set(id, model);
  else if (!models.has(id)) console.warn(`Custom model "${id}" does not match any model in the game, so it is not used`);
}
setRenderedIcons(renderItemIcons(itemModels));
// Icons are photographed the first time each is needed. Doing them a few at a time while the game is
// idle means opening the inventory for the first time never stalls on a hundred of them at once.
{
  const waiting = Object.keys(ITEMS);
  const idle = window.requestIdleCallback ?? ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 60));
  const warm = (deadline) => {
    do iconURL(waiting.pop()); while (waiting.length && deadline.timeRemaining() > 4);
    if (waiting.length) idle(warm);
  };
  idle(warm);
}const chunks = new Chunks(scene, game, models);
const sky = new Sky(scene);
const particles = new Particles(scene);
const sparks = new Sparks(scene);
const fires = new Fires(scene);
const animals = new Animals(scene, game, models);
const folk = new VillagerFigures(scene, game, itemModels);
const enemies = new Enemies(scene, game, models);
const fish = new Fish(scene, game, models.get('fish'));
const vehicles = new Vehicles(scene, game, { trail_cart: models.get('trail_cart'), boat: models.get('boat'), submarine: models.get('submarine') });
const playerModel = new PlayerModel(look, itemModels);
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
startCloud();
if (game.relocated) setTimeout(() => hud.toast('The world has been reshaped, so you wake at a new start. Your items came with you.'), 1200);
const minimap = new Minimap(game);
const keeperView = new KeeperView(scene, game, $('keeper-hud'));
const bigmap = new BigMap(game);
// the minimap: click opens the world map, right click pins a marker on that spot (or removes the one there)
$('minimap').addEventListener('mousedown', (e) => {
  e.stopPropagation();
  if (e.button !== 2) return void bigmap.toggle();
  const box = e.currentTarget.getBoundingClientRect();
  game.toggleMarker(...minimap.worldAt(e.clientX - box.left, e.clientY - box.top), 6);
});
$('minimap').addEventListener('contextmenu', (e) => e.preventDefault());
const waypoints = new Waypoints(scene, game, $('waypoints'));
const toolButton = document.querySelector('.touch-pad .tool');
const useButton = document.querySelector('.touch-pad .use');
const layerButtons = [...document.querySelectorAll('#touch-controls .layer')];
const compass = new Compass(game);
const sheet = new Sheet(game);
drawFace(look);
$('portrait').dataset.tip = `${game.character.name}: character sheet (K)`;
$('gear').addEventListener('mousedown', (e) => {
  e.stopPropagation();
  panels.show();
  sfx('ui');
});
$('portrait').addEventListener('mousedown', (e) => {
  e.stopPropagation();
  sheet.toggle();
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
  if (type === 'levelup' || type === 'progress') {
    if (type === 'levelup') {
      sfx('goal');
      logEvent('level_up', { level: data.level, day: game.day }, currentSlot());
      sparks.rise(p.x, p.y + 0.1, p.z, 0xffd24a, 22, 0.8, 3);
      sparks.rise(p.x, p.y + 0.6, p.z, 0xffffff, 8, 0.5, 2.4);
    } else sparks.rise(p.x, p.y + 0.4, p.z, 0x8be06a, 8, 0.5);
    hud.refresh();
    sheet.render();
  }
  // Every blow throws chips in the colour of what was struck, and a bigger burst when it breaks.
  // This is its own check, not part of the chain below: there a hit is already taken by its sound.
  if (type === 'hit') {
    const y = game.gen.tile(data.x, data.z).h + (data.level ?? 0) * STOREY + 0.4;
    const effect = data.object ? hitEffect(data.object, data.destroyed) : { color: hitColor, cubes: 6, sparks: 4 };
    particles.burst(data.x + 0.5, y, data.z + 0.5, effect.color, effect.cubes);
    sparks.burst(data.x + 0.5, y + 0.2, data.z + 0.5, data.destroyed ? effect.color : 0xfff6e3, effect.sparks, data.destroyed ? 3.6 : 2.2);
  }
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
      sparks.rise(p.x, p.y + 0.2, p.z, 0x8be06a, 12);
    }
    // the moments worth a flourish
    const milestone = eventFor(data.key, game);
    if (milestone) logEvent(milestone.type, milestone.detail, currentSlot());
    if (data.key === 'hoard') sparks.rise(p.x, p.y + 0.2, p.z, 0xffd24a, 18, 1);
    else if (data.key === 'keeper:found') sparks.rise(p.x, p.y + 0.2, p.z, 0xff6a8a, 14, 0.9);
    else if (data.key === 'keeper:restore') {
      for (const hex of [0xffd24a, 0xffffff, 0xff8a3a]) sparks.rise(p.x, p.y + 0.3, p.z, hex, 20, 1.6, 3.5);
    } else if (data.key === 'sleep') sparks.rise(p.x, p.y + 0.3, p.z, 0xbfe6f5, 8, 0.5);
  } else if (type === 'newday') sfx('morning');
  else if (type === 'marker') sparks.rise(data.x, game.ground(data.x, data.z) + 0.5, data.z, new THREE.Color(data.color).getHex(), 16, 0.5, 2); // reached: its beam goes out in a puff
  else if (type === 'charm') sparks.rise(data.x, game.ground(data.x, data.z) + 0.5, data.z, 0xff8ab0, data.born ? 14 : 7, 0.4, 1.6);
  else if (type === 'swing') {
    playerModel.startSwing();
    playerModel.facing = Math.atan2(data.x + 0.5 - p.x, data.z + 0.5 - p.z);
  } else if (type === 'open') panels.show(data.what === 'chest' ? data : null);
  if (type === 'eat') {
    playerModel.startEat(data.id);
    // crumbs in the food's own colour, one puff per bite
    const colors = itemModels.get(data.id).col;
    const color = new THREE.Color().fromArray(colors, 3 * Math.floor(colors.length / 6)).getHex();
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
    sparks.burst(p.x, p.y + 1, p.z, 0xff5a5a, 10);
    shake = 0.3;
    hud.refresh();
  } else if (type === 'enemygone') {
    const y = game.ground(data.x, data.z) + 0.4;
    particles.burst(data.x, y, data.z, 0x46336b, 12);
    sparks.rise(data.x, y, data.z, 0xb08cff, 9, 0.4, 1.8);
  }
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
  if (type === 'survey') bigmap.show(data);
  if (type === 'restored') {
    game.toast(RESTORATION);
    bigmap.show();
  }
  if (type === 'faint') {
    // fainting moves you, so it is spelled out in a notice that has to be dismissed
    setTimeout(() => ask({
      title: 'You fainted',
      text: `You were hurt too badly to go on, and woke the next morning at ${data.wake}.` + (data.dropped ? ' Your pack is where you fell: the red dot on the map.' : '') + ' Hunger and thirst alone never do this.',
      yes: 'Get up',
    }), 900);
  }
  if (type === 'faint') logEvent('fainted', { day: game.day, level: game.progress.level }, currentSlot());
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
const creator = new Creator(); // the one character creator, shared by the new-game screen and the pause menu

function setPaused(v) {
  paused = v;
  menu.classList.toggle('hidden', !v);
  if (v) {
    $('btn-play').textContent = 'Resume';
    $('menu-sub').textContent = `Paused on day ${game.day}. Your world is saved.`;
    creator.mount($('creator-host'), { character: game.character, onChange: applyLook });
    keep();
  }
}
// The settings can also be opened from the title screen, where there is no game to resume:
// the same menu, with only its Settings and Controls tabs.
let fromTitle = false;
function showSettings(on) {
  fromTitle = on;
  menu.classList.toggle('from-title', on);
  menu.classList.toggle('hidden', !on);
  if (on) {
    front.hide();
    $('btn-play').textContent = 'Back';
    $('menu-sub').textContent = 'A cozy voxel survival game';
    menuTabs.show('settings');
  } else {
    menuTabs.show('worlds');
    front.show('title');
  }
}
// Esc, or B on a gamepad, with no panel open: one step back out of whatever menu is showing.
function menuBack() {
  if (front.open) front.back();
  else if (fromTitle) showSettings(false);
  else setPaused(!paused);
}
// The character's look was changed: wear it, and keep it as the look new characters start from.
function applyLook() {
  playerModel.applyLook(look);
  drawFace(look);
  settings.look = { ...look };
  saveSettings();
  keep();
}
const beforeLeave = (discard) => {
  if (!discard) keep();
  discardOnExit = true;
};
$('btn-play').addEventListener('click', () => (fromTitle ? showSettings(false) : setPaused(false)));
$('btn-title').addEventListener('click', () => {
  keep();
  menu.classList.add('hidden');
  front.show('title');
});
addEventListener('pointerdown', unlockAudio, true);
addEventListener('keydown', unlockAudio, true);
const menuTabs = buildMenu(game, {
  beforeLeave,
  save: keep,
  onGraphics: applyGraphics,
  onFullscreen: toggleFullscreen,
});
const front = new FrontDoor({
  game, hasWorld, creator, beforeLeave,
  onContinue: () => {
    front.hide();
    setPaused(false);
  },
  onSettings: () => showSettings(true),
});
$('btn-pack').addEventListener('mousedown', (e) => {
  e.stopPropagation();
  if (!paused) panels.toggle();
  sfx('ui');
});
$('btn-full').addEventListener('mousedown', (e) => {
  e.stopPropagation();
  toggleFullscreen();
});
// the hunger and thirst warning doubles as a button
$('hungry').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  if (!paused) tendNeed();
});
$('btn-pause').addEventListener('mousedown', (e) => {
  e.stopPropagation();
  setPaused(true);
});
// A world just made or just chosen starts playing at once; otherwise the game opens on its front door.
if (hasWorld && (setup || quickPlay || takeAutoplay())) setPaused(false);
else front.start();
$('btn-new').addEventListener('click', async () => {
  if (!await ask({ title: 'Start this world over?', text: 'Everything in this world will be deleted: your base, items and progress. This cannot be undone.', yes: 'Delete and restart', no: 'Keep my world', danger: true })) return;
  clearSave();
  discardOnExit = true;
  location.reload();
});
let discardOnExit = false;
addEventListener('beforeunload', () => {
  if (!discardOnExit) keep();
});

// ---------- input ----------
const keys = new Set();
const mouse = new THREE.Vector2(0, 0);
let lmb = false;
let clicked = false; // a press not yet handled, so even a very short click counts
let target = null; // {x, z, reach}

addEventListener('keydown', (e) => {
  const K = settings.keys;
  if (!paused && (e.code === 'Tab' || e.code === K.inventory || e.code === K.jump)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Escape') {
    if (bigmap.open) bigmap.hide();
    else if (sheet.open) sheet.hide();
    else if (panels.open) panels.hide();
    else menuBack();
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
  } else if (e.code === K.rotate) {
    if (game.turnPlacing(playerModel.facing) !== null) sfx('ui');
  } else if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    // choose the storey to build on: one below or above your own
    game.shiftBuildLevel(e.code === 'BracketRight' ? 1 : -1);
    hud.refresh();
  } else if (e.code === K.sheet) {
    sheet.toggle();
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
  // a finger on a button also sends a pretend mouse move; it must not drag the aim under that button
  if (touchMode) return;
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
  secondaryAction();
});
let placeNote = 0; // seconds until the next "why it will not go there" message may show
// Aimed at a tile under the rock the player stands on: digging, filling and taking things apart
// there are refused, so say why instead of doing nothing.
function overNote() {
  if (!target || target.reach || !game.overTile(target.x, target.z) || placeNote > 0) return;
  placeNote = 1.5;
  game.toast(game.groundProblem(target.x, target.z));
}
function secondaryAction() {
  camera.updateMatrixWorld();
  target = currentTarget();
  // say why a piece will not go where it is aimed, instead of failing silently
  const problem = target ? game.placeProblem(target.x, target.z) : null;
  if (problem && placeNote <= 0) {
    placeNote = 1.5;
    game.toast(problem);
  } else if (ITEMS[game.held?.id]?.fill) overNote();
  if (target || !ITEMS[game.held?.id]?.vehicle) game.secondary(target?.x ?? 0, target?.z ?? 0, !!target?.reach, playerModel.facing);
  hud.refresh();
}
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => {
  if (!paused && !panels.open) distGoal = Math.max(12, Math.min(36, distGoal + Math.sign(e.deltaY) * 2));
});

// E: use what the cursor is on, otherwise the nearest usable thing.
function interact() {
  // vehicles first: get off the one you are riding, or on the nearest one
  if (game.player.riding) return void game.dismount();
  if (game.board()) return;
  // a villager at hand comes before the things around them: see what they trade
  const villager = game.villagers.near();
  if (villager) return void openTrade(game, villager);
  if (target?.reach && game.interact(target.x, target.z)) return;
  // an animal beside you: feed it, or gather eggs or fleece from a tame one
  if (game.wildlife.handle(game.wildlife.near(p.x, p.z, 1.6))) return;
  const best = nearestUsable();
  if (best) game.interact(best.x, best.z);
}

// The closest thing on the player's own storey that Use works on, or null. Nothing under the rock
// the player stands on counts.
function nearestUsable() {
  const px = Math.floor(p.x), pz = Math.floor(p.z), level = game.playerLevel;
  let best = null, bestD = 2.6;
  for (let z = pz - 3; z <= pz + 3; z++) {
    for (let x = px - 3; x <= px + 3; x++) {
      const obj = game.world.getAt(x, z, level);
      const d = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z);
      if (obj && usable(obj.t) && d < bestD && !game.overTile(x, z)) {
        best = { x, z, obj };
        bestD = d;
      }
    }
  }
  return best;
}

// What the Use button would do right now, for its label on touch screens.
function useVerb() {
  if (game.player.riding) return 'Get off';
  if (game.vehicleNear()) return 'Board';
  if (game.villagers.near()) return 'Trade';
  const aimed = target?.reach ? game.world.getAt(target.x, target.z, game.playerLevel) : null;
  const obj = aimed && usable(aimed.t) ? aimed : nearestUsable()?.obj;
  if (!obj) return game.wildlife.near(p.x, p.z, 1.6) ? 'Tend' : 'Use';
  if (obj.t === 'door' || obj.t === 'gate') return obj.open ? 'Close' : 'Open';
  if (obj.t === 'chart_table') return 'Survey';
  if (obj.t === 'bed') return 'Sleep';
  if (obj.t === 'campfire' || obj.t === 'workbench') return 'Craft';
  if (OBJECTS[obj.t].cache || OBJECTS[obj.t].hoard) return 'Search';
  return 'Open';
}

// ---------- cursor targeting ----------
const raycaster = new THREE.Raycaster();

// ---------- touch: no cursor, so the game aims for you ----------
let touchMode = false; // true once a finger has been used; a real mouse turns it off again
let tapHold = 0; // seconds a tapped tile stays the target before aiming goes back to automatic
addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touchMode = true; }, true);
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') touchMode = false; }, true);

const USABLE = ['chart_table', 'bed', 'chest', 'cabinet', 'campfire', 'workbench', 'gate', 'door', 'lostbag'];
const usable = (t) => USABLE.includes(t) || !!OBJECTS[t]?.cache || !!OBJECTS[t]?.hoard;

// The nearest thing within reach, favouring whatever the character is facing. With something to
// build or till in hand it is the clear tile just ahead instead; seeds and water go to the nearest soil.
function autoTarget() {
  const def = ITEMS[game.held?.id];
  const fx = Math.sin(playerModel.facing), fz = Math.cos(playerModel.facing);
  const at = (x, z) => ({ x, z, reach: game.inReach(x, z), px: x + 0.5, pz: z + 0.5 });
  const wantsSoil = def?.plant || game.held?.id === 'watering_can';
  if (def?.fill) return at(Math.floor(p.x + fx * 1.3), Math.floor(p.z + fz * 1.3));
  if (def?.place || def?.floor || def?.roof || def?.vehicle) {
    // the first tile ahead the thing could go on, out to arm's length
    for (const d of [1.3, 2.1, 2.9]) {
      const tile = at(Math.floor(p.x + fx * d), Math.floor(p.z + fz * d));
      if (game.canPlace(tile.x, tile.z)) return tile;
    }
    return at(Math.floor(p.x + fx * 1.3), Math.floor(p.z + fz * 1.3));
  }
  let best = null, bestScore = Infinity;
  const px = Math.floor(p.x), pz = Math.floor(p.z);
  for (let z = pz - 4; z <= pz + 4; z++) {
    for (let x = px - 4; x <= px + 4; x++) {
      const obj = objAt(x, z);
      if (!obj || !game.inReach(x, z)) continue;
      if (wantsSoil && obj.t !== 'soil') continue;
      const dx = x + 0.5 - p.x, dz = z + 0.5 - p.z, d = Math.hypot(dx, dz) || 0.001;
      // distance, plus a penalty for being off to the side or behind
      const score = d + (1 - (dx * fx + dz * fz) / d) * 1.4;
      if (score < bestScore) {
        best = at(x, z);
        bestScore = score;
      }
    }
  }
  if (best) return best;
  // nothing nearby: a hoe tills the ground just ahead
  return def?.tool === 'hoe' || def?.tool === 'shovel' ? at(Math.floor(p.x + fx * 1.3), Math.floor(p.z + fz * 1.3)) : null;
}
const currentTarget = () => (touchMode && tapHold <= 0 ? autoTarget() : pickTarget());

// What the Tool button will do right now, for its label on touch screens.
// On touch, with nothing in reach to hit or pick up, the big button eats or drinks instead.
// Returns 'eat', 'drink' or null. A hoe keeps its job of tilling the ground ahead.
function touchNeed() {
  if (!touchMode || pickFoe()) return null;
  // what is in the hand decides first: food is for eating, a flask for drinking
  const held = ITEMS[game.held?.id];
  if (held?.food) return 'eat';
  if (held?.flask) return 'drink';
  if (target?.reach && objAt(target.x, target.z)) return null;
  if (['hoe', 'shovel'].includes(ITEMS[game.held?.id]?.tool)) return null;
  return needAction(game);
}

function toolVerb() {
  if (pickFoe()) return 'Attack';
  const need = touchNeed();
  if (need) return NEED_LABEL[need];
  const obj = target?.reach ? objAt(target.x, target.z) : null;
  return objectToolVerb(ITEMS[game.held?.id]?.tool, obj);
}

// Eat or drink, whichever is more pressing; used by the big button and by tapping the warning banner.
function tendNeed(need = p.thirst <= p.hunger ? 'drink' : 'eat') {
  if (need === 'drink') game.drinkWater();
  else game.eatFood();
  hud.refresh();
}

function toggleFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement) return void document.exitFullscreen();
  if (!root.requestFullscreen) {
    // iPhones do not let a web page go full screen; adding it to the home screen does
    return void ask({ title: 'Full screen on iPhone', text: 'Safari on iPhone cannot switch a page to full screen. Tap Share, then "Add to Home Screen", and open Emberglade from its icon: it then runs full screen.' });
  }
  root.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape')?.catch(() => {})).catch(() => {});
}
// What stands on the storey that building and tools are aimed at.
const objAt = (x, z) => game.world.getAt(x, z, game.buildLevel);
const storeyName = level => level ? 'Floor ' + (level + 1) : 'Ground';
// Is the thing in hand one that the rotate key turns?
const canTurn = () => {
  if (ITEMS[game.held?.id]?.turnRoof) return true;
  const kind = ITEMS[game.held?.id]?.place;
  return !!kind && (game.turns(kind) || kind === 'door');
};
const holdingBuildable = () => {
  const def = ITEMS[game.held?.id];
  return !!(def && (def.place || def.floor || def.roof));
};
// Which way stairs placed now would climb: 0 toward +x, 1 +z, 2 -x, 3 -z (the way the character faces).
const stairRotation = () => {
  const sx = Math.sin(playerModel.facing), sz = Math.cos(playerModel.facing);
  return Math.abs(sx) > Math.abs(sz) ? (sx > 0 ? 0 : 2) : (sz > 0 ? 1 : 3);
};

function pickTarget() {
  raycaster.setFromCamera(mouse, camera);
  // Aiming at a storey above the ground: the cursor points at that storey's own level plane, so
  // the tile under it is the one meant, however the camera is tilted. Storeys count up from what
  // is underfoot, which may be the top of an arch rather than the ground beneath it.
  const level = game.buildLevel;
  if (level > 0) {
    const ray = raycaster.ray, planeY = game.underfoot + level * STOREY + 0.05;
    if (Math.abs(ray.direction.y) < 1e-4) return null;
    const t = (planeY - ray.origin.y) / ray.direction.y;
    if (t <= 0) return null;
    const hx = ray.origin.x + ray.direction.x * t, hz = ray.origin.z + ray.direction.z * t;
    const tx = Math.floor(hx), tz = Math.floor(hz);
    return { x: tx, z: tz, reach: game.inReach(tx, tz), px: hx, pz: hz };
  }
  // under water the cursor points at the seabed, not the surface above it
  const hits = raycaster.intersectObjects(chunks.nearMeshes(p.x, p.z, !game.submerged), false);
  const def = ITEMS[game.held?.id];
  const placing = def?.place || def?.vehicle || def?.floor || def?.roof;
  const peek = chunks.peek.value;
  const insidePeek = Math.hypot((mouse.x + 1) * peekSize.x / 2 - peek.x,
    (mouse.y + 1) * peekSize.y / 2 - peek.y) < peek.z * 0.45;
  // what the circle has thinned away cannot be pointed at: the cursor goes through it too
  const thinned = (h) => (h.object.material === chunks.objectMat || h.object.material === chunks.terrainMat) &&
    h.point.y > chunks.peekFeet.value + PEEK_STEP &&
    -peekPoint.copy(h.point).applyMatrix4(camera.matrixWorldInverse).z < peek.w - 0.7;
  const hit = placing && insidePeek ? hits.find(h => !thinned(h)) : hits[0];
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
  const keeper = game.encounters.active;
  for (const e of keeper ? [keeper, ...game.enemies] : game.enemies) {
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
  // no creature in range: an animal under the cursor can be hunted
  const animal = target && game.wildlife.near(target.px, target.pz, 1.3);
  return animal ? { animal, x: animal.x, z: animal.z } : null;
}

function targetLabel() {
  if (!target?.reach) return '';
  const obj = objAt(target.x, target.z);
  if (!obj) return '';
  if (obj.t !== 'soil') return OBJECTS[obj.t].name;
  if (obj.crop < 0) return obj.wet ? 'Soil (watered)' : 'Soil';
  const crop = cropFor(obj);
  if (obj.crop >= crop.days) return crop.name + ' (ripe, click to harvest)';
  return `${crop.name} sprout ${obj.crop}/${crop.days} (${obj.wet ? 'watered' : 'needs water'})`;
}

const colorFor = (t) => hitEffect(t, false).color;

// ---------- placement preview ----------
// A see-through copy of the held buildable on the targeted tile: white where it can go, red where it cannot.
const GHOST_MODEL = { fence: 'fence_post', flower: 'flower0', door: 'door_closed' };
const ghostGeometry = new Map();
const ghost = new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, fog: false }),
);
ghost.visible = false;
ghost.renderOrder = 9;
const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x332c35, transparent: true, opacity: 0.9, depthWrite: false });
const ghostEdges = new THREE.LineSegments(new THREE.BufferGeometry(), edgeMaterial);
ghostEdges.renderOrder = 10;
ghost.add(ghostEdges);
const fenceArms = [];
for (let rot = 0; rot < 4; rot++) {
  const arm = new THREE.Mesh(toGeometry(models.get('fence_arm')), ghost.material);
  arm.rotation.y = rot * Math.PI / 2;
  arm.renderOrder = ghost.renderOrder;
  ghost.add(arm);
  fenceArms.push(arm);
}
scene.add(ghost);

// The mark on the ground beside the preview that shows which side is the front (for stairs, the top).
const frontMark = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xf2c94c, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false, fog: false }));
frontMark.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
  0.36, 0, 0, 0.06, 0, -0.24, 0.06, 0, 0.24, // the arrow head, pointing +x
  0.06, 0, -0.09, -0.16, 0, -0.09, -0.16, 0, 0.09, 0.06, 0, -0.09, -0.16, 0, 0.09, 0.06, 0, 0.09, // its stem
], 3));
frontMark.renderOrder = 11;
frontMark.visible = false;
scene.add(frontMark);
function showFront(r, x = 0, y = 0, z = 0) {
  frontMark.visible = r !== null;
  if (r === null) return;
  const [dx, dz] = [[1, 0], [0, 1], [-1, 0], [0, -1]][r];
  frontMark.position.set(x + dx * 0.72, y + 0.05, z + dz * 0.72);
  frontMark.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][r];
}

function updateGhost() {
  const def = game.held ? ITEMS[game.held.id] : null;
  const what = (def?.floor || def?.roof) ? game.held.id : def?.place ?? def?.vehicle;
  ghost.visible = !!what && !!target && !panels.open;
  if (!ghost.visible) return void showFront(null);
  const key = GHOST_MODEL[what] ?? what;
  if (!ghostGeometry.has(key)) {
    const body = toGeometry(models.get(key));
    ghostGeometry.set(key, { body, edges: new THREE.EdgesGeometry(body) });
  }
  const { body, edges } = ghostGeometry.get(key);
  ghost.geometry = body;
  ghostEdges.geometry = edges;
  [[1, 0], [0, -1], [-1, 0], [0, 1]].forEach(([dx, dz], i) => {
    fenceArms[i].visible = what === 'fence' && game.world.get(target.x + dx, target.z + dz)?.t === 'fence';
  });
  const ok = game.canPlace(target.x, target.z);
  ghost.material.color.setHex(ok ? 0xffffff : 0xff4a4a);
  ghost.material.opacity = ok ? 0.7 : 0.55;
  const tile = game.gen.tile(target.x, target.z);
  const level = def.vehicle ? 0 : game.buildLevel, lift = level * STOREY;
  const y = def.roof ? tile.h + lift + 1.55 : def.vehicle && !VEHICLES[what].land && tile.water ? WATER_Y + VEHICLES[what].float : tile.h + lift + 0.02;
  if (what !== 'door') {
    ghost.position.set(target.x + 0.5, y, target.z + 0.5);
    // turned the way it will stand: stairs by the way they climb, the rest by where the front is
    const r = OBJECTS[what] && game.turns(what) ? game.placeRotation(what, playerModel.facing) : null;
    ghost.rotation.y = r === null ? 0 : (OBJECTS[what].stairs ? [0, -Math.PI / 2, Math.PI, Math.PI / 2] : [Math.PI / 2, 0, -Math.PI / 2, Math.PI])[r];
    if (def.turnRoof) ghost.rotation.y = roofTurn(game.roofForPlacement(what, playerModel.facing)) * Math.PI / 2;
    showFront(r, target.x + 0.5, y, target.z + 0.5);
    return;
  }
  // a door has no front: it lies across the way it was turned, or fits the walls beside it
  showFront(null);
  const turned = game.turnedBy('door');
  if ((turned === null ? game.doorRotation(target.x, target.z, playerModel.facing, level) : turned % 2 === 0 ? 1 : 0) === 1) {
    ghost.position.set(target.x + 1, y, target.z);
    ghost.rotation.y = -Math.PI / 2;
  } else {
    ghost.position.set(target.x, y, target.z);
    ghost.rotation.y = 0;
  }
}

const controllers = installControllers(canvas, {
  aim: (x, y) => mouse.set(2 * x / innerWidth - 1, 1 - 2 * y / innerHeight),
  // a tap on the world acts on that spot at once, as a click would
  tap: (x, y) => {
    if (paused || panels.open || bigmap.open || sheet.open) return;
    mouse.set(2 * x / innerWidth - 1, 1 - 2 * y / innerHeight);
    // with something to build or launch in hand, a tap puts it right there
    if (holdingBuildable() || ITEMS[game.held?.id]?.vehicle) {
      tapHold = 4; // and that tile stays the aim for a while, for the Place button
      return void secondaryAction();
    }
    tapHold = 1.6;
    clicked = true;
  },
  nudgeAim: (x, y) => mouse.set(Math.max(-1, Math.min(1, mouse.x + x)), Math.max(-1, Math.min(1, mouse.y - y))),
  orbit: (yaw, pitch) => {
    yawGoal += yaw;
    pitchGoal = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitchGoal + pitch));
  },
  zoom: delta => { distGoal = Math.max(12, Math.min(36, distGoal + delta)); },
  command(action) {
    if (action === 'back') {
      if (bigmap.open) bigmap.hide();
      else if (sheet.open) sheet.hide();
      else if (panels.open) panels.hide();
      else menuBack();
      return;
    }
    if (action === 'fullscreen') return void toggleFullscreen();
    if (action === 'layerUp' || action === 'layerDown') {
      if (!paused && holdingBuildable()) game.shiftBuildLevel(action === 'layerUp' ? 1 : -1);
      return;
    }
    if (action === 'rotate') {
      if (!paused && game.turnPlacing(playerModel.facing) !== null) sfx('ui');
      return;
    }
    if (action === 'sheet' && !paused) return void sheet.toggle();
    if (paused || panels.open || bigmap.open || sheet.open) return;
    if (action === 'strike') {
      const need = touchNeed();
      if (need) return void tendNeed(need);
      clicked = true;
    }
    else if (action === 'secondary') secondaryAction();
    else if (action === 'inventory') panels.show();
    else if (action === 'interact') interact();
    else if (action === 'map') bigmap.toggle();
    else if (action === 'eat') game.eatFood();
    else if (action === 'drink') game.drinkWater();
    else if (action === 'next' || action === 'previous') game.selected = (game.selected + (action === 'next' ? 1 : 8)) % 9;
    hud.refresh();
  },
});
$('close-pack').addEventListener('click', () => panels.hide());
$('map-close').addEventListener('click', () => bigmap.hide());
for (const [id, delta] of [['map-in', -1], ['map-out', 1]]) {
  $(id).addEventListener('click', () => bigmap.root.dispatchEvent(new WheelEvent('wheel', { deltaY: delta })));
}

// ---------- main loop ----------
const camTarget = new THREE.Vector3(p.x, playerY, p.z);
const lookAt = new THREE.Vector3();
const peekPoint = new THREE.Vector3(), peekSize = new THREE.Vector2();
let last = performance.now();
let placeRepeat = 0;
let swingCooldown = 0, saveTimer = 0, hudTimer = 0, clock = 0, cloudTicks = 0;
let shake = 0; // seconds of camera shake left
let steamTimer = 0;
let haze = null; // snow or ash thick enough to close the view in
let stepTimer = 0, wasWinded = false, bubbleTimer = 0;
let wornKey = null; // armor currently shown on the character

chunks.update(p.x, p.z, 9);

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  controllers.poll(dt, front.open ? front.root : paused ? menu : bigmap.open ? bigmap.root : panels.open ? panels.root : null);
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
  dx += controllers.state.x;
  dz += controllers.state.y;
  const moving = dx !== 0 || dz !== 0;
  const sprinting = moving && (keys.has(K.sprint) || controllers.state.sprint) && game.canSprint;
  const swimming = game.swimming;
  const riding = game.vehicle;
  playerModel.gliding = game.gliding;
  const speed = riding ? VEHICLES[riding.kind].speed : game.gliding ? 7.5 : (swimming ? 2.4 : game.inWater ? 3.2 : sprinting ? 6.5 : 4.2) * game.progress.speedScale;
  if (!panels.open) {
    yawGoal += ((keys.has(K.camLeft) ? 1 : 0) - (keys.has(K.camRight) ? 1 : 0) + controllers.state.turn) * 1.9 * dt;
  if (controllers.state.zoom) distGoal = Math.max(12, Math.min(36, distGoal + controllers.state.zoom * 22 * dt));
    if (keys.has(K.camReset)) {
      // unwind to the nearest full turn so the reset takes the short way round
      yawGoal = Math.round(camYaw / (2 * Math.PI)) * 2 * Math.PI;
      pitchGoal = DEFAULT_PITCH;
    }
  }
  if (moving) {
    // Movement is relative to where the camera is looking.
    const len = Math.max(1, Math.hypot(dx, dz)), c = Math.cos(camYaw), s = Math.sin(camYaw);
    const mx = (dx * c + dz * s) / len, mz = (-dx * s + dz * c) / len;
    game.move(mx * speed * dt, mz * speed * dt);
    if (playerModel.swing <= 0) playerModel.facing = Math.atan2(mx, mz);
  }
  const wasGrounded = p.vy === 0;
  // in deep water the jump key swims up and the sprint key dives
  game.physics(dt, !panels.open && (keys.has(K.jump) || controllers.state.jump), !panels.open && (keys.has(K.sprint) || controllers.state.sprint));
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

  // see-through circle: where the player is on screen, and how far from the camera
  peekPoint.set(p.x, playerY + 0.9, p.z);
  const playerDepth = -peekPoint.clone().applyMatrix4(camera.matrixWorldInverse).z;
  peekPoint.project(camera);
  const buffer = renderer.getDrawingBufferSize(peekSize);
  chunks.peekFeet.value = playerY;
  chunks.peek.value.set((peekPoint.x * 0.5 + 0.5) * buffer.x, (peekPoint.y * 0.5 + 0.5) * buffer.y, (buffer.y * 2.6) / camDist, playerDepth);

  tapHold -= dt;
  target = panels.open ? null : currentTarget();
  marker.visible = !!target?.reach;
  if (marker.visible) {
    const tt = game.gen.tile(target.x, target.z);
    marker.position.set(target.x + 0.5, (tt.water && game.submerged ? tt.bed : tt.h) + game.buildLevel * STOREY + 0.04, target.z + 0.5);
  }
  updateGhost();
  swingCooldown -= dt;
  // holding the Place button keeps building as you walk: floors and walls go down in a row
  placeNote -= dt;
  placeRepeat -= dt;
  if (controllers.state.place && placeRepeat <= 0 && holdingBuildable() && !panels.open && !bigmap.open) {
    placeRepeat = 0.22;
    if (target && game.canPlace(target.x, target.z)) secondaryAction();
  }
  const wantUse = (lmb || clicked || controllers.state.strike) && !panels.open && !bigmap.open;
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
    swingCooldown = game.swingTime;
    hitColor = 0x6b4f9a;
    hitSound = 'hit';
    if (foe.fish) {
      fish.hit(foe.fish);
      game.give('raw_fish', 1);
      game.wearTool();
      game.emit('swing', { x: foe.x - 0.5, z: foe.z - 0.5 });
      particles.burst(foe.x, foe.fish.y, foe.z, 0xf2a03d, 6);
      sfx('hit');
    } else if (foe.animal) game.wildlife.hit(foe.animal); // it bolts when hit and leaves its drops when it falls
    else if (foe === game.encounters.active) {
      // a blow that lands on a keeper throws sparks in its own colour
      if (game.encounters.strike(game, foe)) sparks.burst(foe.x, foe.y + 1.2, foe.z, foe.spec.accent, 14, 4);
    } else {
      game.attack(foe);
      sparks.burst(foe.x, foe.y + 0.6, foe.z, 0xfff6e3, 8);
    }
  } else if (wantUse && target?.reach && swingCooldown <= 0 && !riding) {
    swingCooldown = game.swingTime;
    const obj = game.world.get(target.x, target.z);
    hitColor = obj ? colorFor(obj.t) : 0xffffff;
    hitSound = !obj ? 'pick' : obj.t.startsWith('tree_') ? 'chop' : OBJECTS[obj.t].tool === 'pickaxe' ? 'mine' : OBJECTS[obj.t].hp ? 'hit' : 'pick';
    game.primary(target.x, target.z);
  } else if (wantUse && swingCooldown <= 0 && !riding) overNote();

  chunks.time.value = clock;
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
  sparks.update(dt);
  // motes: drifting up each marker's beam, and gathering round a keeper as it winds up a blow
  for (const m of game.markers) {
    if (Math.random() < dt * 5 && Math.hypot(m.x - p.x, m.z - p.z) < 60) sparks.mote(m.x, game.ground(m.x, m.z) + 0.3 + Math.random() * 3, m.z, new THREE.Color(m.color).getHex(), 0.35);
  }
  const stirring = game.encounters.active;
  if (stirring && Math.random() < dt * (stirring.warnings.length ? 26 : stirring.engaged ? 5 : 2)) {
    sparks.mote(stirring.x, stirring.y + 0.4 + Math.random() * 1.6, stirring.z, stirring.spec.accent, 1.3);
  }
  animals.update(dt, clock);
  folk.update(dt);
  enemies.update(dt, clock);
  keeperView.update(clock);
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
  // steam rises off the boiling sea around the player
  steamTimer -= dt;
  if (steamTimer <= 0 && here.heat > 0) {
    steamTimer = 0.12;
    const sx = p.x + (Math.random() - 0.5) * 16, sz = p.z + (Math.random() - 0.5) * 16;
    if (game.gen.tile(Math.floor(sx), Math.floor(sz)).boiling) particles.burst(sx, WATER_Y, sz, 0xf2e6dc, 2);
  }
  haze = snow.level > 0.02 ? { level: snow.level * snow.level, color: 0xe8f0f5 } : ash.level > 0.02 ? { level: ash.level * 0.8, color: 0x6b5048 } : null;
  setRain(submerged ? 0 : Math.max(rain.level, snow.level * snow.level * 0.8)); // the hiss doubles as blizzard wind
  const swell = Math.sin(clock * 1.3) * 0.035;
  for (const c of chunks.map.values()) c.water.position.y = swell;

  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.25;
    minimap.draw(camYaw, playerModel.facing);
  waypoints.update(camera, clock);
  compass.draw(camYaw);
    hud.refresh();
  }
  // while building, the hint names the storey being built on, and touch gets its layer buttons
  const building = holdingBuildable(), label = targetLabel();
  const quiet = touchMode || panels.open, hintTool = quiet ? '' : toolVerb(), hintUse = quiet ? '' : useVerb();
  hud.setHint({ target: label, primary: hintTool === 'Tool' ? '' : hintTool, use: hintUse === 'Use' ? '' : hintUse, extra: building ? storeyName(game.buildLevel) : '', rotate: canTurn() ? keyName(K.rotate) : '' });
  for (const b of layerButtons) if (b.hidden === building) b.hidden = !building;
  if (touchMode) {
    const verb = toolVerb();
    if (toolButton.textContent !== verb) toolButton.textContent = verb;
    const use = useVerb();
    if (useButton.textContent !== use) useButton.textContent = use;
  }
  saveTimer += dt;
  if (saveTimer > 30) {
    saveTimer = 0;
    keep();
    // the cloud copy follows every few minutes, and only while the game is being played
    if (++cloudTicks >= 6) {
      cloudTicks = 0;
      syncWorld(game, currentSlot(), true);
    }
  }
}

// One simulated step so the world is visible behind the title menu.
step(0);
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  window.__emberglade = { game, chunks, camera, scene, setPaused, setView: (yaw, pitch) => ((yawGoal = yaw), (pitchGoal = pitch)), camState: () => ({ camYaw, camPitch, camDist, y: camera.position.y }) };
}
