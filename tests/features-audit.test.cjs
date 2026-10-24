// Regression tests for the Persona/KB, Shield and Rules audit.
// The pure-logic tests run without MongoDB (both engines tolerate a
// missing DB by design); the pipeline tests are source-level guards for
// behaviour that lives in index.js's WhatsApp message handler.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(root, "index.js"), "utf8");
const rules = require(path.join(root, "features", "rulesEngine.js"));
const shield = require(path.join(root, "features", "securityShield.js"));

// ── Rules engine: word-boundary matching ─────────────────────────────
test("rule 'pay' does NOT trigger on names or unrelated words", () => {
  const rule = { keywords: ["pay"], matchType: "contains" };
  assert.equal(rules.ruleMatches(rule, "payal ka number bhejo"), false);
  assert.equal(rules.ruleMatches(rule, "repay the loan please"), false);
  assert.equal(rules.ruleMatches(rule, "i will pay tomorrow"), true);
  assert.equal(rules.ruleMatches(rule, "pay"), true);
});

test("rule phrases match as substrings, exact match stays exact", () => {
  const phrase = { keywords: ["bank details"], matchType: "contains" };
  assert.equal(rules.ruleMatches(phrase, "please share your bank details"), true);
  const exact = { keywords: ["stop"], matchType: "exact" };
  assert.equal(rules.ruleMatches(exact, "stop"), true);
  assert.equal(rules.ruleMatches(exact, "please stop this"), false);
});

test("default rules still trigger on their intended messages", async () => {
  // No MongoDB in the test env: listRules falls back to the seed rules.
  // rule-pay ships DISABLED (it hijacked UPI-link tool requests), so a
  // payment message now falls through to the AI instead of matching it.
  assert.equal(await rules.matchRule("payment karna hai"), null);
  assert.equal((await rules.matchRule("price kya hai"))?.id, "rule-pricing");
  assert.equal(await rules.matchRule("payal ka number bhejo"), null);
});

// ── Security shield: detection ───────────────────────────────────────
test("shield detects OTP harvesting and phishing links", () => {
  assert.equal(shield.detectThreatText("please send otp to verify")?.threatLevel, "high");
  assert.equal(shield.detectThreatText("claim now http://bit.ly/xyz-free")?.threatLevel, "medium");
  assert.equal(shield.detectThreatText("hello, kal milte hain"), null);
});

test("shield inspectMessage returns a top-level threatLevel", async () => {
  const r = await shield.inspectMessage({ jid: "910000000001@s.whatsapp.net", name: "T", text: "send otp now" });
  assert.equal(r.safe, false);
  assert.equal(r.threatLevel, "high");
  const ok = await shield.inspectMessage({ jid: "910000000002@s.whatsapp.net", name: "T", text: "namaste, price list bhejo" });
  assert.equal(ok.safe, true);
});

// ── Pipeline guards (source-level) ───────────────────────────────────
test("flagged messages cannot reach rules/AI: shield gate continues before rules run", () => {
  const start = indexSrc.indexOf("const securityCheck = await securityShield.inspectMessage");
  assert.ok(start > -1);
  const rulesAt = indexSrc.indexOf("rulesEngine.matchRule");
  assert.ok(rulesAt > start, "rules must run after the shield");
  const gate = indexSrc.slice(start, rulesAt);
  assert.match(gate, /if \(!securityCheck\.safe\) \{/);
  assert.match(gate, /continue;/);
});

test("manual (human handover) mode silences the AI", () => {
  assert.match(indexSrc, /contactMode === "manual"\) \{\s*\n\s*console\.log\(`\[Manual\] Skipping AI reply/);
  // inactivity reset must not silently cancel a human handover
  assert.match(indexSrc, /contact\.mode !== "manual"/);
});

test("gemini chat cannot starve replies with hidden thinking tokens", () => {
  // Live diagnosis 2026-10-23: gemini flash models spent ~333 of the old
  // 350 maxOutputTokens on hidden reasoning (thoughtsTokenCount), leaving
  // ~13 tokens for the visible reply — Annu answered mid-word fragments
  // with finishReason MAX_TOKENS.
  const geminiSrc = fs.readFileSync(path.join(root, "features", "geminiEngine.js"), "utf8");
  assert.match(geminiSrc, /thinkingConfig: \{ thinkingBudget: 0 \}/);
  assert.doesNotMatch(geminiSrc, /maxOutputTokens: mode === "devil" \? 800 : 350/);
  assert.match(geminiSrc, /finishReason === "MAX_TOKENS"/); // retry-with-bigger-budget guard
});

test("tenant isolation: admin-only master powers + owner-scoped self-service", () => {
  // Master-only powers (Phase 1.7 contract, unchanged):
  assert.match(indexSrc, /app\.post\("\/api\/auth\/register", requireAdmin, apiLimiter/);
  assert.ok(indexSrc.includes('app.post("/api/broadcasts/send", requireAdmin'), "broadcast stays admin-only");
  // Self-service endpoints must be authenticated AND owner-scoped — a
  // tenant can only ever touch their own data (Phase 2 tenancy):
  assert.match(indexSrc, /app\.post\("\/api\/set-key", requireAuth, apiLimiter/);
  assert.ok(indexSrc.includes("await db.updateUserApiKey(req.userId, trimmed)"), "tenant set-key stores on their own account");
  assert.match(indexSrc, /app\.post\("\/api\/contacts\/mode", requireAuth, apiLimiter/);
  assert.ok(indexSrc.includes("await db.setContactMode(jid, mode, req.userId)"), "mode change is owner-scoped");
  assert.ok(indexSrc.includes("await db.deleteContact(jid, req.userId)"), "contact delete is owner-scoped");
  assert.match(indexSrc, /app\.post\("\/api\/upload-chat", requireAuth, uploadLimiter/);
  assert.ok(indexSrc.includes("req.userId);"), "KB upload is owner-scoped");
  // the global runtime API key may only be seeded from the master's cookie
  assert.match(indexSrc, /const isMaster = req\.session && \(req\.session\.role === "admin"/);
});

test("knowledge base injection is capped", () => {
  const gptSrc = fs.readFileSync(path.join(root, "gpt.js"), "utf8");
  assert.match(gptSrc, /TOTAL_CHARS = 24000/);
  assert.match(gptSrc, /PER_DOC_CHARS = 8000/);
});
