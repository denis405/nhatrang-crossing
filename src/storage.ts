/** Per-device progress. Every access is guarded: storage can be missing or throw. */
export interface Settings {
  vibrate: boolean;
  /** Metronome volume step: 0 off, 1 quiet, 2 normal. */
  metronome: 0 | 1 | 2;
}

/** Today's street of the day: one row of lane cells per attempt. */
export interface DailyState {
  day: string;
  rows: string[];
  won: boolean;
  stars: number;
}

export interface Progress {
  unlocked: number;
  stars: Record<string, number>;
  muted: boolean;
  /** Most streets crossed in one endless rush hour. */
  endlessBest: number;
  tutorialDone: boolean;
  settings: Settings;
  daily: DailyState | null;
  /** Streets of the day crossed on consecutive days, and the last such day. */
  dailyStreak: number;
  dailyLastWon: string;
}

const KEY = 'nhatrang-crossing:v1';

export function loadProgress(): Progress {
  const fallback: Progress = {
    unlocked: 0,
    stars: {},
    muted: false,
    endlessBest: 0,
    tutorialDone: false,
    settings: { vibrate: true, metronome: 2 },
    daily: null,
    dailyStreak: 0,
    dailyLastWon: '',
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<Progress>;
    const unlocked = typeof p.unlocked === 'number' ? p.unlocked : 0;
    const s = (p.settings ?? {}) as Partial<Settings>;
    const d = (p.daily ?? {}) as Partial<DailyState>;
    return {
      unlocked,
      stars: p.stars && typeof p.stars === 'object' ? p.stars : {},
      muted: !!p.muted,
      endlessBest: typeof p.endlessBest === 'number' ? p.endlessBest : 0,
      // Saves from before the tutorial existed belong to players who already know the game.
      tutorialDone: typeof p.tutorialDone === 'boolean' ? p.tutorialDone : unlocked > 0,
      settings: {
        vibrate: typeof s.vibrate === 'boolean' ? s.vibrate : true,
        metronome: s.metronome === 0 || s.metronome === 1 ? s.metronome : 2,
      },
      daily:
        typeof d.day === 'string' && Array.isArray(d.rows)
          ? { day: d.day, rows: d.rows.filter((r) => typeof r === 'string'), won: !!d.won, stars: Number(d.stars) || 0 }
          : null,
      dailyStreak: typeof p.dailyStreak === 'number' ? p.dailyStreak : 0,
      dailyLastWon: typeof p.dailyLastWon === 'string' ? p.dailyLastWon : '',
    };
  } catch {
    return fallback;
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode or quota: progress just won't persist */
  }
}
