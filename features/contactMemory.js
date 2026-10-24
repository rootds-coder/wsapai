/**
 * Phase 1 — Per-contact long-term memory.
 *
 * Problem: the bot only saw the last 12 messages, so anything older
 * (a name, a preference, a promise made last week) was forgotten and
 * sometimes re-invented. This module keeps a small, durable memory
 * per contact, per tenant:
 *
 *   - `summary`: a rolling summary of older conversation, refreshed
 *     by the tenant's own AI providers every SUMMARY_EVERY new
 *     messages (never on every message, to keep cost flat).
 *   - `facts`: short user-stated facts captured deterministically
 *     (name / likes). Conservative patterns only — a fact is stored
 *     only when the user states it explicitly.
 *
 * Everything is tenant-scoped (userId + jid). Memory is injected
 * into the reply prompt by gpt.js via `tenant.contactMemory`; this
 * module never touches the reply pipeline itself.
 */
const { getDb } = require("../db");

const MEMORY_COLLECTION = "contact_memories";
const SUMMARY_EVERY = 25; // new messages before a re-summary
const MAX_FACTS = 20;
const MAX_SUMMARY_CHARS = 800;

// Conservative explicit-statement patterns (Hinglish + English).
// Deliberately narrow: "mera naam X hai" / "my name is X" /
// "mujhe X pasand hai" / "i like X". Anything vaguer is left to
// the rolling summary instead of being stored as a hard fact.
const FACT_PATTERNS = [
  { re: /mer[ai] naam\s+([A-Za-z][\w .'-]{1,40}?)\s+hai\b/i, kind: "name" },
  { re: /\bmy name is\s+([A-Za-z][\w .'-]{1,40}?)(?:\.|$)/i, kind: "name" },
  { re: /mujhe\s+(.+?)\s+pasand hai\b/i, kind: "like" },
  { re: /\bi like\s+(.+?)(?:\.|$)/i, kind: "like" },
];

function cleanFactValue(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Pure: extract explicit facts from one user message.
 * Returns an array of short fact strings (possibly empty).
 */
function extractFacts(text) {
  if (!text || typeof text !== "string") return [];
  const facts = [];
  for (const { re, kind } of FACT_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const value = cleanFactValue(m[1]);
    if (!value || value.length < 2) continue;
    facts.push(kind === "name" ? `Name: ${value}` : `Likes: ${value}`);
  }
  return [...new Set(facts)];
}

/**
 * Pure: render a stored memory doc as a prompt block.
 * Returns "" when there is nothing worth remembering.
 */
function formatMemoryForPrompt(memory) {
  if (!memory) return "";
  const parts = [];
  if (memory.summary) parts.push(`Summary: ${memory.summary}`);
  const facts = (memory.facts || []).map((f) => (typeof f === "string" ? f : f.text)).filter(Boolean);
  if (facts.length > 0) parts.push(`Known facts: ${facts.join("; ")}`);
  if (parts.length === 0) return "";
  return (
    "Long-term memory about this contact (from earlier conversations — " +
    "trust it over guessing, and never claim to remember something not listed here):\n" +
    parts.join("\n")
  );
}

/**
 * Pure: should a re-summary run, given the stored memory and the
 * current total message count for this contact?
 */
function shouldSummarize(memory, totalMessages) {
  if (!totalMessages || totalMessages < SUMMARY_EVERY) return false;
  const doneUpTo = memory?.messagesSummarizedUpTo || 0;
  return totalMessages - doneUpTo >= SUMMARY_EVERY;
}

async function getMemory(userId, jid) {
  if (!jid) return null;
  try {
    const d = await getDb();
    return await d.collection(MEMORY_COLLECTION).findOne({ userId: userId || "admin", jid });
  } catch (err) {
    console.error("[ContactMemory] getMemory error:", err.message);
    return null;
  }
}

/** Prompt-ready memory text for one contact ("" when none). */
async function getMemoryText(userId, jid) {
  const memory = await getMemory(userId, jid);
  return formatMemoryForPrompt(memory);
}

async function addFacts(userId, jid, facts) {
  if (!jid || !facts || facts.length === 0) return;
  try {
    const d = await getDb();
    const col = d.collection(MEMORY_COLLECTION);
    const existing = await col.findOne({ userId: userId || "admin", jid });
    const seen = new Set((existing?.facts || []).map((f) => (typeof f === "string" ? f : f.text)));
    const fresh = facts.filter((f) => f && !seen.has(f)).map((f) => ({ text: f, createdAt: new Date() }));
    if (fresh.length === 0) return;
    const merged = [...(existing?.facts || []), ...fresh].slice(-MAX_FACTS);
    await col.updateOne(
      { userId: userId || "admin", jid },
      { $set: { facts: merged, updatedAt: new Date() }, $setOnInsert: { userId: userId || "admin", jid, createdAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    console.error("[ContactMemory] addFacts error:", err.message);
  }
}

async function clearMemory(userId, jid) {
  if (!jid) return false;
  try {
    const d = await getDb();
    await d.collection(MEMORY_COLLECTION).deleteOne({ userId: userId || "admin", jid });
    return true;
  } catch (err) {
    console.error("[ContactMemory] clearMemory error:", err.message);
    return false;
  }
}

/**
 * Refresh the rolling summary when enough new messages arrived.
 * `summarize` is injected by the caller (the tenant's own provider
 * engine) so this module never depends on the reply pipeline.
 * Never throws: a failed summary just means "try again later" —
 * the old memory stays intact.
 */
async function maybeSummarize(userId, jid, summarize) {
  if (!jid || typeof summarize !== "function") return { skipped: true };
  try {
    const d = await getDb();
    const total = await d.collection("message_history").countDocuments({ userId: userId || "admin", jid });
    const memory = await getMemory(userId, jid);
    if (!shouldSummarize(memory, total)) return { skipped: true };
    const recent = await d
      .collection("message_history")
      .find({ userId: userId || "admin", jid })
      .sort({ timestamp: -1 })
      .limit(30)
      .toArray();
    const transcript = recent
      .reverse()
      .map((m) => `${m.role === "assistant" ? "Bot" : "User"}: ${m.body}`)
      .join("\n")
      .slice(0, 6000);
    const previous = memory?.summary ? `Previous summary (keep what is still true, drop what changed):\n${memory.summary}\n\n` : "";
    const summary = await summarize(
      `${previous}Summarize the durable facts about this contact from the conversation below ` +
        `in at most ${MAX_SUMMARY_CHARS} characters: name, preferences, ongoing topics, promises made. ` +
        `No greetings, no speculation, no facts not in the transcript.\n\n${transcript}`
    );
    const clean = String(summary || "").trim().slice(0, MAX_SUMMARY_CHARS);
    if (!clean) return { skipped: true };
    await d.collection(MEMORY_COLLECTION).updateOne(
      { userId: userId || "admin", jid },
      {
        $set: { summary: clean, messagesSummarizedUpTo: total, updatedAt: new Date() },
        $setOnInsert: { userId: userId || "admin", jid, facts: [], createdAt: new Date() },
      },
      { upsert: true }
    );
    return { summarized: true, total };
  } catch (err) {
    console.error("[ContactMemory] maybeSummarize error:", err.message);
    return { skipped: true, error: err.message };
  }
}

module.exports = {
  MEMORY_COLLECTION,
  SUMMARY_EVERY,
  MAX_FACTS,
  extractFacts,
  formatMemoryForPrompt,
  shouldSummarize,
  getMemory,
  getMemoryText,
  addFacts,
  clearMemory,
  maybeSummarize,
};
