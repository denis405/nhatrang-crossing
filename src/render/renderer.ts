import { PED_X, VIEW_W, WORLD_W } from '../game/constants';
import type { Layout, Level } from '../game/levels';
import { makeRng, rand, type Rng } from '../game/rng';
import { RIDE_W, ROAD_L, ROAD_R, LANES, LANE_W, type RideWorld } from '../game/ride';
import type { World } from '../game/world';
import { pedSprite, turned, vehicleSprite } from './sprites';

type Ctx = CanvasRenderingContext2D;

/** Decor rendered above and below the road so tall phones never see the void. */
const PAD = 320;
/** World x of the left edge of the view: the camera stays centred on the walker. */
const VIEW_LEFT = PED_X - VIEW_W / 2;

interface Palette {
  asphalt: string;
  asphaltSpeck: string[];
  line: string;
  yellow: string;
  tile: string;
  grout: string;
  curb: string;
  grass: string;
  grassDark: string;
  tint: string | null;
}

const PALETTES: Record<Level['palette'], Palette> = {
  day: {
    asphalt: '#4b4b55',
    asphaltSpeck: ['#53535e', '#44444d', '#5a5a64'],
    line: '#e8e6dc',
    yellow: '#f2c94c',
    tile: '#cdbb9a',
    grout: '#b9a684',
    curb: '#8f8676',
    grass: '#5c9e4a',
    grassDark: '#4a853b',
    tint: null,
  },
  evening: {
    asphalt: '#3a3946',
    asphaltSpeck: ['#42414f', '#34333f', '#474656'],
    line: '#cfcbd8',
    yellow: '#e0b74a',
    tile: '#a99a86',
    grout: '#968874',
    curb: '#716a60',
    grass: '#3f7a3b',
    grassDark: '#336632',
    tint: 'rgba(40, 20, 80, 0.28)',
  },
};

