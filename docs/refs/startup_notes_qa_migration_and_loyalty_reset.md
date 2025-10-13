# 🌟 Startup Notes — WattSun QA Migration & Loyalty Reset Validation

_Date: Oct 13, 2025_  
_Author: System Snapshot — NAS Environment_  

---

## 🌟 Objectives

1. **Re-verify the QA database migration**  
   - Confirm that `/volume1/web/wattsun/data/qa/wattsun.qa.db` exists and is fully initialized.  
   - Ensure schema matches DEV (`wattsun.dev.db`) including `users`, `orders`, `dispatches`, and `loyalty_*` tables.  
   - Verify symbolic links or direct file references used by QA server (port **3000**) point correctly to the QA DB.

2. **Test the new `WattSun Loyalty Reset Utility`**
   - Run `scripts/loyalty_reset.sh qa` and confirm:
     - QA database is writable.
     - User `wattsun1@gmail.com` (Admin, password `Pass123`) is seeded successfully.
     - A loyalty account with 1000 seed points is created and queryable via `/api/loyalty/*` routes.
   - Verify curl login:
     ```bash
     curl -s -X POST http://127.0.0.1:3000/api/login \
       -H "Content-Type: application/json" \
       -d '{"email":"wattsun1@gmail.com","password":"Pass123"}'
     ```
     → Expected `{ "success": true, "user": { ... } }`.

3. **Visual distinction – QA environment banner**
   - Add a subtle **yellow "QA Environment"** banner in:
     - `/public/index.html` (header or footer)
     - Include build/version marker, e.g.  
       `_QA Build v2025.10.13_`.

4. **Setup promotion workflow (DEV → QA)**
   - Implement one-click or scripted workflow for promoting tested DEV state to QA:
     - Sync `wattsun.dev.db → wattsun.qa.db`.
     - Restart QA service (`restart_wattsun.sh`).
     - Run validation test set (API health, login, loyalty endpoints).
   - Script candidates:
     - `/scripts/qa_sync_verify.sh`
     - `/scripts/qa_restart_cycle.sh`

5. **Monitoring setup**
   - Lightweight continuous ping for:
     - `http://127.0.0.1:3000/api/health`
     - `https://qa.wattsun.co.ke/api/health`
   - Report uptime and latency every 10–15 min.
   - Optional: push results to a local log or Telegram webhook.

---

## ⚠️ Current Observations

```
WattSun Loyalty Reset Utility
Target environment: QA
Database: /volume1/web/wattsun/data/qa/wattsun.qa.db
⚠️ Database not found — creating new empty file.
Error: unable to open database "/volume1/web/wattsun/data/qa/wattsun.qa.db": unable to open database file
```

This indicates the QA data directory (`/volume1/web/wattsun/data/qa/`) is missing or not writable.  
It must be created manually and assigned to the correct user before re-testing:

```bash
sudo mkdir -p /volume1/web/wattsun/data/qa
sudo chown -R 53Bret:users /volume1/web/wattsun/data/qa
sudo chmod 775 /volume1/web/wattsun/data/qa
```

Then rerun:
```bash
sudo bash /volume1/web/wattsun/scripts/loyalty_reset.sh qa
```

---

## ✅ Expected Deliverables in Next Thread

1. Verified QA DB presence and schema parity with DEV.  
2. Successful run of `loyalty_reset.sh qa` (clean → seed → confirm).  
3. Visual “QA Environment” banner added and deployed.  
4. Working DEV → QA promotion flow.  
5. Operational `/api/health` monitoring with uptime feedback.

