import { DT, HISTORY_TICKS, PED_R, PED_X, STEP, STEP_ANIM, WORLD_W } from './constants';
import { computeLayout, isSafe, stripAt, type Layout, type Level, type StripGeom } from './levels';
import { makeRng, pickWeighted, rand, range, type Rng } from './rng';
import {
  createRhythm,
  deathReason,
  isStanding,
  perceivedInterval,
  registerStep,
  type DeathReason,
  type Rhythm,
  type Verdict,
} from './rhythm';
import { ACCEL, frontGap, hasPassed, hits, KINDS, lateralGap, steer, type Perception, type Vehicle, type VehicleKind } from './vehicles';

interface Snapshot {
  t: number;
  y: number;
  lastStep: number;
  interval: number;
}

export interface Pedestrian {
  y: number;
  targetY: number;
  /** Total steps taken, drives the walk animation. */
  steps: number;
}

export interface DeathInfo {
  reason: DeathReason;
  kind: VehicleKind;
  vehicleId: number;
}

export interface World {
  t: number;
  rng: Rng;
  nextId: number;
  ped: Pedestrian;
  rhythm: Rhythm;
  vehicles: Vehicle[];
  /** Seconds until next spawn, per strip. */
  spawnIn: number[];
  history: Snapshot[];
  status: 'playing' | 'dead' | 'won';
  death: DeathInfo | null;
  nearMisses: number;
  startedAt: number;
}

export interface TickEvents {
  step: Verdict | null;
  honks: VehicleKind[];
  nearMisses: { kind: VehicleKind; x: number; y: number }[];
  died: DeathInfo | null;
  won: boolean;
}

const PREWARM_SECONDS = 10;
const NEAR_MISS_GAP = 3;
const HONK_TIME = 0.9;
/** Cars ease off when someone is this close (seconds) ahead in their lane... */
const CAR_BRAKE_TC = 1.2;
/** ...counting a few px beyond the car's width as "in the lane". */
const CAR_SEE_PX = 2;
/** Bikes side by side keep at least this much air between them, px... */
const SEPARATE_GAP = 0.5;
/** ...and slide apart no faster than this, px/s. */
const SEPARATE_RATE = 12;

export function createWorld(level: Level, seed: number, layout = computeLayout(level)): World {
  const w: World = {
    t: 0,
    rng: makeRng(seed),
    nextId: 1,
    ped: { y: layout.startY, targetY: layout.startY, steps: 0 },
    rhythm: createRhythm(level.tempo),
    vehicles: [],
    spawnIn: level.strips.map(() => 0),
    history: [],
    status: 'playing',
    death: null,
    nearMisses: 0,
    startedAt: 0,
  };
  for (const s of layout.strips) if (s.spawn) w.spawnIn[s.index] = range(w.rng, s.spawn.every) * rand(w.rng);
  // Fill the road with traffic before the player sees it.
  const ticks = Math.round(PREWARM_SECONDS / DT);
  for (let i = 0; i < ticks; i++) tick(w, level, layout, 0);
  w.startedAt = w.t;
  w.nearMisses = 0;
  return w;
}

export function pedStrip(w: World, layout: Layout): StripGeom {
  return stripAt(layout, w.ped.y);
}

/** What a driver with the given reaction time believes about the pedestrian right now. */
function perceive(w: World, reaction: number): Perception {
  const lag = Math.min(w.history.length - 1, Math.round(reaction / DT));
  const s = w.history[w.history.length - 1 - lag];
  const walking = s.t - s.lastStep < s.interval * 1.6;
  const speed = walking ? STEP / s.interval : 0;
  // Extrapolate the delayed observation to the present.
  return { y: s.y - speed * (w.t - s.t), speed };
}

/** Centres of the lanes that share a bike's zone, so a lane change ends mid-lane. */
function zoneLanes(layout: Layout, s: StripGeom): number[] {
  return layout.strips
    .filter((o) => o.kind === 'bike' && o.top >= s.zoneTop && o.bottom <= s.zoneBottom)
    .map((o) => (o.top + o.bottom) / 2);
}