const r = (ctx: Ctx, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

const SHOP_COLORS = ['#e76f51', '#2a9d8f', '#e9c46a', '#f4a261', '#8ecae6', '#ffb4a2', '#90be6d', '#cdb4db'];
const SIGN_COLORS = ['#d62828', '#f77f00', '#003049', '#fcbf49', '#06d6a0', '#ef476f', '#118ab2'];
const ROOF_COLORS = ['#9c6644', '#b5838d', '#7f8c8d', '#a3a3a3', '#bc6c25', '#8d99ae'];

/** Length of a headlight cone, px. */
const HEADLIGHT_PX = 16;

/** A glowing spot in background coordinates (shop signs come alive in the evening). */
interface Light {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

function shopRow(ctx: Ctx, rng: Rng, edgeY: number, facing: 1 | -1, lights: Light[]) {
  // facing 1: facades sit above edgeY (top side of the street); -1: below it.
  let x = -4;
  while (x < WORLD_W) {
    const w = 22 + Math.floor(rand(rng) * 20);
    const depth = 30;
    const y0 = facing === 1 ? edgeY - depth : edgeY;
    const wall = SHOP_COLORS[Math.floor(rand(rng) * SHOP_COLORS.length)];
    r(ctx, x, y0, w, depth, wall);
    r(ctx, x, y0, 1, depth, 'rgba(0,0,0,0.25)');
    // awning stripes along the sidewalk edge
    const aw = facing === 1 ? edgeY - 6 : edgeY;
    const stripe = SIGN_COLORS[Math.floor(rand(rng) * SIGN_COLORS.length)];
    for (let i = 0; i < w; i += 4) {
      r(ctx, x + i, aw, 2, 6, stripe);
      r(ctx, x + i + 2, aw, 2, 6, '#f8f9fa');
    }
    r(ctx, x, facing === 1 ? aw + 6 : aw + 6, w, 1, 'rgba(0,0,0,0.3)');
    // signboard with "text"
    const sy = facing === 1 ? y0 + 6 : y0 + 14;
    const sc = SIGN_COLORS[Math.floor(rand(rng) * SIGN_COLORS.length)];
    r(ctx, x + 3, sy, w - 6, 8, sc);
    lights.push({ x: x + 3, y: sy, w: w - 6, h: 8, color: sc });
    for (let i = x + 5; i < x + w - 6; i += 3) r(ctx, i, sy + 3, 2, 2, rand(rng) < 0.7 ? '#fff' : '#ffe66d');
    // water tank on the roof
    if (rand(rng) < 0.5) {
      const ty = facing === 1 ? y0 - 1 : y0 + depth - 5;
      r(ctx, x + w - 9, ty, 6, 5, '#c9ced6');
      r(ctx, x + w - 9, ty, 6, 1, '#e9ecef');
    }
    x += w;
  }
  // rooftops beyond
  const roofY0 = facing === 1 ? edgeY - 30 - PAD : edgeY + 30;
  for (let y = roofY0; y < roofY0 + PAD; y += 18) {
    let rx = -6;
    while (rx < WORLD_W) {
      const w = 20 + Math.floor(rand(rng) * 26);
      r(ctx, rx, y, w, 18, ROOF_COLORS[Math.floor(rand(rng) * ROOF_COLORS.length)]);
      r(ctx, rx, y, w, 1, 'rgba(0,0,0,0.25)');
      r(ctx, rx, y, 1, 18, 'rgba(0,0,0,0.25)');
      if (rand(rng) < 0.35) r(ctx, rx + 4, y + 5, 5, 4, '#dfe3e8'); // AC unit
      rx += w;
    }
  }
  // tangled power lines
  ctx.strokeStyle = 'rgba(20,20,25,0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const y = facing === 1 ? edgeY - 34 - i * 3 : edgeY + 34 + i * 3;
    ctx.beginPath();
    ctx.moveTo(0, y + rand(rng) * 4);
    ctx.quadraticCurveTo(WORLD_W / 2, y + 6 * facing * -1 + rand(rng) * 4, WORLD_W, y + rand(rng) * 4);
    ctx.stroke();
  }
}

function sidewalk(ctx: Ctx, rng: Rng, p: Palette, y0: number, h: number, roadSide: 'top' | 'bottom' | 'both') {
  r(ctx, 0, y0, WORLD_W, h, p.tile);
  for (let y = y0 + 1; y < y0 + h; y += 8) r(ctx, 0, y, WORLD_W, 1, p.grout);
  for (let row = 0, y = y0; y < y0 + h; y += 8, row++)
    for (let x = row % 2 ? 4 : 0; x < WORLD_W; x += 8) r(ctx, x, y, 1, 8, p.grout);
  if (roadSide === 'top' || roadSide === 'both') r(ctx, 0, y0, WORLD_W, 2, p.curb);
  if (roadSide === 'bottom' || roadSide === 'both') r(ctx, 0, y0 + h - 2, WORLD_W, 2, p.curb);
  // plastic stools and a low table, away from the walking column
  for (let i = 0; i < 4; i++) {
    let x = Math.floor(rand(rng) * (WORLD_W - 16));
    if (Math.abs(x + 4 - PED_X) < 16) x = (x + 40) % (WORLD_W - 16);
    const y = y0 + 6 + Math.floor(rand(rng) * Math.max(1, h - 14));
    if (rand(rng) < 0.5) {
      r(ctx, x, y, 6, 4, '#6b4f3a');
      r(ctx, x - 3, y + 1, 2, 2, '#e63946');
      r(ctx, x + 7, y + 1, 2, 2, '#1d4ed8');
    } else {
      r(ctx, x, y, 4, 4, '#2d6a4f');
      r(ctx, x + 1, y - 2, 2, 3, '#52b788');
    }
  }
}

function median(ctx: Ctx, rng: Rng, p: Palette, y0: number, h: number, hedges = true) {
  r(ctx, 0, y0, WORLD_W, h, p.grass);
  for (let i = 0; i < 40; i++) r(ctx, Math.floor(rand(rng) * WORLD_W), y0 + 2 + Math.floor(rand(rng) * (h - 4)), 2, 1, p.grassDark);
  for (let x = 0; x < WORLD_W; x += 4) {
    const c = (x / 4) % 2 ? '#e8e6dc' : '#2b2d42';
    r(ctx, x, y0, 4, 1, c);
    r(ctx, x, y0 + h - 1, 4, 1, c);
  }
  for (let x = 10; hedges && x < WORLD_W; x += 34) {
    if (Math.abs(x - PED_X) < 12) continue;
    r(ctx, x, y0 + 3, 5, h - 6, '#2d6a4f');
    r(ctx, x + 1, y0 + 2, 3, 1, '#40916c');
  }
}

function asphalt(ctx: Ctx, rng: Rng, p: Palette, y0: number, h: number) {
  r(ctx, 0, y0, WORLD_W, h, p.asphalt);
  const n = Math.floor((WORLD_W * h) / 14);
  for (let i = 0; i < n; i++) {
    r(ctx, Math.floor(rand(rng) * WORLD_W), y0 + Math.floor(rand(rng) * h), 1, 1, p.asphaltSpeck[i % p.asphaltSpeck.length]);
  }
}

/** A palm seen from above: a star of fronds over its own shadow. */
function palm(ctx: Ctx, rng: Rng, cx: number, cy: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx + 3, cy + 3, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const fronds = 7;
  const turn = rand(rng) * Math.PI;
  for (let i = 0; i < fronds; i++) {
    const a = turn + (i * Math.PI * 2) / fronds;
    for (let d = 1; d <= 8; d++) {
      const x = Math.round(cx + Math.cos(a) * d);
      const y = Math.round(cy + Math.sin(a) * d * 0.8);
      r(ctx, x, y, d < 7 ? 2 : 1, 1, d % 3 ? '#2d6a4f' : '#52b788');
    }
  }
  r(ctx, cx - 1, cy - 1, 3, 3, '#7f5539');
  r(ctx, cx - 1, cy - 1, 1, 1, '#b08968');
}

function palms(ctx: Ctx, rng: Rng, y0: number, h: number, count: number) {
  for (let i = 0; i < count; i++) {
    let x = 12 + Math.floor(rand(rng) * (WORLD_W - 24));
    // keep the walking column clear
    if (Math.abs(x - PED_X) < 18) x = x < PED_X ? x - 22 : x + 22;
    palm(ctx, rng, x, y0 + Math.round(h / 2));
  }
}

/** A filled ellipse on whole pixels, so shapes stay as crisp as the rest of the art. */
function blob(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string, angle = 0) {
  ctx.fillStyle = color;
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const m = Math.ceil(Math.max(rx, ry));
  for (let y = -m; y <= m; y++)
    for (let x = -m; x <= m; x++) {
      const u = (x * c + y * sn) / rx;
      const v = (-x * sn + y * c) / ry;
      if (u * u + v * v <= 1) ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
    }
}

/** The Tram Huong tower: a lotus in white and pink in the middle of the ring, with flower beds around. */
function tower(ctx: Ctx, cx: number, cy: number, size: number) {
  blob(ctx, cx + 3, cy + 3, size, size, 'rgba(0,0,0,0.3)');
  blob(ctx, cx, cy, size, size, '#d8d2c4');
  blob(ctx, cx, cy, size - 2, size - 2, '#f1ede4');
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const px = cx + Math.cos(a) * size * 0.45;
    const py = cy + Math.sin(a) * size * 0.45;
    blob(ctx, px, py, size * 0.34, size * 0.2, i % 2 ? '#f4acb7' : '#ffe5ec', a);
  }
  blob(ctx, cx, cy, size * 0.32, size * 0.32, '#fbf8f1');
  blob(ctx, cx, cy, size * 0.14, size * 0.14, '#e9c46a');
}

