/**
 * routes/admin-loyalty-withdrawals.js (compat, sanitized)
 * Option A fields: decision_note / payout_ref
 * Ledger/Notifications are backward-compatible with legacy shapes.
 */

const path = require("path");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

/* ------------------------------------------------------------------ */
/* Basic DB helpers                                                    */
/* ------------------------------------------------------------------ */

function dbPath() {
  const ROOT = process.env.ROOT || process.cwd();
  return process.env.DB_PATH_USERS || process.env.SQLITE_DB || path.join(ROOT, "data/dev/wattsun.dev.db");
}
function openDb() { return new sqlite3.Database(dbPath()); }
const nowISO = () => new Date().toISOString();
const adminId = (req) => req?.session?.user?.id || 0;

function q(db, sql, p = []) { return new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null))); }
function all(db, sql, p = []) { return new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || []))); }
function run(db, sql, p = []) { return new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this.changes || 0); })); }
function lastId(db, sql, p = []) { return new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this.lastID); })); }
function tableCols(db, table) { return new Promise((res, rej) => db.all(`PRAGMA table_info(${table});`, (e, r) => e ? rej(e) : res(r.map(c => c.name)))); }
async function columnInfo(db, table) {
  const rows = await new Promise((resolve, reject) => db.all(`PRAGMA table_info(${table});`, (e, r) => e ? reject(e) : resolve(r || [])));
  const map = {}; rows.forEach(r => map[r.name] = { notnull: r.notnull, dflt: r.dflt_value, type: r.type }); return map;
}
async function tableExists(db, name) { return !!(await q(db, `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [name])); }

/* ------------------------------------------------------------------ */
/* Domain helpers                                                      */
/* ------------------------------------------------------------------ */

async function getWithdrawal(db, id) { return q(db, `SELECT * FROM withdrawals WHERE id=?`, [id]); }

function deriveAmount(w) {
  if ("amount_cents" in w && Number.isInteger(w.amount_cents)) return { amountCents: Math.abs(w.amount_cents), points: null, eur: null };
  const pts = Number.isInteger(w.points) ? Math.abs(w.points) : null;
  const eur = Number.isInteger(w.eur) ? Math.abs(w.eur) : null;
  const amountCents = (eur != null) ? eur : (pts != null ? pts : 0);
  return { amountCents, points: pts, eur };
}

async function ledgerSupports(db) { const cols = await tableCols(db, "loyalty_ledger"); return { cols, has: c => cols.includes(c) }; }
async function notificationsSupports(db) { const cols = await tableCols(db, "notifications_queue"); return { cols, has: c => cols.includes(c) }; }

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
  if (sup.has("entry_type") && sup.has("ref_id") && sup.has("ref_type")) {
    return !!(await q(db,
      `SELECT id FROM loyalty_ledger WHERE ref_type='WITHDRAWAL' AND ref_id=? AND entry_type=?`,
      [refId, entryType]
    ));
  }
  if (sup.has("kind") && sup.has("note")) {
    try {
      return !!(await q(db, `SELECT id FROM loyalty_ledger WHERE kind=? AND note LIKE ?`,
        [mapEntryTypeToKind(entryType), `%ref:${refId}%`]));
    } catch { return false; }
  }
  return false;
}

/* Resolve an account id for legacy NOT NULL account_id on ledger rows */
async function resolveAccountId(db, w) {
  if (w && w.account_id != null) return w.account_id;

  // Prefer loyalty_accounts by user
  if (await tableExists(db, "loyalty_accounts")) {
    const cols = await tableCols(db, "loyalty_accounts");
    if (cols.includes("user_id")) {
      // first row for user (program_id uniqueness ensures one row per program)
      const r = await q(db, `SELECT id FROM loyalty_accounts WHERE user_id=? ORDER BY id ASC LIMIT 1`, [w.user_id]);
      if (r?.id != null) return r.id;
    }
  }

  // Fallbacks (older schemas)
  for (const t of ["accounts", "account"]) {
    if (await tableExists(db, t)) {
      const cols = await tableCols(db, t);
      if (!cols.includes("user_id")) continue;
      const r = await q(db, `SELECT id FROM ${t} WHERE user_id=? ORDER BY id ASC LIMIT 1`, [w.user_id]);
      if (r?.id != null) return r.id;
    }
  }
  if (await tableExists(db, "user_accounts")) {
    const r3 = await q(db, `SELECT account_id AS id FROM user_accounts WHERE user_id=? ORDER BY is_primary DESC, account_id ASC LIMIT 1`, [w.user_id]);
    if (r3?.id != null) return r3.id;
    const r4 = await q(db, `SELECT account_id AS id FROM user_accounts WHERE user_id=? ORDER BY account_id ASC LIMIT 1`, [w.user_id]);
    if (r4?.id != null) return r4.id;
  }
  return 0;
}

/* ---------------------- Accounts roll-up (target: loyalty_accounts) --------------------- */

async function applyPaidRollup(db, accountId, userId, points) {
  // Hard-target the live accounts table & columns you have:
  // loyalty_accounts: points_balance, total_paid, updated_at
  if (!(await tableExists(db, "loyalty_accounts"))) return { table: null, changed: 0 };

  const pts = Number.isFinite(points) ? Math.abs(points) : 0;

  // Update by id (=account) OR user_id (covers both access paths)
  const sql = `
    UPDATE loyalty_accounts
       SET total_paid    = total_paid + 1,
           points_balance = CASE
                              WHEN ? > 0 AND points_balance >= ? THEN points_balance - ?
                              WHEN ? > 0 AND points_balance <  ? THEN 0
                              ELSE points_balance
                            END,
           updated_at    = datetime('now')
     WHERE (id = ? OR user_id = ?)
  `;
  const params = [pts, pts, pts, pts, pts, accountId ?? -1, userId ?? -1];
  const changed = await run(db, sql, params);
  return { table: "loyalty_accounts", changed };
}

/* ---------------- Ledger insert (modern + legacy support) ----------- */

async function insertLedger(db, w, refId, entryType, note) {
  const sup = await ledgerSupports(db);
  const { amountCents } = deriveAmount(w);

  if (sup.has("user_id") && sup.has("account_id") &&
      sup.has("ref_type") && sup.has("ref_id") &&
      sup.has("entry_type") && sup.has("amount_cents")) {
    return lastId(db,
      `INSERT INTO loyalty_ledger (user_id, account_id, ref_type, ref_id, entry_type, amount_cents, note)
       VALUES (?, ?, 'WITHDRAWAL', ?, ?, ?, ?)`,
      [w.user_id || null, w.account_id || null, refId, entryType, Math.abs(amountCents || 0), note || null]
    );
  }

  // Legacy: kind/points_delta/note[/account_id/admin_user_id]
  const cols = await tableCols(db, "loyalty_ledger");
  const info = await columnInfo(db, "loyalty_ledger");

  if (cols.length) {
    const c = [], p = [], qmarks = [];
    const kind = mapEntryTypeToKind(entryType);
    const legacyNote = `${note || entryType} (ref:${refId})`;

    if (cols.includes("kind"))            { c.push("kind");          p.push(kind);                 qmarks.push("?"); }
    if (cols.includes("account_id")) {
      const mustNotNull = info.account_id?.notnull === 1;
      const resolved = (w.account_id != null) ? w.account_id : await resolveAccountId(db, w);
      if (mustNotNull || resolved != null) { c.push("account_id"); p.push(resolved ?? 0); qmarks.push("?"); }
    }

    let delta = 0;
    if (entryType === "WITHDRAWAL_PAID") {
      const pts = Number.isFinite(+w.points) ? Math.abs(+w.points) : 0;
      delta = -pts;
    }
    if (cols.includes("points_delta"))    { c.push("points_delta");  p.push(delta);                qmarks.push("?"); }
    if (cols.includes("note"))            { c.push("note");          p.push(legacyNote);           qmarks.push("?"); }
    if (cols.includes("admin_user_id"))   { c.push("admin_user_id"); p.push(null);                 qmarks.push("?"); }

    if (c.length) return lastId(db, `INSERT INTO loyalty_ledger (${c.join(",")}) VALUES (${qmarks.join(",")})`, p);
  }

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

  if (sup.has("template") && sup.has("payload_json")) {
    return lastId(db,
      `INSERT INTO notifications_queue (user_id, channel, template, "to", payload_json, status)
       VALUES (?, 'email', ?, ?, ?, 'queued')`,
      [userId || null, template, toEmail || null, JSON.stringify(payload || {})]
    );
  }

  if (sup.has("kind") && sup.has("payload")) {
    const cols = ["kind", "user_id", "email", "payload", "status"];
    const vals = [template, userId || null, toEmail || null, JSON.stringify(payload || {}), "Queued"];
    const allCols = await tableCols(db, "notifications_queue");
    if (allCols.includes("account_id")) { cols.push("account_id"); vals.push(payload?.accountId || null); }
    const qms = cols.map(()=>"?").join(",");
    return lastId(db, `INSERT INTO notifications_queue (${cols.join(",")}) VALUES (${qms})`, vals);
  }

  if (sup.has("payload")) {
    return lastId(db, `INSERT INTO notifications_queue (payload) VALUES (?)`,
      [JSON.stringify({ template, toEmail, ...(payload || {}) })]);
  }
  return Promise.resolve(-1);
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                       */
/* ------------------------------------------------------------------ */

const ok = (res, body) => res.json({ success: true, ...body });
const fail = (res, code, message, http = 400) => res.status(http).json({ success: false, error: { code, message } });

/* ------------------------------------------------------------------ */
/* Handlers                                                           */
/* ------------------------------------------------------------------ */

async function handleApprove(req, res) {
  const id = +req.params.id; const db = openDb(); const decidedBy = adminId(req);
  try {
    const w = await getWithdrawal(db, id); if (!w) return fail(res, "NOT_FOUND", "Withdrawal not found", 404);
    if (["Paid","Rejected"].includes(w.status)) return fail(res,"INVALID_STATE",`Cannot approve a ${w.status} withdrawal`,409);
    if (w.status === "Approved") return ok(res, { noOp: true, withdrawal: { id: w.id, status: w.status }, message: "Already approved" });

    if (w.account_id == null) w.account_id = await resolveAccountId(db, w);

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

    res.setHeader("X-Loyalty-Updated", "approve");
    res.setHeader("X-Loyalty-Refresh", "ledger,notifications");

    return ok(res, {
      withdrawal: { id, status: "Approved", decidedAt: stamp, decidedBy },
      ledger: { appended: true, type: "WITHDRAWAL_APPROVED" },
      notification: { queued: true, template: "withdrawal_approved" },
      refresh: { ledger: true, notifications: true },
      message: "Withdrawal approved"
    });
  } catch (e) { return fail(res, "SERVER_ERROR", e.message, 500); } finally { db.close(); }
}

async function handleReject(req, res) {
  const id = +req.params.id; const db = openDb(); const decidedBy = adminId(req);
  const note = (req.body?.note || "").trim();
  try {
    const w = await getWithdrawal(db, id); if (!w) return fail(res, "NOT_FOUND", "Withdrawal not found", 404);
    if (w.status === "Paid") return fail(res, "INVALID_STATE", "Cannot reject a Paid withdrawal", 409);
    if (w.status === "Rejected") return ok(res, { noOp: true, withdrawal: { id: w.id, status: w.status }, message: "Already rejected" });

    if (w.account_id == null) w.account_id = await resolveAccountId(db, w);

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

    res.setHeader("X-Loyalty-Updated", "reject");
    res.setHeader("X-Loyalty-Refresh", "ledger,notifications");

    return ok(res, {
      withdrawal: { id, status: "Rejected", decidedAt: stamp, decidedBy, decisionNote: note || null },
      ledger: { appended: true, type: "WITHDRAWAL_REJECTED" },
      notification: { queued: true, template: "withdrawal_rejected" },
      refresh: { ledger: true, notifications: true },
      message: "Withdrawal rejected"
    });
  } catch (e) { return fail(res, "SERVER_ERROR", e.message, 500); } finally { db.close(); }
}

async function handleMarkPaid(req, res) {
  const id = +req.params.id; const db = openDb();
  const payoutRef = (req.body?.payoutRef || "").trim();
  const paidAt = (req.body?.paidAt || nowISO()).toString();
  try {
    const w = await getWithdrawal(db, id); if (!w) return fail(res, "NOT_FOUND", "Withdrawal not found", 404);
    if (w.status === "Paid") {
      res.setHeader("X-Loyalty-Updated", "mark-paid");
      res.setHeader("X-Loyalty-Refresh", "accounts,ledger,notifications");
      return ok(res, { noOp: true, withdrawal: w, refresh: { accounts:true, ledger:true, notifications:true }, message: "Already Paid" });
    }
    if (w.status !== "Approved") return fail(res, "INVALID_STATE", `Must be Approved to mark Paid (is ${w.status})`, 409);

    if (w.account_id == null) w.account_id = await resolveAccountId(db, w);

    await run(db, `UPDATE withdrawals SET status='Paid', paid_at=?, payout_ref=? WHERE id=?`,
      [paidAt, payoutRef || null, id]);

    let appended = false;
    if (!(await ledgerExists(db, id, "WITHDRAWAL_PAID"))) {
      await insertLedger(db, w, id, "WITHDRAWAL_PAID", payoutRef ? `Paid: ${payoutRef}` : "Paid");
      appended = true;
    }

    // roll-up (loyalty_accounts)
    const pts = Number.isFinite(+w.points) ? Math.abs(+w.points) : 0;
    let accUpdate = { table: null, changed: 0 };
    if (appended) accUpdate = await applyPaidRollup(db, w.account_id, w.user_id, pts);

    const user = await getUserContact(db, w.user_id);
    const { amountCents, points, eur } = deriveAmount(w);
    await enqueueNotification(db, user.id, "withdrawal_paid", user.email, {
      withdrawalId: id, accountId: w.account_id || null, amountCents, points, eur, paidAt, payoutRef: payoutRef || null
    });

    res.setHeader("X-Loyalty-Updated", "mark-paid");
    res.setHeader("X-Loyalty-Refresh", "accounts,ledger,notifications");
    if (accUpdate.table) res.setHeader("X-Accounts-Updated", `${accUpdate.table}:${accUpdate.changed}`);

    return ok(res, {
      withdrawal: { id, status: "Paid", paidAt, payoutRef: payoutRef || null },
      ledger: { appended: appended, type: "WITHDRAWAL_PAID" },
      notification: { queued: true, template: "withdrawal_paid" },
      accountsRollup: accUpdate,
      refresh: { accounts: true, ledger: true, notifications: true },
      message: "Withdrawal marked as Paid"
    });
  } catch (e) { return fail(res, "SERVER_ERROR", e.message, 500); } finally { db.close(); }
}

/* ------------------------------------------------------------------ */
/* Routes                                                             */
/* ------------------------------------------------------------------ */

// Admin-initiated: create a Pending withdrawal linked to loyalty_accounts.id
router.post("/loyalty/withdrawals", async (req, res) => {
  const db = openDb();
  try {
    const accountId = parseInt(req.body?.accountId, 10);
    const points    = parseInt(req.body?.points, 10);
    const note      = (req.body?.note || "").trim();

    if (!Number.isInteger(accountId) || accountId < 1) {
      return fail(res, "BAD_INPUT", "Valid accountId required", 400);
    }
    if (!Number.isInteger(points) || points < 1) {
      return fail(res, "BAD_INPUT", "points must be integer >= 1", 400);
    }

    // 1) Load account + program
    const acct = await q(db, `
      SELECT a.*, p.id AS program_id
      FROM loyalty_accounts a
      JOIN loyalty_programs p ON p.id = a.program_id
      WHERE a.id = ?
    `, [accountId]);
    if (!acct) return fail(res, "NOT_FOUND", "Account not found", 404);
    if (String(acct.status) !== "Active") {
      return fail(res, "ACCOUNT_INACTIVE", "Account is not Active", 400);
    }

    // 2) Program minimum
    const minRow = await q(db, `
      SELECT value AS minPoints
      FROM loyalty_program_settings
      WHERE program_id = ? AND key = 'minWithdrawPoints'
    `, [acct.program_id]).catch(()=>null);
    const minPoints = Number.parseInt(minRow?.minPoints ?? "100", 10);
    if (points < minPoints) {
      return fail(res, "BELOW_MIN", `Minimum withdrawal is ${minPoints} pts`, 400);
    }

    // 3) Balance check (fresh)
    const fresh = await q(db, `SELECT points_balance FROM loyalty_accounts WHERE id=?`, [accountId]);
    const balance = Number.parseInt(fresh?.points_balance ?? "0", 10);
    if (!Number.isFinite(balance) || balance < points) {
      return fail(res, "INSUFFICIENT_BALANCE", `Insufficient balance (${balance} pts)`, 400);
    }

    // 4) Insert Pending withdrawal
    const newId = await lastId(db, `
      INSERT INTO withdrawals (account_id, user_id, points, status, requested_at, note)
      VALUES (?, ?, ?, 'Pending', datetime('now','localtime'), ?)
    `, [accountId, acct.user_id ?? null, points, note || null]);

    const row = await getWithdrawal(db, newId);
    res.setHeader("X-Loyalty-Updated", "create-withdrawal");
    res.setHeader("X-Loyalty-Refresh", "withdrawals");
    return ok(res, { withdrawal: row, message: "Withdrawal created" });
  } catch (e) {
    return fail(res, "SERVER_ERROR", e.message || "Server error", 500);
  } finally {
    db.close();
  }
});

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
      SELECT id, account_id, user_id, points, eur, status,
       requested_at, decided_at, paid_at,
       decision_note, decided_by, payout_ref
        FROM withdrawals

      ${whereSql}
      ORDER BY id DESC
      LIMIT ? OFFSET ?;
    `;
    const rows = await all(db, sql, [...params, limit, offset]);

    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: e.message } });
  } finally {
    db.close();
  }
});

router.patch("/loyalty/withdrawals/:id/approve", handleApprove);
router.patch("/loyalty/withdrawals/:id/reject", handleReject);
router.patch("/loyalty/withdrawals/:id/mark-paid", handleMarkPaid);

// Back-compat POSTs
router.post("/loyalty/withdrawals/:id/decision", (req, res) =>
  (req.body?.approve ? handleApprove(req, res) : handleReject(req, res))
);
router.post("/loyalty/withdrawals/:id/mark-paid", handleMarkPaid);

module.exports = router;
