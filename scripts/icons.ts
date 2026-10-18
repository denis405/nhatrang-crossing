/**
 * PWA and home-screen icons from a 32×32 pixel map, no dependencies.
 *   docker compose run --rm dev npm run icons
 * Writes public/icons/*.png; the files are committed, so the build doesn't need this.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const N = 32;
const px = new Uint8Array(N * N * 4);

function hex(c: string): [number, number, number, number] {
  const v = parseInt(c.slice(1), 16);
  return c.length === 9
    ? [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]
    : [(v >>> 16) & 255, (v >>> 8) & 255, v & 255, 255];
}

/** Alpha-blended rectangle on the pixel map. */
function r(x: number, y: number, w: number, h: number, color: string) {
  const [cr, cg, cb, ca] = hex(color);
  const a = ca / 255;
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const k = (j * N + i) * 4;
      px[k] = Math.round(px[k] * (1 - a) + cr * a);
      px[k + 1] = Math.round(px[k + 1] * (1 - a) + cg * a);
      px[k + 2] = Math.round(px[k + 2] * (1 - a) + cb * a);
      px[k + 3] = 255;
    }
}

// --- the street: sidewalks, asphalt, lanes, a faded zebra
r(0, 0, N, N, '#4b4b55');
for (const y0 of [0, 27]) {
  r(0, y0, N, 5, '#cdbb9a');
  for (let x = 0; x < N; x += 4) r(x, y0, 1, 5, '#b9a684');
}
r(0, 5, N, 1, '#8f8676');
r(0, 26, N, 1, '#8f8676');
for (let x = 1; x < N; x += 6) {
  r(x, 10, 3, 1, '#e8e6dc');
  r(x, 21, 3, 1, '#e8e6dc');
}
r(0, 15, N, 1, '#f2c94c');
r(0, 17, N, 1, '#f2c94c');
for (let y = 7; y < 26; y += 3) r(10, y, 12, 1, '#ffffff38');

// --- a scooter on its way, headlight on
const bike = (x: number, y: number, body: string, helmet: string) => {
  r(x + 2, y + 1, 11, 3, '#00000048');
  r(x, y + 1, 2, 1, '#141418');
  r(x + 12, y + 1, 2, 1, '#141418');
  r(x + 2, y, 9, 3, body);
  r(x + 9, y - 1, 1, 5, '#222222');
  r(x + 13, y + 1, 1, 1, '#fff6b0');
  r(x + 5, y - 1, 3, 5, '#457b9d');
  r(x + 5, y, 3, 3, helmet);
};
bike(-4, 7, '#d62828', '#f1d302');
bike(22, 22, '#1d3557', '#f8f9fa');

// --- the walker, twice the in-game size: panama hat, orange shirt
const ped = (ox: number, oy: number) => {
  const p = (x: number, y: number, w: number, h: number, c: string) => r(ox + x * 2, oy + y * 2, w * 2, h * 2, c);
  p(1, 4, 6, 4, '#00000048');
  p(2, 0, 1, 2, '#3d2c1e');
  p(4, 7, 1, 2, '#3d2c1e');
  p(6, 2, 1, 2, '#e8b98a');
  p(0, 6, 1, 2, '#e8b98a');
  p(0, 4, 7, 2, '#ff6f3c');
  p(1, 3, 5, 4, '#ff6f3c');
  p(1, 3, 5, 3, '#dccfae');
  p(2, 2, 3, 5, '#dccfae');
  p(2, 3, 3, 3, '#f3ead3');
  p(2, 4, 3, 1, '#2b2d42');
};
ped(9, 7);

// --- PNG encoding
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Nearest-neighbour upscale; `inset` shrinks the art into a safe zone over a solid background. */
function png(size: number, inset = 0): Buffer {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const inner = size - inset * 2;
  const bg = hex('#1d1b2a');
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const ix = x - inset;
      const iy = y - inset;
      if (ix < 0 || iy < 0 || ix >= inner || iy >= inner) {
        raw.set(bg, o);
        continue;
      }
      const k = (Math.floor((iy * N) / inner) * N + Math.floor((ix * N) / inner)) * 4;
      raw.set(px.subarray(k, k + 4), o);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = 'public/icons';
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/icon-192.png`, png(192));
writeFileSync(`${out}/icon-512.png`, png(512));
// Maskable icons get cropped to a circle or squircle: keep the art in the middle 80%.
writeFileSync(`${out}/maskable-512.png`, png(512, 52));
writeFileSync(`${out}/apple-touch-icon.png`, png(180));
writeFileSync(`${out}/favicon-32.png`, png(32));
console.log('icons written to', out);
