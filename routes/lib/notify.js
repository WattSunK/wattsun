// routes/lib/notify.js
// Idempotent notification enqueue helper for notifications_queue (SQLite)

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Resolve DB path (parity with app)
const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(process.cwd(), "data/dev/wattsun.dev.db");

const db = new sqlite3.Database(DB_PATH);

// --- tiny promise helpers
const get = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)))
  );

const all = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])))
  );

const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    })
  );

// cache notification table shape after first check
let _notifCols = null;
async function notifCols() {
  if (_notifCols) return _notifCols;
  const rows = await all(`PRAGMA table_info(notifications_queue);`);
  _notifCols = rows.map((c) => c.name);
  return _notifCols;
}

/**
 * Compute a stable dedupe key. Prefer explicit; otherwise use the
 * most specific ID present in payload (withdrawalId, accountId, refId).
 */
function computeDedupeKey(kind, userId, payload, explicit) {
  if (explicit) return explicit;
  const obj =
    typeof payload === "string" ? JSON.parse(payload || "{}") : payload || {};
  const specific = obj.withdrawalId ?? obj.accountId ?? obj.refId ?? "";
  return `${kind}:${userId ?? ""}:${specific}`;
}

/**
 * Enqueue a notification in an idempotent way (safe on double-submit).
 * Table is the legacy shape: (id, kind, user_id, email, payload, status, created_at, sent_at, error, account_id[, dedupe_key])
 *
 * @param {string} kind - e.g. 'withdrawal_approved', 'withdrawal_paid', 'account_created'
 * @param {object} opts
 * @param {number} opts.userId
 * @param {string} opts.email
 * @param {object|string} opts.payload - JSON object or JSON string
 * @param {string} [opts.dedupeKey] - optional explicit dedupe key
 * @returns {Promise<{success:boolean, queued:boolean, noOp:boolean, dedupeKey:string, id?:number}>}
 */
async function enqueue(kind, { userId = null, email = null, payload = {}, dedupeKey } = {}) {
  const json = typeof payload === "string" ? payload : JSON.stringify(payload || {});
  const cols = await notifCols();
  const hasDedupe = cols.includes("dedupe_key");

  const key = computeDedupeKey(kind, userId, json, dedupeKey);

  // --- Primary guard (fast path): dedupe_key unique check
  if (hasDedupe) {
    const exists = await get(
      `SELECT 1 FROM notifications_queue WHERE dedupe_key = ? LIMIT 1`,
      [key]
    );
    if (exists) {
      return { success: true, queued: false, noOp: true, dedupeKey: key };
    }
  } else {
    // --- Fallback guard if migration hasn't added dedupe_key yet
    // Best-effort probe using kind + user + (withdrawalId|accountId|refId)
    try {
      const obj = JSON.parse(json || "{}");
      const probeId = obj.withdrawalId ?? obj.accountId ?? obj.refId ?? null;
      if (probeId != null) {
        const exists = await get(
          `
          SELECT 1
          FROM notifications_queue
          WHERE kind = ?
            AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))
            AND (
              json_extract(payload,'$.withdrawalId') = ?
              OR json_extract(payload,'$.accountId') = ?
              OR json_extract(payload,'$.refId') = ?
            )
          LIMIT 1
        `,
          [String(kind), userId ?? null, userId ?? null, probeId, probeId, probeId]
        );
        if (exists) {
          return { success: true, queued: false, noOp: true, dedupeKey: key };
        }
      }
    } catch {
      // ignore; we'll still insert below
    }
  }

  // Build insert dynamically to include account_id/dedupe_key only if columns exist
  const fields = ["kind", "user_id", "email", "payload", "status"];
  const values = [String(kind), userId ?? null, email ?? null, json, "Queued"];

  if (cols.includes("account_id")) {
    try {
      const obj = JSON.parse(json || "{}");
      fields.push("account_id");
      values.push(obj.accountId ?? null);
    } catch {
      fields.push("account_id");
      values.push(null);
    }
  }

  if (hasDedupe) {
    fields.push("dedupe_key");
    values.push(key);
  }

  const qmarks = fields.map(() => "?").join(",");
  const sql = `INSERT INTO notifications_queue (${fields.join(",")}) VALUES (${qmarks})`;

  const result = await run(sql, values);
  return { success: true, queued: true, noOp: false, dedupeKey: key, id: result.lastID };
}

module.exports = { enqueue };
