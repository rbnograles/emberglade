// 8x8 pixel icons, one character per pixel.
const PALETTE = {
  k: '#2b2b33', w: '#ffffff', g: '#9aa0a8', G: '#6b7078', b: '#8a5a34', B: '#5c3a20', y: '#f2c94c', o: '#e8833a',
  r: '#d94f4f', p: '#e88ac0', l: '#7ac74f', L: '#4a9a3a', c: '#6fc3e8', t: '#d9a066', s: '#d9c27a', i: '#c9d1d9',
};

const axe = (h) => `....${h}${h}.. ...${h}${h}${h}${h}. ..${h}${h}${h}${h}b. ...${h}${h}b.. ....b... ...b.... ..b..... .b......`;
const pick = (h) => `.${h}${h}${h}${h}${h}.. ${h}....b${h}. ....b.${h}. ...b..${h}. ..b..... .b...... b....... ........`;

const hat = (h) => `........ ..${h}${h}${h}${h}.. .${h}${h}${h}${h}${h}${h}. .${h}${h}${h}${h}${h}${h}. .${h}....${h}. ........ ........ ........`;
const tunic = (h) => `.${h}${h}..${h}${h}. ${h}${h}${h}${h}${h}${h}${h}${h} ${h}${h}${h}${h}${h}${h}${h}${h} .${h}${h}${h}${h}${h}${h}. .${h}${h}${h}${h}${h}${h}. .${h}${h}${h}${h}${h}${h}. .${h}${h}${h}${h}${h}${h}. ........`;
const boots = (h) => `........ .${h}${h}..${h}${h}. .${h}${h}..${h}${h}. .${h}${h}..${h}${h}. .${h}${h}${h}.${h}${h}${h} .${h}${h}${h}.${h}${h}${h} ........ ........`;

const bag = (h) => `..${h}${h}${h}${h}.. .${h}....${h}. ${h}${h}${h}${h}${h}${h}${h}${h} ${h}${h}${h}bb${h}${h}${h} ${h}${h}${h}${h}${h}${h}${h}${h} ${h}${h}${h}${h}${h}${h}${h}${h} .${h}${h}${h}${h}${h}${h}. ........`;

