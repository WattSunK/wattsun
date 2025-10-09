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

// === lightweight debug helpers (NEW) ========================================
const LOG_NOTIFY = process.env.LOG_LEVEL !== 'silent';
const dbg = (...a) => LOG_NOTIFY && console.log('[notify]', ...a);

// Detect "source" consistently (helper available if needed elsewhere)
function getSource(req, { inAdmin, inCustomer }) {
  if (inCustomer) return 'customer';
  if (inAdmin) return 'admin';
  return (req.query?.source || req.body?.source || 'admin').toLowerCase();
}

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
  const inAdmin = await q(db, `SELECT id FROM loyalty_ledger WHERE id=? AND kind='withdraw'`, [id]);
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
       FROM loyalty_ledger l
      JOIN loyalty_accounts a ON l.account_id = a.id
      WHERE l.id = ? AND l.kind = 'withdraw'`,
      [id]

    );
  }
  if (src === "customer") {
  return q(
    db,
    `SELECT
      l.id,
      l.account_id,
      a.user_id,
      l.points_delta AS points,
      NULL AS eur,
      CASE 
        WHEN l.points_delta < 0 THEN 'Paid'
        ELSE 'Pending'
      END AS status,
      l.created_at AS requested_at,
      NULL AS decided_at,
      NULL AS paid_at,
      l.note AS decision_note,
      NULL AS decided_by,
      NULL AS payout_ref,
      'ledger' AS source
     FROM loyalty_ledger l
     JOIN loyalty_accounts a ON l.account_id = a.id
     WHERE l.id = ? AND l.kind = 'withdraw'`,
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

// ---- notifications (best-effort) --------------------------------------------
async function ensureNotificationsQueue(db) {
  // 1) Create table if missing (includes dedupe_key for fresh DBs)
  await run(db, `
    CREATE TABLE IF NOT EXISTS notifications_queue (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      account_id INTEGER,
      kind TEXT NOT NULL,
      email TEXT,
      status TEXT NOT NULL DEFAULT 'Queued',
      payload TEXT,
      dedupe_key TEXT,
      created_at DATETIME NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // 2) Backfill schema for existing DBs (add dedupe_key if missing)
  const cols = await all(db, `PRAGMA table_info(notifications_queue)`);
  const hasDedupe = cols.some(c => c.name === "dedupe_key");
  if (!hasDedupe) {
    try { await run(db, `ALTER TABLE notifications_queue ADD COLUMN dedupe_key TEXT`); } catch (_) {}
  }

  // 3) Indexes
  await run(db, `CREATE INDEX IF NOT EXISTS ix_nq_latest ON notifications_queue(created_at DESC)`);
  await run(db, `CREATE UNIQUE INDEX IF NOT EXISTS uq_nq_dedupe ON notifications_queue(dedupe_key)`);
}

// single-row de-dupe by kind+ref (withdrawal id) and email (optional)
async function enqueueNotification(db, { userId, accountId, kind, email, payload }) {
  await ensureNotificationsQueue(db);
  const wid = payload?.withdrawalId ? Number(payload.withdrawalId) : null;
  const dedupe = `${kind}:${wid ?? 'na'}:${email ?? ''}`;

  const json = JSON.stringify(payload || {});
  const sql = `
    INSERT OR IGNORE INTO notifications_queue
      (user_id, account_id, kind, email, status, payload, dedupe_key)
    VALUES
      (?, ?, ?, ?, 'Queued', ?, ?)
  `;
  await run(db, sql, [userId || null, accountId || null, kind, email || null, json, dedupe]);

  // optional visibility in logs
  console.log('[notify] queued', { kind, wid, email, accountId });
}

// convenient: look up the user email for a given account
async function lookupEmailByAccount(db, accountId) {
  const r = await q(
    db,
    `SELECT u.email, a.user_id
       FROM loyalty_accounts a
  LEFT JOIN users u ON u.id = a.user_id
      WHERE a.id = ?`,
    [accountId]
  );
  return { email: r?.email || null, userId: r?.user_id || null };
}

