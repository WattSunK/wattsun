const express = require("express");
const router = express.Router();

// Pass knex instance from app.js/server.js
module.exports = (knex) => {
  // --- GET /api/items (all items) ---
  router.get("/", async (req, res) => {
    try {
      // Default: only active items. Override with ?active=0 or ?active=false
      const activeParam = (req.query.active ?? '1').toString().toLowerCase();
      const onlyActive = !(activeParam === '0' || activeParam === 'false' || activeParam === 'all');

      let q = knex("items")
        .leftJoin("categories", "items.category_id", "categories.id")
        .select(
          "items.sku",
          "items.name",
          "items.description",
          "items.price",
          "items.warranty",
          "items.stock",
          "items.image",
          "items.active",
          "items.priority",                 // ← added: expose priority in reads
          "categories.name as category"
        );

      if (onlyActive) q = q.where("items.active", 1);

      // ← added: canonical server-side order
      q = q.orderBy([
        { column: "items.priority", order: "desc" },
        { column: "items.name",     order: "asc"  }
      ]);

      const items = await q;
      res.json(items);
    } catch (err) {
      console.error("❌ Failed to fetch items:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- PATCH /api/items/:sku/status (activate/deactivate item) ---
  router.patch("/:sku/status", async (req, res) => {
    try {
      const { active } = req.body;
      if (typeof active !== "boolean")
        return res.status(400).json({ error: "Missing or invalid 'active' field" });

      const updated = await knex("items")
        .where("sku", req.params.sku)
        .update({ active });

      if (!updated) return res.status(404).json({ error: "Item not found" });

      res.json({ success: true });
    } catch (err) {
      console.error("❌ Failed to update item status:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- GET /api/items/:sku (single item) ---
  router.get("/:sku", async (req, res) => {
    try {
      const item = await knex("items")
        .leftJoin("categories", "items.category_id", "categories.id")
        .select(
          "items.sku",
          "items.name",
          "items.description",
          "items.price",
          "items.warranty",
          "items.stock",
          "items.image",
          "items.active",
          "items.priority",               // ← added
          "categories.name as category"
        )
        .where("items.sku", req.params.sku)
        .first();
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json(item);
    } catch (err) {
      console.error("❌ Failed to fetch item:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- PATCH /api/items/:sku (edit item) ---
  router.patch("/:sku", async (req, res) => {
    try {
      const { name, description, price, warranty, stock, category, image, priority } = req.body;

      // Optional: Get category_id from category name if provided
      let category_id = null;
      if (category) {
        const cat = await knex("categories").where("name", category).first();
        if (cat) category_id = cat.id;
      }

      const updateFields = {};
      if (name !== undefined)        updateFields.name = name;
      if (description !== undefined) updateFields.description = description;
      if (price !== undefined)       updateFields.price = price;
      if (warranty !== undefined)    updateFields.warranty = warranty;
      if (stock !== undefined)       updateFields.stock = stock;
      if (image !== undefined)       updateFields.image = image;
      if (category_id !== null)      updateFields.category_id = category_id;

      // ← added: priority handling (coerce to integer; default 0 if invalid)
      if (priority !== undefined) {
        const prioNum = Number(priority);
        updateFields.priority = Number.isFinite(prioNum) ? Math.trunc(prioNum) : 0;
      }

      const updated = await knex("items")
        .where("sku", req.params.sku)
        .update(updateFields);

      if (!updated) return res.status(404).json({ error: "Item not found" });

      res.json({ success: true });
    } catch (err) {
      console.error("❌ Failed to update item:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- DELETE /api/items/:sku (delete item) ---
  router.delete("/:sku", async (req, res) => {
    try {
      const deleted = await knex("items").where("sku", req.params.sku).del();
      if (!deleted) return res.status(404).json({ error: "Item not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("❌ Failed to delete item:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- POST /api/items (create new item, stricter required fields) ---
  router.post("/", async (req, res) => {
    try {
      const { sku, name, description, price, category, warranty, stock, image, active, priority } = req.body;

      // Validate required fields
      if (!sku || !name || !description || !price || !category) {
        return res.status(400).json({
          error: "SKU, Name, Description, Price, and Category are required."
        });
      }

      // Lookup category_id from category name
      const cat = await knex("categories").where("name", category).first();
      if (!cat) {
        return res.status(400).json({ error: "Category not found." });
      }
      const category_id = cat.id;

      // Check SKU uniqueness
      const exists = await knex("items").where("sku", sku).first();
      if (exists) {
        return res.status(409).json({ error: "SKU already exists." });
      }

      // ← added: priority handling (coerce to integer; default 0)
      const prioNum = Number(priority);
      const prio = Number.isFinite(prioNum) ? Math.trunc(prioNum) : 0;

      await knex("items").insert({
        sku,
        name,
        description,
        price,
        warranty: warranty || null,
        stock: stock || 0,
        image: image || null,
        active: active !== undefined ? !!active : true,
        category_id,
        priority: prio                   // ← added
      });

      res.status(201).json({ success: true });
    } catch (err) {
      console.error("❌ Failed to create item:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
};
