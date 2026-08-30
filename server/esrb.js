'use strict';

// ESRB has no public API.  This deliberately small adapter consumes only its
// public search pages and returns candidates for a human/exact-title decision.
const https = require('node:https');
const { APP_USER_AGENT, TITLE_LOOKUP_MIN_LENGTH } = require('./constants');

const BASE_URL = 'https://www.esrb.org/search/';
const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const RESPONSE_MAX_LENGTH = 4_000_000;
const QUERY_MAX_LENGTH = 128;
const cache = new Map();
const decode = value => String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': APP_USER_AGENT }, timeout: REQUEST_TIMEOUT_MS }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) { response.resume(); return resolve(fetchPage(new URL(response.headers.location, url))); }
      if (response.statusCode !== 200) { response.resume(); return reject(new Error(`ESRB returned HTTP ${response.statusCode}.`)); }
      let body = ''; response.setEncoding('utf8');
      response.on('data', chunk => { if (body.length < RESPONSE_MAX_LENGTH) body += chunk; });
      response.on('end', () => resolve(body));
    });
    request.on('timeout', () => request.destroy(new Error('ESRB lookup timed out.')));
    request.on('error', reject);
  });
}

function absoluteUrl(value) { try { return new URL(String(value || ''), BASE_URL).href; } catch { return ''; } }
function listFrom(block, pattern) { return [...String(block || '').matchAll(pattern)].map(match => decode(match[1])).filter(Boolean); }

function parseResults(html) {
  // ESRB renders actual ratings as sibling <div class="game"> cards. The
  // preceding filter form also has headings and rating words, so never parse
  // the whole search document as a candidate.
  const blocks = String(html || '').split(/<div\s+class=["']game["']\s*>/i).slice(1);
  const results = blocks.map(block => {
    const title = decode(block.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i)?.[1]);
    const url = absoluteUrl(block.match(/href=["']([^"']*\/ratings\/[^"']*)/i)?.[1]);
    const rating = decode(block.match(/<img[^>]+alt=["']([^"']+)["']/i)?.[1]);
    const platformsText = decode(block.match(/<div\s+class=["']platforms["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const cells = [...block.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => match[1]);
    const descriptor = decode(cells[1]);
    const interactiveElements = listFrom(cells[2], /<p[^>]*>([\s\S]*?)<\/p>/gi);
    const summary = decode(block.match(/<div\s+class=["']synopsis["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    return { title, esrbRating: rating, descriptors: descriptor && !/^no content descriptors/i.test(descriptor) ? [descriptor] : [], interactiveElements: interactiveElements.filter(value => !/^no interactive elements/i.test(value)), platforms: platformsText ? platformsText.split(/\s*,\s*/).filter(Boolean) : [], summary, esrbUrl: url };
  }).filter(result => result.title && result.esrbRating && result.esrbUrl);
  return [...new Map(results.map(result => [[result.title.toLocaleLowerCase(), result.esrbUrl].join('\0'), result])).values()];
}

async function searchEsrb(query, { fetcher = fetchPage } = {}) {
  const q = String(query || '').trim().slice(0, QUERY_MAX_LENGTH);
  if (q.length < TITLE_LOOKUP_MIN_LENGTH) throw new Error('Enter at least two characters.');
  const key = q.toLocaleLowerCase(); const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.results;
  const url = new URL(BASE_URL);
  url.searchParams.set('searchKeyword', q); url.searchParams.set('platform', 'All Platforms');
  url.searchParams.set('rating', 'E,E10+,T,M,AO'); url.searchParams.set('descriptor', 'All Content'); url.searchParams.set('pg', '1'); url.searchParams.set('searchType', 'All');
  const results = parseResults(await fetcher(url)); cache.set(key, { at: Date.now(), results }); return results;
}

module.exports = { BASE_URL, parseResults, searchEsrb };
