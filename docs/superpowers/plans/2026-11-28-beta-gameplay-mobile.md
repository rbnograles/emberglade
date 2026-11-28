# Beta Gameplay and Mobile UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved beta patch for harvesting feedback, clearable bushes and soil, functional doors, trustworthy morning transitions, contextual touch actions, and phone-safe UI.

**Architecture:** Keep gameplay decisions in `Game` and object definitions, expose small pure UI selectors for touch actions, and let Three.js/CSS render the resulting state. Extend existing events with object/material context instead of creating a parallel effects system, and store backward-compatible door fields directly on placed door objects.

**Tech Stack:** JavaScript ES modules, Three.js 0.187, Vite 8, Vitest 5, CSS, bundled Fontsource Nunito.

**Spec:** `docs/superpowers/specs/2026-11-28-beta-gameplay-mobile-design.md`

## Global Constraints

- Existing saves must continue to load; absent door state fields must default safely.
- Desktop keyboard, mouse, and controller behavior must remain available.
- Touch targets remain comfortably tappable and respect safe-area insets.
- Gameplay state remains authoritative in the game layer; rendering and UI reflect it.
- Do not add terrain deformation, shovel progression, or new external dependencies.

## Review Focus

- A natural dawn at low hunger/thirst but positive health must not trigger fainting or change coordinates; Task 1 tests the boundary explicitly.
- A natural object regrowing under the player at dawn must not teleport them; Task 1 tests coordinate stability and walk-out behavior.
- Berry gathering without an axe must remain possible while an axe can clear the bush; Task 2 tests both paths.
- Doors loaded from old saves without `open` or `rotation` must remain usable and consistently oriented; Task 3 tests defaults.
- Touch actions must not offer pond water at salty, frozen, or boiling water; Task 4 tests every source class.

---

### Task 1: Morning Position Integrity

**Files:**
- Modify: `src/game/game.js` (`tick`, `startDay`, `faint` messaging)
- Test: `tests/game.test.js`

**Interfaces:**
- Consumes: existing `Game.tick(dt)`, `Game.startDay(skipped)`, and `Game.faint()`.
- Produces: natural dawn preserves `player.x/y/z`; faint relocation emits a clear toast identifying bed or original start.

- [ ] **Step 1: Add failing dawn regression tests**

Add tests named `natural dawn preserves the player position` and `fainting explains an intentional morning relocation`. Assert exact coordinates before/after `tick()` crosses `time === 1`, including a regrowing object override at the player's tile; separately assert a zero-health faint moves to bed/spawn and records an explanatory toast.

- [ ] **Step 2: Run the focused tests and verify the intended failure**

Run: `npm test -- --run tests/game.test.js -t "morning|dawn|fainting explains"`

Expected: the natural-dawn assertions pass if current behavior is sound, while the explicit relocation explanation fails until implemented. If coordinates fail, stop and trace the exact mutation before editing.

- [ ] **Step 3: Implement the minimal morning-transition clarification**

Keep `startDay(false)` coordinate-free. Update `faint()` to choose an explicit wake destination label (`bed` or `original start`) and include it in the toast while preserving dropped-pack information. Do not add corrective teleport logic to ordinary dawn.

- [ ] **Step 4: Run Task 1 tests**

Run: `npm test -- --run tests/game.test.js -t "morning|dawn|fainting explains"`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Commit: `fix: preserve and explain morning position changes`

### Task 2: Harvest Feedback, Bush Clearing, and Soil Restoration

**Files:**
- Modify: `src/world/objects.js`
- Modify: `src/game/game.js` (`primary` events and bush/soil behavior)
- Modify: `src/main.js` (`toolVerb`, hit colors, event effects)
- Modify: `src/render/effects.js` only if the existing burst API cannot express the destruction burst
- Test: `tests/game.test.js`

**Interfaces:**
- Consumes: `Game.primary(tx, tz)`, `Game.emit(type, data)`, `Particles.burst(...)`, and `Sparks.burst(...)`.
- Produces: `hit` event data `{ x, z, object, destroyed }`; axe-cleared bushes; reversible empty soil; `toolVerb()` labels `Till` or `Restore ground`.

