// Live Feed: persona labels, persistence + per-owner trim, Q->A pairing,
// and wiring guards (pipeline emits + API + frontend listeners).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const liveFeed = require("../features/liveFeed");

// Minimal Mongo cursor surface: find().sort().skip().limit().project().toArray()
class FakeCollection {
  constructor() { this.docs = []; this.seq = 0; }
  async insertOne(doc) { this.docs.push({ ...doc, _id: `id${String(this.seq++).padStart(4, "0")}` }); return { insertedId: this.docs.at(-1)._id }; }
  find(filter) {
    let rows = this.docs.filter((d) => Object.entries(filter || {}).every(([k, v]) => {
      if (v && typeof v === "object" && "$in" in v) return v.$in.includes(d[k]);
      return d[k] === v;
    }));
    const cursor = {
      sort(spec) {
        const keys = Object.entries(spec);
        rows = [...rows].sort((a, b) => {
          for (const [key, dir] of keys) {
            if (a[key] < b[key]) return -dir;
            if (a[key] > b[key]) return dir;
          }
          return 0;
        });
        return cursor;
      },
      skip(n) { rows = rows.slice(n); return cursor; },
      limit(n) { rows = rows.slice(0, n); return cursor; },
      project(spec) {
        rows = rows.map((d) => Object.fromEntries(Object.entries(d).filter(([k]) => spec[k])));
        return cursor;
      },
      async toArray() { return rows; },
    };
    return cursor;
  }
  async deleteMany(filter) {
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => !(filter._id && filter._id.$in.includes(d._id)));
    return { deletedCount: before - this.docs.length };
  }
}

test("persona labels cover girl/boy/devil and fall back for custom keys", () => {
  assert.equal(liveFeed.personaLabel("girl"), "Annu");
  assert.equal(liveFeed.personaLabel("boy"), "Dhruv Mode");
  assert.equal(liveFeed.personaLabel("devil"), "Devil");
  assert.equal(liveFeed.personaLabel("shayar"), "Shayar");
  assert.equal(liveFeed.personaLabel(undefined), "Devil");
});

test("long feed text is truncated, never stored whole", () => {
  const e = liveFeed.buildFeedEvent({ jid: "x", direction: "in", text: "a".repeat(1500) });
  assert.equal(e.text.length, liveFeed.MAX_TEXT + 1);
  assert.ok(e.text.endsWith("…"));
});

test("feed persists per owner and trims to the newest 100", async () => {
  const col = new FakeCollection();
  for (let i = 0; i < 105; i++) {
    await liveFeed.recordFeedEvent(col, "owner1", { jid: "a@s.whatsapp.net", direction: "in", text: `q${i}` });
  }
  await liveFeed.recordFeedEvent(col, "owner2", { jid: "b@s.whatsapp.net", direction: "in", text: "other-owner" });
  const mine = await liveFeed.getFeedEvents(col, "owner1", 200);
  assert.equal(mine.length, 100);
  assert.equal(mine[0].text, "q104"); // newest first
  assert.equal(mine.at(-1).text, "q5"); // oldest 5 trimmed, none of owner2 leaked in
  assert.ok(!mine.some((e) => e.text === "other-owner"));
});

test("pairing groups a question with its reply and flags unanswered ones", async () => {
  const { pairFeedEvents } = await import("../client/src/lib/feedPairs.js");
  const newestFirst = [
    { jid: "a", direction: "out", kind: "ai", persona: "Devil", text: "r2", ts: 3 },
    { jid: "a", direction: "in", kind: "user", text: "q2", ts: 2 },
    { jid: "a", direction: "out", kind: "ai", persona: "Annu", text: "r1", ts: 1 },
    { jid: "a", direction: "in", kind: "user", text: "q1", ts: 0 },
    { jid: "b", direction: "in", kind: "user", text: "q3", ts: 4 },
  ];
  const pairs = pairFeedEvents(newestFirst);
  assert.equal(pairs.length, 3);
  assert.equal(pairs[0].question.text, "q3");
  assert.equal(pairs[0].reply, null); // pending, newest first
  assert.equal(pairs[1].question.text, "q2");
  assert.equal(pairs[1].reply.persona, "Devil");
  assert.equal(pairs[2].reply.persona, "Annu");
});

test("pipeline emits feed events and the API + UI are wired", () => {
  const indexSrc = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(indexSrc, /emitFeed\(owner, \{ jid, contactName: msg\.pushName/); // question
  assert.match(indexSrc, /kind: "ai", persona: liveFeed\.personaLabel\(contactMode\)/); // AI replies carry persona
  assert.match(indexSrc, /kind: "rule", persona: "Auto-Rule"/);
  assert.match(indexSrc, /kind: "donAway", persona: "Don Away"/);
  assert.match(indexSrc, /app\.get\("\/api\/live-feed", requireAuth/);
  const appSrc = fs.readFileSync(path.join(__dirname, "..", "client", "src", "App.jsx"), "utf8");
  assert.match(appSrc, /socket\.on\('feed'/);
  assert.match(appSrc, /fetch\('\/api\/live-feed'/);
  const chatSrc = fs.readFileSync(path.join(__dirname, "..", "client", "src", "components", "chat", "ChatWindow.jsx"), "utf8");
  assert.match(chatSrc, /pairFeedEvents\(feed\)/);
  assert.match(chatSrc, /No reply recorded yet/);
  assert.match(chatSrc, /pair\.reply\.persona/);
});
