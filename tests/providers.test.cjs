// Multi-provider engine tests: registry sanity, priority + fallback
// behavior with injected fake clients, and wiring guards.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const ap = require(path.join(root, "features", "aiProviders.js"));
const indexSrc = fs.readFileSync(path.join(root, "index.js"), "utf8");
const gptSrc = fs.readFileSync(path.join(root, "gpt.js"), "utf8");

test("registry: every provider is OpenAI-compatible with models and a key page", () => {
  const list = ap.listProviders();
  assert.ok(list.length >= 8, "expected at least 8 providers");
  for (const p of list) {
    assert.match(p.baseURL, /^https:\/\//, p.id);
    assert.ok(p.models.length >= 1, p.id);
    assert.ok(p.getKeyUrl.startsWith("https://"), p.id);
    assert.equal(ap.defaultModel(p.id), p.models[0].id);
  }
  // the big free tiers must be present
  for (const id of ["gemini", "groq", "cerebras", "openrouter"]) {
    assert.ok(ap.getProvider(id), `missing provider ${id}`);
    assert.ok(ap.getProvider(id).models.some((m) => m.free), `${id} should list a free model`);
  }
});

test("maskKey never leaks a full key", () => {
  assert.equal(ap.maskKey("AIzaSy1234567890xyz"), "AIza…0xyz");
  assert.equal(ap.maskKey("short"), "••••");
  assert.equal(ap.maskKey(""), "");
});

test("orderedCandidates puts the active provider first", () => {
  const store = {
    activeProviderId: "groq",
    configs: [
      { providerId: "gemini", apiKey: "k1", enabled: true },
      { providerId: "groq", apiKey: "k2", enabled: true },
      { providerId: "bogus", apiKey: "k3", enabled: true },
      { providerId: "openai", apiKey: "", enabled: true },
    ],
  };
  const order = ap.orderedCandidates(store).map((c) => c.providerId);
  assert.deepEqual(order, ["groq", "gemini"]); // unknown provider + empty key excluded
});

// chatCompletion reads configs from the DB layer; without Mongo it must
// refuse cleanly with NO_PROVIDER so callers fall back to legacy chains.
test("chatCompletion without configuration throws NO_PROVIDER", async () => {
  await assert.rejects(
    () => ap.chatCompletion({ userId: "admin", messages: [{ role: "user", content: "hi" }] }),
    (err) => err.code === "NO_PROVIDER"
  );
});

test("fallback: a failing provider hands off to the next, context intact", async () => {
  // Inject configs by stubbing loadConfigs through the module cache used
  // by chatCompletion's own db require — instead we test the public seam:
  // testProviderKey with a fake factory proves per-provider client use.
  const calls = [];
  const factory = (cfg) => ({
    chat: {
      completions: {
        create: async (args) => {
          calls.push({ providerId: cfg.providerId, model: args.model, msgs: args.messages.length });
          if (cfg.providerId === "groq") { const e = new Error("rate limited"); e.status = 429; throw e; }
          return { choices: [{ message: { content: "hello from cerebras" } }], usage: { total_tokens: 9 } };
        },
      },
    },
  });
  const okRes = await ap.testProviderKey("cerebras", "csk-test-key", undefined, factory);
  assert.equal(okRes.ok, true);
  const badRes = await ap.testProviderKey("groq", "gsk-test-key", undefined, factory);
  assert.equal(badRes.ok, false);
  // Auto-model: a 429 on one model no longer condemns the key on the
  // spot — the test sweeps every registry model, then reports the sweep.
  assert.match(badRes.error, /no working model found/);
  assert.ok(badRes.tried.length > 1, "should have tried more than one model before failing");
  assert.ok(calls.every((c) => c.msgs === 1));
});

test("endpoints are authenticated and per-user; engine wired into the chat path", () => {
  assert.match(indexSrc, /app\.get\("\/api\/ai-providers", requireAuth/);
  assert.match(indexSrc, /app\.post\("\/api\/ai-providers", requireAuth/);
  assert.match(indexSrc, /app\.post\("\/api\/ai-providers\/test", requireAuth/);
  assert.match(indexSrc, /aiProviders\.loadConfigs\(req\.userId\)/);
  assert.match(gptSrc, /aiProviders\.chatCompletion\(\{ userId: T\.userId, messages: openAiMessages/);
  assert.match(gptSrc, /aiProviders\.chatCompletion\(\{ userId: T\.userId, messages: msgs/); // Annu path
});

test("isRetryable treats quota/auth/5xx as fallback-worthy", () => {
  const e = (status) => { const x = new Error("x"); x.status = status; return x; };
  assert.equal(ap.isRetryable(e(429)), true);
  assert.equal(ap.isRetryable(e(401)), true);
  assert.equal(ap.isRetryable(e(503)), true);
  assert.equal(ap.isRetryable(new Error("socket hangup")), true);
});

test("chatCompletion falls back across providers with the same messages", async () => {
  const db = require(path.join(root, "db.js"));
  const origGet = db.getAiProviderConfigs;
  const origUri = db.MONGODB_URI;
  db.MONGODB_URI = "mongodb://unit-test";
  db.getAiProviderConfigs = async () => ({
    activeProviderId: "groq",
    configs: [
      { providerId: "groq", apiKey: "gsk-x", model: "llama-3.3-70b-versatile", enabled: true },
      { providerId: "cerebras", apiKey: "csk-y", model: "llama-3.3-70b", enabled: true },
    ],
  });
  const seen = [];
  const factory = (cfg) => ({
    chat: {
      completions: {
        create: async (args) => {
          seen.push({ providerId: cfg.providerId, messages: args.messages });
          if (cfg.providerId === "groq") { const e = new Error("quota"); e.status = 429; throw e; }
          return { choices: [{ message: { content: "reply via fallback" } }], usage: { total_tokens: 5 } };
        },
      },
    },
  });
  try {
    const messages = [
      { role: "system", content: "persona prompt" },
      { role: "user", content: "hello" },
    ];
    const r = await ap.chatCompletion({ userId: "friend@x.com", messages, clientFactory: factory });
    assert.equal(r.text, "reply via fallback");
    assert.equal(r.providerId, "cerebras");
    // Auto-model: groq is now swept model-by-model (stored model
    // first, then the rest of its registry) before falling back to
    // cerebras — the provider order is unchanged, the sweep is new.
    const groqCalls = seen.filter((x) => x.providerId === "groq");
    assert.ok(groqCalls.length > 1, "groq should be tried on more than one model");
    assert.equal(seen[seen.length - 1].providerId, "cerebras");
    // context preserved identically across every switch
    assert.ok(seen.every((x) => JSON.stringify(x.messages) === JSON.stringify(messages)));
  } finally {
    db.getAiProviderConfigs = origGet;
    db.MONGODB_URI = origUri;
  }
});
