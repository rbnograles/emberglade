import { Vox } from './voxel.js';

const oak = 0xa16a42, edge = 0x624332, honey = 0xd8a467, iron = 0x6b7481, brass = 0xd08a50;
const brick = (x, y, z) => [0xa75a44, 0xb86e50, 0xc17a5a][Math.abs(x + (y >> 1) + z) % 3];

function legs(v, width, depth, height) {
  for (const x of [0, width]) for (const z of [0, depth]) v.box(x, 0, z, x, height, z, edge);
  return v;
}

export function homesteadModels(m) {
  const add = (id, vox, size = 0.125) => m.set(id, vox.build(size));
  const roof = new Vox(), stairs = new Vox();
  for (let x = 0; x < 8; x++) {
    const rise = Math.min(x, 7 - x);
    roof.box(x, rise, 0, x, rise + 1, 7, (a, b, z) => [0x984d3e, 0xb5634f, 0xa85644][(x + (z >> 1)) % 3]);
    stairs.box(x, 0, 0, x, (x >> 1) * 2 + 1, 7, x % 2 ? oak : honey);
  }
  add('roof', roof);
  add('stairs', stairs);
  add('brick_wall', new Vox().box(0, 0, 0, 3, 5, 3, brick), 0.25);
  add('brick_floor', new Vox().box(0, 0, 0, 7, 0, 7, brick));
  add('window', new Vox().box(0, 0, 0, 7, 3, 2, oak).box(0, 4, 1, 0, 11, 1, edge)
    .box(7, 4, 1, 7, 11, 1, edge).box(0, 11, 0, 7, 11, 2, honey)
    .box(3, 4, 1, 3, 10, 1, honey).box(1, 7, 1, 6, 7, 1, honey));
  add('table', legs(new Vox(), 6, 4, 3).box(0, 4, 0, 6, 4, 4, honey));
  add('chair', legs(new Vox(), 3, 3, 2).box(0, 3, 0, 3, 3, 3, oak).box(0, 4, 0, 3, 6, 0, honey));
  const shelf = new Vox().box(0, 0, 0, 0, 8, 2, oak).box(7, 0, 0, 7, 8, 2, oak);
  for (const y of [0, 4, 8]) shelf.box(0, y, 0, 7, y, 2, honey);
  for (const y of [1, 5]) for (let x = 1; x < 6; x++) shelf.box(x, y, 1, x, y + x % 3, 2, [0x659b7d, 0xb3614c, 0x63799c][x % 3]);
  add('shelf', shelf);
  add('cabinet', new Vox().box(0, 0, 0, 6, 8, 3, edge).box(0, 1, 4, 2, 7, 4, oak)
    .box(4, 1, 4, 6, 7, 4, oak).set(2, 4, 5, brass).set(4, 4, 5, brass));
  add('lamp', new Vox().box(0, 0, 0, 2, 0, 2, edge).box(1, 1, 1, 1, 5, 1, brass)
    .box(0, 6, 0, 2, 8, 2, 0xffcd77).box(0, 9, 0, 2, 9, 2, edge));
  const planter = new Vox().box(0, 0, 0, 7, 2, 2, oak);
  for (const x of [1, 3, 6]) planter.box(x, 3, 1, x, 4, 1, 0x4f8254).set(x, 5, 1, x === 3 ? 0xffcc66 : 0xdc7d99);
  add('planter', planter);
  const gate = () => new Vox().box(0, 0, 0, 0, 6, 0, edge).box(7, 0, 0, 7, 6, 0, edge);
  add('gate', gate().box(1, 2, 0, 6, 2, 0, honey).box(1, 5, 0, 6, 5, 0, honey).box(3, 3, 0, 3, 4, 0, oak));
  add('gate_open', gate().box(0, 2, 1, 0, 2, 5, honey).box(0, 5, 1, 0, 5, 5, honey));
  add('irrigator', new Vox().box(0, 0, 0, 4, 5, 4, brass).box(1, 6, 1, 3, 6, 3, 0x74bfc5)
    .box(-1, 1, 2, 5, 1, 2, iron).box(2, 1, -1, 2, 1, 5, iron));
  for (const [id, days, color] of [['turnip', 2, 0xdfc5ae], ['pumpkin', 5, 0xdb813f]]) {
    for (let stage = 0; stage <= days; stage++) {
      const plant = new Vox().box(-1, 0, 0, 1, 0, 0, 0x628749).set(-1, 1, 0, 0x80a35b);
      if (stage > 0) {
        const radius = 1 + stage / days * 1.8;
        plant.blob(0, radius / 2, 0, radius, radius * 0.8, radius, stage === days ? color : 0x7eab60);
        plant.set(0, Math.ceil(radius), 0, 0x526b3a);
      }
      add(id + stage, plant);
    }
    m.set(id, m.get(id + days));
    add(id + '_seeds', new Vox().set(0, 0, 0, color).set(2, 0, 1, color).set(1, 0, 3, color));
  }
  const hull = () => new Vox().box(-5, 1, -2, 5, 1, 2, oak).box(-5, 2, -2, 5, 3, -2, honey)
    .box(-5, 2, 2, 5, 3, 2, honey).box(-5, 2, -1, -5, 3, 1, oak);
  add('hull', hull());
  add('oar', new Vox().box(0, 0, 0, 0, 7, 0, oak).box(-1, 6, 0, 1, 9, 0, honey));
  add('pressure_hull', new Vox().blob(0, 3, 0, 5, 3, 3, iron).box(-2, 5, -1, 2, 6, 1, brass));
  add('propeller', new Vox().box(0, 0, 0, 1, 6, 0, brass).box(-2, 2, 0, 3, 3, 0, brass).set(0, 3, 1, iron));
  const axle = (v, x) => v.box(x, 1, -3, x, 1, 3, iron)
    .box(x - 1, 0, -3, x + 1, 2, -3, edge).box(x - 1, 0, 3, x + 1, 2, 3, edge);
  add('axle', axle(new Vox(), 0));
  add('trail_cart', axle(axle(hull(), -3), 3).box(0, 3, -1, 1, 3, 1, 0x9b5140), 0.18);
}