function flowerBed(ctx: Ctx, rng: Rng, cx: number, cy: number, rad: number) {
  const colors = ['#ef476f', '#ffd166', '#f78c6b', '#ffffff'];
  for (let i = 0; i < 60; i++) {
    const a = rand(rng) * Math.PI * 2;
    const d = rad + (rand(rng) - 0.5) * 4;
    r(ctx, Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d * 0.55), 1, 1, colors[i % colors.length]);
  }
}

interface Background {
  canvas: HTMLCanvasElement;
  lights: Light[];
}

function buildBackground(level: Level, layout: Layout, seed: number): Background {
  const c = document.createElement('canvas');
  c.width = WORLD_W;
  c.height = layout.height + PAD * 2;
  const ctx = c.getContext('2d')!;
  const p = PALETTES[level.palette];
  const rng = makeRng(seed);
  const strips = layout.strips;
  const top = strips[strips.length - 1];
  const bottom = strips[0];

  // Extend the outer sidewalks a little before the shops start.
  const ext = 10;
  sidewalk(ctx, rng, p, PAD + top.top - ext, top.bottom - top.top + ext, 'bottom');
  sidewalk(ctx, rng, p, PAD + bottom.top, bottom.bottom - bottom.top + ext, 'top');
  const lights: Light[] = [];
  shopRow(ctx, rng, PAD + top.top - ext, 1, lights);
  shopRow(ctx, rng, PAD + bottom.bottom + ext, -1, lights);
  const decor = level.decor ?? {};
  if (decor.palms) {
    palms(ctx, rng, PAD + top.top - ext, top.bottom - top.top, 3);
    palms(ctx, rng, PAD + bottom.top, bottom.bottom - bottom.top, 3);
  }

  const medians = strips.filter((s) => s.kind === 'median');
  const widest = medians.reduce<(typeof medians)[number] | null>((a, m) => (!a || m.bottom - m.top > a.bottom - a.top ? m : a), null);
  for (const s of strips) {
    const y0 = PAD + s.top;
    const h = s.bottom - s.top;
    if (s.kind === 'median') median(ctx, rng, p, y0, h, !(decor.tower && s === widest));
    else if (s.kind === 'bike' || s.kind === 'car') asphalt(ctx, rng, p, y0, h);
  }
  if (decor.tower && widest) {
    const h = widest.bottom - widest.top;
    const cy = PAD + widest.top + h / 2;
    // Off the walking column, but inside the view.
    const cx = PED_X + 38;
    flowerBed(ctx, rng, cx, cy, h * 0.75);
    flowerBed(ctx, rng, PED_X - 44, cy, h * 0.4);
    tower(ctx, cx, cy, Math.floor(h / 2) - 4);
  } else if (decor.palms) {
    for (const m of medians) if (m.bottom - m.top >= 20) palms(ctx, rng, PAD + m.top, m.bottom - m.top, 2);
  }

  // Lane markings between neighbouring traffic strips.
  for (let i = 0; i < strips.length - 1; i++) {
    const a = strips[i];
    const b = strips[i + 1];
    const road = (k: string) => k === 'bike' || k === 'car';
    if (!road(a.kind) || !road(b.kind)) continue;
    const y = PAD + a.top;
    if (a.dir !== b.dir) {
      r(ctx, 0, y - 2, WORLD_W, 1, p.yellow);
      r(ctx, 0, y + 1, WORLD_W, 1, p.yellow);
    } else if (a.kind !== b.kind) {
      r(ctx, 0, y, WORLD_W, 1, p.line);
    } else {
      for (let x = 2; x < WORLD_W; x += 12) r(ctx, x, y, 6, 1, p.line);
    }
  }

  // A faded zebra crossing that nobody respects.
  ctx.globalAlpha = 0.22;
  for (const s of strips) {
    if (s.kind !== 'bike' && s.kind !== 'car') continue;
    for (let y = s.top + 2; y < s.bottom - 2; y += 4) r(ctx, PED_X - 9, PAD + y, 18, 2, '#ffffff');
  }
  ctx.globalAlpha = 1;

  return { canvas: c, lights };
}

