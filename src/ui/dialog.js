// A small question box in the game's own style, used where the browser's confirm() and alert() would be.
// Resolves true for the main button, false for the other one or Esc. Leave `no` out for a plain notice.
export function ask({ title, text, yes = 'OK', no = null, danger = false }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'relocation ask';
  const h = document.createElement('h1'), p = document.createElement('p'), row = document.createElement('div');
  h.textContent = title;
  p.textContent = text;
  row.className = 'row-buttons';
  dialog.append(h, p, row);
  return new Promise((resolve) => {
    const done = (answer) => {
      dialog.close();
      dialog.remove();
      resolve(answer);
    };
    const button = (label, answer, cls) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (cls) b.className = cls;
      b.addEventListener('click', () => done(answer));
      row.append(b);
      return b;
    };
    const cancel = no ? button(no, false) : null;
    const confirm = button(yes, true, danger ? 'danger' : 'main');
    // Esc must not reach the game, where it would also close the pause menu
    dialog.addEventListener('keydown', (e) => e.stopPropagation());
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(false);
    });
    document.body.append(dialog);
    dialog.showModal();
    // the safe choice has focus, so a stray Enter never deletes anything
    (cancel ?? confirm).focus();
  });
}
