// Styled QR: the image must stay a valid, scannable QR — exact module
// matrix, light background, solid finders — while looking branded
// (gradient + rounded data modules + frame).
const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const qrStyle = require("../features/qrStyle");

const LINK = "upi://pay?pa=shop@okhdfc&pn=Devil+AI&am=200&cu=INR&tn=Payment";

// Decode our own PNG (filter 0 rows, RGB) back to pixels for assertions.
function decodePng(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.equal(buf[24], 8, "bit depth 8");
  assert.equal(buf[25], 2, "color type RGB");
  let idat = Buffer.alloc(0);
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    if (type === "IDAT") idat = Buffer.concat([idat, buf.subarray(off + 8, off + 8 + len)]);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(idat);
  const stride = width * 3 + 1;
  const px = (x, y) => {
    const i = y * stride + 1 + x * 3;
    return [raw[i], raw[i + 1], raw[i + 2]];
  };
  return { width, height, px };
}

test("styled QR is a valid PNG of the expected size", () => {
  const buf = qrStyle.createStyledQrBuffer(LINK);
  const { width, height } = decodePng(buf);
  assert.equal(width, height);
  assert.ok(width >= 900 && width <= 1400, `canvas ${width}px`);
  assert.ok(buf.length > 5000, "gradient image should be substantial");
});

test("quiet zone stays white and the brand frame sits outside it", () => {
  const { px, width } = decodePng(qrStyle.createStyledQrBuffer(LINK));
  // Frame corner: brand purple.
  assert.deepEqual(px(4, 4), qrStyle.FRAME_COLOR);
  // First quiet-zone pixel just inside the frame: white.
  const q = qrStyle.FRAME_PX + 2;
  assert.deepEqual(px(q, q), [255, 255, 255]);
  // Far corner frame still purple.
  assert.deepEqual(px(width - 5, width - 5), qrStyle.FRAME_COLOR);
});

test("finder patterns stay solid dark squares (never rounded away)", () => {
  const { px } = decodePng(qrStyle.createStyledQrBuffer(LINK));
  const origin = qrStyle.FRAME_PX + qrStyle.QUIET_MODULES * qrStyle.MODULE_PX;
  const m = qrStyle.MODULE_PX;
  // Top-left finder: corner pixel of the 7x7 block must be dark (a
  // rounded module would leave the corner light).
  const corner = px(origin + 1, origin + 1);
  assert.ok(corner[0] < 100, `finder corner should be dark, got ${corner}`);
  // Finder center (3x3) dark, its white ring light.
  assert.ok(px(origin + 3 * m + m / 2, origin + 3 * m + m / 2)[0] < 100);
  assert.deepEqual(px(origin + 1 * m + m / 2, origin + 1 * m + m / 2), [255, 255, 255]);
});

test("data modules are rounded dots with a diagonal gradient", () => {
  const buf = qrStyle.createStyledQrBuffer(LINK);
  const { px } = decodePng(buf);
  const QRCode = require("qrcode");
  const matrix = QRCode.create(LINK, { errorCorrectionLevel: "H" }).modules;
  const size = matrix.size;
  const origin = qrStyle.FRAME_PX + qrStyle.QUIET_MODULES * qrStyle.MODULE_PX;
  const m = qrStyle.MODULE_PX;
  // Find one dark data module away from finders and check its corner
  // pixel is light (rounded) while its center is dark.
  let checked = 0;
  for (let row = 9; row < size - 9 && checked < 1; row++) {
    for (let col = 9; col < size - 9 && checked < 1; col++) {
      if (!matrix.get(row, col)) continue;
      const x0 = origin + col * m;
      const y0 = origin + row * m;
      assert.deepEqual(px(x0 + 1, y0 + 1), [255, 255, 255], "rounded corner should stay light");
      assert.ok(px(x0 + m / 2, y0 + m / 2)[0] < 200, "module center should be dark");
      checked++;
    }
  }
  assert.equal(checked, 1);
  // Gradient: a dark module near the top-left differs from a dark
  // module near the bottom-right (same matrix, different position).
  const firstDark = (r0, r1, c0, c1) => {
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) if (matrix.get(r, c)) return [r, c];
    return null;
  };
  const tl = firstDark(8, 14, 8, 14);
  const br = firstDark(size - 14, size - 8, size - 14, size - 8);
  assert.ok(tl && br, "need dark modules in both corners");
  const topLeft = px(origin + tl[1] * m + m / 2, origin + tl[0] * m + m / 2);
  const bottomRight = px(origin + br[1] * m + m / 2, origin + br[0] * m + m / 2);
  assert.notDeepEqual(topLeft, bottomRight, "gradient should vary across the QR");
});

test("agentTools prefers the styled QR and keeps the basic fallback", () => {
  const agentSrc = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "features", "agentTools.js"), "utf8"
  );
  assert.match(agentSrc, /createStyledQrBuffer/);
  assert.match(agentSrc, /falling back to basic QR/);
});
