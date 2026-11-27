import { hash2 } from '../core/noise.js';

const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
// sRGB hex -> linear [r, g, b]
export const rgb = (hex) => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// Corner offsets per direction, wound counter-clockwise seen from outside.
const FACES = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
];

// A small voxel sculpture. Colours are sRGB hex, or a function (x, y, z) -> hex.
export class Vox {
  constructor() { this.m = new Map(); }

  set(x, y, z, c) {
    this.m.set(`${x},${y},${z}`, [x, y, z, typeof c === 'function' ? c(x, y, z) : c]);
    return this;
  }

  box(x0, y0, z0, x1, y1, z1, c) {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, c);
    return this;
  }

  // Rough ellipsoid centred on (cx, cy, cz) in voxel units; never goes below y = 0.
  blob(cx, cy, cz, rx, ry, rz, c, rough = 0.3, seed = 1) {
    for (let y = Math.max(0, Math.floor(cy - ry - 1)); y <= Math.ceil(cy + ry); y++) {
      for (let z = Math.floor(cz - rz - 1); z <= Math.ceil(cz + rz); z++) {
        for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx); x++) {
          const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + ((z + 0.5 - cz) / rz) ** 2;
          if (d < 1 + (hash2(x * 31 + y * 17, z * 13 + y * 7, seed) - 0.5) * rough) this.set(x, y, z, c);
        }
      }
    }
    return this;
  }

  // -> {pos, norm, col, idx, nv}: only faces not hidden by a neighbouring voxel.
  // center: put the x/z bounding-box centre on the origin.
  build(size, { ysize = size, center = true, jitter = 0.05 } = {}) {
    let ox = 0, oz = 0;
    if (center) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, , z] of this.m.values()) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); z0 = Math.min(z0, z); z1 = Math.max(z1, z + 1);
      }
      ox = -(x0 + x1) / 2;
      oz = -(z0 + z1) / 2;
    }
    const pos = [], norm = [], col = [], idx = [];
    for (const [x, y, z, hex] of this.m.values()) {
      const c = rgb(hex);
      const shade = 1 + (hash2(x * 5 + y * 3, z * 7 - y, 77) - 0.5) * 2 * jitter;
      for (let d = 0; d < 6; d++) {
        const [dx, dy, dz] = DIRS[d];
        if (this.m.has(`${x + dx},${y + dy},${z + dz}`)) continue;
        if (d === 3 && y === 0) continue; // sits on the ground
        const base = pos.length / 3;
        for (const [fx, fy, fz] of FACES[d]) {
          pos.push((x + fx + ox) * size, (y + fy) * ysize, (z + fz + oz) * size);
          norm.push(dx, dy, dz);
          col.push(c[0] * shade, c[1] * shade, c[2] * shade);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    return {
      pos: new Float32Array(pos), norm: new Float32Array(norm), col: new Float32Array(col),
      idx: new Uint32Array(idx), nv: pos.length / 3,
    };
  }
}

// Copies placed models into one set of buffers.
// placements: [{m, x, y, z, rot (0-3 quarter turns), scale}]
export function mergeModels(placements) {
  let nv = 0, ni = 0;
  for (const p of placements) {
    nv += p.m.nv;
    ni += p.m.idx.length;
  }
  const pos = new Float32Array(nv * 3), norm = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  let v = 0, i = 0;
  for (const { m, x, y, z, rot = 0, scale = 1 } of placements) {
    const a = rot === 0 ? 1 : rot === 2 ? -1 : 0; // x' = a*x + b*z, z' = -b*x + a*z
    const b = rot === 1 ? 1 : rot === 3 ? -1 : 0;
    for (let k = 0; k < m.nv; k++) {
      const s = k * 3, t = (v + k) * 3;
      const px = m.pos[s], pz = m.pos[s + 2], nx = m.norm[s], nz = m.norm[s + 2];
      pos[t] = (a * px + b * pz) * scale + x;
      pos[t + 1] = m.pos[s + 1] * scale + y;
      pos[t + 2] = (-b * px + a * pz) * scale + z;
      norm[t] = a * nx + b * nz;
      norm[t + 1] = m.norm[s + 1];
      norm[t + 2] = -b * nx + a * nz;
    }
    col.set(m.col, v * 3);
    for (let k = 0; k < m.idx.length; k++) idx[i + k] = m.idx[k] + v;
    v += m.nv;
    i += m.idx.length;
  }
  return { pos, norm, col, idx, nv };
}
