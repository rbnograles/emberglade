// Writes every model in the game as a MagicaVoxel file into vox-export/, to open, study or repaint.
//   npm run export-models
// To use an edited one in the game, copy it into public/models/ and list it in public/models/models.json
// (see public/models/README.md). The file names here are the model ids, with "#" written as "-alt".
import { mkdirSync, writeFileSync } from 'node:fs';
import { Vox } from '../src/render/voxel.js';
import { writeVox } from '../src/render/voxfile.js';

Vox.keep = true; // ask every build to keep its sculpture
const { buildModels, buildItemModels } = await import('../src/render/models.js');
const world = buildModels(), items = buildItemModels(world);

mkdirSync('vox-export', { recursive: true });
const sizes = {};
let written = 0;
for (const [id, model] of new Map([...items, ...world])) {
  if (!model?.src) continue;
  writeFileSync(`vox-export/${id.replace('#', '-alt')}.vox`, writeVox(model.src.vox));
  sizes[id] = { file: `${id.replace('#', '-alt')}.vox`, size: model.src.size, center: model.src.center };
  written++;
}
// the settings each model was built with: copy an entry into public/models/models.json to keep its scale
writeFileSync('vox-export/models.json', JSON.stringify(sizes, null, 2));
console.log(`${written} models written to vox-export/`);
