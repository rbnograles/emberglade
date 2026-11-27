# Prompt for Codex: continue building Emberglade

Copy everything below the line into Codex, with the repository checked out.

---

You are picking up **Emberglade**, a cozy top-down voxel survival game that runs in the browser. It is an original game: do not recreate any existing game's name, characters, art, music or levels. Read this whole brief before changing anything.

## What exists today

**Stack:** three.js, Vite, plain JavaScript ES modules, Vitest. No framework, no TypeScript. Repo: `rbnograles/emberglade`, branch `main`.

**Run and test**

```bash
npm install
npm run dev      # http://localhost:5173  (add ?play to skip the title menu)
npm test         # Vitest, 34 tests in tests/game.test.js
npm run build
```

In dev, `window.__emberglade` exposes `{ game, chunks, camera, scene, setPaused, setView, camState }` for debugging.

**Architecture: rules are separate from rendering.** This split is the most important thing to preserve.

- `src/game/` – all rules and state, with no three.js and no DOM, so it runs under Vitest.
  - `game.js` – the `Game` class: player, inventory, world edits, crafting, survival, creatures, vehicles, exposure, save data. It emits events (`toast`, `hit`, `swing`, `inv`, `goal`, `hurt`, `eat`, `drink`, `ride`, `newday`, ...) that the view listens to.
  - `items.js` (item table), `crafting.js` (recipes as grid patterns), `inventory.js`, `goals.js`, `survival.js`, `save.js`.
