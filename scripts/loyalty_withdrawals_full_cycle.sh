#!/bin/bash
# ================================================================
#  WattSun Loyalty Withdrawals – Full Lifecycle Verification Script
#  Location: /volume1/web/wattsun/scripts/loyalty_withdrawals_full_cycle.sh
#  Purpose : Verify Create → Approve → Mark Paid → Reject
#  Author  : WattSun DevOps (ChatGPT Assist)
#  Version : 2025-10-10
# ================================================================

set -e

DB="/volume1/web/wattsun/data/dev/wattsun.dev.db"
API="http://127.0.0.1:3001/api/admin/loyalty/withdrawals"
LOGIN_URL="http://127.0.0.1:3001/api/login"

echo "============================"
echo "🧩 START: Loyalty Withdrawals Test"
echo "============================"

# ------------------------------------------------------------
# 0️⃣ Login Check – refresh session if admin.jar is missing
# ------------------------------------------------------------
if [ ! -f admin.jar ]; then
  echo "⚠️  No admin session found. Logging in..."
  curl -s -i -c admin.jar \
    -H "Content-Type: application/json" \
    -d '{"email":"skamunyu@gmail.com","password":"Pass123"}' \
    $LOGIN_URL | grep -q '"success":true' && echo "✅ Admin login successful" || {
      echo "❌ Admin login failed. Check credentials or backend."
      exit 1
    }
else
  echo "✅ Using existing admin.jar session"
fi

# ------------------------------------------------------------
# 1️⃣ Create new withdrawal
# ------------------------------------------------------------
echo -e "\n➡️  Creating new withdrawal..."
curl -s -b admin.jar -H "Content-Type: application/json" \
  -d '{"accountId":1,"points":47,"note":"FullCycle test"}' \
  -X POST $API | tee /tmp/withdrawal_create.json

ID=$(jq -r '.withdrawal.id // empty' /tmp/withdrawal_create.json)

if [ -z "$ID" ]; then
  echo "❌ Withdrawal creation failed."
  cat /tmp/withdrawal_create.json
  exit 1
else
  echo "✅ Created withdrawal ID: $ID"
fi

sqlite3 $DB <<'SQL'
.headers on
.mode column
SELECT id, kind, points_delta, note, created_at
FROM loyalty_ledger
WHERE kind='withdraw'
ORDER BY id DESC LIMIT 3;
SQL

# ------------------------------------------------------------
# 2️⃣ Approve
# ------------------------------------------------------------
echo -e "\n➡️  Approving withdrawal #$ID..."
curl -s -b admin.jar -X PATCH $API/$ID/approve | tee /tmp/withdrawal_approve.json

sqlite3 $DB <<'SQL'
.headers on
.mode column
SELECT id, kind, note FROM loyalty_ledger
WHERE kind='withdraw'
ORDER BY id DESC LIMIT 3;
SQL

sqlite3 $DB <<'SQL'
.headers on
.mode column
SELECT id, kind, note, status FROM notifications_queue
WHERE kind LIKE 'withdrawal_%'
ORDER BY id DESC LIMIT 5;
SQL

# ------------------------------------------------------------
# 3️⃣ Mark as Paid
# ------------------------------------------------------------
echo -e "\n➡️  Marking withdrawal #$ID as paid..."
curl -s -b admin.jar -X PATCH $API/$ID/mark-paid | tee /tmp/withdrawal_paid.json

sqlite3 $DB <<'SQL'
.headers on
.mode column
SELECT id, kind, note FROM loyalty_ledger
WHERE kind='withdraw'
ORDER BY id DESC LIMIT 3;
SQL

sqlite3 $DB <<'SQL'
.headers on
.mode column
SELECT id, kind, note, status FROM notifications_queue
WHERE kind LIKE 'withdrawal_%'
ORDER BY id DESC LIMIT 5;
SQL

# ------------------------------------------------------------
# 4️⃣ Reject (for final state validation)
# ------------------------------------------------------------
echo -e "\n➡️  Rejecting withdrawal #$ID (safety check)..."
curl -s -b admin.jar -X PATCH $API/$ID/reject | tee /tmp/withdrawal_reject.json

sqlite3 $DB <<'SQL'
.headers on
.mode column
SELECT id, kind, note FROM loyalty_ledger
WHERE kind='withdraw'
ORDER BY id DESC LIMIT 3;
SQL

sqlite3 $DB <<'SQL'
.headers on
.mode column
SELECT id, kind, note, status FROM notifications_queue
WHERE kind LIKE 'withdrawal_%'
ORDER BY id DESC LIMIT 5;
SQL

# ------------------------------------------------------------
# 5️⃣ Summary
# ------------------------------------------------------------
echo -e "\n✅ FINAL SUMMARY"

sqlite3 $DB <<'SQL'
.headers on
.mode column
SELECT id, account_id, kind, points_delta, note, datetime(created_at) AS created
FROM loyalty_ledger
WHERE kind='withdraw'
ORDER BY id DESC LIMIT 5;
SQL

sqlite3 $DB <<'SQL'
.headers on
.mode column
SELECT id, kind, note, status, datetime(created_at) AS created
FROM notifications_queue
WHERE kind LIKE 'withdrawal_%'
ORDER BY id DESC LIMIT 5;
SQL

echo "============================"
echo "🏁 END OF TEST – Verify sequential IDs & correct Queued notifications."
echo "============================"
