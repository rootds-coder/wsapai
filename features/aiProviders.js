'use strict';
/**
 * Unified multi-provider AI engine.
 *
 * Most modern AI providers — including every generous free tier —
 * expose an OpenAI-compatible chat API. This module keeps a registry
 * of those providers and a per-user config store (each dashboard user
 * brings their OWN keys; a tenant's configs never mix with the
 * owner's), then runs chat completions against the user's providers
 * in priority order with automatic fallback:
 *   active provider → other enabled providers → caller falls back to
 *   the legacy Gemini/OpenAI chain.
 *
 * Context & persona intent are provider-agnostic by construction: the
 * caller builds the full message array (system prompt + knowledge
 * base + stored history) and history lives in our own DB, so
 * switching providers mid-conversation loses nothing.
 *
 * Stored shape (settings collection, key `aiProviders:<userId>`):
 *   { configs: [{ providerId, apiKey, model, enabled }], activeProviderId }
 */
const crypto = require('crypto');
const { OpenAI } = require('openai');

const PROVIDERS = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    getKeyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AIza…',
    freeNote: 'Free tier: generous daily quota on Flash models',
    models: [
      // 2026-10-24, verified live on a new key: the OpenAI-compat
      // endpoint now refuses gemini-2.5-flash/2.0-flash to NEW users
      // ("no longer available to new users… use gemini-3.8-flash")
      // with a bare 404 through the SDK. 3.8-flash goes first so new
      // keys work out of the box; older models stay for old keys.
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', free: true },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', free: true },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', free: true },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', free: true },
    ],
    vision: true,
  },
  {
    id: 'groq',
    name: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    getKeyUrl: 'https://console.groq.com/keys',
    keyHint: 'gsk_…',
    freeNote: 'Free tier: very fast inference, daily token quota',
    models: [
      // Llama 3.3/3.1 were shut down for free + developer tiers on
      // 2026-08-16 — they stay at the END of the list (enterprise keys
      // still work) so a free/dev key never picks them first.
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', free: true },
      { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', free: true },
      { id: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B', free: true },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', free: true },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', free: true },
    ],
    vision: false,
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    baseURL: 'https://api.cerebras.ai/v1',
    getKeyUrl: 'https://cloud.cerebras.ai',
    keyHint: 'csk-…',
    freeNote: 'Free tier: extremely fast, high daily limits',
    models: [
      { id: 'llama-3.3-70b', label: 'Llama 3.3 70B', free: true },
      { id: 'llama3.1-8b', label: 'Llama 3.1 8B', free: true },
      { id: 'qwen-3-32b', label: 'Qwen 3 32B', free: true },
    ],
    vision: false,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    getKeyUrl: 'https://openrouter.ai/keys',
    keyHint: 'sk-or-…',
    freeNote: 'Free models marked :free (daily request cap without credits)',
    models: [
      // `openrouter/free` is OpenRouter's own auto-router: it picks a
      // currently-available free model itself. It is first on purpose —
      // it is the model that cannot go stale the way a named :free
      // model can (google/gemini-2.0-flash-exp:free died exactly this
      // way: "no provider serves this model anymore").
      { id: 'openrouter/free', label: 'Auto free (OpenRouter picks a working free model)', free: true },
      { id: 'openai/gpt-oss-20b:free', label: 'GPT-OSS 20B (free)', free: true },
      { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3 (free)', free: true },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)', free: true },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', free: false },
    ],
    vision: true,
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    baseURL: 'https://api.mistral.ai/v1',
    getKeyUrl: 'https://console.mistral.ai/api-keys',
    keyHint: '',
    freeNote: 'Free experiment tier with rate limits',
    models: [
      { id: 'mistral-small-latest', label: 'Mistral Small', free: true },
      { id: 'codestral-latest', label: 'Codestral', free: true },
    ],
    vision: false,
  },
  {
    id: 'sambanova',
    name: 'SambaNova',
    baseURL: 'https://api.sambanova.ai/v1',
    getKeyUrl: 'https://cloud.sambanova.ai/apis',
    keyHint: '',
    freeNote: 'Free trial credits for new accounts',
    models: [
      { id: 'Meta-Llama-3.3-70B-Instruct', label: 'Llama 3.3 70B Instruct', free: true },
      { id: 'DeepSeek-R1', label: 'DeepSeek R1', free: true },
    ],
    vision: false,
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    getKeyUrl: 'https://build.nvidia.com',
    keyHint: 'nvapi-…',
    freeNote: 'Free API credits via NVIDIA developer program',
    models: [
      { id: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B Instruct', free: true },
      { id: 'deepseek-ai/deepseek-r1', label: 'DeepSeek R1', free: true },
    ],
    vision: false,
  },
  {
    id: 'github',
    name: 'GitHub Models',
    baseURL: 'https://models.github.ai/inference',
    getKeyUrl: 'https://github.com/settings/tokens',
    keyHint: 'ghp_… / github_pat_…',
    freeNote: 'Free with a GitHub token (rate-limited playground quota)',
    models: [
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', free: true },
      { id: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B Instruct', free: true },
    ],
    vision: true,
  },
  {
    id: 'together',
    name: 'Together AI',
    baseURL: 'https://api.together.xyz/v1',
    getKeyUrl: 'https://api.together.ai/settings/api-keys',
    keyHint: '',
    freeNote: 'Dedicated free Llama endpoint + starter credits',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', label: 'Llama 3.3 70B Turbo (free)', free: true },
      { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', label: 'Llama 3.1 8B Turbo', free: false },
    ],
    vision: false,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-…',
    freeNote: 'Paid (no free tier) — best quality/reliability',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', free: false },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', free: false },
    ],
    vision: true,
  },
];

