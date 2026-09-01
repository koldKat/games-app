const https = require('node:https');
const { APP_USER_AGENT, TITLE_LOOKUP_MIN_LENGTH } = require('./constants');

const cache = new Map();
const MAX_PAGES = 10;
const BASE_URL = 'https://pegi.info/search-pegi';
const REQUEST_TIMEOUT_MS = 12_000;
const RESPONSE_MAX_LENGTH = 4_000_000;
const RESULTS_PER_PAGE = 10;
const QUERY_MAX_LENGTH = 128;
const CACHE_TTL_MS = 60 * 60 * 1000;
const TRANSIENT_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = Object.freeze([300, 900]);
const decode = value => String(value || '')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#039;|&apos;/g, "'")
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function httpError(statusCode) {
  const error = new Error(`PEGI returned HTTP ${statusCode}.`);
  error.statusCode = statusCode;
  return error;
}

function fetchPageOnce(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': APP_USER_AGENT }, timeout: REQUEST_TIMEOUT_MS }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        return resolve(fetchPageOnce(new URL(response.headers.location, url)));
      }
      if (response.statusCode !== 200) { response.resume(); return reject(httpError(response.statusCode)); }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { if (body.length < RESPONSE_MAX_LENGTH) body += chunk; });
      response.on('end', () => resolve(body));
    });
    request.on('timeout', () => request.destroy(new Error('PEGI lookup timed out.')));
    request.on('error', reject);
  });
}

async function fetchPage(url, { requestPage = fetchPageOnce } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try { return await requestPage(url); }
    catch (error) {
      lastError = error;
      if (!TRANSIENT_HTTP_STATUS.has(Number(error?.statusCode)) || attempt === RETRY_DELAYS_MS.length) throw error;
      await delay(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

function parseResults(html, query) {
  const resultsArea = html.match(/<div id="results"[\s\S]*?<\/main>/)?.[0] || '';
  const articles = resultsArea.split(/<article class="game">/).slice(1);
  return articles.slice(0, RESULTS_PER_PAGE).map(article => {
    const title = decode(article.match(/game-content__header-title[\s\S]*?<h3>([\s\S]*?)<\/h3>/)?.[1]);
    const publisher = decode(article.match(/<span class="publisher">([\s\S]*?)<\/span>/)?.[1]);
    const pegi = Number(article.match(/age_threshold_icons\/(3|7|12|16|18)\.png/)?.[1]) || null;
    const descriptors = [...article.matchAll(/category_threshold_icons\/[^"]+" alt="([^"]+)"/g)].map(match => decode(match[1]));
    const releaseBlock = article.match(/(?:Release Dates &(?:amp;)? Platforms:|Pre-release dates:)[\s\S]*?<\/ul>/i)?.[0] || '';
    const releases = [...releaseBlock.matchAll(/<div class="[^"]*">([\s\S]*?)<\/div>/g)].map(match => decode(match[1]));
    const year = Number(releases[0]?.match(/\b(19|20)\d{2}\b/)?.[0]) || null;
    const sections = {};
    const headings = [...article.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi)];
    for (let index = 0; index < headings.length; index++) {
      const label = decode(headings[index][1]).toLocaleLowerCase();
      const start = headings[index].index + headings[index][0].length;
      const end = headings[index + 1]?.index ?? article.length;
      if (['advice for consumers', 'brief outline of the game', 'content specific issues', 'other issues'].includes(label)) {
        sections[label] = decode(article.slice(start, end));
      }
    }
    return {
      title, publisher, pegi, descriptors, releases, releaseYear: year,
      advice: sections['advice for consumers'] || '',
      outline: sections['brief outline of the game'] || '',
      contentIssues: sections['content specific issues'] || '',
      otherIssues: sections['other issues'] || '',
      pegiUrl: `${BASE_URL}?q=${encodeURIComponent(title || query)}`,
    };
  }).filter(result => result.title);
}

function resultPageCount(html) {
  const totalText = decode(html.match(/Found\s+([\d,.]+)\s+results?/i)?.[1]).replace(/\D/g, '');
  const totalPages = totalText ? Math.ceil(Number(totalText) / RESULTS_PER_PAGE) : 0;
  const linkedPages = [...String(html || '').matchAll(/(?:[?&]|&amp;)page=(\d+)/gi)].map(match => Number(match[1]) + 1);
  const detectedPages = totalPages || (linkedPages.length ? Math.max(...linkedPages) : 1);
  return Math.max(1, Math.min(MAX_PAGES, detectedPages));
}

function resultKey(result) {
  return [result.title, result.publisher, result.pegi, ...(result.releases || [])].map(value => String(value || '').toLocaleLowerCase()).join('\u0000');
}

function mergeResults(pages) {
  const unique = new Map();
  for (const result of pages.flat()) if (!unique.has(resultKey(result))) unique.set(resultKey(result), result);
  return [...unique.values()];
}

async function searchPegi(query, { fetcher = fetchPage } = {}) {
  const q = String(query || '').trim().slice(0, QUERY_MAX_LENGTH);
  if (q.length < TITLE_LOOKUP_MIN_LENGTH) throw new Error('Enter at least two characters.');
  const key = q.toLocaleLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.results;
  const url = new URL(BASE_URL);
  url.searchParams.set('q', q);
  const firstHtml = await fetcher(url);
  const pages = [parseResults(firstHtml, q)];
  const pageCount = resultPageCount(firstHtml);
  if (pageCount > 1) {
    const laterPages = await Promise.allSettled(Array.from({ length: pageCount - 1 }, async (_, index) => {
      const pageUrl = new URL(url); pageUrl.searchParams.set('page', String(index + 1));
      return parseResults(await fetcher(pageUrl), q);
    }));
    for (const page of laterPages) if (page.status === 'fulfilled') pages.push(page.value);
  }
  const results = mergeResults(pages);
  cache.set(key, { at: Date.now(), results });
  return results;
}

module.exports = { MAX_PAGES, RETRY_DELAYS_MS, fetchPage, mergeResults, parseResults, resultPageCount, searchPegi };
