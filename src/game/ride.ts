import { DT, PED_R, STEP, STEP_ANIM, VIEW_W } from './constants';
import { makeRng, pickWeighted, rand, range, type Rng } from './rng';
import { KINDS, type VehicleKind } from './vehicles';

/**
 * «Ты — байкер»: the other way round. The player is a Grab rider going up a
 * one-way street, and the pedestrians are tourists who don't know the local law.
 * The road runs vertically: the bike moves up (y decreases), people cross along x.
 */

/** The street is exactly as wide as the camera, so there is no sideways scroll. */
export const RIDE_W = VIEW_W;
/** Road edges; sidewalks and shops outside. */
export const ROAD_L = 22;
export const ROAD_R = RIDE_W - 22;
export const LANES = 4;
export const LANE_W = (ROAD_R - ROAD_L) / LANES;
export const laneX = (i: number) => ROAD_L + LANE_W * (i + 0.5);

/** Player bike: a green Grab, length along y, width along x. */
export const BIKE_KIND: VehicleKind = 'grab';
/** Lateral speed of the player bike, px/s. */
export const RIDE_STEER = 46;
/** Cruise speed at the start and at full difficulty, px/s. */
const V0 = 48;
const VMAX = 78;
/** Distance (px) over which the speed and the crowd grow to full. */
const RAMP = 7000;
/** New things appear this far ahead of the bike, above the top of the screen. */
const SPAWN_AHEAD = 300;
/** Pixels per metre for the score: a 14 px bike is about 3.5 m. */
export const PX_PER_M = 4;
const NEAR_MISS_GAP = 3;

export type WalkerType = 'local' | 'tourist' | 'selfie' | 'jogger';

export interface Walker {
  id: number;
  type: WalkerType;
  /** Walking +x (left to right) or -x. */
  dir: 1 | -1;
  x: number;
  targetX: number;
  y: number;
  tempo: number;
  /** World time of the next step. */
  nextStep: number;
  steps: number;
  mode: 'walk' | 'freeze' | 'run';
  /** Selfie tourists stop here (x) for `freezeFor` seconds; joggers break into a run at `runAt`. */
  freezeAt: number | null;
  freezeFor: number;
  until: number;
  runAt: number | null;
  passed: boolean;
  minGap: number;
  look: number;
}

export interface Npc {
  id: number;
  kind: VehicleKind;
  x: number;
  y: number;
  v: number;
  baseV: number;
  look: number;
}

export interface Bike {
  x: number;
  y: number;
  v: number;
  /** Last lateral velocity, px/s: the sprite leans into it. */
  vx: number;
}

/** Who the bike ran into, and what that person was doing at the time. */
export type RideReason = 'steady' | 'froze' | 'ran' | 'bike' | 'car';

export interface RideDeath {
  reason: RideReason;
  walker: WalkerType | null;
  kind: VehicleKind | null;
}

export interface RideWorld {
  t: number;
  rng: Rng;
  nextId: number;
  bike: Bike;
  startY: number;
  walkers: Walker[];
  npcs: Npc[];
  /** Bike y at which the next crossing and the next vehicle appear. */
  nextWalkerAt: number;
  nextNpcAt: number;
  status: 'playing' | 'dead';
  death: RideDeath | null;
  nearMisses: number;
}

export interface RideInput {
  /** World x the finger points at, or null when nothing is held. */
  targetX: number | null;
  /** Keyboard: -1 left, 1 right, 0 none. Wins over the finger. */
  push: -1 | 0 | 1;
}

export interface RideEvents {
  nearMisses: { x: number; y: number }[];
  died: RideDeath | null;
}

const WALKER_TEMPO: Record<WalkerType, [number, number]> = {
  local: [0.52, 0.6],
  tourist: [0.44, 0.52],
  selfie: [0.44, 0.52],
  jogger: [0.42, 0.48],
};
/** A jogger breaking into a run steps this often, s. */
const RUN_TEMPO = 0.2;

