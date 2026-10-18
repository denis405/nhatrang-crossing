import { PED_X, VIEW_W, WORLD_W } from '../game/constants';
import type { Layout, Level } from '../game/levels';
import { makeRng, rand, type Rng } from '../game/rng';
import type { World } from '../game/world';
import { pedSprite, vehicleSprite } from './sprites';

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

function shopRow(ctx: Ctx, rng: Rng, edgeY: number, facing: 1 | -1) {
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

function median(ctx: Ctx, rng: Rng, p: Palette, y0: number, h: number) {
  r(ctx, 0, y0, WORLD_W, h, p.grass);
  for (let i = 0; i < 40; i++) r(ctx, Math.floor(rand(rng) * WORLD_W), y0 + 2 + Math.floor(rand(rng) * (h - 4)), 2, 1, p.grassDark);
  for (let x = 0; x < WORLD_W; x += 4) {
    const c = (x / 4) % 2 ? '#e8e6dc' : '#2b2d42';
    r(ctx, x, y0, 4, 1, c);
    r(ctx, x, y0 + h - 1, 4, 1, c);
  }
  for (let x = 10; x < WORLD_W; x += 34) {
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

function buildBackground(level: Level, layout: Layout, seed: number): HTMLCanvasElement {
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
  shopRow(ctx, rng, PAD + top.top - ext, 1);
  shopRow(ctx, rng, PAD + bottom.bottom + ext, -1);

  for (const s of strips) {
    const y0 = PAD + s.top;
    const h = s.bottom - s.top;
    if (s.kind === 'median') median(ctx, rng, p, y0, h);
    else if (s.kind === 'bike' || s.kind === 'car') asphalt(ctx, rng, p, y0, h);
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

  if (p.tint) {
    ctx.fillStyle = p.tint;
    ctx.fillRect(0, 0, c.width, c.height);
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
  private bg: HTMLCanvasElement | null = null;
  private bgFor: string | null = null;
  /** Logical height of the view. */
  h = 320;
  /** CSS px per logical px. */
  scale = 2;
  private cssW = 0;
  camTop = 0;
  private camReady = false;
  private shake = 0;

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

  bump(): void {
    this.shake = 0.35;
  }

  /** Convert a world position to CSS px inside #app. */
  toCss(x: number, y: number): { x: number; y: number } {
    return { x: (x - VIEW_LEFT) * this.scale, y: (y - this.camTop) * this.scale };
  }

  private updateCamera(layout: Layout, pedY: number, insets: Insets, dt: number): void {
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
    const key = level.id;
    if (this.bgFor !== key) {
      this.bg = buildBackground(level, layout, level.id.length * 977 + 13);
      this.bgFor = key;
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
    b.drawImage(this.bg!, VIEW_LEFT, cam + PAD, VIEW_W, this.h, sx, sy, VIEW_W, this.h);

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
      if (level.palette === 'evening') {
        b.fillStyle = 'rgba(255, 240, 170, 0.18)';
        const fx = v.dir > 0 ? x + spr.width : x - 14;
        b.fillRect(fx, y + 1, 14, spr.height - 2);
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

    // present, nearest-neighbour
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, 0, 0, VIEW_W, this.h, 0, 0, this.canvas.width, (this.h * this.scale * this.canvas.width) / this.cssW);
  }
}
