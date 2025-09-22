# WattSun Loyalty Program

## Overview

The WattSun Loyalty Program is designed to reward active users, especially staff, with daily point accruals, periodic digests, and point withdrawal options. It is built on top of the existing WattSun SQLite infrastructure and includes admin-manageable settings, automated scripts, and customer-facing pages.

## Functional Scope

| Component                | Description |
|-------------------------|-------------|
| **Daily Accrual**       | +1 point/day for active accounts (cron script) |
| **Withdrawals**         | Redeem points if min balance met, with admin approval |
| **Penalty System**      | -1 point per infraction (manual/admin) |
| **Weekly Digest**       | Enqueue summary emails to active users |
| **Admin Settings**      | Configure eligibility, duration, thresholds, activation |
| **Status Changes**      | Activate, pause, or close user accounts |
| **Customer View**       | Member page: summary, history, withdrawal form |
| **Notification Worker** | Background process to email queued events |

## Roadmap Progress

### ✅ Completed (~55%)

- [x] Loyalty tables & ledger schema
- [x] Enroll user → default +100 pts
- [x] Manual withdrawal flow
- [x] Penalty endpoint
- [x] Admin-only views & withdrawal approval
- [x] Notification queue + worker
- [x] Email templates (penalty, redeem, etc.)
- [x] GET/PUT /api/admin/loyalty/program
- [x] PATCH /api/admin/loyalty/accounts/:id/status
- [x] Working customer summary & history

### 🟡 In Progress (~25%)

- [ ] `scripts/loyalty_daily_accrual.js`
- [ ] `scripts/loyalty_weekly_digest.js`
- [ ] API: `POST /api/admin/loyalty/penalties`
- [ ] `/partials/admin-loyalty-settings.html` (new)
- [ ] Notification worker setup (recurring or pm2)

### 🟥 Not Started (~20%)

- [ ] Task scheduling (cron/pm2/DSM Task Scheduler)
- [ ] Admin UI → Manage settings + accounts
- [ ] Log rotation for worker/server
- [ ] Rate limiting (optional)
- [ ] Final QA checklist

## Next Steps

1. **Implement daily accrual script**
   - Script: `scripts/loyalty_daily_accrual.js`
   - Ensure idempotent INSERT into ledger
2. **Test with manual run (not pm2 yet)**
3. **Add penalty email queue logic to route**
4. **UI: Start `admin-loyalty-settings.html` partial**

---

Version: `v1.0` (2025-09-21)  
See also: `migration-ledger.md`, `001-api-contracts.md`, `WattSun_Single_Source_of_Truth.docx`