/** Height of the repeating piece of the bike street; a multiple of every pattern period in it. */
const RIDE_TILE = 240;

/** The one-way street of the bike mode, running up the screen; tiles seamlessly along y. */
function buildRideTile(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = RIDE_W;
  c.height = RIDE_TILE;
  const ctx = c.getContext('2d')!;
  const p = PALETTES.day;
  const rng = makeRng(77);
  const H = RIDE_TILE;
  r(ctx, ROAD_L, 0, ROAD_R - ROAD_L, H, p.asphalt);
  for (let i = 0; i < ((ROAD_R - ROAD_L) * H) / 14; i++)
    r(ctx, ROAD_L + Math.floor(rand(rng) * (ROAD_R - ROAD_L)), Math.floor(rand(rng) * H), 1, 1, p.asphaltSpeck[i % 3]);
  for (let i = 1; i < LANES; i++) {
    const x = Math.round(ROAD_L + i * LANE_W);
    for (let y = 2; y < H; y += 12) r(ctx, x, y, 1, 6, p.line);
  }
  // Sidewalks on both sides, curbs facing the road, shopfronts beyond.
  const shop = 8;
  for (const [x0, w, curbX] of [
    [shop, ROAD_L - shop, ROAD_L - 2],
    [ROAD_R, RIDE_W - shop - ROAD_R, ROAD_R],
  ] as const) {
    r(ctx, x0, 0, w, H, p.tile);
    for (let y = 0; y < H; y += 8) r(ctx, x0, y, w, 1, p.grout);
    for (let row = 0, y = 0; y < H; y += 8, row++)
      for (let x = x0 + (row % 2 ? 4 : 0); x < x0 + w; x += 8) r(ctx, x, y, 1, 8, p.grout);
    r(ctx, curbX, 0, 2, H, p.curb);
    for (let i = 0; i < 5; i++) {
      const y = 6 + Math.floor(rand(rng) * (H - 14));
      const x = x0 + 2 + Math.floor(rand(rng) * (w - 8));
      if (rand(rng) < 0.5) {
        r(ctx, x, y, 4, 6, '#6b4f3a');
        r(ctx, x + 1, y - 3, 2, 2, '#e63946');
        r(ctx, x + 1, y + 7, 2, 2, '#1d4ed8');
      } else {
        r(ctx, x, y, 4, 4, '#2d6a4f');
        r(ctx, x + 1, y + 1, 2, 2, '#52b788');
      }
    }
  }
  for (const [x0, awnX] of [
    [0, shop - 3],
    [RIDE_W - shop, RIDE_W - shop],
  ] as const) {
    let y = 0;
    while (y < H) {
      const h = Math.min(H - y, 24 + Math.floor(rand(rng) * 18));
      r(ctx, x0, y, shop, h, SHOP_COLORS[Math.floor(rand(rng) * SHOP_COLORS.length)]);
      const stripe = SIGN_COLORS[Math.floor(rand(rng) * SIGN_COLORS.length)];
      for (let i = 0; i < h; i += 4) {
        r(ctx, awnX, y + i, 3, 2, stripe);
        r(ctx, awnX, y + i + 2, 3, 2, '#f8f9fa');
      }
      r(ctx, x0, y, shop, 1, 'rgba(0,0,0,0.3)');
      y += h;
    }
  }
  return c;
}

