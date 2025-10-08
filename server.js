// server.js — SQL-only, admin gate fixed, session normalized

require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const session = require("express-session");
const Database = require("better-sqlite3");   // ✅ switched from sqlite3.verbose()
const knex = require("knex");
const nodemailer = require("nodemailer");

const app = express();
// ----------------------------------------------------
// Session middleware (must come before all /api/admin routes)
// ----------------------------------------------------

app.use(session({
  secret: process.env.SESSION_SECRET || "wattsun_secret_key",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // keep false since you’re using HTTP locally
}));

/* =========================
   Core DB handles
   ========================= */

// Users / admin overlay DB (better-sqlite3)
const DB_PATH =
  process.env.SQLITE_DB ||
  process.env.DB_PATH || // legacy env alias (still supported)
  path.join(__dirname, "data", "dev", "wattsun.dev.db");

const sqliteDb = new Database(DB_PATH);   // ✅ sync handle
console.log("Admin overlay DB (better-sqlite3):", DB_PATH);
app.set("db", sqliteDb);

// Catalog / inventory (Knex + SQLite). Honour env, fallback to dev file, then legacy inventory.db
const db = knex({
  client: "sqlite3",
  connection: {
    filename:
      process.env.SQLITE_INVENTORY ||
      path.join(process.cwd(), "data/dev/inventory.dev.db") ||
      path.join(__dirname, "inventory.db"),
  },
  useNullAsDefault: true,
});

/* =========================
   Mail transport (safe)
   ========================= */

const transporter = nodemailer.createTransport(
  process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_PORT) === "465",
        auth:
          process.env.SMTP_USER && process.env.SMTP_PASS
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
      }
    : { jsonTransport: true } // no SMTP configured → don’t crash; just log “emails”
);

/* =========================
   Global middleware
   ========================= */

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "wattsecret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // set true only behind HTTPS + proxy
  })
);

// Normalize session fields so checks work everywhere (older code used “type”, some used “role”)
app.use((req, _res, next) => {
  const u = req.session?.user;
  if (u) {
    if (!u.role && u.type) u.role = u.type;
    if (!u.type && u.role) u.type = u.role;
  }
  next();
});

// Quick probe to confirm the cookie/session on the client
app.get("/api/_whoami", (req, res) => {
  res.json({ ok: true, user: req.session?.user || null });
});

/* =========================
   Admin gate (single line gate)
   ========================= */

function requireAdmin(req, res, next) {
  // Let diagnostics under /api/admin/_diag pass without auth
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

/* =========================
   Public / customer routes
   ========================= */

app.use("/api", require("./routes/signup"));
app.use("/api", require("./routes/login"));
app.use("/api", require("./routes/reset"));

app.use("/api/checkout", require("./routes/checkout"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/track", require("./routes/track"));

// Catalog (uses Knex)
app.use("/api/items", require("./routes/items")(db));
app.use("/api/categories", require("./routes/categories")(db));

/* =========================
   Loyalty routes
   ========================= */

app.use("/api/loyalty", require("./routes/loyalty-withdrawals")); // customer withdrawals
app.use("/api/loyalty", require("./routes/loyalty"));             // enroll/me, staff-protected within route

/* =========================
   Admin routes (behind the gate)
   ========================= */

// Gate everything under /api/admin with ONE line:
app.use("/api/admin", requireAdmin);

// Orders (SQL, better-sqlite3)

app.use("/api/admin/orders", require("./routes/admin-orders"));


// Dispatches (SQL)
app.use("/api/admin/dispatches", require("./routes/admin-dispatch"));

// Users/admin management
app.use("/api/admin", require("./routes/admin-users"));
app.use("/api/admin/users", require("./routes/admin-users-search"));

// Loyalty admin
app.use("/api/admin/loyalty", require("./routes/admin-loyalty"));
app.use("/api/admin", require("./routes/admin-loyalty-withdrawals"));

// Diagnostics (left open by gate’s exception)
app.use("/api/admin/_diag", require("./routes/admin-diagnostics"));

// Optional: orders meta endpoint (kept where clients expect it)
app.use("/api/admin/orders/meta", require("./routes/admin-orders-meta"));

/* =========================
   Misc API
   ========================= */

app.use("/api", require("./routes/calculator"));
app.use("/api", require("./routes/users")); // user CRUD + /users/me

// Contact form helpers (safe mailer)
async function getAdminEmail() {
  try {
    const row = await db("admin_settings").where({ key: "admin_email" }).first();
    return row ? row.value : null;
  } catch {
    return null;
  }
}

app.post("/api/contact", async (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    try {
      await db("messages").insert({
        name,
        email,
        message,
        created_at: new Date(),
      });
    } catch (_) {
      // table may not exist in some envs; ignore
    }

    const adminEmail = (await getAdminEmail()) || process.env.SMTP_USER || "admin@example.com";

    await transporter.sendMail({
      from: `"WattSun Website" <${adminEmail}>`,
      to: adminEmail,
      subject: `New contact message from ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    });

    await transporter.sendMail({
      from: `"WattSun Website" <${adminEmail}>`,
      to: email,
      subject: "Thanks for contacting WattSun",
      text: `Dear ${name},\n\nThanks for reaching out. We received your message and will get back to you shortly.\n\n— WattSun`,
    });

    res.json({ success: true, message: "Message sent" });
  } catch (err) {
    console.error("Contact form error:", err);
    res.status(500).json({ error: "Failed to process your message" });
  }
});

app.get("/api/admin/email", async (_req, res) => {
  try {
    const email = await getAdminEmail();
    if (!email) return res.status(404).json({ error: "Admin email not configured" });
    res.json({ email });
  } catch (error) {
    console.error("GET /api/admin/email error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/admin/email", async (req, res) => {
  const { email } = req.body || {};
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

/* =========================
   Health & root
   ========================= */

app.get("/api/health", (_req, res) => res.status(200).send("OK"));
app.get("/api/test", (_req, res) => res.send("✅ Test route works"));
app.get("/", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

/* =========================
   Boot
   ========================= */

const PORT = Number(process.env.PORT) || 3001;
http.createServer(app).listen(PORT, () => {
  console.log(`✅ WattSun backend running on HTTP port ${PORT}`);
});
