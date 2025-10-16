// routes/admin-loyalty-withdrawals.js
// Admin: manage loyalty withdrawal lifecycle (list, approve, pay, reject)

const express = require("express");
const router = express.Router();
const db = require("./db_users");

function requireAdmin(req, res, next) {
  const u = req.session?.user;
  if (!u || (u.type !== "Admin" && u.role !== "Admin")) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Admin access required." } });
  }
  next();
}
router.use(requireAdmin);

const asInt = (v, d = 0) => (Number.isFinite(+v) ? parseInt(v, 10) : d);
const s = (x) => (x == null ? null : String(x).trim());

function computeStatus(r) {
  const st = (r.raw_status || "").toLowerCase();
  if (r.paid_at) return "No Action";
  if (st.includes("approved")) return "Approved";
  if (st.includes("rejected")) return "No Action";
  if (r.decided_at && st === "approved") return "Approved";
  return "Pending";
}

function rowWithStatus(row) { return { ...row, status: computeStatus(row) }; }

// Internal handler: list withdrawals (unified view from ledger + meta)
function listWithdrawals(req, res) {
  try {
    const per = Math.min(100, Math.max(1, asInt(req.query?.per, 20)));
    const page = Math.max(1, asInt(req.query?.page, 1));
    const offset = (page - 1) * per;

    const rows = db.prepare(`
      SELECT l.id,
             l.account_id,
             a.user_id,
             ABS(l.points_delta) AS points,
             COALESCE(m.status, 'Pending') AS raw_status,
             l.created_at AS requested_at,
             m.decided_at,
             m.paid_at,
             m.note AS admin_note
        FROM loyalty_ledger l
        JOIN loyalty_accounts a ON a.id = l.account_id
        LEFT JOIN loyalty_withdrawal_meta m ON m.ledger_id = l.id
       WHERE l.kind='withdraw'
       ORDER BY l.id DESC
       LIMIT ? OFFSET ?
    `).all(per, offset);

    const total = db.prepare(`SELECT COUNT(*) AS n FROM loyalty_ledger WHERE kind='withdraw'`).get().n || 0;
    return res.json({ success: true, page, per, total, withdrawals: rows.map(rowWithStatus) });
  } catch (e) {
    console.error("[admin-loyalty-withdrawals:list]", e);
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: e.message } });
  }
}

// Register list routes (new canonical, plus legacy alias)
router.get("/withdrawals", listWithdrawals);
router.get("/loyalty/withdrawals", listWithdrawals);

// Create a new withdrawal (admin-initiated)
// Internal handler: create a withdraw request
function createWithdrawal(req, res) {
  try {
    const adminId = req.session?.user?.id || null;
    const accountId = asInt(req.body?.account_id ?? req.body?.accountId);
    const points = asInt(req.body?.points);
    const note = s(req.body?.note);

    if (!Number.isFinite(accountId) || accountId <= 0) {
      return res.status(400).json({ success: false, error: { code: "BAD_ACCOUNT", message: "Valid account_id is required" } });
    }
    if (!Number.isFinite(points) || points <= 0) {
      return res.status(400).json({ success: false, error: { code: "BAD_POINTS", message: "points must be a positive integer" } });
    }

    const acct = db.prepare("SELECT id, program_id FROM loyalty_accounts WHERE id=?").get(accountId);
    if (!acct) {
      return res.status(404).json({ success: false, error: { code: "ACCOUNT_NOT_FOUND", message: "Loyalty account not found" } });
    }

    // Enforce program minWithdrawPoints (default 0 when not set)
    let minPts = 0;
    try {
      const r = db.prepare(`SELECT value FROM loyalty_program_settings WHERE program_id=? AND key='minWithdrawPoints'`).get(acct.program_id);
      if (r && r.value !== undefined && r.value !== null && String(r.value).trim() !== "") {
        const n = Number(r.value);
        if (Number.isFinite(n) && n >= 0) minPts = Math.trunc(n);
      }
    } catch (_) {}
    if (points < minPts) {
      return res.status(400).json({ success: false, error: { code: "BELOW_MIN", message: `Minimum withdrawal is ${minPts} points` } });
    }

    // Check live available points from ledger
    const availRow = db.prepare(`SELECT COALESCE(SUM(points_delta),0) AS net FROM loyalty_ledger WHERE account_id=?`).get(accountId);
    const available = Number(availRow?.net || 0);
    if (points > available) {
      return res.status(400).json({ success: false, error: { code: "INSUFFICIENT_POINTS", message: `Available points: ${available}` } });
    }

    // Insert ledger entry as a negative delta (withdraw request)
    const info = db.prepare(`
      INSERT INTO loyalty_ledger (account_id, kind, points_delta, note, admin_user_id, created_at)
      VALUES (?, 'withdraw', ?, ?, ?, datetime('now','localtime'))
    `).run(accountId, -Math.abs(points), note, adminId);

    // Immediately deduct balance from the account (logical reservation)
    try {
      db.prepare(`UPDATE loyalty_accounts
                    SET points_balance = MAX(0, COALESCE(points_balance,0) - ?),
                        updated_at     = datetime('now','localtime')
                  WHERE id = ?`).run(points, accountId);
    } catch (e) {
      console.warn("[admin-loyalty-withdrawals:create][balance]", e.message);
    }

    // Create meta row as Pending for this withdrawal
    try {
      db.prepare(`INSERT OR IGNORE INTO loyalty_withdrawal_meta (ledger_id, status, decided_by, decided_at, note)
                  VALUES (?, 'Pending', NULL, NULL, ?)`)
        .run(info.lastInsertRowid, note);
    } catch (e) {
      console.warn("[admin-loyalty-withdrawals:create][meta]", e.message);
    }

    // Return created entry (basic shape)
    const row = db.prepare(`
      SELECT l.id, l.account_id, ABS(l.points_delta) AS points, l.created_at AS requested_at
        FROM loyalty_ledger l WHERE l.id=?
    `).get(info.lastInsertRowid);

    return res.json({ success: true, withdrawal: row });
  } catch (e) {
    console.error("[admin-loyalty-withdrawals:create]", e);
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: e.message } });
  }
}

