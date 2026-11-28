# Multi-Storey Building Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backward-compatible, three-storey construction with walkable upper floors, height-aware gameplay, clear layer controls, and complete wood/stone/brick structural families.

**Architecture:** Separate constructed structures from natural ground overrides in a `StructureState` keyed by `x,z,level`, while `WorldState` supplies compatibility accessors for existing ground-level callers and migrates legacy saves. `Game` owns build-level selection, support rules, vertical collision, and stairs; chunk rendering owns per-storey meshes and visibility. This plan begins only after `docs/superpowers/plans/2026-11-28-beta-gameplay-mobile.md` is complete and green.

**Tech Stack:** JavaScript ES modules, Three.js 0.187, Vite 8, Vitest 5, CSS, bundled Fontsource Nunito.

**Spec:** `docs/superpowers/specs/2026-11-28-multistorey-building-design.md`

## Global Constraints

- Execute only after the beta gameplay/mobile plan passes its full verification.
- Storey height is exactly `1.5`; supported levels are integers `0..2`.
- Natural objects, crops, and terrain remain ground-only.
- Old saves load without losing, duplicating, or moving structures and are written in the layered format on the next save.
- Existing keyboard, mouse, controller, and touch play remain usable.
- Invalid placement never consumes an item.
- Do not add external dependencies, collapse simulation, basements, or more than three storeys.

## Review Focus

- A legacy tile containing a placed object plus a legacy floor and roof must migrate all three pieces into level `0` exactly once; Task 1 tests this collision-prone case.
- Terrain height differences across adjacent tiles must not make a player snap between storeys; Task 3 tests storey calculation using each tile's local ground height.
- Removing a lower support must not delete upper pieces, while subsequent unsupported placement remains rejected; Task 2 tests both behaviors.
- A player standing on an upper floor must not be blocked by the wall directly below and must still be blocked by a wall on their own storey; Task 3 tests vertical spans.
- Loading an upper-floor bed whose support was removed must fall back safely beside the building rather than inside a wall or water; Task 3 tests the fallback.

---

### Task 1: Layered Structure State and Save Migration

**Files:**
- Create: `src/world/structures.js`
- Modify: `src/world/worldstate.js`
- Modify: `src/game/game.js` (constructor and `serialize`)
- Test: `tests/structures.test.js`
- Test: `tests/game.test.js`

**Interfaces:**
- Produces: `STOREY_HEIGHT = 1.5`, `STRUCTURE_LEVELS = 3`, and `StructureState`.
- Produces: `StructureState.get(x, z, level)`, `setObject(x, z, level, object)`, `setFloor(x, z, level, id)`, `setRoof(x, z, level, id)`, `clearObject(x, z, level)`, `column(x, z)`, and `toJSON()`.
- Produces: `WorldState.get(x, z, level = 0)`, `getFloor(x, z, level = 0)`, `getRoof(x, z, level = 0)`, plus matching setters that delegate constructed pieces to `StructureState`.
- Consumes later: layered save property `structures`; legacy `world`, `floors`, and `roofs` remain accepted inputs. Migration collisions produce a serialized `structureOverflow` item list for the player-facing migration notice.

- [ ] **Step 1: Write failing `StructureState` unit tests**

Test independent object/floor/roof values at the same `x,z` across levels `0..2`, deletion of one component without touching the others, deterministic JSON round-trip, malformed saved levels clamped to `0..2`, rejected out-of-range runtime writes, and unknown-item preservation in data without a render crash assumption.

- [ ] **Step 2: Run the new tests and verify RED**

Run: `npm test -- --run tests/structures.test.js`

Expected: FAIL because `src/world/structures.js` does not exist.

- [ ] **Step 3: Implement `StructureState`**

Use a `Map` keyed by `x,z,level` and entry values `{ object?, floor?, roof? }`. Remove empty entries. Normalize saved entries once in the constructor and expose copies from `column(x,z)` so callers cannot mutate the map accidentally.

- [ ] **Step 4: Run `StructureState` tests**

Run: `npm test -- --run tests/structures.test.js`

Expected: PASS.

- [ ] **Step 5: Write failing migration and compatibility tests**

