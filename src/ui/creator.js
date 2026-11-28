import * as THREE from 'three';
import { PlayerModel } from '../render/characters.js';
import { DEFAULT_LOOK, LOOK_COLOURS, LOOK_CHOICES, LOOK_LABELS, LOOK_TABS, randomLook, randomName, cleanName } from '../game/looks.js';
import { CLASSES } from '../game/classes.js';
import { STATS } from '../game/progress.js';
import { ITEMS } from '../game/items.js';
import { iconURL } from './icons.js';
import { sfx } from '../audio.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// The character creator: a figure to turn and look at, beside tabs of everything that can be chosen.
// There is one of these; mount() moves it to wherever it is wanted (the new-game screen, or the
// pause menu's Character tab) and points it at the character to edit.
//   character: { name, cls, look }, changed in place
//   withClass: also offer the name and the class (a new character); otherwise only the look
//   onChange(): called after every change
export class Creator {
  constructor() {
    this.root = el('div', 'creator');
    this.character = null;
    this.onChange = () => {};
    this.tab = 'Body';

    // ---- the figure ----
    const stage = el('div', 'stage');
    this.canvas = el('canvas');
    const tools = el('div', 'stage-tools');
    const tool = (label, tip, fn) => {
      const b = el('button', '', label);
      b.type = 'button';
      b.dataset.tip = tip;
      b.addEventListener('click', () => {
        fn();
        sfx('ui');
      });
      tools.append(b);
      return b;
    };
    this.zoomButton = tool('Face', 'Look closer at the face', () => this.setZoom(!this.zoomed));
    tool('Surprise me', 'A random look', () => {
      Object.assign(this.character.look, randomLook());
      this.changed();
    });
    tool('Reset', 'Back to the plain look', () => {
      Object.assign(this.character.look, DEFAULT_LOOK);
      this.changed();
    });
    stage.append(this.canvas, el('p', 'stage-hint', 'Drag to turn'), tools);

    // ---- the choices ----
    const side = el('div', 'choices');
    this.nameRow = el('label', 'name-row');
    this.nameInput = el('input');
    this.nameInput.type = 'text';
    this.nameInput.maxLength = 16;
    this.nameInput.placeholder = 'Name';
    this.nameInput.autocomplete = 'off';
    this.nameInput.spellcheck = false;
    this.nameInput.addEventListener('input', () => {
      this.character.name = cleanName(this.nameInput.value);
      this.onChange();
    });
    const dice = el('button', 'dice', 'Random');
    dice.type = 'button';
    dice.dataset.tip = 'A random name';
    dice.addEventListener('click', () => {
      this.character.name = this.nameInput.value = randomName();
      this.onChange();
      sfx('ui');
    });
    this.nameRow.append(el('span', '', 'Name'), this.nameInput, dice);
    this.tabBar = el('div', 'creator-tabs');
    this.pane = el('div', 'creator-pane');
    side.append(this.nameRow, this.tabBar, this.pane);
    this.root.append(stage, side);

    this.buildScene();
  }

  mount(parent, { character, withClass = false, onChange = () => {} }) {
    // a character not seen before starts on the first tab, facing forward; coming back to one keeps its place
    if (character !== this.character || withClass !== this.withClass) {
      this.tab = withClass ? 'Class' : 'Body';
      this.yaw = 0.45;
      this.setZoom(false);
    }
    this.character = character;
    this.withClass = withClass;
    this.onChange = onChange;
    this.nameRow.hidden = !withClass;
    this.nameInput.value = character.name ?? '';
    parent.append(this.root);
    this.render();
    this.model.applyLook(character.look);
  }

  // Something about the character changed: redraw the figure and the choices, and tell whoever asked.
  changed() {
    this.model.applyLook(this.character.look);
    this.render();
    this.onChange();
  }

  render() {
    const tabs = [...(this.withClass ? ['Class'] : []), ...LOOK_TABS.map(([name]) => name)];
    this.tabBar.replaceChildren(...tabs.map((name) => {
      const b = el('button', name === this.tab ? 'active' : '', name);
      b.type = 'button';
      b.addEventListener('click', () => {
        this.tab = name;
        // the face and hair are easier to choose close up
        this.setZoom(name === 'Face' || name === 'Hair');
        this.render();
        sfx('ui');
      });
      return b;
    }));
    this.pane.replaceChildren(...(this.tab === 'Class' ? this.classCards() : this.lookRows()));
  }

