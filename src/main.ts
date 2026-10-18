import './style.css';
import { sfx } from './audio/sfx';
import { DT, PED_X } from './game/constants';
import { generateStreet } from './game/endless';
import { computeLayout, isSafe, LEVELS, type Layout, type Level } from './game/levels';
import { frontGap, KINDS } from './game/vehicles';
import { accuracy, createWorld, pedStrip, tick, type TickEvents, type World } from './game/world';
import { Renderer } from './render/renderer';
import { loadProgress, saveProgress } from './storage';
import { NEAR_MISS_WORDS, pick, TUTORIAL, VERDICT_WORDS, WIN_TITLES } from './text/ru';
import { Hud, Screens, type EndlessEntry } from './ui/ui';

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;
const renderer = new Renderer(document.getElementById('screen') as HTMLCanvasElement);
const progress = loadProgress();
sfx.muted = progress.muted;

/** `pause` is the pause screen; `countdown` is the beat-in after it, before play resumes. */
type Scene = 'menu' | 'play' | 'over' | 'pause' | 'countdown';
let scene: Scene = 'menu';
/** Story streets one by one, or the endless rush hour. */
let mode: 'story' | 'endless' = 'story';
let levelIndex = 0;
let endlessSeed = 0;
/** Streets crossed so far in this endless run. */
let endlessN = 0;
let endlessRecord = false;
/** The pending "show the next screen" timer; going to the menu cancels it. */
let later: ReturnType<typeof setTimeout> | undefined;
let level: Level = LEVELS[0];
let layout: Layout = computeLayout(level);
let world: World = createWorld(level, 1, layout);
let pendingTaps = 0;
let acc = 0;
let lastFrame = performance.now();
let paused = false;
let tickedFor = -1;
let attempt = 0;
/** World time the tutorial's "a bike is coming" tip appeared, -1 before that. */
let bikeTipAt = -1;

const hud = new Hud(ui, {
  onMute: () => {
    progress.muted = !progress.muted;
    sfx.setMuted(progress.muted);
    hud.setMuted(progress.muted);
    saveProgress(progress);
  },
  onMenu: () => (scene === 'play' || scene === 'countdown' ? pause() : showMenu()),
});
hud.setMuted(progress.muted);
const screens = new Screens(ui);

function after(ms: number, fn: () => void): void {
  clearTimeout(later);
  later = setTimeout(fn, ms);
}

function begin(lv: Level, title: string): void {
  clearTimeout(later);
  level = lv;
  layout = computeLayout(level);
  attempt++;
  world = createWorld(level, (Date.now() ^ (attempt * 2654435761)) >>> 0, layout);
  pendingTaps = 0;
  acc = 0;
  tickedFor = -1;
  scene = 'play';
  bikeTipAt = -1;
  screens.close();
  hud.show(level, title);
  hud.setProgress(0);
}

function pause(): void {
  if (scene !== 'play' && scene !== 'countdown') return;
  clearTimeout(later);
  scene = 'pause';
  pendingTaps = 0;
  screens.pause(
    () => resume(),
    () => (mode === 'endless' ? startEndless(0) : startLevel(levelIndex)),
    () => showMenu(),
  );
}

/** Three metronome beats in the street's tempo, so the walker picks the rhythm back up. */
function resume(): void {
  screens.close();
  scene = 'countdown';
  let left = 3;
  const beat = () => {
    if (left === 0) {
      scene = 'play';
      lastFrame = performance.now();
      return;
    }
    sfx.tick();
    hud.pulse();
    hud.banner(String(left));
    left--;
    after(level.tempo * 1000, beat);
    acc = 0;
  };
  beat();
}

function startLevel(i: number): void {
  mode = 'story';
  levelIndex = i;
  begin(LEVELS[i], `${i + 1}. ${LEVELS[i].name}`);
}

