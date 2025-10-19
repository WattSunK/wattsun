// routes/admin-orders.js
const express = require("express");
const router = express.Router();
const db = require("./db_users");

// === Debug identifier / version endpoint ===
const ROUTE_VERSION = "admin-orders:v4-watt-key-conditional-2025-10-02T20:25Z";
console.log("[admin-orders] ROUTE FILE LOADED:", __filename, "version:", ROUTE_VERSION);

router.get("/__version", (req, res) => {
  res.json({
    ok: true,
    version: ROUTE_VERSION,
    file: __filename,
    dbPath: process.env.SQLITE_MAIN || process.env.SQLITE_DB || process.env.DB_PATH_USERS || null,
    pid: process.pid,
  });
});

// === Helpers ===
function nowIso() {
  return new Date().toISOString();
}
function toNumOrNeg1(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : -1;
}
function isWattKey(k) {
  return /^WATT\d+$/.test(String(k || "").trim());
}
function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id ?? null,
    orderNumber: row.orderNumber ?? null,
    fullName: row.fullName ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    status: row.status ?? "Pending",
    createdAt: row.createdAt ?? null,
    totalCents: row.totalCents ?? null,
    depositCents: row.depositCents ?? null,
    currency: row.currency ?? "KES",
    notes: row.notes ?? null,
    address: row.address ?? null,
    driverId: row.driverId ?? null,
  };
}
function mergeOverlay(base, overlay) {
  if (!overlay) return base;
  const out = { ...base };
  // Only override with meaningful overlay values (notes can be null to clear)
  if (overlay.statusOverlay) out.status = overlay.statusOverlay;
  if (overlay.driverIdOverlay !== null && overlay.driverIdOverlay !== undefined)
    out.driverId = overlay.driverIdOverlay;
  if (overlay.notes !== undefined) out.notes = overlay.notes;
  if (overlay.totalCentsOverlay !== null && overlay.totalCentsOverlay !== undefined)
    out.totalCents = overlay.totalCentsOverlay;
  if (overlay.depositCentsOverlay !== null && overlay.depositCentsOverlay !== undefined)
    out.depositCents = overlay.depositCentsOverlay;
  if (overlay.currencyOverlay) out.currency = overlay.currencyOverlay;
  return out;
}