/** 0 at the start, 1 at full difficulty. */
export function rideLevel(w: RideWorld): number {
  return Math.min(1, (w.startY - w.bike.y) / RAMP);
}

export function rideDistance(w: RideWorld): number {
  return Math.max(0, Math.round((w.startY - w.bike.y) / PX_PER_M));
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp2 = (a: [number, number], b: [number, number], k: number): [number, number] => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

export function createRide(seed: number): RideWorld {
  const startY = 0;
  const w: RideWorld = {
    t: 0,
    rng: makeRng(seed),
    nextId: 1,
    bike: { x: laneX(1), y: startY, v: V0, vx: 0 },
    startY,
    walkers: [],
    npcs: [],
    // A clear stretch to get a feel for the steering before the first tourist.
    nextWalkerAt: startY - 120,
    nextNpcAt: startY - 60,
    status: 'playing',
    death: null,
    nearMisses: 0,
  };
  return w;
}

function spawnWalkers(w: RideWorld, k: number): void {
  const rng = w.rng;
  const weights: Partial<Record<WalkerType, number>> = {
    local: lerp(5, 2, k),
    tourist: lerp(3, 2, k),
    selfie: lerp(1, 4, k),
    jogger: k < 0.12 ? 0 : lerp(1, 3, k),
  };
  const type = pickWeighted(rng, weights);
  const dir: 1 | -1 = rand(rng) < 0.5 ? 1 : -1;
  // Tourists come in little groups walking side by side.
  const group = type === 'tourist' && rand(rng) < 0.25 + 0.25 * k ? 2 + Math.floor(rand(rng) * 2) : 1;
  const y0 = w.bike.y - SPAWN_AHEAD;
  // Somewhere between the near sidewalk and the middle of the road, already walking.
  const from = dir > 0 ? ROAD_L - 14 : ROAD_R + 14;
  const startX = from + dir * Math.round(range(rng, [0, 44]) / STEP) * STEP;
  // Never appear on top of a slow local bike: try again a few pixels later.
  const onNpc = w.npcs.some((o) => {
    const k = KINDS[o.kind];
    const xs = [startX, startX - dir * (group - 1) * 2];
    return xs.some((x) => Math.abs(x - o.x) < k.wid / 2 + PED_R + 2) && Math.abs(y0 - o.y) < k.len / 2 + PED_R + 7 * group;
  });
  if (onNpc) {
    w.nextWalkerAt = w.bike.y - 4;
    return;
  }
  const tempo = range(rng, WALKER_TEMPO[type]);
  const road = (): number => range(rng, [ROAD_L + 10, ROAD_R - 10]);
  for (let i = 0; i < group; i++) {
    const x = startX - dir * i * 2;
    w.walkers.push({
      id: w.nextId++,
      type,
      dir,
      x,
      targetX: x,
      y: y0 - i * 7,
      tempo,
      nextStep: w.t + rand(rng) * tempo,
      steps: 0,
      mode: 'walk',
      freezeAt: type === 'selfie' ? road() : null,
      freezeFor: range(rng, [1.2, 2.4]),
      until: 0,
      runAt: type === 'jogger' ? road() : null,
      passed: false,
      minGap: Infinity,
      look: Math.floor(rand(rng) * 1000),
    });
  }
  const gap = lerp2([150, 230], [62, 110], k);
  w.nextWalkerAt = w.bike.y - range(rng, gap) - (group - 1) * 7;
}

function spawnNpc(w: RideWorld, k: number): void {
  const rng = w.rng;
  const weights: Partial<Record<VehicleKind, number>> = {
    bike: 6,
    family: 2,
    cargo: 1 + k,
    car: k < 0.15 ? 0 : 1 + 2 * k,
  };
  const kind = pickWeighted(rng, weights);
  const spec = KINDS[kind];
  const lane = Math.floor(rand(rng) * LANES);
  const x = laneX(lane) + (spec.avoids ? (rand(rng) - 0.5) * 4 : 0);
  const y = w.bike.y - SPAWN_AHEAD;
  const room = (o: { x: number; y: number }, wid: number, len: number) =>
    Math.abs(o.x - x) < (wid + spec.wid) / 2 + 2 && Math.abs(o.y - y) < (len + spec.len) / 2 + 8;
  const blocked =
    w.npcs.some((o) => room(o, KINDS[o.kind].wid, KINDS[o.kind].len)) || w.walkers.some((p) => room(p, 2 * PED_R, 2 * PED_R + 30));
  if (!blocked) {
    const baseV = range(rng, kind === 'car' ? [36, 44] : [28, 40]) * Math.min(1, spec.speedMul + 0.15);
    w.npcs.push({ id: w.nextId++, kind, x, y, v: baseV, baseV, look: Math.floor(rand(rng) * 1000) });
  }
  w.nextNpcAt = w.bike.y - range(rng, lerp2([110, 190], [55, 95], k));
}

/** Is a local vehicle right where this step would land? Even tourists don't walk into the side of a bike. */
function stepBlocked(w: RideWorld, p: Walker): boolean {
  const x = p.targetX + p.dir * STEP;
  return w.npcs.some((o) => {
    const k = KINDS[o.kind];
    return Math.abs(x - o.x) < k.wid / 2 + PED_R + 1 && Math.abs(p.y - o.y) < k.len / 2 + PED_R + 2;
  });
}

function stepWalker(w: RideWorld, p: Walker): void {
  const t = w.t;
  if (p.mode === 'freeze') {
    if (t < p.until) return;
    p.mode = 'walk';
    p.nextStep = t + p.tempo;
  }
  if (t >= p.nextStep) {
    if (p.freezeAt !== null && p.dir * (p.x - p.freezeAt) >= 0) {
      // Sunset over the bay. Must take a photo. Right here.
      p.freezeAt = null;
      p.mode = 'freeze';
      p.until = t + p.freezeFor;
      return;
    }
    if (p.runAt !== null && p.dir * (p.x - p.runAt) >= 0) {
      p.runAt = null;
      p.mode = 'run';
    }
    if (stepBlocked(w, p)) {
      p.nextStep = t + p.tempo * 0.5;
      return;
    }
    p.targetX += p.dir * STEP;
    p.steps++;
    p.nextStep = t + (p.mode === 'run' ? RUN_TEMPO : p.tempo);
  }
  const speed = STEP / STEP_ANIM;
  const d = p.targetX - p.x;
  p.x += Math.sign(d) * Math.min(Math.abs(d), speed * DT);
}

/** Half extents of a vehicle's body when it drives up the screen. */
function box(kind: VehicleKind): { hx: number; hy: number } {
  const s = KINDS[kind];
  return { hx: s.wid / 2 - 0.5, hy: s.len / 2 - 1 };
}

function hitsWalker(bike: Bike, p: Walker): boolean {
  const { hx, hy } = box(BIKE_KIND);
  const dx = Math.max(Math.abs(p.x - bike.x) - hx, 0);
  const dy = Math.max(Math.abs(p.y - bike.y) - hy, 0);
  return dx * dx + dy * dy < PED_R * PED_R;
}

function hitsNpc(bike: Bike, o: Npc): boolean {
  const a = box(BIKE_KIND);
  const b = box(o.kind);
  return Math.abs(bike.x - o.x) < a.hx + b.hx && Math.abs(bike.y - o.y) < a.hy + b.hy;
}

/** Locals let people cross: an NPC eases off for anyone in its path. */
function npcLimit(w: RideWorld, o: Npc): number {
  const spec = KINDS[o.kind];
  let limit = o.baseV;
  for (const p of w.walkers) {
    const ahead = o.y - spec.len / 2 - (p.y + PED_R);
    if (ahead < -2 || ahead > 18 + o.v * 0.8) continue;
    // Where they'll be by the time we get there, give or take a step.
    const soon = p.x + (p.mode === 'freeze' ? 0 : p.dir * STEP);
    const near = Math.min(Math.abs(p.x - o.x), Math.abs(soon - o.x));
    if (near < spec.wid / 2 + PED_R + 3) limit = Math.min(limit, Math.max(0, (ahead - 3) * 2));
  }
  for (const q of w.npcs) {
    if (q === o || Math.abs(q.x - o.x) > (spec.wid + KINDS[q.kind].wid) / 2) continue;
    const gap = o.y - q.y - (spec.len + KINDS[q.kind].len) / 2;
    if (gap > 0 && gap < 12) limit = Math.min(limit, q.v * (gap / 12));
  }
  return limit;
}

export function tickRide(w: RideWorld, input: RideInput): RideEvents {
  const ev: RideEvents = { nearMisses: [], died: null };
  if (w.status !== 'playing') return ev;
  const k = rideLevel(w);
  const bike = w.bike;

  // --- the player
  bike.v = lerp(V0, VMAX, k);
  const target = input.push !== 0 ? bike.x + input.push * 100 : input.targetX;
  const before = bike.x;
  if (target !== null) {
    const d = target - bike.x;
    bike.x += Math.sign(d) * Math.min(Math.abs(d), RIDE_STEER * DT);
  }
  const half = KINDS[BIKE_KIND].wid / 2 + 1;
  bike.x = Math.min(ROAD_R - half, Math.max(ROAD_L + half, bike.x));
  bike.vx = (bike.x - before) / DT;
  bike.y -= bike.v * DT;

  // --- spawn ahead
  if (bike.y <= w.nextWalkerAt) spawnWalkers(w, k);
  if (bike.y <= w.nextNpcAt) spawnNpc(w, k);

  // --- people and traffic
  for (const p of w.walkers) stepWalker(w, p);
  for (const o of w.npcs) {
    const limit = npcLimit(w, o);
    const dv = limit - o.v;
    o.v += Math.max(-90 * DT, Math.min(45 * DT, dv));
    o.v = Math.max(0, o.v);
    o.y -= o.v * DT;
  }

  // --- near misses: closest sideways gap while the bike is alongside someone
  const { hx, hy } = box(BIKE_KIND);
  for (const p of w.walkers) {
    if (p.passed) continue;
    if (Math.abs(p.y - bike.y) <= hy + PED_R) p.minGap = Math.min(p.minGap, Math.abs(p.x - bike.x) - hx - PED_R);
    if (p.y - PED_R > bike.y + hy) {
      p.passed = true;
      if (p.minGap < NEAR_MISS_GAP && p.minGap > -PED_R) {
        w.nearMisses++;
        ev.nearMisses.push({ x: p.x, y: p.y });
      }
    }
  }

  // --- outcome
  for (const p of w.walkers) {
    if (!hitsWalker(bike, p)) continue;
    const reason: RideReason = p.mode === 'freeze' ? 'froze' : p.mode === 'run' ? 'ran' : 'steady';
    w.death = { reason, walker: p.type, kind: null };
    break;
  }
  if (!w.death) {
    for (const o of w.npcs) {
      if (!hitsNpc(bike, o)) continue;
      w.death = { reason: KINDS[o.kind].avoids ? 'bike' : 'car', walker: null, kind: o.kind };
      break;
    }
  }
  if (w.death) {
    w.status = 'dead';
    ev.died = w.death;
  }

  // Forget whatever is far behind or has left the road.
  const behind = bike.y + 220;
  w.walkers = w.walkers.filter((p) => p.y < behind && p.x > -12 && p.x < RIDE_W + 12);
  w.npcs = w.npcs.filter((o) => o.y < behind && o.y > bike.y - SPAWN_AHEAD - 200);

  w.t += DT;
  return ev;
}

export function cloneRide(w: RideWorld): RideWorld {
  return structuredClone(w);
}
