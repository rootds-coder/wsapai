/**
 * MongoDB connection and data access with logging.
 * Uses MONGODB_URI from .env
 */
require("dotenv").config();
const { MongoClient } = require("mongodb");
const crypto = require("crypto");
const { promisify } = require("util");
const scryptAsync = promisify(crypto.scrypt);

// --- Password hashing (scrypt, salted) ---
// Stored format: scrypt$<salt base64>$<derived key base64>
// Legacy unsalted SHA-256 hashes are still verified once and then
// transparently upgraded on successful login (see authenticateUser).
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(String(password), salt, 64);
  return `scrypt$${salt.toString("base64")}$${Buffer.from(key).toString("base64")}`;
}
async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return { ok: false, legacy: false };
  if (stored.startsWith("scrypt$")) {
    const [, saltB64, keyB64] = stored.split("$");
    if (!saltB64 || !keyB64) return { ok: false, legacy: false };
    const expected = Buffer.from(keyB64, "base64");
    const actual = Buffer.from(await scryptAsync(String(password), Buffer.from(saltB64, "base64"), expected.length));
    return { ok: expected.length === actual.length && crypto.timingSafeEqual(expected, actual), legacy: false };
  }
  // Legacy SHA-256 (unsalted) — verify only to allow migration.
  const legacyHash = crypto.createHash("sha256").update(String(password).trim()).digest("hex");
  const a = Buffer.from(legacyHash); const b = Buffer.from(stored);
  return { ok: a.length === b.length && crypto.timingSafeEqual(a, b), legacy: true };
}

const MONGODB_URI = process.env.MONGODB_URI;
let DB_NAME = "open_truly_chat";

if (MONGODB_URI) {
  try {
    const url = new URL(MONGODB_URI);
    const dbPath = url.pathname.replace(/^\//, "");
    if (dbPath) DB_NAME = dbPath;
  } catch {
    // Fallback for mongodb+srv and other non-standard URIs
    const parts = MONGODB_URI.split("/");
    const lastPart = parts[parts.length - 1];
    const dbPath = lastPart ? lastPart.split("?")[0] : null;
    if (dbPath) DB_NAME = dbPath;
  }
}

const CHATS_COLLECTION = "chats";
const CONTACTS_COLLECTION = "contacts";
const MESSAGE_HISTORY_COLLECTION = "message_history";
const SETTINGS_COLLECTION = "settings";
const USERS_COLLECTION = "users";
const ANALYTICS_COLLECTION = "analytics";
const BROADCASTS_COLLECTION = "broadcasts";
const CUSTOM_PERSONAS_COLLECTION = "custom_personas";
const MEDIA_ASSETS_COLLECTION = "media_assets";
const DRIP_RULES_COLLECTION = "drip_rules";

const LOG_PREFIX = "[Mongo]";

function log(op, collection, detail = "") {
  console.log(`${LOG_PREFIX} ${op} → ${collection}${detail ? ` ${detail}` : ""}`);
}

let client = null;
let db = null;
let indexesCreated = false;

/**
 * Get a connected MongoDB database instance (singleton)
 */
async function getDb() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI not set in .env");
  }

  if (db) return db;

  client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  db = client.db(DB_NAME);
  log("connected", "db", DB_NAME);

  // Create indexes only once
  if (!indexesCreated) {
    await ensureIndexes();
    indexesCreated = true;
  }

  return db;
}

/**
 * Create useful indexes for performance
 */
async function ensureIndexes() {
  try {
    const d = db;

    // Chats: prioritize closest person + upload order
    await d.collection(CHATS_COLLECTION).createIndex(
      { isClosest: -1, uploadedAt: 1 },
      { name: "closest_upload" }
    );

    // Contacts are unique PER TENANT: the legacy global { jid: 1 } unique
    // index made it impossible for two users to have the same contact.
    try { await d.collection(CONTACTS_COLLECTION).dropIndex("jid_unique"); } catch {}
    await d.collection(CONTACTS_COLLECTION).createIndex(
      { userId: 1, jid: 1 },
      { unique: true, name: "tenant_jid_unique" }
    );
    await d.collection(CUSTOM_PERSONAS_COLLECTION).createIndex(
      { userId: 1, key: 1 },
      { unique: true, name: "tenant_persona_unique" }
    );
    await d.collection(CHATS_COLLECTION).createIndex(
      { userId: 1, isClosest: -1, uploadedAt: 1 },
      { name: "tenant_chats" }
    );
    await d.collection(CHATS_COLLECTION).updateMany(
      { userId: { $exists: false } },
      { $set: { userId: "admin" } }
    );
    await d.collection(CUSTOM_PERSONAS_COLLECTION).updateMany(
      { userId: { $exists: false } },
      { $set: { userId: "admin" } }
    );
    // Feature collections: tenant-scope legacy docs to the admin tenant
    await d.collection("auto_rules").updateMany(
      { userId: { $exists: false } },
      { $set: { userId: "admin" } }
    );
    await d.collection("spam_shield").updateMany(
      { owner: { $exists: false } },
      { $set: { owner: "admin" } }
    );
    await d.collection("blocked_contacts").updateMany(
      { owner: { $exists: false } },
      { $set: { owner: "admin" } }
    );
    await d.collection(DRIP_RULES_COLLECTION).updateMany(
      { userId: { $exists: false } },
      { $set: { userId: "admin" } }
    );

    // Message history: fast per-contact history + cleanup
    await d.collection(MESSAGE_HISTORY_COLLECTION).createIndex(
      { jid: 1, timestamp: -1 },
      { name: "jid_timestamp" }
    );

    // Users: unique username index
    await d.collection(USERS_COLLECTION).createIndex(
      { username: 1 },
      { unique: true, name: "username_unique" }
    );

    // Tenant isolation indexes
    await d.collection(CONTACTS_COLLECTION).createIndex(
      { userId: 1 },
      { name: "userId_contacts" }
    );
    await d.collection(MESSAGE_HISTORY_COLLECTION).createIndex(
      { userId: 1, jid: 1 },
      { name: "userId_messages" }
    );

    // Phase 1: per-contact long-term memory (one doc per tenant+contact)
    await d.collection("contact_memories").createIndex(
      { userId: 1, jid: 1 },
      { unique: true, name: "tenant_contact_memory_unique" }
    );
    // Phase 1: alerts, newest-first per owner
    await d.collection("alerts").createIndex(
      { owner: 1, createdAt: -1 },
      { name: "owner_alerts" }
    );
    // Phase 2: reminders due-scan (unsent first, earliest due first)
    await d.collection("reminders").createIndex(
      { sent: 1, dueAt: 1 },
      { name: "reminders_due" }
    );
    // Live Feed: newest-first per owner (owner-scoped, never cross-tenant)
    await d.collection("live_feed").createIndex(
      { owner: 1, ts: -1 },
      { name: "owner_feed" }
    );

    // Auto-migrate any legacy contacts/messages without a tenant owner to admin
    await d.collection(CONTACTS_COLLECTION).updateMany(
      { userId: { $exists: false } },
      { $set: { userId: "admin" } }
    );
    await d.collection(MESSAGE_HISTORY_COLLECTION).updateMany(
      { userId: { $exists: false } },
      { $set: { userId: "admin" } }
    );

    log("indexes", "created");
  } catch (err) {
    // Index already exists is fine
    if (!err.message?.includes("already exists")) {
      console.error(`${LOG_PREFIX} index creation warning:`, err.message);
    }
  }
}