// === LIST: GET /api/admin/orders?page=&per= ===
router.get("/", (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const per = Math.max(1, parseInt(req.query.per || "10", 10));
    const offset = (page - 1) * per;

    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim();
    const from = String(req.query.from || "").trim();
    const toRaw = String(req.query.to || "").trim();
    const to = toRaw && toRaw.length === 10 ? `${toRaw} 23:59:59` : toRaw; // inclusive end-of-day if date only

    const where = ["o.status != 'Deleted'"];
    const params = [];
    if (status) { where.push("COALESCE(a.status, o.status) = ?"); params.push(status); }
    if (q) {
      const like = `%${q}%`;
      where.push("(o.orderNumber LIKE ? OR o.fullName LIKE ? OR o.phone LIKE ? OR o.email LIKE ?)");
      params.push(like, like, like, like);
    }
    if (from) { where.push("datetime(o.createdAt) >= datetime(?)"); params.push(from); }
    if (to)   { where.push("datetime(o.createdAt) <= datetime(?)"); params.push(to); }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totalSql = `
      SELECT COUNT(*) AS n
      FROM orders o
      LEFT JOIN admin_order_meta a ON (a.order_id = o.orderNumber OR a.order_id = CAST(o.id AS TEXT))
      ${whereSql}
    `;
    const total = db.prepare(totalSql).get(...params).n;

    const listSql = `
      SELECT 
        o.id,
        o.orderNumber,
        o.fullName,
        o.phone,
        o.email,
        COALESCE(a.status, o.status)                 AS status,
        o.createdAt,
        /* If overlay/base totals are zero, fall back to non-zero sources */
        COALESCE(NULLIF(a.total_cents, 0), NULLIF(o.totalCents, 0), o.totalCents) AS totalCents,
        COALESCE(
          NULLIF(a.deposit_cents, 0),
          NULLIF(o.depositCents, 0),
          (SELECT COALESCE(SUM(oi.depositCents),0) FROM order_items oi WHERE oi.order_id = o.id)
        ) AS depositCents,
        COALESCE(a.currency,      o.currency)        AS currency,
        a.notes                                      AS notes,
        COALESCE(a.driver_id,     o.driverId)        AS driverId,
        o.address
      FROM orders o
      LEFT JOIN admin_order_meta a ON a.order_id = o.orderNumber
      ${whereSql}
      ORDER BY datetime(o.createdAt) DESC
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(listSql).all(...params, per, offset);

    res.json({ success: true, page, per, total, orders: rows.map(mapRow) });
  } catch (err) {
    console.error("[admin-orders] GET / failed:", err);
    res.status(500).json({ success: false, error: "SERVER_ERROR" });
  }
});

// === DETAIL: GET /api/admin/orders/:idOrNumber ===
router.get("/:id", (req, res) => {
  try {
    const key = String(req.params.id || "").trim();
    const useWatt = isWattKey(key);
    const byNumeric = toNumOrNeg1(key);

    // Base row
    const base = useWatt
      ? db.prepare("SELECT * FROM orders WHERE orderNumber = ?").get(key)
      : db.prepare("SELECT * FROM orders WHERE id = ? OR orderNumber = ?").get(byNumeric, key);

    if (!base) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    // Overlay strictly by orderNumber
    const overlay = db
      .prepare(
        `SELECT 
           notes,
           total_cents   AS totalCentsOverlay,
           deposit_cents AS depositCentsOverlay,
           currency      AS currencyOverlay,
           driver_id     AS driverIdOverlay,
           status        AS statusOverlay
         FROM admin_order_meta
         WHERE order_id = ?`
      )
      .get(base.orderNumber);

    // Fallback: if no top-level depositCents, compute from items
    const merged = mergeOverlay(base, overlay);
    try {
      const sumRow = db.prepare("SELECT COALESCE(SUM(depositCents),0) AS c FROM order_items WHERE order_id = ?").get(base.id);
      const itemsDeposit = (sumRow && typeof sumRow.c === 'number') ? sumRow.c : 0;
      if (merged && (merged.depositCents == null || Number(merged.depositCents) === 0) && itemsDeposit > 0) {
        merged.depositCents = itemsDeposit;
      }
    } catch {}
    return res.json({ success: true, order: mapRow(merged) });
  } catch (err) {
    console.error("[admin-orders] GET /:id failed:", err);
    res.status(500).json({ success: false, error: "SERVER_ERROR" });
  }
});

// === CREATE: POST /api/admin/orders ===
router.post("/", express.json(), (req, res) => {
  try {
    const body = req.body || {};

    const fullName = body.fullName ?? body.customerName ?? body.name;
    const phone = body.phone;
    const email = body.email ?? null;
    const status = body.status ?? "Pending";
    const currency = (body.currency || "KES").toUpperCase();
    const totalCents = Number.isFinite(+body.totalCents) ? +body.totalCents : null;
    const depositCents = Number.isFinite(+body.depositCents) ? +body.depositCents : null;
    const address = body.address ?? null;
    const driverId =
      body.driverId === undefined || body.driverId === "" ? null : body.driverId;
    const notes = body.notes ?? null;

    if (!fullName || !phone) {
      return res.status(400).json({ success: false, error: "REQUIRED_FIELDS" });
    }

    const orderNumber = "WATT" + Date.now();

    // Insert base (no notes column here)
    db.prepare(
      `INSERT INTO orders 
         (orderNumber, fullName, phone, email, status, totalCents, depositCents, currency, address, driverId, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      orderNumber,
      fullName,
      phone,
      email,
      status,
      totalCents,
      depositCents,
      currency,
      address,
      driverId
    );

    // Upsert overlay
    db.prepare(
      `INSERT INTO admin_order_meta (order_id, status, driver_id, notes, total_cents, deposit_cents, currency, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(order_id) DO UPDATE SET
         status        = COALESCE(excluded.status, admin_order_meta.status),
         driver_id     = COALESCE(excluded.driver_id, admin_order_meta.driver_id),
         notes         = COALESCE(excluded.notes, admin_order_meta.notes),
         total_cents   = COALESCE(excluded.total_cents, admin_order_meta.total_cents),
         deposit_cents = COALESCE(excluded.deposit_cents, admin_order_meta.deposit_cents),
         currency      = COALESCE(excluded.currency, admin_order_meta.currency),
         updated_at    = excluded.updated_at`
    ).run(
      orderNumber,
      status,
      driverId,
      notes,
      totalCents,
      depositCents,
      currency,
      nowIso()
    );

    return res.json({ success: true, orderNumber });
  } catch (err) {
    console.error("[admin-orders] POST / failed:", err);
    res.status(500).json({ success: false, error: "SERVER_ERROR" });
  }
});

