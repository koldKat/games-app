const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createCanonicalStore } = require('./canonical-store');
const { createProgressionStore } = require('./progression-store');
const {
  MEDIA_FORMAT_VALUES, MULTIPLATFORM_FILTER_VALUE, OWNERSHIP_FILTER_VALUES, OWNERSHIP_VALUES, PEGI_RATINGS, PLAY_STATUS_VALUES,
  STORED_PLAY_STATUS_VALUES, TITLE_LOOKUP_MIN_LENGTH,
} = require('./constants');
const { GAME_LIMITS } = require('./validation-policy');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'games.db');
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
const normalizeSearchText = value => String(value || '').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
const searchPattern = value => `%${normalizeSearchText(value).replace(/[\\%_]/g, character => `\\${character}`)}%`;
const safeList = value => (Array.isArray(value) ? value : [])
  .map(item => String(item || '').trim().slice(0, GAME_LIMITS.metadataItemMax))
  .filter(Boolean).slice(0, GAME_LIMITS.metadataItemsMax);
const safeText = (value, limit = GAME_LIMITS.metadataTextMax) => String(value || '').trim().slice(0, limit);
const boundedText = (value, limit, label) => {
  const clean = String(value || '').trim();
  if (clean.length > limit) throw new Error(`${label} cannot exceed ${limit.toLocaleString('en-US')} characters.`);
  return clean;
};
const validReleaseYear = value => Number.isInteger(Number(value)) && Number(value) >= GAME_LIMITS.releaseYearMin && Number(value) <= GAME_LIMITS.releaseYearMax;
const hltbHours = value => {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= GAME_LIMITS.hltbHoursMax ? Math.round(number * 100) / 100 : null;
};
const sqlTextValues = values => values.map(value => `'${value.replaceAll("'", "''")}'`).join(', ');
db.function('search_normalize', { deterministic: true }, normalizeSearchText);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    email TEXT COLLATE NOCASE,
    avatar_path TEXT,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    admin_locked INTEGER NOT NULL DEFAULT 0 CHECK (admin_locked IN (0, 1)),
    public_profile INTEGER NOT NULL DEFAULT 0 CHECK (public_profile IN (0, 1)),
    last_country TEXT,
    last_city TEXT,
    location_updated_at INTEGER,
    last_active_at INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS mail_settings (
    id INTEGER PRIMARY KEY CHECK (id=1),
    host TEXT NOT NULL DEFAULT '',
    port INTEGER NOT NULL DEFAULT 587,
    security TEXT NOT NULL DEFAULT 'starttls',
    username TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL DEFAULT '',
    sender TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS runtime_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_integrations (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    steamgriddb_key TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS cover_provider_credentials (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    credentials_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, provider)
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
  CREATE TABLE IF NOT EXISTS forum_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS forum_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES forum_categories(id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    reply_count INTEGER NOT NULL DEFAULT 0,
    is_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0, 1)),
    is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_post_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    edited_at TEXT
  );
  CREATE TABLE IF NOT EXISTS forum_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    edited_at TEXT
  );
  CREATE TABLE IF NOT EXISTS patch_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('bug', 'idea', 'game_data', 'other')),
    admin_unread INTEGER NOT NULL DEFAULT 0 CHECK (admin_unread >= 0),
    user_unread INTEGER NOT NULL DEFAULT 0 CHECK (user_unread >= 0),
    deleted_by_user INTEGER NOT NULL DEFAULT 0 CHECK (deleted_by_user IN (0, 1)),
    deleted_by_admin INTEGER NOT NULL DEFAULT 0 CHECK (deleted_by_admin IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS patch_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES patch_threads(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK (sender IN ('user', 'admin')),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL COLLATE NOCASE,
    platform TEXT NOT NULL,
    pegi INTEGER CHECK (pegi IS NULL OR pegi IN (${PEGI_RATINGS.join(', ')})),
    ownership TEXT NOT NULL DEFAULT 'owned' CHECK (ownership IN (${sqlTextValues(OWNERSHIP_VALUES)})),
    play_status TEXT NOT NULL DEFAULT 'backlog' CHECK (play_status IN (${sqlTextValues(STORED_PLAY_STATUS_VALUES)})),
    hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
    media_format TEXT NOT NULL DEFAULT 'physical' CHECK (media_format IN (${sqlTextValues(MEDIA_FORMAT_VALUES)})),
    cartridge_number INTEGER,
    publisher TEXT NOT NULL DEFAULT '',
    release_year INTEGER,
    notes TEXT NOT NULL DEFAULT '',
    rating REAL CHECK (rating IS NULL OR (rating >= 0.5 AND rating <= 5 AND rating * 2 = CAST(rating * 2 AS INTEGER))),
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
    description TEXT NOT NULL DEFAULT '',
    description_source TEXT NOT NULL DEFAULT '',
    description_source_url TEXT NOT NULL DEFAULT '',
    igdb_id INTEGER,
    igdb_slug TEXT NOT NULL DEFAULT '',
    igdb_url TEXT NOT NULL DEFAULT '',
    igdb_rating REAL,
    igdb_rating_count INTEGER NOT NULL DEFAULT 0,
    igdb_critic_rating REAL,
    igdb_critic_rating_count INTEGER NOT NULL DEFAULT 0,
    igdb_genres TEXT NOT NULL DEFAULT '[]',
    igdb_themes TEXT NOT NULL DEFAULT '[]',
    igdb_developers TEXT NOT NULL DEFAULT '[]',
    igdb_updated_at TEXT,
    steam_app_id INTEGER,
    steam_playtime_minutes INTEGER NOT NULL DEFAULT 0,
    steam_last_played_at TEXT,
    gog_product_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const progression = createProgressionStore(db);

const userColumns = db.pragma('table_info(users)').map(column => column.name);
if (!userColumns.includes('email')) db.exec('ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE');
if (!userColumns.includes('avatar_path')) db.exec('ALTER TABLE users ADD COLUMN avatar_path TEXT');
if (!userColumns.includes('failed_login_count')) db.exec('ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0');
if (!userColumns.includes('locked_until')) db.exec('ALTER TABLE users ADD COLUMN locked_until INTEGER');
if (!userColumns.includes('admin_locked')) db.exec('ALTER TABLE users ADD COLUMN admin_locked INTEGER NOT NULL DEFAULT 0');
if (!userColumns.includes('hide_from_activity')) db.exec('ALTER TABLE users ADD COLUMN hide_from_activity INTEGER NOT NULL DEFAULT 0');
if (!userColumns.includes('public_profile')) db.exec('ALTER TABLE users ADD COLUMN public_profile INTEGER NOT NULL DEFAULT 0');
if (!userColumns.includes('last_country')) db.exec('ALTER TABLE users ADD COLUMN last_country TEXT');
if (!userColumns.includes('last_city')) db.exec('ALTER TABLE users ADD COLUMN last_city TEXT');
if (!userColumns.includes('location_updated_at')) db.exec('ALTER TABLE users ADD COLUMN location_updated_at INTEGER');
if (!userColumns.includes('last_active_at')) db.exec('ALTER TABLE users ADD COLUMN last_active_at INTEGER');
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
for (const column of ['esrb_rating', 'esrb_url', 'esrb_descriptors', 'esrb_interactive_elements', 'esrb_summary']) {
  if (gameColumns.includes(column)) db.exec(`ALTER TABLE games DROP COLUMN ${column}`);
}
db.transaction(() => {
  db.prepare(`UPDATE user_progression SET xp=MAX(0, xp - COALESCE((SELECT SUM(amount) FROM progression_events WHERE progression_events.user_id=user_progression.user_id AND event='esrb_added'), 0))`).run();
  db.prepare("DELETE FROM progression_events WHERE event='esrb_added'").run();
  db.prepare("DELETE FROM progression_config WHERE event='esrb_added'").run();
})();
if (!gameColumns.includes('hltb_id')) db.exec('ALTER TABLE games ADD COLUMN hltb_id INTEGER');
if (!gameColumns.includes('hltb_title')) db.exec("ALTER TABLE games ADD COLUMN hltb_title TEXT NOT NULL DEFAULT ''");
if (!gameColumns.includes('hltb_url')) db.exec("ALTER TABLE games ADD COLUMN hltb_url TEXT NOT NULL DEFAULT ''");
if (!gameColumns.includes('hltb_main_story')) db.exec('ALTER TABLE games ADD COLUMN hltb_main_story REAL');
if (!gameColumns.includes('hltb_main_extra')) db.exec('ALTER TABLE games ADD COLUMN hltb_main_extra REAL');
if (!gameColumns.includes('hltb_completionist')) db.exec('ALTER TABLE games ADD COLUMN hltb_completionist REAL');
if (!gameColumns.includes('hltb_all_styles')) db.exec('ALTER TABLE games ADD COLUMN hltb_all_styles REAL');
if (!gameColumns.includes('hltb_updated_at')) db.exec('ALTER TABLE games ADD COLUMN hltb_updated_at TEXT');
if (!gameColumns.includes('description')) db.exec("ALTER TABLE games ADD COLUMN description TEXT NOT NULL DEFAULT ''");
if (!gameColumns.includes('description_source')) db.exec("ALTER TABLE games ADD COLUMN description_source TEXT NOT NULL DEFAULT ''");
if (!gameColumns.includes('description_source_url')) db.exec("ALTER TABLE games ADD COLUMN description_source_url TEXT NOT NULL DEFAULT ''");
if (!gameColumns.includes('igdb_id')) db.exec('ALTER TABLE games ADD COLUMN igdb_id INTEGER');
if (!gameColumns.includes('igdb_slug')) db.exec("ALTER TABLE games ADD COLUMN igdb_slug TEXT NOT NULL DEFAULT ''");
if (!gameColumns.includes('igdb_url')) db.exec("ALTER TABLE games ADD COLUMN igdb_url TEXT NOT NULL DEFAULT ''");
if (!gameColumns.includes('igdb_rating')) db.exec('ALTER TABLE games ADD COLUMN igdb_rating REAL');
if (!gameColumns.includes('igdb_rating_count')) db.exec('ALTER TABLE games ADD COLUMN igdb_rating_count INTEGER NOT NULL DEFAULT 0');
if (!gameColumns.includes('igdb_critic_rating')) db.exec('ALTER TABLE games ADD COLUMN igdb_critic_rating REAL');
if (!gameColumns.includes('igdb_critic_rating_count')) db.exec('ALTER TABLE games ADD COLUMN igdb_critic_rating_count INTEGER NOT NULL DEFAULT 0');
if (!gameColumns.includes('igdb_genres')) db.exec("ALTER TABLE games ADD COLUMN igdb_genres TEXT NOT NULL DEFAULT '[]'");
if (!gameColumns.includes('igdb_themes')) db.exec("ALTER TABLE games ADD COLUMN igdb_themes TEXT NOT NULL DEFAULT '[]'");
if (!gameColumns.includes('igdb_developers')) db.exec("ALTER TABLE games ADD COLUMN igdb_developers TEXT NOT NULL DEFAULT '[]'");
if (!gameColumns.includes('igdb_updated_at')) db.exec('ALTER TABLE games ADD COLUMN igdb_updated_at TEXT');
if (!gameColumns.includes('steam_app_id')) db.exec('ALTER TABLE games ADD COLUMN steam_app_id INTEGER');
if (!gameColumns.includes('steam_playtime_minutes')) db.exec('ALTER TABLE games ADD COLUMN steam_playtime_minutes INTEGER NOT NULL DEFAULT 0');
if (!gameColumns.includes('steam_last_played_at')) db.exec('ALTER TABLE games ADD COLUMN steam_last_played_at TEXT');
if (!gameColumns.includes('gog_product_id')) db.exec('ALTER TABLE games ADD COLUMN gog_product_id TEXT');
if (gameColumns.includes('esrb_rating')) db.prepare(`UPDATE games SET description=CASE WHEN description_source='ESRB' THEN '' ELSE description END, description_source=CASE WHEN description_source='ESRB' THEN '' ELSE description_source END, description_source_url=CASE WHEN description_source='ESRB' THEN '' ELSE description_source_url END WHERE description_source='ESRB'`).run();
if (!gameColumns.includes('rating')) db.exec('ALTER TABLE games ADD COLUMN rating REAL');
if (!gameColumns.includes('hidden')) db.exec('ALTER TABLE games ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))');
const canonical = createCanonicalStore(db);

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id, expires_at);
  CREATE INDEX IF NOT EXISTS idx_games_user ON games(user_id);
  CREATE INDEX IF NOT EXISTS idx_games_platform ON games(platform);
  CREATE INDEX IF NOT EXISTS idx_games_ownership ON games(ownership);
  CREATE INDEX IF NOT EXISTS idx_games_pegi ON games(pegi);
  CREATE INDEX IF NOT EXISTS idx_games_title ON games(title COLLATE NOCASE);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_games_user_steam_app ON games(user_id, steam_app_id) WHERE steam_app_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_games_user_gog_product ON games(user_id, gog_product_id) WHERE gog_product_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_forum_threads_category ON forum_threads(category_id, is_pinned DESC, last_post_at DESC);
  CREATE INDEX IF NOT EXISTS idx_forum_posts_thread ON forum_posts(thread_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_patch_threads_user ON patch_threads(user_id, deleted_by_user, user_unread);
  CREATE INDEX IF NOT EXISTS idx_patch_threads_admin ON patch_threads(deleted_by_admin, admin_unread);
  CREATE INDEX IF NOT EXISTS idx_patch_messages_thread ON patch_messages(thread_id, created_at);
`);

const selectFields = `id, title, platform, pegi, ownership,
  CASE WHEN hidden=1 THEN 'hidden' ELSE play_status END AS playStatus,
  media_format AS mediaFormat, cartridge_number AS cartridgeNumber, publisher,
  release_year AS releaseYear, notes, rating, favorite, pegi_url AS pegiUrl,
  pegi_descriptors AS pegiDescriptorsJson, pegi_releases AS pegiReleasesJson,
  pegi_advice AS pegiAdvice, pegi_outline AS pegiOutline,
  pegi_content_issues AS pegiContentIssues, pegi_other_issues AS pegiOtherIssues,
  hltb_id AS hltbId, hltb_title AS hltbTitle, hltb_url AS hltbUrl,
  hltb_main_story AS hltbMainStory, hltb_main_extra AS hltbMainExtra,
  hltb_completionist AS hltbCompletionist, hltb_all_styles AS hltbAllStyles,
  hltb_updated_at AS hltbUpdatedAt,
  cover_url AS coverUrl, cover_source AS coverSource, cover_match_title AS coverMatchTitle,
  description, description_source AS descriptionSource, description_source_url AS descriptionSourceUrl,
  igdb_id AS igdbId, igdb_slug AS igdbSlug, igdb_url AS igdbUrl,
  igdb_rating AS igdbRating, igdb_rating_count AS igdbRatingCount,
  igdb_critic_rating AS igdbCriticRating, igdb_critic_rating_count AS igdbCriticRatingCount,
  igdb_genres AS igdbGenresJson, igdb_themes AS igdbThemesJson, igdb_developers AS igdbDevelopersJson,
  igdb_updated_at AS igdbUpdatedAt,
  steam_app_id AS steamAppId, steam_playtime_minutes AS steamPlaytimeMinutes,
  steam_last_played_at AS steamLastPlayedAt,
  gog_product_id AS gogProductId,
  canonical_game_id AS canonicalGameId, canonical_release_id AS canonicalReleaseId,
  created_at AS createdAt, updated_at AS updatedAt`;

const insert = db.prepare(`
  INSERT INTO games (user_id, title, platform, pegi, ownership, play_status, hidden, media_format,
    cartridge_number, publisher, release_year, notes, rating, favorite, pegi_url, pegi_descriptors,
    pegi_releases, pegi_advice, pegi_outline, pegi_content_issues, pegi_other_issues,
    hltb_id, hltb_title, hltb_url, hltb_main_story, hltb_main_extra, hltb_completionist, hltb_all_styles, hltb_updated_at,
    cover_url, cover_source, cover_match_title, description, description_source, description_source_url,
    igdb_id, igdb_slug, igdb_url, igdb_rating, igdb_rating_count, igdb_critic_rating, igdb_critic_rating_count,
    igdb_genres, igdb_themes, igdb_developers, igdb_updated_at,
    steam_app_id, steam_playtime_minutes, steam_last_played_at, gog_product_id)
  VALUES (@userId, @title, @platform, @pegi, @ownership, @playStatus, @hidden, @mediaFormat,
    @cartridgeNumber, @publisher, @releaseYear, @notes, @rating, @favorite, @pegiUrl, @pegiDescriptorsJson,
    @pegiReleasesJson, @pegiAdvice, @pegiOutline, @pegiContentIssues, @pegiOtherIssues,
    @hltbId, @hltbTitle, @hltbUrl, @hltbMainStory, @hltbMainExtra, @hltbCompletionist, @hltbAllStyles, @hltbUpdatedAt,
    @coverUrl, @coverSource, @coverMatchTitle, @description, @descriptionSource, @descriptionSourceUrl,
    @igdbId, @igdbSlug, @igdbUrl, @igdbRating, @igdbRatingCount, @igdbCriticRating, @igdbCriticRatingCount,
    @igdbGenresJson, @igdbThemesJson, @igdbDevelopersJson, @igdbUpdatedAt,
    @steamAppId, @steamPlaytimeMinutes, @steamLastPlayedAt, @gogProductId)
`);
const update = db.prepare(`
  UPDATE games SET title=@title, platform=@platform, pegi=@pegi, ownership=@ownership,
    play_status=CASE WHEN @hidden=1 THEN play_status ELSE @playStatus END, hidden=@hidden,
    media_format=@mediaFormat, cartridge_number=@cartridgeNumber,
    publisher=@publisher, release_year=@releaseYear, notes=@notes, rating=@rating, favorite=@favorite,
    pegi_url=@pegiUrl, pegi_descriptors=@pegiDescriptorsJson, pegi_releases=@pegiReleasesJson,
    pegi_advice=@pegiAdvice, pegi_outline=@pegiOutline, pegi_content_issues=@pegiContentIssues,
    pegi_other_issues=@pegiOtherIssues, hltb_id=@hltbId, hltb_title=@hltbTitle, hltb_url=@hltbUrl,
    hltb_main_story=@hltbMainStory, hltb_main_extra=@hltbMainExtra,
    hltb_completionist=@hltbCompletionist, hltb_all_styles=@hltbAllStyles, hltb_updated_at=@hltbUpdatedAt,
    cover_url=@coverUrl, cover_source=@coverSource,
    cover_match_title=@coverMatchTitle, description=@description, description_source=@descriptionSource,
    description_source_url=@descriptionSourceUrl, igdb_id=@igdbId, igdb_slug=@igdbSlug, igdb_url=@igdbUrl,
    igdb_rating=@igdbRating, igdb_rating_count=@igdbRatingCount,
    igdb_critic_rating=@igdbCriticRating, igdb_critic_rating_count=@igdbCriticRatingCount,
    igdb_genres=@igdbGenresJson, igdb_themes=@igdbThemesJson, igdb_developers=@igdbDevelopersJson,
    igdb_updated_at=@igdbUpdatedAt, steam_app_id=@steamAppId,
    steam_playtime_minutes=@steamPlaytimeMinutes, steam_last_played_at=@steamLastPlayedAt,
    gog_product_id=@gogProductId,
    updated_at=CURRENT_TIMESTAMP WHERE id=@id AND user_id=@userId
`);

const searchTitles = db.prepare(`
  SELECT id, title, platform, ownership, igdb_id AS igdbId, canonical_game_id AS canonicalGameId FROM games
  WHERE user_id=? AND search_normalize(title) LIKE ? ESCAPE '\\'
  ORDER BY CASE WHEN search_normalize(title) = ? THEN 0 ELSE 1 END, title COLLATE NOCASE, platform COLLATE NOCASE
  LIMIT ?
`);
const accountTitles = db.prepare('SELECT id, title, platform, ownership, igdb_id AS igdbId, canonical_game_id AS canonicalGameId FROM games WHERE user_id=?');

function normalizeGame(input = {}) {
  const title = boundedText(input.title, GAME_LIMITS.titleMax, 'Title');
  const platform = boundedText(input.platform, GAME_LIMITS.platformMax, 'Platform');
  if (!title) throw new Error('Title is required.');
  if (!platform) throw new Error('Platform is required.');
  const pegi = input.pegi === '' || input.pegi == null ? null : Number(input.pegi);
  if (pegi != null && !PEGI_RATINGS.includes(pegi)) throw new Error('PEGI must be 3, 7, 12, 16, 18, or blank.');
  const requestedOwnership = String(input.ownership || 'owned');
  if (!OWNERSHIP_VALUES.includes(requestedOwnership)) throw new Error('Collection must be Owned or Wishlisted.');
  const ownership = requestedOwnership;
  const requestedPlayStatus = PLAY_STATUS_VALUES.includes(input.playStatus) ? input.playStatus : 'backlog';
  const hidden = requestedPlayStatus === 'hidden' ? 1 : 0;
  const playStatus = hidden ? 'backlog' : requestedPlayStatus;
  const mediaFormat = MEDIA_FORMAT_VALUES.includes(input.mediaFormat) ? input.mediaFormat : 'physical';
  const cartridgeNumber = input.cartridgeNumber === '' || input.cartridgeNumber == null ? null : Number.parseInt(input.cartridgeNumber, 10);
  const releaseYear = input.releaseYear === '' || input.releaseYear == null ? null : Number.parseInt(input.releaseYear, 10);
  const rating = input.rating === '' || input.rating == null ? null : Number(input.rating);
  if (cartridgeNumber != null && (!Number.isInteger(cartridgeNumber) || cartridgeNumber < 0)) throw new Error('Cartridge number must be a positive whole number.');
  if (releaseYear != null && !validReleaseYear(releaseYear)) throw new Error('Release year is invalid.');
  if (rating != null && (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || !Number.isInteger(rating * 2))) throw new Error('Rating must be in half-star steps from 0.5 to 5.');
  const hltbId = Number.isInteger(Number(input.hltbId)) && Number(input.hltbId) > 0 ? Number(input.hltbId) : null;
  const igdbId = Number.isInteger(Number(input.igdbId)) && Number(input.igdbId) > 0 ? Number(input.igdbId) : null;
  const igdbScore = value => igdbId && value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100
    ? Math.round(Number(value) * 10) / 10 : null;
  const igdbCount = value => igdbId ? Math.max(0, Number.parseInt(value, 10) || 0) : 0;
  return {
    title, platform, pegi, ownership, playStatus, hidden, mediaFormat, cartridgeNumber,
    publisher: boundedText(input.publisher, GAME_LIMITS.publisherMax, 'Publisher'), releaseYear,
    notes: boundedText(input.notes, GAME_LIMITS.notesMax, 'Notes'), rating, favorite: input.favorite ? 1 : 0,
    pegiUrl: boundedText(input.pegiUrl, GAME_LIMITS.urlMax, 'PEGI URL'),
    pegiDescriptorsJson: JSON.stringify(safeList(input.pegiDescriptors)),
    pegiReleasesJson: JSON.stringify(safeList(input.pegiReleases)),
    pegiAdvice: safeText(input.pegiAdvice), pegiOutline: safeText(input.pegiOutline),
    pegiContentIssues: safeText(input.pegiContentIssues), pegiOtherIssues: safeText(input.pegiOtherIssues),
    hltbId, hltbTitle: hltbId ? safeText(input.hltbTitle, GAME_LIMITS.titleMax) : '',
    hltbUrl: hltbId ? safeText(input.hltbUrl, GAME_LIMITS.urlMax) : '',
    hltbMainStory: hltbId ? hltbHours(input.hltbMainStory) : null,
    hltbMainExtra: hltbId ? hltbHours(input.hltbMainExtra) : null,
    hltbCompletionist: hltbId ? hltbHours(input.hltbCompletionist) : null,
    hltbAllStyles: hltbId ? hltbHours(input.hltbAllStyles) : null,
    hltbUpdatedAt: hltbId ? safeText(input.hltbUpdatedAt, GAME_LIMITS.hltbTimestampMax) || new Date().toISOString() : null,
    coverUrl: String(input.coverUrl || '').trim().slice(0, GAME_LIMITS.urlMax),
    coverSource: String(input.coverSource || '').trim().slice(0, GAME_LIMITS.coverSourceMax),
    coverMatchTitle: String(input.coverMatchTitle || '').trim().slice(0, GAME_LIMITS.coverMatchTitleMax),
    description: safeText(input.description, GAME_LIMITS.descriptionMax),
    descriptionSource: safeText(input.description) ? String(input.descriptionSource || '').trim().slice(0, GAME_LIMITS.coverSourceMax) : '',
    descriptionSourceUrl: safeText(input.description) ? String(input.descriptionSourceUrl || '').trim().slice(0, GAME_LIMITS.urlMax) : '',
    igdbId, igdbSlug: igdbId ? safeText(input.igdbSlug, GAME_LIMITS.igdbSlugMax) : '',
    igdbUrl: igdbId ? safeText(input.igdbUrl, GAME_LIMITS.urlMax) : '',
    igdbRating: igdbScore(input.igdbRating), igdbRatingCount: igdbCount(input.igdbRatingCount),
    igdbCriticRating: igdbScore(input.igdbCriticRating), igdbCriticRatingCount: igdbCount(input.igdbCriticRatingCount),
    igdbGenresJson: JSON.stringify(igdbId ? safeList(input.igdbGenres) : []),
    igdbThemesJson: JSON.stringify(igdbId ? safeList(input.igdbThemes) : []),
    igdbDevelopersJson: JSON.stringify(igdbId ? safeList(input.igdbDevelopers) : []),
    igdbUpdatedAt: igdbId ? safeText(input.igdbUpdatedAt, GAME_LIMITS.hltbTimestampMax) || new Date().toISOString() : null,
    steamAppId: Number.isInteger(Number(input.steamAppId)) && Number(input.steamAppId) > 0 ? Number(input.steamAppId) : null,
    steamPlaytimeMinutes: Math.max(0, Number.parseInt(input.steamPlaytimeMinutes, 10) || 0),
    steamLastPlayedAt: input.steamLastPlayedAt ? safeText(input.steamLastPlayedAt, GAME_LIMITS.hltbTimestampMax) : null,
    gogProductId: /^\d+$/.test(String(input.gogProductId || '')) ? String(input.gogProductId) : null,
  };
}

function parseStoredList(value) {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}
function hydrateGame(row) {
  if (!row) return row;
  const { pegiDescriptorsJson, pegiReleasesJson, igdbGenresJson, igdbThemesJson, igdbDevelopersJson, ...game } = row;
  return { ...game, pegiDescriptors: parseStoredList(pegiDescriptorsJson), pegiReleases: parseStoredList(pegiReleasesJson),
    igdbGenres: parseStoredList(igdbGenresJson), igdbThemes: parseStoredList(igdbThemesJson), igdbDevelopers: parseStoredList(igdbDevelopersJson) };
}

function listGames(userId, filters = {}) {
  const clauses = ['user_id = @userId'];
  const params = { userId };
  if (filters.q) {
    clauses.push(`(search_normalize(title) LIKE @q ESCAPE '\\'
      OR search_normalize(publisher) LIKE @q ESCAPE '\\'
      OR search_normalize(notes) LIKE @q ESCAPE '\\'
      OR search_normalize(description) LIKE @q ESCAPE '\\'
      OR search_normalize(igdb_genres) LIKE @q ESCAPE '\\'
      OR search_normalize(igdb_themes) LIKE @q ESCAPE '\\')`);
    params.q = searchPattern(filters.q);
  }
  if (filters.platform === MULTIPLATFORM_FILTER_VALUE) {
    clauses.push(`EXISTS (
      SELECT 1 FROM games AS sibling
      WHERE sibling.user_id=games.user_id AND sibling.id<>games.id AND sibling.hidden=games.hidden
        AND sibling.platform<>games.platform COLLATE NOCASE
        AND ((games.canonical_game_id IS NOT NULL AND sibling.canonical_game_id=games.canonical_game_id)
          OR (games.canonical_game_id IS NULL AND sibling.canonical_game_id IS NULL
            AND search_normalize(sibling.title)=search_normalize(games.title)))
    )`);
  } else if (filters.platform) { clauses.push('platform = @platform'); params.platform = filters.platform; }
  const hiddenFilter = filters.ownership === 'hidden' || filters.playStatus === 'hidden';
  if (filters.ownership === 'owned_physical' || filters.ownership === 'owned_digital') {
    clauses.push('ownership = \'owned\' AND media_format = @ownedFormat');
    params.ownedFormat = filters.ownership.slice('owned_'.length);
  } else if (filters.ownership !== 'hidden' && OWNERSHIP_FILTER_VALUES.includes(filters.ownership)) {
    clauses.push('ownership = @ownership'); params.ownership = filters.ownership;
  }
  if (hiddenFilter) clauses.push('hidden = 1');
  else {
    clauses.push('hidden = 0');
    if (filters.playStatus) { clauses.push('play_status = @playStatus'); params.playStatus = filters.playStatus; }
  }
  if (filters.pegi === 'none') clauses.push('pegi IS NULL');
  else if (filters.pegi) { clauses.push('pegi = @pegi'); params.pegi = Number(filters.pegi); }
  const missingPegi = `(pegi_url='' AND pegi_descriptors='[]' AND pegi_releases='[]'
    AND pegi_advice='' AND pegi_outline='' AND pegi_content_issues='' AND pegi_other_issues='')`;
  if (filters.missing === 'pegi' || filters.missingPegi === '1') clauses.push(missingPegi);
  if (filters.missing === 'igdb') clauses.push('igdb_id IS NULL');
  if (filters.missing === 'cover' || filters.missingCover === '1') clauses.push("cover_url=''");
  if (filters.missing === 'hltb') clauses.push('hltb_id IS NULL');
  if (filters.missing === 'description') clauses.push("description=''");
  if (filters.missing === 'either') clauses.push(`(${missingPegi} OR igdb_id IS NULL OR cover_url='' OR hltb_id IS NULL OR description='')`);
  if (filters.missing === 'both') clauses.push(`${missingPegi} AND igdb_id IS NULL AND cover_url='' AND hltb_id IS NULL AND description=''`);
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
    status: `hidden ASC, CASE play_status WHEN 'playing' THEN 0 WHEN 'backlog' THEN 1 WHEN 'paused' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END, ${titleAsc}`,
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
    igdb_user: `igdb_rating IS NULL, igdb_rating ASC, ${titleAsc}`,
    igdb_user_desc: `igdb_rating IS NULL, igdb_rating DESC, ${titleAsc}`,
    igdb_critic: `igdb_critic_rating IS NULL, igdb_critic_rating ASC, ${titleAsc}`,
    igdb_critic_desc: `igdb_critic_rating IS NULL, igdb_critic_rating DESC, ${titleAsc}`,
    cartridge: `cartridge_number IS NULL, cartridge_number ASC, ${titleAsc}`,
  };
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`SELECT ${selectFields} FROM games ${where} ORDER BY ${sortMap[filters.sort] || sortMap.title}`).all(params).map(hydrateGame);
}

function getGame(userId, id) { return hydrateGame(db.prepare(`SELECT ${selectFields} FROM games WHERE id=? AND user_id=?`).get(id, userId)); }
function allGamesForKatalog() {
  return db.prepare(`SELECT user_id AS userId, ${selectFields} FROM games WHERE user_id IS NOT NULL AND hidden=0 ORDER BY id`).all().map(hydrateGame);
}
function searchGameTitles(userId, query, limit = GAME_LIMITS.titleSearchDefault) {
  const clean = String(query || '').trim().slice(0, GAME_LIMITS.titleMax);
  if (clean.length < TITLE_LOOKUP_MIN_LENGTH) return [];
  return searchTitles.all(userId, searchPattern(clean), normalizeSearchText(clean), Math.max(1, Math.min(GAME_LIMITS.titleSearchMax, Number(limit) || GAME_LIMITS.titleSearchDefault)));
}
const normalizeIdentity = normalizeSearchText;
function accountGameIdentities(userId) { return accountTitles.all(userId); }
function findDuplicateGames(userId, title, platform, igdbId = null, canonicalGameId = null, candidates = null) {
  const wantedTitle = normalizeIdentity(title); const wantedPlatform = normalizeIdentity(platform);
  if (!wantedTitle || !wantedPlatform) return [];
  const wantedIgdbId = Number(igdbId) > 0 ? Number(igdbId) : null;
  const wantedCanonicalId = Number(canonicalGameId) > 0 ? Number(canonicalGameId) : null;
  const accountGames = Array.isArray(candidates) ? candidates : accountGameIdentities(userId);
  return accountGames.filter(game => normalizeIdentity(game.platform) === wantedPlatform
    && (wantedIgdbId
      ? Number(game.igdbId) === wantedIgdbId || (wantedCanonicalId && Number(game.canonicalGameId) === wantedCanonicalId)
      : (wantedCanonicalId && Number(game.canonicalGameId) === wantedCanonicalId) || normalizeIdentity(game.title) === wantedTitle));
}
function createGame(userId, input) {
  const game = normalizeGame(input); const id = insert.run({ ...game, userId }).lastInsertRowid;
  canonical.syncGameById(id); return getGame(userId, id);
}
function updateGame(userId, id, input) {
  const existing = db.prepare(`SELECT steam_app_id AS steamAppId,steam_playtime_minutes AS steamPlaytimeMinutes,
    steam_last_played_at AS steamLastPlayedAt,gog_product_id AS gogProductId FROM games WHERE id=? AND user_id=?`).get(id, userId);
  const game = normalizeGame({ ...input,
    steamAppId: input.steamAppId === undefined ? existing?.steamAppId : input.steamAppId,
    steamPlaytimeMinutes: input.steamPlaytimeMinutes === undefined ? existing?.steamPlaytimeMinutes : input.steamPlaytimeMinutes,
    steamLastPlayedAt: input.steamLastPlayedAt === undefined ? existing?.steamLastPlayedAt : input.steamLastPlayedAt,
    gogProductId: input.gogProductId === undefined ? existing?.gogProductId : input.gogProductId,
  }); const result = update.run({ ...game, id, userId });
  if (!result.changes) return null;
  canonical.syncGameById(id); return getGame(userId, id);
}

function linkSteamGame(userId, id, steamGame = {}) {
  const appId = Number(steamGame.appId); if (!Number.isInteger(appId) || appId <= 0) return null;
  const result = db.prepare(`UPDATE games SET steam_app_id=?,steam_playtime_minutes=?,steam_last_played_at=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND user_id=? AND steam_app_id IS NULL`).run(appId, Math.max(0, Number.parseInt(steamGame.playtimeMinutes, 10) || 0),
      steamGame.lastPlayedAt || null, id, userId);
  if (!result.changes) return null;
  canonical.syncGameById(id); return getGame(userId, id);
}
function linkGogGame(userId, id, gogGame = {}) {
  const productId = String(gogGame.productId || '').trim(); if (!/^\d+$/.test(productId)) return null;
  const result = db.prepare(`UPDATE games SET gog_product_id=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND user_id=? AND gog_product_id IS NULL`).run(productId, id, userId);
  if (!result.changes) return null;
  canonical.syncGameById(id); return getGame(userId, id);
}
function deleteGame(userId, id) {
  const game = db.prepare('SELECT canonical_game_id AS canonicalGameId FROM games WHERE id=? AND user_id=?').get(id, userId);
  const deleted = db.prepare('DELETE FROM games WHERE id=? AND user_id=?').run(id, userId).changes > 0;
  if (deleted && game?.canonicalGameId) canonical.pruneOrphans(game.canonicalGameId);
  return deleted;
}

function coverProviderCredentials(userId, provider) {
  const row = db.prepare('SELECT credentials_json FROM cover_provider_credentials WHERE user_id=? AND provider=?').get(userId, provider);
  if (!row) return null;
  try { const value = JSON.parse(row.credentials_json); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
  catch { return null; }
}
function setCoverProviderCredentials(userId, provider, credentials) {
  const cleanProvider = String(provider || '').trim();
  if (!cleanProvider) throw new Error('Cover provider is required.');
  if (!credentials) { db.prepare('DELETE FROM cover_provider_credentials WHERE user_id=? AND provider=?').run(userId, cleanProvider); return; }
  db.prepare(`INSERT INTO cover_provider_credentials (user_id, provider, credentials_json) VALUES (?, ?, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET credentials_json=excluded.credentials_json, updated_at=CURRENT_TIMESTAMP`)
    .run(userId, cleanProvider, JSON.stringify(credentials));
}
function gamesMissingCovers(userId) { return db.prepare(`SELECT id, title, platform FROM games WHERE user_id=? AND hidden=0 AND cover_url='' ORDER BY title COLLATE NOCASE`).all(userId); }
function updateGameCover(userId, id, cover) {
  const result = db.prepare(`UPDATE games SET cover_url=?, cover_source=?, cover_match_title=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND user_id=? AND hidden=0 AND cover_url=''`).run(cover.url || '', cover.source || '', cover.matchTitle || '', id, userId);
  return result.changes ? getGame(userId, id) : null;
}
function gamesWithRemoteCovers() {
  return db.prepare(`SELECT id, user_id AS userId, cover_url AS coverUrl FROM games
    WHERE cover_url LIKE 'https://%' ORDER BY id`).all();
}
function gamesWithLocalCovers() {
  return db.prepare(`SELECT id, user_id AS userId, cover_url AS coverUrl FROM games
    WHERE cover_url LIKE '/covers/%' ORDER BY id`).all();
}
function coverUrlReferenceCount(coverUrl) {
  return db.prepare('SELECT COUNT(*) AS count FROM games WHERE cover_url=?').get(coverUrl).count;
}
function replaceGameCoverUrl(userId, id, expectedUrl, localUrl) {
  const result = db.prepare(`UPDATE games SET cover_url=?
    WHERE id=? AND user_id=? AND cover_url=?`).run(localUrl, id, userId, expectedUrl);
  return result.changes ? getGame(userId, id) : null;
}

function gamesMissingPegiMetadata(userId) {
  return db.prepare(`SELECT id, title, platform FROM games WHERE user_id=? AND hidden=0
    AND pegi_url=''
    AND pegi_descriptors='[]' AND pegi_releases='[]' AND pegi_advice=''
    AND pegi_outline='' AND pegi_content_issues='' AND pegi_other_issues=''
    ORDER BY title COLLATE NOCASE`).all(userId);
}

function updateGamePegiMetadata(userId, id, metadata = {}) {
  const ratingValue = metadata.pegi ?? metadata.rating;
  const yearValue = metadata.releaseYear ?? metadata.year;
  const pegi = PEGI_RATINGS.includes(Number(ratingValue)) ? Number(ratingValue) : null;
  const releaseYear = validReleaseYear(yearValue) ? Number(yearValue) : null;
  const result = db.prepare(`UPDATE games SET pegi=COALESCE(@pegi, pegi),
    publisher=CASE WHEN @publisher<>'' THEN @publisher ELSE publisher END,
    release_year=COALESCE(@releaseYear, release_year), pegi_url=@pegiUrl,
    pegi_descriptors=@pegiDescriptorsJson, pegi_releases=@pegiReleasesJson,
    pegi_advice=@pegiAdvice, pegi_outline=@pegiOutline,
    pegi_content_issues=@pegiContentIssues, pegi_other_issues=@pegiOtherIssues,
    updated_at=CURRENT_TIMESTAMP WHERE id=@id AND user_id=@userId AND hidden=0
    AND pegi_url='' AND pegi_descriptors='[]' AND pegi_releases='[]'
    AND pegi_advice='' AND pegi_outline='' AND pegi_content_issues='' AND pegi_other_issues=''`).run({
      id, userId, pegi, releaseYear,
      publisher: safeText(metadata.publisher, GAME_LIMITS.publisherMax), pegiUrl: safeText(metadata.pegiUrl ?? metadata.url, GAME_LIMITS.urlMax),
      pegiDescriptorsJson: JSON.stringify(safeList(metadata.descriptors)),
      pegiReleasesJson: JSON.stringify(safeList(metadata.releases)),
      pegiAdvice: safeText(metadata.advice), pegiOutline: safeText(metadata.outline),
      pegiContentIssues: safeText(metadata.contentIssues), pegiOtherIssues: safeText(metadata.otherIssues),
    });
  if (!result.changes) return null;
  canonical.syncGameById(id); return getGame(userId, id);
}

function gamesMissingHltb(userId) {
  return db.prepare('SELECT id, title, platform FROM games WHERE user_id=? AND hidden=0 AND hltb_id IS NULL ORDER BY title COLLATE NOCASE').all(userId);
}

function gamesMissingDescriptions(userId) {
  return db.prepare("SELECT id, title, platform FROM games WHERE user_id=? AND hidden=0 AND description='' ORDER BY title COLLATE NOCASE").all(userId);
}

function gamesMissingIgdb(userId) {
  return db.prepare('SELECT id, title, platform FROM games WHERE user_id=? AND hidden=0 AND igdb_id IS NULL ORDER BY title COLLATE NOCASE').all(userId);
}

function updateGameIgdb(userId, id, metadata = {}) {
  const igdbId = Number.isInteger(Number(metadata.igdbId ?? metadata.id)) && Number(metadata.igdbId ?? metadata.id) > 0
    ? Number(metadata.igdbId ?? metadata.id) : null;
  if (!igdbId) return null;
  const score = value => value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100
    ? Math.round(Number(value) * 10) / 10 : null;
  const count = value => Math.max(0, Number.parseInt(value, 10) || 0);
  const description = safeText(metadata.description, GAME_LIMITS.descriptionMax);
  const result = db.prepare(`UPDATE games SET igdb_id=@igdbId, igdb_slug=@igdbSlug, igdb_url=@igdbUrl,
    igdb_rating=@igdbRating, igdb_rating_count=@igdbRatingCount,
    igdb_critic_rating=@igdbCriticRating, igdb_critic_rating_count=@igdbCriticRatingCount,
    igdb_genres=@igdbGenres, igdb_themes=@igdbThemes, igdb_developers=@igdbDevelopers,
    igdb_updated_at=@igdbUpdatedAt,
    publisher=CASE WHEN publisher='' AND @publisher<>'' THEN @publisher ELSE publisher END,
    release_year=CASE WHEN release_year IS NULL THEN @releaseYear ELSE release_year END,
    description=CASE WHEN description='' AND @description<>'' THEN @description ELSE description END,
    description_source=CASE WHEN description='' AND @description<>'' THEN 'IGDB' ELSE description_source END,
    description_source_url=CASE WHEN description='' AND @description<>'' THEN @igdbUrl ELSE description_source_url END,
    updated_at=CURRENT_TIMESTAMP WHERE id=@id AND user_id=@userId AND hidden=0 AND igdb_id IS NULL`).run({
      id, userId, igdbId, igdbSlug: safeText(metadata.slug ?? metadata.igdbSlug, GAME_LIMITS.igdbSlugMax),
      igdbUrl: safeText(metadata.sourceUrl ?? metadata.igdbUrl, GAME_LIMITS.urlMax),
      igdbRating: score(metadata.rating ?? metadata.igdbRating), igdbRatingCount: count(metadata.ratingCount ?? metadata.igdbRatingCount),
      igdbCriticRating: score(metadata.criticRating ?? metadata.igdbCriticRating), igdbCriticRatingCount: count(metadata.criticRatingCount ?? metadata.igdbCriticRatingCount),
      igdbGenres: JSON.stringify(safeList(metadata.genres ?? metadata.igdbGenres)),
      igdbThemes: JSON.stringify(safeList(metadata.themes ?? metadata.igdbThemes)),
      igdbDevelopers: JSON.stringify(safeList(metadata.developers ?? metadata.igdbDevelopers)),
      igdbUpdatedAt: new Date().toISOString(), publisher: safeText(metadata.publisher, GAME_LIMITS.publisherMax),
      releaseYear: validReleaseYear(metadata.releaseYear) ? Number(metadata.releaseYear) : null, description,
    });
  if (!result.changes) return null;
  canonical.syncGameById(id); return getGame(userId, id);
}

function updateGameDescription(userId, id, metadata = {}) {
  const description = safeText(metadata.description, GAME_LIMITS.descriptionMax);
  if (!description) return null;
  const result = db.prepare(`UPDATE games SET description=@description, description_source=@descriptionSource,
    description_source_url=@descriptionSourceUrl, updated_at=CURRENT_TIMESTAMP WHERE id=@id AND user_id=@userId AND hidden=0 AND description=''`).run({
    id, userId, description, descriptionSource: safeText(metadata.source, GAME_LIMITS.coverSourceMax),
    descriptionSourceUrl: safeText(metadata.url || metadata.sourceUrl, GAME_LIMITS.urlMax),
  });
  if (!result.changes) return null;
  canonical.syncGameById(id); return getGame(userId, id);
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
    WHERE id=@id AND user_id=@userId AND hidden=0 AND hltb_id IS NULL`).run({ id, userId, ...normalized });
  return result.changes ? getGame(userId, id) : null;
}

function stats(userId) {
  const total = db.prepare('SELECT COUNT(*) n FROM games WHERE user_id=? AND hidden=0').get(userId).n;
  const ownership = db.prepare('SELECT ownership label, COUNT(*) count FROM games WHERE user_id=? AND hidden=0 GROUP BY ownership').all(userId);
  const ownedFormats = db.prepare("SELECT media_format label, COUNT(*) count FROM games WHERE user_id=? AND hidden=0 AND ownership='owned' GROUP BY media_format").all(userId);
  const platforms = db.prepare('SELECT platform label, COUNT(*) count FROM games WHERE user_id=? AND hidden=0 GROUP BY platform ORDER BY count DESC, platform').all(userId);
  const pegi = db.prepare("SELECT COALESCE(CAST(pegi AS TEXT), 'Unrated') label, COUNT(*) count FROM games WHERE user_id=? AND hidden=0 GROUP BY pegi ORDER BY pegi").all(userId);
  const play = db.prepare('SELECT play_status label, COUNT(*) count FROM games WHERE user_id=? AND hidden=0 GROUP BY play_status').all(userId);
  const favorites = db.prepare('SELECT COUNT(*) n FROM games WHERE user_id=? AND hidden=0 AND favorite=1').get(userId).n;
  return { total, favorites, ownership, ownedFormats, platforms, pegi, play };
}

function platformNames(userId) {
  return db.prepare('SELECT DISTINCT platform FROM games WHERE user_id=? ORDER BY platform COLLATE NOCASE').all(userId).map(row => row.platform);
}

module.exports = { db, canonical, progression, normalizeGame, listGames, getGame, allGamesForKatalog, accountGameIdentities, searchGameTitles, findDuplicateGames, createGame, updateGame, deleteGame, linkSteamGame, linkGogGame,
  coverProviderCredentials, setCoverProviderCredentials, gamesMissingCovers, updateGameCover,
  gamesWithRemoteCovers, gamesWithLocalCovers, coverUrlReferenceCount, replaceGameCoverUrl,
  gamesMissingPegiMetadata, updateGamePegiMetadata, gamesMissingHltb, updateGameHltb, gamesMissingDescriptions, updateGameDescription,
  gamesMissingIgdb, updateGameIgdb, platformNames, stats };
