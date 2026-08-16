/* png16.js — decode the game's heightmap PNGs in plain Node (fs + zlib only).

   Both bakers (build_uk.py, build_regions.py) write 8-bit RGB, colour type 2,
   one zlib IDAT, filter byte 0 on every row — but the unfilterer below handles
   all five standard filters so a rebake by another encoder still decodes.

   decode(path) -> { w, h, data: Uint8Array(w*h*4) }   (RGBA layout, alpha 255,
   matching the browser's getImageData so World.addRaster works verbatim). */
'use strict';
const fs = require('fs'), zlib = require('zlib');

function decode(path) {
  const buf = fs.readFileSync(path);
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++)
    if (buf[i] !== SIG[i]) throw new Error(path + ': not a PNG');

  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  for (let o = 8; o + 8 <= buf.length;) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (data[12] !== 0) throw new Error(path + ': interlaced PNG unsupported');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    o += 12 + len;                                  // len + type + crc
  }
  if (bitDepth !== 8 || colorType !== 2)
    throw new Error(path + ': expected 8-bit RGB, got depth ' + bitDepth + ' type ' + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 3, stride = w * bpp;
  if (raw.length < h * (stride + 1)) throw new Error(path + ': short pixel data');

  const px = new Uint8Array(h * stride);            // filtered rows removed
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], ro = y * (stride + 1) + 1, po = y * stride;
    for (let x = 0; x < stride; x++) {
      const cur = raw[ro + x];
      const a = x >= bpp ? px[po + x - bpp] : 0;             // left
      const b = y > 0 ? px[po + x - stride] : 0;             // up
      const c = (x >= bpp && y > 0) ? px[po + x - bpp - stride] : 0;
      let v;
      switch (f) {
        case 0: v = cur; break;
        case 1: v = cur + a; break;
        case 2: v = cur + b; break;
        case 3: v = cur + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(path + ': unknown filter ' + f);
      }
      px[po + x] = v & 0xff;
    }
  }

  const out = new Uint8Array(w * h * 4);
  for (let i = 0, n = w * h; i < n; i++) {
    out[i * 4] = px[i * 3];
    out[i * 4 + 1] = px[i * 3 + 1];
    out[i * 4 + 2] = px[i * 3 + 2];
    out[i * 4 + 3] = 255;
  }
  return { w, h, data: out };
}

module.exports = { decode };
