// routes/admin-loyalty-withdrawals.js
// (compat, additive) — admin continues to use its own `withdrawals` table,
// but the list now also shows customer requests coming from `loyalty_withdrawals`
// via the read-only view `v_withdrawals_unified`. Actions route to the
// correct base table by probing the view for `source`.
//
// Endpoints kept as-is:
//   POST   /api/admin/loyalty/withdrawals               (create admin-initiated Pending request)
//   GET    /api/admin/loyalty/withdrawals               (list — now from unified view)
//   PATCH  /api/admin/loyalty/withdrawals/:id/approve
//   PATCH  /api/admin/loyalty/withdrawals/:id/reject
//   PATCH  /api/admin/loyalty/withdrawals/:id/mark-paid
//   POST   /api/admin/loyalty/withdrawals/:id/decision  (compat multiplexer)
//   POST   /api/admin/loyalty/withdrawals/:id/mark-paid (compat alias)

const express = require("express");
const router = express.Router();
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

// ---- DB wiring (unchanged default; env wins) --------------------------------
const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(process.cwd(), "data/dev/wattsun.dev.db");

function withDb(fn) {
  const db = new sqlite3.Database(DB_PATH);
  return new Promise((resolve, reject) => {
    fn(db)
      .then((v) => {
        db.close();
        resolve(v);
      })
      .catch((e) => {
        db.close();
        reject(e);
      });
  });
}

// ---- tiny promisified helpers ------------------------------------------------
const q = (db, sql, params = []) =>
  new Promise((res, rej) => db.get(sql, params, (e, row) => (e ? rej(e) : res(row || null))));
const all = (db, sql, params = []) =>
  new Promise((res, rej) => db.all(sql, params, (e, rows) => (e ? rej(e) : res(rows || []))));
const run = (db, sql, params = []) =>
  new Promise((res, rej) =>
    db.run(sql, params, function (e) {
      if (e) return rej(e);
      res({ changes: this.changes, lastID: this.lastID });
    })
  );
const lastId = (db, sql, params = []) =>
  run(db, sql, params).then((info) => info.lastID);

