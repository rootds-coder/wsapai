# Smart AI Router 2.0 — Architecture Audit & Upgrade Notes

Date: 2026-10-24 · Scope: the Phase 3 multi-provider engine
(`features/aiProviders.js`, `gpt.js` chat path, `db.js` settings,
`/api/ai-providers*` endpoints, dashboard UI). Baseline before this
upgrade: 73/73 tests passing in production.

## 1. AI request lifecycle (as found)

WhatsApp message → `index.js` pipeline (owner-scoped) →
`gpt.getReplyAsDhruv(userMessage, mode, history, tenant)`:
persona system prompt + capped knowledge-base injection + stored
history → **provider engine** (per-user configs, active-first,
sequential fallback) → on total engine failure, the **legacy chain**
(Gemini native → OpenAI/OpenRouter runtime key for admin; tenants
never reach the owner's keys) → persona post-processing
(`forceHumanReply`, Annu's `cleanAnnuOutput`). Annu enters the same
engine first when the user has providers configured.

## 2. Findings

| # | Severity | Finding | Status in 2.0 |
|---|----------|---------|----------------|
| F1 | Medium | Provider API keys stored as **plaintext** in Mongo settings docs | **Fixed** — AES-256-GCM at rest (`enc:v1:`), key derived from `SESSION_SECRET`; legacy plaintext still reads and migrates on next save |
| F2 | Medium | **No token/usage accounting** — provider `usage` was returned and discarded | **Fixed** — atomic `$inc` daily + lifetime counters per user/provider (`aiUsage:<userId>`), plus a 20-entry fallback history |
| F3 | Medium | A dead/rate-limited provider was **retried on every chat**, adding timeout latency to each reply | **Fixed** — circuit breaker (3 consecutive failures → 5 min park), `Retry-After` honored on 429s, automatic recovery on success or restart |
| F4 | Low | Routing was active-first only — no use of free tiers, latency or model strength | **Fixed** — 5 modes: manual, free-first, fastest, quality, balanced |
| F5 | Low | **No context-window guard** — the same history went to a 32k model and a 1M model | **Fixed** — `fitContext` estimates tokens and trims oldest non-system turns per model; system/persona messages are never trimmed; caller arrays never mutated |
| F6 | Info | Tool-calling / structured outputs | **Not applicable** — this product issues plain chat completions only; the canonical `{role, content}` format is already provider-neutral. Revisit if tools are ever added |
| F7 | Info | Idempotency / duplicate external actions | **Not applicable** on the chat path (read-only completions). WhatsApp-side dedupe already lives in the message pipeline |
| F8 | Info | Persona evaluation framework | **Deferred, honestly** — cross-provider persona drift is real (identical prompts ≠ identical outputs). A repeatable eval harness is future work, not claimed here |
| F9 | Info | Health state is in-memory (single PM2 process) | Accepted — restart resets health, which doubles as recovery. Usage is persisted; health is ephemeral by design |
| F10 | Info | Quota figures | Providers do not expose remaining quota on these endpoints; the dashboard shows **provider-reported token usage** (verified data) and a clearly labeled **estimated** paid-equivalent cost. Nothing labeled "remaining quota" is fabricated |

## 3. Isolation (verified, unchanged)

- Configs, usage and health are keyed by the **session's** `userId`
  only (`aiProviders:<userId>`, `aiUsage:<userId>`, in-memory
  `userId:providerId`). No code path reads another user's configs;
  the engine never falls back to the owner's providers (Phase 2/3
  tests cover this; Router 2.0 tests re-verify wiring).
- Provider base URLs come from the hardcoded registry only — a key
  can never redirect traffic (no SSRF surface via config).
- Keys are masked in every API response (`AIza…0xyz` style).

## 4. What changed

- `features/aiProviders.js`: key encryption, model metadata
  (tier/context), health + circuit breaker, routing modes,
  `fitContext`, usage recording + fallback logging inside
  `chatCompletion` (return shape backward compatible, plus
  `latencyMs`, `routingMode`, `attempts`).
- `db.js`: `routingMode` on provider configs; `recordAiUsage`
  (atomic `$inc` + `$push/$slice` route log) and `getAiUsage`.
- `index.js`: `routingMode` in `GET /api/ai-providers`;
  `POST /api/ai-providers/mode`; `GET /api/ai-providers/stats`
  (today / last-30-days / totals per provider, health snapshot,
  fallback history, labeled cost estimate).
- UI: AI Providers moved from a Settings card to a **dedicated
  sidebar tab** — summary stats (total tokens, requests, estimated
  free-pool value, routing mode), the provider manager (unchanged
  workflows), per-provider health/usage/latency/last-error, and the
  recent-fallbacks list. Settings keeps a pointer card.

## 5. Tests

82/82 (73 preserved + 9 new in `tests/router.test.cjs`): free-first /
quality / fastest ordering, cooling-provider sink, circuit-breaker
reset, Retry-After window, context trimming invariants, encryption
roundtrip + legacy passthrough + tamper rejection, free-first
end-to-end chat with identical context, endpoint guards.

## 6. Deployment & rollback

- Backup before deploy: `~/devil-ai-backups/wsapai-pre-router2-<ts>.tar.gz`
  (code snapshot; `.env` and `data/` excluded as always).
- Migrations: none destructive. New state is additive
  (`aiUsage:*` docs, `routingMode` defaulting to `manual`,
  `enc:v1:` key values that read back through the same code).
- Rollback: restore the snapshot over `~/wsapai` (preserving `.env`,
  `data/`, auth folders), rebuild the client, `pm2 restart
  devil-ai`. Note: keys saved as `enc:v1:` while Router 2.0
  was live are unreadable by the old code — after a rollback, users
  simply re-paste those keys (they are masked, never lost from the
  providers themselves).