Construct an old-format save containing a placed wall, floor, and roof on one tile plus a natural removal override elsewhere. Assert all constructed pieces appear at level `0`, the natural override stays in `WorldState.over`, migration does not duplicate on a second load, level-aware accessors work, and `Game.serialize()` emits `structures` rather than populated legacy floor/roof maps. Add a mixed-format collision fixture and assert the layered value wins while the displaced legacy item appears exactly once in `structureOverflow`.

- [ ] **Step 6: Run migration tests and verify RED**

Run: `npm test -- --run tests/structures.test.js tests/game.test.js -t "layered structure|legacy structure"`

Expected: FAIL because `WorldState` and `Game.serialize()` do not use layered structures.

- [ ] **Step 7: Integrate migration into `WorldState` and `Game`**

Initialize `WorldState.structures` from `save.structures`, then migrate legacy `placed` objects and legacy floor/roof maps into empty level-0 slots. When a layered slot is already occupied, keep it and append the displaced legacy item to `structureOverflow`. Keep ground-level default arguments so current callers and tests continue to work. Serialize natural overrides separately from `structures`.

- [ ] **Step 8: Run Task 1 tests and the full suite**

Run: `npm test -- --run tests/structures.test.js tests/game.test.js && npm test`

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Commit: `refactor: add layered structure state and save migration`

### Task 2: Layer-Aware Placement, Support, Removal, and Materials

**Files:**
- Modify: `src/game/game.js`
- Modify: `src/game/items.js`
- Modify: `src/game/crafting.js`
- Modify: `src/world/objects.js`
- Test: `tests/structures.test.js`
- Test: `tests/game.test.js`

**Interfaces:**
- Consumes: Task 1 `StructureState` and constants.
- Produces: `Game.buildLevel: 0|1|2`, `Game.setBuildLevel(level): boolean`, `Game.levelBaseY(tx, tz, level): number`, `Game.supports(tx, tz, level, kind): boolean`, and `Game.canPlace(tx, tz, level = this.buildLevel): boolean`.
- Produces items: `stone_stairs`, `brick_stairs`, `stone_roof`, `brick_roof`; existing `stairs` and `roof` remain timber/shingle compatibility IDs.

- [ ] **Step 1: Write failing support and placement tests**

Test ground placement, upper floors supported by a lower floor/wall, upper objects requiring same-level floors, roofs requiring same-level structure and no higher floor, stairs requiring a clear landing, level bounds, occupation per storey, out-of-reach placement, and inventory preservation on every invalid result.

- [ ] **Step 2: Run focused placement tests and verify RED**

Run: `npm test -- --run tests/structures.test.js -t "support|layered placement|invalid layered placement"`

Expected: FAIL because build-level support rules do not exist.

- [ ] **Step 3: Implement build-level and support rules**

Add the exact methods in Interfaces. Update `primary`, `secondary`, and component removal to accept/use the selected level, affect only that level, and return the exact placed material. Removing support leaves upper entries untouched.

- [ ] **Step 4: Run support and placement tests**

Run: `npm test -- --run tests/structures.test.js -t "support|layered placement|invalid layered placement"`

Expected: PASS.

- [ ] **Step 5: Write failing material-family tests**

Assert wood, stone, and brick each expose a wall, floor, stairs, and roof item; each recipe uses its documented resource language; crafting output counts remain consistent with the existing build economy; shared doors/windows can be placed on every family floor.

- [ ] **Step 6: Run material tests and verify RED**

Run: `npm test -- --run tests/game.test.js -t "structural families"`

Expected: FAIL because stone/brick stairs and roofs do not exist.

- [ ] **Step 7: Add the complete material families**

Define the four new item/object IDs and workbench recipes. Keep `stairs` and `roof` names/save IDs stable. Mark every structural item with a family metadata value (`wood`, `stone`, `brick`, or `coral`) for UI grouping and effect colors.

- [ ] **Step 8: Run Task 2 tests and full suite**

Run: `npm test -- --run tests/structures.test.js tests/game.test.js && npm test`

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

Commit: `feat: add supported building layers and material families`

### Task 3: Vertical Movement, Collision, Shelter, and Beds

**Files:**
- Modify: `src/game/game.js`
- Modify: `src/world/structures.js` only for read helpers proven necessary by tests
- Test: `tests/structures.test.js`
- Test: `tests/game.test.js`

