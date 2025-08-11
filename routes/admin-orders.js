// routes/admin-orders.js
// Admin update endpoints that persist to orders.json (atomic)
// and refresh the in-memory cache used by GET /api/orders.

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const ordersPath = path.resolve(__dirname, "../orders.json");

function readOrders() {
  try {
    if (!fs.existsSync(ordersPath)) return [];
    return JSON.parse(fs.readFileSync(ordersPath, "utf8"));
  } catch (e) {
    console.error("readOrders error:", e);
    return [];
  }
}

function writeOrdersAtomic(list) {
  const tmp = ordersPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, ordersPath);
}

function normalizeNumber(n) {
  if (n === null || n === undefined || n === "") return undefined;
  const num = Number(n);
  return Number.isFinite(num) ? num : undefined;
}

function applyPatch(order, body) {
  const status = body.status ?? body.newStatus;
  const payment = body.paymentType ?? body.payment;
  const total = normalizeNumber(body.total ?? body.amount);
  const deposit = normalizeNumber(body.deposit);

  if (status != null) {
    order.status = String(status);
    // keep legacy field in sync
    order.orderType = String(status);
  }
  if (payment != null) order.paymentType = String(payment);
  if (total !== undefined) order.total = total;
  if (deposit !== undefined) order.deposit = deposit;

  order.updatedAt = new Date().toISOString();
  return order;
}

function updateOrderAndPersist(req, res) {
  const id = String(req.body.orderId || req.body.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "Missing order id" });

  // Always load latest from disk
  const list = readOrders();
  const idx = list.findIndex(
    (o) =>
      String(o.orderNumber || o.id || "").trim() === id ||
      String(o.id || "").trim() === id
  );
  if (idx === -1) return res.status(404).json({ ok: false, error: "Order not found" });

  applyPatch(list[idx], req.body);
  writeOrdersAtomic(list);

  // Refresh in-memory caches used by GET /api/orders (if present)
  req.app.locals.orders = list;
  req.app.locals.ordersWrap = { total: list.length, orders: list };

  return res.json({ ok: true, order: list[idx] });
}

// Preferred endpoint
router.post("/update-order", updateOrderAndPersist);

// Legacy alias (kept if something still posts here)
router.post("/update-order-status", updateOrderAndPersist);

module.exports = router;
