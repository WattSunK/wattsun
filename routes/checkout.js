const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();

// JSON only (no urlencoded fallback)
router.use(express.json({ limit: "1mb" }));

// ✅ Environment-aware DB path (surgical insert)
const env = process.env.NODE_ENV || "dev";
let DB_PATH;
if (env === "qa") {
  DB_PATH = path.join(__dirname, "../data/qa/wattsun.qa.db");
} else {
  DB_PATH =
    process.env.WATTSUN_DB ||
    path.join(__dirname, "../data/dev/wattsun.dev.db");
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error("[checkout] DB open error:", err);
  else {
    console.log("[checkout] DB connected:", DB_PATH);
    // Enforce FKs for order_items -> orders
    db.run("PRAGMA foreign_keys = ON;");
  }
});

// helpers
const toCents = (n) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
};

function makeOrderId() {
  const now = Date.now();
  const rand = Math.floor(Math.random() * 1e6).toString().padStart(6, "0");
  return `WATT${now}${rand}`;
}

// POST /api/checkout  (SQL-only)
router.post("/", async (req, res) => {
  try {
    const {
      fullName = "", email = "", phone = "",
      address = "", deliveryAddress = "",
      items = [],            // [{id|sku|name, price, deposit, quantity, image}]
      deposit = 0            // TOTAL deposit (KES) for the whole order
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success:false, message:"No items" });
    }

    // normalize & validate items
    const normItems = items.map((it) => {
      const qty = Math.max(1, Number(it.quantity || 1));
      const price = Number(it.priceCents ? it.priceCents / 100 : it.price || 0);
      const dep   = Number(it.depositCents ? it.depositCents / 100 : it.deposit || 0);

      return {
        id:   it.id || it.sku || it.name || "",
        sku:  it.sku || it.id || "",
        name: it.name || it.sku || it.id || "",
        quantity: qty,
        price,
        deposit: dep,
        image: it.image || ""
      };
    });

    const totalKES   = normItems.reduce((s, it) => s + (it.price * it.quantity), 0);
    const depositKES = Number(deposit ?? req.body.depositCents / 100 ?? 0);
    if (totalKES <= 0) {
      return res.status(400).json({ success:false, message:"Invalid cart item prices" });
    }

    const orderId       = makeOrderId();
    const orderNumber   = orderId;
    const totalCents    = toCents(totalKES);
    const depositCents  = toCents(depositKES);
    const currency      = "KES";
    const status        = "Pending";
    const addr          = address || deliveryAddress || "";
    const createdAt     = new Date().toISOString();

    db.serialize(() => {
      db.run("BEGIN IMMEDIATE");

      // orders
      db.run(
        `INSERT INTO orders
           (id, orderNumber, fullName, email, phone, status, totalCents, address, depositCents, currency, createdAt)
         VALUES
           (?,  ?,           ?,       ?,     ?,     ?,      ?,          ?,       ?,            ?,        ?)`,
        [
          orderId, orderNumber, fullName, email, phone, status,
          totalCents, addr, depositCents, currency, createdAt
        ],
        function (err) {
          if (err) {
            console.error("[checkout] insert orders error:", err);
            db.run("ROLLBACK");
            return res.status(500).json({ success:false, message:"DB error (orders)" });
          }

          // order_items
          const stmt = db.prepare(
            `INSERT INTO order_items (order_id, sku, name, qty, priceCents, depositCents, image)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          );

          for (const it of normItems) {
            stmt.run(
              orderId,
              String(it.id || it.sku || ""),
              String(it.name || ""),
              it.quantity,
              toCents(it.price),
              toCents(it.deposit),
              String(it.image || "")
            );
          }

          stmt.finalize((e2) => {
            if (e2) {
              console.error("[checkout] insert order_items error:", e2);
              db.run("ROLLBACK");
              return res.status(500).json({ success:false, message:"DB error (order_items)" });
            }

            const payloadAdmin = JSON.stringify({
              to: process.env.ADMIN_EMAIL || "admin@example.com",
              subject: `New order ${orderNumber}`,
              text: `New order from ${fullName || ""} (${phone || ""})
Items: ${normItems.map(i => `${i.name} x${i.quantity}`).join(", ")}
Total: KES ${totalKES}
Deposit: KES ${depositKES}`
            });

            const payloadCustomer = JSON.stringify({
              to: email || "",
              subject: `Thanks for your order ${orderNumber}`,
              text: `Dear ${fullName || "Customer"},
We received your order ${orderNumber}.
Total: KES ${totalKES}
Deposit: KES ${depositKES}
We’ll contact you shortly.`
            });

            const nq = db.prepare(
              `INSERT OR IGNORE INTO notifications_queue(kind, user_id, email, payload, status, dedupe_key)
               VALUES(?, NULL, ?, ?, 'Queued', ?)`
            );
            nq.run("order_created", null, payloadAdmin,    `order_created_admin_${orderNumber}`);
            nq.run("order_created", null, payloadCustomer, `order_created_cust_${orderNumber}`);

            nq.finalize((e3) => {
              if (e3) {
                console.warn("[checkout] notifications_queue warning:", e3);
              }
              db.run("COMMIT");
              return res.json({
                success: true,
                orderNumber,
                status,
                total: totalKES,
                deposit: depositKES,
                currency,
                createdAt
              });
            });
          });
        }
      );
    });
  } catch (e) {
    console.error("[checkout] error:", e);
    try { db.run("ROLLBACK"); } catch {}
    return res.status(500).json({ success:false, message:"Unexpected error" });
  }
});

module.exports = router;