const byId = new Map(PROVIDERS.map((p) => [p.id, p]));

function getProvider(id) {
  return byId.get(String(id || '')) || null;
}

function listProviders() {
  return PROVIDERS.map((p) => ({ ...p }));
}

function defaultModel(providerId) {
  const p = getProvider(providerId);
  return p && p.models.length ? p.models[0].id : '';
}

// ── Key-only auto-model (Router 2.1) ───────────────────────────────
// The 2026-10-24 bug: a config stored exactly ONE model per provider,
// so one dead model (e.g. OpenRouter's google/gemini-2.0-flash-exp:free,
// "no provider serves this model anymore") killed the whole provider
// even though the key was fine — and a user with 3 good keys still got
// nothing because all 3 stored models were dead. Model IDs go stale
// constantly (providers retire them without notice), so the engine
// must never trust a stored model blindly.
//
// Rule from now on: the user only supplies a KEY. The engine tries,
// in order, (1) the stored/preferred model if any, then (2) every
// model in the provider's registry, and keeps the first one that
// actually answers. A 404 means "this model is dead, try the next
// model on the SAME provider" — it is not a dead provider. Only
// 401/403 means the key itself is bad and the provider is skipped.
// An empty stored model means "auto": start straight at the registry.
function candidateModels(providerId, preferredModel) {
  const p = getProvider(providerId);
  const seen = new Set();
  const out = [];
  for (const m of [preferredModel, ...(p ? p.models.map((x) => x.id) : [])]) {
    const id = String(m || '').trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

// ── Phase 2: free-only gate ──────────────────────────────────────────────────
// The registry is the source of truth: a model counts as free only
// when its own provider entry flags it free:true (free tiers differ
// per provider — e.g. gpt-4o-mini is paid on OpenAI but free on
// GitHub Models). A model missing from the registry is treated as
// NOT free: in free-only mode, unknown must never mean "charge it".
// (isFreeModel, defined below, is the existing check — reused here.)
/** candidateModels restricted to registry-flagged free models. */
function candidateModelsFree(providerId, preferredModel) {
  return candidateModels(providerId, preferredModel).filter((m) => isFreeModel(providerId, m));
}

function errorStatus(err) {
  return err?.status || err?.response?.status || null;
}

function isAuthError(err) {
  const s = errorStatus(err);
  return s === 401 || s === 403;
}

function isModelNotFound(err) {
  if (errorStatus(err) === 404) return true;
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('no longer available') || msg.includes('no provider serves') || msg.includes('model not found') || msg.includes('unknown model');
}

function maskKey(key) {
  const k = String(key || '');
  if (k.length <= 8) return k ? '••••' : '';
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

// ── Encryption at rest for provider keys ────────────────────────────
// Keys were originally stored as plaintext in Mongo (audit finding).
// New saves are AES-256-GCM encrypted under a key derived from
// SESSION_SECRET; reads transparently decrypt `enc:v1:` values and
// pass legacy plaintext through untouched, so existing credentials
// keep working and migrate on their next save. Without a usable
// SESSION_SECRET (local dev), storage stays plaintext.
function encryptionKey() {
  const s = process.env.SESSION_SECRET || '';
  if (s.length < 16) return null;
  return crypto.createHash('sha256').update(`ai-provider-keys:${s}`).digest();
}

function encryptSecret(plain) {
  const key = encryptionKey();
  if (!key || !plain) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `enc:v1:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')}`;
}

function decryptSecret(stored) {
  if (!stored || !String(stored).startsWith('enc:v1:')) return stored; // legacy plaintext
  const key = encryptionKey();
  if (!key) return stored;
  try {
    const buf = Buffer.from(String(stored).slice(7), 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return ''; // tampered/unreadable — treat as no key rather than leaking garbage
  }
}

// ── Per-user config store (settings collection via db.js) ──────────
async function loadConfigs(userId) {
  const db = require('../db');
  if (!db.MONGODB_URI) return { configs: [], activeProviderId: null, routingMode: 'manual' };
  try {
    const store = await db.getAiProviderConfigs(userId);
    return {
      ...store,
      routingMode: store.routingMode || 'manual',
      configs: (store.configs || []).map((c) => ({ ...c, apiKey: decryptSecret(c.apiKey) })),
    };
  } catch {
    return { configs: [], activeProviderId: null, routingMode: 'manual' };
  }
}

async function saveConfigs(userId, data) {
  const db = require('../db');
  const out = {
    ...data,
    configs: (data?.configs || []).map((c) => ({ ...c, apiKey: encryptSecret(c.apiKey) })),
  };
  return db.saveAiProviderConfigs(userId, out);
}

/** Provider IDs this user actually has a key for in the AI Providers
 *  tab. This is the check the WhatsApp gate, /api/config and the
 *  admin users list must use — NOT the legacy userApiKey field, which
 *  is a different, older key store (see index.js gate bug, 2026-10-24:
 *  a tenant with providers saved but no legacy key was told "Bot is
 *  not configured" and never reached this engine at all). */
async function configuredProviderIds(userId) {
  try {
    const store = await loadConfigs(userId);
    return (store?.configs || [])
      .filter((c) => c && c.apiKey && getProvider(c.providerId))
      .map((c) => c.providerId);
  } catch {
    return [];
  }
}

async function hasConfiguredProviders(userId) {
  return (await configuredProviderIds(userId)).length > 0;
}

/** Enabled configs with keys, active provider first, rest in saved order. */
function orderedCandidates(store) {
  const enabled = (store?.configs || []).filter((c) => c && c.enabled !== false && c.apiKey && getProvider(c.providerId));
  const active = enabled.filter((c) => c.providerId === store?.activeProviderId);
  const rest = enabled.filter((c) => c.providerId !== store?.activeProviderId);
  return [...active, ...rest];
}

// ── Smart Router 2.0: model metadata, health, routing modes ────────
// tier: rough quality rank (3 = strongest). ctx: usable context window
// in tokens. Values are estimates for routing decisions, labeled as
// such in the dashboard.
const MODEL_META = {
  'gemini-3.8-flash': { tier: 3, ctx: 1000000 },
  'gemini-2.5-flash': { tier: 3, ctx: 1000000 },
  'gemini-2.0-flash': { tier: 3, ctx: 1000000 },
  'gemini-2.5-flash-lite': { tier: 2, ctx: 1000000 },
  'llama-3.3-70b-versatile': { tier: 3, ctx: 131072 },
  'llama-3.3-70b': { tier: 3, ctx: 131072 },
  'llama-3.1-8b-instant': { tier: 1, ctx: 131072 },
  'llama3.1-8b': { tier: 1, ctx: 131072 },
  'qwen-3-32b': { tier: 2, ctx: 131072 },
  'openai/gpt-oss-120b': { tier: 3, ctx: 131072 },
  'openai/gpt-oss-20b': { tier: 2, ctx: 131072 },
  'openai/gpt-oss-20b:free': { tier: 2, ctx: 131072 },
  'qwen/qwen3.8-27b': { tier: 2, ctx: 131072 },
  'openrouter/free': { tier: 2, ctx: 131072 },
  'deepseek/deepseek-chat-v3-0324:free': { tier: 3, ctx: 163840 },
  'meta-llama/llama-3.3-70b-instruct:free': { tier: 3, ctx: 131072 },
  'google/gemini-2.0-flash-exp:free': { tier: 3, ctx: 1000000 },
  'openai/gpt-4o-mini': { tier: 3, ctx: 128000 },
  'gpt-4o-mini': { tier: 3, ctx: 128000 },
  'gpt-4.1-mini': { tier: 3, ctx: 128000 },
  'mistral-small-latest': { tier: 2, ctx: 128000 },
  'codestral-latest': { tier: 2, ctx: 128000 },
  'Meta-Llama-3.3-70B-Instruct': { tier: 3, ctx: 131072 },
  'DeepSeek-R1': { tier: 3, ctx: 163840 },
  'meta/llama-3.3-70b-instruct': { tier: 3, ctx: 131072 },
  'deepseek-ai/deepseek-r1': { tier: 3, ctx: 163840 },
  'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free': { tier: 3, ctx: 131072 },
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': { tier: 1, ctx: 131072 },
};
const DEFAULT_META = { tier: 2, ctx: 32768 };

function modelMeta(providerId, modelId) {
  return MODEL_META[modelId] || DEFAULT_META;
}

function isFreeModel(providerId, modelId) {
  const p = getProvider(providerId);
  const m = p?.models.find((x) => x.id === modelId);
  return !!(m && m.free);
}

// In-memory provider health per user (per process; the bot runs as a
// single PM2 process). Persisted usage lives in the DB — health is
// deliberately ephemeral: after a restart every provider gets a fresh
// chance, which doubles as automatic recovery.
const healthMap = new Map();
function healthFor(userId, providerId) {
  const k = `${userId}:${providerId}`;
  if (!healthMap.has(k)) {
    healthMap.set(k, { ok: 0, fail: 0, consec: 0, cooldownUntil: 0, lastOkAt: 0, lastFailAt: 0, lastError: '', latEma: 0 });
  }
  return healthMap.get(k);
}

function recordSuccess(userId, providerId, latencyMs) {
  const h = healthFor(userId, providerId);
  h.ok += 1;
  h.consec = 0;
  h.cooldownUntil = 0;
  h.lastOkAt = Date.now();
  h.latEma = h.latEma ? Math.round(h.latEma * 0.7 + latencyMs * 0.3) : latencyMs;
  return h;
}

function retryAfterMs(err) {
  const headers = err?.headers || err?.response?.headers || {};
  const raw = headers['retry-after'] || headers['Retry-After'];
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, 15 * 60 * 1000);
  return 0;
}

function recordFailure(userId, providerId, err) {
  const h = healthFor(userId, providerId);
  h.fail += 1;
  h.consec += 1;
  h.lastFailAt = Date.now();
  h.lastError = String(err?.message || err || '').slice(0, 160);
  // Circuit breaker: honor Retry-After on 429s; otherwise 3 strikes
  // in a row parks the provider for 5 minutes so chats stop paying
  // the timeout cost on a dead provider.
  const ra = retryAfterMs(err);
  if (ra > 0) h.cooldownUntil = Date.now() + ra;
  else if (h.consec >= 3) h.cooldownUntil = Date.now() + 5 * 60 * 1000;
  return h;
}

function isCoolingDown(userId, providerId) {
  return healthFor(userId, providerId).cooldownUntil > Date.now();
}

const ROUTING_MODES = ['manual', 'free-first', 'fastest', 'quality', 'balanced'];

// ── Persona routing (2026-10-24) ───────────────────────────────────
// A persona is a prompt, not a model — no model is inherently a
// "boy" or "girl" model. But models differ in what they do well:
// Hinglish emotional nuance vs fast casual banter vs general
// reasoning. So each persona gets a PREFERRED provider order, tried
// before the rest of the user's configured pool:
//
//   devil: no preference — the full pool, as before.
//   girl (Annu): gemini first (strongest Hinglish emotional nuance,
//     and Annu's native path already runs on Gemini), then large
//     conversational models (mistral, together), then openrouter,
//     then openai. Reasoning-heavy groq/gpt-oss sits in the fallback
//     tail, not the lead, because it answers feelings analytically.
//   boy (Dhruv): groq first (fast, slang-friendly banter), then
//     cerebras (also very fast), then openrouter, then gemini.
//
// This is PREFERRED-FIRST, not strict: if a persona's preferred
// providers are not configured for this user, or all of them fail,
// the engine falls through to the user's remaining providers
// instead of failing the chat. A tenant with only Groq still gets
// an Annu reply (via Groq), just not a Gemini-first one. Persona
// order overrides the routing-mode order for that persona's chats
// (specific beats general); the routing mode still orders the
// fallback tail and all Devil chats. Cooling providers sink to
// the end of their own group, so a dead preferred provider never
// blocks a healthy fallback.
const PERSONA_PROVIDER_ORDER = {
  girl: ['gemini', 'mistral', 'together', 'openrouter', 'openai'],
  boy: ['groq', 'cerebras', 'openrouter', 'gemini'],
};

function normalizePersona(persona) {
  if (persona === 'girl' || persona === 'annu') return 'girl';
  if (persona === 'boy') return 'boy';
  return null;
}

function applyPersonaOrder(candidates, persona, userId) {
  const key = normalizePersona(persona);
  if (!key || !PERSONA_PROVIDER_ORDER[key]) return [...candidates];
  const rank = new Map(PERSONA_PROVIDER_ORDER[key].map((id, i) => [id, i]));
  const preferred = candidates.filter((c) => rank.has(c.providerId))
    .sort((a, b) => rank.get(a.providerId) - rank.get(b.providerId));
  const rest = candidates.filter((c) => !rank.has(c.providerId));
  const ready = (list) => list.filter((c) => !isCoolingDown(userId, c.providerId));
  const cooling = (list) => list.filter((c) => isCoolingDown(userId, c.providerId));
  return [...ready(preferred), ...ready(rest), ...cooling(preferred), ...cooling(rest)];
}

/** Order candidates according to the user's routing mode. Providers in
 *  cooldown sink to the end (never fully excluded — a chat with only a
 *  cooling provider still tries it rather than failing outright). */
function orderByMode(candidates, mode, userId, store) {
  const list = [...candidates];
  const h = (c) => healthFor(userId, c.providerId);
  const meta = (c) => modelMeta(c.providerId, c.model || defaultModel(c.providerId));
  let sorted;
  switch (mode) {
    case 'free-first':
      sorted = list.sort((a, b) =>
        Number(isFreeModel(b.providerId, b.model || defaultModel(b.providerId))) -
        Number(isFreeModel(a.providerId, a.model || defaultModel(a.providerId))));
      break;
    case 'fastest':
      sorted = list.sort((a, b) => (h(a).latEma || 1500) - (h(b).latEma || 1500));
      break;
    case 'quality':
      sorted = list.sort((a, b) => meta(b).tier - meta(a).tier);
      break;
    case 'balanced':
      sorted = list.sort((a, b) => {
        const score = (c) => meta(c).tier * 1000 - (h(c).latEma || 1200) / 10 - h(c).consec * 400;
        return score(b) - score(a);
      });
      break;
    default: // manual — orderedCandidates already put the active first
      sorted = list;
  }
  const ready = sorted.filter((c) => !isCoolingDown(userId, c.providerId));
  const cooling = sorted.filter((c) => isCoolingDown(userId, c.providerId));
  return [...ready, ...cooling];
}

// ── Context compatibility ───────────────────────────────────────────
// Canonical messages are { role, content } — every provider here
// accepts that shape. fitContext estimates tokens (~4 chars/token)
// and, when a model's window is too small, drops the OLDEST
// non-system messages first. System messages (persona + knowledge
// base) and the newest turns are never dropped, and the caller's
// array is never mutated — so a mid-conversation provider switch
// replays the same intent, trimmed only as much as that model needs.
function estimateTokens(messages) {
  let chars = 0;
  for (const m of messages || []) chars += String(m?.content || '').length + 16;
  return Math.ceil(chars / 4);
}

function fitContext(messages, ctxTokens, reserveTokens = 1024) {
  const budget = Math.max(2000, (ctxTokens || DEFAULT_META.ctx) - reserveTokens);
  if (estimateTokens(messages) <= budget) return messages;
  const system = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  const kept = [];
  let used = estimateTokens(system);
  for (let i = rest.length - 1; i >= 0; i--) {
    const t = estimateTokens([rest[i]]);
    if (used + t > budget && kept.length > 0) break;
    kept.unshift(rest[i]);
    used += t;
  }
  return [...system, ...kept];
}

// ── Chat execution with fallback ────────────────────────────────────
const clientCache = new Map();
function defaultClientFactory(cfg) {
  const fp = `${cfg.providerId}|${cfg.apiKey.slice(0, 6)}|${cfg.apiKey.slice(-4)}`;
  if (!clientCache.has(fp)) {
    const p = getProvider(cfg.providerId);
    clientCache.set(fp, new OpenAI({ apiKey: cfg.apiKey, baseURL: p.baseURL }));
  }
  return clientCache.get(fp);
}

function isRetryable(err) {
  const status = err?.status || err?.response?.status;
  if (!status) return true; // network/timeout — try the next provider
  return status === 401 || status === 403 || status === 404 || status === 429 || status >= 500;
}

/**
 * Find a model that actually answers for this key: try the preferred
 * model first, then every registry model for the provider, in order.
 * Returns { ok, model, tried: [{model, error}] }. A 401/403 stops the
 * search immediately (the key is bad — no model will fix it); a 404
 * just moves on to the next model. Shared by Test Key and by chat's
 * self-heal, so "does this key work?" is never answered from one
 * possibly-dead model again.
 */
async function resolveWorkingModel(providerId, apiKey, preferredModel, clientFactory) {
  const provider = getProvider(providerId);
  if (!provider) return { ok: false, error: 'Unknown provider', tried: [] };
  if (!apiKey) return { ok: false, error: 'No API key provided', tried: [] };
  const factory = clientFactory || defaultClientFactory;
  const models = candidateModels(providerId, preferredModel);
  const tried = [];
  for (const model of models) {
    try {
      const client = factory({ providerId, apiKey });
      // 64 tokens, not 8: thinking models (Gemini 3.8 Flash included)
      // spend hidden reasoning tokens first, so an 8-token probe
      // returns an empty "length"-truncated reply for a model that
      // actually works fine on a real chat.
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_tokens: 64,
        temperature: 0,
      });
      if (res?.choices?.[0]?.message?.content?.trim()) return { ok: true, model, tried };
      tried.push({ model, error: 'Empty response' });
    } catch (err) {
      tried.push({ model, error: err.message || String(err) });
      if (isAuthError(err)) break;
      if (!isRetryable(err)) break;
    }
  }
  const auth = tried.some((t) => /401|403/.test(t.error));
  return {
    ok: false,
    tried,
    error: auth
      ? `${provider.name} rejected the key (HTTP 401/403) — the key itself is bad, not the model`
      : `${provider.name}: no working model found (tried: ${tried.map((t) => t.model).join(', ')})`,
  };
}

/**
 * Run a chat completion against the user's providers in priority
 * order. Returns { text, providerId, model, usage } or throws an
 * error with .attempts = [{providerId, error}] when all fail.
 * clientFactory is injectable for tests.
 */
async function chatCompletion({ userId, messages, temperature = 0.85, maxTokens = 512, clientFactory, persona, freeOnly = false } = {}) {
  const store = await loadConfigs(userId);
  const mode = ROUTING_MODES.includes(store.routingMode) ? store.routingMode : 'manual';
  let candidates = orderByMode(orderedCandidates(store), mode, userId, store);
  if (normalizePersona(persona)) candidates = applyPersonaOrder(candidates, persona, userId);
  if (!candidates.length) {
    const err = new Error('No AI provider configured');
    err.code = 'NO_PROVIDER';
    err.attempts = [];
    throw err;
  }
  // Phase 2 free-only gate: automated (non-chat) calls — memory
  // summaries, tool reasoning — must never touch a paid model.
  // Providers with no registry-flagged free model drop out here;
  // if none remain, the caller gets NO_FREE_PROVIDER (not a silent
  // paid fallback) so it can tell the user to add a free key.
  if (freeOnly) {
    candidates = candidates.filter((c) => candidateModelsFree(c.providerId, c.model).length > 0);
    if (!candidates.length) {
      const err = new Error('No free AI provider configured');
      err.code = 'NO_FREE_PROVIDER';
      err.attempts = [];
      throw err;
    }
  }
  const factory = clientFactory || defaultClientFactory;
  const db = require('../db');
  const attempts = [];
  for (const cfg of candidates) {
    const provider = getProvider(cfg.providerId);
    // Auto-model: try the stored model first, then every registry
    // model for this provider, before ever blaming the key/provider.
    // A 404 (dead model) moves to the next MODEL, not the next
    // provider; only 401/403 (bad key) skips the provider outright.
    // The provider is charged ONE failure for the whole model sweep,
    // not one per dead model, so the circuit breaker still means
    // "3 bad chats", not "1 chat with 3 dead models".
    const models = freeOnly
      ? candidateModelsFree(cfg.providerId, cfg.model)
      : candidateModels(cfg.providerId, cfg.model);
    let lastErr = null;
    let stopAll = false;
    let result = null;
    for (const model of models) {
      // Per-model context fit: the same canonical conversation,
      // trimmed only as much as THIS model's window requires.
      const fitted = fitContext(messages, modelMeta(cfg.providerId, model).ctx, maxTokens + 512);
      const started = Date.now();
      try {
        const client = factory(cfg);
        const res = await client.chat.completions.create({
          model,
          messages: fitted,
          temperature,
          max_tokens: maxTokens,
        });
        const text = res?.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error('Empty response from provider');
        const latencyMs = Date.now() - started;
        recordSuccess(userId, cfg.providerId, latencyMs);
        // Self-heal: remember the model that actually worked, so the
        // next chat goes straight to it instead of re-trying the dead
        // one. Fire-and-forget — a stats/DB write must never break a
        // chat that already succeeded.
        if (model !== cfg.model && db.MONGODB_URI) {
          saveConfigs(userId, {
            ...store,
            configs: store.configs.map((c) => (c.providerId === cfg.providerId ? { ...c, model } : c)),
          }).catch(() => {});
        }
        if (db.MONGODB_URI) {
          db.recordAiUsage(userId, cfg.providerId, {
            pt: res.usage?.prompt_tokens || 0,
            ct: res.usage?.completion_tokens || 0,
            route: attempts.length
              ? { from: attempts[attempts.length - 1].providerId, reason: attempts[attempts.length - 1].error }
              : null,
          }).catch(() => {});
        }
        result = {
          text,
          providerId: cfg.providerId,
          providerName: provider.name,
          model,
          usage: res.usage || null,
          latencyMs,
          routingMode: mode,
          persona: normalizePersona(persona),
          attempts,
        };
        break;
      } catch (err) {
        lastErr = err;
        if (isAuthError(err)) break; // bad key — no model on this provider will work
        if (!isRetryable(err)) { stopAll = true; break; }
        // else: 404/429/5xx/network — try the next model on this provider
      }
    }
    if (result) return result;
    recordFailure(userId, cfg.providerId, lastErr || new Error('Provider failed'));
    if (db.MONGODB_URI) db.recordAiUsage(userId, cfg.providerId, { fail: 1 }).catch(() => {});
    attempts.push({ providerId: cfg.providerId, error: lastErr?.message || String(lastErr), models });
    if (stopAll) break;
  }
  const err = new Error('All configured AI providers failed');
  err.code = 'ALL_PROVIDERS_FAILED';
  err.attempts = attempts;
  throw err;
}

/** Validate a key with the smallest possible real chat calls. Unlike
 *  before, this does NOT judge a key by one model: it tries the
 *  requested model first, then every registry model, and reports the
 *  model that actually worked (so the UI can save that one). A key
 *  whose only problem was a dead model now passes. */
async function testProviderKey(providerId, apiKey, model, clientFactory) {
  const provider = getProvider(providerId);
  if (!provider) return { ok: false, error: 'Unknown provider' };
  if (!apiKey) return { ok: false, error: 'No API key provided' };
  const resolved = await resolveWorkingModel(providerId, apiKey, model, clientFactory);
  if (resolved.ok) {
    return {
      ok: true,
      model: resolved.model,
      message: `${provider.name} key works (model: ${resolved.model})${resolved.tried.length ? ` — ${resolved.tried.length} dead model(s) skipped` : ''}`,
    };
  }
  return { ok: false, error: resolved.error, tried: resolved.tried };
}

module.exports = {
  PROVIDERS,
  ROUTING_MODES,
  getProvider,
  listProviders,
  defaultModel,
  maskKey,
  loadConfigs,
  saveConfigs,
  orderedCandidates,
  orderByMode,
  PERSONA_PROVIDER_ORDER,
  normalizePersona,
  applyPersonaOrder,
  modelMeta,
  isFreeModel,
  healthFor,
  recordSuccess,
  recordFailure,
  isCoolingDown,
  estimateTokens,
  fitContext,
  encryptSecret,
  decryptSecret,
  chatCompletion,
  testProviderKey,
  isRetryable,
  candidateModels,
  candidateModelsFree,
  isAuthError,
  isModelNotFound,
  resolveWorkingModel,
  configuredProviderIds,
  hasConfiguredProviders,
};
