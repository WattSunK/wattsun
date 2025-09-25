/**
 * routes/admin-loyalty-withdrawals.js (compat)
 * - Option A: decision_note / payout_ref
 * - Works with legacy withdrawals(points/eur) OR newer amount_cents
 * - Works with legacy loyalty_ledger (points_delta) OR newer (amount_cents + entry_type)
 * - Works with minimal notifications_queue by adding missing columns in the migration
 */
const path = require("path");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const router = express.Router();
router.use(express.json()); router.use(express.urlencoded({ extended: true }));

function dbPath(){ const ROOT=process.env.ROOT||process.cwd(); return process.env.DB_PATH_USERS||process.env.SQLITE_DB||path.join(ROOT,"data/dev/wattsun.dev.db"); }
function openDb(){ return new sqlite3.Database(dbPath()); }
const nowISO = ()=>new Date().toISOString();
const adminId = (req)=>req?.session?.user?.id||0;

function q(db,sql,p=[]){return new Promise((res,rej)=>db.get(sql,p,(e,r)=>e?rej(e):res(r||null))); }
function run(db,sql,p=[]){return new Promise((res,rej)=>db.run(sql,p,function(e){e?rej(e):res(true);})); }
function lastId(db,sql,p=[]){return new Promise((res,rej)=>db.run(sql,p,function(e){e?rej(e):res(this.lastID);})); }
function tableCols(db,table){ return new Promise((res,rej)=>db.all(`PRAGMA table_info(${table});`,(e,rows)=>e?rej(e):res(rows.map(r=>r.name)))); }

async function getWithdrawal(db,id){
  return q(db,`SELECT * FROM withdrawals WHERE id=?`,[id]);
}

// derive amount for ledger/notifications (prefers amount_cents if present)
function deriveAmount(w){
  if("amount_cents" in w && Number.isInteger(w.amount_cents)) return { amountCents: Math.abs(w.amount_cents), points: null, eur: null };
  // legacy: points/eur integers
  const pts = Number.isInteger(w.points)? Math.abs(w.points): null;
  const eur = Number.isInteger(w.eur)? Math.abs(w.eur): null;
  // pick one canonical cents for unified notifications (assume eur is in cents already if legacy used cents)
  const amountCents = (eur!=null)? eur : (pts!=null? pts : 0);
  return { amountCents, points: pts, eur };
}

async function ledgerSupports(db){
  const cols = await tableCols(db,"loyalty_ledger");
  return {
    hasEntryType: cols.includes("entry_type"),
    hasRefType: cols.includes("ref_type"),
    hasRefId: cols.includes("ref_id"),
    hasAmountCents: cols.includes("amount_cents"),
    hasPointsDelta: cols.includes("points_delta"),
    hasNote: cols.includes("note"),
    hasUserId: cols.includes("user_id"),
    hasAccountId: cols.includes("account_id"),
  };
}

async function notificationsSupports(db){
  const cols = await tableCols(db,"notifications_queue");
  return {
    hasTemplate: cols.includes("template"),
    hasTo: cols.includes("to"),
    hasPayload: cols.includes("payload_json"),
    hasStatus: cols.includes("status"),
    hasUserId: cols.includes("user_id"),
  };
}

async function ledgerExists(db, refId, entryType){
  const sup = await ledgerSupports(db);
  if(!sup.hasEntryType || !sup.hasRefId) return false;
  const row = await q(db,
    `SELECT id FROM loyalty_ledger WHERE ref_type='WITHDRAWAL' AND ref_id=? AND entry_type=?`,
    [refId, entryType]
  );
  return !!row;
}

