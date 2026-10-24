// Provider-gate regression (2026-10-24): a tenant with AI Provider
// keys saved but NO legacy userApiKey/userGeminiKey was sent "Bot is
// not configured: add your API key in the web app first" by the
// WhatsApp handler, and showed "Missing" in the admin users list —
// even though the provider engine would have answered. The gate,
// /api/config and the admin list must all count provider keys.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const ap = require(path.join(root, "features", "aiProviders.js"));
const db = require(path.join(root, "db.js"));
const indexSrc = fs.readFileSync(path.join(root, "index.js"), "utf8");
const settingsSrc = fs.readFileSync(path.join(root, "client", "src", "components", "dashboard", "Settings.jsx"), "utf8");

test("hasConfiguredProviders counts provider keys, ignores empty/unknown ones", async () => {
  const origGet = db.getAiProviderConfigs;
  const origUri = db.MONGODB_URI;
  db.MONGODB_URI = "mongodb://unit-test";
  try {
    db.getAiProviderConfigs = async (uid) => {
      if (uid === "provider-only@x.com") return { configs: [
        { providerId: "groq", apiKey: "gsk-x", enabled: true },
        { providerId: "openrouter", apiKey: "sk-or-x", enabled: true },
      ], activeProviderId: "groq" };
      if (uid === "empty@x.com") return { configs: [
        { providerId: "groq", apiKey: "", enabled: true },
        { providerId: "bogus", apiKey: "k", enabled: true },
      ], activeProviderId: null };
      return { configs: [], activeProviderId: null };
    };
    assert.equal(await ap.hasConfiguredProviders("provider-only@x.com"), true);
    assert.deepEqual(await ap.configuredProviderIds("provider-only@x.com"), ["groq", "openrouter"]);
    assert.equal(await ap.hasConfiguredProviders("empty@x.com"), false);
    assert.equal(await ap.hasConfiguredProviders("nobody@x.com"), false);
  } finally {
    db.getAiProviderConfigs = origGet;
    db.MONGODB_URI = origUri;
  }
});

test("WhatsApp gate falls back to provider keys when legacy keys are empty", () => {
  // The gate lives in the messages.upsert handler; assert it checks
  // providers instead of only the legacy fields.
  assert.match(indexSrc, /tenantConfigured = await aiProviders\.hasConfiguredProviders\(owner\)/);
  assert.match(indexSrc, /Bot is not configured: add your API key in the web app first/);
});

test("/api/config counts provider keys for tenants", () => {
  assert.match(indexSrc, /configuredProviderIds\(owner\)/);
});

test("admin analytics enriches users with hasAiProviders; Settings shows Providers, not Missing", () => {
  assert.match(indexSrc, /u\.hasAiProviders = ids\.length > 0/);
  assert.match(settingsSrc, /u\.hasAiProviders \? 'Providers' : 'Missing'/);
});
