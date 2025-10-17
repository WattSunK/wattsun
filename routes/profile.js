// routes/profile.js
// Basic profile resources: addresses, payment methods, email settings (per user)

const express = require('express');
const router = express.Router();

function ensureTables(db){
  try{
    db.prepare(`CREATE TABLE IF NOT EXISTS user_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      label TEXT,
      address TEXT,
      city TEXT,
      isDefault INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS user_payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT, -- e.g., 'Card' | 'M-Pesa'
      mask TEXT,
      meta TEXT, -- JSON payload
      isDefault INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS user_email_settings (
      user_id INTEGER PRIMARY KEY,
      newsletter INTEGER DEFAULT 0,
      order_updates INTEGER DEFAULT 1,
      marketing INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run();
  }catch(e){ console.warn('[profile] ensureTables:', e.message); }
}

function requireUser(req, res){
  const u = req.session?.user;
  if (!u) { res.status(401).json({ success:false, error:'Not logged in' }); return null; }
  return u;
}

// ---------- Addresses ----------
router.get('/profile/addresses', (req, res)=>{
  const db = req.app.get('db'); ensureTables(db);
  const u = requireUser(req, res); if(!u) return;
  const rows = db.prepare('SELECT * FROM user_addresses WHERE user_id = ? ORDER BY isDefault DESC, id DESC').all(u.id);
  res.json({ success:true, addresses: rows });
});

router.post('/profile/addresses', (req, res)=>{
  const db = req.app.get('db'); ensureTables(db);
  const u = requireUser(req, res); if(!u) return;
  const { label, address, city, isDefault } = req.body || {};
  if (isDefault) { db.prepare('UPDATE user_addresses SET isDefault = 0 WHERE user_id = ?').run(u.id); }
  const info = db.prepare('INSERT INTO user_addresses (user_id,label,address,city,isDefault) VALUES (?,?,?,?,?)')
    .run(u.id, label||'', address||'', city||'', isDefault?1:0);
  const row = db.prepare('SELECT * FROM user_addresses WHERE id = ?').get(info.lastInsertRowid);
  res.json({ success:true, address: row });
});

router.put('/profile/addresses/:id', (req, res)=>{
  const db = req.app.get('db'); ensureTables(db);
  const u = requireUser(req, res); if(!u) return;
  const id = Number(req.params.id);
  const body = req.body || {};
  if (body.isDefault) { db.prepare('UPDATE user_addresses SET isDefault = 0 WHERE user_id = ?').run(u.id); }
  const curr = db.prepare('SELECT * FROM user_addresses WHERE id = ? AND user_id = ?').get(id, u.id);
  if(!curr) return res.status(404).json({ success:false, error:'Not found' });
  const upd = {
    label: body.label ?? curr.label,
    address: body.address ?? curr.address,
    city: body.city ?? curr.city,
    isDefault: body.isDefault ? 1 : (body.isDefault===0?0:curr.isDefault)
  };
  db.prepare('UPDATE user_addresses SET label=?, address=?, city=?, isDefault=? WHERE id=? AND user_id=?')
    .run(upd.label, upd.address, upd.city, upd.isDefault, id, u.id);
  const row = db.prepare('SELECT * FROM user_addresses WHERE id = ?').get(id);
  res.json({ success:true, address: row });
});

router.delete('/profile/addresses/:id', (req, res)=>{
  const db = req.app.get('db'); ensureTables(db);
  const u = requireUser(req, res); if(!u) return;
  const id = Number(req.params.id);
  db.prepare('DELETE FROM user_addresses WHERE id = ? AND user_id = ?').run(id, u.id);
  res.json({ success:true });
});

// ---------- Payment Methods ----------
router.get('/profile/payments', (req, res)=>{
  const db = req.app.get('db'); ensureTables(db);
  const u = requireUser(req, res); if(!u) return;
  const rows = db.prepare('SELECT * FROM user_payment_methods WHERE user_id = ? ORDER BY isDefault DESC, id DESC').all(u.id);
  res.json({ success:true, methods: rows });
});

router.post('/profile/payments', (req, res)=>{
  const db = req.app.get('db'); ensureTables(db);
  const u = requireUser(req, res); if(!u) return;
  const { kind, mask, meta, isDefault } = req.body || {};
  if (isDefault) { db.prepare('UPDATE user_payment_methods SET isDefault = 0 WHERE user_id = ?').run(u.id); }
  const info = db.prepare('INSERT INTO user_payment_methods (user_id,kind,mask,meta,isDefault) VALUES (?,?,?,?,?)')
    .run(u.id, kind||'', mask||'', meta?JSON.stringify(meta):null, isDefault?1:0);
  const row = db.prepare('SELECT * FROM user_payment_methods WHERE id = ?').get(info.lastInsertRowid);
  res.json({ success:true, method: row });
});

router.put('/profile/payments/:id', (req, res)=>{
  const db = req.app.get('db'); ensureTables(db);
  const u = requireUser(req, res); if(!u) return;
  const id = Number(req.params.id);
  const curr = db.prepare('SELECT * FROM user_payment_methods WHERE id = ? AND user_id = ?').get(id, u.id);
  if(!curr) return res.status(404).json({ success:false, error:'Not found' });
  const body = req.body || {};
  if (body.isDefault) { db.prepare('UPDATE user_payment_methods SET isDefault = 0 WHERE user_id = ?').run(u.id); }
  const upd = {
    kind: body.kind ?? curr.kind,
    mask: body.mask ?? curr.mask,
    meta: body.meta ? JSON.stringify(body.meta) : curr.meta,
    isDefault: body.isDefault ? 1 : (body.isDefault===0?0:curr.isDefault)
  };
  db.prepare('UPDATE user_payment_methods SET kind=?, mask=?, meta=?, isDefault=? WHERE id=? AND user_id=?')
    .run(upd.kind, upd.mask, upd.meta, upd.isDefault, id, u.id);
  const row = db.prepare('SELECT * FROM user_payment_methods WHERE id = ?').get(id);
  res.json({ success:true, method: row });
});

router.delete('/profile/payments/:id', (req, res)=>{
  const db = req.app.get('db'); ensureTables(db);
  const u = requireUser(req, res); if(!u) return;
  const id = Number(req.params.id);
  db.prepare('DELETE FROM user_payment_methods WHERE id = ? AND user_id = ?').run(id, u.id);
  res.json({ success:true });
});

// ---------- Email Settings ----------
router.get('/profile/email-settings', (req, res)=>{
  const db = req.app.get('db'); ensureTables(db);
  const u = requireUser(req, res); if(!u) return;
  const row = db.prepare('SELECT newsletter, order_updates, marketing FROM user_email_settings WHERE user_id = ?').get(u.id) || { newsletter:0, order_updates:1, marketing:0 };
  res.json({ success:true, prefs: row });
});

router.put('/profile/email-settings', (req, res)=>{
  const db = req.app.get('db'); ensureTables(db);
  const u = requireUser(req, res); if(!u) return;
  const { newsletter, order_updates, marketing } = req.body || {};
  db.prepare('INSERT INTO user_email_settings (user_id, newsletter, order_updates, marketing, updated_at) VALUES (?,?,?,?,datetime(\'now\')) ON CONFLICT(user_id) DO UPDATE SET newsletter=excluded.newsletter, order_updates=excluded.order_updates, marketing=excluded.marketing, updated_at=datetime(\'now\')')
    .run(u.id, newsletter?1:0, order_updates?1:0, marketing?1:0);
  const row = db.prepare('SELECT newsletter, order_updates, marketing FROM user_email_settings WHERE user_id = ?').get(u.id);
  res.json({ success:true, prefs: row });
});

module.exports = router;

