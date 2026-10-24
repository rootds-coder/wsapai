# Lighthouse dashboard fixes — 2026-10-08

## Scope and evidence
Based on the uploaded authenticated-dashboard Lighthouse report: Performance 86, Accessibility 84, SEO 63. These are ORIGINAL scores, not post-fix scores. Browser installation failed (download was not a valid archive), so browser interaction, axe, and Lighthouse re-audit are NOT verified.

## Changes
- client/src/components/layout/Sidebar.jsx: accessible names on all navigation, Don Away and logout buttons; active/current and pressed states; keyboard-operable overview logo button.
- client/src/assets/logo-nav.webp: 96px navigation image, 3,894 bytes versus original 244,091-byte JPEG. Original image remains for other pages. Vite inlines the small navigation asset.
- client/src/components/dashboard/HourlyHeatmap.jsx: brighter zinc-400 hour labels, increased from 8px to 10px, addressing the reported contrast failure.
- client/src/App.jsx: lazy Landing/Dashboard routes; Suspense loading states; authenticate before socket connection; consolidate startup fetches; request admin analytics only for admin; remove undefined isLocal references that broke 401 handling.
- client/src/pages/Dashboard.jsx: lazy-load secondary tabs and chat UI; remove duplicate startup fetches; skip initial page entrance animation.
- index.js: immutable one-year caching ONLY for content-hashed public build assets. HTML remains no-store. Existing private-dashboard noindex policy retained.
- client/dist and dist rebuilt and included. Current entry JS is ~270 KB uncompressed; dashboard/shared/tab chunks are additional downloads. This is not a claimed total-transfer reduction or new Lighthouse score.

## Validation actually executed
- npm test: 25/25 passed, zero failed.
- node --check index.js: passed.
- npm run build --prefix client: passed, including portable root-dist copy.
- Isolated local HTTP smoke: HTML 200 with no-store, anonymous auth status false, hashed JS 200 with public max-age=31536000 immutable, noindex present on all three.
- No real WhatsApp, AI provider, or MongoDB connection used.
- gpt.js, features/annu.js and features/groupChat.js byte-identical to latest uploaded ZIP.

## Intentionally not changed / remaining checks
- Private-dashboard SEO noindex and HTML no-store are intentional; do not remove for a higher score. WebSocket-related BFCache limitations remain.
- Public source maps were not enabled. Forced reflow and remaining CSS/JS cost require a new browser profile before further changes.
- Existing anti-scrape/devtools guard remains and may affect automated audits.
- Existing login code accepts hardcoded fallback admin passwords in index.js. This pre-existing security issue is outside this performance patch; remove fallback credentials before public deployment and use a strong ADMIN_PASSWORD. Do not treat this ZIP as a security audit.

## Deploy safely
1. Back up the existing deployment and keep its .env, WhatsApp session/auth folder, and persisted data.
2. Extract this ZIP over application source, replacing BOTH client/dist and dist completely so old hashed assets do not accumulate.
3. Run npm ci on the server, then restart the existing Node/PM2 process. Prebuilt frontend is included. For a fresh frontend build run npm ci --prefix client, then npm run build --prefix client.
4. Actual credentials/session files/node_modules are excluded. Reuse your existing .env; .env.example contains blank credential placeholders.
5. Sign in and smoke-test overview, each sidebar tab, contacts/chat, logout, session expiry and mobile keyboard navigation.
6. Run Lighthouse again in the same authenticated state, viewport and throttling profile. Compare actual LCP, TBT, unused JS, accessibility and transfer sizes; do not compare different routes or login states.
