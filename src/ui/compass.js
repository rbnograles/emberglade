import { KEEPER_BY_ID } from '../game/keepers.js';

const W = 420, H = 38; // canvas size in CSS pixels
const SPAN = Math.PI; // how much of the horizon the strip shows: half a turn
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// A strip across the top of the screen showing which way the camera looks. North is the top of the
// maps. Home, the player's markers and the keepers they have found ride along it at their bearing;
// anything outside the strip waits at the nearer end.
export class Compass {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('compass');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = W * dpr;
    this.canvas.height = H * dpr;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
  }

  // Bearing of a world position from the player: 0 = north (-z), a quarter turn = east (+x).
  bearing(x, z) {
    const p = this.game.player;
    return Math.atan2(x - p.x, -(z - p.z));
  }

  // camYaw: the camera's angle around the player, as in main.js (the camera looks back along it).
  draw(camYaw) {
    const c = this.ctx, g = this.game, p = g.player;
    // glide toward the camera's heading the short way round, so the strip never jumps or stutters
    const goal = Math.atan2(-Math.sin(camYaw), Math.cos(camYaw));
    const now = performance.now(), dt = Math.min(0.1, (now - (this.last ?? now)) / 1000);
    this.last = now;
    this.heading ??= goal;
    let turn = goal - this.heading;
    turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
    this.heading += turn * (1 - Math.exp(-dt * 14));
    const heading = this.heading;
    // 1 in the middle of the strip, easing to 0 at its ends
    const fadeAt = (d) => {
      const k = Math.max(0, 1 - Math.abs(d) / (SPAN / 2));
      return k * k * (3 - 2 * k);
    };
    // how far round from the heading a bearing is, from -half a turn to +half a turn
    const off = (b) => {
      const d = b - heading;
      return d - Math.round(d / (Math.PI * 2)) * Math.PI * 2;
    };
    const xAt = (d) => W / 2 + (d / SPAN) * W;
    c.clearRect(0, 0, W, H);

    // fine marks, taller ones every 15 degrees, and letters at the eight points
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.lineCap = 'round';
    for (let i = 0; i < 72; i++) {
      const d = off((i * Math.PI) / 36); // a mark every 5 degrees
      if (Math.abs(d) >= SPAN / 2) continue;
      const x = xAt(d);
      const point = i % 9 === 0 ? POINTS[i / 9] : null, mid = i % 3 === 0;
      c.globalAlpha = fadeAt(d) * (point ? 1 : mid ? 0.8 : 0.45);
      c.strokeStyle = c.fillStyle = point === 'N' ? '#ff6a6a' : '#fff6e3';
      c.lineWidth = point ? 2 : 1.5;
      c.beginPath();
      c.moveTo(x, H - 3);
      c.lineTo(x, H - (point ? 11 : mid ? 8 : 5));
      c.stroke();
      if (point) {
        c.font = `${point.length === 1 ? '700 15px' : '600 11px'} "Pixelify Sans", sans-serif`;
        c.fillText(point, x, H - 15);
      }
    }
    c.globalAlpha = 1;

    // things to walk toward, clamped to the ends of the strip
    const pip = (x, z, color, diamond) => {
      // a pip slows into the end of the strip instead of stopping dead, and shrinks a little while it waits there
      const raw = off(this.bearing(x, z)), lim = SPAN / 2 - 0.5; // short of the faded ends
      const d = lim * Math.tanh(raw / lim);
      const px = xAt(d), s = 0.7 + 0.3 * fadeAt(raw * 0.8);
      c.save();
      c.translate(px, 7.5);
      c.scale(s, s);
      c.translate(-px, -7.5);
      c.fillStyle = color;
      c.strokeStyle = '#1e1815';
      c.lineWidth = 1.5;
      c.beginPath();
      if (diamond) {
        c.moveTo(px, 2);
        c.lineTo(px + 5.5, 7.5);
        c.lineTo(px, 13);
        c.lineTo(px - 5.5, 7.5);
        c.closePath();
      } else c.arc(px, 7.5, 4.5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.restore();
    };
    const home = p.bed ?? p.spawn;
    if (Math.hypot(home.x + 0.5 - p.x, home.z + 0.5 - p.z) > 3) pip(home.x + 0.5, home.z + 0.5, '#ffd24a', false);
    if (p.lost) pip(p.lost.x + 0.5, p.lost.z + 0.5, '#ff4a4a', false);
    for (const [id, site] of g.encounters.sites) {
      if (g.encounters.discovered.has(id) && !g.encounters.restored.has(id) && KEEPER_BY_ID[id]) pip(site.x, site.z, '#ff6a8a', false);
    }
    for (const m of g.markers) pip(m.x, m.z, m.color, true);

    // the centre line: straight ahead
    c.fillStyle = '#f2c94c';
    c.fillRect(W / 2 - 1, H - 12, 2, 12);
  }
}
