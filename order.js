const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ordersPath = path.join(__dirname, "orders.json");

// Utility to generate unique ID
function generateId() {
  return crypto.randomBytes(8).toString("hex");
}

// Utility to calculate total order value
function calculateNetValue(cart = []) {
  return cart.reduce((sum, item) => {
    const price = parseFloat(item.price) || 0;
    const qty = parseInt(item.quantity || 1);
    return sum + price * qty;
  }, 0);
}

// ✅ SAVE ORDER
function saveOrder(order) {
  return new Promise((resolve, reject) => {
    fs.readFile(ordersPath, "utf8", (err, data) => {
      let orders = [];
      if (!err && data) {
        try {
          orders = JSON.parse(data);
        } catch (e) {
          console.warn("⚠️ Could not parse existing orders.json:", e);
        }
      }

      // ✅ Add required fields
      const timestamp = new Date().toISOString();
      const id = generateId();

      const enrichedOrder = {
        ...order,
        id,
        status: "Pending",
        orderDateTime: timestamp,
        timestamp,
        netValue: calculateNetValue(order.cart),
        items: order.cart
      };

      orders.push(enrichedOrder);

      fs.writeFile(ordersPath, JSON.stringify(orders, null, 2), (err) => {
        if (err) return reject(err);
        resolve(id);
      });
    });
  });
}

// ✅ FIND BY PHONE
function findOrdersByPhone(phone) {
  return new Promise((resolve, reject) => {
    fs.readFile(ordersPath, "utf8", (err, data) => {
      if (err) return reject(err);
      let orders = JSON.parse(data || "[]");
      const matches = orders.filter(order => order.phone === phone);
      resolve(matches);
    });
  });
}

module.exports = { saveOrder, findOrdersByPhone };
