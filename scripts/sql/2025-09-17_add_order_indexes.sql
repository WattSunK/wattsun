-- 2025-09-17_add_order_indexes.sql
-- Purpose: Speed up email/phone lookups for Users↔Orders joins and filters.
-- Safe to run multiple times.

PRAGMA foreign_keys = ON;
BEGIN;

-- Email lookups on orders (mirrors users LOWER(email) index).
CREATE INDEX IF NOT EXISTS idx_orders_email_lower
  ON orders(LOWER(email));

-- Digits-only phone index on orders (strips +, spaces, dashes and parens).
CREATE INDEX IF NOT EXISTS idx_orders_phone_digits
  ON orders(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone,''), '+',''), ' ', ''), '-', ''), '(', ''), ')', '')
  );

COMMIT;