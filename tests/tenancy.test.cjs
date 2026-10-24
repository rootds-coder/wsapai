// Multi-tenant isolation tests (Phase 2): OTP registration helpers and the
// per-tenant key plumbing that guarantees a registered user's bot NEVER
// runs on the owner's API keys.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(root, "index.js"), "utf8");
const otp = require(path.join(root, "features", "registrationOtp.js"));
const annu = require(path.join(root, "features", "annu.js"));

// ── OTP helpers ──────────────────────────────────────────────────────
test("OTP codes are 6 digits and stored only as hashes", () => {
  for (let i = 0; i < 50; i++) assert.match(otp.generateOtp(), /^\d{6}$/);
  const h = otp.hashOtp("123456");
  assert.equal(h.length, 64);
  assert.equal(otp.hashOtp("123456"), h);
  assert.notEqual(otp.hashOtp("123457"), h);
  assert.ok(!h.includes("123456"));
});

test("email validation accepts real addresses, rejects junk", () => {
  assert.equal(otp.isValidEmail("friend@gmail.com"), true);
  assert.equal(otp.isValidEmail("a.b+tag@jiopay-india-com.serv00.net"), true);
  assert.equal(otp.isValidEmail("not-an-email"), false);
  assert.equal(otp.isValidEmail("a@b"), false);
  assert.equal(otp.isValidEmail(""), false);
  assert.equal(otp.isValidEmail(null), false);
});

// ── Tenant key isolation in the Annu pipeline ────────────────────────
test("tenant Annu calls pass ONLY the tenant's gemini key override", async () => {
  let seenOverride = "unset";
  const responder = annu.createAnnuResponder({
    primary: async (text, prompt, history, kb, mode, override) => {
      seenOverride = override;
      return "theek hai";
    },
    fallbackFactory: () => null,
  });
  await responder("hi", [], "", { userId: "friend@gmail.com", apiKey: "", geminiKey: "AIza-TENANT" });
  assert.equal(seenOverride, "AIza-TENANT");
  await responder("hi", [], "", { userId: "friend@gmail.com", apiKey: "", geminiKey: "" });
  assert.equal(seenOverride, "", "tenant without a gemini key must get an EMPTY override, never the owner's keys");
  await responder("hi", [], "", { userId: "admin" });
  assert.equal(seenOverride, undefined, "admin keeps the global key resolution");
});

test("tenant without any keys gets the honest unavailable reply, not the owner's quota", async () => {
  const responder = annu.createAnnuResponder({
    primary: async () => { throw new Error("no keys"); },
    // default fallbackFactory: buildFallbackClient(tenant)
  });
  const reply = await responder("hi", [], "", { userId: "friend@gmail.com", apiKey: "", geminiKey: "" });
  assert.equal(reply, annu.unavailableReply());
});

// ── Architecture guards (source-level) ───────────────────────────────
test("every tenant gets their own WhatsApp connection + auth folder", () => {
  assert.match(indexSrc, /auth_info_baileys_users/);
  assert.match(indexSrc, /async function startWhatsApp\(owner = "admin"\)/);
  assert.match(indexSrc, /getTenant\(req\.userId\)/);
  assert.match(indexSrc, /app\.post\("\/api\/whatsapp\/connect", requireAuth/);
});

test("pipeline threads the tenant owner into rules, shield, history and AI", () => {
  assert.match(indexSrc, /rulesEngine\.matchRule\(textMsg, owner\)/);
  assert.match(indexSrc, /securityShield\.inspectMessage\(\{ jid, name: msg\.pushName, text: textMsg, owner \}\)/);
  // Phase 1: the tenant object is copied with that contact's memory
  // attached (loadMemoryTenant) — the cached tenantKeys object itself
  // is never mutated, so memories can't leak across contacts.
  assert.match(indexSrc, /loadMemoryTenant\(owner, jid, tenantKeys\)/);
  assert.match(indexSrc, /getReplyAsDhruv\(textMsg, contactMode, chatHistory, memoryTenant\)/);
  assert.match(indexSrc, /db\.getContact\(jid, owner\)/);
  assert.match(indexSrc, /db\.getChatHistory\(jid, 12, owner\)/);
});

test("public registration is OTP-gated and mail is admin-configured", () => {
  assert.match(indexSrc, /app\.post\("\/api\/auth\/register\/request-otp", authLimiter/);
  assert.match(indexSrc, /app\.post\("\/api\/auth\/register\/verify-otp", authLimiter/);
  assert.match(indexSrc, /app\.post\("\/api\/admin\/mail-config", requireAdmin/);
  const mailerSrc = fs.readFileSync(path.join(root, "features", "mailer.js"), "utf8");
  assert.match(mailerSrc, /mailConfig/);
  assert.match(mailerSrc, /createTransport/);
});

test("settings page imports every component its mail card uses (blank-page regression)", () => {
  const settingsSrc = fs.readFileSync(path.join(root, "client", "src", "components", "dashboard", "Settings.jsx"), "utf8");
  assert.match(settingsSrc, /import \{ Input \} from '@\/components\/ui\/input'/);
  assert.match(settingsSrc, /\bMail, Save\b/);
  const dashSrc = fs.readFileSync(path.join(root, "client", "src", "pages", "Dashboard.jsx"), "utf8");
  assert.match(dashSrc, /prefetchTabChunks/);
});

test("mail transport cache is keyed by the password too (stale-password regression)", () => {
  const mailerSrc = fs.readFileSync(path.join(root, "features", "mailer.js"), "utf8");
  assert.match(mailerSrc, /createHash\('sha256'\)\.update\(String\(cfg\.pass\)\)/);
  assert.match(mailerSrc, /configOverride/);
  const idx = fs.readFileSync(path.join(root, "index.js"), "utf8");
  assert.match(idx, /configOverride: \{ host, port, user, pass, from \}/);
});
