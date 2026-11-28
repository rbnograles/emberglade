import { STATS, STAT_CAP, SKILLS, BRANCHES, MAX_LEVEL, xpToNext } from '../game/progress.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

// The character sheet: level and experience, stat points to spend, and the skill tree.
export class Sheet {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('sheet');
    // clicks inside the sheet never reach the world behind it
    for (const type of ['mousedown', 'mouseup', 'wheel', 'contextmenu']) this.root.addEventListener(type, (e) => e.stopPropagation());
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.hide();
    });
  }

  get open() { return !this.root.classList.contains('hidden'); }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  show() {
    this.root.classList.remove('hidden');
    this.render();
  }

  hide() { this.root.classList.add('hidden'); }

  render() {
    if (!this.open) return;
    const g = this.game, pr = g.progress;
    const card = el('div', 'sheet-card');

    const head = el('header');
    const title = el('div', 'title');
    title.append(el('h2', '', 'Character'), el('b', 'lv', 'Level ' + pr.level));
    const xp = el('div', 'xp');
    const fill = el('span');
    const top = pr.level >= MAX_LEVEL;
    fill.style.width = (top ? 100 : (pr.xp / xpToNext(pr.level)) * 100) + '%';
    xp.append(fill);
    const close = el('button', 'chip', 'Close (K)');
    close.addEventListener('click', () => this.hide());
    head.append(title, xp, el('span', 'xp-text', top ? 'Highest level' : `${pr.xp} / ${xpToNext(pr.level)} experience`), close);
    card.append(head);

    const body = el('div', 'sheet-body');

    // ---- stats ----
    const stats = el('section', 'stats');
    stats.append(el('h3', '', 'Stats'), el('p', 'points' + (pr.statPoints ? ' have' : ''), `${pr.statPoints} point${pr.statPoints === 1 ? '' : 's'} to spend · one per level`));
    const now = {
      vitality: `${g.maxHealth} health`, endurance: `${g.maxStamina} energy`,
      hardiness: `${Math.round((1 - pr.needsScale) * 100)}% slower`, strength: `+${Math.round(pr.stats.strength * 4)}% damage`,
      agility: `+${pr.stats.agility}% speed`,
    };
    for (const [id, stat] of Object.entries(STATS)) {
      const row = el('div', 'stat');
      const text = el('div', 'text');
      const name = el('b', '', stat.name);
      name.append(el('em', '', ` ${pr.stats[id]}/${STAT_CAP}`));
      const pips = el('div', 'pips');
      const bar = el('span');
      bar.style.width = (pr.stats[id] / STAT_CAP) * 100 + '%';
      pips.append(bar);
      text.append(name, pips, el('small', '', `${stat.text} · now ${now[id]}`));
      const plus = el('button', 'plus', '+');
      plus.disabled = pr.statPoints < 1 || pr.stats[id] >= STAT_CAP;
      plus.dataset.tip ='Spend one point on ' + stat.name;
      plus.addEventListener('click', () => g.raiseStat(id));
      row.append(text, plus);
      stats.append(row);
    }
    body.append(stats);

    // ---- skill tree ----
    const tree = el('section', 'tree');
    tree.append(el('h3', '', 'Skill tree'), el('p', 'points' + (pr.skillPoints ? ' have' : ''), `${pr.skillPoints} skill point${pr.skillPoints === 1 ? '' : 's'} · one every third level`));
    const branches = el('div', 'branches');
    for (const [branch, label] of Object.entries(BRANCHES)) {
      const col = el('div', 'branch');
      col.append(el('h4', '', label));
      for (const skill of SKILLS.filter((s) => s.branch === branch)) {
        const have = pr.has(skill.id), can = pr.canLearn(skill.id), before = pr.needs(skill.id);
        const node = el('button', 'node' + (have ? ' have' : can ? ' can' : ''));
        node.disabled = !can;
        node.append(el('b', '', skill.name), el('small', '', skill.text));
        const locked = before && !pr.has(before.id);
        node.append(el('em', '', have ? 'Learned' : locked ? `Needs ${before.name}` : `${skill.cost} point${skill.cost === 1 ? '' : 's'}`));
        node.addEventListener('click', () => g.learnSkill(skill.id));
        col.append(node);
      }
      branches.append(col);
    }
    tree.append(branches);
    body.append(tree);
    card.append(body);
    card.append(el('p', 'note', 'Experience comes from gathering, crafting, building, farming, hunting, fighting, sleeping, finishing goals and restoring keepers. The highest level is ' + MAX_LEVEL + '.'));
    const scroll = this.root.querySelector('.sheet-body')?.scrollTop ?? 0;
    this.root.replaceChildren(card);
    card.querySelector('.sheet-body').scrollTop = scroll;
  }
}
