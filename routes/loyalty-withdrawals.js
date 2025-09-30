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
    const u = req?.session?.user;
    if (!u || !u.id) {
      return res
        .status(401)
        .json({
          success: false,
          error: { code: "UNAUTHENTICATED", message: "Login required" },
        });
    }
    req.user = u; // <-- map session user onto req.user for handlers
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
// --- Unified feed helpers (add below the Utils above) -----------------------
async function tableExists(name) {
  const row = await get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    [name]
  );
  return !!row;
}

function normalizeWithdrawalRow(r, source) {
  return {
    id:           r.id,
    account_id:   r.account_id,
    points:       r.requested_pts ?? r.points ?? 0,
    eur:          r.requested_eur ?? r.eur ?? null,
    status:       r.status,
    requested_at: r.requested_at ?? r.created_at ?? r.request_date ?? null,
    decided_at:   r.decided_at ?? null,
    paid_at:      r.paid_at ?? null,
    payout_ref:   r.payout_ref ?? r.reference ?? null,
    note:         r.note ?? null,
    source
  };
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

      // One-pending policy ...
      const okPending = await onePendingGuard(account.id);
      if (!okPending) return bad(res, "PENDING_EXISTS", "You already have a pending withdrawal");

      // --- compute EUR (fallback to 1 €/pt if setting missing) ---
      const eppRow = await get(
        `SELECT value FROM loyalty_program_settings WHERE program_id=? AND key='eurPerPoint'`,
        [account.program_id ?? account.programId ?? null]
      );
      const eurPerPoint = Number.parseFloat(eppRow?.value) || 1;
      const requestedEur = points * eurPerPoint;

      // --- INSERT: include requested_eur (NOT NULL) and note (optional) ---
      const stampedNote = idem ? `${note} [idem:${idem}]` : note;
      const insert = await run(
        `INSERT INTO loyalty_withdrawals (account_id, requested_pts, requested_eur, status, requested_at, note)
        VALUES (?, ?, ?, 'Pending', datetime('now'), ?)`,
        [account.id, points, requestedEur, stampedNote]
      );

      const id = insert.lastID;
      return res.json({ success:true, withdrawal:{ id, status: "Pending" } });

        } catch (err) {
          console.error("[loyalty/withdraw]", err);
          return bad(res, "SERVER_ERROR", "Unable to request withdrawal", 500);
        }
      });

// GET /api/loyalty/withdrawals  (list my withdrawals)
// GET /api/loyalty/withdrawals  (list my withdrawals; unified feed)
router.get("/withdrawals", async (req, res) => {
  const userId = req.user.id;
  try {
    const account = await findActiveAccountForUser(userId);
    if (!account) return res.json({ success:true, withdrawals: [] });

    // Source A: canonical customer table
    const aRowsRaw = await all(
      `SELECT id, account_id, requested_pts, requested_eur, status,
              requested_at, decided_at, paid_at, payout_ref, note
         FROM loyalty_withdrawals
        WHERE account_id=?
        LIMIT 500`,
      [account.id]
    );
    const aRows = aRowsRaw.map(r => normalizeWithdrawalRow(r, "customer"));

    // Source B: legacy admin table (optional)
    let bRows = [];
    if (await tableExists("withdrawals")) {
      const bRowsRaw = await all(
        `SELECT id, account_id,
                points,                       -- legacy column
                NULL AS requested_eur,
                status,
                created_at AS requested_at,
                decided_at,
                paid_at,
                payout_ref,
                note
           FROM withdrawals
          WHERE account_id=?
          LIMIT 500`,
        [account.id]
      );
      bRows = bRowsRaw.map(r => normalizeWithdrawalRow(r, "admin"));
    }

    // Merge + sort newest-first by requested_at (string-safe)
    const withdrawals = [...aRows, ...bRows].sort((x, y) => {
      const ax = String(x.requested_at || "").replace("T", " ");
      const ay = String(y.requested_at || "").replace("T", " ");
      return ay.localeCompare(ax);
    });

    return res.json({ success:true, withdrawals });
  } catch (err) {
    console.error("[loyalty/withdrawals]", err);
    return bad(res, "SERVER_ERROR", "Unable to load withdrawals", 500);
  }
});


module.exports = router;
