// Phase 2 (2026-10-24): free-only agent tools + voice + UPI links.
// Hard rule: not a single penny. Automated calls run only on
// registry-flagged free models, STT/TTS never fall back to paid
// legs in freeOnly mode, and a payment payee comes only from the
// owner's stored UPI ID — never from model output.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(root, "index.js"), "utf8");
const dbSrc = fs.readFileSync(path.join(root, "db.js"), "utf8");
const gptSrc = fs.readFileSync(path.join(root, "gpt.js"), "utf8");
const aiProvidersSrc = fs.readFileSync(path.join(root, "features", "aiProviders.js"), "utf8");
const settingsSrc = fs.readFileSync(path.join(root, "client", "src", "components", "dashboard", "Settings.jsx"), "utf8");

const agentTools = require("../features/agentTools");
const aiProviders = require("../features/aiProviders");
const { resolveVoice, VOICE_OPTIONS } = require("../features/freeVoiceEngine");

// ── Action block parsing ─────────────────────────────────────────────────────
test("action block is parsed only when trailing, and bad JSON is stripped, never shown", () => {
  const withAction = agentTools.parseActionBlock('Done! [ACTION] {"name": "save_note", "args": {"text": "likes cricket"}}');
  assert.strictEqual(withAction.action.name, "save_note");
  assert.strictEqual(withAction.text, "Done!");
  assert.strictEqual(withAction.invalid, false);

  const none = agentTools.parseActionBlock("just chatting, no action");
  assert.strictEqual(none.action, null);
  assert.strictEqual(none.text, "just chatting, no action");

  const broken = agentTools.parseActionBlock('Hello [ACTION] {"name": "save_note", ');
  assert.strictEqual(broken.action, null);
  assert.strictEqual(broken.invalid, true);
  assert.strictEqual(broken.text, "Hello");
  assert.doesNotMatch(broken.text, /ACTION/);

  // A valid block mid-text keeps the surrounding prose.
  const mid = agentTools.parseActionBlock('Saving that. [ACTION] {"name": "save_note", "args": {"text": "x"}} Thanks!');
  assert.strictEqual(mid.action.name, "save_note");
  assert.match(mid.text, /Saving that\./);
  assert.match(mid.text, /Thanks!/);
});

// ── Validation: allowlist + ranges ───────────────────────────────────────────
test("validation accepts good actions and rejects unknown tools and out-of-range args", () => {
  assert.strictEqual(agentTools.validateAction({ name: "set_reminder", args: { text: "call back", delayMinutes: 60 } }).ok, true);
  assert.strictEqual(agentTools.validateAction({ name: "save_note", args: { text: "n" } }).ok, true);
  assert.strictEqual(agentTools.validateAction({ name: "create_upi_link", args: { amount: 499 } }).ok, true);
  assert.strictEqual(agentTools.validateAction({ name: "delete_contact", args: {} }).ok, false);
  assert.strictEqual(agentTools.validateAction({ name: "send_message", args: { to: "x", text: "hi" } }).ok, false);
  assert.strictEqual(agentTools.validateAction({ name: "set_reminder", args: { text: "x", delayMinutes: 0 } }).ok, false);
  assert.strictEqual(agentTools.validateAction({ name: "set_reminder", args: { text: "x", delayMinutes: 1 } }).ok, true);
  assert.strictEqual(agentTools.validateAction({ name: "set_reminder", args: { text: "x", delayMinutes: 20000 } }).ok, false);
  assert.strictEqual(agentTools.validateAction({ name: "set_reminder", args: { text: "x".repeat(201), delayMinutes: 60 } }).ok, false);
  assert.strictEqual(agentTools.validateAction({ name: "create_upi_link", args: { amount: 0 } }).ok, false);
  assert.strictEqual(agentTools.validateAction({ name: "create_upi_link", args: { amount: 200000 } }).ok, false);
  assert.strictEqual(agentTools.validateAction({ name: "create_upi_link", args: { amount: "499" } }).ok, false);
  assert.strictEqual(agentTools.validateAction({ name: "create_upi_link", args: {} }).ok, false);
});

