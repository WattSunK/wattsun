// routes/admin-loyalty.js
// Admin endpoints for Loyalty program settings (list + update)

const express = require("express");
const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// ---- DB ------------------------------------------------------
const DB_PATH = process.env.DB_PATH_USERS || process.env.SQLITE_DB || path.join(process.cwd(), "data/dev/wattsun.dev.db");
const db = new sqlite3.Database(DB_PATH);

// ---- authz ---------------------------------------------------
function requireAdmin(req, res, next) {
  const u = req?.session?.user;
  if (!u || (u.type !== "Admin" && u.role !== "Admin")) {
    return res.status(403).json({ success:false, error:{ code:"FORBIDDEN", message:"Admin only" } });
  }
  next();
}
router.use(requireAdmin);

// ---- helpers -------------------------------------------------
function mergeProgramRowset(rows) {
  if (!rows || rows.length === 0) return null;
  const base = {
    programId: rows[0].program_id,
    code: rows[0].code,
    name: rows[0].name,
    active: !!rows[0].active,
    eligibleUserTypes: ["Staff"],
    durationMonths: 6,
    withdrawWaitDays: 90,
    minWithdrawPoints: 100,
    eurPerPoint: 1,
    signupBonus: 100,
  };
  for (const r of rows) {
    if (!r || !r.key) continue;
    let v = r.value;
    try {
      if (/^\s*(\[|\{)/.test(v)) v = JSON.parse(v);
    } catch (_) {}
    if (["durationMonths","withdrawWaitDays","minWithdrawPoints","eurPerPoint","signupBonus"].includes(r.key)) {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) v = n;
    }
    base[r.key] = v;
  }
  return base;
}

function getAllPrograms() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT p.id AS program_id, p.code, p.name, p.active, s.key, s.value
       FROM loyalty_programs p
       LEFT JOIN loyalty_program_settings s ON s.program_id = p.id
       ORDER BY p.id ASC`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        // group by program_id
        const byId = new Map();
        for (const r of rows) {
          if (!byId.has(r.program_id)) byId.set(r.program_id, []);
          byId.get(r.program_id).push(r);
        }
        const list = [];
        for (const [, group] of byId) list.push(mergeProgramRowset(group));
        resolve(list);
      }
    );
  });
}

function getProgramByCode(code) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT p.id AS program_id, p.code, p.name, p.active, s.key, s.value
       FROM loyalty_programs p
       LEFT JOIN loyalty_program_settings s ON s.program_id = p.id
       WHERE p.code = ?`,
      [code],
      (err, rows) => (err ? reject(err) : resolve(mergeProgramRowset(rows)))
    );
  });
}

function upsertSetting(programId, key, value) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loyalty_program_settings (program_id, key, value, updated_at)
       VALUES (?,?,?,datetime('now'))
       ON CONFLICT(program_id,key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      [programId, key, value],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

function setProgramActive(programId, active) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE loyalty_programs SET active=?, updated_at=datetime('now') WHERE id=?`,
      [active ? 1 : 0, programId],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

// ---- routes --------------------------------------------------

// GET /api/admin/loyalty/programs
router.get("/programs", async (req, res) => {
  try {
    const programs = await getAllPrograms();
    return res.json({ success:true, programs });
  } catch (err) {
    console.error("[admin/loyalty/programs]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to load programs" } });
  }
});

// PUT /api/admin/loyalty/programs/:code/settings
router.put("/programs/:code/settings", async (req, res) => {
  try {
    const code = String(req.params.code || "STAFF");
    const current = await getProgramByCode(code);
    if (!current) {
      return res.status(404).json({ success:false, error:{ code:"NOT_FOUND", message:"Program not found" } });
    }

    // Accept partial body
    const {
      eligibleUserTypes,
      durationMonths,
      minWithdrawPoints,
      withdrawWaitDays,
      eurPerPoint,
      signupBonus,
      active
    } = req.body || {};

    // Validate/coerce inputs
    const patches = [];

    if (eligibleUserTypes !== undefined) {
      if (!Array.isArray(eligibleUserTypes) || eligibleUserTypes.some(v => typeof v !== "string")) {
        return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:"eligibleUserTypes must be array of strings" } });
      }
      patches.push(upsertSetting(current.programId, "eligibleUserTypes", JSON.stringify(eligibleUserTypes)));
    }

    function toIntOrNull(v) {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    }

    const intMap = [
      ["durationMonths", durationMonths],
      ["minWithdrawPoints", minWithdrawPoints],
      ["withdrawWaitDays", withdrawWaitDays],
      ["eurPerPoint", eurPerPoint],
      ["signupBonus", signupBonus],
    ];
    for (const [k, v] of intMap) {
      if (v !== undefined) {
        const n = toIntOrNull(v);
        if (n === null) {
          return res.status(400).json({ success:false, error:{ code:"BAD_INPUT", message:`${k} must be integer` } });
        }
        patches.push(upsertSetting(current.programId, k, String(n)));
      }
    }

    if (active !== undefined) {
      const flag = /^(true|1|yes)$/i.test(String(active)) || active === true;
      patches.push(setProgramActive(current.programId, flag));
    }

    await Promise.all(patches);

    const updated = await getProgramByCode(code);
    return res.json({ success:true, program: updated });
  } catch (err) {
    console.error("[admin/loyalty/programs/:code/settings]", err);
    return res.status(500).json({ success:false, error:{ code:"SERVER_ERROR", message:"Unable to update settings" } });
  }
});

module.exports = router;
