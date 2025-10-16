const express = require("express");
const router = express.Router();
const knexLib = require("knex");
const path = require("path");

const inventoryDbPath =
  process.env.DB_PATH_INVENTORY ||
  path.join(__dirname, "../data/dev/inventory.dev.db");

const knex = knexLib({
  client: "sqlite3",
  connection: { filename: inventoryDbPath },
  useNullAsDefault: true,
});
console.log("[categories] Connected to inventory DB:", inventoryDbPath);

  // GET /api/categories - returns all categories
  router.get("/", async (req, res) => {
    try {
      const categories = await knex("categories").select("id", "name");
      res.json(categories);
    } catch (err) {
      console.error("❌ Failed to fetch categories:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

module.exports = router;
