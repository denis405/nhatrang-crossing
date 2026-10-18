/**
 * Balance report: survival rate of each bot style on each level.
 *   docker compose run --rm dev npm run sim [-- seeds]
 */
import { BOTS, runBot } from '../src/game/bots';
import { LEVELS } from '../src/game/levels';

const seeds = Number(process.argv[2] ?? 60);
const pad = (s: string, n: number) => s.padEnd(n);

console.log(`seeds per cell: ${seeds}\n`);
console.log(pad('уровень', 22) + Object.values(BOTS).map((b) => pad(b.name, 18)).join(''));

for (const level of LEVELS) {
  let row = pad(level.name, 22);
  const reasons: Record<string, number> = {};
  for (const style of Object.values(BOTS)) {
    let won = 0;
    let time = 0;
    let nm = 0;
    for (let s = 1; s <= seeds; s++) {
      const r = runBot(level, s * 7919, style);
      if (r.status === 'won') {
        won++;
        time += r.time;
      }
      nm += r.nearMisses;
      if (r.reason) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    }
    const pct = Math.round((won / seeds) * 100);
    const avgT = won ? (time / won).toFixed(1) : '-';
    row += pad(`${pct}% ${avgT}s nm${(nm / seeds).toFixed(1)}`, 18);
  }
  console.log(row);
  console.log(pad('', 22) + 'смерти: ' + JSON.stringify(reasons));
}
