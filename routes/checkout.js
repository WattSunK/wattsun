/**
 * routes/checkout.js
 * Checkout Route (better-sqlite3, transaction-safe)
 */

const express = require("express");
const router = express.Router();
const db = require("./db_users");

// --- POST /api/checkout ---
router.post("/", (req, res) => {
  const { fullName, email, phone, address = "", items = [] } = req.body || {};

  if (!fullName || !email || !phone || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "Missing required fields or items." });
  }

  // Prepare core order data
  const orderId = `WATT${Date.now()}${Math.floor(Math.random() * 1000000)}`;
  const orderNumber = orderId;
  const status = "Pending";
  const totalCents = Math.trunc(items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (i.quantity || 1), 0) * 100);
  const depositCents = 0;
  const currency = "KES";
  const createdAt = new Date().toISOString();

  const normItems = items.map((it) => ({
    sku: it.sku || it.name || "",
    name: it.name || "",
    quantity: it.quantity || 1,
    priceCents: Math.trunc((parseFloat(it.price) || 0) * 100),
    depositCents: Math.trunc((parseFloat(it.deposit) || 0) * 100),
    image: it.image || "",
  }));

  try {
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO orders (id, orderNumber, fullName, email, phone, status, totalCents, address, depositCents, currency, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(orderId, orderNumber, fullName, email, phone, status, totalCents, address, depositCents, currency, createdAt);

      const itemStmt = db.prepare(
        `INSERT INTO order_items (order_id, sku, name, qty, priceCents, depositCents, image)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const it of normItems) {
        itemStmt.run(orderId, it.sku, it.name, it.quantity, it.priceCents, it.depositCents, it.image);
      }

      db.prepare(`INSERT OR IGNORE INTO admin_order_meta (order_id, status, notes) VALUES (?, ?, ?)`)
        .run(orderId, "Pending", "");

      try {
        const nq = db.prepare(
          `INSERT OR IGNORE INTO notifications_queue (kind, user_id, email, payload, status, dedupe_key)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        const payloadBase = { id: orderId, name: fullName, phone, total: totalCents / 100, createdAt };
        nq.run(
          "order_created",
          null,
          email,
          JSON.stringify({ ...payloadBase, kind: "order_created_admin" }),
          "Queued",
          `order_created_admin_${orderNumber}`
        );
        nq.run(
          "order_created",
          null,
          email,
          JSON.stringify({ ...payloadBase, kind: "order_created_customer" }),
          "Queued",
          `order_created_cust_${orderNumber}`
        );
      } catch (notifyErr) {
        console.warn("[checkout] notifications insert warning:", notifyErr.message);
      }
    });

    tx();
    console.log(`[checkout] Order committed successfully: ${orderId}`);
    return res.json({ success: true, orderNumber, status, total: totalCents / 100, deposit: depositCents / 100, currency, createdAt });
  } catch (e) {
    console.error("[checkout] transaction error:", e);
    return res.status(500).json({ success: false, message: "DB error" });
  }
});

module.exports = router;