// ── UPI: payee never comes from the model ────────────────────────────────────
test("UPI link uses only the stored owner ID; model-supplied payees are ignored", () => {
  const link = agentTools.buildUpiLink("shop@okhdfc", 499, "order 12");
  assert.match(link, /^upi:\/\/pay\?/);
  assert.match(link, /pa=shop%40okhdfc/);
  assert.match(link, /am=499/);
  assert.match(link, /cu=INR/);
  assert.strictEqual(agentTools.buildUpiLink("not-an-upi-id", 100), null);
  assert.strictEqual(agentTools.buildUpiLink("", 100), null);
  assert.strictEqual(agentTools.UPI_ID_RE.test("name@bank"), true);
  assert.strictEqual(agentTools.UPI_ID_RE.test("attacker@evil"), true); // format-valid; ownership is enforced by settings, not format
});

test("delay formatting is human and Hinglish", () => {
  assert.strictEqual(agentTools.formatDelay(30), "30 minute");
  assert.strictEqual(agentTools.formatDelay(90), "1 ghante 30 minute");
  assert.strictEqual(agentTools.formatDelay(2880), "2 din");
});

// ── Execution with fake deps ─────────────────────────────────────────────────
function fakeDeps() {
  const state = { reminders: [], notes: "", upiId: "shop@okhdfc" };
  return {
    state,
    insertReminder: async (doc) => { state.reminders.push(doc); return doc; },
    getNotes: async () => state.notes,
    saveNotes: async (_o, _j, notes) => { state.notes = notes; },
    getUpiId: async () => state.upiId,
  };
}

test("executing a reminder stores it due in the future and confirms in Hinglish", async () => {
  const deps = fakeDeps();
  const before = Date.now();
  const r = await agentTools.executeAction({ deps, owner: "admin", jid: "1@s.whatsapp.net", action: { name: "set_reminder", args: { text: "call back", delayMinutes: 60 } } });
  assert.strictEqual(r.ok, true);
  assert.match(r.message, /Reminder set/);
  assert.strictEqual(deps.state.reminders.length, 1);
  assert.ok(deps.state.reminders[0].dueAt.getTime() > before);
  assert.strictEqual(deps.state.reminders[0].sent, false);
});

test("executing a UPI link ignores any payee smuggled in the action args", async () => {
  const deps = fakeDeps();
  const r = await agentTools.executeAction({
    deps, owner: "admin", jid: "1@s.whatsapp.net",
    action: { name: "create_upi_link", args: { amount: 250, note: "x", pa: "attacker@evil", payee: "attacker@evil" } },
  });
  assert.strictEqual(r.ok, true);
  assert.match(r.link, /pa=shop%40okhdfc/);
  assert.doesNotMatch(r.link, /attacker/);
});

