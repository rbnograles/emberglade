// Deterministic integer hash -> [0, 1)
export function hash2(x, z, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// 2D gradient noise, roughly in [-1, 1]
export function perlin(x, z, seed = 0) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const dot = (ix, iz) => {
    const a = hash2(ix, iz, seed) * 6.283185307179586;
    return Math.cos(a) * (x - ix) + Math.sin(a) * (z - iz);
  };
  const u = fade(x - x0), v = fade(z - z0);
  const a = dot(x0, z0), b = dot(x0 + 1, z0), c = dot(x0, z0 + 1), d = dot(x0 + 1, z0 + 1);
  const top = a + (b - a) * u, bottom = c + (d - c) * u;
  return (top + (bottom - top) * v) * 1.414;
}

export function fbm(x, z, seed = 0, octaves = 3) {
  let sum = 0, amp = 1, total = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += perlin(x * f, z * f, seed + i * 101) * amp;
    total += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / total;
}
