// routes/admin-orders.js
// Step 6.5 — Persist ALL editable fields (status, driver, notes, total/deposit/currency)
// - Adds overlay columns: total_cents, deposit_cents, currency (idempotent)
// - PATCH /api/admin/orders/:id accepts camel/snake/legacy keys and normalizes legacy totals
// - Partial update: only modifies provided fields

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// ---- DB path hardened (works regardless of process.cwd()) ----
const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(__dirname, "../data/dev/wattsun.dev.db");

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error("[admin-orders] DB open error:", err.message, "path=", DB_PATH);
  else console.log("[admin-orders] DB connected:", DB_PATH);
});

// ---- Ensure overlay table & columns (idempotent) ----
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS admin_order_meta (
       order_id       TEXT PRIMARY KEY,
       status         TEXT NOT NULL,
       driver_id      INTEGER,
       notes          TEXT,
       updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    (err) => err && console.error("[admin-orders] ensure table error:", err.message)
  );
  db.all("PRAGMA table_info(admin_order_meta)", (err, rows) => {
    if (err) { console.error("[admin-orders] pragma error:", err.message); return; }
    const have = new Set((rows || []).map(r => r.name));
    const ddl = [];
    if (!have.has("total_cents"))   ddl.push("ALTER TABLE admin_order_meta ADD COLUMN total_cents INTEGER");
    if (!have.has("deposit_cents")) ddl.push("ALTER TABLE admin_order_meta ADD COLUMN deposit_cents INTEGER");
    if (!have.has("currency"))      ddl.push("ALTER TABLE admin_order_meta ADD COLUMN currency TEXT");
    ddl.forEach(sql => db.run(sql, e => e && console.error("[admin-orders] add-col error:", e.message, "sql=", sql)));
  });
});

// ---- Helpers ----
const ALLOWED_STATUSES = ["Pending", "Confirmed", "Dispatched", "Delivered", "Closed", "Cancelled"];
const normalizeStatus = (s) => {
  if (s == null) return s;
  const map = { Processing: "Confirmed", Shipped: "Dispatched" };
  const v = String(s).trim();
  return map[v] || v;
};
const safeStatus = (s) => (ALLOWED_STATUSES.includes(String(s).trim()) ? String(s).trim() : null);
const safeDriverId = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};
const trimOrEmpty = (s) => (s == null ? "" : String(s)).trim();
const parseCurrency = (v) => {
  if (v == null) return null;
  let c = String(v).trim().toUpperCase();
  if (c === "KSH") c = "KES";
  return /^[A-Z]{3}$/.test(c) ? c : null;
};
function toCentsLegacy(x) {
  if (x == null || x === "") return null;
  if (typeof x === "number" && Number.isFinite(x)) return Math.round(x * 100);
  let s = String(x).trim();
  s = s.replace(/[^\d.,-]/g, "");
  if (s.indexOf(",") > -1 && s.indexOf(".") > -1) s = s.replace(/,/g, "");
  else s = s.replace(/,/g, "");
  const f = parseFloat(s);
  return Number.isFinite(f) ? Math.round(f * 100) : null;
}
function pickCentsFromBody(body, keyCamel, keySnake, legacyKey) {
  if (Object.prototype.hasOwnProperty.call(body, keyCamel)) {
    const v = body[keyCamel];
    if (v === null) return { provided: true, value: null };
    const n = Number(v);
    return { provided: true, value: Number.isFinite(n) ? Math.round(n) : null };
  }
  if (Object.prototype.hasOwnProperty.call(body, keySnake)) {
    const v = body[keySnake];
    if (v === null) return { provided: true, value: null };
    const n = Number(v);
    return { provided: true, value: Number.isFinite(n) ? Math.round(n) : null };
  }
  if (Object.prototype.hasOwnProperty.call(body, legacyKey)) {
    return { provided: true, value: toCentsLegacy(body[legacyKey]) };
  }
  return { provided: false, value: null };
}

