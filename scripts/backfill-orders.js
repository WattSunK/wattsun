// backfill-orders.js
const fs = require("fs");
const path = require("path");

const ordersPath = path.join(__dirname, "orders.json");
const defaultPhone = "+254722761212"; // Set your preferred test number

try {
  const orders = JSON.parse(fs.readFileSync(ordersPath, "utf8"));
  let updated = 0;

  orders.forEach(order => {
    if (!order.phone || order.phone.trim() === "") {
      order.phone = defaultPhone;
      updated++;
    }
  });

  fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
  console.log(`✅ Backfill complete. ${updated} order(s) updated with default phone.`);
} catch (err) {
  console.error("❌ Failed to backfill orders.json:", err);
}