// ---- util: safe ints/strings ------------------------------------------------
const asInt = (v, d = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const s = (x) => (x == null ? null : String(x));

// ---- (optional) feature probes used elsewhere in the original file ----------
// Keep signatures to avoid breaking call sites if you reference them later.
async function tableExists(db, name) {
  const r = await q(
    db,
    `SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
    [name]
  );
  return !!r;
}

// If the legacy code adds ledger rows on approval/paid, preserve behavior.
// These helpers are defensive: they no-op if columns/tables are missing.
async function addLedgerIfAvailable(db, opts) {
  const ok = await tableExists(db, "loyalty_ledger");
  if (!ok) return;

  const colsInfo = await all(
    db,
    `PRAGMA table_info(loyalty_ledger)`
  );
  const has = (name) => colsInfo.some(c => c.name === name);

  const fields = [];
  const values = [];
  const params = [];

  // required-ish in our usage
  if (has("account_id")) { fields.push("account_id"); values.push("?"); params.push(opts.accountId); }
  if (has("kind"))       { fields.push("kind");       values.push("?"); params.push("WITHDRAWAL"); }
  if (has("points_delta")) { fields.push("points_delta"); values.push("?"); params.push(opts.pointsDelta); }
  if (has("note"))       { fields.push("note");       values.push("?"); params.push(opts.note || null); }
  if (has("admin_user_id")) { fields.push("admin_user_id"); values.push("?"); params.push(opts.adminUserId || null); }
  if (has("created_at")) { fields.push("created_at"); values.push("datetime('now')"); }

  if (!fields.length) return; // nothing safe to insert

  const sql = `INSERT INTO loyalty_ledger (${fields.join(",")}) VALUES (${values.join(",")})`;
  try { await run(db, sql, params); } catch (_e) { /* best-effort: ignore */ }
}

// ---- view-aware helpers (NEW) -----------------------------------------------
// The view returns a union with a common shape + a "source" discriminator
// ('customer' from loyalty_withdrawals, 'admin' from withdrawals).
async function findWithdrawalSource(db, id) {
  // Disambiguate by probing base tables directly.
  // Prefer 'admin' if both happen to have the same numeric id.
  const inAdmin = await q(db, `SELECT id FROM withdrawals WHERE id=?`, [id]);
  if (inAdmin) return "admin";
  const inCustomer = await q(db, `SELECT id FROM loyalty_withdrawals WHERE id=?`, [id]);
  if (inCustomer) return "customer";
  return null;
}

async function getUnifiedWithdrawal(db, id, sourceHint = null) {
  const src = sourceHint || (await findWithdrawalSource(db, id));
  if (src === "admin") {
    return q(
      db,
      `SELECT
         w.id,
         w.account_id,
         w.user_id,
         w.points,
         w.eur,
         w.status,
         w.requested_at,
         w.decided_at,
         w.paid_at,
         w.decision_note,
         w.decided_by,
         w.payout_ref,
         'admin' AS source
       FROM withdrawals w
       WHERE w.id = ?`,
      [id]
    );
  }
  if (src === "customer") {
    return q(
      db,
      `SELECT
         lw.id,
         lw.account_id,
         la.user_id,
         lw.requested_pts  AS points,
         lw.requested_eur  AS eur,
         lw.status,
         lw.requested_at,
         lw.decided_at,
         lw.paid_at,
         lw.decision_note,
         lw.decided_by,
         lw.payout_ref,
         'customer'        AS source
       FROM loyalty_withdrawals lw
       LEFT JOIN loyalty_accounts la ON la.id = lw.account_id
       WHERE lw.id = ?`,
      [id]
    );
  }
  return null;
}


// ---- amount helper preserved (points/eur) -----------------------------------
function deriveAmount(w) {
  const points = asInt(w?.points, 0);
  const eur = asInt(w?.eur, 0);
  return { points, eur };
}

// ---- Routes: create (admin-initiated) ---------------------------------------
// POST /api/admin/loyalty/withdrawals
router.post("/loyalty/withdrawals", async (req, res) => {
  // Accept the same payload you already support:
  // { accountId, userId?, points, note }
  const accountId = asInt(req.body?.accountId);
  const userId = asInt(req.body?.userId); // tolerated (legacy admin table has this col)
  const points = asInt(req.body?.points);
  const note = s(req.body?.note)?.slice(0, 500) || null;

  if (!Number.isFinite(points) || points <= 0) {
    return res
      .status(400)
      .json({ success: false, error: { code: "INVALID_POINTS", message: "Enter points" } });
  }
  if (!Number.isFinite(accountId) || accountId <= 0) {
    return res
      .status(400)
      .json({ success: false, error: { code: "INVALID_ACCOUNT", message: "Enter account id" } });
  }

  try {
    const row = await withDb(async (db) => {
      // Compute requested_eur (admin table stores plain eur)
      const p = await q(
        db,
        `SELECT la.id account_id, la.user_id, la.program_id
           FROM loyalty_accounts la
          WHERE la.id=?`,
        [accountId]
      );
      if (!p) throw new Error("Account not found");

      const epp = await q(
        db,
        `SELECT value FROM loyalty_program_settings WHERE program_id=? AND key='eurPerPoint'`,
        [p.program_id]
      ).catch(() => null);
      const eurPerPoint = Number.parseFloat(epp?.value || "1");
      const eur = points * (Number.isFinite(eurPerPoint) ? eurPerPoint : 1);

      // Preserve the existing admin INSERT into its own table.
      const id = await lastId(
        db,
        `INSERT INTO withdrawals
           (account_id, user_id, points, eur, status, requested_at, note)
         VALUES (?, ?, ?, ?, 'Pending', datetime('now','localtime'), ?)`,
        [accountId, userId || p.user_id || null, points, eur, note]
      );

      return getUnifiedWithdrawal(db, id); // return normalized shape (includes 'source')
    });

    return res.json({ success: true, withdrawal: row });
  } catch (e) {
    console.error("[admin/loyalty/withdrawals][POST]", e);
    return res
      .status(500)
      .json({ success: false, error: { code: "SERVER_ERROR", message: "Create failed" } });
  }
});

// ---- Routes: list (NOW reads the unified VIEW) ------------------------------
/// GET /api/admin/loyalty/withdrawals — resilient list
router.get("/loyalty/withdrawals", async (req, res) => {
  const perIn  = req.query?.limit ?? req.query?.per;
  const per    = Math.min(100, Math.max(1, asInt(perIn, 50)));
  const page   = Math.max(1, asInt(req.query?.page, 1));
  const offset = (page - 1) * per;

  const status  = (req.query?.status || "").toString().trim();
  const qSearch = (req.query?.q || req.query?.search || "").toString().trim();

  const where = [];
  const args  = [];

  if (status && status !== "All") {
    where.push(`status = ?`);
    args.push(status);
  }
  if (qSearch) {
    // match by id/account/user as text (works for both sources)
    where.push(`(CAST(id AS TEXT) LIKE ? OR CAST(account_id AS TEXT) LIKE ? OR CAST(user_id AS TEXT) LIKE ?)`);
    args.push(`%${qSearch}%`, `%${qSearch}%`, `%${qSearch}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Conservative UNION that avoids referencing optional admin columns
  // (prevents 500s if the admin 'withdrawals' table doesn't have some fields)
  const unionSafe = `
    SELECT
      lw.id,
      lw.account_id,
      la.user_id,
      lw.requested_pts AS points,
      lw.requested_eur AS eur,
      lw.status,
      lw.requested_at,
      lw.decided_at,
      lw.paid_at,
      NULL              AS decision_note,
      NULL              AS decided_by,
      NULL              AS payout_ref,
      'customer'        AS source
    FROM loyalty_withdrawals lw
    LEFT JOIN loyalty_accounts la ON la.id = lw.account_id
    UNION ALL
    SELECT
      w.id,
      w.account_id,
      w.user_id,
      w.points,
      w.eur,
      w.status,
      w.requested_at,
      w.decided_at,
      w.paid_at,
      NULL              AS decision_note,
      NULL              AS decided_by,
      NULL              AS payout_ref,
      'admin'           AS source
    FROM withdrawals w
  `;

  try {
    const out = await withDb(async (db) => {
      // Prefer the view if present
      const hasView = !!(await q(
        db,
        `SELECT name FROM sqlite_master WHERE type='view' AND name='v_withdrawals_unified'`
      ));

      if (hasView) {
        try {
          // View path (full data)
          const rows = await all(
            db,
            `
              SELECT id, account_id, user_id, points, eur, status,
                     requested_at, decided_at, paid_at,
                     decision_note, decided_by, payout_ref, source
                FROM v_withdrawals_unified
                ${whereSql}
               ORDER BY id DESC
               LIMIT ? OFFSET ?`,
            [...args, per, offset]
          );

          const totRow = await q(
            db,
            `SELECT COUNT(*) AS n
               FROM (SELECT id
                       FROM v_withdrawals_unified
                       ${whereSql}) t`,
            args
          );

          return { rows, total: totRow?.n || 0 };
        } catch (e) {
          console.warn("[admin/withdrawals][list] view failed, using UNION fallback:", e.message);
          // fall through to unionSafe
        }
      }

      // Fallback UNION (never references optional columns)
      const rows = await all(
        db,
        `
          SELECT *
            FROM (${unionSafe}) u
            ${whereSql}
           ORDER BY id DESC
           LIMIT ? OFFSET ?`,
        [...args, per, offset]
      );

      const totRow = await q(
        db,
        `SELECT COUNT(*) AS n FROM (${unionSafe}) u ${whereSql}`,
        args
      );

      return { rows, total: totRow?.n || 0 };
    });

    return res.json({
      success: true,
      page,
      per,
      total: out.total,
      withdrawals: out.rows,
    });
  } catch (e) {
    console.error("[admin/loyalty/withdrawals][GET] fatal:", e);
    return res
      .status(500)
      .json({ success: false, error: { code: "SERVER_ERROR", message: "List failed" } });
  }
});


// ---- Actions: Approve / Reject / Mark-Paid (source-aware updates) -----------

// shared: pick target sql/table by source
function targetSqlForAction(source, action) {
  // Return { sql, paramsBuilder } for the chosen base table.
  // We only change the table name; columns are already identical in both bases.
  if (action === "approve") {
    if (source === "admin") {
      return (stamp, decidedBy, id, _note) => ({
        sql: `UPDATE withdrawals
                SET status='Approved', decided_at=?, decided_by=?, decision_note=NULL
              WHERE id=?`,
        params: [stamp, decidedBy, id],
      });
    } else {
      return (stamp, decidedBy, id, _note) => ({
        sql: `UPDATE loyalty_withdrawals
                SET status='Approved', decided_at=?, decided_by=?, decision_note=NULL
              WHERE id=?`,
        params: [stamp, decidedBy, id],
      });
    }
  }
  if (action === "reject") {
    if (source === "admin") {
      return (stamp, decidedBy, id, note) => ({
        sql: `UPDATE withdrawals
                SET status='Rejected', decided_at=?, decided_by=?, decision_note=?
              WHERE id=?`,
        params: [stamp, decidedBy, note || null, id],
      });
    } else {
      return (stamp, decidedBy, id, note) => ({
        sql: `UPDATE loyalty_withdrawals
                SET status='Rejected', decided_at=?, decided_by=?, decision_note=?
              WHERE id=?`,
        params: [stamp, decidedBy, note || null, id],
      });
    }
  }
  if (action === "paid") {
    if (source === "admin") {
      return (paidAt, payoutRef, id) => ({
        sql: `UPDATE withdrawals
                SET status='Paid', paid_at=?, payout_ref=?
              WHERE id=?`,
        params: [paidAt, payoutRef || null, id],
      });
    } else {
      return (paidAt, payoutRef, id) => ({
        sql: `UPDATE loyalty_withdrawals
                SET status='Paid', paid_at=?, payout_ref=?
              WHERE id=?`,
        params: [paidAt, payoutRef || null, id],
      });
    }
  }
  throw new Error("Unknown action");
}

// Approve
async function handleApprove(req, res) {
  const id = asInt(req.params.id);
  const decidedBy = req.session?.user?.id || null;
  const stamp = new Date().toISOString();

  try {
    await withDb(async (db) => {
      let src = (forceSrc === "admin" || forceSrc === "customer") ? forceSrc : null;
      if (!src) src = await findWithdrawalSource(db, id);

      if (!src) {
        return res
          .status(404)
          .json({ success: false, error: { code: "NOT_FOUND", message: "Withdrawal not found" } });
      }
      const t = targetSqlForAction(src, "approve")(stamp, decidedBy, id, null);
      await run(db, t.sql, t.params);

      // (optional) add a ledger entry when approving (points deducted)
      const row = await getUnifiedWithdrawal(db, id);
      const { points } = deriveAmount(row);
      await addLedgerIfAvailable(db, {
        accountId: row.account_id,
        pointsDelta: -Math.abs(points),
        note: `Withdrawal #${id} approved`,
        adminUserId: decidedBy || null,
      });

      const fresh = await getUnifiedWithdrawal(db, id, src);
      return res.json({ success: true, withdrawal: fresh });
    });
  } catch (e) {
    console.error("[admin/loyalty/withdrawals/:id/approve]", e);
    return res
      .status(500)
      .json({ success: false, error: { code: "SERVER_ERROR", message: "Approve failed" } });
  }
}

// Reject
async function handleReject(req, res) {
  const id = asInt(req.params.id);
  const decidedBy = req.session?.user?.id || null;
  const stamp = new Date().toISOString();
  const note = s(req.body?.note)?.slice(0, 500) || null;

  try {
    await withDb(async (db) => {
      const src = await findWithdrawalSource(db, id);
      if (!src) {
        return res
          .status(404)
          .json({ success: false, error: { code: "NOT_FOUND", message: "Withdrawal not found" } });
      }
      const t = targetSqlForAction(src, "reject")(stamp, decidedBy, id, note);
      await run(db, t.sql, t.params);

      const fresh = await getUnifiedWithdrawal(db, id, src);
      return res.json({ success: true, withdrawal: fresh });
    });
  } catch (e) {
    console.error("[admin/loyalty/withdrawals/:id/reject]", e);
    return res
      .status(500)
      .json({ success: false, error: { code: "SERVER_ERROR", message: "Reject failed" } });
  }
}

// Mark Paid
async function handleMarkPaid(req, res) {
  const id = asInt(req.params.id);
  const payoutRef = s(req.body?.payoutRef)?.slice(0, 120) || null;
  const paidAt = new Date().toISOString();

  try {
    await withDb(async (db) => {
      const src = await findWithdrawalSource(db, id);
      if (!src) {
        return res
          .status(404)
          .json({ success: false, error: { code: "NOT_FOUND", message: "Withdrawal not found" } });
      }
      const t = targetSqlForAction(src, "paid")(paidAt, payoutRef, id);
      await run(db, t.sql, t.params);

      const fresh = await getUnifiedWithdrawal(db, id, src);
      return res.json({ success: true, withdrawal: fresh });
    });
  } catch (e) {
    console.error("[admin/loyalty/withdrawals/:id/mark-paid]", e);
    return res
      .status(500)
      .json({ success: false, error: { code: "SERVER_ERROR", message: "Mark paid failed" } });
  }
}

// ---- Route mounts (preserve existing paths) ---------------------------------
router.patch("/loyalty/withdrawals/:id/approve", handleApprove);
router.patch("/loyalty/withdrawals/:id/reject", handleReject);
router.patch("/loyalty/withdrawals/:id/mark-paid", handleMarkPaid);

// Compat: sometimes POST is used for these actions in older UI builds
router.post("/loyalty/withdrawals/:id/decision", (req, res) => {
  const decision = (req.body?.decision || "").toString();
  if (decision === "approve") return handleApprove(req, res);
  if (decision === "reject") return handleReject(req, res);
  return res
    .status(400)
    .json({ success: false, error: { code: "INVALID_DECISION", message: "approve|reject" } });
});
router.post("/loyalty/withdrawals/:id/mark-paid", handleMarkPaid);

module.exports = router;
