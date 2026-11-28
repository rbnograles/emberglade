# Your own models

Models made in [MagicaVoxel](https://ephtracy.github.io/) can replace any still model in the game:
trees, rocks, walls, furniture, tools, food, and every other item or object.

## Start from the game's own models

    npm run export-models

This writes every model into `vox-export/` as a `.vox` file, plus a `models.json` that records the
scale each one was built at. Open any of them in MagicaVoxel to repaint or reshape it.

## Put a model into the game

1. Save your model as a `.vox` file in this folder, for example `chest.vox`.
2. List it in `models.json` in this folder, under the id of the model it replaces:

       {
         "chest": { "file": "chest.vox", "size": 0.2 },
         "tree_oak": { "file": "my_oak.vox", "size": 0.125, "refine": true }
       }

3. Reload the game.

The ids are the file names in `vox-export/`. Where a file name ends in `-alt1` or `-alt2`, the id
ends in `#1` or `#2` (the alternate shapes of a tree): `tree_oak-alt1.vox` is `tree_oak#1`.

## The settings

- `file`: the `.vox` file, in this folder.
- `size`: how wide one voxel is, in tiles. A tile is 1 wide, so a model 8 voxels across at `0.125`
  fills a tile exactly. Copy the value from `vox-export/models.json` to keep the original scale;
  use a smaller number for a model made with finer voxels. Default `0.125`.
- `center`: `true` (the default) stands the middle of the model on the middle of the tile. Use
  `false` only for doors and fence arms, which are built from the corner of the tile.
- `refine`: `true` doubles the detail and shades the model from above. Default `false`.

## Which way is up

In MagicaVoxel, build the model standing on the floor of the grid, with its front facing you in the
default view (toward -y). In the game that front is the side the yellow arrow marks when placing.

## What this does not cover yet

Animals, creatures and the player are jointed figures made of separate moving parts, so a single
`.vox` file cannot replace them. Only the first model in a `.vox` file is read.

If a file is missing or not a `.vox` file, the game says so in the browser console and uses its own
model, so a mistake here never stops the game from starting.
