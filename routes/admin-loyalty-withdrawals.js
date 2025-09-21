// routes/admin-loyalty-withdrawals.js
// Admin: list + decision (approve/reject) + mark-paid for withdrawals
// Enqueues notifications via notify.enqueue

const express = require("express");
const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { enqueue } = require("../lib/notify");

const DB_PATH = process.env.DB_PATH_USERS || process.env.SQLITE_DB || path.join(process.cwd(), "data/dev/wattsun.dev.db");
const db = new sqlite3.Database(DB_PATH);

function requireAdmin(req, res, next) {
  const u = req?.session?.user;
  if (!u || (u.type !== "Admin" && u.role !== "Admin")) {
    return res.status(403).json({ success:false, error:{ code:"FORBIDDEN", message:"Admin only" } });
  }
  next();
}
router.use(requireAdmin);

// helpers
function getWithdrawal(id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT w.*, la.user_id, la.points_balance, la.status AS account_status
       FROM loyalty_withdrawals w
       JOIN loyalty_accounts la ON la.id = w.account_id
       WHERE w.id=?`,
      [id],
      (err, row) => err ? reject(err) : resolve(row || null)
    );
  });
}
function listWithdrawals(status, limit=100) {
  const params = [];
  let where = "";
  if (status) { where = "WHERE w.status=?"; params.push(status); }
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT w.id, w.account_id, w.requested_pts, w.requested_eur, w.status,
              w.requested_at, w.decided_at, w.decided_by, w.decision_note, w.paid_at, w.payout_ref,
              la.user_id
       FROM loyalty_withdrawals w
       JOIN loyalty_accounts la ON la.id = w.account_id
       ${where}
       ORDER BY w.id DESC
       LIMIT ?`,
      params.concat([limit]),
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
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
function updateWithdrawalDecision(id, status, decidedBy, note) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE loyalty_withdrawals
       SET status=?, decided_at=datetime('now'), decided_by=?, decision_note=?
       WHERE id=?`,
      [status, decidedBy || null, note || null, id],
      function (err) { if (err) return reject(err); resolve(true); }
    );
  });
}
function markPaid(id, payoutRef) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE loyalty_withdrawals SET status='Paid', paid_at=datetime('now'), payout_ref=? WHERE id=?`,
      [payoutRef || null, id],
      function (err) { if (err) return reject(err); resolve(true); }
    );
  });
}

// routes

// GET /api/admin/loyalty/withdrawals?status=Pending
router.get("/withdrawals", async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const rows = await listWithdrawals(status);
    return res.json({ success:true, withdrawals: rows });
  } catch (err) {
    console.error("[admin/loyalty/withdrawals:list]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to list withdrawals" } });
  }
});

// POST /api/admin/loyalty/withdrawals/:id/decision  { approve:boolean, note? }
router.post("/withdrawals/:id/decision", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const approve = !!req.body?.approve;
    const note = req.body?.note || "";
    const w = await getWithdrawal(id);
    if (!w) return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Withdrawal not found" } });
    if (w.status !== "Pending") {
      return res.status(400).json({ success:false, error:{ code:"INVALID_STATE", message:`Already ${w.status}` } });
    }

    if (!approve) {
      await updateWithdrawalDecision(id, "Rejected", req.session.user.id, note);
      try {
        await enqueue("withdrawal_update", { userId: w.user_id, payload: { status:"Rejected", points: w.requested_pts, eur: w.requested_eur, payoutRef:"" } });
      } catch (e) { console.warn("enqueue(withdrawal_update:Rejected) failed:", e.message); }
      const updated = await getWithdrawal(id);
      return res.json({ success:true, withdrawal: updated });
    }

    // approving: ensure account active and has enough points at approval time
    if (w.account_status !== "Active") {
      return res.status(400).json({ success:false, error:{ code:"ACCOUNT_NOT_ACTIVE", message:"Account must be Active to approve" } });
    }
    if (w.points_balance < w.requested_pts) {
      return res.status(400).json({ success:false, error:{ code:"INSUFFICIENT_POINTS", message:"Not enough points at approval" } });
    }

    // deduct points now via ledger
    await insertLedger(w.account_id, "withdraw", -w.requested_pts, `Withdrawal ${w.requested_pts} pts`, req.session.user.id);
    await updateWithdrawalDecision(id, "Approved", req.session.user.id, note);

    try {
      await enqueue("withdrawal_update", { userId: w.user_id, payload: { status:"Approved", points: w.requested_pts, eur: w.requested_eur, payoutRef:"" } });
    } catch (e) { console.warn("enqueue(withdrawal_update:Approved) failed:", e.message); }

    const updated = await getWithdrawal(id);
    return res.json({ success:true, withdrawal: updated });
  } catch (err) {
    console.error("[admin/loyalty/withdrawals:decision]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to decide withdrawal" } });
  }
});

// POST /api/admin/loyalty/withdrawals/:id/mark-paid  { payoutRef? }
router.post("/withdrawals/:id/mark-paid", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const payoutRef = req.body?.payoutRef || "";
    const w = await getWithdrawal(id);
    if (!w) return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Withdrawal not found" } });
    if (w.status !== "Approved") {
      return res.status(400).json({ success:false, error:{ code:"INVALID_STATE", message:`Must be Approved to mark Paid (is ${w.status})` } });
    }
    await markPaid(id, payoutRef);
    try {
      await enqueue("withdrawal_update", { userId: w.user_id, payload: { status:"Paid", points: w.requested_pts, eur: w.requested_eur, payoutRef } });
    } catch (e) { console.warn("enqueue(withdrawal_update:Paid) failed:", e.message); }
    const updated = await getWithdrawal(id);
    return res.json({ success:true, withdrawal: updated });
  } catch (err) {
    console.error("[admin/loyalty/withdrawals:mark-paid]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to mark as Paid" } });
  }
});

module.exports = router;
