import { DT } from './constants';
import { cloneRide, createRide, LANE_W, LANES, laneX, rideDistance, tickRide, type RideDeath, type RideInput, type RideWorld } from './ride';
import { KINDS } from './vehicles';

/**
 * Headless riders for tests and balance. The lookahead bot tries every lane on a
 * copy of the world and keeps the one that stays clear longest: if it can't
 * survive, nobody can, so it proves a run is fair rather than how a human plays.
 */
export type RideBot = (w: RideWorld) => RideInput;

/** Never touches the screen: a baseline that shows the street is not empty. */
export const straightBot: RideBot = () => ({ targetX: null, push: 0 });

const HORIZON = 1.6;
const EVERY = 4;

/** Smallest distance between the bike and anything ahead of it, px (capped). */
function clearance(w: RideWorld): number {
  const b = w.bike;
  let best = 12;
  for (const p of w.walkers) {
    const dy = b.y - p.y;
    if (dy < -10 || dy > 40) continue;
    best = Math.min(best, Math.abs(p.x - b.x) - 3 - 3);
  }
  for (const o of w.npcs) {
    const dy = b.y - o.y;
    if (dy < -20 || dy > 50) continue;
    best = Math.min(best, Math.abs(o.x - b.x) - (KINDS[o.kind].wid + 6) / 2);
  }
  return best;
}

function score(w: RideWorld, targetX: number): number {
  const sim = cloneRide(w);
  const input: RideInput = { targetX, push: 0 };
  let minClear = 12;
  for (let i = 0; i < HORIZON / DT; i++) {
    tickRide(sim, input);
    if (sim.status === 'dead') return -1000 + i;
    minClear = Math.min(minClear, clearance(sim));
  }
  return minClear - Math.abs(targetX - w.bike.x) * 0.02;
}

export function lookaheadBot(): RideBot {
  let n = 0;
  let target: number | null = null;
  return (w) => {
    if (n++ % EVERY === 0 || target === null) {
      const xs = [w.bike.x];
      for (let i = 0; i < LANES; i++) xs.push(laneX(i), laneX(i) - LANE_W / 4, laneX(i) + LANE_W / 4);
      let best = -Infinity;
      for (const x of xs) {
        const s = score(w, x);
        if (s > best) {
          best = s;
          target = x;
        }
      }
    }
    return { targetX: target, push: 0 };
  };
}

export interface RideResult {
  status: 'dead' | 'alive';
  death: RideDeath | null;
  /** Metres ridden. */
  distance: number;
  nearMisses: number;
}

export function runRide(seed: number, bot: RideBot, maxTime = 90): RideResult {
  const w = createRide(seed);
  for (let i = 0; i < maxTime / DT; i++) {
    tickRide(w, bot(w));
    if (w.status === 'dead') break;
  }
  return {
    status: w.status === 'dead' ? 'dead' : 'alive',
    death: w.death,
    distance: rideDistance(w),
    nearMisses: w.nearMisses,
  };
}