async function insertLedger(db, w, refId, entryType, note){
  const sup = await ledgerSupports(db);
  const { amountCents, points } = deriveAmount(w);
  // prefer new shape
  if(sup.hasEntryType && sup.hasRefType && sup.hasRefId && sup.hasAmountCents){
    return lastId(db,
      `INSERT INTO loyalty_ledger (user_id, account_id, ref_type, ref_id, entry_type, amount_cents, note)
       VALUES (?, ?, 'WITHDRAWAL', ?, ?, ?, ?)`,
      [w.user_id || null, w.account_id || null, refId, entryType, Math.abs(amountCents||0), note||null]
    );
  }
  // fallback legacy points ledger
  if(sup.hasPointsDelta){
    return lastId(db,
      `INSERT INTO loyalty_ledger (user_id, account_id, points_delta, note)
       VALUES (?, ?, ?, ?)`,
      [w.user_id || null, w.account_id || null, 0, note||(`${entryType}`)]
    );
  }
  // minimal fallback
  return lastId(db, `INSERT INTO loyalty_ledger (note) VALUES (?)`, [note||(`${entryType}`)]);
}

async function getUserContact(db,userId){
  return new Promise((resolve)=>db.get(`SELECT id,name,email,phone FROM users WHERE id=?`,[userId],(e,r)=>{
    if(e||!r) return resolve({id:userId,email:null,phone:null,name:null});
    resolve({id:r.id,email:r.email||null,phone:r.phone||null,name:r.name||null});
  }));
}

async function enqueueNotification(db,userId,template,toEmail,payload){
  const sup = await notificationsSupports(db);
  if(sup.hasTemplate && sup.hasPayload && sup.hasStatus){
    return lastId(db,
      `INSERT INTO notifications_queue (user_id, channel, template, "to", payload_json, status)
       VALUES (?, 'email', ?, ?, ?, 'queued')`,
      [userId||null, template, toEmail||null, JSON.stringify(payload||{})]
    );
  }
  // minimal fallback: just dump payload_json and channel
  return lastId(db,
    `INSERT INTO notifications_queue (user_id, channel, payload_json)
     VALUES (?, 'email', ?)`,
    [userId||null, JSON.stringify({ template, toEmail, ...(payload||{}) })]
  );
}

function ok(res, body){ return res.json({ success:true, ...body }); }
function fail(res, code, message, http=400){ return res.status(http).json({ success:false, error:{code,message} }); }

/* ----------------------------- Handlers ----------------------------- */

async function handleApprove(req,res){
  const id = +req.params.id; const db = openDb(); const decidedBy = adminId(req);
  try{
    const w = await getWithdrawal(db,id); if(!w) return fail(res,"NOT_FOUND","Withdrawal not found",404);
    if(w.status==="Approved") return ok(res,{ noOp:true, withdrawal:{ id:w.id, status:w.status }, message:"Already approved" });
    if(w.status==="Rejected"||w.status==="Paid") return fail(res,"INVALID_STATE",`Cannot approve a ${w.status} withdrawal`,409);

    const stamp = nowISO();
    await run(db, `UPDATE withdrawals SET status='Approved', decided_at=?, decided_by=?, decision_note=NULL WHERE id=?`, [stamp, decidedBy, id]);

    if(!(await ledgerExists(db,id,"WITHDRAWAL_APPROVED"))){
      await insertLedger(db, w, id, "WITHDRAWAL_APPROVED", "Withdrawal approved");
    }

    const user = await getUserContact(db, w.user_id);
    const { amountCents, points, eur } = deriveAmount(w);
    await enqueueNotification(db, user.id, "withdrawal_approved", user.email, {
      withdrawalId:id, accountId:w.account_id||null, amountCents, points, eur, decidedAt:stamp
    });

    return ok(res,{
      withdrawal:{ id, status:"Approved", decidedAt:stamp, decidedBy },
      ledger:{ appended:true, type:"WITHDRAWAL_APPROVED" },
      notification:{ queued:true, template:"withdrawal_approved" },
      message:"Withdrawal approved"
    });
  }catch(e){ return fail(res,"SERVER_ERROR",e.message,500); } finally{ db.close(); }
}

