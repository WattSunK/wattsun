const express = require("express");
const http = require("http");
const path = require("path");
const { saveOrder } = require("./order");

const app = express();

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, "public")));

// Optional: Handle root route if needed
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Enable JSON parsing for incoming requests
app.use(express.json());

// API route: Checkout
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

// API route: Health check
app.get("/api/health", (req, res) => {
  res.status(200).send("OK");
});

// Start HTTP server on port 3000
http.createServer(app).listen(3000, () => {
  console.log("✅ WattSun backend running on HTTP port 3000");
});