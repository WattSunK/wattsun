const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Save orders to a temporary JSON file
const ORDERS_FILE = path.join(__dirname, '../orders.json');

router.post('/', (req, res) => {
  const order = req.body;
  order.timestamp = new Date().toISOString();

  // Load existing orders
  let orders = [];
  if (fs.existsSync(ORDERS_FILE)) {
    const data = fs.readFileSync(ORDERS_FILE);
    orders = JSON.parse(data);
  }

  orders.push(order);
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));

  res.status(200).json({ message: 'Order saved successfully.' });
});

module.exports = router;
