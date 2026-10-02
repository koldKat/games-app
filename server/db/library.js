const { db } = require('./connection');
const { selectFields, hydrateGame } = require('./record');
const { normalizeSearchText, gameGroupTitleKey, searchPattern } = require('./values');
const { GAME_LIMITS } = require('../validation-policy');
const { MULTIPLATFORM_FILTER_VALUE, OWNERSHIP_FILTER_VALUES, TITLE_LOOKUP_MIN_LENGTH } = require('../constants');
const searchTitles = db.prepare(`
  SELECT id, title, platform, ownership, igdb_id AS igdbId, canonical_game_id AS canonicalGameId FROM games
  WHERE user_id=? AND search_normalize(title) LIKE ? ESCAPE '\\'
  ORDER BY CASE WHEN search_normalize(title) = ? THEN 0 ELSE 1 END, title COLLATE NOCASE, platform COLLATE NOCASE
  LIMIT ?
`);
const accountTitles = db.prepare('SELECT id, title, platform, ownership, igdb_id AS igdbId, canonical_game_id AS canonicalGameId FROM games WHERE user_id=?');

function gameListQuery(userId, filters = {}) {
  const clauses = ['user_id = @userId'];
  const params = { userId };
  const hiddenFilter = filters.ownership === 'hidden' || filters.playStatus === 'hidden';
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
    params.multiplatformHidden = hiddenFilter ? 1 : 0;
    clauses.push(`(CASE WHEN canonical_game_id IS NOT NULL THEN 'canonical-'||canonical_game_id
      WHEN game_group_key(title)<>'' THEN 'title-'||game_group_key(title) ELSE 'game-'||id END) IN (
        SELECT CASE WHEN sibling.canonical_game_id IS NOT NULL THEN 'canonical-'||sibling.canonical_game_id
          WHEN game_group_key(sibling.title)<>'' THEN 'title-'||game_group_key(sibling.title) ELSE 'game-'||sibling.id END AS identity
        FROM games AS sibling
        WHERE sibling.user_id=@userId AND sibling.hidden=@multiplatformHidden
        GROUP BY identity
        HAVING COUNT(DISTINCT sibling.platform COLLATE NOCASE)>1
      )`);
  } else if (filters.platform) { clauses.push('platform = @platform'); params.platform = filters.platform; }
  if (filters.ownership === 'owned_physical' || filters.ownership === 'owned_digital') {
    clauses.push(`ownership = 'owned' AND ${filters.ownership === 'owned_physical' ? 'format_physical' : 'format_digital'} = 1`);
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
  return { where, params, orderBy: sortMap[filters.sort] || sortMap.title };
}

function listGames(userId, filters = {}) {
  const { where, params, orderBy } = gameListQuery(userId, filters);
  return db.prepare(`SELECT ${selectFields} FROM games ${where} ORDER BY ${orderBy}`).all(params).map(hydrateGame);
}

function listProgressionGames(userId) {
  return db.prepare(`SELECT id, title, platform, canonical_game_id AS canonicalGameId,
    ownership, CASE WHEN hidden=1 THEN 'hidden' ELSE play_status END AS playStatus,
    CASE WHEN format_physical=1 AND format_digital=1 THEN 'both'
      WHEN format_physical=1 THEN 'physical' WHEN format_digital=1 THEN 'digital' ELSE 'unknown' END AS mediaFormat,
    format_physical AS formatPhysical, format_digital AS formatDigital FROM games WHERE user_id=?`).all(userId);
}

function listUserIds() { return db.prepare('SELECT id FROM users ORDER BY id').all().map(row => row.id); }

