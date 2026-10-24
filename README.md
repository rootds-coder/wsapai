<div align="center">

# 😈 Devil AI

### Multi-persona WhatsApp AI automation — one bot, many personalities, many users.

**Node.js · Baileys · MongoDB · React dashboard**

> Your WhatsApp, answered like a human — by Devil, Annu, or Dhruv Mode —
> with reminders, notes and payments built in. No paid APIs required.

</div>

---

## ✨ What is Devil AI?

Devil AI connects a WhatsApp number to an AI engine and a web dashboard.
Contacts message the number, a persona replies, and everything is managed
from the dashboard — conversations, personas, AI providers, reminders,
payments and live activity.

**The core idea is simple:**

| You do | Devil AI does |
| --- | --- |
| Paste **one provider key** | The engine picks a working model **automatically** — no model selection, ever |
| Pick a persona for a contact | Every reply sounds like that persona |
| Ask it to remind, note, or collect | It acts — reminder, CRM note, or a scannable payment QR |

---

## 🎭 Personas

| Persona | Style |
| --- | --- |
| **Devil** | Sharp, confident, full-capability assistant |
| **Annu Mode** | Warm, friendly, Hinglish conversational persona |
| **Dhruv Mode** | Casual, brotherly, short-and-real Hinglish replies |
| **Custom** | Build your own in Persona Studio — any tone, any instructions |

Switch a contact's persona anytime from the dashboard, or let them pick
from the on-chat menu (`MENU` → persona number). `STOP` pauses the bot
for a contact, `START` resumes it.

## 🧩 Features

- **Multi-user, fully isolated** — every account gets its own WhatsApp
  connection, contacts, history, knowledge base, personas and API keys.
  Your keys never fall back to anyone else's.
- **Multi-provider AI engine** — Groq, OpenRouter, Gemini, Mistral,
  Together, Cerebras, OpenAI and more behind one endpoint. If a model
  retires or errors, the engine sweeps to the next working model on the
  same provider, then the next provider. The winning model is remembered
  (self-healing).
