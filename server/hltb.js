'use strict';

const { TITLE_LOOKUP_MIN_LENGTH } = require('./constants');

const BASE_URL = 'https://howlongtobeat.com';
const FALLBACK_SEARCH_PATH = '/api/s';
const CACHE_MS = 30 * 60 * 1000;
const SESSION_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 20_000;
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36';
const QUERY_MAX_LENGTH = 220;
const RESULT_LIMIT = 20;
const cache = new Map();
let session = null;
let queue = Promise.resolve();

function normalize(value) {
  return String(value || '').replace(/[™®©]/g, '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase()
    .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function similarity(left, right) {
  const a = normalize(left); const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row++) {
    let diagonal = previous[0]; previous[0] = row;
    for (let column = 1; column <= b.length; column++) {
      const above = previous[column];
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + (a[row - 1] === b[column - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return Math.max(0, 1 - previous[b.length] / Math.max(a.length, b.length));
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HLTB returned HTTP ${response.status}.`);
  return response;
}

function scriptUrls(html, appOnly) {
  return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map(match => new URL(match[1], `${BASE_URL}/`).href).filter(url => !appOnly || /_app-/i.test(url));
}

function searchPath(source) {
  const match = source.match(/fetch\s*\(\s*["']\/api\/([a-zA-Z0-9_/]+)[^"']*["']\s*,\s*\{[^}]*method:\s*["']POST["'][^}]*}/is);
  if (!match) return '';
  return `/api/${match[1].split('/')[0]}`;
}

async function discoverSearchPath() {
  const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
  const html = await (await request(`${BASE_URL}/`, { headers })).text();
  for (const appOnly of [true, false]) {
    for (const url of scriptUrls(html, appOnly)) {
      const path = searchPath(await (await request(url, { headers })).text());
      if (path) return path;
    }
  }
  return FALLBACK_SEARCH_PATH;
}

async function createSession() {
  const path = await discoverSearchPath();
  const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
  const auth = await (await request(`${BASE_URL}${path}/init?t=${Date.now()}`, { headers })).json();
  const dynamicKey = Object.entries(auth).find(([key]) => /key/i.test(key));
  const dynamicValue = Object.entries(auth).find(([key]) => /val/i.test(key));
  if (!auth.token || !dynamicKey || !dynamicValue) throw new Error('HLTB authentication response changed.');
  return { at: Date.now(), path, token: auth.token, key: dynamicKey[1], value: dynamicValue[1] };
}

async function activeSession() {
  if (!session || Date.now() - session.at > SESSION_MS) session = await createSession();
  return session;
}

function hours(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? Math.round(value / 36) / 100 : null;
}

function parseGame(game, query) {
  return {
    id: Number(game.game_id), title: String(game.game_name || '').trim(),
    url: `${BASE_URL}/game/${Number(game.game_id)}`,
    mainStory: hours(game.comp_main), mainExtra: hours(game.comp_plus),
    completionist: hours(game.comp_100), allStyles: hours(game.comp_all),
    similarity: Math.round(similarity(query, game.game_name) * 10_000) / 10_000,
  };
}

async function fetchSearch(title, retry = true) {
  const auth = await activeSession();
  const payload = {
    searchType: 'games', searchTerms: title.split(/\s+/), searchPage: 1, size: 20,
    searchOptions: { games: { userId: 0, platform: '', sortCategory: 'popular', rangeCategory: 'main',
      rangeTime: { min: 0, max: 0 }, gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
      rangeYear: { max: '', min: '' }, modifier: '' }, users: { sortCategory: 'postcount' },
    lists: { sortCategory: 'follows' }, filter: '', sort: 0, randomizer: 0 }, useCache: true,
    [auth.key]: auth.value,
  };
  const response = await fetch(`${BASE_URL}${auth.path}`, {
    method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json', Accept: '*/*', 'User-Agent': USER_AGENT,
      Referer: `${BASE_URL}/`, Origin: BASE_URL, 'x-auth-token': String(auth.token),
      'x-hp-key': String(auth.key), 'x-hp-val': String(auth.value) },
    body: JSON.stringify(payload),
  });
  if ((response.status === 401 || response.status === 403) && retry) { session = null; return fetchSearch(title, false); }
  if (!response.ok) throw new Error(`HLTB returned HTTP ${response.status}.`);
  const body = await response.json();
  return (Array.isArray(body.data) ? body.data : []).map(game => parseGame(game, title))
    .filter(game => game.id && game.title).sort((left, right) => right.similarity - left.similarity).slice(0, RESULT_LIMIT);
}

async function search(title) {
  const clean = String(title || '').trim().slice(0, QUERY_MAX_LENGTH);
  if (clean.length < TITLE_LOOKUP_MIN_LENGTH) throw new Error('Type at least two characters.');
  const key = normalize(clean); const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.results;
  const run = queue.catch(() => {}).then(() => fetchSearch(clean));
  queue = run.then(() => undefined, () => undefined);
  const results = await run; cache.set(key, { at: Date.now(), results }); return results;
}

module.exports = { discoverSearchPath, hours, normalize, parseGame, search, searchPath, similarity };
