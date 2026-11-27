import { currentSlot, setSlot, slotSummary, SLOTS, exportSaveData } from '../game/save.js';
import { navigatePanel } from './controllers.js';

// Wait before constructing Game: its migration changes the saved player's position and vehicles.
export function confirmRelocation(save) {
  const dialog = document.createElement('dialog');
  dialog.className = 'relocation';
  dialog.innerHTML = `<h1>New ground ahead</h1>
    <p>The terrain in this world has changed. Continuing moves you to a safe camp, clears parked vehicles, and resets your bed and dropped-pack markers. You keep your inventory and progress.</p>
    <div class="row-buttons"><button data-migrate>Move to safe ground</button><button data-export>Export original save</button></div>
    <h2>Open another world</h2><div class="row-buttons" data-slots></div>`;
  dialog.querySelector('[data-export]').onclick = () => exportSaveData(save);
  for (let i = 1; i <= SLOTS; i++) {
    if (i === currentSlot()) continue;
    const button = document.createElement('button');
    button.textContent = `World ${i} · ${slotSummary(i) ?? 'Empty'}`;
    button.onclick = () => { setSlot(i); location.reload(); };
    dialog.querySelector('[data-slots]').append(button);
  }
  document.body.append(dialog);
  dialog.addEventListener('cancel', e => e.preventDefault());
  dialog.showModal();
  // Focus the reversible choice first when navigating with keys or a controller.
  dialog.querySelector('[data-export]').focus();
  let frame, previous = [];
  const poll = () => {
    const pad = [...(navigator.getGamepads?.() ?? [])].find(p => p?.connected && p.mapping === 'standard');
    const pressed = pad?.buttons.map(b => b.pressed) ?? [];
    const edge = i => pressed[i] && !previous[i];
    if ([0, 12, 13].some(edge)) navigatePanel(dialog, Number(!!edge(13)) - Number(!!edge(12)), 0, edge(0));
    previous = pressed;
    frame = requestAnimationFrame(poll);
  };
  frame = requestAnimationFrame(poll);
  return new Promise(resolve => {
    dialog.querySelector('[data-migrate]').onclick = () => {
      cancelAnimationFrame(frame);
      dialog.close();
      dialog.remove();
      resolve();
    };
  });
}
