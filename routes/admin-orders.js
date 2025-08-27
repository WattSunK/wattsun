// routes/admin-orders.js
// Phase 6.5 — Persist ALL editable fields (status, driver, notes, total/deposit/currency)
// - Adds overlay columns: total_cents, deposit_cents, currency (auto-migrates if missing)
// - PATCH /api/admin/orders/:id now accepts:
//     { status?, driverId?/driver_id?, notes?/note?, totalCents?, depositCents?, currency? }
//   and normalizes legacy { total?, deposit? } (strings like "KSH 7,650" -> cents)
// - Partial update: only fields present in the body are modified
//
// Back-compat preserved with Phase 6.4 behavior. Table lives in Users DB.

const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// --- DB wiring (Users DB is the canonical home of admin overlay) ---
const DB_PATH =
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  "data/dev/wattsun.dev.db";

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("[admin-orders] DB open error:", err.message, "path=", DB_PATH);
  } else {
    console.log("[admin-orders] DB connected:", DB_PATH);
  }
});

// Ensure overlay table exists and columns are present (idempotent)
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

  // Add new columns if they don't exist
  db.all("PRAGMA table_info(admin_order_meta)", (err, rows) => {
    if (err) {
      console.error("[admin-orders] pragma error:", err.message);
      return;
    }
    const have = new Set((rows || []).map((r) => r.name));
    const pending = [];
    if (!have.has("total_cents"))   pending.push(`ALTER TABLE admin_order_meta ADD COLUMN total_cents INTEGER`);
    if (!have.has("deposit_cents")) pending.push(`ALTER TABLE admin_order_meta ADD COLUMN deposit_cents INTEGER`);
    if (!have.has("currency"))      pending.push(`ALTER TABLE admin_order_meta ADD COLUMN currency TEXT`);
    pending.forEach((sql) =>
      db.run(sql, (e) => e && console.error("[admin-orders] migrate add-col error:", e.message, "sql=", sql))
    );
  });
});

// --- Validation helpers ---
const ALLOWED_STATUSES = ["Pending", "Confirmed", "Dispatched", "Delivered", "Closed", "Cancelled"];

function normalizeStatus(input) {
  if (input == null) return input;
  const raw = String(input).trim();
  // legacy → canonical
  const map = { Processing: "Confirmed", Shipped: "Dispatched" };
  return map[raw] || raw;
}
function safeStatus(s) {
  const v = String(s || "").trim();
  return ALLOWED_STATUSES.includes(v) ? v : null;
}
function safeDriverId(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}
function trimOrEmpty(s) {
  return (s == null ? "" : String(s)).trim();
}

function parseCurrency(v) {
  if (v == null) return null;
  let c = String(v).trim().toUpperCase();
  if (c === "KSH") c = "KES";
  const m = c.match(/^[A-Z]{3}$/);
  return m ? c : null;
}

// Convert "KSH 7,650.50", "7,650", 7650, 7650.5 → integer cents
function toCentsLegacy(x) {
  if (x == null || x === "") return null;
  if (typeof x === "number" && Number.isFinite(x)) {
    return Math.round(x * 100);
  }
  const s = String(x).trim();
  // strip currency symbols/letters, keep digits and dot/comma
  let n = s.replace(/[^\d.,-]/g, "");
  // drop thousand separators, keep dot for decimals
  if (n.indexOf(",") > -1 && n.indexOf(".") > -1) {
    n = n.replace(/,/g, "");
  } else {
    n = n.replace(/,/g, "");
  }
  const f = parseFloat(n);
  if (!Number.isFinite(f)) return null;
  return Math.round(f * 100);
}

function pickCentsFromBody(body, keyCamel, keySnake, legacyKey) {
  if (Object.prototype.hasOwnProperty.call(body, keyCamel)) {
    const v = body[keyCamel];
    if (v === null) return { provided: true, value: null };
    const n = Number(v);
    if (!Number.isFinite(n)) return { provided: true, value: null };
    return { provided: true, value: Math.round(n) };
  }
  if (Object.prototype.hasOwnProperty.call(body, keySnake)) {
    const v = body[keySnake];
    if (v === null) return { provided: true, value: null };
    const n = Number(v);
    if (!Number.isFinite(n)) return { provided: true, value: null };
    return { provided: true, value: Math.round(n) };
  }
  if (Object.prototype.hasOwnProperty.call(body, legacyKey)) {
    const cents = toCentsLegacy(body[legacyKey]);
    return { provided: true, value: cents };
  }
  return { provided: false, value: null };
}

