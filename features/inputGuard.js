'use strict';
/**
 * NoSQL operator injection guard (2026-10-24).
 *
 * MongoDB interprets an object value like { "$ne": "" } as an
 * operator, not a string. Most handlers already coerce identifiers
 * with String(), but a single missed one (e.g. a jid, key, or id
 * taken straight from JSON) would let a crafted request bypass a
 * query filter or match documents it should not. This middleware
 * rejects any request whose body, query, or params contain an
 * object key starting with "$" (or a null byte in a string) with
 * 400, before any handler or DB call runs. Legitimate payloads
 * never use "$"-prefixed keys: persona prompts, messages, and
 * filenames are string VALUES, which this does not touch.
 */
function hasMongoOperator(value, seen = new Set()) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.includes('\0');
  if (typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((v) => hasMongoOperator(v, seen));
  return Object.keys(value).some((k) => k.startsWith('$') || hasMongoOperator(value[k], seen));
}

function rejectMongoOperators(req, res, next) {
  if (hasMongoOperator(req.body) || hasMongoOperator(req.query) || hasMongoOperator(req.params)) {
    return res.status(400).json({ ok: false, error: 'Invalid request data' });
  }
  return next();
}

module.exports = { hasMongoOperator, rejectMongoOperators };
