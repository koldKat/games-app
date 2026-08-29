'use strict';

const { evaluateCatalogueGame, normalizeCatalogueText } = require('./catalogue-policy');

const ENTRY_STATUSES = Object.freeze(['candidate', 'public', 'rejected']);
// The wide Kat·a·log grid has six columns: keep ten complete desktop rows visible per page.
const PAGE_SIZE_DEFAULT = 60;
const PAGE_SIZE_MAX = 60;
const SEARCH_MAX_LENGTH = 120;
const PEGI_RATINGS = new Set([3, 7, 12, 16, 18]);
const RELEASE_YEAR_MIN = 1970;
const RELEASE_YEAR_MAX = 2100;
const HLTB_HOURS_MAX = 100000;

const storedFields = `id, slug, title, platform, pegi, publisher, release_year AS releaseYear,
  pegi_url AS pegiUrl, pegi_descriptors AS pegiDescriptorsJson, pegi_releases AS pegiReleasesJson,
  pegi_advice AS pegiAdvice, pegi_outline AS pegiOutline,
  pegi_content_issues AS pegiContentIssues, pegi_other_issues AS pegiOtherIssues,
  hltb_id AS hltbId, hltb_title AS hltbTitle, hltb_url AS hltbUrl,
  hltb_main_story AS hltbMainStory, hltb_main_extra AS hltbMainExtra,
  hltb_completionist AS hltbCompletionist, hltb_all_styles AS hltbAllStyles,
  cover_url AS coverUrl, cover_source AS coverSource, cover_match_title AS coverMatchTitle,
  description, description_source AS descriptionSource, description_source_url AS descriptionSourceUrl,
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
  const { pegiDescriptorsJson, pegiReleasesJson, reasonsJson, ...entry } = row;
  return {
    ...entry,
    pegiDescriptors: parseList(pegiDescriptorsJson),
    pegiReleases: parseList(pegiReleasesJson),
    reasons: parseList(reasonsJson),
  };
}

function publicEntry(entry) {
  if (!entry) return null;
  const {
    submittedByUserId, sourceGameId, confidence, reasons, status, createdAt, ratingAverage, ratingCount, ...visible
  } = entry;
  const count = Number(ratingCount) || 0;
  return { ...visible, ratingAverage: count >= 2 ? ratingAverage : null, ratingCount: count >= 2 ? count : 0 };
}

function slugBase(title, platform) {
  const value = `${normalizeCatalogueText(title)} ${normalizeCatalogueText(platform)}`
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
  return value || 'game';
}

function adminText(value, limit = 8000) { return String(value || '').trim().slice(0, limit); }
function adminList(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return values.map(item => adminText(item, 180)).filter(Boolean).slice(0, 24);
}
function optionalNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) throw new Error('Invalid catalogue value.');
  return integer ? number : Math.round(number * 100) / 100;
}

function createCatalogueStore(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS catalogue_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL COLLATE NOCASE,
      title_key TEXT NOT NULL,
      platform TEXT NOT NULL COLLATE NOCASE,
      platform_key TEXT NOT NULL,
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
    CREATE INDEX IF NOT EXISTS idx_catalogue_links_user ON catalogue_game_links(user_id);
  `);
  const catalogueColumns = database.pragma('table_info(catalogue_entries)').map(column => column.name);
  if (!catalogueColumns.includes('description')) database.exec("ALTER TABLE catalogue_entries ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  if (!catalogueColumns.includes('description_source')) database.exec("ALTER TABLE catalogue_entries ADD COLUMN description_source TEXT NOT NULL DEFAULT ''");
  if (!catalogueColumns.includes('description_source_url')) database.exec("ALTER TABLE catalogue_entries ADD COLUMN description_source_url TEXT NOT NULL DEFAULT ''");

  const findIdentityStatement = database.prepare(`SELECT ${storedFields} FROM catalogue_entries WHERE title_key=? AND platform_key=?`);
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
  function getById(id) { return hydrateEntry(findIdStatement.get(Number(id))); }
  function getBySlug(slug) { return hydrateEntry(findSlugStatement.get(String(slug || ''))); }
  function getPublicById(id) { const entry = getById(id); return entry?.status === 'public' ? publicEntry(entry) : null; }
  function getPublicBySlug(slug) { const entry = getBySlug(slug); return entry?.status === 'public' ? publicEntry(entry) : null; }

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
      status: evaluation.status, confidence: evaluation.confidence, reasons: JSON.stringify(evaluation.reasons),
    };
  }

  function link(catalogueId, gameId, userId) {
    const entryId = Number(catalogueId); const privateGameId = Number(gameId); const accountId = Number(userId);
    const existing = database.prepare('SELECT game_id AS gameId FROM catalogue_game_links WHERE catalogue_id=? AND user_id=?').get(entryId, accountId);
    if (existing) {
      database.prepare('DELETE FROM catalogue_game_links WHERE game_id=? AND catalogue_id<>?').run(privateGameId, entryId);
      return existing;
    }
    database.prepare('DELETE FROM catalogue_game_links WHERE game_id=?').run(privateGameId);
    database.prepare('INSERT INTO catalogue_game_links (catalogue_id, game_id, user_id) VALUES (?, ?, ?)').run(entryId, privateGameId, accountId);
    return { gameId: privateGameId };
  }

  const upsertTransaction = database.transaction((userId, game, evaluation, coverUrl) => {
    const existing = findByIdentity(evaluation.identity.titleKey, evaluation.identity.platformKey);
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
          status=@status, confidence=@confidence, reasons=@reasons,
          submitted_by_user_id=@userId, source_game_id=@gameId,
          published_at=CASE WHEN @status='public' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END,
          updated_at=CURRENT_TIMESTAMP WHERE id=@id`).run({ ...next, userId, gameId: game.id, id: existing.id });
      }
      link(existing.id, game.id, userId);
      return { entry: getById(existing.id), created: false, previousCoverUrl: shouldReplace ? existing.coverUrl : '', usedCover: shouldReplace };
    }
    const next = values(game, evaluation, coverUrl);
    const result = database.prepare(`INSERT INTO catalogue_entries (
      slug, title, title_key, platform, platform_key, pegi, publisher, release_year,
      pegi_url, pegi_descriptors, pegi_releases, pegi_advice, pegi_outline, pegi_content_issues, pegi_other_issues,
      hltb_id, hltb_title, hltb_url, hltb_main_story, hltb_main_extra, hltb_completionist, hltb_all_styles,
      cover_url, cover_source, cover_match_title, description, description_source, description_source_url, status, confidence, reasons,
      submitted_by_user_id, source_game_id, published_at)
      VALUES (@slug,@title,@titleKey,@platform,@platformKey,@pegi,@publisher,@releaseYear,
      @pegiUrl,@pegiDescriptors,@pegiReleases,@pegiAdvice,@pegiOutline,@pegiContentIssues,@pegiOtherIssues,
      @hltbId,@hltbTitle,@hltbUrl,@hltbMainStory,@hltbMainExtra,@hltbCompletionist,@hltbAllStyles,
      @coverUrl,@coverSource,@coverMatchTitle,@description,@descriptionSource,@descriptionSourceUrl,@status,@confidence,@reasons,@userId,@gameId,
      CASE WHEN @status='public' THEN CURRENT_TIMESTAMP ELSE NULL END)`).run({
        ...next, slug: uniqueSlug(game.title, game.platform), userId, gameId: game.id,
      });
    link(result.lastInsertRowid, game.id, userId);
    return { entry: getById(result.lastInsertRowid), created: true, previousCoverUrl: '', usedCover: true };
  });

  function upsertFromGame(userId, game, evaluation, coverUrl) {
    return upsertTransaction(Number(userId), game, evaluation, coverUrl);
  }

  function listPublic({ q = '', platform = '', page = 1, limit = PAGE_SIZE_DEFAULT } = {}) {
    const cleanQuery = normalizeCatalogueText(String(q).slice(0, SEARCH_MAX_LENGTH));
    const cleanPlatform = normalizeCatalogueText(String(platform).slice(0, SEARCH_MAX_LENGTH));
    const pageSize = Math.max(1, Math.min(PAGE_SIZE_MAX, Number(limit) || PAGE_SIZE_DEFAULT));
    const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const params = {
      q: `%${cleanQuery}%`, rawQ: `%${String(q).trim().slice(0, SEARCH_MAX_LENGTH)}%`, platform: cleanPlatform,
    };
    const where = `status='public' AND (@q='%%' OR title_key LIKE @q OR platform_key LIKE @q OR publisher LIKE @rawQ COLLATE NOCASE)
      AND (@platform='' OR platform_key=@platform)`;
    const total = database.prepare(`SELECT COUNT(*) count FROM catalogue_entries WHERE ${where}`).get(params).count;
    const entries = database.prepare(`SELECT ${storedFields} FROM catalogue_entries WHERE ${where}
      ORDER BY title COLLATE NOCASE, platform COLLATE NOCASE LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: pageSize, offset: (currentPage - 1) * pageSize }).map(hydrateEntry).map(publicEntry);
    return { entries, total, page: currentPage, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
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
    const like = `%${String(q).trim().slice(0, SEARCH_MAX_LENGTH)}%`;
    return database.prepare(`SELECT ${storedFields} FROM catalogue_entries
      WHERE (@status='' OR status=@status) AND (@like='%%' OR title LIKE @like OR platform LIKE @like)
      ORDER BY CASE status WHEN 'candidate' THEN 0 WHEN 'public' THEN 1 ELSE 2 END, updated_at DESC LIMIT 250`)
      .all({ status: cleanStatus, like }).map(hydrateEntry);
  }

  function setStatus(id, status) {
    if (!ENTRY_STATUSES.includes(status)) throw new Error('Invalid catalogue status.');
    const result = database.prepare(`UPDATE catalogue_entries SET status=?,
      published_at=CASE WHEN ?='public' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, status, Number(id));
    return result.changes ? getById(id) : null;
  }

  function updateAdmin(id, input = {}) {
    const existing = getById(id);
    if (!existing) return null;
    const title = adminText(input.title, 220); const platform = adminText(input.platform, 220);
    if (!title) throw new Error('Title is required.');
    if (!platform) throw new Error('Platform is required.');
    const titleKey = normalizeCatalogueText(title); const platformKey = normalizeCatalogueText(platform);
    const duplicate = findByIdentity(titleKey, platformKey);
    if (duplicate && duplicate.id !== existing.id) throw new Error('Another catalogue entry already uses this title and platform.');
    const pegi = input.pegi === '' || input.pegi == null ? null : optionalNumber(input.pegi, { integer: true });
    if (pegi != null && !PEGI_RATINGS.has(pegi)) throw new Error('PEGI must be 3, 7, 12, 16, 18, or blank.');
    const releaseYear = optionalNumber(input.releaseYear, { min: RELEASE_YEAR_MIN, max: RELEASE_YEAR_MAX, integer: true });
    const hltbId = optionalNumber(input.hltbId, { min: 1, integer: true });
    const hltbHours = value => hltbId ? optionalNumber(value, { min: 0.01, max: HLTB_HOURS_MAX }) : null;
    const factualInput = {
      title, platform, pegi, pegiUrl: adminText(input.pegiUrl, 2000), pegiDescriptors: adminList(input.pegiDescriptors),
      pegiReleases: adminList(input.pegiReleases), pegiAdvice: adminText(input.pegiAdvice), pegiOutline: adminText(input.pegiOutline),
      pegiContentIssues: adminText(input.pegiContentIssues), pegiOtherIssues: adminText(input.pegiOtherIssues), hltbId,
      hltbTitle: hltbId ? adminText(input.hltbTitle, 220) : '', hltbMainStory: hltbHours(input.hltbMainStory),
      hltbMainExtra: hltbHours(input.hltbMainExtra), hltbCompletionist: hltbHours(input.hltbCompletionist),
      hltbAllStyles: hltbHours(input.hltbAllStyles), coverUrl: existing.coverUrl, coverMatchTitle: adminText(input.coverMatchTitle, 300),
    };
    const evaluation = evaluateCatalogueGame(factualInput);
    database.prepare(`UPDATE catalogue_entries SET title=@title, title_key=@titleKey, platform=@platform, platform_key=@platformKey,
      pegi=@pegi, publisher=@publisher, release_year=@releaseYear, pegi_url=@pegiUrl,
      pegi_descriptors=@pegiDescriptors, pegi_releases=@pegiReleases, pegi_advice=@pegiAdvice,
      pegi_outline=@pegiOutline, pegi_content_issues=@pegiContentIssues, pegi_other_issues=@pegiOtherIssues,
      hltb_id=@hltbId, hltb_title=@hltbTitle, hltb_url=@hltbUrl, hltb_main_story=@hltbMainStory,
      hltb_main_extra=@hltbMainExtra, hltb_completionist=@hltbCompletionist, hltb_all_styles=@hltbAllStyles,
      cover_source=@coverSource, cover_match_title=@coverMatchTitle, confidence=@confidence, reasons=@reasons,
      updated_at=CURRENT_TIMESTAMP WHERE id=@id`).run({
      id: existing.id, title, titleKey, platform, platformKey, pegi, publisher: adminText(input.publisher, 160), releaseYear,
      pegiUrl: adminText(input.pegiUrl, 2000), pegiDescriptors: JSON.stringify(adminList(input.pegiDescriptors)), pegiReleases: JSON.stringify(adminList(input.pegiReleases)),
      pegiAdvice: adminText(input.pegiAdvice), pegiOutline: adminText(input.pegiOutline), pegiContentIssues: adminText(input.pegiContentIssues), pegiOtherIssues: adminText(input.pegiOtherIssues),
      hltbId, hltbTitle: hltbId ? adminText(input.hltbTitle, 220) : '', hltbUrl: hltbId ? adminText(input.hltbUrl, 2000) : '',
      hltbMainStory: hltbHours(input.hltbMainStory), hltbMainExtra: hltbHours(input.hltbMainExtra), hltbCompletionist: hltbHours(input.hltbCompletionist), hltbAllStyles: hltbHours(input.hltbAllStyles),
      coverSource: adminText(input.coverSource, 80), coverMatchTitle: adminText(input.coverMatchTitle, 300),
      confidence: evaluation.confidence, reasons: JSON.stringify(evaluation.reasons),
    });
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
    return result.changes ? getById(id) : getById(id);
  }

  function remove(id) {
    const entry = getById(id);
    if (!entry) return null;
    database.prepare('DELETE FROM catalogue_entries WHERE id=?').run(Number(id));
    return entry;
  }

  function counts() {
    const rows = database.prepare('SELECT status, COUNT(*) count FROM catalogue_entries GROUP BY status').all();
    return Object.fromEntries(ENTRY_STATUSES.map(status => [status, rows.find(row => row.status === status)?.count || 0]));
  }

  function sitemapEntries() {
    return database.prepare(`SELECT slug, title, cover_url AS coverUrl, updated_at AS updatedAt
      FROM catalogue_entries WHERE status='public' ORDER BY id`).all();
  }

  return {
    addDescriptionIfMissing, counts, findByIdentity, getById, getBySlug, getPublicById, getPublicBySlug,
    link, listAdmin, listPublic, publicPlatforms, remove, replaceCover, searchPublic, setStatus, sitemapEntries, updateAdmin, upsertFromGame,
  };
}

module.exports = { ENTRY_STATUSES, createCatalogueStore, hydrateEntry, publicEntry, slugBase };
