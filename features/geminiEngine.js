/**
 * Google Gemini Multimodal Engine (100% Free Tier Supported)
 * Handles Chat Completions, Voice Transcription & Vision Analysis using verified live Gemini models.
 * Validated live on Google Generative AI API:
 *   - Audio: gemini-3.6-flash (~1.6s), gemini-3.5-flash (~2.7s), gemini-3.5-transcribe (~220ms)
 *   - Chat:  gemini-3.6-flash (~2.1s), gemini-3.5-flash (~2.1s), gemma-4-26b-a4b-it (~2.4s)
 */
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getDb } = require("../db");

let runtimeGeminiKey = null;
let activeKeyIndex = 0;

// Verified live models on Google API endpoint
const GEMINI_AUDIO_MODELS = [
  "gemini-3.6-flash",       // Primary: Fast multimodal audio transcription (~1.6s)
  "gemini-3.5-flash",       // Secondary: Rock-solid multimodal audio (~2.7s)
  "gemini-3.5-transcribe",  // Dedicated speech-to-text transcribe endpoint (~220ms)
  "gemini-3.8-flash",       // Fast fallback
  "gemini-flash-latest",    // Canonical fallback alias
];

const GEMINI_CHAT_MODELS = [
  "gemini-3.6-flash",       // Primary: Fast chat completions (~2.1s)
  "gemini-3.5-flash",       // Secondary: High quota chat (~2.1s)
  "gemma-4-26b-a4b-it",     // Tertiary: Fast conversational instruction model (~2.4s)
  "gemini-3.8-flash",       // Fast fallback
  "gemini-flash-latest",    // Canonical fallback alias
];

const GEMINI_VISION_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

function setRuntimeGeminiKey(key) {
  runtimeGeminiKey = key ? String(key).trim() : null;
}

function parseKeys(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(k => String(k).trim()).filter(Boolean);
  return String(raw).split(/[,\s]+/).map(k => k.trim()).filter(Boolean);
}

async function getAllGeminiKeys(keyOverride) {
  // Tenant isolation: when a key override is supplied (including an empty
  // string), ONLY that key may be used — a registered user's bot must
  // never fall back to the owner's Gemini key.
  if (keyOverride !== undefined) {
    return keyOverride ? [String(keyOverride).trim()] : [];
  }
  const keys = [];
  if (runtimeGeminiKey) keys.push(...parseKeys(runtimeGeminiKey));
  if (process.env.GEMINI_API_KEY) keys.push(...parseKeys(process.env.GEMINI_API_KEY));
  if (process.env.GOOGLE_API_KEY) keys.push(...parseKeys(process.env.GOOGLE_API_KEY));

  try {
    const db = await getDb();
    const doc = await db.collection("settings").findOne({ key: "geminiApiKey" });
    if (doc && doc.value) keys.push(...parseKeys(doc.value));
  } catch {}

  return [...new Set(keys)];
}

async function getGeminiApiKey() {
  const keys = await getAllGeminiKeys();
  if (keys.length === 0) return null;
  return keys[activeKeyIndex % keys.length];
}

function rotateGeminiKey(keysCount) {
  if (keysCount > 1) {
    activeKeyIndex = (activeKeyIndex + 1) % keysCount;
    console.log(`[GeminiEngine] 🔄 Rotated to key index ${activeKeyIndex + 1}/${keysCount}`);
  }
}

async function saveGeminiApiKey(key) {
  const cleanKey = String(key || "").trim();
  runtimeGeminiKey = cleanKey || null;

  try {
    const db = await getDb();
    await db.collection("settings").updateOne(
      { key: "geminiApiKey" },
      { $set: { key: "geminiApiKey", value: cleanKey, updatedAt: new Date() } },
      { upsert: true }
    );
    return true;
  } catch (err) {
    console.error("[GeminiEngine] saveGeminiApiKey error:", err.message);
    return false;
  }
}

let geminiCooldownUntil = 0;

function isGeminiOnCooldown() {
  return Date.now() < geminiCooldownUntil;
}

function triggerGeminiCooldown(seconds = 20) {
  geminiCooldownUntil = Date.now() + seconds * 1000;
  console.warn(`[GeminiEngine] ⏸️ Rate-limit cooldown activated for ${seconds}s (until ${new Date(geminiCooldownUntil).toLocaleTimeString()})`);
}

/**
 * 1. Chat Completion using Google Gemini (Resilient multi-model & key fallback)
 */
