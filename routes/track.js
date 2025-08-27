// routes/track.js — V6.4 (Customer Reflection)
// Drop-in replacement. Backward compatible with legacy behavior, plus overlay merge.
//
// - Reads orders from orders.json (legacy source)
// - Allows phone lookup (required on GET), optional status/order filters
// - If phone yields 0 results, falls back to email (from query/header/body)
// - NEW: Merges admin overlay from SQLite table `admin_order_meta` (Users DB)
//   DB path auto-detected from env: DB_PATH_USERS || SQLITE_DB || ./data/dev/wattsun.dev.db
//
// Safe to require in server.js as:
//   app.use("/api/track", require("./routes/track"));
//
// © WattSun 2025

const express = require("express");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();

// ---- Data locations
const ordersPath = path.join(__dirname, "../orders.json");
const DEFAULT_USERS_DB = path.join(__dirname, "../data/dev/wattsun.dev.db");
const USERS_DB_PATH = process.env.DB_PATH_USERS || process.env.SQLITE_DB || DEFAULT_USERS_DB;

// ---------- utils ----------
function readOrders() {
  try { return JSON.parse(fs.readFileSync(ordersPath, "utf8")); }
  catch (err) { console.error("[track] Error reading orders.json:", err.message); return []; }
}

// Normalize Kenyan numbers like 0722..., 254722..., +254722...
function normalizePhone(phone) {
  if (!phone) return "";
  let p = String(phone).replace(/\s+/g, "").replace(/[-()]/g, "");
  // Remove leading '+' for handling, add back later if needed
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("00")) p = p.slice(2);
  // Common forms:
  // 0XXXXXXXXX  → drop leading 0
  if (p.startsWith("0")) p = p.slice(1);
  // 254XXXXXXXXX or 7XXXXXXXX → ensure 254 prefix
  if (!p.startsWith("254")) {
    if (p.length === 9 && /^[17]\d{8}$/.test(p)) p = "254" + p;
  }
  return "+".concat(p.startsWith("254") ? p : ("254" + p));
}

const normEmail = (e) => String(e || "").trim().toLowerCase();
const ieq = (a,b) => String(a||"").toLowerCase() === String(b||"").toLowerCase();

function shape(o){
  return {
    orderNumber:     o.orderNumber || o.id || o.orderId || o.order_id || "—",
    status:          o.status || "Pending",
    updatedAt:       o.updatedAt || o.timestamp || o.createdAt || null,
    fullName:        o.fullName || o.name || o.customer || "",
    deliveryAddress: o.deliveryAddress || o.address || "",
    paymentType:     o.paymentType || o.paymentMethod || o.payment || "",
    total:           o.total ?? o.amount ?? o.netValue ?? 0,
    deposit:         o.deposit ?? null,
    cart_summary:    o.cart_summary || ""
  };
}

function findByPhone(all, phone) {
  const n = normalizePhone(phone);
  return all.filter(o => normalizePhone(o.phone) === n).map(shape);
}
function findByEmail(all, email) {
  const e = normEmail(email);
  if (!e) return [];
  return all.filter(o => normEmail(o.email) === e).map(shape);
}

function applyFilters(list, { status, order }){
  let out = Array.isArray(list) ? list.slice() : [];
  if (status) out = out.filter(o => ieq(o.status, status));
  if (order)  out = out.filter(o => ieq(o.orderNumber, order));
  return out;
}

function getEmailFallback(req){
  // priority: query → header → body
  const q = req.query?.email;
  if (q) return q;
  const h = req.get("X-WS-Email") || req.get("X-Email");
  if (h) return h;
  if (req.body && typeof req.body === "object") {
    return req.body.email || req.body.userEmail || "";
  }
  return "";
}

// ---- Overlay (admin_order_meta) helpers
function openUsersDb() {
  try { return new sqlite3.Database(USERS_DB_PATH); }
  

function getOverlayCols(db, cb) {
  db.all("PRAGMA table_info(admin_order_meta)", (err, rows) => {
    if (err) return cb(err, null);
    const names = new Set((rows || []).map(r => r.name));
    const cols = ["order_id", "status", "driver_id", "notes"];
    if (names.has("total_cents"))   cols.push("total_cents");
    if (names.has("deposit_cents")) cols.push("deposit_cents");
    if (names.has("currency"))      cols.push("currency");
    cols.push("updated_at");
    cb(null, cols);
  });
}
catch (e) { console.error("[track] DB open failed:", e.message); return null; }
}

function loadOverlay(ids = []) {
  return new Promise((resolve) => {
    if (!ids.length) return resolve({});
    const db = openUsersDb();
    if (!db) return resolve({});
    getOverlayCols(db, (e, cols) => {
      if (e || !cols) { try{db.close();}catch{}; return resolve({}); }
      const placeholders = ids.map(() => "?").join(",");
      const sql = `SELECT ${cols.join(", ")} FROM admin_order_meta WHERE order_id IN (${placeholders})`;
      const map = {};
      db.all(sql, ids, (err, rows) => {
        if (err) { console.error("[track] overlay select error:", err.message); try{db.close();}catch{}; return resolve({}); }
        for (const r of rows || []) map[r.order_id] = r;
        try{ db.close(); }catch{}
        resolve(map);
      });
    });
  });
}
);
    const db = openUsersDb();
    if (!db) return resolve({});
    const placeholders = ids.map(() => "?").join(",");
    const map = {};
    db.all(
      `SELECT order_id, status, driver_id, notes, updated_at
       FROM admin_order_meta
       WHERE order_id IN (${placeholders})`,
      ids,
      (err, rows) => {
        if (err) { console.error("[track] overlay select error:", err.message); try{db.close();}catch{}; return resolve({}); }
        for (const r of rows || []) map[r.order_id] = r;
        try{ db.close(); }catch{}
        resolve(map);
      }
    );
  });
}

async function mergeOverlay(list){
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
} catch (e) {
    console.error("[track] overlay merge error:", e.message);
  }
  return list;
}

// ---------- Routes ----------

// GET /api/track?phone=...&status=&order=
router.get("/", async (req, res) => {
  const phone = req.query.phone;
  const status = (req.query.status || "").trim();
  const order  = (req.query.order  || "").trim();
  if (!phone) return res.status(400).json({ success:false, error:"Phone number is required" });

  const all = readOrders();
  let list = findByPhone(all, phone);

  // 🔁 Email fallback if phone found 0
  if (list.length === 0) {
    const email = getEmailFallback(req);
    if (email) list = findByEmail(all, email);
  }

  let out = applyFilters(list, { status, order });
  out = await mergeOverlay(out);
  res.json({ success:true, total: out.length, orders: out });
});

// POST /api/track  (body: { phone, email?, status?, order? })
router.post("/", express.json({ limit: "1mb" }), async (req, res) => {
  const phone = req.body?.phone;
  const status = (req.body?.status || "").trim();
  const order  = (req.body?.order  || "").trim();
  const email  = req.body?.email || req.get("X-WS-Email") || "";

  if (!phone && !email) return res.status(400).json({ success:false, error:"Phone or Email required" });

  const all = readOrders();
  let list = [];
  if (phone) list = findByPhone(all, phone);
  if (list.length === 0 && email) list = findByEmail(all, email);

  let out = applyFilters(list, { status, order });
  out = await mergeOverlay(out);
  res.json({ success:true, total: out.length, orders: out });
});

module.exports = router;
