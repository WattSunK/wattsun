// routes/admin-orders.js
// Minimal, stable router for Phase 6.4/6.5: PATCH /api/admin/orders/:id
// - Validates status ∈ ["Pending","Confirmed","Dispatched","Delivered","Closed","Cancelled"]   // (expanded)
// - driverId is optional (must be an integer if present; null clears it)
// - notes optional (trimmed)
// - Upserts into admin_order_meta (in Users DB)
// No server.js changes required (must be mounted at: /api/admin/orders)

const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();

// Body parsers local to this router (keeps global server untouched)
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

// Ensure overlay table exists (idempotent)
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS admin_order_meta (
       order_id   TEXT PRIMARY KEY,
       status     TEXT NOT NULL,
       driver_id  INTEGER,
       notes      TEXT,
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    (err) => err && console.error("[admin-orders] ensure table error:", err.message)
  );
});

// --- Validation helpers ---
// (EDIT) expanded canonical set
const ALLOWED_STATUSES = ["Pending", "Confirmed", "Dispatched", "Delivered", "Closed", "Cancelled"];

function normalizeStatus(input) {
  if (input == null) return input;
  const raw = String(input).trim();
  // (INSERT) legacy → canonical mapping
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

// --- PATCH /:id ---
router.patch("/:id", (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) {
    // (EDIT) standard error envelope
    return res.status(400).json({ success: false, error: { code: "MISSING_ORDER_ID", message: "Missing order id" } });
  }

  // (EDIT) normalize legacy then validate against canonical set
  const statusInput = normalizeStatus(req.body?.status);
  const status = safeStatus(statusInput);
  if (!status && req.body?.status !== undefined) {
    return res
      .status(422)
      .json({
        success: false,
        error: { code: "VALIDATION_STATUS_INVALID", message: `Status must be one of: ${ALLOWED_STATUSES.join(", ")}` }
      });
  }

  // (EDIT) accept driverId or driver_id, allow numeric strings
  const rawDriver = (req.body?.driverId ?? req.body?.driver_id);
  const dId = safeDriverId(rawDriver);
  if (rawDriver !== undefined && Number.isNaN(dId)) {
    return res.status(422).json({
      success: false,
      error: { code: "VALIDATION_DRIVER_ID_INTEGER", message: "Driver ID must be an integer or null" }
    });
  }

  const notes = trimOrEmpty(req.body?.notes);

  // ==== SURGICAL FIX: partial-update-safe persistence (replaces UPSERT that reset status) ====

  // Determine which fields were actually provided in this PATCH
  const providedStatus   = (req.body?.status !== undefined);
  const providedDriverId = (rawDriver !== undefined);
  const providedNotes    = (req.body?.notes !== undefined);

  // STEP 1: does a row already exist?
  db.get("SELECT 1 FROM admin_order_meta WHERE order_id = ?", [id], (selErr, row) => {
    if (selErr) {
      console.error("[admin-orders] select error:", selErr.message);
      return res.status(500).json({ success:false, error:{ code:"DB_ERROR", message:"Database error" }});
    }

    if (!row) {
      // INSERT path (first time): give status a safe default if omitted
      const statusForInsert = status || "Pending";
      const driverForInsert = providedDriverId ? dId : null;
      const notesForInsert  = providedNotes ? notes : "";

      const insertSql = `
        INSERT INTO admin_order_meta (order_id, status, driver_id, notes, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `;
      db.run(insertSql, [id, statusForInsert, driverForInsert, notesForInsert], function (insErr) {
        if (insErr) {
          console.error("[admin-orders] insert error:", insErr.message);
          return res.status(500).json({ success:false, error:{ code:"DB_ERROR", message:"Database error" }});
        }
        return res.json({
          success: true,
          order: { id, status: statusForInsert, driverId: driverForInsert, notes: notesForInsert },
          message: "Order updated"
        });
      });

    } else {
      // UPDATE path (row exists): update ONLY fields that were provided; preserve others
      const sets = [];
      const args = [];

      if (providedStatus)   { sets.push("status = ?");     args.push(status); }
      if (providedDriverId) { sets.push("driver_id = ?");  args.push(dId);    }
      if (providedNotes)    { sets.push("notes = ?");      args.push(notes);  }

      if (sets.length === 0) {
        return res.status(400).json({
          success:false,
          error:{ code:"EMPTY_UPDATE", message:"Provide at least one of: status, driverId, notes." }
        });
      }

      sets.push("updated_at = datetime('now')");
      args.push(id);

      const updateSql = `UPDATE admin_order_meta SET ${sets.join(", ")} WHERE order_id = ?`;
      db.run(updateSql, args, function (updErr) {
        if (updErr) {
          console.error("[admin-orders] update error:", updErr.message);
          return res.status(500).json({ success:false, error:{ code:"DB_ERROR", message:"Database error" }});
        }
        return res.json({
          success: true,
          order: {
            id,
            // Echo back only what was set this call (so client can merge safely)
            status:  providedStatus   ? status : null,
            driverId: providedDriverId ? dId    : null,
            notes:   providedNotes    ? notes   : undefined
          },
          message: "Order updated"
        });
      });
    }
  });

  // ==== /SURGICAL FIX ========================================================================
});

// Tiny ping for sanity checks (optional)
router.get("/_diag/ping", (_req, res) => res.json({ success: true, time: new Date().toISOString() }));

module.exports = router;
