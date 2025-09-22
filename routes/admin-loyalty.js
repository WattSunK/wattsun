// routes/admin-loyalty.js
// Admin endpoints for Loyalty program settings + account controls (status/penalize/extend)
// Also enqueues notifications for penalty and status changes.
// NOTE: Admin authorization is enforced in server.js (global middleware). No route-level gate here.

const express = require("express");
const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { enqueue } = require("./lib/notify"); // NOTE: ensure this path exists in your repo

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

// ---- helpers -------------------------------------------------
function mergeProgramRowset(rows) {
  if (!rows || rows.length === 0) return null;
  const base = {
    programId: rows[0].program_id,
    code: rows[0].code,
    name: rows[0].name,
    active: !!rows[0].active,
    eligibleUserTypes: ["Staff"],
    durationMonths: 6,
    withdrawWaitDays: 90,
    minWithdrawPoints: 100,
    eurPerPoint: 1,
    signupBonus: 100,
  };
  for (const r of rows) {
    if (!r || !r.key) continue;
    let v = r.value;
    try {
      if (typeof v === "string" && /^\s*(\[|\{)/.test(v)) v = JSON.parse(v);
    } catch (_) {}
    if (["durationMonths","withdrawWaitDays","minWithdrawPoints","eurPerPoint","signupBonus"].includes(r.key)) {
      const n = parseFloat(v);
      if (Number.isFinite(n)) v = n;
    }
    base[r.key] = v;
  }
  return base;
}

function getAllPrograms() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT p.id AS program_id, p.code, p.name, p.active, s.key, s.value
       FROM loyalty_programs p
       LEFT JOIN loyalty_program_settings s ON s.program_id = p.id
       ORDER BY p.id ASC`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        const byId = new Map();
        for (const r of rows) {
          if (!byId.has(r.program_id)) byId.set(r.program_id, []);
          byId.get(r.program_id).push(r);
        }
        const list = [];
        for (const [, group] of byId) list.push(mergeProgramRowset(group));
        resolve(list);
      }
    );
  });
}

function getProgramByCode(code) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT p.id AS program_id, p.code, p.name, p.active, s.key, s.value
       FROM loyalty_programs p
       LEFT JOIN loyalty_program_settings s ON s.program_id = p.id
       WHERE p.code = ?`,
      [code],
      (err, rows) => (err ? reject(err) : resolve(mergeProgramRowset(rows)))
    );
  });
}

async function getProgramIdByCode(code) {
  const row = await get(`SELECT id FROM loyalty_programs WHERE code = ?`, [code]);
  if (!row) throw new Error(`PROGRAM_NOT_FOUND:${code}`);
  return row.id;
}

