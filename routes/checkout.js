/**
 * routes/checkout.js
 * WattSun – Checkout Route (Final Verified Version)
 */

const express = require("express");
const router = express.Router();
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

// Database path
const DB_PATH = process.env.SQLITE_MAIN || path.join(__dirname, "../data/dev/wattsun.dev.db");
const db = new sqlite3.Database(DB_PATH);

console.log(`[checkout] DB connected: ${DB_PATH}`);

// --- POST /api/checkout ---
router.post("/", (req, res) => {
  const { fullName, email, phone, items = [] } = req.body;

  if (!fullName || !email || !phone || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "Missing required fields or items" });
  }

  // Normalize order data
  const orderId = `WATT${Date.now()}${Math.floor(Math.random() * 1000000)}`;
  const orderNumber = orderId;
  const status = "Pending";
  const totalCents = items.reduce((sum, i) => sum + (parseFloat(i.price) || 0) * (i.quantity || 1), 0);
  const depositCents = 0;
  const currency = "KES";
  const createdAt = new Date().toISOString();
  const address = req.body.address || "";

  const normItems = items.map(it => ({
    sku: it.sku || it.name,
    name: it.name,
    quantity: it.quantity || 1,
    priceCents: (parseFloat(it.price) || 0) * 100,
    depositCents: (parseFloat(it.deposit) || 0) * 100,
    image: it.image || ""
  }));

  // Begin transaction
  db.serialize(() => {
    db.run("BEGIN IMMEDIATE");

    // 1️⃣ Insert order
    db.run(
      `INSERT INTO orders 
         (id, orderNumber, fullName, email, phone, status, totalCents, address, depositCents, currency, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, orderNumber, fullName, email, phone, status, totalCents, address, depositCents, currency, createdAt],
      function (err) {
        if (err) {
          console.error("[checkout] insert orders error:", err);
          db.run("ROLLBACK");
          return res.status(500).json({ success: false, message: "DB error (orders)" });
        }

        // 2️⃣ Insert order items
        const stmt = db.prepare(
          `INSERT INTO order_items (order_id, sku, name, qty, priceCents, depositCents, image)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        );

        for (const it of normItems) {
          stmt.run(orderId, it.sku, it.name, it.quantity, it.priceCents, it.depositCents, it.image);
        }

        stmt.finalize((e2) => {
          if (e2) {
            console.error("[checkout] insert order_items error:", e2);
            db.run("ROLLBACK");
            return res.status(500).json({ success: false, message: "DB error (order_items)" });
          }

          // 3️⃣ Ensure overlay exists in admin_order_meta
          db.run(
            `INSERT OR IGNORE INTO admin_order_meta (order_id, status, notes)
             VALUES (?, ?, ?)`,
            [orderId, "Pending", ""],
            (metaErr) => {
              if (metaErr) console.warn("[checkout] admin_order_meta warning:", metaErr);

              // 4️⃣ Notifications
              const nq = db.prepare(
                `INSERT OR IGNORE INTO notifications_queue(kind, user_id, email, payload, status, dedupe_key)
                 VALUES(?, NULL, ?, ?, 'Queued', ?)`
              );

              const payloadAdmin = JSON.stringify({
                kind: "order_created_admin",
                id: orderId,
                name: fullName,
                phone,
                total: totalCents / 100,
              });

              const payloadCustomer = JSON.stringify({
                kind: "order_created_customer",
                id: orderId,
                name: fullName,
                phone,
                total: totalCents / 100,
              });

              nq.run("order_created", null, email, payloadAdmin,    `order_created_admin_${orderNumber}`);
              nq.run("order_created", null, email, payloadCustomer, `order_created_cust_${orderNumber}`);

              nq.finalize((e3) => {
                if (e3) console.warn("[checkout] notifications_queue warning:", e3);

                // 5️⃣ Commit
                db.run("COMMIT", (commitErr) => {
                  if (commitErr) {
                    console.error("[checkout] commit error:", commitErr);
                    db.run("ROLLBACK");
                    return res.status(500).json({ success: false, message: "DB commit error" });
                  }

                  console.log("[checkout] ✅ order committed:", orderId);
                  return res.json({
                    success: true,
                    orderNumber,
                    status,
                    total: totalCents / 100,
                    deposit: depositCents / 100,
                    currency,
                    createdAt,
                  });
                });
              });
            }
          );
        });
      }
    );
  });
});

module.exports = router;
