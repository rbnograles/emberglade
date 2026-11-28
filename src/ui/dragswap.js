// Lets a finger drag one item slot onto another. A copy of the slot follows the finger; lifting it
// over a different slot calls onDrop(thatSlotElement). A plain tap is left alone, so tapping still
// does whatever it did before. Mouse users are untouched: this only answers touch.
let ghost = null;

function showGhost(from, x, y) {
  if (!ghost) {
    ghost = document.createElement('div');
    ghost.className = 'slot drag-ghost';
    document.body.append(ghost);
  }
  if (ghost.dataset.from !== from.dataset.dragId) {
    ghost.dataset.from = from.dataset.dragId;
    ghost.replaceChildren(...[...from.children].map((c) => c.cloneNode(true)));
  }
  ghost.style.display = '';
  ghost.style.left = x + 'px';
  ghost.style.top = y + 'px';
}

let nextId = 1;

export function touchDrag(el, onDrop) {
  el.style.touchAction = 'none'; // or the browser would take the drag for a scroll
  el.dataset.dragId = String(nextId++);
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !el.firstChild) return; // nothing in the slot to drag
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const move = (m) => {
      if (m.pointerId !== e.pointerId) return;
      if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 10) return;
      moved = true;
      el.classList.add('dragging');
      showGhost(el, m.clientX, m.clientY);
    };
    const end = (u) => {
      if (u.pointerId !== e.pointerId) return;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      el.classList.remove('dragging');
      if (ghost) ghost.style.display = 'none';
      if (!moved || u.type === 'pointercancel') return;
      const target = document.elementFromPoint(u.clientX, u.clientY)?.closest('.slot');
      if (target && target !== el) onDrop(target);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  });
}
