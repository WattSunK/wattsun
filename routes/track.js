// routes/track.js
// Public tracking endpoint: GET /api/track
// Returns orders filtered by phone/email (+ optional status, order, pagination),
// merged with admin overlay fields from SQLite (status, driverId, notes, totals, currency).

const fs = require("fs");
const path = require("path");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const router = express.Router();

const ORDERS_JSON =
  process.env.ORDERS_JSON ||
  path.join(__dirname, "../orders.json"); // symlink points to data/dev/orders.dev.json

// ---------- helpers ----------
function normalizePhone(p) {
  if (!p) return "";
  const digits = String(p).replace(/[^\d]/g, "");
  // keep last 9 digits for Kenya
  return digits.slice(-9);
}

function shape(o) {
  return {
    orderNumber:     o.orderNumber ?? o.id ?? o.orderId ?? o.order_id ?? null,
    status:          o.status ?? "Pending",
    updatedAt:       o.updatedAt ?? o.timestamp ?? o.createdAt ?? null,
    fullName:        o.fullName ?? o.name ?? o.customer ?? "",
    deliveryAddress: o.deliveryAddress ?? o.address ?? "",
    paymentType:     o.paymentType ?? o.paymentMethod ?? o.payment ?? "",
    total:           o.total ?? o.amount ?? o.netValue ?? null,
    deposit:         o.deposit ?? null,
    currency:        o.currency ?? "KES",
    phone:           o.phone ?? o.msisdn ?? o.customerPhone ?? "",
    email:           o.email ?? o.customerEmail ?? "",
    driverId:        o.driverId ?? o.driver_id ?? null,
    notes:           o.notes ?? o.note ?? "",
    // NEW: include line items for modals/pages
    items:           Array.isArray(o.items) ? o.items : (Array.isArray(o.cart) ? o.cart : []),
  };
}

function readOrders() {
  try {
    const txt = fs.readFileSync(ORDERS_JSON, "utf8");
    return JSON.parse(txt);
  } catch {
    return [];
  }
}

function findByPhone(all, phone) {
  const norm = normalizePhone(phone);
  return all.filter((o) => normalizePhone(o.phone) === norm);
}
function findByEmail(all, email) {
  const e = String(email).trim().toLowerCase();
  return all.filter((o) => String(o.email).trim().toLowerCase() === e);
}

function applyFilters(list, { status, order }) {
  let out = list.map(shape);
  if (status) out = out.filter((o) => o.status === String(status).trim());
  if (order) out = out.filter((o) => String(o.orderNumber) === String(order).trim());
  return out;
}

async function mergeOverlay(orders) {
  return new Promise((resolve) => {
    const dbPath =
      process.env.DB_PATH_USERS ||
      process.env.SQLITE_DB ||
      path.join(__dirname, "../data/dev/wattsun.dev.db");

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.warn("[track] overlay DB open failed:", err.message);
        resolve(orders);
      }
    });
    db.serialize(() => {
      db.all(
        `SELECT order_id,status,driver_id,notes,total_cents,deposit_cents,currency 
         FROM admin_order_meta`,
        (err, rows) => {
          if (err) {
            console.warn("[track] overlay read failed:", err.message);
            resolve(orders);
            return;
          }
          const map = {};
          for (const r of rows) {
            map[r.order_id] = r;
          }
          const merged = orders.map((o) => {
            const ov = map[o.orderNumber];
            if (!ov) return o;
            return {
              ...o,
              status: ov.status || o.status,
              driverId: ov.driver_id ?? ov.driverId,
              notes: ov.notes ?? o.notes,
              total: ov.total_cents != null ? Math.round(ov.total_cents / 100) : o.total,
              deposit: ov.deposit_cents != null ? Math.round(ov.deposit_cents / 100) : o.deposit,
              currency: ov.currency || o.currency,
            };
          });
          resolve(merged);
        }
      );
    });
    db.close();
  });
}

// ---------- route ----------
router.get("/", async (req, res) => {
  try {
    const phone  = req.query.phone  || req.body?.phone  || req.headers["x-phone"];
    const email  = req.query.email  || req.body?.email  || req.headers["x-email"];
    const status = req.query.status || req.body?.status;
    const order  = req.query.order  || req.body?.order;

    if (!phone && !email && !order) {
      return res.status(400).json({ success: false, error: "Phone or Email required" });
    }

    const all = readOrders();
    let list = [];
    if (phone) list = findByPhone(all, phone);
    if (list.length === 0 && email) list = findByEmail(all, email);

    // Normal path: apply filters
    let out = applyFilters(list, { status, order });

    // NEW: fallback if explicit order= but phone/email match yields none
    if (out.length === 0 && order) {
      const global = all.map(shape).filter(o => String(o.orderNumber) === String(order).trim());
      out = status ? global.filter(o => o.status === String(status).trim()) : global;
    }

    out = await mergeOverlay(out);

    // pagination
    const page = parseInt(req.query.page || "1", 10);
    const per  = parseInt(req.query.per  || "5", 10);
    const start = (page - 1) * per;
    const paged = out.slice(start, start + per);

    res.json({
      success: true,
      page,
      per,
      total: out.length,
      orders: paged,
    });
  } catch (e) {
    console.error("[track] failed:", e);
    res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

module.exports = router;
