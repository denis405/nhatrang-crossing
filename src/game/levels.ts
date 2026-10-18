import type { VehicleKind } from './vehicles';

export type StripKind = 'sidewalk' | 'median' | 'bike' | 'car';

export interface SpawnSpec {
  /** Seconds between spawns, random in range. */
  every: [number, number];
  /** Base speed, px/s (multiplied by the kind's speedMul). */
  speed: [number, number];
  kinds: Partial<Record<VehicleKind, number>>;
  /** Bikes drift to another lane of their zone at this lateral speed, px/s (lane changes). */
  drift?: number;
}

export interface Strip {
  kind: StripKind;
  h: number;
  /** Travel direction for traffic strips: 1 → right, -1 → left. */
  dir?: 1 | -1;
  spawn?: SpawnSpec;
}

export interface Decor {
  /** Palms along the sidewalks (the seafront). */
  palms?: boolean;
  /** The Tram Huong tower on the widest median, ring markings on the road. */
  tower?: boolean;
}

export interface Level {
  id: string;
  name: string;
  subtitle: string;
  /** Target interval between steps, seconds. */
  tempo: number;
  /** Relative tolerance of a "steady" step. */
  tolerance: number;
  /** How much drivers trust the observed pace vs the local norm (0..1). */
  adapt: number;
  /** Driver skill: extra clearance (px, may be negative) and reaction time multiplier. */
  drivers: { margin: number; reaction: number };
  metronome: boolean;
  palette: 'day' | 'evening';
  /** Scenery hints for the renderer; no effect on the simulation. */
  decor?: Decor;
  /** Bottom (start) to top (finish). */
  strips: Strip[];
}

const LANE = 16;
const CAR_LANE = 18;

export const DRIFT = 5;

export const bikes = (dir: 1 | -1, spawn: SpawnSpec): Strip => ({ kind: 'bike', h: LANE, dir, spawn });
export const cars = (dir: 1 | -1, spawn: SpawnSpec): Strip => ({ kind: 'car', h: CAR_LANE, dir, spawn });
export const sidewalk = (h = 28): Strip => ({ kind: 'sidewalk', h });
export const median = (h = 12): Strip => ({ kind: 'median', h });

