import { PED_R, PED_X } from './constants';

export type VehicleKind = 'bike' | 'grab' | 'family' | 'cargo' | 'tourist' | 'car' | 'bus';

export interface KindSpec {
  /** Length along travel direction and width across it, px. */
  len: number;
  wid: number;
  /** Bikes steer around people; cars and buses do not. */
  avoids: boolean;
  /** Driver perception delay, seconds. */
  reaction: number;
  /** Max lateral speed, px/s. */
  steer: number;
  /** Extra gap the driver keeps from the pedestrian, px. */
  margin: number;
  speedMul: number;
  /** Random lateral sway amplitude, px (tourists). */
  wobble: number;
  /** Cars and buses: share of cruise speed they ease off to when someone is in their lane. */
  brake: number;
}

export const KINDS: Record<VehicleKind, KindSpec> = {
  bike: { len: 14, wid: 6, avoids: true, reaction: 0.3, steer: 24, margin: 3, speedMul: 1, wobble: 0, brake: 1 },
  grab: { len: 14, wid: 6, avoids: true, reaction: 0.22, steer: 30, margin: 2.5, speedMul: 1.25, wobble: 0, brake: 1 },
  family: { len: 16, wid: 8, avoids: true, reaction: 0.35, steer: 17, margin: 3, speedMul: 0.85, wobble: 0, brake: 1 },
  cargo: { len: 17, wid: 11, avoids: true, reaction: 0.4, steer: 14, margin: 3, speedMul: 0.75, wobble: 0, brake: 1 },
  tourist: { len: 14, wid: 6, avoids: true, reaction: 0.5, steer: 20, margin: 4, speedMul: 0.8, wobble: 2.5, brake: 1 },
  car: { len: 26, wid: 12, avoids: false, reaction: 0.45, steer: 0, margin: 0, speedMul: 1, wobble: 0, brake: 0.55 },
  bus: { len: 44, wid: 14, avoids: false, reaction: 0.55, steer: 0, margin: 0, speedMul: 0.8, wobble: 0, brake: 0.75 },
};

export interface Vehicle {
  id: number;
  kind: VehicleKind;
  strip: number;
  dir: 1 | -1;
  x: number;
  y: number;
  /** Lane centre the driver returns to. */
  homeY: number;
  /** Lane the driver is slowly moving over to, and how fast (px/s, 0 = stays in lane). */
  goalY: number;
  drift: number;
  /** Allowed range for the vehicle centre (its zone of the road). */
  minY: number;
  maxY: number;
  baseV: number;
  v: number;
  /** Which way the driver committed to pass: -1 ahead of the pedestrian, 1 behind, 0 none. */
  side: -1 | 0 | 1;
  /** Habit: the side this driver passes on when both are possible. */
  pref: -1 | 1;
  phase: number;
  honked: boolean;
  /** Smallest gap to the pedestrian while crossing their column; Infinity until then. */
  minGap: number;
  passed: boolean;
  /** Visual variant seed. */
  look: number;
}

/** What a driver knows about the pedestrian (already delayed by their reaction time). */
export interface Perception {
  /** Pedestrian y extrapolated to "now". */
  y: number;
  /** Believed upward speed, px/s. */
  speed: number;
}

export interface SteerResult {
  conflict: boolean;
  /** Seconds until the vehicle front reaches the pedestrian column. */
  tc: number;
  /** Requested speed relative to cruise: brake to let them pass, or gun it to pass first. */
  speedMul: number;
}

/** Closer than this a driver won't swing to the other side of the pedestrian. */
const COMMIT_TC = 0.9;
/** Within this time a driver who can't fit adjusts speed instead. */
const SPEED_TC = 1.6;
const BRAKE_MUL = 0.6;
const GUN_MUL = 1.15;
/** Extra room (px) a side needs to be chosen in the first place. */
const CHOOSE_SPARE = 5;
/** How much extra swerve (px) a driver accepts to pass on their habitual side. */
const HABIT_PX = 8;
/** Longitudinal acceleration limit, px/s². */
export const ACCEL = 45;

/** Distance along travel from the vehicle front to the pedestrian's near edge (negative once passing). */
export function frontGap(veh: Vehicle): number {
  return veh.dir * (PED_X - veh.x) - KINDS[veh.kind].len / 2 - PED_R;
}