async function generateReplyWithGemini(userMessage, systemPrompt = "", chatHistory = [], knowledgeBase = "", mode = "girl", keyOverride) {
  if (isGeminiOnCooldown()) {
    return null;
  }

  const allKeys = await getAllGeminiKeys(keyOverride);
  if (allKeys.length === 0) return null;

  const historyContents = [];
  for (const msg of chatHistory.slice(-10)) {
    if (msg.role === "user") {
      historyContents.push({ role: "user", parts: [{ text: String(msg.content || "") }] });
    } else if (msg.role === "assistant" || msg.role === "model") {
      historyContents.push({ role: "model", parts: [{ text: String(msg.content || "") }] });
    }
  }

  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
  ];
  const systemInstruction = systemPrompt + (knowledgeBase ? `\n\n--- KNOWLEDGE BASE CONTEXT ---\n${knowledgeBase}` : "");

  // One chat attempt. Returns { text, finishReason }.
  async function attemptChat(genAI, modelName, generationConfig) {
    const model = genAI.getGenerativeModel({ model: modelName, systemInstruction, safetySettings });
    const chat = model.startChat({ history: historyContents, generationConfig });
    // 7s timeout race per attempt
    const replyPromise = chat.sendMessage(userMessage);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Gemini timeout 7000ms on ${modelName}`)), 7000)
    );
    const result = await Promise.race([replyPromise, timeoutPromise]);
    return {
      text: result.response.text()?.trim() || "",
      finishReason: result.response.candidates?.[0]?.finishReason || "",
    };
  }

  const keysToTry = Math.min(allKeys.length, 2);
  for (let k = 0; k < keysToTry; k++) {
    const apiKey = allKeys[(activeKeyIndex + k) % allKeys.length];
    const genAI = new GoogleGenerativeAI(apiKey);

    for (const modelName of GEMINI_CHAT_MODELS) {
      try {
        // ⚠️ Thinking models (gemini-3.x / 2.5 flash) count their hidden
        // reasoning in maxOutputTokens. With the old 350-token cap the
        // model spent ~330 tokens thinking and the visible reply was cut
        // mid-word (finishReason MAX_TOKENS, ~13 tokens of text). Casual
        // WhatsApp replies need no hidden reasoning: thinkingBudget 0,
        // plus a sane output cap.
        const baseConfig = {
          maxOutputTokens: mode === "devil" ? 1000 : 600,
          temperature: mode === "devil" ? 0.8 : 0.95,
          thinkingConfig: { thinkingBudget: 0 },
        };
        let outcome;
        try {
          outcome = await attemptChat(genAI, modelName, baseConfig);
        } catch (cfgErr) {
          // A model that rejects thinkingConfig gets one retry without it
          // (with a bigger cap so its reasoning can't starve the reply).
          if (!/thinking/i.test(cfgErr.message || "")) throw cfgErr;
          outcome = await attemptChat(genAI, modelName, { ...baseConfig, maxOutputTokens: 1600, thinkingConfig: undefined });
        }
        // Belt-and-braces: if the reply still hit the token ceiling,
        // retry once with double the budget instead of sending a
        // sentence cut in half.
        if (outcome.finishReason === "MAX_TOKENS" && outcome.text) {
          console.warn(`[Gemini/${modelName}/${mode}] Reply hit MAX_TOKENS at ${outcome.text.length} chars — retrying with a larger budget`);
          const retry = await attemptChat(genAI, modelName, { ...baseConfig, maxOutputTokens: baseConfig.maxOutputTokens * 2 });
          if (retry.text) outcome = retry;
        }
        if (outcome.text) {
          console.log(`[Gemini/${modelName}/${mode}] ✓ Generated reply (${outcome.text.length} chars, finish=${outcome.finishReason || "?"}): "${outcome.text.slice(0, 60)}..."`);
          return outcome.text;
        }
      } catch (err) {
        console.warn(`[Gemini/${modelName}/Chat] Failed: ${err.message.slice(0, 100)}`);
        // Only trigger cooldown on 429 quota exhaustion; 503 (demand spike) or 404 should try next model immediately
        if (err.message.includes("429") || err.message.includes("Quota exceeded") || err.message.includes("RESOURCE_EXHAUSTED")) {
          rotateGeminiKey(allKeys.length);
          if (k === keysToTry - 1) triggerGeminiCooldown(20);
          break; // move to next key
        }
      }
    }
  }

  return null;
}

/**
 * 2. Voice Note Audio Transcription using Gemini (Live verified models with 7s timeout guard)
 */
async function transcribeAudioWithGemini(audioBuffer, mimeType = "audio/ogg", keyOverride) {
  const allKeys = await getAllGeminiKeys(keyOverride);
  if (allKeys.length === 0 || !audioBuffer || audioBuffer.length < 50) {
    if (allKeys.length === 0) console.warn("[Gemini/Audio] No Gemini API key configured.");
    return null;
  }

  const base64Audio = audioBuffer.toString("base64");
  let safeMime = (mimeType || "audio/ogg").split(";")[0].trim().toLowerCase();
  if (safeMime === "audio/opus" || safeMime === "audio/ogg") safeMime = "audio/ogg";
  else if (safeMime === "audio/mpeg") safeMime = "audio/mp3";

  const promptText = "Transcribe this audio voice note accurately. Return ONLY the transcribed text in the original language (Hindi/Hinglish/English). Do NOT add explanations, timestamps or introductory phrases.";

  const keysToTry = Math.min(allKeys.length, 2);
  for (let k = 0; k < keysToTry; k++) {
    const apiKey = allKeys[(activeKeyIndex + k) % allKeys.length];
    const genAI = new GoogleGenerativeAI(apiKey);

    for (const modelName of GEMINI_AUDIO_MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const genPromise = model.generateContent([
          {
            inlineData: {
              mimeType: safeMime,
              data: base64Audio,
            },
          },
          { text: promptText },
        ]);

        // 7s per-model timeout race to avoid freezing the message queue
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout 7000ms on ${modelName}`)), 7000)
        );
        const result = await Promise.race([genPromise, timeoutPromise]);

        const text = result.response.text()?.trim() || "";
        if (text) {
          console.log(`[Gemini/${modelName}/Audio] ✓ Transcribed (${text.length} chars): "${text.slice(0, 60)}..."`);
          return text;
        }
      } catch (err) {
        console.warn(`[Gemini/${modelName}/Audio] Failed (${err.message.slice(0, 100)}), trying fallback...`);
        if (err.message.includes("429") || err.message.includes("Quota exceeded") || err.message.includes("RESOURCE_EXHAUSTED")) {
          rotateGeminiKey(allKeys.length);
          break; // break to next key
        }
      }
    }
  }

  console.error("[Gemini/Audio] ✗ All Gemini audio transcription models failed.");
  return null;
}