export const LEVELS: Level[] = [
  {
    id: 'chodam',
    name: 'Переулок у Чо Дам',
    subtitle: 'Утро, рынок. Байков немного, все сонные.',
    tempo: 0.5,
    tolerance: 0.25,
    adapt: 0.25,
    drivers: { margin: 1, reaction: 1 },
    metronome: true,
    palette: 'day',
    strips: [
      sidewalk(),
      bikes(1, { every: [1.6, 3.2], speed: [34, 44], kinds: { bike: 6, family: 2, cargo: 1 } }),
      bikes(1, { every: [1.8, 3.6], speed: [36, 46], kinds: { bike: 6, family: 1 } }),
      bikes(-1, { every: [1.8, 3.6], speed: [36, 46], kinds: { bike: 6, family: 1 } }),
      bikes(-1, { every: [1.6, 3.2], speed: [34, 44], kinds: { bike: 6, family: 2, cargo: 1 } }),
      sidewalk(),
    ],
  },
  {
    id: 'nguyenthienthuat',
    name: 'Нгуен Тхьен Тхуат',
    subtitle: 'Туристическая улица. Половина байков в аренде.',
    tempo: 0.48,
    tolerance: 0.22,
    adapt: 0.25,
    drivers: { margin: 0, reaction: 1.1 },
    metronome: true,
    palette: 'day',
    strips: [
      sidewalk(),
      bikes(1, { every: [1.0, 2.2], speed: [36, 48], kinds: { bike: 4, tourist: 3, grab: 1 } }),
      bikes(1, { every: [1.2, 2.4], speed: [38, 50], kinds: { bike: 4, tourist: 3, family: 1 } }),
      bikes(1, { every: [1.4, 2.8], speed: [40, 52], kinds: { bike: 5, tourist: 2, grab: 1 } }),
      bikes(-1, { every: [1.4, 2.8], speed: [40, 52], kinds: { bike: 5, tourist: 2, grab: 1 } }),
      bikes(-1, { every: [1.2, 2.4], speed: [38, 50], kinds: { bike: 4, tourist: 3, family: 1 } }),
      bikes(-1, { every: [1.0, 2.2], speed: [36, 48], kinds: { bike: 4, tourist: 3, grab: 1 } }),
      sidewalk(),
    ],
  },
  {
    id: 'tranphu-day',
    name: 'Чан Фу днём',
    subtitle: 'Набережная. Автобусы с туристами и островок посередине.',
    tempo: 0.48,
    tolerance: 0.22,
    adapt: 0.25,
    drivers: { margin: -0.5, reaction: 1.2 },
    metronome: false,
    palette: 'day',
    strips: [
      sidewalk(),
      bikes(1, { every: [0.9, 2.0], speed: [40, 52], kinds: { bike: 5, grab: 2, family: 2, cargo: 1 } }),
      bikes(1, { every: [1.0, 2.2], speed: [42, 54], kinds: { bike: 5, grab: 2, tourist: 1 } }),
      cars(1, { every: [2.5, 5.0], speed: [44, 56], kinds: { car: 4, bus: 1 } }),
      median(),
      cars(-1, { every: [2.5, 5.0], speed: [44, 56], kinds: { car: 4, bus: 1 } }),
      bikes(-1, { every: [1.0, 2.2], speed: [42, 54], kinds: { bike: 5, grab: 2, tourist: 1 } }),
      bikes(-1, { every: [0.9, 2.0], speed: [40, 52], kinds: { bike: 5, grab: 2, family: 2, cargo: 1 } }),
      sidewalk(),
    ],
  },
  {
    id: 'hungvuong',
    name: 'Хунг Выонг',
    subtitle: 'Центр. Машины в обе стороны, а островка нет.',
    tempo: 0.46,
    tolerance: 0.22,
    adapt: 0.25,
    drivers: { margin: -0.5, reaction: 1.2 },
    metronome: false,
    palette: 'day',
    strips: [
      sidewalk(),
      bikes(1, { every: [1.0, 2.2], speed: [40, 52], kinds: { bike: 5, grab: 2, family: 1, cargo: 1 } }),
      bikes(1, { every: [1.1, 2.4], speed: [42, 54], kinds: { bike: 5, grab: 2, tourist: 1 } }),
      cars(1, { every: [3.5, 6.5], speed: [44, 56], kinds: { car: 5, bus: 1 } }),
      cars(-1, { every: [3.5, 6.5], speed: [44, 56], kinds: { car: 5, bus: 1 } }),
      bikes(-1, { every: [1.1, 2.4], speed: [42, 54], kinds: { bike: 5, grab: 2, tourist: 1 } }),
      bikes(-1, { every: [1.0, 2.2], speed: [40, 52], kinds: { bike: 5, grab: 2, family: 1, cargo: 1 } }),
      sidewalk(),
    ],
  },
  {
    id: 'lethanhton',
    name: 'Ле Тхань Тон',
    subtitle: 'Одностороннее движение. Все едут в одну сторону и перестраиваются.',
    tempo: 0.46,
    tolerance: 0.22,
    adapt: 0.1,
    drivers: { margin: -1, reaction: 1.3 },
    metronome: false,
    palette: 'day',
    strips: [
      sidewalk(),
      ...[0, 1, 2, 3, 4].map((i) =>
        bikes(-1, {
          every: i % 2 ? [0.8, 1.7] : [0.7, 1.6],
          speed: [42, 56],
          kinds: { bike: 4, grab: 4, cargo: 1, tourist: 2 },
          drift: DRIFT * 1.4,
        }),
      ),
      sidewalk(),
    ],
  },
  {
    id: 'tranphu-evening',
    name: 'Чан Фу вечером',
    subtitle: 'Час пик на набережной. Темнеет, все едут домой.',
    tempo: 0.45,
    tolerance: 0.22,
    adapt: 0.25,
    drivers: { margin: -0.5, reaction: 1.25 },
    metronome: false,
    palette: 'evening',
    decor: { palms: true },
    strips: [
      sidewalk(),
      bikes(1, { every: [0.8, 1.8], speed: [40, 52], kinds: { bike: 5, grab: 2, family: 2, cargo: 1 } }),
      bikes(1, { every: [0.8, 1.9], speed: [42, 54], kinds: { bike: 5, grab: 3, family: 1 } }),
      bikes(1, { every: [0.9, 2.0], speed: [42, 54], kinds: { bike: 5, grab: 2, tourist: 1 }, drift: DRIFT }),
      cars(1, { every: [2.4, 4.8], speed: [44, 56], kinds: { car: 4, bus: 1 } }),
      median(),
      cars(-1, { every: [2.4, 4.8], speed: [44, 56], kinds: { car: 4, bus: 1 } }),
      bikes(-1, { every: [0.9, 2.0], speed: [42, 54], kinds: { bike: 5, grab: 2, tourist: 1 }, drift: DRIFT }),
      bikes(-1, { every: [0.8, 1.9], speed: [42, 54], kinds: { bike: 5, grab: 3, family: 1 } }),
      bikes(-1, { every: [0.8, 1.8], speed: [40, 52], kinds: { bike: 5, grab: 2, family: 2, cargo: 1 } }),
      sidewalk(),
    ],
  },
  {
    id: 'tramhuong',
    name: 'Круг у башни Трам Хыонг',
    subtitle: 'Главный круг города. Все въезжают, съезжают и никто не уступает.',
    tempo: 0.45,
    tolerance: 0.22,
    adapt: 0.25,
    drivers: { margin: -0.75, reaction: 1.3 },
    metronome: false,
    palette: 'day',
    decor: { palms: true, tower: true },
    strips: [
      sidewalk(),
      bikes(1, { every: [0.8, 1.8], speed: [38, 50], kinds: { bike: 4, grab: 2, family: 2, cargo: 1, tourist: 1 }, drift: DRIFT * 1.6 }),
      bikes(1, { every: [0.9, 2.0], speed: [40, 52], kinds: { bike: 4, grab: 3, tourist: 1 }, drift: DRIFT * 1.6 }),
      cars(1, { every: [2.6, 5.0], speed: [40, 50], kinds: { car: 4, bus: 1 } }),
      median(44),
      cars(-1, { every: [2.6, 5.0], speed: [40, 50], kinds: { car: 4, bus: 1 } }),
      bikes(-1, { every: [0.9, 2.0], speed: [40, 52], kinds: { bike: 4, grab: 3, tourist: 1 }, drift: DRIFT * 1.6 }),
      bikes(-1, { every: [0.8, 1.8], speed: [38, 50], kinds: { bike: 4, grab: 2, family: 2, cargo: 1, tourist: 1 }, drift: DRIFT * 1.6 }),
      bikes(-1, { every: [0.9, 2.0], speed: [40, 52], kinds: { bike: 4, grab: 2, tourist: 2 }, drift: DRIFT * 1.6 }),
      sidewalk(),
    ],
  },
];

