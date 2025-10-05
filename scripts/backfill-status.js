// backfill-status.js
const fs = require("fs");
const path = require("path");

const ordersPath = path.join(__dirname, "orders.json");
const defaultStatus = "Pending";

try {
  const orders = JSON.parse(fs.readFileSync(ordersPath, "utf8"));
  let updated = 0;

  orders.forEach(order => {
    if (!order.status || order.status.trim() === "") {
      order.status = defaultStatus;
      updated++;
    }
  });

  fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
  console.log(`✅ Backfill complete. ${updated} order(s) updated with status '${defaultStatus}'.`);
} catch (err) {
  console.error("❌ Failed to backfill order statuses:", err);
}