// ── Chat reference helpers ───────────────────────────────────────────────────

async function listChats(userId = "admin") {
  const d = await getDb();
  const docs = await d
    .collection(CHATS_COLLECTION)
    .find({ userId: userId || "admin" })
    .sort({ isClosest: -1, uploadedAt: -1 })
    .toArray();

  log("find", CHATS_COLLECTION, `count=${docs.length}`);
  return docs.map((doc) => ({
    filename: doc.filename,
    isClosest: !!doc.isClosest,
    docType: doc.docType || (doc.filename?.endsWith(".pdf") ? "pdf" : doc.filename?.startsWith("http") ? "url" : "txt"),
    size: typeof doc.content === "string" ? Buffer.byteLength(doc.content, "utf8") : 0,
    uploadedAt: doc.uploadedAt,
  }));
}

async function insertChat(filename, content, isClosest = false, docType = "txt", userId = "admin") {
  if (!filename || !content) {
    throw new Error("filename and content are required");
  }

  const d = await getDb();
  const col = d.collection(CHATS_COLLECTION);

  if (isClosest) {
    await col.updateMany({ isClosest: true, userId: userId || "admin" }, { $set: { isClosest: false } });
    log("updateMany", CHATS_COLLECTION, "cleared isClosest from others");
  }

  const doc = {
    filename,
    content,
    isClosest: !!isClosest,
    docType: docType || "txt",
    userId: userId || "admin",
    uploadedAt: new Date(),
  };

  await col.insertOne(doc);
  log("insertOne", CHATS_COLLECTION, `filename=${filename} type=${docType}`);
  return doc;
}

// ── Custom Persona Helpers ───────────────────────────────────────────────────

async function listCustomPersonas(userId = "admin") {
  const d = await getDb();
  const docs = await d.collection(CUSTOM_PERSONAS_COLLECTION).find({ userId: userId || "admin" }).sort({ createdAt: 1 }).toArray();
  log("listCustomPersonas", CUSTOM_PERSONAS_COLLECTION, `count=${docs.length}`);
  return docs;
}

async function getCustomPersona(key, userId = "admin") {
  if (!key) return null;
  const d = await getDb();
  return await d.collection(CUSTOM_PERSONAS_COLLECTION).findOne({ key: String(key).toLowerCase(), userId: userId || "admin" });
}

async function saveCustomPersona({ key, name, emoji, description, systemPrompt, temperature, userId = "admin" }) {
  if (!name || !systemPrompt) {
    throw new Error("Persona name and system prompt are required.");
  }
  const cleanKey = (key || name.toLowerCase().replace(/[^a-z0-9]/g, "_")).slice(0, 30);
  const d = await getDb();
  const doc = {
    key: cleanKey,
    userId: userId || "admin",
    name: name.trim(),
    emoji: emoji || "🤖",
    description: (description || "").trim(),
    systemPrompt: systemPrompt.trim(),
    temperature: typeof temperature === "number" ? Math.min(1.0, Math.max(0.1, temperature)) : 0.7,
    updatedAt: new Date(),
  };

  await d.collection(CUSTOM_PERSONAS_COLLECTION).updateOne(
    { key: cleanKey, userId: userId || "admin" },
    { $set: doc, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );

  log("saveCustomPersona", CUSTOM_PERSONAS_COLLECTION, `key=${cleanKey}`);
  return doc;
}

async function deleteCustomPersona(key, userId = "admin") {
  if (!key) return;
  const d = await getDb();
  await d.collection(CUSTOM_PERSONAS_COLLECTION).deleteOne({ key: String(key).toLowerCase(), userId: userId || "admin" });
  log("deleteCustomPersona", CUSTOM_PERSONAS_COLLECTION, `key=${key}`);
}

// ── CRM Pipeline & Lead Stage Helpers ─────────────────────────────────────────

async function updateContactLeadStage(jid, leadStage, userId = "admin") {
  if (!jid) return;
  const d = await getDb();
  const validStages = ["inquiry", "hot_lead", "high_value", "deal_closed", "lost"];
  const stage = validStages.includes(leadStage) ? leadStage : "inquiry";
  await d.collection(CONTACTS_COLLECTION).updateOne(
    { jid, userId: userId || "admin" },
    { $set: { leadStage: stage, updatedAt: new Date() } }
  );
  log("updateContactLeadStage", CONTACTS_COLLECTION, `jid=${jid} stage=${stage}`);
}

async function updateContactNotes(jid, notes, userId = "admin") {
  if (!jid) return;
  const d = await getDb();
  await d.collection(CONTACTS_COLLECTION).updateOne(
    { jid, userId: userId || "admin" },
    { $set: { notes: String(notes || "").trim(), updatedAt: new Date() } }
  );
}

// ── Media Assets & Auto-Trigger Helpers ───────────────────────────────────────

async function listMediaAssets() {
  const d = await getDb();
  const docs = await d.collection(MEDIA_ASSETS_COLLECTION).find({}).sort({ createdAt: -1 }).toArray();
  log("listMediaAssets", MEDIA_ASSETS_COLLECTION, `count=${docs.length}`);
  return docs;
}

async function saveMediaAsset({ title, mediaType, mimeType, fileUrl, filename, keywords, buffer }) {
  if (!title) {
    throw new Error("Title is required.");
  }
  const d = await getDb();
  const kwList = Array.isArray(keywords)
    ? keywords
    : String(keywords || "")
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);

  const base64Data = buffer ? buffer.toString("base64") : "";

  const doc = {
    title: title.trim(),
    mediaType: mediaType || "document",
    mimeType: mimeType || "application/pdf",
    fileUrl: fileUrl || "",
    filename: filename || "attachment",
    base64Data,
    keywords: kwList,
    createdAt: new Date(),
  };

  const res = await d.collection(MEDIA_ASSETS_COLLECTION).insertOne(doc);
  log("saveMediaAsset", MEDIA_ASSETS_COLLECTION, `id=${res.insertedId}`);
  return { id: res.insertedId, title: doc.title, mediaType: doc.mediaType, filename: doc.filename, keywords: doc.keywords };
}

