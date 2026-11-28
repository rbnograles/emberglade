# Beta Gameplay and Mobile UI Design

## Intent

Make harvesting, clearing a building site, doors, and mobile survival controls feel clear and satisfying after beta feedback. The patch should improve moment-to-moment feedback and make the existing interface fit real phones without changing the procedural terrain model or invalidating saves.

## Goals

- Give wood, stone, bushes, and other breakable objects material-colored particles on every successful hit plus a larger destruction burst when removed.
- Make berry bushes and picked bushes removable like other natural obstacles while preserving berry gathering and regrowth behavior.
- Let placed doors be opened and closed with the normal interaction control. Closed doors block players and animals; open doors allow passage. Doors should automatically align to adjacent walls and visibly swing between states.
- Keep the existing hoe behavior for dirt: till clear ground into soil, then use the hoe again on empty soil to restore the original ground. Make the action and mobile label clear enough to discover.
- Use contextual mobile survival actions: show Eat when usable food is held or available, and Drink when a flask or nearby drinkable pond is available. The controls must update automatically as inventory, selection, and surroundings change.
- Consolidate mobile sizing around safe-area-aware, viewport-relative rules so the menu, minimap, map dialog, HUD, and touch controls fit common landscape and portrait phone sizes without overlap.
- Retain Nunito as the cozy, readable font, with clearer weight, size, spacing, and line-height choices across menus and HUD text.
- Ensure an ordinary morning rollover never changes the player's world position. Make intentional relocation after fainting unmistakable so it cannot be confused with a random dawn teleport.

## Non-goals

- Destructible or deformable procedural terrain, digging pits, changing elevation, or water simulation.
- New shovel items or crafting progression.
- Reworking keeper animation, ending content, accounts, cloud statistics, quests, audio production, or the other unverified/not-built items in the beta notes.
- A complete balance pass or full play-through.

## Constraints

- Existing saves must continue to load. New door state fields must default safely when absent.
- Desktop keyboard, mouse, and controller behavior must remain available.
- Touch targets should remain comfortably tappable while adapting to small screens and safe-area insets.
- Gameplay state stays authoritative in the game layer; rendering and UI only reflect it.

## Approaches Considered

1. **Focused beta patch — selected.** Extend the existing object, interaction, event, particle, and responsive UI systems. Interpret ground breaking as reversing tilled soil with the hoe. This directly addresses the tester's building and mobile problems with limited save risk.
2. **Full terrain deformation.** Persist edits to generated height and ground tiles, then update collision, rendering, water, saves, and building rules. Rejected for this pass because it is a separate world-system feature with much larger regression risk.

## Design

### Harvesting and clearing

Natural bushes gain hit points and axe interaction. A berry-bearing bush yields its berries when destroyed; a bare bush can also be cleared. Successful hits emit material metadata so the renderer can choose wood, stone, leaf, or dirt colors. Removal emits a distinct destruction event with a denser, wider burst. Existing object drops, tool durability, and regrowth timers remain in the game layer.

### Dirt behavior

The hoe continues to create a soil patch on clear natural ground. Using it on empty, unplanted soil removes that patch and exposes the generated ground again. The target label and touch action label distinguish **Till** from **Restore ground**. Crops cannot be erased accidentally while planted.

### Doors

A placed door stores `open` and orientation state. Placement chooses orientation from adjacent walls, falling back to the player's facing direction when the walls are ambiguous. Interact toggles the door unless closing would trap the player in its tile. Rendering uses closed and open door models with the stored orientation. Collision treats closed doors as blocking and open doors as passable for players; animals continue to respect closed doors.

### Contextual mobile actions

Touch controls derive availability and labels from the same game queries used by desktop actions. Eat appears only when food can be consumed; Drink appears when a flask has water or the player is next to fresh, unfrozen, non-boiling water. The bar reflows when either action is hidden. Tool labels also expose **Till** and **Restore ground**.

### Morning position integrity

Natural time rollover must preserve the player's `x`, `y`, and `z` coordinates except for ordinary physics settling on the same terrain. Sleeping advances the day without relocating the player. Fainting remains the only morning transition that deliberately moves the player to their bed or original spawn; its fade and message must explicitly say that the player fainted and where they woke. A regression test covers natural dawn at a non-spawn location, including a morning when nearby natural objects regrow.

### Responsive UI and typography

Mobile rules are consolidated after the desktop theme so later declarations do not fight earlier breakpoints. Menu shells use dynamic viewport units, safe-area padding, internal scrolling, and compact navigation. The minimap uses a clamped size based on the shorter viewport dimension and reserves space from the touch controls. The full map frame constrains both width and height and allows its help text/actions to wrap. Typography keeps bundled Nunito, uses stronger headings and softer rounded weights for controls, and enforces readable minimum body sizes and line heights.

## Verification

- Unit tests cover bush destruction/drops, soil restoration, door toggling/collision/orientation defaults, contextual Eat/Drink availability, and preservation of player coordinates across natural dawn.
- A separate fainting test confirms that bed/spawn relocation is intentional, produces the correct player-facing explanation, and cannot be triggered merely by the day rolling over.
- Existing Vitest suite and production build pass.
- Rendered QA checks desktop plus representative small landscape and portrait mobile viewports for menu scaling, minimap/touch-control overlap, contextual actions, full-map fit, and door interaction.
- This pass does not claim a complete real-device play-through, deployed-site validation, sound review, or multiplayer Supabase access-rule verification.
