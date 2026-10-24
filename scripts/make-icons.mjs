import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Generates the toolbar icons without image dependencies: a blue rounded tile with two white
// pause bars, drawn on a 128-unit grid and sampled per pixel.
const outDir = path.join('public', 'icons');
const BLUE = [11, 87, 208];
const WHITE = [255, 255, 255];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function insideTile(u, v) {
  const r = 28;
  const cx = Math.min(Math.max(u, r), 128 - r);
  const cy = Math.min(Math.max(v, r), 128 - r);
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
}

function insideBar(u, v) {
  return v >= 34 && v <= 94 && ((u >= 40 && u <= 56) || (u >= 72 && u <= 88));
}

function pixel(x, y, size) {
  const u = ((x + 0.5) * 128) / size;
  const v = ((y + 0.5) * 128) / size;
  if (!insideTile(u, v)) return [0, 0, 0, 0];
  return [...(insideBar(u, v) ? WHITE : BLUE), 255];
}

function encodePng(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel(x, y, size);
      const offset = y * stride + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await writeFile(path.join(outDir, `icon${size}.png`), encodePng(size));
}
console.log(`Icons written to ${outDir}/`);
