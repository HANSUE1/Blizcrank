"use strict";
// Opens the SQLite database (Node's built-in driver, no npm install needed),
// applies schema.sql and runs any pending migrations.

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_PATH = path.join(__dirname, "..", "data", "blitzcrank.db");

function openDatabase(file = process.env.DB_PATH || DEFAULT_PATH) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  // schema.sql is the full current schema and every statement is IF NOT EXISTS,
  // so a new database gets everything and an old one gets any new tables.
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  migrate(db);
  return db;
}

// Runs fn inside a transaction: throws -> rolled back, returns -> committed.
// The outermost call uses BEGIN IMMEDIATE (takes the write lock up front, so two
// checkouts can't both sell the last unit); nested calls become savepoints.
const depth = new WeakMap();
function transaction(db, fn) {
  const level = depth.get(db) || 0;
  const sp = `sp_${level}`;
  db.exec(level === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${sp}`);
  depth.set(db, level + 1);
  try {
    const result = fn();
    db.exec(level === 0 ? "COMMIT" : `RELEASE ${sp}`);
    return result;
  } catch (err) {
    db.exec(level === 0 ? "ROLLBACK" : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw err;
  } finally {
    depth.set(db, level);
  }
}

// ---- migrations -------------------------------------------------------------
// Upgrades for databases created by an older version of schema.sql.
// Each runs once, in order; PRAGMA user_version records how many have run.
// Never edit or reorder an existing entry — append a new one.

const hasColumn = (db, table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);

const MIGRATIONS = [
  // 1. Pre-order support on products.
  (db) => {
    if (!hasColumn(db, "products", "is_preorder")) {
      db.exec("ALTER TABLE products ADD COLUMN is_preorder INTEGER NOT NULL DEFAULT 0 CHECK (is_preorder IN (0, 1))");
    }
    if (!hasColumn(db, "products", "release_date")) db.exec("ALTER TABLE products ADD COLUMN release_date TEXT");
  },
  // 2. Expanded starter catalog + homepage banners. Only adds what's missing;
  //    an empty database is filled by the normal seed instead.
  (db) => {
    if (db.prepare("SELECT COUNT(*) AS n FROM products").get().n > 0) require("./seed").seedCatalog(db);
  },
];

function migrate(db) {
  const current = db.prepare("PRAGMA user_version").get().user_version;
  for (let i = current; i < MIGRATIONS.length; i++) {
    transaction(db, () => {
      MIGRATIONS[i](db);
      db.exec(`PRAGMA user_version = ${i + 1}`);
    });
  }
}

module.exports = { openDatabase, transaction, DEFAULT_PATH };
