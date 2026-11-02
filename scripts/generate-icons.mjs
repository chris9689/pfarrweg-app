// Generates the PWA PNG icons (white "P" on brand blue) without native image dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BRAND = [30, 64, 175];
const WHITE = [255, 255, 255];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Letter "P" in unit coordinates (0..1): stem + half ring + connecting bars.
function inLetter(u, v) {
  const stem = u >= 0.3 && u <= 0.42 && v >= 0.22 && v <= 0.78;
  const bars = u >= 0.42 && u <= 0.5 && ((v >= 0.22 && v <= 0.34) || (v >= 0.46 && v <= 0.58));
  const d = Math.hypot(u - 0.5, v - 0.4);
  const bowl = u >= 0.5 && d <= 0.18 && d >= 0.06;
  return stem || bars || bowl;
}

function inRoundedSquare(u, v, radius) {
  const cx = Math.min(Math.max(u, radius), 1 - radius);
  const cy = Math.min(Math.max(v, radius), 1 - radius);
  return Math.hypot(u - cx, v - cy) <= radius;
}

function render(size, { radius, letterScale }) {
  const SS = 4;
  return png(size, (x, y) => {
    let bg = 0;
    let fg = 0;
    for (let i = 0; i < SS; i++) {
      for (let j = 0; j < SS; j++) {
        const u = (x + (i + 0.5) / SS) / size;
        const v = (y + (j + 0.5) / SS) / size;
        if (radius === 0 || inRoundedSquare(u, v, radius)) {
          bg++;
          const lu = 0.5 + (u - 0.5) / letterScale + 0.04;
          const lv = 0.5 + (v - 0.5) / letterScale;
          if (inLetter(lu, lv)) fg++;
        }
      }
    }
    const total = SS * SS;
    if (bg === 0) return [0, 0, 0, 0];
    const t = fg / bg;
    const color = BRAND.map((c, k) => Math.round(c + (WHITE[k] - c) * t));
    return [...color, Math.round((bg / total) * 255)];
  });
}

const out = (name, data) => writeFileSync(new URL(`../public/${name}`, import.meta.url), data);
out('pwa-192.png', render(192, { radius: 0.22, letterScale: 1 }));
out('pwa-512.png', render(512, { radius: 0.22, letterScale: 1 }));
out('pwa-maskable-512.png', render(512, { radius: 0, letterScale: 0.8 }));
out('apple-touch-icon.png', render(180, { radius: 0, letterScale: 0.9 }));
console.log('Icons written to public/');
