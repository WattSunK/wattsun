/**
 * db_users.js
 * Shared better-sqlite3 connection for user-related routes (login, signup, loyalty, etc.).
 * Keeps a single sync handle so changes are immediately visible across routes.
 */

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// Resolve environment and DB path (align with server.js + routes)
const env = process.env.NODE_ENV || "dev";
const dbPath =
  process.env.SQLITE_MAIN ||
  process.env.DB_PATH_USERS ||
  process.env.SQLITE_DB ||
  path.join(__dirname, "../data", env, `wattsun.${env}.db`);

if (!fs.existsSync(dbPath)) {
  console.error(`[db_users] Database not found at ${dbPath}`);
}

// Open a single shared, synchronous connection
const db = new Database(dbPath);
// Enforce foreign keys where supported
try { db.pragma("foreign_keys = ON"); } catch (_) {}

module.exports = db;

