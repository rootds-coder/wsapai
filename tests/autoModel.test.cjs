// Key-only auto-model tests (Router 2.1): a dead stored model must
// never kill a good key. Regression for 2026-10-24: OpenRouter
// returned 404 "google/gemini-2.0-flash-exp:free is no longer
// available: no provider serves this model anymore" and Gemini
// returned a bare 404, and chats failed even though 3 provider keys
// were configured — because each provider was tried with exactly
// one stored model.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.join(__dirname, "..");
const ap = require(path.join(root, "features", "aiProviders.js"));
const db = require(path.join(root, "db.js"));

function err404(msg) {
  const e = new Error(msg || "404 status code (no body)");
  e.status = 404;
  return e;
}

test("registry no longer offers the dead OpenRouter model; auto-router is first", () => {
  const or = ap.getProvider("openrouter");
  assert.ok(!or.models.some((m) => m.id === "google/gemini-2.0-flash-exp:free"), "dead model must not be offered");
  assert.equal(or.models[0].id, "openrouter/free");
  // Groq's retired Llama models must not be picked first either.
  const groq = ap.getProvider("groq");
  assert.equal(groq.models[0].id, "openai/gpt-oss-120b");
  assert.ok(groq.models.findIndex((m) => m.id === "llama-3.3-70b-versatile") > 2);
  // Gemini: 2.5-flash is refused to NEW keys via the OpenAI-compat
  // endpoint (bare 404); 3.8-flash is the live model for new keys.
  assert.equal(ap.getProvider("gemini").models[0].id, "gemini-3.8-flash");
});

test("candidateModels: stored model first, then registry, deduped; empty = auto", () => {
  const withPref = ap.candidateModels("openrouter", "deepseek/deepseek-chat-v3-0324:free");
  assert.equal(withPref[0], "deepseek/deepseek-chat-v3-0324:free");
  assert.equal(new Set(withPref).size, withPref.length, "no duplicates");
  assert.ok(withPref.includes("openrouter/free"));
  const auto = ap.candidateModels("openrouter", "");
  assert.equal(auto[0], "openrouter/free");
});

test("chatCompletion: dead stored OpenRouter model falls through to a working model on the SAME provider", async () => {
  const origGet = db.getAiProviderConfigs;
  const origRec = db.recordAiUsage;
  const origSave = db.saveAiProviderConfigs;
  const origUri = db.MONGODB_URI;
  db.MONGODB_URI = "mongodb://unit-test";
  db.recordAiUsage = async () => {};
  const saved = [];
  db.saveAiProviderConfigs = async (uid, data) => { saved.push({ uid, data }); return data; };
  db.getAiProviderConfigs = async () => ({
    activeProviderId: "openrouter",
    routingMode: "manual",
    configs: [{ providerId: "openrouter", apiKey: "sk-or-x", model: "google/gemini-2.0-flash-exp:free", enabled: true }],
  });
  const calls = [];
  const factory = () => ({
    chat: { completions: { create: async (args) => {
      calls.push(args.model);
      if (args.model === "google/gemini-2.0-flash-exp:free") throw err404("404 google/gemini-2.0-flash-exp:free is no longer available on OpenRouter: no provider serves this model anymore.");
      return { choices: [{ message: { content: "reply via auto model" } }], usage: { prompt_tokens: 5, completion_tokens: 5 } };
    } } },
  });
  try {
    const r = await ap.chatCompletion({ userId: "auto-or@x.com", messages: [{ role: "user", content: "hi" }], clientFactory: factory });
    assert.equal(r.providerId, "openrouter");
    assert.equal(r.model, "openrouter/free");
    assert.deepEqual(calls, ["google/gemini-2.0-flash-exp:free", "openrouter/free"]);
    // Self-heal: the working model was persisted for next time.
    await new Promise((res) => setTimeout(res, 20));
    assert.ok(saved.length >= 1, "working model should be saved");
    assert.equal(saved[0].data.configs[0].model, "openrouter/free");
    // One dead model inside one chat must not park the provider.
    assert.equal(ap.healthFor("auto-or@x.com", "openrouter").consec, 0);
  } finally {
    db.getAiProviderConfigs = origGet;
    db.recordAiUsage = origRec;
    db.saveAiProviderConfigs = origSave;
    db.MONGODB_URI = origUri;
  }
});

test("chatCompletion: 401 stops trying models on that provider and moves to the next", async () => {
  const origGet = db.getAiProviderConfigs;
  const origUri = db.MONGODB_URI;
  db.MONGODB_URI = "mongodb://unit-test";
  db.getAiProviderConfigs = async () => ({
    activeProviderId: "gemini",
    routingMode: "manual",
    configs: [
      { providerId: "gemini", apiKey: "bad-key", model: "gemini-2.5-flash", enabled: true },
      { providerId: "groq", apiKey: "gsk-good", model: "openai/gpt-oss-120b", enabled: true },
    ],
  });
  const perProvider = {};
  const factory = (cfg) => ({
    chat: { completions: { create: async () => {
      perProvider[cfg.providerId] = (perProvider[cfg.providerId] || 0) + 1;
      if (cfg.providerId === "gemini") { const e = new Error("401 Unauthorized"); e.status = 401; throw e; }
      return { choices: [{ message: { content: "via groq" } }], usage: {} };
    } } },
  });
  try {
    const r = await ap.chatCompletion({ userId: "auto-401@x.com", messages: [{ role: "user", content: "hi" }], clientFactory: factory });
    assert.equal(r.providerId, "groq");
    assert.equal(perProvider.gemini, 1, "a bad key must not be retried across every model");
  } finally {
    db.getAiProviderConfigs = origGet;
    db.MONGODB_URI = origUri;
  }
});

test("testProviderKey: a key is judged by a working model, not the dead one it was saved with", async () => {
  const factory = () => ({
    chat: { completions: { create: async (args) => {
      if (args.model === "google/gemini-2.0-flash-exp:free") throw err404("no provider serves this model anymore");
      return { choices: [{ message: { content: "OK" } }] };
    } } },
  });
  const ok = await ap.testProviderKey("openrouter", "sk-or-x", "google/gemini-2.0-flash-exp:free", factory);
  assert.equal(ok.ok, true);
  assert.equal(ok.model, "openrouter/free");
  assert.match(ok.message, /dead model/);
  const badFactory = () => ({
    chat: { completions: { create: async () => { const e = new Error("401"); e.status = 401; throw e; } } },
  });
  const bad = await ap.testProviderKey("openrouter", "sk-or-bad", undefined, badFactory);
  assert.equal(bad.ok, false);
  assert.equal(bad.tried.length, 1, "auth failure must stop the model sweep");
  assert.match(bad.error, /key itself is bad/);
});

test("isModelNotFound recognises OpenRouter's retired-model message and bare Gemini 404s", () => {
  assert.equal(ap.isModelNotFound(err404("404 google/gemini-2.0-flash-exp:free is no longer available")), true);
  assert.equal(ap.isModelNotFound(err404("404 status code (no body)")), true);
  const e401 = new Error("401"); e401.status = 401;
  assert.equal(ap.isModelNotFound(e401), false);
  assert.equal(ap.isAuthError(e401), true);
});
