import { DT } from './constants';
import { computeLayout, isSafe, type Layout, type Level } from './levels';
import { makeRng, rand, type Rng } from './rng';
import type { DeathReason } from './rhythm';
import { cloneWorld, createWorld, pedStrip, tick, type World } from './world';

/**
 * Headless players for tests and balance tuning. Every bot "looks" before leaving
 * a safe strip (by simulating a perfect crossing on a copy of the world), then
 * walks with its own flavour of rhythm.
 */
export interface BotStyle {
  name: string;
  /** Interval before the next tap, given the level tempo. */
  interval(tempo: number, rng: Rng): number;
  /** Optional mid-road freeze, seconds, applied once in the first bike strip reached. */
  freeze?: number;
  /** Probability of a nervous extra tap right after a step. */
  flinch?: number;
}

export const BOTS: Record<string, BotStyle> = {
  perfect: { name: 'идеальный', interval: (t) => t },
  jitter10: { name: 'джиттер ±10%', interval: (t, r) => t * (1 + (rand(r) * 2 - 1) * 0.1) },
  jitter25: { name: 'джиттер ±25%', interval: (t, r) => t * (1 + (rand(r) * 2 - 1) * 0.25) },
  rusher: { name: 'торопыга ×0.65', interval: (t) => t * 0.65 },
  freezer: { name: 'замирает на 1.2с', interval: (t) => t, freeze: 1.2 },
  flincher: { name: 'дёргается 15%', interval: (t) => t, flinch: 0.15 },
};

export interface BotResult {
  status: 'won' | 'dead' | 'timeout';
  reason: DeathReason | null;
  time: number;
  nearMisses: number;
}

/** Would a perfectly steady walk from here reach the next safe strip alive? */
export function safeToGo(w: World, level: Level, layout: Layout): boolean {
  const sim = cloneWorld(w);
  const from = pedStrip(sim, layout).index;
  let next = 0;
  for (let i = 0; i < 30 / DT; i++) {
    const taps = sim.t >= next ? 1 : 0;
    if (taps) next = sim.t + level.tempo;
    tick(sim, level, layout, taps);
    if (sim.status === 'dead') return false;
    if (sim.status === 'won') return true;
    const s = pedStrip(sim, layout);
    if (s.index > from && isSafe(s.kind)) return true;
  }
  return false;
}

export function runBot(
  level: Level,
  seed: number,
  style: BotStyle,
  maxTime = 90,
  onTick?: (w: World, taps: number) => void,
): BotResult {
  const layout = computeLayout(level);
  const w = createWorld(level, seed, layout);
  const rng = makeRng(seed ^ 0x9e3779b9);
  let walking = false;
  let segmentFrom = -1;
  let nextTap = 0;
  let nextLook = 0;
  let frozen = false;
  let flinchAt = -1;

  while (w.t - w.startedAt < maxTime) {
    let taps = 0;
    const strip = pedStrip(w, layout);
    if (walking && isSafe(strip.kind) && strip.index > segmentFrom && strip.index !== layout.strips.length - 1) {
      walking = false; // reached a median: stop and look again
    }
    if (!walking) {
      if (w.t >= nextLook) {
        nextLook = w.t + 0.2;
        if (safeToGo(w, level, layout)) {
          walking = true;
          segmentFrom = strip.index;
          nextTap = w.t;
        }
      }
    }
    if (walking) {
      if (style.freeze && !frozen && strip.kind === 'bike') {
        frozen = true;
        nextTap = w.t + style.freeze;
      }
      if (w.t >= nextTap) {
        taps = 1;
        nextTap = w.t + style.interval(level.tempo, rng);
        if (style.flinch && rand(rng) < style.flinch) flinchAt = w.t + 0.1;
      } else if (flinchAt >= 0 && w.t >= flinchAt) {
        taps = 1;
        flinchAt = -1;
      }
    }
    tick(w, level, layout, taps);
    onTick?.(w, taps);
    if (w.status !== 'playing') break;
  }
  return {
    status: w.status === 'playing' ? 'timeout' : w.status,
    reason: w.death?.reason ?? null,
    time: w.t - w.startedAt,
    nearMisses: w.nearMisses,
  };
}
