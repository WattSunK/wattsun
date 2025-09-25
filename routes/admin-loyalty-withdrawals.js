/**
 * routes/admin-loyalty-withdrawals.js (compat, sanitized)
 * - Option A: decision_note / payout_ref
 * - Legacy-compatible:
 *     withdrawals(points/eur),
 *     loyalty_ledger(kind, points_delta, note [, account_id NOT NULL]),
 *     notifications_queue(kind, payload, status, user_id, email)
 * - Admin endpoints: GET list + PATCH approve/reject/mark-paid
 */

const path = require("path");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

/* -------------------------- Core utilities -------------------------- */

function dbPath() {
  const ROOT = process.env.ROOT || process.cwd();
  return process.env.DB_PATH_USERS || process.env.SQLITE_DB || path.join(ROOT, "data/dev/wattsun.dev.db");
}
function openDb() { return new sqlite3.Database(dbPath()); }
const nowISO = () => new Date().toISOString();
const adminId = (req) => req?.session?.user?.id || 0;

function q(db, sql, p = []) {
  return new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
}
function run(db, sql, p = []) {
  return new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(true); }));
}
function lastId(db, sql, p = []) {
  return new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this.lastID); }));
}
function tableCols(db, table) {
  return new Promise((res, rej) => db.all(`PRAGMA table_info(${table});`, (e, rows) => e ? rej(e) : res(rows.map(r => r.name))));
}
async function columnInfo(db, table) {
  const rows = await new Promise((resolve, reject) =>
    db.all(`PRAGMA table_info(${table});`, (e, r) => e ? reject(e) : resolve(r || []))
  );
  const map = {};
  rows.forEach(r => { map[r.name] = { notnull: r.notnull, dflt: r.dflt_value, type: r.type }; });
  return map;
}

/* --------------------------- Data helpers --------------------------- */

async function getWithdrawal(db, id) {
  return q(db, `SELECT * FROM withdrawals WHERE id=?`, [id]);
}

// derive a canonical amount for notifications; legacy tables use points/eur
function deriveAmount(w) {
  if ("amount_cents" in w && Number.isInteger(w.amount_cents)) {
    return { amountCents: Math.abs(w.amount_cents), points: null, eur: null };
  }
  const pts = Number.isInteger(w.points) ? Math.abs(w.points) : null;
  const eur = Number.isInteger(w.eur) ? Math.abs(w.eur) : null;
  const amountCents = (eur != null) ? eur : (pts != null ? pts : 0);
  return { amountCents, points: pts, eur };
}

// Detect available columns on loyalty_ledger / notifications_queue
async function ledgerSupports(db) {
  const cols = await tableCols(db, "loyalty_ledger");
  return { cols, has: (c) => cols.includes(c) };
}
async function notificationsSupports(db) {
  const cols = await tableCols(db, "notifications_queue");
  return { cols, has: (c) => cols.includes(c) };
}

/* ----------------------- Ledger + notifications ---------------------- */

function mapEntryTypeToKind(entryType) {
  switch (entryType) {
    case "WITHDRAWAL_APPROVED": return "withdraw_approved";
    case "WITHDRAWAL_REJECTED": return "withdraw_rejected";
    case "WITHDRAWAL_PAID":     return "withdraw_paid";
    default:                    return (entryType || "misc").toLowerCase();
  }
}

async function ledgerExists(db, refId, entryType) {
  const sup = await ledgerSupports(db);

  // Modern shape
  if (sup.has("entry_type") && sup.has("ref_id") && sup.has("ref_type")) {
    const row = await q(db,
      `SELECT id FROM loyalty_ledger
       WHERE ref_type='WITHDRAWAL' AND ref_id=? AND entry_type=?`,
      [refId, entryType]
    );
    return !!row;
  }

  // Legacy shape: kind/note; best-effort dedupe via note “ref:ID”
  if (sup.has("kind") && sup.has("note")) {
    const kind = mapEntryTypeToKind(entryType);
    try {
      const row = await q(db,
        `SELECT id FROM loyalty_ledger WHERE kind=? AND note LIKE ?`,
        [kind, `%ref:${refId}%`]
      );
      return !!row;
    } catch {
      return false; // don't block inserts on uncertainty
    }
  }

  return false;
}

/* --------- Surgical inserts: account resolver for NOT NULL ---------- */

