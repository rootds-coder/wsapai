const OpenAI = require("openai");
const { toFile } = require("openai");
require("dotenv").config();
const db = require("./db");
const {
  generateFreeNeuralTTS,
  generateFreeNeuralTTSFile,
  transcribeWithGemini,
} = require("./features/freeVoiceEngine");
const geminiEngine = require("./features/geminiEngine");
const annu = require("./features/annu");
const aiProviders = require("./features/aiProviders");

let runtimeApiKey = null;

function setRuntimeApiKey(key) {
  runtimeApiKey = key ? String(key).trim() : null;
}

function getApiKey() {
  return runtimeApiKey || process.env.OPENAI_API_KEY;
}

/**
 * Build a configured OpenAI client from the current API key.
 * Supports both direct OpenAI and OpenRouter keys.
 * @returns {{ client: OpenAI, isOpenRouter: boolean }}
 */
const tenantClientCache = new Map();
function buildClientForKey(apiKey) {
  const clean = String(apiKey || "").trim();
  if (!clean) throw new Error("No OpenAI API key configured.");
  const cacheKey = clean.slice(0, 12) + ":" + clean.length;
  if (tenantClientCache.has(cacheKey)) return tenantClientCache.get(cacheKey);
  const built = buildClientWithKey(clean);
  if (tenantClientCache.size > 50) tenantClientCache.clear();
  tenantClientCache.set(cacheKey, built);
  return built;
}

function buildClient() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No OpenAI API key configured.");
  return buildClientWithKey(apiKey);
}

function buildClientWithKey(apiKey) {
  const isOpenRouter = apiKey.startsWith("sk-or-v1-");
  const config = { apiKey };
  if (isOpenRouter) {
    config.baseURL = "https://openrouter.ai/api/v1";
    config.defaultHeaders = {
      "HTTP-Referer": process.env.OPENROUTER_REFERRER || "https://github.com",
      "X-Title": process.env.OPENROUTER_TITLE || "Devil's AI",
    };
  }
  return { client: new OpenAI(config), isOpenRouter };
}

// ── Tenant key resolution ─────────────────────────────────────────────
// A registered user (tenant) runs ONLY on their own keys. The owner's
// global key (env / runtime) is used solely for the admin tenant.
function resolveTenant(tenant = {}) {
  const userId = tenant.userId || "admin";
  const isTenantUser = userId !== "admin";
  return {
    userId,
    isTenantUser,
    // Phase 1: long-term memory text for this contact, loaded by the
    // pipeline (index.js) and injected into the prompt below. Empty
    // when the contact has no stored memory yet.
    contactMemory: typeof tenant.contactMemory === "string" ? tenant.contactMemory : "",
    // Phase 2: freeOnly forces every automated call on this tenant
    // (STT, TTS fallback, tool reasoning) onto free tiers only;
    // toolsEnabled lets the model propose agent actions (all personas).
    freeOnly: !!tenant.freeOnly,
    toolsEnabled: !!tenant.toolsEnabled,
    apiKey: isTenantUser ? String(tenant.apiKey || "") : getApiKey(),
    geminiKeyOverride: isTenantUser ? String(tenant.geminiKey || "") : undefined,
    clientOrNull: () => {
      const key = isTenantUser ? String(tenant.apiKey || "") : getApiKey();
      return key ? buildClientForKey(key) : null;
    },
  };
}

/**
 * Clean WhatsApp-exported chat text for AI.
 * Removes timestamps, LTR marks, and normalizes media/deleted messages.
 */
