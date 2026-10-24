# Voice calls — Route B architecture (RESEARCH DRAFT, not built yet)

> STATUS 2026-10-24: PAUSED — Dhruv dropped this idea for now. No code,
> no deploy, no call test came out of it. This document is preserved so
> the work can resume from the gates in §5 whenever he brings it back.

Decision (2026-10-24, Dhruv): Route B — full research + a little reverse
engineering, build our OWN voice-call system that supports the Devil AI
foundation. This document is the research spike + architecture draft. No
code, no deploy, no call test has been done from it yet.

## 1. What changed vs the earlier "not feasible" verdict

Earlier we said Baileys has no calling. That is still true for OUR library
(`@whiskeysockets/baileys` 6.7.24: incoming `call` events exist, but
`messages-send` has no call function — its only "call" hit is a receipts
comment — and WAProto's `Message.Call` is a click-to-WhatsApp-ads message,
not a call-offer definition).

What changed: a reference implementation for real Baileys voice calls
already exists in the ecosystem, and it runs on the bot's EXISTING socket:

- `@queenanya/baileys` (fork, repo `github.com/QueenAnya/Bail`) exposes
  `sock.initiateCall(jid, { audioSource, durationMs, ... })` — "real audio
  in and out, directly from your existing socket, no separate connection
  needed".
- It is a vendored port of the third-party `baileys-caller` SDK, adapted
  from that SDK's standalone client to the bot's own socket/session.
- Signaling-only APIs (`WAInitiateCall` / `offerCall`) exist separately in
  the same fork: they only ring the other device, with no audio/video
  media. `initiateCall` is the full engine, not the ring.

So Route B is no longer "extract Web's engine blind". It is: study this
reference engine, then vendor/port the pieces we need into OUR codebase
under our own module — without switching the whole bot to the fork.

## 2. Reference engine, as documented (queenanya README, § Voice Calling)

- `initiateCall(jid, { audioSource: './audio.mp3' | 'silence',
  durationMs })`. Audio source is a FILE (MP3/WAV) or silence. Video is
  also supported (`videoSource`, ffmpeg-decoded to YUV420p), but Devil AI
  v1 is voice-only.
- Media engine is WASM, lazily initialized on the FIRST `initiateCall`
  (bots that never call pay no startup cost). Each call gets its own
  isolated WASM engine, so parallel calls don't share buffers.
- Requires the optional peer dependency `@roamhq/wrtc` (native WebRTC
  bindings), installed separately. Native = the main deployment risk on
  serv00 (see §5).
- Events: `ringing`, `connected`, `audio` (incoming 16 kHz Float32Array
  PCM), `accepted`, `audioReady`, `streaming`, `ended` (reason),
  `error`, `stateChange`.
- State machine: `idle → initiating → ringing → accepted → connected →
  audio_ready → streaming → ended`
  (or `→ unreachable / rejected / timeout / failed`).
- Timeouts: no ringing confirmation within `preRingingTimeoutMs`
  (default 20000 ms) → status `unreachable`. `durationMs` default
  120000 ms auto-hangup.
- Management: `initiateCalls` (batch), `getActiveCalls`,
  `getActiveCallCount`, `getCall(callId)`, `endCall`, `endAllCalls`,
  `setVoipOptions({ maxConcurrentCalls })`, `mute(true)`,
  `waitForEnd()`, `getSummary()`.
- A decoupled variant `createVoipClient({ authDir })` exists (own auth
  directory, own QR scan, same engine). NOT our path: Devil AI uses the
  bot's existing per-owner socket, not a second identity.

## 3. Architecture — three planes, foundation-aligned

```
Reminder trigger (agentTools)
  └─► features/voiceCall/callSession.js   (per-owner state machine)
        ├─► signaling.js   (Baileys socket = signaling plane)
        ├─► mediaEngine.js (WASM engine + wrtc = media plane)
        └─► audioPipeline.js (voice model = audio plane)
```

Module map (to be built under `features/voiceCall/`, thin wiring only
in `index.js` — the standing clean-structure rule):

| Module | Job |
|---|---|
| `signaling.js` | Port of the offer/accept/terminate/reject stanza handling onto OUR `@whiskeysockets/baileys` socket. Reuses our lib's existing incoming `call` events. No fork switch. |
| `mediaEngine.js` | Vendored/ported WASM engine + `@roamhq/wrtc` binding, lazily initialized on first call. Owns relay/ICE/SRTP transport. Isolated engine per call. |
| `audioPipeline.js` | Outgoing: reminder text → Edge TTS (persona voice, already in `freeVoiceEngine.js`) → MP3 file → engine `audioSource`. Incoming (v2 only): 16 kHz PCM chunks → buffer → STT. |
| `callSession.js` | Per-owner call state machine mirroring §2 states. Owns timeouts, `maxConcurrentCalls` cap, and the fallback: any terminal failure (`unreachable` / `rejected` / `timeout` / `failed`) → existing voice-note delivery. A failed call NEVER drops a reminder. |
| `index.js` wiring | Only: reminder due → `voiceCall.placeReminderCall(owner, jid, text)` → on failure, existing voice-note path. |