- `src/world/` – `worldgen.js` (deterministic terrain from a seed), `biomes.js`, `objects.js` (what stands on tiles), `worldstate.js` (the player's changes layered over the generated world).
- `src/render/` – three.js only: `voxel.js` (the `Vox` voxel-sculpture builder), `models.js` (every world model and every item model, built in code), `chunks.js` (terrain, water, lava and object meshes per 16×16 chunk), `characters.js` (player, deer, creatures, fish, vehicles), `sky.js`, `weather.js`, `effects.js`, `itemicons.js` (renders an icon per item from its voxel model).
- `src/ui/` – DOM over the canvas: `hud.js`, `panels.js` (inventory and crafting cards), `menu.js` (title / pause menu), `minimap.js`, `bigmap.js`, `icons.js`, `style.css`.
- `src/main.js` – wires input, the frame loop, camera and events. `src/audio.js` – all sound is synthesised with Web Audio. `src/settings.js` – volume, key bindings, character look.

**World.** Infinite and generated per tile from a seed. Tiles have a height in 0.5 steps; the ground cannot be dug. Features: whole continents and open oceans thousands of tiles across, seabed down to 22 deep, mountain massifs inland up to about 56 high, ponds, five lowland biomes, and exactly two harsh regions per world: the **Frozen Wastes** (snow, walkable sea ice) and the **Volcanic Lands** (ash, volcanoes, lava, a boiling sea only a submarine can cross). `GEN_VERSION` in `game.js` must be bumped whenever generation changes shape; older saves are then moved to safe ground.

**Systems already in:** gathering with hands, axe and pickaxe; three tool tiers (stone, copper, iron) with wear; list crafting with workbench and campfire stations; farming (wheat only); health, food, water, energy and air; day and night with sky, rain, snow and ash; wading, swimming and diving; boat, submarine and glider; armor, bags, and fur / crystal gear for the harsh regions; walls, floors, doors, fences, bed, chest, lantern; creatures (gloomling, brute, spitter, golem, snapper), deer and fish; 27 guided goals; minimap and world map; three save slots with export and import; character customisation; a see-through effect that thins trees in front of the player.

**Conventions**

- Put every rule in `src/game` or `src/world` and cover it with a Vitest test. Rendering reads game state; it never decides outcomes.
- New things are data first: an entry in `ITEMS`, `OBJECTS`, `RECIPES`, a biome spawn table, or `ENEMY_KINDS`, then a model in `models.js`.
- Comments say what the code does or why, in plain words. No change-history comments.
- Tests start a world with `new Game({ seed: 1 })`, which begins at the origin. That seed was chosen because it has sea and ponds near the origin; if you change terrain generation, expect to re-pick it.
- Keep `npm test` and `npm run build` passing before every commit. Commit in small, described steps.

## Known problems to fix first

1. **The placement preview is not working properly.** Holding a placeable item should show a see-through silhouette on the targeted tile, white where it can go and red where it cannot (`updateGhost()` in `src/main.js`, rule in `Game.canPlace`). The owner reports it misbehaving; the exact failure has not been reproduced. Reproduce it by hand with several items (wall, floor, bed, door, fence, boat) on flat ground, slopes, water and snow, then fix what you find. Known weak spots: the fence shows only its post, vehicles have no preview at all, a white silhouette is nearly invisible on snow, and the preview does not account for the see-through shader.
2. **Nothing has been play-tested end to end.** Rules were tested one at a time and scenes were set up by script. Play a fresh world through to iron and into both harsh regions, and tune what feels wrong (hunger, thirst, energy, creature numbers, gear costs).
3. **Sound has never been heard by its author.** Listen to the effects, music, rain and blizzard wind and fix anything unpleasant.
4. **Start-up became slower** (about half a second to about 3.5 seconds) after the last terrain change. Profile it; `Game.pickSpawn` is the likely cause.
5. **The held item** still uses an old flat pixel sprite (`iconPixels` in `src/ui/icons.js`), not the voxel item models now used for icons.
6. **Leftovers:** `assets/kenney_voxel-pack` is barely used now; decide whether to use it properly or remove it.

## What to build

Work through these in order. Each should be playable and tested before the next.

### 1. Polish what is already there
The world models are simple placeholders. Raise the quality of:
- **Trees:** more than one shape per kind, better silhouettes, sizes that vary.
- **Ores and rocks:** each ore should read clearly at a glance and differ in shape, not only in speckle colour.
- **Creatures:** the current enemies are blobs and boxes with one hop animation. Give each a distinct shape, an idle and an attack motion, and a hit reaction.
- **Animals:** only deer and fish exist. Add several more kinds suited to each biome, with their own behaviour, and things to gain from them.

### 2. Farm, house and vehicle crafting
The owner wants building a home, a farm and vehicles to be real crafting projects, and says there are too few pieces to do it with.
- **House:** roofs, stairs, windows, more wall and floor materials, and furniture (table, chairs, shelves, storage, lighting, decoration). Roofs must not hide the inside from the top-down camera; hide or fade them when the player is under them.
- **Farm:** more crops with different growing times, fences and gates that work as pens, animals that can be kept and bred, and tools or structures that make a farm worth expanding.
- **Vehicles:** a land vehicle for crossing continents, and vehicles built from parts or in stages, where today a single recipe gives a finished boat or submarine.

### 3. Twelve bosses across the world
There is no boss and no ending. Design and build twelve, spread across the world so that finding them is a reason to explore: every lowland biome, the mountains, the deep sea, the Frozen Wastes and the Volcanic Lands should each matter. For each boss: a fixed place it lives (marked on the world map once found), a distinct shape and attack pattern, the gear needed to face it, and a reward that unlocks something new. Defeating all twelve should give the game a conclusion.

### 4. Give the harsh regions their own purpose
The Frozen Wastes and the Volcanic Lands are dangerous but hold mostly the same ores as elsewhere. Give each its own resources, creatures and structures, so the gear needed to enter them pays off.

### 5. Smaller gaps
- Touch and gamepad controls (keyboard and mouse only today).
- Graphics options and a check on low-end machines.
- A warning before a terrain change moves an old save.
- Extend the guided goals beyond the submarine to cover the regions, the glider, the map and the bosses.
- Host a playable build somewhere public.

## Assets

Everything visible is built from voxels in code, and item icons are rendered from those models, so the whole game shares one look. Prefer building new models the same way with `Vox`. If you bring in outside assets, use only ones with a clear free licence (CC0 preferred), record the source and licence in the README, and make sure they match the voxel style.

## How to work

- Ask before making a choice that changes how the game plays, such as removing a mechanic or changing the camera.
- Do not rewrite working systems to suit a preference. Extend them.
- Say plainly what you tested and what you did not. Do not claim something works because the code looks right.
- Before finishing any task: `npm test` passes, `npm run build` succeeds, and you have looked at the change running in a browser.
