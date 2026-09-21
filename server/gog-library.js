'use strict';

const { APP_USER_AGENT } = require('./constants');
const { GAME_LIMITS } = require('./validation-policy');

const AUTH_ROOT = 'https://auth.gog.com';
const API_ROOT = 'https://embed.gog.com';
const CLIENT_ID = String(process.env.GOG_CLIENT_ID || '46899977096215655').trim();
const CLIENT_SECRET = String(process.env.GOG_CLIENT_SECRET || '9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9').trim();
const REDIRECT_URI = String(process.env.GOG_REDIRECT_URI || 'https://embed.gog.com/on_login_success?origin=client').trim();
const REDIRECT_TARGET = new URL(REDIRECT_URI);
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_LIBRARY_PAGES = 200;
const AUTHORIZATION_URL = (() => {
  const url = new URL('/auth', AUTH_ROOT);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('layout', 'client2');
  return url.toString();
})();

function apiError(message, status = 502) {
  return Object.assign(new Error(message), { status });
}

async function fetchJson(url, { accessToken, fetchImpl = global.fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json', 'User-Agent': APP_USER_AGENT,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch { throw apiError('GOG is temporarily unavailable. Try again shortly.'); }
  if (response.status === 401 || response.status === 403) throw apiError('Your GOG connection expired. Reconnect GOG and try again.', 401);
  if (!response.ok) throw apiError(`GOG returned HTTP ${response.status}.`);
  try { return await response.json(); }
  catch { throw apiError('GOG returned an unreadable response.'); }
}

function authorizationCode(value) {
  const input = String(value || '').trim();
  if (!input || input.length > 2_000) throw apiError('Paste the GOG authorization result URL.', 400);
  const validCode = code => code.length >= 8 && code.length <= 1_900 && !/[\s\x00-\x1f\x7f]/.test(code);
  if (!/^https?:\/\//i.test(input) && validCode(input)) return input;
  try {
    const url = new URL(input);
    if (url.origin !== REDIRECT_TARGET.origin || url.pathname !== REDIRECT_TARGET.pathname) throw new Error('redirect');
    const code = String(url.searchParams.get('code') || '').trim();
    if (!validCode(code)) throw new Error('code');
    return code;
  } catch { throw apiError('Paste the complete GOG authorization result URL.', 400); }
}

function tokenUrl(grantType, value) {
  const url = new URL('/token', AUTH_ROOT);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('client_secret', CLIENT_SECRET);
  url.searchParams.set('grant_type', grantType);
  url.searchParams.set(grantType === 'authorization_code' ? 'code' : 'refresh_token', value);
  if (grantType === 'authorization_code') url.searchParams.set('redirect_uri', REDIRECT_URI);
  return url;
}

function normalizedTokens(payload, fallbackRefreshToken = '') {
  const accessToken = String(payload?.access_token || '').trim();
  const refreshToken = String(payload?.refresh_token || fallbackRefreshToken || '').trim();
  if (!accessToken || !refreshToken) throw apiError('GOG did not return a reusable account connection.');
  const expiresIn = Math.max(60, Number(payload.expires_in) || 3_600);
  return { accessToken, refreshToken, expiresAt: Math.floor(Date.now() / 1_000) + expiresIn };
}

async function exchangeAuthorization(value, fetchImpl = global.fetch) {
  return normalizedTokens(await fetchJson(tokenUrl('authorization_code', authorizationCode(value)), { fetchImpl }));
}

async function refreshAuthorization(refreshToken, fetchImpl = global.fetch) {
  const token = String(refreshToken || '').trim();
  if (!token) throw apiError('Reconnect GOG to continue.', 401);
  return normalizedTokens(await fetchJson(tokenUrl('refresh_token', token), { fetchImpl }), token);
}

async function account(accessToken, fetchImpl = global.fetch) {
  const payload = await fetchJson(new URL('/userData.json', API_ROOT), { accessToken, fetchImpl });
  const username = String(payload?.username || '').trim().slice(0, 100);
  const userId = String(payload?.userId || payload?.user_id || '').trim().slice(0, 100);
  if (!username || !userId) throw apiError('GOG did not return a valid account identity.');
  return { username, userId };
}

function gamesFromPage(payload, sourceHidden = false) {
  const products = payload?.products;
  if (!Array.isArray(products)) throw apiError('GOG returned an unexpected library response.');
  return products.map(product => ({
    productId: String(product?.id || '').trim(),
    title: String(product?.title || '').trim().slice(0, GAME_LIMITS.titleMax),
    sourceHidden,
  })).filter(game => /^\d+$/.test(game.productId) && game.title);
}

async function fetchLibraryPage(accessToken, hidden, page, fetchImpl = global.fetch) {
  const url = new URL('/account/getFilteredProducts', API_ROOT);
  url.searchParams.set('mediaType', '1');
  url.searchParams.set('sortBy', 'title');
  url.searchParams.set('page', String(page));
  url.searchParams.set('hiddenFlag', hidden ? '1' : '0');
  return fetchJson(url, { accessToken, fetchImpl });
}

function pageCount(payload) {
  return Math.max(1, Number.parseInt(payload?.totalPages, 10) || 1);
}

async function ownedGames(accessToken, fetchImpl = global.fetch, onPage = () => {}) {
  const visibleFirst = await fetchLibraryPage(accessToken, false, 1, fetchImpl);
  const hiddenFirst = await fetchLibraryPage(accessToken, true, 1, fetchImpl);
  const sources = [
    { hidden: false, first: visibleFirst, pages: pageCount(visibleFirst) },
    { hidden: true, first: hiddenFirst, pages: pageCount(hiddenFirst) },
  ];
  const pages = sources.reduce((sum, source) => sum + source.pages, 0);
  if (pages > MAX_LIBRARY_PAGES) throw apiError('This GOG library is too large to import safely in one request.', 400);
  const games = []; let current = 0;
  for (const source of sources) {
    games.push(...gamesFromPage(source.first, source.hidden));
    onPage({ page: ++current, pages, sourceHidden: source.hidden });
    for (let page = 2; page <= source.pages; page++) {
      games.push(...gamesFromPage(await fetchLibraryPage(accessToken, source.hidden, page, fetchImpl), source.hidden));
      onPage({ page: ++current, pages, sourceHidden: source.hidden });
    }
  }
  const unique = new Map();
  for (const game of games) {
    const existing = unique.get(game.productId);
    if (!existing || (existing.sourceHidden && !game.sourceHidden)) unique.set(game.productId, game);
  }
  return [...unique.values()].sort((left, right) => left.title.localeCompare(right.title, 'en-US', { sensitivity: 'base', numeric: true }));
}

module.exports = {
  AUTHORIZATION_URL, account, authorizationCode, exchangeAuthorization, gamesFromPage, ownedGames, refreshAuthorization,
};
