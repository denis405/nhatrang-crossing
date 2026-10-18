/** Per-device progress. Every access is guarded: storage can be missing or throw. */
export interface Settings {
  vibrate: boolean;
  /** Metronome volume step: 0 off, 1 quiet, 2 normal. */
  metronome: 0 | 1 | 2;
}

export interface Progress {
  unlocked: number;
  stars: Record<string, number>;
  muted: boolean;
  /** Most streets crossed in one endless rush hour. */
  endlessBest: number;
  tutorialDone: boolean;
  settings: Settings;
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
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<Progress>;
    const unlocked = typeof p.unlocked === 'number' ? p.unlocked : 0;
    const s = (p.settings ?? {}) as Partial<Settings>;
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
