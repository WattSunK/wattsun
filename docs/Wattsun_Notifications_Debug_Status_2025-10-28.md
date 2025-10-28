# ⚡ WattSun Notifications — Debug Status (2025-10-28)

## 🧭 Context
Goal: ensure queued notifications in `notifications_queue` are processed correctly by the background worker (`scripts/notifications_worker.js`) and that actual emails are sent successfully in both DEV and QA environments.

---

## ✅ 1. Environment & File Setup — Completed

| Area | Status | Details |
|------|---------|----------|
| `.env` (DEV) | ✅ | `/data/dev/wattsun.dev.db`, `NOTIFY_DRY_RUN=1` (safe sandbox) |
| `.env.qa` | ✅ | `/data/qa/wattsun.qa.db`, `NOTIFY_DRY_RUN=0`, Gmail SMTP credentials |
| `start_dev.sh` | ✅ | Exports `ENV_FILE=/volume1/web/wattsun/.env`, `NODE_ENV=development` |
| `start_qa.sh` | ✅ | Exports `ENV_FILE=/volume1/web/wattsun/qa/.env.qa`, `NODE_ENV=qa` |
| `notifications_worker.js` | ✅ | Generic dotenv; obeys `ENV_FILE` from launcher |
| Isolation test | ✅ | DEV → dryRun=true / QA → dryRun=false confirmed |

---

## ✅ 2. Database Schema & Logic Checks — Completed

| Component | Finding | Fix |
|------------|----------|----|
| `notifications_queue` | ✅ Has `email` + `status` | Worker aligned to use `email` |
| `email_templates` | ✅ Exists, 13 entries | OK |
| `status` values` | ✅ Proper case (“Queued”) | OK |
| Write permissions | ✅ Works (manual test) | OK |

✅ Worker can read/write to QA DB; schema consistent.

---

## 🔧 3. Worker Logic Investigation — Ongoing

| Step | Finding | Status |
|------|----------|--------|
| Row loading | ✅ Loads 4 queued rows | Confirmed |
| Sending loop | ⚠️ No errors, but `sent=0` | Silent fail |
| SMTP verify | ⚠️ No `verify failed` logs | Transporter may be uninitialized |
| DB updates | ✅ Works | — |
| Error handling | ⚠️ None triggered | Send fails silently |

🧠 Interpretation: `tx.sendMail()` executes but does not deliver (missing/invalid credentials).

---

## 🟥 4. Outstanding Root-Cause Tasks

| Task | Purpose | Priority |
|------|----------|-----------|
| A. Verify SMTP vars in worker | Ensure `SMTP_USER`, `PASS`, `HOST`, `NOTIFY_DRY_RUN` load correctly | 🔥 |
| B. Add transporter `.verify()` check | Detect/log auth failures | 🔥 |
| C. Log `sendMail()` responses | Inspect Nodemailer return object | 🔧 |
| D. Validate Gmail credentials | Via `smtp_test_send.js` | 🔧 |
| E. Confirm QA exports correct env | `start_qa.sh` vs worker | 🔧 |

---

## 🧩 5. Recommended Next Steps

### Step 1 – Add debug block
```js
console.log(`[worker:debug] SMTP_USER=${process.env.SMTP_USER}`);
console.log(`[worker:debug] SMTP_PASS=${process.env.SMTP_PASS ? '[hidden]' : '(none)'}`);
console.log(`[worker:debug] SMTP_HOST=${process.env.SMTP_HOST}`);
console.log(`[worker:debug] DRY_RUN=${process.env.NOTIFY_DRY_RUN}`);
```

### Step 2 – Verify connection
```js
try {
  await tx.verify();
  console.log('[worker:debug] SMTP connection verified');
} catch (e) {
  console.error('[worker:debug] SMTP verify failed:', e.message);
}
```

### Step 3 – Log sendMail() result
```js
console.log('[worker:debug] sendMail() result:', info);
```

Then restart QA and check logs.

---

## ⚙️ 6. Validation Targets

| Env | Expected Behavior | Verify |
|------|------------------|--------|
| DEV | dry-run true → “[DRY_RUN] Would send…” | `tail -n 10 logs/dev/worker.out` |
| QA | dry-run false → real send | `tail -n 10 qa/logs/worker.out` |
| Both | Queue rows → Sent | `sqlite3 ... SELECT id,email,status,sent_at ...` |

---

## 🧾 7. Current State

| Component | DEV | QA |
|------------|-----|----|
| DB Path | ✅ `/data/dev/wattsun.dev.db` | ✅ `/data/qa/wattsun.qa.db` |
| DRY_RUN | ✅ true | ✅ false |
| Worker | ✅ | ✅ |
| Rows processed | ✅ | ✅ |
| Emails sent | 🟡 simulated | 🟥 none |
| Errors logged | ✅ none | ⚠️ none |

---

## 🔚 Conclusion

Everything except actual SMTP send works.  
Next milestone: confirm environment variables in the worker and capture `tx.verify()` / `sendMail()` responses.

**Once these are visible and successful, both DEV and QA notification pipelines will be fully operational.**
