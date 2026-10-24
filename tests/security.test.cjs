// Security regression tests — these guard the security fixes (audit history is kept out of this public repo).
// They are intentionally source-level: the flaws they prevent (hardcoded
// passwords, unauthenticated routes) are source-level mistakes.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(root, "index.js"), "utf8");
const dbSrc = fs.readFileSync(path.join(root, "db.js"), "utf8");

test("no hardcoded password comparisons in login", () => {
  assert.doesNotMatch(indexSrc, /trimmedPassword\s*===\s*["'][^"']+["']/);
  assert.doesNotMatch(indexSrc, /password\s*===\s*["'](admin|123456)["']/);
});

test("admin login uses timing-safe comparison against env only", () => {
  assert.match(indexSrc, /timingSafeStringEqual\(trimmedPassword, trimmedAdminPassword\)/);
});

test("admin username never falls through to regular-user auth", () => {
  assert.match(indexSrc, /rawUsername\.toLowerCase\(\) === "admin"\) \{\s*\n\s*return res\.status\(401\)/);
});

test("knowledge-base routes require authentication", () => {
  assert.match(indexSrc, /app\.get\("\/api\/chats", requireAuth/);
  assert.match(indexSrc, /app\.post\("\/api\/upload-chat", requireAuth/);
});

test("socket.io requires an authenticated session", () => {
  assert.match(indexSrc, /io\.use\(/);
  assert.match(indexSrc, /sess\.authenticated/);
});

test("user passwords are hashed with scrypt, not plain sha256", () => {
  assert.match(dbSrc, /scrypt\$/);
  assert.match(dbSrc, /async function hashPassword/);
  // sha256 may remain ONLY inside the legacy-migration verifier
  assert.match(dbSrc, /Legacy SHA-256/);
});

test("scrape-url has an SSRF guard for private hosts", () => {
  assert.match(indexSrc, /isBlockedScrapeHost/);
  assert.match(indexSrc, /assertSafeScrapeUrl/);
});

test("repo hygiene: .env is covered by .gitignore", () => {
  // Note: a deployed server legitimately HAS a .env on disk — what must
  // never happen is it being committed/shared. .gitignore coverage is the
  // invariant; file presence is environment-specific and not asserted here.
  const gi = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  assert.match(gi, /^\.env$/m);
});

test("password hashing round-trips (scrypt)", async () => {
  const db = require(path.join(root, "db.js"));
  const hash = await db.hashPassword("correct horse battery staple");
  assert.ok(hash.startsWith("scrypt$"));
  const good = await db.verifyPassword("correct horse battery staple", hash);
  assert.equal(good.ok, true);
  const bad = await db.verifyPassword("wrong password", hash);
  assert.equal(bad.ok, false);
  // legacy sha256 hashes still verify (for migration), and are flagged legacy
  const crypto = require("node:crypto");
  const legacy = crypto.createHash("sha256").update("oldpass").digest("hex");
  const mig = await db.verifyPassword("oldpass", legacy);
  assert.deepEqual(mig, { ok: true, legacy: true });
});
