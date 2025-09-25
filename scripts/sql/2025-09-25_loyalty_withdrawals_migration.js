#!/usr/bin/env node
/**
 * Phase 5.4 migration (compat) — idempotent
 * - Converges on Option A: decision_note, payout_ref (and keeps prior columns if they exist)
 * - Skips created_at index if column not present; adds it if you want a timestamp going forward
 * - Upgrades loyalty_ledger and notifications_queue in-place by adding missing columns
 */
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const ROOT = process.env.ROOT || process.cwd();
const DB_PATH = process.env.DB_PATH_USERS || process.env.SQLITE_DB || path.join(ROOT, "data/dev/wattsun.dev.db");
const db = new sqlite3.Database(DB_PATH);

function getCols(table){return new Promise((res,rej)=>db.all(`PRAGMA table_info(${table});`,(e,rows)=>e?rej(e):res(rows.map(r=>r.name))));}
function hasCol(cols,name){return cols.includes(name);}
function run(sql,params=[]){return new Promise((res,rej)=>db.run(sql,params,function(e){e?rej(e):res(true);}));}
function idxExists(name){return new Promise((res,rej)=>db.get(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`,[name],(e,row)=>e?rej(e):res(!!row)));}

(async()=>{
  try{
    if(!fs.existsSync(DB_PATH)){console.error(`[migration] DB not found ${DB_PATH}`);process.exit(2);}
    console.log(`[migration] DB = ${DB_PATH}`);

    // --- withdrawals (existing legacy shape) ---
    await run(`CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      eur INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending',
      requested_at TEXT,
      decided_at TEXT,
      paid_at TEXT,
      note TEXT
    );`);

    let cols = await getCols("withdrawals");

    // Option-A audit columns (add if missing)
    if(!hasCol(cols,"decided_by")) await run(`ALTER TABLE withdrawals ADD COLUMN decided_by INTEGER`);
    cols = await getCols("withdrawals");
    if(!hasCol(cols,"decision_note")) await run(`ALTER TABLE withdrawals ADD COLUMN decision_note TEXT`);
    cols = await getCols("withdrawals");
    if(!hasCol(cols,"payout_ref")) await run(`ALTER TABLE withdrawals ADD COLUMN payout_ref TEXT`);
    cols = await getCols("withdrawals");

    // If your earlier run added Option-B columns, keep them; we won't drop anything.
    // Index on status (safe)
    if(!(await idxExists("idx_withdrawals_status"))){
      await run(`CREATE INDEX idx_withdrawals_status ON withdrawals(status)`);
    }

    // Create created_at only if you want it; otherwise skip the index quietly
    if(!hasCol(cols,"created_at")){
      // Optional: comment next line if you prefer NOT to add created_at
      await run(`ALTER TABLE withdrawals ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP`);
      cols = await getCols("withdrawals");
    }
    if(hasCol(cols,"created_at") && !(await idxExists("idx_withdrawals_created"))){
      await run(`CREATE INDEX idx_withdrawals_created ON withdrawals(created_at)`);
    }
    if(hasCol(cols,"user_id") && !(await idxExists("idx_withdrawals_user"))){
      await run(`CREATE INDEX idx_withdrawals_user ON withdrawals(user_id)`);
    }

    // --- loyalty_ledger (add missing cols for Phase 5.4) ---
    await run(`CREATE TABLE IF NOT EXISTS loyalty_ledger (
      id INTEGER PRIMARY KEY
    );`);
    let ll = await getCols("loyalty_ledger");
    const ensureLL = async (name, ddl) => { if(!hasCol(ll,name)){ await run(`ALTER TABLE loyalty_ledger ADD COLUMN ${ddl}`); ll = await getCols("loyalty_ledger"); } };
    // Minimal superset used by routes:
    await ensureLL("user_id","user_id INTEGER");
    await ensureLL("account_id","account_id INTEGER");
    await ensureLL("ref_type","ref_type TEXT");          // e.g. 'WITHDRAWAL'
    await ensureLL("ref_id","ref_id INTEGER");           // withdrawal.id
    await ensureLL("entry_type","entry_type TEXT");      // e.g. 'WITHDRAWAL_APPROVED'
    await ensureLL("amount_cents","amount_cents INTEGER DEFAULT 0"); // positive magnitude
    await ensureLL("points_delta","points_delta INTEGER DEFAULT 0"); // for legacy points-based ledgers
    await ensureLL("note","note TEXT");
    await ensureLL("created_at","created_at TEXT DEFAULT CURRENT_TIMESTAMP");

    // --- notifications_queue (add missing cols used by templates/queue worker) ---
    await run(`CREATE TABLE IF NOT EXISTS notifications_queue (id INTEGER PRIMARY KEY);`);
    let nq = await getCols("notifications_queue");
    const ensureNQ = async (name, ddl) => { if(!hasCol(nq,name)){ await run(`ALTER TABLE notifications_queue ADD COLUMN ${ddl}`); nq = await getCols("notifications_queue"); } };
    await ensureNQ("user_id","user_id INTEGER");
    await ensureNQ("channel","channel TEXT DEFAULT 'email'");
    await ensureNQ("template","template TEXT");           // 'withdrawal_approved' | ...
    await ensureNQ("to","\"to\" TEXT");                   // email (nullable)
    await ensureNQ("payload_json","payload_json TEXT");   // serialized JSON
    await ensureNQ("status","status TEXT DEFAULT 'queued'");
    await ensureNQ("created_at","created_at TEXT DEFAULT CURRENT_TIMESTAMP");

    if(!(await idxExists("idx_nq_status"))){ await run(`CREATE INDEX idx_nq_status ON notifications_queue(status)`); }
    if(!(await idxExists("idx_nq_user"))){ await run(`CREATE INDEX idx_nq_user ON notifications_queue(user_id)`); }

    console.log("[migration] done");
    process.exit(0);
  }catch(e){
    console.error("[migration] ERROR", e);
    process.exit(1);
  }finally{
    db.close();
  }
})();
