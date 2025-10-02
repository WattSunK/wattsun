// routes/admin-orders.js
const express = require("express");
const router = express.Router();
const Database = require("better-sqlite3");

// Direct DB connection (adjust path if needed)
const db = new Database("/volume1/web/wattsun/data/dev/wattsun.dev.db");

// ---------- helpers ----------
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
    notes: row.notes ?? null, // merged from overlay on detail
    address: row.address ?? null,
    driverId: row.driverId ?? null,
  };
}

function toNumOrNeg1(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : -1;
}

function nowIso() {
  return new Date().toISOString();
}

// ---------- LIST: GET /api/admin/orders?page=&per= ----------
router.get("/", (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const per = parseInt(req.query.per || "10", 10);
    const offset = (page - 1) * per;

    const totalRow = db.prepare("SELECT COUNT(*) AS n FROM orders").get();
    const rows = db
      .prepare(
        "SELECT * FROM orders ORDER BY datetime(createdAt) DESC LIMIT ? OFFSET ?"
      )
      .all(per, offset);

    res.json({
      success: true,
      page,
      per,
      total: totalRow.n,
      orders: rows.map(mapRow),
    });
  } catch (e) {
    console.error("[admin-orders] GET / failed:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---------- DETAIL: GET /api/admin/orders/:idOrNumber ----------
router.get("/:id", (req, res) => {
  try {
    const key = String(req.params.id || "").trim();
    const byNumeric = toNumOrNeg1(key);

    // base row by numeric id OR orderNumber
    const base = db
      .prepare("SELECT * FROM orders WHERE id = ? OR orderNumber = ?")
      .get(byNumeric, key);

    if (!base) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    // overlay lookup – primary key is admin_order_meta.order_id
    // prefer orderNumber (WATT...), fall back to string(id)
    const overlay =
      db
        .prepare(
          `SELECT notes, total_cents AS totalCentsOverlay,
                  deposit_cents AS depositCentsOverlay,
                  currency AS currencyOverlay,
                  driver_id AS driverIdOverlay,
                  status AS statusOverlay,
                  updated_at
             FROM admin_order_meta
            WHERE order_id = ?`
        )
        .get(base.orderNumber) ||
      db
        .prepare(
          `SELECT notes, total_cents AS totalCentsOverlay,
                  deposit_cents AS depositCentsOverlay,
                  currency AS currencyOverlay,
                  driver_id AS driverIdOverlay,
                  status AS statusOverlay,
                  updated_at
             FROM admin_order_meta
            WHERE order_id = ?`
        )
        .get(String(base.id));

    const merged = { ...base };
    if (overlay) {
      // Merge overlay into base (overlay wins when present)
      if (overlay.statusOverlay) merged.status = overlay.statusOverlay;
      if (overlay.driverIdOverlay !== undefined && overlay.driverIdOverlay !== null)
        merged.driverId = overlay.driverIdOverlay;
      if (overlay.notes !== undefined) merged.notes = overlay.notes ?? null;
      if (overlay.totalCentsOverlay !== undefined && overlay.totalCentsOverlay !== null)
        merged.totalCents = overlay.totalCentsOverlay;
      if (overlay.depositCentsOverlay !== undefined && overlay.depositCentsOverlay !== null)
        merged.depositCents = overlay.depositCentsOverlay;
      if (overlay.currencyOverlay) merged.currency = overlay.currencyOverlay;
      // address stays from base only
    }

    res.json({ success: true, order: mapRow(merged) });
  } catch (e) {
    console.error("[admin-orders] GET /:id failed:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---------- CREATE: POST /api/admin/orders ----------
router.post("/", express.json(), (req, res) => {
  try {
    const body = req.body || {};

    const fullName = body.fullName ?? body.customerName ?? body.name;
    const phone = body.phone;
    const email = body.email ?? null;
    const status = body.status ?? "Pending";
    const currency = (body.currency || "KES").toUpperCase();
    const totalCents =
      Number.isFinite(+body.totalCents) ? +body.totalCents : null;
    const depositCents =
      Number.isFinite(+body.depositCents) ? +body.depositCents : null;
    const address = body.address ?? null;
    const driverId =
      body.driverId === undefined || body.driverId === ""
        ? null
        : body.driverId;

    if (!fullName || !phone) {
      return res
        .status(400)
        .json({ success: false, error: "REQUIRED_FIELDS" });
    }

    const orderNumber = "WATT" + Date.now(); // simple generator

    // IMPORTANT: base table insert — do NOT include 'notes' (column doesn't exist)
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

    // Overlay upsert (admin_order_meta.order_id) to store notes and optional overlays
    // Schema: order_id (PK), status, driver_id, notes, updated_at, total_cents, deposit_cents, currency
    const overlayNotes = body.notes ?? null;
    db.prepare(
      `INSERT INTO admin_order_meta (order_id, status, driver_id, notes, total_cents, deposit_cents, currency, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(order_id) DO UPDATE SET
         status         = COALESCE(excluded.status, admin_order_meta.status),
         driver_id      = COALESCE(excluded.driver_id, admin_order_meta.driver_id),
         notes          = COALESCE(excluded.notes, admin_order_meta.notes),
         total_cents    = COALESCE(excluded.total_cents, admin_order_meta.total_cents),
         deposit_cents  = COALESCE(excluded.deposit_cents, admin_order_meta.deposit_cents),
         currency       = COALESCE(excluded.currency, admin_order_meta.currency),
         updated_at     = excluded.updated_at`
    ).run(
      orderNumber,
      status,
      driverId,
      overlayNotes,
      totalCents,
      depositCents,
      currency,
      nowIso()
    );

    res.json({ success: true, orderNumber });
  } catch (e) {
    console.error("[admin-orders] POST / failed:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---------- UPDATE: PATCH /api/admin/orders/:idOrNumber ----------
router.patch("/:id", express.json(), (req, res) => {
  try {
    const key = String(req.params.id || "").trim();
    const byNumeric = toNumOrNeg1(key);
    const body = req.body || {};

    // Build base UPDATE for columns that exist in orders
    const set = [];
    const args = [];

    if ("status" in body) {
      set.push("status = ?");
      args.push(body.status);
    }
    if ("totalCents" in body) {
      set.push("totalCents = ?");
      args.push(body.totalCents);
    }
    if ("depositCents" in body) {
      set.push("depositCents = ?");
      args.push(body.depositCents);
    }
    if ("currency" in body) {
      set.push("currency = ?");
      args.push((body.currency || "KES").toUpperCase());
    }
    if ("address" in body) {
      set.push("address = ?");
      args.push(body.address ?? null);
    }
    if ("driverId" in body) {
      set.push("driverId = ?");
      args.push(
        body.driverId === undefined || body.driverId === ""
          ? null
          : body.driverId
      );
    }
    // DO NOT touch 'notes' here in base table (it doesn't exist)

    if (set.length) {
      const sql = `UPDATE orders SET ${set.join(
        ", "
      )} WHERE id = ? OR orderNumber = ?`;
      const r = db.prepare(sql).run(...args, byNumeric, key);
      if (r.changes === 0) {
        return res
          .status(404)
          .json({ success: false, error: "Order not found" });
      }
    }

    // Overlay upsert for notes (+ mirror other fields when provided)
    const overlaySet = [];
    const overlayVals = [];
    if ("status" in body) {
      overlaySet.push("status = ?");
      overlayVals.push(body.status);
    }
    if ("driverId" in body) {
      overlaySet.push("driver_id = ?");
      overlayVals.push(
        body.driverId === undefined || body.driverId === ""
          ? null
          : body.driverId
      );
    }
    if ("notes" in body) {
      overlaySet.push("notes = ?");
      overlayVals.push(body.notes ?? null);
    }
    if ("totalCents" in body) {
      overlaySet.push("total_cents = ?");
      overlayVals.push(
        Number.isFinite(+body.totalCents) ? +body.totalCents : null
      );
    }
    if ("depositCents" in body) {
      overlaySet.push("deposit_cents = ?");
      overlayVals.push(
        Number.isFinite(+body.depositCents) ? +body.depositCents : null
      );
    }
    if ("currency" in body) {
      overlaySet.push("currency = ?");
      overlayVals.push((body.currency || "KES").toUpperCase());
    }

    if (overlaySet.length) {
      // We need the orderNumber to key overlay. Accept either numeric id or orderNumber in path.
      const base = db
        .prepare("SELECT id, orderNumber FROM orders WHERE id = ? OR orderNumber = ?")
        .get(byNumeric, key);
      if (!base) {
        return res
          .status(404)
          .json({ success: false, error: "Order not found" });
      }

      // Ensure a row exists (INSERT OR IGNORE), then UPDATE with provided fields + timestamp
      db.prepare(
        `INSERT OR IGNORE INTO admin_order_meta (order_id, status, updated_at)
         VALUES (?, ?, ?)`
      ).run(base.orderNumber, body.status ?? null, nowIso());

      const sql = `UPDATE admin_order_meta SET ${overlaySet.join(
        ", "
      )}, updated_at = ? WHERE order_id = ?`;
      db.prepare(sql).run(...overlayVals, nowIso(), base.orderNumber);
    }

    // Return merged snapshot like GET detail
    const merged = (() => {
      const base = db
        .prepare("SELECT * FROM orders WHERE id = ? OR orderNumber = ?")
        .get(byNumeric, key);
      if (!base) return null;
      const overlay =
        db
          .prepare(
            `SELECT notes, total_cents AS totalCentsOverlay,
                    deposit_cents AS depositCentsOverlay,
                    currency AS currencyOverlay,
                    driver_id AS driverIdOverlay,
                    status AS statusOverlay
               FROM admin_order_meta WHERE order_id = ?`
          )
          .get(base.orderNumber) ||
        db
          .prepare(
            `SELECT notes, total_cents AS totalCentsOverlay,
                    deposit_cents AS depositCentsOverlay,
                    currency AS currencyOverlay,
                    driver_id AS driverIdOverlay,
                    status AS statusOverlay
               FROM admin_order_meta WHERE order_id = ?`
          )
          .get(String(base.id));
      if (overlay) {
        if (overlay.statusOverlay) base.status = overlay.statusOverlay;
        if (overlay.driverIdOverlay !== undefined && overlay.driverIdOverlay !== null)
          base.driverId = overlay.driverIdOverlay;
        if (overlay.notes !== undefined) base.notes = overlay.notes ?? null;
        if (overlay.totalCentsOverlay !== undefined && overlay.totalCentsOverlay !== null)
          base.totalCents = overlay.totalCentsOverlay;
        if (overlay.depositCentsOverlay !== undefined && overlay.depositCentsOverlay !== null)
          base.depositCents = overlay.depositCentsOverlay;
        if (overlay.currencyOverlay) base.currency = overlay.currencyOverlay;
      }
      return base;
    })();

    res.json({ success: true, order: mapRow(merged) });
  } catch (e) {
    console.error("[admin-orders] PATCH /:id failed:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
