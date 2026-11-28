# 3D Ground Design (stage 1 of 4)

## Intent

Give the world the landforms of the reference dioramas at the player's scale: sheer limestone islands and sea stacks with sea arches, flat-topped tablelands, and deep canyons with rock pillars and natural bridges. The ground becomes truly three-dimensional, so rock can overhang, arch over and hollow into caves, and the player walks over and under it.

This is the first of four stages. Each later stage gets its own design:

1. **3D ground you can walk over and under** (this document).
2. Living in it: tunnelling, building in caves and on ledges, creatures and animals on slab tops, cliff shading on maps.
3. Water: canyon rivers, waterfalls, banded shallows.
4. Dressing and distance: vines and moss over cliff lips, landmark towers and piers, a longer view.

## Decisions already made

- Real overhangs, arches and caves anywhere, not only at set-piece models.
- Blocks stay one tile wide and half a tile tall, the grain the land has today. The ground is stored as stacked layers per tile.
- The new landforms get their own kinds of country between the gentle lowlands.
- Cliffs are climbed by generated routes. There is no climbing move.
- Every world, old and new, gets the new terrain.

## Goals

- A tile can hold rock above open space.
- Three new kinds of country, generated from the seed alone: Stack Coast, Tablelands, Canyon Lands.
- The player walks under arches, into caves, onto plateau and slab tops, and falls or glides off them.
- Every plateau and large stack has at least one walkable route to the top.
- Cliff faces show horizontal rock bands; caves read as dark.
- The player stays visible under and behind rock.
- Everything that works per tile today (objects, farming, building, creatures, villagers, vehicles, settlements, saves) keeps working on the ground.

## Non-goals (stage 1)

- Editing slabs: tunnelling, mining rock out of a cliff, filling a cave. Digging still moves only the ground.
- Building, natural objects, creatures or animals on slab tops.
- Rivers, waterfalls, banded shallows, new water behaviour.
- Vines, moss, landmark structures.
- A longer view distance. The view still fades at about 95 tiles, so a tall cliff is seen whole only from close by.
- Changes to mountains, volcanoes, the Frozen Wastes or the Volcanic Lands.
- A climbing move.

## Ground model

A tile keeps every field it has today and gains two:

- `slabs`: an array of `[lo, hi]` pairs, or `undefined` when the tile has none (the usual case). Each pair is solid rock from height `lo` up to `hi`.
- `land`: `'stacks'`, `'table'`, `'canyon'` or `undefined`: which new kind of country the tile is in.

Rules for slabs:

- Heights are multiples of `0.5`.
- Sorted from lowest to highest, never touching or overlapping.
- The lowest `lo` is at least `HEADROOM` (2 units) above the ground: above `h` on land, above `WATER_Y` over water. Any two slabs are at least `HEADROOM` apart. A gap smaller than that is generated as solid rock instead.
- `hi - lo` is at least `0.5`.

`h` remains the lowest floor of the tile: the ground under an arch, the floor of a cave. A plain cliff column has no slab, only a high `h`. Everything that reads `h` today therefore stays on the low ground and can pass under rock without change.

The solid part of a tile is everything from far below up to `h` (or up to `bed` under water), plus each slab. A new module `src/world/columns.js` holds the small pure helpers that read this, used by the game rules and the mesher alike:

