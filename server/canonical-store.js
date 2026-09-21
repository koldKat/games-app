'use strict';

const { normalizeKatalogText } = require('./katalog-policy');

const clean = value => String(value || '').trim();
const listJson = value => JSON.stringify(Array.isArray(value) ? value : []);
const BACKFILL_KEY = 'canonical-identity-v1';
const tableExists = (database, table) => Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
const columns = (database, table) => tableExists(database, table) ? new Set(database.pragma(`table_info(${table})`).map(column => column.name)) : new Set();

function addColumn(database, table, known, name, definition) {
  if (!known.has(name)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

function slugPart(value) {
  return normalizeKatalogText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'game';
}

function createCanonicalStore(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS canonical_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_key TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL COLLATE NOCASE,
      title_key TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'local' CHECK (source IN ('local','igdb')),
      igdb_id INTEGER,
      igdb_slug TEXT NOT NULL DEFAULT '',
      igdb_url TEXT NOT NULL DEFAULT '',
      game_type TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      publisher TEXT NOT NULL DEFAULT '',
      release_year INTEGER,
      igdb_rating REAL,
      igdb_rating_count INTEGER NOT NULL DEFAULT 0,
      igdb_critic_rating REAL,
      igdb_critic_rating_count INTEGER NOT NULL DEFAULT 0,
      igdb_genres TEXT NOT NULL DEFAULT '[]',
      igdb_themes TEXT NOT NULL DEFAULT '[]',
      igdb_developers TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_games_igdb ON canonical_games(igdb_id) WHERE igdb_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_canonical_games_title ON canonical_games(title_key);
    CREATE TABLE IF NOT EXISTS canonical_releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_game_id INTEGER NOT NULL REFERENCES canonical_games(id) ON DELETE CASCADE,
      platform TEXT NOT NULL COLLATE NOCASE,
      platform_key TEXT NOT NULL,
      edition TEXT NOT NULL DEFAULT '',
      edition_key TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      region_key TEXT NOT NULL DEFAULT '',
      publisher TEXT NOT NULL DEFAULT '',
      release_year INTEGER,
      release_date TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(canonical_game_id, platform_key, edition_key, region_key)
    );
    CREATE INDEX IF NOT EXISTS idx_canonical_releases_game ON canonical_releases(canonical_game_id, platform_key);
    CREATE TABLE IF NOT EXISTS canonical_relationships (
      parent_game_id INTEGER NOT NULL REFERENCES canonical_games(id) ON DELETE CASCADE,
      child_game_id INTEGER NOT NULL REFERENCES canonical_games(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (parent_game_id, child_game_id, relation_type),
      CHECK (parent_game_id <> child_game_id)
    );
    CREATE TABLE IF NOT EXISTS canonical_external_ids (
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      canonical_game_id INTEGER NOT NULL REFERENCES canonical_games(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (provider, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_canonical_external_game ON canonical_external_ids(canonical_game_id);
    CREATE TABLE IF NOT EXISTS canonical_identity_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL CHECK (record_type IN ('game','catalogue')),
      record_id INTEGER NOT NULL,
      current_canonical_game_id INTEGER REFERENCES canonical_games(id) ON DELETE CASCADE,
      proposed_canonical_game_id INTEGER REFERENCES canonical_games(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(record_type, record_id, proposed_canonical_game_id)
    );
    CREATE TABLE IF NOT EXISTS canonical_migrations (
      key TEXT PRIMARY KEY,
      completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const gameColumns = columns(database, 'games');
  addColumn(database, 'games', gameColumns, 'igdb_id', 'INTEGER');
  addColumn(database, 'games', gameColumns, 'gog_product_id', 'TEXT');
  addColumn(database, 'games', gameColumns, 'canonical_game_id', 'INTEGER REFERENCES canonical_games(id) ON DELETE SET NULL');
  addColumn(database, 'games', gameColumns, 'canonical_release_id', 'INTEGER REFERENCES canonical_releases(id) ON DELETE SET NULL');
  database.exec('CREATE INDEX IF NOT EXISTS idx_games_canonical ON games(canonical_game_id, canonical_release_id)');

  function ensureCatalogueSchema() {
    if (!tableExists(database, 'catalogue_entries')) return;
    const catalogueColumns = columns(database, 'catalogue_entries');
    addColumn(database, 'catalogue_entries', catalogueColumns, 'canonical_game_id', 'INTEGER REFERENCES canonical_games(id) ON DELETE SET NULL');
    addColumn(database, 'catalogue_entries', catalogueColumns, 'canonical_release_id', 'INTEGER REFERENCES canonical_releases(id) ON DELETE SET NULL');
    database.exec('CREATE INDEX IF NOT EXISTS idx_catalogue_canonical ON catalogue_entries(canonical_game_id, canonical_release_id)');
  }

  const orphanPredicate = `NOT EXISTS (SELECT 1 FROM games WHERE games.canonical_game_id=canonical_games.id)
    AND NOT EXISTS (SELECT 1 FROM canonical_relationships WHERE parent_game_id=canonical_games.id OR child_game_id=canonical_games.id)
    AND NOT EXISTS (SELECT 1 FROM canonical_external_ids WHERE canonical_game_id=canonical_games.id)
    AND NOT EXISTS (SELECT 1 FROM canonical_identity_conflicts WHERE current_canonical_game_id=canonical_games.id OR proposed_canonical_game_id=canonical_games.id)`;

  function pruneOrphans(id = null) {
    const catalogueReference = tableExists(database, 'catalogue_entries')
      ? 'AND NOT EXISTS (SELECT 1 FROM catalogue_entries WHERE catalogue_entries.canonical_game_id=canonical_games.id)' : '';
    const idClause = id ? 'id=@id AND' : '';
    const statement = database.prepare(`DELETE FROM canonical_games WHERE ${idClause} ${orphanPredicate} ${catalogueReference}`);
    return (id ? statement.run({ id: Number(id) }) : statement.run()).changes;
  }

  function uniqueSlug(title, igdbId = null) {
    const base = slugPart(title); let slug = igdbId ? `${base}-${igdbId}` : base; let suffix = 2;
    while (database.prepare('SELECT 1 FROM canonical_games WHERE slug=?').get(slug)) slug = `${base}-${igdbId ? `${igdbId}-` : ''}${suffix++}`;
    return slug;
  }

  function canonicalFacts(facts = {}, allowLocal = false) {
    const igdbId = Number(facts.igdbId) > 0 ? Number(facts.igdbId) : null;
    const title = clean(facts.title);
    const titleKey = normalizeKatalogText(title);
    if (!titleKey || (!igdbId && !allowLocal)) return null;
    return {
      identityKey: igdbId ? `igdb:${igdbId}` : `local:${titleKey}`,
      title, titleKey, source: igdbId ? 'igdb' : 'local', igdbId,
      igdbSlug: clean(facts.igdbSlug), igdbUrl: clean(facts.igdbUrl), gameType: clean(facts.igdbGameType || facts.gameType),
      description: clean(facts.description), publisher: clean(facts.publisher), releaseYear: facts.releaseYear ?? null,
      igdbRating: facts.igdbRating ?? null, igdbRatingCount: Number(facts.igdbRatingCount) || 0,
      igdbCriticRating: facts.igdbCriticRating ?? null, igdbCriticRatingCount: Number(facts.igdbCriticRatingCount) || 0,
      igdbGenres: listJson(facts.igdbGenres), igdbThemes: listJson(facts.igdbThemes), igdbDevelopers: listJson(facts.igdbDevelopers),
    };
  }

  function upsertGame(facts, { allowLocal = false } = {}) {
    const value = canonicalFacts(facts, allowLocal);
    if (!value) return null;
    let row = database.prepare('SELECT * FROM canonical_games WHERE identity_key=?').get(value.identityKey);
    if (!row) {
      const result = database.prepare(`INSERT INTO canonical_games
        (identity_key,slug,title,title_key,source,igdb_id,igdb_slug,igdb_url,game_type,description,publisher,release_year,
         igdb_rating,igdb_rating_count,igdb_critic_rating,igdb_critic_rating_count,igdb_genres,igdb_themes,igdb_developers)
        VALUES (@identityKey,@slug,@title,@titleKey,@source,@igdbId,@igdbSlug,@igdbUrl,@gameType,@description,@publisher,@releaseYear,
         @igdbRating,@igdbRatingCount,@igdbCriticRating,@igdbCriticRatingCount,@igdbGenres,@igdbThemes,@igdbDevelopers)`)
        .run({ ...value, slug: uniqueSlug(value.igdbSlug || value.title, value.igdbId) });
      row = database.prepare('SELECT * FROM canonical_games WHERE id=?').get(result.lastInsertRowid);
    } else {
      database.prepare(`UPDATE canonical_games SET igdb_slug=CASE WHEN @igdbSlug<>'' THEN @igdbSlug ELSE igdb_slug END,
        igdb_url=CASE WHEN @igdbUrl<>'' THEN @igdbUrl ELSE igdb_url END,
        game_type=CASE WHEN @gameType<>'' THEN @gameType ELSE game_type END,
        description=CASE WHEN @description<>'' THEN @description ELSE description END,
        publisher=CASE WHEN @publisher<>'' THEN @publisher ELSE publisher END,
        release_year=COALESCE(@releaseYear,release_year), igdb_rating=COALESCE(@igdbRating,igdb_rating),
        igdb_rating_count=MAX(@igdbRatingCount,igdb_rating_count),
        igdb_critic_rating=COALESCE(@igdbCriticRating,igdb_critic_rating),
        igdb_critic_rating_count=MAX(@igdbCriticRatingCount,igdb_critic_rating_count),
        igdb_genres=CASE WHEN @igdbGenres<>'[]' THEN @igdbGenres ELSE igdb_genres END,
        igdb_themes=CASE WHEN @igdbThemes<>'[]' THEN @igdbThemes ELSE igdb_themes END,
        igdb_developers=CASE WHEN @igdbDevelopers<>'[]' THEN @igdbDevelopers ELSE igdb_developers END,
        updated_at=CURRENT_TIMESTAMP WHERE id=@id`)
        .run({ ...value, id: row.id });
      row = database.prepare('SELECT * FROM canonical_games WHERE id=?').get(row.id);
    }
    return row;
  }

  function ensureRelease(canonicalGameId, facts = {}) {
    const platform = clean(facts.platform); const platformKey = normalizeKatalogText(platform);
    if (!canonicalGameId || !platformKey) return null;
    const edition = clean(facts.edition); const editionKey = normalizeKatalogText(edition);
    const region = clean(facts.region); const regionKey = normalizeKatalogText(region);
    database.prepare(`INSERT INTO canonical_releases
      (canonical_game_id,platform,platform_key,edition,edition_key,region,region_key,publisher,release_year,release_date)
      VALUES (@canonicalGameId,@platform,@platformKey,@edition,@editionKey,@region,@regionKey,@publisher,@releaseYear,@releaseDate)
      ON CONFLICT(canonical_game_id,platform_key,edition_key,region_key) DO UPDATE SET
      publisher=CASE WHEN excluded.publisher<>'' THEN excluded.publisher ELSE canonical_releases.publisher END,
      release_year=COALESCE(excluded.release_year,canonical_releases.release_year),
      release_date=COALESCE(excluded.release_date,canonical_releases.release_date), updated_at=CURRENT_TIMESTAMP`).run({
        canonicalGameId, platform, platformKey, edition, editionKey, region, regionKey,
        publisher: clean(facts.publisher), releaseYear: facts.releaseYear ?? null, releaseDate: facts.releaseDate || null,
      });
    return database.prepare(`SELECT * FROM canonical_releases WHERE canonical_game_id=? AND platform_key=? AND edition_key=? AND region_key=?`)
      .get(canonicalGameId, platformKey, editionKey, regionKey);
  }

  function syncGameById(id) {
    const game = database.prepare(`SELECT id,title,platform,publisher,release_year AS releaseYear,
      igdb_id AS igdbId,igdb_slug AS igdbSlug,igdb_url AS igdbUrl,igdb_rating AS igdbRating,
      igdb_rating_count AS igdbRatingCount,igdb_critic_rating AS igdbCriticRating,
      igdb_critic_rating_count AS igdbCriticRatingCount,igdb_genres AS igdbGenres,
      igdb_themes AS igdbThemes,igdb_developers AS igdbDevelopers,description,
      steam_app_id AS steamAppId,gog_product_id AS gogProductId,
      canonical_game_id AS canonicalGameId FROM games WHERE id=?`).get(Number(id));
    if (!game) return null;
    for (const field of ['igdbGenres', 'igdbThemes', 'igdbDevelopers']) {
      try { game[field] = JSON.parse(game[field] || '[]'); } catch { game[field] = []; }
    }
    if (!game.igdbId) {
      const externalIdentity = game.steamAppId ? ['steam', String(game.steamAppId)]
        : game.gogProductId ? ['gog', String(game.gogProductId)] : null;
      if (externalIdentity) {
        const [provider, externalId] = externalIdentity;
        const external = database.prepare(`SELECT cg.* FROM canonical_external_ids cei
          JOIN canonical_games cg ON cg.id=cei.canonical_game_id WHERE cei.provider=? AND cei.external_id=?`).get(provider, externalId);
        const canonical = external || upsertGame(game, { allowLocal: true });
        const release = ensureRelease(canonical.id, game);
        database.prepare('INSERT OR IGNORE INTO canonical_external_ids(provider,external_id,canonical_game_id) VALUES (?,?,?)')
          .run(provider, externalId, canonical.id);
        database.prepare('UPDATE games SET canonical_game_id=?, canonical_release_id=? WHERE id=?').run(canonical.id, release?.id || null, game.id);
        if (game.canonicalGameId && Number(game.canonicalGameId) !== Number(canonical.id)) pruneOrphans(game.canonicalGameId);
        return { canonical, release };
      }
      const linked = tableExists(database, 'catalogue_game_links') && database.prepare(`SELECT ce.canonical_game_id AS canonicalGameId, ce.canonical_release_id AS canonicalReleaseId
        FROM catalogue_game_links l JOIN catalogue_entries ce ON ce.id=l.catalogue_id WHERE l.game_id=?`).get(game.id);
      database.prepare('UPDATE games SET canonical_game_id=?, canonical_release_id=? WHERE id=?')
        .run(linked?.canonicalGameId || null, linked?.canonicalReleaseId || null, game.id);
      if (game.canonicalGameId && Number(game.canonicalGameId) !== Number(linked?.canonicalGameId)) pruneOrphans(game.canonicalGameId);
      return linked || null;
    }
    const canonical = upsertGame(game); const release = ensureRelease(canonical.id, game);
    const externalIdentities = [game.steamAppId && ['steam', String(game.steamAppId)], game.gogProductId && ['gog', String(game.gogProductId)]].filter(Boolean);
    for (const [provider, externalId] of externalIdentities) {
      const previous = database.prepare(`SELECT cei.canonical_game_id AS canonicalGameId,cg.source FROM canonical_external_ids cei
        JOIN canonical_games cg ON cg.id=cei.canonical_game_id WHERE cei.provider=? AND cei.external_id=?`).get(provider, externalId);
      if (!previous || previous.source === 'local' || Number(previous.canonicalGameId) === Number(canonical.id)) {
        database.prepare(`INSERT INTO canonical_external_ids(provider,external_id,canonical_game_id) VALUES (?,?,?)
          ON CONFLICT(provider,external_id) DO UPDATE SET canonical_game_id=excluded.canonical_game_id`)
          .run(provider, externalId, canonical.id);
        if (previous?.canonicalGameId && Number(previous.canonicalGameId) !== Number(canonical.id)) pruneOrphans(previous.canonicalGameId);
      }
    }
    database.prepare('UPDATE games SET canonical_game_id=?, canonical_release_id=? WHERE id=?').run(canonical.id, release?.id || null, game.id);
    if (game.canonicalGameId && Number(game.canonicalGameId) !== Number(canonical.id)) pruneOrphans(game.canonicalGameId);
    return { canonical, release };
  }

  function syncCatalogueById(id) {
    ensureCatalogueSchema();
    if (!tableExists(database, 'catalogue_entries')) return null;
    const entry = database.prepare(`SELECT id,title,platform,publisher,release_year AS releaseYear,description,
      igdb_id AS igdbId,igdb_slug AS igdbSlug,igdb_url AS igdbUrl,igdb_rating AS igdbRating,
      igdb_rating_count AS igdbRatingCount,igdb_critic_rating AS igdbCriticRating,
      igdb_critic_rating_count AS igdbCriticRatingCount,igdb_genres AS igdbGenres,
      igdb_themes AS igdbThemes,igdb_developers AS igdbDevelopers,
      canonical_game_id AS previousCanonicalGameId FROM catalogue_entries WHERE id=?`).get(Number(id));
    if (!entry) return null;
    for (const field of ['igdbGenres', 'igdbThemes', 'igdbDevelopers']) {
      try { entry[field] = JSON.parse(entry[field] || '[]'); } catch { entry[field] = []; }
    }
    const linkedIgdb = !entry.igdbId && tableExists(database, 'catalogue_game_links')
      ? database.prepare(`SELECT g.igdb_id AS igdbId FROM catalogue_game_links l JOIN games g ON g.id=l.game_id
        WHERE l.catalogue_id=? AND g.igdb_id IS NOT NULL ORDER BY g.id LIMIT 1`).get(entry.id)
      : null;
    let targetIgdbId = entry.igdbId || linkedIgdb?.igdbId || null;
    let canonical = upsertGame({ ...entry, igdbId: targetIgdbId }, { allowLocal: true }); let release = ensureRelease(canonical.id, entry);
    database.prepare('UPDATE catalogue_entries SET canonical_game_id=?, canonical_release_id=? WHERE id=?').run(canonical.id, release?.id || null, entry.id);
    if (tableExists(database, 'catalogue_game_links')) {
      const links = database.prepare('SELECT game_id AS gameId FROM catalogue_game_links WHERE catalogue_id=?').all(entry.id);
      for (const link of links) {
        const privateGame = database.prepare('SELECT igdb_id AS igdbId, canonical_game_id AS canonicalGameId FROM games WHERE id=?').get(link.gameId);
        if (!privateGame) continue;
        if (privateGame.igdbId) {
          const privateIdentity = syncGameById(link.gameId);
          if (!targetIgdbId && privateIdentity?.canonical) {
            targetIgdbId = privateGame.igdbId;
            canonical = privateIdentity.canonical; release = ensureRelease(canonical.id, entry);
            database.prepare('UPDATE catalogue_entries SET canonical_game_id=?, canonical_release_id=? WHERE id=?')
              .run(canonical.id, release?.id || null, entry.id);
          } else if (Number(privateGame.igdbId) !== Number(targetIgdbId)) {
            database.prepare(`INSERT OR IGNORE INTO canonical_identity_conflicts
              (record_type,record_id,current_canonical_game_id,proposed_canonical_game_id,reason) VALUES ('game',?,?,?,'linked release has a different IGDB identity')`)
              .run(link.gameId, privateGame.canonicalGameId || null, canonical.id);
            continue;
          }
        }
        database.prepare('UPDATE games SET canonical_game_id=?, canonical_release_id=? WHERE id=?').run(canonical.id, release?.id || null, link.gameId);
        database.prepare(`UPDATE canonical_identity_conflicts SET resolved_at=CURRENT_TIMESTAMP
          WHERE record_type='game' AND record_id=? AND resolved_at IS NULL`).run(link.gameId);
      }
    }
    if (entry.previousCanonicalGameId && Number(entry.previousCanonicalGameId) !== Number(canonical.id)) pruneOrphans(entry.previousCanonicalGameId);
    return { canonical, release };
  }

  function linkCatalogueGame(catalogueId, gameId) {
    const identity = syncCatalogueById(catalogueId);
    if (!identity) return null;
    const game = database.prepare('SELECT igdb_id AS igdbId FROM games WHERE id=?').get(Number(gameId));
    const entry = database.prepare('SELECT igdb_id AS igdbId FROM catalogue_entries WHERE id=?').get(Number(catalogueId));
    if (game?.igdbId && entry?.igdbId && Number(game.igdbId) !== Number(entry.igdbId)) return syncGameById(gameId);
    database.prepare('UPDATE games SET canonical_game_id=?, canonical_release_id=? WHERE id=?')
      .run(identity.canonical.id, identity.release?.id || null, Number(gameId));
    return identity;
  }

  function backfill() {
    ensureCatalogueSchema();
    if (database.prepare('SELECT 1 FROM canonical_migrations WHERE key=?').get(BACKFILL_KEY)) {
      pruneOrphans(); return counts();
    }
    const run = database.transaction(() => {
      if (tableExists(database, 'catalogue_entries')) {
        for (const row of database.prepare('SELECT id FROM catalogue_entries ORDER BY id').all()) syncCatalogueById(row.id);
      }
      for (const row of database.prepare('SELECT id FROM games WHERE igdb_id IS NOT NULL ORDER BY id').all()) syncGameById(row.id);
      if (tableExists(database, 'catalogue_game_links')) {
        for (const row of database.prepare('SELECT catalogue_id AS catalogueId, game_id AS gameId FROM catalogue_game_links').all()) linkCatalogueGame(row.catalogueId, row.gameId);
      }
      pruneOrphans();
      database.prepare('INSERT INTO canonical_migrations(key) VALUES (?)').run(BACKFILL_KEY);
    });
    run();
    return counts();
  }

  function counts() {
    return {
      games: database.prepare('SELECT COUNT(*) count FROM canonical_games').get().count,
      releases: database.prepare('SELECT COUNT(*) count FROM canonical_releases').get().count,
      linkedCopies: database.prepare('SELECT COUNT(*) count FROM games WHERE canonical_game_id IS NOT NULL').get().count,
      conflicts: database.prepare('SELECT COUNT(*) count FROM canonical_identity_conflicts WHERE resolved_at IS NULL').get().count,
    };
  }

  function unresolvedConflicts() {
    return database.prepare(`SELECT id,record_type AS recordType,record_id AS recordId,reason,created_at AS createdAt
      FROM canonical_identity_conflicts WHERE resolved_at IS NULL ORDER BY created_at DESC,id DESC`).all();
  }

  return { backfill, counts, ensureCatalogueSchema, ensureRelease, linkCatalogueGame, pruneOrphans, syncCatalogueById, syncGameById, unresolvedConflicts, upsertGame };
}

module.exports = { createCanonicalStore };
