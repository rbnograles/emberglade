# Multi-Storey Building Design

## Intent

Let players build usable multi-storey homes instead of single-layer shelters. Houses should support distinct architectural styles through coherent material families, remain understandable on desktop and mobile, and preserve all existing worlds.

This subsystem follows the beta gameplay/mobile patch described in `2026-11-28-beta-gameplay-mobile-design.md`; it is not interleaved with that patch.

## Goals

- Support three walkable storeys: ground, upper floor, and top floor.
- Allow floors, walls, doors, windows, stairs, roofs, and suitable furniture on each storey.
- Make collision, interaction, removal, shelter checks, targeting, and placement previews height-aware.
- Provide complete wood, stone, and brick structural families with matching walls, floors, stairs, and roofs.
- Keep shared doors, windows, and furnishings compatible with every structural family; retain coral walls as an optional decorative/coastal material.
- Give builders clear layer selection on keyboard, controller/touch, and the HUD.
- Load existing saves without losing or moving their current buildings.

## Non-goals

- Terrain excavation, basements, underground rooms, elevators, ladders, or more than three storeys.
- Structural physics, collapse simulation, load-bearing stress, or gravity for unsupported pieces after removal.
- Freeform half levels, diagonal walls, curved pieces, or per-voxel editing.
- New decorative furniture sets beyond the existing furnishings.
- Multiplayer synchronization.

## Constraints

- Storey height is `1.5` world units, matching the existing wall height.
- Storey indices are `0`, `1`, and `2`; the data format stores the index explicitly so a future expansion is possible.
- Natural objects, crops, and terrain remain ground-only.
- Existing keyboard, mouse, controller, and touch play must remain usable.
- Building placement must be deterministic and save-compatible.

## Approaches Considered

1. **True layered structures — selected.** Add a height-aware structure map, walkable upper floors, full-height stairs, per-layer collision, and layer-aware rendering. This creates real multi-storey homes and satisfies the request.
2. **Cosmetic wall stacking.** Draw repeated wall models above one tile without upper-floor movement or collision. Rejected because the resulting houses would look tall but could not be used.

## World and Save Model

The world keeps procedural terrain and natural overrides separate from constructed structures.

- Natural/ground state remains keyed by `x,z` for trees, rocks, soil, crops, and removed/regrowing nature.
- Constructed state uses a map keyed by `x,z,level` whose value can contain `{ object, floor, roof }`.
- `object` stores placed walls, doors, windows, stairs, furniture, and stations.
- `floor` is the walkable surface at the base of that storey.
- `roof` caps that storey and is not walkable.

When an old save loads, every placed object and ground floor becomes level `0`; its roof remains the roof over level `0`. The migrated form is written only on the next normal save. Missing level/state fields default to level `0`, closed doors, and the existing orientation rules.

## Placement and Support

Ground-level structures may be placed on suitable dry terrain under the existing rules. Upper-storey construction requires support:

- An upper floor requires a floor, wall, or other structural object directly below.
- An upper wall, door, window, furnishing, or station requires a floor on the same storey.
- A roof requires a wall or structural object on the same storey and cannot coexist with a higher floor.
- Stairs require a floor at their lower end and clear space at the destination storey.
- Removing a supporting piece does not collapse existing pieces, but new unsupported placements remain disallowed.

Placement previews show the selected storey at its real height and use white/red validity coloring. The target label includes the storey name. Removal affects only the targeted storey and returns the exact material item used.

## Storey Selection and Controls

The active build storey normally follows the player's feet. While holding a buildable item, the player can select a storey within one level of their current storey:

- Desktop: `[` lowers and `]` raises the active storey.
- Touch: compact `− Layer` and `+ Layer` buttons appear only while holding a buildable item.
- Controller: D-pad left/right changes the build storey while a buildable is held; otherwise it retains its current selection behavior.

The HUD displays `Ground`, `Floor 2`, or `Floor 3` beside the placement hint. Selecting an unreachable or unsupported storey keeps the preview visible but red and does not consume the item.

## Movement, Stairs, and Collision

The player's current storey is derived from their feet height relative to terrain and nearby constructed floors. Collision checks only objects whose vertical span intersects the player. A wall on the ground storey therefore does not block someone walking on the floor above it.

Stairs rise the full `1.5` units across one tile and store one of four rotations. Placement defaults to the player's facing direction and previews the upper landing. Walking up transitions smoothly onto the next storey's floor; walking down follows the same surface in reverse. Animals and enemies remain ground-bound and do not climb upper-storey stairs in this iteration.

## Rendering and Camera Readability

Each chunk renders structures in separate meshes per storey so visibility can change without rebuilding unrelated terrain. Outdoors, all storeys render and the house reads as a complete exterior. When the player is underneath an upper floor or roof, storeys above the player hide locally so the interior remains readable; the existing near-player transparency continues to handle walls on the active storey.

The placement ghost and cursor marker use the selected storey's elevation. Doors, windows, and stairs use their saved rotation. Roof meshes remain in a dedicated group per storey so they can be hidden without hiding upper walls or floors.

## Shelter and Interaction

A player is sheltered when standing on a constructed floor with a roof or upper floor overhead and enclosing walls on the same storey. Campfires, workbenches, beds, storage, doors, and furnishings interact only when their storey is within vertical reach. Beds save both tile and storey so fainting wakes the player on the correct floor; if that floor is missing or blocked, the safe fallback is the ground beside the building.

## Material Families

Three complete structural families are available:

| Family | Wall | Floor | Stairs | Roof | Character |
|---|---|---|---|---|---|
| Wood | Existing timber wall | Existing plank floor | Timber stairs | Shingle roof | Warm, cozy, inexpensive |
| Stone | Existing stone wall | Existing stone floor | New stone stairs | New slate roof | Sturdy, cool grey |
| Brick | Existing brick wall | Existing brick floor | New brick stairs | New tile roof | Refined red masonry |

Recipes follow existing resource language: wood pieces use wood/sticks/fiber, stone pieces use stone, and brick pieces use stone plus coal. Doors and lattice windows remain shared trim pieces so mixed-material houses are possible. Coral walls remain decorative and do not require a full matching set in this pass.

## Failure Handling

- Invalid, unsupported, occupied, or out-of-reach placements do not consume materials.
- Loading malformed structure levels clamps them to `0..2`; unknown items remain ignored rather than crashing rendering.
- If migration finds both a legacy and layered piece at the same location, the layered piece wins and the legacy item is preserved in a recoverable overflow list for the save migration notice.
- A player loaded inside new collision is allowed to walk out, following the existing stuck-player rule.

## Verification

- Unit tests cover structure-map save migration and round trips, support rules, storey-specific placement/removal, material returns, rotations, collision by height, stairs, shelter, beds, and invalid placement without inventory loss.
- Existing single-storey building tests remain green through compatibility accessors.
- Rendered QA covers a complete three-storey wood house, a mixed stone/brick house, layer previews, stairs, doors, roof hiding, and indoor camera readability.
- Mobile QA verifies layer buttons, placement labels, and no overlap with the contextual survival controls added by the beta patch.
- Full Vitest suite and production build pass before handoff.
