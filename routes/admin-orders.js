// routes/admin-orders.js
// Admin Orders (overlay-aware list + single GET + PATCH + ADR status route)
// - GET    /                 → paginated list (JOIN aom + items totals fallback)
// - GET    /:id/history      → unified order history (order_status_history V2, paged by id DESC)
// - GET    /:idOrNumber      → single, overlay-aware + items (with items totals fallback)
// - PATCH  /:idOrNumber      → upsert overlay; verifies base order exists; appends status history on change
// - PUT    /:idOrNumber/status → ADR endpoint: update status + optional note; appends history
//
// Safe to drop in.

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// ---- DB path ----
const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(__dirname, "../data/dev/wattsun.dev.db");

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error("[admin-orders] DB open error:", err.message, "path=", DB_PATH);
  else console.log("[admin-orders] DB connected:", DB_PATH);
});

// Small promise helpers (local style)
function allP(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows || [])));
  });
}
function getP(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row || null)));
  });
}

// ---- Helpers ----
const ALLOWED_STATUSES = ["Pending", "Confirmed", "Dispatched", "Delivered", "Closed", "Cancelled"];
const normalizeStatus = (s) => {
  if (s == null) return s;
  const map = { Processing: "Confirmed", Shipped: "Dispatched" };
  const v = String(s).trim();
  return map[v] || v;
};
const safeStatus = (s) => (ALLOWED_STATUSES.includes(String(s).trim()) ? String(s).trim() : null);
const safeDriverId = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};
const trimOrEmpty = (s) => (s == null ? "" : String(s)).trim();
const parseCurrency = (v) => {
  if (v == null) return null;
  let c = String(v).trim().toUpperCase();
  if (c === "KSH") c = "KES";
  return /^[A-Z]{3}$/.test(c) ? c : null;
};
function toCentsLegacy(x) {
  if (x == null || x === "") return null;
  if (typeof x === "number" && Number.isFinite(x)) return Math.round(x * 100);
  let s = String(x).trim();
  s = s.replace(/[^\d.,-]/g, "");
  if (s.indexOf(",") > -1 && s.indexOf(".") > -1) s = s.replace(/,/g, "");
  else s = s.replace(/,/g, "");
  const f = parseFloat(s);
  return Number.isFinite(f) ? Math.round(f * 100) : null;
}
function pickCentsFromBody(body, keyCamel, keySnake, legacyKey) {
  if (Object.prototype.hasOwnProperty.call(body, keyCamel)) {
    const v = body[keyCamel];
    if (v === null) return { provided: true, value: null };
    const n = Number(v);
    return { provided: true, value: Number.isFinite(n) ? Math.round(n) : null };
  }
  if (Object.prototype.hasOwnProperty.call(body, keySnake)) {
    const v = body[keySnake];
    if (v === null) return { provided: true, value: null };
    const n = Number(v);
    return { provided: true, value: Number.isFinite(n) ? Math.round(n) : null };
  }
  if (Object.prototype.hasOwnProperty.call(body, legacyKey)) {
    return { provided: true, value: toCentsLegacy(body[legacyKey]) };
  }
  return { provided: false, value: null };
}

// Resolve an order by ID or orderNumber; return {id, orderNumber} or null
function resolveOrder(db, idOrNumber, cb) {
  const key = String(idOrNumber || "").trim();
  if (!key) return cb(null, null);
  const sql = `SELECT id, orderNumber FROM orders WHERE id = ? OR orderNumber = ? LIMIT 1;`;
  db.get(sql, [key, key], (e, row) => (e ? cb(e) : cb(null, row || null)));
}

