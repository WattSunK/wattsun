// server.js – SQL-only, admin gate fixed, session normalized

// ============================================================
// ✅ Ensure environment variables always load (even under sudo)
// ============================================================
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

const nodeEnv = String(process.env.NODE_ENV || "").toLowerCase();
const explicitPath = process.env.DOTENV_CONFIG_PATH || process.env.ENV_FILE || "";
const repoEnv = path.join(process.cwd(), ".env");
const repoEnvQa = path.join(process.cwd(), ".env.qa");
const nasEnv = "/volume1/web/wattsun/.env";

let loadedFrom = null;
function tryLoadEnv(p) {
  try {
    if (p && fs.existsSync(p)) {
      const r = dotenv.config({ path: p });
      if (!r.error) {
        loadedFrom = p;
        return true;
      }
    }
  } catch (_) {
    // ignore and fall through
  }
  return false;
}

if (!(explicitPath && tryLoadEnv(explicitPath))) {
  if (nodeEnv === "qa") {
    if (!tryLoadEnv(repoEnvQa)) {
      if (!tryLoadEnv(repoEnv)) {
        tryLoadEnv(nasEnv);
      }
    }
  } else {
    if (!tryLoadEnv(repoEnv)) {
      if (!tryLoadEnv(repoEnvQa)) {
        tryLoadEnv(nasEnv);
      }
    }
  }
}

console.log(`[env] loaded from ${loadedFrom || '(system env / defaults)'}`);
console.log("[env-check]", {
  SQLITE_MAIN: process.env.SQLITE_MAIN,
  SQLITE_DB: process.env.SQLITE_DB,
  DB_PATH_USERS: process.env.DB_PATH_USERS
});
console.log(`[env] Active DB: ${process.env.SQLITE_MAIN}`);

// ============================================================
const http = require("http");
const express = require("express");
const session = require("express-session");
const Database = require("better-sqlite3"); // switched from sqlite3.verbose()
const knex = require("knex");
const nodemailer = require("nodemailer");

const app = express();

// Normalize log output for missing env
if (!process.env.SQLITE_MAIN) {
  process.env.SQLITE_MAIN = process.env.SQLITE_DB ||
    process.env.DB_PATH_USERS ||
    path.join(__dirname, "data", "dev", "wattsun.dev.db");
}

/* =========================
   Core DB handles
   ========================= */

// Unified database path (main + overlay)
const DB_PATH =
  process.env.SQLITE_MAIN ||
  process.env.SQLITE_DB ||
  process.env.DB_PATH_USERS ||
  path.join(__dirname, "data", "dev", "wattsun.dev.db");

process.env.SQLITE_MAIN = DB_PATH; // normalize for downstream logs and routes

// Make sure all legacy routes see the same absolute DB path
process.env.SQLITE_DB = DB_PATH;
process.env.DB_PATH_USERS = DB_PATH;

const sqliteDb = new Database(DB_PATH);   // ✅ sync handle
// ✅ Ensure foreign key constraints (like ON DELETE CASCADE) are enforced
sqliteDb.pragma('foreign_keys = ON');

console.log("Admin overlay DB (better-sqlite3):", DB_PATH);
app.set("db", sqliteDb);

// Catalog / inventory (Knex + SQLite). Honour env, fallback to dev file, then legacy inventory.db
const db = knex({
  client: "sqlite3",
  connection: {
    filename:
      process.env.SQLITE_DB ||
      process.env.DB_PATH_USERS ||
      path.join(__dirname, "data", "dev", "wattsun.dev.db"),
  },
   useNullAsDefault: true,  // ✅ suppresses default-value warning
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
 // Current user + users listing
 app.use("/api", require("./routes/users"));

app.use("/api/checkout", require("./routes/checkout"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/track", require("./routes/track"));


// Catalog (inventory DB via inline Knex in routes)
app.use("/api/items", require("./routes/items"));
app.use("/api/categories", require("./routes/categories"));
// Profile resources (addresses, payments, email prefs)
app.use("/api", require("./routes/profile"));

/* =========================================================
   🧭 Database Path Summary — Startup Log
   ========================================================= */
console.log("------------------------------------------------------------");
console.log("🌞  WattSun Database Path Summary");
console.log("------------------------------------------------------------");
console.log("🔹 Main / Users DB      :", process.env.DB_PATH_USERS || process.env.SQLITE_MAIN);
console.log("🔹 Inventory DB         :", process.env.DB_PATH_INVENTORY || "Not set");
console.log("🔹 Admin Overlay (meta) :", process.env.DB_PATH_OVERLAY || "(using main)");
console.log("------------------------------------------------------------");


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
app.use("/api/admin", require("./routes/admin-settings"));


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
    // Prefer support_email, fallback to alerts_email, then admin_email
    const rows = await db("admin_settings").whereIn("key", ["support_email", "alerts_email", "admin_email"]);
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return map.support_email || map.alerts_email || map.admin_email || null;
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

// Public company info (no auth). Used by public pages to hydrate mailto, etc.
app.get("/api/public/company", async (_req, res) => {
  try {
    const rows = await db("admin_settings").whereIn("key", [
      "company_name",
      "support_email",
      "support_phone",
      "physical_address",
      "alerts_email",
      "admin_email"
    ]);
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const supportEmail = map.support_email || map.alerts_email || map.admin_email || "";
    res.json({
      success: true,
      company: {
        companyName: map.company_name || "WattSun Solar",
        supportEmail,
        supportPhone: map.support_phone || "",
        physicalAddress: map.physical_address || "",
      }
    });
  } catch (e) {
    res.status(500).json({ success:false, error: 'SERVER_ERROR' });
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

// ✅ Add this small block here — before the root index.html route
app.get("/api/env", (_req, res) => {
  res.json({ env: process.env.NODE_ENV || "dev" });
});

app.get("/", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);
/* =========================
   Boot
   ========================= */

const PORT = Number(process.env.PORT) || 3001;

// Force IPv4 binding (0.0.0.0) so both 127.0.0.1 and ::1 work
const HOST = "0.0.0.0";

http.createServer(app).listen(PORT, HOST, () => {
  console.log(`✅ WattSun backend running on HTTP port ${PORT} (IPv4+IPv6 compatible)`);
});
