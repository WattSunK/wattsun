// routes/track.js — Customer Tracking API (robust overlay merge)
// - Reads legacy orders from JSON
// - GET /api/track?phone=... [&order=...] [&status=...] [&email=...]
// - Merges admin overlay from SQLite (admin_order_meta) without assuming new columns exist
//
// Safe to mount:
//   app.use("/api/track", require("./routes/track"));
//
// © WattSun 2025

const express = require("express");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();

// ---------- Config ----------
const ORDERS_PATH =
  process.env.ORDERS_JSON ||
  path.join(__dirname, "../data/orders.json");

const USERS_DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(__dirname, "../data/dev/wattsun.dev.db");

// ---------- Helpers: read + normalize legacy orders ----------
function readOrders() {
  try {
    const raw = fs.readFileSync(ORDERS_PATH, "utf8");
    const json = JSON.parse(raw);
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.orders)) return json.orders;
    return [];
  } catch (e) {
    console.error("[track] readOrders error:", e.message, "path=", ORDERS_PATH);
    return [];
  }
}

const onlyDigits = (s) => String(s || "").replace(/\D+/g, "");
function normPhone(p) {
  const d = onlyDigits(p);
  if (!d) return "";
  // Normalize to E.164-like without plus. If number starts with 0 and is Kenyan, coerce to 254.
  if (d.startsWith("0") && d.length >= 10) return "254" + d.slice(1);
  // If already starts with 254 or 255 etc, keep as is.
  return d.startsWith("254") ? d : ("254" + d); // adjust if your deployment is multi-country
}
const normEmail = (e) => String(e || "").trim().toLowerCase();
const ieq = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

function shape(o) {
  return {
    orderNumber:     o.orderNumber ?? o.id ?? o.orderId ?? o.order_id ?? "—",
    status:          o.status ?? "Pending",
    updatedAt:       o.updatedAt ?? o.timestamp ?? o.createdAt ?? null,
    fullName:        o.fullName ?? o.name ?? o.customer ?? "",
    deliveryAddress: o.deliveryAddress ?? o.address ?? "",
    paymentType:     o.paymentType ?? o.paymentMethod ?? o.payment ?? "",
    total:           o.total ?? o.amount ?? o.netValue ?? 0,
    deposit:         o.deposit ?? null,
    currency:        o.currency ?? "KES",
    phone:           o.phone ?? o.msisdn ?? o.customerPhone ?? "",
    email:           o.email ?? o.customerEmail ?? "",
    driverId:        o.driverId ?? o.driver_id ?? null,
    notes:           o.notes ?? o.note ?? "",
  };
}

function findByPhone(all, phone) {
  const p = normPhone(phone);
  return all
    .map(shape)
    .filter(x => onlyDigits(x.phone).endsWith(onlyDigits(p)));
}

function findByEmail(all, email) {
  const e = normEmail(email);
  if (!e) return [];
  return all
    .map(shape)
    .filter(x => ieq(x.email, e));
}

function applyFilters(list, { status, order }) {
  let out = list;
  if (status) {
    const s = String(status).trim();
    out = out.filter(o => o.status === s);
  }
  if (order) {
    const q = String(order).trim();
    out = out.filter(o => String(o.orderNumber) === q);
  }
  // default sort: most recent first if updatedAt present
  out.sort((a,b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return out;
}

// ---------- Overlay (admin_order_meta) ----------
function openUsersDb() {
  try {
    return new sqlite3.Database(USERS_DB_PATH);
  } catch (e) {
    console.error("[track] DB open failed:", e.message, "path=", USERS_DB_PATH);
    return null;
  }
}

function getOverlayCols(db, cb) {
  db.all("PRAGMA table_info(admin_order_meta)", (err, rows) => {
    if (err) return cb(err, null);
    const names = new Set((rows || []).map(r => r.name));
    const cols = ["order_id", "status", "driver_id", "notes"]; // base columns always present
    if (names.has("total_cents"))   cols.push("total_cents");
    if (names.has("deposit_cents")) cols.push("deposit_cents");
    if (names.has("currency"))      cols.push("currency");
    cols.push("updated_at");
    cb(null, cols);
  });
}

function loadOverlay(ids = []) {
  return new Promise((resolve) => {
    if (!ids.length) return resolve({});
    const db = openUsersDb();
    if (!db) return resolve({});
    getOverlayCols(db, (e, cols) => {
      if (e || !cols) { try { db.close(); } catch {} return resolve({}); }
      const placeholders = ids.map(() => "?").join(",");
      const sql = `SELECT ${cols.join(", ")} FROM admin_order_meta WHERE order_id IN (${placeholders})`;
      const map = {};
      db.all(sql, ids, (err, rows) => {
        if (err) {
          console.error("[track] overlay select error:", err.message);
          try { db.close(); } catch {}
          return resolve({});
        }
        for (const r of rows || []) map[r.order_id] = r;
        try { db.close(); } catch {}
        resolve(map);
      });
    });
  });
}

async function mergeOverlay(list) {
  const centsToUnits = (c) => {
    const n = Number(c);
    return Number.isFinite(n) ? Number((n / 100).toFixed(2)) : null;
  };

  try {
    const ids = list.map(o => o.orderNumber).filter(Boolean);
    const overlay = await loadOverlay(ids);
    for (const o of list) {
      const ov = overlay[o.orderNumber];
      if (!ov) continue;

      if (ov.status) o.status = ov.status;
      if (typeof ov.driver_id !== "undefined") o.driverId = ov.driver_id;
      if (typeof ov.notes === "string") o.notes = ov.notes;

      // Money + currency only if the columns existed in DB
      if ("total_cents" in ov)   { const t = centsToUnits(ov.total_cents);   if (t !== null) o.total = t; }
      if ("deposit_cents" in ov) { const d = centsToUnits(ov.deposit_cents); if (d !== null) o.deposit = d; }
      if ("currency" in ov && ov.currency) o.currency = ov.currency;

      if (ov.updated_at && !o.updatedAt) o.updatedAt = ov.updated_at;
    }
  } catch (e) {
    console.error("[track] overlay merge error:", e.message);
  }
  return list;
}

// ---------- Route ----------
router.get("/", async (req, res) => {
  try {
    const phone  = req.query.phone  || req.body?.phone  || req.headers["x-phone"];
    const email  = req.query.email  || req.body?.email  || req.headers["x-email"];
    const status = req.query.status || req.body?.status;
    const order  = req.query.order  || req.body?.order;

    if (!phone && !email) {
      return res.status(400).json({ success: false, error: "Phone or Email required" });
    }

    const all = readOrders();
    let list = [];
    if (phone) list = findByPhone(all, phone);
    if (list.length === 0 && email) list = findByEmail(all, email);

    let out = applyFilters(list, { status, order });
    out = await mergeOverlay(out);

    return res.json({ success: true, total: out.length, orders: out });
  } catch (e) {
    console.error("[track] route error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

module.exports = router;