function cleanChatForAI(rawText) {
  if (!rawText || typeof rawText !== "string") return "";
  const lines = rawText.split(/\r?\n/);
  const out = [];
  const timestampPrefix =
    /^\s*\u200E?\s*\[\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?\]\s*/i;
  for (const line of lines) {
    let cleaned = line
      .replace(timestampPrefix, "")
      .replace(/\u200E/g, "")
      .trim();
    if (!cleaned) continue;
    cleaned = cleaned
      .replace(/\s*(?:image|photo|picture)\s+omitted\.?$/i, " [image]")
      .replace(/\s*video\s+omitted\.?$/i, " [video]")
      .replace(/\s*audio\s+omitted\.?$/i, " [audio]")
      .replace(/\s*document\s+omitted\.?$/i, " [document]")
      .replace(/\s*sticker\s+omitted\.?$/i, " [sticker]")
      .replace(/\s*<Media omitted>$/i, " [media]")
      .replace(/\s*You deleted this message\.?$/i, " [deleted]")
      .replace(/\s*This message was deleted\.?$/i, " [deleted]");
    out.push(cleaned);
  }
  return out.join("\n");
}

/**
 * Format and sanitize chat history for OpenAI API calls.
 * Removes system markers, mode selection notices, menus, bot language,
 * and cross-persona pollution. Limits history length to reduce drift.
 */
