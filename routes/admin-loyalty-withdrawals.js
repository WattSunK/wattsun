/**
 * routes/admin-loyalty-withdrawals.js
 *
 * Phase 5.4 — Withdrawals: Approvals, Payout & Ledger Sync
 * - Keeps column names: decision_note, payout_ref (Option A)
 * - Adds PATCH routes per spec:
 *     PATCH /api/admin/loyalty/withdrawals/:id/approve
 *     PATCH /api/admin/loyalty/withdrawals/:id/reject
 *     PATCH /api/admin/loyalty/withdrawals/:id/mark-paid
 * - Preserves backward-compat POST routes (if your UI calls them):
 *     POST  /api/admin/loyalty/withdrawals/:id/decision   { approve: true|false, note? }
 *     POST  /api/admin/loyalty/withdrawals/:id/mark-paid  { payoutRef, paidAt? }
 *
 * Effects (each action):
 *   - Update withdrawals row (status + audit fields)
 *   - Append loyalty_ledger entry (dedup by ref_id+entry_type)
 *   - Queue notifications_queue email with templates:
 *       withdrawal_approved | withdrawal_rejected | withdrawal_paid
 *
 * Status flow:
 *   Pending -> Approved | Rejected
 *   Approved -> Paid
 *   (Idempotent: approving Approved, or paying Paid returns success {noOp:true})
 *
 * Mount in server.js:
 *   app.use("/api/admin", require("./routes/admin-loyalty-withdrawals"));
 */

const path = require("path");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

function dbPath() {
  const ROOT = process.env.ROOT || process.cwd();
  return process.env.DB_PATH_USERS || process.env.SQLITE_DB || path.join(ROOT, "data/dev/wattsun.dev.db");
}
function openDb() {
  return new sqlite3.Database(dbPath());
}
function nowISO() {
  return new Date().toISOString();
}
function adminIdFromSession(req) {
  // requireAdmin middleware should ensure req.session.user exists and is admin
  return req?.session?.user?.id || 0;
}

/* ----------------------------- DB HELPERS ----------------------------- */

