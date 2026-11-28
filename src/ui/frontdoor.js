import { cloud, createAccount, signIn, signOut, fetchWorld, syncWorld, NAME_RULE } from '../cloud.js';
import { SLOTS, currentSlot, setSlot, slotInfo, clearSave, writeRaw, stashNewGame, playAfterReload } from '../game/save.js';
import { DIFFICULTIES, RULE_FIELDS, presetOf, difficultyName } from '../game/rules.js';
import { CLASSES } from '../game/classes.js';
import { normalizeLook, randomName, cleanName } from '../game/looks.js';
import { WORLD_TYPES, seedFrom } from '../world/worldtypes.js';
import { previewPixels } from '../world/preview.js';
import { settings, saveSettings } from '../settings.js';
import { drawFace } from './hud.js';
import { ask } from './dialog.js';
import { sfx, unlockAudio } from '../audio.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const button = (cls, text, fn) => {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', () => {
    unlockAudio();
    sfx('ui');
    fn(b);
  });
  return b;
};

// Whether this device has already been through the account screen: 'guest', 'account', or nothing yet.
const ENTRY_KEY = 'emberglade-entry';
const entry = {
  get() {
    try {
      return localStorage.getItem(ENTRY_KEY);
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      if (value) localStorage.setItem(ENTRY_KEY, value);
      else localStorage.removeItem(ENTRY_KEY);
    } catch {
      // storage unavailable: the account screen simply shows again next time
    }
  },
};

const STEPS = ['Character', 'Difficulty', 'World', 'Rules', 'Begin'];
const PREVIEW = 56; // pixels across a world thumbnail

// What a set of rules means, in a few short lines.
function ruleLines(rules) {
  const label = (key) => RULE_FIELDS.find((f) => f.key === key).choices.find(([v]) => v === rules[key])?.[1] ?? rules[key] + '×';
  return [
    `Needs run down at ${rules.drain}×`,
    rules.enemies ? `Creatures: ${label('enemies').toLowerCase()}, ${rules.enemyDamage}× damage` : 'No hostile creatures',
    `Days: ${label('dayLength').toLowerCase()}`,
    rules.keepPack ? 'You keep your pack when you faint' : 'Fainting leaves your pack behind',
    ...(rules.xp !== 1 ? [`Experience at ${rules.xp}×`] : []),
  ];
}

// "Wren the Warrior · Day 4 · Level 2"
function describeSlot(info) {
  const who = info.name ? info.name + (CLASSES[info.cls] ? ' the ' + CLASSES[info.cls].name : '') : null;
  return [who, 'Day ' + info.day, 'Level ' + info.level].filter(Boolean).join(' · ');
}

// Everything in front of the game: the account screen, the title screen, the list of worlds, and
// the new-game screens (character, difficulty, world, rules, and a last look before starting).
//   hooks.game            the world now loaded (a backdrop when hasWorld is false)
//   hooks.hasWorld        true when this slot holds a real, saved world
//   hooks.creator         the shared character creator
//   hooks.onContinue()    play the loaded world
//   hooks.onSettings()    open the settings
//   hooks.beforeLeave(discard)  called before the page reloads into another world
export class FrontDoor {
  constructor(hooks) {
    this.hooks = hooks;
    this.root = document.getElementById('front');
    this.screen = null;
    this.previews = new Map(); // "seed:type" -> pixels, so going back and forth does not redraw them
    this.previewJob = 0;
    // typing and clicking here must never reach the game behind
    for (const type of ['keydown', 'keyup', 'mousedown', 'mouseup', 'wheel', 'contextmenu', 'pointerdown']) {
      this.root.addEventListener(type, (e) => {
        if (type === 'keydown' && e.code === 'Escape') {
          e.preventDefault();
          this.back();
        }
        e.stopPropagation();
      });
    }
    // the account chip follows the cloud; and a session that turns out to be signed in skips the account screen
    const base = cloud.onChange;
    cloud.onChange = () => {
      base();
      if (cloud.account) entry.set('account');
      if (this.screen === 'account' && cloud.account && !this.busy) this.show('title');
      else if (this.screen === 'title') this.paintChip();
    };
  }

  get open() { return !this.root.classList.contains('hidden'); }