test("UPI payment also produces a scannable QR image (raw upi:// is not tappable in WhatsApp)", async () => {
  const deps = fakeDeps();
  const r = await agentTools.executeAction({
    deps, owner: "admin", jid: "1@s.whatsapp.net",
    action: { name: "create_upi_link", args: { amount: 200, note: "test" } },
  });
  assert.strictEqual(r.ok, true);
  assert.ok(r.qr, "QR attachment expected");
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  assert.deepEqual([...r.qr.buffer.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.ok(r.qr.buffer.length > 1000, "QR should be a real high-res image");
  assert.match(r.qr.caption, /₹200/);
  assert.match(r.qr.caption, /shop@okhdfc/);
  assert.doesNotMatch(r.message, /upi:\/\//, "visible text must not rely on the untappable link");
});

test("handleReplyAction passes the QR attachment through to the pipeline", async () => {
  const deps = fakeDeps();
  const out = await agentTools.handleReplyAction({
    deps, owner: "admin", jid: "1@s.whatsapp.net",
    replyText: 'Link bana diya. [ACTION] {"name": "create_upi_link", "args": {"amount": 50}}',
  });
  assert.strictEqual(out.executed, true);
  assert.ok(out.attachment && out.attachment.buffer.length > 1000);
  assert.doesNotMatch(out.text, /ACTION/);
});

test("UPI link without a stored UPI ID tells the contact plainly instead of failing silently", async () => {
  const deps = fakeDeps();
  deps.state.upiId = "";
  const r = await agentTools.executeAction({
    deps, owner: "admin", jid: "1@s.whatsapp.net",
    action: { name: "create_upi_link", args: { amount: 100 } },
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.message, /UPI ID set nahi hai/);
});

test("handleReplyAction strips the block and appends the confirmation", async () => {
  const deps = fakeDeps();
  const out = await agentTools.handleReplyAction({
    deps, owner: "admin", jid: "1@s.whatsapp.net",
    replyText: 'Theek hai! [ACTION] {"name": "save_note", "args": {"text": "likes cricket"}}',
  });
  assert.strictEqual(out.executed, true);
  assert.doesNotMatch(out.text, /ACTION/);
  assert.match(out.text, /Theek hai!/);
  assert.match(out.text, /Note save/);
  assert.strictEqual(deps.state.notes.includes("likes cricket"), true);

  const plain = await agentTools.handleReplyAction({ deps, owner: "admin", jid: "1@s.whatsapp.net", replyText: "hello" });
  assert.strictEqual(plain.text, "hello");
  assert.strictEqual(plain.executed, false);
});

// ── Free-only gate ───────────────────────────────────────────────────────────
test("free-only model filter keeps registry-free models and drops paid/unknown ones", () => {
  assert.strictEqual(aiProviders.isFreeModel("groq", "openai/gpt-oss-120b"), true);
  assert.strictEqual(aiProviders.isFreeModel("openai", "gpt-4o-mini"), false);
  assert.strictEqual(aiProviders.isFreeModel("groq", "some-unknown-model"), false);
  assert.strictEqual(aiProviders.isFreeModel("nope", "gpt-4o-mini"), false);
  const free = aiProviders.candidateModelsFree("groq", "openai/gpt-oss-120b");
  assert.ok(free.includes("openai/gpt-oss-120b"));
  assert.ok(free.every((m) => aiProviders.isFreeModel("groq", m)));
  assert.deepStrictEqual(aiProviders.candidateModelsFree("openai", "gpt-4o-mini"), []);
});

// ── Voice choice ─────────────────────────────────────────────────────────────
test("voice choice uses a known free Edge voice and falls back for unknown names", () => {
  assert.strictEqual(resolveVoice("girl", "en-IN-NeerjaNeural"), "en-IN-NeerjaNeural");
  assert.strictEqual(resolveVoice("girl", "some-paid-clone-voice"), "hi-IN-SwaraNeural");
  assert.strictEqual(resolveVoice("boy", null), "hi-IN-MadhurNeural");
  assert.ok(VOICE_OPTIONS.length >= 4);
  assert.ok(VOICE_OPTIONS.every((v) => v.id && v.label));
});

// ── Structure guards ─────────────────────────────────────────────────────────
test("router gates automated calls to free models with a distinct no-free error", () => {
  assert.match(aiProvidersSrc, /freeOnly = false/);
  assert.match(aiProvidersSrc, /candidateModelsFree\(c\.providerId, c\.model\)/);
  assert.match(aiProvidersSrc, /NO_FREE_PROVIDER/);
});

test("gpt.js gates paid STT/TTS legs and injects tools on every persona path", () => {
  assert.match(gptSrc, /freeOnly: !!tenant\.freeOnly/);
  assert.match(gptSrc, /toolsEnabled: !!tenant\.toolsEnabled/);
  assert.match(gptSrc, /if \(!T\?\.freeOnly && apiKey/);
  assert.match(gptSrc, /if \(T\.freeOnly\) return null;/);
  assert.match(gptSrc, /if \(T\.toolsEnabled\)/);
  assert.match(gptSrc, /TOOLS_PROMPT/);
  assert.match(gptSrc, /generateFreeNeuralTTSFile\(text, mode, voiceName\)/);
});

test("Annu provider branch gets the tools prompt and keeps [ACTION] intact", () => {
  const branch = gptSrc.slice(
    gptSrc.indexOf('if (annu.isAnnuMode(mode)) {'),
    gptSrc.indexOf("Load Knowledge Base")
  );
  assert.match(branch, /TOOLS_PROMPT/);
  assert.match(branch, /lastIndexOf\("\[ACTION\]"/);
  assert.match(agentTools.TOOLS_PROMPT, /note is optional/);
  assert.match(agentTools.TOOLS_PROMPT, /do NOT ask for a note first/);
});

test("index.js wires tools, free voice, and reminder delivery without mutating cached keys", () => {
  assert.match(indexSrc, /require\("\.\/features\/agentTools"\)/);
  assert.match(indexSrc, /freeOnly: true/);
  assert.match(indexSrc, /memoryTenant\.toolsEnabled = true/);
  assert.match(indexSrc, /memoryTenantVoice\.toolsEnabled = true/);
  assert.match(indexSrc, /replyAction\?\.attachment/);
  assert.match(indexSrc, /image: replyAction\.attachment\.buffer, caption: replyAction\.attachment\.caption/);
  assert.match(indexSrc, /voiceAction\?\.attachment/);
  assert.match(indexSrc, /image: voiceAction\.attachment\.buffer, caption: voiceAction\.attachment\.caption/);
  assert.match(indexSrc, /handleReplyAction\(\{ owner, jid, replyText: reply \}\)/);
  assert.match(indexSrc, /handleReplyAction\(\{ owner, jid, replyText: textReply \}\)/);
  assert.match(indexSrc, /generateSpeechReplyFile\(textReply, contactMode, \{ \.\.\.tenantKeys, freeOnly: true \}, voiceChoice/);
  assert.match(indexSrc, /listDueReminders\(\)/);
  assert.match(indexSrc, /Reminder delivery/);
  assert.match(indexSrc, /app\.get\("\/api\/settings\/upi", requireAuth/);
  assert.match(indexSrc, /app\.post\("\/api\/settings\/upi", requireAuth/);
  assert.match(indexSrc, /app\.get\("\/api\/settings\/voices", requireAuth/);
  assert.match(indexSrc, /app\.get\("\/api\/reminders", requireAuth/);
  assert.match(indexSrc, /app\.delete\("\/api\/reminders\/:id", requireAuth/);
  assert.doesNotMatch(indexSrc, /tenantKeys\.toolsEnabled\s*=/);
});

test("seeded payment rule ships disabled and carries no hardcoded payee", () => {
  const rulesSrc = fs.readFileSync(path.join(__dirname, "..", "features", "rulesEngine.js"), "utf8");
  const payRule = rulesSrc.slice(rulesSrc.indexOf('id: "rule-pay"'), rulesSrc.indexOf('id: "rule-stop"'));
  assert.match(payRule, /enabled: false/);
  assert.doesNotMatch(payRule, /payments@jiopay/);
});

test("db.js stores UPI ID and persona voices per user and indexes reminders", () => {
  assert.match(dbSrc, /scopedSettingsKey\("upiId", userId\)/);
  assert.match(dbSrc, /scopedSettingsKey\("personaVoices", userId\)/);
  assert.match(dbSrc, /getUpiId/);
  assert.match(dbSrc, /setPersonaVoices/);
  assert.match(dbSrc, /reminders_due/);
});

test("dashboard Settings has the UPI, voice, and reminders UI", () => {
  assert.match(settingsSrc, /\/api\/settings\/upi/);
  assert.match(settingsSrc, /\/api\/settings\/voices/);
  assert.match(settingsSrc, /\/api\/reminders/);
  assert.match(settingsSrc, /Agent Tools: UPI/);
});