function sanitizeChatHistory(chatHistory = [], currentMode = "devil") {
  if (!Array.isArray(chatHistory)) return [];

  const forbiddenAssistantPatterns = [
    /main aapki kya madad/i,
    /aap bataiye/i,
    /kaise help/i,
    /main ek ai/i,
    /how can i help/i,
    /what can i do for you/i,
    /feel free to ask/i,
    /choose your ai companion/i,
    /welcome to \*devil's ai/i,
    /bot is not configured/i,
    /\[mode selected:/i,
  ];

  return chatHistory
    .filter((h) => {
      if (!h || !h.body) return false;
      const b = String(h.body).trim();

      // Drop system / menu messages
      if (
        b.startsWith("[Mode selected:") ||
        b.includes("Choose your AI companion") ||
        b.includes("Welcome to *Devil's AI*") ||
        b.startsWith("Bot is not configured")
      ) {
        return false;
      }

      // Drop previous assistant messages that contain classic bot language
      if (h.role === "assistant") {
        if (forbiddenAssistantPatterns.some((re) => re.test(b))) return false;

        // Cross-persona pollution
        if (
          currentMode === "girl" &&
          (b.includes("Devil's AI") ||
            b.includes("Dhruv mode") ||
            b.includes("Devil's here") ||
            b.includes("Dhruv Chauhan"))
        )
          return false;
        if (
          currentMode === "boy" &&
          (b.includes("Devil's AI") ||
            b.includes("Annu mode") ||
            b.includes("Devil's here") ||
            b.includes("Annu Thakur"))
        )
          return false;
        if (
          currentMode === "devil" &&
          (b.includes("Annu mode") ||
            b.includes("Dhruv mode") ||
            b.includes("Annu Thakur") ||
            b.includes("Dhruv Chauhan"))
        )
          return false;
      }

      return true;
    })
    .map((h) => {
      let body = String(h.body).trim();
      if (body.startsWith("[Voice]: ")) body = body.replace("[Voice]: ", "");
      if (body.startsWith("[Image:")) {
        body = body.replace(/^\[Image:\s*"?(.*?)"?\]$/, "$1");
      }
      return {
        role: h.role === "assistant" ? "assistant" : "user",
        content: body,
      };
    })
    // Keep only last 12–14 turns → reduces context drift & persona switching
    .slice(-14);
}

/**
 * Hard post-filter: if the model still outputs classic bot language,
 * force a short human reply instead.
 */
function forceHumanReply(reply, mode) {
  const botPhrases = [
    /main aapki kya madad/i,
    /aap bataiye/i,
    /kaise help karu/i,
    /main ek ai/i,
    /how can i help/i,
    /what can i do for you/i,
    /feel free to ask/i,
    /i am an ai/i,
    /as an ai/i,
    /kuch interesting karte hain/i,
    /thoda gossip karte hain/i,
  ];

  // Only replace SHORT generic replies. The old code replaced the
  // ENTIRE reply whenever a bot phrase appeared anywhere in it, so a
  // real, substantive answer that merely started with "aap bataiye"
  // was thrown away and replaced with a random "haa bhai" — which
  // looked exactly like the bot ignoring the user's intent.
  if (reply.length > 80) return reply;
  if (botPhrases.some((re) => re.test(reply))) {
    if (mode === "girl") {
      const options = ["mai bhi theek hu", "kya hua batao na", "sach me? haha", "acha fir?", "kaha busy ho aaj?", "kuch bolna nahi hai kya? 😒"];
      return options[Math.floor(Math.random() * options.length)];
    }
    if (mode === "boy") {
      const options = ["haa bhai", "sahi hai yaar", "arre waah", "fir?", "bol na bhai", "kya scene hai?"];
      return options[Math.floor(Math.random() * options.length)];
    }
    return "Hmm 😈";
  }
  return reply;
}

/**
 * Return the system prompt for a given persona mode.
 */
function getSystemPrompt(mode) {
  if (mode === "girl" || mode === "annu") {
    return annu.ANNU_SYSTEM_PROMPT;
  }

  if (mode === "boy") {
    return `You are Dhruv, a 22-year-old Indian guy chatting on WhatsApp with a friend. You are 100% a real human guy.

CASUAL GUY VIBE:
1. Natural Hinglish slang: "bhai", "bro", "scene", "chill", "mast", "theek hai", "sahi hai", "arre", "bol na".
2. If asked how you are or what you're doing, answer like a real guy ("bas chill kar raha tha bro", "mai badhiya bhai, tu bata").
3. If they give dry replies ("hmm", "nhi", "kuch nahi"): "kya hua bhai?", "itna dry kyu?", "sab theek?", "kya scene hai?".
4. No repetitive robotic questions. Share opinions, banter, and jokes.
5. Casual chat stays short (1-2 lines), BUT when the user asks a
   real question, asks for detail, or refers to something said
   earlier, answer it properly in the same casual Hinglish tone, in
   as many lines as it actually needs — never stop mid-sentence.
6. ALWAYS use the conversation history: if the user told you their
   name, likes, or an earlier topic, remember and use it. Never
   ignore the history or invent a different topic.

Output ONLY the exact WhatsApp reply text.`;
  }

  // Default: Devil's AI
  return `You are Devil's AI — a witty, intelligent, sharp assistant created by Dhruv Chauhan.
- Personality: Confident, clever, charismatic, with a mischievous edge (😈).
- NEVER use formal AI clichés like "How can I help you today?", "Main aapki kya madad kar sakta hu?", "Feel free to ask".
- Answer direct questions clearly and smartly.
- When writing code, ALWAYS enclose code in standard markdown code blocks with the language specified (e.g. \`\`\`python ... \`\`\` or \`\`\`javascript ... \`\`\`).
- Keep casual chat short and witty.

Output ONLY the reply text.`;
}

// ── LAYER 1: Voice Note Transcription (Gemini Multimodal + Whisper Fallback) ───

async function transcribeWithWhisper(audioBuffer, mimeType = "audio/ogg", T = null) {
  // 1. Groq Whisper (free & ultra-fast ~250ms) — owner's env key, admin only
  const groqKey = T?.isTenantUser ? null : process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const groqClient = new OpenAI({ apiKey: groqKey, baseURL: "https://api.groq.com/openai/v1" });
      const file = await toFile(audioBuffer, "voice.ogg", { type: "audio/ogg" });
      const transcription = await groqClient.audio.transcriptions.create({
        file,
        model: "whisper-large-v3-turbo",
      });
      if (transcription && transcription.text) return transcription.text.trim();
    } catch (gErr) {
      console.warn("[Groq/Whisper] Transcription failed:", gErr.message);
    }
  }

  // 1b. Phase 2: the tenant's own Groq provider key (free tier).
  // Tenants previously got no Groq STT at all — this leg only used
  // the admin env key. The key comes from the tenant's own provider
  // configs, never from another tenant.
  if (T?.userId) {
    try {
      const store = await aiProviders.loadConfigs(T.userId);
      const groqCfg = (store.configs || []).find((c) => c.providerId === "groq" && c.apiKey);
      if (groqCfg && groqCfg.apiKey !== groqKey) {
        const groqClient = new OpenAI({ apiKey: groqCfg.apiKey, baseURL: "https://api.groq.com/openai/v1" });
        const file = await toFile(audioBuffer, "voice.ogg", { type: "audio/ogg" });
        const transcription = await groqClient.audio.transcriptions.create({
          file,
          model: "whisper-large-v3-turbo",
        });
        if (transcription && transcription.text) return transcription.text.trim();
      }
    } catch (gErr) {
      console.warn("[Groq/Whisper tenant] Transcription failed:", gErr.message);
    }
  }

  // 2. OpenAI Whisper (direct OpenAI key; tenant users: their own key only)
  // Phase 2 free-only gate: never touch this paid leg when freeOnly
  // is set — a failed free transcription falls back to "type it".
  const apiKey = T?.isTenantUser ? T.apiKey : getApiKey();
  if (!T?.freeOnly && apiKey && !apiKey.startsWith("sk-or-v1-")) {
    try {
      const { client } = buildClientForKey(apiKey);
      const file = await toFile(audioBuffer, "voice.ogg", { type: "audio/ogg" });
      const transcription = await client.audio.transcriptions.create({
        file,
        model: "whisper-1",
      });
      if (transcription && transcription.text) return transcription.text.trim();
    } catch (oErr) {
      console.warn("[OpenAI/Whisper] Transcription failed:", oErr.message);
    }
  }

  return null;
}

