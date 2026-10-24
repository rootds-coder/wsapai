/**
 * Free Neural Voice Engine & Gemini Multimodal Audio Transcriber
 * Provides 100% free speech synthesis (Edge Neural TTS) & free voice transcription (Gemini 2.5 Flash / Groq / Whisper).
 */
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Neural voice mappings for Indian Hindi/English personas
const PERSONA_VOICES = {
  girl: "hi-IN-SwaraNeural",    // Annu: Natural, warm Indian Hindi/English girl
  boy: "hi-IN-MadhurNeural",     // Dhruv: Friendly young Indian boy
  devil: "hi-IN-MadhurNeural",   // Devil: Confident Indian male
  default: "hi-IN-SwaraNeural",
};

// Phase 2: every voice here is a free Microsoft Edge Neural voice —
// no key, no payment. Owners may pick one per persona in Settings;
// an unknown name is ignored and the persona default is used, so a
// bad saved value can never break voice replies.
const VOICE_OPTIONS = [
  { id: "hi-IN-SwaraNeural", label: "Swara — warm Hindi girl", lang: "hi-IN" },
  { id: "hi-IN-MadhurNeural", label: "Madhur — friendly Hindi boy", lang: "hi-IN" },
  { id: "en-IN-NeerjaNeural", label: "Neerja — English girl (India)", lang: "en-IN" },
  { id: "en-IN-PrabhatNeural", label: "Prabhat — English boy (India)", lang: "en-IN" },
];

function resolveVoice(mode, voiceName) {
  if (voiceName && VOICE_OPTIONS.some((v) => v.id === voiceName)) return voiceName;
  return PERSONA_VOICES[mode] || PERSONA_VOICES.default;
}

const fs = require("fs");
const path = require("path");

/**
 * Generate a hyper-realistic voice note file on disk for WhatsApp streaming (100% FREE)
 * @param {string} text The text to synthesize
 * @param {string} mode Persona name ('girl', 'boy', 'devil')
 * @returns {Promise<string|null>} Path to saved audio file
 */
async function generateFreeNeuralTTSFile(text, mode = "girl", voiceNameOverride = null) {
  if (!text || typeof text !== "string") return null;

  try {
    const cleanText = text
      .replace(/[*_~`]/g, "")
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
      .trim();

    if (!cleanText) return null;

    const voiceName = resolveVoice(mode, voiceNameOverride);
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const tempDir = path.join(__dirname, "../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const tempPath = path.join(tempDir, `voice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp3`);
    const opusPath = tempPath.replace(/\.mp3$/, ".opus");
    const writeStream = fs.createWriteStream(tempPath);
    const { audioStream } = tts.toStream(cleanText);

    return new Promise((resolve) => {
      audioStream.pipe(writeStream);
      writeStream.on("finish", () => {
        try {
          const { execSync } = require("child_process");
          execSync(`ffmpeg -y -i "${tempPath}" -c:a libopus -b:a 24k -application voip -vbr on "${opusPath}" 2>/dev/null`);
          try { fs.unlinkSync(tempPath); } catch (_) {}
          const stats = fs.statSync(opusPath);
          console.log(`[FreeTTS/${mode}] ✓ Generated WhatsApp Opus voice note (${stats.size} bytes) at ${opusPath}`);
          resolve(opusPath);
        } catch (convErr) {
          // If ffmpeg fails, fallback to mp3
          console.warn("[FreeTTS] Opus conversion fallback to mp3:", convErr.message);
          resolve(tempPath);
        }
      });
      writeStream.on("error", (err) => {
        console.error(`[FreeTTS] ✗ File write error:`, err.message);
        resolve(null);
      });
      audioStream.on("error", (err) => {
        console.error(`[FreeTTS] ✗ Audio stream error:`, err.message);
        resolve(null);
      });
    });
  } catch (err) {
    console.error(`[FreeTTS] ✗ Generation failed:`, err.message);
    return null;
  }
}

/**
 * Generate a hyper-realistic voice note buffer for WhatsApp (100% FREE, No OpenAI quota needed)
 * @param {string} text The text to synthesize
 * @param {string} mode Persona name ('girl', 'boy', 'devil')
 * @returns {Promise<Buffer|null>}
 */
async function generateFreeNeuralTTS(text, mode = "girl", voiceNameOverride = null) {
  if (!text || typeof text !== "string") return null;

  try {
    const cleanText = text
      .replace(/[*_~`]/g, "") // remove markdown bold/italic asterisks
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "") // strip emojis for cleaner voice cadence
      .trim();

    if (!cleanText) return null;

    const voiceName = resolveVoice(mode, voiceNameOverride);
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(cleanText);

    return new Promise((resolve) => {
      const chunks = [];
      audioStream.on("data", (chunk) => chunks.push(chunk));
      audioStream.on("end", () => {
        const audioBuffer = Buffer.concat(chunks);
        console.log(`[FreeTTS/${mode}] ✓ Generated ${audioBuffer.length} bytes using ${voiceName}`);
        resolve(audioBuffer);
      });
      audioStream.on("error", (err) => {
        console.error(`[FreeTTS] ✗ Stream error:`, err.message);
        resolve(null);
      });
    });
  } catch (err) {
    console.error(`[FreeTTS] ✗ Generation failed:`, err.message);
    return null;
  }
}

/**
 * Free Audio Transcription using Google Gemini 2.5 Flash / 1.5 Flash (Free Tier)
 * @param {Buffer} audioBuffer
 * @param {string} mimeType
 * @param {string} geminiApiKey
 * @returns {Promise<string|null>}
 */
async function transcribeWithGemini(audioBuffer, mimeType = "audio/ogg", geminiApiKey) {
  const key = geminiApiKey || process.env.GEMINI_API_KEY;
  if (!key) return null;

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const base64Audio = audioBuffer.toString("base64");
    const safeMime = mimeType.split(";")[0].trim() || "audio/ogg";

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: safeMime,
          data: base64Audio,
        },
      },
      {
        text: "Please transcribe this audio message accurately. Return ONLY the transcribed text in the original language (Hindi/Hinglish/English). Do NOT add explanations or prefixes.",
      },
    ]);

    const text = result.response.text()?.trim() || "";
    if (text) {
      console.log(`[Gemini/Audio] ✓ Transcribed (${text.length} chars): "${text.slice(0, 70)}..."`);
      return text;
    }
    return null;
  } catch (err) {
    console.error("[Gemini/Audio] ✗ Transcription failed:", err.message);
    return null;
  }
}

module.exports = {
  generateFreeNeuralTTS,
  generateFreeNeuralTTSFile,
  transcribeWithGemini,
  PERSONA_VOICES,
  VOICE_OPTIONS,
  resolveVoice,
};