export interface Insets {
  /** CSS px covered by HUD at the top and bottom. */
  top: number;
  bottom: number;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: Ctx;
  private buf: HTMLCanvasElement;
  private bctx: Ctx;
  private bg: Background | null = null;
  /** The level the cached background was drawn for (endless streets share ids across runs). */
  private bgFor: Level | null = null;
  /** Logical height of the view. */
  h = 320;
  /** CSS px per logical px. */
  scale = 2;
  private cssW = 0;
  camTop = 0;
  private camReady = false;
  private shake = 0;
  private rideTile: HTMLCanvasElement | null = null;
  /** Which kind of scene the camera was last placed for, so switching modes snaps it. */
  private camFor: 'walk' | 'ride' = 'walk';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d')!;
  }

  resize(cssW: number, cssH: number): void {
    if (cssW < 1 || cssH < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cssW = cssW;
    this.scale = cssW / VIEW_W;
    this.h = Math.round(cssH / this.scale);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.buf.width = VIEW_W;
    this.buf.height = this.h;
    this.camReady = false;
  }

  /** Glowing shop signs, headlight cones and tail lights, added on top of the dusk tint. */
  private drawLights(b: Ctx, vs: World['vehicles'], cam: number, sx: number, sy: number, time: number): void {
    b.save();
    b.globalCompositeOperation = 'lighter';
    const ox = -VIEW_LEFT + sx;
    const oy = -cam - PAD + sy;
    for (const l of this.bg!.lights) {
      const y = l.y + oy;
      if (y > this.h || y + l.h < 0) continue;
      // a slow neon flicker, different for each sign
      b.globalAlpha = 0.32 + 0.06 * Math.sin(time * 3 + l.x * 0.7);
      b.fillStyle = l.color;
      b.fillRect(l.x + ox - 1, y - 1, l.w + 2, l.h + 2);
    }
    for (const v of vs) {
      const spr = vehicleSprite(v);
      const x = Math.round(v.x - VIEW_LEFT - spr.width / 2) + sx;
      const y = Math.round(v.y - spr.height / 2) - cam + sy;
      const front = v.dir > 0 ? x + spr.width : x;
      const back = v.dir > 0 ? x - 1 : x + spr.width;
      // a cone that widens and fades, one pixel column at a time
      b.fillStyle = 'rgb(255, 214, 120)';
      const mid = y + spr.height / 2;
      for (let d = 0; d < HEADLIGHT_PX; d++) {
        b.globalAlpha = 0.2 * (1 - d / HEADLIGHT_PX);
        const half = Math.round(spr.height / 2 - 1.5 + d * 0.3);
        b.fillRect(v.dir > 0 ? front + d : front - 1 - d, mid - half, 1, half * 2);
      }
      b.globalAlpha = 0.5;
      b.fillStyle = 'rgb(255, 40, 40)';
      b.fillRect(back, y + 1, 1, 1);
      b.fillRect(back, y + spr.height - 2, 1, 1);
    }
    b.restore();
  }

  bump(): void {
    this.shake = 0.35;
  }

  /** Convert a world position to CSS px inside #app. */
  toCss(x: number, y: number): { x: number; y: number } {
    return { x: (x - VIEW_LEFT) * this.scale, y: (y - this.camTop) * this.scale };
  }

  /** Convert a bike-mode world position to CSS px inside #app. */
  toCssRide(x: number, y: number): { x: number; y: number } {
    return { x: x * this.scale, y: (y - this.camTop) * this.scale };
  }

  private updateCamera(layout: Layout, pedY: number, insets: Insets, dt: number): void {
    if (this.camFor !== 'walk') this.camReady = false;
    this.camFor = 'walk';
    const top = insets.top / this.scale;
    const avail = this.h - top - insets.bottom / this.scale;
    let target: number;
    if (layout.height <= avail) target = -(top + (avail - layout.height) / 2);
    else {
      target = pedY - (top + avail * 0.62);
      target = Math.max(-top, Math.min(layout.height - (top + avail), target));
    }
    if (!this.camReady) {
      this.camTop = target;
      this.camReady = true;
    } else this.camTop += (target - this.camTop) * Math.min(1, dt * 4);
  }

  draw(level: Level, layout: Layout, w: World, insets: Insets, dt: number, time: number): void {
    if (!this.buf.width || !this.buf.height || !this.canvas.width) return; // not laid out yet
    if (this.bgFor !== level) {
      let seed = 13;
      for (const ch of level.id) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
      this.bg = buildBackground(level, layout, seed);
      this.bgFor = level;
      this.camReady = false;
    }
    this.updateCamera(layout, w.ped.y, insets, dt);
    const b = this.bctx;
    b.imageSmoothingEnabled = false;

    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      this.shake -= dt;
      sx = Math.round((Math.random() - 0.5) * 4);
      sy = Math.round((Math.random() - 0.5) * 4);
    }
    const cam = Math.round(this.camTop);
    b.fillStyle = '#2b2a33';
    b.fillRect(0, 0, VIEW_W, this.h);
    b.drawImage(this.bg!.canvas, VIEW_LEFT, cam + PAD, VIEW_W, this.h, sx, sy, VIEW_W, this.h);

    // vehicles, back to front
    const vs = [...w.vehicles].sort((a, c) => a.y - c.y);
    for (const v of vs) {
      const spr = vehicleSprite(v);
      const x = Math.round(v.x - VIEW_LEFT - spr.width / 2) + sx;
      const y = Math.round(v.y - spr.height / 2) - cam + sy;
      if (v.dir > 0) b.drawImage(spr, x, y);
      else {
        b.save();
        b.translate(x + spr.width, y);
        b.scale(-1, 1);
        b.drawImage(spr, 0, 0);
        b.restore();
      }
    }

    // pedestrian
    const dead = w.status === 'dead';
    const ps = pedSprite(w.ped.steps % 2, dead);
    const px = Math.round(PED_X - VIEW_LEFT - ps.width / 2) + sx;
    const py = Math.round(w.ped.y - ps.height / 2) - cam + sy;
    if (dead) {
      b.save();
      b.translate(px + ps.width / 2, py + ps.height / 2);
      b.rotate(Math.PI / 2);
      b.drawImage(ps, -ps.width / 2, -ps.height / 2);
      b.restore();
      for (let i = 0; i < 3; i++) {
        const a = time * 5 + (i * Math.PI * 2) / 3;
        b.fillStyle = '#ffe66d';
        b.fillRect(Math.round(px + ps.width / 2 + Math.cos(a) * 6), Math.round(py - 2 + Math.sin(a) * 2), 2, 2);
      }
    } else {
      b.drawImage(ps, px, py);
    }

    const tint = PALETTES[level.palette].tint;
    if (tint) {
      // Dusk falls on everything, then the lights come on above it.
      b.fillStyle = tint;
      b.fillRect(0, 0, VIEW_W, this.h);
      this.drawLights(b, vs, cam, sx, sy, time);
    }

    // present, nearest-neighbour
    this.present();
  }

  /** «Ты — байкер»: the street runs up the screen and the camera rides with the bike. */
  drawRide(w: RideWorld, insets: Insets, dt: number, time: number): void {
    if (!this.buf.width || !this.buf.height || !this.canvas.width) return;
    this.rideTile ??= buildRideTile();
    const top = insets.top / this.scale;
    const avail = this.h - top - insets.bottom / this.scale;
    // The bike sits low on the screen so there is room to see what's coming.
    this.camTop = w.bike.y - (top + avail * 0.76);
    this.camFor = 'ride';
    const b = this.bctx;
    b.imageSmoothingEnabled = false;
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      this.shake -= dt;
      sx = Math.round((Math.random() - 0.5) * 4);
      sy = Math.round((Math.random() - 0.5) * 4);
    }
    const cam = Math.round(this.camTop);
    const off = ((cam % RIDE_TILE) + RIDE_TILE) % RIDE_TILE;
    for (let y = -off; y < this.h; y += RIDE_TILE) b.drawImage(this.rideTile, sx, y + sy);

    type Thing = { y: number; draw: () => void };
    const things: Thing[] = [];
    const put = (spr: HTMLCanvasElement, x: number, y: number) =>
      b.drawImage(spr, Math.round(x - spr.width / 2) + sx, Math.round(y - spr.height / 2) - cam + sy);
    for (const p of w.walkers) {
      const frame = p.mode === 'freeze' ? 0 : p.steps % 2;
      const spr = turned(pedSprite(frame, false, p.type, p.look), p.dir);
      things.push({
        y: p.y,
        draw: () => {
          put(spr, p.x, p.y);
          // camera flash while posing for the sunset
          if (p.mode === 'freeze' && (time * 1.7) % 1 < 0.12) {
            const fx = Math.round(p.x + p.dir * 5) + sx;
            const fy = Math.round(p.y - 3) - cam + sy;
            r(b, fx - 1, fy, 3, 1, '#ffffff');
            r(b, fx, fy - 1, 1, 3, '#ffffff');
          }
        },
      });
    }
    for (const o of w.npcs) {
      const spr = turned(vehicleSprite({ kind: o.kind, look: o.look, x: -o.y }), -1);
      things.push({ y: o.y, draw: () => put(spr, o.x, o.y) });
    }
    const bike = w.bike;
    const me = turned(vehicleSprite({ kind: 'grab', look: 3, x: -bike.y }), -1);
    things.push({ y: bike.y + 0.01, draw: () => put(me, bike.x, bike.y) });
    things.sort((a, c) => a.y - c.y);
    for (const t of things) t.draw();

    if (w.status === 'dead') {
      for (let i = 0; i < 3; i++) {
        const a = time * 5 + (i * Math.PI * 2) / 3;
        b.fillStyle = '#ffe66d';
        b.fillRect(Math.round(bike.x + Math.cos(a) * 6) + sx, Math.round(bike.y - 10 + Math.sin(a) * 2) - cam + sy, 2, 2);
      }
    }
    this.present();
  }

  private present(): void {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, 0, 0, VIEW_W, this.h, 0, 0, this.canvas.width, (this.h * this.scale * this.canvas.width) / this.cssW);
  }
}