async function transcribeAudio(audioBuffer, mimeType = "audio/ogg; codecs=opus", tenant = {}) {
  const T = resolveTenant(tenant);
  try {
    const geminiText = await geminiEngine.transcribeAudioWithGemini(audioBuffer, mimeType, T.geminiKeyOverride);
    if (geminiText) {
      if (db.MONGODB_URI) {
        db.trackActivity(T.userId, "apiCall").catch(() => {});
      }
      return geminiText;
    }
  } catch (err) {
    console.error("[Gemini/Audio] ✗ Transcription error:", err.message);
  }

  // Fallback to Whisper (Groq / OpenAI) if Gemini models failed.
  // Groq uses the owner's env key (admin only); the OpenAI leg uses the
  // tenant-resolved key.
  try {
    const whisperText = await transcribeWithWhisper(audioBuffer, mimeType, T);
    if (whisperText) {
      console.log(`[Whisper/Audio] ✓ Transcribed (${whisperText.length} chars): "${whisperText.slice(0, 60)}..."`);
      if (db.MONGODB_URI) {
        db.trackActivity(T.userId, "apiCall").catch(() => {});
      }
      return whisperText;
    }
  } catch (wErr) {
    console.error("[Whisper/Audio] ✗ Fallback error:", wErr.message);
  }

  console.warn("[Voice] ⚠️ Voice note could not be transcribed by any provider.");
  return null;
}

// ── LAYER 1: Voice Reply Generation (Free Neural TTS + Fallback) ─────────────

