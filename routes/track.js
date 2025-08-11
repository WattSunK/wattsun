// routes/track.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const ordersPath = path.join(__dirname, "../orders.json");

// ---------- utils ----------
function readOrders() {
  try { return JSON.parse(fs.readFileSync(ordersPath, "utf8")); }
  catch (err) { console.error("Error reading orders.json:", err); return []; }
}

function normalizePhone(phone) {
  if (!phone) return "";
  let p = String(phone).trim().replace(/\s+/g, "");
  if (p.startsWith("0")) p = p.slice(1);
  if (!p.startsWith("+254")) p = p.startsWith("254") ? ("+" + p) : ("+254" + p);
  return p;
}
const normEmail = (e) => String(e || "").trim().toLowerCase();
const ieq = (a,b) => String(a||"").toLowerCase() === String(b||"").toLowerCase();

function shape(o){
  return {
    orderNumber:     o.orderNumber || o.id || o.orderId || o.order_id || "—",
    status:          o.status || "Pending",
    updatedAt:       o.updatedAt || o.timestamp || o.createdAt || null,
    fullName:        o.fullName || o.name || o.customer || "",
    deliveryAddress: o.deliveryAddress || o.address || "",
    paymentType:     o.paymentType || o.paymentMethod || o.payment || "",
    total:           o.total ?? o.amount ?? o.netValue ?? 0,
    deposit:         o.deposit ?? null,
    cart_summary:    o.cart_summary || ""
  };
}

function findByPhone(all, phone) {
  const n = normalizePhone(phone);
  return all.filter(o => normalizePhone(o.phone) === n);
}
function findByEmail(all, email) {
  const e = normEmail(email);
  if (!e) return [];
  return all.filter(o => normEmail(o.email) === e);
}

function applyFilters(list, { status, order }) {
  let m = list;
  if (status) m = m.filter(o => ieq(o.status || "Pending", status));
  if (order) {
    const key = String(order).trim();
    m = m.filter(o => String(o.orderNumber || o.id || o.orderId || o.order_id || "").trim() === key);
  }
  return m.map(shape);
}

function getEmailFallback(req) {
  // Accept email from query/body or header "X-WS-Email" (silent background)
  return req.query?.email || req.body?.email || req.get("X-WS-Email") || "";
}

// ---------- routes ----------
router.get("/", (req, res) => {
  const phone  = (req.query.phone  || "").trim();
  const status = (req.query.status || "").trim();
  const order  = (req.query.order  || "").trim();
  if (!phone) return res.status(400).json({ success:false, error:"Phone number is required" });

  const all = readOrders();
  let list = findByPhone(all, phone);

  // 🔁 Email fallback if phone found 0
  if (list.length === 0) {
    const email = getEmailFallback(req);
    if (email) list = findByEmail(all, email);
  }

  const out = applyFilters(list, { status, order });
  res.json({ success:true, total: out.length, orders: out });
});

router.post("/", (req, res) => {
  const phone  = (req.body.phone  || "").trim();
  const status = (req.body.status || "").trim();
  const order  = (req.body.order  || "").trim();
  if (!phone) return res.status(400).json({ success:false, error:"Phone number is required" });

  const all = readOrders();
  let list = findByPhone(all, phone);

  // 🔁 Email fallback if phone found 0
  if (list.length === 0) {
    const email = getEmailFallback(req);
    if (email) list = findByEmail(all, email);
  }

  const out = applyFilters(list, { status, order });
  res.json({ success:true, total: out.length, orders: out });
});

module.exports = router;
