const clamp = value => Math.max(-1, Math.min(1, value));
const axis = value => Math.abs(value ?? 0) > 0.18 ? value : 0;

// The D-pad follows the same tab order as the keyboard. Left/right adjust the focused setting.
export function navigatePanel(root, delta, adjust, accept) {
  const controls = [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), select, .slot')]
    .filter(el => el.getClientRects().length);
  if (!controls.length) return;
  let index = controls.indexOf(document.activeElement);
  if (delta || index < 0) {
    index = index < 0 ? 0 : (index + delta + controls.length) % controls.length;
    const el = controls[index];
    if (el.matches('.slot')) el.tabIndex = -1;
    el.focus();
    el.scrollIntoView({ block: 'nearest' });
  }
  const el = controls[index];
  if (el.tagName === 'SELECT' && (adjust || accept)) {
    el.selectedIndex = (el.selectedIndex + (adjust || 1) + el.length) % el.length;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el.type === 'range' && adjust) {
    if (adjust > 0) el.stepUp(); else el.stepDown();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (accept) {
    if (el.matches('.slot')) el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    else el.click();
    if (!el.isConnected) {
      const fresh = [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), select, .slot')]
        .filter(node => node.getClientRects().length)[index];
      if (fresh) { fresh.tabIndex = -1; fresh.focus(); }
    }
  }
}

// buttons that act for as long as a finger rests on them
const HELD = ['jump', 'sprint', 'strike', 'camLeft', 'camRight', 'zoomIn', 'zoomOut'];

export function installControllers(canvas, actions) {
  const controls = document.querySelector('#touch-controls');
  const stick = document.querySelector('#walk-stick');
  const touches = new Map();
  const held = new Set();
  let walkX = 0, walkY = 0, stickId = null, previous = [], previousPad = null;
  const state = { x: 0, y: 0, jump: false, sprint: false, strike: false, turn: 0, zoom: 0 };
  const resetStick = () => {
    stickId = null;
    walkX = walkY = 0;
    stick.style.setProperty('--sx', '0px'); stick.style.setProperty('--sy', '0px');
  };
  const moveStick = e => {
    if (e.pointerId !== stickId) return;
    const b = stick.getBoundingClientRect();
    const x = (e.clientX - b.left - b.width / 2) / (b.width * 0.35);
    const y = (e.clientY - b.top - b.height / 2) / (b.height * 0.35);
    const len = Math.max(1, Math.hypot(x, y));
    walkX = axis(x / len); walkY = axis(y / len);
    stick.style.setProperty('--sx', walkX * 22 + 'px'); stick.style.setProperty('--sy', walkY * 22 + 'px');
  };
  stick.addEventListener('pointerdown', e => {
    if (stickId !== null) return;
    stickId = e.pointerId; stick.setPointerCapture(stickId); moveStick(e);
  });
  stick.addEventListener('pointermove', moveStick);
  stick.addEventListener('lostpointercapture', e => { if (e.pointerId === stickId) resetStick(); });
  for (const button of controls.querySelectorAll('[data-action]')) {
    const name = button.dataset.action;
    if (HELD.includes(name)) {
      button.addEventListener('pointerdown', e => {
        button.setPointerCapture(e.pointerId);
        held.add(name);
        if (name === 'strike') actions.command('strike');
      });
      button.addEventListener('lostpointercapture', () => held.delete(name));
    } else button.addEventListener('click', () => actions.command(name));
  }
  // One finger aims. Two fingers orbit and pinch to zoom.
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 1) actions.aim(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', e => {
    const prev = touches.get(e.pointerId);
    if (!prev) return;
    if (touches.size === 2) {
      const other = [...touches].find(([id]) => id !== e.pointerId)[1];
      const before = Math.hypot(prev[0] - other[0], prev[1] - other[1]);
      const after = Math.hypot(e.clientX - other[0], e.clientY - other[1]);
      actions.orbit((e.clientX - prev[0]) * -0.004, (e.clientY - prev[1]) * 0.003);
      actions.zoom((before - after) * 0.035);
    } else if (touches.size === 1) actions.aim(e.clientX, e.clientY);
    touches.set(e.pointerId, [e.clientX, e.clientY]);
  });
  canvas.addEventListener('lostpointercapture', e => touches.delete(e.pointerId));
  addEventListener('blur', () => { resetStick(); held.clear(); touches.clear(); });
  return {
    state,
    poll(dt, panel) {
      const pad = [...(navigator.getGamepads?.() ?? [])].find(p => p?.connected && p.mapping === 'standard');
      if (previousPad !== pad?.index) previous = [];
      previousPad = pad?.index;
      const pressed = pad?.buttons.map(b => b.pressed) ?? [];
      const edge = i => pressed[i] && !previous[i];
      if (panel) {
        if (edge(1) || edge(9)) actions.command('back');
        else if ([0, 12, 13, 14, 15].some(edge)) {
          navigatePanel(panel, Number(!!edge(13)) - Number(!!edge(12)), Number(!!edge(15)) - Number(!!edge(14)), edge(0));
        }
      } else {
        const commands = { 1: 'secondary', 2: 'interact', 3: 'inventory', 4: 'previous', 5: 'next', 7: 'strike', 8: 'map', 9: 'back', 12: 'eat', 13: 'drink' };
        for (const [i, action] of Object.entries(commands)) if (edge(i)) actions.command(action);
        if (pressed[11]) actions.orbit(-axis(pad.axes[2]) * dt * 2, axis(pad.axes[3]) * dt);
        else if (pad) actions.nudgeAim(axis(pad.axes[2]) * dt, axis(pad.axes[3]) * dt);
      }
      state.x = panel ? 0 : clamp(walkX + axis(pad?.axes[0]));
      state.y = panel ? 0 : clamp(walkY + axis(pad?.axes[1]));
      state.jump = !panel && (held.has('jump') || pressed[0]);
      state.sprint = !panel && (held.has('sprint') || pressed[6]);
      state.strike = !panel && (held.has('strike') || pressed[7]);
      // held camera buttons: turn the view and zoom while a finger stays down
      state.turn = panel ? 0 : Number(held.has('camLeft')) - Number(held.has('camRight'));
      state.zoom = panel ? 0 : Number(held.has('zoomOut')) - Number(held.has('zoomIn'));
      previous = pressed;
    },
  };
}
