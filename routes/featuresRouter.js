/**
 * Features API Router
 * Houses endpoints for Rules, Voice Vault, Security Shield, Audience Tags, Analytics & Webhooks.
 */
const express = require("express");
const multer = require("multer");
const rulesEngine = require("../features/rulesEngine");
const voiceVault = require("../features/voiceVault");
const securityShield = require("../features/securityShield");
const audienceTags = require("../features/audienceTags");
const analyticsEngine = require("../features/analyticsEngine");
const webhooks = require("../features/webhooks");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});

const requireAdminRole = (req, res, next) => {
  if (req.isAdmin || req.userRole === "admin" || req.userId === "admin" || (req.session && (req.session.role === "admin" || req.session.username === "admin"))) {
    return next();
  }
  return res.status(403).json({ ok: false, error: "Access denied. Master Admin privileges required." });
};

// ── 1. Keyword Automation Rules ──────────────────────────────────────────────
router.get("/rules", async (req, res) => {
  try {
    const rules = await rulesEngine.listRules(req.userId);
    res.json({ ok: true, rules });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/rules", async (req, res) => {
  try {
    const rule = await rulesEngine.saveRule(req.body, req.userId);
    res.json({ ok: true, rule });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/rules/:id", async (req, res) => {
  try {
    const success = await rulesEngine.deleteRule(req.params.id, req.userId);
    res.json({ ok: success });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/rules/:id/toggle", async (req, res) => {
  try {
    const success = await rulesEngine.toggleRule(req.params.id, req.body.enabled, req.userId);
    res.json({ ok: success });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── 2. Voice Vault & Media Library ───────────────────────────────────────────
// Voice Vault is master-only (its POST/DELETE already were);
// the GETs used to let any tenant list and stream the admin's
// voice recordings.
router.get("/vault", requireAdminRole, async (req, res) => {
  try {
    const items = await voiceVault.listVoiceVault();
    res.json({ ok: true, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/vault", requireAdminRole, upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "Audio file is required" });
    }
    const base64Data = req.file.buffer.toString("base64");
    const item = await voiceVault.saveVoiceVaultItem({
      title: req.body.title || req.file.originalname,
      tag: req.body.tag || "general",
      base64Data,
      mimeType: req.file.mimetype || "audio/mpeg",
      filename: req.file.originalname,
      size: req.file.size,
    });
    res.json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/vault/:id/stream", requireAdminRole, async (req, res) => {
  try {
    const item = await voiceVault.getVoiceVaultItem(req.params.id);
    if (!item || !item.buffer) {
      return res.status(404).send("Audio not found");
    }
    res.setHeader("Content-Type", item.mimeType || "audio/mpeg");
    res.setHeader("Content-Length", item.buffer.length);
    res.setHeader("Accept-Ranges", "bytes");
    res.send(item.buffer);
  } catch (err) {
    res.status(500).send("Error streaming audio");
  }
});

router.delete("/vault/:id", requireAdminRole, async (req, res) => {
  try {
    const success = await voiceVault.deleteVoiceVaultItem(req.params.id);
    res.json({ ok: success });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── 3. Security & Scam Shield Radar ──────────────────────────────────────────
router.get("/security/alerts", async (req, res) => {
  try {
    const alerts = await securityShield.listSecurityAlerts(req.userId);
    const blocked = await securityShield.listBlockedContacts(req.userId);
    res.json({ ok: true, alerts, blocked });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/security/alerts/:id", async (req, res) => {
  try {
    const success = await securityShield.dismissAlert(req.params.id, req.userId);
    res.json({ ok: success });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/security/block", async (req, res) => {
  try {
    const { jid, reason } = req.body;
    if (!jid) return res.status(400).json({ ok: false, error: "JID required" });
    const success = await securityShield.blockContact(jid, reason, req.userId);
    res.json({ ok: success });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/security/unblock", async (req, res) => {
  try {
    const { jid } = req.body;
    if (!jid) return res.status(400).json({ ok: false, error: "JID required" });
    const success = await securityShield.unblockContact(jid, req.userId);
    res.json({ ok: success });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── 4. Smart Audience Tags ───────────────────────────────────────────────────
router.post("/contacts/:jid/tags", async (req, res) => {
  try {
    const { tags } = req.body;
    const success = await audienceTags.updateContactTags(req.params.jid, tags, req.userId);
    res.json({ ok: success });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/tags/presets", (req, res) => {
  res.json({ ok: true, presets: audienceTags.getPresetTags() });
});

// ── 5. Advanced Analytics & 24h Heatmap ──────────────────────────────────────
router.get("/analytics/hourly", requireAdminRole, async (req, res) => {
  try {
    const hourly = await analyticsEngine.getHourlyActivity();
    const personas = await analyticsEngine.getPersonaDistribution();
    res.json({ ok: true, hourly, personas });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── 6. Outbound Lead Webhooks ────────────────────────────────────────────────
router.get("/webhooks", requireAdminRole, async (req, res) => {
  try {
    const config = await webhooks.getWebhookConfig();
    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/webhooks", requireAdminRole, async (req, res) => {
  try {
    const config = await webhooks.saveWebhookConfig(req.body);
    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const geminiEngine = require("../features/geminiEngine");

// ── 7. Google Gemini Free Tier Engine ─────────────────────────────────────────
router.get("/gemini/status", async (req, res) => {
  try {
    if (!req.isAdmin && req.userId !== "admin") {
      const db = require("../db");
      const user = await db.getUserByUsername(req.userId);
      const key = user?.userGeminiKey || "";
      return res.json({
        ok: true,
        hasKey: !!key,
        maskedKey: key ? `${key.slice(0, 6)}...${key.slice(-4)}` : null,
      });
    }
    const key = await geminiEngine.getGeminiApiKey();
    res.json({
      ok: true,
      hasKey: !!key,
      maskedKey: key ? `${key.slice(0, 6)}...${key.slice(-4)}` : null,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/gemini/key", async (req, res) => {
  try {
    const { key } = req.body;
    if (!req.isAdmin && req.userId !== "admin") {
      // Tenant: stored on their own account; powers only their own bot.
      const db = require("../db");
      await db.updateUserGeminiKey(req.userId, String(key || "").trim());
      return res.json({ ok: true });
    }
    const success = await geminiEngine.saveGeminiApiKey(key);
    res.json({ ok: success });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/gemini/key", async (req, res) => {
  try {
    if (!req.isAdmin && req.userId !== "admin") {
      const db = require("../db");
      await db.updateUserGeminiKey(req.userId, "");
      return res.json({ ok: true });
    }
    const success = await geminiEngine.saveGeminiApiKey("");
    res.json({ ok: success });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