// Get current effective status (overlay wins)
function getEffectiveStatus(orderId) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT COALESCE(a.status, o.status) AS eff
                 FROM orders o
                 LEFT JOIN admin_order_meta a ON a.order_id = o.id
                 WHERE o.id = ? LIMIT 1;`;
    db.get(sql, [orderId], (e, row) => (e ? reject(e) : resolve(row ? row.eff : null)));
  });
}

/**
 * Append a unified order history row (V2 schema).
 * Writes into order_status_history:
 *   order_id, old_order_status, new_order_status,
 *   old_dispatch_status, new_dispatch_status,
 *   source, reason, note, changed_by, changed_at
 *
 * For pure order status updates (no dispatch context), we set dispatch fields to "" (NOT NULL satisfied).
 */
function appendStatusHistory(orderId, oldStatus, newStatus, note, changedBy) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO order_status_history (
        order_id,
        old_order_status, new_order_status,
        old_dispatch_status, new_dispatch_status,
        source, reason, note, changed_by, changed_at
      ) VALUES (?, ?, ?, '', '', 'admin', 'order_status_update', ?, ?, datetime('now'))
    `;
    db.run(sql, [orderId, oldStatus ?? null, newStatus, note ?? null, changedBy ?? null], function (e) {
      if (e) return reject(e);
      resolve({
        id: this.lastID,
        order_id: orderId,
        old_order_status: oldStatus ?? null,
        new_order_status: newStatus,
        note: note ?? null,
        changed_by: changedBy ?? null,
      });
    });
  });
}
// 2.3-B — Ensure a dispatch exists when an order becomes Confirmed (idempotent)
function ensureDispatchForConfirmedOrder(orderId, changedBy = null, note = 'auto from order Confirmed') {
  return new Promise((resolve, reject) => {
    // If a non-cancelled dispatch already exists for this order, do nothing
    db.get(
      `SELECT id FROM dispatches
         WHERE order_id = ?
           AND IFNULL(status,'') <> 'Canceled'
         ORDER BY id DESC
         LIMIT 1`,
      [orderId],
      (selErr, row) => {
        if (selErr) return reject(selErr);
        if (row && row.id) return resolve({ created: false, dispatchId: row.id });

        // Create a new 'Created' dispatch
        db.run(
          `INSERT INTO dispatches (order_id, driver_id, status, planned_date, notes, created_at, updated_at)
           VALUES (?, NULL, 'Created', NULL, ?, datetime('now'), datetime('now'))`,
          [orderId, note],
          function (insErr) {
            if (insErr) return reject(insErr);
            const dispatchId = this.lastID;

            // Append dispatch history
            db.run(
              `INSERT INTO dispatch_status_history (dispatch_id, old_status, new_status, changed_by, note, changed_at)
               VALUES (?, NULL, 'Created', ?, ?, datetime('now'))`,
              [dispatchId, changedBy, note],
              (histErr) => {
                if (histErr) return reject(histErr);
                resolve({ created: true, dispatchId });
              }
            );
          }
        );
      }
    );
  });
}

