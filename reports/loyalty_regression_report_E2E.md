# Loyalty Regression Report (E2E Validation)

**Date:** $(date +"%Y-%m-%d")  
**Executed By:** $(whoami)  
**Environment:** /volume1/web/wattsun/data/dev/wattsun.dev.db

---

## ✅ Summary

| Step | Description | Result |
|------|--------------|---------|
| 1 | Foreign keys enabled | |
| 2 | Triggers present | |
| 3 | Auto-create loyalty account | |
| 4 | Soft delete → Inactive | |
| 5 | Reactivate → Active | |
| 6 | Hard delete → Cascade OK | |
| 7 | Ledger insert/delete updates balance | |
| 8 | View integrity (no blank emails) | |

---

## 🧩 Logs & Findings

Paste shell output and key SQL excerpts here.

---

## 🧹 Cleanup Verification

```sql
SELECT COUNT(*) FROM loyalty_accounts WHERE user_id NOT IN (SELECT id FROM users);
```

---

**Next Steps:**  
- Verify notifications_queue population  
- Run daily accrual and weekly digest afterward  
- Commit migration and test scripts to Git
