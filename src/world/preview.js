import { Worldgen } from './worldgen.js';
import { BIOMES, SHORE, ICE_COLORS, LAVA_COLORS, roofColour } from './biomes.js';

const SPAN = 9000; // tiles across: enough to take in whole continents and both harsh regions

const mix = (a, b, k) => {
  const ch = (shift) => Math.round(((a >> shift) & 255) * (1 - k) + ((b >> shift) & 255) * k) << shift;
  return ch(16) | ch(8) | ch(0);
};

// The colour of one spot on a small map of the world.
function colour(t) {
  if (t.slabs) return roofColour(t); // seen from above, an arch or an overhang is rock
  if (t.salt) {
    const depth = Math.min(1, (-0.3 - t.bed) / 12);
    const sea = mix(0x6fc0e8, 0x2c5a96, depth);
    return t.boiling ? mix(sea, 0xc9623a, 0.35) : sea;
  }
  if (t.ice) return ICE_COLORS[0];
  if (t.lava) return LAVA_COLORS[0];
  if (t.water) return 0x82cbec;
  if (t.shore) return SHORE.ground[0];
  const ground = BIOMES[t.biome].ground[0];
  // higher ground is drawn a little darker, so the ranges stand out from the lowlands
  return t.biome === 'snow' ? ground : mix(ground, 0x3a332e, Math.min(0.3, t.h / 90));
}

// A small map of the world this seed and type would make, as RGBA bytes: size × size, north at the top.
export function previewPixels(seed, type, size = 64) {
  const gen = new Worldgen(seed, type), out = new Uint8ClampedArray(size * size * 4);
  const step = SPAN / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const c = colour(gen.natural(Math.round((i - size / 2 + 0.5) * step), Math.round((j - size / 2 + 0.5) * step)));
      const k = (j * size + i) * 4;
      out[k] = c >> 16;
      out[k + 1] = (c >> 8) & 255;
      out[k + 2] = c & 255;
      out[k + 3] = 255;
    }
  }
  return out;
}

// Draw that map onto a canvas, which is resized to fit it.
export function drawPreview(canvas, seed, type, size = 64) {
  canvas.width = canvas.height = size;
  canvas.getContext('2d').putImageData(new ImageData(previewPixels(seed, type, size), size, size), 0, 0);
}
