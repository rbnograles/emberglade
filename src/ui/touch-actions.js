import { ITEMS } from '../game/items.js';

// On a touch screen the one big button looks after hunger and thirst as well: when there is nothing
// in reach to hit or pick up, it offers to eat or drink if that would help right now.
// Returns 'eat', 'drink' or null. Holding food or a flask asks for it outright; otherwise standing at
// fresh water offers a drink, and a need only pushes itself forward once it is getting low.
export function needAction(game) {
  const p = game.player, def = game.held ? ITEMS[game.held.id] : null;
  const source = game.drinkSource();
  const canDrink = p.thirst < 10 && source !== null, canEat = p.hunger < 10 && game.foodSlot() >= 0;
  if (def?.flask && canDrink) return 'drink';
  if (def?.food && canEat) return 'eat';
  if (canDrink && source === 'pond') return 'drink';
  if (canDrink && p.thirst < 6) return 'drink';
  if (canEat && p.hunger < 6) return 'eat';
  return null;
}

export const NEED_LABEL = { eat: 'Eat', drink: 'Drink' };