function spawn(w: World, s: StripGeom, layout: Layout): void {
  const spec = s.spawn!;
  const kind = pickWeighted(w.rng, spec.kinds);
  const k = KINDS[kind];
  const dir = s.dir ?? 1;
  const x = dir > 0 ? -k.len / 2 - 2 : WORLD_W + k.len / 2 + 2;
  // Don't stack on a vehicle that has barely entered.
  for (const v of w.vehicles) {
    if (v.strip !== s.index) continue;
    const room = dir * (v.x - x) - (KINDS[v.kind].len + k.len) / 2;
    if (room < 6) {
      w.spawnIn[s.index] = 0.25;
      return;
    }
  }
  const avoids = k.avoids;
  const laneMid = (s.top + s.bottom) / 2;
  const slack = 2;
  const zoneTop = avoids ? s.zoneTop : s.top;
  const zoneBottom = avoids ? s.zoneBottom : s.bottom;
  const homeY = laneMid + (avoids ? (rand(w.rng) - 0.5) * 4 : 0);
  const baseV = range(w.rng, spec.speed) * k.speedMul;
  let goalY = homeY;
  let drift = 0;
  if (avoids && spec.drift) {
    const lanes = zoneLanes(layout, s);
    goalY = lanes[Math.floor(rand(w.rng) * lanes.length)];
    drift = spec.drift;
  }
  w.vehicles.push({
    id: w.nextId++,
    kind,
    strip: s.index,
    dir,
    x,
    y: homeY,
    homeY,
    goalY,
    drift,
    minY: zoneTop + k.wid / 2 - slack,
    maxY: zoneBottom - k.wid / 2 + slack,
    baseV,
    v: baseV,
    side: 0,
    pref: rand(w.rng) < 0.5 ? -1 : 1,
    phase: rand(w.rng) * Math.PI * 2,
    honked: false,
    minGap: Infinity,
    passed: false,
    look: Math.floor(rand(w.rng) * 1000),
  });
  w.spawnIn[s.index] = range(w.rng, spec.every);
}

/**
 * Bikes swerving around the walker can end up on top of each other. Nudge
 * overlapping pairs apart sideways, half each, staying inside their zones.
 */
function separateBikes(w: World): void {
  const vs = w.vehicles;
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i];
    const ka = KINDS[a.kind];
    if (!ka.avoids) continue;
    for (let j = i + 1; j < vs.length; j++) {
      const b = vs[j];
      const kb = KINDS[b.kind];
      if (!kb.avoids || a.dir !== b.dir) continue;
      if (Math.abs(a.x - b.x) >= (ka.len + kb.len) / 2) continue;
      const need = (ka.wid + kb.wid) / 2 + SEPARATE_GAP;
      const dy = b.y - a.y;
      const overlap = need - Math.abs(dy);
      if (overlap <= 0) continue;
      const push = Math.min(overlap / 2, SEPARATE_RATE * DT);
      const s = dy >= 0 ? 1 : -1;
      a.y = Math.min(a.maxY, Math.max(a.minY, a.y - s * push));
      b.y = Math.min(b.maxY, Math.max(b.minY, b.y + s * push));
    }
  }
}

