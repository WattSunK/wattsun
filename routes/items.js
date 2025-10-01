const express = require("express");
const router = express.Router();

// Pass knex instance from app.js/server.js
module.exports = (knex) => {
   // --- GET /api/items (all items) ---  [FINAL: read real stock/priority/warranty]
router.get("/", async (req, res) => {
  try {
    const activeParam = (req.query.active ?? "1").toString().toLowerCase();
    const onlyActive = !(activeParam === "0" || activeParam === "false" || activeParam === "all");

    let q = knex("items as i")
      .leftJoin("categories as c", "c.id", "i.categoryId")
      .select(
        "i.id",
        "i.sku",
        "i.name",
        "i.description",
        "i.priceCents",
        // backward-compat fields for current UI
        knex.raw("CAST(ROUND(i.priceCents / 100.0) AS INTEGER) AS price"),
        "i.categoryId",
        "c.name as categoryName",
        "i.image",
        "i.active",
        // now read the real columns (were constants before)
        "i.stock",
        "i.priority",
        "i.warranty"
      );

    if (onlyActive) q.where("i.active", 1);

    // restore legacy ordering if you used it
    q.orderBy([{ column: "i.priority", order: "desc" }, { column: "i.name", order: "asc" }]);

    const items = await q;
    return res.json(items); // keep bare array (no frontend churn)
  } catch (err) {
    console.error("❌ Failed to fetch items:", err);
    return res.status(500).json({ error: "Internal server error" });
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
      .update({ active: active ? 1 : 0 });  // <— coerce to 0/1

    if (!updated) return res.status(404).json({ error: "Item not found" });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to update item status:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

   // --- GET /api/items/:sku (single item) ---  [FINAL: read real stock/priority/warranty]
   
router.get("/:sku", async (req, res) => {
  try {
    const item = await knex("items as i")
      .leftJoin("categories as c", "c.id", "i.categoryId")
      .select(
        "i.id",
        "i.sku",
        "i.name",
        "i.description",
        "i.priceCents",
        knex.raw("CAST(ROUND(i.priceCents / 100.0) AS INTEGER) AS price"), // compat
        "i.categoryId",
        "c.name as categoryName",                                         // compat
        "i.image",
        "i.active",
        "i.stock",                                                        // real column
        "i.priority",                                                     // real column
        "i.warranty"                                                      // real column
      )
      .where("i.sku", req.params.sku)
      .first();

    if (!item) return res.status(404).json({ error: "Item not found" });
    return res.json(item);
  } catch (err) {
    console.error("❌ Failed to fetch item:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

   // --- PATCH /api/items/:sku (edit item) ---  [FIX: persist priority; coerce stock/active; money & category map]
router.patch("/:sku", async (req, res) => {
  try {
    const {
      name, description, price, priceCents,
      warranty, stock, priority,
      category, image, active
    } = req.body;

    // Resolve categoryId from category name (optional)
    let categoryId = null;
    if (typeof category === "string" && category.trim()) {
      const cat = await knex("categories").where("name", category.trim()).first();
      if (!cat) return res.status(400).json({ error: "Category not found." });
      categoryId = cat.id;
    }

    const updateFields = {};
    if (name !== undefined)        updateFields.name = name;
    if (description !== undefined) updateFields.description = description;
    if (image !== undefined)       updateFields.image = image;
    if (active !== undefined)      updateFields.active = active ? 1 : 0;
    if (warranty !== undefined)    updateFields.warranty = warranty ?? null;
    if (stock !== undefined)       updateFields.stock = Number.isFinite(+stock) ? Math.trunc(+stock) : 0;
    if (priority !== undefined)    updateFields.priority = Number.isFinite(+priority) ? Math.trunc(+priority) : 0;

    // Money: accept priceCents or price (KES)
    if (priceCents !== undefined) {
      const n = Number(priceCents);
      if (!Number.isFinite(n)) return res.status(400).json({ error: "priceCents must be a number" });
      updateFields.priceCents = Math.trunc(n);
    } else if (price !== undefined) {
      const p = Number(price);
      if (!Number.isFinite(p)) return res.status(400).json({ error: "price must be numeric (KES)" });
      updateFields.priceCents = Math.trunc(Math.round(p * 100));
    }

    if (categoryId !== null) updateFields.categoryId = categoryId;

    const updated = await knex("items").where("sku", req.params.sku).update(updateFields);
    if (!updated) return res.status(404).json({ error: "Item not found" });

    return res.json({ success: true });
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

   // --- POST /api/items (create new item) ---  [FIX: accept/insert priority; coerce stock; money & category map]
router.post("/", async (req, res) => {
  try {
    const {
      sku, name, description,
      price, priceCents,
      category, image, active,
      stock, priority, warranty
    } = req.body;

    // Validate required fields
    if (!sku || !name || !description || !category || (price === undefined && priceCents === undefined)) {
      return res.status(400).json({
        error: "SKU, Name, Description, Category, and Price/priceCents are required."
      });
    }

    // Resolve categoryId
    const cat = await knex("categories").where("name", category).first();
    if (!cat) return res.status(400).json({ error: "Category not found." });
    const categoryId = cat.id;

    // Uniqueness
    const exists = await knex("items").where("sku", sku).first();
    if (exists) return res.status(409).json({ error: "SKU already exists." });

    // Money
    let priceCentsFinal;
    if (priceCents !== undefined) {
      const n = Number(priceCents);
      if (!Number.isFinite(n)) return res.status(400).json({ error: "priceCents must be a number" });
      priceCentsFinal = Math.trunc(n);
    } else {
      const p = Number(price);
      if (!Number.isFinite(p)) return res.status(400).json({ error: "price must be numeric (KES)" });
      priceCentsFinal = Math.trunc(Math.round(p * 100));
    }

    await knex("items").insert({
      sku,
      name,
      description,
      priceCents: priceCentsFinal,
      categoryId,
      image: image ?? null,
      active: active !== undefined ? (active ? 1 : 0) : 1,
      warranty: warranty ?? null,
      stock: Number.isFinite(+stock) ? Math.trunc(+stock) : 0,
      priority: Number.isFinite(+priority) ? Math.trunc(+priority) : 0
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error("❌ Failed to create item:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

  return router;
};
