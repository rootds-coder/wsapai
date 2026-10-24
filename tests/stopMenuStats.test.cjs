// Two tenant bugs found 2026-10-24, both from the same pattern:
// tenant-scoped code paths that only worked for admin.
//
// 1) STOP/MENU picker: direct-chat pause writes used the composite
//    in-memory key ("owner::jid") as the contacts jid, with no
//    userId filter. For a tenant, MENU's pendingModeSelection=true
//    landed on a junk doc, the real contact kept its old mode with
//    pending=false, and the next "1" was treated as a normal chat
//    in the OLD persona instead of a picker choice.
// 2) Overview stats: the dashboard fetched /api/admin/analytics
//    (requireAdmin, 403 for tenants) and only called it for admins,
//    so every tenant dashboard showed 0/0/0 forever.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(root, "index.js"), "utf8");
const appSrc = fs.readFileSync(path.join(root, "client", "src", "App.jsx"), "utf8");
const { parseDirectKey, commandOf, createDirectChatControl } = require("../features/directChatControl");

test("parseDirectKey splits tenant composite keys and keeps admin keys plain", () => {
  assert.deepStrictEqual(parseDirectKey("123@s.whatsapp.net"), { owner: "admin", jid: "123@s.whatsapp.net" });
  assert.deepStrictEqual(parseDirectKey("test-owner@example.com::9198@s.whatsapp.net"), { owner: "test-owner@example.com", jid: "9198@s.whatsapp.net" });
});

test("direct-chat DB write uses raw jid + owner userId, never the composite key", () => {
  assert.match(indexSrc, /parseDirectKey\(key\)/);
  assert.match(indexSrc, /updateOne\(\{ jid, userId: owner \}, \{ \$set: \{\s*mode: paused \? 'off' : 'devil', pendingModeSelection: !paused, userId: owner,/);
  assert.doesNotMatch(indexSrc, /updateOne\(\{ jid \}, \{ \$set: \{\s*mode: paused/);
});

test("MENU then '1' reaches the picker: stop/start commands and picker parsing", async () => {
  const written = [];
  const control = createDirectChatControl({
    read: async () => false,
    write: async (key, paused) => { written.push({ key, paused }); },
  });
  const key = "test-owner@example.com::9198@s.whatsapp.net";
  assert.strictEqual(await control.command(key, "stop"), "stop");
  assert.strictEqual(await control.command(key, "menu"), "start");
  // After MENU, the in-memory pause is lifted, so the next message
  // is allowed through to the picker (which the DB write now also
  // flags correctly — see the source test above).
  const ticket = await control.ticket(key);
  assert.strictEqual(control.allowed(ticket), true);
  assert.strictEqual(commandOf("menu"), "start");
  assert.strictEqual(commandOf("stop"), "stop");
  assert.deepStrictEqual(written, [{ key, paused: true }, { key, paused: false }]);
});

test("per-tenant analytics endpoint exists, is requireAuth (not requireAdmin), and scopes by caller", () => {
  assert.match(indexSrc, /app\.get\("\/api\/analytics", requireAuth/);
  assert.match(indexSrc, /countDocuments\(\{ userId: owner, timestamp: \{ \$gte: todayStart \} \}\)/);
  assert.match(indexSrc, /countDocuments\(\{ userId: owner \}\)/);
  assert.match(indexSrc, /totalUsers: 1, users: \[\]/);
  // Admin path is preserved (global overview), tenant path never
  // returns the users list of other accounts.
  assert.match(indexSrc, /if \(req\.isAdmin\) \{\s*const stats = await db\.getAnalyticsOverview\(\);/);
});

test("frontend fetches per-user analytics for everyone, not admin-only", () => {
  assert.match(appSrc, /fetch\('\/api\/analytics'/);
  assert.doesNotMatch(appSrc, /if \(currentUser\.isAdmin\) fetchAnalytics\(\)/);
});
