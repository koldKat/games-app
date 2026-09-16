'use strict';

const { APP_USER_AGENT, TITLE_LOOKUP_MIN_LENGTH } = require('./constants');
const { fingerprint, matchesPlatform, normalize } = require('./cover-provider-utils');

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const API_ROOT = 'https://api.igdb.com/v4';
const REQUEST_TIMEOUT_MS = 20_000;
const REQUEST_GAP_MS = 275;
const RATE_LIMIT_RETRY_MS = 1_100;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const RESULT_LIMIT = 12;
const GAME_TYPES = Object.freeze({
  0: 'Main game', 1: 'DLC / add-on', 2: 'Expansion', 3: 'Bundle', 4: 'Standalone expansion',
  5: 'Mod', 6: 'Episode', 7: 'Season', 8: 'Remake', 9: 'Remaster', 10: 'Expanded game',
  11: 'Port', 12: 'Fork', 13: 'Pack', 14: 'Update',
});
const tokens = new Map();
const tokenRequests = new Map();
const searches = new Map();
const searchRequests = new Map();
let lastRequestAt = 0;
let requestLane = Promise.resolve();

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const cleanText = value => String(value || '').trim();
const escapeQuery = value => cleanText(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');

function cleanCredentials(value) {
  return { clientId: cleanText(value?.clientId), clientSecret: cleanText(value?.clientSecret) };
}
function validateCredentials(value) {
  const clean = cleanCredentials(value);
  if (clean.clientId.length < 8 || clean.clientId.length > 128 || clean.clientSecret.length < 16 || clean.clientSecret.length > 256) {
    throw new Error('Enter a valid IGDB Client ID and Client Secret.');
  }
  return clean;
}

async function fetchAccessToken(clean, key) {
  const url = new URL(TOKEN_URL);
  url.searchParams.set('client_id', clean.clientId); url.searchParams.set('client_secret', clean.clientSecret);
  url.searchParams.set('grant_type', 'client_credentials');
  const response = await fetch(url, { method: 'POST', headers: { Accept: 'application/json', 'User-Agent': APP_USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    const error = new Error(body.message || `IGDB authentication returned HTTP ${response.status}.`); error.status = response.status; throw error;
  }
  const token = { value: body.access_token, expiresAt: Date.now() + Math.max(60, Number(body.expires_in) || 0) * 1000 };
  tokens.set(key, token); return token.value;
}
async function accessToken(credentials) {
  const clean = validateCredentials(credentials); const key = fingerprint(clean); const cached = tokens.get(key);
  if (cached && cached.expiresAt - TOKEN_EXPIRY_MARGIN_MS > Date.now()) return cached.value;
  if (!tokenRequests.has(key)) tokenRequests.set(key, fetchAccessToken(clean, key).finally(() => tokenRequests.delete(key)));
  return tokenRequests.get(key);
}
async function paceRequest() {
  const turn = requestLane.then(async () => {
    const delay = Math.max(0, REQUEST_GAP_MS - (Date.now() - lastRequestAt));
    if (delay) await wait(delay);
    lastRequestAt = Date.now();
  });
  requestLane = turn.catch(() => {});
  await turn;
}

async function request(credentials, endpoint, query, retry = { authorization: true, rateLimit: true }) {
  const clean = validateCredentials(credentials); const token = await accessToken(clean);
  await paceRequest();
  const response = await fetch(`${API_ROOT}/${endpoint}`, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'text/plain', 'Client-ID': clean.clientId,
      Authorization: `Bearer ${token}`, 'User-Agent': APP_USER_AGENT },
    body: query, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401 && retry.authorization) {
    tokens.delete(fingerprint(clean)); return request(clean, endpoint, query, { ...retry, authorization: false });
  }
  if (response.status === 429 && retry.rateLimit) {
    await wait(RATE_LIMIT_RETRY_MS); return request(clean, endpoint, query, { ...retry, rateLimit: false });
  }
  const body = await response.json().catch(() => ([]));
  if (!response.ok) {
    const error = new Error(body?.message || body?.[0]?.message || `IGDB returned HTTP ${response.status}.`); error.status = response.status; throw error;
  }
  return Array.isArray(body) ? body : [];
}

const companyNames = (row, role) => [...new Set((row.involved_companies || [])
  .filter(item => item?.[role]).map(item => cleanText(item.company?.name)).filter(Boolean))];
const names = rows => [...new Set((rows || []).map(item => cleanText(item?.name)).filter(Boolean))];
function imageUrl(imageId, size) {
  return imageId ? `https://images.igdb.com/igdb/image/upload/t_${size}/${encodeURIComponent(imageId)}.jpg` : '';
}
function mapGame(row) {
  const platforms = names(row.platforms); const publishers = companyNames(row, 'publisher'); const developers = companyNames(row, 'developer');
  const timestamp = Number(row.first_release_date) || 0;
  return {
    igdbId: Number(row.id), providerGameId: Number(row.id), title: cleanText(row.name), gameTitle: cleanText(row.name),
    slug: cleanText(row.slug), source: 'igdb', sourceUrl: cleanText(row.url) || (row.slug ? `https://www.igdb.com/games/${row.slug}` : 'https://www.igdb.com/'),
    description: cleanText(row.summary), releaseYear: timestamp ? new Date(timestamp * 1000).getUTCFullYear() : null,
    publisher: publishers[0] || '', publishers, developers, genres: names(row.genres), themes: names(row.themes), platforms,
    gameType: cleanText(row.game_type?.type || row.game_type?.name || GAME_TYPES[row.game_type]),
    rating: row.rating != null && Number.isFinite(Number(row.rating)) ? Math.round(Number(row.rating) * 10) / 10 : null,
    ratingCount: Math.max(0, Number(row.rating_count) || 0),
    criticRating: row.aggregated_rating != null && Number.isFinite(Number(row.aggregated_rating)) ? Math.round(Number(row.aggregated_rating) * 10) / 10 : null,
    criticRatingCount: Math.max(0, Number(row.aggregated_rating_count) || 0),
    coverUrl: imageUrl(row.cover?.image_id, 'cover_big_2x'), thumbnailUrl: imageUrl(row.cover?.image_id, 'cover_small_2x'),
  };
}

async function searchGames(credentials, title) {
  const cleanTitle = cleanText(title).slice(0, 160);
  if (cleanTitle.length < TITLE_LOOKUP_MIN_LENGTH) return [];
  const key = `${fingerprint(cleanCredentials(credentials))}:${normalize(cleanTitle)}`; const cached = searches.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.rows;
  if (!searchRequests.has(key)) {
    const pending = (async () => {
      const fields = 'name,slug,summary,first_release_date,url,cover.image_id,platforms.name,involved_companies.publisher,involved_companies.developer,involved_companies.company.name,genres.name,themes.name,game_type,rating,rating_count,aggregated_rating,aggregated_rating_count';
      const rows = (await request(credentials, 'games', `search "${escapeQuery(cleanTitle)}"; fields ${fields}; limit ${RESULT_LIMIT};`)).map(mapGame).filter(game => game.title);
      const now = Date.now();
      for (const [cachedKey, value] of searches) if (now - value.at >= CACHE_TTL_MS) searches.delete(cachedKey);
      while (searches.size >= CACHE_MAX_ENTRIES) searches.delete(searches.keys().next().value);
      searches.set(key, { at: now, rows }); return rows;
    })().finally(() => searchRequests.delete(key));
    searchRequests.set(key, pending);
  }
  return searchRequests.get(key);
}

async function exactGame(credentials, title, platform = '') {
  const exact = (await searchGames(credentials, title)).filter(game => normalize(game.title) === normalize(title) && matchesPlatform(platform, game.platforms));
  return exact.length === 1 ? exact[0] : null;
}
async function searchCovers(credentials, title, platform = '') {
  return (await searchGames(credentials, title)).filter(game => game.coverUrl && (!platform || matchesPlatform(platform, game.platforms))).map(game => ({
    providerGameId: game.igdbId, gameTitle: game.title, url: game.coverUrl, thumbnailUrl: game.thumbnailUrl || game.coverUrl,
    width: 528, height: 748, style: game.platforms.slice(0, 3).join(', ') || 'IGDB cover', source: 'igdb', sourceUrl: game.sourceUrl, platforms: game.platforms,
  }));
}
async function bestExactCover(credentials, title, platform = '') {
  const game = await exactGame(credentials, title, platform); if (!game?.coverUrl) return null;
  return { providerGameId: game.igdbId, gameTitle: game.title, url: game.coverUrl, thumbnailUrl: game.thumbnailUrl || game.coverUrl,
    width: 528, height: 748, style: game.platforms.slice(0, 3).join(', ') || 'IGDB cover', source: 'igdb', sourceUrl: game.sourceUrl, platforms: game.platforms };
}
async function searchDescriptions(credentials, title, platform = '') {
  return (await searchGames(credentials, title)).filter(game => game.description && (!platform || matchesPlatform(platform, game.platforms))).map(game => ({
    providerGameId: game.igdbId, gameTitle: game.title, description: game.description, source: 'IGDB', sourceUrl: game.sourceUrl, platforms: game.platforms,
  }));
}
async function verify(credentials) { await accessToken(validateCredentials(credentials)); await searchGames(credentials, 'Mario'); return true; }

module.exports = { bestExactCover, cleanCredentials, exactGame, mapGame, searchCovers, searchDescriptions, searchGames, verify };
