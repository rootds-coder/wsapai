/**
 * Phase 1 — Optional AI disclosure.
 *
 * Contacts currently cannot tell they are talking to an AI persona.
 * That is a trust and compliance risk (AI-transparency rules are
 * arriving in the EU, India, and the US). This module adds an
 * OPT-IN, per-user setting — off by default, so no existing user's
 * behaviour changes unless they turn it on.
 *
 * When on, the first AI reply to each contact is prefixed with a
 * short, persona-neutral disclosure, and the contact is marked so
 * it is never repeated to the same person. The setting itself lives
 * in db.js (getAiDisclosure / setAiDisclosure, scoped per user,
 * same pattern as Don Away); the once-per-contact flag lives on
 * the contact doc (markAiDisclosureSent).
 */
const { getDb } = require("../db");

const DISCLOSURE_TEXT =
  "🤖 Note: main Devil AI hoon — is number ka AI assistant. Is chat me jawab AI de raha hai, asli insan nahi.";

/** Pure: does this contact still need the disclosure? */
function shouldDisclose({ enabled, contact }) {
  return !!enabled && !(contact && contact.aiDisclosureSent);
}

/** Pure: prefix the disclosure once; returns { text, disclosed }. */
function applyDisclosureText(replyText, { enabled, contact }) {
  if (!shouldDisclose({ enabled, contact })) return { text: replyText, disclosed: false };
  return { text: `${DISCLOSURE_TEXT}\n\n${replyText}`, disclosed: true };
}

async function markDisclosureSent(userId, jid) {
  if (!jid) return;
  try {
    const d = await getDb();
    await d.collection("contacts").updateOne(
      { jid, userId: userId || "admin" },
      { $set: { aiDisclosureSent: true } }
    );
  } catch (err) {
    console.error("[AiDisclosure] markDisclosureSent error:", err.message);
  }
}

/**
 * Full helper for the reply pipeline: reads the owner's setting,
 * prefixes the disclosure on the first reply per contact, and
 * marks the contact. Never throws and never blocks a reply.
 */
async function maybeDisclose({ db, owner, contact, replyText }) {
  try {
    if (!db || !db.MONGODB_URI || !replyText || !String(replyText).trim()) return { text: replyText, disclosed: false };
    const enabled = await db.getAiDisclosure(owner);
    const { text, disclosed } = applyDisclosureText(replyText, { enabled, contact });
    if (disclosed) await markDisclosureSent(owner, contact?.jid);
    return { text, disclosed };
  } catch (err) {
    console.error("[AiDisclosure] maybeDisclose error:", err.message);
    return { text: replyText, disclosed: false };
  }
}

module.exports = { DISCLOSURE_TEXT, shouldDisclose, applyDisclosureText, markDisclosureSent, maybeDisclose };