async function deleteMediaAsset(id) {
  if (!id) return;
  const { ObjectId } = require("mongodb");
  const d = await getDb();
  const query = typeof id === "string" && id.length === 24 ? { _id: new ObjectId(id) } : { _id: id };
  await d.collection(MEDIA_ASSETS_COLLECTION).deleteOne(query);
  log("deleteMediaAsset", MEDIA_ASSETS_COLLECTION, `id=${id}`);
}

async function findMatchingMediaAsset(userText) {
  if (!userText || typeof userText !== "string") return null;
  const text = userText.toLowerCase().trim();
  const assets = await listMediaAssets();
  for (const asset of assets) {
    if (Array.isArray(asset.keywords)) {
      for (const rawKw of asset.keywords) {
        const kw = String(rawKw || "").trim().toLowerCase();
        if (kw && (text === kw || text.includes(kw) || (kw.length >= 3 && text.includes(kw)))) {
          return asset;
        }
      }
    }
  }
  return null;
}

// ── Automated Drip & Follow-up Helpers ────────────────────────────────────────

async function listDripRules(userId = "admin") {
  const d = await getDb();
  const docs = await d.collection(DRIP_RULES_COLLECTION).find({ userId: userId || "admin" }).sort({ createdAt: -1 }).toArray();
  log("listDripRules", DRIP_RULES_COLLECTION, `count=${docs.length}`);
  return docs;
}

async function saveDripRule({ name, inactivityHours, targetStage, message, enabled, userId = "admin" }) {
  if (!name || !message) {
    throw new Error("Rule name and message are required.");
  }
  const d = await getDb();
  const doc = {
    name: name.trim(),
    userId: userId || "admin",
    inactivityHours: Number(inactivityHours || 24),
    targetStage: targetStage || "all",
    message: message.trim(),
    enabled: enabled !== false,
    updatedAt: new Date(),
  };

  await d.collection(DRIP_RULES_COLLECTION).insertOne(doc);
  log("saveDripRule", DRIP_RULES_COLLECTION, `name=${doc.name}`);
  return doc;
}

async function deleteDripRule(id, userId = "admin") {
  if (!id) return;
  const { ObjectId } = require("mongodb");
  const d = await getDb();
  const query = typeof id === "string" && id.length === 24 ? { _id: new ObjectId(id), userId: userId || "admin" } : { _id: id, userId: userId || "admin" };
  await d.collection(DRIP_RULES_COLLECTION).deleteOne(query);
}

async function getContactsDueForDrip(inactivityHours, targetStage = "all", userId = "admin") {
  const d = await getDb();
  const cutoff = new Date(Date.now() - inactivityHours * 60 * 60 * 1000);
  const query = {
    userId: userId || "admin",
    lastActive: { $lt: cutoff },
    dripSent: { $ne: true },
    mode: { $ne: "off" },
  };
  if (targetStage !== "all") {
    query.leadStage = targetStage;
  }
  const contacts = await d.collection(CONTACTS_COLLECTION).find(query).toArray();
  return contacts;
}

async function markContactDripSent(jid, userId = "admin") {
  if (!jid) return;
  const d = await getDb();
  await d.collection(CONTACTS_COLLECTION).updateOne(
    { jid, userId: userId || "admin" },
    { $set: { dripSent: true, lastDripAt: new Date() } }
  );
}

async function getChatsForAI(userId = "admin") {
  const d = await getDb();
  const docs = await d
    .collection(CHATS_COLLECTION)
    .find({ userId: userId || "admin" })
    .sort({ isClosest: -1, uploadedAt: 1 })
    .toArray();

  log("find", CHATS_COLLECTION, `AI context count=${docs.length}`);
  return docs;
}

async function hasChats(userId = "admin") {
  const d = await getDb();
  const count = await d.collection(CHATS_COLLECTION).countDocuments({ userId: userId || "admin" });
  log("countDocuments", CHATS_COLLECTION, `hasChats=${count > 0}`);
  return count > 0;
}

async function hasClosestPerson(userId = "admin") {
  const d = await getDb();
  const count = await d.collection(CHATS_COLLECTION).countDocuments({ isClosest: true, userId: userId || "admin" });
  log("countDocuments", CHATS_COLLECTION, `hasClosestPerson=${count > 0}`);
  return count > 0;
}

// ── Contact settings helpers ─────────────────────────────────────────────────

async function getContact(jid, userId = "admin") {
  if (!jid) throw new Error("jid is required");

  const d = await getDb();
  let contact = await d.collection(CONTACTS_COLLECTION).findOne({ jid, userId: userId || "admin" });

  if (!contact) {
    // Default object for brand-new contacts
    contact = {
      jid,
      userId: userId || "admin",
      name: "",
      mode: "devil",
      lastActive: new Date(),
      greeted: false,
      pendingModeSelection: true,
      donAwayNoticeSent: false,
    };
  }

  return contact;
}

async function upsertContact(jid, name = "", userId = "admin") {
  if (!jid) return;

  const d = await getDb();
  const update = {
    $set: {
      lastActive: new Date(),
    },
    $setOnInsert: {
      mode: "devil",
      greeted: false,
      pendingModeSelection: true,   // Show persona picker to new users
      userId: userId || "admin",
    },
  };

  if (name) {
    update.$set.name = name;
  }

  await d.collection(CONTACTS_COLLECTION).updateOne(
    { jid, userId: userId || "admin" },
    update,
    { upsert: true }
  );
}

async function bulkUpsertContacts(contacts = [], defaultUserId = "admin") {
  if (!Array.isArray(contacts) || contacts.length === 0) return;

  const d = await getDb();
  const ops = contacts
    .filter((c) => c.jid)
    .map((c) => ({
      updateOne: {
        filter: { jid: c.jid, userId: defaultUserId || "admin" },
        update: {
          $set: {
            name: c.name || "",
            lastActive: new Date(),
          },
          $setOnInsert: {
            mode: "devil",
            greeted: false,
            pendingModeSelection: true,
            userId: defaultUserId || "admin",
          },
        },
        upsert: true,
      },
    }));

  if (ops.length === 0) return;

  const result = await d.collection(CONTACTS_COLLECTION).bulkWrite(ops);
  log("bulkUpsertContacts", CONTACTS_COLLECTION, `upserted=${result.upsertedCount} modified=${result.modifiedCount}`);
}

async function saveContactMessage(jid, name, userId = "admin") {
  // Keep old function working (calls upsert)
  await upsertContact(jid, name, userId);
}

