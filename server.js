// server.js (patched to support admin Save in Orders)
//
// - Caches the latest /api/orders payload in memory (app.locals.orders)
// - Adds POST /api/update-order  (updates status/payment/amount/deposit in-memory)
// - Adds POST /api/update-order-status (legacy alias)
// - Leaves your existing routes intact

const path = require("path");                 // keep only once
const sqlite3 = require("sqlite3").verbose();
const express = require("express");
const http = require("http");
const knex = require("knex");
const nodemailer = require("nodemailer");
const session = require("express-session");
require("dotenv").config();

const app = express(); // ← create app first

// Default to the *users* DB; allow override via env
const DB_PATH =
  process.env.SQLITE_DB ||
  process.env.DB_PATH || // optional legacy
  path.join(__dirname, "data", "dev", "wattsun.dev.db");

const sqliteDb = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("SQLite open failed:", err);
    process.exit(1);
  } else {
    console.log("Admin overlay DB:", DB_PATH);
  }
});
app.set("db", sqliteDb);


// Knex (your existing DB)
const db = knex({
  client: "sqlite3",
  connection: { filename: path.join(__dirname, "inventory.db") },
  useNullAsDefault: true,
});

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "wattsecret",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

// Mounted routes (unchanged)
app.use("/api/signup", require("./routes/signup"));
app.use("/api/checkout", require("./routes/checkout"));
app.use("/api/myorders", require("./routes/myorders"));
app.use("/api/items", require("./routes/items")(db));
app.use("/api/categories", require("./routes/categories")(db));
app.use("/api/admin/orders", require("./routes/admin-orders")); // NEW (PATCH)
const adminOrdersMeta = require('./routes/admin-orders-meta');
app.use("/api/admin/users",  require("./routes/admin-users"));  // NEW (GET drivers)
app.use("/api/admin/_diag", require("./routes/admin-diagnostics"));
app.use("/api", require("./routes/calculator"));
app.use("/api", require("./routes/users"));
app.use("/api", require("./routes/login"));
app.use("/api", require("./routes/reset"));

const path = require("path");

// Serve the homepage shell for auth pseudo-pages so ?next= stays in the URL.
app.get(["/login.html", "/signup.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Wrap /api/orders to cache the latest list in memory ---

const ordersRouter = require("./routes/orders");
app.use(
  "/api/orders",
  (req, res, next) => {
    // Wrap res.json to capture outgoing data
    const origJson = res.json.bind(res);
    res.json = (data) => {
      try {
        if (Array.isArray(data)) {
          // plain array
          req.app.locals.orders = data;
          req.app.locals.ordersWrap = { total: data.length, orders: data };
        } else if (data && Array.isArray(data.orders)) {
          // wrapped { total, orders }
          req.app.locals.orders = data.orders;
          req.app.locals.ordersWrap = data;
        }
      } catch (e) {
        // swallow
      }
      return origJson(data);
    };
    next();
  },
  ordersRouter
);

// Keep existing route
app.use("/api/track", require("./routes/track"));

app.use('/api/admin/orders/meta', adminOrdersMeta);
// Health check
app.get("/api/health", (req, res) => {
  res.status(200).send("OK");
});

// Test route
app.get("/api/test", (req, res) => {
  res.send("✅ Test route works");
});

// Root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Order confirmation route (placeholder)
app.post("/api/order", (req, res) => {
  const { fullName, email, phone, address, cart } = req.body;
  if (
    !fullName ||
    !email ||
    !phone ||
    !address ||
    !Array.isArray(cart) ||
    cart.length === 0
  ) {
    return res.status(400).json({ error: "Missing required fields or cart" });
  }
  console.log("✅ Order received:", req.body);
  res.status(200).json({ success: true });
});

// Admin email handling
async function getAdminEmail() {
  const row = await db("admin_settings").where({ key: "admin_email" }).first();
  return row ? row.value : null;
}

app.post("/api/contact", async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    await db("messages").insert({ name, email, message, created_at: new Date() });
    const adminEmail = await getAdminEmail();
    if (!adminEmail) throw new Error("Admin email not configured");

    await transporter.sendMail({
      from: `"WattSun Solar Website" <${adminEmail}>`,
      to: adminEmail,
      subject: `New contact message from ${name}`,
      text: `You received a new message from ${name} (${email}):

${message}`,
    });

    await transporter.sendMail({
      from: `"WattSun Solar Website" <${adminEmail}>`,
      to: email,
      subject: "Thank you for contacting WattSun Solar",
      text: `Dear ${name},

Thank you for reaching out to us. We have received your message below and will get back to you shortly.

-------------------------------
${message}
-------------------------------

Best regards,
WattSun Solar Team`,
    });

    res
      .status(200)
      .json({ success: true, message: "Message sent and saved successfully" });
  } catch (error) {
    console.error("Contact form error:", error);
    res.status(500).json({ error: "Failed to process your message" });
  }
});