// Register create routes (new canonical, plus legacy alias)
router.post("/withdrawals", createWithdrawal);
router.post("/loyalty/withdrawals", createWithdrawal);

function updateStatus(id, status, note, adminId, extra = {}) {
  const decidedAt = new Date().toISOString();
  db.prepare(`INSERT INTO loyalty_withdrawal_meta (ledger_id,status,decided_by,decided_at,note,paid_at)
              VALUES (?,?,?,?,?,?)
              ON CONFLICT(ledger_id) DO UPDATE SET
                status=excluded.status,
                decided_by=excluded.decided_by,
                decided_at=excluded.decided_at,
                note=excluded.note,
                paid_at=COALESCE(excluded.paid_at, loyalty_withdrawal_meta.paid_at)`).run(
    id, status, adminId, decidedAt, note || null, extra.paidAt || null
  );

  const r = db.prepare(`SELECT l.*, a.user_id, m.status AS raw_status, m.decided_at, m.paid_at, m.note AS admin_note
                        FROM loyalty_ledger l
                        JOIN loyalty_accounts a ON a.id=l.account_id
                        LEFT JOIN loyalty_withdrawal_meta m ON m.ledger_id=l.id
                        WHERE l.id=?`).get(id);
  return rowWithStatus(r);
}

function approveWithdrawal(req, res) {
  try {
    const id = asInt(req.params.id);
    const adminId = req.session?.user?.id || null;
    const note = `Withdrawal #${id} approved`;
    const row = updateStatus(id, "Approved", note, adminId);

    try {
      db.prepare(`INSERT INTO notifications_queue (kind, user_id, email, payload, status, note, created_at)
                  VALUES ('withdrawal_approved', ?, ?, json(?), 'Queued', ?, datetime('now','localtime'))`)
        .run(row.user_id, null, JSON.stringify({ message: note }), note);
    } catch (e) { console.warn("[notify.withdrawal_approved]", e.message); }

    return res.json({ success: true, withdrawal: row });
  } catch (e) {
    console.error("[approve]", e);
    return res.status(500).json({ success: false, error: { message: "Approve failed" } });
  }
}
router.patch("/withdrawals/:id/approve", approveWithdrawal);
router.patch("/loyalty/withdrawals/:id/approve", approveWithdrawal);

function markPaid(req, res) {
  try {
    const id = asInt(req.params.id);
    const adminId = req.session?.user?.id || null;
    const note = s(req.body?.note) || `Withdrawal #${id} paid`;
    const paidAt = req.body?.paidAt || new Date().toISOString();
    const row = updateStatus(id, "No Action", note, adminId, { paidAt });

    // Increment paid total only (balance was deducted at create time)
    const amtRow = db.prepare(`SELECT ABS(points_delta) AS amt, account_id AS acct FROM loyalty_ledger WHERE id = ?`).get(id);
    const amt = Number(amtRow?.amt || 0);
    const acctId = amtRow?.acct;
    if (Number.isFinite(amt) && acctId != null) {
      db.prepare(`UPDATE loyalty_accounts
                    SET total_paid = COALESCE(total_paid,0) + ?,
                        updated_at = datetime('now','localtime')
                  WHERE id = ?`).run(amt, acctId);
    }

    try {
      db.prepare(`INSERT INTO notifications_queue (kind, user_id, email, payload, status, note, created_at)
                  VALUES ('withdrawal_paid', ?, ?, json(?), 'Queued', ?, datetime('now','localtime'))`)
        .run(row.user_id, null, JSON.stringify({ message: note }), note);
    } catch (e) { console.warn("[notify.withdrawal_paid]", e.message); }

    return res.json({ success: true, withdrawal: row });
  } catch (e) {
    console.error("[mark-paid]", e);
    return res.status(500).json({ success: false, error: { message: "Mark paid failed" } });
  }
}
router.patch("/withdrawals/:id/mark-paid", markPaid);
router.patch("/loyalty/withdrawals/:id/mark-paid", markPaid);

function rejectWithdrawal(req, res) {
  try {
    const id = asInt(req.params.id);
    const adminId = req.session?.user?.id || null;
    const note = s(req.body?.note) || `Withdrawal #${id} rejected`;
    const row = updateStatus(id, "No Action", note, adminId);

    // Reverse deduction when withdrawal is rejected
    db.prepare(`UPDATE loyalty_accounts
                  SET points_balance = points_balance + (SELECT ABS(points_delta) FROM loyalty_ledger WHERE id = ?)
                WHERE id = (SELECT account_id FROM loyalty_ledger WHERE id = ?)`)
      .run(id, id);

    try {
      db.prepare(`INSERT INTO notifications_queue (kind, user_id, email, payload, status, note, created_at)
                  VALUES ('withdrawal_rejected', ?, ?, json(?), 'Queued', ?, datetime('now','localtime'))`)
        .run(row.user_id, null, JSON.stringify({ message: note }), note);
    } catch (e) { console.warn("[notify.withdrawal_rejected]", e.message); }

    return res.json({ success: true, withdrawal: row });
  } catch (e) {
    console.error("[reject]", e);
    return res.status(500).json({ success: false, error: { message: "Reject failed" } });
  }
}
router.patch("/withdrawals/:id/reject", rejectWithdrawal);
router.patch("/loyalty/withdrawals/:id/reject", rejectWithdrawal);

module.exports = router;
