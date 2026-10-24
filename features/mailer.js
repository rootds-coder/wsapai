'use strict';
/**
 * Outbound mail for OTP verification, via the owner's serv00 mailbox
 * (SMTP submission on the account's own node, s13.serv00.com:587 — note mail.serv00.com routes to a different mail node that does not know this account's mailboxes and rejects auth with 535). Configuration lives in the
 * `settings` collection (key: "mailConfig") so the admin can set it from
 * the dashboard without touching the server:
 *   { host, port, user, pass, from }
 * Environment variables (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/
 * SMTP_FROM) take precedence when present.
 *
 * When mail is not configured the module reports isConfigured()=false
 * and the registration flow refuses to start instead of pretending to
 * have sent a code.
 */
const crypto = require('crypto');
const nodemailer = require('nodemailer');

async function getMailConfig() {
  const envCfg = {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 0,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  };
  if (envCfg.host && envCfg.user && envCfg.pass) {
    return { ...envCfg, port: envCfg.port || 587, from: envCfg.from || envCfg.user, source: 'env' };
  }
  try {
    const { getDb } = require('../db');
    const db = await getDb();
    const doc = await db.collection('settings').findOne({ key: 'mailConfig' });
    const v = doc?.value || {};
    if (v.host && v.user && v.pass) {
      return {
        host: String(v.host),
        port: Number(v.port) || 587,
        user: String(v.user),
        pass: String(v.pass),
        from: String(v.from || v.user),
        source: 'db',
      };
    }
  } catch {}
  return null;
}

async function isMailConfigured() {
  return !!(await getMailConfig());
}

let cachedTransport = null;
let cachedTransportKey = '';

function transportFor(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

async function getTransport() {
  const cfg = await getMailConfig();
  if (!cfg) return null;
  // The cache key MUST include a fingerprint of the password: with a
  // host|port|user-only key, a corrected password saved from the
  // dashboard was never actually tried — the stale transport kept
  // authenticating with the old password until a server restart.
  const passFp = crypto.createHash('sha256').update(String(cfg.pass)).digest('hex').slice(0, 12);
  const key = `${cfg.host}|${cfg.port}|${cfg.user}|${passFp}`;
  if (!cachedTransport || cachedTransportKey !== key) {
    cachedTransport = transportFor(cfg);
    cachedTransportKey = key;
  }
  return { transport: cachedTransport, cfg };
}

/** Merge an explicit (unsaved) config over the saved one — used by the
 *  admin "send test email" action so what is typed in the form is what
 *  gets tested. Empty fields fall back to the saved values. */
async function resolveOverrideConfig(override) {
  if (!override || typeof override !== 'object') return null;
  const base = (await getMailConfig()) || { host: '', port: 587, user: '', pass: '', from: '' };
  const cfg = {
    host: String(override.host || base.host || '').trim(),
    port: Number(override.port) || base.port || 587,
    user: String(override.user || base.user || '').trim(),
    pass: override.pass ? String(override.pass) : (base.pass || ''),
    from: String(override.from || base.from || '').trim(),
  };
  cfg.from = cfg.from || cfg.user;
  if (!cfg.host || !cfg.user || !cfg.pass) return null;
  return cfg;
}

async function sendMail({ to, subject, text, html, configOverride }) {
  let ctx = null;
  if (configOverride) {
    const oCfg = await resolveOverrideConfig(configOverride);
    if (oCfg) ctx = { transport: transportFor(oCfg), cfg: oCfg };
  }
  if (!ctx) ctx = await getTransport();
  if (!ctx) {
    const err = new Error('Mail service is not configured');
    err.code = 'MAIL_NOT_CONFIGURED';
    throw err;
  }
  const info = await ctx.transport.sendMail({
    from: `"Devil AI" <${ctx.cfg.from}>`,
    to,
    subject,
    text,
    html: html || undefined,
  });
  return { ok: true, messageId: info.messageId };
}

async function sendOtpEmail(to, otp, expiresMinutes = 10) {
  const subject = `Your Devil AI verification code: ${otp}`;
  const text = [
    'Welcome to Devil AI!',
    '',
    `Your email verification code is: ${otp}`,
    '',
    `This code expires in ${expiresMinutes} minutes.`,
    'If you did not request this code, you can safely ignore this email.',
    '',
    '— Devil AI',
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 8px">Welcome to Devil AI 👋</h2>
    <p style="color:#444">Use this code to verify your email and finish creating your account:</p>
    <div style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#f4f4f5;border-radius:12px;padding:16px;text-align:center">${otp}</div>
    <p style="color:#666;font-size:13px">This code expires in ${expiresMinutes} minutes. If you didn't request it, ignore this email.</p>
  </div>`;
  return sendMail({ to, subject, text, html });
}

/** Save mail config (admin API). Password is stored server-side only and
 *  never returned by getMailConfigSafe. */
async function saveMailConfig({ host, port, user, pass, from }) {
  const { getDb } = require('../db');
  const db = await getDb();
  const existing = await db.collection('settings').findOne({ key: 'mailConfig' });
  const prev = existing?.value || {};
  const value = {
    host: String(host || prev.host || 's13.serv00.com').trim(),
    port: Number(port) || Number(prev.port) || 587,
    user: String(user || prev.user || '').trim(),
    // empty password field = keep the previous password
    pass: pass ? String(pass) : String(prev.pass || ''),
    from: String(from || prev.from || user || prev.user || '').trim(),
  };
  await db.collection('settings').updateOne(
    { key: 'mailConfig' },
    { $set: { key: 'mailConfig', value, updatedAt: new Date() } },
    { upsert: true }
  );
  cachedTransport = null;
  cachedTransportKey = '';
  return { host: value.host, port: value.port, user: value.user, from: value.from, hasPassword: !!value.pass };
}

async function getMailConfigSafe() {
  const cfg = await getMailConfig();
  if (!cfg) return { configured: false };
  return {
    configured: true,
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    from: cfg.from,
    source: cfg.source,
  };
}

module.exports = { getMailConfig, isMailConfigured, sendMail, sendOtpEmail, saveMailConfig, getMailConfigSafe };
