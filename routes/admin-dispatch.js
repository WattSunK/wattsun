// routes/admin-dispatch.js
const express = require("express");
const router = express.Router();

// Lightweight body parsers (JSON + urlencoded)
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

/**
 * In-memory assignment store:
 *  Key: orderId (string), Value: driver_id (number|null)
 *  Persists for the life of the Node process (meets v0.2 requirement).
 */
const dispatchAssignments = Object.create(null);

/**
 * PUT /api/admin/dispatch/:orderId
 * Body: { driver_id: number | null }
 * Returns: { success:true, orderId, driver_id }
 *
 * Notes:
 * - No DB writes (v0.2). Minimal validation only.
 * - Compatible with planned /api/admin/users?type=Driver for source of drivers. 
 */
router.put("/:orderId", (req, res) => {
  const { orderId } = req.params;
  const { driver_id } = req.body;

  if (typeof orderId !== "string" || !orderId.trim()) {
    return res.status(400).json({ success: false, error: { code: "BAD_ORDER_ID", message: "Invalid orderId" } });
  }

  if (!(driver_id === null || driver_id === undefined || Number.isInteger(+driver_id))) {
    return res.status(400).json({ success: false, error: { code: "BAD_DRIVER_ID", message: "driver_id must be integer or null" } });
  }

  // store (normalize undefined → null)
  dispatchAssignments[orderId] = driver_id ?? null;

  return res.json({ success: true, orderId, driver_id: dispatchAssignments[orderId] });
});

/**
 * GET /api/admin/dispatch
 * Query: ids=orderId1,orderId2,...
 * Returns: { success:true, assignments: { [orderId]: driver_id|null } }
 *
 * This is tiny but lets the UI show existing assignments after a refresh.
 * (Still v0.2 minimal — no DB.)
 */
router.get("/", (req, res) => {
  const ids = (req.query.ids || "").split(",").map(s => s.trim()).filter(Boolean);
  const out = {};
  if (ids.length) {
    ids.forEach(id => { out[id] = Object.prototype.hasOwnProperty.call(dispatchAssignments, id) ? dispatchAssignments[id] : null; });
  }
  return res.json({ success: true, assignments: out });
});

module.exports = router;
