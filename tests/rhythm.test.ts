import { describe, expect, it } from 'vitest';
import { classify, createRhythm, deathReason, isStanding, perceivedInterval, registerStep } from '../src/game/rhythm';

const T = 0.5;
const TOL = 0.25;

describe('classify', () => {
  it('grades intervals against the tempo', () => {
    expect(classify(0.5, T, TOL)).toBe('steady');
    expect(classify(0.4, T, TOL)).toBe('steady');
    expect(classify(0.3, T, TOL)).toBe('fast');
    expect(classify(0.1, T, TOL)).toBe('flinch');
    expect(classify(0.7, T, TOL)).toBe('slow');
    expect(classify(2, T, TOL)).toBe('start');
  });
});

describe('registerStep', () => {
  it('restarts at the local norm after standing and smooths afterwards', () => {
    const r = createRhythm(T);
    expect(registerStep(r, 10, T, TOL, false)).toBe('start');
    expect(r.ema).toBe(T);
    registerStep(r, 10.3, T, TOL, true);
    expect(r.ema).toBeLessThan(T);
    expect(r.ema).toBeGreaterThan(0.3);
    expect(r.run).toBe(2);
  });

  it('counts accuracy only on the road', () => {
    const r = createRhythm(T);
    registerStep(r, 0, T, TOL, false);
    registerStep(r, 0.5, T, TOL, false);
    registerStep(r, 1.0, T, TOL, true);
    registerStep(r, 1.2, T, TOL, true);
    expect(r.roadSteps).toBe(2);
    expect(r.goodSteps).toBe(1);
  });

  it('detects standing still', () => {
    const r = createRhythm(T);
    registerStep(r, 0, T, TOL, true);
    expect(isStanding(r, 0.5, T)).toBe(false);
    expect(isStanding(r, 1.0, T)).toBe(true);
  });

  it('drivers blend the norm with the observed pace', () => {
    const r = createRhythm(T);
    r.ema = 0.3;
    expect(perceivedInterval(r, T, 0)).toBe(T);
    expect(perceivedInterval(r, T, 1)).toBe(0.3);
    expect(perceivedInterval(r, T, 0.5)).toBeCloseTo(0.4);
  });
});

describe('deathReason', () => {
  const bike = { avoids: true, kind: 'bike' };
  const steadyRun = () => {
    const r = createRhythm(T);
    for (let i = 0; i < 6; i++) registerStep(r, i * T, T, TOL, true);
    return r;
  };

  it('blames cars and buses on not yielding', () => {
    expect(deathReason(steadyRun(), 2.6, T, TOL, { avoids: false, kind: 'bus' })).toBe('bus');
    expect(deathReason(steadyRun(), 2.6, T, TOL, { avoids: false, kind: 'car' })).toBe('car');
  });

  it('names the rhythm mistake', () => {
    expect(deathReason(steadyRun(), 2.5 + T * 1.5, T, TOL, bike)).toBe('froze');
    const flinch = steadyRun();
    registerStep(flinch, 2.6, T, TOL, true);
    expect(deathReason(flinch, 2.62, T, TOL, bike)).toBe('flinch');
    const rush = steadyRun();
    registerStep(rush, 2.8, T, TOL, true);
    expect(deathReason(rush, 2.82, T, TOL, bike)).toBe('rushed');
    const fresh = createRhythm(T);
    registerStep(fresh, 0, T, TOL, true);
    expect(deathReason(fresh, 0.1, T, TOL, bike)).toBe('cutoff');
  });
});