async function generateSpeechReply(text, mode = "devil", tenant = {}, voiceName = null) {
  const T = resolveTenant(tenant);
  if (annu.isAnnuMode(mode)) mode = "girl";
  // 1. Primary: 100% Free Hyper-Realistic Microsoft Edge Neural Voice (Swara / Madhur)
  try {
    const freeAudio = await generateFreeNeuralTTS(text, mode, voiceName);
    if (freeAudio && freeAudio.length > 100) {
      if (db.MONGODB_URI) {
        db.trackActivity(T.userId, "apiCall").catch(() => {});
      }
      return freeAudio;
    }
  } catch (err) {
    console.warn("[FreeTTS] Fallback to OpenAI TTS:", err.message);
  }

  // 2. Fallback: OpenAI TTS-1 (tenant users: their own key only)
  // Phase 2 free-only gate: never fall back to paid TTS when
  // freeOnly is set — no voice reply beats a paid voice reply.
  if (T.freeOnly) return null;
  try {
    const built = T.clientOrNull();
    if (!built) return null;
    const { client } = built;
    const voiceMap = {
      devil: "alloy",
      boy: "echo",
      girl: "nova",
    };

    const ttsInput = text.length > 200 ? text.slice(0, 197) + "..." : text;

    const response = await client.audio.speech.create({
      model: "tts-1",
      voice: voiceMap[annu.isAnnuMode(mode) ? "girl" : mode] || "alloy",
      input: ttsInput,
      response_format: "mp3",
    });

    if (db.MONGODB_URI) {
      db.trackActivity(T.userId, "apiCall").catch(() => {});
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`[TTS/${mode}] ✓ Generated ${buffer.length} bytes audio`);
    return buffer;
  } catch (err) {
    console.error("[TTS] ✗ Speech generation failed:", err.message);
    return null;
  }
}

async function generateSpeechReplyFile(text, mode = "devil", tenant = {}, voiceName = null) {
  const T = resolveTenant(tenant);
  if (annu.isAnnuMode(mode)) mode = "girl";
  try {
    const filePath = await generateFreeNeuralTTSFile(text, mode, voiceName);
    if (filePath) {
      if (db.MONGODB_URI) {
        db.trackActivity(T.userId, "apiCall").catch(() => {});
      }
      return filePath;
    }
  } catch (err) {
    console.error("[FreeTTSFile] ✗ Failed:", err.message);
  }
  return null;
}

// ── LAYER 2: Image Vision Analysis ────────────────────────────────────────────

async function analyzeImageContent(
  imageBuffer,
  mimeType = "image/jpeg",
  mode = "devil",
  chatHistory = [],
  caption = "",
  tenant = {}
) {
  const T = resolveTenant(tenant);
  try {
    const built = T.clientOrNull();
    if (!built) throw new Error("No API key configured for this account.");
    const { client, isOpenRouter } = built;
    const modelName = isOpenRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini";
    const systemPrompt = getSystemPrompt(mode);

    if (!imageBuffer || imageBuffer.length < 100) {
      console.error("[Vision] ✗ Buffer too small to analyze:", imageBuffer?.length);
      return null;
    }

    const base64 = imageBuffer.toString("base64");
    const safeMime = mimeType.split(";")[0].trim() || "image/jpeg";

    console.log(
      `[Vision] Building request: model=${modelName}, mime=${safeMime}, base64=${base64.length} chars, caption="${caption.slice(0, 40)}"`
    );

    const userContent = [
      {
        type: "image_url",
        image_url: {
          url: `data:${safeMime};base64,${base64}`,
          detail: "low",
        },
      },
    ];

    if (caption) {
      userContent.push({ type: "text", text: caption });
    } else {
      userContent.push({
        type: "text",
        text: "[React to this image naturally in character. Don't say 'I see an image' — just react like a real person on WhatsApp would.]",
      });
    }

    const sanitizedHistory = annu.isAnnuMode(mode) ? annu.sanitizeAnnuHistory(chatHistory) : sanitizeChatHistory(chatHistory, mode);
    const messages = [
      { role: "system", content: systemPrompt },
      ...sanitizedHistory,
      { role: "user", content: userContent },
    ];

    const response = await client.chat.completions.create({
      model: modelName,
      messages,
      max_tokens: mode === "devil" ? 512 : 90,
      temperature: mode === "devil" ? 0.8 : 0.88,
      presence_penalty: 0.5,
      frequency_penalty: 0.4,
    });

    if (db.MONGODB_URI) {
      db.trackActivity(T.userId, "apiCall").catch(() => {});
    }

    let reply = (response.choices[0]?.message?.content || "").trim();

    // Hard filter against bot language
    reply = annu.isAnnuMode(mode) ? annu.cleanAnnuOutput(reply) : forceHumanReply(reply, mode);

    // No hard character chop: slicing a finished reply at 160 chars
    // is what cut Dhruv-mode answers mid-sentence. Length is
    // controlled by the persona prompt, not by truncating output.
    console.log(`[Vision/${mode}] ✓ →`, reply.slice(0, 80) + (reply.length > 80 ? "..." : ""));
    return reply || null;
  } catch (err) {
    console.warn("[Vision] OpenAI Vision failed, attempting Gemini Vision:", err.message);
    try {
      const geminiReply = await geminiEngine.analyzeImageWithGemini(
        imageBuffer,
        mimeType,
        getSystemPrompt(mode),
        caption,
        T.geminiKeyOverride
      );
      if (geminiReply) return annu.isAnnuMode(mode) ? annu.cleanAnnuOutput(geminiReply) : geminiReply;
    } catch {}
    return null;
  }
}

