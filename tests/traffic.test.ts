import { describe, expect, it } from 'vitest';
import { computeLayout, stripAt, type Level } from '../src/game/levels';
import { KINDS } from '../src/game/vehicles';
import { createWorld, tick } from '../src/game/world';

const base: Omit<Level, 'strips'> = {
  id: 'test',
  name: 'test',
  subtitle: '',
  tempo: 0.5,
  tolerance: 0.25,
  adapt: 0.25,
  drivers: { margin: 0, reaction: 1 },
  metronome: false,
  palette: 'day',
};

describe('cars', () => {
  it('ease off, but do not stop, for someone standing in their lane', () => {
    const level: Level = {
      ...base,
      strips: [
        { kind: 'sidewalk', h: 28 },
        { kind: 'car', h: 18, dir: 1, spawn: { every: [1.5, 2.5], speed: [50, 50], kinds: { car: 1 } } },
        { kind: 'sidewalk', h: 28 },
      ],
    };
    const layout = computeLayout(level);
    const w = createWorld(level, 7, layout);
    const lane = layout.strips[1];
    w.ped.y = w.ped.targetY = (lane.top + lane.bottom) / 2;
    // Clear the lane so the next car sees them coming from afar.
    w.vehicles = [];
    w.spawnIn[lane.index] = 0.5;
    let slowest = Infinity;
    for (let i = 0; i < 600 && w.status === 'playing'; i++) {
      tick(w, level, layout, 0);
      for (const v of w.vehicles) if (!v.passed) slowest = Math.min(slowest, v.v / v.baseV);
    }
    expect(slowest).toBeLessThan(0.8);
    expect(slowest).toBeGreaterThanOrEqual(KINDS.car.brake - 0.01);
  });
});

describe('lane changes', () => {
  const level: Level = {
    ...base,
    strips: [
      { kind: 'sidewalk', h: 28 },
      ...[0, 1, 2].map(() => ({
        kind: 'bike' as const,
        h: 16,
        dir: 1 as const,
        spawn: { every: [0.8, 1.6] as [number, number], speed: [40, 50] as [number, number], kinds: { bike: 1 }, drift: 6 },
      })),
      { kind: 'sidewalk', h: 28 },
    ],
  };
  const layout = computeLayout(level);

  it('bikes drift into other lanes of their zone', () => {
    const w = createWorld(level, 3, layout);
    const moved = w.vehicles.filter((v) => stripAt(layout, v.homeY).index !== v.strip);
    expect(moved.length).toBeGreaterThan(0);
    for (const v of w.vehicles) {
      expect(v.homeY).toBeGreaterThanOrEqual(layout.strips[3].top);
      expect(v.homeY).toBeLessThanOrEqual(layout.strips[1].bottom);
    }
  });

  it('stay deterministic', () => {
    const a = createWorld(level, 11, layout);
    const b = createWorld(level, 11, layout);
    for (let i = 0; i < 300; i++) {
      tick(a, level, layout, i % 30 === 0 ? 1 : 0);
      tick(b, level, layout, i % 30 === 0 ? 1 : 0);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
