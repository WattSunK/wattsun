#!/bin/bash
# File: tests/loyalty_withdrawals_full_cycle.sh
# Purpose: Verify Create → Approve → MarkPaid → Reject
# Run from: /volume1/web/wattsun/

set -e
DB="/volume1/web/wattsun/data/dev/wattsun.dev.db"
API="http://127.0.0.1:3001/api/admin/loyalty/withdrawals"

echo "============================"
echo "🧩 START: Loyalty Withdrawals Test"
echo "============================"

# 1️⃣ CREATE NEW WITHDRAWAL
echo -e "\n➡️  Creating new withdrawal..."
curl -s -b admin.jar -H "Content-Type: application/json" \
  -d '{"accountId":1,"points":47,"note":"FullCycle test"}' \
  -X POST $API | tee /tmp/withdrawal_create.json

ID=$(jq -r '.withdrawal.id' /tmp/withdrawal_create.json)
echo "✅ Created withdrawal ID: $ID"

# Confirm ledger entry
sqlite3 $DB "SELECT id, kind, points_delta, note FROM loyalty_ledger WHERE kind='withdraw' ORDER BY id DESC LIMIT 1;"

# 2️⃣ APPROVE
echo -e "\n➡️  Approving withdrawal #$ID..."
curl -s -b admin.jar -X PATCH $API/$ID/approve | tee /tmp/withdrawal_approve.json
sqlite3 $DB "SELECT id, kind, note FROM loyalty_ledger WHERE kind='withdraw' ORDER BY id DESC LIMIT 2;"
sqlite3 $DB "SELECT id, kind, note, status FROM notifications_queue WHERE kind LIKE 'withdrawal_%' ORDER BY id DESC LIMIT 3;"

# 3️⃣ MARK AS PAID
echo -e "\n➡️  Marking withdrawal #$ID as paid..."
curl -s -b admin.jar -X PATCH $API/$ID/mark-paid | tee /tmp/withdrawal_paid.json
sqlite3 $DB "SELECT id, kind, note FROM loyalty_ledger WHERE kind='withdraw' ORDER BY id DESC LIMIT 2;"
sqlite3 $DB "SELECT id, kind, note, status FROM notifications_queue WHERE kind LIKE 'withdrawal_%' ORDER BY id DESC LIMIT 3;"

# 4️⃣ REJECT (simulate subsequent rejection after paid — should still queue but not re-insert)
echo -e "\n➡️  Rejecting withdrawal #$ID (for safety check)..."
curl -s -b admin.jar -X PATCH $API/$ID/reject | tee /tmp/withdrawal_reject.json
sqlite3 $DB "SELECT id, kind, note FROM loyalty_ledger WHERE kind='withdraw' ORDER BY id DESC LIMIT 2;"
sqlite3 $DB "SELECT id, kind, note, status FROM notifications_queue WHERE kind LIKE 'withdrawal_%' ORDER BY id DESC LIMIT 5;"

# 5️⃣ FINAL SUMMARY
echo -e "\n✅ SUMMARY CHECK:"
sqlite3 $DB "
.headers on
.mode column
SELECT id, account_id, kind, points_delta, note, created_at
FROM loyalty_ledger WHERE kind='withdraw'
ORDER BY id DESC LIMIT 5;
"

sqlite3 $DB "
.headers on
.mode column
SELECT id, kind, note, status, datetime(created_at) AS created
FROM notifications_queue
WHERE kind LIKE 'withdrawal_%'
ORDER BY id DESC LIMIT 5;
"

echo "============================"
echo "🏁 END OF TEST — If all queries return without error and IDs increase sequentially, the flow is healthy."
echo "============================"
