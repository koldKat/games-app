'use strict';

const { evaluateKatalogGame, normalizeKatalogText } = require('./katalog-policy');
const { createCanonicalStore } = require('./canonical-store');
const { GAME_LIMITS, KATALOG_LIMITS } = require('./validation-policy');

const ENTRY_STATUSES = Object.freeze(['candidate', 'public', 'rejected']);
// The wide Kat·a·log grid has eight columns: keep ten complete desktop rows visible per page.
const PEGI_RATINGS = new Set(require('./constants').PEGI_RATINGS);

const storedFields = `id, slug, title, title_key AS titleKey, platform, pegi, publisher, release_year AS releaseYear,
  canonical_game_id AS canonicalGameId, canonical_release_id AS canonicalReleaseId,
  pegi_url AS pegiUrl, pegi_descriptors AS pegiDescriptorsJson, pegi_releases AS pegiReleasesJson,
  pegi_advice AS pegiAdvice, pegi_outline AS pegiOutline,
  pegi_content_issues AS pegiContentIssues, pegi_other_issues AS pegiOtherIssues,
  hltb_id AS hltbId, hltb_title AS hltbTitle, hltb_url AS hltbUrl,
  hltb_main_story AS hltbMainStory, hltb_main_extra AS hltbMainExtra,
  hltb_completionist AS hltbCompletionist, hltb_all_styles AS hltbAllStyles,
  cover_url AS coverUrl, cover_source AS coverSource, cover_match_title AS coverMatchTitle,
  description, description_source AS descriptionSource, description_source_url AS descriptionSourceUrl,
  igdb_id AS igdbId, igdb_slug AS igdbSlug, igdb_url AS igdbUrl,
  igdb_rating AS igdbRating, igdb_rating_count AS igdbRatingCount,
  igdb_critic_rating AS igdbCriticRating, igdb_critic_rating_count AS igdbCriticRatingCount,
  igdb_genres AS igdbGenresJson, igdb_themes AS igdbThemesJson, igdb_developers AS igdbDevelopersJson,
  igdb_updated_at AS igdbUpdatedAt,
  (SELECT AVG(g.rating) FROM catalogue_game_links AS catalogue_link JOIN games AS g ON g.id=catalogue_link.game_id
    WHERE catalogue_link.catalogue_id=catalogue_entries.id AND g.rating IS NOT NULL) AS ratingAverage,
  (SELECT COUNT(g.rating) FROM catalogue_game_links AS catalogue_link JOIN games AS g ON g.id=catalogue_link.game_id
    WHERE catalogue_link.catalogue_id=catalogue_entries.id) AS ratingCount,
  status, confidence, reasons AS reasonsJson, submitted_by_user_id AS submittedByUserId,
  source_game_id AS sourceGameId, published_at AS publishedAt, created_at AS createdAt, updated_at AS updatedAt`;

function parseList(value) {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

function hydrateEntry(row) {
  if (!row) return row;
  const { pegiDescriptorsJson, pegiReleasesJson, igdbGenresJson, igdbThemesJson, igdbDevelopersJson, reasonsJson, ...entry } = row;
  return {
    ...entry,
    pegiDescriptors: parseList(pegiDescriptorsJson),
    pegiReleases: parseList(pegiReleasesJson),
    igdbGenres: parseList(igdbGenresJson), igdbThemes: parseList(igdbThemesJson), igdbDevelopers: parseList(igdbDevelopersJson),
    reasons: parseList(reasonsJson),
  };
}

function publicEntry(entry) {
  if (!entry) return null;
  const {
    submittedByUserId, sourceGameId, confidence, reasons, status, createdAt, titleKey, ratingAverage, ratingCount, ...visible
  } = entry;
  const count = Number(ratingCount) || 0;
  return { ...visible, ratingAverage: count >= 1 ? ratingAverage : null, ratingCount: count >= 1 ? count : 0 };
}

function groupedPublicEntries(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.canonicalGameId ? `canonical:${entry.canonicalGameId}` : `title:${entry.titleKey || normalizeKatalogText(entry.title)}`;
    const group = groups.get(key) || []; group.push(entry); groups.set(key, group);
  }
  return [...groups.values()].map(releases => {
    const primary = releases.find(entry => entry.coverUrl) || releases[0];
    return { ...primary, releases: releases.map(publicEntry), releaseCount: releases.length };
  });
}

