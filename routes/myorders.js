// routes/myorders.js
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const ordersPath = path.join(__dirname, '../orders.json');
const INTL_PHONE = /^\+\d{10,15}$/;

function readOrders() {
  try {
    const raw = fs.readFileSync(ordersPath, 'utf8') || '[]';
    return JSON.parse(raw);
  } catch (e) {
    console.error('[myorders] Failed to read orders:', e.message);
    return [];
  }
}

function toInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function searchFilter(data, { phone, status, q }) {
  let list = data;

  // strict E.164 match (frontend already enforces ^\+\d{10,15}$)
  if (phone) {
    const p = String(phone).trim();
    list = list.filter(o => String(o.phone || '').trim() === p);
  }

  if (status) {
    const s = String(status).trim().toLowerCase();
    list = list.filter(o => String(o.status || '').toLowerCase() === s);
  }

  if (q) {
    const qTrim = String(q).trim().toLowerCase();
    if (qTrim) {
      list = list.filter(o => {
        const idHit = String(o.id || '').toLowerCase().includes(qTrim);
        const nameHit = String(o.fullName || o.name || '').toLowerCase().includes(qTrim);
        const itemHit = Array.isArray(o.items) && o.items.some(it =>
          String(it.name || '').toLowerCase().includes(qTrim) ||
          String(it.sku || '').toLowerCase().includes(qTrim)
        );
        return idHit || nameHit || itemHit;
      });
    }
  }

  return list;
}

// GET /api/myorders?phone=+254...&status=Pending&q=panel&page=1&limit=5
router.get('/', (req, res) => {
  const { phone, status, q } = req.query;
  const page = toInt(req.query.page, 1);
  const limit = Math.min(50, toInt(req.query.limit, 5));

  if (!phone) return res.status(400).json({ success: false, message: 'phone is required' });
  if (!INTL_PHONE.test(phone)) {
    return res.status(400).json({ success: false, message: 'Invalid phone format. Use + and 10–15 digits, e.g. +254712345678' });
  }

  const data = readOrders();
  const filtered = searchFilter(data, { phone, status, q });

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const orders = filtered.slice(start, start + limit);

  return res.json({ success: true, orders, total, page, pages });
});

// POST /api/myorders { phone, status?, q?, page?, limit? }
router.post('/', (req, res) => {
  const { phone, status, q, page: pIn, limit: lIn } = req.body || {};
  const page = toInt(pIn, 1);
  const limit = Math.min(50, toInt(lIn, 5));

  if (!phone) return res.status(400).json({ success: false, message: 'phone is required' });
  if (!INTL_PHONE.test(phone)) {
    return res.status(400).json({ success: false, message: 'Invalid phone format. Use + and 10–15 digits, e.g. +254712345678' });
  }

  const data = readOrders();
  const filtered = searchFilter(data, { phone, status, q });

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const orders = filtered.slice(start, start + limit);

  return res.json({ success: true, orders, total, page, pages });
});

module.exports = router;