// Resolve email/user/account for a notification using whatever we have.
async function lookupEmailForNotification(db, { accountId, withdrawalId, source }) {
  // 1) If we already have an accountId, try the direct join
  if (accountId) {
    const r = await q(
      db,
      `SELECT u.email, a.user_id, a.id AS account_id
         FROM loyalty_accounts a
         LEFT JOIN users u ON u.id = a.user_id
        WHERE a.id = ?`,
      [accountId]
    ).catch(() => null);
    if (r?.email) return { email: r.email, userId: r.user_id, accountId: r.account_id };
  }

  // 2) Try by withdrawal + source (exact base table)
  if (withdrawalId && source === 'customer') {
    const r = await q(
      db,
      `SELECT u.email, a.user_id, a.id AS account_id
         FROM loyalty_withdrawals w
         JOIN loyalty_accounts a ON a.id = w.account_id
         LEFT JOIN users u ON u.id = a.user_id
        WHERE w.id = ?`,
      [withdrawalId]
    ).catch(() => null);
    if (r?.email) return { email: r.email, userId: r.user_id, accountId: r.account_id };
  }
  if (withdrawalId && source === 'admin') {
    const r = await q(
      db,
      `SELECT u.email, a.user_id, a.id AS account_id
       FROM loyalty_ledger l
        JOIN loyalty_accounts a ON a.id = l.account_id
        LEFT JOIN users u ON u.id = a.user_id
        WHERE l.id = ? AND l.kind = 'withdraw'`,
        [withdrawalId]

    ).catch(() => null);
    if (r?.email) return { email: r.email, userId: r.user_id, accountId: r.account_id };
  }

  // 3) Fall back to the unified view if present
  try {
    const hasView = await q(db, `SELECT 1 FROM sqlite_master WHERE type='view' AND name='v_withdrawals_unified'`);
    if (hasView && withdrawalId) {
      const r = await q(
        db,
        `SELECT u.email, a.user_id, a.id AS account_id
           FROM v_withdrawals_unified v
           JOIN loyalty_accounts a ON a.id = v.account_id
           LEFT JOIN users u ON u.id = a.user_id
          WHERE v.id = ?`,
        [withdrawalId]
      ).catch(() => null);
      if (r?.email) return { email: r.email, userId: r.user_id, accountId: r.account_id };
    }
  } catch (_) {}

  // 4) Give up gracefully
  return { email: null, userId: null, accountId: accountId || null };
}

