// ── Live Feed ─────────────────────────────────────────────────────────────
// The dashboard's "Live Feed" used to show only incoming user messages:
// AI replies never reached it (they were only saved to chat history), and
// it showed no persona at all — which is why verification needed
// screenshots. Now every question AND its reply is recorded, owner-scoped,
// with the persona that actually replied, pushed live over the owner's
// socket room, and persisted so a refresh (or a server-side check) sees
// the same feed. Nothing here ever throws into the reply pipeline:
// index.js wraps emitFeed in try/catch, and this module itself is pure
// except for the two collection helpers below.
"use strict";

const FEED_LIMIT = 100;
const MAX_TEXT = 1000;
const COLLECTION = "live_feed";

const PERSONA_LABELS = {
  girl: "Annu",
  boy: "Dhruv Mode",
  devil: "Devil",
};

/** Human label for the persona mode that replied. Custom persona keys
 *  fall back to a capitalized key so they never render as a bare mode. */
function personaLabel(mode) {
  if (PERSONA_LABELS[mode]) return PERSONA_LABELS[mode];
  if (typeof mode === "string" && mode.trim()) {
    const m = mode.trim();
    return m.charAt(0).toUpperCase() + m.slice(1);
  }
  return "Devil";
}

function truncateText(text) {
  if (text === null || text === undefined) return "";
  const s = String(text);
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + "…" : s;
}

/** Normalize one feed event. direction: "in" (user) | "out" (bot).
 *  kind: "user" | "ai" | "rule" | "donAway" | "system". */
function buildFeedEvent(fields) {
  const f = fields || {};
  return {
    jid: String(f.jid || ""),
    contactName: String(f.contactName || ""),
    direction: f.direction === "out" ? "out" : "in",
    kind: f.kind || (f.direction === "out" ? "ai" : "user"),
    text: truncateText(f.text || ""),
    persona: f.persona || null,
    voice: !!f.voice,
    ts: new Date(),
  };
}

/** Insert one event for an owner, then trim that owner's feed to the
 *  newest FEED_LIMIT events. Works with a real Mongo collection and
 *  with the fake collection used in tests (same cursor surface). */
async function recordFeedEvent(collection, owner, event) {
  const doc = { owner, ...buildFeedEvent(event) };
  await collection.insertOne(doc);
  // _id is the tiebreaker: two events in the same millisecond must still
  // trim oldest-first (ObjectIds are insertion-ordered). Without it, a
  // same-ms burst could trim the newest events instead.
  const excess = await collection
    .find({ owner })
    .sort({ ts: -1, _id: -1 })
    .skip(FEED_LIMIT)
    .project({ _id: 1 })
    .toArray();
  if (excess.length) {
    await collection.deleteMany({ _id: { $in: excess.map((e) => e._id) } });
  }
  return doc;
}

/** Newest-first events for one owner. Limit clamped to 1..FEED_LIMIT. */
async function getFeedEvents(collection, owner, limit) {
  const n = Math.min(FEED_LIMIT, Math.max(1, parseInt(limit, 10) || 50));
  return collection
    .find({ owner })
    .sort({ ts: -1, _id: -1 })
    .limit(n)
    .toArray();
}

module.exports = {
  COLLECTION,
  FEED_LIMIT,
  MAX_TEXT,
  PERSONA_LABELS,
  personaLabel,
  truncateText,
  buildFeedEvent,
  recordFeedEvent,
  getFeedEvents,
};