function startEndless(n: number): void {
  mode = 'endless';
  if (n === 0) {
    endlessSeed = (Date.now() ^ (attempt * 2246822519)) >>> 0;
    endlessRecord = false;
  }
  endlessN = n;
  begin(generateStreet(endlessSeed, n), `∞ Улица ${n + 1}`);
}

/** The endless rush hour opens once the first street with cars is behind. */
function endlessEntry(): EndlessEntry {
  const open = progress.unlocked >= 3 || progress.endlessBest > 0;
  return { open, best: progress.endlessBest, onPlay: () => startEndless(0) };
}

function showMenu(): void {
  clearTimeout(later);
  scene = 'menu';
  hud.hide();
  screens.menu(
    () => startLevel(Math.min(progress.unlocked, LEVELS.length - 1)),
    () => showLevels(),
    endlessEntry(),
  );
}

function showLevels(): void {
  scene = 'menu';
  hud.hide();
  screens.levels(LEVELS, progress, (i) => startLevel(i), () => showMenu(), endlessEntry());
}

function onTap(): void {
  sfx.unlock();
  if (scene === 'play' && world.status === 'playing' && !paused) pendingTaps++;
}

// ---- input: the whole screen is the button
app.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if ((e.target as Element).closest('button, .screen')) return;
  onTap();
});
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (scene === 'pause') resume();
    else pause();
    return;
  }
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') {
    if (scene === 'play') e.preventDefault();
    onTap();
  }
});
// Block double-tap zoom, pinch and long-press menus on iOS.
document.addEventListener(
  'touchstart',
  (e) => {
    if (!(e.target as Element).closest('button')) e.preventDefault();
  },
  { passive: false },
);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  paused = document.hidden;
  if (paused) {
    pause();
    sfx.suspend();
  }
  else {
    sfx.resume();
    lastFrame = performance.now();
  }
});

new ResizeObserver(() => renderer.resize(app.clientWidth, app.clientHeight)).observe(app);
renderer.resize(app.clientWidth, app.clientHeight);

// ---- game events
function handle(ev: TickEvents): void {
  if (ev.step) {
    sfx.step();
    const word = VERDICT_WORDS[ev.step];
    const onRoad = !isSafe(pedStrip(world, layout).kind);
    if (word && onRoad) {
      const p = renderer.toCss(PED_X + 14, world.ped.y - 6);
      hud.pop(word, p.x, p.y, true);
    }
  }
  if (ev.honks.length) sfx.horn(ev.honks[0]);
  for (const nm of ev.nearMisses) {
    sfx.nearMiss();
    const p = renderer.toCss(nm.x, nm.y - 12);
    hud.pop(pick(NEAR_MISS_WORDS), p.x, p.y);
  }
  if (ev.died) {
    const died = ev.died;
    scene = 'over';
    sfx.crash();
    renderer.bump();
    navigator.vibrate?.(180);
    const stats = { accuracy: accuracy(world), time: world.t - world.startedAt };
    const run = mode === 'endless' ? { crossed: endlessN, best: progress.endlessBest, record: endlessRecord } : undefined;
    after(900, () => {
      hud.hide();
      screens.death(
        died.reason,
        stats,
        () => (mode === 'endless' ? startEndless(0) : startLevel(levelIndex)),
        () => showMenu(),
        run,
      );
    });
  }
  if (ev.won && mode === 'endless') {
    scene = 'over';
    sfx.win();
    const crossed = endlessN + 1;
    if (crossed > progress.endlessBest) {
      progress.endlessBest = crossed;
      endlessRecord = true;
      saveProgress(progress);
    }
    hud.banner(`Улица ${crossed} ✓`);
    after(1100, () => startEndless(crossed));
  } else if (ev.won) {
    scene = 'over';
    sfx.win();
    const tutorialDone = inTutorial();
    if (tutorialDone) progress.tutorialDone = true;
    const a = accuracy(world);
    const stars = a >= 0.9 ? 3 : a >= 0.75 ? 2 : 1;
    progress.stars[level.id] = Math.max(progress.stars[level.id] ?? 0, stars);
    progress.unlocked = Math.max(progress.unlocked, Math.min(levelIndex + 1, LEVELS.length - 1));
    saveProgress(progress);
    const stats = { accuracy: a, time: world.t - world.startedAt, nearMisses: world.nearMisses };
    const hasNext = levelIndex + 1 < LEVELS.length;
    after(600, () => {
      hud.hide();
      screens.win(
        tutorialDone ? TUTORIAL.done : pick(WIN_TITLES),
        stars,
        stats,
        hasNext,
        () => startLevel(levelIndex + 1),
        () => startLevel(levelIndex),
        () => showMenu(),
      );
    });
  }
}