Foundation rules carried over, non-negotiable:

- Per-owner (tenant-scoped) sessions, like every other feature. Tenant A's
  call engine never touches tenant B's socket.
- Free voices only (Edge TTS persona voice; Groq Whisper free STT in v2).
  No paid TTS/STT, no gateway.
- Do NOT change the live bot's Baileys `browser` config
  (`["Devil's AI", "Chrome", "1.0.0"]` in `index.js`). Changing it would
  create a new device identity and break existing sessions. Call tests
  use the test account only. (One fork doc suggests iOS/Safari emulation
  "for better call compatibility" — unverified for our stack, and NOT a
  reason to touch live sessions.)
- Do NOT replace `@whiskeysockets/baileys` with the queenanya fork.
  Vendor/port only the calling pieces, with attribution, after a
  license check (see §5).
- v1 is ONE-WAY: user answers → bot plays the TTS reminder → auto-cut.
  No Gemini Live in v1 (a one-way speech does not need a live session).

## 4. v1 vs v2 — the honest gap in the reference API

- v1 (one-way reminder call): fully covered by the documented API.
  File playback is exactly what a reminder needs.
- v2 (interactive talk-back): NOT covered by the documented API as read
  so far. Outgoing audio is file-based; incoming audio arrives as PCM
  events. Whether the engine also accepts a LIVE outgoing audio stream
  (needed for real conversation, or for a Gemini Live bridge) is an OPEN
  QUESTION — file-chaining short clips would be choppy and is not a
  real conversation path. v2 must not be promised until the engine
  source answers this. The Gemini Live bridge (Live PCM out → engine,
  engine PCM in → Live) is a v2 design, not a v1 commitment.

## 5. Risks + verification gates (in order, no skipping)

1. **G0 — Source read.** Read the actual engine source in
   `QueenAnya/Bail` (voip addon + WASM blob) and `baileys-caller`.
   Confirm: what the WASM blob IS (if it is extracted WhatsApp Web
   code, vendoring it has license/ToS implications — check before
   copying anything into our repo), and whether live outgoing audio
   push exists (v2 question).
2. **G1 — Native dep on serv00.** Does `@roamhq/wrtc` install and load
   on serv00 (Linux x64, our Node version)? Does the WASM engine load
   in plain Node? If wrtc has no working prebuild for serv00, the
   media plane cannot run there — this alone can force a different
   host for the call service.
3. **G2 — Network from serv00.** Can the host reach WhatsApp relay
   servers and complete ICE from serv00 (UDP reachability)? Test
   before any call test.
4. **G3 — Ring-only test (test account, own numbers only).** Port
   signaling first; prove the test phone rings from the bot.
5. **G4 — One-way audio test.** Prove the callee actually HEARS the
   TTS reminder, and measure: ring→accept latency, audio clarity,
   auto-cut.
6. **G5 — Reminder integration + fallback.** Wire into the reminder
   ticker with the voice-note fallback, then a small live test batch.
7. **G6 — Ban-risk watch.** Automated calls are the highest ban-risk
   behavior in the whole product. Test account only, own numbers
   only, tiny volume, stop on any warning. This gate never closes.

## 6. Open questions (do not guess — answer in the spike)

- Exact WASM blob provenance + license for vendoring.
- Live outgoing audio push: yes / no / how.
- `@roamhq/wrtc` prebuild for serv00's platform + Node version.
- UDP/relay reachability from serv00.
- Whether call offers from our QR-paired `Devil's AI` browser identity
  are accepted the same way as from other emulations.
- What still needs Dhruv (not blocking G0–G2): (a) Chrome Web
  call-button check (Web reference, optional); (b) a real incoming
  call log from his phone to the test number (raw `<call>` node
  cross-check); (c) explicit go-ahead before ANY live call test
  (G3 onward). This document alone authorizes nothing live.

## 7. Alternatives recorded (not chosen)

- Switch whole bot to queenanya fork: rejected — 35+ unrelated
  addons, different Baileys base, stability risk to a working bot.
- Headless Chrome + virtual audio (Route A): viable fallback if the
  Node/WASM path fails on serv00, but needs a host with Chrome +
  audio stack, which serv00 is not.
- Official WhatsApp Business calling API (Cloud API `/calls` with SDP
  offer/answer): real and documented, but requires a business number
  + Meta approval, and the official-API hybrid is deferred while the
  product is in beta. Future alternative, not v1.
- Paid telephony (Twilio etc.): breaks the zero-cost rule. Not v1.
