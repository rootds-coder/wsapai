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
const { Server } = require("socket.io");
const qrcode = require("qrcode");
const puppeteer = require("puppeteer");
const { Client, LocalAuth, RemoteAuth } = require("whatsapp-web.js");
const { MongoStore: WwebjsMongoStore } = require("wwebjs-mongo");
const mongoose = require("mongoose");
const { getReplyAsDhruv, setRuntimeApiKey, getApiKey } = require("./gpt");
const db = require("./db");

const API_KEY_COOKIE = "dhruv_api_key";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // 1 year

// Security: Admin password from environment (required for API access)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-password-in-production";
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret-in-production-" + Math.random().toString(36);
const MONGODB_URI = process.env.MONGODB_URI || null;

const PORT = process.env.PORT || 3000;
const ENABLE_WHATSAPP = process.env.ENABLE_WHATSAPP !== "false";

// Keep-alive settings for Render free tier
const KEEP_ALIVE_ENABLED = process.env.KEEP_ALIVE_ENABLED !== "false"; // Enabled by default
const KEEP_ALIVE_INTERVAL = parseInt(process.env.KEEP_ALIVE_INTERVAL || "840000", 10); // 14 minutes default (840000ms)
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// Multer: memory storage (file content saved to MongoDB, not disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === "text/plain" || (file.originalname && file.originalname.toLowerCase().endsWith(".txt"));
    cb(ok ? null : new Error("Only .txt files allowed"), ok);
  },
});

const app = express();

// Behind Render's reverse proxy, trust X-Forwarded-* headers
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGIN || "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit uploads to 10 per 15 minutes
  message: "Too many upload requests, please try again later.",
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit auth attempts to 5 per 15 minutes
  message: "Too many authentication attempts, please try again later.",
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Security: Session management (Mongo-backed in production / Render)
const sessionConfig = {
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production", // HTTPS only in production
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
      ttl: 24 * 60 * 60, // seconds
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

app.use(session(sessionConfig));

// Security: Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ ok: false, error: "Authentication required" });
};

