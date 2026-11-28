// The touch bar mirrors actions that can succeed right now; keyboard shortcuts stay available.
export function touchActionState(game) {
  const source = game.drinkSource();
  return {
    eat: { visible: game.player.hunger < 10 && game.foodSlot() >= 0, label: 'Eat' },
    drink: {
      visible: game.player.thirst < 10 && source !== null,
      label: source === 'pond' ? 'Drink pond' : source === 'flask' ? 'Drink flask' : 'Drink',
    },
  };
}
