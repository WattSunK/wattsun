// routes/admin-loyalty.js
// Admin endpoints for Loyalty program settings + account controls
// - Fast + safe SQLite usage (WAL, memoized schema/seed)
// - Flat GET/PUT /program so the Settings card + Advanced modal share storage
// - Backward-compatible routes for programs, accounts, ledger, notifications

const express = require("express");
const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

// Optional notify util (best-effort)
let enqueue = async () => {};
try { ({ enqueue } = require("./lib/notify")); } catch (_) {}

// ---- DB path (env-first, consistent across your stack) ----
const DB_PATH =
  process.env.WATTSUN_DB_PATH ||  // preferred override
  process.env.DB_PATH_ADMIN ||    // admin env
  process.env.DB_PATH_USERS ||    // users env
  process.env.SQLITE_DB ||        // generic fallback
  path.join(process.cwd(), "data/dev/wattsun.dev.db");

console.log("📂 Loyalty router DB path:", process.env.SQLITE_MAIN);

// ---- small per-call DB helpers (safe + simple) ----
function withDb(fn) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) return reject(err);
      db.serialize(async () => {
        try {
          const out = await fn(db);
          db.close(() => resolve(out));
        } catch (e) {
          db.close(() => reject(e));
        }
      });
    });
  });
}
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

