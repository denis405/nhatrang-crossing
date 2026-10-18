import { bikes, cars, DRIFT, median, sidewalk, type Level, type SpawnSpec, type Strip } from './levels';
import { makeRng, rand, type Rng } from './rng';

/** Streets until the rush hour reaches full strength. */
const RAMP = 20;

const lerp = (a: number, b: number, d: number) => a + (b - a) * d;
const chance = (r: Rng, p: number) => rand(r) < p;

/**
 * Street number `n` (from 0) of an endless rush hour. Same seed and number
 * always give the same street, so a run can be replayed and tested.
 */
export function generateStreet(seed: number, n: number): Level {
  const r = makeRng((seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0);
  const d = Math.min(1, n / RAMP);

  const bikeSpec = (drift = 0): SpawnSpec => ({
    every: [lerp(1.7, 0.85, d) + rand(r) * 0.2, lerp(3.4, 1.9, d) + rand(r) * 0.3],
    speed: [lerp(34, 40, d), lerp(44, 54, d)],
    kinds: { bike: 5, grab: Math.round(lerp(0, 3, d)), family: 1 + Math.round(rand(r)), cargo: 1, tourist: Math.round(lerp(0, 3, d) * rand(r) + 0.4) },
    ...(drift ? { drift } : {}),
  });
  const carSpec = (): SpawnSpec => ({
    every: [lerp(5, 2.6, d), lerp(8, 5, d)],
    speed: [44, 56],
    kinds: { car: 4, bus: d > 0.3 ? 1 : 0 },
  });
  const driftOf = () => (d > 0.25 && chance(r, 0.25 + d * 0.4) ? DRIFT * lerp(1, 1.6, d) : 0);

  const strips: Strip[] = [sidewalk()];
  const oneWay = n >= 4 && chance(r, 0.15);
  if (oneWay) {
    const lanes = 3 + Math.round(lerp(0, 2, d) * rand(r) + d);
    for (let i = 0; i < lanes; i++) strips.push(bikes(-1, bikeSpec(DRIFT * lerp(1, 1.4, d))));
  } else {
    const perSide = Math.max(1, Math.min(3, 1 + Math.round(lerp(0.6, 1.8, d) + rand(r) - 0.5)));
    const withCars = n >= 3 && chance(r, lerp(0.3, 0.8, d));
    // Wide roads get a median so there is somewhere to catch a breath.
    const withMedian = withCars && (perSide >= 2 || chance(r, 0.6));
    const side = (dir: 1 | -1): Strip[] => {
      const s: Strip[] = [];
      for (let i = 0; i < perSide; i++) s.push(bikes(dir, bikeSpec(driftOf())));
      if (withCars) s.push(cars(dir, carSpec()));
      return dir === 1 ? s : s.reverse();
    };
    strips.push(...side(1));
    if (withMedian) strips.push(median(chance(r, 0.2) ? 24 : 12));
    strips.push(...side(-1));
  }
  strips.push(sidewalk());

  return {
    id: `endless-${n}`,
    name: `Час пик · улица ${n + 1}`,
    subtitle: '',
    tempo: Math.round(lerp(0.5, 0.44, d) * 100) / 100,
    tolerance: 0.22,
    adapt: 0.25,
    drivers: { margin: lerp(1, -0.75, d), reaction: lerp(1, 1.3, d) },
    metronome: false,
    palette: Math.floor(n / 5) % 2 ? 'evening' : 'day',
    decor: { palms: chance(r, 0.3) },
    strips,
  };
}
