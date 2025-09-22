// routes/loyalty-withdrawals.js
// Member withdrawals endpoints: request + list
// Requires session auth and Staff eligibility. Uses ADR envelopes.

const express = require("express");
const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// ---- DB ------------------------------------------------------
const DB_PATH = process.env.DB_PATH_USERS || process.env.SQLITE_DB || path.join(process.cwd(), "data/dev/wattsun.dev.db");
const db = new sqlite3.Database(DB_PATH);

// ---- helpers -------------------------------------------------
function requireStaff(req, res, next) {
  const u = req?.session?.user;
  if (!u || !/Staff/i.test(String(u.type || u.role || ""))) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Staff only" } });
  }
  next();
}

function getProgramSettings(code = "STAFF") {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT p.id as program_id, p.code, p.name, p.active, s.key, s.value
       FROM loyalty_programs p
       LEFT JOIN loyalty_program_settings s ON s.program_id = p.id
       WHERE p.code = ?`,
      [code],
      (err, rows) => {
        if (err) return reject(err);
        if (!rows || rows.length === 0) return resolve(null);
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
          try { if (/^\s*(\[|\{)/.test(v)) v = JSON.parse(v); } catch (_) {}
          if (["durationMonths","withdrawWaitDays","minWithdrawPoints","eurPerPoint","signupBonus"].includes(r.key)) {
            const n = parseInt(v, 10);
            if (Number.isFinite(n)) v = n;
          }
          base[r.key] = v;
        }
        resolve(base);
      }
    );
  });
}

function sqlGetAccount(programId, userId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM loyalty_accounts WHERE program_id=? AND user_id=?`, [programId, userId], (err, row) => err ? reject(err) : resolve(row || null));
  });
}

function sqlInsertWithdrawal(accountId, pts, eur) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loyalty_withdrawals (account_id, requested_pts, requested_eur, status, requested_at)
       VALUES (?,?,?, 'Pending', datetime('now'))`,
      [accountId, pts, eur],
      function (err) { if (err) return reject(err); resolve({ id: this.lastID }); }
    );
  });
}

function sqlListWithdrawals(accountId, limit = 50) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, requested_pts, requested_eur, status, requested_at, decided_at, paid_at, payout_ref
       FROM loyalty_withdrawals
       WHERE account_id=?
       ORDER BY id DESC
       LIMIT ?`,
      [accountId, limit],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });
}

// ---- routes --------------------------------------------------

// POST /api/loyalty/withdraw
router.post("/withdraw", requireStaff, async (req, res) => {
  const user = req.session.user;
  try {
    const program = await getProgramSettings("STAFF");
    if (!program || !program.active) {
      return res.status(400).json({ success:false, error:{ code:"PROGRAM_INACTIVE", message:"Program not active" } });
    }

    const acct = await sqlGetAccount(program.programId, user.id);
    if (!acct) return res.status(400).json({ success:false, error:{ code:"NOT_ENROLLED", message:"Enroll first" } });
    if (acct.status !== "Active") {
      return res.status(400).json({ success:false, error:{ code:"ACCOUNT_NOT_ACTIVE", message:"Account must be Active" } });
    }

    const today = new Date().toISOString().slice(0,10);
    if (today < acct.eligible_from) {
      return res.status(400).json({ success:false, error:{ code:"NOT_ELIGIBLE_YET", message:`Withdrawals allowed from ${acct.eligible_from}` } });
    }

    const reqPoints = parseInt((req.body && req.body.points) || "0", 10);
    if (!Number.isFinite(reqPoints) || reqPoints <= 0) {
      return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"points must be a positive integer" } });
    }

    const minPts = program.minWithdrawPoints || 100;
    if (reqPoints < minPts) {
      return res.status(400).json({ success:false, error:{ code:"BELOW_MINIMUM", message:`Minimum withdrawal is ${minPts} points` } });
    }

    if (reqPoints > acct.points_balance) {
      return res.status(400).json({ success:false, error:{ code:"INSUFFICIENT_POINTS", message:"Not enough points" } });
    }

    const eurPerPoint = program.eurPerPoint || 1;
    const eur = reqPoints * eurPerPoint;

    const { id: wid } = await sqlInsertWithdrawal(acct.id, reqPoints, eur);
    const list = await sqlListWithdrawals(acct.id);

    return res.json({ success:true, withdrawal: { id: wid, points: reqPoints, eur }, withdrawals: list });
  } catch (err) {
    console.error("[loyalty/withdraw]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to create withdrawal" } });
  }
});

// GET /api/loyalty/withdrawals
router.get("/withdrawals", requireStaff, async (req, res) => {
  const user = req.session.user;
  try {
    const program = await getProgramSettings("STAFF");
    if (!program) return res.status(404).json({ success:false, error:{ code:"PROGRAM_NOT_FOUND", message:"Program missing" } });
    const acct = await sqlGetAccount(program.programId, user.id);
    if (!acct) return res.json({ success:true, withdrawals: [] });
    const list = await sqlListWithdrawals(acct.id);
    return res.json({ success:true, withdrawals: list });
  } catch (err) {
    console.error("[loyalty/withdrawals]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to load withdrawals" } });
  }
});

module.exports = router;
