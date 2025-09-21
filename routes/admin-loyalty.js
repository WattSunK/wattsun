// routes/admin-loyalty.js
// Admin endpoints for the Staff Loyalty program.
// - Reads/writes settings (typed + legacy) with robust upsert
// - Minimal account actions (penalize, status, extend) + notifications
// - DB path resolution matches rest of project

const express = require("express");
const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { enqueue } = require("./lib/notify");

// ---- DB path (keep in sync with other routes) --------------------------
const DB_PATH =
  process.env.DB_PATH_ADMIN ||
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(process.cwd(), "data/dev/wattsun.dev.db");

const db = new sqlite3.Database(DB_PATH);
// ------------------------------------------------------------------------

// Small sqlite helpers
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
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

// Canonical code; we’ll still read actual code from DB to avoid casing issues
const CANON_CODE = "STAFF";

// Ensure there is exactly one program row, return its id+code
async function getOrCreateProgram() {
  let row = await get(`SELECT id, code FROM loyalty_programs WHERE UPPER(code)=UPPER(?)`, [CANON_CODE]);
  if (!row) {
    const ins = await run(`INSERT INTO loyalty_programs(code) VALUES (?)`, [CANON_CODE]);
    row = { id: ins.lastID, code: CANON_CODE };
  }
  return row;
}

// Inflate program from settings rows (typed + legacy)
function inflateProgramFromRows(code, rows) {
  const getString = (k, d = "") => {
    const r = rows.find((x) => x.key === k);
    if (!r) return d;
    if (r.value_text != null && r.value_text !== "") return String(r.value_text);
    if (r.value != null && r.value !== "") return String(r.value);
    if (r.value_json != null && r.value_json !== "") return String(r.value_json);
    if (r.value_int != null) return String(r.value_int);
    if (r.value_real != null) return String(r.value_real);
    return d;
  };
  const getInt = (k, d = 0) => {
    const r = rows.find((x) => x.key === k);
    if (!r) return d;
    if (r.value_int != null) return Number(r.value_int);
    if (r.value_real != null) return Math.trunc(Number(r.value_real));
    const raw = r.value_text ?? r.value ?? r.value_json;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : d;
  };
  const getReal = (k, d = 0) => {
    const r = rows.find((x) => x.key === k);
    if (!r) return d;
    if (r.value_real != null) return Number(r.value_real);
    if (r.value_int != null) return Number(r.value_int);
    const raw = r.value_text ?? r.value ?? r.value_json;
    const n = Number(raw);
    return Number.isFinite(n) ? n : d;
  };
  const getArray = (k, d = []) => {
    const r = rows.find((x) => x.key === k);
    if (!r) return d;
    const raw = r.value_json ?? r.value ?? r.value_text;
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : d;
    } catch {
      if (typeof raw === "string" && raw.trim()) {
        return raw.split(",").map((s) => s.trim()).filter(Boolean);
      }
      return d;
    }
  };

  return {
    programCode: String(code || CANON_CODE),
    eligibleUserTypes: getArray("eligibleUserTypes", ["Staff"]),
    durationMonths: getInt("durationMonths", 6),
    withdrawWaitDays: getInt("withdrawWaitDays", 90),
    minWithdrawPoints: getInt("minWithdrawPoints", 100),
    eurPerPoint: getReal("eurPerPoint", 1.0),
    signupBonus: getInt("signupBonus", 100),
    active: getInt("active", 1) === 1,
  };
}