**Interfaces:**
- Consumes: Task 1 constants/state and Task 2 structure metadata.
- Produces: `Game.storeyAt(x, z, y): 0|1|2`, `Game.standY(x, z): number`, `Game.blocked(x, z, radius = 0.28, animal = false, y = this.player.y): boolean`, and `Game.isShelteredAt(x, z, level): boolean` with vertical-span checks.
- Produces: stairs objects store `rotation: 0|1|2|3`; beds store `{ x, z, level }`.

- [ ] **Step 1: Write failing storey and collision tests**

Cover local terrain heights, a player on level 1 above a level-0 wall, a same-level wall blocking, closed/open doors on upper levels, ground-bound animals, and the stuck-player walk-out rule at each level.

- [ ] **Step 2: Run collision tests and verify RED**

Run: `npm test -- --run tests/structures.test.js -t "storey|vertical collision"`

Expected: FAIL because collision ignores height.

- [ ] **Step 3: Implement storey-aware standing and collision**

Derive storey from `y - local terrain height`, then select the highest valid floor/stair surface not above the player step/jump allowance. Give constructed objects vertical spans `[baseY, baseY + STOREY_HEIGHT)` and compare them with the player's body span before applying horizontal collision.

- [ ] **Step 4: Run collision tests**

Run: `npm test -- --run tests/structures.test.js -t "storey|vertical collision"`

Expected: PASS.

- [ ] **Step 5: Write failing stairs, shelter, and bed tests**

Test all four stair rotations climb from one floor to the next over exactly `1.5` units, descent reverses smoothly, and missing landings block ascent. Test that shelter requires a same-storey floor, a roof or upper floor overhead, and enclosing same-storey walls; an opening or walls on another level must fail. Test that upper beds wake on their saved floor and a missing/blocked upper bed falls back to safe dry ground beside the building.

- [ ] **Step 6: Run vertical gameplay tests and verify RED**

Run: `npm test -- --run tests/structures.test.js tests/game.test.js -t "stairs|upper shelter|upper bed"`

Expected: FAIL because stairs rise only one unit and shelter/beds are ground-only.

- [ ] **Step 7: Implement stairs, shelter, and bed-level behavior**

Store stair rotation at placement, calculate its ramp along the corresponding local axis, and require destination support. Implement `isShelteredAt` from the exact floor/overhead/enclosure conditions and route status/exposure checks through it. Persist bed level; validate it in `faint()` before choosing the documented safe fallback.

- [ ] **Step 8: Run Task 3 tests and full suite**

Run: `npm test -- --run tests/structures.test.js tests/game.test.js && npm test`

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

Commit: `feat: make upper storeys walkable and sheltered`

### Task 4: Per-Storey Models, Chunk Rendering, and Camera Visibility

**Files:**
- Modify: `src/render/homestead.js`
- Modify: `src/render/models.js`
- Modify: `src/render/chunks.js`
- Modify: `src/main.js` (ghost/marker elevations and selected-level render input)
- Test: `tests/homestead.test.js`

**Interfaces:**
- Consumes: `STOREY_HEIGHT`, structure entries, item IDs, rotations, `Game.storeyAt`, and `Game.buildLevel`.
- Produces: model keys `stone_stairs`, `brick_stairs`, `stone_roof`, `brick_roof`.
- Produces: chunk layer groups `levels[0..2]`, each with separate object and roof meshes; `ChunkManager.updateVisibility(playerLevel, inside, buildLevel)`.

- [ ] **Step 1: Write failing model and layer-data tests**

Assert every structural item has a model, stairs span exactly one storey, roofs use distinct wood/stone/brick palettes, saved rotations survive the render-data conversion, and a chunk separates meshes by level and roof/object role.

- [ ] **Step 2: Run render-data tests and verify RED**

Run: `npm test -- --run tests/homestead.test.js -t "storey|structural model|layer mesh"`

Expected: FAIL because the new models and per-level mesh data do not exist.

- [ ] **Step 3: Add structural models and per-level chunk meshes**

Build full-height six-step stairs for all three families and distinct roof palettes. Split natural objects from constructed level meshes so hiding upper structures does not hide trees/crops. Position every structure at `terrain.h + level * STOREY_HEIGHT`.

- [ ] **Step 4: Run model and layer-data tests**

Run: `npm test -- --run tests/homestead.test.js -t "storey|structural model|layer mesh"`

