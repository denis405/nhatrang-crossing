/**
 * Balance table for «Ты — байкер»: how far the lookahead bot and the straight
 * bot get, and what kills them. `npx tsx sim/ride.ts [runs] [seconds]`.
 */
import { lookaheadBot, runRide, straightBot } from '../src/game/rideBot';

const runs = Number(process.argv[2] ?? 20);
const maxTime = Number(process.argv[3] ?? 90);

for (const [name, make] of [
  ['едет прямо', () => straightBot],
  ['смотрит вперёд', () => lookaheadBot()],
] as const) {
  const dist: number[] = [];
  const reasons: Record<string, number> = {};
  let alive = 0;
  let near = 0;
  for (let s = 1; s <= runs; s++) {
    const r = runRide(s * 7919, make(), maxTime);
    dist.push(r.distance);
    near += r.nearMisses;
    if (r.status === 'alive') alive++;
    else {
      const key = `${r.death!.reason}:${r.death!.walker ?? r.death!.kind}`;
      reasons[key] = (reasons[key] ?? 0) + 1;
    }
  }
  dist.sort((a, b) => a - b);
  console.log(
    `${name.padEnd(16)} живы ${alive}/${runs}  медиана ${dist[Math.floor(runs / 2)]} м  мин ${dist[0]} м  макс ${dist[runs - 1]} м  бип-бип ${(near / runs).toFixed(1)}`,
  );
  console.log('   смерти:', reasons);
}
