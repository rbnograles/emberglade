# Front door: account, title and new-game wizard

Approved 2026-11-28.

## Goal

Opening Emberglade leads through: account (log in, sign up, guest) → title → new-game wizard
(character → difficulty → world → custom rules → summary). The tabbed menu stays as the in-game pause menu.

## Flow

- **Account screen**: Log in, Sign up, Continue as guest. Shown only when nobody is signed in and guest
  has not been chosen on this device (`emberglade-entry` in localStorage: `guest` or `account`).
  Uses the existing Supabase email/password accounts. Without Supabase settings, Log in and Sign up are
  disabled with a note; guest still works. A session that is already signed in skips straight to the title.
- **Title screen**: Continue (the current slot, when it holds a world), New Game, Load World (three slots,
  with delete), Settings (opens the existing menu on its Settings and Controls tabs), account chip.
- **Wizard**: five steps with a step bar, Back and Next.

## Character (per world)

`save.character = { name, cls, look }`. Old saves get the device's shared look and no class.

- Look: skin, build (slim / average / stocky), height (short / average / tall), ten hair styles, hair colour,
  eye colour, brows, beard, face mark, shirt, trousers, boots, accessory (scarf, cape, headband, glasses, hat)
  and its colour.
- Class: Forager, Warrior, Wayfarer, Mason, Farmer, Mariner. Each gives 3 starting stat points
  (already spent, tracked as `progress.bonus`) and a small kit of existing items.
- Preview: drag to turn, zoom to the face, Randomise, Reset. One creator is shared by the wizard and the
  pause menu's Character tab (which edits the current world's look, not the class).

## Difficulty and rules

`save.rules = { drain, enemyDamage, enemies, dayLength, keepPack, xp }`, `save.difficulty` = preset id or `custom`.

Presets: Peaceful (no hostile creatures), Relaxed, Standard, Challenging, Brutal. A save from before
rules existed names only its difficulty and takes on that preset.

Custom rules step: sliders and choices for each rule, starting from the preset; changing anything
shows "Custom", and Reset returns to the preset.

## World types

`save.worldType`, default `continents`. Each is a parameter set for `Worldgen`:
Classic Continents, Thousand Isles, Endless Ocean, Great Mainland, Highlands, Frostbound, Emberlands, Wildwood.
The world step shows a map thumbnail of each for the current seed, with Reroll and a seed box
(numbers are used as they are; words are hashed).

## Starting a game

The wizard writes `emberglade-newgame` (slot, character, difficulty, rules, worldType, seed), clears that
slot, selects it and reloads; the game reads the setup once, builds the world and starts playing.
A slot with no save shows a backdrop world behind the menu that is never saved or synced.

## Code

- `src/game/rules.js` presets and rule handling; `src/game/classes.js`; `src/game/looks.js` look options;
  `src/world/worldtypes.js`; `src/world/preview.js` map thumbnails.
- `src/ui/frontdoor.js` screens and wizard; `src/ui/creator.js` character creator.
- Changes: `worldgen.js` (parameters), `game.js` (rules, character, setup), `progress.js` (bonus points),
  `characters.js` (new look parts), `hud.js` (portrait), `menu.js`, `save.js`, `main.js`, `index.html`, `style.css`.
- Tests: rules, classes, looks, world types, new-game setup and save round trip.
