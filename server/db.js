const path = require('node:path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'games.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    email TEXT COLLATE NOCASE,
    avatar_path TEXT,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS user_integrations (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    steamgriddb_key TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL COLLATE NOCASE,
    platform TEXT NOT NULL,
    pegi INTEGER CHECK (pegi IS NULL OR pegi IN (3, 7, 12, 16, 18)),
    ownership TEXT NOT NULL DEFAULT 'owned' CHECK (ownership IN ('owned', 'wanted', 'unavailable')),
    play_status TEXT NOT NULL DEFAULT 'backlog' CHECK (play_status IN ('backlog', 'playing', 'completed', 'paused', 'abandoned')),
    media_format TEXT NOT NULL DEFAULT 'physical' CHECK (media_format IN ('physical', 'digital', 'unknown')),
    cartridge_number INTEGER,
    publisher TEXT NOT NULL DEFAULT '',
    release_year INTEGER,
    notes TEXT NOT NULL DEFAULT '',
    favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
    pegi_url TEXT NOT NULL DEFAULT '',
    cover_url TEXT NOT NULL DEFAULT '',
    cover_source TEXT NOT NULL DEFAULT '',
    cover_match_title TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const userColumns = db.pragma('table_info(users)').map(column => column.name);
if (!userColumns.includes('email')) db.exec('ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE');
if (!userColumns.includes('avatar_path')) db.exec('ALTER TABLE users ADD COLUMN avatar_path TEXT');
const gameColumns = db.pragma('table_info(games)').map(column => column.name);
if (!gameColumns.includes('user_id')) db.exec('ALTER TABLE games ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
if (!gameColumns.includes('cover_url')) db.exec("ALTER TABLE games ADD COLUMN cover_url TEXT NOT NULL DEFAULT ''");
if (!gameColumns.includes('cover_source')) db.exec("ALTER TABLE games ADD COLUMN cover_source TEXT NOT NULL DEFAULT ''");
if (!gameColumns.includes('cover_match_title')) db.exec("ALTER TABLE games ADD COLUMN cover_match_title TEXT NOT NULL DEFAULT ''");

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_games_user ON games(user_id);
  CREATE INDEX IF NOT EXISTS idx_games_platform ON games(platform);
  CREATE INDEX IF NOT EXISTS idx_games_ownership ON games(ownership);
  CREATE INDEX IF NOT EXISTS idx_games_pegi ON games(pegi);
  CREATE INDEX IF NOT EXISTS idx_games_title ON games(title COLLATE NOCASE);
`);

const selectFields = `id, title, platform, pegi, ownership, play_status AS playStatus,
  media_format AS mediaFormat, cartridge_number AS cartridgeNumber, publisher,
  release_year AS releaseYear, notes, favorite, pegi_url AS pegiUrl,
  cover_url AS coverUrl, cover_source AS coverSource, cover_match_title AS coverMatchTitle,
  created_at AS createdAt, updated_at AS updatedAt`;

const insert = db.prepare(`
  INSERT INTO games (user_id, title, platform, pegi, ownership, play_status, media_format,
    cartridge_number, publisher, release_year, notes, favorite, pegi_url,
    cover_url, cover_source, cover_match_title)
  VALUES (@userId, @title, @platform, @pegi, @ownership, @playStatus, @mediaFormat,
    @cartridgeNumber, @publisher, @releaseYear, @notes, @favorite, @pegiUrl,
    @coverUrl, @coverSource, @coverMatchTitle)
`);
const update = db.prepare(`
  UPDATE games SET title=@title, platform=@platform, pegi=@pegi, ownership=@ownership,
    play_status=@playStatus, media_format=@mediaFormat, cartridge_number=@cartridgeNumber,
    publisher=@publisher, release_year=@releaseYear, notes=@notes, favorite=@favorite,
    pegi_url=@pegiUrl, cover_url=@coverUrl, cover_source=@coverSource,
    cover_match_title=@coverMatchTitle, updated_at=CURRENT_TIMESTAMP WHERE id=@id AND user_id=@userId
`);

function normalizeGame(input = {}) {
  const title = String(input.title || '').trim();
  const platform = String(input.platform || '').trim();
  if (!title) throw new Error('Title is required.');
  if (!platform) throw new Error('Platform is required.');
  const pegi = input.pegi === '' || input.pegi == null ? null : Number(input.pegi);
  if (pegi != null && ![3, 7, 12, 16, 18].includes(pegi)) throw new Error('PEGI must be 3, 7, 12, 16, 18, or blank.');
  const ownership = ['owned', 'wanted', 'unavailable'].includes(input.ownership) ? input.ownership : 'owned';
  const playStatus = ['backlog', 'playing', 'completed', 'paused', 'abandoned'].includes(input.playStatus) ? input.playStatus : 'backlog';
  const mediaFormat = ['physical', 'digital', 'unknown'].includes(input.mediaFormat) ? input.mediaFormat : 'physical';
  const cartridgeNumber = input.cartridgeNumber === '' || input.cartridgeNumber == null ? null : Number.parseInt(input.cartridgeNumber, 10);
  const releaseYear = input.releaseYear === '' || input.releaseYear == null ? null : Number.parseInt(input.releaseYear, 10);
  if (cartridgeNumber != null && (!Number.isInteger(cartridgeNumber) || cartridgeNumber < 0)) throw new Error('Cartridge number must be a positive whole number.');
  if (releaseYear != null && (!Number.isInteger(releaseYear) || releaseYear < 1970 || releaseYear > 2100)) throw new Error('Release year is invalid.');
  return {
    title, platform, pegi, ownership, playStatus, mediaFormat, cartridgeNumber,
    publisher: String(input.publisher || '').trim(), releaseYear,
    notes: String(input.notes || '').trim(), favorite: input.favorite ? 1 : 0,
    pegiUrl: String(input.pegiUrl || '').trim(), coverUrl: String(input.coverUrl || '').trim().slice(0, 2000),
    coverSource: String(input.coverSource || '').trim().slice(0, 80),
    coverMatchTitle: String(input.coverMatchTitle || '').trim().slice(0, 300),
  };
}

function listGames(userId, filters = {}) {
  const clauses = ['user_id = @userId'];
  const params = { userId };
  if (filters.q) { clauses.push('(title LIKE @q OR publisher LIKE @q OR notes LIKE @q)'); params.q = `%${filters.q}%`; }
  if (filters.platform) { clauses.push('platform = @platform'); params.platform = filters.platform; }
  if (filters.ownership) { clauses.push('ownership = @ownership'); params.ownership = filters.ownership; }
  if (filters.playStatus) { clauses.push('play_status = @playStatus'); params.playStatus = filters.playStatus; }
  if (filters.pegi === 'none') clauses.push('pegi IS NULL');
  else if (filters.pegi) { clauses.push('pegi = @pegi'); params.pegi = Number(filters.pegi); }
  if (filters.favorite === '1') clauses.push('favorite = 1');
  const sortMap = {
    title: 'title COLLATE NOCASE ASC',
    platform: 'platform COLLATE NOCASE ASC, title COLLATE NOCASE ASC',
    pegi: 'pegi IS NULL, pegi ASC, title COLLATE NOCASE ASC',
    newest: 'created_at DESC, id DESC',
    cartridge: 'cartridge_number IS NULL, cartridge_number ASC, title COLLATE NOCASE ASC',
  };
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`SELECT ${selectFields} FROM games ${where} ORDER BY ${sortMap[filters.sort] || sortMap.title}`).all(params);
}

function getGame(userId, id) { return db.prepare(`SELECT ${selectFields} FROM games WHERE id=? AND user_id=?`).get(id, userId); }
function createGame(userId, input) { const game = normalizeGame(input); return getGame(userId, insert.run({ ...game, userId }).lastInsertRowid); }
function updateGame(userId, id, input) { const game = normalizeGame(input); const result = update.run({ ...game, id, userId }); return result.changes ? getGame(userId, id) : null; }
function deleteGame(userId, id) { return db.prepare('DELETE FROM games WHERE id=? AND user_id=?').run(id, userId).changes > 0; }

function coverApiKey(userId) { return db.prepare('SELECT steamgriddb_key FROM user_integrations WHERE user_id=?').get(userId)?.steamgriddb_key || ''; }
function setCoverApiKey(userId, key) {
  if (key) db.prepare(`INSERT INTO user_integrations (user_id, steamgriddb_key) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET steamgriddb_key=excluded.steamgriddb_key, updated_at=CURRENT_TIMESTAMP`).run(userId, key);
  else db.prepare('DELETE FROM user_integrations WHERE user_id=?').run(userId);
}
function gamesMissingCovers(userId) { return db.prepare(`SELECT id, title, platform FROM games WHERE user_id=? AND cover_url='' ORDER BY title COLLATE NOCASE`).all(userId); }
function updateGameCover(userId, id, cover) {
  const result = db.prepare(`UPDATE games SET cover_url=?, cover_source=?, cover_match_title=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`).run(cover.url || '', cover.source || '', cover.matchTitle || '', id, userId);
  return result.changes ? getGame(userId, id) : null;
}

function randomShowcaseCovers(limit = 14) {
  const count = Math.max(1, Math.min(48, Number.parseInt(limit, 10) || 14));
  return db.prepare(`SELECT cover_url AS coverUrl FROM games
    WHERE cover_url LIKE 'https://%'
    GROUP BY cover_url ORDER BY RANDOM() LIMIT ?`).all(count).map(row => row.coverUrl);
}

function stats(userId) {
  const total = db.prepare('SELECT COUNT(*) n FROM games WHERE user_id=?').get(userId).n;
  const ownership = db.prepare('SELECT ownership label, COUNT(*) count FROM games WHERE user_id=? GROUP BY ownership').all(userId);
  const platforms = db.prepare('SELECT platform label, COUNT(*) count FROM games WHERE user_id=? GROUP BY platform ORDER BY count DESC, platform').all(userId);
  const pegi = db.prepare("SELECT COALESCE(CAST(pegi AS TEXT), 'Unrated') label, COUNT(*) count FROM games WHERE user_id=? GROUP BY pegi ORDER BY pegi").all(userId);
  const play = db.prepare('SELECT play_status label, COUNT(*) count FROM games WHERE user_id=? GROUP BY play_status').all(userId);
  const favorites = db.prepare('SELECT COUNT(*) n FROM games WHERE user_id=? AND favorite=1').get(userId).n;
  return { total, favorites, ownership, platforms, pegi, play };
}

module.exports = { db, normalizeGame, listGames, getGame, createGame, updateGame, deleteGame, coverApiKey, setCoverApiKey, gamesMissingCovers, updateGameCover, randomShowcaseCovers, stats };
