import './style.css';
import { sfx } from './audio/sfx';
import { DT, PED_X, STEP } from './game/constants';
import {
  DAILY_ATTEMPTS,
  dailyLevel,
  dailySeed,
  dayKey,
  dayNumber,
  emptyRow,
  laneRow,
  msUntilNextDay,
  prevDay,
  trafficLanes,
} from './game/daily';
import { generateStreet } from './game/endless';
import { computeLayout, isSafe, LEVELS, stripAt, type Layout, type Level } from './game/levels';
import { createRide, rideDistance, tickRide, type RideEvents, type RideInput, type RideWorld } from './game/ride';
import { frontGap, KINDS } from './game/vehicles';
import { accuracy, createWorld, pedStrip, tick, type TickEvents, type World } from './game/world';
import { Renderer } from './render/renderer';
import { loadProgress, saveProgress, type DailyState } from './storage';
import {
  NEAR_MISS_WORDS,
  pick,
  RIDE_HINT,
  RIDE_TITLE,
  shareDaily,
  shareEndless,
  shareRide,
  shareWin,
  TUTORIAL,
  untilClock,
  untilWords,
  VERDICT_WORDS,
  WIN_TITLES,
} from './text/ru';
import { Hud, Screens, type DailyEntry, type EndlessEntry, type RideEntry } from './ui/ui';

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;
const renderer = new Renderer(document.getElementById('screen') as HTMLCanvasElement);
const progress = loadProgress();
sfx.muted = progress.muted;
/** Metronome volume per settings step: off, quiet, normal. */
const METRONOME_VOLUME = [0, 0.45, 1];
sfx.metronomeVolume = METRONOME_VOLUME[progress.settings.metronome];
const canVibrate = typeof navigator.vibrate === 'function';

function vibrate(ms: number): void {
  if (canVibrate && progress.settings.vibrate) navigator.vibrate(ms);
}

/** `pause` is the pause screen; `countdown` is the beat-in after it, before play resumes. */
type Scene = 'menu' | 'play' | 'over' | 'pause' | 'countdown';
let scene: Scene = 'menu';
/** Story streets one by one, the endless rush hour, the street of the day, or riding the bike yourself. */
let mode: 'story' | 'endless' | 'daily' | 'ride' = 'story';
let levelIndex = 0;
let endlessSeed = 0;
/** Streets crossed so far in this endless run. */
let endlessN = 0;
let endlessRecord = false;
/** The day this street-of-the-day attempt belongs to, its lanes, and lanes with an off-tempo step. */
let daily: DailyState | null = null;
let dailyLanes: number[] = [];
const dailyOff = new Set<number>();
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
/** «Ты — байкер»: its own world, and where the finger or the arrow keys steer. */
let ride: RideWorld = createRide(1);
let rideRecord = false;
const rideInput: RideInput = { targetX: null, push: 0 };
let steerPointer: number | null = null;
const keysHeld = { left: false, right: false };

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

