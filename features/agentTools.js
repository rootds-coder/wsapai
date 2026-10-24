/**
 * Phase 2 — Agent tools (free-only by construction).
 *
 * Why prompt-based JSON, not native function-calling: free models
 * support tool-calling inconsistently (some do, some return the
 * schema as text). Every free chat model can, however, emit a
 * fenced JSON block at the end of a reply — so the model proposes
 * an action, and THIS module validates + executes it server-side.
 * Nothing the model outputs is ever trusted: tool names come from
 * an allowlist, every argument is range/type-checked, and the
 * payment payee (the owner's UPI ID) comes from the owner's own
 * settings, never from model output. A model that invents a payee
 * or an amount gets its action rejected, not executed.
 *
 * Tools in v1 (all internal, zero cost — no external API, no fee):
 *   set_reminder  — remind this contact later (delivered by the
 *                   bot over WhatsApp at due time).
 *   save_note     — append a note to this contact's CRM notes.
 *   create_upi_link — build a UPI deep link (upi://pay) for the
 *                   owner's own UPI ID. No gateway, no MDR, no
 *                   verification in v1: the owner confirms receipt.
 *
 * Annu (girl mode) never gets tools: the tools prompt is only
 * injected on the main (devil/boy/custom) path in gpt.js.
 */
const { getDb } = require("../db");

const REMINDERS_COLLECTION = "reminders";

const TOOLS = {
  set_reminder: {
    description: "Remind this contact about something later.",
    args: { text: "string 1..200", delayMinutes: "integer 1..10080 (1 min .. 7 days)" },
  },
  save_note: {
    description: "Save a note about this contact.",
    args: { text: "string 1..500" },
  },
  create_upi_link: {
    description: "Create a UPI payment link for the owner's own UPI ID.",
    args: { amount: "number 1..100000 (INR)", note: "string 0..100" },
  },
};

const TOOLS_PROMPT =
  "You can also DO things, not just reply. When the user explicitly asks for one of these actions, end your reply with exactly one line in this format (nothing after it):\n" +
  "[ACTION] {\"name\": \"<tool>\", \"args\": {…}}\n" +
  "Available tools:\n" +
  '- set_reminder {text, delayMinutes}: remind this contact later. delayMinutes is an integer from 1 to 10080.\n' +
  "- save_note {text}: save a note about this contact.\n" +
  "- create_upi_link {amount, note}: create a UPI payment link AND a scannable QR code image with the payment details (the QR is what the contact actually scans — a raw upi:// link is not tappable inside WhatsApp). amount is a number in INR from 1 to 100000, and MUST come from the user's own message — never invent an amount, and never include a payee (the payee is fixed by the account owner). The note is optional.\n" +
  "Rules: use a tool only when the user clearly asked for that action. For create_upi_link the note is optional — if the user gave an amount, act immediately and do NOT ask for a note first. Only ask when the amount itself is missing. The [ACTION] line is never shown to the user — it is executed by the server.";

const UPI_ID_RE = /^[\w.\-]{2,}@[a-zA-Z][\w.\-]*$/;