// 2.3-C — Cancel any active dispatches when order is not moving forward
function cancelActiveDispatchesForOrder(orderId, changedBy = null, reason = 'auto from order status rollback') {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, status FROM dispatches
       WHERE order_id = ? AND IFNULL(status,'') <> 'Canceled'`,
      [orderId],
      (selErr, rows) => {
        if (selErr) return reject(selErr);
        console.log(`[auto-sync] 2.3-C: found ${rows?.length || 0} active dispatch(es) for order ${orderId}`);
        if (!rows || rows.length === 0) {
          console.log(`[auto-sync] 2.3-C: no active dispatches to cancel for order ${orderId}`);
          return resolve({ cancelled: 0, failed: 0 });
        }

        let pending = rows.length;
        let cancelled = 0;
        let failed = 0;

        rows.forEach(({ id: dispatchId, status: oldStatus }) => {
          db.serialize(() => {
            // Begin a small transaction per dispatch for atomicity
            db.run('BEGIN');
            // 1) append history
            db.run(
              `INSERT INTO dispatch_status_history (dispatch_id, old_status, new_status, changed_by, note, changed_at)
               VALUES (?, ?, 'Canceled', ?, ?, datetime('now'))`,
              [dispatchId, oldStatus || null, changedBy, reason],
              (histErr) => {
                if (histErr) {
                  failed++;
                  console.error(`[auto-sync] 2.3-C: history insert failed for dispatch ${dispatchId}`, histErr);
                  db.run('ROLLBACK', () => done());
                  return;
                }
                // 2) flip the dispatch
                db.run(
                  `UPDATE dispatches
                   SET status='Canceled', updated_at=datetime('now')
                   WHERE id = ?`,
                  [dispatchId],
                  (updErr) => {
                    if (updErr) {
                      failed++;
                      console.error(`[auto-sync] 2.3-C: update failed for dispatch ${dispatchId}`, updErr);
                      db.run('ROLLBACK', () => done());
                      return;
                    }
                    cancelled++;
                    db.run('COMMIT', () => done());
                  }
                );
              }
            );
          });

          function done() {
            pending--;
            if (pending === 0) {
              console.log(`[auto-sync] 2.3-C: cancel summary order=${orderId} cancelled=${cancelled} failed=${failed}`);
              resolve({ cancelled, failed });
            }
          }
        });
      }
    );
  });
}

  // Upsert overlay helper (returns minimal order payload)
function upsertOverlay({ id, status, driverId, notes, totalCents, depositCents, currency }) {
  return new Promise((resolve, reject) => {
    db.get("SELECT 1 FROM admin_order_meta WHERE order_id = ?", [id], (selErr, row) => {
      if (selErr) return reject(selErr);

      if (!row) {
        const insertSql = `
          INSERT INTO admin_order_meta
            (order_id, status, driver_id, notes, total_cents, deposit_cents, currency, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`;
        db.run(
          insertSql,
          [id, status ?? "Pending", driverId ?? null, notes ?? "", totalCents ?? null, depositCents ?? null, currency ?? "KES"],
          function (insErr) {
            if (insErr) return reject(insErr);
            resolve({ id, status: status ?? "Pending", driverId: driverId ?? null, notes: notes ?? "", totalCents: totalCents ?? null, depositCents: depositCents ?? null, currency: currency ?? "KES" });
          }
        );
      } else {
        const sets = [], args = [];
        if (status !== undefined)       { sets.push("status = ?");         args.push(status); }
        if (driverId !== undefined)     { sets.push("driver_id = ?");      args.push(driverId); }
        if (notes !== undefined)        { sets.push("notes = ?");          args.push(notes); }
        if (totalCents !== undefined)   { sets.push("total_cents = ?");    args.push(totalCents); }
        if (depositCents !== undefined) { sets.push("deposit_cents = ?");  args.push(depositCents); }
        if (currency !== undefined)     { sets.push("currency = ?");       args.push(currency); }
        if (sets.length === 0) return resolve({ id });
        sets.push("updated_at = datetime('now')");
        args.push(id);
        db.run(`UPDATE admin_order_meta SET ${sets.join(", ")} WHERE order_id = ?`, args, function (updErr) {
          if (updErr) return reject(updErr);
          resolve({ id, status, driverId, notes, totalCents, depositCents, currency });
        });
      }
    });
  });
}

// ---- GET /api/admin/orders?q&status&from&to&page&per ----
router.get("/", (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const per  = Math.min(Math.max(parseInt(req.query.per  || "10", 10), 1), 100);
  const q      = (req.query.q || "").trim();
  const statusRaw = (req.query.status || "").trim();
  const status = safeStatus(normalizeStatus(statusRaw)) || "";
  const to     = (req.query.to   || "").trim();

  const from   = (req.query.from || "").trim();   // <-- add this (from was missing)
  const ymd    = /^\d{4}-\d{2}-\d{2}$/;           // tiny date guard (YYYY-MM-DD)
  const fromOk = ymd.test(from), toOk = ymd.test(to);

  const where = [];
  const params = [];

  if (q) {
    const like = `%${q}%`;
    where.push("(o.orderNumber LIKE ? OR o.fullName LIKE ? OR o.phone LIKE ? OR o.email LIKE ?)");
    params.push(like, like, like, like);
  }
  if (status) {
    where.push("COALESCE(aom.status, o.status) = ?");
    params.push(status);
  }
  if (fromOk) { where.push("datetime(o.createdAt) >= datetime(?)"); params.push(from); }
  if (toOk)   { where.push("datetime(o.createdAt) <  datetime(?)"); params.push(to); }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const offset = (page - 1) * per;

  const sqlCount = `
    SELECT COUNT(DISTINCT o.id) AS c
    FROM orders o
    LEFT JOIN admin_order_meta aom ON aom.order_id = o.id
    ${whereSql};
  `;

  // JOIN a per-order items total subquery as "it"
  const sqlList  = `
    SELECT
      o.id,
      o.orderNumber,
      o.fullName,
      o.phone,
      o.email,
      o.address,
      o.createdAt,

      COALESCE(aom.status, o.status) AS displayStatus,
      COALESCE(aom.total_cents,  o.totalCents, it.items_total_cents)    AS displayTotalCents,
      COALESCE(aom.deposit_cents, it.items_deposit_cents, 0)            AS displayDepositCents,
      COALESCE(aom.currency, o.currency, 'KES')                         AS displayCurrency,
      aom.driver_id                                                     AS driverId,
      aom.notes                                                         AS notes,

      o.status       AS originalStatus,
      o.totalCents   AS originalTotalCents

    FROM orders o
    LEFT JOIN admin_order_meta aom ON aom.order_id = o.id
    LEFT JOIN (
      SELECT order_id,
             SUM(priceCents)                         AS items_total_cents,
             SUM(COALESCE(depositCents, 0))         AS items_deposit_cents
      FROM order_items
      GROUP BY order_id
    ) it ON it.order_id = o.id
    ${whereSql}
    ORDER BY datetime(o.createdAt) DESC
    LIMIT ? OFFSET ?;
  `;

  db.get(sqlCount, params, (e1, row) => {
    if (e1) {
      console.error("admin/orders count error:", e1);
      return res.status(500).json({ success:false, error:{code:"db_count_failed", message:e1.message} });
    }
    const total = row?.c || 0;
    const listParams = params.slice(); listParams.push(per, offset);

    db.all(sqlList, listParams, (e2, rows) => {
      if (e2) {
        console.error("admin/orders list error:", e2);
        return res.status(500).json({ success:false, error:{code:"db_list_failed", message:e2.message} });
      }
      res.json({
        success: true,
        page, per, total,
        orders: (rows || []).map(r => ({
          id: r.id,
          orderNumber: r.orderNumber,
          fullName: r.fullName,
          phone: r.phone,
          email: r.email,
          address: r.address,
          createdAt: r.createdAt,

          status: r.displayStatus,
          totalCents: Number.isInteger(r.displayTotalCents)
            ? r.displayTotalCents
            : parseInt(r.displayTotalCents || 0, 10),
          depositCents: Number.isInteger(r.displayDepositCents)
            ? r.displayDepositCents
            : parseInt(r.displayDepositCents || 0, 10),
          currency: r.displayCurrency || null,
          driverId: r.driverId ?? null,
          notes: r.notes,

          originalStatus: r.originalStatus,
          originalTotalCents: Number.isInteger(r.originalTotalCents)
            ? r.originalTotalCents
            : parseInt(r.originalTotalCents || 0, 10),
        }))
      });
    });
  });
});

// ---- NEW: GET /api/admin/orders/:id/history (must be before :idOrNumber catch-all) ----
router.get("/:id/history", async (req, res) => {
  try {
    const orderId = String(req.params.id || "").trim();
    if (!orderId) return res.status(400).json({ success: false, error: "ORDER_ID_REQUIRED" });

    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "50", 10), 100));
    const cursorRaw = req.query.cursor;
    const cursor = cursorRaw != null && cursorRaw !== "" && !Number.isNaN(Number(cursorRaw))
      ? Number(cursorRaw)
      : null;

    const params = [orderId];
    let where = "WHERE h.order_id = ?";
    if (Number.isInteger(cursor)) {
      where += " AND h.id < ?";
      params.push(cursor);
    }

    const sql = `
      SELECT
        h.id,
        h.order_id,
        h.old_order_status, h.new_order_status,
        h.old_dispatch_status, h.new_dispatch_status,
        h.source, h.reason, h.note,
        h.changed_by,
        u.name  AS changed_by_name,
        u.email AS changed_by_email,
        h.changed_at
      FROM order_status_history h
      LEFT JOIN users u ON u.id = h.changed_by
      ${where}
      ORDER BY h.id DESC
      LIMIT ${limit};
    `;

    const rows = await allP(sql, params);
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;

    // Minimal order header from current schema
    const order = await getP(
      `SELECT id AS order_id, status, phone, createdAt, completed_at FROM orders WHERE id = ? LIMIT 1;`,
      [orderId]
    );

    res.json({ success: true, order, rows, next_cursor: nextCursor });
  } catch (err) {
    console.error("GET /api/admin/orders/:id/history error:", err);
    res.status(500).json({ success: false, error: "HISTORY_FETCH_FAILED" });
  }
});

// ---- GET /api/admin/orders/:idOrNumber ----
router.get("/:idOrNumber", (req, res) => {
  resolveOrder(db, req.params.idOrNumber, (e0, ord) => {
    if (e0) {
      console.error("admin/orders(:id) resolve error:", e0);
      return res.status(500).json({ success:false, error:{code:"db_resolve_failed", message:e0.message} });
    }
    if (!ord) return res.status(404).json({ success:false, error:{code:"NOT_FOUND"} });

    // Bring in items totals as fallback
    const sqlOrder = `
      SELECT
        o.id,
        o.orderNumber,
        o.fullName,
        o.phone,
        o.email,
        o.address,
        o.createdAt,

        COALESCE(aom.status, o.status)                               AS status,
        COALESCE(aom.total_cents,  o.totalCents, it.items_total_cents)    AS totalCents,
        COALESCE(aom.deposit_cents, it.items_deposit_cents, 0)            AS depositCents,
        COALESCE(aom.currency, o.currency, 'KES')                         AS currency,
        aom.driver_id                                                      AS driverId,
        aom.notes                                                          AS notes,

        o.status       AS originalStatus,
        o.totalCents   AS originalTotalCents

      FROM orders o
      LEFT JOIN admin_order_meta aom ON aom.order_id = o.id
      LEFT JOIN (
        SELECT order_id,
               SUM(priceCents)                          AS items_total_cents,
               SUM(COALESCE(depositCents, 0))          AS items_deposit_cents
        FROM order_items
        GROUP BY order_id
      ) it ON it.order_id = o.id
      WHERE o.id = ?
      LIMIT 1;
    `;

    const sqlItems = `
      SELECT id, order_id AS orderId, sku, name, qty, priceCents, depositCents, image
      FROM order_items
      WHERE order_id = ?
      ORDER BY id ASC;
    `;

    db.get(sqlOrder, [ord.id], (e1, order) => {
      if (e1) {
        console.error("admin/orders(:id) order error:", e1);
        return res.status(500).json({ success:false, error:{code:"db_order_failed", message:e1.message} });
      }
      if (!order) return res.status(404).json({ success:false, error:{code:"NOT_FOUND"} });

      db.all(sqlItems, [ord.id], (e2, items = []) => {
        if (e2) {
          console.error("admin/orders(:id) items error:", e2);
          return res.status(500).json({ success:false, error:{code:"db_items_failed", message:e2.message} });
        }
        res.json({ success:true, order: { ...order, items } });
      });
    });
  });
});

// ---- ADR: PUT /api/admin/orders/:idOrNumber/status ----
router.put("/:idOrNumber/status", async (req, res) => {
  try {
    const idOrNumber = req.params.idOrNumber;
    const note = trimOrEmpty(req.body?.note ?? "");

    const statusInput = normalizeStatus(req.body?.status);
    const status = statusInput == null ? null : safeStatus(statusInput);
    if (!status) {
      return res.status(422).json({ success:false, error:{ code: "VALIDATION_STATUS_INVALID", message: `Status must be one of: ${ALLOWED_STATUSES.join(", ")}` } });
    }

    // Resolve base order
    const ord = await new Promise((resolve, reject) => resolveOrder(db, idOrNumber, (e, row) => e ? reject(e) : resolve(row)));
    if (!ord) return res.status(404).json({ success:false, error:{ code:"ORDER_NOT_FOUND", message:"Base order not found" } });

    const id = String(ord.id);
    const before = await getEffectiveStatus(id);

    // Upsert overlay with new status and optional note (notes preserved if empty)
    await upsertOverlay({ id, status, notes: note === "" ? undefined : note });

    // Append unified V2 history only if changed
    const changedBy = req.session?.user?.id || null;
    if (before !== status) {
      await appendStatusHistory(id, before, status, note || null, changedBy);
    }
    // 2.3-B: if status moved to Confirmed, ensure a 'Created' dispatch exists
    if (before !== status && status === "Confirmed") {
      try {
        const r = await ensureDispatchForConfirmedOrder(id, changedBy);
        if (r.created) {
          console.log(`[auto-sync] Created dispatch ${r.dispatchId} for order ${id}`);
        } else {
          console.log(`[auto-sync] Dispatch exists for order ${id} (id ${r.dispatchId}); skipped`);
        }
      } catch (syncErr) {
        console.error("[auto-sync] ensureDispatchForConfirmedOrder failed:", syncErr);
        // Do not fail the main request
      }
    } 
  console.log("[auto-sync] status transition", { id, before, status, path: req.method + " " + req.originalUrl });

    // 2.3-C: if status rolled back, cancel active dispatches
  const didStatusChange =
    typeof before !== "undefined" &&
    typeof status !== "undefined" &&
    before !== status;

  if (didStatusChange && rollbackSet.has(String(status))) {
    try {
     const r = await cancelActiveDispatchesForOrder(id, changedBy, `auto due to order -> ${status}`);
     console.log(`[auto-sync] Cancelled ${r.cancelled} dispatch(es) for order ${id} (rollback to ${status})`);
    } catch (syncErr) {
    console.error("[auto-sync] cancelActiveDispatchesForOrder failed:", syncErr);
  }
}

if (before !== status && rollbackSet.has(status)) {
  try {
    const r = await cancelActiveDispatchesForOrder(id, changedBy, `auto due to order -> ${status}`);
    console.log(`[auto-sync] Cancelled ${r.cancelled} dispatch(es) for order ${id} (rollback to ${status})`);
  } catch (syncErr) {
    console.error("[auto-sync] cancelActiveDispatchesForOrder failed:", syncErr);
    // non-fatal
  }
}

    return res.json({ success:true, order:{ id, orderNumber: ord.orderNumber, status }, history:{ oldStatus: before, newStatus: status, changedBy, note: note || null } });
  } catch (e) {
    console.error("[admin-orders:PUT status]", e);
    return res.status(500).json({ success:false, error:{ code:"SERVER", message:"Failed to update status" } });
  }
});

// ---- PATCH /api/admin/orders/:idOrNumber ----
router.patch("/:idOrNumber", (req, res) => {
  resolveOrder(db, req.params.idOrNumber, async (e0, ord) => {
    if (e0) {
      console.error("[admin-orders] resolve error:", e0);
      return res.status(500).json({ success:false, error:{code:"DB_ERROR", message:"Database error"} });
    }
    if (!ord) {
      return res.status(404).json({ success:false, error:{code:"ORDER_NOT_FOUND", message:"Base order not found"} });
    }

    const id = String(ord.id);

    const statusInput = normalizeStatus(req.body?.status);
    const status = statusInput == null ? null : safeStatus(statusInput);
    if (!status && req.body?.status !== undefined) {
      return res.status(422).json({ success: false, error: { code: "VALIDATION_STATUS_INVALID", message: `Status must be one of: ${ALLOWED_STATUSES.join(", ")}` } });
    }

    const rawDriver = (req.body?.driverId ?? req.body?.driver_id);
    const dId = safeDriverId(rawDriver);
    if (rawDriver !== undefined && Number.isNaN(dId)) {
      return res.status(422).json({ success: false, error: { code: "VALIDATION_DRIVER_ID_INTEGER", message: "Driver ID must be an integer or null" } });
    }

    const notesProvided = (req.body?.notes !== undefined) || (req.body?.note !== undefined);
    const notes = trimOrEmpty(req.body?.notes ?? req.body?.note ?? "");

    const totalPick   = pickCentsFromBody(req.body, "totalCents", "total_cents", "total");
    const depositPick = pickCentsFromBody(req.body, "depositCents", "deposit_cents", "deposit");
    const currencyRaw = req.body?.currency;
    const currency    = parseCurrency(currencyRaw);

    const providedStatus    = (req.body?.status !== undefined);
    const providedDriverId  = (rawDriver !== undefined);
    const providedTotal     = totalPick.provided;
    const providedDeposit   = depositPick.provided;
    const providedCurrency  = (currencyRaw !== undefined);

    try {
      const before = await getEffectiveStatus(id);

      const overlayResult = await upsertOverlay({
        id,
        status: providedStatus ? status : undefined,
        driverId: providedDriverId ? dId : undefined,
        notes: notesProvided ? notes : undefined,
        totalCents: providedTotal ? totalPick.value : undefined,
        depositCents: providedDeposit ? depositPick.value : undefined,
        currency: providedCurrency ? (currency || null) : undefined,
      });

      // Append unified V2 history if status changed
      const changedBy = req.session?.user?.id || null;
      if (providedStatus && status && before !== status) {
        await appendStatusHistory(id, before, status, notesProvided ? (notes || null) : null, changedBy);
      }
      // 2.3-B: if status moved to Confirmed, ensure a 'Created' dispatch exists
      if (providedStatus && status === "Confirmed" && before !== status) {
        try {
          const r = await ensureDispatchForConfirmedOrder(id, changedBy);
          if (r.created) {
            console.log(`[auto-sync] Created dispatch ${r.dispatchId} for order ${id}`);
          } else {
            console.log(`[auto-sync] Dispatch exists for order ${id} (id ${r.dispatchId}); skipped`);
          }
        } catch (syncErr) {
          console.error("[auto-sync] ensureDispatchForConfirmedOrder failed:", syncErr);
          // Non-fatal: do not block the PATCH response
        }
      }
     console.log("[auto-sync] status transition", { id, before, status, path: req.method + " " + req.originalUrl });

      // 2.3-C: if status rolled back, cancel active dispatches
  const rollbackSet = new Set(["Pending", "Cancelled", "Processing", "InProgress"]);

  // Normalize truthy change detection (some handlers use 'providedStatus', others don't)
  const didStatusChange = (typeof before !== "undefined" && typeof status !== "undefined" && before !== status);

  if (didStatusChange && rollbackSet.has(String(status))) {
  try {
    const r = await cancelActiveDispatchesForOrder(id, changedBy, `auto due to order -> ${status}`);
    console.log(`[auto-sync] 2.3-C cancelled ${r.cancelled} dispatch(es), failed=${r.failed || 0}, order=${id}, to=${status}`);
  } catch (syncErr) {
    console.error("[auto-sync] 2.3-C failed:", syncErr);
    // non-fatal
  }
}

      return res.json({ success: true, order: overlayResult, message: "Order updated" });
    } catch (err) {
      console.error("[admin-orders] PATCH error:", err);
      return res.status(500).json({ success: false, error: { code: "DB_ERROR", message: "Database error" } });
    }
  });
});

// Local diag
router.get("/_diag/ping", (_req, res) => res.json({ success: true, time: new Date().toISOString() }));

module.exports = router;
