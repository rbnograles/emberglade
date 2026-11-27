import { BIOMES, SHORE, WATER_COLORS } from '../world/biomes.js';

const SIZE = 132; // canvas pixels
const CELLS = 44; // tiles sampled across
const STEP = 3; // world tiles per cell: the map shows a 132 x 132 tile area
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// North-up map of the land around the player, with markers for home and a dropped pack
// and a line showing which way the camera is facing.
export class Minimap {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('minimap');
    this.canvas.width = this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d');
    this.label = document.getElementById('home-label');
  }

  // Marker position on the canvas, pinned to the edge when it is off the map.
  place(wx, wz) {
    const p = this.game.player, half = (CELLS * STEP) / 2, scale = SIZE / (CELLS * STEP);
    let dx = wx - p.x, dz = wz - p.z;
    const far = Math.max(Math.abs(dx), Math.abs(dz)) / (half - 4);
    if (far > 1) {
      dx /= far;
      dz /= far;
    }
    return [SIZE / 2 + dx * scale, SIZE / 2 + dz * scale, far > 1];
  }

  marker(wx, wz, color, edgeOnly = false) {
    const [x, y, off] = this.place(wx, wz);
    if (edgeOnly && !off) return;
    const c = this.ctx;
    c.fillStyle = color;
    c.strokeStyle = '#2b2b33';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x, y, off ? 4 : 5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }

  draw(camYaw) {
    const g = this.game, p = g.player, c = this.ctx;
    const cell = SIZE / CELLS;
    const ox = Math.floor(p.x) - (CELLS / 2) * STEP, oz = Math.floor(p.z) - (CELLS / 2) * STEP;
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        const t = g.gen.tile(ox + i * STEP, oz + j * STEP);
        // sea is darker the deeper it gets
        const sea = t.boiling ? 0xb0502e : t.salt ? (t.bed < -5 ? 0x3d7fbd : t.bed < -1.2 ? 0x4f9fd6 : 0x74bfe8) : WATER_COLORS[0];
        c.fillStyle = hex(t.water ? sea : t.lava ? 0xff7a1a : t.ice ? 0xbfe6f5 : t.shore ? SHORE.ground[0] : BIOMES[t.biome].ground[(i + j) & 1]);
        c.fillRect(i * cell, j * cell, cell + 0.5, cell + 0.5);
      }
    }
    const home = p.bed ?? p.spawn;
    this.marker(home.x + 0.5, home.z + 0.5, '#ffd24a');
    if (p.lost) this.marker(p.lost.x + 0.5, p.lost.z + 0.5, '#ff4a4a');
    for (const e of g.enemies) this.marker(e.x, e.z, '#7a4fd0');
    for (const v of g.vehicles) if (v.id !== p.riding) this.marker(v.x, v.z, '#ff9a3a'); // where you left your boat

    // player and the way the camera looks
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(SIZE / 2, SIZE / 2);
    c.lineTo(SIZE / 2 - Math.sin(camYaw) * 12, SIZE / 2 - Math.cos(camYaw) * 12);
    c.stroke();
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#2b2b33';
    c.beginPath();
    c.arc(SIZE / 2, SIZE / 2, 4, 0, Math.PI * 2);
    c.fill();
    c.stroke();

    const dist = Math.round(Math.hypot(home.x + 0.5 - p.x, home.z + 0.5 - p.z));
    const text = `${p.bed ? 'Bed' : 'Start'} ${dist} m` + (p.lost ? ` · pack ${Math.round(Math.hypot(p.lost.x - p.x, p.lost.z - p.z))} m` : '');
    if (this.label.textContent !== text) this.label.textContent = text;
  }
}
