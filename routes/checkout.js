// routes/checkout.js
// Creates a new order in orders.json and always sets status/orderType = "Pending"

const express = require("express");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
require("dotenv").config();

const router = express.Router();
const ordersFile = path.resolve(__dirname, "../orders.json");

// Transport (matches your SMTP env)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

function loadOrders() {
  try {
    if (!fs.existsSync(ordersFile)) return [];
    return JSON.parse(fs.readFileSync(ordersFile, "utf8"));
  } catch (e) {
    console.error("loadOrders error:", e);
    return [];
  }
}
function saveOrdersAtomic(list) {
  const tmp = ordersFile + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, ordersFile);
}
function generateOrderNumber() {
  return "WATT" + Date.now() + (Math.floor(Math.random() * 90) + 10);
}

// POST /api/checkout
router.post("/", async (req, res) => {
  const { fullName, email, phone, address, cart, cart_summary } = req.body;

  if (!fullName || !email || !phone || !address || !Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ status: "error", message: "Missing required fields or cart" });
  }
  if (!/^\+\d{10,15}$/.test(String(phone))) {
    return res.status(400).json({ status: "error", message: "Invalid phone number format" });
  }

  const orderNumber = generateOrderNumber();
  const order = {
    orderNumber,
    fullName,
    email,
    phone,
    // keep both keys for compatibility
    address,
    deliveryAddress: address,
    cart,
    cart_summary: cart_summary || "",
    timestamp: new Date().toISOString(),
    status: "Pending",
    orderType: "Pending",
    paymentType: "", // set / update later in Admin
    total: 0,
    deposit: null,
  };

  const list = loadOrders();
  list.push(order);
  saveOrdersAtomic(list);

  // Optional emails (best effort)
  let emailStatus = "not sent";
  let adminStatus = "not sent";
  try {
    await transporter.sendMail({
      from: `"WattSun Solar" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Your WattSun Solar Order",
      text: `Thank you for your order, ${fullName}!\n\nOrder Number: ${orderNumber}\n\nWe’ll contact you soon to confirm details.`,
    });
    emailStatus = "sent";
  } catch (e) {
    console.error("customer email failed:", e.message);
  }

  try {
    await transporter.sendMail({
      from: `"WattSun Solar" <${process.env.SMTP_USER}>`,
      to: "mainakamunyu@gmail.com",
      subject: `New Order: ${orderNumber}`,
      text: `New order from ${fullName} (${phone})\n\n${cart_summary || "See orders.json"}`,
    });
    adminStatus = "sent";
  } catch (e) {
    console.error("admin email failed:", e.message);
  }

  res.json({
    status: "success",
    message: "Order saved successfully",
    orderNumber,
    emailStatus,
    adminStatus,
  });
});

module.exports = router;
