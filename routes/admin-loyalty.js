// routes/admin-loyalty.js
// Admin endpoints for Loyalty program settings + account controls (status/penalize/extend)
// Adds a flat GET/PUT /program compat layer so the Settings card and Advanced modal
// can share the same storage seamlessly.

const express = require("express");
const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Optional: your notify queue util (leave as no-op if missing)
let enqueue = async () => {};
try {
  ({ enqueue } = require("./lib/notify"));
} catch (_) {}

// ---- DB ------------------------------------------------------
const DB_PATH =
  process.env.DB_PATH_ADMIN ||
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(process.cwd(), "data/dev/wattsun.dev.db");

const db = new sqlite3.Database(DB_PATH);

// small promise helpers
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

// ---- schema + seed (idempotent) ------------------------------
async function ensureSchemaAndSeed() {
  await run(`
    CREATE TABLE IF NOT EXISTS loyalty_programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS loyalty_program_settings (
      program_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(program_id, key),
      FOREIGN KEY(program_id) REFERENCES loyalty_programs(id) ON DELETE CASCADE
    )
  `);

  // Seed default program (STAFF) and a few sensible defaults if missing.
  const row = await get(`SELECT id FROM loyalty_programs WHERE code='STAFF'`, []);
  let programId = row?.id;
  if (!programId) {
    const ins = await run(
      `INSERT INTO loyalty_programs (code, name, active) VALUES ('STAFF','Default Loyalty Program',1)`
    );
    programId = ins.lastID;
  }

  const defaults = {
    // Global/card fields
    eligibleUserTypes: 'Staff',
    active: 1,                   // lives on programs table, not settings
    digestDay: 'Mon',
    referralBonus: 10,
    // Advanced/modal fields
    durationMonths: 6,
    withdrawWaitDays: 90,
    minWithdrawPoints: 100,
    pointsPerKES: 1,
    eurPerPoint: 1,              // optional alt-key
    signupBonus: 100,
    dailyAccrualPoints: 5,
    enableDailyAccrual: 1
  };

  // Program active is stored on programs table
  await run(
    `UPDATE loyalty_programs SET active=COALESCE(active,1) WHERE id=?`,
    [programId]
  );

  for (const [k, v] of Object.entries(defaults)) {
    if (k === "active") continue; // handled above
    await run(
      `INSERT OR IGNORE INTO loyalty_program_settings (program_id, key, value)
       VALUES (?,?,?)`,
      [programId, k, String(v)]
    );
  }

  return programId;
}

