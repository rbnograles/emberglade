import { ITEMS } from '../game/items.js';
import { ROLES } from '../game/villagers.js';
import { iconURL } from './icons.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

// The trading window: what a villager sells, what they will buy, and your coins.
// It stays open across trades and redraws after each one.
export function openTrade(game, villager) {
  document.querySelector('dialog.trade')?.remove();
  const dialog = el('dialog', 'relocation trade');
  const role = ROLES[villager.role];
  const draw = () => {
    const coins = game.inv.count('coin');
    const head = el('header');
    head.append(el('h1', '', `${villager.name} the ${role.title}`), el('span', 'where', villager.village));
    const purse = el('p', 'purse');
    const coin = el('img');
    coin.src = iconURL('coin');
    purse.append(coin, `${coins} coin${coins === 1 ? '' : 's'}`);
    const column = (title, kind, offers) => {
      const col = el('section');
      col.append(el('h2', '', title));
      offers.forEach(([item, n, price], i) => {
        const row = el('div', 'offer');
        const img = el('img');
        img.src = iconURL(item);
        const can = kind === 'sell' ? coins >= price : game.inv.has(item, n);
        const have = kind === 'buy' ? ` (you have ${game.inv.count(item)})` : '';
        row.append(img, el('b', '', `${ITEMS[item].name}${n > 1 ? ' ×' + n : ''}`), el('span', '', have));
        const button = el('button', can ? 'main' : '', kind === 'sell' ? `Buy · ${price}` : `Sell · ${price}`);
        button.disabled = !can;
        button.addEventListener('click', () => {
          if (game.villagers.trade(villager, kind, i)) draw();
        });
        row.append(button);
        col.append(row);
      });
      return col;
    };
    const lists = el('div', 'lists');
    lists.append(column('For sale', 'sell', role.sells), column('Wanted', 'buy', role.buys));
    const close = el('button', '', 'Close');
    close.addEventListener('click', () => {
      dialog.close();
      dialog.remove();
    });
    const foot = el('div', 'row-buttons');
    foot.append(close);
    dialog.replaceChildren(head, purse, lists, foot);
  };
  // typing and Esc stay in the window
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  dialog.addEventListener('cancel', () => dialog.remove());
  for (const type of ['mousedown', 'mouseup', 'wheel']) dialog.addEventListener(type, (e) => e.stopPropagation());
  document.body.append(dialog);
  draw();
  dialog.showModal();
}