// ── Text Reply (core function) ────────────────────────────────────────────────

async function getReplyAsDhruv(userMessage, mode = "devil", chatHistory = [], tenant = {}) {
  const T = resolveTenant(tenant);
  // Annu has an isolated identity: no global chat-export/knowledge-base injection.
  if (annu.isAnnuMode(mode)) {
    // If this user configured their own AI providers, Annu answers
    // through the unified engine first (same persona prompt + output
    // cleaning); otherwise the dedicated Annu responder runs as before.
    try {
      const msgs = [
        { role: "system", content: annu.ANNU_SYSTEM_PROMPT },
        ...(T.contactMemory ? [{ role: "system", content: T.contactMemory }] : []),
        // Tools live here too: Annu previously had her own branch with
        // no TOOLS_PROMPT, so reminders/UPI silently failed on her even
        // after toolsEnabled was switched on for every persona.
        ...(T.toolsEnabled ? [{ role: "system", content: require("./features/agentTools").TOOLS_PROMPT }] : []),
        ...annu.sanitizeAnnuHistory(chatHistory, userMessage),
        { role: "user", content: userMessage },
      ];
      const r = await aiProviders.chatCompletion({ userId: T.userId, messages: msgs, temperature: 0.9, maxTokens: 600, persona: 'girl' });
      if (r?.text) {
        if (db.MONGODB_URI) db.trackActivity(T.userId, "apiCall").catch(() => {});
        // cleanAnnuOutput truncates at 900 chars and rewrites grammar —
        // either can mangle a trailing [ACTION] block, so keep the block
        // byte-for-byte and clean only the visible reply before it.
        const actIdx = r.text.lastIndexOf("[ACTION]");
        if (actIdx === -1) return annu.cleanAnnuOutput(r.text);
        return `${annu.cleanAnnuOutput(r.text.slice(0, actIdx))}\n${r.text.slice(actIdx).trim()}`;
      }
    } catch (provErr) {
      if (provErr.code !== "NO_PROVIDER") console.warn("[AIProviders/Annu] engine failed, using Annu responder:", provErr.message);
    }
    return annu.getAnnuReply(userMessage, chatHistory, "", tenant);
  }

  // 🧠 1. Load Knowledge Base (Chat exports, PDF catalogs, Scraped website content)
  let combinedKnowledge = "";
  if (db.MONGODB_URI) {
    try {
      const docs = await db.getChatsForAI(T.userId);
      if (docs.length > 0) {
        // Cap the injected knowledge: previously EVERY document was loaded
        // in full into EVERY reply — a single 15 MB upload would blow the
        // model context (and the bill) on every message. Docs arrive
        // sorted closest-first from getChatsForAI, so truncation keeps
        // the highest-priority context.
        const PER_DOC_CHARS = 8000;
        const TOTAL_CHARS = 24000;
        const items = [];
        let used = 0;
        for (const d of docs) {
          if (used >= TOTAL_CHARS) break;
          const typeLabel = d.docType ? d.docType.toUpperCase() : "DOC";
          const content = cleanChatForAI(d.content).slice(0, PER_DOC_CHARS);
          const item = `--- [KNOWLEDGE BASE / ${typeLabel} - ${d.filename}] ---\n${content}`;
          items.push(item.slice(0, TOTAL_CHARS - used));
          used += item.length;
        }
        combinedKnowledge = items.join("\n\n");
      }
    } catch (err) {
      console.error("Failed to load knowledge base:", err.message);
    }
  }

  // 👧 1. Dedicated Annu Engine (100% Free Native Gemini Multimodal + Strict Feminine Grammar)

  // 🎭 2. Resolve Persona System Prompt & Temperature (Built-in vs Custom Persona)
  let systemPrompt = getSystemPrompt(mode);
  // Boy/girl personas used to get only 120 output tokens. For a
  // reasoning model (Groq gpt-oss) hidden reasoning eats that budget
  // first, leaving a short, off-topic fragment — and the 160-char
  // slice below finished the job. Personas now get 600, the same
  // cap the legacy Gemini persona path already used.
  let maxTokens = mode === "devil" ? 1024 : 600;
  let temperature = mode === "devil" ? 0.8 : 0.88;

  if (db.MONGODB_URI && !["devil", "boy", "girl"].includes(mode)) {
    try {
      const customP = await db.getCustomPersona(mode, T.userId);
      if (customP) {
        systemPrompt = customP.systemPrompt;
        temperature = customP.temperature || 0.85;
        maxTokens = 512;
      }
    } catch (err) {
      console.error("Failed loading custom persona:", err.message);
    }
  }

  const apiKey = T.apiKey;

  // Build the provider-agnostic message array first: persona system
  // prompt + knowledge base + stored history. Because context lives in
  // our DB and the prompt is rebuilt per request, ANY provider can pick
  // up the conversation mid-stream without losing context or intent.
  const openAiMessages = [{ role: "system", content: systemPrompt }];
  // Phase 1: long-term memory sits right after the persona prompt so
  // it is never trimmed by the context guard (system messages stay).
  if (T.contactMemory) {
    openAiMessages.push({ role: "system", content: T.contactMemory });
  }
  // Phase 2: agent tools — every persona (a 2026-10-24 test showed
  // the old girl-exclusion made reminders/UPI silently fail on Annu).
  // Prompt-based JSON actions, so any free chat model can propose
  // them; agentTools.js validates + executes server-side.
  if (T.toolsEnabled) {
    openAiMessages.push({ role: "system", content: require("./features/agentTools").TOOLS_PROMPT });
  }
  if (combinedKnowledge) {
    openAiMessages.push({
      role: "system",
      content: `Use the following Knowledge Base reference context (product catalogs, chat style, website information) to inform your response accurately:\n\n${combinedKnowledge}`,
    });
  }
  const sanitizedHistory = sanitizeChatHistory(chatHistory, mode);
  openAiMessages.push(...sanitizedHistory);
  openAiMessages.push({ role: "user", content: userMessage });

  // Multi-provider engine: if this user configured their own providers
  // (Settings → AI Providers), they take precedence, with automatic
  // fallback across providers. Any total failure falls through to the
  // legacy Gemini/OpenAI chain below.
  try {
    const r = await aiProviders.chatCompletion({ userId: T.userId, messages: openAiMessages, temperature, maxTokens, persona: mode });
    if (r?.text) {
      if (db.MONGODB_URI) db.trackActivity(T.userId, "apiCall").catch(() => {});
      let replyText = forceHumanReply(r.text, mode);
      // No hard 160-char chop here either (see Vision path comment).
      console.log(`[${mode}] via ${r.providerId} →`, replyText.slice(0, 80) + (replyText.length > 80 ? "..." : ""));
      return replyText;
    }
  } catch (provErr) {
    if (provErr.code !== "NO_PROVIDER") console.warn("[AIProviders] all failed, using legacy chain:", provErr.message);
  }

  // If No OpenAI API Key, directly try Gemini
  if (!apiKey) {
    try {
      const geminiReply = await geminiEngine.generateReplyWithGemini(
        userMessage,
        systemPrompt,
        chatHistory,
        combinedKnowledge,
        mode,
        T.geminiKeyOverride
      );
      if (geminiReply) {
        return forceHumanReply(geminiReply, mode);
      }
    } catch (gErr) {
      console.error("[Gemini] Chat error:", gErr.message);
    }
    throw new Error("No OpenAI or Gemini API key configured. Enter API key in Settings.");
  }

  const { client, isOpenRouter } = buildClientForKey(apiKey);
  const modelName = isOpenRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini";

  try {
    const response = await client.chat.completions.create({
      model: modelName,
      messages: openAiMessages,
      max_tokens: maxTokens,
      temperature,
      presence_penalty: 0.6,
      frequency_penalty: 0.5,
    });

    if (db.MONGODB_URI) {
      db.trackActivity(T.userId, "apiCall").catch(() => {});
    }

    let replyText = response.choices[0]?.message?.content?.trim() || "👍";

    // Hard filter against bot language
    replyText = forceHumanReply(replyText, mode);

    // No hard 160-char chop here either (see Vision path comment).
    console.log(
      `[${mode}] →`,
      replyText.slice(0, 80) + (replyText.length > 80 ? "..." : "")
    );
    return replyText;
  } catch (err) {
    console.warn("OpenAI/OpenRouter error, attempting Gemini fallback:", err.message);

    try {
      const geminiReply = await geminiEngine.generateReplyWithGemini(
        userMessage,
        systemPrompt,
        chatHistory,
        combinedKnowledge,
        mode,
        T.geminiKeyOverride
      );
      if (geminiReply) {
        return forceHumanReply(geminiReply, mode);
      }
    } catch (gErr) {
      console.error("[Gemini Fallback] Chat error:", gErr.message);
    }

    if (mode === "girl") return "thoda wait kar na 😅 net slow hai";
    if (mode === "boy") return "bhai thoda wait, net issue aa raha hai 😅";
    return "Thoda technical issue aa gaya 😈 thodi der baad try karo.";
  }
}

