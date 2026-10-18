import { describe, expect, it } from 'vitest';
import { BOTS, runBot } from '../src/game/bots';
import { computeLayout, LEVELS, type Level } from '../src/game/levels';
import { createWorld, tick } from '../src/game/world';

const SEEDS = 25;

function survival(level: Level, bot: keyof typeof BOTS): number {
  let won = 0;
  for (let s = 1; s <= SEEDS; s++) if (runBot(level, s * 104729, BOTS[bot]).status === 'won') won++;
  return won / SEEDS;
}

describe('the local law', () => {
  for (const level of LEVELS) {
    it(`a perfectly steady walker always makes it: ${level.name}`, () => {
      expect(survival(level, 'perfect')).toBe(1);
    });
  }

  it('the tutorial forgives a slightly uneven step', () => {
    expect(survival(LEVELS[0], 'jitter10')).toBeGreaterThanOrEqual(0.95);
  });

  it('rushing gets punished once traffic is dense', () => {
    expect(survival(LEVELS[1], 'rusher')).toBeLessThan(survival(LEVELS[1], 'perfect'));
    expect(survival(LEVELS[2], 'rusher')).toBeLessThan(0.5);
  });

  for (const level of LEVELS.slice(3)) {
    it(`rushing rarely survives the late streets: ${level.name}`, () => {
      expect(survival(level, 'rusher')).toBeLessThan(0.5);
    });
  }

  it('the second street still forgives a slightly uneven step', () => {
    expect(survival(LEVELS[1], 'jitter10')).toBeGreaterThanOrEqual(0.9);
  });
});

describe('world', () => {
  it('is deterministic for a seed', () => {
    const level = LEVELS[1];
    const layout = computeLayout(level);
    const a = createWorld(level, 42, layout);
    const b = createWorld(level, 42, layout);
    for (let i = 0; i < 300; i++) {
      const taps = i % 30 === 0 ? 1 : 0;
      tick(a, level, layout, taps);
      tick(b, level, layout, taps);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('starts with traffic already on the road', () => {
    const w = createWorld(LEVELS[0], 1);
    expect(w.vehicles.length).toBeGreaterThan(2);
    expect(w.status).toBe('playing');
  });
});
