// Phase 1 foundation (2026-10-24): per-contact long-term memory,
// opt-in AI disclosure, disconnect alerts, and daily DB backup.
// Structure rule from here on: logic lives in features/*, index.js
// only wires it, and no new feature code goes into the monolith.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(root, "index.js"), "utf8");
const dbSrc = fs.readFileSync(path.join(root, "db.js"), "utf8");
const gptSrc = fs.readFileSync(path.join(root, "gpt.js"), "utf8");
const settingsSrc = fs.readFileSync(path.join(root, "client", "src", "components", "dashboard", "Settings.jsx"), "utf8");

const contactMemory = require("../features/contactMemory");
const aiDisclosure = require("../features/aiDisclosure");
const alerts = require("../features/alerts");
const backup = require("../features/backup");

// ── Long-term memory: fact extraction ────────────────────────────────────────
test("memory extracts only explicit name/likes statements, not vague chat", () => {
  assert.deepStrictEqual(contactMemory.extractFacts("mera naam Rahul hai"), ["Name: Rahul"]);
  assert.deepStrictEqual(contactMemory.extractFacts("my name is Priya"), ["Name: Priya"]);
  assert.deepStrictEqual(contactMemory.extractFacts("mujhe cricket pasand hai"), ["Likes: cricket"]);
  assert.deepStrictEqual(contactMemory.extractFacts("i like old hindi songs"), ["Likes: old hindi songs"]);
  assert.deepStrictEqual(contactMemory.extractFacts("kal milte hain, bye"), []);
  assert.deepStrictEqual(contactMemory.extractFacts("cricket achha hai"), []);
  assert.deepStrictEqual(contactMemory.extractFacts(""), []);
  assert.deepStrictEqual(contactMemory.extractFacts(null), []);
});

test("memory prompt block is empty without memory and lists summary + facts with it", () => {
  assert.strictEqual(contactMemory.formatMemoryForPrompt(null), "");
  assert.strictEqual(contactMemory.formatMemoryForPrompt({}), "");
  const block = contactMemory.formatMemoryForPrompt({
    summary: "Rahul, cricket lover",
    facts: [{ text: "Name: Rahul" }, "Likes: cricket"],
  });
  assert.match(block, /Rahul, cricket lover/);
  assert.match(block, /Name: Rahul/);
  assert.match(block, /Likes: cricket/);
});

test("memory re-summarizes only after 25 new messages since the last summary", () => {
  assert.strictEqual(contactMemory.shouldSummarize(null, 10), false);
  assert.strictEqual(contactMemory.shouldSummarize(null, 24), false);
  assert.strictEqual(contactMemory.shouldSummarize(null, 25), true);
  assert.strictEqual(contactMemory.shouldSummarize({ messagesSummarizedUpTo: 100 }, 120), false);
  assert.strictEqual(contactMemory.shouldSummarize({ messagesSummarizedUpTo: 100 }, 125), true);
});

// ── AI disclosure: opt-in, once per contact ──────────────────────────────────
test("disclosure is off by default, once per contact, and never repeats", () => {
  assert.strictEqual(aiDisclosure.shouldDisclose({ enabled: false, contact: {} }), false);
  assert.strictEqual(aiDisclosure.shouldDisclose({ enabled: true, contact: {} }), true);
  assert.strictEqual(aiDisclosure.shouldDisclose({ enabled: true, contact: { aiDisclosureSent: true } }), false);
  const first = aiDisclosure.applyDisclosureText("hello", { enabled: true, contact: {} });
  assert.strictEqual(first.disclosed, true);
  assert.match(first.text, /Devil AI/);
  assert.match(first.text, /hello$/);
  const again = aiDisclosure.applyDisclosureText("hello", { enabled: true, contact: { aiDisclosureSent: true } });
  assert.strictEqual(again.disclosed, false);
  assert.strictEqual(again.text, "hello");
});

// ── Alerts ────────────────────────────────────────────────────────────────────
test("alerts validate types and format an email with title + detail", () => {
  assert.ok(alerts.ALERT_TYPES.includes("whatsapp_disconnected"));
  assert.ok(alerts.ALERT_TYPES.includes("whatsapp_logged_out"));
  assert.ok(alerts.ALERT_TYPES.includes("backup_failed"));
  assert.strictEqual(alerts.isEmailLike("test-owner@example.com"), true);
  assert.strictEqual(alerts.isEmailLike("admin"), false);
  const email = alerts.formatAlertEmail({ owner: "a@x.com", type: "whatsapp_logged_out", title: "WhatsApp device logged out", detail: "code 401", createdAt: new Date("2026-10-24T10:00:00Z") });
  assert.match(email.subject, /WhatsApp device logged out/);
  assert.match(email.text, /code 401/);
});

// ── Backup: pruning + a real dump into a temp dir ─────────────────────────────
test("backup pruning keeps the newest 7 archives and drops older ones", () => {
  const names = Array.from({ length: 10 }, (_, i) => `backup-2026-10-${String(i + 1).padStart(2, "0")}.tar.gz`);
  assert.deepStrictEqual(backup.filesToPrune(names, 7), names.slice(0, 3));
  assert.deepStrictEqual(backup.filesToPrune(names.slice(0, 5), 7), []);
});

