// routes/admin-loyalty-withdrawals.js
// ✅ Updated Oct 2025 – Lifecycle-aware status fix (decided_at / paid_at logic)

const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const router = express.Router();

// ────────────────────────────────────────────────────────────────
// Middleware – require admin session
// ────────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const u = req.session?.user;
  if (!u || (u.type !== "Admin" && u.role !== "Admin")) {
    return res
      .status(403)
      .json({
        success: false,
        error: { code: "FORBIDDEN", message: "Admin access required." },
      });
  }
  next();
}

router.use(requireAdmin);

// ────────────────────────────────────────────────────────────────
// DB helpers
// ────────────────────────────────────────────────────────────────
const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(process.cwd(), "data/dev/wattsun.dev.db");

function withDb(fn) {
  const db = new sqlite3.Database(DB_PATH);
  return new Promise((resolve, reject) =>
    fn(db)
      .then((v) => {
        db.close();
        resolve(v);
      })
      .catch((e) => {
        db.close();
        reject(e);
      })
  );
}

const q = (db, sql, p = []) =>
  new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const all = (db, sql, p = []) =>
  new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (db, sql, p = []) =>
  new Promise((res, rej) => {
    db.run(sql, p, function (e) {
      if (e) rej(e);
      else res({ lastID: this.lastID, changes: this.changes });
    });
  });

const asInt = (v, d = 0) => (Number.isFinite(+v) ? parseInt(v, 10) : d);
const s = (x) => (x == null ? null : String(x).trim());

// ────────────────────────────────────────────────────────────────
// 🔁 Updated Helper: compute derived status according to lifecycle
// ────────────────────────────────────────────────────────────────
function computeStatus(r) {
  // Determine by date fields first
  const st = (r.raw_status || "").toLowerCase();

  // Paid always takes precedence
  if (r.paid_at) return "No Action";

  // Explicit states
  if (st.includes("approved")) return "Approved";
  if (st.includes("rejected")) return "No Action";

  // Only consider decided_at meaningful if status itself says approved
  if (r.decided_at && st === "approved") return "Approved";

  // Otherwise, still pending
  return "Pending";
}


// ────────────────────────────────────────────────────────────────
// GET /api/admin/loyalty/withdrawals
// Unified list from ledger + overlay
// ────────────────────────────────────────────────────────────────
router.get("/loyalty/withdrawals", async (req, res) => {
  const per = Math.min(100, Math.max(1, asInt(req.query?.per, 20)));
  const page = Math.max(1, asInt(req.query?.page, 1));
  const offset = (page - 1) * per;
  const statusFilter = (req.query?.status || "").trim();

  try {
    const out = await withDb(async (db) => {
      const sql = `
        SELECT 
          l.id,
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
        LIMIT ? OFFSET ?;
      `;
      const rows = await all(db, sql, [per, offset]);
      const total = (
        await q(
          db,
          "SELECT COUNT(*) AS n FROM loyalty_ledger WHERE kind='withdraw'"
        )
      )?.n;

      const withdrawals = rows.map((r) => ({
        ...r,
        status: computeStatus(r),
      }));

      const filtered = statusFilter
        ? withdrawals.filter((w) => w.status === statusFilter)
        : withdrawals;

      return { withdrawals: filtered, total };
    });

    return res.json({
      success: true,
      page,
      per,
      total: out.total,
      withdrawals: out.withdrawals,
    });
  } catch (e) {
    console.error("[withdrawals][GET]", e);
    return res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: "List failed" },
    });
  }
});

// ────────────────────────────────────────────────────────────────
// POST /api/admin/loyalty/withdrawals → create new Approved (admin-initiated)
// ────────────────────────────────────────────────────────────────
router.post("/loyalty/withdrawals", async (req, res) => {
  const accountId = asInt(req.body?.accountId);
  const points = Math.abs(asInt(req.body?.points));
  const note = s(req.body?.note);
  const adminId = req.session?.user?.id || null;
  const source = (req.session?.user?.role === "Admin") ? "admin" : "customer";

  if (!accountId || !points)
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_INPUT", message: "accountId & points required" },
    });

try {
  const row = await withDb(async (db) => {
    const adminUserId = adminId; // use session admin id
    const ledgerResult = await run(
      db,
      `INSERT INTO loyalty_ledger
         (account_id, kind, points_delta, note, admin_user_id, created_at)
       VALUES (?, 'withdraw', -?, ?, ?, datetime('now','localtime'))`,
      [accountId, points, note, adminUserId]
    );
    const ledgerId = ledgerResult.lastID;

    await run(
      db,
      `INSERT INTO loyalty_withdrawal_meta
         (ledger_id, admin_user_id, status, created_at)
       VALUES (?, ?, 'Pending', datetime('now','localtime'))`,
      [ledgerId, adminUserId]
    );
    // Record initiation source for frontend (admin vs customer)
await run(
  db,
  `UPDATE loyalty_withdrawal_meta
      SET note = COALESCE(note,'') || CASE WHEN ?='admin' THEN ' [source=admin]' ELSE ' [source=customer]' END
    WHERE ledger_id = ?`,
  [source, ledgerId]
);

    // 🔧 Adjust loyalty_accounts: subtract from balance only (not total_earned)
await run(
  db,
  `UPDATE loyalty_accounts
     SET points_balance = points_balance - ?
   WHERE id = ?`,
  [points, accountId]
);

    // 🔧 Ensure new withdrawals start undecided
    await run(
      db,
      `UPDATE loyalty_withdrawal_meta
        SET decided_at = NULL,
            decided_by = NULL
      WHERE ledger_id = ?`,
      [ledgerId]
    );

    const r = await q(
      db,
      `SELECT 
      l.*, 
      a.user_id, 
      m.status AS raw_status, 
      m.decided_at, 
      m.paid_at, 
      m.note AS admin_note,
      CASE
        WHEN m.note LIKE '%[source=admin]%' THEN 'admin'
        WHEN m.note LIKE '%[source=customer]%' THEN 'customer'
        ELSE 'customer'
      END AS source

       FROM loyalty_ledger l
       JOIN loyalty_accounts a ON a.id=l.account_id
       LEFT JOIN loyalty_withdrawal_meta m ON m.ledger_id=l.id
      WHERE l.id=?`,
      [ledgerId]
    );
    return { ...r, status: computeStatus(r), source };
  });

  return res.json({ success: true, withdrawal: row });
} catch (e) {
  console.error("[withdrawals][POST]", e);
  return res.status(500).json({
    success: false,
    error: { code: "SERVER_ERROR", message: "Create failed" },
  });
}
});

