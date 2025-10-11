## 🧩 Startup Notes — Loyalty Withdrawals Regression

**Date:** 2025-10-10  
**System:** WattSun Backend (Loyalty Module)  
**Purpose:** Summarize root cause, fixes, and define next testing startup points for the Loyalty Withdrawals regression series.

---

### 🔍 Initial Problem Summary

After integrating loyalty withdrawals with the new ledger + notification framework, several issues were observed during regression tests:

| Issue | Description | Symptom |
|-------|--------------|----------|
| **1. Missing Table Columns** | `loyalty_withdrawal_meta` was missing `admin_user_id` and `created_at`. | API returned `SERVER_ERROR: Create failed`, backend logs showed `no column named admin_user_id / created_at`. |
| **2. Broken Insert Chain** | The `run()` helper returned `undefined ledgerId` due to scope issues. | Ledger and meta inserts failed silently; notifications queued incorrectly. |
| **3. Notification Inconsistencies** | `kind='penalty'` appeared even for withdrawal actions. | Dedupe logic reused old penalty notification pattern. |
| **4. Frontend Status Logic** | Rows with `decided_at` still showed “Pending” and “Approve/Reject” remained clickable. | UI did not reflect approved → mark paid transition. |
| **5. Script Lock & Syntax Errors** | SQLite locks and `unexpected EOF` in full-cycle test script. | Heredocs and timing issues during DB read-after-write. |
| **6. Loyalty Reset Failure** | `loyalty_reset.sh` used non-existent `role` column in `users`. | `Parse error: table users has no column named role`. |

---

### ⚙️ Fixes Implemented

| Area | Fix Description | Verification |
|------|-----------------|---------------|
| **Database Schema** | Added missing `admin_user_id` and `created_at` columns via migration (`2025-10-10_loyalty_withdrawal_meta_fix.sql`). | Verified using `PRAGMA table_info(loyalty_withdrawal_meta)` (9 columns). |
| **DB Helper (`run`)** | Rewrote callback to correctly return `{ lastID, changes }`. | Ledger + meta insert IDs verified. |
| **Notifications** | Explicit inserts for `withdrawal_approved`, `withdrawal_paid`, `withdrawal_rejected`. | Queue IDs 323–325 show correct kinds. |
| **Frontend (Admin)** | `actionCellHtml()` updated to disable Approve/Reject after decision. | Confirmed in admin UI. |
| **Full-Cycle Script** | Rebuilt `loyalty_withdrawals_full_cycle.sh` with clean heredocs + sleep delays. | Withdrawal #99 ran end-to-end successfully. |
| **Reset Script** | Fixed `role` column insert, added `program_id`, start/end dates, notification purge. | Verified seeded account and clean state. |

---

### ✅ Verified End-to-End Behavior

| Action | Result | Notification | Ledger Entry |
|---------|---------|---------------|---------------|
| **Create Withdrawal** | Success (`status: Pending`) | none | “FullCycle test” |
| **Approve Withdrawal** | Success (`status: Approved`) | `withdrawal_approved` | “Withdrawal #99 approved” |
| **Mark Paid** | Success (`status: No Action`) | `withdrawal_paid` | “Withdrawal #99 paid” |
| **Reject** | Success (already marked paid) | `withdrawal_rejected` | “Withdrawal #99 rejected” |
| **Loyalty Reset** | Clears all + seeds 1 account (1000 pts) | none | clean baseline |

---

### 🚀 Startup Checklist — Regression Continuation

| Step | Task | Command |
|------|------|----------|
| 1️⃣ | Ensure schema migration applied | `sqlite3 data/dev/wattsun.dev.db < scripts/sql/2025-10-10_loyalty_withdrawal_meta_fix.sql` |
| 2️⃣ | Reset and seed test data | `sudo bash scripts/loyalty_reset.sh` |
| 3️⃣ | Start backend in interactive mode | `sudo node server.js` |
| 4️⃣ | Run full withdrawal test suite | `sudo bash scripts/loyalty_withdrawals_full_cycle.sh` |
| 5️⃣ | Verify notifications | `sqlite3 data/dev/wattsun.dev.db "SELECT id, kind, status FROM notifications_queue ORDER BY id DESC LIMIT 5;"` |
| 6️⃣ | Verify seeded account | `sqlite3 data/dev/wattsun.dev.db "SELECT user_id, points_balance, total_earned, status FROM loyalty_accounts;"` |

---

### 🧱 Next Regression Focus Areas

1. **Withdrawal Edge Cases**
   - Admin vs Customer initiated
   - Duplicate request detection
   - Ledger & notification idempotency

2. **Account Summary Sync**
   - Validate totals after payout or penalty
   - Check `points_balance` after withdrawal

3. **Daily/Weekly Scripts**
   - Confirm `loyalty_daily_accrual.js` and `loyalty_weekly_digest.js` skip settled accounts

4. **UI Dashboard**
   - Timeline updates in Admin view
   - Add totals and filters for withdrawals

---

### 🧾 Files Affected
```
routes/admin-loyalty-withdrawals.js
public/admin/js/admin-loyalty.js
public/admin/js/admin-loyalty-approve.js
public/admin/js/admin-loyalty-reject.js
public/admin/js/admin-loyalty-mark-paid.js
scripts/loyalty_withdrawals_full_cycle.sh
scripts/loyalty_reset.sh
scripts/sql/2025-10-10_loyalty_withdrawal_meta_fix.sql
```

---

### 🏷️ Current Tag
```
git tag -a loyalty-v2 -m "Loyalty Withdrawals stable release (E2E verified 2025-10-10)"
```

