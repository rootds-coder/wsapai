// ── Styled (branded) QR codes ─────────────────────────────────────────────
// Dhruv's call (2026-10-24): the payment QR must not look basic. He
// shared two AI-art QR references (neon cyberpunk, floral). Honest
// constraint on both: they are artwork, not functional QRs — the neon
// one's dark background breaks scanner contrast, and the floral one's
// vines/leaves occlude data modules. A payment QR that does not scan
// is a failed payment, so this renderer styles ONLY what scanning
// tolerates and keeps everything else exact:
//   • light background, dark modules (scanners threshold on contrast;
//     dark-background QRs fail on most UPI apps),
//   • every data module present, in its exact matrix position,
//   • finder patterns (the 3 big squares) drawn as solid squares,
//     never rounded or recoloured out of contrast,
//   • data modules as rounded dots with a diagonal Devil gradient
//     (deep purple → pink, the neon reference's palette),
//   • a brand-purple frame OUTSIDE the quiet zone (never inside it).
// No logo in the center: EC-H would tolerate it, but for money we do
// not spend error-correction budget on decoration.
// Zero new dependencies: the module matrix comes from the already
// installed `qrcode` package, and the PNG is encoded by hand with
// Node's built-in zlib (signature + IHDR + IDAT + IEND, CRC32).
"use strict";

const zlib = require("zlib");

const GRADIENT_FROM = [76, 29, 149]; // deep Devil purple #4C1D95
const GRADIENT_TO = [236, 72, 153]; // neon pink #EC4899
const FRAME_COLOR = [76, 29, 149];
const LIGHT = [255, 255, 255];

const MODULE_PX = 20;
const QUIET_MODULES = 4;
const FRAME_PX = 16;

function lerpColor(from, to, t) {
  return from.map((v, i) => Math.round(v + (to[i] - v) * t));
}

function isFinderCell(row, col, size) {
  const inTop = row < 7;
  const inBottom = row >= size - 7;
  const inLeft = col < 7;
  const inRight = col >= size - 7;
  return (inTop && inLeft) || (inTop && inRight) || (inBottom && inLeft);
}

// Pixel-center test for a rounded rect inside one module cell.
function inRoundedCell(px, py, x0, y0, m) {
  const r = m * 0.35;
  const cx = Math.max(x0 + r, Math.min(px, x0 + m - r));
  const cy = Math.max(y0 + r, Math.min(py, y0 + m - r));
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

// ── Minimal PNG encoder (RGB, non-interlaced, filter 0 per row) ───────────
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePng(width, height, rgb) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgb.copy(raw, y * stride + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Render a styled QR PNG for `text`. Returns a Buffer, or throws. */
function createStyledQrBuffer(text) {
  const QRCode = require("qrcode");
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  const isDark = (row, col) =>
    typeof qr.modules.get === "function"
      ? qr.modules.get(row, col)
      : !!qr.modules.data[row * size + col];

  const quietPx = QUIET_MODULES * MODULE_PX;
  const canvas = FRAME_PX * 2 + quietPx * 2 + size * MODULE_PX;
  const origin = FRAME_PX + quietPx;
  const rgb = Buffer.alloc(canvas * canvas * 3);
  // Background: white (frame painted over the outer ring below).
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = LIGHT[0];
    rgb[i + 1] = LIGHT[1];
    rgb[i + 2] = LIGHT[2];
  }
  const setPixel = (x, y, color) => {
    const idx = (y * canvas + x) * 3;
    rgb[idx] = color[0];
    rgb[idx + 1] = color[1];
    rgb[idx + 2] = color[2];
  };
  // Brand frame (outside the quiet zone, so it can never touch a module).
  for (let y = 0; y < canvas; y++) {
    for (let x = 0; x < canvas; x++) {
      if (x < FRAME_PX || y < FRAME_PX || x >= canvas - FRAME_PX || y >= canvas - FRAME_PX) {
        setPixel(x, y, FRAME_COLOR);
      }
    }
  }
  // Modules.
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!isDark(row, col)) continue;
      const t = size > 1 ? (row + col) / (2 * (size - 1)) : 0;
      const color = lerpColor(GRADIENT_FROM, GRADIENT_TO, t);
      const x0 = origin + col * MODULE_PX;
      const y0 = origin + row * MODULE_PX;
      const finder = isFinderCell(row, col, size);
      for (let y = y0; y < y0 + MODULE_PX; y++) {
        for (let x = x0; x < x0 + MODULE_PX; x++) {
          // Finders stay solid squares; data modules are rounded dots.
          if (finder || inRoundedCell(x + 0.5, y + 0.5, x0, y0, MODULE_PX)) {
            setPixel(x, y, color);
          }
        }
      }
    }
  }
  return encodePng(canvas, canvas, rgb);
}

module.exports = {
  GRADIENT_FROM,
  GRADIENT_TO,
  FRAME_COLOR,
  MODULE_PX,
  QUIET_MODULES,
  FRAME_PX,
  lerpColor,
  isFinderCell,
  encodePng,
  createStyledQrBuffer,
};
