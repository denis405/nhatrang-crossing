import { describe, expect, it } from 'vitest';
import { DT } from '../src/game/constants';
import { createRide, laneX, tickRide, type RideWorld, type Walker } from '../src/game/ride';
import { lookaheadBot, runRide, straightBot } from '../src/game/rideBot';
import { KINDS } from '../src/game/vehicles';

const SEEDS = [11, 22, 33, 44];

function walker(w: RideWorld, over: Partial<Walker>): Walker {
  return {
    id: w.nextId++,
    type: 'tourist',
    dir: 1,
    x: w.bike.x,
    targetX: w.bike.x,
    y: w.bike.y - 40,
    tempo: 0.5,
    nextStep: w.t + 0.5,
    steps: 0,
    mode: 'walk',
    freezeAt: null,
    freezeFor: 0,
    until: 0,
    runAt: null,
    passed: false,
    minGap: Infinity,
    look: 0,
    ...over,
  };
}

/** Nothing on the road but the given person, and nothing new on the way. */
function alone(p: (w: RideWorld) => Partial<Walker>): RideWorld {
  const w = createRide(5);
  w.nextWalkerAt = w.nextNpcAt = -Infinity;
  w.walkers.push(walker(w, p(w)));
  return w;
}

function rideUntilDead(w: RideWorld, seconds = 3): void {
  for (let i = 0; i < seconds / DT && w.status === 'playing'; i++) tickRide(w, { targetX: null, push: 0 });
}

describe('«Ты — байкер»', () => {
  it('is deterministic for the same seed and input', () => {
    const a = runRide(7, lookaheadBot(), 20);
    const b = runRide(7, lookaheadBot(), 20);
    expect(a).toEqual(b);
  }, 60_000);

  it('a rider who looks ahead always gets through', () => {
    for (const seed of SEEDS) expect(runRide(seed, lookaheadBot(), 45).status).toBe('alive');
  }, 120_000);

  it('riding straight without steering does not', () => {
    const dead = SEEDS.filter((s) => runRide(s, straightBot, 60).status === 'dead').length;
    expect(dead).toBeGreaterThanOrEqual(3);
  });

  it('names what the person was doing when the bike hit them', () => {
    const froze = alone((w) => ({ type: 'selfie', mode: 'freeze', until: w.t + 99 }));
    rideUntilDead(froze);
    expect(froze.death?.reason).toBe('froze');
    expect(froze.death?.walker).toBe('selfie');

    const steady = alone(() => ({ type: 'local' }));
    rideUntilDead(steady);
    expect(steady.death?.reason).toBe('steady');
  });

  it('a selfie tourist stops for the photo, a jogger breaks into a run', () => {
    const selfie = alone((w) => ({ type: 'selfie', freezeAt: w.bike.x + 8, freezeFor: 1, y: w.bike.y - 2000 }));
    const jogger = alone((w) => ({ type: 'jogger', runAt: w.bike.x + 8, y: w.bike.y - 2000 }));
    const modes = new Set<string>();
    for (let i = 0; i < 3 / DT; i++) {
      tickRide(selfie, { targetX: null, push: 0 });
      tickRide(jogger, { targetX: null, push: 0 });
      modes.add(`selfie:${selfie.walkers[0].mode}`).add(`jogger:${jogger.walkers[0].mode}`);
    }
    expect(modes).toContain('selfie:freeze');
    expect(selfie.walkers[0].mode).toBe('walk');
    expect(jogger.walkers[0].mode).toBe('run');
  });

  it('local riders let people cross instead of running them over', () => {
    for (const seed of SEEDS.slice(0, 2)) {
      const w = createRide(seed);
      const bot = lookaheadBot();
      let hits = 0;
      for (let i = 0; i < 40 / DT && w.status === 'playing'; i++) {
        tickRide(w, bot(w));
        for (const o of w.npcs) {
          const k = KINDS[o.kind];
          for (const p of w.walkers)
            if (Math.abs(p.x - o.x) < k.wid / 2 && Math.abs(p.y - o.y) < k.len / 2 - 1) hits++;
        }
      }
      expect(hits).toBe(0);
    }
  }, 120_000);

  it('the bike stays on the road', () => {
    const w = createRide(3);
    for (let i = 0; i < 2 / DT; i++) tickRide(w, { targetX: -100, push: 0 });
    expect(w.bike.x).toBeGreaterThan(laneX(0) - 12);
  });
});
