# WattSun Loyalty Program – Baseline v1.0

## Overview
The WattSun Loyalty Program rewards customers for continued usage and engagement. The system is points-based, granting +1 point per day to active subscribers, redeemable in Euros.

## Functional Scope
- Points accrue daily (+1/day)
- Points redeemable to EUR after eligibility period (e.g. 90 days)
- Admin approval flow for withdrawals
- Status-based account control: Active, Paused, Closed
- Notification system (email): digest, penalties, approvals

## Key Entities
- `loyalty_accounts`
- `loyalty_ledger`
- `withdrawals`
- `notifications_queue`

## Admin Features
- Approve/Reject withdrawals
- Apply penalties
- View account balances and history
- Configure loyalty settings

## Implementation Status (as of v1.0)
| Component                      | Status     |
|-------------------------------|------------|
| DB Tables                     | ✅ Complete |
| Ledger Insert (Manual)       | ✅ Complete |
| Withdrawal Request            | ✅ Complete |
| Admin Approve UI              | ✅ Complete |
| Notifications: Penalty/Email | ✅ Complete |
| Daily Accrual Script          | ⏳ Pending  |
| Weekly Digest Script          | ⏳ Pending  |
| Admin Settings UI             | ⏳ Pending  |
| Penalty API                   | ⏳ Pending  |
| Status Toggle API             | ⏳ Pending  |
| Scheduled Jobs (pm2/cron)     | ⏳ Pending  |
| Log Rotation & Monitoring     | ⏳ Pending  |