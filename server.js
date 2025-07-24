const express = require("express");
const http = require("http");
const path = require("path");
const knex = require("knex");
const { saveOrder } = require("./order");
const itemsRoute = require("./routes/items");

const app = express();

// Initialize knex for SQLite
const db = knex({
  client: "sqlite3",
  connection: {
    filename: path.join(__dirname, "inventory.db")
  },
  useNullAsDefault: true
});

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, "public")));

// Optional: Handle root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Enable JSON parsing
app.use(express.json());

// API: Checkout
app.post("/api/checkout", async (req, res) => {
  const order = { ...req.body, timestamp: new Date().toISOString() };
  console.log("✅ New checkout received:", order);

  try {
    await saveOrder(order);
    res.json({ status: "OK", message: "Checkout received" });
  } catch (err) {
    console.error("❌ Order save failed:", err);
    res.status(500).json({ status: "error", message: "Failed to save order" });
  }
});

// API: Items
app.use("/api", itemsRoute(db));

// API: Health check
app.get("/api/health", (req, res) => {
  res.status(200).send("OK");
});

// Start server on port 3001
http.createServer(app).listen(3001, () => {
  console.log("✅ WattSun backend running on HTTP port 3001");
});