const ART = {
  boat: '........ ........ b......b bb....bb bbbbbbbb .bbbbbb. ........ ........',
  submarine: '....G... ...yy... ..yyyy.. .yyyyyyG yycyycyG .yyyyyyG ..oooo.. ........',
  kelp: '...L.... ..LL.... ..L..L.. .LL..L.. .L..LL.. .LL.L... ..L.LL.. ..L..L..',
  clam: '........ ........ .wwwwww. wwtwwtww wtwwwwtw .wppppw. ..wwww.. ........',
  pearl: '........ ..wwww.. .wwwwww. .wwcwww. .wwwwww. .wwwwww. ..wwww.. ........',
  coral: 'p..p..p. p..p..p. pp.p.pp. .p.ppp.. .ppp.p.. ..pp.p.. ...pp... ...pp...',
  raw_fish: '........ ........ o..oooo. oooooowo oooooooo o..oooo. ........ ........',
  cooked_fish: '........ ........ b..tttt. bttttttk tttttttt b..tttt. ........ ........',
  iron_bar: '........ ........ ..iiiii. .iwwiiiG iiiiiiiG iiiiiiGG .GGGGGG. ........',
  diving_mask: '........ .kkkkkk. kccckccc kcwckcwc kccckccc .kkkkkk. ..k..k.. ........',
  flask: '...bb... ...cc... ..cccc.. .cccccc. .cwcccc. .cccccc. ..cccc.. ........',
  woven_bag: bag('s'),
  trail_pack: bag('t'),
  door: '.bbbbbb. .bttttb. .bttttb. .bttytb. .bttttb. .bttttb. .bttttb. .bbbbbb.',
  woven_hat: hat('s'),
  woven_tunic: tunic('s'),
  woven_boots: boots('s'),
  copper_helmet: hat('o'),
  copper_chestplate: tunic('o'),
  copper_boots: boots('o'),
  stick: '......b. .....b.. ....bB.. ...bB... ..bB.... .bB..... bB...... ........',
  stone: '........ ..gggg.. .gggggg. gggGgggg ggggggGg .gGgggg. ..gggg.. ........',
  wood: '........ .bbbbbb. bBbbbbtb bbbbBbtb bbBbbbtb bbbbbBtb .bbbbbb. ........',
  fiber: '........ .l...l.. .l..l... ..l.l.l. ..lll.l. ...lll.. ...Ll... ...L....',
  seeds: '........ ........ ..t..t.. .t..t... ....t.t. .t.t.... ...t..t. ........',
  wheat: '...y.... ..yyy... ..yyy.y. ...y.yyy .y.y.yyy yyyt..y. .y.t..t. ...t..t.',
  berries: '....L... ...L.L.. ..rr.... .rrrr.r. .rwrrrrr ..rr.rwr ......r. ........',
  apple: '....B... ...Bl... .rrrrr.. rrwrrrr. rrrrrrr. rrrrrrr. .rrrrr.. ..r.r...',
  roasted_apple: '....B... ....B... .ooooo.. oobooyo. ooooboo. obooooo. .ooooo.. ..o.o...',
  bread: '........ ..tttt.. .tytytt. tttttttt tttttttb bttttttb .bbbbbb. ........',
  coal: '........ ..kkk... .kkGkk.. kkkkkkk. kGkkkGk. .kkkkk.. ..kkk... ........',
  copper_ore: '........ ..ggg... .gogggg. ggggogg. goggggg. .gggog.. ..ggg... ........',
  copper_bar: '........ ........ ..ooooo. .oyyooob ooooooob oooooobb .bbbbbb. ........',
  flower: '........ ..p.p... .pypyp.. ..pyp... .p.L.p.. ...L.l.. ..lL.... ...L....',
  stone_axe: axe('g'),
  copper_axe: axe('o'),
  stone_pickaxe: pick('g'),
  copper_pickaxe: pick('o'),
  hoe: '...gggg. .....bg. ....b.g. ...b.... ..b..... .b...... b....... ........',
  watering_can: '........ c....oo. .c.ooooo ..oooo.o ..oooo.o ..ooooo. ..oooo.. ........',
  campfire: '...o.... ..oyo... ..oyyo.. .oyyyo.. .ooyoo.. gbBbBbg. ggggggg. ........',
  workbench: '........ tttttttt tbtttbtt BBBBBBBB .B....B. .B....B. .B....B. ........',
  fence: '........ .b....b. bbbbbbbb .b....b. bbbbbbbb .b....b. .b....b. ........',
  bed: '........ ........ ww.rrrr. wwrrrrrr bbbbbbbb bbbbbbbb b......b ........',
  chest: '........ .bbbbbb. bBBBBBBb bbbyybbb bbbyybbb bbbbbbbb bbbbbbbb ........',
};

