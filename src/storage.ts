/** Per-device progress. Every access is guarded: storage can be missing or throw. */
export interface Progress {
  unlocked: number;
  stars: Record<string, number>;
  muted: boolean;
}

const KEY = 'nhatrang-crossing:v1';

export function loadProgress(): Progress {
  const fallback: Progress = { unlocked: 0, stars: {}, muted: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<Progress>;
    return {
      unlocked: typeof p.unlocked === 'number' ? p.unlocked : 0,
      stars: p.stars && typeof p.stars === 'object' ? p.stars : {},
      muted: !!p.muted,
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
