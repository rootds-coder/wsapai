/**
 * Voice Vault & Multi-Media Asset Repository
 * Manages audio notes, voice notes, and quick media responses for WhatsApp dispatch.
 */
const { getDb } = require("../db");

const VAULT_COLLECTION = "voice_vault";

async function listVoiceVault() {
  try {
    const db = await getDb();
    const items = await db
      .collection(VAULT_COLLECTION)
      .find({}, { projection: { base64Data: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    return items;
  } catch (err) {
    console.error("[VoiceVault] listVoiceVault error:", err.message);
    return [];
  }
}

async function getVoiceVaultItem(id) {
  try {
    const db = await getDb();
    const item = await db.collection(VAULT_COLLECTION).findOne({ id });
    if (!item) return null;
    return {
      ...item,
      buffer: item.base64Data ? Buffer.from(item.base64Data, "base64") : null,
    };
  } catch (err) {
    console.error("[VoiceVault] getVoiceVaultItem error:", err.message);
    return null;
  }
}

async function saveVoiceVaultItem({ id, title, tag, base64Data, mimeType, filename, size }) {
  try {
    const db = await getDb();
    const itemId = id || `vault-${Date.now()}`;
    const doc = {
      id: itemId,
      title: title || filename || "Voice Note",
      tag: tag || "general",
      base64Data,
      mimeType: mimeType || "audio/mpeg",
      filename: filename || "audio.mp3",
      size: size || (base64Data ? Math.round((base64Data.length * 3) / 4) : 0),
      createdAt: new Date(),
    };

    await db.collection(VAULT_COLLECTION).updateOne({ id: itemId }, { $set: doc }, { upsert: true });
    return { id: itemId, title: doc.title, tag: doc.tag, mimeType: doc.mimeType, filename: doc.filename, size: doc.size, createdAt: doc.createdAt };
  } catch (err) {
    console.error("[VoiceVault] saveVoiceVaultItem error:", err.message);
    throw err;
  }
}

async function deleteVoiceVaultItem(id) {
  try {
    const db = await getDb();
    await db.collection(VAULT_COLLECTION).deleteOne({ id });
    return true;
  } catch (err) {
    console.error("[VoiceVault] deleteVoiceVaultItem error:", err.message);
    return false;
  }
}

module.exports = {
  listVoiceVault,
  getVoiceVaultItem,
  saveVoiceVaultItem,
  deleteVoiceVaultItem,
};
