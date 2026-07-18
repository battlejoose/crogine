/**
 * Writes tiny placeholder PNGs into client/public/assets for later replacement.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../client/public/assets');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function pngRGB(width, height, fill) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const n = 0.85 + ((x * 13 + y * 7) % 40) / 200;
      const i = row + 1 + x * 3;
      raw[i] = Math.min(255, Math.floor(fill[0] * n));
      raw[i + 1] = Math.min(255, Math.floor(fill[1] * n));
      raw[i + 2] = Math.min(255, Math.floor(fill[2] * n));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'fairway.png'), pngRGB(64, 64, [47, 107, 58]));
fs.writeFileSync(path.join(outDir, 'rough.png'), pngRGB(64, 64, [40, 70, 38]));
fs.writeFileSync(path.join(outDir, 'ball.png'), pngRGB(32, 32, [240, 240, 235]));
console.log('Wrote placeholder PNGs to', outDir);
