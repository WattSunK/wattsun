-- scripts/sql/2025-09-13_add_dispatch_status_history.sql
-- Purpose: add dispatch_status_history + helpful indexes
PRAGMA foreign_keys = ON;

BEGIN;

CREATE TABLE IF NOT EXISTS dispatch_status_history (
  id              INTEGER PRIMARY KEY,
  dispatch_id     INTEGER NOT NULL,
  changed_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  old_status      TEXT,
  new_status      TEXT    NOT NULL,
  changed_by      INTEGER,
  note            TEXT,
  FOREIGN KEY (dispatch_id) REFERENCES dispatches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dsh_dispatch_id ON dispatch_status_history(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_dsh_changed_at ON dispatch_status_history(changed_at);

COMMIT;
