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
      // Normalize items (price/deposit already converted above)
      const depositCents = normItems.reduce((sum, it) => sum + (Number.isFinite(it.depositCents) ? it.depositCents : 0), 0);

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
      // Persist the computed deposit into overlay for consistency
      db.prepare(`UPDATE admin_order_meta SET deposit_cents = ?, updated_at = ? WHERE order_id = ?`)
        .run(depositCents, createdAt, orderId);

      try {
        // Resolve notification settings
        let adminEmail = null;
        let notifyOrderPlaced = true;
        try {
          db.prepare("CREATE TABLE IF NOT EXISTS admin_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))) ").run();
          const rows = db.prepare("SELECT key,value FROM admin_settings WHERE key IN ('alerts_email','admin_email','notify_order_placed')").all();
          const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
          adminEmail = map.alerts_email || map.admin_email || process.env.SMTP_USER || null;
          notifyOrderPlaced = /(1|true|yes)/i.test(map.notify_order_placed || '1');
        } catch (_) { /* ignore */ }

        const payloadBase = { id: orderId, name: fullName, phone, total: totalCents / 100, createdAt };

        // Use a flexible insert that works whether optional columns (dedupe_key, note) exist or not
        const hasDedupe = (() => {
          try {
            const cols = db.prepare("PRAGMA table_info(notifications_queue)").all();
            return Array.isArray(cols) && cols.some(c => c.name === 'dedupe_key');
          } catch { return false; }
        })();

        const insertWithDedupe = (userId, targetEmail, payload, key) => {
          const nq = db.prepare(
            `INSERT OR IGNORE INTO notifications_queue (kind, user_id, email, payload, status, dedupe_key)
             VALUES (?, ?, ?, ?, 'Queued', ?)`
          );
          nq.run("order_created", userId, targetEmail, JSON.stringify(payload), key);
        };
        const insertBasic = (userId, targetEmail, payload) => {
          const nq = db.prepare(
            `INSERT INTO notifications_queue (kind, user_id, email, payload, status)
             VALUES (?, ?, ?, ?, 'Queued')`
          );
          nq.run("order_created", userId, targetEmail, JSON.stringify(payload));
        };

        // Admin notification (if enabled)
        if (adminEmail && notifyOrderPlaced) {
          if (hasDedupe) insertWithDedupe(null, adminEmail, { ...payloadBase, role: "admin" }, `order_created_admin_${orderNumber}`);
          else insertBasic(null, adminEmail, { ...payloadBase, role: "admin" });
        }

        // Customer notification
        if (hasDedupe) insertWithDedupe(null, email, { ...payloadBase, role: "customer" }, `order_created_cust_${orderNumber}`);
        else insertBasic(null, email, { ...payloadBase, role: "customer" });
      } catch (notifyErr) {
        console.warn("[checkout] notifications insert warning:", notifyErr.message);
      }
    });

    tx();
    console.log(`[checkout] Order committed successfully: ${orderId}`);
    // Return normalized monetary fields (units)
    return res.json({ success: true, orderNumber, status, total: totalCents / 100, deposit: (normItems.reduce((s,i)=>s+(Number.isFinite(i.depositCents)?i.depositCents:0),0))/100, currency, createdAt });
  } catch (e) {
    console.error("[checkout] transaction error:", e);
    return res.status(500).json({ success: false, message: "DB error" });
  }
});

module.exports = router;
