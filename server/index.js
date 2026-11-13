"use strict";
const http = require("node:http");
const { openDatabase } = require("../db");
const { seed } = require("../db/seed");
const { createApp } = require("./app");

const PORT = Number(process.env.PORT) || 3000;
const db = openDatabase();

// First run: fill an empty database with the starter catalog.
if (db.prepare("SELECT COUNT(*) AS n FROM products").get().n === 0) {
  const admin = seed(db, {
    adminEmail: process.env.ADMIN_EMAIL || undefined,
    adminPassword: process.env.ADMIN_PASSWORD || undefined,
  });
  console.log("Empty database — seeded the starter catalog.");
  console.log(`Admin login: ${admin.adminEmail}` + (admin.generated ? `  password: ${admin.password}  (save this; it is not shown again)` : ""));
}

// Housekeeping: drop expired sessions, flag stale guest carts as abandoned.
function cleanup() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  db.prepare(`UPDATE carts SET status = 'abandoned'
              WHERE status = 'active' AND user_id IS NULL AND updated_at < datetime('now', '-60 days')`).run();
}
cleanup();
setInterval(cleanup, 6 * 60 * 60 * 1000).unref();

http.createServer(createApp(db)).listen(PORT, () => {
  console.log(`Blitzcrank running at http://localhost:${PORT}`);
});