async function setContactMode(jid, mode, userId = "admin") {
  if (!jid) throw new Error("jid is required");
  // Modes: built-ins (devil/boy/girl/auto/manual/off) or a custom persona key.
  if (!mode || typeof mode !== "string" || mode.length > 40) {
    throw new Error("Invalid contact mode");
  }

  const d = await getDb();
  await d.collection(CONTACTS_COLLECTION).updateOne(
    { jid, userId: userId || "admin" },
    {
      $set: {
        mode,
        lastActive: new Date(),
      },
    },
    { upsert: true }
  );

  log("setContactMode", CONTACTS_COLLECTION, `jid=${jid} mode=${mode} user=${userId || "admin"}`);
}

async function markContactGreeted(jid, userId = "admin") {
  if (!jid) return;
  const d = await getDb();
  await d.collection(CONTACTS_COLLECTION).updateOne(
    { jid, userId: userId || "admin" },
    { $set: { greeted: true, lastActive: new Date() } },
    { upsert: true }
  );
  log("markContactGreeted", CONTACTS_COLLECTION, `jid=${jid}`);
}

/**
 * Confirm a user's persona selection: set their mode, clear the pending flag,
 * and mark them as greeted so they won't see the picker again.
 * @param {string} jid
 * @param {"devil"|"boy"|"girl"} mode
 */
async function markModeSelected(jid, mode, userId = "admin") {
  if (!jid) return;
  const d = await getDb();
  await d.collection(CONTACTS_COLLECTION).updateOne(
    { jid, userId: userId || "admin" },
    {
      $set: {
        mode,
        greeted: true,
        pendingModeSelection: false,
        lastActive: new Date(),
      },
    },
    { upsert: true }
  );
  log("markModeSelected", CONTACTS_COLLECTION, `jid=${jid} mode=${mode}`);
}

// ── Per-user AI provider configs (multi-provider engine) ────────────────────
// Stored per dashboard user under settings key `aiProviders:<userId>` so a
// tenant's provider keys live in their own scope and never mix with the
// owner's. Shape: { configs: [{providerId, apiKey, model, enabled}], activeProviderId }

async function getAiProviderConfigs(userId = "admin") {
  try {
    const d = await getDb();
    const doc = await d.collection(SETTINGS_COLLECTION).findOne({ key: `aiProviders:${userId}` });
    const v = doc?.value || {};
    return {
      configs: Array.isArray(v.configs) ? v.configs : [],
      activeProviderId: v.activeProviderId || null,
      routingMode: v.routingMode || "manual",
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} getAiProviderConfigs error:`, err.message);
    return { configs: [], activeProviderId: null };
  }
}

async function saveAiProviderConfigs(userId = "admin", data) {
  const clean = {
    configs: (Array.isArray(data?.configs) ? data.configs : [])
      .filter((c) => c && c.providerId)
      .map((c) => ({
        providerId: String(c.providerId),
        apiKey: String(c.apiKey || ""),
        model: String(c.model || ""),
        enabled: c.enabled !== false,
      })),
    activeProviderId: data?.activeProviderId || null,
    routingMode: data?.routingMode || "manual",
  };
  const d = await getDb();
  await d.collection(SETTINGS_COLLECTION).updateOne(
    { key: `aiProviders:${userId}` },
    { $set: { value: clean, updatedAt: new Date() } },
    { upsert: true }
  );
  log("saveAiProviderConfigs", SETTINGS_COLLECTION, `user=${userId} providers=${clean.configs.length}`);
  return clean;
}

// ── AI usage accounting (Smart Router) ─────────────────────────────────────
// settings key `aiUsage:<userId>` →
//   { days: { 'YYYY-MM-DD': { <providerId>: {req, pt, ct, fail} } },
//     totals: { <providerId>: {req, pt, ct, fail} },
//     routeLog: [{ at, from, to, reason }] }   (last 20 fallback events)
// All counters use atomic $inc so concurrent chats cannot lose updates.

async function recordAiUsage(userId, providerId, { pt = 0, ct = 0, fail = 0, route = null } = {}) {
  if (!userId || !providerId) return;
  try {
    const d = await getDb();
    const day = new Date().toISOString().slice(0, 10);
    const inc = {};
    if (!fail) inc[`value.days.${day}.${providerId}.req`] = 1;
    if (pt) inc[`value.days.${day}.${providerId}.pt`] = pt;
    if (ct) inc[`value.days.${day}.${providerId}.ct`] = ct;
    if (fail) inc[`value.days.${day}.${providerId}.fail`] = 1;
    if (!fail) inc[`value.totals.${providerId}.req`] = 1;
    if (pt) inc[`value.totals.${providerId}.pt`] = pt;
    if (ct) inc[`value.totals.${providerId}.ct`] = ct;
    if (fail) inc[`value.totals.${providerId}.fail`] = 1;
    const update = { $set: { updatedAt: new Date() } };
    if (Object.keys(inc).length) update.$inc = inc;
    if (route) {
      update.$push = {
        "value.routeLog": {
          $each: [{ at: new Date().toISOString(), from: route.from || null, to: providerId, reason: String(route.reason || "").slice(0, 120) }],
          $slice: -20,
        },
      };
    }
    await d.collection(SETTINGS_COLLECTION).updateOne({ key: `aiUsage:${userId}` }, update, { upsert: true });
  } catch (err) {
    console.error(`${LOG_PREFIX} recordAiUsage error:`, err.message);
  }
}

async function getAiUsage(userId = "admin") {
  try {
    const d = await getDb();
    const doc = await d.collection(SETTINGS_COLLECTION).findOne({ key: `aiUsage:${userId}` });
    const v = doc?.value || {};
    return {
      days: v.days || {},
      totals: v.totals || {},
      routeLog: Array.isArray(v.routeLog) ? v.routeLog : [],
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} getAiUsage error:`, err.message);
    return { days: {}, totals: {}, routeLog: [] };
  }
}

// ── Don Away Mode Settings ───────────────────────────────────────────────────
// Per-user settings keys (also used for the away message/audio
// below): admin keeps the legacy bare keys so existing data keeps
// working; every other user gets a suffixed key, so one tenant's
// away text, voice note, or mode can never overwrite another
// tenant's — or the admin's. A tenant with no custom audio falls
// back to the shared factory file, never to the admin's custom
// recording.
function scopedSettingsKey(base, userId) {
  const u = userId || "admin";
  return u === "admin" ? base : `${base}:${u}`;
}

async function getDonAwayMode(userId = "admin") {
  try {
    const d = await getDb();
    const doc = await d.collection(SETTINGS_COLLECTION).findOne({ key: scopedSettingsKey("donAwayMode", userId) });
    return doc ? !!doc.value : false;
  } catch (err) {
    console.error(`${LOG_PREFIX} getDonAwayMode error:`, err.message);
    return false;
  }
}

