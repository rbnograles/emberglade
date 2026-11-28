import { BIOMES, SHORE, WATER_COLORS, roofColour } from '../world/biomes.js';

const SIZE = 132; // canvas pixels
const CELLS = 44; // tiles sampled across
const STEP = 3; // world tiles per cell: the map shows a 132 x 132 tile area
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// North-up map of the land around the player. An arrow shows which way the character faces and a
// faint wedge shows where the camera looks. Home, a dropped pack, vehicles, creatures and the
// player's own markers are drawn on it; anything off the map is pinned to its edge.
export class Minimap {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('minimap');
    this.canvas.width = this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d');
    this.label = document.getElementById('home-label');
  }

  // World position under a point of the canvas, given in CSS pixels from its top-left corner.
  worldAt(cssX, cssY) {
    const p = this.game.player, span = CELLS * STEP, shown = this.canvas.getBoundingClientRect().width;
    return [p.x + (cssX / shown - 0.5) * span, p.z + (cssY / shown - 0.5) * span];
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

  // The player's own markers are diamonds, so they never look like anything else on the map.
  pin(wx, wz, color) {
    const [x, y, off] = this.place(wx, wz), c = this.ctx, r = off ? 5 : 6.5;
    c.fillStyle = color;
    c.strokeStyle = '#ffffff';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(x, y - r);
    c.lineTo(x + r, y);
    c.lineTo(x, y + r);
    c.lineTo(x - r, y);
    c.closePath();
    c.fill();
    c.stroke();
  }

  square(wx, wz, color) {
    const [x, y, off] = this.place(wx, wz), c = this.ctx, r = off ? 3.5 : 4.5;
    c.fillStyle = color;
    c.strokeStyle = '#2b2b33';
    c.lineWidth = 1.5;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.strokeRect(x - r, y - r, r * 2, r * 2);
  }

  // camYaw: where the camera looks from. facing: the way the character is turned.
  draw(camYaw, facing) {
    const g = this.game, p = g.player, c = this.ctx;
    // look for the nearest settlements now and then, not on every draw
    if (!this.nearest || Math.hypot(p.x - this.lookedAt.x, p.z - this.lookedAt.z) > 24) {
      this.lookedAt = { x: p.x, z: p.z };
      this.nearest = {};
      for (const st of g.gen.settlementsNear(p.x, p.z, 420)) {
        const d = Math.hypot(st.x - p.x, st.z - p.z), best = this.nearest[st.kind];
        if (!best || d < Math.hypot(best.x - p.x, best.z - p.z)) this.nearest[st.kind] = st;
      }
    }
    const cell = SIZE / CELLS;
    const ox = Math.floor(p.x) - (CELLS / 2) * STEP, oz = Math.floor(p.z) - (CELLS / 2) * STEP;
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        const t = g.gen.tile(ox + i * STEP, oz + j * STEP);
        // sea is darker the deeper it gets
        const sea = t.boiling ? 0xb0502e : t.salt ? (t.bed < -5 ? 0x3d7fbd : t.bed < -1.2 ? 0x4f9fd6 : 0x74bfe8) : WATER_COLORS[0];
        // seen from above, an arch or an overhang shows the top of its rock
        c.fillStyle = hex(roofColour(t) ?? (t.water ? sea : t.lava ? 0xff7a1a : t.ice ? 0xbfe6f5 : t.shore ? SHORE.ground[0] : BIOMES[t.biome].ground[(i + j) & 1]));
        c.fillRect(i * cell, j * cell, cell + 0.5, cell + 0.5);
      }
    }
    const home = p.bed ?? p.spawn;
    this.marker(home.x + 0.5, home.z + 0.5, '#ffd24a');
    if (p.lost) this.marker(p.lost.x + 0.5, p.lost.z + 0.5, '#ff4a4a');
    for (const e of g.enemies) this.marker(e.x, e.z, '#7a4fd0');
    for (const v of g.vehicles) if (v.id !== p.riding) this.marker(v.x, v.z, '#ff9a3a'); // where you left your boat
    // the nearest village and castle, as squares: gold for a village, grey for a castle
    for (const kind of ['village', 'castle']) {
      const st = this.nearest[kind];
      if (st) this.square(st.x, st.z, kind === 'village' ? '#f2c94c' : '#c9c9d6');
    }
    for (const m of g.markers) this.pin(m.x, m.z, m.color);

    const mid = SIZE / 2;
    // the camera's view: a faint wedge opening away from where the camera stands
    const look = Math.atan2(-Math.cos(camYaw), -Math.sin(camYaw));
    c.fillStyle = 'rgba(255, 255, 255, 0.22)';
    c.beginPath();
    c.moveTo(mid, mid);
    c.arc(mid, mid, 26, look - 0.5, look + 0.5);
    c.closePath();
    c.fill();

    // the player: an arrow pointing the way the character faces
    c.save();
    c.translate(mid, mid);
    c.rotate(Math.atan2(Math.cos(facing), Math.sin(facing)) + Math.PI / 2);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#2b2b33';
    c.lineWidth = 2;
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(0, -9);
    c.lineTo(6.5, 7);
    c.lineTo(0, 3.5);
    c.lineTo(-6.5, 7);
    c.closePath();
    c.stroke();
    c.fill();
    c.restore();

    const dist = (x, z) => Math.round(Math.hypot(x - p.x, z - p.z));
    let text = `${p.bed ? 'Bed' : 'Start'} ${dist(home.x + 0.5, home.z + 0.5)} m`;
    if (p.lost) text += ` · pack ${dist(p.lost.x, p.lost.z)} m`;
    if (g.markers.length) text += ` · marker ${Math.min(...g.markers.map((m) => dist(m.x, m.z)))} m`;
    if (this.label.textContent !== text) this.label.textContent = text;
  }
}
