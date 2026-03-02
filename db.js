/**
 * MongoDB connection and data access with logging.
 * Uses MONGODB_URI from .env
 */
require("dotenv").config();
const { MongoClient } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "open_truly_chat";
const CHATS_COLLECTION = "chats";

const LOG_PREFIX = "[Mongo]";

function log(op, collection, detail = "") {
  const msg = `${LOG_PREFIX} ${op} → ${collection}${detail ? ` ${detail}` : ""}`;
  console.log(msg);
}

let client = null;
let db = null;

async function getDb() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI not set");
  }
  if (db) return db;
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  log("connected", "db", DB_NAME);
  return db;
}

async function listChats() {
  const d = await getDb();
  const col = d.collection(CHATS_COLLECTION);
  const docs = await col.find({}).sort({ isClosest: -1, uploadedAt: 1 }).toArray();
  log("find", CHATS_COLLECTION, `count=${docs.length}`);
  return docs.map((d) => ({
    name: d.filename,
    isClosest: !!d.isClosest,
  }));
}

async function insertChat(filename, content, isClosest = false) {
  const d = await getDb();
  const col = d.collection(CHATS_COLLECTION);
  if (isClosest) {
    await col.updateMany({ isClosest: true }, { $set: { isClosest: false } });
    log("updateMany", CHATS_COLLECTION, "cleared isClosest from others");
  }
  const doc = {
    filename,
    content,
    isClosest: !!isClosest,
    uploadedAt: new Date(),
  };
  await col.insertOne(doc);
  log("insertOne", CHATS_COLLECTION, `filename=${filename} isClosest=${isClosest}`);
  return doc;
}

async function getChatsForAI() {
  const d = await getDb();
  const col = d.collection(CHATS_COLLECTION);
  const docs = await col.find({}).sort({ isClosest: -1, uploadedAt: 1 }).toArray();
  log("find", CHATS_COLLECTION, `AI context count=${docs.length}`);
  return docs;
}

async function hasChats() {
  const d = await getDb();
  const col = d.collection(CHATS_COLLECTION);
  const count = await col.countDocuments({});
  log("countDocuments", CHATS_COLLECTION, `hasChats=${count > 0}`);
  return count > 0;
}

async function hasClosestPerson() {
  const d = await getDb();
  const col = d.collection(CHATS_COLLECTION);
  const count = await col.countDocuments({ isClosest: true });
  log("countDocuments", CHATS_COLLECTION, `hasClosestPerson=${count > 0}`);
  return count > 0;
}

async function close() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    log("closed", "db");
  }
}

module.exports = {
  getDb,
  listChats,
  insertChat,
  getChatsForAI,
  hasChats,
  hasClosestPerson,
  close,
  MONGODB_URI,
};
