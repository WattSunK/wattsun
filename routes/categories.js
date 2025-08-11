const express = require("express");
const router = express.Router();

module.exports = (knex) => {
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

  return router;
};
