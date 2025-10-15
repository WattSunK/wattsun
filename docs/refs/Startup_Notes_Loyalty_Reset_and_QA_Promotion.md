# 🧭 Startup Notes — Loyalty Reset & QA Promotion Validation

**Date:** 2025-10-15  
**Branch:** `post-auth-hardening`  
**Baseline Tag:** `auth-stable-2025-10-15`  
**Commit:** `2c35238` (verification scripts)  

---

## 🎯 Objective

Perform an end-to-end environment reset and promotion workflow:

1. Reset DEV using `loyalty_reset.sh`  
2. Verify authentication routes (signup/login) in DEV  
3. Promote DEV → QA using `promote_to_qa.sh`  
4. Verify QA environment health and authentication routes  

---

## 🧱 Step-by-Step Summary

### ✅ DEV: Loyalty Reset

```bash
sudo bash /volume1/web/wattsun/scripts/loyalty_reset.sh dev
```

**Result:**
- Tables cleaned and reseeded.
- Admin user: `wattsun1@gmail.com / Pass123`
- Loyalty account: 1000 points balance.
- No residual records.

**Verification:**
```bash
sudo /volume1/web/wattsun/scripts/verify_dev_auth.sh
```
✅ Output:
```
[dev] WattSun DEV Authentication Test
[dev] ✅ DEV authentication routes verified successfully.
```

---

### ✅ QA: Promote from DEV

```bash
sudo bash /volume1/web/wattsun/scripts/promote_to_qa.sh
```

**Result:**
- Latest commit pulled from GitHub (`2c35238`)
- QA DBs replaced from DEV
- QA loyalty tables cleaned and reseeded
- QA backend restarted and listening on port 3000
- Environment sync verification: ✅ both DEV (3001) & QA (3000) healthy

---

## 🧩 Verification Commands (for follow-up testing)

### Health
```bash
curl -s http://127.0.0.1:3000/api/health
curl -s http://127.0.0.1:3001/api/health
```

### Authentication
```bash
sudo /volume1/web/wattsun/scripts/verify_qa_auth.sh
sudo /volume1/web/wattsun/scripts/verify_dev_auth.sh
```

✅ Both should report:  
`Authentication routes verified successfully.`

---

## 🧾 Success Criteria

| Check | Environment | Expected Result |
|--------|--------------|------------------|
| Loyalty Reset | DEV | Clean tables + seeded admin |
| Signup/Login Test | DEV | Pass ✅ |
| Promotion Script | QA | DB copied, loyalty reset done |
| QA Health | QA | `/api/health → OK` |
| Signup/Login Test | QA | Pass ✅ |

---

## 🧠 Resolved Bug — Loyalty Account Email Blank

**Cause:**  
`loyalty_reset.sh` previously assumed admin user ID = 1.  
When `verify_dev_auth.sh` inserted a test user first, the admin became ID 2+, so the loyalty account linked to the wrong user.

**Fix:**  
Dynamic detection of admin ID via email:
```bash
admin_id=$(sqlite3 "$DB" "SELECT id FROM users WHERE email='wattsun1@gmail.com' LIMIT 1;")
```
Used when seeding the loyalty account.

**Result:**  
Loyalty account now correctly linked to the real admin (email visible in join views).  

**Verified:** 2025-10-15 (DEV reset test, admin ID = 24)

---

## 🔁 Next Actions

1. Run `verify_qa_auth.sh` again after QA boot to confirm parity.  
2. Perform a small loyalty transaction test (optional).  
3. Update `migration-ledger.md` with a note:  
   `2025-10-15 — Dev → QA Promotion verified post-auth-hardening`  
4. Add QA promotion verification section to SSOT doc under *Loyalty & Environment Validation*.

---
