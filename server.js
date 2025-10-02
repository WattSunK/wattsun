// server.js — SQL-only, with tracer logs
require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const session = require("express-session");
const Database = require("better-sqlite3");
const knex = require("knex");
const nodemailer = require("nodemailer");

const app = express();

/* =========================
   Core DB handles
   ========================= */

const DB_PATH =
  process.env.SQLITE_DB ||
  process.env.DB_PATH ||
  path.join(__dirname, "data", "dev", "wattsun.dev.db");

const sqliteDb = new Database(DB_PATH);
console.log("Admin overlay DB (better-sqlite3):", DB_PATH);
app.set("db", sqliteDb);

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
    cookie: { secure: false },
  })
);

app.use((req, _res, next) => {
  const u = req.session?.user;
  if (u) {
    if (!u.role && u.type) u.role = u.type;
    if (!u.type && u.role) u.type = u.role;
  }
  next();
});

// WhoAmI
app.get("/api/_whoami", (req, res) => {
  console.log("[_whoami] session.user:", req.session?.user);
  res.json({ ok: true, user: req.session?.user || null });
});

/* =========================
   Admin gate with tracers
   ========================= */

function requireAdmin(req, res, next) {
  console.log("[requireAdmin] path:", req.path, "session.user:", req.session?.user);

  if (req.path && req.path.startsWith("/_diag")) {
    console.log("[requireAdmin] bypassing for _diag");
    return next();
  }

  const u = req.session?.user || req.user || null;
  const isAdmin = !!u && (u.type === "Admin" || u.role === "Admin");
  if (!isAdmin) {
    console.log("[requireAdmin] blocked, no admin");
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "Admin access required." },
    });
  }

  console.log("[requireAdmin] passed admin check, calling next()");
  return next();
}

/* =========================
   Admin routes
   ========================= */

app.use("/api/admin", requireAdmin);

app.use("/api/admin/orders", require("./routes/admin-orders")(sqliteDb));

// quick direct test route
app.get("/api/admin/orders/_ping2", (req, res) => {
  console.log("[direct ping2] hit");
  res.json({ success: true, msg: "ping2 reached server.js" });
});

/* =========================
   Boot
   ========================= */

const PORT = Number(process.env.PORT) || 3001;
http.createServer(app).listen(PORT, () => {
  console.log(`✅ WattSun backend running on HTTP port ${PORT}`);
});
