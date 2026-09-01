'use strict';

const { APP_USER_AGENT, TITLE_LOOKUP_MIN_LENGTH } = require('./constants');
const { fingerprint, matchesPlatform, normalize, oneExactGameCover, platformKey } = require('./cover-provider-utils');

const API_ROOT = 'https://api.thegamesdb.net';
const REQUEST_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map(); let platformsCache = null;

function cleanCredentials(value) { return { apiKey: String(value?.apiKey || '').trim() }; }
function validateCredentials(value) { const clean = cleanCredentials(value); if (clean.apiKey.length < 8) throw new Error('Enter a valid TheGamesDB API key.'); return clean; }
async function request(credentials, pathname, parameters = {}) {
  const { apiKey } = validateCredentials(credentials); const url = new URL(`${API_ROOT}${pathname}`); url.searchParams.set('apikey', apiKey);
  for (const [name, value] of Object.entries(parameters)) if (value !== '' && value != null) url.searchParams.set(name, String(value));
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': APP_USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || (body.code != null && Number(body.code) !== 200)) {
    const error = new Error(body.status || body.message || `TheGamesDB returned HTTP ${response.status}.`); error.status = response.status; throw error;
  }
  return body;
}
async function platforms(credentials) {
  const key = fingerprint(cleanCredentials(credentials)); if (platformsCache?.key === key && Date.now() - platformsCache.at < CACHE_TTL_MS) return platformsCache.rows;
  const body = await request(credentials, '/v1/Platforms'); const rows = body.data?.platforms || [];
  platformsCache = { key, at: Date.now(), rows: Array.isArray(rows) ? rows : Object.values(rows) }; return platformsCache.rows;
}
async function platformFor(credentials, platform) {
  const wanted = platformKey(platform); return (await platforms(credentials)).find(row => platformKey(row.name) === wanted) || null;
}
function parseCovers(body) {
  const games = Array.isArray(body.data?.games) ? body.data.games : []; const boxart = body.include?.boxart; const base = boxart?.base_url || {};
  const platformRows = body.include?.platform?.data || {}; const results = [];
  for (const game of games) {
    const images = boxart?.data?.[game.id] || boxart?.data?.[String(game.id)] || [];
    const platformName = platformRows?.[game.platform]?.name || platformRows?.[String(game.platform)]?.name || '';
    for (const image of images) {
      if (image.type !== 'boxart' || image.side !== 'front' || !image.filename) continue;
      const resolution = String(image.resolution || '').match(/^(\d+)x(\d+)$/);
      const originalUrl = `${base.original || base.large || ''}${image.filename}`;
      results.push({ providerGameId: game.id, gameTitle: game.game_title, url: originalUrl,
        // TheGamesDB's generated small variants are intermittently missing. The
        // original is authoritative and the chooser has only a few manual rows.
        thumbnailUrl: originalUrl,
        width: resolution ? Number(resolution[1]) : null, height: resolution ? Number(resolution[2]) : null,
        style: platformName || 'Front boxart', source: 'thegamesdb', sourceUrl: 'https://thegamesdb.net/', platforms: [platformName].filter(Boolean) });
    }
  }
  return results.filter(result => /^https:\/\//i.test(result.url));
}
async function searchCovers(credentials, title, platform = '') {
  const cleanTitle = String(title || '').trim(); if (cleanTitle.length < TITLE_LOOKUP_MIN_LENGTH) throw new Error('Enter at least two title characters.');
  const cacheKey = `${fingerprint(cleanCredentials(credentials))}:${cleanTitle.toLocaleLowerCase()}:${platform}`; const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.results;
  const matchedPlatform = await platformFor(credentials, platform);
  const body = await request(credentials, '/v1.1/Games/ByGameName', { name: cleanTitle, include: 'boxart,platform', 'filter[platform]': matchedPlatform?.id });
  const results = parseCovers(body); cache.set(cacheKey, { at: Date.now(), results }); return results;
}
async function bestExactCover(credentials, title, platform = '') {
  const matches = (await searchCovers(credentials, title, platform)).filter(result => matchesPlatform(platform, result.platforms));
  return oneExactGameCover(title, matches);
}
function parseDescriptions(body) {
  const games = Array.isArray(body.data?.games) ? body.data.games : [];
  return games.map(game => ({ providerGameId: game.id, gameTitle: game.game_title || '', description: String(game.overview || '').trim(),
    source: 'TheGamesDB', sourceUrl: `https://thegamesdb.net/game.php?id=${encodeURIComponent(game.id)}`, platform: game.platform }))
    .filter(game => game.description);
}
async function searchDescriptions(credentials, title, platform = '') {
  const cleanTitle = String(title || '').trim(); if (cleanTitle.length < TITLE_LOOKUP_MIN_LENGTH) throw new Error('Enter at least two title characters.');
  const matchedPlatform = await platformFor(credentials, platform);
  if (platform && !matchedPlatform) return [];
  const body = await request(credentials, '/v1.1/Games/ByGameName', { name: cleanTitle, fields: 'overview,platform', 'filter[platform]': matchedPlatform?.id });
  return parseDescriptions(body);
}
async function bestExactDescription(credentials, title, platform = '') {
  const exact = (await searchDescriptions(credentials, title, platform)).filter(result => normalize(result.gameTitle) === normalize(title));
  return exact.length === 1 ? exact[0] : null;
}
async function verify(credentials) { await request(validateCredentials(credentials), '/v1/API/Limit'); return true; }

module.exports = { bestExactCover, bestExactDescription, cleanCredentials, parseCovers, parseDescriptions, searchCovers, searchDescriptions, verify };
