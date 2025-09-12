// routes/admin-dispatch.js
const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();
router.use(express.json());

// --- DB helpers -------------------------------------------------------------
const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.resolve(__dirname, "..", "data", "dev", "wattsun.dev.db");

function withDb(fn) {
  const db = new sqlite3.Database(DB_PATH);
  return new Promise((resolve, reject) => {
    fn(db, (err, result) => {
      db.close();
      err ? reject(err) : resolve(result);
    });
  });
}

function getAsync(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function allAsync(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}
function runAsync(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

// --- Helpers ---------------------------------------------------------------
const ALLOWED_STATUSES = new Set(["Created", "Assigned", "InTransit", "Canceled"]);

function isIsoDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function getAdminUser(req) {
  return req.session?.user || null;
}

async function ensureOrderExists(db, orderId) {
  const row = await getAsync(
    db,
    `SELECT id, COALESCE(orderNumber, id) AS orderKey
     FROM orders
     WHERE id = ? OR orderNumber = ?
     LIMIT 1`,
    [orderId, orderId]
  );
  if (!row) {
    const err = new Error("Order not found");
    err.http = 404;
    err.code = "ORDER_NOT_FOUND";
    throw err;
  }
}

async function ensureDriverValidIfProvided(db, driverId) {
  if (driverId == null) return;
  const d = await getAsync(
    db,
    `SELECT id, type, role, status FROM users WHERE id = ? LIMIT 1`,
    [driverId]
  );
  const ok =
    d &&
    (d.type === "Driver" || d.role === "Driver") &&
    (!d.status || String(d.status).toLowerCase() !== "inactive");
  if (!ok) {
    const err = new Error("driverId must reference an active Driver");
    err.http = 400;
    err.code = "NOT_DRIVER";
    throw err;
  }
}

async function insertHistory(db, { dispatchId, oldStatus, newStatus, adminId, note }) {
  return runAsync(
    db,
    `INSERT INTO dispatch_status_history
       (dispatch_id, old_status, new_status, changed_by, note, changed_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [dispatchId, oldStatus ?? null, newStatus, adminId ?? null, note ?? null]
  );
}

function badRequest(res, code, message) {
  return res.status(400).json({ success: false, error: { code, message } });
}

// --- Diag ------------------------------------------------------------------
router.get("/_diag/ping", (req, res) => {
  res.json({ success: true, time: new Date().toISOString() });
});

// --- List (baseline, unchanged) --------------------------------------------
router.get("/", async (req, res) => {
  const db = new sqlite3.Database(DB_PATH);
  try {
    const rows = await allAsync(
      db,
      `SELECT d.*, o.orderNumber, u.name AS driverName
         FROM dispatches d
         LEFT JOIN orders o ON d.order_id = o.id
         LEFT JOIN users u  ON d.driver_id = u.id
         ORDER BY d.created_at DESC
         LIMIT 20`,
      []
    );
    res.json({ success: true, dispatches: rows });
  } catch (err) {
    console.error("[admin-dispatch:list]", err);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "List failed" } });
  } finally {
    db.close();
  }
});

// --- Create ---------------------------------------------------------------
router.post("/", async (req, res) => {
  const { order_id, driver_id, planned_date, notes } = req.body || {};
  const admin = getAdminUser(req);

  if (!order_id || typeof order_id !== "string") {
    return badRequest(res, "BAD_REQUEST", "order_id is required (string).");
  }
  if (planned_date && !isIsoDate(planned_date)) {
    return badRequest(res, "BAD_DATE", "planned_date must be YYYY-MM-DD.");
  }

  const db = new sqlite3.Database(DB_PATH);
  try {
    await ensureOrderExists(db, order_id);

    const existing = await getAsync(db, `SELECT id FROM dispatches WHERE order_id = ? LIMIT 1`, [
      order_id,
    ]);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: "ALREADY_EXISTS", message: "Dispatch for this order already exists." },
      });
    }

    await ensureDriverValidIfProvided(db, driver_id);

    const result = await runAsync(
      db,
      `INSERT INTO dispatches (order_id, driver_id, status, planned_date, notes, created_at, updated_at)
       VALUES (?, ?, 'Created', ?, ?, datetime('now'), datetime('now'))`,
      [order_id, driver_id ?? null, planned_date ?? null, notes ?? null]
    );
    const dispatchId = result.lastID;

    const hist = await insertHistory(db, {
      dispatchId,
      oldStatus: null,
      newStatus: "Created",
      adminId: admin?.id,
      note: notes,
    });

    const created = await getAsync(
      db,
      `SELECT d.*, o.orderNumber, u.name AS driverName
       FROM dispatches d
       LEFT JOIN orders o ON d.order_id = o.id
       LEFT JOIN users u  ON d.driver_id = u.id
       WHERE d.id = ?`,
      [dispatchId]
    );

    return res.json({
      success: true,
      dispatch: created,
      history: {
        id: hist.lastID,
        dispatch_id: dispatchId,
        old_status: null,
        new_status: "Created",
        changed_by: admin?.id ?? null,
        note: notes ?? null,
      },
      message: "Dispatch created.",
    });
  } catch (err) {
    console.error("[admin-dispatch:create]", err);
    const http = err.http || 500;
    const code = err.code || "SERVER_ERROR";
    return res.status(http).json({ success: false, error: { code, message: err.message } });
  } finally {
    db.close();
  }
});

// --- Update ---------------------------------------------------------------
router.patch("/:id", async (req, res) => {
  const id = req.params.id;
  const { status, driver_id, notes, planned_date } = req.body || {};
  const admin = getAdminUser(req);

  if (planned_date && !isIsoDate(planned_date)) {
    return badRequest(res, "BAD_DATE", "planned_date must be YYYY-MM-DD.");
  }
  if (status && !ALLOWED_STATUSES.has(status)) {
    return badRequest(res, "BAD_STATUS", "status must be one of Created|Assigned|InTransit|Canceled.");
  }

  const db = new sqlite3.Database(DB_PATH);
  try {
    const existing = await getAsync(db, "SELECT * FROM dispatches WHERE id = ?", [id]);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, error: { code: "NOT_FOUND", message: "Dispatch not found" } });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "driver_id")) {
      await ensureDriverValidIfProvided(db, driver_id);
    }

    const prevStatus = existing.status;
    const nextStatus = status || prevStatus;
    const statusChanged = status && status !== prevStatus;

    await runAsync(
      db,
      `UPDATE dispatches
         SET status       = COALESCE(?, status),
             driver_id    = ${
               Object.prototype.hasOwnProperty.call(req.body, "driver_id") ? "?" : "driver_id"
             },
             notes        = COALESCE(?, notes),
             planned_date = COALESCE(?, planned_date),
             updated_at   = datetime('now')
       WHERE id = ?`,
      status
        ? [status, driver_id ?? null, notes ?? null, planned_date ?? null, id]
        : [null, driver_id ?? null, notes ?? null, planned_date ?? null, id]
    );

    let histRow = null;
    if (statusChanged) {
      const hist = await insertHistory(db, {
        dispatchId: Number(id),
        oldStatus: prevStatus,
        newStatus: nextStatus,
        adminId: admin?.id,
        note: notes,
      });
      histRow = {
        id: hist.lastID,
        dispatch_id: Number(id),
        old_status: prevStatus,
        new_status: nextStatus,
        changed_by: admin?.id ?? null,
        note: notes ?? null,
      };
    }

    const updated = await getAsync(
      db,
      `SELECT d.*, o.orderNumber, u.name AS driverName
         FROM dispatches d
         LEFT JOIN orders o ON d.order_id = o.id
         LEFT JOIN users u  ON d.driver_id = u.id
        WHERE d.id = ?`,
      [id]
    );

    return res.json({
      success: true,
      dispatch: updated,
      ...(histRow ? { history: histRow } : {}),
      message: "Dispatch updated.",
    });
  } catch (err) {
    console.error("[admin-dispatch:update]", err);
    const http = err.http || 500;
    const code = err.code || "SERVER_ERROR";
    return res.status(http).json({ success: false, error: { code, message: err.message } });
  } finally {
    db.close();
  }
});

module.exports = router;
