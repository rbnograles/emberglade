# 3D Ground, Phase 2: scope

Phase 1 (walkable 3D ground: stacks, tablelands, canyon lands, arches, caves) is merged. This is the list of what phase 2 covers. It is a scope, not yet a design: the open questions at the end are settled when phase 2 starts, then a design doc and an implementation plan follow.

Phase 1 design: `2026-11-28-3d-ground-design.md`. Phase 1 plan: `../plans/2026-11-28-3d-ground.md`.

## A. Mine everything

The headline of phase 2. Today a shovel moves a tile's ground by half a tile, four times at most, and rock above open space cannot be changed at all. The goal: any block of ground can be mined, in a mountain, a cliff, a stack, a cave roof or the floor, the way built pieces can be broken today.

**Decided**

- What is inside the rock goes by depth: grass or sand on top, earth just under it, then stone, with ore more likely the deeper and the farther into a mountain. It is worked out from the seed; only blocks the player changes are saved.
- Blocks stay one tile wide and half a tile tall, stored as stacked layers per tile, as in phase 1. A tunnel is a new gap in a tile's column.

**To build**

- Aiming at a block, not just a tile: the side of a cliff, a ceiling, the floor.
- Mining a block: which tool, how long, what it yields.
- Saving changed blocks per world, and loading worlds saved before this.
- The shovel's four-step limit and its "dug" record folded into the new block edits.
- Redrawing the ground around a changed block, across chunk borders.
- What happens to things resting on a mined block: trees, ore rocks, built pieces, the player, creatures.
- Headroom: a gap too low to stand in is still allowed once the player makes it; movement has to cope (crouch-free: such a gap is simply not enterable).
- Settlements: their ground stays protected, as today.

## B. Living on and under rock (held back from phase 1)

- Building on slab tops, plateau lips and inside caves at any height, replacing the phase 1 refusal "Nothing can be built up here yet".
- Natural objects on slab tops (grass, trees on wide lips), and cave things under rock.
- Creatures, animals and villagers that respect height: a step rule (no snapping up cliffs), standing on slab tops, not walking through rock.
- A land vehicle driven onto a cave roof stays on the roof.
- Reach that respects height: no digging or opening a chest at the foot of a cliff from its top, or the reverse.
- Spit and other projectiles stopped by rock. Rain kept out of caves.

## C. Seeing it

- Inside a cave or a deep trail, more than a small circle around the character is visible: widen the see-through, or lift everything above the player's head out of view as roofs are indoors.
- The camera never sits inside rock.
- Light: caves darker with depth, and a carried torch or a lamp lighting them.
- Maps: cliffs shaded so plateaus and canyons read as relief.

## D. Left over from the phase 1 reviews

- Old worlds: relocate a player to a fresh start only when their own tile, bed or spawn changed, instead of every world saved under the old land.
- Wide maps are slower than before (the new-game preview went from about 16 ms to 56 ms; the big map about twice as slow at its widest): plan fewer landforms per sample, or cache.
- Tests: the two-slab jump assertion that cannot fail; game constants copied into tests as literals; mesher tests for water, dug ground and chunk borders; a test for the spawn guard that can actually fail.
- Small code items: `roofColour` without `land`; the bare `0.75` in `noRoom`; `cover()` recomputed per face.

## E. Not phase 2

- Water (phase 3): canyon rivers, waterfalls, banded shallows.
- Dressing and distance (phase 4): vines and moss on cliff lips, landmark towers and piers, a longer view.
- The plane as an official vehicle (wanted later; it is a dev-server tool today).

## Open questions for the start of phase 2

1. Can blocks be placed back (building with raw earth and stone), or is phase 2 mining only?
2. Tools: does the pickaxe mine stone and the shovel earth, with harder rock needing better picks, or does any tool mine anything at different speeds?
3. Is there a floor to the world (how deep can a shaft go), and what is at the bottom?
4. Do unsupported blocks fall (sand, a cave roof cut loose), or does everything stay where it is?
5. Does mining under a tree, a wall or a creature drop it, break it, or is it refused until the thing on top is cleared?
6. Is A too large for one build? A likely split: (1) mine and save blocks, (2) place blocks, (3) the items in B.
