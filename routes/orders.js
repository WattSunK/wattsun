// /routes/orders.js
// GET orders from disk, and two save endpoints:
//   POST /api/update-order                      (preferred)
//   POST /api/orders/update-order-status        (legacy alias)
// Writes atomically and refreshes in-memory cache for GET /api/orders.

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const ordersPath = path.join(__dirname, "../orders.json");

function readOrders() {
  try {
    if (!fs.existsSync(ordersPath)) return [];
    const raw = fs.readFileSync(ordersPath, "utf8") || "[]";
    return JSON.parse(raw);
  } catch (e) {
    console.error("[orders] read error:", e.message);
    return [];
  }
}

function writeOrdersAtomic(list) {
  try {
    const tmp = ordersPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), "utf8");
    fs.renameSync(tmp, ordersPath);
    return true;
  } catch (e) {
    console.error("[orders] write error:", e.message);
    return false;
  }
}

function normalizeNumber(n) {
  if (n === null || n === undefined || n === "") return undefined;
  const num = Number(n);
  return Number.isFinite(num) ? num : undefined;
}

function applyPatch(order, body) {
  const status  = body.status ?? body.newStatus;
  const payment = body.paymentType ?? body.payment;
  const total   = normalizeNumber(body.total ?? body.amount);
  const deposit = normalizeNumber(body.deposit);

  if (status != null) {
    order.status = String(status);
    order.orderType = String(status); // keep legacy UI in sync
  }
  if (payment != null) order.paymentType = String(payment);
  if (total   !== undefined) order.total = total;
  if (deposit !== undefined) order.deposit = deposit;

  order.updatedAt = new Date().toISOString();
  return order;
}

// GET /api/orders -> { success, total, orders }
router.get("/", (req, res) => {
  const orders = readOrders();
  // also set cache for any upstream wrapper
  req.app.locals.orders = orders;
  req.app.locals.ordersWrap = { success: true, total: orders.length, orders };
  return res.json({ success: true, total: orders.length, orders });
});

function updateOrderAndPersist(req, res) {
  const key = String(req.body.orderId || req.body.id || "").trim();
  if (!key) {
    return res.status(400).json({ ok: false, error: "missing order id" });
  }

  const list = readOrders();
  const idx = list.findIndex(
    (o) =>
      String(o.orderNumber || o.id || "").trim() === key ||
      String(o.id || "").trim() === key
  );
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "order not found" });
  }

  applyPatch(list[idx], req.body);

  if (!writeOrdersAtomic(list)) {
    return res.status(500).json({ ok: false, error: "persist failed" });
  }

  // refresh in-memory cache used by GET /api/orders
  req.app.locals.orders = list;
  req.app.locals.ordersWrap = { success: true, total: list.length, orders: list };

  return res.json({ ok: true, order: list[idx] });
}

// Preferred endpoint
router.post("/update-order", updateOrderAndPersist);

// ✅ Legacy alias (fixed): now /api/orders/update-order-status
router.post("/update-order-status", updateOrderAndPersist);

module.exports = router;
