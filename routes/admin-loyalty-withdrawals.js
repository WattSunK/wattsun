// routes/admin-loyalty-withdrawals.js
// ✅ Updated Oct 2025 – Overlay + Lifecycle Aware + Admin Gated
// Status flow: Pending → Approved → No Action (Paid / Rejected final)

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
  new Promise((res, rej) =>
    db.run(sql, p, function (e) {
      if (e) rej(e);
      else res({ changes: this.changes, lastID: this.lastID });
    })
  );
const asInt = (v, d = 0) => (Number.isFinite(+v) ? parseInt(v, 10) : d);
const s = (x) => (x == null ? null : String(x).trim());

// ────────────────────────────────────────────────────────────────
// Helper: compute derived status according to overlay
// ────────────────────────────────────────────────────────────────
function computeStatus(metaRow) {
  if (!metaRow) return "Pending";
  const st = metaRow.status;
  if (st === "Approved") return "Approved";
  if (st === "Paid" || st === "Rejected" || st === "No Action")
    return "No Action";
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
// POST /api/admin/loyalty/withdrawals  → create new Approved (admin-initiated)
// ────────────────────────────────────────────────────────────────
router.post("/loyalty/withdrawals", async (req, res) => {
  const accountId = asInt(req.body?.accountId);
  const points = Math.abs(asInt(req.body?.points));
  const note = s(req.body?.note);
  const adminId = req.session?.user?.id || null;

  if (!accountId || !points)
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_INPUT", message: "accountId & points required" },
    });

  try {
    const row = await withDb(async (db) => {
      const id = (
        await run(
          db,
          `INSERT INTO loyalty_ledger
             (account_id, kind, points_delta, note, admin_user_id, created_at)
           VALUES (?, 'withdraw', -?, ?, ?, datetime('now','localtime'))`,
          [accountId, points, note, adminId]
        )
      ).lastID;

      // Admin-initiated withdrawals start as Approved
      await run(
        db,
        `INSERT OR IGNORE INTO loyalty_withdrawal_meta (ledger_id,status,decided_by)
         VALUES (?, 'Approved', ?)`,
        [id, adminId]
      );

      const r = await q(
        db,
        `SELECT l.*, a.user_id, m.status AS raw_status
           FROM loyalty_ledger l
           JOIN loyalty_accounts a ON a.id=l.account_id
           LEFT JOIN loyalty_withdrawal_meta m ON m.ledger_id=l.id
          WHERE l.id=?`,
        [id]
      );
      return { ...r, status: computeStatus(r) };
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
async function updateStatus(id, status, note, adminId) {
  return withDb(async (db) => {
    await run(
      db,
      `INSERT INTO loyalty_withdrawal_meta (ledger_id,status,decided_by,decided_at,note)
         VALUES (?,?,?,?,?)
       ON CONFLICT(ledger_id)
       DO UPDATE SET 
         status=excluded.status,
         decided_by=excluded.decided_by,
         decided_at=excluded.decided_at,
         note=excluded.note`,
      [id, status, adminId, new Date().toISOString(), note || null]
    );
    const r = await q(
      db,
      `SELECT l.*, a.user_id, m.status AS raw_status, m.note AS admin_note
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
  try {
    const row = await updateStatus(id, "Approved", null, adminId);
    res.json({ success: true, withdrawal: row });
  } catch (e) {
    console.error("[approve]", e);
    res
      .status(500)
      .json({ success: false, error: { message: "Approve failed" } });
  }
});

router.patch("/loyalty/withdrawals/:id/mark-paid", async (req, res) => {
  const id = asInt(req.params.id);
  const adminId = req.session?.user?.id || null;
  const note = s(req.body?.note);
  try {
    const row = await updateStatus(id, "No Action", note, adminId);
    res.json({ success: true, withdrawal: row });
  } catch (e) {
    console.error("[mark-paid]", e);
    res
      .status(500)
      .json({ success: false, error: { message: "Mark paid failed" } });
  }
});

router.patch("/loyalty/withdrawals/:id/reject", async (req, res) => {
  const id = asInt(req.params.id);
  const adminId = req.session?.user?.id || null;
  const note = s(req.body?.note);
  try {
    const row = await updateStatus(id, "No Action", note || "Rejected", adminId);
    res.json({ success: true, withdrawal: row });
  } catch (e) {
    console.error("[reject]", e);
    res
      .status(500)
      .json({ success: false, error: { message: "Reject failed" } });
  }
});

module.exports = router;
