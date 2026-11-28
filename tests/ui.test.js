import { describe, it, expect } from 'vitest';

describe('harvest presentation', () => {
  it('uses a large leafy burst when a bush is destroyed', async () => {
    const effects = await import('../src/render/effects.js');
    const hitEffect = effects.hitEffect ?? (() => null);

    expect(hitEffect('bush', false)).toEqual({ color: 0x6cc257, cubes: 6, sparks: 4 });
    expect(hitEffect('bush', true)).toEqual({ color: 0x6cc257, cubes: 16, sparks: 10 });
  });

  it('labels tilling and restoring ground distinctly', async () => {
    const ui = await import('../src/ui/hud.js');
    const objectToolVerb = ui.objectToolVerb ?? (() => null);

    expect(objectToolVerb('hoe', null)).toBe('Till');
    expect(objectToolVerb('hoe', { t: 'soil', crop: -1 })).toBe('Restore ground');
    expect(objectToolVerb('hoe', { t: 'soil', crop: 0 })).toBe('Tool');
  });
});

describe('the touch button looks after hunger and thirst', () => {
  const game = ({ hunger = 5, thirst = 5, foodSlot = -1, source = null, held = null } = {}) => ({
    player: { hunger, thirst },
    held,
    foodSlot: () => foodSlot,
    drinkSource: () => source,
  });

  it('eats when food is held, or when hunger is getting low and there is food', async () => {
    const { needAction } = await import('../src/ui/touch-actions.js');
    expect(needAction(game({ hunger: 9, held: { id: 'berries' }, foodSlot: 0 }))).toBe('eat');
    expect(needAction(game({ hunger: 5, foodSlot: 12 }))).toBe('eat');
    expect(needAction(game({ hunger: 8, foodSlot: 12 }))).toBe(null); // not pressing yet, and nothing held
    expect(needAction(game({ hunger: 10, held: { id: 'berries' }, foodSlot: 0 }))).toBe(null); // full
    expect(needAction(game({ hunger: 2 }))).toBe(null); // nothing to eat
  });

  it('drinks at fresh water, from a held flask, or when thirst is getting low', async () => {
    const { needAction } = await import('../src/ui/touch-actions.js');
    expect(needAction(game({ thirst: 9, source: 'pond' }))).toBe('drink');
    expect(needAction(game({ thirst: 9, source: 'flask', held: { id: 'flask' } }))).toBe('drink');
    expect(needAction(game({ thirst: 5, source: 'flask' }))).toBe('drink');
    expect(needAction(game({ thirst: 8, source: 'flask' }))).toBe(null);
    expect(needAction(game({ thirst: 10, source: 'pond' }))).toBe(null); // not thirsty
    expect(needAction(game({ thirst: 1, source: null }))).toBe(null); // salt, ice, boiling or no water: nothing to drink
  });

  it('puts thirst first when both are pressing', async () => {
    const { needAction } = await import('../src/ui/touch-actions.js');
    expect(needAction(game({ hunger: 2, thirst: 2, foodSlot: 3, source: 'flask' }))).toBe('drink');
  });
});