function getWithdrawal(db, id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, user_id, account_id, amount_cents, status, decided_at, decided_by, decision_note,
              paid_at, payout_ref, created_at
         FROM withdrawals WHERE id = ?`,
      [id],
      (err, row) => (err ? reject(err) : resolve(row || null))
    );
  });
}

function updateWithdrawalApprove(db, id, decidedAt, decidedBy) {
  return run(db,
    `UPDATE withdrawals
        SET status='Approved',
            decided_at=?,
            decided_by=?,
            decision_note=NULL
      WHERE id=?`,
    [decidedAt, decidedBy, id]
  );
}

function updateWithdrawalReject(db, id, decidedAt, decidedBy, note) {
  return run(db,
    `UPDATE withdrawals
        SET status='Rejected',
            decided_at=?,
            decided_by=?,
            decision_note=?
      WHERE id=?`,
    [decidedAt, decidedBy, note || null, id]
  );
}

function updateWithdrawalMarkPaid(db, id, paidAt, payoutRef) {
  return run(db,
    `UPDATE withdrawals
        SET status='Paid',
            paid_at=?,
            payout_ref=?
      WHERE id=?`,
    [paidAt, payoutRef || null, id]
  );
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

function getRow(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
  });
}

function insert(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this.lastID);
    });
  });
}

/* ---------------------- LEDGER & NOTIFICATIONS ----------------------- */

async function ledgerExists(db, refId, entryType) {
  const row = await getRow(
    db,
    `SELECT id FROM loyalty_ledger
      WHERE ref_type='WITHDRAWAL' AND ref_id=? AND entry_type=?`,
    [refId, entryType]
  );
  return !!row;
}

// Inserts a standard ledger row. amount_cents is positive magnitude.
// For REJECTED/PAID, pass amount_cents = 0 to serve as an immutable audit trail.
function insertLedger(db, { userId, accountId, refId, entryType, amountCents, note }) {
  return insert(
    db,
    `INSERT INTO loyalty_ledger (user_id, account_id, ref_type, ref_id, entry_type, amount_cents, note)
     VALUES (?, ?, 'WITHDRAWAL', ?, ?, ?, ?)`,
    [userId, accountId || null, refId, entryType, Math.abs(amountCents || 0), note || null]
  );
}

// Minimal user contact fetch for notifications (email may be null -> template should fallback)
function getUserContact(db, userId) {
  return new Promise((resolve) => {
    db.get(`SELECT id, name, email, phone FROM users WHERE id = ?`, [userId], (e, row) => {
      if (e || !row) return resolve({ id: userId, name: null, email: null, phone: null });
      resolve({ id: row.id, name: row.name || null, email: row.email || null, phone: row.phone || null });
    });
  });
}

function enqueueNotification(db, { userId, template, toEmail, payload }) {
  return insert(
    db,
    `INSERT INTO notifications_queue (user_id, channel, template, "to", payload_json, status)
     VALUES (?, 'email', ?, ?, ?, 'queued')`,
    [userId || null, template, toEmail || null, JSON.stringify(payload || {})]
  );
}

/* ----------------------------- VALIDATORS ---------------------------- */

function fail(res, code, message, http = 400) {
  return res.status(http).json({ success: false, error: { code, message } });
}

/* ---------------------------- CORE HANDLERS --------------------------- */

async function handleApprove(req, res) {
  const id = parseInt(req.params.id, 10);
  const decidedBy = adminIdFromSession(req);
  const db = openDb();

  try {
    const w = await getWithdrawal(db, id);
    if (!w) return fail(res, "NOT_FOUND", "Withdrawal not found", 404);

    if (w.status === "Approved") {
      return res.json({ success: true, noOp: true, withdrawal: { id: w.id, status: w.status }, message: "Already approved" });
    }
    if (w.status === "Rejected" || w.status === "Paid") {
      return fail(res, "INVALID_STATE", `Cannot approve a ${w.status} withdrawal`, 409);
    }

    const stamp = nowISO();
    await updateWithdrawalApprove(db, id, stamp, decidedBy);

    // Ledger (dedupe)
    const entryType = "WITHDRAWAL_APPROVED";
    if (!(await ledgerExists(db, id, entryType))) {
      await insertLedger(db, {
        userId: w.user_id,
        accountId: w.account_id,
        refId: id,
        entryType,
        amountCents: Math.abs(w.amount_cents),
        note: "Withdrawal approved"
      });
    }

    // Notification
    const user = await getUserContact(db, w.user_id);
    await enqueueNotification(db, {
      userId: user.id,
      template: "withdrawal_approved",
      toEmail: user.email,
      payload: {
        withdrawalId: id,
        accountId: w.account_id || null,
        amountCents: Math.abs(w.amount_cents),
        decidedAt: stamp
      }
    });

    return res.json({
      success: true,
      withdrawal: { id, status: "Approved", decidedAt: stamp, decidedBy },
      ledger: { appended: true, type: entryType },
      notification: { queued: true, template: "withdrawal_approved" },
      message: "Withdrawal approved"
    });
  } catch (e) {
    return fail(res, "SERVER_ERROR", e.message, 500);
  } finally {
    db.close();
  }
}

async function handleReject(req, res) {
  const id = parseInt(req.params.id, 10);
  const decidedBy = adminIdFromSession(req);
  const note = (req.body?.note || "").toString().trim();
  const db = openDb();

  try {
    const w = await getWithdrawal(db, id);
    if (!w) return fail(res, "NOT_FOUND", "Withdrawal not found", 404);

    if (w.status === "Rejected") {
      return res.json({ success: true, noOp: true, withdrawal: { id: w.id, status: w.status }, message: "Already rejected" });
    }
    if (w.status === "Paid") {
      return fail(res, "INVALID_STATE", "Cannot reject a Paid withdrawal", 409);
    }

    const stamp = nowISO();
    await updateWithdrawalReject(db, id, stamp, decidedBy, note);

    // Ledger (0 delta, dedupe by entry type)
    const entryType = "WITHDRAWAL_REJECTED";
    if (!(await ledgerExists(db, id, entryType))) {
      await insertLedger(db, {
        userId: w.user_id,
        accountId: w.account_id,
        refId: id,
        entryType,
        amountCents: 0,
        note: note ? `Rejected: ${note}` : "Rejected"
      });
    }

    // Notification
    const user = await getUserContact(db, w.user_id);
    await enqueueNotification(db, {
      userId: user.id,
      template: "withdrawal_rejected",
      toEmail: user.email,
      payload: {
        withdrawalId: id,
        accountId: w.account_id || null,
        amountCents: Math.abs(w.amount_cents),
        decidedAt: stamp,
        reason: note || null
      }
    });

    return res.json({
      success: true,
      withdrawal: { id, status: "Rejected", decidedAt: stamp, decidedBy, decisionNote: note || null },
      ledger: { appended: true, type: entryType },
      notification: { queued: true, template: "withdrawal_rejected" },
      message: "Withdrawal rejected"
    });
  } catch (e) {
    return fail(res, "SERVER_ERROR", e.message, 500);
  } finally {
    db.close();
  }
}

async function handleMarkPaid(req, res) {
  const id = parseInt(req.params.id, 10);
  const payoutRef = (req.body?.payoutRef || "").toString().trim();
  const paidAt = (req.body?.paidAt || nowISO()).toString();
  const db = openDb();

  try {
    const w = await getWithdrawal(db, id);
    if (!w) return fail(res, "NOT_FOUND", "Withdrawal not found", 404);

    if (w.status === "Paid") {
      return res.json({ success: true, noOp: true, withdrawal: w, message: "Already Paid" });
    }
    if (w.status !== "Approved") {
      return fail(res, "INVALID_STATE", `Must be Approved to mark Paid (is ${w.status})`, 409);
    }

    await updateWithdrawalMarkPaid(db, id, paidAt, payoutRef || null);

    // Ledger (0 delta, dedupe)
    const entryType = "WITHDRAWAL_PAID";
    if (!(await ledgerExists(db, id, entryType))) {
      await insertLedger(db, {
        userId: w.user_id,
        accountId: w.account_id,
        refId: id,
        entryType,
        amountCents: 0,
        note: payoutRef ? `Paid: ${payoutRef}` : "Paid"
      });
    }

    // Notification
    const user = await getUserContact(db, w.user_id);
    await enqueueNotification(db, {
      userId: user.id,
      template: "withdrawal_paid",
      toEmail: user.email,
      payload: {
        withdrawalId: id,
        accountId: w.account_id || null,
        amountCents: Math.abs(w.amount_cents),
        paidAt,
        payoutRef: payoutRef || null
      }
    });

    return res.json({
      success: true,
      withdrawal: { id, status: "Paid", paidAt, payoutRef: payoutRef || null },
      ledger: { appended: true, type: entryType },
      notification: { queued: true, template: "withdrawal_paid" },
      message: "Withdrawal marked as Paid"
    });
  } catch (e) {
    return fail(res, "SERVER_ERROR", e.message, 500);
  } finally {
    db.close();
  }
}

/* ------------------------------- ROUTES ------------------------------- */
/* Spec PATCH routes */
router.patch("/loyalty/withdrawals/:id/approve", handleApprove);
router.patch("/loyalty/withdrawals/:id/reject", handleReject);
router.patch("/loyalty/withdrawals/:id/mark-paid", handleMarkPaid);

/* Backward-compat POST routes (optional) */
router.post("/loyalty/withdrawals/:id/decision", async (req, res) => {
  const approve = !!req.body?.approve;
  if (approve) return handleApprove(req, res);
  // treat as reject; note from body
  return handleReject(req, res);
});
router.post("/loyalty/withdrawals/:id/mark-paid", handleMarkPaid);

/* ------------------------------ EXPORTS ------------------------------- */

module.exports = router;
