-- 2025-09-17_add_order_indexes.sql
-- Adds indexes to speed up user lookups by email/phone in orders.

PRAGMA foreign_keys = ON;

BEGIN;

CREATE INDEX IF NOT EXISTS idx_orders_email_lower
  ON orders(LOWER(email));

CREATE INDEX IF NOT EXISTS idx_orders_phone_digits
  ON orders(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone,''), '+',''), ' ', ''), '-', ''), '(', ''), ')', '')
  );

COMMIT;
