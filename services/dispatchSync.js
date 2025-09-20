// services/dispatchSync.js
const sqlite3 = require('sqlite3').verbose();

function openDb() {
  return new sqlite3.Database(
    process.env.DB_PATH_USERS || process.env.SQLITE_DB || './data/dev/wattsun.dev.db'
  );
}

/**
 * Ensure a dispatch exists when an order becomes Confirmed.
 * Idempotent: if a non-cancelled dispatch already exists, do nothing.
 */
function ensureDispatchForConfirmedOrder(orderId, changedBy = 0, note = 'auto from order Confirmed') {
  return new Promise((resolve, reject) => {
    const db = openDb();
    db.serialize(() => {
      db.get(
        `SELECT id FROM dispatches
         WHERE order_id = ? AND IFNULL(status,'') <> 'Cancelled'
         ORDER BY id DESC LIMIT 1`,
        [orderId],
        (err, row) => {
          if (err) { db.close(); return reject(err); }
          if (row && row.id) { db.close(); return resolve({ created:false, dispatchId: row.id }); }

          db.run(
            `INSERT INTO dispatches (order_id, driver_id, status, planned_date, notes, created_at, updated_at)
             VALUES (?, NULL, 'Created', NULL, ?, datetime('now'), datetime('now'))`,
            [orderId, note],
            function (err2) {
              if (err2) { db.close(); return reject(err2); }
              const dispatchId = this.lastID;
              db.run(
                `INSERT INTO dispatch_status_history (dispatch_id, old_status, new_status, changed_by, note, changed_at)
                 VALUES (?, NULL, 'Created', ?, ?, datetime('now'))`,
                [dispatchId, changedBy, note],
                (err3) => {
                  db.close();
                  if (err3) return reject(err3);
                  resolve({ created:true, dispatchId });
                }
              );
            }
          );
        }
      );
    });
  });
}

module.exports = { ensureDispatchForConfirmedOrder };
