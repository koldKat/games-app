const { createCanonicalStore } = require('../canonical-store');
const { createProgressionStore } = require('../progression-store');
const { MEDIA_FORMAT_VALUES, OWNERSHIP_VALUES, PEGI_RATINGS, PLAY_STATUS_VALUES, STORED_PLAY_STATUS_VALUES } = require('../constants');
const { normalizeSearchText, gameGroupTitleKey, sqlTextValues } = require('./values');

function initializeSchema(db) {
  db.function('search_normalize', { deterministic: true }, normalizeSearchText);
  db.function('game_group_key', { deterministic: true }, gameGroupTitleKey);

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
      format_physical INTEGER NOT NULL DEFAULT 1 CHECK (format_physical IN (0, 1)),
      format_digital INTEGER NOT NULL DEFAULT 0 CHECK (format_digital IN (0, 1)),
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
  if (!gameColumns.includes('format_physical') || !gameColumns.includes('format_digital')) db.transaction(() => {
    if (!gameColumns.includes('format_physical')) db.exec('ALTER TABLE games ADD COLUMN format_physical INTEGER NOT NULL DEFAULT 0 CHECK (format_physical IN (0, 1))');
    if (!gameColumns.includes('format_digital')) db.exec('ALTER TABLE games ADD COLUMN format_digital INTEGER NOT NULL DEFAULT 0 CHECK (format_digital IN (0, 1))');
    db.prepare(`UPDATE games SET format_physical=CASE WHEN media_format='physical' THEN 1 ELSE 0 END,
      format_digital=CASE WHEN media_format='digital' THEN 1 ELSE 0 END`).run();
  })();
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

  return { canonical, progression };
}
module.exports = { initializeSchema };