- `floorOf(tile)`: the solid floor: the bed under water, the ground elsewhere.
- `solids(tile)`: the solid ranges, lowest first.
- `surfaces(tile)`: heights that can be stood on (the floor and each slab's `hi`).
- `slabTopBelow(tile, y)`: the top of the highest slab at or below `y`, or `-Infinity`.
- `ceilingAbove(tile, y)`: the `lo` of the first slab that reaches above `y`, or `Infinity`.
- `solidAt(tile, y0, y1)`: whether any rock lies between two heights.

## The three kinds of country

A new pure module `src/world/landforms.js` decides, for a tile, which country it is in and how that reshapes the ground. `Worldgen.natural` calls it last, once the lowland, the mountains and the volcanoes are known, and skips it on mountain tiles and in the harsh regions, so those keep priority. It returns the new `h`, `slabs`, `land`, and where it must, a changed `water`, `bed`, `shore` and `biome`.

Where each appears:

- Each kind follows its own broad noise (800 to 1300 tiles across), so each stretch is a place to travel to, not a speckle. Where canyon country and tableland would both be, it is canyon.
- Never inside the Frozen Wastes or the Volcanic Lands, never on mountain tiles, never within 200 tiles of the world's centre.
- Stack Coast only off the coast and right on it; Tablelands and Canyon Lands only where the whole landform fits on land.
- Landforms of different kinds never touch: each keeps its own cliffs and its own way up.
- The world type scales how common they are through one new number in `worldtypes.js`: `rugged`, which is 1 for every type except Thousand Isles and Highlands, where it is 1.5.
- Each must be findable: on Classic Continents, each kind lies within 3000 tiles of the centre for the test seeds.

**Stack Coast** (reference: the island diorama)

- Grey limestone islands and stacks 12 to 35 tall, 6 to 60 tiles across, rising sheer from beaches and shallow sea.
- Tops are grassy with patches of bare stone. Rock that rises from the sea is meadow on top.
- Islands (40 to 60 tiles across) are ringed by a beach and by shallows paler than the open sea.
- The cap is wider than the base: the top 2 to 5 units jut out 1 to 3 tiles as a slab, thinning toward the lip.
- A notch 2 to 3 units high is cut into the foot at the waterline where a stack stands in the sea.
- Sea arches join some neighbouring stacks: a slab bridging open water, its underside curved, with at least 4 units of clearance at the middle so a boat passes under.
- Sea caves run into the larger islands at beach level.

**Tablelands** (reference: the plateau scene)

- Flat-topped plateaus 8 to 25 tall and 80 to 300 tiles across, in one to three tiers, with ragged sheer edges.
- Earth-brown cliffs. Tops keep their lowland biome, so forests and meadows continue on top.
- Low ground between plateaus stays gentle and keeps its ponds.
- Short overhanging lips in places, and caves at the foot of the cliffs.

**Canyon Lands** (reference: the tower-rock canyon)

- Sandstone mesas 30 to 50 high and 220 to 400 tiles across, each cut by winding canyons whose walls step down in terraces.
- Free-standing pillars on the canyon floor, wider at the top than at the neck.
- Natural bridges cross the canyons: slabs with a curved underside.
- Caves in the canyon walls, some passing through from one canyon to the next.
- A new biome, `canyon` ("Canyon Lands"): sandstone ground, with dead trees, boulders, pebbles, copper and coal.

**Routes up**

- Every island, plateau and mesa has a route from its foot to its top that needs no step higher than `0.5`. Stacks under 40 tiles across have none: they are reached by glider, or left as scenery.
- A route is a level cut, 3 tiles wide, leading in through the cliff, then a trail of the same width winding up just inside the edge. It gains less than half a tile per tile and ends on a short landing at the top. A tiered plateau has one for each tier, starting on the far side from the one below.
- Routes are placed per landform from the seed, so they are the same every time the world is loaded. Nothing grows on them, no rock hangs over them, and no canyon cuts the rim beside them.

**How it is generated** (for the plan to refine)

- Each kind of landform has its own grid of squares, with at most one landform per square, wholly inside it. Its outline is a circle made ragged by noise; its height is fixed per landform, not per tile.
- Overhangs: where a second noise says so, the top reaches 1 to 3 tiles past the foot of the cliff as a slab that thins toward its lip.
- Arches, bridges and pillars are placed per grid square from hashes, the way volcanoes are, and cached per square.
- Caves are bands where a second noise is near zero inside rock: the ground drops to the level outside and the rest of the column becomes a slab.

## Moving through it

All changes are in `src/game/game.js`.

- `standY`: the surfaces of a tile now include each slab's `hi`. The rule stays "the highest surface at or just below the feet", so someone on top of an arch stays on top and someone beneath it stays on the ground.
- `canEnter`: a move is refused when rock occupies the body's height at the target: `solidAt(tile, feet + STEP_LIP, feet + PLAYER_HEIGHT)` with `PLAYER_HEIGHT = 1.5`.
- `physics`: rising into a ceiling stops the rise (`vy = 0`) at `ceilingAbove - PLAYER_HEIGHT`. Falling, fall damage and the glider are unchanged and land on whichever surface is below.
- `blocked`: a tile is skipped when the player stands on rock above it (`aloft`), so nothing under an arch stops someone walking over it. Everything else is judged as today.
- `playerLevel` counts storeys from what is underfoot: the ground, or the top of the slab the player stands on. While the player stands on rock above a tile, that tile is out of reach, and building, dismantling and digging there are refused with "Nothing can be built up here yet".
- Swimming, boats and the submarine are unchanged under a sea arch: the slab is above the water.
- Creatures, animals, villagers and land vehicles keep using `h`. They walk under arches and into caves and never climb onto slabs.

## What stays on the ground

- Natural objects grow on `h`. On land under a slab only `pebble`, `stick`, `boulder` and the ore rocks spawn; trees, bushes, grass and flowers do not. Sea-floor life under a sea arch is unchanged.
- Building pieces, floors and roofs go on `h` as today. A piece is refused with "No room under the rock" when the storey it would occupy reaches into a slab.
- Digging moves `h` only. Raising the ground stops `HEADROOM` below a slab.
- Villages and castles are not planned where any tile of their footprint has `land` set.
- `pickSpawn` and `wildSpawn` never choose a tile with `land` set.

## Seeing it

**Mesher.** `buildTerrain` moves out of `src/render/chunks.js` into `src/render/terrain.js` as a function of `(gen, cx, cz)`; `chunks.js` keeps streaming and objects. The rule for faces becomes general:

- A top face on `h` and on each slab's `hi`; a bottom face on each slab's `lo`.
- A side face toward each neighbour for every part of this tile's solid ranges that the neighbour's solid ranges do not cover.
- Water and lava layers are unchanged.

**Colour.**

- Side faces inside the new country are coloured in horizontal bands by world height, from a short palette per kind (grey limestone, brown earth, tan sandstone), with slight per-tile variation. The top half tile of a face takes the colour of the top.
- Slab undersides are dark rock.
- Ground and walls under a slab are darkened, more so the farther they are from open sky (up to 4 tiles), so caves read as dark. This is baked into vertex colours; no new lights or shadows.
- Elsewhere the ground is drawn exactly as today.

**Cut-away.** The terrain material gets the same dither circle the object material has. It is decided per pixel and is always available: a terrain pixel is thinned only when it is inside the circle around the player on screen, nearer the camera than the player, and higher in the world than the player's head. The ground underfoot is therefore never thinned, and open country looks as it does today.

**Pointing.** A cursor ray skips terrain hits that are higher than the player's head and inside the cut-away circle, so the player can point at the ground beneath an arch.

**Maps and labels.** The minimap and world map colour a tile by its highest surface, and draw `canyon` in sandstone. The place label shows "Stack Coast", "Tablelands" or "Canyon Lands" when `land` is set, otherwise the biome name as today.

## Existing worlds

- `GEN_VERSION` is raised. The game already detects a world saved under an older shape of the land (`needsRelocation`) and, after the existing confirmation, wakes the player at a fresh start with their inventory and progress; the bed and vehicles are cleared. That path is used unchanged, so every existing world is relocated once, whether or not its base was touched.
- Things the player built are stored per tile and are drawn on whatever ground is there now. A house in country that became cliff or sea will be broken or flooded; nothing is deleted. Bases within 200 tiles of the world's centre are not affected by the new country.
- Nothing new is saved in stage 1: slabs are never edited, so the save format does not change.

## Performance

- Slabs exist on a small share of tiles, and only inside the new country. Tiles elsewhere carry no new data and take the same path through the mesher.
- Per-square features (arches, bridges, pillars, routes) are cached like volcanoes.
- Target: building a chunk in the new country costs no more than twice a mountain chunk today.

## Testing

Unit tests (Vitest), in a new `tests/ground.test.js`:

- The same seed and world type give the same `h`, `slabs` and `land` for a sample of tiles.
- Slab rules hold over a large sample: multiples of `0.5`, sorted, no overlap, `HEADROOM` kept.
- Each kind of country is found within 3000 tiles of the centre on several seeds; none within 200 tiles; none in the harsh regions.
- Each kind produces the features it promises on sample seeds: tiles with slabs, an arch or bridge with the stated clearance, a plateau top in the stated height range.
- Routes: for the nearest island, plateau and mesa of several seeds, a flood fill using the player's step rule reaches the top from the foot.
- `columns.js` helpers on hand-made tiles.
- Movement on a hand-made world: walk under an arch, stand on it, fall off it, bump a ceiling, be stopped by a slab's side.
- Under a slab: no tree spawns, a tall building piece is refused, the ground cannot be raised into the rock.
- No settlement and no spawn on tiles with `land` set.
- Mesher: a lone tile with one slab yields the expected face count; two equal neighbours share no side faces.
- The existing suites keep passing.

In the running game: visit each kind of country, walk a route up, pass under an arch on foot and by boat, enter a cave, and confirm the cut-away and the darkening by screenshot, on desktop and at phone size.