// === UPDATE: PATCH /api/admin/orders/:idOrNumber ===
router.patch("/:id", express.json(), (req, res) => {
  try {
    const key = String(req.params.id || "").trim();
    const useWatt = isWattKey(key);
    const byNumeric = toNumOrNeg1(key);
    const body = req.body || {};

    // Resolve base (need orderNumber for overlay key)
    const base = useWatt
      ? db.prepare("SELECT id, orderNumber FROM orders WHERE orderNumber = ?").get(key)
      : db.prepare("SELECT id, orderNumber FROM orders WHERE id = ? OR orderNumber = ?").get(byNumeric, key);

    if (!base) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    // 1) Update base table fields present in orders
    const set = [];
    const vals = [];
    if ("status" in body)      { set.push("status = ?");       vals.push(body.status); }
    if ("totalCents" in body)  { set.push("totalCents = ?");   vals.push(body.totalCents === "" ? null : Number(body.totalCents)); }
    if ("depositCents" in body){ set.push("depositCents = ?"); vals.push(body.depositCents === "" ? null : Number(body.depositCents)); }
    if ("currency" in body)    { set.push("currency = ?");     vals.push((body.currency || "KES").toUpperCase()); }
    if ("address" in body)     { set.push("address = ?");      vals.push(body.address ?? null); }
    if ("driverId" in body)    { set.push("driverId = ?");     vals.push(body.driverId === "" ? null : body.driverId); }

    if (set.length) {
      const sql = useWatt
        ? `UPDATE orders SET ${set.join(", ")} WHERE orderNumber = ?`
        : `UPDATE orders SET ${set.join(", ")} WHERE id = ? OR orderNumber = ?`;
      const args = useWatt ? [...vals, key] : [...vals, byNumeric, key];
      const r = db.prepare(sql).run(...args);
      if (r.changes === 0) {
        return res.status(404).json({ success: false, error: "NOT_FOUND" });
      }
    }

    // 2) Upsert overlay — keyed strictly by orderNumber
    const overlaySet = [];
    const overlayVals = [];
    if ("status" in body)      { overlaySet.push("status = ?");         overlayVals.push(body.status); }
    if ("driverId" in body)    { overlaySet.push("driver_id = ?");      overlayVals.push(body.driverId === "" ? null : body.driverId); }
    if ("notes" in body)       { overlaySet.push("notes = ?");          overlayVals.push(body.notes ?? null); }
    if ("totalCents" in body)  { overlaySet.push("total_cents = ?");    overlayVals.push(body.totalCents === "" ? null : Number(body.totalCents)); }
    if ("depositCents" in body){ overlaySet.push("deposit_cents = ?");  overlayVals.push(body.depositCents === "" ? null : Number(body.depositCents)); }
    if ("currency" in body)    { overlaySet.push("currency = ?");       overlayVals.push((body.currency || "KES").toUpperCase()); }

    if (overlaySet.length) {
      db.prepare(
        `INSERT OR IGNORE INTO admin_order_meta (order_id, status, updated_at)
         VALUES (?, ?, ?)`
      ).run(base.orderNumber, body.status ?? null, nowIso());

      const sql = `UPDATE admin_order_meta SET ${overlaySet.join(", ")}, updated_at = ? WHERE order_id = ?`;
      db.prepare(sql).run(...overlayVals, nowIso(), base.orderNumber);
    }

    // 3) Return merged snapshot
    const freshBase = (useWatt
      ? db.prepare("SELECT * FROM orders WHERE orderNumber = ?").get(key)
      : db.prepare("SELECT * FROM orders WHERE id = ? OR orderNumber = ?").get(byNumeric, key)
    );
    const freshOverlay = db
      .prepare(
        `SELECT 
           notes,
           total_cents   AS totalCentsOverlay,
           deposit_cents AS depositCentsOverlay,
           currency      AS currencyOverlay,
           driver_id     AS driverIdOverlay,
           status        AS statusOverlay
         FROM admin_order_meta WHERE order_id = ?`
      )
      .get(freshBase.orderNumber);

    const merged = mergeOverlay(freshBase, freshOverlay);
    return res.json({ success: true, order: mapRow(merged) });
  } catch (err) {
    console.error("[admin-orders] PATCH /:id failed:", err);
    res.status(500).json({ success: false, error: "SERVER_ERROR" });
  }
});

module.exports = router;