async function setDonAwayMode(enabled, userId = "admin") {
  try {
    const d = await getDb();
    await d.collection(SETTINGS_COLLECTION).updateOne(
      { key: scopedSettingsKey("donAwayMode", userId) },
      { $set: { value: !!enabled, updatedAt: new Date() } },
      { upsert: true }
    );
    if (!enabled) {
      // When this user comes back online, reset only THEIR contacts'
      // opt-ins so next time they are away, those contacts get
      // prompted again. resetAllDonAwayOptIns is already user-scoped.
      await resetAllDonAwayOptIns(userId);
    }
    log("setDonAwayMode", SETTINGS_COLLECTION, `user=${userId} enabled=${enabled}`);
    return true;
  } catch (err) {
    console.error(`${LOG_PREFIX} setDonAwayMode error:`, err.message);
    return false;
  }
}

// ── AI Disclosure Setting (Phase 1, opt-in, per user) ───────────────────────
// Same scoped-key pattern as Don Away: admin keeps the bare key,
// tenants get a suffixed key. Default is OFF — turning it on must
// be an explicit choice by each account owner.
async function getAiDisclosure(userId = "admin") {
  try {
    const d = await getDb();
    const doc = await d.collection(SETTINGS_COLLECTION).findOne({ key: scopedSettingsKey("aiDisclosure", userId) });
    return doc ? !!doc.value : false;
  } catch (err) {
    console.error(`${LOG_PREFIX} getAiDisclosure error:`, err.message);
    return false;
  }
}

async function setAiDisclosure(enabled, userId = "admin") {
  try {
    const d = await getDb();
    await d.collection(SETTINGS_COLLECTION).updateOne(
      { key: scopedSettingsKey("aiDisclosure", userId) },
      { $set: { value: !!enabled, updatedAt: new Date() } },
      { upsert: true }
    );
    log("setAiDisclosure", SETTINGS_COLLECTION, `user=${userId} enabled=${!!enabled}`);
    return true;
  } catch (err) {
    console.error(`${LOG_PREFIX} setAiDisclosure error:`, err.message);
    return false;
  }
}

// ── Phase 2: Agent settings (UPI ID + persona voices, per user) ─────────────
// UPI ID is the payment payee for create_upi_link. It is NEVER read
// from model output — only from this setting — so a model can never
// redirect a payment by inventing a payee. Persona voices are free
// Edge Neural voice names; an unknown name falls back to the
// persona default inside freeVoiceEngine (resolveVoice).
async function getUpiId(userId = "admin") {
  try {
    const d = await getDb();
    const doc = await d.collection(SETTINGS_COLLECTION).findOne({ key: scopedSettingsKey("upiId", userId) });
    return doc?.value || "";
  } catch (err) {
    console.error(`${LOG_PREFIX} getUpiId error:`, err.message);
    return "";
  }
}

// ── Live Feed (owner-scoped question/reply events) ───────────────────────
// Thin wrappers: the logic lives in features/liveFeed.js.
async function saveFeedEvent(owner, event) {
  const d = await getDb();
  return require("./features/liveFeed").recordFeedEvent(d.collection("live_feed"), owner, event);
}

async function getFeedEvents(owner, limit) {
  const d = await getDb();
  return require("./features/liveFeed").getFeedEvents(d.collection("live_feed"), owner, limit);
}

async function setUpiId(upiId, userId = "admin") {
  try {
    const d = await getDb();
    await d.collection(SETTINGS_COLLECTION).updateOne(
      { key: scopedSettingsKey("upiId", userId) },
      { $set: { value: String(upiId || "").trim(), updatedAt: new Date() } },
      { upsert: true }
    );
    return true;
  } catch (err) {
    console.error(`${LOG_PREFIX} setUpiId error:`, err.message);
    return false;
  }
}

async function getPersonaVoices(userId = "admin") {
  try {
    const d = await getDb();
    const doc = await d.collection(SETTINGS_COLLECTION).findOne({ key: scopedSettingsKey("personaVoices", userId) });
    return (doc && typeof doc.value === "object") ? doc.value : {};
  } catch (err) {
    console.error(`${LOG_PREFIX} getPersonaVoices error:`, err.message);
    return {};
  }
}

async function setPersonaVoices(voices, userId = "admin") {
  try {
    const d = await getDb();
    const clean = {};
    for (const mode of ["girl", "boy", "devil"]) {
      if (voices && typeof voices[mode] === "string" && voices[mode].trim()) clean[mode] = voices[mode].trim();
    }
    await d.collection(SETTINGS_COLLECTION).updateOne(
      { key: scopedSettingsKey("personaVoices", userId) },
      { $set: { value: clean, updatedAt: new Date() } },
      { upsert: true }
    );
    return true;
  } catch (err) {
    console.error(`${LOG_PREFIX} setPersonaVoices error:`, err.message);
    return false;
  }
}

async function setContactDonAwayOptIn(jid, optIn = true, userId = "admin") {
  if (!jid) return;
  try {
    const d = await getDb();
    await d.collection(CONTACTS_COLLECTION).updateOne(
      { jid, userId: userId || "admin" },
      { $set: { donAwayOptIn: !!optIn, lastActive: new Date() } },
      { upsert: true }
    );
    log("setContactDonAwayOptIn", CONTACTS_COLLECTION, `jid=${jid} optIn=${optIn}`);
  } catch (err) {
    console.error(`${LOG_PREFIX} setContactDonAwayOptIn error:`, err.message);
  }
}

async function setContactDonAwayNoticeSent(jid, sent = true, userId = "admin") {
  if (!jid) return;
  try {
    const d = await getDb();
    await d.collection(CONTACTS_COLLECTION).updateOne(
      { jid, userId: userId || "admin" },
      { $set: { donAwayNoticeSent: !!sent, lastActive: new Date() } },
      { upsert: true }
    );
    log("setContactDonAwayNoticeSent", CONTACTS_COLLECTION, `jid=${jid} sent=${sent}`);
  } catch (err) {
    console.error(`${LOG_PREFIX} setContactDonAwayNoticeSent error:`, err.message);
  }
}

async function resetAllDonAwayOptIns(userId = "admin") {
  try {
    const d = await getDb();
    await d.collection(CONTACTS_COLLECTION).updateMany(
      { userId: userId || "admin" },
      { $set: { donAwayOptIn: false, donAwayNoticeSent: false } }
    );
    log("resetAllDonAwayOptIns", CONTACTS_COLLECTION, "all optIns and notices cleared");
  } catch (err) {
    console.error(`${LOG_PREFIX} resetAllDonAwayOptIns error:`, err.message);
  }
}

// ── Contact & Chat Deletion ──────────────────────────────────────────────────

