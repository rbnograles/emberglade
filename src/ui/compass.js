import { KEEPER_BY_ID } from '../game/keepers.js';

const H = 38; // height of the strip in CSS pixels
const SPAN = Math.PI; // how much of the horizon a full-width strip shows: half a turn
const WIDE = 420; // CSS pixels across that span
const RAD = WIDE / SPAN; // pixels per radian of bearing
const TURN = Math.PI * 2;
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// A strip across the top of the screen showing which way the camera looks. North is the top of the
// maps. The marks and letters are painted once onto a long tape, two full turns of the horizon, and
// turning the view only slides that tape sideways. The browser moves it without redrawing, so the
// motion is as smooth as the camera's own. Home, the player's markers and found keepers are small
// pips that slide along the top edge; anything behind you waits at the nearer end.
export class Compass {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('compass');
    this.tape = document.createElement('canvas');
    this.tape.className = 'tape';
    this.root.append(this.tape);
    this.pips = []; // pooled <i> elements
    this.paint();
    this.measure();
    addEventListener('resize', () => this.measure());
  }

  measure() { this.mid = (this.root.clientWidth || WIDE) / 2; }

  // The tape runs from one half-turn before north to three half-turns after it: bearing b sits at (b + PI) * RAD.
  paint() {
    const dpr = Math.min(devicePixelRatio || 1, 2), width = TURN * 2 * RAD;
    const c = this.tape.getContext('2d');
    this.tape.width = Math.round(width * dpr);
    this.tape.height = H * dpr;
    this.tape.style.width = width + 'px';
    this.tape.style.height = H + 'px';
    c.scale(dpr, dpr);
    c.textAlign = 'center';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let i = 0; i <= 144; i++) { // a mark every 5 degrees, over two turns
      const x = i * (Math.PI / 36) * RAD, at = (i + 36) % 72; // the tape starts half a turn before north
      const point = at % 9 === 0 ? POINTS[at / 9] : null, mid = at % 3 === 0;
      c.globalAlpha = point ? 1 : mid ? 0.8 : 0.45;
      c.strokeStyle = c.fillStyle = point === 'N' ? '#ff6a6a' : '#fff6e3';
      c.lineWidth = point ? 2 : 1.5;
      c.beginPath();
      c.moveTo(x, H - 3);
      c.lineTo(x, H - (point ? 11 : mid ? 8 : 5));
      c.stroke();
      if (point) {
        c.font = `${point.length === 1 ? '700 16px' : '600 11px'} "Pixelify Sans", sans-serif`;
        // a dark edge keeps the letters readable over bright ground
        c.lineWidth = 3;
        c.strokeStyle = 'rgba(30, 24, 21, 0.85)';
        c.strokeText(point, x, H - 15);
        c.fillText(point, x, H - 15);
      }
    }
  }

  // Bearing of a world position from the player: 0 = north (-z), a quarter turn = east (+x).
  bearing(x, z) {
    const p = this.game.player;
    return Math.atan2(x - p.x, -(z - p.z));
  }

  // camYaw: the camera's angle around the player, as in main.js (the camera looks back along it).
  draw(camYaw) {
    const g = this.game, p = g.player;
    if (!this.painted && document.fonts?.status === 'loaded') {
      this.painted = true;
      this.paint(); // once more now the game's font is in, in case the first paint fell back to another
    }
    let heading = Math.atan2(-Math.sin(camYaw), Math.cos(camYaw));
    if (heading < 0) heading += TURN; // 0 .. one turn
    this.tape.style.transform = `translate3d(${this.mid - (heading + Math.PI) * RAD}px, 0, 0)`;

    // pips: clamp to the strip, slowing into its ends instead of stopping dead
    let n = 0;
    const pip = (x, z, color, diamond) => {
      let d = this.bearing(x, z) - heading;
      d -= Math.round(d / TURN) * TURN;
      const lim = Math.min(SPAN / 2, this.mid / RAD) - 0.5;
      const el = this.pips[n] ?? (this.pips[n] = this.root.appendChild(document.createElement('i')));
      n++;
      el.style.display = '';
      el.style.background = color;
      el.className = diamond ? 'diamond' : '';
      el.style.transform = `translate3d(${this.mid + lim * Math.tanh(d / lim) * RAD - 5}px, 0, 0)` + (diamond ? ' rotate(45deg)' : '');
    };
    const home = p.bed ?? p.spawn;
    if (Math.hypot(home.x + 0.5 - p.x, home.z + 0.5 - p.z) > 3) pip(home.x + 0.5, home.z + 0.5, '#ffd24a', false);
    if (p.lost) pip(p.lost.x + 0.5, p.lost.z + 0.5, '#ff4a4a', false);
    for (const [id, site] of g.encounters.sites) {
      if (g.encounters.discovered.has(id) && !g.encounters.restored.has(id) && KEEPER_BY_ID[id]) pip(site.x, site.z, '#ff6a8a', false);
    }
    for (const m of g.markers) pip(m.x, m.z, m.color, true);
    for (let i = n; i < this.pips.length; i++) this.pips[i].style.display = 'none';
  }
}