// Sprites from the Kenney Voxel Pack (CC0, www.kenney.nl) for the items it covers.
// Each URL is a literal so the bundler only ships the files that are used.
const PACK = {
  stone_axe: new URL('../../assets/kenney_voxel-pack/PNG/Items/axe_iron.png', import.meta.url).href,
  copper_axe: new URL('../../assets/kenney_voxel-pack/PNG/Items/axe_bronze.png', import.meta.url).href,
  stone_pickaxe: new URL('../../assets/kenney_voxel-pack/PNG/Items/pick_iron.png', import.meta.url).href,
  copper_pickaxe: new URL('../../assets/kenney_voxel-pack/PNG/Items/pick_bronze.png', import.meta.url).href,
  stone_sword: new URL('../../assets/kenney_voxel-pack/PNG/Items/sword_iron.png', import.meta.url).href,
  copper_sword: new URL('../../assets/kenney_voxel-pack/PNG/Items/sword_bronze.png', import.meta.url).href,
  iron_ore: new URL('../../assets/kenney_voxel-pack/PNG/Items/ore_iron.png', import.meta.url).href,
  iron_axe: new URL('../../assets/kenney_voxel-pack/PNG/Items/axe_silver.png', import.meta.url).href,
  iron_pickaxe: new URL('../../assets/kenney_voxel-pack/PNG/Items/pick_silver.png', import.meta.url).href,
  iron_sword: new URL('../../assets/kenney_voxel-pack/PNG/Items/sword_silver.png', import.meta.url).href,
  hoe: new URL('../../assets/kenney_voxel-pack/PNG/Items/hoe_iron.png', import.meta.url).href,
  apple: new URL('../../assets/kenney_voxel-pack/PNG/Items/apple.png', import.meta.url).href,
  wheat: new URL('../../assets/kenney_voxel-pack/PNG/Items/wheat.png', import.meta.url).href,
  seeds: new URL('../../assets/kenney_voxel-pack/PNG/Items/seed.png', import.meta.url).href,
  coal: new URL('../../assets/kenney_voxel-pack/PNG/Items/ore_coal.png', import.meta.url).href,
  copper_ore: new URL('../../assets/kenney_voxel-pack/PNG/Items/ore_ironAlt.png', import.meta.url).href,
  stone: new URL('../../assets/kenney_voxel-pack/PNG/Tiles/rock.png', import.meta.url).href,
  wood: new URL('../../assets/kenney_voxel-pack/PNG/Tiles/trunk_side.png', import.meta.url).href,
  fiber: new URL('../../assets/kenney_voxel-pack/PNG/Tiles/grass3.png', import.meta.url).href,
  fence: new URL('../../assets/kenney_voxel-pack/PNG/Tiles/fence_wood.png', import.meta.url).href,
  workbench: new URL('../../assets/kenney_voxel-pack/PNG/Tiles/table.png', import.meta.url).href,
  wood_wall: new URL('../../assets/kenney_voxel-pack/PNG/Tiles/wood.png', import.meta.url).href,
  stone_wall: new URL('../../assets/kenney_voxel-pack/PNG/Tiles/brick_grey.png', import.meta.url).href,
  wood_floor: new URL('../../assets/kenney_voxel-pack/PNG/Tiles/wood_red.png', import.meta.url).href,
  stone_floor: new URL('../../assets/kenney_voxel-pack/PNG/Tiles/greystone.png', import.meta.url).href,
};

// Code-drawn pixel icons want crisp scaling; pack sprites want smooth scaling.
export const isPixelIcon = (id) => !PACK[id];

const HELD_RES = 16;
const packPixels = new Map();

// Reads each pack sprite once, shrunk to 16x16, so held items can be built as voxel sprites.
export async function loadIcons() {
  await Promise.all(Object.entries(PACK).map(async ([id, url]) => {
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = HELD_RES;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, HELD_RES, HELD_RES);
      const data = ctx.getImageData(0, 0, HELD_RES, HELD_RES).data;
      const out = [];
      for (let y = 0; y < HELD_RES; y++) {
        for (let x = 0; x < HELD_RES; x++) {
          const i = (y * HELD_RES + x) * 4;
          if (data[i + 3] > 110) out.push({ x, y: HELD_RES - 1 - y, color: (data[i] << 16) | (data[i + 1] << 8) | data[i + 2] });
        }
      }
      packPixels.set(id, out);
    } catch {
      // sprite missing or undecodable: the code-drawn icon is used for the held item
    }
  }));
}

// The icon as pixels: {size, pixels: [{x, y, color}]} with y = 0 at the bottom and colour as a hex number.
export function iconPixels(id) {
  if (packPixels.has(id)) return { size: HELD_RES, pixels: packPixels.get(id) };
  const pixels = [];
  (ART[id] ?? ART.stone).split(' ').forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (PALETTE[ch]) pixels.push({ x, y: 7 - y, color: parseInt(PALETTE[ch].slice(1), 16) });
    });
  });
  return { size: 8, pixels };
}

const cache = new Map();

export function iconURL(id) {
  if (PACK[id]) return PACK[id];
  if (cache.has(id)) return cache.get(id);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const ctx = canvas.getContext('2d');
  (ART[id] ?? ART.stone).split(' ').forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (!PALETTE[ch]) return;
      ctx.fillStyle = PALETTE[ch];
      ctx.fillRect(x, y, 1, 1);
    });
  });
  const url = canvas.toDataURL();
  cache.set(id, url);
  return url;
}