/** Advance the world by one fixed step. `taps` is the number of step presses this tick. */
export function tick(w: World, level: Level, layout: Layout, taps: number): TickEvents {
  const ev: TickEvents = { step: null, honks: [], nearMisses: [], died: null, won: false };
  if (w.status !== 'playing') return ev;
  const ped = w.ped;

  // --- pedestrian
  for (let i = 0; i < taps; i++) {
    const onRoad = !isSafe(pedStrip(w, layout).kind);
    ev.step = registerStep(w.rhythm, w.t, level.tempo, level.tolerance, onRoad);
    ped.targetY -= STEP;
    ped.steps++;
  }
  const walkSpeed = STEP / STEP_ANIM;
  if (ped.y > ped.targetY) ped.y = Math.max(ped.targetY, ped.y - walkSpeed * DT);

  // Drivers read a walker as a smooth line, not a staircase of steps: centre the
  // line on the step pattern so the error stays within about ±STEP/2.
  const interval = perceivedInterval(w.rhythm, level.tempo, level.adapt);
  const sinceStep = w.t - w.rhythm.lastStep;
  const lineY =
    sinceStep < interval * 1.6 ? ped.targetY + 0.5 - (STEP / interval) * (sinceStep - interval / 2) : ped.y;
  w.history.push({ t: w.t, y: lineY, lastStep: w.rhythm.lastStep, interval });
  if (w.history.length > HISTORY_TICKS) w.history.shift();

  // --- traffic
  for (const s of layout.strips) {
    if (!s.spawn) continue;
    w.spawnIn[s.index] -= DT;
    if (w.spawnIn[s.index] <= 0) spawn(w, s, layout);
  }

  const onRoad = !isSafe(pedStrip(w, layout).kind);
  for (const v of w.vehicles) {
    const k = KINDS[v.kind];
    let limit = v.baseV;
    if (v.drift) {
      const d = v.goalY - v.homeY;
      v.homeY += Math.sign(d) * Math.min(Math.abs(d), v.drift * DT);
    }
    if (!k.avoids && !v.passed && onRoad) {
      // Cars don't swerve, but a driver who sees someone in the lane eases off.
      const p = perceive(w, k.reaction * level.drivers.reaction);
      const inLane = Math.abs(p.y - v.y) < k.wid / 2 + PED_R + CAR_SEE_PX;
      if (inLane && frontGap(v) / v.v < CAR_BRAKE_TC) limit *= k.brake;
    }
    if (k.avoids) {
      const res = steer(v, perceive(w, k.reaction * level.drivers.reaction), w.t, DT, level.drivers.margin);
      limit *= res.speedMul;
      if (res.conflict && !v.honked && res.tc < HONK_TIME && onRoad) {
        v.honked = true;
        ev.honks.push(v.kind);
      }
    }
    // Follow the vehicle ahead in the same lane instead of driving through it.
    for (const o of w.vehicles) {
      if (o === v || o.dir !== v.dir) continue;
      if (Math.abs(o.y - v.y) > (k.wid + KINDS[o.kind].wid) / 2) continue;
      const gap = v.dir * (o.x - v.x) - (k.len + KINDS[o.kind].len) / 2;
      if (gap > 0 && gap < 10) limit = Math.min(limit, o.v * (gap / 10));
    }
    const dv = limit - v.v;
    v.v += Math.max(-ACCEL * 2 * DT, Math.min(ACCEL * DT, dv));
    v.v = Math.max(v.v, 4);
    v.x += v.dir * v.v * DT;

    if (!v.passed) {
      const across = Math.abs(v.x - PED_X) <= k.len / 2 + PED_R;
      if (across) v.minGap = Math.min(v.minGap, lateralGap(v, ped.y));
      if (hasPassed(v)) {
        v.passed = true;
        if (v.minGap < NEAR_MISS_GAP && v.minGap > -PED_R && onRoad) {
          w.nearMisses++;
          ev.nearMisses.push({ kind: v.kind, x: PED_X, y: ped.y });
        }
      }
    }
  }
  w.vehicles = w.vehicles.filter((v) => v.x > -60 && v.x < WORLD_W + 60);
  separateBikes(w);

  // --- outcome
  for (const v of w.vehicles) {
    if (hits(v, PED_X, ped.y, PED_R)) {
      w.status = 'dead';
      w.death = {
        reason: deathReason(w.rhythm, w.t, level.tempo, level.tolerance, { avoids: KINDS[v.kind].avoids, kind: v.kind }),
        kind: v.kind,
        vehicleId: v.id,
      };
      ev.died = w.death;
      break;
    }
  }
  if (w.status === 'playing' && ped.y <= layout.finishY) {
    w.status = 'won';
    ev.won = true;
  }

  w.t += DT;
  return ev;
}

export function isPedStanding(w: World, level: Level): boolean {
  return isStanding(w.rhythm, w.t, level.tempo);
}

/** Share of in-tempo steps on the road, 0..1. */
export function accuracy(w: World): number {
  return w.rhythm.roadSteps ? w.rhythm.goodSteps / w.rhythm.roadSteps : 1;
}

export function cloneWorld(w: World): World {
  return structuredClone(w);
}
