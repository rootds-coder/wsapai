/**
 * Anti-Scraping, Bot Defense & Reverse-Engineering Guard
 * Protects against automated scrapers, headless bots, and unauthorized network harvesting.
 */

// Known automated scrapers, headless browsers, and crawler user agents
const BOT_USER_AGENTS = [
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /webdriver/i,
  /python-requests/i,
  /python-urllib/i,
  /aiohttp/i,
  /scrapy/i,
  /curl\//i,
  /wget\//i,
  /libwww-perl/i,
  /postmanruntime/i,
  /insomnia/i,
  /httpclient/i,
  /java\//i,
  /go-http-client/i,
  /node-fetch/i,
  /axios\//i,
];

// Burst rate tracking per IP for anti-scraping
const ipHitTracker = new Map();
const BLACKLISTED_IPS = new Set();

/**
 * Express middleware to block scrapers, bots, and network-tab extractors
 */
function antiScrapeMiddleware(req, res, next) {
  const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const userAgent = req.headers["user-agent"] || "";

  // 1. Blacklist check
  if (BLACKLISTED_IPS.has(ip)) {
    return res.status(403).json({ error: "Access denied by security shield." });
  }

  // 2. Honeypot check (if bot hits hidden crawler traps)
  if (req.path.includes("/wp-admin") || req.path.includes("/.env") || req.path.includes("/api/crawler-trap")) {
    // NOTE (hardening fix): no permanent in-memory IP blacklist — it locked
    // out every user behind a shared NAT after one trap hit, forever.
    console.warn(`[AntiScrape] Honeypot trap hit by ${ip}: ${req.path}`);
    return res.status(403).send("Forbidden");
  }

  // 3. (Removed) User-Agent bot blocking: it broke legitimate API clients,
  //    health checks and monitoring, and UA strings are trivially spoofed.
  //    Real protection is auth + express-rate-limit, which are already in place.

  // 4. Rate-Limiting Burst Protection for data endpoints
  const now = Date.now();
  const hits = ipHitTracker.get(ip) || [];
  const recentHits = hits.filter((t) => now - t < 5000); // within 5 seconds
  recentHits.push(now);
  ipHitTracker.set(ip, recentHits);

  // If hitting API faster than 40 requests in 5 seconds (rapid bulk data scraping)
  if (recentHits.length > 40 && req.path.startsWith("/api/")) {
    console.warn(`[AntiScrape] ⚠️ IP ${ip} rate-limited for rapid data scraping.`);
    return res.status(429).json({ error: "Too many requests. Bulk scraping detected." });
  }

  // 5. Anti-Reverse Engineering Security Headers
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  next();
}

module.exports = {
  antiScrapeMiddleware,
  BLACKLISTED_IPS,
};
