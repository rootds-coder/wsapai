/**
 * Keyword Trigger & Automation Rules Engine
 * Evaluates incoming WhatsApp messages for keywords and triggers deterministic actions.
 */
const { getDb } = require("../db");

const RULES_COLLECTION = "auto_rules";

// Default initial rules if collection is empty
const INITIAL_RULES = [
  {
    id: "rule-pricing",
    name: "Pricing & Rate Inquiry",
    keywords: ["price", "pricing", "rate", "cost", "fees", "kitna", "package"],
    matchType: "contains",
    actionType: "reply",
    replyText: "Here are our packages:\n• Starter AI: ₹999/mo (1,000 msgs)\n• Pro AI: ₹2,499/mo (Unlimited + Voice)\n• Enterprise: Custom AI Agent & Dedicated RAG\n\nReply with 'PRO' to activate!",
    enabled: true,
    createdAt: new Date(),
  },
  // NOTE: this rule ships DISABLED. When enabled it fires before the
  // AI pipeline for any message containing "pay/payment/upi/…", so it
  // hijacked Phase 2 UPI-link tool requests (proven 2026-10-24: a
  // "payment link of 100 rs" test got this static reply instead of a
  // real link). Its old text also carried a hardcoded payee
  // (payments@jiopay) that is NOT the owner's configured UPI ID, and
  // promised screenshot verification that was never built — a contact
  // could have paid the wrong ID. Owners can re-enable it from Rules
  // after putting their own text in.
  {
    id: "rule-pay",
    name: "Payment / QR Code Trigger",
    keywords: ["pay", "payment", "upi", "qr", "gpay", "phonepe", "bank details"],
    matchType: "contains",
    actionType: "reply",
    replyText: "You can pay securely via UPI — please ask the assistant for your payment link.",
    enabled: false,
    createdAt: new Date(),
  },
  {
    id: "rule-stop",
    name: "Opt-Out / Human Handover",
    keywords: ["stop", "unsubscribe", "human", "agent", "call me", "talk to human"],
    matchType: "contains",
    actionType: "mode",
    targetMode: "manual",
    replyText: "AI auto-reply has been paused. A human agent will connect with you shortly.",
    enabled: true,
    createdAt: new Date(),
  },
];

async function listRules(owner = "admin") {
  const userId = owner || "admin";
  try {
    const db = await getDb();
    const rules = await db.collection(RULES_COLLECTION).find({ userId }).sort({ createdAt: -1 }).toArray();
    if (rules.length === 0) {
      // Seed this tenant's starter rules (each tenant gets their own copy)
      const seeded = INITIAL_RULES.map(r => ({ ...r, userId }));
      await db.collection(RULES_COLLECTION).insertMany(seeded);
      return seeded;
    }
    return rules;
  } catch (err) {
    console.error("[RulesEngine] listRules error:", err.message);
    return INITIAL_RULES;
  }
}

async function saveRule(rule, owner = "admin") {
  try {
    const db = await getDb();
    const id = rule.id || `rule-${Date.now()}`;
    const doc = {
      id,
      userId: owner || "admin",
      name: rule.name || "Untitled Rule",
      keywords: Array.isArray(rule.keywords)
        ? rule.keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
        : String(rule.keywords || "")
            .split(",")
            .map((k) => k.trim().toLowerCase())
            .filter(Boolean),
      matchType: rule.matchType || "contains",
      actionType: rule.actionType || "reply",
      replyText: rule.replyText || "",
      audioId: rule.audioId || null,
      targetMode: rule.targetMode || "auto",
      enabled: rule.enabled !== false,
      updatedAt: new Date(),
      createdAt: rule.createdAt ? new Date(rule.createdAt) : new Date(),
    };

    await db.collection(RULES_COLLECTION).updateOne({ id, userId: owner || "admin" }, { $set: doc }, { upsert: true });
    return doc;
  } catch (err) {
    console.error("[RulesEngine] saveRule error:", err.message);
    throw err;
  }
}

async function deleteRule(id) {
  try {
    const db = await getDb();
    await db.collection(RULES_COLLECTION).deleteOne({ id });
    return true;
  } catch (err) {
    console.error("[RulesEngine] deleteRule error:", err.message);
    return false;
  }
}

async function toggleRule(id, enabled) {
  try {
    const db = await getDb();
    await db.collection(RULES_COLLECTION).updateOne({ id }, { $set: { enabled: !!enabled, updatedAt: new Date() } });
    return true;
  } catch (err) {
    console.error("[RulesEngine] toggleRule error:", err.message);
    return false;
  }
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pure matcher: does one rule match this (already lowercased) text?
 * - "exact": the whole message must equal the keyword.
 * - "contains", multi-word keyword (phrase): substring match.
 * - "contains", single-word keyword: WORD-BOUNDARY match only.
 *   The previous implementation OR-ed a substring check on top of the
 *   word-boundary regex, which nullified it: "pay" matched "Payal" and
 *   "repay", so a customer's name could trigger the payment reply.
 */
function ruleMatches(rule, text) {
  if (!rule || !text) return false;
  for (const rawKw of rule.keywords || []) {
    const kw = String(rawKw || "").trim().toLowerCase();
    if (!kw) continue;
    if (rule.matchType === "exact") {
      if (text === kw) return true;
    } else if (kw.includes(" ")) {
      if (text.includes(kw)) return true;
    } else {
      if (new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(text)) return true;
    }
  }
  return false;
}

/**
 * Scan message text against all enabled rules
 * @param {string} messageText
 * @returns {Promise<object|null>} Matched rule or null
 */
async function matchRule(messageText, owner = "admin") {
  if (!messageText) return null;
  const text = String(messageText).toLowerCase().trim();
  const rules = await listRules(owner);

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (ruleMatches(rule, text)) return rule;
  }
  return null;
}

module.exports = {
  listRules,
  saveRule,
  deleteRule,
  toggleRule,
  matchRule,
  ruleMatches,
};