- **Agent tools (free-tier only)** — the bot can, from plain chat:
  - ⏰ **Set reminders** (1 minute to 7 days) — delivered in-chat, never twice
  - 📝 **Save notes** to the contact's CRM record
  - 💸 **Create payment links** — sent as a **styled, scannable QR**
    (payee comes only from the owner's saved UPI ID, never from the model)
- **Live Feed** — every question → reply pair, badged with the persona
  that answered it. Verify tests from the dashboard, no screenshots needed.
- **Per-user Don Away** — away mode, away message and away voice note,
  set independently per account.
- **Contact memory** — long-term memory per contact: rolling summaries
  plus explicit facts ("mera naam X hai"), injected into future replies.
- **AI disclosure (opt-in)** — an optional first-reply note telling the
  contact they're talking to an AI.
- **Voice & vision** — voice-note transcription and spoken replies
  (free neural voices), image understanding, per-persona voice choice.
- **Knowledge base** — upload `.txt` / `.pdf`, scrape public URLs
  (SSRF-guarded), keyword-triggered media.
- **Broadcast & drips** — campaigns with pacing and inactivity follow-ups
  (master admin only).
- **Disconnect alerts & daily backups** — stored per owner, shown live on
  the dashboard; backups keep the newest 7 archives.
- **Security built in** — scrypt password hashing, encrypted provider
  keys at rest, session regeneration on login, OTP capped at 3/day,
  per-tenant data scoping, and safe error handling (no stacks or DB
  internals ever reach the client).

---

## 🚀 Quick start

### Prerequisites

- **Node.js 20+**
- **MongoDB** (Atlas or local)
- At least **one free AI provider key** (Groq / OpenRouter / Gemini…)

### 1. Install

```bash
npm ci
cd client && npm ci && npm run build && cd ..
```

### 2. Configure

```bash
cp .env.example .env   # then fill in real values — see below
```

### 3. Run

```bash
npm start
```

Open **http://localhost:3000** and log in as `admin` with your
`ADMIN_PASSWORD`.

### 4. Connect WhatsApp

Dashboard → WhatsApp → scan the QR code with the phone whose number
the bot should use. Done — the bot is live on that number.

> ⚠️ **Use it responsibly.** WhatsApp automation here runs on Baileys,
> an unofficial client. Test on your own numbers, keep volumes low,
> never bulk-message strangers — aggressive automation risks the number.

---

## ⚙️ Configuration

### Required (production refuses to start without these)

| Variable | Notes |
| --- | --- |
| `ADMIN_PASSWORD` | ≥ 12 chars. The **only** master-admin credential — no defaults, no fallbacks |
| `SESSION_SECRET` | ≥ 32 random chars: `openssl rand -hex 32` |
| `MONGODB_URI` | MongoDB connection string |

### AI providers (at least one)

| Variable | Notes |
| --- | --- |
| `GROQ_API_KEY` / `OPENROUTER_API_KEY` / `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `OPENAI_API_KEY` | Paste keys in the dashboard instead if you prefer — dashboard keys are encrypted at rest |

Tenant (non-admin) users add their **own** keys in the dashboard under
**Providers → Add a Provider**: tap a provider, paste the key, done.
Model selection is automatic — that is the whole point.

### Optional

| Variable | Notes |
| --- | --- |
| `PORT` | Default `3000` |
| `ENABLE_WHATSAPP` | Set `false` to run dashboard-only |
| `WA_AUTH_FOLDER` | Baileys session storage (default `./auth_info_baileys`) |
| `KEEP_ALIVE_ENABLED` / `KEEP_ALIVE_INTERVAL` | Keep-alive ping for hosts that sleep |
| `GROUP_AI_*` | Opt-in group AI: allowlisted group JIDs, cooldowns, profanity toggle |
| `ALLOWED_ORIGIN` / `APP_URL` | Public app URL for cross-origin Socket.io |

Full list with comments: [`.env.example`](.env.example)

---

## 🧭 Dashboard guide

| Section | What you do there |
| --- | --- |
| **Overview** | Health, provider network, routing order, distribution, timeline |
| **Providers** | Add / test / remove keys, set the primary provider (manual mode only) |
| **Personas** | Create and tune Devil, Annu, Dhruv Mode and custom personas |
| **Contacts & CRM** | Lead stages, notes, direct chat control, per-contact memory |
| **Live Feed** | Question → reply pairs with persona badges, live |
| **Agent Tools** | Your UPI ID (for payment QRs), per-persona voices, reminders list |
| **Settings** | Away message & voice note, AI disclosure, mail server, backups |

**Everyday flows:**

- **Payment:** contact asks for a payment link → bot confirms amount →
  sends a branded QR → contact scans with GPay / PhonePe and pays.
  (No gateway, no fee — a plain UPI deep link inside the QR.)
- **Reminder:** "1 min baad yaad dilana" → bot confirms → reminder
  arrives in-chat at the right time.
- **New user:** register with email + password → 6-digit OTP by email
  → account verified → connect your own WhatsApp → add your own keys.

---

## 🗂️ Project structure

```
index.js            Server, API routes, WhatsApp (Baileys) gateway — wiring only
db.js               MongoDB data layer (per-tenant scoping)
gpt.js              AI provider orchestration (chat, vision, voice)
features/           Feature modules — all new logic lives here
  aiProviders.js    Multi-provider engine, auto-model sweep, free-only gate
  agentTools.js     Reminders, notes, UPI links + styled QR
  contactMemory.js  Per-contact long-term memory
  liveFeed.js       Question → reply feed with persona badges
  freeVoiceEngine.js Free neural voices (Edge TTS) per persona
  aiDisclosure.js   Opt-in AI disclosure
  alerts.js         Disconnect alerts
  backup.js         Daily DB backup scheduler
  rulesEngine.js    Auto-rules (keyword triggers, seeded rules)
  qrStyle.js        Branded payment-QR renderer
  geminiEngine.js   Legacy Gemini persona path
  ...               Group AI, Annu engine, security shield, webhooks, vault…
routes/             Modular feature API routes
client/             React + Vite dashboard (builds to dist/, served by the server)
tests/              node:test suites (features + security regressions)
docs/history/       Archived change summaries from earlier iterations
```

**House rule:** new feature logic goes in `features/`, `index.js` only
wires it. That keeps the codebase clean instead of growing one monolith.

---

## ✅ Tests

```bash
npm run check   # syntax-check the main backend files
npm test        # node --test tests/*.test.cjs  (167 tests)
```

Suites cover tenancy isolation, provider routing & auto-model fallback,
persona routing, agent tools (including the UPI payee safety invariant),
Live Feed, Don Away per-user, security hardening, and QR styling.

## 🚢 Deployment

Any Node 20+ host with MongoDB works. A typical production setup:

```bash
npm ci
cd client && npm ci && npm run build && cd ..
pm2 start ecosystem.config.cjs   # or: npm run pm2:start
pm2 save
```

Put a reverse proxy (HTTPS) in front, set `NODE_ENV=production`, and
make sure `ADMIN_PASSWORD` and `SESSION_SECRET` are strong — the server
refuses to start in production without them.

## 🔒 Security notes

- **Never commit `.env` or `auth_info_baileys*/`** — live credentials.
  Both are covered by `.gitignore`. If either was ever shared, rotate
  the secrets and re-pair WhatsApp.
- User passwords: **scrypt** (salted); legacy hashes upgrade on login.
- Provider keys: **AES-256-GCM encrypted** at rest.
- All `/api/*` data routes require an authenticated session; Socket.io
  connections are authenticated too.
- The URL scraper rejects private / loopback / link-local addresses
  (SSRF guard).
- Audit history is intentionally kept out of this public repo — security details are not published here.

---

## 📜 License

ISC — Developed by Dhruv 🚀
