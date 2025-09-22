Runbook: Recover & Resync When NAS Diverges

Purpose:
When NAS has diverged commits not in GitHub (local-only changes), we need to safely realign NAS → PC → GitHub without losing work.

🔧 Recovery Procedure
1. Create tarball of NAS working copy

On NAS, from repo root:

cd /volume1/web/wattsun
tar czf /volume1/Common/nas_wattsun_working_copy.tgz --exclude='.git' .


This creates a portable archive of your NAS working state (without Git history).

2. Transfer to PC

On PC:

Copy nas_wattsun_working_copy.tgz from \\<nas-ip>\Common\.

Place it in C:\Users\Steve\Documents\.

3. Extract into PC repo
cd C:\Users\Steve\Documents\wattsun
tar -xzf ..\nas_wattsun_working_copy.tgz -C .

4. Stage, commit, push
git add .
git commit -m "Full sync with NAS working state (loyalty program files included)"
git push origin feature/users-task2_1-wrapup

5. Realign NAS with GitHub

On NAS:

cd /volume1/web/wattsun
git fetch origin
git reset --hard origin/feature/users-task2_1-wrapup

✅ Verification
Confirm DBs preserved

Your databases are not tracked in Git but are preserved by the tarball.
Check them explicitly on NAS (and PC if needed):

ls -lh data/dev/


Expected files:

wattsun.dev.db (main database)

inventory.dev.db (placeholder or seeded DB)

Any .bak backup files

🧹 Cleanup After Sync

Once sync is confirmed and pushed:

# Remove temporary patches if any
rm -rf /tmp/loyalty_patches

# Remove working copy tarball from Common
rm -f /volume1/Common/nas_wattsun_working_copy.tgz

# Optional: prune Git objects to save space
cd /volume1/web/wattsun
git gc --prune=now


✅ End of Runbook