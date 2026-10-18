import { describe, expect, it } from 'vitest';
import { BOTS, runBot } from '../src/game/bots';
import { generateStreet } from '../src/game/endless';

const RUNS = [101, 202, 303];

describe('endless rush hour', () => {
  it('builds the same street for the same seed and number', () => {
    expect(generateStreet(5, 7)).toEqual(generateStreet(5, 7));
    expect(generateStreet(5, 7)).not.toEqual(generateStreet(6, 7));
  });

  it('gets harder as it goes', () => {
    const lanes = (n: number) =>
      RUNS.reduce((s, seed) => s + generateStreet(seed, n).strips.filter((x) => x.spawn).length, 0);
    expect(lanes(20)).toBeGreaterThan(lanes(0));
    expect(generateStreet(1, 20).tempo).toBeLessThan(generateStreet(1, 0).tempo);
  });

  for (let n = 0; n <= 20; n += 2) {
    it(`a perfectly steady walker always makes it: street ${n + 1}`, () => {
      for (const seed of RUNS) {
        const level = generateStreet(seed, n);
        for (let s = 1; s <= 4; s++) expect(runBot(level, s * 7907, BOTS.perfect).status).toBe('won');
      }
    });
  }
});