function slugBase(title, platform) {
  const value = `${normalizeKatalogText(title)} ${normalizeKatalogText(platform)}`
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, KATALOG_LIMITS.slugMax);
  return value || 'game';
}

function adminText(value, limit = GAME_LIMITS.metadataTextMax) { return String(value || '').trim().slice(0, limit); }
function adminList(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return values.map(item => adminText(item, GAME_LIMITS.metadataItemMax)).filter(Boolean).slice(0, GAME_LIMITS.metadataItemsMax);
}
function optionalNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) throw new Error('Invalid Kat·a·log value.');
  return integer ? number : Math.round(number * 100) / 100;
}

function createKatalogStore(database, { canonical: suppliedCanonical = null } = {}) {
  const canonical = suppliedCanonical || createCanonicalStore(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS catalogue_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL COLLATE NOCASE,
      title_key TEXT NOT NULL,
      platform TEXT NOT NULL COLLATE NOCASE,
      platform_key TEXT NOT NULL,
      canonical_game_id INTEGER REFERENCES canonical_games(id) ON DELETE SET NULL,
      canonical_release_id INTEGER REFERENCES canonical_releases(id) ON DELETE SET NULL,
      pegi INTEGER,
      publisher TEXT NOT NULL DEFAULT '',
      release_year INTEGER,
      pegi_url TEXT NOT NULL DEFAULT '',
      pegi_descriptors TEXT NOT NULL DEFAULT '[]',
      pegi_releases TEXT NOT NULL DEFAULT '[]',
      pegi_advice TEXT NOT NULL DEFAULT '',
      pegi_outline TEXT NOT NULL DEFAULT '',
      pegi_content_issues TEXT NOT NULL DEFAULT '',
      pegi_other_issues TEXT NOT NULL DEFAULT '',
      hltb_id INTEGER,
      hltb_title TEXT NOT NULL DEFAULT '',
      hltb_url TEXT NOT NULL DEFAULT '',
      hltb_main_story REAL,
      hltb_main_extra REAL,
      hltb_completionist REAL,
      hltb_all_styles REAL,
      cover_url TEXT NOT NULL,
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
      status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','public','rejected')),
      confidence INTEGER NOT NULL DEFAULT 0,
      reasons TEXT NOT NULL DEFAULT '[]',
      submitted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      source_game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(title_key, platform_key)
    );
    CREATE TABLE IF NOT EXISTS catalogue_game_links (
      catalogue_id INTEGER NOT NULL REFERENCES catalogue_entries(id) ON DELETE CASCADE,
      game_id INTEGER NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (catalogue_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_catalogue_status_title ON catalogue_entries(status, title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_catalogue_platform ON catalogue_entries(platform COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_catalogue_submitter_status ON catalogue_entries(submitted_by_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_catalogue_links_user ON catalogue_game_links(user_id);
  `);
  canonical.ensureCatalogueSchema();
  const catalogueColumns = database.pragma('table_info(catalogue_entries)').map(column => column.name);
  if (!catalogueColumns.includes('description')) database.exec("ALTER TABLE catalogue_entries ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  if (!catalogueColumns.includes('description_source')) database.exec("ALTER TABLE catalogue_entries ADD COLUMN description_source TEXT NOT NULL DEFAULT ''");
  if (!catalogueColumns.includes('description_source_url')) database.exec("ALTER TABLE catalogue_entries ADD COLUMN description_source_url TEXT NOT NULL DEFAULT ''");
  const igdbColumns = {
    igdb_id: 'INTEGER', igdb_slug: "TEXT NOT NULL DEFAULT ''", igdb_url: "TEXT NOT NULL DEFAULT ''", igdb_rating: 'REAL',
    igdb_rating_count: 'INTEGER NOT NULL DEFAULT 0', igdb_critic_rating: 'REAL', igdb_critic_rating_count: 'INTEGER NOT NULL DEFAULT 0',
    igdb_genres: "TEXT NOT NULL DEFAULT '[]'", igdb_themes: "TEXT NOT NULL DEFAULT '[]'", igdb_developers: "TEXT NOT NULL DEFAULT '[]'", igdb_updated_at: 'TEXT',
  };
  for (const [column, definition] of Object.entries(igdbColumns)) {
    if (!catalogueColumns.includes(column)) database.exec(`ALTER TABLE catalogue_entries ADD COLUMN ${column} ${definition}`);
  }
  if (catalogueColumns.includes('esrb_rating')) database.prepare(`UPDATE catalogue_entries SET description=CASE WHEN description_source='ESRB' THEN '' ELSE description END, description_source=CASE WHEN description_source='ESRB' THEN '' ELSE description_source END, description_source_url=CASE WHEN description_source='ESRB' THEN '' ELSE description_source_url END WHERE description_source='ESRB'`).run();
  for (const column of ['esrb_rating', 'esrb_url', 'esrb_descriptors', 'esrb_interactive_elements', 'esrb_summary']) {
    if (catalogueColumns.includes(column)) database.exec(`ALTER TABLE catalogue_entries DROP COLUMN ${column}`);
  }

  const findIdentityStatement = database.prepare(`SELECT ${storedFields} FROM catalogue_entries WHERE title_key=? AND platform_key=?`);
  const findReleaseStatement = database.prepare(`SELECT ${storedFields} FROM catalogue_entries WHERE canonical_release_id=?`);
  const findSlugStatement = database.prepare(`SELECT ${storedFields} FROM catalogue_entries WHERE slug=?`);
  const findIdStatement = database.prepare(`SELECT ${storedFields} FROM catalogue_entries WHERE id=?`);

  function uniqueSlug(title, platform) {
    const base = slugBase(title, platform); let slug = base; let suffix = 2;
    while (database.prepare('SELECT 1 FROM catalogue_entries WHERE slug=?').get(slug)) slug = `${base}-${suffix++}`;
    return slug;
  }

  function findByIdentity(titleKey, platformKey) {
    return hydrateEntry(findIdentityStatement.get(titleKey, platformKey));
  }
  function findForGame(game = {}, identity = {}) {
    const platformKey = identity.platformKey || normalizeKatalogText(game.platform);
    if (Number(game.igdbId) > 0) {
      const matched = hydrateEntry(database.prepare(`SELECT ${storedFields} FROM catalogue_entries
        WHERE igdb_id=? AND platform_key=? ORDER BY id LIMIT 1`).get(Number(game.igdbId), platformKey));
      if (matched) return matched;
      const legacy = findByIdentity(identity.titleKey || normalizeKatalogText(game.title), platformKey);
      return legacy && !legacy.igdbId ? legacy : null;
    }
    return findByIdentity(identity.titleKey || normalizeKatalogText(game.title), platformKey);
  }
  function findByCanonicalRelease(releaseId) { return releaseId ? hydrateEntry(findReleaseStatement.get(Number(releaseId))) : null; }
  function getById(id) { return hydrateEntry(findIdStatement.get(Number(id))); }
  function getBySlug(slug) { return hydrateEntry(findSlugStatement.get(String(slug || ''))); }
  function getPublicById(id) { const entry = getById(id); return entry?.status === 'public' ? publicEntry(entry) : null; }
  function getPublicBySlug(slug) {
    const entry = getBySlug(slug);
    if (entry?.status !== 'public') return null;
    const releases = entry.canonicalGameId
      ? database.prepare(`SELECT ${storedFields} FROM catalogue_entries WHERE status='public' AND canonical_game_id=? ORDER BY platform COLLATE NOCASE`).all(entry.canonicalGameId)
      : database.prepare(`SELECT ${storedFields} FROM catalogue_entries WHERE status='public' AND title_key=? ORDER BY platform COLLATE NOCASE`).all(entry.titleKey);
    const visibleReleases = releases.map(hydrateEntry).map(publicEntry);
    return { ...publicEntry(entry), releases: visibleReleases, releaseCount: visibleReleases.length };
  }

  function values(game, evaluation, coverUrl) {
    return {
      title: String(game.title || '').trim(), titleKey: evaluation.identity.titleKey,
      platform: String(game.platform || '').trim(), platformKey: evaluation.identity.platformKey,
      pegi: game.pegi ?? null, publisher: String(game.publisher || ''), releaseYear: game.releaseYear ?? null,
      pegiUrl: String(game.pegiUrl || ''), pegiDescriptors: JSON.stringify(game.pegiDescriptors || []),
      pegiReleases: JSON.stringify(game.pegiReleases || []), pegiAdvice: String(game.pegiAdvice || ''),
      pegiOutline: String(game.pegiOutline || ''), pegiContentIssues: String(game.pegiContentIssues || ''),
      pegiOtherIssues: String(game.pegiOtherIssues || ''), hltbId: game.hltbId ?? null,
      hltbTitle: String(game.hltbTitle || ''), hltbUrl: String(game.hltbUrl || ''),
      hltbMainStory: game.hltbMainStory ?? null, hltbMainExtra: game.hltbMainExtra ?? null,
      hltbCompletionist: game.hltbCompletionist ?? null, hltbAllStyles: game.hltbAllStyles ?? null,
      coverUrl, coverSource: String(game.coverSource || ''), coverMatchTitle: String(game.coverMatchTitle || ''),
      description: String(game.description || ''), descriptionSource: String(game.descriptionSource || ''), descriptionSourceUrl: String(game.descriptionSourceUrl || ''),
      igdbId: game.igdbId ?? null, igdbSlug: String(game.igdbSlug || ''), igdbUrl: String(game.igdbUrl || ''),
      igdbRating: game.igdbRating ?? null, igdbRatingCount: game.igdbRatingCount || 0,
      igdbCriticRating: game.igdbCriticRating ?? null, igdbCriticRatingCount: game.igdbCriticRatingCount || 0,
      igdbGenres: JSON.stringify(game.igdbGenres || []), igdbThemes: JSON.stringify(game.igdbThemes || []),
      igdbDevelopers: JSON.stringify(game.igdbDevelopers || []), igdbUpdatedAt: game.igdbUpdatedAt || null,
      status: evaluation.status, confidence: evaluation.confidence, reasons: JSON.stringify(evaluation.reasons),
    };
  }

  function link(catalogueId, gameId, userId) {
    const entryId = Number(catalogueId); const privateGameId = Number(gameId); const accountId = Number(userId);
    const existing = database.prepare('SELECT game_id AS gameId FROM catalogue_game_links WHERE catalogue_id=? AND user_id=?').get(entryId, accountId);
    if (existing) {
      database.prepare('DELETE FROM catalogue_game_links WHERE game_id=? AND catalogue_id<>?').run(privateGameId, entryId);
      canonical.linkCatalogueGame(entryId, privateGameId); return existing;
    }
    database.prepare('DELETE FROM catalogue_game_links WHERE game_id=?').run(privateGameId);
    database.prepare('INSERT INTO catalogue_game_links (catalogue_id, game_id, user_id) VALUES (?, ?, ?)').run(entryId, privateGameId, accountId);
    canonical.linkCatalogueGame(entryId, privateGameId);
    return { gameId: privateGameId };
  }

  function unlinkIfMismatched(game = {}) {
    const linked = database.prepare(`SELECT ce.igdb_id AS igdbId,ce.canonical_release_id AS canonicalReleaseId,
      ce.title_key AS titleKey,ce.platform_key AS platformKey FROM catalogue_game_links l
      JOIN catalogue_entries ce ON ce.id=l.catalogue_id WHERE l.game_id=?`).get(Number(game.id));
    if (!linked) return false;
    const gameIgdbId = Number(game.igdbId) || null; const linkedIgdbId = Number(linked.igdbId) || null;
    const gameReleaseId = Number(game.canonicalReleaseId) || null; const linkedReleaseId = Number(linked.canonicalReleaseId) || null;
    const platformKey = normalizeKatalogText(game.platform); const titleKey = normalizeKatalogText(game.title);
    const mismatch = gameIgdbId && linkedIgdbId ? gameIgdbId !== linkedIgdbId || platformKey !== linked.platformKey
      : gameIgdbId && gameReleaseId && linkedReleaseId ? gameReleaseId !== linkedReleaseId
        : titleKey !== linked.titleKey || platformKey !== linked.platformKey;
    if (!mismatch) return false;
    database.prepare('DELETE FROM catalogue_game_links WHERE game_id=?').run(Number(game.id));
    return true;
  }

  const upsertTransaction = database.transaction((userId, game, evaluation, coverUrl) => {
    const canonicalGame = canonical.upsertGame(game, { allowLocal: true });
    const canonicalRelease = canonical.ensureRelease(canonicalGame?.id, game);
    const existing = findByCanonicalRelease(canonicalRelease?.id) || findForGame(game, evaluation.identity);
    if (existing) {
      const shouldReplace = existing.status === 'candidate' && evaluation.confidence >= existing.confidence;
      if (shouldReplace) {
        const next = values(game, evaluation, coverUrl);
        database.prepare(`UPDATE catalogue_entries SET title=@title, platform=@platform, pegi=@pegi,
          publisher=@publisher, release_year=@releaseYear, pegi_url=@pegiUrl,
          pegi_descriptors=@pegiDescriptors, pegi_releases=@pegiReleases, pegi_advice=@pegiAdvice,
          pegi_outline=@pegiOutline, pegi_content_issues=@pegiContentIssues, pegi_other_issues=@pegiOtherIssues,
          hltb_id=@hltbId, hltb_title=@hltbTitle, hltb_url=@hltbUrl,
          hltb_main_story=@hltbMainStory, hltb_main_extra=@hltbMainExtra,
          hltb_completionist=@hltbCompletionist, hltb_all_styles=@hltbAllStyles,
          cover_url=@coverUrl, cover_source=@coverSource, cover_match_title=@coverMatchTitle,
          description=@description, description_source=@descriptionSource, description_source_url=@descriptionSourceUrl,
          igdb_id=@igdbId, igdb_slug=@igdbSlug, igdb_url=@igdbUrl, igdb_rating=@igdbRating,
          igdb_rating_count=@igdbRatingCount, igdb_critic_rating=@igdbCriticRating,
          igdb_critic_rating_count=@igdbCriticRatingCount, igdb_genres=@igdbGenres,
          igdb_themes=@igdbThemes, igdb_developers=@igdbDevelopers, igdb_updated_at=@igdbUpdatedAt,
          status=@status, confidence=@confidence, reasons=@reasons,
          submitted_by_user_id=@userId, source_game_id=@gameId,
          published_at=CASE WHEN @status='public' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END,
          canonical_game_id=@canonicalGameId, canonical_release_id=@canonicalReleaseId,
          updated_at=CURRENT_TIMESTAMP WHERE id=@id`).run({ ...next, userId, gameId: game.id, id: existing.id,
          canonicalGameId: canonicalGame?.id || null, canonicalReleaseId: canonicalRelease?.id || null });
      }
      link(existing.id, game.id, userId);
      canonical.syncCatalogueById(existing.id);
      return { entry: getById(existing.id), created: false, previousCoverUrl: shouldReplace ? existing.coverUrl : '', usedCover: shouldReplace };
    }
    const next = values(game, evaluation, coverUrl);
    const result = database.prepare(`INSERT INTO catalogue_entries (
      slug, title, title_key, platform, platform_key, canonical_game_id, canonical_release_id, pegi, publisher, release_year,
      pegi_url, pegi_descriptors, pegi_releases, pegi_advice, pegi_outline, pegi_content_issues, pegi_other_issues,
      hltb_id, hltb_title, hltb_url, hltb_main_story, hltb_main_extra, hltb_completionist, hltb_all_styles,
      cover_url, cover_source, cover_match_title, description, description_source, description_source_url,
      igdb_id, igdb_slug, igdb_url, igdb_rating, igdb_rating_count, igdb_critic_rating, igdb_critic_rating_count,
      igdb_genres, igdb_themes, igdb_developers, igdb_updated_at, status, confidence, reasons,
      submitted_by_user_id, source_game_id, published_at)
      VALUES (@slug,@title,@titleKey,@platform,@platformKey,@canonicalGameId,@canonicalReleaseId,@pegi,@publisher,@releaseYear,
      @pegiUrl,@pegiDescriptors,@pegiReleases,@pegiAdvice,@pegiOutline,@pegiContentIssues,@pegiOtherIssues,
      @hltbId,@hltbTitle,@hltbUrl,@hltbMainStory,@hltbMainExtra,@hltbCompletionist,@hltbAllStyles,
      @coverUrl,@coverSource,@coverMatchTitle,@description,@descriptionSource,@descriptionSourceUrl,
      @igdbId,@igdbSlug,@igdbUrl,@igdbRating,@igdbRatingCount,@igdbCriticRating,@igdbCriticRatingCount,
      @igdbGenres,@igdbThemes,@igdbDevelopers,@igdbUpdatedAt,@status,@confidence,@reasons,@userId,@gameId,
      CASE WHEN @status='public' THEN CURRENT_TIMESTAMP ELSE NULL END)`).run({
        ...next, slug: uniqueSlug(game.title, game.platform), canonicalGameId: canonicalGame?.id || null,
        canonicalReleaseId: canonicalRelease?.id || null, userId, gameId: game.id,
      });
    link(result.lastInsertRowid, game.id, userId);
    canonical.syncCatalogueById(result.lastInsertRowid);
    return { entry: getById(result.lastInsertRowid), created: true, previousCoverUrl: '', usedCover: true };
  });

  function upsertFromGame(userId, game, evaluation, coverUrl) {
    return upsertTransaction(Number(userId), game, evaluation, coverUrl);
  }

  function listPublic({ q = '', platform = '', page = 1, limit = KATALOG_LIMITS.pageSize } = {}) {
    const cleanQuery = normalizeKatalogText(String(q).slice(0, KATALOG_LIMITS.searchMax));
    const cleanPlatform = normalizeKatalogText(String(platform).slice(0, KATALOG_LIMITS.searchMax));
    const pageSize = Math.max(1, Math.min(KATALOG_LIMITS.pageSizeMax, Number(limit) || KATALOG_LIMITS.pageSize));
    const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const params = {
      q: `%${cleanQuery}%`, rawQ: `%${String(q).trim().slice(0, KATALOG_LIMITS.searchMax)}%`, platform: cleanPlatform,
    };
    const where = `status='public' AND (@q='%%' OR title_key LIKE @q OR platform_key LIKE @q OR publisher LIKE @rawQ COLLATE NOCASE
      OR igdb_genres LIKE @rawQ COLLATE NOCASE OR igdb_themes LIKE @rawQ COLLATE NOCASE)
      AND (@platform='' OR platform_key=@platform)`;
    const releases = database.prepare(`SELECT ${storedFields} FROM catalogue_entries WHERE ${where}
      ORDER BY title COLLATE NOCASE, platform COLLATE NOCASE`).all(params).map(hydrateEntry);
    const entries = cleanPlatform ? releases.map(publicEntry) : groupedPublicEntries(releases);
    const total = entries.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(currentPage, pages);
    return { entries: entries.slice((safePage - 1) * pageSize, safePage * pageSize), total, page: safePage, pageSize, pages };
  }

  function searchPublic(query, limit = 8) {
    return listPublic({ q: query, limit: Math.max(1, Math.min(20, Number(limit) || 8)) }).entries
      .map(({ id, slug, title, platform, pegi, coverUrl }) => ({ id, slug, title, platform, pegi, coverUrl }));
  }

  function publicPlatforms() {
    return database.prepare(`SELECT platform, COUNT(*) count FROM catalogue_entries WHERE status='public'
      GROUP BY platform_key ORDER BY platform COLLATE NOCASE`).all();
  }

  function listAdmin({ q = '', status = '' } = {}) {
    const cleanStatus = ENTRY_STATUSES.includes(status) ? status : '';
    const like = `%${String(q).trim().slice(0, KATALOG_LIMITS.searchMax)}%`;
    return database.prepare(`SELECT ${storedFields} FROM catalogue_entries
      WHERE (@status='' OR status=@status) AND (@like='%%' OR title LIKE @like OR platform LIKE @like)
      ORDER BY CASE status WHEN 'candidate' THEN 0 WHEN 'public' THEN 1 ELSE 2 END, updated_at DESC LIMIT 250`)
      .all({ status: cleanStatus, like }).map(hydrateEntry);
  }

  function setStatus(id, status) {
    if (!ENTRY_STATUSES.includes(status)) throw new Error('Invalid Kat·a·log status.');
    const result = database.prepare(`UPDATE catalogue_entries SET status=?,
      published_at=CASE WHEN ?='public' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, status, Number(id));
    return result.changes ? getById(id) : null;
  }

  function updateAdmin(id, input = {}) {
    const existing = getById(id);
    if (!existing) return null;
    const title = adminText(input.title, GAME_LIMITS.titleMax); const platform = adminText(input.platform, GAME_LIMITS.platformMax);
    if (!title) throw new Error('Title is required.');
    if (!platform) throw new Error('Platform is required.');
    const titleKey = normalizeKatalogText(title); const platformKey = normalizeKatalogText(platform);
    const duplicate = findByIdentity(titleKey, platformKey);
    if (duplicate && duplicate.id !== existing.id) throw new Error('Another Kat·a·log entry already uses this title and platform.');
    const pegi = input.pegi === '' || input.pegi == null ? null : optionalNumber(input.pegi, { integer: true });
    if (pegi != null && !PEGI_RATINGS.has(pegi)) throw new Error('PEGI must be 3, 7, 12, 16, 18, or blank.');
    const releaseYear = optionalNumber(input.releaseYear, { min: GAME_LIMITS.releaseYearMin, max: GAME_LIMITS.releaseYearMax, integer: true });
    const hltbId = optionalNumber(input.hltbId, { min: 1, integer: true });
    const hltbHours = value => hltbId ? optionalNumber(value, { min: 0.01, max: GAME_LIMITS.hltbHoursMax }) : null;
    const factualInput = {
      title, platform, pegi, pegiUrl: adminText(input.pegiUrl, GAME_LIMITS.urlMax), pegiDescriptors: adminList(input.pegiDescriptors),
      pegiReleases: adminList(input.pegiReleases), pegiAdvice: adminText(input.pegiAdvice), pegiOutline: adminText(input.pegiOutline),
      pegiContentIssues: adminText(input.pegiContentIssues), pegiOtherIssues: adminText(input.pegiOtherIssues), hltbId,
      hltbTitle: hltbId ? adminText(input.hltbTitle, GAME_LIMITS.titleMax) : '', hltbMainStory: hltbHours(input.hltbMainStory),
      hltbMainExtra: hltbHours(input.hltbMainExtra), hltbCompletionist: hltbHours(input.hltbCompletionist),
      hltbAllStyles: hltbHours(input.hltbAllStyles), coverUrl: existing.coverUrl, coverMatchTitle: adminText(input.coverMatchTitle, GAME_LIMITS.coverMatchTitleMax),
    };
    const evaluation = evaluateKatalogGame(factualInput);
    database.prepare(`UPDATE catalogue_entries SET title=@title, title_key=@titleKey, platform=@platform, platform_key=@platformKey,
      pegi=@pegi, publisher=@publisher, release_year=@releaseYear, pegi_url=@pegiUrl,
      pegi_descriptors=@pegiDescriptors, pegi_releases=@pegiReleases, pegi_advice=@pegiAdvice,
      pegi_outline=@pegiOutline, pegi_content_issues=@pegiContentIssues, pegi_other_issues=@pegiOtherIssues,
      hltb_id=@hltbId, hltb_title=@hltbTitle, hltb_url=@hltbUrl, hltb_main_story=@hltbMainStory,
      hltb_main_extra=@hltbMainExtra, hltb_completionist=@hltbCompletionist, hltb_all_styles=@hltbAllStyles,
      cover_source=@coverSource, cover_match_title=@coverMatchTitle, confidence=@confidence, reasons=@reasons,
      updated_at=CURRENT_TIMESTAMP WHERE id=@id`).run({
      id: existing.id, title, titleKey, platform, platformKey, pegi, publisher: adminText(input.publisher, GAME_LIMITS.publisherMax), releaseYear,
      pegiUrl: adminText(input.pegiUrl, GAME_LIMITS.urlMax), pegiDescriptors: JSON.stringify(adminList(input.pegiDescriptors)), pegiReleases: JSON.stringify(adminList(input.pegiReleases)),
      pegiAdvice: adminText(input.pegiAdvice), pegiOutline: adminText(input.pegiOutline), pegiContentIssues: adminText(input.pegiContentIssues), pegiOtherIssues: adminText(input.pegiOtherIssues),
      hltbId, hltbTitle: hltbId ? adminText(input.hltbTitle, GAME_LIMITS.titleMax) : '', hltbUrl: hltbId ? adminText(input.hltbUrl, GAME_LIMITS.urlMax) : '',
      hltbMainStory: hltbHours(input.hltbMainStory), hltbMainExtra: hltbHours(input.hltbMainExtra), hltbCompletionist: hltbHours(input.hltbCompletionist), hltbAllStyles: hltbHours(input.hltbAllStyles),
      coverSource: adminText(input.coverSource, GAME_LIMITS.coverSourceMax), coverMatchTitle: adminText(input.coverMatchTitle, GAME_LIMITS.coverMatchTitleMax),
      confidence: evaluation.confidence, reasons: JSON.stringify(evaluation.reasons),
    });
    canonical.syncCatalogueById(existing.id);
    return getById(existing.id);
  }

  function replaceCover(id, coverUrl) {
    const result = database.prepare('UPDATE catalogue_entries SET cover_url=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(coverUrl, Number(id));
    return result.changes ? getById(id) : null;
  }

  function addDescriptionIfMissing(id, game = {}) {
    const description = String(game.description || '').trim();
    if (!description) return getById(id);
    const result = database.prepare(`UPDATE catalogue_entries SET description=?, description_source=?, description_source_url=?,
      updated_at=CURRENT_TIMESTAMP WHERE id=? AND description=''`).run(description, String(game.descriptionSource || ''), String(game.descriptionSourceUrl || ''), Number(id));
    if (result.changes) canonical.syncCatalogueById(id);
    return getById(id);
  }

  function addIgdbIfMissing(id, game = {}) {
    if (!game.igdbId) return getById(id);
    const existing = getById(id);
    if (!existing || (existing.igdbId && Number(existing.igdbId) !== Number(game.igdbId))) return existing;
    if (existing.igdbId && existing.igdbUpdatedAt === (game.igdbUpdatedAt || null)) return existing;
    database.prepare(`UPDATE catalogue_entries SET igdb_id=?, igdb_slug=?, igdb_url=?, igdb_rating=?, igdb_rating_count=?,
      igdb_critic_rating=?, igdb_critic_rating_count=?, igdb_genres=?, igdb_themes=?, igdb_developers=?, igdb_updated_at=?,
      updated_at=CURRENT_TIMESTAMP WHERE id=? AND (igdb_id IS NULL OR igdb_id=?)`).run(
      game.igdbId, String(game.igdbSlug || ''), String(game.igdbUrl || ''), game.igdbRating ?? null, game.igdbRatingCount || 0,
      game.igdbCriticRating ?? null, game.igdbCriticRatingCount || 0, JSON.stringify(game.igdbGenres || []),
      JSON.stringify(game.igdbThemes || []), JSON.stringify(game.igdbDevelopers || []), game.igdbUpdatedAt || null, Number(id), game.igdbId,
    );
    canonical.syncCatalogueById(id);
    return getById(id);
  }

  function remove(id) {
    const entry = getById(id);
    if (!entry) return null;
    database.prepare('DELETE FROM catalogue_entries WHERE id=?').run(Number(id));
    if (entry.canonicalGameId) canonical.pruneOrphans(entry.canonicalGameId);
    return entry;
  }

  function counts() {
    const rows = database.prepare('SELECT status, COUNT(*) count FROM catalogue_entries GROUP BY status').all();
    return Object.fromEntries(ENTRY_STATUSES.map(status => [status, rows.find(row => row.status === status)?.count || 0]));
  }

  function contributionSources() {
    return database.prepare(`SELECT submitted_by_user_id AS userId, source_game_id AS gameId
      FROM catalogue_entries WHERE status='public' AND submitted_by_user_id IS NOT NULL AND source_game_id IS NOT NULL`).all();
  }

  function sitemapEntries() {
    return groupedPublicEntries(database.prepare(`SELECT ${storedFields} FROM catalogue_entries WHERE status='public' ORDER BY id`).all().map(hydrateEntry))
      .map(entry => ({ slug: entry.slug, title: entry.title, coverUrl: entry.coverUrl, updatedAt: entry.updatedAt }));
  }

  canonical.backfill();

  return {
    addDescriptionIfMissing, addIgdbIfMissing, contributionSources, counts, findByIdentity, findForGame, getById, getBySlug, getPublicById, getPublicBySlug,
    findByCanonicalRelease, link, listAdmin, listPublic, publicPlatforms, remove, replaceCover, searchPublic, setStatus, sitemapEntries, unlinkIfMismatched, updateAdmin, upsertFromGame,
    canonicalCounts: canonical.counts, canonicalConflicts: canonical.unresolvedConflicts,
  };
}

module.exports = { ENTRY_STATUSES, createKatalogStore, hydrateEntry, publicEntry, slugBase };
