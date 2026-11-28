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

  // The same sculpture at twice the resolution, given depth: every voxel becomes eight, the outer
  // corners of anything bulky are shaved round, and the colours are lit from above (pale on top,
  // shadowed underneath) with a fine grain. Thin details such as eyes and legs keep their shape.
  // y0..y1: the height range the lighting runs over, so the parts of one creature shade as a whole.
  refine(y0 = null, y1 = null) {
    const has = (x, y, z) => this.m.has(`${x},${y},${z}`);
    if (y0 === null) {
      y0 = Infinity;
      y1 = -Infinity;
      for (const [, y] of this.m.values()) {
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y + 1);
      }
    }
    const span = Math.max(1, y1 - y0), out = new Vox();
    const lit = (hex, k) => {
      const f = (s) => Math.max(0, Math.min(255, Math.round(((hex >> s) & 255) * k)));
      return (f(16) << 16) | (f(8) << 8) | f(0);
    };
    for (const [x, y, z, hex] of this.m.values()) {
      for (let sy = 0; sy < 2; sy++) for (let sz = 0; sz < 2; sz++) for (let sx = 0; sx < 2; sx++) {
        const dx = sx ? 1 : -1, dy = sy ? 1 : -1, dz = sz ? 1 : -1;
        // an outer corner of a solid mass: open on all three sides, backed on all three
        const corner = !has(x + dx, y, z) && !has(x, y + dy, z) && !has(x, y, z + dz) && has(x - dx, y, z) && has(x, y - dy, z) && has(x, y, z - dz);
        if (corner) continue;
        const X = x * 2 + sx, Y = y * 2 + sy, Z = z * 2 + sz;
        const height = (y + sy * 0.5 + 0.25 - y0) / span; // 0 at the feet, 1 at the top
        const under = !has(x, y - 1, z) && !sy && y > y0 ? 0.9 : 1; // the underside of an overhang
        const grain = 1 + (hash2(X * 3 + Y, Z * 5 - Y, 913) - 0.5) * 0.09;
        out.set(X, Y, Z, lit(hex, (0.8 + 0.3 * height) * under * grain));
      }
    }
    return out;
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
    // which cells are filled, as numbers: much quicker to ask than the string keys
    const key = (x, y, z) => (x + 512) * 1048576 + (y + 512) * 1024 + (z + 512);
    const solid = new Set();
    for (const [x, y, z] of this.m.values()) solid.add(key(x, y, z));
    const has = (x, y, z) => solid.has(key(x, y, z));
    const light = [0, 0, 0, 0];
    for (const [x, y, z, hex] of this.m.values()) {
      const c = rgb(hex);
      const shade = 1 + (hash2(x * 5 + y * 3, z * 7 - y, 77) - 0.5) * 2 * jitter;
      for (let d = 0; d < 6; d++) {
        const [dx, dy, dz] = DIRS[d];
        if (has(x + dx, y + dy, z + dz)) continue;
        if (d === 3 && y === 0) continue; // sits on the ground
        const base = pos.length / 3;
        FACES[d].forEach(([fx, fy, fz], i) => {
          pos.push((x + fx + ox) * size, (y + fy) * ysize, (z + fz + oz) * size);
          norm.push(dx, dy, dz);
          // Soft shadow in the creases: a corner is darker for each voxel crowding it from the
          // layer this face looks out on. It is what makes a blocky shape read as solid.
          const ax = dx ? 0 : fx ? 1 : -1, ay = dy ? 0 : fy ? 1 : -1, az = dz ? 0 : fz ? 1 : -1;
          const nx = x + dx, ny = y + dy, nz = z + dz;
          let s1, s2;
          if (dx) { s1 = has(nx, ny + ay, nz); s2 = has(nx, ny, nz + az); }
          else if (dy) { s1 = has(nx + ax, ny, nz); s2 = has(nx, ny, nz + az); }
          else { s1 = has(nx + ax, ny, nz); s2 = has(nx, ny + ay, nz); }
          const crowd = s1 && s2 ? 3 : s1 + s2 + has(nx + ax, ny + ay, nz + az);
          // and where a side meets the ground it stands on
          const foot = d !== 2 && y === 0 && fy === 0 ? 0.86 : 1;
          const k = (light[i] = (1 - crowd * 0.15) * foot) * shade;
          col.push(c[0] * k, c[1] * k, c[2] * k);
        });
        // split the square along its evener diagonal, so the shading does not show a seam
        if (light[0] + light[2] >= light[1] + light[3]) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      }
    }
    const built = {
      pos: new Float32Array(pos), norm: new Float32Array(norm), col: new Float32Array(col),
      idx: new Uint32Array(idx), nv: pos.length / 3,
    };
    // the export script asks for the sculpture to be kept beside its mesh, with how it was built
    if (Vox.keep) built.src = { vox: this, size, center };
    return built;
  }
}

// Copies placed models into one set of buffers.
// placements: [{m, x, y, z, rot (0-3 quarter turns), scale, sway, stem}]
// sway: how freely the thing moves in the wind (0 = rigid). stem: height below which it stays still
// (a trunk). The result carries a sway weight per corner, growing with height above the stem.
export function mergeModels(placements) {
  let nv = 0, ni = 0;
  for (const p of placements) {
    nv += p.m.nv;
    ni += p.m.idx.length;
  }
  const pos = new Float32Array(nv * 3), norm = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const sway = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  let v = 0, i = 0;
  for (const { m, x, y, z, rot = 0, scale = 1, sway: wind = 0, stem = 0 } of placements) {
    const a = rot === 0 ? 1 : rot === 2 ? -1 : 0; // x' = a*x + b*z, z' = -b*x + a*z
    const b = rot === 1 ? 1 : rot === 3 ? -1 : 0;
    for (let k = 0; k < m.nv; k++) {
      const s = k * 3, t = (v + k) * 3;
      const px = m.pos[s], pz = m.pos[s + 2], nx = m.norm[s], nz = m.norm[s + 2];
      pos[t] = (a * px + b * pz) * scale + x;
      pos[t + 1] = m.pos[s + 1] * scale + y;
      if (wind) sway[v + k] = wind * Math.max(0, m.pos[s + 1] * scale - stem);
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
  return { pos, norm, col, idx, nv, sway };
}