// ---- PATCH /api/admin/orders/:id ----
router.patch("/:id", (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ success: false, error: { code: "MISSING_ORDER_ID", message: "Missing order id" } });

  const statusInput = normalizeStatus(req.body?.status);
  const status = statusInput == null ? null : safeStatus(statusInput);
  if (!status && req.body?.status !== undefined) {
    return res.status(422).json({ success: false, error: { code: "VALIDATION_STATUS_INVALID", message: `Status must be one of: ${ALLOWED_STATUSES.join(", ")}` } });
  }

  const rawDriver = (req.body?.driverId ?? req.body?.driver_id);
  const dId = safeDriverId(rawDriver);
  if (rawDriver !== undefined && Number.isNaN(dId)) {
    return res.status(422).json({ success: false, error: { code: "VALIDATION_DRIVER_ID_INTEGER", message: "Driver ID must be an integer or null" } });
  }

  const notesProvided = (req.body?.notes !== undefined) || (req.body?.note !== undefined);
  const notes = trimOrEmpty(req.body?.notes ?? req.body?.note ?? "");

  const totalPick   = pickCentsFromBody(req.body, "totalCents", "total_cents", "total");
  const depositPick = pickCentsFromBody(req.body, "depositCents", "deposit_cents", "deposit");
  const currencyRaw = req.body?.currency;
  const currency    = parseCurrency(currencyRaw);

  const providedStatus    = (req.body?.status !== undefined);
  const providedDriverId  = (rawDriver !== undefined);
  const providedTotal     = totalPick.provided;
  const providedDeposit   = depositPick.provided;
  const providedCurrency  = (currencyRaw !== undefined);

  db.get("SELECT 1 FROM admin_order_meta WHERE order_id = ?", [id], (selErr, row) => {
    if (selErr) { console.error("[admin-orders] select error:", selErr.message); return res.status(500).json({ success: false, error: { code: "DB_ERROR", message: "Database error" } }); }

    if (!row) {
      const statusForInsert  = status || "Pending";
      const driverForInsert  = providedDriverId ? dId : null;
      const notesForInsert   = notesProvided ? notes : "";
      const totalForInsert   = providedTotal   ? totalPick.value   : null;
      const depositForInsert = providedDeposit ? depositPick.value : null;
      const currencyForInsert = providedCurrency && currency ? currency : "KES";

      const insertSql = `
        INSERT INTO admin_order_meta
          (order_id, status, driver_id, notes, total_cents, deposit_cents, currency, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `;
      db.run(insertSql,
        [id, statusForInsert, driverForInsert, notesForInsert, totalForInsert, depositForInsert, currencyForInsert],
        function (insErr) {
          if (insErr) { console.error("[admin-orders] insert error:", insErr.message);
            return res.status(500).json({ success: false, error: { code: "DB_ERROR", message: "Database error" } });
          }
          return res.json({ success: true, order: { id, status: statusForInsert, driverId: driverForInsert, notes: notesForInsert, totalCents: totalForInsert, depositCents: depositForInsert, currency: currencyForInsert }, message: "Order updated" });
        }
      );
    } else {
      const sets = [], args = [];
      if (providedStatus)   { sets.push("status = ?");        args.push(status); }
      if (providedDriverId) { sets.push("driver_id = ?");     args.push(dId);    }
      if (notesProvided)    { sets.push("notes = ?");         args.push(notes);  }
      if (providedTotal)    { sets.push("total_cents = ?");   args.push(totalPick.value); }
      if (providedDeposit)  { sets.push("deposit_cents = ?"); args.push(depositPick.value); }
      if (providedCurrency) { sets.push("currency = ?");      args.push(currency || null); }
      if (sets.length === 0) return res.status(400).json({ success: false, error: { code: "EMPTY_UPDATE", message: "Provide at least one of: status, driverId, notes, total/deposit/currency." } });

      sets.push("updated_at = datetime('now')"); args.push(id);
      const updateSql = `UPDATE admin_order_meta SET ${sets.join(", ")} WHERE order_id = ?`;
      db.run(updateSql, args, function (updErr) {
        if (updErr) { console.error("[admin-orders] update error:", updErr.message); return res.status(500).json({ success: false, error: { code: "DB_ERROR", message: "Database error" } }); }
        return res.json({ success: true, order: {
          id,
          status:        providedStatus   ? status               : null,
          driverId:      providedDriverId ? dId                  : null,
          notes:         notesProvided    ? notes                : undefined,
          totalCents:    providedTotal    ? totalPick.value      : undefined,
          depositCents:  providedDeposit  ? depositPick.value    : undefined,
          currency:      providedCurrency ? (currency || null)   : undefined
        }, message: "Order updated" });
      });
    }
  });
});

router.get("/_diag/ping", (_req, res) => res.json({ success: true, time: new Date().toISOString() }));

module.exports = router;