/** KV-style setting upsert for legacy rows (program_id, key, value) */
async function upsertSettingKV(programId, key, value) {
  // 1) try update
  const upd = await run(
    `UPDATE loyalty_program_settings
       SET value = ?, updated_at = datetime('now')
     WHERE program_id = ? AND key = ?`,
    [String(value), programId, key]
  );
  // 2) if no row updated, insert
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
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE loyalty_programs SET active=?, updated_at=datetime('now') WHERE id=?`,
      [active ? 1 : 0, programId],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
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

// ---- routes --------------------------------------------------

// GET /api/admin/loyalty/programs
router.get("/programs", async (req, res) => {
  try {
    const programs = await getAllPrograms();
    return res.json({ success:true, programs });
  } catch (err) {
    console.error("[admin/loyalty/programs]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to load programs" } });
  }
});

// PUT /api/admin/loyalty/programs/:code/settings (legacy KV writer kept for compatibility)
router.put("/programs/:code/settings", async (req, res) => {
  try {
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
      signupBonus,
      active
    } = req.body || {};
    const patches = [];

    if (eligibleUserTypes !== undefined) {
      if (!Array.isArray(eligibleUserTypes) || eligibleUserTypes.some(v => typeof v !== "string")) {
        return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"eligibleUserTypes must be array of strings" } });
      }
      patches.push(upsertSettingKV(current.programId, "eligibleUserTypes", JSON.stringify(eligibleUserTypes)));
    }

    function toIntOrNull(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }
    const intMap = [
      ["durationMonths", durationMonths],
      ["minWithdrawPoints", minWithdrawPoints],
      ["withdrawWaitDays", withdrawWaitDays],
      ["eurPerPoint", eurPerPoint],
      ["signupBonus", signupBonus],
    ];
    for (const [k, v] of intMap) {
      if (v !== undefined) {
        const n = toIntOrNull(v);
        if (n === null) return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:`${k} must be integer` } });
        patches.push(upsertSettingKV(current.programId, k, String(n)));
      }
    }

    if (active !== undefined) {
      const flag = /^(true|1|yes)$/i.test(String(active)) || active === true;
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
    await insertLedger(id, "status", 0, `Admin change: ${oldStatus} → ${status}. ${note || ""}`, req.session.user?.id);

    // enqueue notification
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
    // For now, assume STAFF program
    const programRow = await get(`SELECT id FROM loyalty_programs WHERE code='STAFF'`, []);
    const programId = programRow?.id;
    if (!programId) return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Program not found" } });

    const acct = await getAccountByUser(programId, parseInt(userId, 10));
    if (!acct) return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Account not found for user" } });

    await insertLedger(acct.id, "penalty", -p, note || "Admin penalty", req.session.user?.id);

    // enqueue notification
    try {
      const updated = await getAccountById(acct.id);
      await enqueue("penalty", {
        userId: acct.user_id,
        payload: { points: p, note: note || "", balance: updated.points_balance }
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
    await insertLedger(acct.id, "extend", 0, `Extended by ${m} month(s). ${note || ""}`, req.session.user?.id);

    const updated = await getAccountById(acct.id);
    return res.json({ success:true, account: updated });
  } catch (err) {
    console.error("[admin/loyalty/extend]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to extend account" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin → Program Settings + Account Status (mount: /api/admin/loyalty/*)
// ─────────────────────────────────────────────────────────────────────────────

/** helper: read all program settings for code 'STAFF' into a single object */
async function getProgramSettings() {
  const code = 'STAFF';
  const rows = await all(
    `SELECT key, value_json, value_text, value_int
       FROM loyalty_program_settings
      WHERE program_code = ?`,
    [code]
  );

  const activeRow = await get(`SELECT active FROM loyalty_programs WHERE code = ?`, [code]);

  const out = {
    programCode: code,
    // sensible defaults
    eligibleUserTypes: ['Staff'],
    durationMonths: 6,
    withdrawWaitDays: 90,
    minWithdrawPoints: 100,
    eurPerPoint: 1,
    signupBonus: 100,
    active: !!(activeRow && activeRow.active),
  };

  for (const row of rows) {
    const k = row.key;
    if (row.value_json != null) {
      try { out[k] = JSON.parse(row.value_json); } catch { /* ignore */ }
    } else if (row.value_int != null) {
      out[k] = Number(row.value_int);
    } else if (row.value_text != null) {
      out[k] = row.value_text;
    }
  }
  return out;
}

/** helper: upsert a single (program_id, program_code, key) into *_json/_int/_text columns */
async function upsertSettingTyped(programId, code, key, val) {
  // derive typed fields
  let vJson = null, vInt = null, vText = null;
  if (Array.isArray(val) || (val && typeof val === 'object')) vJson = JSON.stringify(val);
  else if (typeof val === 'number' && Number.isFinite(val)) vInt = Math.trunc(val);
  else if (typeof val === 'boolean') vInt = val ? 1 : 0;
  else vText = String(val);

  // mirror into legacy 'value' (NOT NULL)
  const vLegacy =
    vText != null ? vText :
    vInt  != null ? String(vInt) :
    vJson != null ? vJson : "";

  // 1) try UPDATE by program_id (robust)
  let upd = await run(
    `UPDATE loyalty_program_settings
       SET value = ?, value_json = ?, value_int = ?, value_text = ?, updated_at = datetime('now')
     WHERE program_id = ? AND key = ?`,
    [vLegacy, vJson, vInt, vText, programId, key]
  );

  // 2) fallback: update by program_code (in case legacy rows use code only)
  if (!upd.changes) {
    upd = await run(
      `UPDATE loyalty_program_settings
         SET value = ?, value_json = ?, value_int = ?, value_text = ?, program_id = ?, updated_at = datetime('now')
       WHERE program_code = ? AND key = ?`,
      [vLegacy, vJson, vInt, vText, programId, code, key]
    );
  }

  // 3) still nothing? insert (include both program_id & program_code)
  if (!upd.changes) {
    await run(
      `INSERT INTO loyalty_program_settings
         (program_id, program_code, key, value, value_json, value_int, value_text, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [programId, code, key, vLegacy, vJson, vInt, vText]
    );
  }
}

/** GET /api/admin/loyalty/program  → current settings */
router.get("/program", async (req, res) => {
  try {
    const program = await getProgramSettings();
    return res.json({ success: true, program });
  } catch (e) {
    return res.status(500).json({ success: false, error: { message: e.message } });
  }
});

