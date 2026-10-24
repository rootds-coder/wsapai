// Persona routing (2026-10-24): Devil uses the full pool, Annu
// (girl) prefers emotion/Hinglish-strong providers, Dhruv mode
// (boy) prefers fast casual-banter providers. Rules:
//  - preferred-first, NOT strict: missing/failed preferred
//    providers fall through to the user's remaining providers,
//    so a tenant with only one provider still gets a reply.
//  - persona order overrides the routing-mode order for that
//    persona's chats; Devil and custom personas are unchanged.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { PERSONA_PROVIDER_ORDER, normalizePersona, applyPersonaOrder } = require("../features/aiProviders");
const gptSrc = fs.readFileSync(path.join(__dirname, "..", "gpt.js"), "utf8");
const engineSrc = fs.readFileSync(path.join(__dirname, "..", "features", "aiProviders.js"), "utf8");

const mk = (id) => ({ providerId: id, apiKey: "x", model: "" });

test("persona preference orders are defined and use real registry providers", () => {
  assert.deepStrictEqual(PERSONA_PROVIDER_ORDER.girl[0], "gemini");
  assert.deepStrictEqual(PERSONA_PROVIDER_ORDER.boy[0], "groq");
  assert.ok(PERSONA_PROVIDER_ORDER.girl.includes("mistral"));
  assert.ok(PERSONA_PROVIDER_ORDER.boy.includes("cerebras"));
  assert.strictEqual(PERSONA_PROVIDER_ORDER.devil, undefined);
});

test("normalizePersona maps annu/girl to girl, boy to boy, everything else to null", () => {
  assert.strictEqual(normalizePersona("annu"), "girl");
  assert.strictEqual(normalizePersona("girl"), "girl");
  assert.strictEqual(normalizePersona("boy"), "boy");
  assert.strictEqual(normalizePersona("devil"), null);
  assert.strictEqual(normalizePersona("my-custom-persona"), null);
});

test("girl tries gemini first, then other preferred, then the fallback tail", () => {
  const out = applyPersonaOrder([mk("groq"), mk("gemini"), mk("openrouter")], "girl", "u1");
  assert.deepStrictEqual(out.map((c) => c.providerId), ["gemini", "openrouter", "groq"]);
});

test("boy tries groq then cerebras, then the fallback tail", () => {
  const out = applyPersonaOrder([mk("gemini"), mk("groq"), mk("cerebras")], "boy", "u1");
  assert.deepStrictEqual(out.map((c) => c.providerId), ["groq", "cerebras", "gemini"]);
});

test("preferred-first, not strict: a single non-preferred provider still works for girl", () => {
  const out = applyPersonaOrder([mk("groq")], "girl", "u1");
  assert.deepStrictEqual(out.map((c) => c.providerId), ["groq"]);
});

test("devil and custom personas keep the routing-mode order untouched", () => {
  const input = [mk("groq"), mk("gemini")];
  assert.deepStrictEqual(applyPersonaOrder(input, "devil", "u1").map((c) => c.providerId), ["groq", "gemini"]);
  assert.deepStrictEqual(applyPersonaOrder(input, "custom-123", "u1").map((c) => c.providerId), ["groq", "gemini"]);
});

test("gpt.js passes the persona into the provider engine on both paths", () => {
  assert.match(gptSrc, /chatCompletion\(\{ userId: T\.userId, messages: msgs, temperature: 0\.9, maxTokens: 600, persona: 'girl' \}\)/);
  assert.match(gptSrc, /chatCompletion\(\{ userId: T\.userId, messages: openAiMessages, temperature, maxTokens, persona: mode \}\)/);
  assert.match(engineSrc, /if \(normalizePersona\(persona\)\) candidates = applyPersonaOrder\(candidates, persona, userId\);/);
});
