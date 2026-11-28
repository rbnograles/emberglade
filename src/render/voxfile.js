import { Vox } from './voxel.js';

// Reading and writing MagicaVoxel .vox files, so models can be sculpted in MagicaVoxel and dropped
// into the game, and the game's own models can be opened there as a starting point.
//
// MagicaVoxel has z pointing up and looks at a model's front along +y. The game has y up and the
// front of a model toward +z. So: game x = vox x, game y = vox z, game z = (depth - 1) - vox y.

const tag = (view, at) => String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));

// A stand-in for files saved without their own colours: a spread of hues, so shapes still show.
function fallbackColour(i) {
  const h = (i * 47) % 360, f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (0.85 - 0.45 * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return (f(5) << 16) | (f(3) << 8) | f(1);
}

// buffer: the bytes of a .vox file (ArrayBuffer or typed array). Returns the first model in it as a
// Vox sculpture, standing on y = 0. Throws a plain-worded Error if the file is not a .vox file.
export function parseVox(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || tag(view, 0) !== 'VOX ') throw new Error('This is not a MagicaVoxel .vox file');
  let size = null, cells = null, palette = null;
  let at = 8;
  // the file is one MAIN chunk holding all the others; walk every chunk in order
  while (at + 12 <= bytes.length) {
    const id = tag(view, at), content = view.getInt32(at + 4, true), body = at + 12;
    if (id === 'MAIN') {
      at = body + content; // step inside: its children follow
      continue;
    }
    if (body + content > bytes.length) break; // a cut-off file: keep what was read
    if (id === 'SIZE' && !size) size = [view.getInt32(body, true), view.getInt32(body + 4, true), view.getInt32(body + 8, true)];
    else if (id === 'XYZI' && !cells) {
      const n = view.getInt32(body, true);
      cells = bytes.subarray(body + 4, body + 4 + n * 4);
    } else if (id === 'RGBA') {
      palette = [];
      for (let i = 0; i < 256; i++) palette.push((view.getUint8(body + i * 4) << 16) | (view.getUint8(body + i * 4 + 1) << 8) | view.getUint8(body + i * 4 + 2));
    }
    at = body + content + view.getInt32(at + 8, true);
  }
  if (!size || !cells) throw new Error('This .vox file has no model in it');
  const v = new Vox();
  for (let i = 0; i + 3 < cells.length; i += 4) {
    const index = cells[i + 3]; // 1..255; colour i is entry i - 1 of the palette
    v.set(cells[i], cells[i + 2], size[1] - 1 - cells[i + 1], palette ? palette[index - 1] : fallbackColour(index));
  }
  return v;
}

// A Vox sculpture as the bytes of a .vox file. Models larger than 256 voxels on a side are cut to
// fit, and more than 255 different colours are merged into their nearest neighbours.
export function writeVox(vox) {
  const cells = [...vox.m.values()];
  if (!cells.length) throw new Error('There is nothing in this model to write');
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const [x, y, z] of cells) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z);
  }
  const sx = Math.min(256, x1 - x0 + 1), sy = Math.min(256, y1 - y0 + 1), sz = Math.min(256, z1 - z0 + 1);
  // the palette: the model's own colours, most used first
  const count = new Map();
  for (const c of cells) count.set(c[3], (count.get(c[3]) ?? 0) + 1);
  const colours = [...count.keys()].sort((a, b) => count.get(b) - count.get(a)).slice(0, 255);
  const index = new Map(colours.map((c, i) => [c, i + 1]));
  const nearest = (hex) => {
    let best = 1, bestD = Infinity;
    colours.forEach((c, i) => {
      const d = ((c >> 16) - (hex >> 16)) ** 2 + (((c >> 8) & 255) - ((hex >> 8) & 255)) ** 2 + ((c & 255) - (hex & 255)) ** 2;
      if (d < bestD) {
        best = i + 1;
        bestD = d;
      }
    });
    index.set(hex, best);
    return best;
  };
  const kept = cells.filter(([x, y, z]) => x - x0 < 256 && y - y0 < 256 && z - z0 < 256);

  const out = new Uint8Array(8 + 12 + (12 + 12) + (12 + 4 + kept.length * 4) + (12 + 1024));
  const view = new DataView(out.buffer);
  let at = 0;
  const text = (s) => { for (const ch of s) out[at++] = ch.charCodeAt(0); };
  const int = (n) => { view.setInt32(at, n, true); at += 4; };
  const chunk = (id, content, children = 0) => { text(id); int(content); int(children); };
  text('VOX ');
  int(150);
  chunk('MAIN', 0, out.length - 20);
  chunk('SIZE', 12);
  int(sx); int(sz); int(sy); // vox x, y (depth), z (height)
  chunk('XYZI', 4 + kept.length * 4);
  int(kept.length);
  for (const [x, y, z, hex] of kept) {
    out[at++] = x - x0;
    out[at++] = sz - 1 - (z - z0);
    out[at++] = y - y0;
    out[at++] = index.get(hex) ?? nearest(hex);
  }
  chunk('RGBA', 1024);
  for (let i = 0; i < 256; i++) {
    const c = colours[i] ?? 0;
    out[at++] = c >> 16; out[at++] = (c >> 8) & 255; out[at++] = c & 255; out[at++] = 255;
  }
  return out;
}

// What the game may load in place of its own models: public/models/models.json lists them as
//   { "<model id>": { "file": "name.vox", "size": 0.125, "center": true, "refine": false } }
// size: the width of one voxel in tiles. center: put the middle of the model on the middle of the
// tile (leave on for anything that stands on a tile). refine: double the detail and shade it.
// Returns Map id -> built model. A missing list or a bad file is skipped with a console warning;
// the game's own model is then used, so a mistake here can never stop the game from starting.
export async function loadVoxModels(base = '/models/') {
  const models = new Map();
  let list;
  try {
    const res = await fetch(base + 'models.json', { cache: 'no-cache' });
    if (!res.ok) return models;
    list = await res.json();
  } catch {
    return models;
  }
  await Promise.all(Object.entries(list ?? {}).map(async ([id, entry]) => {
    try {
      const res = await fetch(base + entry.file);
      if (!res.ok) throw new Error('file not found');
      let vox = parseVox(await res.arrayBuffer());
      const fine = !!entry.refine;
      if (fine) vox = vox.refine();
      const built = vox.build((entry.size ?? 0.125) / (fine ? 2 : 1), { center: entry.center !== false });
      models.set(id, built);
    } catch (err) {
      console.warn(`Custom model "${id}" was not loaded: ${err.message}`);
    }
  }));
  return models;
}
