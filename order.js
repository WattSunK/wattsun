const fs = require("fs");
const path = require("path");
const ordersPath = path.join(__dirname, "orders.json");

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

      orders.push(order);

      fs.writeFile(ordersPath, JSON.stringify(orders, null, 2), (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

module.exports = { saveOrder };