// Wrapper to log lookups (NEW)
async function lookupEmailForNotificationLogged(db, params) {
  const { withdrawalId, accountId, source } = params || {};
  dbg('[lookup.start]', { withdrawalId, accountId, source });
  const res = await lookupEmailForNotification(db, params);
  dbg('[lookup.result]', { email: res?.email || null, userId: res?.userId || null });
  return res;
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
      const adminUserId = req.session?.user?.id || null;

      const id = await lastId(
        db,
        `INSERT INTO loyalty_ledger
          (account_id, kind, points_delta, note, admin_user_id, created_at)
        VALUES
          (?, 'withdraw', -ABS(?), ?, ?, datetime('now','localtime'))`,
        [accountId, points, note, adminUserId || userId || null]
      );

      return getUnifiedWithdrawal(db, id); // return normalized shape (includes 'source')
    });
    // --- enqueue notification for admin-initiated withdrawal (NEW) ---
    try {
      const { email, userId } = await lookupEmailForNotificationLogged(db, {
        accountId,
        withdrawalId: row.id,
        source: 'admin'
      });

      await enqueueNotification(db, {
        userId,
        accountId,
        kind: 'withdrawal_created_admin',
        email,
        payload: {
          withdrawalId: row.id,
          accountId,
          points,
          eur,
          source: 'admin',
          note
        }
      });

      console.log('[notify] queued withdrawal_created_admin', { id: row.id, userId, accountId });
    } catch (e) {
      console.warn('[notify.error.withdrawal_created_admin]', e.message);
    }

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
   // Modernized query — use loyalty_ledger for withdrawals
  const unionSafe = `
    SELECT
      l.id,
      l.account_id,
      a.user_id,
      l.points_delta AS points,
      NULL AS eur,
      CASE 
        WHEN l.points_delta < 0 THEN 'Paid'
        ELSE 'Pending'
      END AS status,
      l.created_at AS requested_at,
      NULL AS decided_at,
      NULL AS paid_at,
      l.note AS decision_note,
      NULL AS decided_by,
      NULL AS payout_ref,
      'ledger' AS source
    FROM loyalty_ledger l
    JOIN loyalty_accounts a ON l.account_id = a.id
    WHERE l.kind = 'withdraw'
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
      const forceSrc = (req.query?.source || req.body?.source || "").toString().toLowerCase();
      let src = (forceSrc === "admin" || forceSrc === "customer") ? forceSrc : null;
      if (!src) src = await findWithdrawalSource(db, id);

      dbg('[approve.start]', { id, src, forceSrc });
      if (!src) {
        return res
          .status(404)
          .json({ success: false, error: { code: "NOT_FOUND", message: "Withdrawal not found" } });
      }
      const t = targetSqlForAction(src, "approve")(stamp, decidedBy, id, null);
      await run(db, t.sql, t.params);

      // (optional) add a ledger entry when approving (points deducted)
      const row = await getUnifiedWithdrawal(db, id, src);
      dbg('[approve.row]', row);
      const { points } = deriveAmount(row);
      await addLedgerIfAvailable(db, {
        accountId: row.account_id,
        pointsDelta: -Math.abs(points),
        note: `Withdrawal #${id} approved`,
        adminUserId: decidedBy || null,
      });

      // enqueue notification (best-effort, with lookup logging)
      try {
        const { email, userId } = await lookupEmailForNotificationLogged(db, {
          accountId: row.account_id,
          withdrawalId: id,
          source: src
        });

        dbg('[enqueue.approve]', { id, email, userId });
        await enqueueNotification(db, {
          userId,
          accountId: row.account_id,
          kind: 'withdrawal_approved',
          email,
          payload: {
            withdrawalId: id,
            accountId: row.account_id,
            points: points,
            eur: row.eur || null,
            decidedBy: decidedBy || null,
            decidedAt: new Date().toISOString(),
            source: src
          }
        });
      } catch (ee) {
        console.error('[notify.error.approve]', { id, err: ee.message });
      }

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
      const forceSrc = (req.query?.source || req.body?.source || "").toString().toLowerCase();
      let src = (forceSrc === "admin" || forceSrc === "customer") ? forceSrc : null;
      if (!src) src = await findWithdrawalSource(db, id);

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
      const forceSrc = (req.query?.source || req.body?.source || "").toString().toLowerCase();
      let src = (forceSrc === "admin" || forceSrc === "customer") ? forceSrc : null;
      if (!src) src = await findWithdrawalSource(db, id);

      dbg('[paid.start]', { id, src, forceSrc, payoutRef });
      if (!src) {
        return res
          .status(404)
          .json({ success: false, error: { code: "NOT_FOUND", message: "Withdrawal not found" } });
      }
      const t = targetSqlForAction(src, "paid")(paidAt, payoutRef, id);
      await run(db, t.sql, t.params);

      const fresh = await getUnifiedWithdrawal(db, id, src);
      dbg('[paid.row]', fresh);

      // enqueue notification (best-effort, with lookup logging)
      try {
        const { email, userId, accountId } = await lookupEmailForNotificationLogged(db, {
          accountId: fresh.account_id,
          withdrawalId: id,
          source: src
        });

        dbg('[enqueue.paid]', { id, email, userId, accountId, payoutRef: fresh.payout_ref || payoutRef || null });
        await enqueueNotification(db, {
          userId,
          accountId,
          kind: 'withdrawal_paid',
          email,
          payload: {
            withdrawalId: id,
            accountId,
            points: fresh.points,
            eur: fresh.eur || null,
            payoutRef: fresh.payout_ref || payoutRef || null,
            paidAt: new Date().toISOString(),
            source: src
          }
        });
      } catch (ee) {
        console.error('[notify.error.paid]', { id, err: ee.message });
      }

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
