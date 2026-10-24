require("dotenv").config();
const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const open = require("open").default;
const crypto = require("crypto");
const { Server } = require("socket.io");
const qrcode = require("qrcode");
// ── Baileys (replaces puppeteer + whatsapp-web.js) ─────────────────────────────
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, proto, generateWAMessageFromContent } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
// ───────────────────────────────────────────────────────────────────────────────
const { getReplyAsDhruv, transcribeAudio, analyzeImageContent, generateSpeechReply, generateSpeechReplyFile, setRuntimeApiKey, getApiKey } = require("./gpt");
const db = require("./db");
const featuresRouter = require("./routes/featuresRouter");
const rulesEngine = require("./features/rulesEngine");
const voiceVault = require("./features/voiceVault");
const securityShield = require("./features/securityShield");
const webhooks = require("./features/webhooks");
// Phase 1 foundation modules — all logic lives here, index.js only wires them.
const contactMemory = require("./features/contactMemory");
const aiDisclosure = require("./features/aiDisclosure");
const alerts = require("./features/alerts");
const backup = require("./features/backup");
const agentTools = require("./features/agentTools");
const liveFeed = require("./features/liveFeed");
// (aiProviders is already required at the top of this file.)
const { antiScrapeMiddleware } = require("./features/antiScrapeShield");

// Direct-chat opt-out precedes rules, media, provider checks and Don Away.
const directPauseFile = path.resolve(process.env.DIRECT_PAUSE_FILE || 'data/direct-chat-pauses.json');
let directPaused = new Set();
try { directPaused = new Set(JSON.parse(fs.readFileSync(directPauseFile, 'utf8'))); }
catch (err) { if (err.code !== 'ENOENT') throw err; }
const { parseDirectKey } = require('./features/directChatControl');
const directControl = require('./features/directChatControl').createDirectChatControl({
  read: async key => {
    if (directPaused.has(key)) return true;
    if (!db.MONGODB_URI) return false;
    const { owner, jid } = parseDirectKey(key);
    return (await db.getContact(jid, owner))?.mode === 'off';
  },
  write: async (key, paused) => {
    if (paused) directPaused.add(key); else directPaused.delete(key);
    fs.mkdirSync(path.dirname(directPauseFile), { recursive: true });
    fs.writeFileSync(directPauseFile + '.tmp', JSON.stringify([...directPaused]), { mode: 0o600 });
    fs.renameSync(directPauseFile + '.tmp', directPauseFile);
    if (db.MONGODB_URI) {
      // Split the composite key: the contacts collection is keyed by
      // raw jid + owner userId. Writing the composite key as jid
      // (old code) matched nothing and created junk docs, breaking
      // tenant MENU → picker (see parseDirectKey in directChatControl).
      const { owner, jid } = parseDirectKey(key);
      const d = await db.getDb();
      await d.collection('contacts').updateOne({ jid, userId: owner }, { $set: {
        mode: paused ? 'off' : 'devil', pendingModeSelection: !paused, userId: owner,
      } }, { upsert: true });
    }
  },
});

const API_KEY_COOKIE = "dhruv_api_key";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // 1 year

// Security: Admin password from environment (required for API access)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-password-in-production";
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret-in-production-" + Math.random().toString(36);

// --- Startup guards: fail fast in production if secrets are missing/weak ---
const WEAK_SECRETS = new Set(["", "change-me", "secret", "admin", "123456"]);
if (process.env.NODE_ENV === "production") {
  if (!ADMIN_PASSWORD || WEAK_SECRETS.has(String(ADMIN_PASSWORD).trim()) || String(ADMIN_PASSWORD).length < 12) {
    throw new Error("ADMIN_PASSWORD must be set to a strong value (>=12 chars) in production");
  }
  if (!SESSION_SECRET || WEAK_SECRETS.has(String(SESSION_SECRET).trim()) || String(SESSION_SECRET).length < 32) {
    throw new Error("SESSION_SECRET must be set to a strong random value (>=32 chars) in production");
  }
}
function timingSafeStringEqual(a, b) {
  const ba = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (ba.length !== bb.length) { crypto.timingSafeEqual(ba, ba); return false; }
  return crypto.timingSafeEqual(ba, bb);
}
const MONGODB_URI = process.env.MONGODB_URI || null;

const PORT = process.env.PORT || 3000;
const ENABLE_WHATSAPP = process.env.ENABLE_WHATSAPP !== "false";

// Keep-alive settings
const KEEP_ALIVE_ENABLED = process.env.KEEP_ALIVE_ENABLED !== "false";
const KEEP_ALIVE_INTERVAL = parseInt(process.env.KEEP_ALIVE_INTERVAL || "840000", 10); // 14 minutes
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// Auth folder for Baileys session files
const AUTH_FOLDER = process.env.WA_AUTH_FOLDER || "./auth_info_baileys";

// Multer: memory storage (file content saved to MongoDB, not disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || "").toLowerCase();
    const isAllowedExt = /\.(txt|pdf|jpg|jpeg|png|webp|gif|mp3|ogg|wav|m4a|aac|docx)$/i.test(name);
    const ok = file.mimetype.startsWith("image/") || file.mimetype.startsWith("audio/") || file.mimetype === "application/pdf" || file.mimetype === "text/plain" || isAllowedExt;
    cb(ok ? null : new Error("Supported formats: PDF, Images (JPG/PNG), Audio (MP3/OGG), and Text files."), ok);
  },
});

const app = express();

// Behind a reverse proxy, trust X-Forwarded-* headers
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGIN || false,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// ── Live Log Streamer for Dashboard Terminal ──────────────────────────────────
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;

function formatLogMsg(type, args) {
  const msg = args.map(a => (typeof a === 'object' ? (a instanceof Error ? a.stack || a.message : JSON.stringify(a)) : String(a))).join(' ');
  const now = new Date();
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    time: now.toISOString(),
    timestamp: now.getTime(),
    type,
    text: msg,
    message: msg
  };
}

// SECURITY (2026-10-24): server logs used to be broadcast with
// io.emit to EVERY connected socket, so any tenant's dashboard
// terminal showed the admin's logs too — Baileys phone numbers
// (jids), error stacks, and internal paths included. Logs now go
// only to the admin's socket room; server-side console output is
// unchanged. Tenant dashboards no longer receive cross-tenant
// logs (their own logs would need owner-tagged logging, a
// separate, larger refactor).
console.log = (...args) => {
  origLog.apply(console, args);
  io.to('tenant:admin').emit('syslog', formatLogMsg('info', args));
};

console.error = (...args) => {
  origError.apply(console, args);
  io.to('tenant:admin').emit('syslog', formatLogMsg('error', args));
};

console.warn = (...args) => {
  origWarn.apply(console, args);
  io.to('tenant:admin').emit('syslog', formatLogMsg('warn', args));
};

// Security: Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Security: Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many upload requests, please try again later.",
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ ok: false, error: "Too many authentication attempts, please try again later." });
  },
});

// JSON bodies are small (prompts, messages, settings); file
// uploads go through multer with their own 15MB cap, so a 10MB
// JSON body was only a payload-size attack surface. 2MB is ample.
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());
// NoSQL operator rejection: runs before any handler or DB call.
app.use(require("./features/inputGuard").rejectMongoOperators);

// Security: Session management (Mongo-backed in production)
const sessionConfig = {
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: "lax",
  },
  name: "sessionId",
};

if (MONGODB_URI) {
  try {
    const store = MongoStore.create({
      mongoUrl: MONGODB_URI,
      collectionName: "sessions",
      ttl: 24 * 60 * 60,
    });
    store.on("set", (sid) => console.log("[Mongo] session set → sessions", sid ? sid.slice(0, 12) + "..." : ""));
    store.on("destroy", (sid) => console.log("[Mongo] session destroy → sessions", sid ? sid.slice(0, 12) + "..." : ""));
    sessionConfig.store = store;
  } catch (err) {
    console.error("Failed to configure MongoDB session store, falling back to in-memory:", err.message);
  }
} else {
  console.warn("MONGODB_URI not set, using in-memory session store.");
}

const sessionMiddleware = session(sessionConfig);
app.use(sessionMiddleware);

// Socket.io: only authenticated dashboard sessions may connect.
// Previously any unauthenticated visitor received the WhatsApp QR code
// and the live server log stream (syslog) — both are admin-only data.
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, (err) => {
    if (err) return next(err);
    const sess = socket.request.session;
    if (sess && sess.authenticated) return next();
    return next(new Error("Authentication required"));
  });
});
app.use(antiScrapeMiddleware);

// Security: Authentication & Role-Based Authorization middlewares
const requireAuth = (req, res, next) => {
  if (req.session && req.session.authenticated) {
    req.userId = req.session.username || "admin";
    req.userRole = req.session.role || (req.userId === "admin" ? "admin" : "user");
    req.isAdmin = req.userRole === "admin" || req.userId === "admin";
    return next();
  }
  return res.status(401).json({ ok: false, error: "Authentication required" });
};

// Session fixation defense (2026-10-24): after a successful
// login, the session id is regenerated before the authenticated
// flags are set, so a session id planted before login can never
// become an authenticated session. If regeneration itself errors,
// we fall back to the existing session rather than locking a
// legitimate user out — the flags are still only set after the
// password/OTP check passed.
const establishSession = (req, fields, done) => {
  const apply = () => {
    Object.assign(req.session, fields);
    req.session.save((err) => done(err));
  };
  try {
    req.session.regenerate((err) => {
      if (err) console.error("[Auth] Session regenerate error:", err.message);
      apply();
    });
  } catch (err) {
    console.error("[Auth] Session regenerate threw:", err.message);
    apply();
  }
};

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.authenticated && (req.session.role === "admin" || req.session.username === "admin")) {
    req.userId = "admin";
    req.userRole = "admin";
    req.isAdmin = true;
    return next();
  }
  return res.status(403).json({ ok: false, error: "Access denied. Master Admin privileges required." });
};

// Security: Input validation helper
const validateInput = (input, type = "string", maxLength = 1000) => {
  if (!input || typeof input !== type) return false;
  if (type === "string" && input.length > maxLength) return false;
  if (type === "string" && /[<>"'`]/.test(input)) return false; // XSS protection
  return true;
};

app.use((req, res, next) => {
  // The runtime API key is global (one bot serves every session), so only
  // the master's own cookie may seed it. Previously any signed-in user's
  // cookie became the key the owner's bot ran on.
  const isMaster = req.session && (req.session.role === "admin" || req.session.username === "admin");
  if (isMaster && req.cookies && req.cookies[API_KEY_COOKIE] && !getApiKey()) {
    setRuntimeApiKey(req.cookies[API_KEY_COOKIE]);
  }
  next();
});

// Root dist FIRST, then client/dist, then public.
// REGRESSION (2026-10-24): this used to prefer client/dist, but the
// deploy rsync excludes client/dist, so client/dist went stale on
// 2026-10-23 while every Oct-24 deploy updated root dist only —
// the live site kept serving the Oct-23 bundle (ProvidersPanel
// pre-overview) even though root dist held the new one. The
// postbuild script copies the client build INTO root dist, so root
// dist is the canonical, always-updated output. Never flip this
// order back without also syncing client/dist in the deploy.
const clientDistDir = path.join(__dirname, "client", "dist");
const rootDistDir = path.join(__dirname, "dist");
const publicDir = path.join(__dirname, "public");

// If root dist has an index.html use it; else fall back to client/dist; else public
let staticDir;
if (fs.existsSync(path.join(rootDistDir, "index.html"))) {
  staticDir = rootDistDir;
} else if (fs.existsSync(path.join(clientDistDir, "index.html"))) {
  staticDir = clientDistDir;
} else {
  staticDir = publicDir;
}

console.log(`[Static] Serving frontend from: ${staticDir}`);

// Cache-busting for logo files
app.get(["/logo.jpg", "/logo.png"], (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  const logoPath = path.join(staticDir, req.path.replace(/^\//, ""));
  if (fs.existsSync(logoPath)) {
    return res.sendFile(logoPath);
  }
  res.status(404).send("Not found");
});

app.use(express.static(staticDir, {
  setHeaders: (res, filePath) => {
    // Vite content hashes change on rebuild; only public static assets get long caching.
    if (/[\\/]assets[\\/].+-[A-Za-z0-9_-]{8,}\.(?:js|css|webp|png|jpe?g|svg|woff2?)$/.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
    if (filePath.endsWith(".html") || filePath.endsWith("logo.jpg") || filePath.endsWith("logo.png")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  }
}));

app.get("/", (req, res) => {
  const indexPath = path.join(staticDir, "index.html");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check endpoint (public, no auth required) - for keep-alive pings
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    message: "Service is running"
  });
});

// Alternative health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    message: "Service is running"
  });
});

// Security: Authentication endpoint (Supports Master Admin & Registered Users)
app.post("/api/auth/login", authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!password || typeof password !== "string") {
    return res.status(400).json({ ok: false, error: "Password is required" });
  }

  const trimmedPassword = password.trim();
  const trimmedAdminPassword = String(ADMIN_PASSWORD || "").trim();
  const rawUsername = username ? String(username).trim() : "";

  // 1. Master Admin Authentication (Strict Master Password)
  const isMasterPass = !!trimmedAdminPassword && timingSafeStringEqual(trimmedPassword, trimmedAdminPassword);

  if (isMasterPass && (!rawUsername || rawUsername.toLowerCase() === "admin")) {
    establishSession(req, { authenticated: true, username: "admin", role: "admin" }, (err) => {
      if (err) console.error("[Auth] Master session save error:", err.message);
      console.log("[Auth] Master Admin login success → full privileges granted");
      return res.json({
        ok: true,
        message: "Master Admin authentication successful",
        user: { username: "admin", role: "admin", isAdmin: true },
      });
    });
    return;
  }

  // The "admin" username is the master account only — a wrong master
  // password is a failed login (401), never a regular-user / DB lookup.
  if (rawUsername && rawUsername.toLowerCase() === "admin") {
    return res.status(401).json({ ok: false, error: "Invalid username or password" });
  }

  // 2. Regular User Authentication (Multi-Tenant User Accounts)
  if (rawUsername) {
    try {
      if (!db.MONGODB_URI) {
        return res.status(503).json({ ok: false, error: "MongoDB not configured" });
      }
      const user = await db.authenticateUser(rawUsername, trimmedPassword);
      if (!user) {
        return res.status(401).json({ ok: false, error: "Invalid username or password" });
      }
      establishSession(req, { authenticated: true, username: user.username, role: "user" }, (err) => {
        if (err) console.error("[Auth] User session save error:", err.message);
        console.log(`[Auth] User "${user.username}" login success → private tenant workspace`);
        return res.json({
          ok: true,
          message: "User authentication successful",
          user: { username: user.username, role: "user", isAdmin: false },
        });
      });
      return;
    } catch (err) {
      return res.status(403).json({ ok: false, error: err.message });
    }
  }

  return res.status(401).json({ ok: false, error: "Invalid credentials" });
});

