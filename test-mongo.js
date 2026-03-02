/**
 * Quick MongoDB connection test.
 * Run: node test-mongo.js
 * Reads MONGODB_URI from .env and writes a test doc to verify.
 */
require("dotenv").config();
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("❌ MONGODB_URI not set in .env");
  process.exit(1);
}

async function test() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    const col = db.collection("connection_test");
    const doc = { test: true, at: new Date().toISOString() };
    await col.insertOne(doc);
    console.log("✅ MongoDB connected! Inserted:", doc);
  } catch (err) {
    console.error("❌ MongoDB failed:", err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

test();
