/**
 * Lead Webhooks & Integrations Dispatcher
 * Dispatches real-time events to external endpoints (Google Sheets, Telegram, Discord, CRM).
 */
const { getDb } = require("../db");

const SETTINGS_COLLECTION = "settings";

async function getWebhookConfig() {
  try {
    const db = await getDb();
    const doc = await db.collection(SETTINGS_COLLECTION).findOne({ key: "webhookConfig" });
    if (doc && doc.value) return doc.value;
    return {
      url: "",
      enabled: false,
      secret: "",
      events: ["new_lead", "keyword_triggered", "spam_flagged"],
    };
  } catch (err) {
    console.error("[Webhooks] getWebhookConfig error:", err.message);
    return { url: "", enabled: false, secret: "", events: [] };
  }
}

async function saveWebhookConfig(config) {
  try {
    const db = await getDb();
    const cleanConfig = {
      url: String(config.url || "").trim(),
      enabled: !!config.enabled,
      secret: String(config.secret || "").trim(),
      events: Array.isArray(config.events) ? config.events : ["new_lead"],
      updatedAt: new Date(),
    };

    await db.collection(SETTINGS_COLLECTION).updateOne(
      { key: "webhookConfig" },
      { $set: { key: "webhookConfig", value: cleanConfig } },
      { upsert: true }
    );
    return cleanConfig;
  } catch (err) {
    console.error("[Webhooks] saveWebhookConfig error:", err.message);
    throw err;
  }
}

/**
 * Dispatch an event to configured webhook URL (non-blocking)
 * @param {string} event e.g. "new_lead", "keyword_triggered", "spam_flagged"
 * @param {object} payload
 */
async function dispatchWebhook(event, payload) {
  try {
    const config = await getWebhookConfig();
    if (!config.enabled || !config.url) return;
    if (config.events && !config.events.includes(event)) return;

    const body = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      payload,
    });

    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "DevilsAI-Webhook/2.0",
    };
    if (config.secret) {
      headers["X-Webhook-Secret"] = config.secret;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    fetch(config.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    })
      .then((res) => {
        clearTimeout(timer);
        console.log(`[Webhooks] 🚀 Dispatched '${event}' to ${config.url} (Status: ${res.status})`);
      })
      .catch((err) => {
        clearTimeout(timer);
        console.warn(`[Webhooks] ⚠️ Failed dispatching '${event}':`, err.message);
      });
  } catch (err) {
    // Non-blocking
  }
}

module.exports = {
  getWebhookConfig,
  saveWebhookConfig,
  dispatchWebhook,
};
