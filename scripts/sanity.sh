#!/usr/bin/env bash
set -euo pipefail

# Defaults (override by exporting API/DB)
API="${API:-http://127.0.0.1:3001}"
DB="${DB:-/volume1/web/wattsun/data/dev/wattsun.dev.db}"

OID="${1:-}"
if [[ -z "$OID" ]]; then
  echo "Usage: $0 <ORDER_ID_OR_NUMBER>"
  echo "Ex:    API=http://127.0.0.1:3001 DB=/path/to/wattsun.dev.db $0 WATT175725672247897"
  exit 1
fi

# Ensure logged in (cookies.t in cwd)
if [[ ! -f cookies.t ]]; then
  echo "Logging in (cookies.t not found)..."
  curl -s -c cookies.t -H 'Content-Type: application/json' \
    -d '{"email":"skamunyu@gmail.com","password":"Pass123"}' \
    "$API/api/login" >/dev/null || { echo "Login failed"; exit 1; }
fi

echo "=== Ping ==="
curl -s -b cookies.t "$API/api/admin/orders/_diag/ping" || true
echo
echo

echo "=== Order summary: $OID ==="
sqlite3 "$DB" "
.headers off
.mode list
SELECT 'order', o.id, o.orderNumber, o.status AS baseStatus,
       COALESCE(a.status, o.status) AS effectiveStatus,
       CASE WHEN a.status IS NOT NULL THEN 'OVERLAY' ELSE '' END AS overlay_flag
FROM orders o LEFT JOIN admin_order_meta a ON a.order_id=o.id
WHERE o.id='$OID' OR o.orderNumber='$OID'
LIMIT 1;
"
echo

echo "=== Overlay row (if any) ==="
sqlite3 "$DB" "
.headers on
.mode column
SELECT * FROM admin_order_meta
WHERE order_id='$OID' OR order_id=(SELECT id FROM orders WHERE orderNumber='$OID' LIMIT 1);
"
echo

echo "=== Latest dispatch for order ==="
sqlite3 "$DB" "
.headers on
.mode column
SELECT id, order_id, status, driver_id, notes, created_at, updated_at
FROM dispatches
WHERE order_id='$OID' OR order_id=(SELECT id FROM orders WHERE orderNumber='$OID' LIMIT 1)
ORDER BY id DESC LIMIT 1;
"
echo

echo "=== Active dispatch count (not Canceled) ==="
sqlite3 "$DB" "
SELECT COUNT(*) AS non_canceled_dispatches
FROM dispatches
WHERE (order_id='$OID' OR order_id=(SELECT id FROM orders WHERE orderNumber='$OID' LIMIT 1))
  AND IFNULL(status,'') <> 'Canceled';
"
echo

echo "=== Last 10 order_status_history ==="
sqlite3 "$DB" "
.headers on
.mode column
SELECT id, order_id, old_order_status, new_order_status,
       old_dispatch_status, new_dispatch_status, source, note, changed_at
FROM order_status_history
WHERE order_id='$OID' OR order_id=(SELECT id FROM orders WHERE orderNumber='$OID' LIMIT 1)
ORDER BY id DESC LIMIT 10;
"
echo

echo "=== Last 10 dispatch_status_history (for this order) ==="
sqlite3 "$DB" "
.headers on
.mode column
SELECT h.id, h.dispatch_id, h.old_status, h.new_status, h.note, h.changed_at
FROM dispatch_status_history h
JOIN dispatches d ON d.id=h.dispatch_id
WHERE d.order_id='$OID' OR d.order_id=(SELECT id FROM orders WHERE orderNumber='$OID' LIMIT 1)
ORDER BY h.id DESC LIMIT 10;
"
echo

# Warn if overlay masks base status
EFF=$(sqlite3 "$DB" "SELECT COALESCE(a.status, o.status) FROM orders o LEFT JOIN admin_order_meta a ON a.order_id=o.id WHERE o.id='$OID' OR o.orderNumber='$OID' LIMIT 1;")
BASE=$(sqlite3 "$DB" "SELECT o.status FROM orders o WHERE o.id='$OID' OR o.orderNumber='$OID' LIMIT 1;")
if [[ -n "$EFF" && -n "$BASE" && "$EFF" != "$BASE" ]]; then
  echo "⚠️  Overlay is masking base status (effective=$EFF, base=$BASE)."
  echo "    Clear it via API:"
  echo "    curl -s -b cookies.t -X DELETE \"$API/api/admin/orders/$OID/meta\" | jq ."
fi
