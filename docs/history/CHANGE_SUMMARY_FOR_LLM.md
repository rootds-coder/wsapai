# Devil's AI — Group companion update

## Scope
Added an opt-in Hinglish group banter companion to the existing Baileys application.
Personal-message handling remains on its existing route. This is a tested source
update, not a claim that the original entire application is bug-free.

## Root cause and fixes
- index.js previously skipped every @g.us message. Group messages now route to
  features/groupChat.js before the personal conversation/menu flow.
- Personal analytics failures no longer block group routing.
- Original npm test was an intentional failing placeholder. Added 14 offline tests.
- client postbuild used Windows robocopy and masked failures. Replaced with
  scripts/copy-client-build.cjs; production frontend was rebuilt successfully.
- OPEN_BROWSER=false now supports headless server testing/deployment.
- Removed sensitive values from .env.example; real .env is excluded from delivery.

## Implementation map
- features/groupChat.js: allowlist/config, wrapped text extraction, PN/device and
  LID self-mention matching, quoted-bot replies, !devil trigger, bounded group
  history and duplicate cache, per-group cooldown and in-flight lock.
- gpt.js getGroupReply: dedicated OpenAI/OpenRouter path with existing Gemini
  fallback. Does NOT fetch private knowledge base, DM histories, or custom personas.
  Uses role/content history format consistently. Provider is responsible for
  generated wording; a prompt is not a guaranteed output moderation mechanism.
- index.js: group handler registration and admin-only GET /api/groups discovery.
- client/.../dashboard/GroupAI.jsx + Settings.jsx: admin group discovery panel and
  activation instructions. Settings are environment-based, not editable in UI.
- scripts/copy-client-build.cjs: portable deployment asset copy.
- tests/groupChat.test.cjs: deterministic socket/model mocks, no live messages.

## Activation
1. Keep your existing deployment .env and WhatsApp session folder backed up.
2. Install server packages with npm ci. The rebuilt dist/ is included.
3. Add these settings to YOUR existing .env:

   GROUP_AI_ENABLED=true
   GROUP_AI_IDS=YOUR_GROUP_ID@g.us
   GROUP_AI_COOLDOWN_SECONDS=20
   GROUP_AI_SPONTANEOUS_CHANCE=0
   GROUP_AI_PROFANITY=true
   GROUP_AI_STATE_FILE=./data/group-state.json

4. Restart your single Node/PM2 process and connect WhatsApp as before.
5. Dashboard Settings > Group roast companion > List my WhatsApp groups displays
   IDs (admin only). Copy chosen exact IDs into GROUP_AI_IDS, comma-separated,
   and restart. No group is automatically enabled; wildcard IDs are not accepted.
6. In the selected group send !devil hello, mention the bot, or reply to its message.

## Commands
- !devil stop / !devil bas kar: opt this member out; no acknowledgment spam.
- !devil resume / !devil roast me: opt this member back in.
- !devil pause / !devil on: pause/resume group replies, actual group admins only.
- Stop/pause states persist in the JSON state file. Preserve it across deployments.
- Spontaneous chance 0 disables unsolicited replies. Optional 0.05 = 5% per eligible
  unmentioned text, still subject to cooldown. Configuration clamps maximum to 20%.

## Boundaries and maintenance
Group functionality currently handles TEXT only; group audio/images/stickers and
DM persona menus are deliberately not fed into the group route. Group context is
last 12 entries in RAM, expires on next message after 30 min inactivity, and resets
on socket recreation. Stop/pause survives restart. Member IDs are replaced with
per-group Member N labels in model input; message bodies can still contain personal
information. Tell participants group text is sent to your configured provider.
Do not run multiple processes against one WhatsApp session/state file. No public
WhatsApp messages, live API calls or production database writes were performed.

The existing application still contains unrelated features/security decisions
that were not comprehensively audited, including global runtime API keys and
other dashboard endpoints. Do not describe this as a full production security audit.
Review authorization and multi-user isolation separately before public hosting.

## Local acceptance test
npm test
ENABLE_WHATSAPP=false KEEP_ALIVE_ENABLED=false OPEN_BROWSER=false npm start

On Windows set those environment variables with PowerShell $env:NAME='value'.
Then connect your own test WhatsApp session, allowlist a test group, and verify
PN/LID mentions, quoted replies, admin controls, model wording and DM behavior.
Actual WhatsApp connectivity/provider credentials were not tested here.

## Packaging
Included source, rebuilt root dist and client/dist, lockfiles, tests and this guide.
Excluded node_modules, real .env, auth/session data, scratch scripts/logs and nested
client.7z. The nested archive and old scratch scripts can contain stale code or
private content; the original upload remains your source for those items.