function inTutorial(): boolean {
  return mode === 'story' && levelIndex === 0 && !progress.tutorialDone;
}

/** First crossing ever: walk the player through the local law, one hint at a time. */
function tutorialHint(stripIndex: number, safe: boolean): string | null {
  if (!inTutorial()) return null;
  if (world.ped.steps === 0) return TUTORIAL.tap;
  if (stripIndex === 0) return TUTORIAL.rhythm;
  if (safe) return null;
  if (bikeTipAt < 0) {
    const coming = world.vehicles.some((v) => {
      const gap = frontGap(v);
      return KINDS[v.kind].avoids && !v.passed && gap > 0 && gap < 50 && Math.abs(v.y - world.ped.y) < 14;
    });
    if (coming) bikeTipAt = world.t;
  }
  if (bikeTipAt >= 0 && world.t - bikeTipAt < 2.5) return TUTORIAL.bike;
  return TUTORIAL.keep;
}

function updateHud(): void {
  const r = world.rhythm;
  const since = world.t - r.lastStep;
  const strip = pedStrip(world, layout);
  const safe = isSafe(strip.kind);
  const standing = since > level.tempo * 1.6;
  const tol = level.tolerance;

  const tip = tutorialHint(strip.index, safe);

  if (standing && safe) {
    hud.setTempo(null);
    if (tip) hud.setHint(tip, false, true);
    else
      hud.setHint(
        strip.index === 0
          ? 'Тапай по экрану в ритм, чтобы идти'
          : strip.kind === 'median'
            ? 'Островок. Можно перевести дух'
            : 'Почти!',
      );
  } else {
    const late = since > Math.max(r.lastInterval, level.tempo * (1 + tol));
    const ratio = late ? since / level.tempo : r.lastInterval / level.tempo;
    hud.setTempo(ratio);
    if (!safe && late) hud.setHint('Не стой посреди дороги!', true);
    else if (!safe && r.lastInterval < level.tempo * (1 - tol)) hud.setHint('Медленнее…', true);
    else if (tip) hud.setHint(tip, false, true);
    else hud.setHint(safe ? 'Тротуар' : 'Ровно. Так держать', false);
  }

  // Metronome: a soft cue where the next step is due.
  if (level.metronome && !standing && tickedFor !== r.lastStep && since >= level.tempo) {
    tickedFor = r.lastStep;
    sfx.tick();
    hud.pulse();
  }

  const total = layout.startY - layout.finishY;
  hud.setProgress((layout.startY - world.ped.y) / total);
  sfx.setTraffic(Math.min(1, world.vehicles.length / 14));
}

function frame(now: number): void {
  // Schedule first so one bad frame can't stop the game.
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!paused) {
    if (scene === 'play') {
      acc += dt;
      while (acc >= DT) {
        const taps = pendingTaps;
        pendingTaps = 0;
        handle(tick(world, level, layout, taps));
        acc -= DT;
        if (world.status !== 'playing') break;
      }
      if (world.status === 'playing') updateHud();
    } else if (scene === 'menu') {
      // Traffic keeps flowing behind the menu.
      acc += dt;
      while (acc >= DT) {
        tick(world, level, layout, 0);
        acc -= DT;
      }
    }
    renderer.draw(level, layout, world, hud.insets(), dt, now / 1000);
  }
}

showMenu();
requestAnimationFrame(frame);
