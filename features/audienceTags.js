/**
 * Smart Audience Segmentation & Tagging
 * Enables colored tag management for contacts and tag-filtered broadcasts.
 */
const { getDb } = require("../db");

const CONTACTS_COLLECTION = "contacts";

const PRESET_TAGS = [
  { id: "hot-lead", name: "🔥 Hot Lead", color: "#f43f5e" },
  { id: "vip", name: "⭐ VIP Client", color: "#eab308" },
  { id: "customer", name: "📦 Customer", color: "#10b981" },
  { id: "followup", name: "⏳ Follow Up", color: "#06b6d4" },
  { id: "inactive", name: "⏸️ Inactive", color: "#64748b" },
];

async function updateContactTags(jid, tags = [], userId = "admin") {
  if (!jid) return false;
  try {
    const db = await getDb();
    const cleanTags = Array.isArray(tags) ? tags : [tags];
    await db.collection(CONTACTS_COLLECTION).updateOne(
      { jid, userId: userId || "admin" },
      { $set: { tags: cleanTags, tagsUpdatedAt: new Date() }, $setOnInsert: { userId: userId || "admin" } },
      { upsert: true }
    );
    return true;
  } catch (err) {
    console.error("[AudienceTags] updateContactTags error:", err.message);
    return false;
  }
}

async function getContactsByTag(tag) {
  if (!tag || tag === "all") {
    const db = await getDb();
    return await db.collection(CONTACTS_COLLECTION).find({}).toArray();
  }
  try {
    const db = await getDb();
    return await db.collection(CONTACTS_COLLECTION).find({ tags: tag }).toArray();
  } catch (err) {
    console.error("[AudienceTags] getContactsByTag error:", err.message);
    return [];
  }
}

function getPresetTags() {
  return PRESET_TAGS;
}

module.exports = {
  updateContactTags,
  getContactsByTag,
  getPresetTags,
};