async function deleteContact(jid, userId = "admin") {
  if (!jid) return;
  const d = await getDb();
  const query = { jid, userId: userId || "admin" };
  await d.collection(CONTACTS_COLLECTION).deleteOne(query);
  await d.collection(MESSAGE_HISTORY_COLLECTION).deleteMany(query);
  log("deleteContact", CONTACTS_COLLECTION, `jid=${jid} user=${userId || "all"}`);
}

async function deleteAllContacts(userId = null) {
  const d = await getDb();
  const query = userId ? { userId } : {};
  const res1 = await d.collection(CONTACTS_COLLECTION).deleteMany(query);
  const res2 = await d.collection(MESSAGE_HISTORY_COLLECTION).deleteMany(query);
  log("deleteAllContacts", CONTACTS_COLLECTION, `deleted=${res1.deletedCount} historyDeleted=${res2.deletedCount} user=${userId || "all"}`);
  return { contactsDeleted: res1.deletedCount, historyDeleted: res2.deletedCount };
}

async function deleteAllMessageHistory(userId = null) {
  const d = await getDb();
  const query = userId ? { userId } : {};
  const res = await d.collection(MESSAGE_HISTORY_COLLECTION).deleteMany(query);
  log("deleteAllMessageHistory", MESSAGE_HISTORY_COLLECTION, `deleted=${res.deletedCount} user=${userId || "all"}`);
  return { deletedCount: res.deletedCount };
}

async function resetInactiveContacts(minutes = 20, userId = null) {
  try {
    const d = await getDb();
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const filter = { lastActive: { $lt: cutoff } };
    if (userId) filter.userId = userId;
    const res = await d.collection(CONTACTS_COLLECTION).updateMany(
      filter,
      {
        $set: {
          donAwayOptIn: false,
          donAwayNoticeSent: false,
          pendingModeSelection: true,
          mode: "devil",
        },
      }
    );
    if (res.modifiedCount > 0) {
      log("resetInactiveContacts", CONTACTS_COLLECTION, `reset ${res.modifiedCount} contacts inactive for >${minutes}m`);
    }
    return res.modifiedCount;
  } catch (err) {
    console.error(`${LOG_PREFIX} resetInactiveContacts error:`, err.message);
    return 0;
  }
}

// ── Broadcast Campaign Helpers ────────────────────────────────────────────────

async function saveBroadcastCampaign({ title, message, recipientsCount, delayMs, userId = "admin" }) {
  const d = await getDb();
  const doc = {
    title: title || "Broadcast Campaign",
    message,
    totalRecipients: recipientsCount || 0,
    sentCount: 0,
    status: "pending",
    delayMs: delayMs || 3000,
    userId: userId || "admin",
    createdAt: new Date(),
  };
  const res = await d.collection(BROADCASTS_COLLECTION).insertOne(doc);
  log("saveBroadcastCampaign", BROADCASTS_COLLECTION, `id=${res.insertedId} user=${doc.userId}`);
  return { id: res.insertedId, ...doc };
}

async function updateBroadcastProgress(id, { sentCount, status, error }) {
  if (!id) return;
  const d = await getDb();
  const { ObjectId } = require("mongodb");
  const update = { $set: { updatedAt: new Date() } };
  if (sentCount !== undefined) update.$set.sentCount = sentCount;
  if (status) update.$set.status = status;
  if (error) update.$set.error = error;
  if (status === "completed" || status === "failed") update.$set.completedAt = new Date();

  const query = typeof id === "string" ? { _id: new ObjectId(id) } : { _id: id };
  await d.collection(BROADCASTS_COLLECTION).updateOne(query, update);
}

async function listBroadcasts(limit = 20, userId = null) {
  const d = await getDb();
  const query = (userId && userId !== "admin") ? { userId } : {};
  const docs = await d
    .collection(BROADCASTS_COLLECTION)
    .find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  log("listBroadcasts", BROADCASTS_COLLECTION, `user=${userId || "all"} count=${docs.length}`);
  return docs;
}

async function deleteChatFile(filename, userId = "admin") {
  if (!filename) return;
  const d = await getDb();
  await d.collection(CHATS_COLLECTION).deleteOne({ filename, userId: userId || "admin" });
  log("deleteChatFile", CHATS_COLLECTION, `filename=${filename}`);
}

// ── Users Collection & Multi-Tenant Helpers ─────────────────────────────────

async function createUser({ username, passwordHash, role = "user", apiKey = "" }) {
  if (!username || !passwordHash) throw new Error("Username and passwordHash required");
  const cleanUsername = username.trim().toLowerCase();
  const d = await getDb();
  const existing = await d.collection(USERS_COLLECTION).findOne({ username: cleanUsername });
  if (existing) throw new Error("Username already taken");

  const newUser = {
    username: cleanUsername,
    passwordHash,
    role: "user", // Strictly enforce user role
    userApiKey: apiKey,
    donAwayMode: false,
    disabled: false,
    createdAt: new Date(),
    lastActive: new Date(),
    messagesToday: 0,
    apiCallsToday: 0,
  };

  await d.collection(USERS_COLLECTION).insertOne(newUser);
  log("createUser", USERS_COLLECTION, `username=${cleanUsername} role=user`);
  return newUser;
}

async function authenticateUser(username, password) {
  if (!username || !password) return null;
  const cleanUsername = String(username).trim().toLowerCase();
  const d = await getDb();
  const user = await d.collection(USERS_COLLECTION).findOne({ username: cleanUsername });
  if (!user) return null;
  const { ok, legacy } = await verifyPassword(String(password).trim(), user.passwordHash);
  if (!ok) return null;
  if (user.disabled) {
    throw new Error("Account is suspended by administrator.");
  }
  const updates = { lastActive: new Date() };
  if (legacy) updates.passwordHash = await hashPassword(String(password).trim());
  await d.collection(USERS_COLLECTION).updateOne({ username: cleanUsername }, { $set: updates });
  return {
    username: user.username,
    role: user.role || "user",
    userApiKey: user.userApiKey || "",
    userGeminiKey: user.userGeminiKey || "",
    disabled: !!user.disabled,
  };
}

async function getUserByUsername(username) {
  if (!username) return null;
  const cleanUsername = String(username).trim().toLowerCase();
  const d = await getDb();
  return await d.collection(USERS_COLLECTION).findOne({ username: cleanUsername });
}

async function updateUserGeminiKey(username, apiKey) {
  if (!username) return;
  const cleanUsername = String(username).trim().toLowerCase();
  const d = await getDb();
  await d.collection(USERS_COLLECTION).updateOne(
    { username: cleanUsername },
    { $set: { userGeminiKey: apiKey, lastActive: new Date() } }
  );
  log("updateUserGeminiKey", USERS_COLLECTION, `username=${cleanUsername}`);
}