app.get("/api/admin/email", async (req, res) => {
  try {
    const email = await getAdminEmail();
    if (!email) {
      return res.status(404).json({ error: "Admin email not configured" });
    }
    res.json({ email });
  } catch (error) {
    console.error("GET /api/admin/email error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/admin/email", async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid email" });
  }
  try {
    await db("admin_settings")
      .insert({ key: "admin_email", value: email })
      .onConflict("key")
      .merge();
    res.json({ success: true, email });
  } catch (error) {
    console.error("PUT /api/admin/email error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// SMTP test
app.get("/api/test-email", async (req, res) => {
  try {
    await transporter.sendMail({
      from: `"WattSun SMTP Test" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      subject: "✅ SMTP Test - WattSun",
      text: "This is a test email sent from your WattSun backend to verify SMTP setup.",
    });
    console.log("✅ Test email sent successfully.");
    res.json({ success: true, message: "Test email sent successfully." });
  } catch (error) {
    console.error("❌ SMTP test error:", error);
    res.status(500).json({ error: error.message || "SMTP test failed." });
  }
});

// --- New admin update endpoints (in-memory updates for UI Save) ---
function normalizeNumber(n) {
  if (n === null || n === undefined || n === "") return undefined;
  const num = Number(n);
  return Number.isFinite(num) ? num : undefined;
}

function findOrdersArray(app) {
  if (Array.isArray(app.locals.orders)) return app.locals.orders;
  if (app.locals.ordersWrap && Array.isArray(app.locals.ordersWrap.orders))
    return app.locals.ordersWrap.orders;
  return null;
}

function applyOrderUpdate(order, body) {
  const nextStatus = body.newStatus || body.status;
  const nextPayment = body.paymentType || body.payment;
  const nextAmount = normalizeNumber(body.amount ?? body.total);
  const nextDeposit = normalizeNumber(body.deposit);

  if (nextStatus) order.status = String(nextStatus);
  if (nextPayment) order.paymentType = String(nextPayment);
  if (nextAmount !== undefined) order.total = nextAmount;
  if (nextDeposit !== undefined) order.deposit = nextDeposit;
  order.updatedAt = new Date().toISOString();
  return order;
}

app.post("/api/update-order", (req, res) => {
  const key = String(req.body.orderId || req.body.id || "").trim();
  if (!key) return res.status(400).json({ ok: false, error: "missing order id" });

  const list = findOrdersArray(req.app);
  if (!list) return res.status(500).json({ ok: false, error: "orders not loaded yet" });

  const o = list.find(
    (x) => String(x.id) === key || String(x.orderNumber) === key
  );
  if (!o) return res.status(404).json({ ok: false, error: "order not found" });

  applyOrderUpdate(o, req.body);
  return res.json({ ok: true, updated: true, order: o });
});

// Legacy alias (accepts full payload too)
app.post("/api/update-order-status", (req, res) => {
  const key = String(req.body.orderId || req.body.id || "").trim();
  if (!key) return res.status(400).json({ ok: false, error: "missing order id" });

  const list = findOrdersArray(req.app);
  if (!list) return res.status(500).json({ ok: false, error: "orders not loaded yet" });

  const o = list.find(
    (x) => String(x.id) === key || String(x.orderNumber) === key
  );
  if (!o) return res.status(404).json({ ok: false, error: "order not found" });

  applyOrderUpdate(o, req.body);
  return res.json({ ok: true, updated: true, order: o });
});

(function checkDbAtEnd(){
  try {
    const db = app.get("db");
    if (!db) return console.warn("[EndCheck] no db handle on app");
    db.all("PRAGMA database_list", [], (e, rows) => {
      if (e) console.warn("[EndCheck] PRAGMA failed:", e.message);
      else console.log("[EndCheck] final sqlite main file:", (rows||[]).find(r=>r.name==="main")?.file);
    });
  } catch (e) {
    console.warn("[EndCheck] check failed:", e.message);
  }
})();

// Start server (configurable port)
const PORT = Number(process.env.PORT) || 3001;
http.createServer(app).listen(PORT, () => {
  console.log(`✅ WattSun backend running on HTTP port ${PORT}`);
});

/**
 * ---- Non-breaking admin/ops enhancements (appended) ----
 * These DO NOT modify existing routes or logic.
 * They only add new, optional endpoints and helpers.
 *
 * New endpoints:
 *   GET /api/healthz             -> plain "OK" for health checks
 *   GET /api/orders/withTotals   -> reads cached orders and adds computed totals
 *   POST /api/admin/orders/refresh-cache -> clears in-memory orders cache
 *
 * Notes:
 * - Uses app.locals.orders if it exists (as hinted by existing code comments).
 * - If the cached shape is { orders: [...] } we unwrap it; if it's an array, we use it directly.
 * - Never overwrites any existing fields; adds new, clearly-named fields:
 *      total_computed, deposit_computed, items_count
 * - Safe for dev/prod; no DB writes.
 */

(function attachNonBreakingEnhancements(appRef){
  if (!appRef || typeof appRef.get !== 'function') return; // defensive

  // idempotency guard to avoid double-registration if this file is imported twice
  if (appRef.locals.__enhancementsLoaded) return;
  appRef.locals.__enhancementsLoaded = true;

  // ---- helpers ----
  function toNum(v){
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = Number(v.replace(/[^0-9.\-]/g, ''));
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  function sumCart(cart, field){
    return (Array.isArray(cart) ? cart : []).reduce((acc, item) => {
      const qty = toNum(item?.quantity) || 1;
      // allow either item[field] or item[field] present as string/number
      const val = (item && (item[field] ?? item[field])) ?? 0;
      return acc + (toNum(val) * qty);
    }, 0);
  }

  function normalizeOrdersFromCache(cache){
    // Cached shape can be {orders:[...]} or [...] or falsy
    let list = [];
    if (Array.isArray(cache)) list = cache;
    else if (cache && Array.isArray(cache.orders)) list = cache.orders;
    return list;
  }

  // ---- routes ----

  // Simple health endpoint that won't collide with /api/health if it already exists
  appRef.get('/api/healthz', (req, res) => res.status(200).type('text/plain').send('OK'));

  // Enhanced orders endpoint that adds computed totals but does not change existing /api/orders
  appRef.get('/api/orders/withTotals', (req, res) => {
    try {
      const cached = appRef.locals?.orders ?? [];
      const orders = normalizeOrdersFromCache(cached);

      const out = orders.map(o => ({
        ...o,
        items_count: Array.isArray(o?.cart) ? o.cart.length : 0,
        total_computed: sumCart(o?.cart, 'price'),
        deposit_computed: sumCart(o?.cart, 'deposit'),
      }));

      res.json({ orders: out });
    } catch (err) {
      console.error('[withTotals] failed:', err && err.message);
      res.status(500).json({ error: 'failed_to_build_orders' });
    }
  });

  // Admin: clear cached orders (if any) so next load repopulates
  appRef.post('/api/admin/orders/refresh-cache', (req, res) => {
    try {
      delete appRef.locals.orders;
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err && err.message || err) });
    }
  });

})(typeof app !== 'undefined' ? app : undefined);
// ---- end non-breaking enhancements ----
