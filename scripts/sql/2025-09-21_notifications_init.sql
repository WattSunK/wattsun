
PRAGMA foreign_keys = ON;

BEGIN;

-- -----------------------------------------------
-- Notifications Init — 2025-09-21 (Step 5a)
-- Queue + Templates + Invites (admin-triggered)
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS notifications_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                     -- 'penalty'|'status_change'|'weekly_digest'|'invite'|'withdrawal_update'
  user_id INTEGER,                        -- nullable for invites (pre-signup)
  email TEXT,                             -- fallback if user_id is null/unknown
  payload TEXT NOT NULL,                  -- JSON string with merge variables
  status TEXT NOT NULL DEFAULT 'Queued',  -- Queued|Sent|Failed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_notifq_status ON notifications_queue(status);
CREATE INDEX IF NOT EXISTS idx_notifq_user ON notifications_queue(user_id);

CREATE TABLE IF NOT EXISTS email_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,          -- 'penalty','status_change','weekly_digest','invite','withdrawal_update'
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed minimal templates if missing
INSERT OR IGNORE INTO email_templates (code, subject, html)
VALUES 
 ('penalty','Loyalty update: a penalty was applied',
  '<p>Hello,</p><p>A penalty of <strong>{{points}}</strong> point(s) was applied to your loyalty account.</p><p>Note: {{note}}</p><p>Your new balance is <strong>{{balance}}</strong> points.</p>'),
 ('status_change','Your loyalty account status changed',
  '<p>Hello,</p><p>Your loyalty account status changed from <strong>{{oldStatus}}</strong> to <strong>{{newStatus}}</strong>.</p><p>Note: {{note}}</p>'),
 ('weekly_digest','Your weekly loyalty summary',
  '<p>Hello,</p><p>Current balance: <strong>{{balance}}</strong> points.</p><p>Earned last 7 days: {{earned7}}</p><p>Penalties last 7 days: {{penalties7}}</p><p>Eligible to withdraw from: {{eligibleFrom}}</p>'),
 ('invite','You are invited to join WattSun as {{role}}',
  '<p>Hello,</p><p>You have been invited to register as a <strong>{{role}}</strong>.</p><p>Click the link to complete registration: {{signupLink}}</p><p>This link expires on {{expiresAt}}.</p>'),
 ('withdrawal_update','Update on your loyalty withdrawal request',
  '<p>Hello,</p><p>Your withdrawal request is now <strong>{{status}}</strong>.</p><p>Points: {{points}}, EUR: {{eur}}.</p><p>Reference: {{payoutRef}}</p>');

CREATE TABLE IF NOT EXISTS user_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'Staff',
  invited_by INTEGER,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

COMMIT;