async function updateUserApiKey(username, apiKey) {
  if (!username) return;
  const cleanUsername = String(username).trim().toLowerCase();
  const d = await getDb();
  await d.collection(USERS_COLLECTION).updateOne(
    { username: cleanUsername },
    { $set: { userApiKey: apiKey, lastActive: new Date() } }
  );
  log("updateUserApiKey", USERS_COLLECTION, `username=${cleanUsername}`);
}

async function listAllUsers() {
  const d = await getDb();
  return await d
    .collection(USERS_COLLECTION)
    .find({}, { projection: { passwordHash: 0 } })
    .sort({ createdAt: -1 })
    .toArray();
}

async function deleteUser(username) {
  if (!username) return;
  const cleanUsername = String(username).trim().toLowerCase();
  const d = await getDb();
  await d.collection(USERS_COLLECTION).deleteOne({ username: cleanUsername });
  log("deleteUser", USERS_COLLECTION, `username=${cleanUsername}`);
}

async function toggleUserDisabled(username, disabled) {
  if (!username) return;
  const cleanUsername = String(username).trim().toLowerCase();
  const d = await getDb();
  await d.collection(USERS_COLLECTION).updateOne(
    { username: cleanUsername },
    { $set: { disabled: !!disabled } }
  );
  log("toggleUserDisabled", USERS_COLLECTION, `username=${cleanUsername} disabled=${disabled}`);
}

const DEFAULT_FALLBACK_TEXT =
  "Main abhi thoda busy hu aur messages check nahi kar pa raha. Free hote hi connect karta hu!\n\n" +
  "────────────────────────\n" +
  "🤖 *AI Assistant Live:*\n" +
  "Agar koi urgent query ho, toh reply me *1* ya *Hi* likhiye — AI turant connect karega!\n" +
  "────────────────────────";

async function getDefaultSettings(userId = "admin") {
  try {
    const d = await getDb();
    const msgDoc = await d.collection(SETTINGS_COLLECTION).findOne({ key: scopedSettingsKey("defaultMessage", userId) });
    const audioDoc = await d.collection(SETTINGS_COLLECTION).findOne({ key: scopedSettingsKey("defaultAudio", userId) }, { projection: { base64Data: 0 } });

    return {
      defaultMessage: (msgDoc && msgDoc.value) ? msgDoc.value : DEFAULT_FALLBACK_TEXT,
      hasCustomAudio: !!audioDoc,
      audioMime: audioDoc?.mimeType || "audio/mpeg",
      audioFilename: audioDoc?.filename || "default.mp3",
      audioUpdatedAt: audioDoc?.updatedAt || null,
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} getDefaultSettings error:`, err.message);
    return {
      defaultMessage: DEFAULT_FALLBACK_TEXT,
      hasCustomAudio: false,
      audioMime: "audio/mpeg",
      audioFilename: "default.mp3",
    };
  }
}

async function updateDefaultMessage(text, userId = "admin") {
  const clean = String(text || "").trim();
  try {
    const d = await getDb();
    await d.collection(SETTINGS_COLLECTION).updateOne(
      { key: scopedSettingsKey("defaultMessage", userId) },
      { $set: { value: clean || DEFAULT_FALLBACK_TEXT, updatedAt: new Date() } },
      { upsert: true }
    );
    log("updateDefaultMessage", SETTINGS_COLLECTION, `user=${userId} len=${clean.length}`);
    return true;
  } catch (err) {
    console.error(`${LOG_PREFIX} updateDefaultMessage error:`, err.message);
    return false;
  }
}

async function updateDefaultAudio({ base64Data, mimeType, filename }, userId = "admin") {
  try {
    const d = await getDb();
    await d.collection(SETTINGS_COLLECTION).updateOne(
      { key: scopedSettingsKey("defaultAudio", userId) },
      {
        $set: {
          base64Data,
          mimeType: mimeType || "audio/mpeg",
          filename: filename || "default_voice.mp3",
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
    log("updateDefaultAudio", SETTINGS_COLLECTION, `user=${userId} filename=${filename}`);
    return true;
  } catch (err) {
    console.error(`${LOG_PREFIX} updateDefaultAudio error:`, err.message);
    return false;
  }
}

async function getDefaultAudio(userId = "admin") {
  try {
    const d = await getDb();
    const doc = await d.collection(SETTINGS_COLLECTION).findOne({ key: scopedSettingsKey("defaultAudio", userId) });
    if (doc && doc.base64Data) {
      return {
        buffer: Buffer.from(doc.base64Data, "base64"),
        mimeType: doc.mimeType || "audio/mpeg",
        filename: doc.filename || "default_audio.mp3",
        isCustom: true,
      };
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} getDefaultAudio error:`, err.message);
  }

  // Disk fallback
  const path = require("path");
  const fs = require("fs");
  const opusPath = path.join(__dirname, "default.opus");
  const mp3Path = path.join(__dirname, "default.mp3");

  if (fs.existsSync(opusPath)) {
    return { buffer: fs.readFileSync(opusPath), mimeType: "audio/ogg; codecs=opus", filename: "default.opus", isCustom: false };
  }
  if (fs.existsSync(mp3Path)) {
    return { buffer: fs.readFileSync(mp3Path), mimeType: "audio/mpeg", filename: "default.mp3", isCustom: false };
  }
  return null;
}

async function deleteDefaultAudio(userId = "admin") {
  try {
    const d = await getDb();
    await d.collection(SETTINGS_COLLECTION).deleteOne({ key: scopedSettingsKey("defaultAudio", userId) });
    log("deleteDefaultAudio", SETTINGS_COLLECTION, `user=${userId} reset to factory default`);
    return true;
  } catch (err) {
    console.error(`${LOG_PREFIX} deleteDefaultAudio error:`, err.message);
    return false;
  }
}

// ── Analytics & Traffic Counters ──────────────────────────────────────────────

let inMemoryStats = {
  date: new Date().toISOString().split("T")[0],
  messages: 0,
  apiCalls: 0,
};

function getTodayKeys() {
  const now = new Date();
  const utcDate = now.toISOString().split("T")[0];
  const localYear = now.getFullYear();
  const localMonth = String(now.getMonth() + 1).padStart(2, "0");
  const localDay = String(now.getDate()).padStart(2, "0");
  const localDate = `${localYear}-${localMonth}-${localDay}`;
  return Array.from(new Set([utcDate, localDate]));
}

