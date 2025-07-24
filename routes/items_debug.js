const express = require("express");
const router = express.Router();

module.exports = (knex) => {
  router.get("/items", async (req, res) => {
    try {
      const items = await knex("items")
        .join("categories", "items.category_id", "categories.id")
        .select(
          "items.name",
          "items.sku",
          "items.description",
          "items.price",
          "items.stock",
          "categories.name as category_name",
          "categories.image_path"
        );

      res.json(items);
    } catch (err) {
      console.error("❌ Failed to fetch items:", err); // Added error detail
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
};
