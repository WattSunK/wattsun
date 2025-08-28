// routes/track.js — Customer Tracking API (Step 6.5 ready)
// - Reads legacy orders from JSON (ORDERS_PATH)
// - GET /api/track?phone=... [&order=...] [&status=...] [&email=...]
// - Merges admin overlay from SQLite (admin_order_meta), auto-detecting optional money columns
//
// Safe to mount:
//   app.use("/api/track", require("./routes/track"));

const express = require("express");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();

// ---------- Config ----------
const ORDERS_PATH =
  process.env.ORDERS_JSON ||
  path.join(__dirname, "../data/orders.json");
console.log("[track] ORDERS_PATH:", ORDERS_PATH);

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
function last9(s) { return onlyDigits(s).slice(-9); }

const normEmail = (e) => String(e || "").trim().toLowerCase();
const ieq = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

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
  };
}

function findByPhone(all, phone) {
  const q9 = last9(phone);
  return all
    .map(shape)
    .filter(x => last9(x.phone) === q9);
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
  // sort: most recent first if updatedAt present
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
    const cols = ["order_id", "status", "driver_id", "notes"]; // base columns
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

      if ("total_cents"   in ov) { const t = centsToUnits(ov.total_cents);   if (t !== null) o.total = t; }
      if ("deposit_cents" in ov) { const d = centsToUnits(ov.deposit_cents); if (d !== null) o.deposit = d; }
      if ("currency"      in ov && ov.currency) o.currency = ov.currency;

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

    const payload = { success: true, total: out.length, orders: out };

    // ---------- diagnostics ----------
    if (String(req.query._diag || "") === "1") {
      const diag = {};
      diag.ORDERS_JSON_env = process.env.ORDERS_JSON || null;
      try {
        const st = fs.statSync(ORDERS_PATH);
        diag.orders_path = ORDERS_PATH;
        diag.orders_path_exists = true;
        diag.orders_path_size = st.size;
      } catch (e) {
        diag.orders_path = ORDERS_PATH;
        diag.orders_path_exists = false;
        diag.orders_path_error = e.message;
      }
      diag.orders_total = Array.isArray(all) ? all.length : 0;
      if (diag.orders_total > 0) {
        diag.sample_keys = Object.keys(all[0]).slice(0, 12);
      }
      diag.phone_query = phone || null;
      diag.phone_norm = phone ? last9(phone) : null;
      diag.order_query = order || null;
      diag.phone_filtered_count = list.length;
      if (list[0]) {
        diag.phone_filtered_first_order =
          list[0].orderNumber || list[0].id || list[0].order_id;
      }
      payload.diag = diag;
    }

    return res.json(payload);
  } catch (e) {
    console.error("[track] route error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

module.exports = router;
