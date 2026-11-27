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
    const heading = Math.atan2(-Math.sin(camYaw), Math.cos(camYaw));
    // how far round from the heading a bearing is, from -half a turn to +half a turn
    const off = (b) => {
      const d = b - heading;
      return d - Math.round(d / (Math.PI * 2)) * Math.PI * 2;
    };
    const xAt = (d) => W / 2 + (d / SPAN) * W;
    c.clearRect(0, 0, W, H);

    // ticks every 15 degrees, letters at the eight points
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    for (let i = 0; i < 24; i++) {
      const d = off((i * Math.PI) / 12);
      if (Math.abs(d) > SPAN / 2) continue;
      const x = xAt(d), fade = 1 - Math.abs(d) / (SPAN / 2);
      c.globalAlpha = 0.25 + fade * 0.75;
      const point = i % 3 === 0 ? POINTS[i / 3] : null;
      c.fillStyle = point === 'N' ? '#ff6a6a' : '#fff6e3';
      c.fillRect(x - 0.75, H - (point ? 11 : 6), 1.5, point ? 9 : 4);
      if (point) {
        c.font = `${point.length === 1 ? 'bold 15px' : '11px'} "Pixelify Sans", sans-serif`;
        c.fillText(point, x, H - 14);
      }
    }
    c.globalAlpha = 1;

    // things to walk toward, clamped to the ends of the strip
    const pip = (x, z, color, diamond) => {
      const d = Math.max(-SPAN / 2, Math.min(SPAN / 2, off(this.bearing(x, z))));
      const px = Math.max(7, Math.min(W - 7, xAt(d)));
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
