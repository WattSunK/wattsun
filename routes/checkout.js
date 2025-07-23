const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const ordersFile = path.join(__dirname, "../orders.json");

// Ensure orders.json exists
function loadOrders() {
  try {
    if (!fs.existsSync(ordersFile)) return [];
    const data = fs.readFileSync(ordersFile);
    return JSON.parse(data);
  } catch (err) {
    console.error("❌ Error reading orders.json:", err);
    return [];
  }
}

function saveOrders(orders) {
  try {
    fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error("❌ Error writing to orders.json:", err);
  }
}

// POST /api/checkout
router.post("/", (req, res) => {
  const { fullName, email, phone, address, cart_summary } = req.body;

  if (!fullName || !email || !phone || !address) {
    return res.status(400).json({ status: "error", message: "Missing required fields" });
  }

  const newOrder = {
    fullName,
    email,
    phone,
    address,
    cart_summary: cart_summary || "",
    timestamp: new Date().toISOString()
  };

  const orders = loadOrders();
  orders.push(newOrder);
  saveOrders(orders);

  console.log("✅ New order received:", newOrder);
  res.json({ status: "success", message: "Order saved successfully" });
});

module.exports = router;
