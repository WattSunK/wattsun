// routes/admin-orders.js
// Admin Orders (SQL list + overlay PATCH + single GET)
// - GET /           → paginated list with filters, overlay-aware (LEFT JOIN admin_order_meta)
// - GET /:id        → single order with items, overlay-aware
// - PATCH /:id      → overlay updates (status, driver, notes, totals)
//
// Note: DB path resolved relative to this file; can be overridden by env.

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

// ---- GET /api/admin/orders?q&status&from&to&page=1&per=10 ----
// Overlay-aware list: COALESCE(aom.*, o.*)
router.get("/", (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const per  = Math.min(Math.max(parseInt(req.query.per  || "10", 10), 1), 100);
  const q      = (req.query.q || "").trim();
  const status = (req.query.status || "").trim();
  const from   = (req.query.from || "").trim();
  const to     = (req.query.to   || "").trim();

  const where = [];
  const params = [];

  // free-text search
  if (q) {
    const like = `%${q}%`;
    where.push("(o.orderNumber LIKE ? OR o.fullName LIKE ? OR o.phone LIKE ? OR o.email LIKE ?)");
    params.push(like, like, like, like);
  }

  // overlay-aware status filter
  if (status) {
    where.push("COALESCE(aom.status, o.status) = ?");
    params.push(status);
  }

  // date range on createdAt
  if (from) { where.push("datetime(o.createdAt) >= datetime(?)"); params.push(from); }
  if (to)   { where.push("datetime(o.createdAt) <  datetime(?)"); params.push(to); }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const offset = (page - 1) * per;

  const sqlCount = `
    SELECT COUNT(DISTINCT o.id) AS c
    FROM orders o
    LEFT JOIN admin_order_meta aom ON aom.order_id = o.id
    ${whereSql};
  `;

  const sqlList  = `
    SELECT
      o.id,
      o.orderNumber,
      o.fullName,
      o.phone,
      o.email,
      o.address,
      o.createdAt,

      -- overlay-aware projections
      COALESCE(aom.status,         o.status)     AS displayStatus,
      COALESCE(aom.total_cents,    o.totalCents) AS displayTotalCents,
      COALESCE(aom.deposit_cents,  0)            AS displayDepositCents,
      aom.currency                                 AS displayCurrency,
      aom.driver_id                                 AS driverId,
      aom.notes                                     AS notes,

      -- originals (optional)
      o.status       AS originalStatus,
      o.totalCents   AS originalTotalCents

    FROM orders o
    LEFT JOIN admin_order_meta aom ON aom.order_id = o.id
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

// ---- GET /api/admin/orders/:id ----
// Returns one order + items, overlay-aware.
router.get("/:id", (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ success:false, error:{code:"MISSING_ORDER_ID"} });

  const sqlOrder = `
    SELECT
      o.id,
      o.orderNumber,
      o.fullName,
      o.phone,
      o.email,
      o.address,
      o.createdAt,

      COALESCE(aom.status,        o.status)     AS status,
      COALESCE(aom.total_cents,   o.totalCents) AS totalCents,
      COALESCE(aom.deposit_cents, 0)            AS depositCents,
      aom.currency                               AS currency,
      aom.driver_id                               AS driverId,
      aom.notes                                   AS notes,

      -- originals (for reference if needed by UI)
      o.status       AS originalStatus,
      o.totalCents   AS originalTotalCents

    FROM orders o
    LEFT JOIN admin_order_meta aom ON aom.order_id = o.id
    WHERE o.id = ?
    LIMIT 1;
  `;

  const sqlItems = `
    SELECT id, order_id AS orderId, sku, name, qty, priceCents, depositCents, image
    FROM order_items
    WHERE order_id = ?
    ORDER BY id ASC;
  `;

  db.get(sqlOrder, [id], (e1, order) => {
    if (e1) {
      console.error("admin/orders(:id) order error:", e1);
      return res.status(500).json({ success:false, error:{code:"db_order_failed", message:e1.message} });
    }
    if (!order) return res.status(404).json({ success:false, error:{code:"NOT_FOUND"} });

    db.all(sqlItems, [id], (e2, items = []) => {
      if (e2) {
        console.error("admin/orders(:id) items error:", e2);
        return res.status(500).json({ success:false, error:{code:"db_items_failed", message:e2.message} });
      }
      res.json({ success:true, order: { ...order, items } });
    });
  });
});

// ---- PATCH /api/admin/orders/:id ----
router.patch("/:id", (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ success: false, error: { code: "MISSING_ORDER_ID", message: "Missing order id" } });

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

  db.get("SELECT 1 FROM admin_order_meta WHERE order_id = ?", [id], (selErr, row) => {
    if (selErr) { console.error("[admin-orders] select error:", selErr.message); return res.status(500).json({ success: false, error: { code: "DB_ERROR", message: "Database error" } }); }

    if (!row) {
      const statusForInsert  = status || "Pending";
      const driverForInsert  = providedDriverId ? dId : null;
      const notesForInsert   = notesProvided ? notes : "";
      const totalForInsert   = providedTotal   ? totalPick.value   : null;
      const depositForInsert = providedDeposit ? depositPick.value : null;
      const currencyForInsert = providedCurrency && currency ? currency : "KES";

      const insertSql = `
        INSERT INTO admin_order_meta
          (order_id, status, driver_id, notes, total_cents, deposit_cents, currency, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `;
      db.run(insertSql,
        [id, statusForInsert, driverForInsert, notesForInsert, totalForInsert, depositForInsert, currencyForInsert],
        function (insErr) {
          if (insErr) { console.error("[admin-orders] insert error:", insErr.message);
            return res.status(500).json({ success: false, error: { code: "DB_ERROR", message: "Database error" } });
          }
          return res.json({ success: true, order: { id, status: statusForInsert, driverId: driverForInsert, notes: notesForInsert, totalCents: totalForInsert, depositCents: depositForInsert, currency: currencyForInsert }, message: "Order updated" });
        }
      );
    } else {
      const sets = [], args = [];
      if (providedStatus)   { sets.push("status = ?");        args.push(status); }
      if (providedDriverId) { sets.push("driver_id = ?");     args.push(dId);    }
      if (notesProvided)    { sets.push("notes = ?");         args.push(notes);  }
      if (providedTotal)    { sets.push("total_cents = ?");   args.push(totalPick.value); }
      if (providedDeposit)  { sets.push("deposit_cents = ?"); args.push(depositPick.value); }
      if (providedCurrency) { sets.push("currency = ?");      args.push(currency || null); }
      if (sets.length === 0) return res.status(400).json({ success: false, error: { code: "EMPTY_UPDATE", message: "Provide at least one of: status, driverId, notes, total/deposit/currency." } });

      sets.push("updated_at = datetime('now')"); args.push(id);
      const updateSql = `UPDATE admin_order_meta SET ${sets.join(", ")} WHERE order_id = ?`;
      db.run(updateSql, args, function (updErr) {
        if (updErr) { console.error("[admin-orders] update error:", updErr.message); return res.status(500).json({ success: false, error: { code: "DB_ERROR", message: "Database error" } }); }
        return res.json({ success: true, order: {
          id,
          status:        providedStatus   ? status               : null,
          driverId:      providedDriverId ? dId                  : null,
          notes:         notesProvided    ? notes                : undefined,
          totalCents:    providedTotal    ? totalPick.value      : undefined,
          depositCents:  providedDeposit  ? depositPick.value    : undefined,
          currency:      providedCurrency ? (currency || null)   : undefined
        }, message: "Order updated" });
      });
    }
  });
});

// Local diag
router.get("/_diag/ping", (_req, res) => res.json({ success: true, time: new Date().toISOString() }));

module.exports = router;
