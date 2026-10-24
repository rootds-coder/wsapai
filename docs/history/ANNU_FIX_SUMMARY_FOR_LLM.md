# Annu continuity fix — latest uploaded version

## Changes
- features/annu.js: replaced contradictory persona instructions and random reply
  substitutions with one consistent adult feminine Hinglish character prompt.
  Honest AI identity answers remain natural; no fake human/video-call claims.
- Grammar correction now handles intervening words, common chained self-verbs,
  future forms and first-person auxiliary forms. Quotes/code, user phrasing and
  common third-person/object-agreement constructions are preserved. This is a
  conservative Roman-Hindi heuristic, not a complete Hindi grammar parser.
- History accepts Mongo body and API content shapes, removes control messages,
  resets at the latest persona-selection marker, deduplicates a persisted current
  voice turn, merges adjacent same-role messages and starts with a user turn for
  Gemini compatibility. No global cross-contact memory introduced.
- gpt.js routes Annu before fetching global chat-export knowledge. Global uploaded
  references no longer influence Annu. Other personas keep their existing KB flow.
- Gemini and OpenAI fallback use the same prompt/history and output cleanup.
  OpenAI fallback has a 15-second timeout and zero SDK retries. Existing shared
  Gemini timeout behavior is unchanged.
- Outages now produce a clear temporary-unavailability message, not an unrelated
  "mai bhi theek hu" response that changes the topic.
- Annu image replies use the same cleaner on primary and Gemini fallback paths.
  Annu voice alias maps to girl voice. Text cleanup is applied before voice output.
- index.js exempts Annu from the 20-minute inactivity reset to Devil/menu mode.
  Existing inactivity behavior for other modes remains unchanged.

## Files changed
features/annu.js, gpt.js, index.js.
Added tests/annu.test.cjs, this summary, ANNU_TEST_RESULTS.txt.
.env.example is sanitized for packaging. Real .env is excluded.
Group code, frontend source, database schema and prebuilt frontend are unchanged.

## Checks
Baseline existing suite: 14 passed; old grammar missed three supplied masculine
self-reference cases and dropped content-shaped history completely.
After fix: 25 passed (11 new Annu tests plus 14 existing group tests).
Syntax checks passed for all three changed runtime files.
Server launched with dummy credentials and disabled WhatsApp/Mongo/provider access;
HTTP /health returned 200. No live WhatsApp or paid model calls were made.
Actual model quality, voice output, image responses and long-running Mongo-backed
conversations still need testing with your real setup. No perfect persona or
unlimited memory guarantee: caller currently supplies a bounded recent history.

## Install / local LLM handoff
Back up your deployment. Apply the three changed runtime files plus tests and docs,
or use this full source ZIP. Preserve your existing .env, WhatsApp auth/session
folder, data/group-state.json and database. Run npm ci if needed, npm test, then
restart your existing Node/PM2 process. No new dependencies/schema migrations and
no frontend rebuild are required for this change.

Suggested live checks: select Annu, discuss a movie, answer "hmm", ask about the
same topic; wait over 20 minutes and message again; force a provider failure;
try voice/image messages; check a masculine user statement is not rewritten;
verify group replies still work. AI identity questions should be answered honestly
in Annu's voice rather than making false claims of being a real person.

Packaging excludes installed node_modules, real environment files, session data,
scratch scripts/logs and nested archives. Existing source/resources retained.
