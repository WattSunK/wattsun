-- Migration: Add driverId column to orders table
-- Date: 2025-10-05

ALTER TABLE orders ADD COLUMN driverId TEXT NULL;

-- Optional: if you want to enforce relationship later:
--   driverId should reference users(id) where users.type = 'Driver'
-- For now, just a nullable column to store driver assignments.