app.post("/api/auth/logout", (req, res) => {
  if (req.session) {
    req.session.authenticated = false;
    req.session.destroy(() => {
      res.clearCookie("sessionId", { path: "/" });
      res.clearCookie("connect.sid", { path: "/" });
      res.json({ ok: true, message: "Logged out successfully" });
    });
  } else {
    res.clearCookie("sessionId", { path: "/" });
    res.clearCookie("connect.sid", { path: "/" });
    res.json({ ok: true, message: "Logged out successfully" });
  }
});

app.get("/api/auth/status", (req, res) => {
  const authenticated = !!(req.session && req.session.authenticated);
  if (!authenticated) {
    return res.json({ authenticated: false, user: null });
  }
  const username = req.session.username || "admin";
  const role = req.session.role || (username === "admin" ? "admin" : "user");
  const isAdmin = role === "admin" || username === "admin";
  res.json({
    authenticated: true,
    user: {
      username,
      role,
      isAdmin,
    },
  });
});

// Modular Features API Router (Auto-Rules, Voice Vault, Security Shield, Audience Tags, Analytics, Webhooks)
app.use("/api/features", requireAuth, featuresRouter);

// Protected API endpoints
// /api/config used to skip requireAuth entirely; it only returned
// booleans for anonymous callers, but an unauthenticated endpoint
// that reads the session is a probing surface that should not exist.
app.get("/api/config", requireAuth, apiLimiter, async (req, res) => {
  const owner = req.session?.username || null;
  let hasChats = false;
  let hasClosestPerson = false;
  let hasApiKey = false;
  let hasGeminiKey = false;
  try {
    if (db.MONGODB_URI && owner) {
      hasChats = await db.hasChats(owner);
      hasClosestPerson = await db.hasClosestPerson(owner);
    }
  } catch (err) {
    console.error("Config Mongo error:", err.message);
  }
  if (owner === "admin") {
    hasApiKey = !!getApiKey();
    try {
      const { getGeminiApiKey } = require("./features/geminiEngine");
      hasGeminiKey = !!(await getGeminiApiKey());
    } catch {}
  } else if (owner) {
    const keys = await resolveTenantKeys(owner);
    hasApiKey = !!keys.apiKey;
    hasGeminiKey = !!keys.geminiKey;
    // A tenant with AI Provider keys is configured even with no
    // legacy key — otherwise the dashboard shows "Key Missing" for
    // an account that can actually answer (same bug as the WA gate).
    try {
      const providerIds = await aiProviders.configuredProviderIds(owner);
      if (providerIds.length) {
        hasApiKey = true;
        if (providerIds.includes("gemini")) hasGeminiKey = true;
      }
    } catch {}
  }
  res.json({ hasApiKey, hasGeminiKey, hasChats, hasClosestPerson });
});

app.post("/api/clear-key", requireAuth, apiLimiter, async (req, res) => {
  if (req.isAdmin) {
    setRuntimeApiKey(null);
    res.clearCookie(API_KEY_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
    return res.json({ ok: true });
  }
  // Tenant user: clears only their own stored key.
  try {
    await db.updateUserApiKey(req.userId, "");
    invalidateTenantKeys(req.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/set-key", requireAuth, apiLimiter, async (req, res) => {
  const key = req.body && req.body.apiKey;
  if (!validateInput(key, "string", 200)) {
    return res.status(400).json({ ok: false, error: "Valid API key is required" });
  }
  const trimmed = key.trim();
  if (trimmed.length < 10) {
    return res.status(400).json({ ok: false, error: "API key seems invalid" });
  }
  if (req.isAdmin) {
    setRuntimeApiKey(trimmed);
    res.cookie(API_KEY_COOKIE, trimmed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE,
      sameSite: "lax",
    });
    return res.json({ ok: true });
  }
  // Tenant user: the key is stored on THEIR account and powers only
  // their own WhatsApp tenant — never the owner's bot.
  try {
    await db.updateUserApiKey(req.userId, trimmed);
    invalidateTenantKeys(req.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/chats", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) {
      return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    }
    const files = await db.listChats(req.userId);
    res.json({ files });
  } catch (err) {
    console.error("Error reading chats:", err);
    res.status(500).json({ ok: false, error: "Failed to read chat files" });
  }
});

app.get("/api/contacts", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) {
      return res.json([]);
    }
    const contacts = await db.listContacts(req.userId);
    res.json(contacts);
  } catch (err) {
    console.error("Error reading contacts:", err);
    res.status(500).json({ ok: false, error: "Failed to read contacts" });
  }
});

