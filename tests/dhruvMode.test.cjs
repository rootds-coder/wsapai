// Dhruv mode (boy) bugs reported 2026-10-24: replies cut off
// mid-sentence, and the bot failed to follow context/intent.
// Root causes, all in gpt.js:
//  1) boy/girl got only 120 output tokens on the provider path
//     (reasoning models eat that budget on hidden reasoning first),
//     while the legacy Gemini persona path already gave 600.
//  2) Every reply path then hard-sliced boy/girl replies at 160
//     chars + "..." — a literal mid-sentence cut.
//  3) The boy prompt demanded "max 1-2 short lines (12-15 words)",
//     so a request for detail lost to the prompt.
//  4) forceHumanReply replaced the ENTIRE reply with a random
//     "haa bhai" whenever a bot phrase appeared anywhere in it,
//     discarding substantive answers and looking like the bot
//     ignored the user's intent.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "gpt.js"), "utf8");
const { getSystemPrompt, forceHumanReply } = require("../gpt");

test("boy persona is no longer capped at 120 tokens or sliced at 160 chars", () => {
  assert.doesNotMatch(src, /slice\(0, 157\)/);
  assert.doesNotMatch(src, /maxTokens = mode === "devil" \? 1024 : 120/);
  assert.match(src, /let maxTokens = mode === "devil" \? 1024 : 600/);
});

test("boy prompt allows full answers for real questions and demands history recall", () => {
  const prompt = getSystemPrompt("boy");
  assert.doesNotMatch(prompt, /12-15 words/);
  assert.match(prompt, /answer it properly/);
  assert.match(prompt, /ALWAYS use the conversation history/);
  assert.match(prompt, /never stop mid-sentence/);
});

test("forceHumanReply keeps long substantive answers, only replaces short generic ones", () => {
  const long = "Haan bhai, aap bataiye — Rahul, tumhe cricket pasand hai, isliye main tumhe batting tips deta hoon jo kaam aayenge.";
  assert.strictEqual(forceHumanReply(long, "boy"), long);
  const short = "main aapki kya madad kar sakta hu?";
  const replaced = forceHumanReply(short, "boy");
  assert.notStrictEqual(replaced, short);
  assert.ok(["haa bhai", "sahi hai yaar", "arre waah", "fir?", "bol na bhai", "kya scene hai?"].includes(replaced));
});
