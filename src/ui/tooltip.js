// One themed tooltip for the whole game, in place of the browser's own. It follows the mouse and
// fades in. An element shows a tip when it has `el.tip` (an item card: see tipFor in hud.js) or a
// `data-tip` attribute (plain text). Touch has no hover, so it never shows there.
const MOUSE = (side) => `<svg class="mouse ${side}" viewBox="0 0 14 20" aria-hidden="true"><rect x="1" y="1" width="12" height="18" rx="6"/><path class="btn" d="M7 1.7A5.3 5.3 0 0 0 1.7 7v2H7z"/><path d="M7 1v8M1 9h12"/></svg>`;
export const MOUSE_LEFT = MOUSE('l'), MOUSE_RIGHT = MOUSE('r');

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Text with LMB and RMB drawn as little mice.
export const keyed = (text) => escape(text).replace(/\bLMB\b/g, MOUSE_LEFT).replace(/\bRMB\b/g, MOUSE_RIGHT);

let box = null, anchor = null, shown = '', x = 0, y = 0, down = false;

function html(tip) {
  if (typeof tip === 'string') return `<p>${keyed(tip)}</p>`;
  let out = `<b style="${tip.color ? 'color:' + tip.color : ''}">${escape(tip.name)}${tip.count > 1 ? ` <i>×${tip.count}</i>` : ''}</b>`;
  if (tip.kind) out += `<small>${escape(tip.kind)}</small>`;
  if (tip.stats.length) out += '<dl>' + tip.stats.map(([k, v]) => `<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('') + '</dl>';
  if (tip.wear !== undefined) out += `<u><s style="width:${Math.round(tip.wear * 100)}%;background:${tip.wear > 0.5 ? '#7ad04f' : tip.wear > 0.2 ? '#f2c94c' : '#e8505b'}"></s></u>`;
  if (tip.enh) out += `<em style="color:${tip.enh.color}">◆ ${escape(tip.enh.name)}<span>${escape(tip.enh.text)}</span></em>`;
  if (tip.note) out += `<p>${keyed(tip.note)}</p>`;
  return out;
}

function hide() {
  anchor = null;
  if (box) box.classList.remove('on');
}

function place() {
  const w = box.offsetWidth, h = box.offsetHeight;
  let left = x + 16, top = y + 18;
  if (left + w > innerWidth - 8) left = x - w - 12; // flip to the other side of the cursor at an edge
  if (top + h > innerHeight - 8) top = y - h - 12;
  box.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
}

// Looks again at what is under the mouse. Call after redrawing a panel, since the element the tip
// belonged to may be gone.
export function refreshTip() {
  if (!box) return;
  const el = down ? null : document.elementFromPoint(x, y)?.closest?.('.slot, [data-tip], .has-tip');
  const tip = el && (el.tip ?? el.dataset.tip);
  if (!tip) return hide();
  const text = html(tip);
  if (text !== shown) box.innerHTML = shown = text;
  anchor = el;
  box.classList.add('on');
  place();
}

export function startTooltips() {
  if (box || typeof document === 'undefined') return;
  box = document.createElement('div');
  box.id = 'tip';
  document.body.append(box);
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX;
    y = e.clientY;
    refreshTip();
  }, true);
  // while a button is held something is being dragged or clicked: the tip gets out of the way
  addEventListener('pointerdown', () => { down = true; hide(); }, true);
  addEventListener('pointerup', (e) => { down = false; if (e.pointerType === 'mouse') refreshTip(); }, true);
  addEventListener('keydown', hide, true);
  addEventListener('wheel', hide, true);
  addEventListener('blur', hide);
  document.addEventListener('mouseleave', hide);
}