/** PUT /api/admin/loyalty/program  → update settings */
router.put("/program", async (req, res) => {
  const code = 'STAFF';
  const payload = req.body || {};
  // only allow known keys
  const allowed = [
    'eligibleUserTypes', 'durationMonths', 'withdrawWaitDays',
    'minWithdrawPoints', 'eurPerPoint', 'signupBonus', 'active'
  ];
  const entries = Object.entries(payload).filter(([k]) => allowed.includes(k));

  if (!entries.length) {
    return res.status(400).json({ success: false, error: { message: "No valid settings provided." } });
  }

  try {
    const programId = await getProgramIdByCode(code);

    await run("BEGIN");
    for (const [k, v] of entries) {
      if (k === 'active') {
        const flag = v === true || /^(true|1|yes)$/i.test(String(v));
        await run(
          `UPDATE loyalty_programs SET active = ?, updated_at = datetime('now') WHERE id = ?`,
          [flag ? 1 : 0, programId]
        );
        continue;
      }

      // sanitize integers
      const vv = ['durationMonths','withdrawWaitDays','minWithdrawPoints','signupBonus']
        .includes(k) ? Math.max(0, parseInt(v, 10) || 0) : v;

      await upsertSettingTyped(programId, code, k, vv);
    }
    await run("COMMIT");

    const program = await getProgramSettings();
    return res.json({ success: true, program });
  } catch (e) {
    try { await run("ROLLBACK"); } catch {}
    return res.status(500).json({ success: false, error: { message: e.message } });
  }
});

/** PATCH /api/admin/loyalty/accounts/:id/status  → Active|Paused|Closed  */
router.patch("/accounts/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const status = String((req.body && req.body.status) || '').trim();
  if (!id || !['Active','Paused','Closed'].includes(status)) {
    return res.status(400).json({ success:false, error:{ message:"Invalid account id or status." } });
  }

  try {
    const result = await run(`UPDATE loyalty_accounts SET status = ?, updated_at = datetime('now') WHERE id = ?`, [status, id]);
    // Notify member (best-effort)
    enqueue('status_change', { payload: { accountId: id, status } }).catch(()=>{});
    return res.json({ success:true, updated: result.changes });
  } catch (err) {
    return res.status(500).json({ success:false, error:{ message: err.message } });
  }
});

// GET /api/admin/loyalty/accounts/:id  → returns minimal account info for the modal
router.get("/accounts/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success:false, error:{ message:"Invalid id" } });
  db.get(`
    SELECT id, user_id, status, start_date, eligible_from, end_date, points_balance
    FROM loyalty_accounts WHERE id = ?`, [id], (err, row) => {
      if (err) return res.status(500).json({ success:false, error:{ message:err.message }});
      if (!row) return res.status(404).json({ success:false, error:{ message:"Not found" }});
      return res.json({ success:true, account: row });
  });
});

// --- Increment 2: Read-only visibility (Accounts, Ledger, Notifications) ---

// GET /api/admin/loyalty/accounts
router.get("/accounts", async (req, res) => {
  try {
    const rows = await all(
      `SELECT a.id, a.user_id,
              u.email,
              a.status, a.start_date, a.end_date,
              a.duration_months,
              a.points_balance, a.total_earned, a.total_penalty, a.total_paid
         FROM loyalty_accounts a
    LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.id DESC`
    );
    return res.json({ success: true, accounts: rows });
  } catch (err) {
    console.error("[admin/loyalty/accounts]", err);
    return res
      .status(500)
      .json({ success: false, error: { code: "SERVER_ERROR", message: err.message } });
  }
});

// GET /api/admin/loyalty/ledger
router.get("/ledger", async (req, res) => {
  try {
    const rows = await all(
      `SELECT id, account_id, kind, points_delta, note, created_at
         FROM loyalty_ledger
        ORDER BY created_at DESC
        LIMIT 100`
    );
    return res.json({ success: true, ledger: rows });
  } catch (err) {
    console.error("[admin/loyalty/ledger]", err);
    return res
      .status(500)
      .json({ success: false, error: { code: "SERVER_ERROR", message: err.message } });
  }
});

// GET /api/admin/loyalty/notifications
router.get("/notifications", async (req, res) => {
  try {
    const rows = await all(
      `SELECT id, kind, email, payload, status, created_at
         FROM notifications_queue
        ORDER BY created_at DESC
        LIMIT 100`
    );
    return res.json({ success: true, notifications: rows });
  } catch (err) {
    console.error("[admin/loyalty/notifications]", err);
    return res
      .status(500)
      .json({ success: false, error: { code: "SERVER_ERROR", message: err.message } });
  }
});

module.exports = router;
