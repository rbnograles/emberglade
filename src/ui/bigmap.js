import { BIOMES, SHORE, WATER_COLORS } from '../world/biomes.js';

const CELLS = 300; // map cells across
const PX = 2; // canvas pixels per cell
const ZOOMS = [2, 4, 8, 16]; // world tiles per cell: 600 to 4800 tiles across
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// Full-screen map of the world around the player. The terrain is generated from the seed, so it can
// show land and sea you have never visited. Drawn a few rows per frame to keep the game responsive.
export class BigMap {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('bigmap');
    this.canvas = this.root.querySelector('canvas');
    this.canvas.width = this.canvas.height = CELLS * PX;
    this.ctx = this.canvas.getContext('2d');
    this.info = this.root.querySelector('.info');
    this.zoom = 1;
    this.row = CELLS; // next row to draw; CELLS means finished
    this.root.addEventListener('wheel', (e) => {
      e.stopPropagation();
      this.zoom = Math.max(0, Math.min(ZOOMS.length - 1, this.zoom + Math.sign(e.deltaY)));
      this.start();
    });
    this.root.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.target === this.root) this.hide();
    });
  }

  get open() { return !this.root.classList.contains('hidden'); }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  show() {
    this.root.classList.remove('hidden');
    this.start();
  }

  hide() { this.root.classList.add('hidden'); }

  start() {
    const p = this.game.player;
    this.centre = { x: Math.floor(p.x), z: Math.floor(p.z) };
    this.row = 0;
    this.ctx.fillStyle = '#1c2542';
    this.ctx.fillRect(0, 0, CELLS * PX, CELLS * PX);
    const span = CELLS * ZOOMS[this.zoom];
    this.info.textContent = `${span} × ${span} tiles · scroll to zoom · M or Esc to close`;
  }

  colour(t) {
    if (t.salt) return t.bed < -12 ? 0x24558f : t.bed < -7 ? 0x2f6aa8 : t.bed < -3 ? 0x3d7fbd : t.bed < -1.2 ? 0x4f9fd6 : 0x74bfe8;
    if (t.lava) return 0xff7a1a;
    if (t.ice) return 0xbfe6f5;
    if (t.water) return WATER_COLORS[0];
    if (t.shore) return SHORE.ground[0];
    const c = BIOMES[t.biome].ground[0];
    if (t.biome !== 'mountain') return c;
    // mountains darken with height so the ranges read as relief
    const k = Math.max(0.45, 1 - t.h / 40);
    return (((c >> 16) * k) << 16) | ((((c >> 8) & 255) * k) << 8) | ((c & 255) * k);
  }

  toCanvas(wx, wz) {
    const step = ZOOMS[this.zoom];
    return [((wx - this.centre.x) / step + CELLS / 2) * PX, ((wz - this.centre.z) / step + CELLS / 2) * PX];
  }

  marker(wx, wz, color, label) {
    const [x, y] = this.toCanvas(wx, wz), c = this.ctx, max = CELLS * PX - 8;
    const cx = Math.max(8, Math.min(max, x)), cy = Math.max(8, Math.min(max, y));
    c.fillStyle = color;
    c.strokeStyle = '#1c2542';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, 6, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.font = 'bold 12px sans-serif';
    c.lineWidth = 3;
    c.strokeText(label, cx + 9, cy + 4);
    c.fillStyle = '#ffffff';
    c.fillText(label, cx + 9, cy + 4);
  }

  // Call every frame while open.
  update() {
    if (!this.open || this.row >= CELLS) return;
    const g = this.game, step = ZOOMS[this.zoom], c = this.ctx;
    const end = Math.min(CELLS, this.row + 12);
    for (let j = this.row; j < end; j++) {
      const wz = this.centre.z + (j - CELLS / 2) * step;
      for (let i = 0; i < CELLS; i++) {
        c.fillStyle = hex(this.colour(g.gen.tile(this.centre.x + (i - CELLS / 2) * step, wz)));
        c.fillRect(i * PX, j * PX, PX, PX);
      }
    }
    this.row = end;
    if (this.row < CELLS) return;
    // finished: draw the markers on top
    const p = g.player;
    for (const v of g.vehicles) this.marker(v.x, v.z, '#ff9a3a', v.kind === 'boat' ? 'Boat' : 'Submarine');
    if (p.lost) this.marker(p.lost.x + 0.5, p.lost.z + 0.5, '#ff4a4a', 'Dropped pack');
    this.marker(p.spawn.x + 0.5, p.spawn.z + 0.5, '#b9e89a', 'Start');
    if (p.bed) this.marker(p.bed.x + 0.5, p.bed.z + 0.5, '#ffd24a', 'Bed');
    this.marker(p.x, p.z, '#ffffff', 'You');
  }
}
