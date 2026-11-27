import { Vox } from './voxel.js';
import { addAnimalModels } from './animals.js';

const shale = 0x4b4954, bone = 0xf5e7cd, eye = 0x282338, bark = 0x73472f;

function quadruped(body, legs) {
  const v = new Vox().blob(0,4,0,4,2.5,2.6,body);
  for (const x of [-3,2]) for (const z of [-2,1]) v.box(x,0,z,x,3,z,legs);
  return v;
}

function crab() {
  const v = new Vox().blob(0,3,0,3.4,2,4.1,shale)
    .box(0,4,-2,1,5,2,0xc15831).set(2,4,-2,0xffcb59).set(2,4,2,0xffcb59);
  for (const sign of [-1,1]) {
    for (const x of [-3,0,2]) v.set(x,2,sign*3,shale).set(x-1,1,sign*4,0x9b5146).set(x-1,0,sign*5,shale);
    v.box(3,2,sign*3,5,3,sign*3,0xad573f).set(5,4,sign*3,0xf29a41);
  }
  return v.build(0.15);
}

export function addFieldModels(m) {
  addAnimalModels(m);
  m.set('frostprowler',quadruped(0x88bbcc,0x467e94).box(2,5,-2,5,7,1,0xcae9eb)
    .set(3,8,-2,0x73b3c5).set(3,8,1,0x73b3c5).box(5,5,-1,6,6,0,0x507386)
    .box(-6,5,0,-3,5,0,0x8fcbd7).box(-7,6,0,-6,6,0,bone)
    .set(4,7,-2,eye).set(4,7,1,eye).build(0.16));
  m.set('kilncrab',crab());
  m.set('brute',quadruped(0x634857,0x433644).box(1,4,-2,4,6,2,0x745963)
    .box(4,3,-1,5,4,1,0x4b3846).box(4,4,-2,4,7,-2,bone).box(4,4,2,4,7,2,bone)
    .box(-2,6,0,1,8,0,0x492e46).set(3,6,-2,0xe7a84c).set(3,6,2,0xe7a84c).build(0.16));
  const oreBase = () => new Vox().blob(0,1,0,3.7,1.7,3.4,0x80858a,0.17);
  m.set('rock_coal',oreBase().blob(-2,2,-1,2.4,2.5,2.2,0x343842).blob(1,2,1,2.9,2,2.3,0x494955).build(0.19));
  m.set('rock_copper',oreBase().box(-3,2,-1,-1,3,1,0xc17645).box(-1,3,-2,1,5,0,0xe29659)
    .box(1,2,1,3,3,2,0xb06342).set(0,5,1,0x78a496).build(0.19));
  m.set('rock_iron',oreBase().box(-3,2,-2,2,3,-1,0x785750).box(-2,4,-2,1,4,-1,0xbab3a9)
    .box(-1,2,0,3,2,2,0x875c50).box(0,3,0,2,3,2,0xb2acaa).build(0.21));
  m.set('rock_rime',oreBase().box(-2,1,-1,-1,6,0,0x94d6e8).box(-1,7,0,-1,8,0,0xd1f8ff)
    .box(1,1,1,2,3,2,0x70b4d3).set(2,4,1,0xbbe8f3).build(0.19));
  m.set('rock_ember',oreBase().box(-3,2,-2,-1,4,0,shale).box(0,2,-1,1,6,0,0x7c4343)
    .box(0,4,-1,0,5,-1,0xff9845).box(1,2,1,3,3,2,0xb95d40).build(0.2));
  m.set('weather_cairn',new Vox().box(-4,0,-3,4,1,3,0x75878c).box(-3,2,-2,3,4,2,0x9eafb0)
    .box(-2,5,-2,2,7,2,0x82979f).box(-2,8,-1,1,9,1,bone).box(-1,10,0,0,14,0,bark)
    .box(0,12,0,4,14,0,0x63a9c1).box(4,12,0,5,12,0,bone).build(0.19));
  m.set('kiln_ruin',new Vox().box(-4,0,-3,4,1,3,shale).box(-4,2,-3,-3,6,3,0x785b55)
    .box(3,2,-3,4,6,3,0x785b55).box(-3,2,-3,3,6,-2,0x5c4d52).box(-4,7,-3,4,8,3,0x9a715e)
    .box(-3,9,-2,0,12,0,shale).box(-2,2,-1,2,2,1,0xfc9852).build(0.21));
}

export function addFieldItemModels(m) {
  m.set('egg',new Vox().blob(0,2.3,0,2.3,2.6,2.1,bone).set(-1,2,1,0xd2b38d).build(0.1));
  m.set('omelet',new Vox().blob(0,1,0,3.5,1.2,2.6,0xf0b357).box(-1,2,-1,1,2,0,0xf9d789).set(2,2,0,0x77a35b).build(0.1));
  m.set('fleece',new Vox().blob(0,2,0,3.3,2.5,2.5,0xe6dbc7).blob(2,1.5,0,1.8,1.5,2,0xd8c9b5).build(0.11));
  m.set('rimeglass',new Vox().box(-1,0,-1,1,3,1,0x90d7e8).box(0,4,-1,1,5,0,0xc5f0f6).build(0.11));
  m.set('emberglass',new Vox().box(-2,0,-1,1,2,1,0x593c46).box(-1,3,-1,1,4,0,0xac5842).set(0,4,1,0xfab15e).build(0.11));
  m.set('rime_pack',new Vox().blob(0,3,0,3,3.6,2.3,0x6c9ba7).box(-2,4,2,2,5,2,bone).set(0,4,3,0x98d9e9).build(0.1));
  m.set('ember_pike',new Vox().box(0,0,0,0,9,0,bark).box(-1,9,0,1,11,0,0xad5144)
    .box(0,12,0,1,13,0,0xf39245).set(1,14,0,0xf1c177).build(0.09));
}