// --- PATCH /:id ---
router.patch("/:id", (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ success: false, error: { code: "MISSING_ORDER_ID", message: "Missing order id" } });
  }

  // normalize + validate status
  const statusInput = normalizeStatus(req.body?.status);
  const status = statusInput == null ? null : safeStatus(statusInput);
  if (!status && req.body?.status !== undefined) {
    return res.status(422).json({
      success: false,
      error: { code: "VALIDATION_STATUS_INVALID", message: `Status must be one of: ${ALLOWED_STATUSES.join(", ")}` }
    });
  }

  // driver id (camel or snake)
  const rawDriver = (req.body?.driverId ?? req.body?.driver_id);
  const dId = safeDriverId(rawDriver);
  if (rawDriver !== undefined && Number.isNaN(dId)) {
    return res.status(422).json({
      success: false,
      error: { code: "VALIDATION_DRIVER_ID_INTEGER", message: "Driver ID must be an integer or null" }
    });
  }

  // notes (and legacy 'note')
  const notesProvided = (req.body?.notes !== undefined) || (req.body?.note !== undefined);
  const notes = trimOrEmpty(req.body?.notes ?? req.body?.note ?? "");

  // money & currency
  const totalPick   = pickCentsFromBody(req.body, "totalCents", "total_cents", "total");
  const depositPick = pickCentsFromBody(req.body, "depositCents", "deposit_cents", "deposit");
  const currencyRaw = req.body?.currency;
  const currency    = parseCurrency(currencyRaw);

  const providedStatus    = (req.body?.status !== undefined);
  const providedDriverId  = (rawDriver !== undefined);
  const providedTotal     = totalPick.provided;
  const providedDeposit   = depositPick.provided;
  const providedCurrency  = (currencyRaw !== undefined);

  // STEP 1: does a row already exist?
  db.get("SELECT 1 FROM admin_order_meta WHERE order_id = ?", [id], (selErr, row) => {
    if (selErr) {
      console.error("[admin-orders] select error:", selErr.message);
      return res.status(500).json({ success: false, error: { code: "DB_ERROR", message: "Database error" } });
    }

    if (!row) {
      // INSERT path (first time): default status to "Pending" if omitted
      const statusForInsert  = status || "Pending";
      const driverForInsert  = providedDriverId ? dId : null;
      const notesForInsert   = notesProvided ? notes : "";

      const totalForInsert   = providedTotal   ? totalPick.value   : null;
      const depositForInsert = providedDeposit ? depositPick.value : null;

      // If currency provided and valid use it, else default "KES"
      const currencyForInsert = providedCurrency && currency ? currency : "KES";

      const insertSql = `
        INSERT INTO admin_order_meta
          (order_id, status, driver_id, notes, total_cents, deposit_cents, currency, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `;
      db.run(
        insertSql,
        [id, statusForInsert, driverForInsert, notesForInsert, totalForInsert, depositForInsert, currencyForInsert],
        function (insErr) {
          if (insErr) {
            console.error("[admin-orders] insert error:", insErr.message);
            return res.status(500).json({ success: false, error: { code: "DB_ERROR", message: "Database error" } });
          }
          return res.json({
            success: true,
            order: {
              id,
              status: statusForInsert,
              driverId: driverForInsert,
              notes: notesForInsert,
              totalCents: totalForInsert,
              depositCents: depositForInsert,
              currency: currencyForInsert
            },
            message: "Order updated"
          });
        }
      );
    } else {
      // UPDATE path: change only the fields provided in this PATCH
      const sets = [];
      const args = [];

      if (providedStatus)   { sets.push("status = ?");        args.push(status); }
      if (providedDriverId) { sets.push("driver_id = ?");     args.push(dId);    }
      if (notesProvided)    { sets.push("notes = ?");         args.push(notes);  }
      if (providedTotal)    { sets.push("total_cents = ?");   args.push(totalPick.value); }
      if (providedDeposit)  { sets.push("deposit_cents = ?"); args.push(depositPick.value); }
      if (providedCurrency) { sets.push("currency = ?");      args.push(currency || null); }

      if (sets.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: "EMPTY_UPDATE", message: "Provide at least one of: status, driverId, notes, total/deposit/currency." }
        });
      }

      sets.push("updated_at = datetime('now')");
      args.push(id);

      const updateSql = `UPDATE admin_order_meta SET ${sets.join(", ")} WHERE order_id = ?`;
      db.run(updateSql, args, function (updErr) {
        if (updErr) {
          console.error("[admin-orders] update error:", updErr.message);
          return res.status(500).json({ success: false, error: { code: "DB_ERROR", message: "Database error" } });
        }
        return res.json({
          success: true,
          order: {
            id,
            status:        providedStatus   ? status               : null,
            driverId:      providedDriverId ? dId                  : null,
            notes:         notesProvided    ? notes                : undefined,
            totalCents:    providedTotal    ? totalPick.value      : undefined,
            depositCents:  providedDeposit  ? depositPick.value    : undefined,
            currency:      providedCurrency ? (currency || null)   : undefined
          },
          message: "Order updated"
        });
      });
    }
  });
});

// Tiny ping for sanity checks (optional)
router.get("/_diag/ping", (_req, res) => res.json({ success: true, time: new Date().toISOString() }));

module.exports = router;
