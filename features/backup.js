/**
 * Phase 1 — Daily database backup.
 *
 * The whole product lives in one Mongo database with no backup
 * until now. runBackup() dumps every collection (except the
 * session store) to JSON, writes a manifest, and compresses the
 * result with `tar` when available. What is deliberately NOT in a
 * backup: .env secrets, Baileys auth files, and session cookies —
 * those are not in Mongo and must never be copied into an archive.
 * Provider keys inside settings are AES-256-GCM encrypted at rest
 * (enc:v1:), so a backup file is no weaker than the database.
 *
 * The scheduler runs inside the app (serv00 cron is panel-managed
 * and easy to lose on a move): it checks hourly and backs up at
 * most once per 24h, keeping the newest KEEP_BACKUPS archives.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const KEEP_BACKUPS = 7;
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const EXCLUDED_COLLECTIONS = new Set(["sessions"]);

function backupDir() {
  return process.env.BACKUP_DIR || path.join(os.homedir(), "devil-ai-backups");
}

function stampFor(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/** Pure-ish: which archive files to delete, keeping the newest `keep`. */
function filesToPrune(filenames, keep = KEEP_BACKUPS) {
  const archives = filenames.filter((f) => /^backup-.*\.(tar\.gz|json)$/.test(f) || /^backup-/.test(f)).sort();
  if (archives.length <= keep) return [];
  return archives.slice(0, archives.length - keep);
}

function pruneBackups(dir, keep = KEEP_BACKUPS) {
  try {
    if (!fs.existsSync(dir)) return [];
    const doomed = filesToPrune(fs.readdirSync(dir), keep);
    for (const f of doomed) {
      try {
        fs.rmSync(path.join(dir, f), { recursive: true, force: true });
      } catch {}
    }
    return doomed;
  } catch (err) {
    console.error("[Backup] prune error:", err.message);
    return [];
  }
}

async function runBackup({ db, dir = backupDir() } = {}) {
  if (!db) throw new Error("runBackup requires a connected db handle");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = stampFor();
  const folder = path.join(dir, `backup-${stamp}`);
  fs.mkdirSync(folder, { recursive: true });
  const manifest = { createdAt: new Date().toISOString(), collections: {}, totalDocs: 0 };
  const names = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => !EXCLUDED_COLLECTIONS.has(n));
  for (const name of names) {
    const docs = await db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(folder, `${name}.json`), JSON.stringify(docs, null, 1));
    manifest.collections[name] = docs.length;
    manifest.totalDocs += docs.length;
  }
  fs.writeFileSync(path.join(folder, "manifest.json"), JSON.stringify(manifest, null, 2));
  // Compress when tar exists; otherwise the folder itself is the backup.
  let archivePath = folder;
  try {
    const tarPath = path.join(dir, `backup-${stamp}.tar.gz`);
    execFileSync("tar", ["-czf", tarPath, "-C", dir, `backup-${stamp}`], { stdio: "ignore" });
    fs.rmSync(folder, { recursive: true, force: true });
    archivePath = tarPath;
  } catch {}
  pruneBackups(dir, KEEP_BACKUPS);
  return { path: archivePath, manifest };
}

/**
 * Scheduler: checks every hour, backs up at most once per 24h.
 * getLastBackupAt / setLastBackupAt are injected (settings store
 * in production) so the logic is unit-testable without Mongo.
 * Returns a stop function. Never throws out of the interval.
 */
function startBackupScheduler({ getLastBackupAt, setLastBackupAt, run, onEvent, checkMs = 60 * 60 * 1000 } = {}) {
  // Guard against overlapping runs: the boot-time check and the
  // hourly tick (or two manual triggers) must never back up twice.
  let running = false;
  async function maybeRun() {
    if (running) return { skipped: true, inFlight: true };
    running = true;
    try {
      const last = (await getLastBackupAt()) || 0;
      if (Date.now() - last < BACKUP_INTERVAL_MS) return { skipped: true };
      const result = await run();
      await setLastBackupAt(Date.now());
      if (onEvent) onEvent({ ok: true, ...result });
      return { backedUp: true, ...result };
    } catch (err) {
      console.error("[Backup] scheduled backup failed:", err.message);
      if (onEvent) onEvent({ ok: false, error: err.message });
      return { failed: true, error: err.message };
    } finally {
      running = false;
    }
  }
  // Immediate check on boot (covers restarts), then hourly.
  maybeRun().catch(() => {});
  const timer = setInterval(() => maybeRun().catch(() => {}), checkMs);
  if (timer.unref) timer.unref();
  return { stop: () => clearInterval(timer), maybeRun };
}

module.exports = {
  KEEP_BACKUPS,
  BACKUP_INTERVAL_MS,
  EXCLUDED_COLLECTIONS,
  backupDir,
  stampFor,
  filesToPrune,
  pruneBackups,
  runBackup,
  startBackupScheduler,
};