- [ ] **Step 1: Add failing gameplay tests**

Test that hand gathering a berry bush still yields berries and leaves a bare bush; axe hits can remove either bush form and consume durability; removed bushes use the existing regrow mechanism; an empty soil patch is removed by a second hoe use while planted soil is preserved.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- --run tests/game.test.js -t "bush|restore.*soil"`

Expected: FAIL because bushes cannot be axe-cleared and the event/destruction semantics are absent.

- [ ] **Step 3: Implement the game-layer behavior**

Add bush HP/tool metadata without removing the gather path. In `primary`, branch berry gathering from axe damage, allow bare-bush damage, and emit `{ object: obj.t, destroyed }` on successful hits. Keep empty-soil restoration restricted to the hoe and `crop < 0`.

- [ ] **Step 4: Run Task 2 gameplay tests**

Run: `npm test -- --run tests/game.test.js -t "bush|restore.*soil"`

Expected: PASS.

- [ ] **Step 5: Implement material and destruction effects**

In `src/main.js`, derive wood/stone/leaf/dirt colors from `data.object`; use the existing small hit burst for `destroyed === false` and a denser cube-plus-spark burst for `destroyed === true`. Update `toolVerb()` to expose `Restore ground` for empty soil.

- [ ] **Step 6: Run the complete gameplay test file**

Run: `npm test -- --run tests/game.test.js`

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Commit: `feat: add satisfying clearing and harvest feedback`

### Task 3: Stateful, Oriented Doors

**Files:**
- Modify: `src/game/game.js` (`blocked`, placement, `interact`)
- Modify: `src/render/models.js` (closed/open door variants)
- Modify: `src/render/chunks.js` (stored rotation and open state)
- Modify: `src/main.js` (placement preview orientation)
- Modify: `src/world/objects.js` and `src/game/items.js` (door semantics/copy)
- Test: `tests/game.test.js`

**Interfaces:**
- Consumes: placed object shape `{ t: 'door', placed: true }` and player facing supplied to placement.
- Produces: door shape `{ t: 'door', placed: true, open: boolean, rotation: 0|1 }`; `Game.doorRotation(tx, tz, facing): 0|1`; interaction toggles state.

- [ ] **Step 1: Add failing door-state tests**

Cover closed-player collision, closed-animal collision, opening and closing, refusal to close on the player's tile, wall-derived orientation, facing fallback, and old-save objects missing `open`/`rotation`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- --run tests/game.test.js -t "door"`

Expected: FAIL because doors are always passable and cannot toggle.

- [ ] **Step 3: Implement door state and collision**

Add `Game.doorRotation(tx, tz, facing)` and store its result plus `open: false` at placement. Treat `obj.open !== true` as closed for backward compatibility. Add door interaction beside the existing gate interaction and guard closing on the occupied tile.

- [ ] **Step 4: Run door tests**

Run: `npm test -- --run tests/game.test.js -t "door"`

Expected: PASS.

- [ ] **Step 5: Render open/closed models and matching preview**

Create distinct closed/open door model keys in `models.js`. In `chunks.js`, rotate by the stored `rotation` defaulting through the same wall-neighbor rule for old saves; in `main.js`, use the shared orientation decision for the placement ghost.

- [ ] **Step 6: Run gameplay tests and build**

Run: `npm test -- --run tests/game.test.js && npm run build`

Expected: PASS and successful Vite build.

- [ ] **Step 7: Commit Task 3**

Commit: `feat: make doors open close and face correctly`

### Task 4: Contextual Touch Survival Actions

**Files:**
- Create: `src/ui/touch-actions.js`
- Modify: `src/ui/hud.js`
- Modify: `src/main.js`
- Modify: `index.html` only if stable action IDs are needed
- Test: `tests/ui.test.js`

**Interfaces:**
- Produces: `touchActionState(game): { eat: { visible: boolean, label: string }, drink: { visible: boolean, label: string } }`.
- Consumes: `Game.foodSlot()`, `Game.drinkSource()`, held item definitions, player hunger/thirst, and the existing `[data-action=eat|drink]` buttons.