export interface StripGeom extends Strip {
  index: number;
  /** World y of the strip's top and bottom edges (y grows downward). */
  top: number;
  bottom: number;
  /** Zone of contiguous same-direction traffic this strip belongs to. */
  zoneTop: number;
  zoneBottom: number;
}

export interface Layout {
  height: number;
  strips: StripGeom[];
  startY: number;
  /** Pedestrian wins once their y is at or above this. */
  finishY: number;
}

export function isSafe(kind: StripKind): boolean {
  return kind === 'sidewalk' || kind === 'median';
}

export function computeLayout(level: Level): Layout {
  const height = level.strips.reduce((s, st) => s + st.h, 0);
  const strips: StripGeom[] = [];
  let bottom = height;
  level.strips.forEach((st, index) => {
    const top = bottom - st.h;
    strips.push({ ...st, index, top, bottom, zoneTop: top, zoneBottom: bottom });
    bottom = top;
  });
  // Bikes treat adjacent bike lanes going the same way as one fuzzy zone.
  for (const s of strips) {
    if (s.kind !== 'bike') continue;
    let i = s.index;
    while (i > 0 && strips[i - 1].kind === 'bike' && strips[i - 1].dir === s.dir) i--;
    s.zoneBottom = strips[i].bottom;
    i = s.index;
    while (i < strips.length - 1 && strips[i + 1].kind === 'bike' && strips[i + 1].dir === s.dir) i++;
    s.zoneTop = strips[i].top;
  }
  const first = strips[0];
  const last = strips[strips.length - 1];
  return {
    height,
    strips,
    startY: Math.round((first.top + first.bottom) / 2 + 4),
    finishY: last.bottom - 5,
  };
}

export function stripAt(layout: Layout, y: number): StripGeom {
  for (const s of layout.strips) if (y >= s.top && y < s.bottom) return s;
  return y < 0 ? layout.strips[layout.strips.length - 1] : layout.strips[0];
}