function listGamesPage(userId, filters = {}) {
  const { where, params, orderBy } = gameListQuery(userId, filters);
  const pageSize = Math.max(1, Math.min(GAME_LIMITS.libraryPageSizeMax,
    Number.parseInt(filters.limit, 10) || GAME_LIMITS.libraryPageSize));
  const requestedPage = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  const splitPlatforms = Boolean(filters.platform && filters.platform !== MULTIPLATFORM_FILTER_VALUE);
  const identities = db.prepare(`SELECT id, title, canonical_game_id AS canonicalGameId
    FROM games ${where} ORDER BY ${orderBy}`).all(params);
  const groups = [];
  if (splitPlatforms) {
    for (const row of identities) groups.push([row.id]);
  } else {
    const groupedIds = new Map();
    for (const row of identities) {
      const key = row.canonicalGameId ? `canonical-${row.canonicalGameId}` : gameGroupTitleKey(row.title) || `game-${row.id}`;
      const ids = groupedIds.get(key);
      if (ids) ids.push(row.id);
      else { const first = [row.id]; groupedIds.set(key, first); groups.push(first); }
    }
  }
  const total = groups.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pages);
  const ids = groups.slice((page - 1) * pageSize, page * pageSize).flat();
  if (!ids.length) return { games: [], total, page, pageSize, pages };
  const placeholders = ids.map(() => '?').join(',');
  const byId = new Map(db.prepare(`SELECT ${selectFields} FROM games WHERE id IN (${placeholders})`)
    .all(...ids).map(hydrateGame).map(game => [game.id, game]));
  return { games: ids.map(id => byId.get(id)).filter(Boolean), total, page, pageSize, pages };
}

function randomGame(userId, filters = {}, random = Math.random) {
  const { where, params } = gameListQuery(userId, filters);
  const splitPlatforms = Boolean(filters.platform && filters.platform !== MULTIPLATFORM_FILTER_VALUE);
  const identity = `CASE WHEN canonical_game_id IS NOT NULL THEN 'canonical-'||canonical_game_id
    WHEN game_group_key(title)<>'' THEN 'title-'||game_group_key(title) ELSE 'game-'||id END`;
  const candidates = splitPlatforms
    ? `SELECT id, 'game-'||id AS identity FROM games ${where}`
    : `SELECT MIN(id) AS id, identity FROM (SELECT id, ${identity} AS identity FROM games ${where}) GROUP BY identity`;
  let excludedIdentity = '';
  const excludedId = Number.parseInt(filters.excludeId, 10);
  if (Number.isInteger(excludedId) && excludedId > 0) {
    const excluded = db.prepare(`SELECT id, ${identity} AS identity FROM games WHERE id=? AND user_id=?`).get(excludedId, userId);
    if (excluded) excludedIdentity = splitPlatforms ? `game-${excluded.id}` : excluded.identity;
  }
  const exclusion = excludedIdentity ? 'WHERE identity<>@excludedIdentity' : '';
  const selectionParams = excludedIdentity ? { ...params, excludedIdentity } : params;
  let total = db.prepare(`SELECT COUNT(*) AS count FROM (${candidates}) ${exclusion}`).get(selectionParams).count;
  if (!total && excludedIdentity) return randomGame(userId, { ...filters, excludeId: '' }, random);
  total = Number(total) || 0;
  if (!total) return null;
  const randomValue = Math.max(0, Math.min(0.9999999999999999, Number(random()) || 0));
  const offset = Math.floor(randomValue * total);
  const selected = db.prepare(`SELECT id, identity FROM (${candidates}) ${exclusion} ORDER BY id LIMIT 1 OFFSET @offset`)
    .get({ ...selectionParams, offset });
  if (!selected) return null;
  const game = getGame(userId, selected.id);
  if (!game || splitPlatforms) return game;
  const versions = db.prepare(`SELECT ${selectFields} FROM games ${where} AND ${identity}=@selectedIdentity ORDER BY id`)
    .all({ ...params, selectedIdentity: selected.identity }).map(hydrateGame);
  return { ...game, versions };
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

module.exports = {
  listGames, listProgressionGames, listUserIds, listGamesPage, randomGame, getGame,
  allGamesForKatalog, searchGameTitles, accountGameIdentities, findDuplicateGames,
};