Expected: PASS.

- [ ] **Step 5: Implement visibility and placement rendering**

Outdoors, show all levels. When a floor or roof is directly overhead, hide structure/roof meshes above the player's storey while preserving the selected build level's translucent ghost. Raise marker and ghost to `levelBaseY`; apply saved door/stair rotation.

- [ ] **Step 6: Run render tests and production build**

Run: `npm test -- --run tests/homestead.test.js && npm run build`

Expected: PASS and successful Vite build.

- [ ] **Step 7: Commit Task 4**

Commit: `feat: render layered homes and matching materials`

### Task 5: Layer Targeting, Controls, and HUD

**Files:**
- Modify: `src/main.js`
- Modify: `src/ui/controllers.js`
- Modify: `src/ui/hud.js`
- Modify: `src/ui/style.css`
- Modify: `index.html`
- Modify: `src/settings.js` if key labels are centralized there
- Test: `tests/ui.test.js`

**Interfaces:**
- Consumes: `Game.setBuildLevel`, `Game.storeyAt`, `Game.canPlace`, and Task 4 level rendering.
- Produces: target shape includes `level`; `buildLevelLabel(level): 'Ground'|'Floor 2'|'Floor 3'` in a small pure UI helper; controller commands `layerDown` and `layerUp`.

- [ ] **Step 1: Write failing target/control-state tests**

Test label output, clamping to `0..2`, active level following the player's storey when no manual build adjustment exists, manual selection limited to one level from the player, controller command routing only while holding a buildable, and automatic reset after leaving build mode.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm test -- --run tests/ui.test.js -t "build layer"`

Expected: FAIL because build-layer UI/control helpers do not exist.

- [ ] **Step 3: Implement keyboard/controller/touch layer commands**

Bind `[`/`]`, controller D-pad left/right in build mode, and `layerDown`/`layerUp` touch buttons. Preserve existing panel navigation and non-build controller behavior. Show touch layer buttons only when `ITEMS[held.id]` is buildable.

- [ ] **Step 4: Implement layer-aware targeting and HUD labels**

Derive target level from raycast height unless manual build selection is active. Pass target level through primary/secondary actions. Display the active label beside placement hints and include it in target descriptions; invalid upper placement remains red and non-consuming.

- [ ] **Step 5: Run Task 5 UI tests**

Run: `npm test -- --run tests/ui.test.js -t "build layer"`

Expected: PASS.

- [ ] **Step 6: Run full suite and build**

Run: `npm test && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

Commit: `feat: add build layer controls and targeting`

### Task 6: Rendered Construction QA and Final Verification

**Files:**
- Modify only files needed for defects found during verification, always adding a failing regression test first.
- Use temporary browser scripts/screenshots outside the repository.

**Interfaces:**
- Consumes: completed Tasks 1–5 and the completed beta patch.
- Produces: verified three-storey construction flow and evidence.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all Vitest tests PASS with no unreported failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: successful Vite build without errors.

- [ ] **Step 3: Verify a three-storey wood house**

Flow: place ground floor/walls → build timber stairs → select Floor 2 → place floor/walls/door/furniture → repeat for Floor 3 → cap with shingle roof → walk every stair in both directions → interact with upper door/storage/bed → save/reload and confirm exact state.

- [ ] **Step 4: Verify a mixed-material house and invalid states**

Build with stone lower level and brick upper level, slate/tile roof sections, and shared doors/windows. Attempt unsupported, occupied, out-of-range, and level-3 placements; confirm red previews, no item loss, and no console errors.

- [ ] **Step 5: Verify camera and controls across viewports**

At 1440×900, 844×390, and 390×844, verify exterior levels render, upper layers hide when indoors, build labels match the selected level, touch layer buttons do not overlap survival controls/minimap, and all controls remain reachable.

- [ ] **Step 6: Verify browser health**

Check URL/title, nonblank content, no framework overlay, no relevant console warnings/errors, and capture screenshots of the complete exterior, each interior storey, mixed-material house, and mobile build controls.

- [ ] **Step 7: Inspect final diff and save compatibility**

Run: `git diff --check && git status --short`

Load a legacy fixture and a newly layered save, then verify both serialize and reload without data loss.

- [ ] **Step 8: Commit verification fixes if any**

Commit: `test: verify multi-storey building flow`
