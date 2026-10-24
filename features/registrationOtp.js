'use strict';
/**
 * Email-OTP registration.
 *
 * Flow:
 *   1. POST /api/auth/register/request-otp { email, password }
 *      → stages a pending registration (password stored only as a scrypt
 *        hash) and emails a 6-digit code. The code itself is stored only
 *        as a SHA-256 hash.
 *   2. POST /api/auth/register/verify-otp { email, otp }
 *      → on success the real user account (role "user") is created and
 *        the pending record is deleted.
 *
 * Codes expire in 10 minutes, allow at most 5 attempts, and resends are
 * throttled per email. Pending records live in `pending_registrations`.
 */
const crypto = require('node:crypto');

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
// Abuse cap (2026-10-24): at most 3 OTP emails per email address in
// any rolling 24 hours. The old code only had a 60-second resend
// cooldown, so one address could be spammed with codes all day
// (mailbox flooding + SMTP cost + brute-force surface). The count
// is tracked on the pending record itself, so no new collection
// is needed; a successful registration deletes the record, and a
// brand-new registration for a different flow starts fresh.
const OTP_DAILY_LIMIT = 3;
const OTP_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const COLLECTION = 'pending_registrations';

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

async function collection() {
  const { getDb } = require('../db');
  const db = await getDb();
  return db.collection(COLLECTION);
}

/**
 * Stage (or re-stage) a pending registration and return the OTP to send.
 * Throws { code } errors: RESEND_TOO_SOON, OTP_DAILY_LIMIT.
 */
async function stagePendingRegistration({ email, passwordHash }) {
  const col = await collection();
  const clean = email.trim().toLowerCase();
  const now = Date.now();
  const existing = await col.findOne({ email: clean });
  // Daily cap first: a 4th code inside the rolling window is
  // refused even if the 60-second cooldown has passed.
  const windowStart = existing?.otpDailyWindowStart ? new Date(existing.otpDailyWindowStart).getTime() : 0;
  const windowFresh = windowStart && now - windowStart < OTP_DAILY_WINDOW_MS;
  const sentInWindow = windowFresh ? (existing.otpDailyCount || 0) : 0;
  if (sentInWindow >= OTP_DAILY_LIMIT) {
    const err = new Error('Maximum 3 verification codes per day for this email. Please try again tomorrow.');
    err.code = 'OTP_DAILY_LIMIT';
    throw err;
  }
  if (existing?.lastSentAt && now - new Date(existing.lastSentAt).getTime() < OTP_RESEND_COOLDOWN_MS) {
    const err = new Error('Please wait a minute before requesting another code');
    err.code = 'RESEND_TOO_SOON';
    throw err;
  }
  const otp = generateOtp();
  await col.updateOne(
    { email: clean },
    {
      $set: {
        email: clean,
        passwordHash,
        otpHash: hashOtp(otp),
        attempts: 0,
        expiresAt: new Date(now + OTP_TTL_MS),
        lastSentAt: new Date(now),
        createdAt: existing?.createdAt || new Date(now),
        otpDailyCount: sentInWindow + 1,
        otpDailyWindowStart: new Date(windowFresh ? windowStart : now),
      },
    },
    { upsert: true }
  );
  return { otp, expiresMinutes: OTP_TTL_MS / 60000 };
}

/**
 * Verify a code. Returns the staged { email, passwordHash } on success.
 * Throws { code }: NO_PENDING | OTP_EXPIRED | OTP_LOCKED | OTP_MISMATCH.
 */
async function verifyPendingRegistration({ email, otp }) {
  const col = await collection();
  const clean = String(email || '').trim().toLowerCase();
  const pending = await col.findOne({ email: clean });
  if (!pending) {
    const err = new Error('No verification is pending for this email. Request a code first.');
    err.code = 'NO_PENDING';
    throw err;
  }
  if (new Date(pending.expiresAt).getTime() < Date.now()) {
    await col.deleteOne({ email: clean });
    const err = new Error('This code has expired. Request a new one.');
    err.code = 'OTP_EXPIRED';
    throw err;
  }
  if ((pending.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    const err = new Error('Too many wrong attempts. Request a new code.');
    err.code = 'OTP_LOCKED';
    throw err;
  }
  const given = Buffer.from(hashOtp(String(otp || '').trim()));
  const expected = Buffer.from(String(pending.otpHash || ''));
  const match = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!match) {
    await col.updateOne({ email: clean }, { $inc: { attempts: 1 } });
    const err = new Error('Incorrect verification code');
    err.code = 'OTP_MISMATCH';
    throw err;
  }
  await col.deleteOne({ email: clean });
  return { email: clean, passwordHash: pending.passwordHash };
}

module.exports = {
  generateOtp,
  hashOtp,
  isValidEmail,
  stagePendingRegistration,
  verifyPendingRegistration,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_DAILY_LIMIT,
  OTP_DAILY_WINDOW_MS,
};
