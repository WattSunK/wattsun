// routes/admin-dispatch.js
// v0.3 — Persist driver assignments in SQLite (idempotent), keep API shape and in‑memory cache.
// - GET  /api/admin/dispatch?ids=ORDER1,ORDER2
//     → { success:true, assignments:{ ORDER1:123, ORDER2:null } }
// - PUT  /api/admin/dispatch/:orderId  body: { driver_id: 123 | null }
//     → { success:true, orderId, driver_id }

const express = require("express");
const router = express.Router();

// [v0.3 add] SQLite persistence
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Lightweight body parsers (JSON + urlencoded)
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

/**
 * In-memory assignment store:
 *  Key: orderId (string), Value: driver_id (number|null)
 *  Persists for the life of the Node process (v0.2 behavior, kept as cache/fallback).
 */
const dispatchAssignments = Object.create(null);

// [v0.3 add] Resolve DB path (configurable; safe fallbacks)
const ROOT = process.cwd();
const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.USERS_DB_PATH ||
  process.env.SQLITE_USERS_DB ||
  process.env.SQLITE_DB ||
  path.join(ROOT, "data", "dev", "wattsun.dev.db");

// [v0.3 add] Open DB (lazy-open on module load is fine for this router)
const db = new sqlite3.Database(DB_PATH);

/**
 * [v0.3 add] ensureSchema()
 * Creates admin_order_meta if missing and adds driver_id/updated_at if absent.
 * Idempotent and safe to call per request.
 */
function ensureSchema() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS admin_order_meta (
           order_id   TEXT PRIMARY KEY,
           status     TEXT,
           driver_id  INTEGER,
           notes      TEXT,
           updated_at TEXT NOT NULL DEFAULT (datetime('now'))
         );`,
        (err) => {
          if (err) return reject(err);

          db.all(`PRAGMA table_info(admin_order_meta);`, (e2, cols) => {
            if (e2) return reject(e2);
            const names = (cols || []).map(c => c.name);
            const tasks = [];

            if (!names.includes("driver_id")) {
              tasks.push(new Promise((res, rej) => {
                db.run(`ALTER TABLE admin_order_meta ADD COLUMN driver_id INTEGER;`, (e) => e ? rej(e) : res());
              }));
            }
            if (!names.includes("updated_at")) {
              tasks.push(new Promise((res, rej) => {
                db.run(`ALTER TABLE admin_order_meta ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));`, (e) => e ? rej(e) : res());
              }));
            }

            Promise.all(tasks).then(() => resolve()).catch(reject);
          });
        }
      );
    });
  });
}

/**
 * PUT /api/admin/dispatch/:orderId
 * Body: { driver_id: number | null }
 * Returns: { success:true, orderId, driver_id }
 *
 * Notes:
 * - v0.3: persists to SQLite via UPSERT, and mirrors to in-memory cache.
 * - API contract unchanged.
 * - Handles DBs where admin_order_meta.status is NOT NULL by inserting a safe status when creating a new row.
 */
router.put("/:orderId", async (req, res) => {
  const { orderId } = req.params;
  const rawDriver = req.body.driver_id;

  if (typeof orderId !== "string" || !orderId.trim()) {
    return res.status(400).json({ success: false, error: { code: "BAD_ORDER_ID", message: "Invalid orderId" } });
  }

  // Accept number | null | "" (→ null); coerce numeric strings
  let driver_id =
    rawDriver === null || rawDriver === "" || rawDriver === undefined
      ? null
      : Number(rawDriver);

  if (!(driver_id === null || Number.isInteger(driver_id))) {
    return res.status(400).json({ success: false, error: { code: "BAD_DRIVER_ID", message: "driver_id must be integer or null" } });
  }

  try {
    await ensureSchema();

    // If a row exists, preserve current status. Otherwise, default to 'Pending' to respect NOT NULL schemas.
    const current = await new Promise((resolve, reject) => {
      db.get(
        `SELECT status FROM admin_order_meta WHERE order_id = ?`,
        [orderId],
        (err, row) => (err ? reject(err) : resolve(row || null))
      );
    });
    const statusForInsert = current?.status || "Pending";

    // v0.3 persist: upsert driver_id for this order (include status on insert)
    const sql = `
      INSERT INTO admin_order_meta (order_id, status, driver_id, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(order_id) DO UPDATE SET
        driver_id = excluded.driver_id,
        updated_at = datetime('now');
    `;
    await new Promise((resolve, reject) => {
      db.run(sql, [orderId, statusForInsert, driver_id], (err) => (err ? reject(err) : resolve()));
    });

    // Mirror to in-memory cache (non-authoritative)
    dispatchAssignments[orderId] = driver_id;

    return res.json({ success: true, orderId, driver_id });
  } catch (e) {
    return res.status(500).json({ success: false, error: { code: "DB_WRITE", message: e.message } });
  }
});

/**
 * GET /api/admin/dispatch
 * Query: ids=orderId1,orderId2,...
 * Returns: { success:true, assignments: { [orderId]: driver_id|null } }
 *
 * v0.3: read authoritative values from DB; fall back to in-memory if not found.
 */
router.get("/", async (req, res) => {
  const ids = String(req.query.ids || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const out = {};
  if (ids.length === 0) {
    return res.json({ success: true, assignments: out });
  }

  try {
    await ensureSchema();

    // Init all requested ids to null
    ids.forEach(id => { out[id] = null; });

    // Query DB for any existing rows
    const placeholders = ids.map(() => "?").join(",");
    const sql = `SELECT order_id, driver_id FROM admin_order_meta WHERE order_id IN (${placeholders});`;

    const rows = await new Promise((resolve, reject) => {
      db.all(sql, ids, (err, r) => (err ? reject(err) : resolve(r || [])));
    });

    rows.forEach(r => {
      out[r.order_id] = (r.driver_id === null || r.driver_id === undefined) ? null : r.driver_id;
    });

    // For any not found in DB, show in-memory (if any) to preserve v0.2 behavior across restarts
    ids.forEach(id => {
      if (out[id] === null && Object.prototype.hasOwnProperty.call(dispatchAssignments, id)) {
        out[id] = dispatchAssignments[id];
      }
    });

    return res.json({ success: true, assignments: out });
  } catch (e) {
    // On DB error, gracefully fall back entirely to in-memory cache
    ids.forEach(id => {
      out[id] = Object.prototype.hasOwnProperty.call(dispatchAssignments, id) ? dispatchAssignments[id] : null;
    });
    return res.status(200).json({ success: true, assignments: out, warning: { code: "DB_READ_FALLBACK", message: e.message } });
  }
});

module.exports = router;