/** Pure: "90" -> "1 ghante 30 minute", 1500 -> "1 din", etc. (Hinglish). */
function formatDelay(minutes) {
  const m = Math.round(minutes);
  if (m < 60) return `${m} minute`;
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h} ghante ${rest} minute` : `${h} ghante`;
  }
  const d = Math.floor(m / 1440);
  return d === 1 ? "1 din" : `${d} din`;
}

/** Scan a string starting with "{" for its balanced closing brace. */
function extractBalancedJson(str) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { json: str.slice(0, i + 1), rest: str.slice(i + 1) };
    }
  }
  return null; // unbalanced — e.g. the model was cut off mid-JSON
}

/**
 * Pure: extract an [ACTION] {...} block.
 * Returns { action: object|null, invalid: bool, text: reply-without-block }.
 * A malformed or truncated block is stripped, never shown to the
 * contact — a token-limit cut in the middle of the JSON must not
 * leak a raw "[ACTION] {" line into a WhatsApp chat.
 */
function parseActionBlock(replyText) {
  if (!replyText || typeof replyText !== "string") return { action: null, invalid: false, text: replyText };
  const idx = replyText.lastIndexOf("[ACTION]");
  if (idx === -1) return { action: null, invalid: false, text: replyText };
  const before = replyText.slice(0, idx).trimEnd();
  const after = replyText.slice(idx + "[ACTION]".length).trimStart();
  if (!after.startsWith("{")) return { action: null, invalid: true, text: before };
  const bal = extractBalancedJson(after);
  if (!bal) return { action: null, invalid: true, text: before };
  try {
    const action = JSON.parse(bal.json);
    const rest = bal.rest.trim();
    return { action, invalid: false, text: rest ? `${before} ${rest}`.trim() : before };
  } catch {
    return { action: null, invalid: true, text: before };
  }
}

/** Pure: allowlist + type/range validation. Returns { ok, error? }. */
function validateAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) return { ok: false, error: "Action must be an object" };
  const spec = TOOLS[action.name];
  if (!spec) return { ok: false, error: `Unknown tool: ${String(action.name)}` };
  const args = action.args;
  if (!args || typeof args !== "object" || Array.isArray(args)) return { ok: false, error: "Action args must be an object" };
  if (action.name === "set_reminder") {
    if (typeof args.text !== "string" || !args.text.trim() || args.text.length > 200) return { ok: false, error: "Reminder text must be 1..200 chars" };
    if (!Number.isInteger(args.delayMinutes) || args.delayMinutes < 1 || args.delayMinutes > 10080) return { ok: false, error: "delayMinutes must be an integer 1..10080" };
  }
  if (action.name === "save_note") {
    if (typeof args.text !== "string" || !args.text.trim() || args.text.length > 500) return { ok: false, error: "Note text must be 1..500 chars" };
  }
  if (action.name === "create_upi_link") {
    if (typeof args.amount !== "number" || !Number.isFinite(args.amount) || args.amount < 1 || args.amount > 100000) return { ok: false, error: "amount must be a number 1..100000" };
    if (args.note !== undefined && (typeof args.note !== "string" || args.note.length > 100)) return { ok: false, error: "note must be at most 100 chars" };
  }
  return { ok: true };
}

/**
 * Pure: build a UPI deep link. The payee is ALWAYS the argument —
 * callers must pass the owner's stored UPI ID, never model output.
 * Returns null when the UPI ID itself is malformed.
 */
function buildUpiLink(upiId, amount, note = "") {
  if (!upiId || !UPI_ID_RE.test(String(upiId).trim())) return null;
  const params = new URLSearchParams({
    pa: String(upiId).trim(),
    pn: "Devil AI",
    am: String(amount),
    cu: "INR",
    tn: String(note || "Payment").slice(0, 100),
  });
  return `upi://pay?${params.toString()}`;
}

// ── UPI QR ────────────────────────────────────────────────────────────────
// WhatsApp does not linkify upi:// URLs, so a raw link sent as text is
// not tappable and never opens a UPI app — that was the 2026-10-24 bug.
// The fix: encode the SAME link as a QR image the contact scans with any
// UPI app. No new dependency: the `qrcode` package is already installed
// (it generates the WhatsApp login QR). Deep-purple modules on white,
// 1024px, error-correction H so it scans even on a small screen. A null
// return means "fall back to the raw link text", never a crash.
async function generateUpiQrBuffer(link) {
  // Styled (branded) QR first; the plain qrcode output is the fallback
  // so a styling failure can never break a payment.
  try {
    return require("./qrStyle").createStyledQrBuffer(link);
  } catch (styleErr) {
    console.warn("[AgentTools] styled QR failed, falling back to basic QR:", styleErr.message);
  }
  try {
    const QRCode = require("qrcode");
    return await QRCode.toBuffer(link, {
      type: "png",
      width: 1024,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#4C1D95", light: "#FFFFFF" },
    });
  } catch (err) {
    console.error("[AgentTools] QR generate failed:", err.message);
    return null;
  }
}

function buildUpiQrCaption(upiId, amount, note) {
  return (
    `💳 Payment Request — ₹${amount}\n` +
    `UPI ID: ${upiId}\n` +
    (note ? `Note: ${note}\n` : "") +
    `Kisi bhi UPI app (GPay / PhonePe / Paytm) se is QR ko scan karke payment karo.`
  );
}

