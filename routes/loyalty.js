// routes/loyalty.js
// Minimal Staff Loyalty routes: enroll + me
// ADR envelopes: { success, ... }, integers for points

const express = require("express");
const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { enqueue } = require("./lib/notify");


// Resolve DB path the same way your app does (env first, fallback)
const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(process.cwd(), "data/dev/wattsun.dev.db");
const db = new sqlite3.Database(DB_PATH);

// ---- helpers -------------------------------------------------

function requireStaff(req, res, next) {
  const u = req?.session?.user;
  // Accept either type or role = 'Staff'
  if (!u || !/Staff/i.test(String(u.type || u.role || ""))) {
    return res
      .status(403)
      .json({ success: false, error: { code: "FORBIDDEN", message: "Staff only" } });
  }
  next();
}

// NEW: generic auth gate for viewing your own data
function requireAuth(req, res, next) {
  const u = req?.session?.user;
  if (!u) {
    return res
      .status(401)
      .json({ success: false, error: { code: "UNAUTHENTICATED", message: "Login required" } });
  }
  next();
}

function getProgramSettings(code = "STAFF") {
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT p.id as program_id, p.code, p.name, p.active, s.key, s.value
      FROM loyalty_programs p
      LEFT JOIN loyalty_program_settings s ON s.program_id = p.id
      WHERE p.code = ?
      `,
      [code],
      (err, rows) => {
        if (err) return reject(err);
        if (!rows || rows.length === 0) return resolve(null);
        const base = {
          programId: rows[0].program_id,
          code: rows[0].code,
          name: rows[0].name,
          active: !!rows[0].active,
          // defaults (overridden if keys exist)
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

        // Try to parse JSON if stored that way
        try {
          if (/^\s*(\[|\{)/.test(v)) v = JSON.parse(v);
        } catch (_) {}

        // Normalize eligibleUserTypes into an array
        if (k === "eligibleUserTypes") {
          if (Array.isArray(v)) {
            v = v.filter(Boolean).map(String);
          } else if (typeof v === "string") {
            v = v
              .split(",")
              .map(s => s.trim())
              .filter(Boolean);
          } else {
            v = ["Staff"];
          }
        }

        // Normalize numeric program settings
        if (
          ["durationMonths", "withdrawWaitDays", "minWithdrawPoints", "eurPerPoint", "signupBonus"].includes(k)
        ) {
          const n = Number(v);
          v = Number.isFinite(n) && n >= 0 ? n : base[k];
        }

        base[k] = v;
      }

        resolve(base);
      }
    );
  });
}

function isEligibleUser(u, eligibleUserTypes) {
  const t = String(u?.type || u?.role || "").trim().toLowerCase();
  return eligibleUserTypes
    .map(v => String(v).toLowerCase())
    .includes(t);
}


function sqlGetAccount(programId, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM loyalty_accounts WHERE program_id=? AND user_id=?`,
      [programId, userId],
      (err, row) => (err ? reject(err) : resolve(row || null))
    );
  });
}

function sqlInsertAccount({ programId, userId, startDate, endDate, eligibleFrom }) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO loyalty_accounts (
        program_id, user_id, status, start_date, end_date, eligible_from,
        points_balance, total_earned, total_penalty, total_paid
      )
      VALUES (?, ?, 'Active', ?, ?, ?, 0, 0, 0, 0)
      `,
      [programId, userId, startDate, endDate, eligibleFrom],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      }
    );
  });
}

function sqlInsertLedger(accountId, kind, delta, note, adminUserId = null) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loyalty_ledger (account_id, kind, points_delta, note, admin_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [accountId, kind, delta, note || null, adminUserId],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      }
    );
  });
}

function sqlGetAccountSnapshot(accountId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM loyalty_accounts WHERE id=?`, [accountId], (err, row) =>
      err ? reject(err) : resolve(row)
    );
  });
}

// FIX: use created_at (real column) instead of non-existent ts
function sqlGetRecentLedger(accountId, limit = 30) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, created_at AS ts, kind, points_delta AS delta, note
         FROM loyalty_ledger
        WHERE account_id=?
        ORDER BY datetime(created_at) DESC
        LIMIT ?`,
      [accountId, limit],
      (err, rows) => (err ? reject(err) : resolve(rows || []))
    );
  });
}

// Read-only rank (1 = highest total_earned). No schema changes.
async function sqlGetRankForAccount(accountId) {
  const total = await new Promise((resolve, reject) => {
    db.get(
      `SELECT total_earned FROM loyalty_accounts WHERE id=?`,
      [accountId],
      (err, row) => (err ? reject(err) : resolve(row ? row.total_earned | 0 : null))
    );
  });
  if (total == null) return null;
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT 1 + COUNT(*) AS rank
         FROM loyalty_accounts
        WHERE total_earned > ?`,
      [total],
      (err, row) => (err ? reject(err) : resolve(row?.rank ?? null))
    );
  });
}

// ---- routes --------------------------------------------------

/**
 * POST /api/loyalty/enroll
 * Creates account if missing, credits signup bonus (+100 by default),
 * returns snapshot + program settings.
 * (Remains Staff-only)
 */