function begin(lv: Level, title: string, seed?: number): void {
  clearTimeout(later);
  level = lv;
  layout = computeLayout(level);
  sfx.setEvening(level.palette === 'evening');
  attempt++;
  world = createWorld(level, seed ?? (Date.now() ^ (attempt * 2654435761)) >>> 0, layout);
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
    mode === 'daily'
      ? undefined
      : () => (mode === 'ride' ? startRide() : mode === 'endless' ? startEndless(0) : startLevel(levelIndex)),
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
    sfx.countIn(left === 1);
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

function startRide(): void {
  clearTimeout(later);
  mode = 'ride';
  attempt++;
  ride = createRide((Date.now() ^ (attempt * 2654435761)) >>> 0);
  rideRecord = false;
  rideInput.targetX = null;
  acc = 0;
  scene = 'play';
  sfx.setEvening(false);
  screens.close();
  hud.showRide(RIDE_TITLE);
}

/** Today's street of the day, started fresh when the day has turned over. */
function today(): DailyState {
  const day = dayKey();
  if (progress.daily?.day !== day) progress.daily = { day, rows: [], won: false, stars: 0 };
  return progress.daily;
}

const dailyDone = (d: DailyState) => d.won || d.rows.length >= DAILY_ATTEMPTS;

/** The streak still counts if the last street of the day was crossed today or yesterday. */
function streak(day: string): number {
  return progress.dailyLastWon === day || progress.dailyLastWon === prevDay(day) ? progress.dailyStreak : 0;
}

function startDaily(): void {
  const d = today();
  if (dailyDone(d)) return showDailyResult(d);
  mode = 'daily';
  daily = d;
  const lv = dailyLevel(d.day);
  dailyLanes = trafficLanes(lv);
  dailyOff.clear();
  // The attempt is spent the moment it starts: walking away halfway doesn't give it back.
  d.rows.push(emptyRow(dailyLanes));
  saveProgress(progress);
  begin(lv, `📅 ${lv.name}`, dailySeed(d.day));
}

function dailyShareText(d: DailyState): string {
  return shareDaily(dayNumber(d.day), dailyLevel(d.day).name, d.rows, d.won, d.stars, DAILY_ATTEMPTS);
}

function showDailyResult(d: DailyState): void {
  clearTimeout(later);
  scene = 'menu';
  hud.hide();
  const lv = dailyLevel(d.day);
  screens.dailyResult(
    {
      won: d.won,
      stars: d.stars,
      number: dayNumber(d.day),
      street: lv.name,
      subtitle: lv.subtitle,
      rows: d.rows,
      streak: streak(dayKey()),
      next: untilClock(msUntilNextDay()),
      shareText: dailyShareText(d),
    },
    () => showMenu(),
  );
}

/** Open once the first street has taught the local law. */
function dailyEntry(): DailyEntry {
  const d = today();
  const left = DAILY_ATTEMPTS - d.rows.length;
  const note = d.won
    ? `✓ перешёл · ${streak(d.day)} дн. подряд`
    : left <= 0
      ? `завтра новая улица`
      : d.rows.length
        ? `осталось попыток: ${left}`
        : `№${dayNumber(d.day)} · ${dailyLevel(d.day).subtitle}`;
  return { open: progress.tutorialDone, note, onPlay: () => startDaily() };
}

/** The endless rush hour opens once the first street with cars is behind. */
function endlessEntry(): EndlessEntry {
  const open = progress.unlocked >= 3 || progress.endlessBest > 0;
  return { open, best: progress.endlessBest, onPlay: () => startEndless(0) };
}

/** Riding opens together with the street of the day, once the local law has been learnt on foot. */
function rideEntry(): RideEntry {
  return { open: progress.tutorialDone, best: progress.rideBest, onPlay: () => startRide() };
}

function showMenu(): void {
  clearTimeout(later);
  scene = 'menu';
  hud.hide();
  screens.menu(
    () => startLevel(Math.min(progress.unlocked, LEVELS.length - 1)),
    () => showLevels(),
    endlessEntry(),
    () => showSettings(),
    dailyEntry(),
    rideEntry(),
  );
}

function showSettings(): void {
  const st = progress.settings;
  const METRONOME_LABELS = ['выкл', 'тихо', 'громко'];
  screens.settings(
    [
      {
        label: 'Звук',
        value: progress.muted ? 'выкл' : 'вкл',
        onClick: () => {
          progress.muted = !progress.muted;
          sfx.setMuted(progress.muted);
          hud.setMuted(progress.muted);
          saveProgress(progress);
          return progress.muted ? 'выкл' : 'вкл';
        },
      },
      {
        label: 'Метроном',
        value: METRONOME_LABELS[st.metronome],
        onClick: () => {
          st.metronome = ((st.metronome + 1) % 3) as 0 | 1 | 2;
          sfx.unlock();
          sfx.setMetronomeVolume(METRONOME_VOLUME[st.metronome]);
          sfx.tick();
          saveProgress(progress);
          return METRONOME_LABELS[st.metronome];
        },
      },
      // iOS Safari has no vibration API at all, so don't offer a switch that does nothing.
      ...(canVibrate
        ? [
            {
              label: 'Вибрация на шаг',
              value: st.vibrate ? 'вкл' : 'выкл',
              onClick: () => {
                st.vibrate = !st.vibrate;
                vibrate(30);
                saveProgress(progress);
                return st.vibrate ? 'вкл' : 'выкл';
              },
            },
          ]
        : []),
    ],
    () => showMenu(),
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

/** World x under the pointer in the bike mode (the street is exactly as wide as the view). */
function rideX(e: PointerEvent): number {
  return (e.clientX - app.getBoundingClientRect().left) / renderer.scale;
}

// ---- input: the whole screen is the button (or, on the bike, the handlebar)
app.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if ((e.target as Element).closest('button, .screen')) return;
  if (mode === 'ride') {
    steerPointer = e.pointerId;
    rideInput.targetX = rideX(e);
    return;
  }
  onTap();
});
app.addEventListener('pointermove', (e) => {
  if (mode === 'ride' && e.pointerId === steerPointer) rideInput.targetX = rideX(e);
});
const releaseSteer = (e: PointerEvent) => {
  if (e.pointerId !== steerPointer) return;
  steerPointer = null;
  rideInput.targetX = null;
};
app.addEventListener('pointerup', releaseSteer);
app.addEventListener('pointercancel', releaseSteer);
const steerKey = (code: string): 'left' | 'right' | null =>
  code === 'ArrowLeft' || code === 'KeyA' ? 'left' : code === 'ArrowRight' || code === 'KeyD' ? 'right' : null;
const updatePush = () => (rideInput.push = keysHeld.left === keysHeld.right ? 0 : keysHeld.left ? -1 : 1);
window.addEventListener('keyup', (e) => {
  const k = steerKey(e.code);
  if (k) {
    keysHeld[k] = false;
    updatePush();
  }
});
window.addEventListener('keydown', (e) => {
  const k = steerKey(e.code);
  if (k) {
    keysHeld[k] = true;
    updatePush();
  }
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
    vibrate(8);
    const word = VERDICT_WORDS[ev.step];
    const onRoad = !isSafe(pedStrip(world, layout).kind);
    if (word && onRoad) {
      const p = renderer.toCss(PED_X + 14, world.ped.y - 6);
      hud.pop(word, p.x, p.y, true);
    }
    // The strip the step was taken from: the walker has already started moving off it.
    if (mode === 'daily' && onRoad && ev.step !== 'steady') dailyOff.add(stripAt(layout, world.ped.targetY + STEP).index);
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
    vibrate(180);
    const stats = { accuracy: accuracy(world), time: world.t - world.startedAt };
    const run = mode === 'endless' ? { crossed: endlessN, best: progress.endlessBest, record: endlessRecord } : undefined;
    const d = mode === 'daily' ? daily : null;
    if (d) {
      d.rows[d.rows.length - 1] = laneRow(dailyLanes, dailyOff, pedStrip(world, layout).index);
      saveProgress(progress);
    }
    const out = d !== null && dailyDone(d);
    after(900, () => {
      hud.hide();
      screens.death(
        died.reason,
        stats,
        out ? undefined : () => (mode === 'endless' ? startEndless(0) : mode === 'daily' ? startDaily() : startLevel(levelIndex)),
        () => showMenu(),
        run,
        run && run.crossed > 0 ? shareEndless(run.crossed) : d && out ? dailyShareText(d) : undefined,
        d
          ? {
              rows: d.rows,
              note: out
                ? `Попытки кончились. Новая улица через ${untilWords(msUntilNextDay())}.`
                : `Попытка ${d.rows.length} из ${DAILY_ATTEMPTS}. Улица та же, байки те же.`,
            }
          : undefined,
      );
    });
  }
  if (ev.won && mode === 'endless') {
    scene = 'over';
    sfx.streetDone();
    const crossed = endlessN + 1;
    if (crossed > progress.endlessBest) {
      progress.endlessBest = crossed;
      endlessRecord = true;
      saveProgress(progress);
    }
    hud.banner(`Улица ${crossed} ✓`);
    after(1100, () => startEndless(crossed));
  } else if (ev.won && mode === 'daily' && daily) {
    scene = 'over';
    sfx.win();
    const d = daily;
    const a = accuracy(world);
    d.rows[d.rows.length - 1] = laneRow(dailyLanes, dailyOff, null);
    d.won = true;
    d.stars = a >= 0.9 ? 3 : a >= 0.75 ? 2 : 1;
    if (progress.dailyLastWon !== d.day) {
      progress.dailyStreak = progress.dailyLastWon === prevDay(d.day) ? progress.dailyStreak + 1 : 1;
      progress.dailyLastWon = d.day;
    }
    saveProgress(progress);
    after(600, () => showDailyResult(d));
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
        shareWin(level.name, stars),
      );
    });
  }
}