export function hasPassed(veh: Vehicle): boolean {
  return veh.dir * (veh.x - PED_X) > KINDS[veh.kind].len / 2 + PED_R;
}

/**
 * Bike AI: predict where the pedestrian will be while we cross their column and
 * steer to pass ahead of them or behind them, whichever needs less steering.
 */
export function steer(veh: Vehicle, p: Perception | null, t: number, dt: number, marginAdj = 0): SteerResult {
  const spec = KINDS[veh.kind];
  let target = veh.homeY;
  let conflict = false;
  let tc = Infinity;
  let rate = spec.steer * 0.5;
  let speedMul = 1;

  if (p && !veh.passed) {
    tc = Math.max(0, frontGap(veh) / veh.v);
    const passDur = (spec.len + 2 * PED_R) / veh.v;
    const yArrive = p.y - p.speed * tc;
    const yLeave = yArrive - p.speed * passDur;
    const c = spec.wid / 2 + PED_R + Math.max(0.5, spec.margin + marginAdj);
    // While we cross their column the pedestrian sweeps [yLeave, yArrive]; keep out of that band.
    const behind = yArrive + c;
    const ahead = yLeave - c;
    const sideOf = (y: number): -1 | 0 | 1 => (y >= behind ? 1 : y <= ahead ? -1 : 0);
    const curSide = sideOf(veh.y);
    const homeSide = sideOf(veh.homeY);
    if (curSide !== 0 && curSide === homeSide) {
      veh.side = 0;
    } else {
      conflict = true;
      // Keeping a side only needs it to fit; picking one wants some room to spare.
      const fits = (s: -1 | 0 | 1, spare: number) =>
        s === 1 ? behind + spare <= veh.maxY : s === -1 ? ahead - spare >= veh.minY : false;
      let side = veh.side;
      const close = tc < COMMIT_TC || Math.abs(veh.x - PED_X) < spec.len / 2 + PED_R;
      // Swinging across the pedestrian's path at close range is how people get hit.
      if (!fits(side, 0) && !(close && side !== 0)) side = fits(curSide, 0) ? curSide : 0;
      if (side === 0) {
        // Pick the cheaper side: a small swerve we can finish before arriving,
        // with room to spare, on the side this driver habitually takes.
        const cost = (s: -1 | 1) => {
          const edge = s === 1 ? behind : ahead;
          const swerve = Math.max(0, s * (edge - veh.y));
          let c = swerve;
          if (swerve / spec.steer > tc * 0.8) c += 100;
          if (!fits(s, 0)) c += 50 + Math.abs(s === 1 ? behind - veh.maxY : veh.minY - ahead) * 4;
          else if (!fits(s, CHOOSE_SPARE)) c += 6;
          if (s !== veh.pref) c += HABIT_PX;
          return c;
        };
        side = cost(1) <= cost(-1) ? 1 : -1;
      }
      veh.side = side;
      target = side === 1 ? Math.max(behind, veh.homeY) : Math.min(ahead, veh.homeY);
      rate = spec.steer;
      if (!fits(side, 0) && tc < SPEED_TC) speedMul = side === 1 ? BRAKE_MUL : GUN_MUL;
    }
  } else {
    veh.side = 0;
  }

  if (spec.wobble) target += spec.wobble * Math.sin(veh.phase + t * 2.7);
  target = Math.min(veh.maxY, Math.max(veh.minY, target));
  const dy = target - veh.y;
  const maxMove = rate * dt;
  veh.y += Math.max(-maxMove, Math.min(maxMove, dy));
  return { conflict, tc, speedMul };
}

/** Circle (pedestrian) vs axis-aligned rectangle (vehicle). */
export function hits(veh: Vehicle, px: number, py: number, r: number): boolean {
  const spec = KINDS[veh.kind];
  const hx = spec.len / 2 - 1;
  const hy = spec.wid / 2 - 0.5;
  const dx = Math.max(Math.abs(px - veh.x) - hx, 0);
  const dy = Math.max(Math.abs(py - veh.y) - hy, 0);
  return dx * dx + dy * dy < r * r;
}

/** Lateral clearance between the pedestrian and the vehicle body, px. */
export function lateralGap(veh: Vehicle, py: number): number {
  return Math.abs(py - veh.y) - KINDS[veh.kind].wid / 2 - PED_R;
}
