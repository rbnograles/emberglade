import { describe, it, expect } from 'vitest';
import { HEADROOM, PLAYER_HEIGHT, floorOf, surfaces, slabTopBelow, ceilingAbove, solidAt, solids } from '../src/world/columns.js';

const land = (h, slabs) => ({ h, water: false, bed: null, slabs });
const sea = (bed, slabs) => ({ h: -0.3, water: true, bed, slabs });

describe('a tile read as a column of rock and air', () => {
  it('knows its floor and the heights that can be stood on', () => {
    expect(HEADROOM).toBe(2);
    expect(PLAYER_HEIGHT).toBe(1.5);
    expect(floorOf(land(3))).toBe(3);
    expect(floorOf(sea(-4))).toBe(-4);
    expect(surfaces(land(1))).toEqual([1]);
    expect(surfaces(land(1, [[4, 6], [9, 10]]))).toEqual([1, 6, 10]);
  });

  it('finds the rock under and over a height', () => {
    const t = land(0, [[4, 6], [9, 10]]);
    expect(slabTopBelow(t, 3)).toBe(-Infinity);
    expect(slabTopBelow(t, 6)).toBe(6);
    expect(slabTopBelow(t, 20)).toBe(10);
    expect(slabTopBelow(land(0), 20)).toBe(-Infinity);
    expect(ceilingAbove(t, 0)).toBe(4);
    expect(ceilingAbove(t, 6)).toBe(9);
    expect(ceilingAbove(t, 10)).toBe(Infinity);
    expect(ceilingAbove(land(0), 0)).toBe(Infinity);
  });

  it('tells whether rock lies between two heights', () => {
    const t = land(0, [[4, 6]]);
    expect(solidAt(t, 0, 4)).toBe(false); // touching the underside is not inside it
    expect(solidAt(t, 0, 4.5)).toBe(true);
    expect(solidAt(t, 6, 8)).toBe(false); // standing on top is not inside it
    expect(solidAt(t, 5, 5.5)).toBe(true);
    expect(solidAt(land(0), 0, 100)).toBe(false);
  });

  it('lists its solid ranges from the bottom up', () => {
    expect(solids(land(2))).toEqual([[-Infinity, 2]]);
    expect(solids(sea(-4, [[2, 5]]))).toEqual([[-Infinity, -4], [2, 5]]);
  });
});
