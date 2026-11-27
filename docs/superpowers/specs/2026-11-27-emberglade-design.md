# Emberglade — design

A cozy top-down voxel survival game in three.js (Vite + JS modules). Original name, models and goals.

## Camera and controls
- Fixed-angle camera above the character, follows the player, mouse wheel zooms.
- WASD moves relative to the screen, Shift sprints.
- The cursor highlights the tile/object under it when within reach (3.5 tiles).
- Left-click uses the held tool (chop, mine, pick, till, harvest). Right-click does the secondary action (place, plant, water, eat).
- 1–9 select the hotbar slot, Tab opens inventory and crafting, E interacts (bed, chest, campfire, workbench), Esc pauses.

## World
- Infinite, seeded, generated in 16×16 tile chunks. Tiles have gentle 0.5-unit height steps. Terrain is not diggable.
- Biomes: Green Meadow, Autumn Woods, Blossom Grove, Pine Forest, Sandy Flats, plus ponds with sandy shores.
- Natural objects: trees (7 kinds), berry bushes, flowers, tall grass, sticks, pebbles, boulders, coal rocks, copper rocks. Everything regrows after a few days.
- Deer wander peacefully. No enemies.

## Gathering and crafting
- Hands pick sticks, pebbles, flowers, grass (fiber, seeds) and berries. Axe fells trees. Pickaxe breaks rocks.
- Crafting uses a grid: 2×2 by hand, 3×3 near a workbench. Items are carried on the cursor and arranged in a pattern (anywhere in the grid, mirroring allowed); the result appears in an output slot. Campfire recipes are shapeless and need a campfire nearby. A recipe book shows every pattern and lays one out on click.
- Space jumps. Ledges (0.5-unit steps) must be jumped up; walking down is free.
- Buildables: campfire, workbench, fence, bed, chest. Hit a placed item to pick it back up.
- Campfire lights the night, cooks food and smelts copper ore + coal into copper bars for better tools.

## Farming
- Hoe tills grass into soil; seeds are planted on soil; watering can (10 charges, refilled at ponds) waters it.
- A watered crop advances one stage each morning; three stages to ripe wheat. Wheat bakes into bread.

## Survival and time
- 10 hearts, 10 hunger. Hunger drains over time (faster when sprinting); starving drains hearts; being well fed regenerates them.
- 8-minute days with a day counter. Sleeping in a bed (evening or night) skips to morning.
- Fainting wakes you at your bed or the start point next morning, items kept.

## Goals
A chain of 12 guided goals shown top-left, from gathering sticks to baking bread.

## Saving
Autosave to localStorage every 30 s and on pause: changed tiles, player, inventory, goals, day and time. "New world" in the pause menu.

## Code
- `src/core` noise; `src/world` generation, biomes, object definitions, world state (pure).
- `src/game` items, inventory, crafting, goals, survival, game rules (pure, unit tested with Vitest).
- `src/render` voxel model builder, models, chunk meshes, sky, characters, particles (three.js).
- `src/ui` HUD and panels (HTML/CSS over the canvas). `src/main.js` wires input, loop and rendering.

## Out of scope
Enemies and combat, caves, digging terrain, sound, multiplayer, touch controls.