  lookRows() {
    const look = this.character.look, rows = [];
    const keys = LOOK_TABS.find(([name]) => name === this.tab)[1];
    for (const key of keys) {
      // the accessory's colour only matters when something uses it
      if (key === 'accent' && look.accessory === 'none' && look.mark !== 'paint') continue;
      rows.push(el('h4', '', LOOK_LABELS[key]));
      const row = el('div', 'swatches');
      const choose = (value) => {
        look[key] = value;
        this.changed();
        sfx('ui');
      };
      if (key in LOOK_COLOURS) {
        for (const c of LOOK_COLOURS[key]) {
          const b = el('button', 'swatch' + (look[key] === c ? ' active' : ''));
          b.type = 'button';
          b.style.background = hex(c);
          b.setAttribute('aria-label', LOOK_LABELS[key] + ' ' + hex(c));
          b.addEventListener('click', () => choose(c));
          row.append(b);
        }
      } else {
        for (const [id, label] of LOOK_CHOICES[key]) {
          const b = el('button', 'style' + (look[key] === id ? ' active' : ''), label);
          b.type = 'button';
          b.addEventListener('click', () => choose(id));
          row.append(b);
        }
      }
      rows.push(row);
    }
    return rows;
  }

  classCards() {
    const list = el('div', 'class-list');
    for (const [id, cls] of Object.entries(CLASSES)) {
      const card = el('button', 'class-card' + (this.character.cls === id ? ' active' : ''));
      card.type = 'button';
      const stats = el('div', 'chips');
      for (const [stat, n] of Object.entries(cls.stats)) stats.append(el('span', 'stat-chip', `+${n} ${STATS[stat].name}`));
      const kit = el('div', 'kit');
      for (const [item, n] of cls.kit) {
        const cell = el('span', 'kit-item');
        const img = el('img');
        img.src = iconURL(item);
        img.alt = '';
        cell.dataset.tip = ITEMS[item].name;
        cell.append(img, el('b', '', n > 1 ? '×' + n : ''));
        kit.append(cell);
      }
      card.append(el('b', 'class-name', cls.name), el('i', '', cls.motto), el('span', 'class-text', cls.text), stats, kit);
      card.addEventListener('click', () => {
        this.character.cls = id;
        this.render();
        this.onChange();
        sfx('ui');
      });
      list.append(card);
    }
    return [el('p', 'lead', 'A class is a head start: three stat points and a few things in your pack. Nothing is closed to you later.'), list];
  }

  setZoom(on) {
    this.zoomed = on;
    this.zoomButton.textContent = on ? 'Whole body' : 'Face';
  }

  // ---- the little scene the figure stands in ----
  buildScene() {
    const canvas = this.canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a6f58, 1.15));
    const sun = new THREE.DirectionalLight(0xfff3dd, 2.2);
    sun.position.set(2.5, 4, 3.5);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xf2c94c, 0.9);
    rim.position.set(-3, 2, -3);
    scene.add(rim);
    // a low plinth to stand on
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.16, 8), new THREE.MeshLambertMaterial({ color: 0x4a3c33 }));
    plinth.position.y = -0.08;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.02, 8), new THREE.MeshLambertMaterial({ color: 0x6b5646 }));
    top.position.y = 0.005;
    scene.add(plinth, top);
    const model = (this.model = new PlayerModel(DEFAULT_LOOK));
    scene.add(model.group);

    // drag to turn; the figure keeps a little of the spin when let go
    this.yaw = 0.45;
    let dragging = false, lastX = 0, spin = 0;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      spin = 0;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      spin = (e.clientX - lastX) * 0.012;
      this.yaw += spin;
      lastX = e.clientX;
    });
    const drop = () => (dragging = false);
    canvas.addEventListener('pointerup', drop);
    canvas.addEventListener('pointercancel', drop);

    const eye = new THREE.Vector3(0, 1.1, 5.9), look = new THREE.Vector3(0, 0.82, 0);
    let last = performance.now(), width = 0, height = 0;
    const frame = (now) => {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // only draw while the creator is on screen
      if (!this.root.isConnected || !canvas.clientWidth) return;
      if (canvas.clientWidth !== width || canvas.clientHeight !== height) {
        width = canvas.clientWidth;
        height = canvas.clientHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
      if (!dragging) {
        this.yaw += spin;
        spin *= Math.exp(-dt * 5);
      }
      const k = 1 - Math.exp(-dt * 7);
      // a narrow stage needs the camera further back to keep the whole figure in view
      const far = 5.9 * Math.max(1, 0.62 / camera.aspect);
      eye.lerp(this.zoomed ? new THREE.Vector3(0, 1.3, far * 0.52) : new THREE.Vector3(0, 1.1, far), k);
      look.lerp(this.zoomed ? new THREE.Vector3(0, 1.22, 0) : new THREE.Vector3(0, 0.86, 0), k);
      camera.position.copy(eye);
      camera.lookAt(look);
      model.facing = this.yaw;
      model.update(dt, false, 0);
      // a slow breath, so the figure is not a statue
      model.frame.position.y = Math.sin(now / 900) * 0.008;
      model.armL.rotation.z = 0.04 + Math.sin(now / 900) * 0.015;
      model.armR.rotation.z = -0.04 - Math.sin(now / 900) * 0.015;
      renderer.render(scene, camera);
    };
    requestAnimationFrame(frame);
  }
}
