const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { initializeSchema } = require('./schema');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'games.db');
const db = new Database(DB_PATH);
function restrictDatabaseFile(filename) {
  if (DB_PATH === ':memory:') return;
  try { fs.chmodSync(filename, 0o600); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
restrictDatabaseFile(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
for (const suffix of ['', '-wal', '-shm']) restrictDatabaseFile(`${DB_PATH}${suffix}`);

const { canonical, progression } = initializeSchema(db);
module.exports = { db, canonical, progression };
