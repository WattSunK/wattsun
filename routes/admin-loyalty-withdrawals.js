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

// List withdrawals (unified view from ledger + meta)
router.get("/loyalty/withdrawals", (req, res) => {
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
});

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

router.patch("/loyalty/withdrawals/:id/approve", (req, res) => {
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
});

router.patch("/loyalty/withdrawals/:id/mark-paid", (req, res) => {
  try {
    const id = asInt(req.params.id);
    const adminId = req.session?.user?.id || null;
    const note = s(req.body?.note) || `Withdrawal #${id} paid`;
    const paidAt = req.body?.paidAt || new Date().toISOString();
    const row = updateStatus(id, "No Action", note, adminId, { paidAt });

    // Update account totals on successful payout
    db.prepare(`UPDATE loyalty_accounts
                  SET total_paid = COALESCE(total_paid,0) + (SELECT ABS(points_delta) FROM loyalty_ledger WHERE id = ?)
                WHERE id = (SELECT account_id FROM loyalty_ledger WHERE id = ?)`)
      .run(id, id);

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
});

router.patch("/loyalty/withdrawals/:id/reject", (req, res) => {
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
});

module.exports = router;