  // The first screen for whoever has just opened the game.
  start() {
    this.show(entry.get() || cloud.account ? 'title' : 'account');
  }

  hide() {
    this.root.classList.add('hidden');
    this.screen = null;
    this.root.replaceChildren();
  }

  show(screen) {
    this.screen = screen;
    this.root.classList.remove('hidden');
    this.root.dataset.screen = screen;
    const view = { account: () => this.accountScreen(), login: () => this.formScreen(false), signup: () => this.formScreen(true), title: () => this.titleScreen(), load: () => this.loadScreen(), wizard: () => this.wizardScreen() }[screen]();
    this.root.replaceChildren(view);
    view.querySelector('[data-first]')?.focus();
  }

  // Esc, or B on a gamepad: one screen back.
  back() {
    if (this.screen === 'login' || this.screen === 'signup') this.show('account');
    else if (this.screen === 'load') this.show('title');
    else if (this.screen === 'account' && entry.get()) this.show('title');
    else if (this.screen === 'wizard') {
      if (this.step > 0) this.goStep(this.step - 1);
      else this.show('title');
    }
  }

  brand(sub) {
    const box = el('div', 'fd-brand');
    const img = el('img');
    img.src = '/logo.svg';
    img.alt = '';
    img.width = img.height = 72;
    box.append(img, el('h1', '', 'Emberglade'), el('p', '', sub));
    return box;
  }

  // ---------- account ----------
  accountScreen() {
    const box = el('div', 'fd-box');
    box.append(this.brand('A cozy voxel survival game'));
    const login = button('fd-btn primary', 'Log in', () => this.show('login'));
    const signup = button('fd-btn', 'Sign up', () => this.show('signup'));
    const guest = button('fd-btn ghost', 'Continue as guest', () => {
      entry.set('guest');
      this.show('title');
    });
    login.disabled = signup.disabled = !cloud.enabled;
    (cloud.enabled ? login : guest).dataset.first = '';
    box.append(login, signup, guest);
    box.append(el('p', 'fd-note', cloud.enabled
      ? 'An account is just a name and a password: no email needed. It lets you play the same worlds on your phone, tablet and computer. Guests keep their worlds in this browser.'
      : 'Accounts are not set up for this copy of the game. As a guest, your worlds are kept in this browser.'));
    return box;
  }

