// server.js (patched admin gate + session normalize)
//
// - Admin gate now accepts either user.type === "Admin" OR user.role === "Admin"
// - Removes debug console.log from requireAdmin
// - Adds tiny middleware to normalize session fields (role/type) once per request
// - Leaves routes and other behavior unchanged

const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");
const http = require("http");
const knex = require("knex");
const nodemailer = require("nodemailer");
const session = require("express-session");
require("dotenv").config();

const app = express();

// --- Mailer (Nodemailer) ---
// Safe fallback: if SMTP_* env is not set, use JSON transport so /api/contact and /api/test-email won’t crash.
const transporter = nodemailer.createTransport(
  process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_PORT) === "465", // true for 465
        auth:
          process.env.SMTP_USER && process.env.SMTP_PASS
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
      }
    : { jsonTransport: true }
);

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

// --- Session normalizer (maps role/type both ways so checks remain stable) ---
app.use((req, _res, next) => {
  const u = req.session && req.session.user;
  if (u) {
    if (!u.role && u.type) u.role = u.type;
    if (!u.type && u.role) u.type = u.role;
  }
  next();
});

// === Admin gate (supports role OR type, keeps /_diag open) ===================
function requireAdmin(req, res, next) {
  // Keep diagnostics open if this file mounts _diag under /api/admin
  if (req.path && req.path.startsWith("/_diag")) return next();

  const u = req.session?.user || req.user || null;
  const isAdmin = !!u && (u.type === "Admin" || u.role === "Admin");
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "Admin access required." },
    });
  }
  next();
}
// ============================================================================

// Mounted routes (unchanged)
app.use("/api/signup", require("./routes/signup"));
app.use("/api/checkout", require("./routes/checkout"));
app.use("/api/myorders", require("./routes/myorders"));
app.use("/api/items", require("./routes/items")(db));
app.use("/api/categories", require("./routes/categories")(db));
app.use("/api/loyalty", require("./routes/loyalty")); // Staff-only enroll + me
app.use("/api/loyalty", require("./routes/loyalty-withdrawals"));

// Gate all /api/admin/* below with one line:
app.use("/api/admin", requireAdmin);
app.use("/api/admin/orders", require("./routes/admin-orders")); // NEW (PATCH)
app.use('/api/admin/dispatches', require('./routes/admin-dispatch'));
const adminOrdersMeta = require("./routes/admin-orders-meta");
app.use("/api/admin", require("./routes/admin-users"));
app.use("/api/admin/_diag", require("./routes/admin-diagnostics"));
app.use("/api", require("./routes/calculator"));
app.use("/api", require("./routes/users"));
app.use("/api", require("./routes/login"));
app.use("/api", require("./routes/reset"));
app.use("/api/admin/loyalty", require("./routes/admin-loyalty"));
app.use("/api/admin/loyalty", require("./routes/admin-loyalty-withdrawals"));

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
      } catch (_e) {
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

app.use("/api/admin/orders/meta", adminOrdersMeta);

// Health check
app.get("/api/health", (_req, res) => {
  res.status(200).send("OK");
});

// Test route
app.get("/api/test", (_req, res) => {
  res.send("✅ Test route works");
});

// Root route
app.get("/", (_req, res) => {
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
    return res
      .status(400)
      .json({ error: "Missing required fields or cart" });
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
    await db("messages").insert({
      name,
      email,
      message,
      created_at: new Date(),
    });
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

app.get("/api/admin/email", async (_req, res) => {
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
app.get("/api/test-email", async (_req, res) => {
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

(function checkDbAtEnd() {
  try {
    const db = app.get("db");
    if (!db) return console.warn("[EndCheck] no db handle on app");
    db.all("PRAGMA database_list", [], (e, rows) => {
      if (e) console.warn("[EndCheck] PRAGMA failed:", e.message);
      else
        console.log(
          "[EndCheck] final sqlite main file:",
          (rows || []).find((r) => r.name === "main")?.file
        );
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