async function handleReject(req,res){
  const id = +req.params.id; const db = openDb(); const decidedBy = adminId(req); const note=(req.body?.note||"").toString().trim();
  try{
    const w = await getWithdrawal(db,id); if(!w) return fail(res,"NOT_FOUND","Withdrawal not found",404);
    if(w.status==="Rejected") return ok(res,{ noOp:true, withdrawal:{ id:w.id, status:w.status }, message:"Already rejected" });
    if(w.status==="Paid") return fail(res,"INVALID_STATE","Cannot reject a Paid withdrawal",409);

    const stamp = nowISO();
    await run(db, `UPDATE withdrawals SET status='Rejected', decided_at=?, decided_by=?, decision_note=? WHERE id=?`,
      [stamp, decidedBy, note||null, id]);

    if(!(await ledgerExists(db,id,"WITHDRAWAL_REJECTED"))){
      await insertLedger(db, w, id, "WITHDRAWAL_REJECTED", note?`Rejected: ${note}`:"Rejected");
    }

    const user = await getUserContact(db, w.user_id);
    const { amountCents, points, eur } = deriveAmount(w);
    await enqueueNotification(db, user.id, "withdrawal_rejected", user.email, {
      withdrawalId:id, accountId:w.account_id||null, amountCents, points, eur, decidedAt:stamp, reason: note||null
    });

    return ok(res,{
      withdrawal:{ id, status:"Rejected", decidedAt:stamp, decidedBy, decisionNote:note||null },
      ledger:{ appended:true, type:"WITHDRAWAL_REJECTED" },
      notification:{ queued:true, template:"withdrawal_rejected" },
      message:"Withdrawal rejected"
    });
  }catch(e){ return fail(res,"SERVER_ERROR",e.message,500); } finally{ db.close(); }
}

async function handleMarkPaid(req,res){
  const id = +req.params.id; const db = openDb(); const payoutRef=(req.body?.payoutRef||"").toString().trim(); const paidAt=(req.body?.paidAt||nowISO()).toString();
  try{
    const w = await getWithdrawal(db,id); if(!w) return fail(res,"NOT_FOUND","Withdrawal not found",404);
    if(w.status==="Paid") return ok(res,{ noOp:true, withdrawal:w, message:"Already Paid" });
    if(w.status!=="Approved") return fail(res,"INVALID_STATE",`Must be Approved to mark Paid (is ${w.status})`,409);

    await run(db, `UPDATE withdrawals SET status='Paid', paid_at=?, payout_ref=? WHERE id=?`,
      [paidAt, payoutRef||null, id]);

    if(!(await ledgerExists(db,id,"WITHDRAWAL_PAID"))){
      await insertLedger(db, w, id, "WITHDRAWAL_PAID", payoutRef?`Paid: ${payoutRef}`:"Paid");
    }

    const user = await getUserContact(db, w.user_id);
    const { amountCents, points, eur } = deriveAmount(w);
    await enqueueNotification(db, user.id, "withdrawal_paid", user.email, {
      withdrawalId:id, accountId:w.account_id||null, amountCents, points, eur, paidAt, payoutRef: payoutRef||null
    });

    return ok(res,{
      withdrawal:{ id, status:"Paid", paidAt, payoutRef: payoutRef||null },
      ledger:{ appended:true, type:"WITHDRAWAL_PAID" },
      notification:{ queued:true, template:"withdrawal_paid" },
      message:"Withdrawal marked as Paid"
    });
  }catch(e){ return fail(res,"SERVER_ERROR",e.message,500); } finally{ db.close(); }
}

/* Spec PATCH routes */
router.patch("/loyalty/withdrawals/:id/approve", handleApprove);
router.patch("/loyalty/withdrawals/:id/reject", handleReject);
router.patch("/loyalty/withdrawals/:id/mark-paid", handleMarkPaid);

/* Backward-compat POST routes */
router.post("/loyalty/withdrawals/:id/decision", (req,res)=> (req.body?.approve? handleApprove(req,res): handleReject(req,res)));
router.post("/loyalty/withdrawals/:id/mark-paid", handleMarkPaid);

module.exports = router;
