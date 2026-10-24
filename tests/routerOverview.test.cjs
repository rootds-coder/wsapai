// Router Network Overview (2026-10-24): the Providers tab's default
// view is a port of the Gemini HTML Dhruv supplied — same KPI strip,
// topology (provider cards → spinning core → endpoint), animated
// canvas fiber lines, and 4-column visualization — but ONLY with
// real data. Gemini's file was a static demo with hardcoded numbers,
// a random req/s ticker, random modal latencies, a fake domain and
// a fake Bearer key; none of those may ship here.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(root, "index.js"), "utf8");
const networkSrc = fs.readFileSync(path.join(root, "client", "src", "components", "dashboard", "RouterNetwork.jsx"), "utf8");
const panelSrc = fs.readFileSync(path.join(root, "client", "src", "components", "dashboard", "ProvidersPanel.jsx"), "utf8");

test("stats endpoint feeds the overview: configured providers, daily series, uptime", () => {
  assert.match(indexSrc, /dailySeries/);
  assert.match(indexSrc, /serverUptimeSec: Math\.floor\(process\.uptime\(\)\)/);
  assert.match(indexSrc, /Configured providers with zero usage yet must still appear/);
  assert.match(indexSrc, /configuredCount:/);
});

test("unified endpoint exists, is session-authenticated, routes through the provider engine", () => {
  assert.match(indexSrc, /app\.post\("\/v1\/chat\/completions", requireAuth/);
  assert.match(indexSrc, /aiProviders\.chatCompletion\(\{ userId: req\.userId, messages/);
  assert.match(indexSrc, /object: "chat\.completion"/);
  assert.doesNotMatch(indexSrc, /\/v1\/chat\/completions[\s\S]{0,800}getApiKey\(\)/);
});

test("network overview is the Gemini design, animated — not the old static cards", () => {
  for (const marker of ["network-canvas", "sr-spin-slow", "sr-spin-rev", "sr-pulse-glow", "CORE ROUTE", "UNIFIED AI ENDPOINT", "Intelligent Routing Visualization", "Routing Distribution", "Provider Health Status", "Routing Timeline", "requestAnimationFrame"]) {
    assert.ok(networkSrc.includes(marker), `missing Gemini-design element: ${marker}`);
  }
  // The canvas lines are drawn from live DOM positions, not a static image.
  assert.match(networkSrc, /querySelectorAll\('\.sr-provider-card'\)/);
  assert.match(networkSrc, /bezierCurveTo/);
});

test("network overview never ships the Gemini demo's fake data", () => {
  for (const fake of ["4.82M", "99.98%", "28,492", "12.5M", "92.4 req/s", "api.smart-router.ai", "Bearer sk-smart-ai", "420K / 1M", "1,284 reqs"]) {
    assert.ok(!networkSrc.includes(fake), `network overview must not contain demo fake: ${fake}`);
  }
  // No random ticker or random latency anywhere.
  assert.doesNotMatch(networkSrc, /Math\.random\(\) \* 8\)\.toFixed\(1\)/);
  assert.doesNotMatch(networkSrc, /Math\.floor\(Math\.random\(\) \* 150\)/);
  // Instead it labels real sources and the honest endpoint auth.
  assert.match(networkSrc, /provider-reported/);
  assert.match(networkSrc, /Dashboard-session authenticated/);
});

test("network overview buttons make real calls, not demo toasts", () => {
  assert.match(networkSrc, /fetch\('\/v1\/chat\/completions'/);
  // Test Key lives in the merged manager (ProvidersPanel) and is
  // wired into the overview as a button, not a modal-only action.
  assert.match(panelSrc, /fetch\('\/api\/ai-providers\/test'/);
  assert.match(networkSrc, /onClick=\{onTestProvider\}/);
  assert.match(networkSrc, /window\.location\.origin/);
});

test("frontend is served from root dist first, never a stale client/dist (2026-10-24 regression)", () => {
  // The deploy rsync excludes client/dist, so client/dist goes stale
  // while root dist (postbuild copy target) stays current. If the
  // server preferred client/dist again, every deploy would silently
  // ship nothing. Root dist must be the first staticDir branch.
  assert.match(indexSrc, /if \(fs\.existsSync\(path\.join\(rootDistDir, "index\.html"\)\)\) \{\s*staticDir = rootDistDir;/);
});

test("providers tab is a single overview: no separate AI Providers view, no model picker", () => {
  assert.match(panelSrc, /import RouterNetwork from '\.\/RouterNetwork'/);
  assert.doesNotMatch(panelSrc, /useState\('overview'\)/);
  assert.doesNotMatch(panelSrc, /setView/);
  assert.doesNotMatch(panelSrc, /provModel/);
  // Saving always uses Auto — the engine resolves the model.
  assert.match(panelSrc, /model: ''/);
  // The merged manager lives in the overview: tap, paste, save.
  assert.match(networkSrc, /id="sr-provider-manager"/);
  assert.match(networkSrc, /Save Provider/);
  assert.match(networkSrc, /Paste your API key here/);
  // Exactly one <select> in the overview: routing mode. No model dropdown.
  assert.strictEqual((networkSrc.match(/<select/g) || []).length, 1);
});

test("every saved key reads as active in the pool; primary means first try only", () => {
  // The old UI used "Active" for the single preferred provider, which
  // read as if the other saved providers were off. The pool is all
  // configured providers; routingOrder[0] is just the first try.
  assert.match(networkSrc, /primaryId = stats\?\.routingOrder\?\.\[0\]/);
  assert.match(networkSrc, /✓ Active\$\{primaryId === pr\.id \? ' ★ Primary' : ''\}/);
  assert.match(networkSrc, /In pool — fallback ready/);
  assert.match(networkSrc, /Primary — first try/);
  assert.match(networkSrc, /All saved keys are active in the one endpoint/);
  assert.doesNotMatch(networkSrc, /Set active/);
  assert.doesNotMatch(networkSrc, /● Active/);
});

test("visualization is live: server routing order, all 9 roles, real counts", () => {
  assert.match(indexSrc, /routingOrder: aiProviders\.orderByMode\(aiProviders\.orderedCandidates\(store\)/);
  assert.match(networkSrc, /stats\?\.routingOrder/);
  assert.match(networkSrc, /Last 7 days:/);
  assert.match(networkSrc, /requests · .* failures \(all time/);
  assert.match(networkSrc, /Routing Timeline <span[^>]*>· \{\(stats\?\.routeLog/);
  // No fixed role list slicing the providers down to 6.
  assert.doesNotMatch(networkSrc, /slice\(0, 6\)/);
  // No stale contradictory mode note.
  assert.doesNotMatch(networkSrc, /in manual mode the active provider is primary/);
});
