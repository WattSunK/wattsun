# WattSun Loyalty Program – Rolling Implementation Log

## Phase Breakdown

### ✅ Phase 1 – Schema + API Base
- Ledger table created
- Withdrawals table created
- Enqueue logic for notifications
- `/api/loyalty/withdraw` route tested

### ✅ Phase 2 – Admin View & Actions
- Admin withdrawals panel built
- Approval & payout actions work
- Ledger entries validated post-approval

### ✅ Phase 3 – Server & Session Fixes
- Resolved .env SMTP crash
- Updated `start_nas.sh` / `stop_nas.sh`
- Verified manual server start works

### 🔜 Phase 4 – Scripts & Scheduling

#### Next Increment: Daily Accrual Script
- [ ] Add `scripts/loyalty_daily_accrual.js`
- [ ] Run manually
- [ ] Schedule via cron / Task Scheduler

### 🪫 Still Pending
- Weekly Digest Script
- Admin Program Settings Editor
- Status Change API + UI
- Penalty Posting (Admin)
- Program Activation Toggle
- Final PM2 or systemd or cron ops layer