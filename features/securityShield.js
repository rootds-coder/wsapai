/**
 * Scam, Phishing & Spam Shield Radar
 * Autonomous threat detector that monitors incoming WhatsApp traffic for fraud, phishing, and abuse.
 */
const { getDb } = require("../db");

const ALERTS_COLLECTION = "spam_shield";
const BLOCKED_COLLECTION = "blocked_contacts";

// High-risk trigger patterns
const PHISHING_REGEX = /(bit\.ly|tinyurl\.com|t\.me\/|wa\.me\/settings|free-gift|crypto-earn|apk-download|lottery|winner-prize)/i;
const SCAM_PATTERNS = [
  { pattern: /\b(send otp|share otp|otp batao|verification code)\b/i, reason: "Credential / OTP Harvesting Attempt", level: "high" },
  { pattern: /\b(bank account block|kyc expired|pan link urgently|sim deactivation)\b/i, reason: "Social Engineering / Fake KYC Phishing", level: "high" },
  { pattern: /\b(crypto investment|daily 5000 profit|telegram task money|part time job 10000)\b/i, reason: "Financial Task / Investment Scam", level: "medium" },
  { pattern: /\b(free iphone|claim bonus now|lucky draw won)\b/i, reason: "Phishing Lottery Bait", level: "medium" },
];

// Flood tracking buffer in memory
const messageFloodTracker = new Map();
// Alert dedupe: one stored alert per (jid, reason) per 10 minutes.
// Without this, a flood attack also floods the alerts collection —
// one DB write per malicious message.
const recentAlertKeys = new Map();
const ALERT_DEDUPE_MS = 10 * 60 * 1000;

function pruneTrackers(now) {
  if (messageFloodTracker.size > 500) {
    for (const [k, arr] of messageFloodTracker) {
      if (!arr.length || now - arr[arr.length - 1] > 60000) messageFloodTracker.delete(k);
    }
  }
  if (recentAlertKeys.size > 500) {
    for (const [k, t] of recentAlertKeys) {
      if (now - t > ALERT_DEDUPE_MS) recentAlertKeys.delete(k);
    }
  }
}

/**
 * Pure text threat detection (no DB, no flood state).
 * @returns {{reason: string, threatLevel: string}|null}
 */
function detectThreatText(text) {
  const cleanText = String(text || "").toLowerCase();
  if (!cleanText) return null;
  if (PHISHING_REGEX.test(cleanText)) {
    return { reason: "Suspicious / Masked Shortlink Detected", threatLevel: "medium" };
  }
  for (const { pattern, reason, level } of SCAM_PATTERNS) {
    if (pattern.test(cleanText)) return { reason, threatLevel: level };
  }
  return null;
}

async function inspectMessage({ jid, name, text, owner = "admin" }) {
  if (!text || !jid) return { safe: true };

  // 1. Check if already blocked
  if (await isBlocked(jid, owner)) {
    return { safe: false, reason: "Contact is blocked", threatLevel: "blocked" };
  }

  // 2. Flood detection (e.g. > 8 messages within 10 seconds)
  const now = Date.now();
  pruneTrackers(now);
  const floodKey = `${owner}::${jid}`;
  const history = messageFloodTracker.get(floodKey) || [];
  const recent = history.filter((t) => now - t < 10000);
  recent.push(now);
  messageFloodTracker.set(floodKey, recent);

  if (recent.length > 8) {
    const alert = {
      id: `alert-${Date.now()}`,
      owner: owner || "admin",
      jid,
      name: name || jid.split("@")[0],
      text: text.slice(0, 300),
      reason: `Message Flood / DOS Attack (${recent.length} msgs/10s)`,
      threatLevel: "high",
      timestamp: new Date(),
      status: "flagged",
    };
    await recordAlertDeduped(alert);
    return { safe: false, threatLevel: "high", alert };
  }

  // 3 + 4. Phishing URL & scam pattern checks
  const threat = detectThreatText(text);
  if (threat) {
    const alert = {
      id: `alert-${Date.now()}`,
      owner: owner || "admin",
      jid,
      name: name || jid.split("@")[0],
      text: text.slice(0, 300),
      reason: threat.reason,
      threatLevel: threat.threatLevel,
      timestamp: new Date(),
      status: "flagged",
    };
    await recordAlertDeduped(alert);
    return { safe: false, threatLevel: threat.threatLevel, alert };
  }

  return { safe: true };
}

async function recordAlertDeduped(alert) {
  const key = `${alert.owner || "admin"}|${alert.jid}|${alert.reason}`;
  const last = recentAlertKeys.get(key) || 0;
  if (Date.now() - last < ALERT_DEDUPE_MS) return;
  recentAlertKeys.set(key, Date.now());
  await recordAlert(alert);
}

async function recordAlert(alert) {
  try {
    const db = await getDb();
    await db.collection(ALERTS_COLLECTION).insertOne(alert);
    console.warn(`[SecurityShield] 🚨 Threat flagged from ${alert.jid}: ${alert.reason}`);
  } catch (err) {
    console.error("[SecurityShield] recordAlert error:", err.message);
  }
}

async function listSecurityAlerts(owner = "admin") {
  try {
    const db = await getDb();
    return await db.collection(ALERTS_COLLECTION).find({ owner: owner || "admin" }).sort({ timestamp: -1 }).limit(50).toArray();
  } catch (err) {
    console.error("[SecurityShield] listSecurityAlerts error:", err.message);
    return [];
  }
}

async function dismissAlert(id, owner = "admin") {
  try {
    const db = await getDb();
    await db.collection(ALERTS_COLLECTION).deleteOne({ id, owner: owner || "admin" });
    return true;
  } catch (err) {
    console.error("[SecurityShield] dismissAlert error:", err.message);
    return false;
  }
}

async function blockContact(jid, reason = "Spam / Fraud violation", owner = "admin") {
  try {
    const db = await getDb();
    await db.collection(BLOCKED_COLLECTION).updateOne(
      { jid, owner: owner || "admin" },
      { $set: { jid, owner: owner || "admin", reason, blockedAt: new Date() } },
      { upsert: true }
    );
    console.log(`[SecurityShield] 🚫 Blocked contact ${jid} (${reason})`);
    return true;
  } catch (err) {
    console.error("[SecurityShield] blockContact error:", err.message);
    return false;
  }
}

async function unblockContact(jid, owner = "admin") {
  try {
    const db = await getDb();
    await db.collection(BLOCKED_COLLECTION).deleteOne({ jid, owner: owner || "admin" });
    console.log(`[SecurityShield] 🟢 Unblocked contact ${jid}`);
    return true;
  } catch (err) {
    console.error("[SecurityShield] unblockContact error:", err.message);
    return false;
  }
}

async function isBlocked(jid, owner = "admin") {
  if (!jid) return false;
  try {
    const db = await getDb();
    const doc = await db.collection(BLOCKED_COLLECTION).findOne({ jid, owner: owner || "admin" });
    return !!doc;
  } catch (err) {
    return false;
  }
}

async function listBlockedContacts(owner = "admin") {
  try {
    const db = await getDb();
    return await db.collection(BLOCKED_COLLECTION).find({ owner: owner || "admin" }).sort({ blockedAt: -1 }).toArray();
  } catch (err) {
    return [];
  }
}

module.exports = {
  inspectMessage,
  detectThreatText,
  listSecurityAlerts,
  dismissAlert,
  blockContact,
  unblockContact,
  isBlocked,
  listBlockedContacts,
};