/**
 * 3. Vision / Image Analysis using Gemini
 */
async function analyzeImageWithGemini(imageBuffer, mimeType = "image/jpeg", systemPrompt = "", caption = "", keyOverride) {
  const allKeys = await getAllGeminiKeys(keyOverride);
  if (allKeys.length === 0 || !imageBuffer) return null;

  const base64Image = imageBuffer.toString("base64");
  const safeMime = mimeType.split(";")[0].trim() || "image/jpeg";
  const promptText = caption || "React to this image naturally as your persona on WhatsApp. Keep it casual and conversational.";

  const keysToTry = Math.min(allKeys.length, 2);
  for (let k = 0; k < keysToTry; k++) {
    const apiKey = allKeys[(activeKeyIndex + k) % allKeys.length];
    const genAI = new GoogleGenerativeAI(apiKey);

    for (const modelName of GEMINI_VISION_MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
        });

        const genPromise = model.generateContent([
          {
            inlineData: {
              mimeType: safeMime,
              data: base64Image,
            },
          },
          { text: promptText },
        ]);

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout 7000ms on ${modelName}`)), 7000)
        );
        const result = await Promise.race([genPromise, timeoutPromise]);

        const reply = result.response.text()?.trim() || "";
        if (reply) {
          console.log(`[Gemini/${modelName}/Vision] ✓ Analyzed image: "${reply.slice(0, 60)}..."`);
          return reply;
        }
      } catch (err) {
        console.warn(`[Gemini/${modelName}/Vision] Failed (${err.message.slice(0, 100)}), trying fallback...`);
        if (err.message.includes("429") || err.message.includes("Quota exceeded") || err.message.includes("RESOURCE_EXHAUSTED")) {
          rotateGeminiKey(allKeys.length);
          break;
        }
      }
    }
  }

  return null;
}

module.exports = {
  getGeminiApiKey,
  saveGeminiApiKey,
  setRuntimeGeminiKey,
  generateReplyWithGemini,
  transcribeAudioWithGemini,
  analyzeImageWithGemini,
};
