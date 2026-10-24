// Security hardening (2026-10-24), user-requested: OTP abuse cap
// + a full security layer pass. What the audit found:
//  - OTP: only a 60s resend cooldown, no daily cap at all.
//  - Server logs + broadcast progress were io.emit to EVERY
//    socket, leaking admin jids/stacks to tenants.
//  - Voice Vault + Media GETs were open to any tenant while
//    their POST/DELETE were admin-only (master-only features).
//  - /api/config skipped requireAuth entirely.
//  - No NoSQL-operator guard, no session regeneration on login,
//    no global safe error handler.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(root, "index.js"), "utf8");
const routerSrc = fs.readFileSync(path.join(root, "routes", "featuresRouter.js"), "utf8");
const { hasMongoOperator, rejectMongoOperators } = require("../features/inputGuard");
const otp = require("../features/registrationOtp");

test("OTP daily limit is 3 per email per rolling 24h", () => {
  assert.strictEqual(otp.OTP_DAILY_LIMIT, 3);
  assert.strictEqual(otp.OTP_DAILY_WINDOW_MS, 24 * 60 * 60 * 1000);
  assert.match(indexSrc, /if \(err\.code === "OTP_DAILY_LIMIT"\) return res\.status\(429\)/);
  assert.match(fs.readFileSync(path.join(root, "features", "registrationOtp.js"), "utf8"), /otpDailyCount/);
});

test("NoSQL operator guard rejects $ keys and null bytes, allows normal payloads", () => {
  assert.strictEqual(hasMongoOperator({ username: "dhruv" }), false);
  assert.strictEqual(hasMongoOperator({ username: { $ne: "" } }), true);
  assert.strictEqual(hasMongoOperator({ a: [{ b: { $gt: 1 } }] }), true);
  assert.strictEqual(hasMongoOperator("hello $world"), false);
  assert.strictEqual(hasMongoOperator("a\0b"), true);
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  let nextCalled = false;
  rejectMongoOperators({ body: { jid: { $gt: "" } }, query: {}, params: {} }, res, () => { nextCalled = true; });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(nextCalled, false);
  rejectMongoOperators({ body: { message: "hi" }, query: {}, params: {} }, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
  assert.match(indexSrc, /rejectMongoOperators/);
});

test("logs and broadcast progress go to the admin room only, never io.emit to all", () => {
  assert.doesNotMatch(indexSrc, /io\.emit\('syslog'/);
  assert.doesNotMatch(indexSrc, /io\.emit\("broadcastProgress"/);
  assert.match(indexSrc, /io\.to\('tenant:admin'\)\.emit\('syslog'/);
  assert.match(indexSrc, /io\.to\("tenant:admin"\)\.emit\("broadcastProgress"/);
});

test("vault/media reads and /api/config are no longer open to tenants/anonymous", () => {
  assert.match(routerSrc, /router\.get\("\/vault", requireAdminRole/);
  assert.match(routerSrc, /router\.get\("\/vault\/:id\/stream", requireAdminRole/);
  assert.match(indexSrc, /app\.get\("\/api\/media", requireAdmin/);
  assert.match(indexSrc, /app\.get\("\/api\/config", requireAuth/);
});

test("login regenerates the session and a global safe error handler exists", () => {
  assert.match(indexSrc, /const establishSession = /);
  assert.match(indexSrc, /req\.session\.regenerate/);
  assert.match(indexSrc, /establishSession\(req, \{ authenticated: true, username: "admin", role: "admin" \}/);
  assert.match(indexSrc, /establishSession\(req, \{ authenticated: true, username: user\.username, role: "user" \}/);
  assert.match(indexSrc, /app\.use\(\(err, req, res, next\) => \{/);
  assert.doesNotMatch(indexSrc, /res\.status\(500\)\.json\(\{ ok: false, error: err\.stack/);
});
