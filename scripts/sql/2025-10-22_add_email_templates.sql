PRAGMA foreign_keys = ON;
BEGIN;

-- Ensure table exists (idempotent)
CREATE TABLE IF NOT EXISTS email_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Order created (customer/admin generic; payload: orderNumber, name, total, role)
INSERT OR IGNORE INTO email_templates (code, subject, html) VALUES
 ('order_created', 'Order {{orderNumber}} received',
  '<p>Hello {{name}},</p><p>Your order <strong>{{orderNumber}}</strong> has been received.</p><p>Total: <strong>{{total}}</strong></p><p>We will keep you updated. <em>(Copy: {{role}})</em></p>');

-- Order delivered (customer/admin generic; payload: orderNumber, name, deliveredAt, role)
INSERT OR IGNORE INTO email_templates (code, subject, html) VALUES
 ('order_delivered', 'Order {{orderNumber}} delivered',
  '<p>Hello {{name}},</p><p>Your order <strong>{{orderNumber}}</strong> was delivered on {{deliveredAt}}.</p><p>Thank you for choosing WattSun. <em>(Copy: {{role}})</em></p>');

-- Loyalty welcome (payload: message, accountId, durationMonths, withdrawWaitDays)
INSERT OR IGNORE INTO email_templates (code, subject, html) VALUES
 ('loyalty_welcome', 'Welcome to WattSun Loyalty',
  '<p>{{message}}</p><p>Account ID: <strong>{{accountId}}</strong></p><p>Enrollment: {{durationMonths}} months • Withdraw after {{withdrawWaitDays}} days.</p>');

-- Loyalty penalty template already exists as ''penalty'' in base init; keep here for completeness if missing
INSERT OR IGNORE INTO email_templates (code, subject, html) VALUES
 ('penalty','Loyalty update: a penalty was applied',
  '<p>Hello,</p><p>A penalty of <strong>{{points}}</strong> point(s) was applied to your loyalty account.</p><p>Note: {{note}}</p><p>Your new balance is <strong>{{balance}}</strong> points.</p>');

-- Loyalty withdrawal updates (payload may include message/points/eur/payoutRef)
INSERT OR IGNORE INTO email_templates (code, subject, html) VALUES
 ('withdrawal_approved','Your loyalty withdrawal was approved',
  '<p>Hello,</p><p>Your loyalty withdrawal request has been <strong>approved</strong>.</p><p>{{message}}</p>');

INSERT OR IGNORE INTO email_templates (code, subject, html) VALUES
 ('withdrawal_paid','Your loyalty withdrawal was paid',
  '<p>Hello,</p><p>Your withdrawal has been <strong>paid</strong>.</p><p>{{message}}</p><p>Reference: {{payoutRef}}</p>');

INSERT OR IGNORE INTO email_templates (code, subject, html) VALUES
 ('withdrawal_rejected','Your loyalty withdrawal was rejected',
  '<p>Hello,</p><p>Your loyalty withdrawal request was <strong>rejected</strong>.</p><p>{{message}}</p>');

-- Authentication lifecycle
INSERT OR IGNORE INTO email_templates (code, subject, html) VALUES
 ('user_signup','Welcome to WattSun',
  '<p>Welcome to WattSun!</p><p>Your account has been created successfully.</p>');

INSERT OR IGNORE INTO email_templates (code, subject, html) VALUES
 ('password_reset','Password reset instructions',
  '<p>You (or someone) requested a password reset.</p><p>If you did not request this, you can ignore this email.</p>');

COMMIT;