// ---- memoized schema/seed + WAL (runs once per process) ----
let __ensureOnce;
async function ensureSchemaAndSeed() {
  if (__ensureOnce) return __ensureOnce;
  __ensureOnce = withDb(async (db) => {
    // NAS-friendly PRAGMAs
    await get(db, `PRAGMA journal_mode=WAL`);
    await run(db, `PRAGMA synchronous=NORMAL`);
    await run(db, `PRAGMA temp_store=MEMORY`);

    await run(db, `
      CREATE TABLE IF NOT EXISTS loyalty_programs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(db, `
      CREATE TABLE IF NOT EXISTS loyalty_program_settings (
        program_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(program_id, key),
        FOREIGN KEY(program_id) REFERENCES loyalty_programs(id) ON DELETE CASCADE
      )
    `);

    // Ensure default program
    const row = await get(db, `SELECT id FROM loyalty_programs WHERE code='STAFF'`);
    let programId = row?.id;
    if (!programId) {
      const ins = await run(
        db,
        `INSERT INTO loyalty_programs (code, name, active)
         VALUES ('STAFF','Default Loyalty Program',1)`
      );
      programId = ins.lastID;
    }

    // Seed sensible defaults (card + advanced)
    const defaults = {
      eligibleUserTypes: 'Staff',
      digestDay: 'Mon',
      referralBonus: 10,
      durationMonths: 6,
      withdrawWaitDays: 90,
      minWithdrawPoints: 100,
      pointsPerKES: 1,
      eurPerPoint: 1,            // alt to pointsPerKES if you prefer EUR
      signupBonus: 100,
      dailyAccrualPoints: 5,
      enableDailyAccrual: 1
    };
    for (const [k, v] of Object.entries(defaults)) {
      await run(
        db,
        `INSERT OR IGNORE INTO loyalty_program_settings (program_id, key, value)
         VALUES (?,?,?)`,
        [programId, k, String(v)]
      );
    }

    return programId;
  });
  return __ensureOnce;
}

// ---- helpers -------------------------------------------------
function parseMaybeJSON(v) {
  try {
    if (typeof v === "string" && /^\s*(\[|\{)/.test(v)) return JSON.parse(v);
  } catch {}
  return v;
}
function normalizeEligible(val) {
  if (Array.isArray(val)) return val.filter(Boolean).map(String);
  if (typeof val === "string") {
    return val.split(",").map(s => s.trim()).filter(Boolean);
  }
  return [];
}

// Merge program rowset from JOIN into a single object
async function getProgramByCode(code = "STAFF") {
  return withDb(async (db) => {
    const rows = await all(
      db,
      `SELECT p.id AS program_id, p.code, p.name, p.active, s.key, s.value
         FROM loyalty_programs p
    LEFT JOIN loyalty_program_settings s ON s.program_id = p.id
        WHERE p.code = ?`,
      [code]
    );
    if (!rows || !rows.length) return null;
    const out = {
      programId: rows[0].program_id,
      code: rows[0].code,
      name: rows[0].name,
      active: !!rows[0].active
    };
    for (const r of rows) {
      if (!r || !r.key) continue;
      let v = parseMaybeJSON(r.value);
      if ([
        "durationMonths","withdrawWaitDays","minWithdrawPoints","pointsPerKES",
        "eurPerPoint","signupBonus","dailyAccrualPoints","enableDailyAccrual","referralBonus"
      ].includes(r.key)) {
        const n = Number(v); if (Number.isFinite(n)) v = n;
      }
      out[r.key] = v;
    }
    // csv convenience for the card
    const elig = out.eligibleUserTypes;
    out.eligibleUserTypesCsv = Array.isArray(elig) ? elig.join(", ") : String(elig || "");
    return out;
  });
}

function mapToFlat(out) {
  // Flatten for the card; include advanced fields so modal can reuse this endpoint too
  return {
    eligibleUserTypes: out.eligibleUserTypesCsv || "",
    active: !!out.active,
    digestDay: out.digestDay ?? "Mon",
    referralBonus: Number(out.referralBonus ?? 0),

    durationMonths: Number(out.durationMonths ?? 6),
    withdrawWaitDays: Number(out.withdrawWaitDays ?? 90),
    minWithdrawPoints: Number(out.minWithdrawPoints ?? 100),
    pointsPerKES: Number(out.pointsPerKES ?? out.eurPerPoint ?? 1),
    eurPerPoint: Number(out.eurPerPoint ?? out.pointsPerKES ?? 1),
    signupBonus: Number(out.signupBonus ?? 100),
    dailyAccrualPoints: Number(out.dailyAccrualPoints ?? 5),
    enableDailyAccrual: !!out.enableDailyAccrual
  };
}

async function setProgramActive(programId, active) {
  return withDb((db) =>
    run(db, `UPDATE loyalty_programs SET active=?, updated_at=datetime('now') WHERE id=?`, [active ? 1 : 0, programId])
  );
}
async function upsertSetting(programId, key, value) {
  return withDb(async (db) => {
    const u = await run(
      db,
      `UPDATE loyalty_program_settings SET value=?, updated_at=datetime('now')
       WHERE program_id=? AND key=?`,
      [String(value), programId, key]
    );
    if (!u.changes) {
      await run(
        db,
        `INSERT INTO loyalty_program_settings (program_id, key, value, updated_at)
         VALUES (?,?,?, datetime('now'))`,
        [programId, key, String(value)]
      );
    }
    return true;
  });
}

// ---- card-compat endpoints ----------------------------------
// GET  /api/admin/loyalty/program   -> flat object
router.get("/program", async (_req, res) => {
  try {
    await ensureSchemaAndSeed();
    const program = await getProgramByCode("STAFF");
    if (!program) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
    res.json(mapToFlat(program));
  } catch (e) {
    console.error("[loyalty/program][GET]", e);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: e.message } });
  }
});

// PUT  /api/admin/loyalty/program   -> accepts card + modal keys
router.put("/program", async (req, res) => {
  try {
    const programId = await ensureSchemaAndSeed();
    const body = req.body || {};

    // allow alias programActive
    if (body.programActive !== undefined && body.active === undefined) body.active = body.programActive;

    // active on programs table
    if (body.active !== undefined) {
      const flag = /^(true|1|yes)$/i.test(String(body.active)) || body.active === true || body.active === 1;
      await setProgramActive(programId, flag);
    }

    // eligible user types (csv or array) -> JSON array in settings
    if (body.eligibleUserTypes !== undefined) {
      const arr = normalizeEligible(body.eligibleUserTypes);
      await upsertSetting(programId, "eligibleUserTypes", JSON.stringify(arr));
    }

    if (body.digestDay !== undefined) {
      await upsertSetting(programId, "digestDay", String(body.digestDay));
    }

    // numeric keys (card + advanced)
    const numericKeys = [
      "referralBonus",
      "durationMonths","withdrawWaitDays","minWithdrawPoints",
      "pointsPerKES","eurPerPoint","signupBonus",
      "dailyAccrualPoints","enableDailyAccrual"
    ];
    for (const k of numericKeys) {
      if (body[k] !== undefined) {
        const n = Number(body[k]);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ success: false, error: { code: "BAD_INPUT", message: `${k} must be >= 0` } });
        }
        await upsertSetting(programId, k, n);
      }
    }

    const updated = await getProgramByCode("STAFF");
    res.json({ success: true, program: mapToFlat(updated) });
  } catch (e) {
    console.error("[loyalty/program][PUT]", e);
    res.status(400).json({ success: false, error: { code: "BAD_INPUT", message: e.message } });
  }
});

// ---- programs list / settings by code -----------------------
router.get("/programs", async (_req, res) => {
  try {
    await ensureSchemaAndSeed();
    const list = await withDb(async (db) => {
      const rows = await all(
        db,
        `SELECT p.id AS program_id, p.code, p.name, p.active, s.key, s.value
           FROM loyalty_programs p
      LEFT JOIN loyalty_program_settings s ON s.program_id = p.id
       ORDER BY p.id ASC`
      );
      const byId = new Map();
      for (const r of rows) {
        if (!byId.has(r.program_id)) byId.set(r.program_id, []);
        byId.get(r.program_id).push(r);
      }
      const out = [];
      for (const [, group] of byId) {
        const merged = {
          programId: group[0].program_id,
          code: group[0].code,
          name: group[0].name,
          active: !!group[0].active
        };
        for (const g of group) {
          if (!g.key) continue;
          merged[g.key] = parseMaybeJSON(g.value);
        }
        out.push(merged);
      }
      return out;
    });
    res.json({ success: true, programs: list });
  } catch (e) {
    console.error("[loyalty/programs][GET]", e);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: e.message } });
  }
});

router.put("/programs/:code/settings", async (req, res) => {
  try {
    await ensureSchemaAndSeed();
    const code = String(req.params.code || "STAFF");
    const current = await getProgramByCode(code);
    if (!current) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Program not found" } });

    const {
      eligibleUserTypes,
      durationMonths,
      minWithdrawPoints,
      withdrawWaitDays,
      eurPerPoint,
      pointsPerKES,
      signupBonus,
      active,
      digestDay,
      referralBonus,
      dailyAccrualPoints,
      enableDailyAccrual
    } = req.body || {};
    const pid = current.programId;

    // eligibleUserTypes expects array here
    if (eligibleUserTypes !== undefined) {
      if (!Array.isArray(eligibleUserTypes) || eligibleUserTypes.some(v => typeof v !== "string")) {
        return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"eligibleUserTypes must be array of strings" } });
      }
      await upsertSetting(pid, "eligibleUserTypes", JSON.stringify(eligibleUserTypes));
    }

    function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
    const nmap = [
      ["durationMonths", durationMonths],
      ["minWithdrawPoints", minWithdrawPoints],
      ["withdrawWaitDays", withdrawWaitDays],
      ["eurPerPoint", eurPerPoint],
      ["pointsPerKES", pointsPerKES],
      ["signupBonus", signupBonus],
      ["referralBonus", referralBonus],
      ["dailyAccrualPoints", dailyAccrualPoints],
      ["enableDailyAccrual", enableDailyAccrual]
    ];
    for (const [k, v] of nmap) {
      if (v !== undefined) {
        const n = toNum(v);
        if (n === null || n < 0) return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:`${k} must be non-negative number` } });
        await upsertSetting(pid, k, n);
      }
    }

    if (digestDay !== undefined) {
      await upsertSetting(pid, "digestDay", String(digestDay));
    }

    if (active !== undefined) {
      const flag = /^(true|1|yes)$/i.test(String(active)) || active === true || active === 1;
      await setProgramActive(pid, flag);
    }

    const updated = await getProgramByCode(code);
    res.json({ success: true, program: updated });
  } catch (e) {
    console.error("[loyalty/programs/:code/settings][PUT]", e);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: e.message } });
  }
});
// ---- User types (for multi-select on card) ------------------
router.get("/user-types", async (_req, res) => {
  try {
    await ensureSchemaAndSeed();

    // 1) Discover which column exists
    const cols = await withDb(db => all(db, `PRAGMA table_info(users)`));
    const names = cols.map(c => c.name);
    const candidates = ["type", "role", "user_type", "userType"]; // whitelist
    const chosen = candidates.find(n => names.includes(n));

    if (!chosen) {
      // No recognizable column -> empty list, not an error
      return res.json({ success: true, types: [] });
    }

    // 2) Query only the existing column (safe — from whitelist above)
    const rows = await withDb(db => all(db, `
      SELECT DISTINCT TRIM(${chosen}) AS user_type
      FROM users
      WHERE ${chosen} IS NOT NULL AND TRIM(${chosen}) <> ''
      ORDER BY user_type COLLATE NOCASE
    `));

    res.json({ success: true, types: rows.map(r => r.user_type) });
  } catch (e) {
    console.error("[loyalty/user-types][GET]", e);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: e.message } });
  }
});

// ---- Accounts helpers ---------------------------------------
async function getAccountById(id) {
  return withDb((db) =>
    get(db, `SELECT * FROM loyalty_accounts WHERE id=?`, [id])
  );
}
async function getAccountByUser(programId, userId) {
  return withDb((db) =>
    get(db, `SELECT * FROM loyalty_accounts WHERE program_id=? AND user_id=?`, [programId, userId])
  );
}
async function updateAccountStatus(id, newStatus) {
  return withDb((db) =>
    run(db, `UPDATE loyalty_accounts SET status=?, updated_at=datetime('now','localtime') WHERE id=?`, [newStatus, id])
  );
}
async function insertLedger(accountId, kind, delta, note, adminId, adminNote = null) {
  return withDb((db) =>
    run(db, `INSERT INTO loyalty_ledger (account_id, kind, points_delta, note, admin_user_id, admin_note)
             VALUES (?,?,?,?,?,?)`, [accountId, kind, delta, note || null, adminId || null, adminNote])
  );
}
function addMonths(isoDate, months) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0,10);
}
async function extendAccountEndDate(id, months) {
  return withDb(async (db) => {
    const row = await get(db, `SELECT end_date FROM loyalty_accounts WHERE id=?`, [id]);
    if (!row) throw new Error("ACCOUNT_NOT_FOUND");
    const base = row.end_date || new Date().toISOString().slice(0,10);
    const newEnd = addMonths(base, months);
    await run(db, `UPDATE loyalty_accounts SET end_date=?, updated_at=datetime('now','localtime') WHERE id=?`, [newEnd, id]);
    return newEnd;
  });
}

// ---- NEW: Create account for a user without one --------------
router.post("/accounts", async (req, res) => {
  try {
    await ensureSchemaAndSeed();
    const userId = parseInt(req.body?.userId, 10);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"userId required" } });
    }

    // Load program + settings
    const program = await getProgramByCode("STAFF");
    if (!program?.programId) {
      return res.status(400).json({ success:false, error:{ code:"PROGRAM_MISSING", message:"Loyalty program not configured" } });
    }

    // Reject if already has account
    const existing = await getAccountByUser(program.programId, userId);
    if (existing) {
      return res.json({ success:true, accountId: existing.id, message:"User already has an account" });
    }

    const durationMonths = Number(program.durationMonths);
    if (!Number.isFinite(durationMonths) || durationMonths < 1) {
      return res.status(400).json({ success:false, error:{ code:"BAD_PROGRAM", message:"Invalid durationMonths in program settings" } });
    }

    const withdrawWaitDays = Number(program.withdrawWaitDays ?? 90) || 90;
    const signupBonus      = Number(program.signupBonus ?? 0) || 0;

    // Dates
    const start = new Date();
    const end   = new Date(start); end.setMonth(end.getMonth() + durationMonths);
    const elig  = new Date(start); elig.setDate(elig.getDate() + withdrawWaitDays);
    const ymd = (d) => d.toISOString().slice(0,10);

    // Create account
    let accountId;
    // Use a single DB connection for account creation and bonus update
    await withDb(async (db) => {
      const ins = await run(db, `
        INSERT INTO loyalty_accounts
          (program_id, user_id, status, start_date, end_date, eligible_from,
           points_balance, total_earned, total_penalty, total_paid,
           created_at, updated_at, duration_months)
        VALUES
          (?, ?, 'Active', ?, ?, ?, 0, 0, 0, 0, datetime('now','localtime'), datetime('now','localtime'), ?)`,
        [program.programId, userId, ymd(start), ymd(end), ymd(elig), durationMonths]
      );
      accountId = ins.lastID;

      // Signup bonus → ledger only (triggers will recalc accounts mirror)
      if (signupBonus > 0) {
        await insertLedger(accountId, "enroll", signupBonus, "Signup bonus", null, null);
        // 🩹 Recalculate account totals after enrollment (signup bonus)
        await run(
          db,
          `UPDATE loyalty_accounts
             SET points_balance = points_balance + ?,
                 total_earned   = total_earned + ?
           WHERE id = ?;`,
          [signupBonus, signupBonus, accountId]
        );
      }
    });

    // Enqueue notification with deep link to Offers
    const deepLink = `/myaccount/offers.html?welcome=1`;
    try {
      await withDb((db) =>
        run(db, `
          INSERT INTO notifications_queue (user_id, account_id, kind, status, created_at)
          VALUES (?, ?, 'LOYALTY_ENROLLED', 'Queued', datetime('now','localtime'))`,
        [userId, accountId])
      );
    } catch (e) {
      console.warn("[loyalty/accounts][notify] enqueue failed:", e.message);
    }
    console.log("[loyalty/accounts] reached after account creation, accountId=", accountId);

    // 🩹 Welcome message notification (email + queue)
    let user, msg;
    try {
      user = await withDb((db) =>
        get(db, `SELECT name, email FROM users WHERE id=?`, [userId])
      );
      msg = `Welcome ${user?.name || ""}! Your WattSun Loyalty account is now active for ${durationMonths} months.`;

      await withDb((db) =>
        run(
          db,
          `INSERT INTO notifications_queue
             (kind, user_id, email, payload, status, account_id, note, created_at)
           VALUES ('loyalty_welcome', ?, ?, json(?), 'Queued', ?, ?, datetime('now','localtime'))`,
          [
            userId,
            user?.email || "",
            JSON.stringify({
              subject: "Welcome to WattSun Loyalty",
              message: msg,
              email: user?.email,
            }),
            accountId,
            msg,
          ]
        )
      );
      console.log("[loyalty/accounts] welcome notification queued for userId=", userId);
    } catch (e) {
      console.warn("[loyalty/accounts][welcome] notification insert failed:", e.message);
    }

    console.log("[loyalty/accounts] welcome INSERT complete for userId=", userId);

    // Optional immediate email (if nodemailer configured)
    try {
      await enqueue("loyalty_welcome", {
        userId,
        accountId,
        payload: { email: user?.email, subject: "Welcome to WattSun Loyalty", message: msg },
      });
    } catch (e) {
      console.warn("[loyalty/accounts][welcome-email] enqueue failed:", e.message);
    }

    res.setHeader("X-Loyalty-Updated", "create-account");
    res.setHeader("X-Loyalty-Refresh", "accounts,ledger,notifications");
    return res.json({ success:true, accountId, message:"Account created and user notified", deepLink });
  } catch (e) {
    console.error("[admin/loyalty/accounts][POST]", e);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to create account" } });
  }
});

// ---- Accounts & Ledger endpoints ----------------------------
// Accept PATCH (new) and POST (legacy) for status updates
async function handleAccountStatus(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const status = String((req.body?.status || "")).trim();
    if (!["Active","Suspended","Closed","Paused"].includes(status)) {
      return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"Invalid status" } });
    }
    const acct = await getAccountById(id);
    if (!acct) return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Account not found" } });

    const oldStatus = acct.status;

    // —— NO-OP GUARD: do nothing if status didn't change
    if (oldStatus === status) {
      return res.json({ success:true, account: acct, note: "No change" });
    }

    await updateAccountStatus(id, status);
    await insertLedger(
      id,
      "status",
      0,
      `Admin change: ${oldStatus} → ${status}. ${req.body?.note || ""}`,
      req.session?.user?.id,
      req.body?.note || null
    );

    try {
      await enqueue("status_change", {
        userId: acct.user_id,
        accountId: id,
        payload: { oldStatus, newStatus: status, note: req.body?.note || "" }
      });
    } catch (e) {
      console.warn("enqueue(status_change) failed:", e.message);
    }

    const updated = await getAccountById(id);
    res.json({ success:true, account: updated });
  } catch (e) {
    console.error("[loyalty/accounts/:id/status]", e);
    res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:e.message } });
  }
}
router.patch("/accounts/:id/status", handleAccountStatus);
router.post("/accounts/:id/status", handleAccountStatus);

// Penalize points
router.post("/penalize", async (req, res) => {
  try {
    const { userId, points, note } = req.body || {};
    const p = Number(points);
    if (!userId || !Number.isInteger(p) || p < 1) {
      return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"userId and points>=1 required" } });
    }
    const prog = await withDb((db) => get(db, `SELECT id FROM loyalty_programs WHERE code='STAFF'`));
    if (!prog?.id) return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Program not found" } });

    const acct = await getAccountByUser(prog.id, parseInt(userId, 10));
    if (!acct) return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Account not found for user" } });

    await insertLedger(
      acct.id,
      "penalty",
      -p,
      note || "Admin penalty",
      req.session?.user?.id,
      note || null
    );
    // 🔧 Adjust account totals explicitly (fix regression)
    await withDb(async (db) => {
      await run(
        db,
        `UPDATE loyalty_accounts
          SET points_balance = points_balance - ?,
              total_penalty  = total_penalty + ?
        WHERE id = ?`,
        [p, p, acct.id]
      );
    });

    try {
      const updatedNow = await getAccountById(acct.id);
      await enqueue("penalty", {
        userId: acct.user_id,
        accountId: acct.id,
        payload: { points: p, note: note || "", balance: updatedNow.points_balance }
      });
    } catch (e) {
      console.warn("enqueue(penalty) failed:", e.message);
    }

    const updated = await getAccountById(acct.id);
    res.json({ success:true, account: updated });
  } catch (e) {
    console.error("[admin/loyalty/penalize]", e);
    res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:e.message } });
  }
});

// Extend end date
router.post("/extend", async (req, res) => {
  try {
    const { userId, months, note } = req.body || {};
    const m = Number(months);
    if (!userId || !Number.isInteger(m) || m < 1) {
      return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"userId and months>=1 required" } });
    }
    const prog = await withDb((db) => get(db, `SELECT id FROM loyalty_programs WHERE code='STAFF'`));
    if (!prog?.id) return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Program not found" } });

    const acct = await getAccountByUser(prog.id, parseInt(userId, 10));
    if (!acct) return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Account not found for user" } });

    const newEnd = await extendAccountEndDate(acct.id, m);
    await insertLedger(
      acct.id,
      "extend",
      0,
      `Extended by ${m} month(s). ${note || ""}`,
      req.session?.user?.id,
      note || null
    );

    const updated = await getAccountById(acct.id);
    res.json({ success:true, account: updated, newEnd });
  } catch (e) {
    console.error("[admin/loyalty/extend]", e);
    res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:e.message } });
  }
});

// ---- Read-only visibility (Accounts, Ledger, Notifications) --
router.get("/accounts", async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = "";
    if (status) { where = "WHERE a.status = ?"; params.push(status); }
    const rows = await withDb((db) =>
      all(
        db,
        `SELECT a.id, a.user_id,
                u.email,
                a.status, a.start_date, a.end_date,
                a.duration_months,
                a.points_balance, a.total_earned, a.total_penalty, a.total_paid
           FROM loyalty_accounts a
      LEFT JOIN users u ON u.id = a.user_id
          ${where}
          ORDER BY a.id DESC`,
        params
      )
    );
    res.json({ success: true, accounts: rows });
  } catch (e) {
    console.error("[admin/loyalty/accounts]", e);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: e.message } });
  }
});

router.get("/ledger", async (req, res) => {
  try {
    const { kind } = req.query;
    const params = [];
    let where = "";
    if (kind) { where = "WHERE kind = ?"; params.push(kind); }
    const rows = await withDb((db) =>
      all(
        db,
        `SELECT id, account_id, kind,
                points_delta AS delta_points,
                note, created_at
           FROM loyalty_ledger
           ${where}
          ORDER BY id DESC
          LIMIT 100`,
        params
      )
    ).catch(() => []);
    res.json({ success: true, ledger: rows });
  } catch (e) {
    console.error("[admin/loyalty/ledger]", e);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: e.message } });
  }
});

router.get("/notifications", async (req, res) => {
  try {
    // Normalize the incoming filter; ignore "All"/"Any"/empty
    const raw = (req.query.status || "").toString().trim();
    const status = raw && !/^(all|any)$/i.test(raw) ? raw : "";

    const params = [];
    let where = "";
    if (status) { where = "WHERE nq.status = ?"; params.push(status); }

    // Enrich email from users via user_id or account_id
    const rows = await withDb((db) =>
      all(
        db,
        `SELECT nq.id,
                nq.kind,
                COALESCE(nq.email, u.email, u2.email) AS email,
                nq.status,
                nq.created_at
           FROM notifications_queue nq
      LEFT JOIN users u            ON u.id = nq.user_id
      LEFT JOIN loyalty_accounts a ON a.id = nq.account_id
      LEFT JOIN users u2           ON u2.id = a.user_id
           ${where}
          ORDER BY nq.id DESC
          LIMIT 100`,
        params
      )
    ).catch(() => []);

    res.json({ success: true, notifications: rows });
  } catch (e) {
    console.error("[admin/loyalty/notifications]", e);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: e.message } });
  }
});

module.exports = router;
