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
const ALLOWED_STATUSES = new Set(["Created", "Assigned", "InTransit", "Delivered", "Canceled"]);
const ORDER_TERMINAL_STATUSES = new Set(["Completed", "Canceled"]); // do not overwrite

const NEXT_ALLOWED = {
  Created:   new Set(["Created", "Assigned", "Canceled"]),
  Assigned:  new Set(["Assigned", "InTransit", "Canceled", "Created"]),
  InTransit: new Set(["InTransit", "Delivered", "Canceled", "Assigned", "Created"]),
  Delivered: new Set(["InTransit"]),
  Canceled:  new Set(["Created"]),
};

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

// Ensure driver exists and is an active Driver, when provided
async function ensureDriverValidIfProvided(db, driverId) {
  if (driverId == null) return; // allow unassign
  const d = await getAsync(
    db,
    `SELECT id, type, status FROM users WHERE id = ? LIMIT 1`,
    [driverId]
  );
  const isDriver   = (d?.type || '').toLowerCase() === 'driver';
  const isInactive = (d?.status || '').toLowerCase() === 'inactive';
  if (!d || !isDriver || isInactive) {
    const err = new Error("driver_id must reference an active Driver");
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

function validateTransition(prev, next, effectiveDriverId) {
  if (!ALLOWED_STATUSES.has(next)) {
    return `Invalid status "${next}".`;
  }
  const allowed = NEXT_ALLOWED[prev] || new Set();
  if (!allowed.has(next)) {
    return `Transition ${prev} → ${next} not allowed. Allowed: ${Array.from(allowed).join(", ")}`;
  }
  if (next === "InTransit" && (effectiveDriverId == null)) {
    return "Cannot move to InTransit without an assigned driver.";
  }
  return null;
}

// --- Diag ------------------------------------------------------------------
router.get("/_diag/ping", (req, res) => {
  res.json({ success: true, time: new Date().toISOString() });
});

// Read status history for a dispatch (most recent first)
router.get("/:id/history", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ success: false, error: { code: "BAD_ID", message: "Invalid id" } });
  }
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? "20", 10)));

  const db = new sqlite3.Database(DB_PATH);
  try {
    const rows = await allAsync(
      db,
      `SELECT
         h.id,
         h.dispatch_id,
         h.old_status,
         h.new_status,
         h.changed_by,
         u.name  AS changed_by_name,
         u.email AS changed_by_email,
         h.note,
         h.changed_at
       FROM dispatch_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.dispatch_id = ?
       ORDER BY h.changed_at DESC, h.id DESC
       LIMIT ?`,
      [id, limit]
    );
    return res.json({ success: true, history: rows });
  } catch (err) {
    console.error("[admin-dispatch:history]", err);
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: err.message } });
  } finally {
    db.close();
  }
});

// CSV export of history
router.get("/:id/history.csv", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).send("BAD_ID");
  }
  const limit = Math.min(5000, Math.max(1, parseInt(req.query.limit ?? "1000", 10)));

  const db = new sqlite3.Database(DB_PATH);
  try {
    const rows = await allAsync(
      db,
      `SELECT
         h.id, h.dispatch_id, h.old_status, h.new_status,
         h.changed_by, u.name AS changed_by_name, u.email AS changed_by_email,
         h.note, h.changed_at
       FROM dispatch_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.dispatch_id = ?
       ORDER BY h.changed_at DESC, h.id DESC
       LIMIT ?`,
      [id, limit]
    );

    const esc = (v) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "id","dispatch_id","old_status","new_status",
      "changed_by","changed_by_name","changed_by_email","note","changed_at"
    ].join(",");
    const body = rows.map(r =>
      [r.id,r.dispatch_id,r.old_status,r.new_status,
       r.changed_by,r.changed_by_name,r.changed_by_email,r.note,r.changed_at]
      .map(esc).join(",")
    ).join("\n");
    const csv = header + "\n" + body + "\n";

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="dispatch_${id}_history.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error("[admin-dispatch:history.csv]", err);
    return res.status(500).send("SERVER_ERROR");
  } finally {
    db.close();
  }
});

// List drivers (active by default)
router.get("/drivers", async (req, res) => {
  const db = new sqlite3.Database(DB_PATH);
  try {
    const activeOnly = String(req.query.active ?? "1") !== "0";
    const rows = await allAsync(
      db,
      `SELECT id, name, email, phone, status
         FROM users
        WHERE lower(type) = 'driver'
          ${activeOnly ? "AND (status IS NULL OR lower(status) = 'active')" : ""}
        ORDER BY COALESCE(NULLIF(name,''), email) COLLATE NOCASE, id`
    );
    return res.json({ success: true, drivers: rows });
  } catch (err) {
    console.error("[admin-dispatch:list-drivers]", err);
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: err.message } });
  } finally {
    db.close();
  }
});

