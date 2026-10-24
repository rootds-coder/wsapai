// Smart Router 2.0 tests: routing modes, circuit breaker, Retry-After,
// context fitting, key encryption, usage/mode endpoint guards.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const ap = require(path.join(root, "features", "aiProviders.js"));
const indexSrc = fs.readFileSync(path.join(root, "index.js"), "utf8");

const cfg = (providerId, model) => ({ providerId, apiKey: "k-" + providerId, model, enabled: true });

test("free-first routing prefers providers running free models", () => {
  const store = { activeProviderId: "openai", configs: [cfg("openai", "gpt-4o-mini"), cfg("groq", "llama-3.3-70b-versatile"), cfg("cerebras", "llama-3.3-70b")] };
  const order = ap.orderByMode(ap.orderedCandidates(store), "free-first", "u-free", store).map((c) => c.providerId);
  assert.equal(order[order.length - 1], "openai", "paid provider should sink in free-first mode");
  assert.ok(order.slice(0, 2).includes("groq") && order.slice(0, 2).includes("cerebras"));
});

test("quality routing prefers higher-tier models; manual keeps active first", () => {
  const store = { activeProviderId: "groq", configs: [cfg("groq", "llama-3.1-8b-instant"), cfg("gemini", "gemini-2.5-flash")] };
  const q = ap.orderByMode(ap.orderedCandidates(store), "quality", "u-q", store).map((c) => c.providerId);
  assert.equal(q[0], "gemini");
  const m = ap.orderByMode(ap.orderedCandidates(store), "manual", "u-q", store).map((c) => c.providerId);
  assert.equal(m[0], "groq");
});

test("fastest routing follows observed latency; cooling providers sink", () => {
  const u = "u-fast";
  ap.recordSuccess(u, "groq", 900);
  ap.recordSuccess(u, "cerebras", 120);
  const store = { activeProviderId: "groq", configs: [cfg("groq", "llama-3.3-70b-versatile"), cfg("cerebras", "llama-3.3-70b")] };
  const order = ap.orderByMode(ap.orderedCandidates(store), "fastest", u, store).map((c) => c.providerId);
  assert.equal(order[0], "cerebras");
  // park cerebras with 3 consecutive failures -> sinks despite speed
  const e = new Error("down");
  ap.recordFailure(u, "cerebras", e); ap.recordFailure(u, "cerebras", e); ap.recordFailure(u, "cerebras", e);
  assert.equal(ap.isCoolingDown(u, "cerebras"), true);
  const order2 = ap.orderByMode(ap.orderedCandidates(store), "fastest", u, store).map((c) => c.providerId);
  assert.equal(order2[0], "groq");
  assert.equal(order2.length, 2, "cooling provider sinks but is never fully excluded");
});

test("circuit breaker: success resets the strike count", () => {
  const u = "u-breaker";
  const e = new Error("x");
  ap.recordFailure(u, "groq", e); ap.recordFailure(u, "groq", e);
  ap.recordSuccess(u, "groq", 100);
  ap.recordFailure(u, "groq", e); ap.recordFailure(u, "groq", e);
  assert.equal(ap.isCoolingDown(u, "groq"), false);
  ap.recordFailure(u, "groq", e);
  assert.equal(ap.isCoolingDown(u, "groq"), true);
});

test("Retry-After on a 429 parks the provider for the stated window", () => {
  const u = "u-ra";
  const e = new Error("rate limited");
  e.status = 429;
  e.headers = { "retry-after": "120" };
  ap.recordFailure(u, "groq", e);
  const h = ap.healthFor(u, "groq");
  const remaining = h.cooldownUntil - Date.now();
  assert.ok(remaining > 100 * 1000 && remaining <= 120 * 1000, `cooldown ~120s, got ${remaining}ms`);
});

test("fitContext trims oldest non-system messages, never the persona, never mutates input", () => {
  const msgs = [{ role: "system", content: "PERSONA" }];
  for (let i = 0; i < 40; i++) msgs.push({ role: i % 2 ? "assistant" : "user", content: `turn-${i} ` + "x".repeat(300) });
  const before = msgs.length;
  const fitted = ap.fitContext(msgs, 3000, 512);
  assert.equal(msgs.length, before, "input array must not be mutated");
  assert.equal(fitted[0].content, "PERSONA");
  assert.ok(ap.estimateTokens(fitted) <= 3000 - 512 + 200, "fitted within budget (plus last-message slack)");
  assert.ok(fitted[fitted.length - 1].content.startsWith("turn-39"), "newest turn survives");
  assert.ok(fitted.length < msgs.length, "something was actually trimmed");
});

test("provider keys encrypt at rest and legacy plaintext still reads", () => {
  const prev = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "unit-test-secret-unit-test-secret";
  try {
    const enc = ap.encryptSecret("sk-live-key-987");
    assert.ok(enc.startsWith("enc:v1:"));
    assert.ok(!enc.includes("sk-live-key-987"));
    assert.equal(ap.decryptSecret(enc), "sk-live-key-987");
    assert.equal(ap.decryptSecret("sk-legacy-plain"), "sk-legacy-plain");
    assert.equal(ap.decryptSecret("enc:v1:AAAAtampered"), "");
  } finally {
    if (prev === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = prev;
  }
});

test("chatCompletion honors free-first mode end-to-end (context identical)", async () => {
  const db = require(path.join(root, "db.js"));
  const origGet = db.getAiProviderConfigs;
  const origRec = db.recordAiUsage;
  const origUri = db.MONGODB_URI;
  db.MONGODB_URI = "mongodb://unit-test";
  db.recordAiUsage = async () => {};
  db.getAiProviderConfigs = async () => ({
    activeProviderId: "openai",
    routingMode: "free-first",
    configs: [cfg("openai", "gpt-4o-mini"), cfg("cerebras", "llama-3.3-70b")],
  });
  const calls = [];
  const factory = (c) => ({
    chat: { completions: { create: async (args) => {
      calls.push({ pid: c.providerId, messages: args.messages });
      return { choices: [{ message: { content: `via ${c.providerId}` } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
    } } },
  });
  try {
    const messages = [{ role: "system", content: "p" }, { role: "user", content: "hi" }];
    const r = await ap.chatCompletion({ userId: "router@x.com", messages, clientFactory: factory });
    assert.equal(r.providerId, "cerebras", "free model provider must win in free-first mode");
    assert.equal(r.routingMode, "free-first");
    assert.deepEqual(calls[0].messages, messages);
  } finally {
    db.getAiProviderConfigs = origGet;
    db.recordAiUsage = origRec;
    db.MONGODB_URI = origUri;
  }
});

test("mode + stats endpoints exist and are authenticated", () => {
  assert.match(indexSrc, /app\.post\("\/api\/ai-providers\/mode", requireAuth/);
  assert.match(indexSrc, /app\.get\("\/api\/ai-providers\/stats", requireAuth/);
  assert.match(indexSrc, /db\.getAiUsage\(req\.userId\)/);
  assert.match(indexSrc, /routingModes: aiProviders\.ROUTING_MODES/);
});