// Security: Input validation helper
const validateInput = (input, type = "string", maxLength = 1000) => {
  if (!input || typeof input !== type) return false;
  if (type === "string" && input.length > maxLength) return false;
  if (type === "string" && /[<>\"'`]/.test(input)) return false; // XSS protection
  return true;
};

app.use((req, res, next) => {
  if (req.cookies && req.cookies[API_KEY_COOKIE] && !getApiKey()) {
    setRuntimeApiKey(req.cookies[API_KEY_COOKIE]);
  }
  next();
});
const clientDist = path.join(__dirname, "client", "dist");
const publicDir = path.join(__dirname, "public");
const staticDir = fs.existsSync(clientDist) ? clientDist : publicDir;
app.use(express.static(staticDir));

app.get("/", (req, res) => {
  const indexPath = fs.existsSync(clientDist)
    ? path.join(clientDist, "index.html")
    : path.join(publicDir, "index.html");
  res.sendFile(indexPath);
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

// Security: Authentication endpoint
app.post("/api/auth/login", authLimiter, (req, res) => {
  const password = req.body && req.body.password;
  if (!password || typeof password !== "string") {
    return res.status(400).json({ ok: false, error: "Password is required" });
  }
  
  // Trim and compare passwords
  const trimmedPassword = password.trim();
  const trimmedAdminPassword = String(ADMIN_PASSWORD || "").trim();
  
  // Debug logging (remove in production)
  if (process.env.NODE_ENV !== "production") {
    console.log("Login attempt - Password length:", trimmedPassword.length, "Admin password length:", trimmedAdminPassword.length);
  }
  
  if (trimmedPassword === trimmedAdminPassword && trimmedAdminPassword.length > 0) {
    req.session.authenticated = true;
    console.log("[Mongo] login success → session will be saved to MongoDB");
    return res.json({ ok: true, message: "Authentication successful" });
  } else {
    if (process.env.NODE_ENV !== "production") {
      console.log("Login attempt failed - password mismatch");
    }
    return res.status(401).json({ ok: false, error: "Invalid password" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy();
  res.json({ ok: true, message: "Logged out successfully" });
});

app.get("/api/auth/status", (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

// Protected API endpoints (authentication optional for config/chats/upload to simplify hosting)
app.get("/api/config", apiLimiter, async (req, res) => {
  let hasChats = false;
  let hasClosestPerson = false;
  try {
    if (db.MONGODB_URI) {
      hasChats = await db.hasChats();
      hasClosestPerson = await db.hasClosestPerson();
    }
  } catch (err) {
    console.error("Config Mongo error:", err.message);
  }
  res.json({ hasApiKey: !!getApiKey(), hasChats, hasClosestPerson });
});

app.post("/api/clear-key", requireAuth, apiLimiter, (req, res) => {
  setRuntimeApiKey(null);
  res.clearCookie(API_KEY_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.json({ ok: true });
});

app.post("/api/set-key", requireAuth, apiLimiter, (req, res) => {
  const key = req.body && req.body.apiKey;
  if (!validateInput(key, "string", 200)) {
    return res.status(400).json({ ok: false, error: "Valid API key is required" });
  }
  const trimmed = key.trim();
  if (trimmed.length < 10) {
    return res.status(400).json({ ok: false, error: "API key seems invalid" });
  }
  setRuntimeApiKey(trimmed);
  res.cookie(API_KEY_COOKIE, trimmed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  res.json({ ok: true });
});

app.get("/api/chats", apiLimiter, async (req, res) => {
  try {
    if (!db.MONGODB_URI) {
      return res.json({ files: [] });
    }
    const files = await db.listChats();
    res.json({ files });
  } catch (err) {
    console.error("Error reading chats:", err);
    res.status(500).json({ ok: false, error: "Failed to read chat files" });
  }
});

app.post("/api/upload-chat", uploadLimiter, upload.single("chat"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "No file uploaded. Choose a .txt chat export." });
  }
  if (!db.MONGODB_URI) {
    return res.status(503).json({ ok: false, error: "MongoDB not configured. Set MONGODB_URI." });
  }
  if (!req.file.mimetype || !req.file.mimetype.includes("text/plain")) {
    return res.status(400).json({ ok: false, error: "Only .txt files are allowed" });
  }
  if (req.file.size > 10 * 1024 * 1024) {
    return res.status(400).json({ ok: false, error: "File too large (max 10MB)" });
  }
  let filename = (req.file.originalname || `chat-${Date.now()}.txt`).replace(/[^a-zA-Z0-9._-]/g, "_") || "chat.txt";
  if (!filename.toLowerCase().endsWith(".txt")) filename += ".txt";
  if (!/^[a-zA-Z0-9._-]+\.txt$/.test(filename)) {
    return res.status(400).json({ ok: false, error: "Invalid filename" });
  }
  const asClosest = req.body && (req.body.asClosest === "true" || req.body.asClosest === true);
  if (asClosest) filename = "closest-person.txt";
  const content = (req.file.buffer || Buffer.from("")).toString("utf8");
  try {
    await db.insertChat(filename, content, asClosest);
  } catch (err) {
    console.error("Upload chat Mongo error:", err);
    return res.status(500).json({ ok: false, error: "Failed to save chat to database." });
  }
  res.json({
    ok: true,
    filename,
    asClosest: !!asClosest,
    message: asClosest
      ? "Chat saved as your closest-person reference. Replies will match this style most closely."
      : "Chat uploaded. It will be used as additional style reference.",
  });
});

let waClient = null;
let isReady = false;

io.on("connection", (socket) => {
  if (isReady) socket.emit("ready");
});

function setupWhatsAppClient(client) {
  client.on("qr", async (qr) => {
    try {
      const dataUrl = await qrcode.toDataURL(qr, { margin: 2, width: 280 });
      io.emit("qr", { dataUrl });
    } catch (err) {
      console.error("QR to image error:", err.message);
    }
  });
  client.on("ready", () => {
    isReady = true;
    io.emit("ready");
  });
  client.on("message", async (msg) => {
  const text = (msg.body || "").trim();

  let fromName = msg.from;
  try {
    const contact = await msg.getContact();
    fromName = contact.name || contact.pushname || contact.shortName || msg.from;
  } catch (_) { }

  const payload = {
    id: (msg.id && msg.id._serialized) ? msg.id._serialized : `${msg.from}-${Date.now()}`,
    from: msg.from,
    fromName: fromName || msg.from,
    body: msg.body || "",
    timestamp: msg.timestamp,
    hasMedia: msg.hasMedia,
  };

  io.emit("message", payload);

  // Never reply to status updates (replies would go to status)
  if (msg.isStatus) return;

  // Only reply in personal (direct) chats, not in groups or status
  let isPrivate = false;
  try {
    const chat = await msg.getChat();
    const chatId = (chat.id && chat.id._serialized) ? chat.id._serialized : String(chat.id || "");
    const isStatusChat = /status@broadcast|@\w*broadcast\b/.test(chatId);
    isPrivate = !chat.isGroup && !isStatusChat;
  } catch (_) { }
  if (!isPrivate) return;

  if (!text) return;

  if (!getApiKey()) {
    await msg.reply("Bot is not configured: add your OpenAI API key in the web app first.");
    return;
  }

  try {
    const reply = await getReplyAsDhruv(text);
    await msg.reply(reply || "👍");
  } catch (err) {
    console.error("Dhruv Chauhan reply error:", err.message);
    await msg.reply("Something went wrong, try again in a bit.");
  }
  });
}

async function start() {
  if (ENABLE_WHATSAPP) {
    const puppeteerOpts = {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    };
    if (MONGODB_URI) {
      try {
        await mongoose.connect(MONGODB_URI);
        console.log("[Mongo] mongoose connected for WhatsApp RemoteAuth");
        const store = new WwebjsMongoStore({ mongoose });
        waClient = new Client({
          authStrategy: new RemoteAuth({
            store,
            backupSyncIntervalMs: 300000,
          }),
          puppeteer: puppeteerOpts,
        });
        console.log("[Mongo] WhatsApp using RemoteAuth (session stored in MongoDB)");
      } catch (err) {
        console.error("[Mongo] RemoteAuth failed, falling back to LocalAuth:", err.message);
        waClient = new Client({
          authStrategy: new LocalAuth(),
          puppeteer: puppeteerOpts,
        });
      }
    } else {
      waClient = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: puppeteerOpts,
      });
    }
    setupWhatsAppClient(waClient);
  }

  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`Web app: ${url}`);
    open(url).catch(() => { });
    if (waClient) {
      waClient.initialize();
    } else {
      console.log("WhatsApp client disabled (ENABLE_WHATSAPP=false)");
    }

  // Keep-alive mechanism for Render free tier (prevents sleeping)
  if (KEEP_ALIVE_ENABLED) {
    console.log(`Keep-alive enabled: Pinging every ${KEEP_ALIVE_INTERVAL / 1000 / 60} minutes`);
    
    // Function to ping the health endpoint
    const pingHealth = () => {
      try {
        const url = new URL('/health', APP_URL);
        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'GET',
          headers: {
            'User-Agent': 'Keep-Alive-Agent',
          },
        };

        const protocol = url.protocol === 'https:' ? require('https') : http;
        
        const req = protocol.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
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

        req.on('error', (error) => {
          console.error(`[Keep-Alive] Error: ${error.message}`);
        });

        req.setTimeout(10000, () => {
          req.destroy();
          console.error(`[Keep-Alive] Request timeout`);
        });

        req.end();
      } catch (error) {
        console.error(`[Keep-Alive] Error: ${error.message}`);
      }
    };

    // Ping immediately on startup
    pingHealth();

    // Set up interval to ping every KEEP_ALIVE_INTERVAL milliseconds
    setInterval(pingHealth, KEEP_ALIVE_INTERVAL);
    
    console.log(`[Keep-Alive] Will ping ${APP_URL}/health every ${KEEP_ALIVE_INTERVAL / 1000 / 60} minutes`);
  } else {
    console.log('[Keep-Alive] Disabled');
  }
  });
}

start().catch((err) => {
  console.error("Startup error:", err);
  process.exit(1);
});
