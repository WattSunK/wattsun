// routes/loyalty-withdrawals.js
// Customer withdrawals endpoints (request + list)
// SECURITY: user-scoped (requireUser). Never accept accountId from client.
// ADR-001 envelopes: { success:true, ... } / { success:false, error:{ code, message } }

const express = require("express");
const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// ---- Auth guard ------------------------------------------------------------
let requireUser;
try {
  // Prefer shared auth guard if available in your codebase
  ({ requireUser } = require("./_auth"));
} catch (e) {
  // Fallback (keeps this file drop-in safe)
  requireUser = function requireUser(req, res, next) {
    if (!req || !req.user || !req.user.id) {
      return res.status(401).json({ success:false, error:{ code:"UNAUTHORIZED", message:"Login required" } });
    }
    next();
  };
}

// ---- DB --------------------------------------------------------------------
const DB_PATH = process.env.DB_PATH_USERS || process.env.SQLITE_DB || path.join(process.cwd(), "data/dev/wattsun.dev.db");
const db = new sqlite3.Database(DB_PATH);

// Small Promise helpers
const get = (sql, params=[]) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null));
});
const all = (sql, params=[]) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
});
const run = (sql, params=[]) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) { err ? reject(err) : resolve(this); });
});

// ---- Utils -----------------------------------------------------------------
function bad(res, code, message, status=400) {
  return res.status(status).json({ success:false, error:{ code, message } });
}

async function findActiveAccountForUser(userId) {
  // Prefer an active account if you track status; else latest by id
  const row = await get(
    `SELECT a.*
       FROM loyalty_accounts a
      WHERE a.user_id=?
      ORDER BY (CASE WHEN a.status='Active' THEN 0 ELSE 1 END), a.id DESC
      LIMIT 1`,
    [userId]
  );
  return row;
}

async function liveAvailablePoints(accountId) {
  // Compute from ledger for integrity; fallback to points_balance if ledger absent.
  try {
    const row = await get(`SELECT COALESCE(SUM(points_delta),0) AS net FROM loyalty_ledger WHERE account_id=?`, [accountId]);
    return Number(row?.net || 0);
  } catch (e) {
    const row = await get(`SELECT COALESCE(points_balance,0) AS bal FROM loyalty_accounts WHERE id=?`, [accountId]);
    return Number(row?.bal || 0);
  }
}

async function onePendingGuard(accountId) {
  // Optional policy: allow only one Pending at a time
  const r = await get(`SELECT COUNT(1) AS c FROM loyalty_withdrawals WHERE account_id=? AND status='Pending'`, [accountId]);
  return Number(r?.c || 0) === 0;
}

// ---- Routes ----------------------------------------------------------------
// All endpoints in this router require a logged-in user
router.use(requireUser);

// POST /api/loyalty/withdraw
// Body: { points:number, note?:string }   (accountId derived server-side)
router.post("/withdraw", async (req, res) => {
  const userId = req.user.id;
  const points = Number.parseInt(req.body?.points, 10);
  const note = (req.body?.note || "").toString().slice(0, 500);
  const idem = (req.headers["idempotency-key"] || "").toString().slice(0, 80);

  if (!Number.isFinite(points) || points <= 0) {
    return bad(res, "INVALID_POINTS", "Points must be a positive integer");
  }

  try {
    const account = await findActiveAccountForUser(userId);
    if (!account) return bad(res, "NO_ACCOUNT", "No active loyalty account");

    // Optional: Idempotency by header (lightweight implementation)
    if (idem) {
      const dup = await get(
        `SELECT id, status
           FROM loyalty_withdrawals
          WHERE account_id=? AND note LIKE ?
          ORDER BY id DESC LIMIT 1`,
        [account.id, `%[idem:${idem}]%`]
      );
      if (dup) {
        return res.json({ success:true, withdrawal:{ id: dup.id, status: dup.status } });
      }
    }

    // Live balance & policy
    const available = await liveAvailablePoints(account.id);
    if (points > available) return bad(res, "INSUFFICIENT_POINTS", "Not enough points");

    // One-pending policy (optional; comment out if you allow multiple pending)
    const okPending = await onePendingGuard(account.id);
    if (!okPending) return bad(res, "PENDING_EXISTS", "You already have a pending withdrawal");

    // Insert new request (requested_eur left NULL – compute elsewhere if needed)
    const stampedNote = idem ? `${note} [idem:${idem}]` : note;
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const insert = await run(
      `INSERT INTO loyalty_withdrawals (account_id, requested_pts, status, requested_at, note)
       VALUES (?, ?, 'Pending', ?, ?)`,
      [account.id, points, now, stampedNote]
    );

    const id = insert.lastID;
    return res.json({ success:true, withdrawal:{ id, status: "Pending" } });
  } catch (err) {
    console.error("[loyalty/withdraw]", err);
    return bad(res, "SERVER_ERROR", "Unable to request withdrawal", 500);
  }
});

// GET /api/loyalty/withdrawals  (list my withdrawals)
router.get("/withdrawals", async (req, res) => {
  const userId = req.user.id;
  try {
    const account = await findActiveAccountForUser(userId);
    if (!account) return res.json({ success:true, withdrawals: [] });

    const rows = await all(
      `SELECT id, requested_at, requested_pts, requested_eur, status, note
         FROM loyalty_withdrawals
        WHERE account_id=?
        ORDER BY id DESC
        LIMIT 200`,
      [account.id]
    );

    return res.json({ success:true, withdrawals: rows });
  } catch (err) {
    console.error("[loyalty/withdrawals]", err);
    return bad(res, "SERVER_ERROR", "Unable to load withdrawals", 500);
  }
});

module.exports = router;
