# Cron Examples For Dev, QA, and Prod (NAS)

Run the same scripts in multiple environments by adding a separate cron entry per environment, each targeting its own DB path. Using `--db` ensures the correct database is used regardless of `.env`.

## Dev (keep running)

- Daily accrual (00:05 every day)
  - 5 0 * * * cd /volume1/web/wattsun && NODE_ENV=development /usr/bin/node scripts/loyalty_daily_accrual.js --db /volume1/web/wattsun/data/dev/wattsun.dev.db >> logs/dev-cron-daily.out 2>&1

- Weekly digest (Mondays 00:10)
  - 10 0 * * 1 cd /volume1/web/wattsun && NODE_ENV=development /usr/bin/node scripts/loyalty_weekly_digest.js --db /volume1/web/wattsun/data/dev/wattsun.dev.db >> logs/dev-cron-weekly.out 2>&1

## QA (run in parallel)

- Daily accrual (00:05 every day)
  - 5 0 * * * cd /volume1/web/wattsun/qa && NODE_ENV=qa /usr/bin/node scripts/loyalty_daily_accrual.js --db /volume1/web/wattsun/qa/data/qa/wattsun.qa.db >> logs/qa-cron-daily.out 2>&1

- Weekly digest (Mondays 00:10)
  - 10 0 * * 1 cd /volume1/web/wattsun/qa && NODE_ENV=qa /usr/bin/node scripts/loyalty_weekly_digest.js --db /volume1/web/wattsun/qa/data/qa/wattsun.qa.db >> logs/qa-cron-weekly.out 2>&1

## Prod (future)

- Daily accrual (00:05 every day)
  - 5 0 * * * cd /srv/wattsun/prod && NODE_ENV=production /usr/bin/node scripts/loyalty_daily_accrual.js --db /srv/wattsun/prod/data/prod/wattsun.prod.db >> logs/prod-cron-daily.out 2>&1

- Weekly digest (Mondays 00:10)
  - 10 0 * * 1 cd /srv/wattsun/prod && NODE_ENV=production /usr/bin/node scripts/loyalty_weekly_digest.js --db /srv/wattsun/prod/data/prod/wattsun.prod.db >> logs/prod-cron-weekly.out 2>&1

Notes
- Paths are examples; adjust to your actual directories.
- You can use `/usr/local/bin/node` instead of `/usr/bin/node` depending on your NAS.
- Passing `--db` overrides any `.env`; it is the safest way to avoid cross-environment mixups.
- Alternatively export `SQLITE_DB` to the environment-specific DB path before invoking `node`.
- Logs are written to `logs/*cron*.out`; rotate or truncate as needed.

Troubleshooting
- If output shows `DB = .../data/dev/...`, that entry is missing `--db` or an environment-specific `SQLITE_DB`.
- Ensure the target directory exists and the DB file path is correct for each environment.
- Confirm node path by running `which node` on the NAS.