router.post("/enroll", requireStaff, async (req, res) => {
  const user = req.session.user;
  try {
    const program = await getProgramSettings("STAFF");
    if (!program || !program.active) {
      return res
        .status(400)
        .json({ success: false, error: { code: "PROGRAM_INACTIVE", message: "Program not active" } });
    }
    if (!isEligibleUser(user, program.eligibleUserTypes)) {
      return res
        .status(403)
        .json({ success: false, error: { code: "NOT_ELIGIBLE", message: "User not eligible" } });
    }

    const existing = await sqlGetAccount(program.programId, user.id);
    if (existing) {
      const [recent, rank] = await Promise.all([
        sqlGetRecentLedger(existing.id),
        sqlGetRankForAccount(existing.id),
      ]);
      return res.json({
        success: true,
        account: existing,
        program,
        recent,
        rank,
        message: "Already enrolled",
      });
    }

    // compute dates
    const start = new Date();
    const startDate = start.toISOString().slice(0, 10);
    const end = new Date(start);
    end.setMonth(end.getMonth() + (program.durationMonths || 6));
    const endDate = end.toISOString().slice(0, 10);

    const eligible = new Date(start);
    eligible.setDate(eligible.getDate() + (program.withdrawWaitDays || 90));
    const eligibleFrom = eligible.toISOString().slice(0, 10);

    // insert account
    const { id: accountId } = await sqlInsertAccount({
      programId: program.programId,
      userId: user.id,
      startDate,
      endDate,
      eligibleFrom,
    });

   // credit signup bonus
const bonus = Number.isFinite(program.signupBonus) ? program.signupBonus : 100;
if (bonus > 0) {
  await sqlInsertLedger(accountId, "enroll", bonus, "Signup bonus");

  // --- FIX 1: Update account totals inline (mirrors admin behavior, no triggers) ---
  await new Promise((resolve, reject) => {
    db.run(
      `UPDATE loyalty_accounts
         SET points_balance = points_balance + ?,
             total_earned   = total_earned   + ?,
             updated_at = datetime('now','localtime')
       WHERE id = ?`,
      [bonus, bonus, accountId],
      (err) => (err ? reject(err) : resolve())
    );
  });
}
// --- FIX 2: Queue welcome notification (mirrors admin behavior) ---
try {
  const payload = {
    subject: "Welcome to the WattSun Loyalty Program!",
    message: `Hi ${user.name || "there"}, your loyalty account is active with a ${bonus}-point signup bonus.`,
    accountId,
    bonus,
    durationMonths: program.durationMonths,
    withdrawWaitDays: program.withdrawWaitDays,
  };

  await enqueue("loyalty_welcome", {
    userId: user.id,
    email: user.email || "noreply@wattsun.co.ke",
    payload,
  });

  console.log(`[loyalty/enroll] Queued welcome notification for user ${user.id}`);
} catch (notifyErr) {
  console.error("[loyalty/enroll][notify] Failed to enqueue welcome notification:", notifyErr.message);
}

    // fetch snapshot, recent, rank for the new account
    const [account, recent, rank] = await Promise.all([
      sqlGetAccountSnapshot(accountId),
      sqlGetRecentLedger(accountId),
      sqlGetRankForAccount(accountId),
    ]);
    return res.json({
      success: true,
      account,
      program,
      recent,
      rank,
      message: "Enrolled and credited signup bonus",
    });
  } catch (err) {
    console.error("[loyalty/enroll]", err);
    return res
      .status(500)
      .json({ success: false, error: { code: "SERVER_ERROR", message: "Unable to enroll" } });
  }
});
/**
 * GET /api/loyalty/me
 * Returns current account snapshot + recent ledger + program settings + rank.
 * (NOW: any authenticated user can view their own snapshot)
 */
router.get("/me", requireAuth, async (req, res) => {
  const user = req.session.user;
  try {
    const program = await getProgramSettings("STAFF");
    if (!program) {
      return res
        .status(404)
        .json({ success: false, error: { code: "PROGRAM_NOT_FOUND", message: "Program missing" } });
    }

    const acct = await sqlGetAccount(program.programId, user.id);
    if (!acct) {
      // not enrolled yet — still return program config so UI can show CTA
      return res.json({ success: true, account: null, program, recent: [], rank: null });
    }

    // --- derive canonical totals from ledger; prefer these over stale columns ---
const sums = await new Promise((resolve, reject) => {
  db.get(
    `
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
    `,
    [acct.id],
    (err, row) =>
      err
        ? reject(err)
        : resolve(row || { earned_pts: 0, penalty_pts: 0, paid_pts: 0, net_balance_pts: 0 })
  );
});

    // Overlay the derived values (read path only)
    acct.total_earned   = sums.earned_pts;
    acct.total_penalty  = sums.penalty_pts;
    acct.total_paid     = sums.paid_pts;
    acct.points_balance = sums.net_balance_pts;
    // always provide a stable paid_total (points)
    acct.paid_total = Number(acct.total_paid || 0);


    const [recent, rank] = await Promise.all([
      sqlGetRecentLedger(acct.id),
      sqlGetRankForAccount(acct.id),
    ]);

    return res.json({
  success: true,
  // inject paid_total in the object we send, regardless of earlier mutations
  account: { ...acct, paid_total: Number(acct.total_paid || 0) },
  program,
  recent,
  rank
});

  } catch (err) {
    console.error("[loyalty/me]", err);
    return res
      .status(500)
      .json({ success: false, error: { code: "SERVER_ERROR", message: "Unable to load account" } });
  }
});


module.exports = router;
