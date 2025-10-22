#!/bin/bash
# ================================================================
#  WattSun Loyalty Withdrawals — Full Lifecycle Verification Script
#  Location: /volume1/web/wattsun/scripts/loyalty_withdrawals_full_cycle.sh
#  Purpose : Verify Create → Approve → Mark Paid → Reject
# ================================================================

set -euo pipefail

DB="/volume1/web/wattsun/data/dev/wattsun.dev.db"
API="http://127.0.0.1:3001/api/admin/loyalty/withdrawals"
LOGIN_URL="http://127.0.0.1:3001/api/login"

echo "============================"
echo "START: Loyalty Withdrawals Test"
echo "============================"

# ------------------------------------------------------------
# 0) Login Check — refresh session if admin.jar is missing
# ------------------------------------------------------------
if [ ! -f admin.jar ]; then
  echo "No admin session found. Logging in..."
  # Load credentials from env
  ADMIN_EMAIL=""
  ADMIN_PASS=""
  for F in "/volume1/web/wattsun/.env" "/volume1/web/wattsun/.env.qa"; do
    if [ -f "$F" ]; then set -a; . "$F"; set +a; fi
  done
  ADMIN_EMAIL="${SANITY_EMAIL:-${ADMIN_BOOTSTRAP_EMAIL:-}}"
  ADMIN_PASS="${SANITY_PASSWORD:-${ADMIN_BOOTSTRAP_PASSWORD:-}}"
  if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASS" ]; then
    echo "ERROR: Set SANITY_EMAIL/SANITY_PASSWORD (or ADMIN_BOOTSTRAP_*) in env file." >&2
    exit 1
  fi
  curl -s -i -c admin.jar \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" \
    "$LOGIN_URL" | grep -q '"success":true' && echo "Admin login successful" || {
      echo "Admin login failed. Check credentials or backend." >&2
      exit 1
    }
else
  echo "Using existing admin.jar session"
fi

# ------------------------------------------------------------
# 1) Create new withdrawal
# ------------------------------------------------------------
echo -e "\nCreating new withdrawal..."
curl -s -b admin.jar -H "Content-Type: application/json" \
  -d '{"accountId":1,"points":47,"note":"FullCycle test"}' \
  -X POST "$API" | tee /tmp/withdrawal_create.json

ID=$(jq -r '.withdrawal.id // empty' /tmp/withdrawal_create.json)

if [ -z "$ID" ]; then
  echo "Withdrawal creation failed." >&2
  cat /tmp/withdrawal_create.json
  exit 1
else
  echo "Created withdrawal ID: $ID"
  sleep 1

  sqlite3 "$DB" <<'SQL'
.headers on
.mode column
SELECT id, kind, points_delta, note, created_at
FROM loyalty_ledger
WHERE kind='withdraw'
ORDER BY id DESC LIMIT 3;
SQL
fi

# ------------------------------------------------------------
# 2) Approve
# ------------------------------------------------------------
echo -e "\nApproving withdrawal #$ID..."
curl -s -b admin.jar -X PATCH "$API/$ID/approve" | tee /tmp/withdrawal_approve.json
sleep 1

sqlite3 "$DB" <<'SQL'
.headers on
.mode column
SELECT id, kind, note FROM loyalty_ledger
WHERE kind='withdraw'
ORDER BY id DESC LIMIT 3;
SQL

sqlite3 "$DB" <<'SQL'
.headers on
.mode column
SELECT id, kind, note, status FROM notifications_queue
WHERE kind LIKE 'withdrawal_%'
ORDER BY id DESC LIMIT 5;
SQL

# ------------------------------------------------------------
# 3) Mark as Paid
# ------------------------------------------------------------
echo -e "\nMarking withdrawal #$ID as paid..."
curl -s -b admin.jar -X PATCH "$API/$ID/mark-paid" | tee /tmp/withdrawal_paid.json
sleep 1

sqlite3 "$DB" <<'SQL'
.headers on
.mode column
SELECT id, kind, note FROM loyalty_ledger
WHERE kind='withdraw'
ORDER BY id DESC LIMIT 3;
SQL

sqlite3 "$DB" <<'SQL'
.headers on
.mode column
SELECT id, kind, note, status FROM notifications_queue
WHERE kind LIKE 'withdrawal_%'
ORDER BY id DESC LIMIT 5;
SQL

# ------------------------------------------------------------
# 4) Reject (for final state validation)
# ------------------------------------------------------------
echo -e "\nRejecting withdrawal #$ID (safety check)..."
curl -s -b admin.jar -X PATCH "$API/$ID/reject" | tee /tmp/withdrawal_reject.json
sleep 1

sqlite3 "$DB" <<'SQL'
.headers on
.mode column
SELECT id, kind, note FROM loyalty_ledger
WHERE kind='withdraw'
ORDER BY id DESC LIMIT 3;
SQL

sqlite3 "$DB" <<'SQL'
.headers on
.mode column
SELECT id, kind, note, status FROM notifications_queue
WHERE kind LIKE 'withdrawal_%'
ORDER BY id DESC LIMIT 5;
SQL

# ------------------------------------------------------------
# 5) Summary
# ------------------------------------------------------------
echo -e "\nFINAL SUMMARY"
sleep 1

sqlite3 "$DB" <<'SQL'
.headers on
.mode column
SELECT id, account_id, kind, points_delta, note, datetime(created_at) AS created
FROM loyalty_ledger
WHERE kind='withdraw'
ORDER BY id DESC LIMIT 5;
SQL

sqlite3 "$DB" <<'SQL'
.headers on
.mode column
SELECT id, kind, note, status, datetime(created_at) AS created
FROM notifications_queue
WHERE kind LIKE 'withdrawal_%'
ORDER BY id DESC LIMIT 5;
SQL

echo "============================"
echo "END OF TEST — Verify sequential IDs & correct Queued notifications."
echo "============================"

