const path = require('node:path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'games.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
const normalizeSearchText = value => String(value || '').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
const searchPattern = value => `%${normalizeSearchText(value).replace(/[\\%_]/g, character => `\\${character}`)}%`;
db.function('search_normalize', { deterministic: true }, normalizeSearchText);

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
  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    library_view TEXT NOT NULL DEFAULT 'grid',
    search_query TEXT NOT NULL DEFAULT '',
    platform_filter TEXT NOT NULL DEFAULT '',
    ownership_filter TEXT NOT NULL DEFAULT '',
    pegi_filter TEXT NOT NULL DEFAULT '',
    status_filter TEXT NOT NULL DEFAULT '',
    missing_filter TEXT NOT NULL DEFAULT '',
    favorite_filter TEXT NOT NULL DEFAULT '',
    sort_order TEXT NOT NULL DEFAULT 'title',
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
    pegi_descriptors TEXT NOT NULL DEFAULT '[]',
    pegi_releases TEXT NOT NULL DEFAULT '[]',
    pegi_advice TEXT NOT NULL DEFAULT '',
    pegi_outline TEXT NOT NULL DEFAULT '',
    pegi_content_issues TEXT NOT NULL DEFAULT '',
    pegi_other_issues TEXT NOT NULL DEFAULT '',
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
if (!gameColumns.includes('pegi_descriptors')) db.exec("ALTER TABLE games ADD COLUMN pegi_descriptors TEXT NOT NULL DEFAULT '[]'");
if (!gameColumns.includes('pegi_releases')) db.exec("ALTER TABLE games ADD COLUMN pegi_releases TEXT NOT NULL DEFAULT '[]'");
if (!gameColumns.includes('pegi_advice')) db.exec("ALTER TABLE games ADD COLUMN pegi_advice TEXT NOT NULL DEFAULT ''");
if (!gameColumns.includes('pegi_outline')) db.exec("ALTER TABLE games ADD COLUMN pegi_outline TEXT NOT NULL DEFAULT ''");
if (!gameColumns.includes('pegi_content_issues')) db.exec("ALTER TABLE games ADD COLUMN pegi_content_issues TEXT NOT NULL DEFAULT ''");
if (!gameColumns.includes('pegi_other_issues')) db.exec("ALTER TABLE games ADD COLUMN pegi_other_issues TEXT NOT NULL DEFAULT ''");
if (!gameColumns.includes('hltb_id')) db.exec('ALTER TABLE games ADD COLUMN hltb_id INTEGER');
if (!gameColumns.includes('hltb_title')) db.exec("ALTER TABLE games ADD COLUMN hltb_title TEXT NOT NULL DEFAULT ''");
if (!gameColumns.includes('hltb_url')) db.exec("ALTER TABLE games ADD COLUMN hltb_url TEXT NOT NULL DEFAULT ''");
if (!gameColumns.includes('hltb_main_story')) db.exec('ALTER TABLE games ADD COLUMN hltb_main_story REAL');
if (!gameColumns.includes('hltb_main_extra')) db.exec('ALTER TABLE games ADD COLUMN hltb_main_extra REAL');
if (!gameColumns.includes('hltb_completionist')) db.exec('ALTER TABLE games ADD COLUMN hltb_completionist REAL');
if (!gameColumns.includes('hltb_all_styles')) db.exec('ALTER TABLE games ADD COLUMN hltb_all_styles REAL');
if (!gameColumns.includes('hltb_updated_at')) db.exec('ALTER TABLE games ADD COLUMN hltb_updated_at TEXT');

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
  pegi_descriptors AS pegiDescriptorsJson, pegi_releases AS pegiReleasesJson,
  pegi_advice AS pegiAdvice, pegi_outline AS pegiOutline,
  pegi_content_issues AS pegiContentIssues, pegi_other_issues AS pegiOtherIssues,
  hltb_id AS hltbId, hltb_title AS hltbTitle, hltb_url AS hltbUrl,
  hltb_main_story AS hltbMainStory, hltb_main_extra AS hltbMainExtra,
  hltb_completionist AS hltbCompletionist, hltb_all_styles AS hltbAllStyles,
  hltb_updated_at AS hltbUpdatedAt,
  cover_url AS coverUrl, cover_source AS coverSource, cover_match_title AS coverMatchTitle,
  created_at AS createdAt, updated_at AS updatedAt`;

const insert = db.prepare(`
  INSERT INTO games (user_id, title, platform, pegi, ownership, play_status, media_format,
    cartridge_number, publisher, release_year, notes, favorite, pegi_url, pegi_descriptors,
    pegi_releases, pegi_advice, pegi_outline, pegi_content_issues, pegi_other_issues,
    hltb_id, hltb_title, hltb_url, hltb_main_story, hltb_main_extra, hltb_completionist, hltb_all_styles, hltb_updated_at,
    cover_url, cover_source, cover_match_title)
  VALUES (@userId, @title, @platform, @pegi, @ownership, @playStatus, @mediaFormat,
    @cartridgeNumber, @publisher, @releaseYear, @notes, @favorite, @pegiUrl, @pegiDescriptorsJson,
    @pegiReleasesJson, @pegiAdvice, @pegiOutline, @pegiContentIssues, @pegiOtherIssues,
    @hltbId, @hltbTitle, @hltbUrl, @hltbMainStory, @hltbMainExtra, @hltbCompletionist, @hltbAllStyles, @hltbUpdatedAt,
    @coverUrl, @coverSource, @coverMatchTitle)
`);
const update = db.prepare(`
  UPDATE games SET title=@title, platform=@platform, pegi=@pegi, ownership=@ownership,
    play_status=@playStatus, media_format=@mediaFormat, cartridge_number=@cartridgeNumber,
    publisher=@publisher, release_year=@releaseYear, notes=@notes, favorite=@favorite,
    pegi_url=@pegiUrl, pegi_descriptors=@pegiDescriptorsJson, pegi_releases=@pegiReleasesJson,
    pegi_advice=@pegiAdvice, pegi_outline=@pegiOutline, pegi_content_issues=@pegiContentIssues,
    pegi_other_issues=@pegiOtherIssues, hltb_id=@hltbId, hltb_title=@hltbTitle, hltb_url=@hltbUrl,
    hltb_main_story=@hltbMainStory, hltb_main_extra=@hltbMainExtra,
    hltb_completionist=@hltbCompletionist, hltb_all_styles=@hltbAllStyles, hltb_updated_at=@hltbUpdatedAt,
    cover_url=@coverUrl, cover_source=@coverSource,
    cover_match_title=@coverMatchTitle, updated_at=CURRENT_TIMESTAMP WHERE id=@id AND user_id=@userId
`);

const searchTitles = db.prepare(`
  SELECT id, title, platform, ownership FROM games
  WHERE user_id=? AND search_normalize(title) LIKE ? ESCAPE '\\'
  ORDER BY CASE WHEN search_normalize(title) = ? THEN 0 ELSE 1 END, title COLLATE NOCASE, platform COLLATE NOCASE
  LIMIT ?
`);
const accountTitles = db.prepare('SELECT id, title, platform, ownership FROM games WHERE user_id=?');

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
  const safeList = value => (Array.isArray(value) ? value : []).map(item => String(item || '').trim().slice(0, 180)).filter(Boolean).slice(0, 24);
  const safeText = (value, limit = 8000) => String(value || '').trim().slice(0, limit);
  const hltbHours = value => {
    if (value === '' || value == null) return null;
    const number = Number(value); return Number.isFinite(number) && number > 0 && number <= 100000 ? Math.round(number * 100) / 100 : null;
  };
  const hltbId = Number.isInteger(Number(input.hltbId)) && Number(input.hltbId) > 0 ? Number(input.hltbId) : null;
  return {
    title, platform, pegi, ownership, playStatus, mediaFormat, cartridgeNumber,
    publisher: String(input.publisher || '').trim(), releaseYear,
    notes: String(input.notes || '').trim(), favorite: input.favorite ? 1 : 0,
    pegiUrl: String(input.pegiUrl || '').trim(),
    pegiDescriptorsJson: JSON.stringify(safeList(input.pegiDescriptors)),
    pegiReleasesJson: JSON.stringify(safeList(input.pegiReleases)),
    pegiAdvice: safeText(input.pegiAdvice), pegiOutline: safeText(input.pegiOutline),
    pegiContentIssues: safeText(input.pegiContentIssues), pegiOtherIssues: safeText(input.pegiOtherIssues),
    hltbId, hltbTitle: hltbId ? safeText(input.hltbTitle, 220) : '',
    hltbUrl: hltbId ? safeText(input.hltbUrl, 2000) : '',
    hltbMainStory: hltbId ? hltbHours(input.hltbMainStory) : null,
    hltbMainExtra: hltbId ? hltbHours(input.hltbMainExtra) : null,
    hltbCompletionist: hltbId ? hltbHours(input.hltbCompletionist) : null,
    hltbAllStyles: hltbId ? hltbHours(input.hltbAllStyles) : null,
    hltbUpdatedAt: hltbId ? safeText(input.hltbUpdatedAt, 40) || new Date().toISOString() : null,
    coverUrl: String(input.coverUrl || '').trim().slice(0, 2000),
    coverSource: String(input.coverSource || '').trim().slice(0, 80),
    coverMatchTitle: String(input.coverMatchTitle || '').trim().slice(0, 300),
  };
}

function parseStoredList(value) {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}
function hydrateGame(row) {
  if (!row) return row;
  const { pegiDescriptorsJson, pegiReleasesJson, ...game } = row;
  return { ...game, pegiDescriptors: parseStoredList(pegiDescriptorsJson), pegiReleases: parseStoredList(pegiReleasesJson) };
}

function listGames(userId, filters = {}) {
  const clauses = ['user_id = @userId'];
  const params = { userId };
  if (filters.q) {
    clauses.push(`(search_normalize(title) LIKE @q ESCAPE '\\'
      OR search_normalize(publisher) LIKE @q ESCAPE '\\'
      OR search_normalize(notes) LIKE @q ESCAPE '\\')`);
    params.q = searchPattern(filters.q);
  }
  if (filters.platform) { clauses.push('platform = @platform'); params.platform = filters.platform; }
  if (filters.ownership) { clauses.push('ownership = @ownership'); params.ownership = filters.ownership; }
  if (filters.playStatus) { clauses.push('play_status = @playStatus'); params.playStatus = filters.playStatus; }
  if (filters.pegi === 'none') clauses.push('pegi IS NULL');
  else if (filters.pegi) { clauses.push('pegi = @pegi'); params.pegi = Number(filters.pegi); }
  const missingPegi = `(platform NOT LIKE 'Evercade%'
    AND pegi_url='' AND pegi_descriptors='[]' AND pegi_releases='[]'
    AND pegi_advice='' AND pegi_outline='' AND pegi_content_issues='' AND pegi_other_issues='')`;
  if (filters.missing === 'pegi' || filters.missingPegi === '1') clauses.push(missingPegi);
  if (filters.missing === 'cover' || filters.missingCover === '1') clauses.push("cover_url=''");
  if (filters.missing === 'hltb') clauses.push('hltb_id IS NULL');
  if (filters.missing === 'either') clauses.push(`(${missingPegi} OR cover_url='' OR hltb_id IS NULL)`);
  if (filters.missing === 'both') clauses.push(`${missingPegi} AND cover_url='' AND hltb_id IS NULL`);
  if (filters.favorite === '1') clauses.push('favorite = 1');
  const titleAsc = 'search_normalize(title) ASC, id ASC';
  const titleDesc = 'search_normalize(title) DESC, id DESC';
  const sortMap = {
    title: titleAsc,
    title_desc: titleDesc,
    platform: `search_normalize(platform) ASC, ${titleAsc}`,
    publisher: `publisher='' ASC, search_normalize(publisher) ASC, ${titleAsc}`,
    year: `release_year IS NULL, release_year ASC, ${titleAsc}`,
    year_desc: `release_year IS NULL, release_year DESC, ${titleAsc}`,
    pegi: `pegi IS NULL, pegi ASC, ${titleAsc}`,
    pegi_desc: `pegi IS NULL, pegi DESC, ${titleAsc}`,
    ownership: `CASE ownership WHEN 'owned' THEN 0 WHEN 'wanted' THEN 1 ELSE 2 END, ${titleAsc}`,
    status: `CASE play_status WHEN 'playing' THEN 0 WHEN 'backlog' THEN 1 WHEN 'paused' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END, ${titleAsc}`,
    favorites: `favorite DESC, ${titleAsc}`,
    newest: 'created_at DESC, id DESC',
    oldest: 'created_at ASC, id ASC',
    updated: 'updated_at DESC, id DESC',
    hltb_main_short: `hltb_main_story IS NULL, hltb_main_story ASC, ${titleAsc}`,
    hltb_main_long: `hltb_main_story IS NULL, hltb_main_story DESC, ${titleAsc}`,
    hltb_extra_short: `hltb_main_extra IS NULL, hltb_main_extra ASC, ${titleAsc}`,
    hltb_extra_long: `hltb_main_extra IS NULL, hltb_main_extra DESC, ${titleAsc}`,
    hltb_100_short: `hltb_completionist IS NULL, hltb_completionist ASC, ${titleAsc}`,
    hltb_100_long: `hltb_completionist IS NULL, hltb_completionist DESC, ${titleAsc}`,
    hltb_all_short: `hltb_all_styles IS NULL, hltb_all_styles ASC, ${titleAsc}`,
    hltb_all_long: `hltb_all_styles IS NULL, hltb_all_styles DESC, ${titleAsc}`,
    cartridge: `cartridge_number IS NULL, cartridge_number ASC, ${titleAsc}`,
  };
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`SELECT ${selectFields} FROM games ${where} ORDER BY ${sortMap[filters.sort] || sortMap.title}`).all(params).map(hydrateGame);
}

function getGame(userId, id) { return hydrateGame(db.prepare(`SELECT ${selectFields} FROM games WHERE id=? AND user_id=?`).get(id, userId)); }
function searchGameTitles(userId, query, limit = 10) {
  const clean = String(query || '').trim().slice(0, 220);
  if (clean.length < 2) return [];
  return searchTitles.all(userId, searchPattern(clean), normalizeSearchText(clean), Math.max(1, Math.min(20, Number(limit) || 10)));
}
const normalizeIdentity = normalizeSearchText;
function findDuplicateGames(userId, title, platform) {
  const wantedTitle = normalizeIdentity(title); const wantedPlatform = normalizeIdentity(platform);
  if (!wantedTitle || !wantedPlatform) return [];
  return accountTitles.all(userId).filter(game => normalizeIdentity(game.title) === wantedTitle && normalizeIdentity(game.platform) === wantedPlatform);
}
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
  const result = db.prepare(`UPDATE games SET cover_url=?, cover_source=?, cover_match_title=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND user_id=? AND cover_url=''`).run(cover.url || '', cover.source || '', cover.matchTitle || '', id, userId);
  return result.changes ? getGame(userId, id) : null;
}

function gamesMissingPegiMetadata(userId) {
  return db.prepare(`SELECT id, title, platform FROM games WHERE user_id=?
    AND platform NOT LIKE 'Evercade%'
    AND pegi_url=''
    AND pegi_descriptors='[]' AND pegi_releases='[]' AND pegi_advice=''
    AND pegi_outline='' AND pegi_content_issues='' AND pegi_other_issues=''
    ORDER BY title COLLATE NOCASE`).all(userId);
}

function updateGamePegiMetadata(userId, id, metadata = {}) {
  const safeList = value => (Array.isArray(value) ? value : []).map(item => String(item || '').trim().slice(0, 180)).filter(Boolean).slice(0, 24);
  const safeText = (value, limit = 8000) => String(value || '').trim().slice(0, limit);
  const ratingValue = metadata.pegi ?? metadata.rating;
  const yearValue = metadata.releaseYear ?? metadata.year;
  const pegi = [3, 7, 12, 16, 18].includes(Number(ratingValue)) ? Number(ratingValue) : null;
  const releaseYear = Number.isInteger(Number(yearValue)) && Number(yearValue) >= 1970 && Number(yearValue) <= 2100 ? Number(yearValue) : null;
  const result = db.prepare(`UPDATE games SET pegi=COALESCE(@pegi, pegi),
    publisher=CASE WHEN @publisher<>'' THEN @publisher ELSE publisher END,
    release_year=COALESCE(@releaseYear, release_year), pegi_url=@pegiUrl,
    pegi_descriptors=@pegiDescriptorsJson, pegi_releases=@pegiReleasesJson,
    pegi_advice=@pegiAdvice, pegi_outline=@pegiOutline,
    pegi_content_issues=@pegiContentIssues, pegi_other_issues=@pegiOtherIssues,
    updated_at=CURRENT_TIMESTAMP WHERE id=@id AND user_id=@userId
    AND pegi_url='' AND pegi_descriptors='[]' AND pegi_releases='[]'
    AND pegi_advice='' AND pegi_outline='' AND pegi_content_issues='' AND pegi_other_issues=''`).run({
      id, userId, pegi, releaseYear,
      publisher: safeText(metadata.publisher, 160), pegiUrl: safeText(metadata.pegiUrl ?? metadata.url, 2000),
      pegiDescriptorsJson: JSON.stringify(safeList(metadata.descriptors)),
      pegiReleasesJson: JSON.stringify(safeList(metadata.releases)),
      pegiAdvice: safeText(metadata.advice), pegiOutline: safeText(metadata.outline),
      pegiContentIssues: safeText(metadata.contentIssues), pegiOtherIssues: safeText(metadata.otherIssues),
    });
  return result.changes ? getGame(userId, id) : null;
}

function gamesMissingHltb(userId) {
  return db.prepare('SELECT id, title, platform FROM games WHERE user_id=? AND hltb_id IS NULL ORDER BY title COLLATE NOCASE').all(userId);
}

function updateGameHltb(userId, id, metadata = {}) {
  const normalized = normalizeGame({ title: 'placeholder', platform: 'placeholder', ...metadata,
    hltbId: metadata.hltbId ?? metadata.id, hltbTitle: metadata.hltbTitle ?? metadata.title,
    hltbUrl: metadata.hltbUrl ?? metadata.url, hltbMainStory: metadata.hltbMainStory ?? metadata.mainStory,
    hltbMainExtra: metadata.hltbMainExtra ?? metadata.mainExtra,
    hltbCompletionist: metadata.hltbCompletionist ?? metadata.completionist,
    hltbAllStyles: metadata.hltbAllStyles ?? metadata.allStyles, hltbUpdatedAt: new Date().toISOString(),
  });
  if (!normalized.hltbId) return null;
  const result = db.prepare(`UPDATE games SET hltb_id=@hltbId, hltb_title=@hltbTitle, hltb_url=@hltbUrl,
    hltb_main_story=@hltbMainStory, hltb_main_extra=@hltbMainExtra,
    hltb_completionist=@hltbCompletionist, hltb_all_styles=@hltbAllStyles,
    hltb_updated_at=@hltbUpdatedAt, updated_at=CURRENT_TIMESTAMP
    WHERE id=@id AND user_id=@userId AND hltb_id IS NULL`).run({ id, userId, ...normalized });
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

module.exports = { db, normalizeGame, listGames, getGame, searchGameTitles, findDuplicateGames, createGame, updateGame, deleteGame, coverApiKey, setCoverApiKey, gamesMissingCovers, updateGameCover, gamesMissingPegiMetadata, updateGamePegiMetadata, gamesMissingHltb, updateGameHltb, randomShowcaseCovers, stats };
