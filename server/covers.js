const { APP_USER_AGENT, TITLE_AUTOCOMPLETE_MIN_LENGTH, TITLE_LOOKUP_MIN_LENGTH } = require('./constants');

const API_ROOT = 'https://www.steamgriddb.com/api/v2';
const REQUEST_GAP_MS = 275;
const REQUEST_TIMEOUT_MS = 15_000;
const RATE_LIMIT_RETRY_MS = 1_100;
const CACHE_TTL_MS = 30 * 60 * 1000;
const QUERY_MAX_LENGTH = 160;
const API_KEY_MIN_LENGTH = 12;
const TITLE_SUGGESTION_LIMIT = 10;
const COVER_RESULT_LIMIT = 16;
const COVER_GAME_CANDIDATE_LIMIT = 4;
const COVERS_PER_GAME_LIMIT = 5;
const COVER_SEARCH_PAUSE_MS = 180;
const GRID_DIMENSIONS = '600x900,342x482,660x930';
const cache = new Map();
const titleCache = new Map();
let lastRequestAt = 0;

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const normalizeTitle = value => String(value || '').replace(/[™®©]/g, '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase()
  .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

async function request(key, pathname, retry = true) {
  const delay = Math.max(0, REQUEST_GAP_MS - (Date.now() - lastRequestAt));
  if (delay) await wait(delay);
  lastRequestAt = Date.now();
  const response = await fetch(`${API_ROOT}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'User-Agent': APP_USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 429 && retry) { await wait(RATE_LIMIT_RETRY_MS); return request(key, pathname, false); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const error = new Error(body.errors?.[0] || body.error || `SteamGridDB returned HTTP ${response.status}.`);
    error.status = response.status; throw error;
  }
  return Array.isArray(body.data) ? body.data : [];
}

async function searchGames(key, query) {
  const clean = String(query || '').trim().slice(0, QUERY_MAX_LENGTH);
  if (clean.length < TITLE_LOOKUP_MIN_LENGTH) throw new Error('Enter at least two title characters.');
  return request(key, `/search/autocomplete/${encodeURIComponent(clean)}`);
}

function titleSuggestions(rows, limit = TITLE_SUGGESTION_LIMIT) {
  const unique = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const title = String(row?.name || '').trim();
    const key = title.toLocaleLowerCase();
    if (title && !unique.has(key)) unique.set(key, title);
    if (unique.size >= limit) break;
  }
  return [...unique.values()];
}

async function searchTitles(key, query) {
  const clean = String(query || '').trim().slice(0, QUERY_MAX_LENGTH);
  if (clean.length < TITLE_AUTOCOMPLETE_MIN_LENGTH) return [];
  const cacheKey = `${key.slice(0, 8)}:${normalizeTitle(clean)}`;
  const cached = titleCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.results;
  const results = titleSuggestions(await searchGames(key, clean));
  titleCache.set(cacheKey, { at: Date.now(), results });
  return results;
}

async function gridsForGame(key, game) {
  const rows = await request(key, `/grids/game/${game.id}?dimensions=${GRID_DIMENSIONS}&types=static`);
  return rows.filter(row => row.url && (!row.width || !row.height || row.height > row.width)).map(row => ({
    providerGameId: game.id, gameTitle: game.name, url: row.url, thumbnailUrl: row.thumb || row.url,
    width: row.width || null, height: row.height || null, score: Number(row.score || 0),
    style: row.style || '', source: 'steamgriddb', sourceUrl: `https://www.steamgriddb.com/game/${game.id}`,
  })).sort((a, b) => b.score - a.score);
}

async function searchCovers(key, query, limit = COVER_RESULT_LIMIT) {
  const cacheKey = `${key.slice(0, 8)}:${normalizeTitle(query)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.results;
  const games = (await searchGames(key, query)).slice(0, COVER_GAME_CANDIDATE_LIMIT);
  const results = [];
  for (const game of games) {
    results.push(...(await gridsForGame(key, game)).slice(0, COVERS_PER_GAME_LIMIT));
    if (results.length >= limit) break;
    await wait(COVER_SEARCH_PAUSE_MS);
  }
  const limited = results.slice(0, limit);
  cache.set(cacheKey, { at: Date.now(), results: limited });
  return limited;
}

async function bestExactCover(key, title) {
  const wanted = normalizeTitle(title);
  const games = await searchGames(key, title);
  const exactMatches = games.filter(game => normalizeTitle(game.name) === wanted);
  if (exactMatches.length !== 1) return null;
  const exact = exactMatches[0];
  const grids = await gridsForGame(key, exact);
  return grids[0] || null;
}

async function verifyKey(key) {
  if (String(key || '').trim().length < API_KEY_MIN_LENGTH) throw new Error('Enter a valid SteamGridDB API key.');
  await searchGames(String(key).trim(), 'Mario');
  return true;
}

module.exports = { normalizeTitle, titleSuggestions, searchTitles, searchCovers, bestExactCover, verifyKey, wait };