test("backup dumps collections to JSON, skips sessions, and writes a manifest", async () => {
  const { execFileSync } = require("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devil-backup-"));
  // Fake mirrors the real Mongo driver: listCollections() returns a
  // cursor with toArray(), not a bare array.
  const fakeDb = {
    listCollections: () => ({ toArray: async () => [{ name: "contacts" }, { name: "sessions" }, { name: "settings" }] }),
    collection: (name) => ({
      find: () => ({ toArray: async () => (name === "contacts" ? [{ jid: "1" }] : []) }),
    }),
  };
  const result = await backup.runBackup({ db: fakeDb, dir });
  let manifestText;
  if (result.path.endsWith(".tar.gz")) {
    const names = execFileSync("tar", ["-tzf", result.path], { encoding: "utf8" });
    assert.match(names, /manifest\.json/);
    assert.doesNotMatch(names, /sessions\.json/);
    const base = path.basename(result.path, ".tar.gz");
    manifestText = execFileSync("tar", ["-xzOf", result.path, `${base}/manifest.json`], { encoding: "utf8" });
  } else {
    manifestText = fs.readFileSync(path.join(result.path, "manifest.json"), "utf8");
    assert.ok(!fs.existsSync(path.join(result.path, "sessions.json")));
  }
  const manifest = JSON.parse(manifestText);
  assert.strictEqual(manifest.totalDocs, 1);
  assert.strictEqual(manifest.collections.contacts, 1);
  assert.strictEqual(manifest.collections.sessions, undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("backup scheduler runs when 24h passed and skips when backed up recently", async () => {
  let last = 0;
  let runs = 0;
  const sched = backup.startBackupScheduler({
    getLastBackupAt: async () => last,
    setLastBackupAt: async (ts) => { last = ts; },
    run: async () => { runs += 1; return { path: "/tmp/x" }; },
    checkMs: 60 * 60 * 1000,
  });
  await sched.maybeRun();
  assert.strictEqual(runs, 1);
  await sched.maybeRun();
  assert.strictEqual(runs, 1); // skipped: just backed up
  sched.stop();
});

// ── Structure guards: wiring stays thin, logic stays in features/ ────────────
test("index.js wires Phase 1 modules and endpoints without owning the logic", () => {
  assert.match(indexSrc, /require\("\.\/features\/contactMemory"\)/);
  assert.match(indexSrc, /require\("\.\/features\/aiDisclosure"\)/);
  assert.match(indexSrc, /require\("\.\/features\/alerts"\)/);
  assert.match(indexSrc, /require\("\.\/features\/backup"\)/);
  assert.match(indexSrc, /app\.get\("\/api\/settings\/disclosure", requireAuth/);
  assert.match(indexSrc, /app\.post\("\/api\/settings\/disclosure", requireAuth/);
  assert.match(indexSrc, /app\.get\("\/api\/alerts", requireAuth/);
  assert.match(indexSrc, /app\.get\("\/api\/memory\/:jid", requireAuth/);
  assert.match(indexSrc, /app\.delete\("\/api\/memory\/:jid", requireAuth/);
  assert.match(indexSrc, /app\.get\("\/api\/backups", requireAdmin/);
  assert.match(indexSrc, /app\.post\("\/api\/backups\/run", requireAdmin/);
  // Backups are a whole-DB dump: never a tenant endpoint.
  assert.doesNotMatch(indexSrc, /app\.(get|post)\("\/api\/backups", requireAuth/);
  assert.match(indexSrc, /loadMemoryTenant\(owner, jid, tenantKeys\)/);
  assert.match(indexSrc, /maybeDisclose\(\{ db, owner, contact, replyText/);
  assert.match(indexSrc, /refreshMemoryAfterReply\(owner, jid\)/);
  assert.match(indexSrc, /startBackupScheduler\(/);
  assert.match(indexSrc, /whatsapp_logged_out/);
  // The cached tenantKeys object is copied, never mutated with memory.
  assert.doesNotMatch(indexSrc, /tenantKeys\.contactMemory\s*=/);
});

test("gpt.js injects contact memory as a system message in both persona paths", () => {
  assert.match(gptSrc, /contactMemory: typeof tenant\.contactMemory/);
  assert.match(gptSrc, /T\.contactMemory \? \[\{ role: "system", content: T\.contactMemory \}\]/);
  assert.match(gptSrc, /if \(T\.contactMemory\) \{\s*\n\s*openAiMessages\.push\(\{ role: "system", content: T\.contactMemory \}\)/);
});

test("db.js stores disclosure per user via the scoped key and indexes new collections", () => {
  assert.match(dbSrc, /scopedSettingsKey\("aiDisclosure", userId\)/);
  assert.match(dbSrc, /getAiDisclosure/);
  assert.match(dbSrc, /setAiDisclosure/);
  assert.match(dbSrc, /contact_memories/);
  assert.match(dbSrc, /tenant_contact_memory_unique/);
  assert.match(dbSrc, /owner_alerts/);
});

test("dashboard Settings has the disclosure toggle and alerts list", () => {
  assert.match(settingsSrc, /\/api\/settings\/disclosure/);
  assert.match(settingsSrc, /Show AI disclosure on first reply/);
  assert.match(settingsSrc, /\/api\/alerts/);
  assert.match(settingsSrc, /Recent alerts/);
});
