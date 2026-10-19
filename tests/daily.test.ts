import { describe, expect, it } from 'vitest';
import { BOTS, runBot } from '../src/game/bots';
import { CELL, dailyLevel, dailySeed, dayKey, dayNumber, laneRow, msUntilNextDay, prevDay, trafficLanes } from '../src/game/daily';
import { shareDaily } from '../src/text/ru';

const H = 3_600_000;

describe('street of the day', () => {
  it('turns over at midnight in Nha Trang', () => {
    // 16:59 UTC is 23:59 in Nha Trang, 17:00 UTC is midnight.
    expect(dayKey(Date.parse('2026-10-19T16:59:00Z'))).toBe('2026-10-19');
    expect(dayKey(Date.parse('2026-10-19T17:00:00Z'))).toBe('2026-10-20');
    expect(msUntilNextDay(Date.parse('2026-10-19T16:00:00Z'))).toBe(H);
    expect(prevDay('2026-11-01')).toBe('2026-10-31');
    expect(dayNumber('2026-10-19')).toBe(1);
    expect(dayNumber('2026-10-26')).toBe(8);
  });

  it('gives everyone the same street on the same day', () => {
    expect(dailyLevel('2026-10-21')).toEqual(dailyLevel('2026-10-21'));
    expect(dailySeed('2026-10-21')).not.toBe(dailySeed('2026-10-22'));
    expect(dailyLevel('2026-10-21').strips).not.toEqual(dailyLevel('2026-10-28').strips);
  });

  it('is easy on Monday and a rush hour on Sunday', () => {
    const weeks = ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'];
    const sunday = (mon: string) => new Date(Date.parse(mon) + 6 * 24 * H).toISOString().slice(0, 10);
    const tempo = (days: string[]) => days.reduce((s, d) => s + dailyLevel(d).tempo, 0);
    expect(tempo(weeks.map(sunday))).toBeLessThan(tempo(weeks));
  });

  it('draws one cell per lane', () => {
    const lanes = [1, 2, 4, 5];
    expect(laneRow(lanes, new Set([2]), null)).toBe(CELL.good + CELL.off + CELL.good + CELL.good);
    expect(laneRow(lanes, new Set(), 4)).toBe(CELL.good + CELL.good + CELL.hit + CELL.none);
    // Hit on the median: the blame goes to the next lane up.
    expect(laneRow(lanes, new Set([1]), 3)).toBe(CELL.off + CELL.good + CELL.hit + CELL.none);
    const level = dailyLevel('2026-10-19');
    expect(trafficLanes(level).every((i) => level.strips[i].spawn)).toBe(true);
  });

  it('shares a grid with the score on top', () => {
    const text = shareDaily(3, 'Ле Лой', ['🟩💥⬜', '🟩🟩🟩'], true, 2, 6);
    expect(text.split('\n').slice(0, 3)).toEqual(['Улица дня №3 · Ле Лой · 2/6 ⭐⭐', '🟩💥⬜', '🟩🟩🟩']);
    expect(shareDaily(3, 'Ле Лой', ['💥⬜⬜'], false, 0, 6)).toContain('X/6');
  });

  it('a perfectly steady walker crosses every day of a fortnight', () => {
    for (let i = 0; i < 14; i++) {
      const day = new Date(Date.parse('2026-10-19') + i * 24 * H).toISOString().slice(0, 10);
      expect(runBot(dailyLevel(day), dailySeed(day), BOTS.perfect).status).toBe('won');
    }
  });
});
