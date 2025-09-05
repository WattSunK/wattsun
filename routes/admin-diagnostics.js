// routes/admin-diagnostics.js
// Safe read-only diagnostics to see which SQLite file is active and basic table health.
const express = require("express");
const router = express.Router();

function getDb(req) {
  const db = req.app.get("db");
  if (!db) throw new Error("SQLite database handle not found (app.set('db', db))");
  return db;
}
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => e ? reject(e) : resolve(row)));
}
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, rows) => e ? reject(e) : resolve(rows)));
}

router.get("/db", async (req, res) => {
  try {
    const db = getDb(req);

    // SQLite version
    const ver = await get(db, "SELECT sqlite_version() AS v");

    // Auto-detect path of the *main* database file
    let overlayDbPath = null;
    try {
      const dblist = await all(db, "PRAGMA database_list");
      const main = Array.isArray(dblist) ? dblist.find(r => r.name === "main") : null;
      overlayDbPath = main ? main.file : null;
    } catch { /* ignore */ }

    // admin_order_meta presence + count
    const metaRow = await get(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='admin_order_meta'");
    const metaExists = !!metaRow;
    let metaCount = 0;
    if (metaExists) {
      const c = await get(db, "SELECT COUNT(*) AS c FROM admin_order_meta");
      metaCount = c ? c.c : 0;
    }

    // users table stats (try/catch in case it doesn't exist here)
    let usersTotal = null, driversTotal = null;
    try {
      const u = await get(db, "SELECT COUNT(*) AS c FROM users");
      usersTotal = u ? u.c : null;
      const d = await get(db, "SELECT COUNT(*) AS c FROM users WHERE LOWER(type)='driver'");
      driversTotal = d ? d.c : null;
    } catch { /* ignore */ }

    res.json({
      success: true,
      sqliteVersion: ver ? ver.v : null,
      overlayDbPath,                // <- auto-detected, no app.set needed
      envDbPath: process.env.SQLITE_DB || process.env.WS_ADMIN_DB || null,
      meta: { exists: metaExists, count: metaCount },
      users: { total: usersTotal, drivers: driversTotal },
      pid: process.pid,
      nodeEnv: process.env.NODE_ENV || null
    });
  } catch (e) {
    console.error("Diagnostics failed:", e);
    res.status(500).json({ success: false, error: "Diagnostics error" });
  }
});

router.get("/ping", (req, res) => {
  res.json({ success: true, time: new Date().toISOString() });
});

module.exports = router;
