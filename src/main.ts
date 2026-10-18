import './style.css';
import { sfx } from './audio/sfx';
import { DT, PED_X } from './game/constants';
import { computeLayout, isSafe, LEVELS, type Layout, type Level } from './game/levels';
import { accuracy, createWorld, pedStrip, tick, type TickEvents, type World } from './game/world';
import { Renderer } from './render/renderer';
import { loadProgress, saveProgress } from './storage';
import { NEAR_MISS_WORDS, pick, VERDICT_WORDS, WIN_TITLES } from './text/ru';
import { Hud, Screens } from './ui/ui';

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;
const renderer = new Renderer(document.getElementById('screen') as HTMLCanvasElement);
const progress = loadProgress();
sfx.muted = progress.muted;

type Scene = 'menu' | 'play' | 'over';
let scene: Scene = 'menu';
let levelIndex = 0;
let level: Level = LEVELS[0];
let layout: Layout = computeLayout(level);
let world: World = createWorld(level, 1, layout);
let pendingTaps = 0;
let acc = 0;
let lastFrame = performance.now();
let paused = false;
let tickedFor = -1;
let attempt = 0;

const hud = new Hud(ui, {
  onMute: () => {
    progress.muted = !progress.muted;
    sfx.setMuted(progress.muted);
    hud.setMuted(progress.muted);
    saveProgress(progress);
  },
  onMenu: () => showMenu(),
});
hud.setMuted(progress.muted);
const screens = new Screens(ui);

function startLevel(i: number): void {
  levelIndex = i;
  level = LEVELS[i];
  layout = computeLayout(level);
  attempt++;
  world = createWorld(level, (Date.now() ^ (attempt * 2654435761)) >>> 0, layout);
  pendingTaps = 0;
  acc = 0;
  tickedFor = -1;
  scene = 'play';
  screens.close();
  hud.show(level, i);
  hud.setProgress(0);
}

function showMenu(): void {
  scene = 'menu';
  hud.hide();
  screens.menu(
    () => startLevel(Math.min(progress.unlocked, LEVELS.length - 1)),
    () => showLevels(),
  );
}

function showLevels(): void {
  scene = 'menu';
  hud.hide();
  screens.levels(LEVELS, progress, (i) => startLevel(i), () => showMenu());
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
  if (paused) sfx.suspend();
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
    setTimeout(() => {
      hud.hide();
      screens.death(died.reason, stats, () => startLevel(levelIndex), () => showMenu());
    }, 900);
  }
  if (ev.won) {
    scene = 'over';
    sfx.win();
    const a = accuracy(world);
    const stars = a >= 0.9 ? 3 : a >= 0.75 ? 2 : 1;
    progress.stars[level.id] = Math.max(progress.stars[level.id] ?? 0, stars);
    progress.unlocked = Math.max(progress.unlocked, Math.min(levelIndex + 1, LEVELS.length - 1));
    saveProgress(progress);
    const stats = { accuracy: a, time: world.t - world.startedAt, nearMisses: world.nearMisses };
    const hasNext = levelIndex + 1 < LEVELS.length;
    setTimeout(() => {
      hud.hide();
      screens.win(
        pick(WIN_TITLES),
        stars,
        stats,
        hasNext,
        () => startLevel(levelIndex + 1),
        () => startLevel(levelIndex),
        () => showMenu(),
      );
    }, 600);
  }
}

function updateHud(): void {
  const r = world.rhythm;
  const since = world.t - r.lastStep;
  const strip = pedStrip(world, layout);
  const safe = isSafe(strip.kind);
  const standing = since > level.tempo * 1.6;
  const tol = level.tolerance;

  if (standing && safe) {
    hud.setTempo(null);
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
