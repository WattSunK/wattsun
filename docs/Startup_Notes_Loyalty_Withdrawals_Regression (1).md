# 🧾 Startup Notes — Loyalty Withdrawals Regression
_Date: 10 Oct 2025_

---

## 🧩 1️⃣ Context & Initial Problem

The **Loyalty Withdrawals Regression** investigation began after inconsistencies were detected in:
- **Account Balances**
- **Earned / Penalty / Paid** totals
- **Enrollment notifications** not queuing correctly

Symptoms:
1. Penalties and withdrawals were subtracting **both balance and earned**, violating the intended design.
2. Enrollment via `admin-loyalty.js` failed to respect program settings (duration, signup bonus).
3. Welcome message notifications caused DB errors:
   ```
   SQLITE_CONSTRAINT: NOT NULL constraint failed: notifications_queue.payload
   ```
4. Some accounts showed balance deducted but `total_paid` not incremented upon payout.
5. Enrollment occasionally failed with:
   ```
   SQLITE_CONSTRAINT: UNIQUE constraint failed: loyalty_ledger.account_id, loyalty_ledger.kind
   ```

---

## ⚙️ 2️⃣ What Has Been Fixed

| Area | Fix Summary | Status |
|------|--------------|--------|
| **Withdrawal creation** | Adjusted logic so withdrawals only subtract from `points_balance`, not from `total_earned`. | ✅ Fixed |
| **Penalty handling** | Created standalone `penalty` path updating `total_penalty` only (no impact on earned). | ✅ Fixed |
| **Enrollment logic** | Enrollment now uses admin-program duration and signup bonus (3 mo / 100 pts). | ✅ Fixed |
| **Welcome notifications** | Updated insert to include `payload` JSON column to satisfy schema. | ✅ Fixed |
| **DB triggers** | Removed `trg_ll_after_insert_recalc` and `trg_ll_after_delete_recalc` that caused double-counts. | ✅ Fixed |
| **Rollback safety** | Added better try/catch wrapping so failed inserts no longer rollback account creation. | ✅ Fixed |
| **Ledger math** | Sign-up bonus correctly logs to ledger and updates totals. | ✅ Fixed |

---

## ⚠️ 3️⃣ Outstanding Issues (as of 10 Oct 2025)

| Issue | Observation | Impact |
|-------|--------------|--------|
| **Balance and Paid mismatch** | New withdrawals reduce balance but `total_paid` not updated after payout confirmation. | Medium |
| **Unique constraint on enrollment** | Some accounts trigger `UNIQUE(account_id, kind)` in `loyalty_ledger`. Possibly due to re-enrollment without cleanup. | Medium |
| **Notification enqueue** | `payload` insertion logic still occasionally skipped due to missing user email. | Low |
| **Trigger cascade absence** | With removed triggers, `total_earned` must always be updated manually post-insert. | Medium |

---

## 🔍 4️⃣ Verification Snapshot

### Example (User ID 18)
| Metric | Value |
|--------|--------|
| Balance | 726 |
| Earned | 823 |
| Penalty | 10 |
| Paid | 47 |
| Ledger Rows | Withdraw(10,12), Penalty(11) |

### Example (User ID 1)
| Metric | Value |
|--------|--------|
| Balance | 0 |
| Earned | 0 |
| Paid | 0 |
| Issue | Ledger updated, totals not reflected |

---

## 🧪 5️⃣ Next Regression Tests

### (A) Enrollment Regression Retest
```bash
curl -s -X POST http://127.0.0.1:3001/api/admin/loyalty/accounts   -b admin.jar -H "Content-Type: application/json"   -d '{"userId":7}'
sqlite3 /volume1/web/wattsun/data/dev/wattsun.dev.db "
SELECT id,user_id,points_balance,total_earned
FROM loyalty_accounts ORDER BY id DESC LIMIT 1;
SELECT kind,status,payload FROM notifications_queue WHERE kind='loyalty_welcome' ORDER BY id DESC LIMIT 1;
"
```

✅ Expected:
- Account created with `balance=100`, `earned=100`.
- `notifications_queue.payload` contains JSON message.

---

### (B) Withdrawal Life Cycle Retest
1. **Create new withdrawal** (deduct balance only).
2. **Approve & mark paid** → increment `total_paid`.
3. Verify totals:
   ```bash
   SELECT points_balance,total_paid,total_earned,total_penalty
   FROM loyalty_accounts WHERE user_id=TEST_USER;
   ```

✅ Expected:
- Balance reduces by withdrawal points.
- Total_paid increases by same amount.

---

### (C) Penalty Path Regression
Confirm:
```bash
curl -s -X POST http://127.0.0.1:3001/api/admin/loyalty/penalize   -b admin.jar -H "Content-Type: application/json"   -d '{"userId":TEST_USER,"points":10,"note":"Penalty regression test"}'
```

✅ Expected:
- `total_penalty` += 10  
- `points_balance` -= 10  
- No impact on `total_earned`.

---

## 🧱 6️⃣ Next Steps

1. Refactor `loyalty_withdrawals.js` to:
   - Increment `total_paid` on status=“Paid”.
   - Enforce idempotency via dedupe key.
2. Review `notifications_queue` inserts:
   - Ensure fallback email or default payload for missing addresses.
3. Run `tests/loyalty_regression_fullcycle.sh` (to be generated next).
4. Add SQL health check for mismatched aggregates.

---

## 🏁 7️⃣ Definition of Done for Regression Cycle
✅ Enrollment reflects program settings  
✅ Notifications enqueue successfully (no NULL payloads)  
✅ Withdrawals deduct balance and increment paid  
✅ Penalties update only penalty column  
✅ Balances reconcile with ledger totals  

---

_These notes close the Enrollment Regression round and open the **Loyalty Withdrawals Regression** debugging phase._