function handleRide(ev: RideEvents): void {
  for (const nm of ev.nearMisses) {
    sfx.nearMiss();
    const p = renderer.toCssRide(nm.x, nm.y - 10);
    hud.pop(pick(NEAR_MISS_WORDS), p.x, p.y);
  }
  if (!ev.died) return;
  const died = ev.died;
  scene = 'over';
  sfx.crash();
  renderer.bump();
  vibrate(180);
  const distance = rideDistance(ride);
  if (distance > progress.rideBest) {
    progress.rideBest = distance;
    rideRecord = true;
    saveProgress(progress);
  }
  const stats = { distance, best: progress.rideBest, record: rideRecord, nearMisses: ride.nearMisses, time: ride.t };
  after(900, () => {
    hud.hide();
    screens.rideOver(died.reason, stats, () => startRide(), () => showMenu(), distance > 0 ? shareRide(distance) : undefined);
  });
}

function updateRideHud(): void {
  hud.setHint(ride.t < 4 ? RIDE_HINT : `${rideDistance(ride)} м · рекорд ${Math.max(progress.rideBest, rideDistance(ride))} м`, false, ride.t < 4);
  sfx.setTraffic(Math.min(1, ride.npcs.length / 8));
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
    if (scene === 'play' && mode === 'ride') {
      acc += dt;
      while (acc >= DT) {
        handleRide(tickRide(ride, rideInput));
        acc -= DT;
        if (ride.status !== 'playing') break;
      }
      if (ride.status === 'playing') updateRideHud();
    } else if (scene === 'play') {
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
    if (mode === 'ride' && scene !== 'menu') renderer.drawRide(ride, hud.insets(), dt, now / 1000);
    else renderer.draw(level, layout, world, hud.insets(), dt, now / 1000);
  }
}

showMenu();
requestAnimationFrame(frame);
