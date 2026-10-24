/**
 * Advanced Analytics & 24-Hour Peak Heatmap Engine
 * Aggregates hourly message distributions, persona utilization breakdown, and system latencies.
 */
const { getDb } = require("../db");

const MESSAGE_HISTORY_COLLECTION = "message_history";
const CONTACTS_COLLECTION = "contacts";

async function getHourlyActivity() {
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));

  try {
    const db = await getDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const messages = await db
      .collection(MESSAGE_HISTORY_COLLECTION)
      .find({ timestamp: { $gte: today } }, { projection: { timestamp: 1 } })
      .toArray();

    for (const msg of messages) {
      if (msg.timestamp) {
        const d = new Date(msg.timestamp);
        const h = d.getHours();
        if (h >= 0 && h < 24) {
          hourly[h].count += 1;
        }
      }
    }
  } catch (err) {
    console.error("[AnalyticsEngine] getHourlyActivity error:", err.message);
  }

  return hourly;
}

async function getPersonaDistribution() {
  const distribution = {
    devil: 0,
    boy: 0,
    girl: 0,
    auto: 0,
    manual: 0,
  };

  try {
    const db = await getDb();
    const contacts = await db.collection(CONTACTS_COLLECTION).find({}, { projection: { mode: 1 } }).toArray();
    for (const c of contacts) {
      const mode = c.mode || "devil";
      if (distribution[mode] !== undefined) {
        distribution[mode] += 1;
      } else {
        distribution.devil += 1;
      }
    }
  } catch (err) {
    console.error("[AnalyticsEngine] getPersonaDistribution error:", err.message);
  }

  const total = Object.values(distribution).reduce((a, b) => a + b, 0) || 1;
  return {
    distribution,
    percentages: {
      devil: Math.round((distribution.devil / total) * 100),
      boy: Math.round((distribution.boy / total) * 100),
      girl: Math.round((distribution.girl / total) * 100),
      auto: Math.round((distribution.auto / total) * 100),
      manual: Math.round((distribution.manual / total) * 100),
    },
    totalContacts: total,
  };
}

module.exports = {
  getHourlyActivity,
  getPersonaDistribution,
};