// Robust upsert that satisfies legacy NOT NULL `value` and typed columns.
// UPDATE by program_id first; fallback by program_code; else INSERT.
async function upsertSettingTyped(programId, code, key, val) {
  let vJson = null, vInt = null, vText = null, vReal = null;

  if (Array.isArray(val) || (val && typeof val === "object")) vJson = JSON.stringify(val);
  else if (typeof val === "number" && Number.isFinite(val)) {
    vReal = val;
    vInt = Number.isInteger(val) ? val : Math.trunc(val);
  } else if (typeof val === "boolean") vInt = val ? 1 : 0;
  else vText = String(val);

  const vLegacy =
    vText != null ? vText :
    vInt  != null ? String(vInt) :
    vReal != null ? String(vReal) :
    vJson != null ? vJson : "";

  // 1) UPDATE by program_id
  let upd = await run(
    `UPDATE loyalty_program_settings
       SET value=?, value_json=?, value_int=?, value_text=?, value_real=?, updated_at=datetime('now')
     WHERE program_id=? AND key=?`,
    [vLegacy, vJson, vInt, vText, vReal, programId, key]
  );

  // 2) fallback UPDATE by program_code (legacy rows)
  if (!upd.changes) {
    upd = await run(
      `UPDATE loyalty_program_settings
         SET value=?, value_json=?, value_int=?, value_text=?, value_real=?, program_id=?, updated_at=datetime('now')
       WHERE program_code=? AND key=?`,
      [vLegacy, vJson, vInt, vText, vReal, programId, code, key]
    );
  }

  // 3) INSERT if still nothing
  if (!upd.changes) {
    await run(
      `INSERT INTO loyalty_program_settings
         (program_id, program_code, key, value, value_json, value_int, value_text, value_real, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [programId, code, key, vLegacy, vJson, vInt, vText, vReal]
    );
  }
}

// ---------------------- Program routes -------------------------

// GET /api/admin/loyalty/program
router.get("/program", async (req, res) => {
  try {
    const { id: programId, code } = await getOrCreateProgram();
    const rows = await all(
      `SELECT key, value, value_json, value_int, value_text, value_real
         FROM loyalty_program_settings
        WHERE program_id = ?
        ORDER BY key`,
      [programId]
    );
    const program = inflateProgramFromRows(code, rows);
    res.json({ success: true, program });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: String(err.message || err) } });
  }
});

// PUT /api/admin/loyalty/program
router.put("/program", async (req, res) => {
  try {
    const { id: programId } = await getOrCreateProgram();
    const rowCode = await get(`SELECT code FROM loyalty_programs WHERE id=?`, [programId]);
    const codeFromDb = rowCode?.code || CANON_CODE;

    const input = req.body || {};
    const plan = [];

    if (input.eligibleUserTypes != null) {
      let arr = input.eligibleUserTypes;
      if (!Array.isArray(arr)) {
        if (typeof arr === "string") arr = arr.split(",").map((s) => s.trim()).filter(Boolean);
        else arr = ["Staff"];
      }
      plan.push(["eligibleUserTypes", arr]);
    }
    if (input.durationMonths != null)      plan.push(["durationMonths", Number(input.durationMonths)]);
    if (input.withdrawWaitDays != null)    plan.push(["withdrawWaitDays", Number(input.withdrawWaitDays)]);
    if (input.minWithdrawPoints != null)   plan.push(["minWithdrawPoints", Number(input.minWithdrawPoints)]);
    if (input.eurPerPoint != null)         plan.push(["eurPerPoint", Number(input.eurPerPoint)]);
    if (input.signupBonus != null)         plan.push(["signupBonus", Number(input.signupBonus)]);
    if (input.active != null) {
      const act = typeof input.active === "boolean" ? (input.active ? 1 : 0) : Number(input.active) ? 1 : 0;
      plan.push(["active", act]);
    }

    for (const [k, v] of plan) {
      await upsertSettingTyped(programId, codeFromDb, k, v);
    }

    res.json({ success: true, updated: plan.length });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: String(err.message || err) } });
  }
});

// ---------------------- Accounts admin (minimal) ----------------

// GET /api/admin/loyalty/accounts  (basic list; extend as you need)
router.get("/accounts", async (req, res) => {
  try {
    const rows = await all(
      `SELECT id, user_id, status, start_date, eligible_from, end_date, points_balance
         FROM loyalty_accounts
        ORDER BY id DESC
        LIMIT 500`
    );
    res.json({ success: true, accounts: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: String(err.message || err) } });
  }
});

// GET /api/admin/loyalty/accounts/:id  → minimal view for modal
router.get("/accounts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success:false, error:{ message:"Invalid id" } });
    const row = await get(
      `SELECT id, user_id, status, start_date, eligible_from, end_date, points_balance
         FROM loyalty_accounts WHERE id = ?`,
      [id]
    );
    if (!row) return res.status(404).json({ success:false, error:{ message:"Not found" }});
    res.json({ success:true, account: row });
  } catch (err) {
    res.status(500).json({ success:false, error:{ message:String(err.message||err) }});
  }
});

// POST /api/admin/loyalty/accounts/:id/penalize  { points: 1, note?: "" }
router.post("/accounts/:id/penalize", async (req, res) => {
  try {
    const id = Number(req.params.id);
    let pts = Number(req.body?.points ?? 1);
    if (!Number.isFinite(pts) || pts <= 0) pts = 1;

    // Deduct points (negative delta) and write ledger
    await run(
      `UPDATE loyalty_accounts
          SET points_balance = points_balance - ?
        WHERE id = ?`,
      [pts, id]
    );
    await run(
      `INSERT INTO loyalty_ledger (account_id, kind, points_delta, note, created_at)
       VALUES (?, 'penalty', ?, ?, datetime('now'))`,
      [id, -pts, String(req.body?.note || "Admin penalty")]
    );

    // Notify
    await enqueue("penalty", { userId: null, email: null, payload: { points: pts, note: req.body?.note || "" } });

    res.json({ success: true, penalized: pts });
  } catch (err) {
    res.status(500).json({ success:false, error:{ message:String(err.message||err) }});
  }
});

// POST /api/admin/loyalty/accounts/:id/status  { status: "Active|Paused|Deactivated" }
router.post("/accounts/:id/status", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || "").trim();
    if (!["Active","Paused","Deactivated"].includes(status)) {
      return res.status(400).json({ success:false, error:{ message:"Invalid status" }});
    }
    await run(`UPDATE loyalty_accounts SET status=? WHERE id=?`, [status, id]);

    await enqueue("status_change", { userId: null, email: null, payload: { status } });

    res.json({ success:true, status });
  } catch (err) {
    res.status(500).json({ success:false, error:{ message:String(err.message||err) }});
  }
});

// POST /api/admin/loyalty/accounts/:id/extend  { months: 1 }
router.post("/accounts/:id/extend", async (req, res) => {
  try {
    const id = Number(req.params.id);
    let months = Number(req.body?.months ?? 1);
    if (!Number.isFinite(months) || months <= 0) months = 1;
    // Simply push end_date by N months (SQLite date math via julianday)
    await run(
      `UPDATE loyalty_accounts
          SET end_date = date(end_date, '+' || ? || ' months')
        WHERE id = ?`,
      [months, id]
    );
    res.json({ success:true, months });
  } catch (err) {
    res.status(500).json({ success:false, error:{ message:String(err.message||err) }});
  }
});

module.exports = router;
