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

describe('touch survival actions', () => {
  const load = async () => {
    try {
      return (await import('../src/ui/touch-actions.js')).touchActionState;
    } catch {
      return () => ({ eat: { visible: false, label: 'Eat' }, drink: { visible: false, label: 'Drink' } });
    }
  };
  const game = ({ hunger = 5, thirst = 5, foodSlot = -1, source = null, held = null } = {}) => ({
    player: { hunger, thirst },
    held,
    foodSlot: () => foodSlot,
    drinkSource: () => source,
  });

  it('offers Eat for held or inventory food only while hungry', async () => {
    const touchActionState = await load();
    expect(touchActionState(game({ held: { id: 'berries' }, foodSlot: 0 })).eat).toEqual({ visible: true, label: 'Eat' });
    expect(touchActionState(game({ foodSlot: 12 })).eat).toEqual({ visible: true, label: 'Eat' });
    expect(touchActionState(game({ hunger: 10, foodSlot: 0 })).eat).toEqual({ visible: false, label: 'Eat' });
    expect(touchActionState(game()).eat).toEqual({ visible: false, label: 'Eat' });
  });

  it('offers the exact available drink source only while thirsty', async () => {
    const touchActionState = await load();
    expect(touchActionState(game({ source: 'flask' })).drink).toEqual({ visible: true, label: 'Drink flask' });
    expect(touchActionState(game({ source: 'pond' })).drink).toEqual({ visible: true, label: 'Drink pond' });
    for (const unavailable of ['empty flask', 'salty sea', 'frozen water', 'boiling water', 'no source']) {
      expect(touchActionState(game({ source: null })).drink, unavailable).toEqual({ visible: false, label: 'Drink' });
    }
    expect(touchActionState(game({ thirst: 10, source: 'pond' })).drink).toEqual({ visible: false, label: 'Drink pond' });
  });
});
