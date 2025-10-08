// routes/lib/notify.js
// -----------------------------------------------------------------------------
// Idempotent notification enqueue helper for notifications_queue (SQLite)
// -----------------------------------------------------------------------------

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Resolve database path (same as main app)
const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(process.cwd(), "data/dev/wattsun.dev.db");

const db = new sqlite3.Database(DB_PATH);

// -----------------------------------------------------------------------------
// Basic promise helpers
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// Cache notification table columns (avoid repeated PRAGMA calls)
// -----------------------------------------------------------------------------
let _notifCols = null;
async function notifCols() {
  if (_notifCols) return _notifCols;
  const rows = await all(`PRAGMA table_info(notifications_queue);`);
  _notifCols = rows.map((c) => c.name);
  return _notifCols;
}

// -----------------------------------------------------------------------------
// Compute stable dedupe key
// -----------------------------------------------------------------------------
function computeDedupeKey(kind, userId, payload, explicit) {
  if (explicit) return explicit;
  const obj =
    typeof payload === "string" ? JSON.parse(payload || "{}") : payload || {};
  const specific =
  obj.withdrawalId ??
  (obj.accountId !== undefined && obj.accountId !== null ? obj.accountId : "") ??
  obj.refId ??
  "";

  return `${kind}:${userId ?? ""}:${specific}`;
}

// -----------------------------------------------------------------------------
// Main enqueue helper
// -----------------------------------------------------------------------------
/**
 * Enqueue a notification in an idempotent way (safe on double-submit).
 * Table: notifications_queue
 *
 * @param {string} kind - e.g. 'withdrawal_approved', 'withdrawal_paid', 'penalty'
 * @param {object} options
 * @param {number} options.userId
 * @param {string} [options.email]
 * @param {object|string} [options.payload]
 * @param {number} [options.accountId]
 * @param {string} [options.dedupeKey]
 * @returns {Promise<{success:boolean,queued:boolean,noOp:boolean,dedupeKey:string,id?:number}>}
 */
async function enqueue(kind, options = {}) {
  const {
    userId = null,
    email = null,
    payload = {},
    dedupeKey,
    accountId = null,
  } = options;

    // ---------------------------------------------------------------------------
  // Normalize payload to ensure accountId always present for dedupe computation
  // ---------------------------------------------------------------------------
  let payloadObj =
    typeof payload === "string" ? JSON.parse(payload || "{}") : { ...payload };

  // 🩹 Deduplication fix: coerce accountId into numeric + bake into payload
  const normalizedAccountId = Number(accountId ?? payloadObj.accountId ?? 0) || null;
  if (normalizedAccountId && !payloadObj.accountId)
    payloadObj.accountId = normalizedAccountId;

  const json = JSON.stringify(payloadObj || {});
  const cols = await notifCols();
  const hasDedupe = cols.includes("dedupe_key");

// 🧩 Ensure dedupe key uses numeric accountId explicitly
const key = computeDedupeKey(
  kind,
  userId,
  { ...payloadObj, accountId: normalizedAccountId ?? 0 },
  dedupeKey
);

  // ---------------------------------------------------------------------------
  // Fast-path dedupe guard (modern schema)
  // ---------------------------------------------------------------------------
  if (hasDedupe) {
    const exists = await get(
      `SELECT 1 FROM notifications_queue WHERE dedupe_key = ? LIMIT 1`,
      [key]
    );
    if (exists) {
      return { success: true, queued: false, noOp: true, dedupeKey: key };
    }
  } else {
    // -------------------------------------------------------------------------
    // Legacy fallback: dedupe without dedupe_key column
    // -------------------------------------------------------------------------
    try {
      const probeId =
        payloadObj.withdrawalId ?? payloadObj.accountId ?? payloadObj.refId ?? null;
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
      // ignore fallback parse errors
    }
  }

  // ---------------------------------------------------------------------------
  // Build INSERT dynamically to support both old/new schemas
  // ---------------------------------------------------------------------------
  const fields = ["kind", "user_id", "email", "payload", "status"];
  const values = [String(kind), userId ?? null, email ?? null, json, "Queued"];

  if (cols.includes("account_id")) {
    fields.push("account_id");
    values.push(payloadObj.accountId ?? null);
  }

  if (hasDedupe) {
    fields.push("dedupe_key");
    values.push(key);
  }

  const placeholders = fields.map(() => "?").join(",");
  const sql = `INSERT INTO notifications_queue (${fields.join(
    ","
  )}) VALUES (${placeholders})`;

  const result = await run(sql, values);

  return {
    success: true,
    queued: true,
    noOp: false,
    dedupeKey: key,
    id: result.lastID,
  };
}

module.exports = { enqueue };
