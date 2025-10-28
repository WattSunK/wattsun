/**
 * Environment-safe loader for QA/DEV
 */
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const dotenv = require("dotenv");

// --- Always force explicit .env.qa when none loaded ---
const defaultEnv = "/volume1/web/wattsun/.env.qa";
const envPath = process.env.ENV_FILE && fs.existsSync(process.env.ENV_FILE)
  ? process.env.ENV_FILE
  : defaultEnv;

if (fs.existsSync(envPath)) {
  console.log(`[loyalty] Loading environment from ${envPath}`);
  dotenv.config({ path: envPath, override: true });
} else {
  console.warn(`[loyalty] WARNING: Environment file not found at ${envPath}`);
}

// Validate loaded DB path envs
if (process.env.SQLITE_MAIN) {
  console.log(`[loyalty] SQLITE_MAIN=${process.env.SQLITE_MAIN}`);
} else {
  console.warn("[loyalty] WARNING: SQLITE_MAIN not set — fallback to dev path will be used");
}

function parseArgs(argv) {
  let db = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--db" && argv[i + 1]) { db = argv[++i]; continue; }
    if (a.startsWith("--db=")) { db = a.split("=", 2)[1]; continue; }
  }
  return { db };
}

function resolveDbPath() {
  const { db } = parseArgs(process.argv);
  if (db) return db;
  const envKeys = [
    "SQLITE_MAIN",
    "SQLITE_DB",
    "DB_PATH_USERS",
    "WATTSUN_DB_PATH",
    "DB_PATH_ADMIN"
  ];
  for (const key of envKeys) {
    if (process.env[key]) return process.env[key];
  }
  const ROOT = process.env.ROOT ? path.resolve(process.env.ROOT) : path.resolve(__dirname, "..");
  const env = String(process.env.NODE_ENV || "").toLowerCase();
  if (env === "qa") {
    const qaCandidates = [
      path.resolve(ROOT, "data/qa/wattsun.qa.db"),
      path.resolve(ROOT, "../data/qa/wattsun.qa.db"),
      path.resolve(ROOT, "../../data/qa/wattsun.qa.db")
    ];
    for (const candidate of qaCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return qaCandidates[0];
  }
  return path.join(ROOT, "data/dev/wattsun.dev.db");
}

const DB = resolveDbPath();
console.log(`[weekly_digest] resolved_db_path = ${DB}`);
const db = new sqlite3.Database(DB);

async function detectLedgerTsColumn() {
  return new Promise((resolve) => {
    db.all("PRAGMA table_info(loyalty_ledger);", [], (err, rows) => {
      if (err) return resolve("ts");
      const hasTs = rows.some((r) => r.name === "ts");
      const hasCreatedAt = rows.some((r) => r.name === "created_at");
      resolve(hasTs ? "ts" : (hasCreatedAt ? "created_at" : "ts"));
    });
  });
}

function ensureNoteColumn(callback) {
  db.get("PRAGMA table_info(notifications_queue);", (err, row) => {
    if (err) return callback(err);
    db.all("PRAGMA table_info(notifications_queue);", (err2, rows) => {
      if (err2) return callback(err2);
      const hasNote = rows.some((r) => r.name === "note");
      if (hasNote) return callback();
      console.log("[weekly_digest] Adding 'note' column to notifications_queue...");
      db.run("ALTER TABLE notifications_queue ADD COLUMN note TEXT;", callback);
    });
  });
}

async function main() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`[weekly_digest] since = ${since}`);
  const tsCol = await detectLedgerTsColumn();

  db.all(
    `SELECT la.id AS account_id, la.user_id, u.email, la.points_balance AS balance, IFNULL(SUM(ll.points_delta), 0) AS weeklyPoints
     FROM loyalty_accounts la
     JOIN users u ON u.id = la.user_id
     LEFT JOIN loyalty_ledger ll ON ll.account_id = la.id AND ll.${tsCol} >= ?
     WHERE la.status='Active'
     GROUP BY la.id`,
    [since],
    (err, rows) => {
      if (err) {
        console.error(err);
        return db.close();
      }

      const stmt = db.prepare(`
        INSERT INTO notifications_queue (kind, user_id, email, payload, status, note)
        VALUES ('weekly_digest', ?, ?, ?, 'Queued', ?)
      `);

      const noteBase = `Weekly digest for week ending ${new Date().toISOString().slice(0, 10)}`;

      rows.forEach((r) => {
        const payload = JSON.stringify({ balance: r.balance, weeklyPoints: r.weeklyPoints });
        stmt.run(r.user_id, r.email, payload, noteBase, (err2) => {
          if (err2) console.error("[weekly_digest] Enqueue error:", err2.message);
          else console.log(`[weekly_digest] Enqueued digest for ${r.email}`);
        });
      });

      stmt.finalize(() => {
        console.log(`[weekly_digest] Enqueued: ${rows.length}`);
        db.close();
      });
    }
  );
}

ensureNoteColumn((err) => {
  if (err) {
    console.error("[weekly_digest] Error ensuring note column:", err.message);
    db.close();
  } else {
    main();
  }
});
