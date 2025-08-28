// routes/track.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const router = express.Router();

// ---------- DB open ----------
async function openDb() {
  const dbPath =
    process.env.DB_PATH_USERS ||
    process.env.SQLITE_DB ||
    path.join(__dirname, "../data/dev/wattsun.dev.db");
  return open({ filename: dbPath, driver: sqlite3.Database });
}

// ---------- legacy orders ----------
const ORDERS_PATH =
  process.env.ORDERS_JSON ||
  path.join(__dirname, "../data/orders.json");

function readOrders() {
  try {
    const raw = fs.readFileSync(ORDERS_PATH, "utf8");
    const json = JSON.parse(raw);
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.orders)) return json.orders;
    return [];
  } catch (e) {
    console.error("[track] readOrders error:", e.message);
    return [];
  }
}

// ---------- helpers ----------
const norm = (s) => (s || "").replace(/[^\d]/g, "").slice(-9);

function mergeOverlay(base, overlay) {
  if (!overlay) return base;
  return {
    ...base,
    status: overlay.status || base.status,
    driverId: overlay.driver_id || overlay.driverId || base.driverId,
    notes: overlay.notes || base.notes,
    totalCents:
      overlay.total_cents != null ? overlay.total_cents : base.totalCents,
    depositCents:
      overlay.deposit_cents != null ? overlay.deposit_cents : base.depositCents,
    currency: overlay.currency || base.currency,
  };
}

// ---------- route ----------
router.get("/", async (req, res) => {
  const qPhone = (req.query.phone || "").trim();
  const qOrder = (req.query.order || "").trim();
  const page = parseInt(req.query.page || "1");
  const per = parseInt(req.query.per || "5");
  const statusFilter = (req.query.status || "").trim();

  const all = readOrders();
  const phoneNorm = norm(qPhone);

  let matches = all.filter(
    (o) => norm(o.customerPhone || o.phone) === phoneNorm
  );
  if (qOrder) {
    matches = matches.filter(
      (o) =>
        o.orderNumber === qOrder ||
        o.id === qOrder ||
        o.order_id === qOrder
    );
  }
  if (statusFilter) {
    matches = matches.filter((o) => (o.status || "").includes(statusFilter));
  }

  // overlay merge
  let db;
  try {
    db = await openDb();
    const ids = matches.map((o) => o.orderNumber || o.id || o.order_id);
    if (ids.length) {
      const qs = ids.map(() => "?").join(",");
      const rows = await db.all(
        `SELECT * FROM admin_order_meta WHERE order_id IN (${qs})`,
        ids
      );
      const overlayMap = {};
      for (const r of rows) overlayMap[r.order_id] = r;
      matches = matches.map((o) =>
        mergeOverlay(o, overlayMap[o.orderNumber || o.id || o.order_id])
      );
    }
  } catch (e) {
    console.error("[track] overlay merge error:", e.message);
  } finally {
    if (db) await db.close();
  }

  const total = matches.length;
  const start = (page - 1) * per;
  const orders = matches.slice(start, start + per);

  const payload = { success: true, page, per, total, orders };

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
    diag.phone_query = qPhone;
    diag.phone_norm = phoneNorm;
    diag.order_query = qOrder;
    diag.phone_filtered_count = matches.length;
    if (matches[0]) {
      diag.phone_filtered_first_order =
        matches[0].orderNumber || matches[0].id || matches[0].order_id;
    }
    payload.diag = diag;
  }

  res.json(payload);
});

module.exports = router;
