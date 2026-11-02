// Generates favicon / PWA / Apple icons from the app icon in the branding sheet (left tile).
// Usage: npm run icons
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const SOURCE = new URL('../public/Pfarrweg Parking App Branding.png', import.meta.url);

// ---------- PNG decode / encode (8-bit RGB/RGBA, non-interlaced) ----------

function decodePng(buf) {
  let pos = 8;
  let width, height, colorType;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error('Only 8-bit non-interlaced PNGs are supported');
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = { 2: 3, 6: 4 }[colorType];
  if (!channels) throw new Error(`Unsupported PNG color type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = src[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      out.set([line[s], line[s + 1], line[s + 2], channels === 4 ? line[s + 3] : 255], (y * width + x) * 4);
    }
    line.copy(prev);
  }
  return { width, height, data: out };
}

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

function encodePng(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), y * (size * 4 + 1) + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- locate the icon tile (dark rounded square in the left part) ----------

const img = decodePng(readFileSync(SOURCE));
const DARK = 90;
const lum = (x, y) => {
  const i = (y * img.width + x) * 4;
  return 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
};

let left = Infinity, top = Infinity, right = -1, bottom = -1;
for (let y = 0; y < img.height; y++) {
  for (let x = 0; x < img.width * 0.45; x++) {
    if (lum(x, y) < DARK) {
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
}
let k = 0;
while (lum(left + k, top + k) >= DARK) k++;
const INSET = 2; // trims the anti-aliased edge against the light background
const box = { left: left + INSET, top: top + INSET, right: right + 1 - INSET, bottom: bottom + 1 - INSET };
const radius = k / (1 - Math.SQRT1_2) - INSET;
const boxW = box.right - box.left;
const boxH = box.bottom - box.top;
console.log(`Icon tile: ${boxW}x${boxH} at (${box.left}, ${box.top}), corner radius ≈ ${radius.toFixed(1)}px`);

// ---------- sampling ----------

function bilinear(x, y) {
  x = Math.min(Math.max(x - 0.5, 0), img.width - 1);
  y = Math.min(Math.max(y - 0.5, 0), img.height - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, img.width - 1), y1 = Math.min(y0 + 1, img.height - 1);
  const fx = x - x0, fy = y - y0;
  const px = (xx, yy, c) => img.data[(yy * img.width + xx) * 4 + c];
  return [0, 1, 2].map(
    (c) => (px(x0, y0, c) * (1 - fx) + px(x1, y0, c) * fx) * (1 - fy) + (px(x0, y1, c) * (1 - fx) + px(x1, y1, c) * fx) * fy,
  );
}

const cornerCentre = (x, y) => [
  Math.min(Math.max(x, box.left + radius), box.right - radius),
  Math.min(Math.max(y, box.top + radius), box.bottom - radius),
];

const insideTile = (x, y, margin = 0) => {
  const [cx, cy] = cornerCentre(x, y);
  return Math.hypot(x - cx, y - cy) <= radius - margin;
};

/** Nearest point well inside the tile – extends its background for full-bleed icons. */
function clampToTile(x, y) {
  const [cx, cy] = cornerCentre(x, y);
  const dx = x - cx, dy = y - cy;
  const d = Math.hypot(dx, dy);
  const max = radius - 12;
  return d > max ? [cx + (dx / d) * max, cy + (dy / d) * max, true] : [x, y, false];
}

/** Soft average around a point, hiding compression noise in the extended background. */
function blurred(x, y) {
  const acc = [0, 0, 0];
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      const [sx, sy] = clampToTile(x + i * 3, y + j * 3);
      bilinear(sx, sy).forEach((v, c) => (acc[c] += v / 49));
    }
  }
  return acc;
}

/**
 * fullBleed: fill the whole square (for maskable / Apple icons, which the OS masks itself).
 * scale: tile size relative to the output; < 1 leaves safe-zone padding.
 */
function render(size, { fullBleed, scale = 1 }) {
  const SS = 4;
  return encodePng(size, (px, py) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < SS; i++) {
      for (let j = 0; j < SS; j++) {
        const u = ((px + (i + 0.5) / SS) / size - 0.5) / scale + 0.5;
        const v = ((py + (j + 0.5) / SS) / size - 0.5) / scale + 0.5;
        const sx = box.left + u * boxW;
        const sy = box.top + v * boxH;
        let color;
        if (fullBleed && !insideTile(sx, sy, 12)) color = blurred(sx, sy);
        else if (!fullBleed && !insideTile(sx, sy)) continue;
        else color = bilinear(sx, sy);
        const [cr, cg, cb] = color;
        r += cr;
        g += cg;
        b += cb;
        n++;
      }
    }
    if (n === 0) return [0, 0, 0, 0];
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round((n / (SS * SS)) * 255)];
  });
}

const out = (name, data) => writeFileSync(new URL(`../public/${name}`, import.meta.url), data);
out('favicon.png', render(64, { fullBleed: false }));
out('logo.png', render(128, { fullBleed: false }));
out('pwa-192.png', render(192, { fullBleed: false }));
out('pwa-512.png', render(512, { fullBleed: false }));
out('pwa-maskable-512.png', render(512, { fullBleed: true, scale: 0.86 }));
out('apple-touch-icon.png', render(180, { fullBleed: true }));
console.log('Icons written to public/');