// --- List (paginated) ------------------------------------------------------
router.get("/", async (req, res) => {
  const db = new sqlite3.Database(DB_PATH);
  try {
    const page = Math.max(1, parseInt(req.query.page ?? "1", 10));
    const per = Math.min(100, Math.max(1, parseInt(req.query.per ?? "20", 10)));
    const q = (req.query.q || "").trim();
    const status = (req.query.status || "").trim();
    const driverIdRaw = (req.query.driver_id || req.query.driverId || "").trim();
    const plannedDate = (req.query.planned_date || "").trim();

    const where = [];
    const params = [];

    if (q) {
      where.push("(d.order_id LIKE ? OR o.orderNumber LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    if (status && status !== "Any") {
      if (!ALLOWED_STATUSES.has(status)) {
        return res.status(400).json({ success: false, error: { code: "BAD_STATUS", message: "Invalid status" } });
      }
      where.push("d.status = ?");
      params.push(status);
    }
    if (driverIdRaw) {
      const did = parseInt(driverIdRaw, 10);
      if (!Number.isFinite(did)) {
        return res.status(400).json({ success: false, error: { code: "BAD_DRIVER_ID", message: "driver_id must be a number" } });
      }
      where.push("d.driver_id = ?");
      params.push(did);
    }
    if (plannedDate) {
      if (!isIsoDate(plannedDate)) {
        return res.status(400).json({ success: false, error: { code: "BAD_DATE", message: "planned_date must be YYYY-MM-DD" } });
      }
      where.push("d.planned_date = ?");
      params.push(plannedDate);
    }

    const WHERE = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const fromJoin = `
      FROM dispatches d
      LEFT JOIN orders o ON d.order_id = o.id
      LEFT JOIN users  u ON d.driver_id = u.id
    `;

    const countRow = await getAsync(db, `SELECT COUNT(*) AS total ${fromJoin} ${WHERE}`, params);
    const total = countRow?.total ?? 0;

    const offset = (page - 1) * per;
    const data = await allAsync(
      db,
      `SELECT d.*, o.orderNumber, u.name AS driverName
       ${fromJoin}
       ${WHERE}
       ORDER BY d.updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, per, offset]
    );

    const dispatches = data.map((r) => ({ ...r, driverId: r.driver_id }));
    return res.json({
      success: true,
      page, per, total,
      dispatches,
      rows: dispatches,
      items: dispatches,
      count: total,
      pager: { page, per, total, hasPrev: page > 1, hasNext: page * per < total }
    });
  } finally {
    db.close();
  }
});

// --- Create ----------------------------------------------------------------
router.post("/", async (req, res) => {
  let { order_id, driver_id, planned_date, notes, orderId } = req.body || {};
  if (!order_id && orderId) order_id = orderId;

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

    const existing = await getAsync(db, `SELECT id FROM dispatches WHERE order_id = ? LIMIT 1`, [order_id]);
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

// --- Update ----------------------------------------------------------------
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
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Dispatch not found" } });
    }

    // Validate driver if provided (null allowed to unassign)
    const driverIdIsProvided = Object.prototype.hasOwnProperty.call(req.body, "driver_id");
    if (driverIdIsProvided) {
      await ensureDriverValidIfProvided(db, driver_id);
    }

    const prevStatus = existing.status;
    const nextStatus = status || prevStatus;

    // Effective driver after this patch (used for rules)
    const effectiveDriverId = driverIdIsProvided ? driver_id : existing.driver_id;

    // Enforce transition rules only if status is explicitly set
    if (status) {
      const errMsg = validateTransition(prevStatus, nextStatus, effectiveDriverId);
      if (errMsg) return badRequest(res, "BAD_TRANSITION", errMsg);
    }

    // --- Build update
    const set = [];
    const params = [];

    set.push("status = COALESCE(?, status)");
    params.push(status ?? null);

    if (driverIdIsProvided) {
      set.push("driver_id = ?");
      params.push(driver_id ?? null);
    }

    set.push("notes = COALESCE(?, notes)");
    params.push(notes ?? null);

    const clearPlanned = status === "Created" && driverIdIsProvided && (driver_id == null);
    if (clearPlanned) {
      set.push("planned_date = NULL");
    } else {
      set.push("planned_date = COALESCE(?, planned_date)");
      params.push(planned_date ?? null);
    }

    set.push("updated_at = datetime('now')");

    // delivered_at rules
    if (status && nextStatus !== prevStatus) {
      if (nextStatus === "Delivered") {
        set.push("delivered_at = datetime('now')");
      } else if (prevStatus === "Delivered" && nextStatus !== "Delivered") {
        set.push("delivered_at = NULL");
      }
    }

    const sql = `UPDATE dispatches SET ${set.join(", ")} WHERE id = ?`;
    params.push(id);
    await runAsync(db, sql, params);

    // History row for dispatch
    let histRow = null;
    if (status && nextStatus !== prevStatus) {
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

    // --- Step 5.5: sync orders on Delivered boundaries
    if (status && nextStatus !== prevStatus) {
      const link = await getAsync(db, "SELECT order_id FROM dispatches WHERE id = ?", [id]);
      const orderId = link?.order_id;

      if (orderId != null) {
        const completedAtExists = !!(await getAsync(
          db,
          "SELECT 1 AS ok FROM pragma_table_info('orders') WHERE name='completed_at' LIMIT 1",
          []
        ));

        const order = await getAsync(db, "SELECT id, status FROM orders WHERE id = ?", [orderId]);
        const curStatus = order?.status || null;

        const intoDelivered = nextStatus === "Delivered" && prevStatus !== "Delivered";
        const outOfDelivered = prevStatus === "Delivered" && nextStatus !== "Delivered";

        if (intoDelivered && order) {
          if (!ORDER_TERMINAL_STATUSES.has(curStatus)) {
            if (completedAtExists) {
              await runAsync(
                db,
                "UPDATE orders SET status='Completed', completed_at = COALESCE(completed_at, datetime('now')) WHERE id = ?",
                [order.id]
              );
            } else {
              await runAsync(db, "UPDATE orders SET status='Completed' WHERE id = ?", [order.id]);
            }
          }
        } else if (outOfDelivered && order) {
          if (curStatus === "Completed") {
            if (completedAtExists) {
              await runAsync(db, "UPDATE orders SET status='InProgress', completed_at = NULL WHERE id = ?", [order.id]);
            } else {
              await runAsync(db, "UPDATE orders SET status='InProgress' WHERE id = ?", [order.id]);
            }
          }
        }
      }
    }

    // --- Step 5.6: append to order_status_history (schema-aware)
    if (status && nextStatus !== prevStatus) {
      const link = await getAsync(db, "SELECT order_id FROM dispatches WHERE id = ?", [id]);
      const orderId = link?.order_id;
      if (orderId != null) {
        const intoDelivered  = nextStatus === "Delivered" && prevStatus !== "Delivered";
        const outOfDelivered = prevStatus === "Delivered" && nextStatus !== "Delivered";

        // Detect table + schema
        const oshTableExists = !!(await getAsync(
          db,
          "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='order_status_history' LIMIT 1",
          []
        ));
        if (oshTableExists) {
          const hasV2Columns = !!(await getAsync(
            db,
            "SELECT 1 AS ok FROM pragma_table_info('order_status_history') WHERE name='old_order_status' LIMIT 1",
            []
          ));

          // Read current order status AFTER Step 5.5 sync
          const orderRow = await getAsync(db, "SELECT status FROM orders WHERE id = ?", [orderId]);
          const curOrderStatus = orderRow?.status ?? null;

          if (hasV2Columns) {
            // New schema (preferred)
            if (intoDelivered || outOfDelivered) {
              const oldOrderStatus = outOfDelivered ? "Completed" : (curOrderStatus === "Completed" ? "InProgress" : curOrderStatus);
              const newOrderStatus = intoDelivered ? "Completed" : "InProgress";
              await runAsync(
                db,
                `INSERT INTO order_status_history
                   (order_id, old_order_status, new_order_status,
                    old_dispatch_status, new_dispatch_status,
                    source, reason, note, changed_by, changed_at)
                 VALUES (?, ?, ?, ?, ?, 'dispatch', NULL, ?, ?, datetime('now'))`,
                [orderId, oldOrderStatus, newOrderStatus, prevStatus, nextStatus, notes ?? null, admin?.id ?? null]
              );
            } else {
              await runAsync(
                db,
                `INSERT INTO order_status_history
                   (order_id, old_order_status, new_order_status,
                    old_dispatch_status, new_dispatch_status,
                    source, reason, note, changed_by, changed_at)
                 VALUES (?, ?, ?, ?, ?, 'dispatch', NULL, ?, ?, datetime('now'))`,
                [orderId, curOrderStatus, curOrderStatus, prevStatus, nextStatus, notes ?? null, admin?.id ?? null]
              );
            }
          } else {
            // Legacy schema: (id, order_id, status, note, changedBy, changedAt)
            const derived = (intoDelivered ? "Completed" : outOfDelivered ? "InProgress" : curOrderStatus);
            const noteWithDispatch = [notes || "", `(dispatch ${prevStatus}→${nextStatus})`].filter(Boolean).join(" ").trim();
            await runAsync(
              db,
              `INSERT INTO order_status_history (order_id, status, note, changedBy, changedAt)
               VALUES (?, ?, ?, ?, datetime('now'))`,
              [orderId, derived, noteWithDispatch || null, admin?.id ?? null]
            );
          }
        }
      }
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