  formScreen(make) {
    const box = el('div', 'fd-box');
    box.append(this.brand(make ? 'Create your account' : 'Welcome back'));
    const form = el('form', 'fd-form');
    form.autocomplete = 'on';
    const field = (type, placeholder, auto) => {
      const input = el('input');
      Object.assign(input, { type, placeholder, autocomplete: auto, required: true });
      if (type === 'password') input.minLength = 8;
      form.append(input);
      return input;
    };
    const name = field('text', make ? 'Choose a name' : 'Name', 'username');
    name.dataset.first = '';
    name.maxLength = 64;
    name.spellcheck = false;
    name.autocapitalize = 'off';
    const pass = field('password', 'Password (8 or more)', make ? 'new-password' : 'current-password');
    const again = make ? field('password', 'Password again', 'new-password') : null;
    const note = el('p', 'fd-note');
    note.setAttribute('role', 'status');
    // there is no email to send a reset link to, so say so before the password is chosen
    if (make) note.textContent = 'Your name is 3 to 20 letters, numbers or underscores. Keep your password safe: with no email on the account, a forgotten one cannot be reset from here.';
    const submit = el('button', 'fd-btn primary', make ? 'Create account' : 'Log in');
    submit.type = 'submit';
    form.append(submit, note);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (this.busy) return;
      const who = name.value.trim();
      if (make && !NAME_RULE.test(who)) return void (note.textContent = 'A name is 3 to 20 letters, numbers or underscores, with no spaces.');
      if (again && again.value !== pass.value) return void (note.textContent = 'The two passwords are not the same.');
      this.busy = true;
      submit.disabled = true;
      note.textContent = make ? 'Creating your account…' : 'Logging in…';
      const result = await (make ? createAccount(who, pass.value) : signIn(who, pass.value));
      this.busy = false;
      submit.disabled = false;
      if (this.screen !== (make ? 'signup' : 'login')) return; // they went back while it was working
      note.textContent = result.message;
      if (!result.ok) return;
      entry.set('account');
      this.show('title');
      this.reconcile();
    });
    box.append(form);
    box.append(button('fd-link', make ? 'I already have an account' : 'I need an account', () => this.show(make ? 'login' : 'signup')));
    box.append(button('fd-link', 'Back', () => this.show('account')));
    return box;
  }

  // After signing in, this device and the account may each hold a different world in this slot.
  // Nothing is uploaded on its own until the player has said which one to keep.
  async reconcile() {
    const { game, hasWorld } = this.hooks, slot = currentSlot();
    cloud.hold = true;
    const row = await fetchWorld(slot);
    const keepLocal = () => {
      cloud.hold = false;
      if (hasWorld) syncWorld(game, slot);
    };
    if (!row || (hasWorld && row.data?.seed === game.seed)) return void keepLocal();
    const when = new Date(row.updated_at).toLocaleString();
    const load = await ask(hasWorld ? {
      title: 'Which world do you want here?',
      text: `Your account has World ${slot} from day ${row.day}, level ${row.level}, saved ${when}. Load it onto this device? Choosing "Keep this one" will replace the account's copy with the world on this device.`,
      yes: 'Load my account\'s world', no: 'Keep this one',
    } : {
      title: 'Your account has a world',
      text: `World ${slot} on your account is on day ${row.day}, level ${row.level}, saved ${when}. Load it onto this device?`,
      yes: 'Load it', no: 'Not now',
    });
    if (load && writeRaw(row.data)) {
      this.hooks.beforeLeave(true);
      location.reload();
      return;
    }
    keepLocal();
  }

  // ---------- title ----------
  titleScreen() {
    const box = el('div', 'fd-box'), { hasWorld } = this.hooks;
    box.append(this.brand('A cozy voxel survival game'));
    if (hasWorld) {
      const go = button('fd-btn primary two-line', '', () => this.hooks.onContinue());
      go.append(el('b', '', 'Continue'), el('span', '', `World ${currentSlot()} · ${describeSlot(slotInfo(currentSlot()))}`));
      go.dataset.first = '';
      box.append(go);
    }
    const fresh = button('fd-btn' + (hasWorld ? '' : ' primary'), 'New Game', () => this.newGame());
    if (!hasWorld) fresh.dataset.first = '';
    box.append(fresh, button('fd-btn', 'Load World', () => this.show('load')), button('fd-btn', 'Settings', () => this.hooks.onSettings()));
    this.chip = el('div', 'fd-chip');
    box.append(this.chip);
    this.paintChip();
    return box;
  }

  paintChip() {
    if (!this.chip || this.screen !== 'title') return;
    const who = el('span', '', cloud.account ? 'Signed in as ' + cloud.account : 'Playing as a guest');
    const act = cloud.account
      ? button('fd-link', 'Sign out', async () => {
        await signOut();
        entry.set(null);
        this.show('account');
      })
      : button('fd-link', cloud.enabled ? 'Log in or sign up' : 'About accounts', () => this.show('account'));
    this.chip.replaceChildren(who, act);
  }

  // ---------- load a world ----------
  loadScreen() {
    const box = el('div', 'fd-box wide');
    box.append(el('h2', '', 'Load World'), el('p', 'fd-note', 'Three separate worlds, saved in this browser as you play.'));
    for (let n = 1; n <= SLOTS; n++) {
      const info = slotInfo(n), current = n === currentSlot() && this.hooks.hasWorld;
      const row = el('div', 'fd-slot' + (current ? ' current' : '') + (info ? '' : ' empty'));
      const text = el('div', 'fd-slot-text');
      text.append(el('b', '', `World ${n}`));
      if (info) {
        text.append(el('span', '', describeSlot(info)), el('i', '', `${WORLD_TYPES[info.worldType]?.name ?? 'Classic Continents'} · ${difficultyName(info.difficulty)}`));
      } else text.append(el('span', '', 'Empty'));
      row.append(text);
      if (info) {
        const play = button('fd-btn small primary', current ? 'Continue' : 'Play', () => {
          if (current) return void this.hooks.onContinue();
          this.hooks.beforeLeave(false);
          setSlot(n);
          playAfterReload();
          location.reload();
        });
        if (current) play.dataset.first = '';
        row.append(play, button('fd-btn small danger', 'Delete', async () => {
          if (!await ask({ title: `Delete World ${n}?`, text: `${describeSlot(info)}. Everything in it will be gone: your base, items and progress. This cannot be undone.`, yes: 'Delete it', no: 'Keep it', danger: true })) return;
          clearSave(n);
          if (n === currentSlot()) {
            this.hooks.beforeLeave(true);
            location.reload();
          } else this.show('load');
        }));
      } else row.append(button('fd-btn small', 'New game here', () => this.newGame(n)));
      box.append(row);
    }
    box.append(button('fd-link', 'Back', () => this.show('title')));
    return box;
  }

  // ---------- new game ----------
  // slot: where the new world will be saved; the first empty one unless told.
  newGame(slot = null) {
    let free = null;
    for (let n = SLOTS; n >= 1; n--) if (!slotInfo(n)) free = n;
    this.draft = {
      slot: slot ?? free ?? currentSlot(),
      character: { name: randomName(), cls: 'forager', look: normalizeLook(settings.look) },
      base: 'standard', // the difficulty the rules started from
      rules: { ...DIFFICULTIES.standard.rules },
      worldType: 'continents',
      seed: seedFrom(''),
      seedText: '',
    };
    this.step = 0;
    this.show('wizard');
  }

  wizardScreen() {
    const box = el('div', 'fd-wizard');
    this.stepBar = el('ol', 'fd-steps');
    this.stepBody = el('div', 'fd-step');
    const foot = el('div', 'fd-foot');
    this.backButton = button('fd-btn small', 'Back', () => this.back());
    this.nextButton = button('fd-btn small primary', 'Next', () => (this.step === STEPS.length - 1 ? this.begin() : this.goStep(this.step + 1)));
    foot.append(this.backButton, this.nextButton);
    box.append(this.stepBar, this.stepBody, foot);
    this.goStep(this.step);
    return box;
  }

  goStep(n) {
    this.step = n;
    this.stepBar.replaceChildren(...STEPS.map((name, i) => {
      const li = el('li', i === n ? 'active' : i < n ? 'done' : '');
      const b = button('', '', () => this.goStep(i));
      b.append(el('b', '', String(i + 1)), el('span', '', name));
      li.append(b);
      return li;
    }));
    this.backButton.textContent = n === 0 ? 'Cancel' : 'Back';
    this.nextButton.textContent = n === STEPS.length - 1 ? 'Begin adventure' : 'Next';
    this.stepBody.dataset.step = STEPS[n].toLowerCase();
    this.stepBody.replaceChildren(...[() => this.characterStep(), () => this.difficultyStep(), () => this.worldStep(), () => this.rulesStep(), () => this.summaryStep()][n]());
    this.stepBody.scrollTop = 0;
  }

  heading(title, lead) {
    const head = el('div', 'fd-head');
    head.append(el('h2', '', title), el('p', 'fd-note', lead));
    return head;
  }

  characterStep() {
    const host = el('div', 'creator-host');
    this.hooks.creator.mount(host, { character: this.draft.character, withClass: true });
    return [this.heading('Who are you?', 'Name your character, choose how they look and what they were before they came here.'), host];
  }

  difficultyStep() {
    const d = this.draft, grid = el('div', 'fd-cards');
    const chosen = presetOf(d.rules);
    for (const [id, preset] of Object.entries(DIFFICULTIES)) {
      const card = button('fd-card' + (chosen === id ? ' active' : ''), '', () => {
        d.base = id;
        d.rules = { ...preset.rules };
        this.goStep(this.step);
      });
      const list = el('ul');
      for (const line of ruleLines(preset.rules)) list.append(el('li', '', line));
      card.append(el('b', '', preset.name), el('span', '', preset.text), list);
      grid.append(card);
    }
    const out = [this.heading('How hard should it be?', 'This sets the rules of the world. You can fine-tune every one of them two steps on.'), grid];
    if (chosen === 'custom') out.push(el('p', 'fd-note', 'You have custom rules set. Choosing a difficulty here replaces them.'));
    return out;
  }

  worldStep() {
    const d = this.draft, grid = el('div', 'fd-cards worlds');
    const canvases = [];
    for (const [id, type] of Object.entries(WORLD_TYPES)) {
      const card = button('fd-card world' + (d.worldType === id ? ' active' : ''), '', () => {
        d.worldType = id;
        for (const other of grid.children) other.classList.toggle('active', other === card);
      });
      const canvas = el('canvas');
      canvas.width = canvas.height = PREVIEW;
      canvases.push([id, canvas]);
      const text = el('div');
      text.append(el('b', '', type.name), el('span', '', type.text));
      card.append(canvas, text);
      grid.append(card);
    }
    const seedRow = el('div', 'fd-seed');
    const input = el('input');
    Object.assign(input, { type: 'text', maxLength: 32, placeholder: 'Type anything for a seed, or leave empty', value: d.seedText, autocomplete: 'off', spellcheck: false });
    const label = el('span', '', 'Seed ' + d.seed);
    const redraw = () => {
      label.textContent = 'Seed ' + d.seed;
      this.drawPreviews(canvases, d.seed);
    };
    let timer = 0;
    input.addEventListener('input', () => {
      d.seedText = input.value;
      clearTimeout(timer);
      // a typed seed is used as it stands; an emptied box goes back to a random one
      timer = setTimeout(() => {
        d.seed = seedFrom(d.seedText);
        redraw();
      }, 350);
    });
    seedRow.append(input, button('fd-btn small', 'Reroll', () => {
      d.seedText = input.value = '';
      d.seed = seedFrom('');
      redraw();
    }), label);
    this.drawPreviews(canvases, d.seed);
    return [this.heading('What kind of world?', 'Each map shows the world this seed would make: the same seed and type always give the same world.'), grid, seedRow];
  }

  // Thumbnails are worked out one at a time, so the screen never stalls while eight worlds are surveyed.
  drawPreviews(canvases, seed) {
    const job = ++this.previewJob;
    canvases.forEach(([type, canvas], i) => {
      const key = seed + ':' + type;
      const paint = () => {
        if (job !== this.previewJob || !canvas.isConnected) return;
        if (!this.previews.has(key)) {
          if (this.previews.size > 64) this.previews.clear();
          this.previews.set(key, previewPixels(seed, type, PREVIEW));
        }
        canvas.getContext('2d').putImageData(new ImageData(this.previews.get(key), PREVIEW, PREVIEW), 0, 0);
        canvas.classList.remove('pending');
      };
      if (this.previews.has(key)) return void requestAnimationFrame(paint);
      canvas.classList.add('pending');
      setTimeout(paint, 40 + i * 30);
    });
  }

  rulesStep() {
    const d = this.draft, list = el('div', 'fd-rules');
    const badge = el('span', 'fd-badge');
    const paintBadge = () => {
      const id = presetOf(d.rules);
      badge.textContent = id === 'custom' ? 'Custom' : DIFFICULTIES[id].name;
      badge.classList.toggle('custom', id === 'custom');
      reset.hidden = id !== 'custom';
    };
    const reset = button('fd-btn small', '', () => {
      d.rules = { ...DIFFICULTIES[d.base].rules };
      this.goStep(this.step);
    });
    reset.textContent = `Reset to ${DIFFICULTIES[d.base].name}`;
    for (const field of RULE_FIELDS) {
      const row = el('div', 'fd-rule');
      const text = el('div', 'fd-rule-text');
      text.append(el('b', '', field.name), el('span', '', field.text));
      const control = el('div', 'fd-rule-control');
      if (field.toggle) {
        const paint = (b) => {
          b.textContent = d.rules[field.key] ? 'On' : 'Off';
          b.classList.toggle('active', d.rules[field.key]);
          b.setAttribute('aria-pressed', String(d.rules[field.key]));
        };
        const b = button('fd-toggle', '', () => {
          d.rules[field.key] = !d.rules[field.key];
          paint(b);
          paintBadge();
        });
        paint(b);
        control.append(b);
      } else if (field.choices) {
        for (const [value, label] of field.choices) {
          const b = button('style' + (d.rules[field.key] === value ? ' active' : ''), label, () => {
            d.rules[field.key] = value;
            for (const other of control.children) other.classList.toggle('active', other === b);
            paintBadge();
          });
          control.append(b);
        }
      } else {
        const input = el('input'), value = el('output', '', d.rules[field.key] + field.unit);
        Object.assign(input, { type: 'range', min: field.min, max: field.max, step: field.step, value: d.rules[field.key] });
        input.setAttribute('aria-label', field.name);
        input.addEventListener('input', () => {
          d.rules[field.key] = Number(input.value);
          value.textContent = d.rules[field.key] + field.unit;
          paintBadge();
        });
        control.append(input, value);
      }
      row.append(text, control);
      list.append(row);
    }
    const head = this.heading('Fine-tune the rules', 'Optional. Change anything you like; it only applies to this world.');
    const status = el('div', 'fd-rules-status');
    status.append(badge, reset);
    head.append(status);
    paintBadge();
    return [head, list];
  }

  summaryStep() {
    const d = this.draft, c = d.character, cls = CLASSES[c.cls];
    c.name = cleanName(c.name);
    const grid = el('div', 'fd-summary');
    const card = (title, step) => {
      const box = el('div', 'fd-sum');
      const head = el('div', 'fd-sum-head');
      head.append(el('h3', '', title), button('fd-link', 'Change', () => this.goStep(step)));
      box.append(head);
      grid.append(box);
      return box;
    };
    const who = card('Character', 0), face = el('canvas', 'fd-face');
    face.width = face.height = 16;
    drawFace(c.look, face);
    const whoText = el('div');
    whoText.append(el('b', '', c.name), el('span', '', cls ? `${cls.name} · ${cls.text}` : 'No class'));
    const whoRow = el('div', 'fd-sum-row');
    whoRow.append(face, whoText);
    who.append(whoRow);

    const world = card('World', 2), map = el('canvas', 'fd-map');
    map.width = map.height = PREVIEW;
    this.drawPreviews([[d.worldType, map]], d.seed);
    const worldText = el('div');
    worldText.append(el('b', '', WORLD_TYPES[d.worldType].name), el('span', '', 'Seed ' + d.seed));
    const worldRow = el('div', 'fd-sum-row');
    worldRow.append(map, worldText);
    world.append(worldRow);

    const id = presetOf(d.rules), rules = card('Rules · ' + difficultyName(id), id === 'custom' ? 3 : 1), lines = el('ul');
    for (const line of ruleLines(d.rules)) lines.append(el('li', '', line));
    rules.append(lines);

    const slots = el('div', 'fd-sum wide'), row = el('div', 'fd-slots'), warn = el('p', 'fd-note');
    const paint = () => {
      row.replaceChildren();
      for (let n = 1; n <= SLOTS; n++) {
        const info = slotInfo(n);
        const b = button('fd-card save-slot' + (d.slot === n ? ' active' : ''), '', () => {
          d.slot = n;
          paint();
        });
        b.append(el('b', '', `World ${n}`), el('span', '', info ? describeSlot(info) : 'Empty'));
        row.append(b);
      }
      const taken = slotInfo(d.slot);
      warn.textContent = taken ? `World ${d.slot} already holds a world (${describeSlot(taken)}). Starting here deletes it.` : '';
      warn.classList.toggle('warn', !!taken);
    };
    paint();
    slots.append(el('h3', '', 'Save it as'), row, warn);
    grid.append(slots);
    return [this.heading('Ready?', `${c.name} is about to wake in a new world.`), grid];
  }

  async begin() {
    const d = this.draft, taken = slotInfo(d.slot);
    if (taken && !await ask({ title: `Replace World ${d.slot}?`, text: `${describeSlot(taken)} will be deleted, and this new world takes its place. This cannot be undone.`, yes: 'Replace it', no: 'Keep it', danger: true })) return;
    d.character.name = cleanName(d.character.name);
    const setup = { slot: d.slot, seed: d.seed, worldType: d.worldType, difficulty: presetOf(d.rules), rules: d.rules, character: d.character };
    if (!stashNewGame(setup)) return void ask({ title: 'Could not start', text: 'This browser is not letting the game store anything, so a new world cannot be made.' });
    // the look just made is where the next new character starts from
    settings.look = { ...d.character.look };
    saveSettings();
    // the world being left is saved first, unless it is the very one being replaced
    this.hooks.beforeLeave(d.slot === currentSlot());
    clearSave(d.slot);
    setSlot(d.slot);
    location.reload();
  }
}
