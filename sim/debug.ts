/**
 * Trace the last ticks before a bot dies, for tuning the driver AI.
 *   docker compose run --rm dev npx tsx sim/debug.ts <levelIndex> <bot> [seedIndex]
 */
import { BOTS, runBot } from '../src/game/bots';
import { PED_X } from '../src/game/constants';
import { LEVELS } from '../src/game/levels';
import { KINDS } from '../src/game/vehicles';

const level = LEVELS[Number(process.argv[2] ?? 0)];
const style = BOTS[process.argv[3] ?? 'jitter10'];
const only = process.argv[4] ? Number(process.argv[4]) : null;

for (let s = 1; s <= 60; s++) {
  if (only !== null && s !== only) continue;
  const log: string[] = [];
  const r = runBot(level, s * 7919, style, 90, (w, taps) => {
    const v = w.vehicles
      .filter((x) => Math.abs(x.x - PED_X) < 40 && KINDS[x.kind].avoids)
      .map(
        (x) =>
          `#${x.id}${x.kind[0]} x${x.x.toFixed(0)} y${x.y.toFixed(1)} h${x.homeY.toFixed(0)} s${x.side} [${x.minY.toFixed(0)},${x.maxY.toFixed(0)}]`,
      )
      .join(' | ');
    const h = w.history[w.history.length - 1];
    log.push(
      `t${w.t.toFixed(2)} ${taps ? 'TAP' : '   '} ped ${w.ped.y.toFixed(1)} line ${h.y.toFixed(1)} ema ${w.rhythm.ema.toFixed(2)} :: ${v}`,
    );
    if (log.length > 80) log.shift();
  });
  if (r.status === 'dead') {
    console.log(`seed #${s} died: ${r.reason} after ${r.time.toFixed(1)}s`);
    console.log(log.slice(-40).join('\n'));
    break;
  }
}
