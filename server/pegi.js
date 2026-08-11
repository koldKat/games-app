const https = require('node:https');

const cache = new Map();
const decode = value => String(value || '')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#039;|&apos;/g, "'")
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'GamesShelf/1.0 personal PEGI lookup' }, timeout: 12000 }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        return resolve(fetchPage(new URL(response.headers.location, url)));
      }
      if (response.statusCode !== 200) { response.resume(); return reject(new Error(`PEGI returned HTTP ${response.statusCode}.`)); }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { if (body.length < 4_000_000) body += chunk; });
      response.on('end', () => resolve(body));
    });
    request.on('timeout', () => request.destroy(new Error('PEGI lookup timed out.')));
    request.on('error', reject);
  });
}

function parseResults(html, query) {
  const resultsArea = html.match(/<div id="results"[\s\S]*?<\/main>/)?.[0] || '';
  const articles = resultsArea.split(/<article class="game">/).slice(1);
  return articles.slice(0, 10).map(article => {
    const title = decode(article.match(/game-content__header-title[\s\S]*?<h3>([\s\S]*?)<\/h3>/)?.[1]);
    const publisher = decode(article.match(/<span class="publisher">([\s\S]*?)<\/span>/)?.[1]);
    const pegi = Number(article.match(/age_threshold_icons\/(3|7|12|16|18)\.png/)?.[1]) || null;
    const descriptors = [...article.matchAll(/category_threshold_icons\/[^"]+" alt="([^"]+)"/g)].map(match => decode(match[1]));
    const releaseBlock = article.match(/Release Dates &(?:amp;)? Platforms:[\s\S]*?<\/ul>/)?.[0] || '';
    const releases = [...releaseBlock.matchAll(/<div class="[^"]*">([\s\S]*?)<\/div>/g)].map(match => decode(match[1]));
    const year = Number(releases[0]?.match(/\b(19|20)\d{2}\b/)?.[0]) || null;
    return { title, publisher, pegi, descriptors, releases, releaseYear: year, pegiUrl: `https://pegi.info/search-pegi?q=${encodeURIComponent(title || query)}` };
  }).filter(result => result.title);
}

async function searchPegi(query) {
  const q = String(query || '').trim().slice(0, 128);
  if (q.length < 2) throw new Error('Enter at least two characters.');
  const key = q.toLocaleLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.results;
  const url = new URL('https://pegi.info/search-pegi');
  url.searchParams.set('q', q);
  const results = parseResults(await fetchPage(url), q);
  cache.set(key, { at: Date.now(), results });
  return results;
}

module.exports = { parseResults, searchPegi };