- [ ] **Step 1: Add failing pure-selector tests**

Cover held food, inventory food, full hunger, filled and empty flask, fresh pond, salty sea, frozen water, boiling water, and no source. Assert exact visibility and labels.

- [ ] **Step 2: Run selector tests and verify RED**

Run: `npm test -- --run tests/ui.test.js -t "touch survival actions"`

Expected: FAIL because `touchActionState` does not exist.

- [ ] **Step 3: Implement `touchActionState(game)`**

Return `Eat`, `Drink flask`, or `Drink pond` only when the corresponding existing game action can succeed. Keep the function DOM-free and dependency-free.

- [ ] **Step 4: Run selector tests**

Run: `npm test -- --run tests/ui.test.js -t "touch survival actions"`

Expected: PASS.

- [ ] **Step 5: Bind the selector to HUD refresh**

Cache the two action buttons in `Hud`, update their text, `hidden` state, and `aria-hidden` state in `refresh()`, and ensure selection/inventory/position refresh paths update them without changing desktop shortcuts.

- [ ] **Step 6: Run UI tests and full Vitest suite**

Run: `npm test -- --run tests/ui.test.js && npm test`

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Commit: `feat: show contextual food and water touch actions`

### Task 5: Responsive Phone UI and Cozy Typography

**Files:**
- Modify: `src/ui/style.css`
- Modify: `index.html` (semantic wrappers or concise mobile help copy only if required)
- Test: temporary Playwright validation script outside the repository

**Interfaces:**
- Consumes: existing menu shell, touch bar/pads, minimap, big-map frame, and Nunito font imports.
- Produces: safe-area-aware responsive layout with no overlap at representative phone sizes.

- [ ] **Step 1: Capture failing rendered evidence**

Start `npm run dev -- --host 127.0.0.1`. At 844×390 landscape and 390×844 portrait, capture menu and in-game/map screenshots plus bounding boxes for menu shell, minimap, touch bar, and viewport. Record any clipping, overlap, or off-screen controls.

- [ ] **Step 2: Consolidate responsive CSS**

Add a final mobile section that uses `100dvh`, safe-area insets, `clamp()` sizing, internal menu scrolling, a minimap size based on the shorter viewport dimension, a big-map frame constrained in both axes, wrapping map actions/help text, and minimum readable Nunito body/control sizes. Remove or neutralize conflicting later declarations rather than stacking another contradictory breakpoint.

- [ ] **Step 3: Re-run the exact rendered checks**

Expected: menu shell and map frame remain inside the viewport; minimap and touch bar bounding boxes do not intersect; all touch controls remain reachable; contextual Eat/Drink buttons reflow without leaving a gap; no horizontal page scrolling.

- [ ] **Step 4: Check desktop regression**

At 1440×900, verify the menu, HUD, minimap, and full map retain their intended desktop layout and readable Nunito styling.

- [ ] **Step 5: Commit Task 5**

Commit: `fix: scale menus maps and controls to phone screens`

### Task 6: Final Verification

**Files:**
- Modify only files needed for defects found by verification, with a failing regression test first.

**Interfaces:**
- Consumes: completed Tasks 1–5.
- Produces: test, build, and rendered evidence for handoff.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`

Expected: all Vitest tests PASS with no unreported failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: Vite build succeeds without errors.

- [ ] **Step 3: Exercise the target flow in a browser**

Flow: load game → gather then clear a bush → till and restore soil → place/open/close a door → cross natural dawn away from spawn → select food/flask and approach pond → open menu and full map at desktop and both mobile viewports.

- [ ] **Step 4: Check browser health and screenshots**

Verify correct URL/title, nonblank app content, no framework overlay, no relevant console errors/warnings, and screenshot evidence for desktop plus 844×390 and 390×844.

- [ ] **Step 5: Review the diff and working tree**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intentional source, test, spec, and plan changes remain.

- [ ] **Step 6: Commit final verification fixes if any**

Commit: `test: verify beta gameplay and mobile fixes`
