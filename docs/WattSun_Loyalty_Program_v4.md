# WattSun Loyalty Program — v4 (2025-09-23)

## Overview
The WattSun Loyalty Program rewards active users and staff with daily point accruals, periodic digests, and point withdrawal options.  
It is built on the existing WattSun SQLite infrastructure and includes:

- Admin-managed settings  
- Automated scripts (daily accrual, weekly digest)  
- Customer-facing history/summary pages  
- Notification worker for emails  

Points accrue at **+1/day** while the account is Active. Points can be redeemed (EUR equivalent) subject to eligibility and admin approval. Admins may also post penalties.

---

## Functional Scope

| Component                | Description |
|--------------------------|-------------|
| **Daily Accrual**        | +1 point/day for Active accounts (via scheduled script). |
| **Withdrawals**          | Redeem points once min balance met; routed through admin approval. |
| **Penalty System**       | -1 point/infraction (manual admin posting). |
| **Weekly Digest**        | Summaries enqueued to notifications queue, emailed to Active users. |
| **Admin Settings**       | Configure eligibility, thresholds, activation toggle. |
| **Status Changes**       | Activate, pause, or close user accounts. |
| **Customer View**        | Loyalty member page: summary, history, withdrawal form. |
| **Notification Worker**  | Background process to send queued notifications. |

---

## Entities

- `loyalty_accounts`  
- `loyalty_ledger`  
- `withdrawals`  
- `notifications_queue`

---

## Admin Features

- Approve / Reject withdrawals  
- Apply penalties  
- View balances and ledger history  
- Manage account status (Active / Paused / Closed)  
- Adjust program settings (eligibility, duration, minimum withdrawal)  

---

## Roadmap Progress

### ✅ Completed (~60%)
- Loyalty tables & ledger schema
- Default enrollment bonus (+100 pts)
- Manual withdrawal flow
- Withdrawal approval + admin UI
- Penalty endpoint implemented
- Admin-only views for Accounts, Ledger, Withdrawals, Notifications
- Filters in admin UI reset correctly between tabs
- Ledger API patched (`points_delta` → `delta_points`) for UI column
- Notification queue & worker
- Email templates (penalty, redeem, approvals)
- GET/PUT `/api/admin/loyalty/program`
- PATCH `/api/admin/loyalty/accounts/:id/status`
- Working customer summary & history

### 🟡 In Progress (~25%)
- `scripts/loyalty_daily_accrual.js` (manual run + scheduling)
- `scripts/loyalty_weekly_digest.js` (stub → enqueue digest emails)
- API: `POST /api/admin/loyalty/penalties`
- Admin partial: `/partials/admin-loyalty-settings.html`
- Notification worker recurring setup (pm2/cron)

### 🟥 Not Started (~15%)
- Scheduling layer (cron / pm2 / DSM Task Scheduler)
- Admin UI for program settings + account management
- Log rotation for loyalty scripts/worker
- Rate limiting (optional)
- Final QA checklist

---

## Files Created So Far
- **Database**
  - `data/dev/wattsun.dev.db` — includes `loyalty_accounts`, `loyalty_ledger`, `withdrawals`, `notifications_queue`
- **Backend Routes**
  - `routes/loyalty.js` (customer withdrawal + ledger routes)
  - `routes/admin-loyalty.js` (program config, penalties, status changes)
- **Frontend (Admin)**
  - `public/partials/admin-loyalty.html` (main admin loyalty panel with tabs: Withdrawals, Accounts, Ledger, Notifications)
  - `public/admin/js/admin-loyalty.js` (tab loader, filters, table rendering)
- **Scripts**
  - `scripts/loyalty_daily_accrual.js` (to be implemented next)
  - `scripts/loyalty_weekly_digest.js` (stub planned)
- **Ops**
  - NAS helpers already in use: `scripts/start_nas.sh`, `scripts/stop_nas.sh`, `scripts/restart_nas.sh` (updated for .env fixes)

---

## Next Steps
1. **Daily Accrual Script**
   - Implement `scripts/loyalty_daily_accrual.js`.
   - Ensure idempotent ledger inserts (+1/day/account).
   - Run manually once to verify inserts.
   - Add cron / DSM Task Scheduler entry.

2. **Weekly Digest Script**
   - Create stub `scripts/loyalty_weekly_digest.js`.
   - Queue summary notifications for Active accounts.

3. **Penalty Enhancements**
   - Add penalty email queue logic to `POST /api/admin/loyalty/penalties`.

4. **Admin UI**
   - Start `admin-loyalty-settings.html` partial.
   - Allow admins to configure program eligibility, thresholds, activation toggle.

5. **Ops & Monitoring**
   - Add scheduling to pm2/DSM Task Scheduler.
   - Add log rotation and monitoring for loyalty scripts.
   - Final QA checklist for end-to-end loyalty flow.

---

**Version:** v4 (2025-09-23)  
**Source merged from:** v1.0, v1.1, v2, v3, rolling draft.  
**Linked refs:** `001-api-contracts.md`, `migration-ledger.md`, `WattSun_Single_Source_of_Truth.docx`