// ────────────────────────────────────────────────────────────────
// PATCH helpers (Approve / Paid / Reject)
// ────────────────────────────────────────────────────────────────
async function updateStatus(id, status, note, adminId, extra = {}) {
  return withDb(async (db) => {
    await run(
      db,
      `INSERT INTO loyalty_withdrawal_meta (ledger_id,status,decided_by,decided_at,note,paid_at)
         VALUES (?,?,?,?,?,?)
       ON CONFLICT(ledger_id)
       DO UPDATE SET 
         status=excluded.status,
         decided_by=excluded.decided_by,
         decided_at=excluded.decided_at,
         note=excluded.note,
         paid_at=COALESCE(excluded.paid_at, loyalty_withdrawal_meta.paid_at)`,
      [id, status, adminId, new Date().toISOString(), note || null, extra.paidAt || null]
    );

    const r = await q(
      db,
      `SELECT l.*, a.user_id, m.status AS raw_status, m.decided_at, m.paid_at, m.note AS admin_note
         FROM loyalty_ledger l
         JOIN loyalty_accounts a ON a.id=l.account_id
         LEFT JOIN loyalty_withdrawal_meta m ON m.ledger_id=l.id
        WHERE l.id=?`,
      [id]
    );
    return { ...r, status: computeStatus(r) };
  });
}


router.patch("/loyalty/withdrawals/:id/approve", async (req, res) => {
  const id = asInt(req.params.id);
  const adminId = req.session?.user?.id || null;
  const note = `Withdrawal #${id} approved`;
  try {
    const row = await updateStatus(id, "Approved", note, adminId);

    // 🔸 INSERT notification
    await withDb(async (db) => {
    await run(
      db,
      `INSERT INTO notifications_queue
         (kind, user_id, email, payload, status, note, created_at)
       VALUES ('withdrawal_approved', ?, ?, json(?), 'Queued', ?, datetime('now','localtime'))`,
      [row.user_id, null, JSON.stringify({ message: note }), note]
    );
    });
    res.json({ success: true, withdrawal: row });
  } catch (e) {
    console.error("[approve]", e);
    res.status(500).json({ success: false, error: { message: "Approve failed" } });
  }
});


router.patch("/loyalty/withdrawals/:id/mark-paid", async (req, res) => {
  const id = asInt(req.params.id);
  const adminId = req.session?.user?.id || null;
  const note = s(req.body?.note) || `Withdrawal #${id} paid`;
  const paidAt = req.body?.paidAt || new Date().toISOString();
  try {
    const row = await updateStatus(id, "No Action", note, adminId, { paidAt });

    // 🔸 INSERT notification
    await withDb(async (db) => {
      await run(
        db,
        `INSERT INTO notifications_queue
           (kind, user_id, email, payload, status, note, created_at)
         VALUES ('withdrawal_paid', ?, ?, json(?), 'Queued', ?, datetime('now','localtime'))`,
        [row.user_id, null, JSON.stringify({ message: note }), note]
      );
    });

    res.json({ success: true, withdrawal: row });
  } catch (e) {
    console.error("[mark-paid]", e);
    res.status(500).json({ success: false, error: { message: "Mark paid failed" } });
  }
});

router.patch("/loyalty/withdrawals/:id/reject", async (req, res) => {
  const id = asInt(req.params.id);
  const adminId = req.session?.user?.id || null;
  const note = s(req.body?.note) || `Withdrawal #${id} rejected`;
  try {
    const row = await updateStatus(id, "No Action", note, adminId);
// 🔧 Update account totals: add to total_paid on payout confirmation
await withDb(async (db) => {
  await run(
    db,
    `UPDATE loyalty_accounts
       SET total_paid = total_paid + ABS(l.points_delta)
     FROM loyalty_ledger l
     WHERE loyalty_accounts.id = l.account_id AND l.id = ?`,
    [id]
  );
});

    await withDb(async (db) => {
      await run(
        db,
        `INSERT INTO notifications_queue
           (kind, user_id, email, payload, status, note, created_at)
         VALUES ('withdrawal_rejected', ?, ?, json(?), 'Queued', ?, datetime('now','localtime'))`,
        [row.user_id, null, JSON.stringify({ message: note }), note]
      );
    });

    res.json({ success: true, withdrawal: row });
  } catch (e) {
    console.error("[reject]", e);
    res.status(500).json({ success: false, error: { message: "Reject failed" } });
  }
});


module.exports = router;
