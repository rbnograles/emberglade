import { Vox } from './voxel.js';

// All sculptures face +z. The same sculpture is scaled down for the workbench carving.
export function keeperModel(spec, carving = false) {
  const v = new Vox(), c = spec.color, a = spec.accent, dark = 0x352e3c, ivory = 0xffe9c2;
  const box = (...p) => v.box(...p);
  const ball = (x, y, z, rx, ry, rz, color) => v.blob(x, y, z, rx, ry, rz, color, 0.08);
  const eyes = (spread, y, z) => {
    for (const s of [-1, 1]) box(s * spread, y, z, s * spread, y + 1, z, dark);
  };
  const feet = (spread, depth, height) => {
    for (const x of [-spread, spread]) for (const z of [-depth, depth]) box(x, 0, z, x + 1, height, z + 1, c);
  };
  const crest = (x, y, z, n) => {
    for (let i = 0; i < n; i++) box(x, y + i, z - i, x + 1, y + i + 1, z - i, a);
  };
  switch (spec.shape) {
    case 'stag':
      feet(3, 3, 5); ball(0, 6, 0, 4.5, 2.5, 5, c); box(-1, 6, 2, 1, 10, 4, c);
      ball(0, 10, 5, 2.5, 2.1, 2.7, c); eyes(1, 11, 6);
      for (const s of [-1, 1]) { box(2*s, 11, 3, 2*s, 14, 3, a); box(Math.min(2*s,5*s), 14, 3, Math.max(2*s,5*s), 14, 3, a); box(5*s, 14, 3, 5*s, 17, 3, a); }
      break;
    case 'boar':
      feet(3, 3, 3); ball(0, 4, -1, 4.8, 4.2, 5.8, c); ball(0, 4, 4, 3.7, 3.0, 3.3, c);
      box(-2, 2, 6, 2, 4, 7, a); eyes(2, 5, 6); crest(-1, 8, 1, 4);
      for (const s of [-1, 1]) box(s*3, 2, 6, s*3, 5, 6, ivory);
      break;
    case 'moth':
      ball(0, 5, 0, 2, 3, 3.5, c); ball(0, 7, 3, 2.5, 2, 2, c); eyes(1, 7, 4);
      for (const s of [-1, 1]) { ball(s*5, 9, 0, 4.2, 4.3, 1.3, a); ball(s*4, 4, -1, 3, 3, 2, c); ball(s*6, 10, 1, 1.6, 1.8, 1.1, c); box(s*2, 8, 3, s*2, 11, 3, ivory); }
      break;
    case 'owl':
      ball(0, 5, 0, 4, 5, 3.5, c); ball(0, 10, 1, 4.3, 3, 3.1, c);
      for (const s of [-1, 1]) { ball(s*2, 10, 3, 2, 2, 1.1, a); box(s*3, 12, 0, s*3, 15, 1, c); ball(s*4, 5, -1, 1.6, 4.0, 2, a); }
      eyes(2, 10, 4); box(0, 8, 4, 0, 9, 5, ivory); break;
    case 'scorpion':
      ball(0, 3, 0, 3.5, 2.0, 4.0, c); eyes(2, 4, 3);
      for (const s of [-1, 1]) { ball(s*4, 3, 5, 2.4, 1.6, 3, a); for (const z of [-2,0,2]) box(Math.min(2*s,5*s), 1, z, Math.max(2*s,5*s), 2, z, c); }
      box(-1, 3, -5, 1, 8, -4, c); box(-1, 8, -5, 1, 10, -1, c); box(0, 7, -1, 0, 9, 0, a); break;
    case 'ram':
      feet(3, 2, 4); ball(0, 6, -1, 4.5, 3.8, 4.5, c); ball(0, 8, 3, 3.4, 3.4, 3.4, c); eyes(2, 9, 5);
      for (const s of [-1, 1]) { box(s*4, 9, 1, s*4, 12, 4, a); box(s*4, 6, 0, s*4, 11, 1, a); box(s*4, 6, 1, s*4, 7, 3, a); } break;
    case 'shell':
      ball(0, 2, 0, 5.3, 2, 4.8, c); ball(0, 7, -2, 5, 5.5, 2.4, a);
      for (let i=0;i<20;i++) { const t=i*0.45, r=i/5; box(Math.round(Math.cos(t)*r), Math.round(7+Math.sin(t)*r), 0, Math.round(Math.cos(t)*r), Math.round(7+Math.sin(t)*r), 1, c); }
      for (const s of [-1,1]) { box(s*2, 2, 3, s*2, 5, 3, c); v.set(s*2, 6, 3, dark); } break;
    case 'angler':
      ball(0, 5, 0, 4.7, 4.1, 5.5, c); box(-1, 2, -8, 1, 8, -5, a); box(-1, 8, 1, 0, 12, 2, c); box(-1, 12, 2, 0, 12, 6, c);
      ball(0, 11, 6, 1.7, 1.7, 1.5, a); eyes(3, 6, 3); box(-2, 3, 4, 2, 3, 5, ivory); break;
    case 'heron':
      for (const s of [-1,1]) box(s*2, 0, 0, s*2, 6, 0, a);
      ball(0, 8, -1, 3.5, 3.2, 5.4, c); box(-1, 8, 2, 1, 14, 3, c); ball(0, 15, 3, 2.3, 2.0, 2.6, a);
      box(-1, 14, 5, 0, 15, 9, ivory); eyes(1, 16, 4); break;
    case 'walrus':
      ball(0, 3, -1, 4.7, 3.6, 6, c); ball(0, 6, 3, 4.0, 3.3, 3.4, c); eyes(2, 7, 5);
      for (const s of [-1,1]) { box(s*2, 1, 6, s*2, 5, 6, a); ball(s*4, 1, 1, 2.6, 1.4, 3, c); } break;
    case 'wyrm':
      for (let j=0;j<18;j++) { const t=j*0.43; ball(Math.sin(t)*3.3, 2+j*0.42, Math.cos(t)*3.3, 2.1, 1.9, 2.1, j%4===0?a:c); }
      ball(3, 11, 2, 3, 2.5, 3.5, c); box(2, 10, 4, 4, 11, 6, a); v.set(1,12,4,dark); v.set(5,12,4,dark); break;
    case 'tortoise':
      feet(4, 3, 3); ball(0, 5, -1, 5.8, 4.5, 5.5, c); ball(0, 4, 5, 2.8, 2.5, 3, c); eyes(2, 5, 6);
      for (const [x,z,h] of [[0,0,12],[-3,-2,10],[3,-2,11],[0,-4,9]]) { box(x, 7, z, x+1, h, z+1, c); box(x, h, z, x+1, h+1, z+1, a); } break;
  }
  return v.build(carving ? 0.068 : 0.19);
}
