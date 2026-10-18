import type { Vehicle, VehicleKind } from '../game/vehicles';

/**
 * All art is drawn procedurally at 1:1 logical pixels and cached per variant.
 * Vehicles are drawn top-down facing right; the renderer mirrors them for leftward traffic.
 */

type Ctx = CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

const r = (ctx: Ctx, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

const HELMETS = ['#e63946', '#f1d302', '#f8f9fa', '#3a86ff', '#ff8fab', '#8338ec', '#2b2d42', '#fb8500'];
const SHIRTS = ['#457b9d', '#e9c46a', '#2a9d8f', '#f4a261', '#e76f51', '#fefae0', '#6d597a', '#90be6d'];
const BODIES = ['#d62828', '#1d3557', '#e5e5e5', '#fca311', '#2b2d42', '#8d99ae', '#06d6a0', '#7b2cbf'];
const CARS = ['#f1f1f1', '#b8bcc2', '#25262b', '#b23a48', '#2f5d8a', '#e9e3d5'];
const SKIN = '#e8b98a';
const TOURIST_SKIN = '#ffab91';
const TIRE = '#141418';
const SHADOW = 'rgba(0,0,0,0.28)';

function rider(ctx: Ctx, rx: number, cy: number, helmet: string, shirt: string, handX: number, skin = SKIN, hair = false) {
  r(ctx, rx - 1, cy - 2, 3, 5, shirt);
  if (handX > rx + 2) {
    r(ctx, rx + 2, cy - 2, handX - rx - 2, 1, skin);
    r(ctx, rx + 2, cy + 2, handX - rx - 2, 1, skin);
  }
  r(ctx, rx - 1, cy - 1, 3, 3, helmet);
  if (!hair) r(ctx, rx, cy - 1, 1, 1, 'rgba(255,255,255,0.55)');
}

function smallRider(ctx: Ctx, rx: number, cy: number, helmet: string, shirt: string) {
  r(ctx, rx - 1, cy - 1, 2, 3, shirt);
  r(ctx, rx - 1, cy - 1, 2, 2, helmet);
}

function conicalHat(ctx: Ctx, cx: number, cy: number) {
  r(ctx, cx - 2, cy - 1, 5, 3, '#e9d8a6');
  r(ctx, cx - 1, cy - 2, 3, 5, '#e9d8a6');
  r(ctx, cx - 1, cy - 1, 3, 3, '#d4bf86');
  r(ctx, cx, cy, 1, 1, '#b39a5e');
}

function scooter(ctx: Ctx, len: number, h: number, body: string, from = 2) {
  const cy = Math.floor(h / 2);
  r(ctx, from, cy - 1 + 1, len - from, 3, SHADOW);
  r(ctx, 0, cy, 2, 1, TIRE);
  r(ctx, len - 2, cy, 2, 1, TIRE);
  r(ctx, from, cy - 1, len - from - 3, 3, body);
  r(ctx, len - 4, cy - 1, 2, 3, body);
  r(ctx, len - 3, cy, 1, 1, '#fff6b0');
  r(ctx, len - 5, cy - 2, 1, 5, '#222');
  r(ctx, len - 5, cy - 3, 1, 1, '#c0c0c0');
  r(ctx, len - 5, cy + 3, 1, 1, '#c0c0c0');
  return cy;
}

function drawVehicle(kind: VehicleKind, look: number): HTMLCanvasElement {
  const pickc = (arr: string[], salt: number) => arr[(look * 7 + salt * 13) % arr.length];
  const helmet = pickc(HELMETS, 1);
  const shirt = pickc(SHIRTS, 2);
  const body = pickc(BODIES, 3);

  switch (kind) {
    case 'bike': {
      const [c, ctx] = makeCanvas(14, 7);
      const cy = scooter(ctx, 14, 7, body);
      rider(ctx, 6, cy, helmet, shirt, 9);
      return c;
    }
    case 'grab': {
      const [c, ctx] = makeCanvas(14, 9);
      const cy = scooter(ctx, 14, 9, '#1e1e1e');
      r(ctx, 0, cy - 3, 5, 7, SHADOW);
      r(ctx, 0, cy - 3, 5, 7, '#00a650');
      r(ctx, 0, cy - 3, 5, 1, '#00c060');
      r(ctx, 1, cy - 1, 3, 3, '#008a43');
      rider(ctx, 7, cy, '#00b14f', '#00b14f', 9);
      return c;
    }
    case 'family': {
      const [c, ctx] = makeCanvas(16, 9);
      const cy = scooter(ctx, 16, 9, body);
      smallRider(ctx, 3, cy, pickc(HELMETS, 4), pickc(SHIRTS, 5));
      r(ctx, 5, cy - 2, 3, 5, pickc(SHIRTS, 6));
      conicalHat(ctx, 6, cy);
      rider(ctx, 9, cy, helmet, shirt, 11);
      smallRider(ctx, 12, cy, pickc(HELMETS, 7), pickc(SHIRTS, 8));
      return c;
    }
    case 'cargo': {
      const [c, ctx] = makeCanvas(17, 13);
      const cy = scooter(ctx, 17, 13, body, 6);
      r(ctx, 1, 1, 9, 12, SHADOW);
      if (look % 2 === 0) {
        // a mountain of coconuts
        for (let y = 0; y < 12; y += 3)
          for (let x = 0; x < 9; x += 3) {
            r(ctx, x, y, 3, 3, '#4f772d');
            r(ctx, x, y, 2, 2, '#6a994e');
            r(ctx, x + 1, y + 1, 1, 1, '#90a955');
          }
      } else {
        // a tower of plastic stools
        const cols = ['#e63946', '#1d4ed8', '#e63946', '#16a34a'];
        for (let i = 0; i < 4; i++) {
          r(ctx, i * 2, 0, 3, 12, cols[i]);
          r(ctx, i * 2, 0, 1, 12, 'rgba(255,255,255,0.25)');
        }
        r(ctx, 0, 5, 9, 2, 'rgba(0,0,0,0.2)');
      }
      rider(ctx, 11, cy, helmet, shirt, 12);
      return c;
    }
    case 'tourist': {
      const [c, ctx] = makeCanvas(14, 7);
      const cy = scooter(ctx, 14, 7, ['#ff8fab', '#e5e5e5', '#8ecae6'][look % 3]);
      // flower shirt, no helmet, sunburnt arms
      rider(ctx, 6, cy, ['#f6d365', '#c0703a', '#f2e8cf'][look % 3], '#ff6b6b', 9, TOURIST_SKIN, true);
      r(ctx, 5, cy - 2, 1, 1, '#ffe66d');
      r(ctx, 7, cy + 2, 1, 1, '#ffe66d');
      r(ctx, 6, cy + 1, 1, 1, '#4ecdc4');
      return c;
    }
    case 'car': {
      const [c, ctx] = makeCanvas(26, 12);
      const col = pickc(CARS, 1);
      r(ctx, 2, 1, 24, 11, SHADOW);
      r(ctx, 4, 0, 4, 1, TIRE);
      r(ctx, 18, 0, 4, 1, TIRE);
      r(ctx, 4, 11, 4, 1, TIRE);
      r(ctx, 18, 11, 4, 1, TIRE);
      r(ctx, 1, 1, 24, 10, col);
      r(ctx, 0, 2, 26, 8, col);
      r(ctx, 16, 2, 4, 8, '#1f2a3a'); // windshield
      r(ctx, 5, 2, 3, 8, '#1f2a3a'); // rear window
      r(ctx, 8, 2, 8, 8, 'rgba(255,255,255,0.12)'); // roof
      r(ctx, 25, 2, 1, 2, '#fff6b0');
      r(ctx, 25, 8, 1, 2, '#fff6b0');
      r(ctx, 0, 2, 1, 2, '#c1121f');
      r(ctx, 0, 8, 1, 2, '#c1121f');
      return c;
    }
    case 'bus': {
      const [c, ctx] = makeCanvas(44, 14);
      r(ctx, 2, 1, 42, 13, SHADOW);
      r(ctx, 0, 0, 44, 13, '#f4f4f4');
      r(ctx, 0, 0, 44, 2, '#2f5d8a');
      r(ctx, 0, 11, 44, 2, '#2f5d8a');
      r(ctx, 42, 2, 2, 9, '#1f2a3a');
      for (let x = 4; x < 38; x += 7) {
        r(ctx, x, 4, 4, 5, '#d9d9d9'); // roof AC / hatches
      }
      r(ctx, 0, 6, 44, 1, '#c1121f');
      r(ctx, 43, 1, 1, 2, '#fff6b0');
      r(ctx, 43, 10, 1, 2, '#fff6b0');
      return c;
    }
  }
}

const vehicleCache = new Map<string, HTMLCanvasElement>();

export function vehicleSprite(v: Pick<Vehicle, 'kind' | 'look'>): HTMLCanvasElement {
  const variants = v.kind === 'bus' ? 1 : 8;
  const key = `${v.kind}:${v.look % variants}`;
  let s = vehicleCache.get(key);
  if (!s) {
    s = drawVehicle(v.kind, v.look % variants);
    vehicleCache.set(key, s);
  }
  return s;
}

/** The player: a sunburnt newcomer in a panama hat, seen from above, walking up. */
function drawPed(frame: number, dead: boolean): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(9, 11);
  const shirt = '#ff6f3c';
  const hat = '#f3ead3';
  const brim = '#dccfae';
  const shoe = '#3d2c1e';
  const ox = 1;
  const oy = 1;
  r(ctx, ox + 1, oy + 4, 6, 4, SHADOW);
  if (!dead) {
    const fwd = frame === 0 ? 2 : 4;
    const back = frame === 0 ? 4 : 2;
    r(ctx, ox + fwd, oy + 0, 1, 2, shoe);
    r(ctx, ox + back, oy + 7, 1, 2, shoe);
    // arms swing opposite to legs
    r(ctx, ox + (frame === 0 ? 6 : 0), oy + 2, 1, 2, SKIN);
    r(ctx, ox + (frame === 0 ? 0 : 6), oy + 6, 1, 2, SKIN);
  }
  r(ctx, ox + 0, oy + 4, 7, 2, shirt);
  r(ctx, ox + 1, oy + 3, 5, 4, shirt);
  r(ctx, ox + 1, oy + 3, 5, 3, brim);
  r(ctx, ox + 2, oy + 2, 3, 5, brim);
  r(ctx, ox + 2, oy + 3, 3, 3, hat);
  r(ctx, ox + 2, oy + 4, 3, 1, '#2b2d42'); // hat band
  return c;
}

const pedCache = new Map<string, HTMLCanvasElement>();

export function pedSprite(frame: number, dead = false): HTMLCanvasElement {
  const key = `${frame}:${dead}`;
  let s = pedCache.get(key);
  if (!s) {
    s = drawPed(frame, dead);
    pedCache.set(key, s);
  }
  return s;
}
