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