// Return true if table exists
async function tableExists(db, name) {
  const row = await q(db, `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [name]);
  return !!row;
}

// Safe single-ID selector for an accounts-like table without assuming column names beyond "id" and "user_id".
async function pickAnyAccountId(db, table, hasIsPrimary) {
  try {
    if (hasIsPrimary) {
      // prefer primary if that column exists
      const row = await q(db, `SELECT id FROM ${table} WHERE user_id=? ORDER BY is_primary DESC, id ASC LIMIT 1`, [/* user_id injected by caller */]);
      return row?.id ?? null;
    }
    // fallback: just pick the first by id
    const row = await q(db, `SELECT id FROM ${table} WHERE user_id=? ORDER BY id ASC LIMIT 1`, [/* user_id injected by caller */]);
    return row?.id ?? null;
  } catch { return null; }
}

// Best-effort account resolver: withdrawal.account_id -> user's primary -> any account -> 0
async function resolveAccountId(db, w) {
  if (w && w.account_id != null) return w.account_id;

  // candidates with introspection (do not reference columns that don't exist)
  const candidates = [
    "loyalty_accounts",
    "accounts",
    "account",
  ];

  for (const table of candidates) {
    if (await tableExists(db, table)) {
      const cols = await tableCols(db, table);
      const hasUserId = cols.includes("user_id");
      const hasIsPrimary = cols.includes("is_primary");
      if (!hasUserId) continue; // can't filter by user

      // try primary if available, otherwise first by id
      try {
        if (hasIsPrimary) {
          const row = await q(db, `SELECT id FROM ${table} WHERE user_id=? ORDER BY is_primary DESC, id ASC LIMIT 1`, [w.user_id]);
          if (row && row.id != null) return row.id;
        }
        const row2 = await q(db, `SELECT id FROM ${table} WHERE user_id=? ORDER BY id ASC LIMIT 1`, [w.user_id]);
        if (row2 && row2.id != null) return row2.id;
      } catch { /* ignore and continue */ }
    }
  }

  // user_accounts join table variant (account_id column)
  if (await tableExists(db, "user_accounts")) {
    const cols = await tableCols(db, "user_accounts");
    const hasUserId = cols.includes("user_id");
    const hasAccountId = cols.includes("account_id");
    const hasIsPrimary = cols.includes("is_primary");
    if (hasUserId && hasAccountId) {
      try {
        if (hasIsPrimary) {
          const row3 = await q(db, `SELECT account_id AS id FROM user_accounts WHERE user_id=? ORDER BY is_primary DESC, account_id ASC LIMIT 1`, [w.user_id]);
          if (row3 && row3.id != null) return row3.id;
        }
        const row4 = await q(db, `SELECT account_id AS id FROM user_accounts WHERE user_id=? ORDER BY account_id ASC LIMIT 1`, [w.user_id]);
        if (row4 && row4.id != null) return row4.id;
      } catch { /* ignore */ }
    }
  }

  return 0; // final fallback: satisfy NOT NULL without being NULL
}

async function insertLedger(db, w, refId, entryType, note) {
  const sup = await ledgerSupports(db);
  const { amountCents } = deriveAmount(w);

  // Modern shape
  if (sup.has("user_id") && sup.has("account_id") &&
      sup.has("ref_type") && sup.has("ref_id") &&
      sup.has("entry_type") && sup.has("amount_cents")) {
    return lastId(db,
      `INSERT INTO loyalty_ledger (user_id, account_id, ref_type, ref_id, entry_type, amount_cents, note)
       VALUES (?, ?, 'WITHDRAWAL', ?, ?, ?, ?)`,
      [w.user_id || null, w.account_id || null, refId, entryType, Math.abs(amountCents || 0), note || null]
    );
  }

  // Legacy shape (your DB): kind/points_delta/note/(optional account_id, admin_user_id)
  if (sup.has("kind") || sup.has("points_delta") || sup.has("note")) {
    const cols = [];
    const vals = [];
    const ph   = [];

    const kind = mapEntryTypeToKind(entryType);
    const legacyNote = `${note || entryType} (ref:${refId})`;

    // NOT NULL awareness for account_id
    const info = await columnInfo(db, "loyalty_ledger");

    if (sup.has("kind"))         { cols.push("kind");         vals.push(kind);               ph.push("?"); }
    if (sup.has("account_id")) {
      const mustNotNull = info.account_id?.notnull === 1;
      if (mustNotNull) {
        const acctId = await resolveAccountId(db, w);
        cols.push("account_id"); vals.push(acctId);           ph.push("?");
      } else if (w.account_id != null) {
        cols.push("account_id"); vals.push(w.account_id);     ph.push("?");
      }
    }
    if (sup.has("points_delta")) { cols.push("points_delta"); vals.push(0);                  ph.push("?"); }
    if (sup.has("note"))         { cols.push("note");         vals.push(legacyNote);         ph.push("?"); }
    if (sup.has("admin_user_id")){ cols.push("admin_user_id");vals.push(null);               ph.push("?"); }

    const sql = `INSERT INTO loyalty_ledger (${cols.join(",")}) VALUES (${ph.join(",")})`;
    return lastId(db, sql, vals);
  }

  // Absolute fallback
  return lastId(db, `INSERT INTO loyalty_ledger (note) VALUES (?)`, [note || entryType]);
}

async function getUserContact(db, userId) {
  return new Promise((resolve) =>
    db.get(`SELECT id,name,email,phone FROM users WHERE id=?`, [userId], (e, r) => {
      if (e || !r) return resolve({ id: userId, email: null, phone: null, name: null });
      resolve({ id: r.id, name: r.name || null, email: r.email || null, phone: r.phone || null });
    })
  );
}

async function enqueueNotification(db, userId, template, toEmail, payload) {
  const sup = await notificationsSupports(db);

  // Modern shape (template/payload_json)
  if (sup.has("template") && sup.has("payload_json")) {
    return lastId(db,
      `INSERT INTO notifications_queue (user_id, channel, template, "to", payload_json, status)
       VALUES (?, 'email', ?, ?, ?, 'queued')`,
      [userId || null, template, toEmail || null, JSON.stringify(payload || {})]
    );
  }

  // Legacy shape (your DB): kind/user_id/email/payload/status
  if (sup.has("kind") && sup.has("payload")) {
    return lastId(db,
      `INSERT INTO notifications_queue (kind, user_id, email, payload, status)
       VALUES (?, ?, ?, ?, 'Queued')`,
      [template, userId || null, toEmail || null, JSON.stringify(payload || {})]
    );
  }

  // Fallback
  if (sup.has("payload")) {
    return lastId(db,
      `INSERT INTO notifications_queue (payload) VALUES (?)`,
      [JSON.stringify({ template, toEmail, ...(payload || {}) })]
    );
  }
  return Promise.resolve(-1);
}

/* ------------------------------ Handlers ----------------------------- */

function ok(res, body) { return res.json({ success: true, ...body }); }
function fail(res, code, message, http = 400) { return res.status(http).json({ success: false, error: { code, message } }); }

async function handleApprove(req, res) {
  const id = +req.params.id; const db = openDb(); const decidedBy = adminId(req);
  try {
    const w = await getWithdrawal(db, id); if (!w) return fail(res, "NOT_FOUND", "Withdrawal not found", 404);
    if (w.status === "Approved") return ok(res, { noOp: true, withdrawal: { id: w.id, status: w.status }, message: "Already approved" });
    if (w.status === "Rejected" || w.status === "Paid") return fail(res, "INVALID_STATE", `Cannot approve a ${w.status} withdrawal`, 409);

    const stamp = nowISO();
    await run(db, `UPDATE withdrawals SET status='Approved', decided_at=?, decided_by=?, decision_note=NULL WHERE id=?`,
      [stamp, decidedBy, id]);

    if (!(await ledgerExists(db, id, "WITHDRAWAL_APPROVED"))) {
      await insertLedger(db, w, id, "WITHDRAWAL_APPROVED", "Withdrawal approved");
    }

    const user = await getUserContact(db, w.user_id);
    const { amountCents, points, eur } = deriveAmount(w);
    await enqueueNotification(db, user.id, "withdrawal_approved", user.email, {
      withdrawalId: id, accountId: w.account_id || null, amountCents, points, eur, decidedAt: stamp
    });

    return ok(res, {
      withdrawal: { id, status: "Approved", decidedAt: stamp, decidedBy },
      ledger: { appended: true, type: "WITHDRAWAL_APPROVED" },
      notification: { queued: true, template: "withdrawal_approved" },
      message: "Withdrawal approved"
    });
  } catch (e) { return fail(res, "SERVER_ERROR", e.message, 500); } finally { db.close(); }
}

async function handleReject(req, res) {
  const id = +req.params.id; const db = openDb(); const decidedBy = adminId(req);
  const note = (req.body?.note || "").toString().trim();
  try {
    const w = await getWithdrawal(db, id); if (!w) return fail(res, "NOT_FOUND", "Withdrawal not found", 404);
    if (w.status === "Rejected") return ok(res, { noOp: true, withdrawal: { id: w.id, status: w.status }, message: "Already rejected" });
    if (w.status === "Paid") return fail(res, "INVALID_STATE", "Cannot reject a Paid withdrawal", 409);

    const stamp = nowISO();
    await run(db, `UPDATE withdrawals SET status='Rejected', decided_at=?, decided_by=?, decision_note=? WHERE id=?`,
      [stamp, decidedBy, note || null, id]);

    if (!(await ledgerExists(db, id, "WITHDRAWAL_REJECTED"))) {
      await insertLedger(db, w, id, "WITHDRAWAL_REJECTED", note ? `Rejected: ${note}` : "Rejected");
    }

    const user = await getUserContact(db, w.user_id);
    const { amountCents, points, eur } = deriveAmount(w);
    await enqueueNotification(db, user.id, "withdrawal_rejected", user.email, {
      withdrawalId: id, accountId: w.account_id || null, amountCents, points, eur, decidedAt: stamp, reason: note || null
    });

    return ok(res, {
      withdrawal: { id, status: "Rejected", decidedAt: stamp, decidedBy, decisionNote: note || null },
      ledger: { appended: true, type: "WITHDRAWAL_REJECTED" },
      notification: { queued: true, template: "withdrawal_rejected" },
      message: "Withdrawal rejected"
    });
  } catch (e) { return fail(res, "SERVER_ERROR", e.message, 500); } finally { db.close(); }
}

async function handleMarkPaid(req, res) {
  const id = +req.params.id; const db = openDb();
  const payoutRef = (req.body?.payoutRef || "").toString().trim();
  const paidAt = (req.body?.paidAt || nowISO()).toString();
  try {
    const w = await getWithdrawal(db, id); if (!w) return fail(res, "NOT_FOUND", "Withdrawal not found", 404);
    if (w.status === "Paid") return ok(res, { noOp: true, withdrawal: w, message: "Already Paid" });
    if (w.status !== "Approved") return fail(res, "INVALID_STATE", `Must be Approved to mark Paid (is ${w.status})`, 409);

    await run(db, `UPDATE withdrawals SET status='Paid', paid_at=?, payout_ref=? WHERE id=?`,
      [paidAt, payoutRef || null, id]);

    if (!(await ledgerExists(db, id, "WITHDRAWAL_PAID"))) {
      await insertLedger(db, w, id, "WITHDRAWAL_PAID", payoutRef ? `Paid: ${payoutRef}` : "Paid");
    }

    const user = await getUserContact(db, w.user_id);
    const { amountCents, points, eur } = deriveAmount(w);
    await enqueueNotification(db, user.id, "withdrawal_paid", user.email, {
      withdrawalId: id, accountId: w.account_id || null, amountCents, points, eur, paidAt, payoutRef: payoutRef || null
    });

    return ok(res, {
      withdrawal: { id, status: "Paid", paidAt, payoutRef: payoutRef || null },
      ledger: { appended: true, type: "WITHDRAWAL_PAID" },
      notification: { queued: true, template: "withdrawal_paid" },
      message: "Withdrawal marked as Paid"
    });
  } catch (e) { return fail(res, "SERVER_ERROR", e.message, 500); } finally { db.close(); }
}

/* ------------------------------ Routes ------------------------------ */

// Admin list (mounted under /api/admin)
router.get("/loyalty/withdrawals", async (req, res) => {
  const db = openDb();
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || "10", 10)));
    const status = (req.query.status || "").trim();
    const qy = (req.query.q || "").trim();

    const where = [];
    const params = [];

    if (status && status !== "All") { where.push("status = ?"); params.push(status); }
    if (qy) { where.push("(CAST(id AS TEXT) LIKE ? OR CAST(user_id AS TEXT) LIKE ?)"); params.push(`%${qy}%`, `%${qy}%`); }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const offset = (page - 1) * limit;

    const sql = `
      SELECT id, user_id, points, eur, status,
             requested_at, decided_at, paid_at,
             decision_note, decided_by, payout_ref
      FROM withdrawals
      ${whereSql}
      ORDER BY id DESC
      LIMIT ? OFFSET ?;
    `;
    const rows = await new Promise((resolve, reject) => {
      db.all(sql, [...params, limit, offset], (err, r) => err ? reject(err) : resolve(r || []));
    });

    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: e.message } });
  } finally {
    db.close();
  }
});

// Spec PATCH routes
router.patch("/loyalty/withdrawals/:id/approve", handleApprove);
router.patch("/loyalty/withdrawals/:id/reject", handleReject);
router.patch("/loyalty/withdrawals/:id/mark-paid", handleMarkPaid);

// Backward-compat POST routes
router.post("/loyalty/withdrawals/:id/decision", (req, res) => (req.body?.approve ? handleApprove(req, res) : handleReject(req, res)));
router.post("/loyalty/withdrawals/:id/mark-paid", handleMarkPaid);

module.exports = router;