// ── Storage adapters (dependency-injected for tests) ─────────────────────────
function defaultDeps() {
  return {
    insertReminder: async (doc) => {
      const d = await getDb();
      const r = await d.collection(REMINDERS_COLLECTION).insertOne(doc);
      return { ...doc, _id: r.insertedId };
    },
    listDueReminders: async () => {
      const d = await getDb();
      return d.collection(REMINDERS_COLLECTION).find({ sent: false, dueAt: { $lte: new Date() } }).sort({ dueAt: 1 }).limit(50).toArray();
    },
    markReminderSent: async (id) => {
      const d = await getDb();
      await d.collection(REMINDERS_COLLECTION).updateOne({ _id: id }, { $set: { sent: true, sentAt: new Date() } });
    },
    listReminders: async (owner) => {
      const d = await getDb();
      return d.collection(REMINDERS_COLLECTION).find({ owner: owner || "admin" }).sort({ dueAt: 1 }).limit(50).toArray();
    },
    deleteReminder: async (owner, id) => {
      const { ObjectId } = require("mongodb");
      const d = await getDb();
      const res = await d.collection(REMINDERS_COLLECTION).deleteOne({ _id: new ObjectId(id), owner: owner || "admin" });
      return res.deletedCount > 0;
    },
    getNotes: async (owner, jid) => {
      const d = await getDb();
      const doc = await d.collection("contacts").findOne({ jid, userId: owner || "admin" });
      return doc?.notes || "";
    },
    saveNotes: async (owner, jid, notes) => {
      const d = await getDb();
      await d.collection("contacts").updateOne({ jid, userId: owner || "admin" }, { $set: { notes, updatedAt: new Date() } });
    },
    getUpiId: async (owner) => {
      const { getDb: gdb } = require("../db");
      const d = await gdb();
      const { scopedSettingsKey } = require("../db");
      const doc = await d.collection("settings").findOne({ key: scopedSettingsKey("upiId", owner) });
      return doc?.value || "";
    },
  };
}

/**
 * Execute one validated action. Never throws: failures become a
 * contact-safe message instead of a crash or a half-done action.
 */
async function executeAction({ deps = defaultDeps(), owner, jid, action }) {
  const v = validateAction(action);
  if (!v.ok) return { ok: false, message: "" }; // silently drop invalid actions; the text reply still goes out
  try {
    if (action.name === "set_reminder") {
      const dueAt = new Date(Date.now() + action.args.delayMinutes * 60 * 1000);
      await deps.insertReminder({
        owner: owner || "admin",
        jid,
        text: action.args.text.trim(),
        dueAt,
        sent: false,
        createdAt: new Date(),
      });
      return { ok: true, message: `✓ Reminder set kar diya hai — ${formatDelay(action.args.delayMinutes)} baad yaad dila dunga.` };
    }
    if (action.name === "save_note") {
      const prev = await deps.getNotes(owner, jid);
      const stamp = new Date().toISOString().slice(0, 10);
      const next = prev ? `${prev}\n[${stamp}] ${action.args.text.trim()}` : `[${stamp}] ${action.args.text.trim()}`;
      await deps.saveNotes(owner, jid, next);
      return { ok: true, message: "✓ Note save kar liya hai." };
    }
    if (action.name === "create_upi_link") {
      const upiId = await deps.getUpiId(owner);
      const link = buildUpiLink(upiId, action.args.amount, action.args.note || "");
      if (!link) {
        return {
          ok: false,
          message: "UPI payment link abhi nahi bana sakta — is account me UPI ID set nahi hai. Account owner ko Settings me UPI ID daalni hogi.",
        };
      }
      const qrBuffer = await generateUpiQrBuffer(link);
      if (!qrBuffer) {
        // QR failed: fall back to the raw link text (copy-pasteable).
        return {
          ok: true,
          message: `Payment link ban gaya hai — ₹${action.args.amount}:\n${link}\nIs link ko copy karke apne UPI app me kholo aur payment karo.`,
          link,
        };
      }
      return {
        ok: true,
        message: `Payment QR ban gaya hai — ₹${action.args.amount}. Neeche QR code bhej raha hu, use scan karke payment karo.`,
        link,
        qr: { buffer: qrBuffer, caption: buildUpiQrCaption(upiId, action.args.amount, action.args.note || "") },
      };
    }
  } catch (err) {
    console.error("[AgentTools] execute error:", err.message);
    return { ok: false, message: "" };
  }
  return { ok: false, message: "" };
}

/**
 * Parse + execute any action block at the end of a reply.
 * Returns the reply the contact should see: block stripped, and a
 * confirmation appended when an action actually ran (or when the
 * UPI ID is missing — the one failure the contact must hear about).
 */
async function handleReplyAction({ deps, owner, jid, replyText }) {
  const { action, text } = parseActionBlock(replyText);
  if (!action) return { text: replyText, executed: false, attachment: null };
  const result = await executeAction({ deps: deps || defaultDeps(), owner, jid, action });
  if (result.ok || result.message) {
    return { text: `${text}\n\n${result.message}`.trim(), executed: result.ok, action: action.name, attachment: result.qr || null };
  }
  return { text, executed: false, attachment: null };
}

module.exports = {
  REMINDERS_COLLECTION,
  TOOLS,
  TOOLS_PROMPT,
  UPI_ID_RE,
  formatDelay,
  parseActionBlock,
  validateAction,
  buildUpiLink,
  generateUpiQrBuffer,
  buildUpiQrCaption,
  defaultDeps,
  executeAction,
  handleReplyAction,
};
