# Runbooks

## Admin Settings → Notifications

- Location: Admin → Settings → Notifications
- Fields and effects:
  - Order Placed Email: controls admin notification for new orders enqueued by checkout. Customer copy is always queued.
  - Order Delivered Email: controls admin notification when a dispatch is marked Delivered. Customer copy is always queued.
  - Low Stock Alerts (threshold): reserved for inventory alerts.
  - Send notifications to: alerts email used for admin copies; fallback to `admin_email` then `SMTP_USER` if empty.

Storage
- Backed by `admin_settings` table with keys:
  - `notify_order_placed` (default 1)
  - `notify_order_delivered` (default 1)
  - `low_stock_threshold` (default 10)
  - `alerts_email` (string)

Related code
- API: `GET/PUT /api/admin/settings` (routes/admin-settings.js)
- Checkout enqueue: routes/checkout.js
- Delivered enqueue: routes/admin-dispatch.js
