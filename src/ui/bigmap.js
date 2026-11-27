import { BIOMES, SHORE, WATER_COLORS } from '../world/biomes.js';
import { KEEPER_BY_ID } from '../game/keepers.js';

const CELLS = 300; // map cells across
const PX = 2; // canvas pixels per cell
const ZOOMS = [2, 4, 8, 16, 32, 64]; // world tiles per cell: 600 to 19,200 tiles across // world tiles per cell: 600 to 4800 tiles across
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
    // click the map to pin a marker there; click a marker again to take it away
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.row < CELLS) return; // still drawing
      const box = this.canvas.getBoundingClientRect(), step = ZOOMS[this.zoom];
      const wx = this.centre.x + ((e.clientX - box.left) / box.width - 0.5) * CELLS * step;
      const wz = this.centre.z + ((e.clientY - box.top) / box.height - 0.5) * CELLS * step;
      this.game.toggleMarker(wx, wz, step * 5);
      this.drawMarkers();
    });
  }

  get open() { return !this.root.classList.contains('hidden'); }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  show() {
    this.root.classList.remove('hidden');
    this.game.encounters.visit(this.game, 'travel:map');
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
    this.info.textContent = `${span} × ${span} tiles · click to place or remove a marker · scroll to zoom · M or Esc to close`;
  }

  colour(t) {
    if (t.boiling) return t.bed < -5 ? 0x8a3524 : 0xb0502e; // the boiling sea
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

  // diamond: the player's own markers are diamonds, everything else a dot
  marker(wx, wz, color, label, diamond = false) {
    const [x, y] = this.toCanvas(wx, wz), c = this.ctx, max = CELLS * PX - 8;
    const cx = Math.max(8, Math.min(max, x)), cy = Math.max(8, Math.min(max, y));
    c.fillStyle = color;
    c.strokeStyle = diamond ? '#ffffff' : '#1c2542';
    c.lineWidth = 2;
    c.beginPath();
    if (diamond) {
      c.moveTo(cx, cy - 8);
      c.lineTo(cx + 8, cy);
      c.lineTo(cx, cy + 8);
      c.lineTo(cx - 8, cy);
      c.closePath();
    } else c.arc(cx, cy, 6, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.font = 'bold 12px sans-serif';
    c.lineWidth = 3;
    c.strokeStyle = '#1c2542';
    // near the right edge the label goes to the left of its dot, so it is never cut off
    const left = cx + 9 + c.measureText(label).width > CELLS * PX;
    c.textAlign = left ? 'right' : 'left';
    c.strokeText(label, cx + (left ? -9 : 9), cy + 4);
    c.fillStyle = '#ffffff';
    c.fillText(label, cx + (left ? -9 : 9), cy + 4);
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
    // finished: keep the bare terrain, so markers can be redrawn without generating it again
    this.terrain = c.getImageData(0, 0, CELLS * PX, CELLS * PX);
    this.drawMarkers();
  }

  drawMarkers() {
    const g = this.game, p = g.player, c = this.ctx;
    c.putImageData(this.terrain, 0, 0);
    for (const v of g.vehicles) this.marker(v.x, v.z, '#ff9a3a', v.kind === 'boat' ? 'Boat' : 'Submarine');
    if (p.lost) this.marker(p.lost.x + 0.5, p.lost.z + 0.5, '#ff4a4a', 'Dropped pack');
    this.marker(p.spawn.x + 0.5, p.spawn.z + 0.5, '#b9e89a', 'Start');
    if (p.bed) this.marker(p.bed.x + 0.5, p.bed.z + 0.5, '#ffd24a', 'Bed');
    // the two harsh regions are named where their hearts lie
    this.marker(g.gen.frostCentre.x, g.gen.frostCentre.z, '#bfe6f5', 'Frozen Wastes');
    this.marker(g.gen.heatCentre.x, g.gen.heatCentre.z, '#ff7a1a', 'Volcanic Lands');
    // keepers: a grey "?" bearing until you find the site, then its name, then a gold tick once restored
    for (const [id, site] of g.encounters.sites) {
      const k = KEEPER_BY_ID[id];
      if (g.encounters.restored.has(id)) this.marker(site.x, site.z, '#ffd24a', k.site + ' ✓');
      else if (g.encounters.discovered.has(id)) this.marker(site.x, site.z, '#ff6a8a', k.name);
      else this.marker(site.x, site.z, '#9a92a6', '? ' + k.habitat);
    }
    g.markers.forEach((m, i) => this.marker(m.x, m.z, m.color, 'Marker ' + (i + 1), true));
    this.marker(p.x, p.z, '#ffffff', 'You');
  }
}
