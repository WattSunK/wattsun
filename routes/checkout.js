// routes/checkout.js
const express = require("express");
const router = express.Router();

module.exports = function makeCheckout(db) {
  function genOrderNumber() {
    // WATT + epoch milliseconds
    return "WATT" + Date.now();
  }
  function cents(n) { return Number.isFinite(n) ? Math.round(n) : 0; }

  // Normalize cart items coming from checkout.html
  function normalizeCart(cart) {
    const items = Array.isArray(cart) ? cart : [];
    return items.map(it => ({
      id:        String(it.id || it.sku || it.name || "ITEM"),
      name:      String(it.name || it.title || "Item"),
      qty:       Number(it.quantity || it.qty || 1),
      priceCents: cents(typeof it.price === "string" ? it.replace(/[^\d]/g,"") : it.price),
      depositCents: cents(it.deposit),
      image:     it.image || ""
    }));
  }

  router.post("/checkout", express.json(), async (req, res) => {
    try {
      const body = req.body || {};
      const orderNumber = genOrderNumber();
      const fullName = String(body.fullName || body.name || "Customer");
      const email = String(body.email || "");
      const phone = String(body.phone || "");
      const address = String(body.address || "");
      const deliveryAddress = String(body.deliveryAddress || address || "");
      const rawCart = body.cart || [];
      const items = normalizeCart(rawCart);

      // totals
      const totalCents = items.reduce((t, it) => t + (it.priceCents * it.qty), 0);
      const depositCents = items.reduce((t, it) => t + (it.depositCents || 0), 0);
      const currency = String(body.currency || "KES");

      // create order (TEXT id = orderNumber, to match your admin UX)
      const id = orderNumber;

      const insertOrder = db.prepare(`
        INSERT INTO orders (id, orderNumber, fullName, email, phone, status, totalCents, depositCents, currency, address, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      insertOrder.run(id, orderNumber, fullName, email, phone, "Pending", totalCents, depositCents, currency, deliveryAddress);

      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, sku, name, qty, priceCents, depositCents, image)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const tx = db.transaction((rows) => {
        rows.forEach(it => insertItem.run(
          id, it.id, it.name, it.qty, it.priceCents, it.depositCents, it.image
        ));
      });
      tx(items);

      // optional: queue notification for later SMTP
      try {
        db.prepare(`
          INSERT INTO notifications_queue (type, payload, created_at, status)
          VALUES ('order_created', json(?), datetime('now'), 'queued')
        `).run(JSON.stringify({ id, orderNumber, fullName, email, phone, totalCents, depositCents, currency }));
      } catch {}

      return res.json({ success: true, id, orderNumber });
    } catch (e) {
      console.error("[checkout] error", e);
      res.status(500).json({ success: false, error: "Checkout failed" });
    }
  });

  // benign endpoint to accept cart syncs; no-op
  router.post("/cart", express.json(), (req, res) => res.json({ success: true }));

  return router;
};
