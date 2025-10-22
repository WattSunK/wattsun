// routes/loyalty.js
// Minimal Staff Loyalty routes: enroll + me
// Responses: { success, ... }

const express = require("express");
const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const { enqueue } = require("./lib/notify");
const db = require("./db_users"); // shared better-sqlite3 handle

// ---- helpers -------------------------------------------------

function requireStaff(req, res, next) {
  const u = req?.session?.user;
  if (!u || !/Staff/i.test(String(u.type || u.role || ""))) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Staff only" } });
  }
  next();
}

function requireAuth(req, res, next) {
  const u = req?.session?.user;
  if (!u) {
    return res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED", message: "Login required" } });
  }
  next();
}

function getProgramSettings(code = "STAFF") {
  const rows = db.prepare(`
    SELECT p.id as program_id, p.code, p.name, p.active, s.key, s.value
    FROM loyalty_programs p
    LEFT JOIN loyalty_program_settings s ON s.program_id = p.id
    WHERE p.code = ?
  `).all(code);
  if (!rows || rows.length === 0) return Promise.resolve(null);
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
    const k = r.key;
    let v = r.value;
    try { if (/^\s*(\[|\{)/.test(v)) v = JSON.parse(v); } catch (_) {}
    if (k === "eligibleUserTypes") {
      if (Array.isArray(v)) v = v.filter(Boolean).map(String);
      else if (typeof v === "string") v = v.split(",").map(s => s.trim()).filter(Boolean);
      else v = ["Staff"];
    }
    if (["durationMonths","withdrawWaitDays","minWithdrawPoints","eurPerPoint","signupBonus"].includes(k)) {
      const n = Number(v);
      v = Number.isFinite(n) && n >= 0 ? n : base[k];
    }
    base[k] = v;
  }
  if (base.duration_months && !base.durationMonths) base.durationMonths = Number(base.duration_months);
  if (!Number.isFinite(base.durationMonths)) base.durationMonths = 12;
  if (!Array.isArray(base.eligibleUserTypes) || base.eligibleUserTypes.length === 0) {
    base.eligibleUserTypes = ["Staff"];
  }
  return Promise.resolve(base);
}

function normalizeEligible(arr) {
  const list = Array.isArray(arr)
    ? arr
    : (typeof arr === 'string' ? arr.split(',') : []);
  const out = list.map(v => String(v).trim().toLowerCase()).filter(Boolean);
  return out.length ? out : ['staff'];
}
function isEligibleUser(u, eligibleUserTypes) {
  const t = String(u?.type || u?.role || "").trim().toLowerCase();
  const elig = normalizeEligible(eligibleUserTypes);
  return elig.includes(t);
}

function sqlGetAccount(programId, userId) {
  const row = db.prepare(`SELECT * FROM loyalty_accounts WHERE program_id=? AND user_id=? LIMIT 1`).get(programId, userId);
  return Promise.resolve(row || null);
}

function sqlInsertAccount({ programId, userId, startDate, endDate, eligibleFrom, durationMonths }) {
  const row = db.prepare("SELECT active FROM loyalty_programs WHERE id=? LIMIT 1").get(programId);
  if (!row || row.active !== 1) {
    console.warn("[sqlInsertAccount] skipped - program inactive or missing");
    return Promise.resolve({ id: null, skipped: true });
  }
  const info = db.prepare(`INSERT INTO loyalty_accounts (
    program_id, user_id, status, start_date, end_date, eligible_from,
    duration_months, points_balance, total_earned, total_penalty, total_paid
  ) VALUES (?, ?, 'Active', ?, ?, ?, ?, 0, 0, 0, 0)`).run(programId, userId, startDate, endDate, eligibleFrom, durationMonths);
  return Promise.resolve({ id: info.lastInsertRowid });
}

function sqlInsertLedger(accountId, kind, delta, note, adminUserId = null) {
  const info = db.prepare(`INSERT INTO loyalty_ledger (account_id, kind, points_delta, note, admin_user_id)
     VALUES (?, ?, ?, ?, ?)`).run(accountId, kind, delta, note || null, adminUserId);
  return Promise.resolve({ id: info.lastInsertRowid });
}

function sqlGetAccountSnapshot(accountId) {
  const row = db.prepare(`SELECT * FROM loyalty_accounts WHERE id=?`).get(accountId);
  return Promise.resolve(row);
}

function sqlGetRecentLedger(accountId, limit = 30) {
  const rows = db.prepare(`SELECT id, created_at AS ts, kind, points_delta AS delta, note
       FROM loyalty_ledger
      WHERE account_id=?
      ORDER BY datetime(created_at) DESC
      LIMIT ?`).all(accountId, limit);
  return Promise.resolve(rows || []);
}

async function sqlGetRankForAccount(accountId) {
  const totalRow = db.prepare(`SELECT total_earned FROM loyalty_accounts WHERE id=?`).get(accountId);
  const total = totalRow ? (totalRow.total_earned | 0) : null;
  if (total == null) return null;
  const r = db.prepare(`SELECT 1 + COUNT(*) AS rank FROM loyalty_accounts WHERE total_earned > ?`).get(total);
  return r?.rank ?? null;
}

// ---- routes --------------------------------------------------

router.post("/enroll", requireStaff, async (req, res) => {
  const user = req.session.user;
  try {
    const program = await getProgramSettings("STAFF");
    if (!program || !program.active) {
      return res.status(400).json({ success: false, error: { code: "PROGRAM_INACTIVE", message: "Program not active" } });
    }
    if (!isEligibleUser(user, program.eligibleUserTypes)) {
      return res.status(403).json({ success: false, error: { code: "NOT_ELIGIBLE", message: "User not eligible" } });
    }
    if (!program.active || !Array.isArray(program.eligibleUserTypes) || program.eligibleUserTypes.length === 0) {
      return res.status(400).json({ success: false, error: { code: "PROGRAM_INACTIVE", message: "Program paused or not configured" } });
    }

    const existing = await sqlGetAccount(program.programId, user.id);
    if (existing) {
      const [recent, rank] = await Promise.all([
        sqlGetRecentLedger(existing.id),
        sqlGetRankForAccount(existing.id),
      ]);
      return res.json({ success: true, account: existing, program, recent, rank, message: "Already enrolled" });
    }

    const start = new Date();
    const startDate = start.toISOString().slice(0, 10);
    const durationMonths = Number(program.durationMonths ?? program.duration_months ?? 12);
    const withdrawWaitDays = Number(program.withdrawWaitDays) || 90;
    const end = new Date(start); end.setMonth(end.getMonth() + durationMonths);
    const endDate = end.toISOString().slice(0, 10);
    const eligible = new Date(start); eligible.setDate(eligible.getDate() + withdrawWaitDays);
    const eligibleFrom = eligible.toISOString().slice(0, 10);

    const { id: accountId } = await sqlInsertAccount({
      programId: program.programId,
      userId: user.id,
      startDate,
      endDate,
      eligibleFrom,
      durationMonths,
    });

    const bonus = Number.isFinite(program.signupBonus) ? program.signupBonus : 100;
    if (bonus > 0) {
      await sqlInsertLedger(accountId, "enroll", bonus, "Signup bonus");
      db.prepare(`UPDATE loyalty_accounts
           SET points_balance = points_balance + ?,
               total_earned   = total_earned   + ?,
               updated_at = datetime('now','localtime')
         WHERE id = ?`).run(bonus, bonus, accountId);
    }

    try {
      const payload = {
        subject: "Welcome to the WattSun Loyalty Program!",
        message: `Hi ${user.name || "there"}, your loyalty account is active with a ${bonus}-point signup bonus.`,
        accountId,
        userId: user.id,
        durationMonths: program.durationMonths,
        withdrawWaitDays: program.withdrawWaitDays,
      };
      await enqueue("loyalty_welcome", { userId: user.id, email: user.email || "noreply@wattsun.co.ke", payload });
    } catch (notifyErr) {
      console.error("[loyalty/enroll][notify]", notifyErr.message);
    }

    const [account, recent, rank] = await Promise.all([
      sqlGetAccountSnapshot(accountId),
      sqlGetRecentLedger(accountId),
      sqlGetRankForAccount(accountId),
    ]);
    return res.json({ success: true, account, program, recent, rank, message: "Enrolled and credited signup bonus" });
  } catch (err) {
    console.error("[loyalty/enroll]", err);
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Unable to enroll" } });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  const user = req.session.user;
  try {
    const program = await getProgramSettings("STAFF");
    if (!program) {
      return res.status(404).json({ success: false, error: { code: "PROGRAM_NOT_FOUND", message: "Program missing" } });
    }

    const acct = await sqlGetAccount(program.programId, user.id);
    if (!acct) {
      return res.json({ success: true, account: null, program, recent: [], rank: null });
    }

    const sums = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN points_delta > 0 THEN points_delta ELSE 0 END), 0) AS earned_pts,
        COALESCE(SUM(CASE WHEN UPPER(kind) LIKE 'PENALTY%' THEN ABS(points_delta) ELSE 0 END), 0) AS penalty_pts,
        COALESCE(SUM(
          CASE
            WHEN (points_delta < 0 AND UPPER(kind) <> 'PENALTY')
              OR UPPER(kind) IN ('WITHDRAWAL','WITHDRAW_PAID')
            THEN ABS(points_delta)
            ELSE 0
          END
        ), 0) AS paid_pts,
        MAX(0,
          COALESCE(SUM(CASE WHEN points_delta > 0 THEN points_delta ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN UPPER(kind) LIKE 'PENALTY%' THEN ABS(points_delta) ELSE 0 END), 0)
          - COALESCE(SUM(
              CASE
                WHEN (points_delta < 0 AND UPPER(kind) <> 'PENALTY')
                  OR UPPER(kind) IN ('WITHDRAWAL','WITHDRAW_PAID')
                THEN ABS(points_delta)
                ELSE 0
              END
            ), 0)
        ) AS net_balance_pts
      FROM loyalty_ledger
      WHERE account_id = ?
    `).get(acct.id) || { earned_pts: 0, penalty_pts: 0, paid_pts: 0, net_balance_pts: 0 };

    acct.total_earned   = sums.earned_pts;
    acct.total_penalty  = sums.penalty_pts;
    acct.total_paid     = sums.paid_pts;
    acct.points_balance = sums.net_balance_pts;
    acct.paid_total     = Number(acct.total_paid || 0);

    const [recent, rank] = await Promise.all([
      sqlGetRecentLedger(acct.id),
      sqlGetRankForAccount(acct.id),
    ]);

    return res.json({ success: true, account: { ...acct, paid_total: Number(acct.total_paid || 0) }, program, recent, rank });
  } catch (err) {
    console.error("[loyalty/me]", err);
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Unable to load account" } });
  }
});

module.exports = router;