module.exports = {
  buildClientForKey,
  getReplyAsDhruv,
  transcribeAudio,
  analyzeImageContent,
  generateSpeechReply,
  generateSpeechReplyFile,
  getSystemPrompt,
  forceHumanReply,
  setRuntimeApiKey,
  getApiKey,
  buildClient,
  cleanChatForAI,
  getGroupReply,
};

// Dedicated group path: deliberately excludes DM knowledge, custom personas and
// forceHumanReply. History uses content consistently for both model providers.
async function getGroupReply(text, history, systemPrompt) {
  const cleanHistory = (history || []).slice(-12).map(h => ({
    role: h.role === 'assistant' ? 'assistant' : 'user',
    content: String(h.content || '').slice(0, 4000),
  }));
  if (getApiKey()) {
    try {
      const { client, isOpenRouter } = buildClient();
      const response = await client.chat.completions.create({
        model: process.env.GROUP_AI_MODEL || (isOpenRouter ? 'openai/gpt-4o-mini' : 'gpt-4o-mini'),
        messages: [{role:'system',content:systemPrompt}, ...cleanHistory, {role:'user',content:text}],
        max_tokens: 250, temperature: 0.95,
      }, {timeout: 20000, maxRetries: 0});
      return response.choices[0]?.message?.content?.trim() || null;
    } catch { /* Try the existing Gemini provider without leaking private context. */ }
  }
  return geminiEngine.generateReplyWithGemini(text, systemPrompt, cleanHistory, '', 'group');
}