app.post("/api/contacts/mode", requireAuth, apiLimiter, async (req, res) => {
  const { jid, mode } = req.body;
  if (!jid || !mode) {
    return res.status(400).json({ ok: false, error: "JID and mode are required" });
  }
  try {
    if (!db.MONGODB_URI) {
      return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    }
    // Scoped update: a user can only change modes on their OWN contacts.
    await db.setContactMode(jid, mode, req.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error updating contact mode:", err);
    res.status(500).json({ ok: false, error: err.message || "Failed to update contact mode" });
  }
});

app.get("/api/don-away", requireAuth, apiLimiter, async (req, res) => {
  try {
    const enabled = db.MONGODB_URI ? await db.getDonAwayMode(req.userId) : false;
    res.json({ enabled });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Don Away is per-user, not master-only: the sidebar toggle is
// shown to every user, and previously a tenant's toggle hit
// requireAdmin (403, silently ignored by the frontend) while the
// pipeline itself only ran Don Away for owner === "admin".
app.post("/api/don-away", requireAuth, apiLimiter, async (req, res) => {
  try {
    const enabled = !!(req.body && req.body.enabled);
    if (!db.MONGODB_URI) {
      return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    }
    await db.setDonAwayMode(enabled, req.userId);
    tenantEmit(req.userId, "donAwayStatus", { enabled });
    res.json({ ok: true, enabled });
  } catch (err) {
    console.error("Error setting Don Away Mode:", err);
    res.status(500).json({ ok: false, error: err.message || "Failed to update Don Away Mode" });
  }
});

// ── Delete Single Contact ────────────────────────────────────────────────────
app.delete("/api/contacts/:jid", requireAuth, apiLimiter, async (req, res) => {
  const jid = req.params.jid;
  if (!jid) return res.status(400).json({ ok: false, error: "JID required" });
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    // Scoped delete: only the caller's own contact can be removed.
    await db.deleteContact(jid, req.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Delete ALL Contacts & History ───────────────────────────────────────────
app.delete("/api/contacts", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const result = await db.deleteAllContacts(req.userId);
    res.json({ ok: true, message: `Deleted ${result.contactsDeleted} contacts and ${result.historyDeleted} chat history entries.`, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Delete ALL Chat History Only ─────────────────────────────────────────────
app.delete("/api/history", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const result = await db.deleteAllMessageHistory(req.userId);
    res.json({ ok: true, message: `Cleared ${result.deletedCount} chat messages.`, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Broadcast Campaign Endpoints ──────────────────────────────────────────────
app.get("/api/broadcasts", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.json({ campaigns: [] });
    const campaigns = await db.listBroadcasts();
    res.json({ ok: true, campaigns });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/broadcasts/send", requireAdmin, apiLimiter, async (req, res) => {
  const { title, message, target, jids, delayMs } = req.body || {};
  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ ok: false, error: "Broadcast message is required" });
  }
  const adminT = getTenant("admin");
  if (!adminT.isReady || !adminT.sock) {
    return res.status(503).json({ ok: false, error: "WhatsApp is not connected. Link device first." });
  }
  if (!db.MONGODB_URI) {
    return res.status(503).json({ ok: false, error: "MongoDB not configured." });
  }

  try {
    let recipientJids = [];
    if (target === "selected" && Array.isArray(jids) && jids.length > 0) {
      recipientJids = jids;
    } else {
      const allContacts = await db.listContacts(req.userId);
      recipientJids = allContacts.map((c) => c.jid).filter(Boolean);
    }

    if (recipientJids.length === 0) {
      return res.status(400).json({ ok: false, error: "No recipients found for this broadcast campaign." });
    }

    const delay = Math.max(2000, parseInt(delayMs || "3000", 10));
    const campaign = await db.saveBroadcastCampaign({
      title: title || "WhatsApp Campaign",
      message: message.trim(),
      recipientsCount: recipientJids.length,
      delayMs: delay,
    });

    res.json({
      ok: true,
      message: `Broadcast campaign started for ${recipientJids.length} contacts.`,
      campaignId: campaign.id,
      recipientsCount: recipientJids.length,
    });

    // Run broadcast sending loop asynchronously in background
    (async () => {
      let sent = 0;
      await db.updateBroadcastProgress(campaign.id, { status: "sending" });

      for (const jid of recipientJids) {
        try {
          await simulateTyping(adminT.sock, jid, message.length);
          await adminT.sock.sendMessage(jid, { text: message.trim() });
          await db.saveChatMessage(jid, "assistant", `[Broadcast Campaign]: ${message.trim()}`);
          sent++;
          await db.updateBroadcastProgress(campaign.id, { sentCount: sent });
          // Admin room only: the progress payload carries the
          // admin's contact jids, and broadcasts are master-only.
          io.to("tenant:admin").emit("broadcastProgress", {
            campaignId: campaign.id,
            sent,
            total: recipientJids.length,
            currentJid: jid,
            status: "sending",
          });
        } catch (err) {
          console.error(`[Broadcast] Failed sending to ${jid}:`, err.message);
        }
        // Anti-ban safety delay with random jitter (+0-1000ms)
        await new Promise((r) => setTimeout(r, delay + Math.random() * 1000));
      }

      await db.updateBroadcastProgress(campaign.id, { sentCount: sent, status: "completed" });
      io.to("tenant:admin").emit("broadcastProgress", {
        campaignId: campaign.id,
        sent,
        total: recipientJids.length,
        status: "completed",
      });
      console.log(`[Broadcast] Campaign "${campaign.title}" completed. Sent: ${sent}/${recipientJids.length}`);
    })().catch((err) => {
      console.error("[Broadcast] Campaign worker error:", err.message);
      db.updateBroadcastProgress(campaign.id, { status: "failed", error: err.message }).catch(() => {});
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Delete Reference Chat File ───────────────────────────────────────────────
app.delete("/api/chats/:filename", requireAuth, apiLimiter, async (req, res) => {
  const filename = req.params.filename;
  if (!filename) return res.status(400).json({ ok: false, error: "Filename required" });
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    await db.deleteChatFile(filename, req.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Multi-User Registration ──────────────────────────────────────────────────
// ── Public registration with email OTP verification ─────────────────────
// Anyone may register, but ONLY with a verified email: the code is emailed
// via the owner's serv00 mailbox (see features/mailer.js). A verified
// account is a fully isolated tenant: own WhatsApp connection, own
// contacts, own API keys — it can never touch the owner's number or data.
const registrationOtp = require("./features/registrationOtp");
const mailer = require("./features/mailer");
const aiProviders = require("./features/aiProviders");

app.post("/api/auth/register/request-otp", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!registrationOtp.isValidEmail(cleanEmail)) {
      return res.status(400).json({ ok: false, error: "Enter a valid email address" });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
    }
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const existing = await db.getUserByUsername(cleanEmail);
    if (existing) {
      return res.status(409).json({ ok: false, error: "An account with this email already exists. Please log in." });
    }
    if (!(await mailer.isMailConfigured())) {
      return res.status(503).json({ ok: false, error: "Email verification is not set up yet. Please ask the admin to configure mail settings." });
    }
    const passwordHash = await db.hashPassword(String(password));
    const { otp, expiresMinutes } = await registrationOtp.stagePendingRegistration({ email: cleanEmail, passwordHash });
    await mailer.sendOtpEmail(cleanEmail, otp, expiresMinutes);
    console.log(`[Auth] OTP sent for registration: ${cleanEmail}`);
    res.json({ ok: true, message: `Verification code sent to ${cleanEmail}`, expiresMinutes });
  } catch (err) {
    if (err.code === "RESEND_TOO_SOON") return res.status(429).json({ ok: false, error: err.message });
    if (err.code === "OTP_DAILY_LIMIT") return res.status(429).json({ ok: false, error: err.message });
    if (err.code === "MAIL_NOT_CONFIGURED") return res.status(503).json({ ok: false, error: "Email verification is not set up yet. Please ask the admin to configure mail settings." });
    console.error("[Auth] request-otp error:", err.message);
    res.status(500).json({ ok: false, error: "Could not send verification code. Please try again." });
  }
});

app.post("/api/auth/register/verify-otp", authLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!registrationOtp.isValidEmail(cleanEmail) || !otp) {
      return res.status(400).json({ ok: false, error: "Email and verification code are required" });
    }
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const staged = await registrationOtp.verifyPendingRegistration({ email: cleanEmail, otp: String(otp).trim() });
    const user = await db.createUser({ username: staged.email, passwordHash: staged.passwordHash, role: "user", apiKey: "" });
    // Log the new tenant straight in (their own isolated workspace).
    establishSession(req, { authenticated: true, username: user.username, role: "user" }, (err) => {
      if (err) console.error("[Auth] Session save error on verify-otp:", err.message);
      console.log(`[Auth] New tenant registered via OTP: ${user.username}`);
      return res.json({ ok: true, message: "Account created and verified", user: { username: user.username, role: "user", isAdmin: false } });
    });
  } catch (err) {
    const known = ["NO_PENDING", "OTP_EXPIRED", "OTP_LOCKED", "OTP_MISMATCH"];
    if (known.includes(err.code)) return res.status(400).json({ ok: false, error: err.message, code: err.code });
    if (/already taken/i.test(err.message || "")) return res.status(409).json({ ok: false, error: "An account with this email already exists. Please log in." });
    console.error("[Auth] verify-otp error:", err.message);
    res.status(500).json({ ok: false, error: "Could not verify the code. Please try again." });
  }
});

// ── Admin: mail (SMTP) settings for OTP emails ──────────────────────────
app.get("/api/admin/mail-config", requireAdmin, apiLimiter, async (req, res) => {
  try {
    res.json({ ok: true, config: await mailer.getMailConfigSafe() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/mail-config", requireAdmin, apiLimiter, async (req, res) => {
  try {
    const { host, port, user, pass, from } = req.body || {};
    const saved = await mailer.saveMailConfig({ host, port, user, pass, from });
    res.json({ ok: true, config: { configured: saved.hasPassword && !!saved.user, ...saved } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/mail-config/test", requireAdmin, apiLimiter, async (req, res) => {
  try {
    const { to, host, port, user, pass, from } = req.body || {};
    const target = registrationOtp.isValidEmail(String(to || "")) ? String(to).trim() : (user || req.session.username);
    await mailer.sendMail({
      to: target,
      subject: "Devil AI mail settings test",
      text: "This is a test email from your Devil AI server. If you received it, OTP emails will work.",
      // Test exactly what is typed in the form (unsaved values included);
      // blank fields fall back to the saved config inside the mailer.
      configOverride: { host, port, user, pass, from },
    });
    res.json({ ok: true, message: `Test email sent to ${target}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.code === "MAIL_NOT_CONFIGURED" ? "Mail is not configured yet" : `Send failed: ${err.message}` });
  }
});

// ── Multi-provider AI engine: per-user provider keys ─────────────────
// Every dashboard user (admin included) manages ONLY their own provider
// configs. Keys are stored server-side and never returned in full.
app.get("/api/ai-providers", requireAuth, apiLimiter, async (req, res) => {
  try {
    const store = await aiProviders.loadConfigs(req.userId);
    res.json({
      ok: true,
      providers: aiProviders.listProviders(),
      configs: store.configs.map((c) => ({
        providerId: c.providerId,
        // Empty model = auto: the engine picks a working model per
        // key at chat/test time instead of trusting a stored model
        // that may have been retired since it was saved.
        model: c.model || null,
        autoModel: !c.model,
        enabled: c.enabled !== false,
        hasKey: !!c.apiKey,
        maskedKey: aiProviders.maskKey(c.apiKey),
        isActive: store.activeProviderId === c.providerId,
      })),
      activeProviderId: store.activeProviderId,
      routingMode: store.routingMode || "manual",
      routingModes: aiProviders.ROUTING_MODES,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/ai-providers/mode", requireAuth, apiLimiter, async (req, res) => {
  try {
    const { mode } = req.body || {};
    if (!aiProviders.ROUTING_MODES.includes(mode)) {
      return res.status(400).json({ ok: false, error: "Unknown routing mode" });
    }
    const store = await aiProviders.loadConfigs(req.userId);
    store.routingMode = mode;
    await aiProviders.saveConfigs(req.userId, store);
    res.json({ ok: true, routingMode: mode });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Usage + health for the AI Providers tab. Token counts are the
// providers' own reported usage, aggregated locally; the money figure
// is an ESTIMATE (what the same tokens would cost on GPT-4o-mini list
// prices) and is labeled as such.
app.get("/api/ai-providers/stats", requireAuth, apiLimiter, async (req, res) => {
  try {
    const usage = await db.getAiUsage(req.userId);
    const store = await aiProviders.loadConfigs(req.userId);
    const dayMs = 24 * 60 * 60 * 1000;
    const todayKey = new Date().toISOString().slice(0, 10);
    const cutoff = Date.now() - 29 * dayMs;
    const sumRows = (rows) => {
      const out = { requests: 0, promptTokens: 0, completionTokens: 0, tokens: 0, failures: 0 };
      for (const r of rows) {
        out.requests += r?.req || 0;
        out.promptTokens += r?.pt || 0;
        out.completionTokens += r?.ct || 0;
        out.failures += r?.fail || 0;
      }
      out.tokens = out.promptTokens + out.completionTokens;
      return out;
    };
    const perProvider = {};
    const ensure = (pid) => (perProvider[pid] ||= { providerId: pid, today: sumRows([]), last30: sumRows([]), totals: sumRows([]) });
    for (const [day, providers] of Object.entries(usage.days || {})) {
      const in30 = new Date(`${day}T00:00:00Z`).getTime() >= cutoff;
      const isToday = day === todayKey;
      for (const [pid, row] of Object.entries(providers || {})) {
        const p = ensure(pid);
        const add = (acc) => {
          acc.requests += row?.req || 0;
          acc.promptTokens += row?.pt || 0;
          acc.completionTokens += row?.ct || 0;
          acc.failures += row?.fail || 0;
          acc.tokens = acc.promptTokens + acc.completionTokens;
        };
        if (isToday) add(p.today);
        if (in30) add(p.last30);
      }
    }
    for (const [pid, row] of Object.entries(usage.totals || {})) {
      ensure(pid).totals = sumRows([row]);
    }
    // Configured providers with zero usage yet must still appear in
    // the Network Overview (as "No data yet"), otherwise the overview
    // would only ever show providers that already answered.
    for (const c of store.configs || []) {
      const p = ensure(c.providerId);
      p.configured = true;
      p.model = c.model || null;
      p.autoModel = !c.model;
      p.isActive = store.activeProviderId === c.providerId;
      p.providerName = aiProviders.getProvider(c.providerId)?.name || c.providerId;
    }
    for (const pid of Object.keys(perProvider)) {
      const h = aiProviders.healthFor(req.userId, pid);
      perProvider[pid].health = {
        ok: h.ok, fail: h.fail, consecutiveFailures: h.consec,
        coolingDown: aiProviders.isCoolingDown(req.userId, pid),
        lastOkAt: h.lastOkAt || null, lastFailAt: h.lastFailAt || null,
        lastError: h.lastError || '', avgLatencyMs: h.latEma || null,
      };
      if (perProvider[pid].configured === undefined) perProvider[pid].configured = false;
      if (!perProvider[pid].providerName) perProvider[pid].providerName = aiProviders.getProvider(pid)?.name || pid;
    }
    // Daily series (last 7 days) for the routing-distribution chart.
    // Built from the same provider-reported usage, no invented points.
    const dailySeries = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(Date.now() - i * dayMs).toISOString().slice(0, 10);
      let tokens = 0;
      let requests = 0;
      for (const row of Object.values(usage.days?.[day] || {})) {
        tokens += (row?.pt || 0) + (row?.ct || 0);
        requests += row?.req || 0;
      }
      dailySeries.push({ day, tokens, requests });
    }
    const last30Total = Object.values(perProvider).reduce((a, p) => ({
      requests: a.requests + p.last30.requests, tokens: a.tokens + p.last30.tokens, failures: a.failures + p.last30.failures,
    }), { requests: 0, tokens: 0, failures: 0 });
    const grandTotal = Object.values(perProvider).reduce((a, p) => ({
      requests: a.requests + p.totals.requests, tokens: a.tokens + p.totals.tokens, failures: a.failures + p.totals.failures,
    }), { requests: 0, tokens: 0, failures: 0 });
    const BLENDED_USD_PER_1M = 0.30; // GPT-4o-mini blended list price, estimate only
    res.json({
      ok: true,
      perProvider: Object.values(perProvider),
      last30: last30Total,
      totals: grandTotal,
      routeLog: usage.routeLog || [],
      dailySeries,
      serverUptimeSec: Math.floor(process.uptime()),
      configuredCount: (store.configs || []).filter((c) => c && c.apiKey).length,
      registryCount: aiProviders.PROVIDERS.length,
      routingMode: store.routingMode || "manual",
      // Live engine order for the current routing mode, so the
      // Routing Role column is the server's real order, not a
      // hardcoded role list. Cooling providers sink to the end.
      routingOrder: aiProviders.orderByMode(aiProviders.orderedCandidates(store), store.routingMode || "manual", req.userId, store).map((c) => c.providerId),
      estimated: {
        paidEquivalentUsdLast30: Number(((last30Total.tokens / 1e6) * BLENDED_USD_PER_1M).toFixed(4)),
        basis: "Estimated at GPT-4o-mini blended list price ($0.30 / 1M tokens). Token counts are provider-reported; the money figure is an estimate.",
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/ai-providers", requireAuth, apiLimiter, async (req, res) => {
  try {
    const { providerId, apiKey, model } = req.body || {};
    const provider = aiProviders.getProvider(providerId);
    if (!provider) return res.status(400).json({ ok: false, error: "Unknown provider" });
    const store = await aiProviders.loadConfigs(req.userId);
    const existing = store.configs.find((c) => c.providerId === providerId);
    const key = String(apiKey || "").trim() || existing?.apiKey || "";
    if (!key) return res.status(400).json({ ok: false, error: "API key is required" });
    // Key-only mode: an explicit empty/'auto' model CLEARS any old
    // stored model (which may be dead) instead of keeping it — the
    // engine then auto-picks a working model. Omitting `model`
    // entirely keeps the existing preference.
    let entryModel;
    if (model === undefined || model === null) entryModel = existing?.model || aiProviders.defaultModel(providerId);
    else if (String(model).trim() === "" || String(model).trim().toLowerCase() === "auto") entryModel = "";
    else entryModel = String(model).trim();
    const entry = {
      providerId,
      apiKey: key,
      model: entryModel,
      enabled: true,
    };
    store.configs = [...store.configs.filter((c) => c.providerId !== providerId), entry];
    if (!store.activeProviderId) store.activeProviderId = providerId;
    await aiProviders.saveConfigs(req.userId, store);
    res.json({
      ok: true,
      message: entryModel ? `${provider.name} saved` : `${provider.name} saved — model auto (engine picks a working model for this key)`,
      maskedKey: aiProviders.maskKey(key),
      autoModel: !entryModel,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/ai-providers/active", requireAuth, apiLimiter, async (req, res) => {
  try {
    const { providerId } = req.body || {};
    if (!aiProviders.getProvider(providerId)) return res.status(400).json({ ok: false, error: "Unknown provider" });
    const store = await aiProviders.loadConfigs(req.userId);
    if (!store.configs.some((c) => c.providerId === providerId)) {
      return res.status(400).json({ ok: false, error: "Save a key for this provider first" });
    }
    store.activeProviderId = providerId;
    await aiProviders.saveConfigs(req.userId, store);
    res.json({ ok: true, activeProviderId: providerId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/ai-providers/:providerId", requireAuth, apiLimiter, async (req, res) => {
  try {
    const store = await aiProviders.loadConfigs(req.userId);
    store.configs = store.configs.filter((c) => c.providerId !== req.params.providerId);
    if (store.activeProviderId === req.params.providerId) {
      store.activeProviderId = store.configs[0]?.providerId || null;
    }
    await aiProviders.saveConfigs(req.userId, store);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/ai-providers/test", requireAuth, apiLimiter, async (req, res) => {
  try {
    const { providerId, apiKey, model } = req.body || {};
    let key = String(apiKey || "").trim();
    if (!key) {
      const store = await aiProviders.loadConfigs(req.userId);
      key = store.configs.find((c) => c.providerId === providerId)?.apiKey || "";
    }
    const result = await aiProviders.testProviderKey(providerId, key, String(model || "").trim() || undefined);
    res.status(result.ok ? 200 : 400).json({ ok: result.ok, message: result.message, error: result.error, model: result.model || null, tried: result.tried || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Unified AI endpoint (Smart Router Network Overview) ──────────
// The "one endpoint" the dashboard advertises: a logged-in user's own
// providers, routed exactly like WhatsApp chats (same engine, same
// per-user isolation — a tenant can only ever spend their own keys).
// Auth is the dashboard session (requireAuth), NOT a public API key:
// this is not a public API, and the dashboard card says so. A `model`
// in the request is treated as a preference, not a guarantee — the
// router may answer from another of the user's providers/models.
app.post("/v1/chat/completions", requireAuth, apiLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && typeof m.content === "string") : [];
    if (!messages.length) return res.status(400).json({ error: { message: "messages[] with at least one {role, content} is required", type: "invalid_request" } });
    const temperature = typeof body.temperature === "number" ? body.temperature : 0.85;
    const maxTokens = typeof body.max_tokens === "number" ? Math.min(Math.max(body.max_tokens, 1), 4096)
      : typeof body.maxTokens === "number" ? Math.min(Math.max(body.maxTokens, 1), 4096) : 512;
    const r = await aiProviders.chatCompletion({ userId: req.userId, messages, temperature, maxTokens });
    res.json({
      id: `router-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: r.model,
      provider: r.providerId,
      routingMode: r.routingMode,
      choices: [{ index: 0, message: { role: "assistant", content: r.text }, finish_reason: "stop" }],
      usage: r.usage || null,
    });
  } catch (err) {
    if (err.code === "NO_PROVIDER") return res.status(503).json({ error: { message: "No AI provider configured for this account. Add a key in AI Providers first.", type: "no_provider" } });
    if (err.code === "ALL_PROVIDERS_FAILED") return res.status(502).json({ error: { message: "All configured AI providers failed", type: "providers_failed", attempts: err.attempts || [] } });
    res.status(500).json({ error: { message: err.message, type: "server_error" } });
  }
});

app.post("/api/auth/register", requireAdmin, apiLimiter, async (req, res) => {
  const { username, password, apiKey } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Username and password are required" });
  }
  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername.length < 3) {
    return res.status(400).json({ ok: false, error: "Username must be at least 3 characters" });
  }
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const passwordHash = await db.hashPassword(password.trim());
    const user = await db.createUser({
      username: cleanUsername,
      passwordHash,
      role: "user",
      apiKey: apiKey ? apiKey.trim() : "",
    });
    // Admin-created account: respond WITHOUT touching the admin's session
    // (the old handler silently replaced the creator's session with the
    // new user's session).
    return res.json({ ok: true, message: "Account created", user: { username: user.username, role: user.role, hasKey: !!user.userApiKey } });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── Admin Analytics & Master Control ─────────────────────────────────────────
app.get("/api/admin/analytics", requireAdmin, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) {
      return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    }
    const stats = await db.getAnalyticsOverview();
    // Enrich the users list with AI Provider presence: the raw users
    // docs only carry the legacy userApiKey, so a provider-only
    // account looked "Missing" in the admin panel even though it had
    // working keys. hasAiProviders is computed, never a key itself.
    if (Array.isArray(stats.users)) {
      for (const u of stats.users) {
        try {
          const ids = await aiProviders.configuredProviderIds(u.username);
          u.hasAiProviders = ids.length > 0;
          u.providerCount = ids.length;
        } catch {
          u.hasAiProviders = false;
          u.providerCount = 0;
        }
      }
    }
    res.json({ ok: true, ...stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Per-user Analytics (Overview & Analytics tab) ───────────────
// The dashboard used to fetch /api/admin/analytics (requireAdmin)
// and the frontend only called it for admins, so every tenant saw
// 0/0/0 forever. This endpoint is requireAuth and returns ONLY the
// caller's own numbers: admin still gets the global overview (with
// the users list), tenants get their own message history, their own
// router usage, and their own contacts — never another tenant's.
app.get("/api/analytics", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    if (req.isAdmin) {
      const stats = await db.getAnalyticsOverview();
      return res.json({ ok: true, ...stats });
    }
    const owner = req.userId;
    const d = await db.getDb();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const messagesToday = await d.collection("message_history").countDocuments({ userId: owner, timestamp: { $gte: todayStart } });
    // Router usage is stored per UTC day (see recordAiUsage), so
    // count both today's UTC date and today's server-local date.
    const usage = await db.getAiUsage(owner);
    const todayKeys = new Set([new Date().toISOString().slice(0, 10), (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; })()]);
    let apiCallsToday = 0;
    for (const day of todayKeys) {
      for (const row of Object.values(usage.days?.[day] || {})) apiCallsToday += row?.req || 0;
    }
    const totalContacts = await d.collection("contacts").countDocuments({ userId: owner });
    res.json({ ok: true, messagesToday, apiCallsToday, totalContacts, totalUsers: 1, users: [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/users/disable", requireAdmin, apiLimiter, async (req, res) => {
  const { username, disabled } = req.body || {};
  if (!username) return res.status(400).json({ ok: false, error: "Username required" });
  if (username.toLowerCase() === "admin") {
    return res.status(403).json({ ok: false, error: "Master Admin account cannot be disabled" });
  }
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    await db.toggleUserDisabled(username, disabled);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/admin/users/:username", requireAdmin, apiLimiter, async (req, res) => {
  const username = req.params.username;
  if (!username) return res.status(400).json({ ok: false, error: "Username required" });
  if (username.toLowerCase() === "admin") {
    return res.status(403).json({ ok: false, error: "Master Admin account cannot be deleted" });
  }
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    await db.deleteUser(username);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/upload-chat", requireAuth, uploadLimiter, upload.single("chat"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "No file uploaded. Choose a .txt or .pdf file." });
  }
  if (!db.MONGODB_URI) {
    return res.status(503).json({ ok: false, error: "MongoDB not configured. Set MONGODB_URI." });
  }
  const isPdf = req.file.mimetype === "application/pdf" || (req.file.originalname && req.file.originalname.toLowerCase().endsWith(".pdf"));
  const isTxt = req.file.mimetype === "text/plain" || (req.file.originalname && req.file.originalname.toLowerCase().endsWith(".txt"));

  if (!isPdf && !isTxt) {
    return res.status(400).json({ ok: false, error: "Only .txt and .pdf files are allowed" });
  }
  if (req.file.size > 15 * 1024 * 1024) {
    return res.status(400).json({ ok: false, error: "File too large (max 15MB)" });
  }

  let filename = (req.file.originalname || `doc-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "_");
  const docType = isPdf ? "pdf" : "txt";
  const asClosest = req.body && (req.body.asClosest === "true" || req.body.asClosest === true);
  if (asClosest) filename = "closest-person.txt";

  let content = "";
  if (isPdf) {
    // Extract printable text from PDF buffer
    const raw = (req.file.buffer || Buffer.from("")).toString("binary");
    const extracted = raw.replace(/[^\x20-\x7E\n\r]/g, " ").replace(/\s+/g, " ").trim();
    content = extracted || "PDF Content";
  } else {
    content = (req.file.buffer || Buffer.from("")).toString("utf8");
  }

  try {
    await db.insertChat(filename, content, asClosest, docType, req.userId);
  } catch (err) {
    console.error("Upload Knowledge Base Mongo error:", err);
    return res.status(500).json({ ok: false, error: "Failed to save Knowledge Base doc to database." });
  }

  res.json({
    ok: true,
    filename,
    docType,
    asClosest: !!asClosest,
    message: `Knowledge Base document "${filename}" saved successfully!`,
  });
});

function fetchUrlNative(targetUrl) {
  return new Promise((resolve, reject) => {
    const httpLib = targetUrl.startsWith("https") ? require("https") : require("http");
    const req = httpLib.get(
      targetUrl,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrlNative(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Website returned status ${res.statusCode}`));
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", (err) => reject(err));
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Website connection timed out"));
    });
  });
}

// Web Scraping Endpoint (RAG)
// SSRF guard: only http(s), never private/loopback/link-local hosts
function isBlockedScrapeHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224) return true;
  }
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}
function assertSafeScrapeUrl(raw) {
  const u = new URL(raw);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only http/https URLs are allowed");
  if (u.username || u.password) throw new Error("URLs with embedded credentials are not allowed");
  if (isBlockedScrapeHost(u.hostname)) throw new Error("Private / internal addresses are not allowed");
  return u.toString();
}
app.post("/api/scrape-url", requireAuth, apiLimiter, async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== "string" || !url.trim().startsWith("http")) {
    return res.status(400).json({ ok: false, error: "Valid website URL starting with http:// or https:// is required." });
  }
  if (!db.MONGODB_URI) {
    return res.status(503).json({ ok: false, error: "MongoDB not configured." });
  }

  try {
    let html = "";
    if (typeof globalThis.fetch === "function") {
      const safeUrl = assertSafeScrapeUrl(url.trim());
      const response = await globalThis.fetch(safeUrl, { redirect: "error",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      if (!response.ok) {
        return res.status(400).json({ ok: false, error: `Website returned status ${response.status}` });
      }
      html = await response.text();
    } else {
      html = await fetchUrlNative(assertSafeScrapeUrl(url.trim()));
    }

    // Strip script, style tags and HTML markup to get clean text
    const cleanText = html
      .replace(/<script\b[^<]*>([\s\S]*?)<\/script>/gi, "")
      .replace(/<style\b[^<]*>([\s\S]*?)<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanText.length < 50) {
      return res.status(400).json({ ok: false, error: "Could not extract sufficient text content from this website." });
    }

    const filename = url.replace(/^https?:\/\//i, "").replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 45) + ".url";
    await db.insertChat(filename, cleanText.slice(0, 15000), false, "url", req.userId);

    res.json({
      ok: true,
      filename,
      extractedLength: cleanText.length,
      message: `Scraped website content (${cleanText.length} chars) into AI Knowledge Base!`,
    });
  } catch (err) {
    console.error("Web scrape error:", err.message);
    res.status(500).json({ ok: false, error: `Failed to scrape website: ${err.message}` });
  }
});

// ── Custom Persona Studio Endpoints ──────────────────────────────────────────
app.get("/api/personas", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.json({ personas: [] });
    const customPersonas = await db.listCustomPersonas(req.userId);
    res.json({ ok: true, personas: customPersonas });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/personas", requireAuth, apiLimiter, async (req, res) => {
  const { key, name, emoji, description, systemPrompt, temperature } = req.body || {};
  if (!name || !systemPrompt) {
    return res.status(400).json({ ok: false, error: "Persona name and system prompt are required." });
  }
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured." });
    const doc = await db.saveCustomPersona({ key, name, emoji, description, systemPrompt, temperature: Number(temperature || 0.7), userId: req.userId });
    res.json({ ok: true, persona: doc, message: `Persona "${doc.name}" saved successfully!` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/personas/:key", requireAuth, apiLimiter, async (req, res) => {
  const key = req.params.key;
  if (!key) return res.status(400).json({ ok: false, error: "Persona key required" });
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured." });
    await db.deleteCustomPersona(key, req.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Default Message & Custom Voice Audio Note Endpoints ──────────────────────
app.get("/api/settings/defaults", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) {
      return res.json({
        ok: true,
        defaultMessage: "Main abhi thoda busy hu aur messages check nahi kar pa raha. Free hote hi connect karta hu!\n\n────────────────────────\n🤖 *AI Assistant Live:*\nAgar koi urgent query ho, toh reply me *1* ya *Hi* likhiye — AI turant connect karega!\n────────────────────────",
        hasCustomAudio: false,
        audioFilename: "default.mp3",
      });
    }
    const data = await db.getDefaultSettings(req.userId);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Away message + voice note are per-user too: the old requireAdmin
// + single global keys meant a tenant could neither see nor change
// their own away audio, and any change would have overwritten the
// admin's audio for every account.
app.post("/api/settings/defaults", requireAuth, apiLimiter, async (req, res) => {
  const { defaultMessage } = req.body || {};
  if (!defaultMessage || !defaultMessage.trim()) {
    return res.status(400).json({ ok: false, error: "Default message cannot be empty" });
  }
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    await db.updateDefaultMessage(defaultMessage, req.userId);
    res.json({ ok: true, message: "Default message saved successfully!" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/settings/default-audio", requireAuth, uploadLimiter, upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "Please upload an audio file (.mp3, .ogg, .opus, .wav, .m4a)" });
  }
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const base64Data = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype || "audio/mpeg";
    const filename = req.file.originalname || "custom_default_audio.mp3";
    await db.updateDefaultAudio({ base64Data, mimeType, filename }, req.userId);
    res.json({ ok: true, filename, message: `Custom default voice audio "${filename}" saved successfully!` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Authenticated + per-user: previously this streamed the (global,
// admin) custom audio to anyone without a session.
app.get("/api/settings/default-audio", requireAuth, async (req, res) => {
  try {
    const audioData = db.MONGODB_URI ? await db.getDefaultAudio(req.userId) : null;
    if (audioData && audioData.buffer) {
      res.set("Content-Type", audioData.mimeType || "audio/mpeg");
      res.set("Content-Disposition", `inline; filename="${audioData.filename || 'default.mp3'}"`);
      return res.send(audioData.buffer);
    }
    const opusPath = path.join(__dirname, "default.opus");
    const mp3Path = path.join(__dirname, "default.mp3");
    if (fs.existsSync(opusPath)) {
      res.set("Content-Type", "audio/ogg; codecs=opus");
      return res.sendFile(opusPath);
    }
    if (fs.existsSync(mp3Path)) {
      res.set("Content-Type", "audio/mpeg");
      return res.sendFile(mp3Path);
    }
    res.status(404).send("No default audio note found");
  } catch (err) {
    res.status(500).send("Error streaming audio");
  }
});

app.delete("/api/settings/default-audio", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    await db.deleteDefaultAudio(req.userId);
    res.json({ ok: true, message: "Default audio reset to factory audio" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Phase 1: AI disclosure setting, alerts, contact memory, backups ─────────
// All logic lives in features/*; these handlers only auth + delegate.
// Memory/backup reads are tenant-scoped: a tenant can only see their
// own contacts' memory, and backups (a whole-DB dump) are admin-only.
app.get("/api/settings/disclosure", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    res.json({ ok: true, enabled: await db.getAiDisclosure(req.userId) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/settings/disclosure", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const enabled = !!(req.body || {}).enabled;
    await db.setAiDisclosure(enabled, req.userId);
    res.json({ ok: true, enabled });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/alerts", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    res.json({ ok: true, alerts: await alerts.listAlerts(req.userId, 20) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Live Feed: owner-scoped question/reply events (see features/liveFeed.js).
// A tenant reads only their own feed; the master admin reads only theirs.
app.get("/api/live-feed", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.json({ ok: true, events: [] });
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    res.json({ ok: true, events: await db.getFeedEvents(req.userId, limit) });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to load live feed" });
  }
});

app.post("/api/alerts/:id/read", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const ok = await alerts.markAlertRead(req.userId, req.params.id);
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Memory endpoints need no extra ownership guard: every memory query
// is keyed by req.userId, so a tenant can never read or clear another
// tenant's memory, and the master admin reads all tenants (as elsewhere).
app.get("/api/memory/:jid", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const jid = decodeURIComponent(req.params.jid);
    res.json({ ok: true, memory: await contactMemory.getMemory(req.userId, jid) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/memory/:jid", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const jid = decodeURIComponent(req.params.jid);
    res.json({ ok: true, cleared: await contactMemory.clearMemory(req.userId, jid) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/backups", requireAdmin, apiLimiter, async (req, res) => {
  try {
    const dir = backup.backupDir();
    if (!fs.existsSync(dir)) return res.json({ ok: true, backups: [] });
    const backups = fs.readdirSync(dir)
      .filter((f) => f.startsWith("backup-"))
      .map((f) => {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        return { file: f, bytes: stat.isDirectory() ? null : stat.size, createdAt: stat.mtime };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ ok: true, dir, backups });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Phase 2: agent settings (UPI ID, persona voices) + reminders ──────────
// UPI ID is per-user and is the ONLY payee create_upi_link may use.
// Voices are free Edge Neural names; unknown names fall back to the
// persona default inside freeVoiceEngine.
app.get("/api/settings/upi", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    res.json({ ok: true, upiId: await db.getUpiId(req.userId) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/settings/upi", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const upiId = String((req.body || {}).upiId || "").trim();
    if (upiId && !agentTools.UPI_ID_RE.test(upiId)) return res.status(400).json({ ok: false, error: "Invalid UPI ID (expected like name@bank)" });
    await db.setUpiId(upiId, req.userId);
    res.json({ ok: true, upiId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/settings/voices", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const { VOICE_OPTIONS } = require("./features/freeVoiceEngine");
    res.json({ ok: true, voices: await db.getPersonaVoices(req.userId), options: VOICE_OPTIONS });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/settings/voices", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    await db.setPersonaVoices((req.body || {}).voices || {}, req.userId);
    res.json({ ok: true, voices: await db.getPersonaVoices(req.userId) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/reminders", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const deps = agentTools.defaultDeps();
    res.json({ ok: true, reminders: await deps.listReminders(req.userId) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/reminders/:id", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const deps = agentTools.defaultDeps();
    res.json({ ok: true, deleted: await deps.deleteReminder(req.userId, req.params.id) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/backups/run", requireAdmin, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const d = await db.getDb();
    const result = await backup.runBackup({ db: d });
    await d.collection("settings").updateOne(
      { key: "lastBackupAt" },
      { $set: { value: Date.now(), updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ ok: true, path: result.path, totalDocs: result.manifest.totalDocs });
  } catch (err) {
    console.error("[Backup] manual run failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── CRM Lead Stage & Notes Endpoints ──────────────────────────────────────────
app.post("/api/contacts/stage", requireAuth, apiLimiter, async (req, res) => {
  const { jid, leadStage } = req.body || {};
  if (!jid || !leadStage) return res.status(400).json({ ok: false, error: "JID and leadStage required" });
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    if (!req.isAdmin) {
      const contact = await db.getContact(jid);
      if (contact && contact.userId && contact.userId !== req.userId) {
        return res.status(403).json({ ok: false, error: "Access denied. You do not own this contact." });
      }
    }
    await db.updateContactLeadStage(jid, leadStage, req.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/contacts/notes", requireAuth, apiLimiter, async (req, res) => {
  const { jid, notes } = req.body || {};
  if (!jid) return res.status(400).json({ ok: false, error: "JID required" });
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    if (!req.isAdmin) {
      const contact = await db.getContact(jid);
      if (contact && contact.userId && contact.userId !== req.userId) {
        return res.status(403).json({ ok: false, error: "Access denied. You do not own this contact." });
      }
    }
    await db.updateContactNotes(jid, notes, req.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Media Assets Endpoints ────────────────────────────────────────────────────
// Media Vault is master-only (its POST/DELETE already were);
// the GET used to let any tenant list the admin's assets,
// including their stored file data.
app.get("/api/media", requireAdmin, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.json({ assets: [] });
    const assets = await db.listMediaAssets();
    res.json({ ok: true, assets });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/media", requireAdmin, apiLimiter, upload.single("file"), async (req, res) => {
  const { title, mediaType, keywords, fileUrl } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, error: "Title is required" });
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });

    let url = fileUrl || "";
    let filename = "attachment";
    let mimeType = "application/pdf";
    let buffer = null;

    if (req.file) {
      filename = req.file.originalname || "file";
      mimeType = req.file.mimetype || "application/octet-stream";
      buffer = req.file.buffer || null;
    }

    const asset = await db.saveMediaAsset({
      title,
      mediaType: mediaType || "document",
      mimeType,
      fileUrl: url,
      filename,
      keywords,
      buffer,
    });

    res.json({ ok: true, asset, message: `Media asset "${asset.title}" saved successfully!` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/media/:id", requireAdmin, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    await db.deleteMediaAsset(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Drip Sequence Endpoints & Engine ──────────────────────────────────────────
app.get("/api/drips", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.json({ rules: [] });
    const rules = await db.listDripRules(req.userId);
    res.json({ ok: true, rules });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/drips", requireAuth, apiLimiter, async (req, res) => {
  const { name, inactivityHours, targetStage, message, enabled } = req.body || {};
  if (!name || !message) return res.status(400).json({ ok: false, error: "Name and message required" });
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    const rule = await db.saveDripRule({ name, inactivityHours, targetStage, message, enabled, userId: req.userId });
    res.json({ ok: true, rule, message: `Drip rule "${rule.name}" saved!` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/drips/:id", requireAuth, apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) return res.status(503).json({ ok: false, error: "MongoDB not configured" });
    await db.deleteDripRule(req.params.id, req.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── WhatsApp state & Socket Sync ─────────────────────────────────────────────
// Multi-tenant: every dashboard account ("tenant") gets its OWN WhatsApp
// connection, auth folder, contacts and AI keys. The master admin's tenant
// id is "admin" and keeps the legacy auth folder so the existing pairing
// flow is unchanged. A tenant's bot only ever touches that tenant's data.
const tenants = new Map();
function getTenant(owner) {
  const key = owner || "admin";
  if (!tenants.has(key)) {
    tenants.set(key, {
      owner: key,
      sock: null,
      isReady: false,
      qrDataUrl: null,
      starting: false,
      authFolder: key === "admin" ? AUTH_FOLDER : path.join(__dirname, "auth_info_baileys_users", key.replace(/[^a-z0-9._@-]/gi, "_")),
      keysCache: null,
      keysCacheAt: 0,
    });
  }
  return tenants.get(key);
}
function tenantRoom(owner) { return `tenant:${owner || "admin"}`; }
function tenantEmit(owner, event, payload) { io.to(tenantRoom(owner)).emit(event, payload); }
// Live Feed event: persisted (owner-scoped) + pushed to the owner's
// dashboard room. Must NEVER break a reply, so failures are swallowed.
async function emitFeed(owner, fields) {
  try {
    const event = liveFeed.buildFeedEvent(fields);
    if (db.MONGODB_URI) await db.saveFeedEvent(owner, event).catch(() => {});
    tenantEmit(owner, "feed", event);
  } catch {}
}
// Scoped key for the shared direct-chat pause control (admin keeps the
// legacy plain-jid keys so existing pause states survive the upgrade).
function directKey(owner, jid) { return owner === "admin" ? jid : `${owner}::${jid}`; }

// Resolve a tenant's own AI keys (cached 60s). Admin resolves to {} —
// gpt.js falls back to the owner's global keys for the admin tenant only.
async function resolveTenantKeys(owner) {
  if (!owner || owner === "admin") return { userId: "admin" };
  const T = getTenant(owner);
  if (T.keysCache && Date.now() - T.keysCacheAt < 60000) return T.keysCache;
  let keys = { userId: owner, apiKey: "", geminiKey: "" };
  try {
    if (db.MONGODB_URI) {
      const user = await db.getUserByUsername(owner);
      if (user) keys = { userId: owner, apiKey: user.userApiKey || "", geminiKey: user.userGeminiKey || "" };
    }
  } catch {}
  T.keysCache = keys;
  T.keysCacheAt = Date.now();
  return keys;
}
function invalidateTenantKeys(owner) {
  const T = getTenant(owner);
  T.keysCache = null;
  T.keysCacheAt = 0;
}

// ── Phase 1 wiring helpers (thin only) ────────────────────────────────────────
// Never mutate the cached tenantKeys object — each message gets a copy
// with that contact's memory attached, so memories can't leak across contacts.
async function loadMemoryTenant(owner, jid, tenantKeys) {
  let memoryText = "";
  try {
    if (db.MONGODB_URI) memoryText = await contactMemory.getMemoryText(owner, jid);
  } catch {}
  return { ...tenantKeys, contactMemory: memoryText };
}

// Summarizer for the rolling memory: the tenant's own provider engine,
// low temperature, small cap. Phase 2: freeOnly — an automated
// background call must never touch a paid model. Throws when no
// free provider is configured — maybeSummarize treats that as
// "skip quietly".
async function summarizeWithProviders(owner, prompt) {
  const r = await aiProviders.chatCompletion({
    userId: owner,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    maxTokens: 400,
    freeOnly: true,
  });
  return r?.text || "";
}

// Fire-and-forget memory refresh after a reply is stored.
function refreshMemoryAfterReply(owner, jid) {
  if (!db.MONGODB_URI) return;
  contactMemory.maybeSummarize(owner, jid, (prompt) => summarizeWithProviders(owner, prompt)).catch(() => {});
}

io.on("connection", (socket) => {
  const sess = socket.request.session || {};
  const owner = sess.username || "admin";
  socket.join(tenantRoom(owner));
  const T = getTenant(owner);
  if (T.isReady) {
    socket.emit("ready");
  } else if (T.qrDataUrl) {
    socket.emit("qr", { dataUrl: T.qrDataUrl });
  } else {
    socket.emit("disconnected");
  }
});

// ── WhatsApp Gateway Status & Control Endpoints ──────────────────────────────
// ── WhatsApp Group AI Endpoints (Direct 1-Click UI Control) ───────────────────
app.get('/api/groups', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const { getActiveConfig } = require('./features/groupChat');
    const cfg = getActiveConfig();

    let groupList = [];
    const adminT = getTenant("admin");
    if (adminT.isReady && adminT.sock) {
      try {
        const groups = await adminT.sock.groupFetchAllParticipating();
        groupList = Object.values(groups).map(g => ({
          id: g.id,
          name: g.subject || 'Unnamed Group',
          participantsCount: (g.participants || []).length,
          enabled: cfg.allowed.has(g.id),
        })).sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0) || a.name.localeCompare(b.name));
      } catch (fetchErr) {
        console.warn('[Group AI] Failed to fetch live groups:', fetchErr.message);
      }
    }

    res.json({
      ok: true,
      ready: adminT.isReady,
      enabled: cfg.enabled,
      cooldown: cfg.cooldown / 1000,
      chance: cfg.chance,
      profanity: cfg.profanity,
      persona: cfg.persona || 'bc',
      groups: groupList,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/groups/toggle', requireAdmin, apiLimiter, (req, res) => {
  try {
    const { toggleGroup } = require('./features/groupChat');
    const { groupId, enabled } = req.body || {};
    if (!groupId || !groupId.endsWith('@g.us')) {
      return res.status(400).json({ ok: false, error: 'Valid WhatsApp group ID required' });
    }
    const updated = toggleGroup(groupId, !!enabled);
    res.json({
      ok: true,
      groupId,
      enabled: updated.allowed.has(groupId),
      totalEnabled: updated.allowed.size,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/groups/config', requireAdmin, apiLimiter, (req, res) => {
  try {
    const { updateConfig } = require('./features/groupChat');
    const { enabled, cooldown, chance, profanity, persona } = req.body || {};
    const updated = updateConfig({
      enabled: typeof enabled === 'boolean' ? enabled : undefined,
      cooldownSeconds: typeof cooldown === 'number' ? cooldown : undefined,
      chance: typeof chance === 'number' ? chance : undefined,
      profanity: typeof profanity === 'boolean' ? profanity : undefined,
      persona: typeof persona === 'string' ? persona : undefined,
    });
    res.json({
      ok: true,
      enabled: updated.enabled,
      cooldown: updated.cooldown / 1000,
      chance: updated.chance,
      profanity: updated.profanity,
      persona: updated.persona,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/whatsapp/status", requireAuth, (req, res) => {
  const T = getTenant(req.userId);
  res.json({
    ok: true,
    owner: T.owner,
    ready: T.isReady,
    qrUrl: T.qrDataUrl,
    status: T.isReady ? "connected" : (T.qrDataUrl ? "qr_ready" : (T.sock || T.starting ? "connecting" : "not_started")),
  });
});

// Start (or restart) the caller's OWN WhatsApp connection. Used by the
// "Connect WhatsApp" button: generates a QR for the caller's tenant only.
app.post("/api/whatsapp/connect", requireAuth, async (req, res) => {
  try {
    const owner = req.userId;
    const T = getTenant(owner);
    if (T.isReady) return res.json({ ok: true, message: "WhatsApp is already connected." });
    if (!T.sock && !T.starting) {
      startWhatsApp(owner).catch((err) => console.error(`[Baileys/${owner}] Connect error:`, err.message));
    }
    res.json({ ok: true, message: "Starting WhatsApp connection. Scan the QR code to link your number." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/whatsapp/reconnect", requireAuth, async (req, res) => {
  try {
    const owner = req.userId;
    const T = getTenant(owner);
    console.log(`[Baileys/${owner}] Manual reconnect / QR reset requested via API`);
    T.isReady = false;
    T.qrDataUrl = null;
    tenantEmit(owner, "disconnected");
    if (T.sock) {
      try {
        T.sock.ev.removeAllListeners();
        T.sock.end(new Error("Manual reset"));
      } catch (_) {}
      T.sock = null;
    }
    try {
      fs.rmSync(T.authFolder, { recursive: true, force: true });
    } catch (_) {}
    T.starting = false;
    setTimeout(() => {
      startWhatsApp(owner).catch((err) => console.error(`[Baileys/${owner}] Manual start error:`, err.message));
    }, 1500);
    res.json({ ok: true, message: "WhatsApp connection reset. Generating fresh QR code..." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/whatsapp/logout", requireAuth, async (req, res) => {
  try {
    const owner = req.userId;
    const T = getTenant(owner);
    console.log(`[Baileys/${owner}] Manual device logout requested via API`);
    T.isReady = false;
    T.qrDataUrl = null;
    tenantEmit(owner, "disconnected");
    if (T.sock) {
      try {
        await T.sock.logout();
      } catch (_) {}
      try {
        T.sock.ev.removeAllListeners();
        T.sock.end(new Error("Logout"));
      } catch (_) {}
      T.sock = null;
    }
    try {
      fs.rmSync(T.authFolder, { recursive: true, force: true });
    } catch (_) {}
    T.starting = false;
    setTimeout(() => {
      startWhatsApp(owner).catch((err) => console.error(`[Baileys/${owner}] Post-logout restart error:`, err.message));
    }, 2000);
    res.json({ ok: true, message: "Logged out from device. New QR code starting..." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Layer 3: Typing Presence Simulation ─────────────────────────────────────
/**
 * Show WhatsApp "typing..." indicator before sending a reply.
 * Delay is proportional to reply length (mimics human typing speed ~40 cpm).
 * Min 1.5s, Max 7s, with ±500ms random jitter.
 *
 * @param {Object} sock       Baileys socket instance
 * @param {string} jid        Recipient JID
 * @param {number} textLength Length of the reply text (for delay calculation)
 */
async function simulateTyping(sock, jid, textLength = 50) {
  try {
    await sock.sendPresenceUpdate("composing", jid);
    const baseDelay = Math.min(1200, Math.max(400, (textLength / 120) * 1000));
    const jitter = Math.floor((Math.random() - 0.5) * 300);
    await new Promise((resolve) => setTimeout(resolve, Math.max(300, baseDelay + jitter)));
    await sock.sendPresenceUpdate("paused", jid);
  } catch (_) {
    // Presence updates are non-critical — silently ignore errors
  }
}

// ── Persona Picker Helpers ───────────────────────────────────────────────────

/**
 * Send the AI companion selection menu to a new user.
 * Uses WhatsApp markdown (*bold*, _italic_) for visual appeal.
 */
async function sendModeSelectionMessage(sock, jid, name = "") {
  const hi = name ? `Hey *${name.split(" ")[0]}*! 👋` : "Hey! 👋";
  const menu =
    `${hi} Welcome to *Devil's AI* 🤖\n\n` +
    `Choose your AI companion — reply with a number:\n\n` +
    `1️⃣  *😈 Devil's AI* _\(Default\)_\n` +
    `    Smart assistant, solves anything\n\n` +
    `2️⃣  *👦 Dhruv Mode*\n` +
    `    Casual guy, Hinglish vibes\n\n` +
    `3️⃣  *👧 Annu Mode*\n` +
    `    Sweet girlfriend persona\n\n` +
    `_Reply with *1*, *2*, or *3* to activate (or send *STOP* to turn off AI)_ ✨`;

  await simulateTyping(sock, jid, menu.length);
  await sock.sendMessage(jid, { text: menu });
  console.log(`[Picker] Sent mode selection menu to ${jid}`);
}

/**
 * Sends a WhatsApp message reliably.
 * Uses standard WhatsApp messaging to ensure 100% delivery directly to WhatsApp
 * without being dropped or filtered by WhatsApp servers.
 */
async function sendWhatsAppMessageWithCodeCopy(sock, jid, text, quoted = null) {
  if (!text) text = "👍";
  try {
    return await sock.sendMessage(jid, { text }, quoted ? { quoted } : {});
  } catch (err) {
    console.warn(`[Message] Send with quoted failed (${err.message}), retrying plain text...`);
    try {
      return await sock.sendMessage(jid, { text });
    } catch (retryErr) {
      console.error(`[Message] Failed to send message to ${jid}:`, retryErr.message);
      return null;
    }
  }
}

/**
 * Parse a user's reply to detect which persona they chose.
 * Accepts: numbers (1/2/3), English names, Hindi equivalents, emojis.
 * @param {string} text
 * @returns {"devil"|"boy"|"girl"|null}
 */
function parsePersonaChoice(text) {
  const t = (text || "").toLowerCase().trim();
  if (/^(1|one|devil|😈|smart|default|ai)/.test(t))   return "devil";
  if (/^(2|two|boy|dhruv|👦|bro|dude|male)/.test(t))    return "boy";
  if (/^(3|three|girl|annu|👧|female|gf|ladki)/.test(t)) return "girl";
  return null;
}

/**
 * Send a persona-specific confirmation + first message after mode selection.
 */
async function sendPersonaWelcome(sock, jid, mode) {
  const welcomes = {
    devil:
      "*😈 Devil's AI activated!*\n\n" +
      "Hey! Devil's here 😈\n\n" +
      "How can I help you today?\n\n" +
      "— Devil's AI v1.0",
    boy:
      "*👦 Dhruv mode activated!*\n\n" +
      "Haha theek hai bhai! Bol kya scene hai? 😄",
    girl:
      "*👧 Annu mode activated!*\n\n" +
      "Hii! Kaise ho? 🙂",
  };
  const msg = welcomes[mode] || welcomes.devil;
  await simulateTyping(sock, jid, msg.length);
  await sock.sendMessage(jid, { text: msg });
}

// ── Don Away Mode Helpers ────────────────────────────────────────────────────

function isDonAwayOptInReply(text) {
  const t = (text || "").toLowerCase().trim();
  return /^(yes|okay|ok|1|one|hmm|hmmm|ha|haan|sahi|thik|sure|yep|yup|haanji|okkk|hi|hello|hey)\b/i.test(t);
}

async function sendDonAwayNotice(sock, jid, senderName = "", owner = "admin") {
  const firstName = (senderName || "").trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Hey *${firstName}*! 👋` : `Hey! 👋`;

  let textReply =
    `${greeting}\n\n` +
    `Main abhi thoda busy hu aur messages check nahi kar pa raha. Free hote hi aapse connect karta hu!\n\n` +
    `────────────────────────\n` +
    `🤖 *AI Assistant Live:*\n` +
    `Agar koi urgent baat ya query ho, toh reply me *1* ya *Hi* likhiye — mera AI Assistant turant aapse connect ho jayega!\n` +
    `────────────────────────`;

  if (db.MONGODB_URI) {
    try {
      const defaults = await db.getDefaultSettings(owner);
      if (defaults && defaults.defaultMessage && !defaults.defaultMessage.includes("Don abhi kaam pe hai")) {
        textReply = defaults.defaultMessage;
      }
    } catch (e) {}
  }

  await simulateTyping(sock, jid, textReply.length);
  await sock.sendMessage(jid, { text: textReply });

  // Send Default / Custom Voice Note
  try {
    let audioData = null;
    if (db.MONGODB_URI) {
      audioData = await db.getDefaultAudio(owner);
    }

    if (!audioData) {
      const opusPath = path.join(__dirname, "default.opus");
      const mp3Path = path.join(__dirname, "default.mp3");

      if (!fs.existsSync(opusPath) && fs.existsSync(mp3Path)) {
        try {
          const { execSync } = require("child_process");
          execSync(`ffmpeg -y -i "${mp3Path}" -c:a libopus -b:a 24k -application voip -vbr on "${opusPath}" 2>/dev/null`);
        } catch (_) {}
      }

      const audioFile = fs.existsSync(opusPath) ? opusPath : (fs.existsSync(mp3Path) ? mp3Path : null);
      if (audioFile) {
        audioData = {
          filePath: audioFile,
          buffer: fs.readFileSync(audioFile),
          mimeType: audioFile.endsWith(".opus") ? "audio/ogg; codecs=opus" : "audio/mpeg",
          filename: path.basename(audioFile),
        };
      }
    }

    if (audioData && (audioData.filePath || audioData.buffer)) {
      const isOpus = (audioData.mimeType && audioData.mimeType.includes("opus")) || (audioData.filename && audioData.filename.endsWith(".opus"));
      const audioPayload = audioData.filePath && fs.existsSync(audioData.filePath)
        ? { url: audioData.filePath }
        : audioData.buffer;

      await sock.sendMessage(jid, {
        audio: audioPayload,
        mimetype: isOpus ? "audio/ogg; codecs=opus" : "audio/mpeg",
        ptt: true,
      });
      console.log(`[DonAway] Sent professional voice note (${audioData.filename}) to ${jid}`);
    } else {
      console.warn("[DonAway] No audio file found to send");
    }
  } catch (audioErr) {
    console.error("[DonAway] Audio send error:", audioErr.message);
  }

  console.log(`[DonAway] Sent professional away notice + voice note to ${jid}`);
}

// ── Baileys WhatsApp client (no browser, pure WebSocket) ─────────────────────
async function startWhatsApp(owner = "admin") {
  const T = getTenant(owner);
  if (T.starting) return;
  T.starting = true;

  try {
    // Clean up previous socket instance if present
    if (T.sock) {
      try {
        T.sock.ev.removeAllListeners();
        T.sock.end(new Error("Starting fresh WhatsApp socket"));
      } catch (_) {}
      T.sock = null;
    }

    // Ensure this tenant's auth folder exists
    if (!fs.existsSync(T.authFolder)) {
      fs.mkdirSync(T.authFolder, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(T.authFolder);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    console.log(`[Baileys] Using WA v${version.join(".")}`);

    const logger = pino({ level: "silent" }); // suppress verbose logs

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false, // we handle QR ourselves via socket.io & REST
      browser: ["Devil's AI", "Chrome", "1.0.0"],
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 2000,
    });

    T.sock = sock;

    // Save credentials whenever they are updated
    sock.ev.on("creds.update", saveCreds);

    // Handle connection state changes
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Send QR code to all connected browser clients
      if (qr) {
        try {
          T.qrDataUrl = await qrcode.toDataURL(qr, { margin: 2, width: 280 });
          console.log(`[Baileys/${owner}] QR code generated — scan with WhatsApp`);
          tenantEmit(owner, "qr", { dataUrl: T.qrDataUrl });
        } catch (err) {
          console.error("[Baileys] QR generation error:", err.message);
        }
      }

      if (connection === "open") {
        T.isReady = true;
        T.qrDataUrl = null;
        T.starting = false;
        console.log(`[Baileys/${owner}] WhatsApp connected ✓`);
        tenantEmit(owner, "ready");

        // 🔥 Hybrid: Sync contacts after successful login
        try {
          await syncWhatsAppContacts(sock, owner);
        } catch (err) {
          console.error("[Baileys] Contact sync failed:", err.message);
        }
      }

      if (connection === "close") {
        T.isReady = false;
        T.qrDataUrl = null;
        const statusCode =
          lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output?.statusCode
            : null;

        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        console.log(`[Baileys] Connection closed (code: ${statusCode}), isLoggedOut: ${isLoggedOut}`);
        tenantEmit(owner, "disconnected");
        // Phase 1: a disconnect used to surface only in server logs.
        // Store it, push it live to the dashboard, and email it when
        // the owner has an email address on file.
        if (db.MONGODB_URI) {
          alerts.createAlert({
            owner,
            type: isLoggedOut ? "whatsapp_logged_out" : "whatsapp_disconnected",
            title: isLoggedOut ? "WhatsApp device logged out" : "WhatsApp disconnected",
            detail: `Connection closed (code: ${statusCode}). ${isLoggedOut ? "Credentials were purged and a fresh QR will generate — scan it to reconnect." : "Auto-reconnect will be attempted."}`,
          }).then((a) => tenantEmit(owner, "alert", a)).catch(() => {});
        }

        if (isLoggedOut) {
          console.log(`[Baileys/${owner}] Device logged out from WhatsApp. Purging credentials and generating fresh QR...`);
          try {
            fs.rmSync(T.authFolder, { recursive: true, force: true });
          } catch (err) {
            console.error("[Baileys] rmSync auth error:", err.message);
          }
          // 🔥 Auto-restart with clean auth so a fresh QR code is immediately generated
          setTimeout(() => {
            T.starting = false;
            startWhatsApp(owner).catch((e) => console.error("[Baileys] Auto-restart error:", e.message));
          }, 2000);
        } else {
          // Network disconnect / socket reconnect
          setTimeout(() => {
            T.starting = false;
            startWhatsApp(owner).catch((e) => console.error("[Baileys] Reconnect error:", e.message));
          }, 3000);
        }
      }
    });

  // ── Live contact updates ─────────────────────────────────
  sock.ev.on("contacts.upsert", async (contacts) => {
    try {
      const mapped = contacts.map((c) => ({
        jid: c.id,
        name: c.name || c.notify || c.verifiedName || "",
      }));
      if (db.MONGODB_URI) {
        await db.bulkUpsertContacts(mapped, owner);
        console.log(`[Baileys] contacts.upsert → ${mapped.length} contacts`);
      }
    } catch (err) {
      console.error("[Baileys] contacts.upsert error:", err.message);
    }
  });

  sock.ev.on("contacts.update", async (updates) => {
    try {
      const mapped = updates
        .filter((u) => u.id)
        .map((u) => ({
          jid: u.id,
          name: u.name || u.notify || "",
        }));
      if (mapped.length && db.MONGODB_URI) {
        await db.bulkUpsertContacts(mapped, owner);
      }
    } catch (err) {
      console.error("[Baileys] contacts.update error:", err.message);
    }
  });

  const { createGroupHandler } = require('./features/groupChat');
  const groupHandler = createGroupHandler({
    reply: require('./gpt').getGroupReply,
    onError: () => console.warn('[Group AI] Reply failed; no chat content logged.'),
  });

  // ── Incoming messages (Multimodal: Text + Voice + Image) ────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const owner = T.owner;
    const tenantKeys = await resolveTenantKeys(owner);

    for (const msg of messages) {
      if (msg.key.fromMe) continue;

      const jid = msg.key.remoteJid || "";

      const isGroup = jid.endsWith("@g.us");
      const isStatus = jid === "status@broadcast";
      if (isStatus) continue;
      if (isGroup) {
        // Group AI is a master-admin feature; tenant bots handle DMs only.
        if (owner === "admin") {
          try { await groupHandler(sock, msg); }
          catch { console.warn('[Group AI] Handler failed.'); }
        }
        continue;
      }

      // Personal-message analytics must not block group routing.
      if (db.MONGODB_URI) {
        db.trackActivity(owner, "message").catch(() => {});
      }

      // ── Extract all possible content types ──────────────────
      const directMessage = require("./features/directChatControl").unwrapDirectMessage(msg.message);
      const textMsg = (
        directMessage.conversation ||
        directMessage.extendedTextMessage?.text ||
        ""
      ).trim();

      const audioMsg = directMessage.audioMessage || null;
      const imageMsg = directMessage.imageMessage || null;

      const hasAnyContent = textMsg || audioMsg || imageMsg;

      // Emit to dashboard (show media type labels)
      const payload = {
        id: msg.key.id || `${jid}-${Date.now()}`,
        from: jid,
        fromName: msg.pushName || jid,
        body: textMsg || (audioMsg ? "🎙️ Voice Note" : imageMsg ? "📸 Image" : ""),
        timestamp: msg.messageTimestamp,
        hasMedia: !!(audioMsg || imageMsg),
      };
      tenantEmit(owner, "message", payload);
      // Live Feed question (voice notes get their real question later,
      // once transcribed — the "🎙️ Voice Note" label is not a question).
      if (!audioMsg && (textMsg || imageMsg)) {
        emitFeed(owner, { jid, contactName: msg.pushName || "", direction: "in", kind: "user", text: textMsg || "📸 Image" });
      }

      if (!hasAnyContent) continue;

      let replyTicket;
      try {
        const action = await directControl.command(directKey(owner, jid), textMsg);
        if (action) {
          await sock.sendMessage(jid, { text: action === 'stop'
            ? '⏸️ AI auto-reply paused. START ya MENU likhkar dobara chalu kar sakte ho.'
            : '▶️ AI auto-reply re-enabled.' });
          emitFeed(owner, { jid, contactName: msg.pushName || "", direction: "out", kind: "system", text: action === 'stop'
            ? '⏸️ AI auto-reply paused. START ya MENU likhkar dobara chalu kar sakte ho.'
            : '▶️ AI auto-reply re-enabled.' });
          if (action === 'start') await sendModeSelectionMessage(sock, jid, msg.pushName || '');
          continue;
        }
        replyTicket = await directControl.ticket(directKey(owner, jid));
        if (!directControl.allowed(replyTicket)) continue;
      } catch (err) {
        console.error('[DirectChatControl] Could not load/save pause state:', err.message);
        // Fail closed; never run AI when opt-out status cannot be checked.
        continue;
      }
      const replySock = directControl.guard(sock, replyTicket);

      // 🛡️ 1. Security & Spam Shield Inspection
      // A flagged message stops here: alert + webhook, but NO rule reply
      // and NO AI generation. Previously flagged scam/spam/flood messages
      // still flowed into the AI pipeline and got full replies — the
      // "shield" detected threats but did not shield anything except
      // manually blocked contacts.
      const securityCheck = await securityShield.inspectMessage({ jid, name: msg.pushName, text: textMsg, owner });
      if (!securityCheck.safe) {
        if (securityCheck.threatLevel === "blocked") {
          console.log(`[SecurityShield] Ignored message from blocked contact ${jid}`);
        } else {
          tenantEmit(owner, "syslog", {
            time: new Date().toISOString(),
            type: "warn",
            text: `🛡️ Security Alert: Flagged ${msg.pushName || jid} — ${securityCheck.alert?.reason || securityCheck.reason || 'Threat detected'} (AI reply withheld)`
          });
          if (owner === "admin") webhooks.dispatchWebhook("spam_flagged", { jid, name: msg.pushName, text: textMsg, alert: securityCheck.alert });
        }
        continue;
      }

      // ⚡ 2. Keyword Trigger & Workflow Engine
      if (textMsg) {
        const matchedRule = await rulesEngine.matchRule(textMsg, owner);
        if (matchedRule) {
          console.log(`[RulesEngine] ⚡ Rule triggered '${matchedRule.name}' for ${jid}`);
          tenantEmit(owner, "syslog", {
            time: new Date().toISOString(),
            type: "info",
            text: `⚡ Auto-Rule Triggered: '${matchedRule.name}' for ${msg.pushName || jid}`
          });
          if (owner === "admin") webhooks.dispatchWebhook("keyword_triggered", { jid, name: msg.pushName, text: textMsg, rule: matchedRule });

          if (matchedRule.actionType === "reply" && matchedRule.replyText) {
            await replySock.sendMessage(jid, { text: matchedRule.replyText });
            if (db.MONGODB_URI) {
              await db.saveChatMessage(jid, "assistant", matchedRule.replyText, owner);
            }
            emitFeed(owner, { jid, contactName: msg.pushName || "", direction: "out", kind: "rule", persona: "Auto-Rule", text: matchedRule.replyText });
            continue;
          } else if (matchedRule.actionType === "mode" && matchedRule.targetMode) {
            if (db.MONGODB_URI) {
              await db.setContactMode(jid, matchedRule.targetMode, owner);
            }
            if (matchedRule.replyText) {
              await replySock.sendMessage(jid, { text: matchedRule.replyText });
            }
            continue;
          }
        }
      }

      // Configured = legacy key OR any AI Provider key. The old gate
      // only checked the legacy users-collection keys, so a tenant
      // who had providers saved (AI Providers tab) but no legacy key
      // was sent "Bot is not configured" and NEVER reached
      // getReplyAsDhruv — even though the provider engine would have
      // answered fine. The provider check runs only when the legacy
      // check fails, so legacy-configured tenants pay no extra read.
      let tenantConfigured = owner === "admin" ? !!getApiKey() : !!(tenantKeys.apiKey || tenantKeys.geminiKey);
      if (!tenantConfigured) {
        try { tenantConfigured = await aiProviders.hasConfiguredProviders(owner); } catch {}
      }
      if (!tenantConfigured) {
        await replySock.sendMessage(jid, {
          text: "Bot is not configured: add your API key in the web app first.",
        });
        continue;
      }

      // ── Load contact info (shared across all paths) ──────────
      let contactMode = "devil";
      let chatHistory = [];
      let alreadyGreeted = false;
      let contact = null;  // declared here so it's accessible outside the try block

      try {
        if (db.MONGODB_URI) {
          contact = await db.getContact(jid, owner);
          // ⏰ 20-Minute Inactivity Reset: If inactive for >20 mins, reset Don Away notice, opt-in & persona selection
          if (contact && contact.lastActive) {
            const inactiveMinutes = (Date.now() - new Date(contact.lastActive).getTime()) / (60 * 1000);
            if (inactiveMinutes >= 20 && contact.mode !== "off" && contact.mode !== "manual" && !require("./features/annu").isAnnuMode(contact.mode)) {
              console.log(`[Inactivity] Contact ${jid} was inactive for ${Math.round(inactiveMinutes)}m. Resetting Don Away notice & opt-in.`);
              await db.setContactDonAwayOptIn(jid, false, owner);
              await db.setContactDonAwayNoticeSent(jid, false, owner);
              await db.setContactMode(jid, "devil", owner);
              const d = await db.getDb();
              await d.collection("contacts").updateOne({ jid, userId: owner }, { $set: { pendingModeSelection: true, donAwayOptIn: false, donAwayNoticeSent: false } });
            }
          }
          await db.upsertContact(jid, msg.pushName || "", owner);
          contact = await db.getContact(jid, owner);  // assign (not const) so scope is shared
          contactMode = contact.mode || "devil";
          alreadyGreeted = !!contact.greeted;
          chatHistory = await db.getChatHistory(jid, 12, owner);
        }
      } catch (err) {
        console.error("[Mongo] Error loading contact:", err.message);
      }

      // ══════════════════════════════════════════════════════════
      // LAYER 1 — 🎙️ VOICE NOTE: Transcribe → Persona → TTS Reply
      // ══════════════════════════════════════════════════════════
      if (contactMode === "off" || !directControl.allowed(replyTicket)) continue;

      // 🙋 Manual / human-handover mode: AI stays silent until a human
      // switches the contact back from the dashboard. Previously "manual"
      // fell through to the Devil default prompt in gpt.js, so the bot
      // kept replying after promising a human handover (rule + dashboard
      // both offer this mode).
      if (contactMode === "manual") {
        console.log(`[Manual] Skipping AI reply for ${jid} — human handover active`);
        continue;
      }

      if (audioMsg) {
        try {
          console.log(`[Voice] 🎙️ Voice note received from ${jid}`);
          await replySock.sendPresenceUpdate("recording", jid);

          // Download & decrypt voice note (reuploadRequest handles expired URLs)
          let audioBuffer = null;
          try {
            audioBuffer = await downloadMediaMessage(
              msg, "buffer", {},
              { logger, reuploadRequest: replySock.updateMediaMessage }
            );
          } catch (dlErr) {
            console.warn("[Voice] Download failed:", dlErr.message);
          }

          if (!audioBuffer || audioBuffer.length < 100) {
            const noAudio = {
              girl:  "arre sun nahi payi 😅 type karke bhejo na!",
              boy:   "bhai voice nahi hua, type kar yaar 😅",
              devil: "Couldn't download that voice note 😈 please type!",
            }[contactMode] || "Please type your message!";
            await simulateTyping(replySock, jid, noAudio.length);
            await replySock.sendMessage(jid, { text: noAudio });
            continue;
          }

          console.log(`[Voice] Downloaded ${audioBuffer.length} bytes`);

          // Transcribe with Whisper — Phase 2: freeOnly, so the paid
          // OpenAI Whisper leg is never reached for this path.
          const transcribed = await transcribeAudio(
            audioBuffer,
            audioMsg.mimetype || "audio/ogg; codecs=opus",
            { ...tenantKeys, freeOnly: true }
          );

          if (!transcribed) {
            // Graceful fallback if Whisper fails
            const fallback = {
              girl: "arre sun nahi payi 😅 type karke bhejo na!",
              boy:  "bhai voice nahi hua, type kar yaar 😅",
              devil: "Voice note transcription failed 😈 Please type your message!",
            }[contactMode] || "Please type your message!";

            await simulateTyping(replySock, jid, fallback.length);
            await replySock.sendMessage(jid, { text: fallback });
            continue;
          }

          // Save transcribed text to history
          if (db.MONGODB_URI) {
            await db.saveChatMessage(jid, "user", `[Voice]: ${transcribed}`, owner);
            chatHistory = await db.getChatHistory(jid, 12, owner);
            // Phase 1: capture explicit facts, load long-term memory.
            contactMemory.addFacts(owner, jid, contactMemory.extractFacts(transcribed)).catch(() => {});
          }
          emitFeed(owner, { jid, contactName: msg.pushName || "", direction: "in", kind: "user", text: transcribed, voice: true });

          // Get AI text reply for the transcribed voice content
          // Phase 2: voice replies also get tools (except Annu) and
          // the owner's chosen free Edge voice for this persona.
          const memoryTenantVoice = await loadMemoryTenant(owner, jid, tenantKeys);
          // Tools are persona-independent: any persona (Annu included)
          // can set a reminder or make a payment link on request.
          // Persona changes tone, not capability — a 2026-10-24 test
          // proved the old girl-exclusion made tools silently fail.
          memoryTenantVoice.toolsEnabled = true;
          memoryTenantVoice.freeOnly = true;
          let textReply = await getReplyAsDhruv(transcribed, contactMode, chatHistory, memoryTenantVoice);
          let voiceAction = null;
          if (db.MONGODB_URI) {
            voiceAction = await agentTools.handleReplyAction({ owner, jid, replyText: textReply });
            textReply = voiceAction.text;
          }
          // Phase 1: first-reply AI disclosure, only when the owner opted in.
          if (db.MONGODB_URI) {
            textReply = (await aiDisclosure.maybeDisclose({ db, owner, contact, replyText: textReply })).text;
          }

          // Try to generate a voice reply with TTS file in server temp folder
          const voiceChoice = db.MONGODB_URI ? (await db.getPersonaVoices(owner))[contactMode] : null;
          const tempAudioPath = await generateSpeechReplyFile(textReply, contactMode, { ...tenantKeys, freeOnly: true }, voiceChoice || null);

          if (tempAudioPath && fs.existsSync(tempAudioPath)) {
            // ✅ Reply with voice audio note streamed from temp file
            await simulateTyping(replySock, jid, 1);
            let audioSent = false;
            const isOpus = tempAudioPath.endsWith(".opus") || tempAudioPath.endsWith(".ogg");
            try {
              const sendPromise = replySock.sendMessage(jid, {
                audio: { url: tempAudioPath },
                mimetype: isOpus ? "audio/ogg; codecs=opus" : "audio/mpeg",
                ptt: true,
              }, { quoted: msg });

              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Media upload timed out after 20s")), 20000)
              );

              await Promise.race([sendPromise, timeoutPromise]);
              audioSent = true;
              console.log(`[Voice] ✓ Sent audio voice reply from file (${tempAudioPath}) to ${jid}`);
            } catch (sendErr) {
              console.warn(`[Voice] ⚠️ File audio upload failed or timed out (${sendErr.message}), sending text reply...`);
              await sendWhatsAppMessageWithCodeCopy(replySock, jid, textReply, msg);
            } finally {
              try { if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath); } catch {}
            }
          } else {
            // Fallback: send text reply if TTS fails
            await simulateTyping(replySock, jid, textReply.length);
            await sendWhatsAppMessageWithCodeCopy(replySock, jid, textReply, msg);
            console.log(`[Voice] ↩ Sent text reply to ${jid}`);
          }

          if (db.MONGODB_URI) {
            await db.saveChatMessage(jid, "assistant", textReply, owner);
            refreshMemoryAfterReply(owner, jid);
          }
          // UPI QR image rides with the voice/text reply (if a payment
          // action ran); a failed image send never breaks the reply.
          if (voiceAction?.attachment) {
            try { await replySock.sendMessage(jid, { image: voiceAction.attachment.buffer, caption: voiceAction.attachment.caption }); }
            catch (qrErr) { console.warn("[QR] voice image send failed:", qrErr.message); }
          }
          emitFeed(owner, { jid, contactName: msg.pushName || "", direction: "out", kind: "ai", persona: liveFeed.personaLabel(contactMode), text: textReply, voice: audioSent });
        } catch (err) {
          console.error("[Voice] ✗ Processing error:", err.message);
          await replySock.sendMessage(jid, { text: "Something went wrong with that voice note 😈" });
        }
        continue;
      }

      // ══════════════════════════════════════════════════════════
      // LAYER 2 — 👁️ IMAGE: Download → Vision API → Persona Reply
      // ══════════════════════════════════════════════════════════
      if (imageMsg) {
        try {
          console.log(`[Vision] 📸 Image received from ${jid}`);
          await replySock.sendPresenceUpdate("composing", jid);

          // ── Step 1: Try full image download (with decryption) ──
          let imageBuffer = null;
          let usingThumbnail = false;

          try {
            imageBuffer = await downloadMediaMessage(
              msg, "buffer", {},
              { logger, reuploadRequest: replySock.updateMediaMessage }
            );
            if (imageBuffer && imageBuffer.length > 200) {
              console.log(`[Vision] ✓ Full image downloaded (${imageBuffer.length} bytes)`);
            } else {
              imageBuffer = null; // treat as failed
            }
          } catch (dlErr) {
            console.warn(`[Vision] Full download failed: ${dlErr.message}`);
          }

          // ── Step 2: Fallback to embedded jpegThumbnail ─────────
          // WhatsApp always embeds a small thumbnail in the message itself.
          // It's lower resolution but enough for Vision to understand the image.
          if (!imageBuffer) {
            const thumb = imageMsg.jpegThumbnail;
            if (thumb && thumb.length > 100) {
              imageBuffer = Buffer.isBuffer(thumb) ? thumb : Buffer.from(thumb);
              usingThumbnail = true;
              console.log(`[Vision] ⚡ Using embedded thumbnail fallback (${imageBuffer.length} bytes)`);
            }
          }

          // ── Step 3: If we have no image data at all, bail ──────
          if (!imageBuffer || imageBuffer.length < 100) {
            const noImg = {
              girl:  "arre image load nahi hua 😅",
              boy:   "bhai image nahi aai yaar 😅",
              devil: "Couldn't load that image 😈 try again!",
            }[contactMode] || "Image load failed, please resend!";
            await simulateTyping(replySock, jid, noImg.length);
            await replySock.sendMessage(jid, { text: noImg });
            continue;
          }

          const caption = (imageMsg.caption || "").trim();
          const mimeType = usingThumbnail ? "image/jpeg" : (imageMsg.mimetype || "image/jpeg");

          // Log image event in conversation history
          if (db.MONGODB_URI) {
            const histEntry = caption
              ? `[Image: "${caption}"]`
              : "[Image sent]";
            await db.saveChatMessage(jid, "user", histEntry, owner);
            chatHistory = await db.getChatHistory(jid, 12, owner);
          }

          // Analyze with GPT-4o Vision in the active persona
          console.log(`[Vision] Sending to Vision API: ${imageBuffer.length} bytes, mime=${mimeType}, thumbnail=${usingThumbnail}`);
          const imageReply = await analyzeImageContent(
            imageBuffer,
            mimeType,
            contactMode,
            chatHistory,
            caption,
            tenantKeys
          );

          // Persona-specific fallbacks if vision fails
          const finalReply = imageReply || ({
            girl:  "arre ye kya bheja 😅",
            boy:   "bhai ye kya bheja tu 😂",
            devil: "Interesting image! 😈",
          }[contactMode] || "👀");

          await simulateTyping(replySock, jid, finalReply.length);
          await sendWhatsAppMessageWithCodeCopy(replySock, jid, finalReply, msg);

          if (db.MONGODB_URI) {
            await db.saveChatMessage(jid, "assistant", finalReply, owner);
          }
          emitFeed(owner, { jid, contactName: msg.pushName || "", direction: "out", kind: "ai", persona: liveFeed.personaLabel(contactMode), text: finalReply });
          console.log(`[Vision] ✓ Sent image reply to ${jid}`);
        } catch (err) {
          console.error("[Vision] ✗ Processing error:", err.message);
          await replySock.sendMessage(jid, { text: "Something went wrong with that image 😈" });
        }
        continue;
      }

      // ══════════════════════════════════════════════════════════
      // LAYER 3 — 💬 TEXT: Persona Reply with Typing Simulation
      // ══════════════════════════════════════════════════════════
      if (!textMsg) continue;

      try {
        if (db.MONGODB_URI) {
          await db.saveChatMessage(jid, "user", textMsg, owner);
          // Phase 1: capture explicit facts from this message.
          contactMemory.addFacts(owner, jid, contactMemory.extractFacts(textMsg)).catch(() => {});
        }

        // ══════════════════════════════════════════════════════════
        // DON AWAY MODE — "Don abhi kaam pe hai 😈"
        // ══════════════════════════════════════════════════════════
        const isDonAway = db.MONGODB_URI ? await db.getDonAwayMode(owner) : false;
        if (isDonAway) {
          const hasOptedIn = contact && contact.donAwayOptIn === true;
          if (!hasOptedIn) {
            const userOptedIn = isDonAwayOptInReply(textMsg);
            if (userOptedIn) {
              if (db.MONGODB_URI) {
                await db.setContactDonAwayOptIn(jid, true, owner);
                await db.setContactDonAwayNoticeSent(jid, false, owner);
                await db.saveChatMessage(jid, "assistant", "[Don Away AI Opt-in confirmed]", owner);
              }
              const confirmMsg = "*AI Assistant Activated! 🤖✨*\nAap bataiye, main aapki kya madad kar sakti hu?";
              await simulateTyping(replySock, jid, confirmMsg.length);
              await replySock.sendMessage(jid, { text: confirmMsg });
              emitFeed(owner, { jid, contactName: msg.pushName || "", direction: "out", kind: "system", text: confirmMsg });
              console.log(`[DonAway] ${jid} opted into AI mode while Don is away`);
              if (contact) {
                contact.donAwayOptIn = true;
                contact.donAwayNoticeSent = false;
              }
            } else {
              // Send Don Away text + voice note ONLY 1 TIME per 20-min session
              const noticeAlreadySent = contact && contact.donAwayNoticeSent === true;
              if (!noticeAlreadySent) {
                await sendDonAwayNotice(replySock, jid, msg.pushName || "", owner);
                if (db.MONGODB_URI) {
                  await db.setContactDonAwayNoticeSent(jid, true, owner);
                  await db.saveChatMessage(jid, "assistant", "[Don Away Notice Sent]", owner);
                }
                emitFeed(owner, { jid, contactName: msg.pushName || "", direction: "out", kind: "donAway", persona: "Don Away", text: "🔕 Don Away notice sent (away text + voice note)" });
                if (contact) contact.donAwayNoticeSent = true;
              } else {
                console.log(`[DonAway] Don Away notice already sent to ${jid} once in this active session, skipping repeat notice.`);
              }
              continue; // Stop further AI processing until they opt in
            }
          }
        }

        // ══════════════════════════════════════════════════════════
        // PERSONA PICKER — intercept before normal AI pipeline
        // New users (pendingModeSelection === true) see a numbered menu.
        // They reply 1/2/3 (or a keyword) to choose their companion.
        // ══════════════════════════════════════════════════════════
        if (contact?.pendingModeSelection) {
          const chosen = parsePersonaChoice(textMsg);

          if (chosen) {
            // ✅ Valid choice — lock in mode and send persona welcome
            if (db.MONGODB_URI) {
              await db.markModeSelected(jid, chosen, owner);
              await db.saveChatMessage(jid, "assistant", `[Mode selected: ${chosen}]`, owner);
            }
            contactMode = chosen;
            await sendPersonaWelcome(replySock, jid, chosen);
            console.log(`[Picker] ✓ ${jid} chose: ${chosen}`);
          } else {
            // ❌ Invalid reply — re-send the selection menu
            await sendModeSelectionMessage(replySock, jid, msg.pushName || "");
            console.log(`[Picker] Invalid reply "${textMsg.slice(0,20)}", re-sent menu to ${jid}`);
          }
          continue; // Skip normal AI pipeline until mode is set
        }

        // ── Normal AI pipeline (mode already selected) ─────────────────
        // Phase 1: this contact's long-term memory rides along (copy of
        // tenantKeys — the cached object is never mutated).
        // Phase 2: tools are on for devil/boy/custom modes, never Annu.
        const memoryTenant = await loadMemoryTenant(owner, jid, tenantKeys);
        // Tools are persona-independent (see voice path note above).
        memoryTenant.toolsEnabled = true;
        let reply = await getReplyAsDhruv(textMsg, contactMode, chatHistory, memoryTenant);
        // Phase 2: execute any [ACTION] block the model proposed
        // (validated server-side; payee always comes from settings).
        let replyAction = null;
        if (db.MONGODB_URI) {
          replyAction = await agentTools.handleReplyAction({ owner, jid, replyText: reply });
          reply = replyAction.text;
        }
        // Phase 1: first-reply AI disclosure, only when the owner opted in.
        if (db.MONGODB_URI) {
          reply = (await aiDisclosure.maybeDisclose({ db, owner, contact, replyText: reply })).text;
        }

        if (!directControl.allowed(replyTicket)) continue;

        // Layer 3 core: show typing indicator before every reply
        await simulateTyping(replySock, jid, reply.length);
        await sendWhatsAppMessageWithCodeCopy(replySock, jid, reply || "👍", msg);
        // UPI QR image follows the text reply (if a payment action ran).
        if (replyAction?.attachment) {
          try { await replySock.sendMessage(jid, { image: replyAction.attachment.buffer, caption: replyAction.attachment.caption }); }
          catch (qrErr) { console.warn("[QR] image send failed:", qrErr.message); }
        }

        if (!directControl.allowed(replyTicket)) continue;

        // 🖼️ Media Auto-Attachment Trigger Check (PDF / Photo / Audio)
        try {
          const mediaMatch = owner === "admin" ? await db.findMatchingMediaAsset(textMsg) : null;
          if (mediaMatch) {
            const mediaType = (mediaMatch.mediaType || "document").toLowerCase();
            let source = null;
            if (mediaMatch.base64Data) {
              source = Buffer.from(mediaMatch.base64Data, "base64");
            } else if (mediaMatch.buffer) {
              source = mediaMatch.buffer;
            } else if (mediaMatch.fileUrl && mediaMatch.fileUrl.startsWith("http")) {
              source = { url: mediaMatch.fileUrl };
            }

            if (source) {
              let mediaPayload = {};
              if (mediaType === "image" || mediaType === "photo" || mediaType === "picture") {
                mediaPayload = { image: source, caption: `📎 ${mediaMatch.title}` };
              } else if (mediaType === "audio" || mediaType === "voice") {
                mediaPayload = { audio: source, mimetype: mediaMatch.mimeType || "audio/mp4", ptt: true };
              } else {
                mediaPayload = {
                  document: source,
                  mimetype: mediaMatch.mimeType || "application/pdf",
                  fileName: mediaMatch.filename || "attachment.pdf",
                  caption: `📎 ${mediaMatch.title}`,
                };
              }

              await replySock.sendMessage(jid, mediaPayload);
              console.log(`[Media Auto-Trigger] ✓ Successfully sent ${mediaType} attachment "${mediaMatch.title}" to ${jid}`);
            } else {
              console.log(`[Media Auto-Trigger] ⚠️ Asset "${mediaMatch.title}" matched keyword but contains no file data.`);
            }
          }
        } catch (mErr) {
          console.error("[Media Auto-Trigger] Error sending media:", mErr.message);
        }

        if (db.MONGODB_URI) {
          await db.saveChatMessage(jid, "assistant", reply || "👍", owner);
          refreshMemoryAfterReply(owner, jid);
        }
        emitFeed(owner, { jid, contactName: msg.pushName || "", direction: "out", kind: "ai", persona: liveFeed.personaLabel(contactMode), text: reply || "👍" });
      } catch (err) {
        console.error("[Baileys] Reply error:", err.message);
        await replySock.sendMessage(jid, {
          text: "Something went wrong, try again in a bit. 😈",
        });
      }
    }
  });
  } catch (fatalErr) {
    console.error(`[Baileys/${owner}] startWhatsApp fatal initialization error:`, fatalErr.message);
    T.starting = false;
    setTimeout(() => {
      startWhatsApp(owner).catch((e) => console.error("[Baileys] Retry start error:", e.message));
    }, 5000);
  }
}

// ── Helper: Sync contacts after login ──────────────────────
async function syncWhatsAppContacts(sock, owner = "admin") {
  if (!db.MONGODB_URI) return;

  console.log("[Baileys] Syncing contacts...");

  try {
    const storeContacts = sock.store?.contacts || {};
    const list = Object.values(storeContacts)
      .filter((c) => c.id && !c.id.endsWith("@g.us") && c.id !== "status@broadcast")
      .map((c) => ({
        jid: c.id,
        name: c.name || c.notify || c.verifiedName || "",
      }));

    if (list.length > 0) {
      await db.bulkUpsertContacts(list, owner);
      console.log(`[Baileys] Synced ${list.length} contacts from store`);
    } else {
      console.log("[Baileys] No contacts in store yet (will sync via events)");
    }
  } catch (err) {
    console.log("[Baileys] Store contacts not available, relying on events");
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// Global safe error handler (2026-10-24): anything that reaches
// here (malformed JSON, multer errors, unexpected throws) used to
// fall through to Express's default handler. It now returns a
// generic message with no stack, no internal paths, and no DB
// error text — the detail still goes to the server console only.
// Multer file-size/type errors get a 400, everything else a 500.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error("[Error]", err.message);
  if (err.type === "entity.too.large" || err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ ok: false, error: "Request too large" });
  }
  if (err instanceof SyntaxError || err.type === "entity.parse.failed") {
    return res.status(400).json({ ok: false, error: "Invalid request data" });
  }
  return res.status(500).json({ ok: false, error: "Something went wrong. Please try again." });
});

async function start() {
  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`Web app: ${url}`);
    if (process.env.OPEN_BROWSER !== "false") open(url).catch(() => { });

    if (ENABLE_WHATSAPP) {
      startWhatsApp("admin").catch((err) => {
        console.error("[Baileys] Failed to start WhatsApp:", err.message);
      });

      // Resume tenant connections that were paired before the restart.
      (async () => {
        try {
          if (!db.MONGODB_URI) return;
          const users = await db.listAllUsers();
          for (const u of users) {
            if (!u.username || u.disabled) continue;
            const T = getTenant(u.username);
            if (fs.existsSync(path.join(T.authFolder, "creds.json"))) {
              console.log(`[Baileys/${u.username}] Resuming saved tenant session`);
              startWhatsApp(u.username).catch((e) => console.error(`[Baileys/${u.username}] Resume error:`, e.message));
            }
          }
        } catch (err) {
          console.error("[Baileys] Tenant resume scan failed:", err.message);
        }
      })();

      // ⏰ Background task: Check for contacts inactive > 20 mins every 2 minutes
      setInterval(() => {
        if (db.MONGODB_URI) {
          db.resetInactiveContacts(20).catch(() => {});
        }
      }, 2 * 60 * 1000);

      // Phase 1: daily DB backup (in-app scheduler — checks hourly,
      // backs up at most once per 24h, keeps the newest 7 archives).
      // A backup is a whole-DB dump, so its completion is reported
      // to the admin room only, never to tenants.
      if (db.MONGODB_URI) {
        backup.startBackupScheduler({
          getLastBackupAt: async () => {
            try {
              const d = await db.getDb();
              const doc = await d.collection("settings").findOne({ key: "lastBackupAt" });
              return doc?.value || 0;
            } catch { return 0; }
          },
          setLastBackupAt: async (ts) => {
            try {
              const d = await db.getDb();
              await d.collection("settings").updateOne(
                { key: "lastBackupAt" },
                { $set: { value: ts, updatedAt: new Date() } },
                { upsert: true }
              );
            } catch {}
          },
          run: async () => {
            const d = await db.getDb();
            return backup.runBackup({ db: d });
          },
          onEvent: (ev) => {
            console.log(`[Backup] ${ev.ok ? "done" : "FAILED"}:`, ev.path || ev.error);
            alerts.createAlert({
              owner: "admin",
              type: ev.ok ? "backup_done" : "backup_failed",
              title: ev.ok ? "Daily backup completed" : "Daily backup failed",
              detail: ev.ok ? `${ev.manifest?.totalDocs ?? 0} documents → ${ev.path}` : String(ev.error || "unknown error"),
            }).catch(() => {});
          },
        });
      }
    } else {
      console.log("WhatsApp client disabled (ENABLE_WHATSAPP=false)");
    }

    // Keep-alive mechanism (prevents serv00/Render from sleeping)
    if (KEEP_ALIVE_ENABLED) {
      console.log(`Keep-alive enabled: Pinging every ${KEEP_ALIVE_INTERVAL / 1000 / 60} minutes`);

      const pingHealth = () => {
        try {
          const pingUrl = new URL("/health", APP_URL);
          const options = {
            hostname: pingUrl.hostname,
            port: pingUrl.port || (pingUrl.protocol === "https:" ? 443 : 80),
            path: pingUrl.pathname,
            method: "GET",
            headers: { "User-Agent": "Keep-Alive-Agent" },
          };

          const protocol = pingUrl.protocol === "https:" ? require("https") : http;

          const req = protocol.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
              if (res.statusCode === 200) {
                try {
                  const jsonData = JSON.parse(data);
                  console.log(`[Keep-Alive] Ping successful at ${jsonData.timestamp || new Date().toISOString()}`);
                } catch {
                  console.log(`[Keep-Alive] Ping successful (status: ${res.statusCode})`);
                }
              } else {
                console.log(`[Keep-Alive] Ping failed: ${res.statusCode}`);
              }
            });
          });

          req.on("error", (error) => { console.error(`[Keep-Alive] Error: ${error.message}`); });
          req.setTimeout(10000, () => { req.destroy(); console.error("[Keep-Alive] Request timeout"); });
          req.end();
        } catch (error) {
          console.error(`[Keep-Alive] Error: ${error.message}`);
        }
      };

      pingHealth();
      setInterval(pingHealth, KEEP_ALIVE_INTERVAL);
      console.log(`[Keep-Alive] Will ping ${APP_URL}/health every ${KEEP_ALIVE_INTERVAL / 1000 / 60} minutes`);
    } else {
      console.log("[Keep-Alive] Disabled");
    }
  });
}

// ── Phase 2: Reminder delivery (every 60 seconds, mirrors the drip engine) ──
// A reminder is sent by its owner's own WhatsApp connection to the
// contact who asked for it, then marked sent so it never repeats.
// If the owner's socket is down, the reminder simply waits for the
// next tick after reconnect — it is never dropped.
setInterval(async () => {
  if (!db.MONGODB_URI) return;
  try {
    const deps = agentTools.defaultDeps();
    const due = await deps.listDueReminders();
    for (const r of due) {
      try {
        const T = getTenant(r.owner);
        if (!T.isReady || !T.sock) continue;
        const ticket = await directControl.ticket(directKey(r.owner, r.jid));
        if (!directControl.allowed(ticket)) continue;
        await T.sock.sendMessage(r.jid, { text: `⏰ Reminder: ${r.text}` });
        await db.saveChatMessage(r.jid, "assistant", `[Reminder]: ${r.text}`, r.owner);
        await deps.markReminderSent(r._id);
        console.log(`[Reminder/${r.owner}] ✓ Sent to ${r.jid}`);
      } catch (err) {
        console.error(`[Reminder] Failed for ${r.jid}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[Reminder] Delivery scan error:", err.message);
  }
}, 60 * 1000);

// ── Automated Drip Sequence Engine (Runs every 10 minutes) ───────────────────
setInterval(async () => {
  if (!db.MONGODB_URI) return;
  for (const T of tenants.values()) {
    if (!T.isReady || !T.sock) continue;
    const owner = T.owner;
    try {
      const rules = await db.listDripRules(owner);
      const activeRules = rules.filter((r) => r.enabled !== false);
      for (const rule of activeRules) {
        const dueContacts = await db.getContactsDueForDrip(rule.inactivityHours, rule.targetStage, owner);
        for (const contact of dueContacts) {
          try {
            const dripTicket = await directControl.ticket(directKey(owner, contact.jid));
            if (contact.mode === "off" || !directControl.allowed(dripTicket)) continue;
            await simulateTyping(T.sock, contact.jid, rule.message.length);
            if (!directControl.allowed(dripTicket)) continue;
            await T.sock.sendMessage(contact.jid, { text: rule.message });
            await db.saveChatMessage(contact.jid, "assistant", `[Drip Sequence]: ${rule.message}`, owner);
            await db.markContactDripSent(contact.jid, owner);
            console.log(`[Drip Engine/${owner}] ✓ Sent follow-up "${rule.name}" to ${contact.jid}`);
          } catch (err) {
            console.error(`[Drip Engine/${owner}] Failed to send to ${contact.jid}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.error(`[Drip Engine/${owner}] Error:`, err.message);
    }
  }
}, 10 * 60 * 1000);

// ── Graceful shutdown ────────────────────────────────────────────────────────
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Shutdown] ${signal} received, closing server...`);
  for (const T of tenants.values()) {
    try { if (T.sock) T.sock.end(undefined); } catch {}
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (err) => console.error("[Process] Unhandled rejection:", err));
process.on("uncaughtException", (err) => { console.error("[Process] Uncaught exception:", err); shutdown("uncaughtException"); });

start().catch((err) => {
  console.error("Startup error:", err);
  process.exit(1);
});
