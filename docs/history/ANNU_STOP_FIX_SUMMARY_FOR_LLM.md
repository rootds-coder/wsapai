# Annu and direct-chat STOP follow-up — 2026-10-08

Built on the Lighthouse-fixed ZIP; frontend build and all Lighthouse changes retained.

## Root causes observed in source
STOP interception previously ran after keyword rules, API-key validation, media processing and Don Away. Paused contacts were checked only in the text path. An inactivity reset could overwrite off mode. No cancellation guard existed for a response already generating when STOP arrived. Commands also depended on MongoDB for storing the pause.

## Implemented
- New features/directChatControl.js: exact normalized command parsing, per-contact pause state, generation/version tickets, guarded sendMessage/sendPresenceUpdate, ordered persistence writes, wrapped WhatsApp message extraction.
- index.js handles personal STOP/START before rules, provider checks, media and Don Away. Commands require no AI API call. A STOP invalidates pending work; START enables new work without reviving stale replies.
- Pause is saved in data/direct-chat-pauses.json (0600 file) and MongoDB when configured. Keep this file with deployment data; DIRECT_PAUSE_FILE can select another writable persistent location. It is excluded from the release ZIP. On DB failure the local pause still blocks replies; command confirmation may be absent, with an error logged.
- Existing off state is respected before text/audio/image; inactivity no longer resets off mode. Automatic drip follow-ups check pause before sending.
- START/MENU resumes and displays persona selection. Group command behavior is unchanged.
- Pending sends are suppressed at dispatch; messages already handed to WhatsApp cannot be recalled. Provider computation already started may still finish and incur cost.
- features/annu.js prompt: casual concise Hinglish, fewer generic questions/fillers, no automatic gender assumption for the recipient, affection interpreted in context, stable feminine self-reference. Honest fictional identity retained. No invented physical memories or eroticization of unconsciousness.

## Verification
npm test: 33 passed, 0 failed (25 existing + 8 new command/concurrency/persistence tests).
node --check index.js: passed.
Local isolated HTTP smoke: passed for HTML/no-store, anonymous authentication status, hashed-asset immutable caching and noindex.
No live WhatsApp, MongoDB or model API credentials used. Annu provider tests use mocks: natural-language quality and real WhatsApp delivery are NOT claimed as live verified.
Existing production frontend retained; no frontend source changed in this follow-up.

## Deployment
Back up the app, .env, auth/session and data folders. Extract source and built frontend; keep existing secrets and session data. Run npm ci and restart Node/PM2. Do not overwrite a deployed data/direct-chat-pauses.json with an empty file. Ensure process can write its data directory.

## Manual acceptance checklist
1. In a direct chat send STOP, then text, image and voice: one pause confirmation, no AI response.
2. Try STOP with Don Away enabled, a matching keyword rule, and no provider key: STOP still works.
3. Send a question then STOP while generation/typing is pending: no newly dispatched answer after stop.
4. Restart process: chat stays paused. START then a persona choice enables replies again.
5. Check /stop and disappearing-message chat commands.
6. In Annu mode, test short acknowledgement, ordinary affection, explicit user gender, identity question and topic continuity. Judge actual output with the deployed model; do not treat prompt tests as guaranteed response quality.

Historical reports in the archive describe earlier releases; this file is authoritative for the follow-up. The previous Lighthouse summary's unchanged-Annu statement applied to that earlier release only.
