import { DAILY_STREETS, DAILY_WEEKDAYS } from '../text/ru';
import { generateStreet } from './endless';
import type { Level } from './levels';

/**
 * Street of the day: one street for everyone, built from the date. The day
 * turns over at midnight in Nha Trang, not on the player's clock.
 */
export const DAILY_ATTEMPTS = 6;

const DAY = 86_400_000;
const VN_OFFSET = 7 * 3_600_000;
/** Day №1. */
const EPOCH = '2026-10-19';

/** "2026-10-19" for the current day in Nha Trang. */
export function dayKey(now = Date.now()): string {
  return new Date(now + VN_OFFSET).toISOString().slice(0, 10);
}

export function prevDay(key: string): string {
  return new Date(Date.parse(key) - DAY).toISOString().slice(0, 10);
}

export function dayNumber(key: string): number {
  return Math.round((Date.parse(key) - Date.parse(EPOCH)) / DAY) + 1;
}

export function msUntilNextDay(now = Date.now()): number {
  return DAY - ((now + VN_OFFSET) % DAY);
}

/** Monday 0 … Sunday 6. */
function weekday(key: string): number {
  return (new Date(Date.parse(key)).getUTCDay() + 6) % 7;
}

/** Seed of both the street and its traffic, so every attempt and every player starts alike. */
export function dailySeed(key: string): number {
  let h = 0x811c9dc5;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

/** Monday is a warm-up, Sunday is a full rush hour. */
export function dailyLevel(key: string): Level {
  const seed = dailySeed(key);
  const wd = weekday(key);
  const base = generateStreet(seed, 3 + wd * 2);
  return {
    ...base,
    id: `daily-${key}`,
    name: DAILY_STREETS[seed % DAILY_STREETS.length],
    subtitle: DAILY_WEEKDAYS[wd],
  };
}

/** Strip indices with traffic, bottom to top: one grid cell each. */
export function trafficLanes(level: Level): number[] {
  return level.strips.flatMap((s, i) => (s.spawn ? [i] : []));
}

export const CELL = { good: '🟩', off: '🟨', hit: '💥', none: '⬜' } as const;

/**
 * One attempt as a row of cells: steady lanes, lanes with an off-tempo step,
 * the lane where it ended, and lanes never reached. `hitStrip` is null for a
 * crossing that made it.
 */
export function laneRow(lanes: number[], off: ReadonlySet<number>, hitStrip: number | null): string {
  const hit = hitStrip === null ? -1 : lanes.findIndex((i) => i >= hitStrip);
  return lanes
    .map((strip, i) => {
      if (hitStrip !== null && (hit < 0 || i > hit)) return CELL.none;
      if (i === hit) return CELL.hit;
      return off.has(strip) ? CELL.off : CELL.good;
    })
    .join('');
}

/** A placeholder for an attempt in progress: leaving it halfway still spends it. */
export function emptyRow(lanes: number[]): string {
  return CELL.none.repeat(lanes.length);
}
