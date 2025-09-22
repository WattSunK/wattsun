# Runbook — Loyalty Program Sync Check

**Purpose:**  
Ensure loyalty-related files are properly tracked in Git and PC ↔ GitHub ↔ NAS are aligned before testing or deploying new increments.

---

## 1. Check NAS for modified or untracked files

From NAS repo root (`/volume1/web/wattsun`):

```bash
# Show modified files (if any)
git status -s

# Show untracked files (new files not in Git)
git ls-files --others --exclude-standard

# Narrow to loyalty program files only
git ls-files --others --exclude-standard | grep -i loyalty
git status -s | grep -i loyalty
```

👉 **Expected output:** nothing.  
If anything shows up → copy the file(s) back to PC, add to Git, commit, and push.

---

## 2. Verify recent commits & tags

```bash
# Show last 5 commits
git log --oneline -n 5

# Check loyalty tags
git tag --list | grep loyalty
```

👉 Confirm `loyalty-v1` (or later) exists.

---

## 3. Sync procedure (if NAS is behind)

On PC:

```bash
git pull origin feature/users-task2_1-wrapup
git add <new_loyalty_file>
git commit -m "Update loyalty program"
git push origin feature/users-task2_1-wrapup
git tag -f loyalty-v1   # or loyalty-v2 for new milestone
git push origin loyalty-v1 --force
```

On NAS:

```bash
cd /volume1/web/wattsun
scripts/git_pull_update.sh
git fetch --tags
```

---

## 4. Verification

```bash
ls -la scripts/loyalty_*.js
ls -la scripts/sql/*loyalty*.sql
```

Confirm the files exist and are up to date.

---

✅ If all checks pass, you can safely proceed to run `node scripts/loyalty_daily_accrual.js` or `node scripts/loyalty_weekly_digest.js`.
