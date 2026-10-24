/**
 * Phase 1 — Alerts.
 *
 * Previously a WhatsApp logout was only visible in server logs:
 * the owner found out when a contact complained. Alerts are now
 * stored per owner (tenants see only their own), emitted live to
 * the dashboard, and emailed when the owner has an email address
 * and mail is configured. Email failure never blocks an alert —
 * the stored record is the source of truth.
 */
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const mailer = require("./mailer");

const ALERT_COLLECTION = "alerts";
const ALERT_TYPES = ["whatsapp_disconnected", "whatsapp_logged_out", "backup_failed", "backup_done"];

function isEmailLike(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Pure: email subject/body for an alert. */
function formatAlertEmail(alert) {
  return {
    subject: `[Devil AI] ${alert.title}`,
    text:
      `${alert.title}\n\n` +
      `Account: ${alert.owner}\n` +
      `Type: ${alert.type}\n` +
      `Time: ${new Date(alert.createdAt).toISOString()}\n\n` +
      `${alert.detail || ""}\n`,
  };
}

async function createAlert({ owner, type, title, detail }) {
  if (!ALERT_TYPES.includes(type)) throw new Error(`Unknown alert type: ${type}`);
  const alert = {
    owner: owner || "admin",
    type,
    title: title || type,
    detail: detail || "",
    read: false,
    createdAt: new Date(),
  };
  try {
    const d = await getDb();
    const result = await d.collection(ALERT_COLLECTION).insertOne(alert);
    alert._id = result.insertedId;
  } catch (err) {
    console.error("[Alerts] createAlert storage error:", err.message);
    return { ...alert, stored: false };
  }
  // Best-effort email: only when the owner is an email address
  // (tenants) and mail is actually configured. The admin account
  // has no email on file, so its alerts stay in-dashboard + live.
  try {
    if (isEmailLike(alert.owner) && (await mailer.isMailConfigured())) {
      const email = formatAlertEmail(alert);
      await mailer.sendMail({ to: alert.owner, subject: email.subject, text: email.text });
    }
  } catch (err) {
    console.error("[Alerts] email failed (alert still stored):", err.message);
  }
  return { ...alert, stored: true };
}

async function listAlerts(owner, limit = 20) {
  try {
    const d = await getDb();
    return await d
      .collection(ALERT_COLLECTION)
      .find({ owner: owner || "admin" })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  } catch (err) {
    console.error("[Alerts] listAlerts error:", err.message);
    return [];
  }
}

async function markAlertRead(owner, id) {
  if (!id) return false;
  try {
    const d = await getDb();
    const result = await d.collection(ALERT_COLLECTION).updateOne(
      { _id: new ObjectId(id), owner: owner || "admin" },
      { $set: { read: true } }
    );
    return result.matchedCount > 0;
  } catch (err) {
    console.error("[Alerts] markAlertRead error:", err.message);
    return false;
  }
}

module.exports = { ALERT_COLLECTION, ALERT_TYPES, isEmailLike, formatAlertEmail, createAlert, listAlerts, markAlertRead };