async function trackActivity(username = "admin", type = "message") {
  const todayKeys = getTodayKeys();
  const field = type === "apiCall" ? "apiCalls" : "messages";

  if (inMemoryStats.date !== todayKeys[0]) {
    inMemoryStats.date = todayKeys[0];
    inMemoryStats.messages = 0;
    inMemoryStats.apiCalls = 0;
  }
  inMemoryStats[field] = (inMemoryStats[field] || 0) + 1;

  try {
    const d = await getDb();
    for (const key of todayKeys) {
      await d.collection(ANALYTICS_COLLECTION).updateOne(
        { date: key },
        { $inc: { [field]: 1 }, $set: { updatedAt: new Date() } },
        { upsert: true }
      );
    }

    if (username) {
      const userField = type === "apiCall" ? "apiCallsToday" : "messagesToday";
      await d.collection(USERS_COLLECTION).updateOne(
        { username },
        { $inc: { [userField]: 1 }, $set: { lastActive: new Date() } }
      );
    }
  } catch (err) {
    // Non-fatal, in-memory counter is preserved
  }
}

async function getAnalyticsOverview() {
  const todayKeys = getTodayKeys();
  let dbMessages = inMemoryStats.messages || 0;
  let dbApiCalls = inMemoryStats.apiCalls || 0;
  let totalContacts = 0;
  let totalUsers = 0;
  let usersList = [];

  try {
    const d = await getDb();
    const todayDocs = await d.collection(ANALYTICS_COLLECTION).find({ date: { $in: todayKeys } }).toArray();
    for (const doc of todayDocs) {
      if (doc.messages && doc.messages > dbMessages) dbMessages = doc.messages;
      if (doc.apiCalls && doc.apiCalls > dbApiCalls) dbApiCalls = doc.apiCalls;
    }

    // Also count real messages in message_history sent today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const liveHistoryCount = await d.collection(MESSAGE_HISTORY_COLLECTION).countDocuments({ timestamp: { $gte: todayStart } });
    if (liveHistoryCount > dbMessages) dbMessages = liveHistoryCount;

    totalContacts = await d.collection(CONTACTS_COLLECTION).countDocuments({});
    totalUsers = await d.collection(USERS_COLLECTION).countDocuments({});
    usersList = await d
      .collection(USERS_COLLECTION)
      .find({}, { projection: { passwordHash: 0 } })
      .sort({ lastActive: -1 })
      .toArray();
  } catch (err) {
    console.error(`${LOG_PREFIX} getAnalyticsOverview error:`, err.message);
  }

  return {
    messagesToday: dbMessages,
    apiCallsToday: dbApiCalls,
    totalContacts,
    totalUsers,
    users: usersList,
  };
}

async function listContacts(userId = null) {
  const d = await getDb();
  const query = userId ? { userId } : {};
  const docs = await d
    .collection(CONTACTS_COLLECTION)
    .find(query)
    .sort({ lastActive: -1 })
    .toArray();

  log("listContacts", CONTACTS_COLLECTION, `user=${userId || "all"} count=${docs.length}`);
  return docs;
}

// ── Message history helpers ──────────────────────────────────────────────────

async function saveChatMessage(jid, role, body, userId = "admin") {
  if (!jid || !body || !role) return;
  if (role !== "user" && role !== "assistant") {
    throw new Error('role must be "user" or "assistant"');
  }

  const d = await getDb();
  await d.collection(MESSAGE_HISTORY_COLLECTION).insertOne({
    jid,
    role,
    body: String(body).trim(),
    userId: userId || "admin",
    timestamp: new Date(),
  });

  log("saveChatMessage", MESSAGE_HISTORY_COLLECTION, `jid=${jid} role=${role} user=${userId}`);
}

/**
 * Get recent chat history for a contact (oldest → newest)
 * @param {string} jid
 * @param {number} limit - how many messages to return (default 12)
 * @param {string} userId - owner filter
 */
async function getChatHistory(jid, limit = 12, userId = "admin") {
  if (!jid) return [];

  const d = await getDb();
  const query = { jid, userId: userId || "admin" };
  const docs = await d
    .collection(MESSAGE_HISTORY_COLLECTION)
    .find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();

  // Return in chronological order (oldest first)
  const history = docs.reverse();
  log("getChatHistory", MESSAGE_HISTORY_COLLECTION, `jid=${jid} user=${userId || "all"} count=${history.length}`);
  return history;
}

/**
 * Optional: keep only the last N messages per contact
 * Call this occasionally if you want to prevent DB growth
 */
async function trimChatHistory(jid, keepLast = 50, userId = "admin") {
  if (!jid) return;

  const d = await getDb();
  const col = d.collection(MESSAGE_HISTORY_COLLECTION);

  const docs = await col
    .find({ jid, userId: userId || "admin" })
    .sort({ timestamp: -1 })
    .skip(keepLast)
    .project({ _id: 1 })
    .toArray();

  if (docs.length === 0) return;

  const ids = docs.map((doc) => doc._id);
  const result = await col.deleteMany({ _id: { $in: ids } });
  log("trimChatHistory", MESSAGE_HISTORY_COLLECTION, `jid=${jid} deleted=${result.deletedCount}`);
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

async function close() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    indexesCreated = false;
    log("closed", "db");
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  getDb,
  listChats,
  insertChat,
  getChatsForAI,
  hasChats,
  hasClosestPerson,
  close,
  getContact,
  upsertContact,
  bulkUpsertContacts,
  saveContactMessage,
  setContactMode,
  markContactGreeted,
  markModeSelected,
  getAiProviderConfigs,
  recordAiUsage,
  getAiUsage,
  saveAiProviderConfigs,
  scopedSettingsKey,
  getDonAwayMode,
  setDonAwayMode,
  getAiDisclosure,
  setAiDisclosure,
  getUpiId,
  saveFeedEvent,
  getFeedEvents,
  setUpiId,
  getPersonaVoices,
  setPersonaVoices,
  setContactDonAwayOptIn,
  setContactDonAwayNoticeSent,
  resetAllDonAwayOptIns,
  deleteContact,
  deleteAllContacts,
  deleteAllMessageHistory,
  resetInactiveContacts,
  deleteChatFile,
  createUser,
  authenticateUser,
  getUserByUsername,
  updateUserApiKey,
  updateUserGeminiKey,
  listAllUsers,
  deleteUser,
  toggleUserDisabled,
  trackActivity,
  getAnalyticsOverview,
  listContacts,
  saveChatMessage,
  getChatHistory,
  trimChatHistory,
  saveBroadcastCampaign,
  updateBroadcastProgress,
  listBroadcasts,
  listCustomPersonas,
  getCustomPersona,
  saveCustomPersona,
  deleteCustomPersona,
  updateContactLeadStage,
  updateContactNotes,
  listMediaAssets,
  saveMediaAsset,
  deleteMediaAsset,
  findMatchingMediaAsset,
  listDripRules,
  saveDripRule,
  deleteDripRule,
  getContactsDueForDrip,
  markContactDripSent,
  getDefaultSettings,
  updateDefaultMessage,
  updateDefaultAudio,
  getDefaultAudio,
  deleteDefaultAudio,
  MONGODB_URI,
};
