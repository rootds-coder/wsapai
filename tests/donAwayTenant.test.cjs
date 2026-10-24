// Per-user Don Away (2026-10-24): a tenant saw the Don Away
// toggle in the sidebar, but (a) POST /api/don-away was
// requireAdmin, so the toggle silently failed, (b) the pipeline
// only ran Don Away for owner === "admin", so tenants never got
// the notice at all, and (c) the away text + voice note card in
// Settings was Master-Admin-only and all three values lived under
// single global keys — a tenant could neither see nor change
// their own away audio, and any change would have overwritten
// the admin's for every account.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const dbSrc = fs.readFileSync(path.join(root, "db.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.js"), "utf8");
const settingsSrc = fs.readFileSync(path.join(root, "client", "src", "components", "dashboard", "Settings.jsx"), "utf8");
const appSrc = fs.readFileSync(path.join(root, "client", "src", "App.jsx"), "utf8");
const { scopedSettingsKey } = require("../db");

test("settings keys stay legacy for admin and are suffixed per tenant", () => {
  assert.strictEqual(scopedSettingsKey("defaultAudio", "admin"), "defaultAudio");
  assert.strictEqual(scopedSettingsKey("defaultAudio", undefined), "defaultAudio");
  assert.strictEqual(scopedSettingsKey("defaultAudio", "test-owner@example.com"), "defaultAudio:test-owner@example.com");
  assert.strictEqual(scopedSettingsKey("donAwayMode", "someone@x.com"), "donAwayMode:someone@x.com");
  assert.notStrictEqual(
    scopedSettingsKey("defaultAudio", "a@x.com"),
    scopedSettingsKey("defaultAudio", "b@x.com")
  );
});

test("Don Away mode, message, and audio are all read/written through the scoped key", () => {
  assert.match(dbSrc, /scopedSettingsKey\("donAwayMode", userId\)/);
  assert.match(dbSrc, /scopedSettingsKey\("defaultMessage", userId\)/);
  assert.match(dbSrc, /scopedSettingsKey\("defaultAudio", userId\)/);
});

test("Don Away endpoints and audio endpoints are requireAuth and per-user, not requireAdmin", () => {
  assert.match(indexSrc, /app\.post\("\/api\/don-away", requireAuth/);
  assert.match(indexSrc, /setDonAwayMode\(enabled, req\.userId\)/);
  assert.match(indexSrc, /tenantEmit\(req\.userId, "donAwayStatus"/);
  assert.match(indexSrc, /app\.post\("\/api\/settings\/defaults", requireAuth/);
  assert.match(indexSrc, /updateDefaultMessage\(defaultMessage, req\.userId\)/);
  assert.match(indexSrc, /app\.post\("\/api\/settings\/default-audio", requireAuth/);
  assert.match(indexSrc, /updateDefaultAudio\(\{ base64Data, mimeType, filename \}, req\.userId\)/);
  assert.match(indexSrc, /app\.get\("\/api\/settings\/default-audio", requireAuth/);
  assert.match(indexSrc, /app\.delete\("\/api\/settings\/default-audio", requireAuth/);
  assert.doesNotMatch(indexSrc, /app\.post\("\/api\/don-away", requireAdmin/);
  assert.doesNotMatch(indexSrc, /app\.post\("\/api\/settings\/default-audio", requireAdmin/);
});

test("pipeline runs Don Away for any owner and the notice uses that owner's text/audio", () => {
  assert.doesNotMatch(indexSrc, /owner === "admin" && db\.MONGODB_URI \? await db\.getDonAwayMode/);
  assert.match(indexSrc, /const isDonAway = db\.MONGODB_URI \? await db\.getDonAwayMode\(owner\) : false;/);
  assert.match(indexSrc, /sendDonAwayNotice\(replySock, jid, msg\.pushName \|\| "", owner\)/);
  assert.match(indexSrc, /getDefaultSettings\(owner\)/);
  assert.match(indexSrc, /getDefaultAudio\(owner\)/);
});

test("Settings away card is no longer admin-gated, and the toggle reverts on failure", () => {
  assert.doesNotMatch(settingsSrc, /Default Message & Voice Note Card \(Master Admin Only\)/);
  assert.match(settingsSrc, /Away Message & Voice Note/);
  assert.match(appSrc, /if \(!res\.ok\) setDonAwayMode\(!next\)/);
});
