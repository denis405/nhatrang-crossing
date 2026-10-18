import { FLINCH_FACTOR, STOP_FACTOR } from './constants';

export type Verdict = 'start' | 'steady' | 'fast' | 'flinch' | 'slow';

export interface Rhythm {
  /** Smoothed interval between taps, seconds. */
  ema: number;
  lastStep: number;
  lastInterval: number;
  /** Steps since the rhythm (re)started after standing still. */
  run: number;
  /** Steps taken on the road, and how many of them were in tempo. */
  roadSteps: number;
  goodSteps: number;
}

const EMA_ALPHA = 0.35;

export function createRhythm(tempo: number): Rhythm {
  return { ema: tempo, lastStep: -1e9, lastInterval: tempo, run: 0, roadSteps: 0, goodSteps: 0 };
}

export function classify(interval: number, tempo: number, tol: number): Verdict {
  if (interval > tempo * STOP_FACTOR) return 'start';
  if (interval < tempo * FLINCH_FACTOR) return 'flinch';
  if (interval < tempo * (1 - tol)) return 'fast';
  if (interval > tempo * (1 + tol)) return 'slow';
  return 'steady';
}

export function registerStep(r: Rhythm, t: number, tempo: number, tol: number, onRoad: boolean): Verdict {
  const interval = t - r.lastStep;
  const verdict = classify(interval, tempo, tol);
  r.lastStep = t;
  if (verdict === 'start') {
    // Fresh start after standing: drivers assume the local norm.
    r.ema = tempo;
    r.lastInterval = tempo;
    r.run = 1;
  } else {
    r.ema += (interval - r.ema) * EMA_ALPHA;
    r.lastInterval = interval;
    r.run++;
  }
  if (onRoad && verdict !== 'start') {
    r.roadSteps++;
    if (verdict === 'steady') r.goodSteps++;
  }
  return verdict;
}

export function isStanding(r: Rhythm, t: number, tempo: number): boolean {
  return t - r.lastStep > tempo * STOP_FACTOR;
}

/** Interval drivers believe the pedestrian walks at: part local norm, part what they observed. */
export function perceivedInterval(r: Rhythm, tempo: number, adapt: number): number {
  return tempo + (r.ema - tempo) * adapt;
}

export type DeathReason = 'rushed' | 'froze' | 'flinch' | 'hesitated' | 'cutoff' | 'car' | 'bus' | 'tourist' | 'unlucky';

export function deathReason(
  r: Rhythm,
  t: number,
  tempo: number,
  tol: number,
  hitBy: { avoids: boolean; kind: string },
): DeathReason {
  if (!hitBy.avoids) return hitBy.kind === 'bus' ? 'bus' : 'car';
  const since = t - r.lastStep;
  if (since > tempo * 1.35) return 'froze';
  if (r.lastInterval < tempo * FLINCH_FACTOR) return 'flinch';
  if (r.run <= 2) return 'cutoff';
  if (r.lastInterval < tempo * (1 - tol) || r.ema < tempo * (1 - tol * 0.6)) return 'rushed';
  if (r.lastInterval > tempo * (1 + tol)) return 'hesitated';
  if (hitBy.kind === 'tourist') return 'tourist';
  return 'unlucky';
}