// ---- helpers -------------------------------------------------
function parseMaybeJSON(v) {
  try {
    if (typeof v === "string" && /^\s*(\[|\{)/.test(v)) return JSON.parse(v);
  } catch (_) {}
  return v;
}

function mergeProgramRowset(rows) {
  if (!rows || rows.length === 0) return null;
  const base = {
    programId: rows[0].program_id,
    code: rows[0].code,
    name: rows[0].name,
    active: !!rows[0].active,
  };
  for (const r of rows) {
    if (!r || !r.key) continue;
    let v = parseMaybeJSON(r.value);
    if (["durationMonths","withdrawWaitDays","minWithdrawPoints","pointsPerKES","eurPerPoint","signupBonus","dailyAccrualPoints","enableDailyAccrual","referralBonus"].includes(r.key)) {
      const n = Number(v);
      if (Number.isFinite(n)) v = n;
    }
    base[r.key] = v;
  }
  return base;
}

function mapToFlat(out) {
  // Flatten settings object for the card
  // Eligible user types may be array or csv; return csv string for the card.
  const eligible = out.eligibleUserTypes;
  const eligibleCsv = Array.isArray(eligible) ? eligible.join(", ") : String(eligible || "");
  return {
    // card (global)
    eligibleUserTypes: eligibleCsv,
    active: !!out.active,
    digestDay: out.digestDay ?? "Mon",
    referralBonus: Number(out.referralBonus ?? 0),
    // plus a few advanced keys so the card could show them later if needed
    durationMonths: Number(out.durationMonths ?? 6),
    withdrawWaitDays: Number(out.withdrawWaitDays ?? 90),
    minWithdrawPoints: Number(out.minWithdrawPoints ?? 100),
    pointsPerKES: Number(out.pointsPerKES ?? (out.eurPerPoint ?? 1)),
    signupBonus: Number(out.signupBonus ?? 100),
    dailyAccrualPoints: Number(out.dailyAccrualPoints ?? 5),
    enableDailyAccrual: !!out.enableDailyAccrual
  };
}

async function getAllPrograms() {
  const rows = await all(
    `SELECT p.id AS program_id, p.code, p.name, p.active, s.key, s.value
       FROM loyalty_programs p
       LEFT JOIN loyalty_program_settings s ON s.program_id = p.id
       ORDER BY p.id ASC`,
    []
  );
  const byId = new Map();
  for (const r of rows) {
    if (!byId.has(r.program_id)) byId.set(r.program_id, []);
    byId.get(r.program_id).push(r);
  }
  const list = [];
  for (const [, group] of byId) list.push(mergeProgramRowset(group));
  return list;
}

async function getProgramByCode(code) {
  const rows = await all(
    `SELECT p.id AS program_id, p.code, p.name, p.active, s.key, s.value
       FROM loyalty_programs p
       LEFT JOIN loyalty_program_settings s ON s.program_id = p.id
       WHERE p.code = ?`,
    [code]
  );
  return mergeProgramRowset(rows);
}

async function getProgramIdByCode(code) {
  const row = await get(`SELECT id FROM loyalty_programs WHERE code = ?`, [code]);
  if (!row) throw new Error(`PROGRAM_NOT_FOUND:${code}`);
  return row.id;
}

/** KV-style upsert for settings */
async function upsertSettingKV(programId, key, value) {
  const upd = await run(
    `UPDATE loyalty_program_settings
       SET value = ?, updated_at = datetime('now')
     WHERE program_id = ? AND key = ?`,
    [String(value), programId, key]
  );
  if (!upd.changes) {
    await run(
      `INSERT INTO loyalty_program_settings (program_id, key, value, updated_at)
       VALUES (?,?,?, datetime('now'))`,
      [programId, key, String(value)]
    );
  }
  return true;
}

function setProgramActive(programId, active) {
  return run(
    `UPDATE loyalty_programs SET active=?, updated_at=datetime('now') WHERE id=?`,
    [active ? 1 : 0, programId]
  ).then(() => true);
}

// Accounts helpers
function getAccountById(id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM loyalty_accounts WHERE id=?`, [id], (err, row) => err ? reject(err) : resolve(row || null));
  });
}
function getAccountByUser(programId, userId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM loyalty_accounts WHERE program_id=? AND user_id=?`, [programId, userId], (err, row) => err ? reject(err) : resolve(row || null));
  });
}
function updateAccountStatus(id, newStatus) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE loyalty_accounts SET status=?, updated_at=datetime('now') WHERE id=?`, [newStatus, id], function (err) {
      if (err) return reject(err);
      resolve(true);
    });
  });
}
function insertLedger(accountId, kind, delta, note, adminId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loyalty_ledger (account_id, kind, points_delta, note, admin_user_id) VALUES (?,?,?,?,?)`,
      [accountId, kind, delta, note || null, adminId || null],
      function (err) { if (err) return reject(err); resolve(this.lastID); }
    );
  });
}
function addMonths(isoDate, months) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0,10);
}
function extendAccountEndDate(id, months) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT end_date FROM loyalty_accounts WHERE id=?`, [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return reject(new Error("ACCOUNT_NOT_FOUND"));
      const newEnd = addMonths(row.end_date, months);
      db.run(`UPDATE loyalty_accounts SET end_date=?, updated_at=datetime('now') WHERE id=?`, [newEnd, id], function (err2) {
        if (err2) return reject(err2);
        resolve(newEnd);
      });
    });
  });
}

// ---- compat layer for Settings card --------------------------
// GET  /api/admin/loyalty/program      -> flat object for the card
// PUT  /api/admin/loyalty/program      -> accepts card + modal keys

router.get("/program", async (req, res) => {
  try {
    await ensureSchemaAndSeed();
    const program = await getProgramByCode("STAFF");
    if (!program) return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Program not found" } });
    return res.json(mapToFlat(program));
  } catch (err) {
    console.error("[admin/loyalty/program][GET]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to load program" } });
  }
});

router.put("/program", async (req, res) => {
  try {
    const programId = await ensureSchemaAndSeed();

    // Accept both shapes:
    // Card: { eligibleUserTypes: 'Staff, Customers', active, digestDay, referralBonus }
    // Modal: { eligibleUserTypes: ['Staff','Customers'], durationMonths, withdrawWaitDays, ... }
    const body = req.body || {};
    const patches = [];

    // Normalize alias programActive -> active
    if (body.programActive !== undefined && body.active === undefined) {
      body.active = body.programActive;
    }

    // active → programs table
    if (body.active !== undefined) {
      const flag = /^(true|1|yes)$/i.test(String(body.active)) || body.active === true || body.active === 1;
      patches.push(setProgramActive(programId, flag));
    }

    // eligibleUserTypes: accept csv string or array
    if (body.eligibleUserTypes !== undefined) {
      let val = body.eligibleUserTypes;
      if (typeof val === "string") {
        val = val.split(",").map(s => s.trim()).filter(Boolean);
      }
      if (!Array.isArray(val) || val.some(v => typeof v !== "string")) {
        return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"eligibleUserTypes must be array or csv string" } });
      }
      patches.push(upsertSettingKV(programId, "eligibleUserTypes", JSON.stringify(val)));
    }

    // digestDay + referralBonus (card fields)
    if (body.digestDay !== undefined) {
      patches.push(upsertSettingKV(programId, "digestDay", String(body.digestDay)));
    }
    if (body.referralBonus !== undefined) {
      const n = Number(body.referralBonus);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"referralBonus must be a non-negative number" } });
      }
      patches.push(upsertSettingKV(programId, "referralBonus", String(n)));
    }

    // Advanced fields tolerated here too (so modal can also call /program)
    const numericKeys = [
      "durationMonths",
      "withdrawWaitDays",
      "minWithdrawPoints",
      "pointsPerKES",
      "eurPerPoint",
      "signupBonus",
      "dailyAccrualPoints",
      "enableDailyAccrual"
    ];
    for (const k of numericKeys) {
      if (body[k] !== undefined) {
        const n = Number(body[k]);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:`${k} must be a non-negative number` } });
        }
        patches.push(upsertSettingKV(programId, k, String(n)));
      }
    }

    await Promise.all(patches);
    const updated = await getProgramByCode("STAFF");
    return res.json({ success:true, program: mapToFlat(updated) });
  } catch (err) {
    console.error("[admin/loyalty/program][PUT]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to update program" } });
  }
});

// ---- existing routes (kept as-is; minor refactor to use helpers) ----
// GET /api/admin/loyalty/programs
router.get("/programs", async (req, res) => {
  try {
    await ensureSchemaAndSeed();
    const programs = await getAllPrograms();
    return res.json({ success:true, programs });
  } catch (err) {
    console.error("[admin/loyalty/programs]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to load programs" } });
  }
});

// PUT /api/admin/loyalty/programs/:code/settings
router.put("/programs/:code/settings", async (req, res) => {
  try {
    await ensureSchemaAndSeed();
    const code = String(req.params.code || "STAFF");
    const current = await getProgramByCode(code);
    if (!current) {
      return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Program not found" } });
    }

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
    const patches = [];

    // eligibleUserTypes array only on this route
    if (eligibleUserTypes !== undefined) {
      if (!Array.isArray(eligibleUserTypes) || eligibleUserTypes.some(v => typeof v !== "string")) {
        return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"eligibleUserTypes must be array of strings" } });
      }
      patches.push(upsertSettingKV(current.programId, "eligibleUserTypes", JSON.stringify(eligibleUserTypes)));
    }

    function toNumberOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
    const intMap = [
      ["durationMonths", durationMonths],
      ["minWithdrawPoints", minWithdrawPoints],
      ["withdrawWaitDays", withdrawWaitDays],
      ["eurPerPoint", eurPerPoint],
      ["pointsPerKES", pointsPerKES],
      ["signupBonus", signupBonus],
      ["referralBonus", referralBonus],
      ["dailyAccrualPoints", dailyAccrualPoints],
      ["enableDailyAccrual", enableDailyAccrual],
    ];
    for (const [k, v] of intMap) {
      if (v !== undefined) {
        const n = toNumberOrNull(v);
        if (n === null || n < 0) return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:`${k} must be non-negative number` } });
        patches.push(upsertSettingKV(current.programId, k, String(n)));
      }
    }

    if (digestDay !== undefined) {
      patches.push(upsertSettingKV(current.programId, "digestDay", String(digestDay)));
    }

    if (active !== undefined) {
      const flag = /^(true|1|yes)$/i.test(String(active)) || active === true || active === 1;
      patches.push(setProgramActive(current.programId, flag));
    }

    await Promise.all(patches);
    const updated = await getProgramByCode(code);
    return res.json({ success:true, program: updated });
  } catch (err) {
    console.error("[admin/loyalty/programs/:code/settings]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to update settings" } });
  }
});

// POST /api/admin/loyalty/accounts/:id/status
router.post("/accounts/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, note } = req.body || {};
    if (!["Active","Paused","Closed"].includes(String(status))) {
      return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"status must be Active|Paused|Closed" } });
    }
    const acct = await getAccountById(id);
    if (!acct) return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Account not found" } });
    const oldStatus = acct.status;
    await updateAccountStatus(id, status);
    await insertLedger(id, "status", 0, `Admin change: ${oldStatus} → ${status}. ${note || ""}`, req.session?.user?.id);

    try {
      await enqueue("status_change", {
        userId: acct.user_id,
        payload: { oldStatus, newStatus: status, note: note || "" }
      });
    } catch (e) {
      console.warn("enqueue(status_change) failed:", e.message);
    }

    const updated = await getAccountById(id);
    return res.json({ success:true, account: updated });
  } catch (err) {
    console.error("[admin/loyalty/accounts/:id/status]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to update status" } });
  }
});

// POST /api/admin/loyalty/penalize
router.post("/penalize", async (req, res) => {
  try {
    const { userId, points = 1, note } = req.body || {};
    const p = parseInt(points, 10);
    if (!userId || !Number.isFinite(p) || p <= 0) {
      return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"userId and positive integer points required" } });
    }
    const programRow = await get(`SELECT id FROM loyalty_programs WHERE code='STAFF'`, []);
    const programId = programRow?.id;
    if (!programId) return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Program not found" } });

    const acct = await getAccountByUser(programId, parseInt(userId, 10));
    if (!acct) return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Account not found for user" } });

    await insertLedger(acct.id, "penalty", -p, note || "Admin penalty", req.session?.user?.id);

    try {
      const updatedNow = await getAccountById(acct.id);
      await enqueue("penalty", {
        userId: acct.user_id,
        payload: { points: p, note: note || "", balance: updatedNow.points_balance }
      });
    } catch (e) {
      console.warn("enqueue(penalty) failed:", e.message);
    }

    const updated = await getAccountById(acct.id);
    return res.json({ success:true, account: updated });
  } catch (err) {
    console.error("[admin/loyalty/penalize]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to apply penalty" } });
  }
});

// POST /api/admin/loyalty/extend
router.post("/extend", async (req, res) => {
  try {
    const { userId, months = 6, note } = req.body || {};
    const m = parseInt(months, 10);
    if (!userId || !Number.isFinite(m) || m <= 0) {
      return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"userId and positive integer months required" } });
    }
    const programRow = await get(`SELECT id FROM loyalty_programs WHERE code='STAFF'`, []);
    const programId = programRow?.id;
    if (!programId) return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Program not found" } });

    const acct = await getAccountByUser(programId, parseInt(userId, 10));
    if (!acct) return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Account not found for user" } });

    const newEnd = await extendAccountEndDate(acct.id, m);
    await insertLedger(acct.id, "extend", 0, `Extended by ${m} month(s). ${note || ""}`, req.session?.user?.id);

    const updated = await getAccountById(acct.id);
    return res.json({ success:true, account: updated });
  } catch (err) {
    console.error("[admin/loyalty/extend]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to extend account" } });
  }
});

// --- Read-only visibility (Accounts, Ledger, Notifications) ---
router.get("/accounts", async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = "";
    if (status) { where = "WHERE a.status = ?"; params.push(status); }
    const rows = await all(
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
    );
    return res.json({ success: true, accounts: rows });
  } catch (err) {
    console.error("[admin/loyalty/accounts]", err);
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: err.message } });
  }
});

router.get("/ledger", async (req, res) => {
  try {
    const { kind } = req.query;
    const params = [];
    let where = "";
    if (kind) { where = "WHERE kind = ?"; params.push(kind); }
    const rows = await all(
      `SELECT id, account_id, kind,
              points_delta AS delta_points,
              note, created_at
         FROM loyalty_ledger
         ${where}
        ORDER BY created_at DESC
        LIMIT 100`,
      params
    );
    return res.json({ success: true, ledger: rows });
  } catch (err) {
    console.error("[admin/loyalty/ledger]", err);
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: err.message } });
  }
});

router.get("/notifications", async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = "";
    if (status) { where = "WHERE status = ?"; params.push(status); }
    const rows = await all(
      `SELECT id, kind, email, payload, status, created_at
         FROM notifications_queue
         ${where}
        ORDER BY created_at DESC
        LIMIT 100`,
      params
    );
    return res.json({ success: true, notifications: rows });
  } catch (err) {
    console.error("[admin/loyalty/notifications]", err);
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: err.message } });
  }
});

module.exports = router;
