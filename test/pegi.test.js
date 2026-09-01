const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_PAGES, fetchPage, mergeResults, parseResults, resultPageCount, searchPegi } = require('../server/pegi');

test('PEGI lookup retries transient provider failures before succeeding', async () => {
  let attempts = 0;
  const html = await fetchPage(new URL('https://pegi.info/search-pegi?q=test'), { requestPage: async () => {
    attempts++;
    if (attempts < 3) { const error = new Error('PEGI returned HTTP 500.'); error.statusCode = 500; throw error; }
    return '<div id="results"></div>';
  } });
  assert.equal(html, '<div id="results"></div>');
  assert.equal(attempts, 3);
});

test('PEGI lookup does not retry permanent provider failures', async () => {
  let attempts = 0;
  await assert.rejects(fetchPage(new URL('https://pegi.info/search-pegi?q=test'), { requestPage: async () => {
    attempts++;
    const error = new Error('PEGI returned HTTP 404.'); error.statusCode = 404; throw error;
  } }), /HTTP 404/);
  assert.equal(attempts, 1);
});

test('PEGI HTML results are reduced to safe metadata', () => {
  const html = `<div id="results"><article class="game"><div class="game-content__header-rating"><img src="https://rating.pegi.info/assets/images/games/age_threshold_icons/7.png"></div><div class="game-content__header-title"><h3>ASTRO BOT</h3><span class="publisher">Sony Interactive Entertainment Europe</span></div><img src="x/category_threshold_icons/fear.png" alt="Fear"><img src="x/category_threshold_icons/purchases.png" alt="In-game purchases"><span>Release Dates &amp; Platforms:</span><ul><li><div class="icon-playstation-5">PlayStation 5 - 06/09/2024</div></li></ul><h3>Advice for consumers</h3><p>Rated PEGI 7 because it may frighten younger children.</p><h3>Brief outline of the game</h3><p>A colourful platform adventure.</p><h3>Content specific issues</h3><p>Some fantasy enemies may be frightening.</p><h3>Other issues</h3><p>Optional cosmetic purchases are available.</p></article></main>`;
  assert.deepEqual(parseResults(html, 'Astro Bot')[0], {
    title: 'ASTRO BOT', publisher: 'Sony Interactive Entertainment Europe', pegi: 7,
    descriptors: ['Fear', 'In-game purchases'], releases: ['PlayStation 5 - 06/09/2024'], releaseYear: 2024,
    advice: 'Rated PEGI 7 because it may frighten younger children.',
    outline: 'A colourful platform adventure.', contentIssues: 'Some fantasy enemies may be frightening.',
    otherIssues: 'Optional cosmetic purchases are available.',
    pegiUrl: 'https://pegi.info/search-pegi?q=ASTRO%20BOT',
  });
});

test('PEGI lookup follows zero-based result pages and merges distinct editions', async () => {
  const article = (title, publisher, platform) => `<article class="game"><img src="x/age_threshold_icons/7.png"><div class="game-content__header-title"><h3>${title}</h3><span class="publisher">${publisher}</span></div><span>Release Dates &amp; Platforms:</span><ul><li><div class="platform">${platform} - 01/01/2025</div></li></ul></article>`;
  const pages = [
    `<div id="results">Found 12 results ${article('Minecraft A', 'Publisher A', 'PC')}</main>`,
    `<div id="results">${article('Minecraft A', 'Publisher A', 'PC')}${article('Minecraft B', 'Publisher B', 'Nintendo Switch')}</main>`,
  ];
  const requested = [];
  const results = await searchPegi('pagination-test-minecraft', { fetcher: async url => {
    requested.push(url.toString()); return pages[Number(url.searchParams.get('page') || 0)];
  } });
  assert.equal(resultPageCount(pages[0]), 2);
  assert.equal(requested.length, 2);
  assert.match(requested[1], /page=1/);
  assert.deepEqual(results.map(result => result.title), ['Minecraft A', 'Minecraft B']);
});

test('PEGI pagination is capped and duplicate records are removed conservatively', () => {
  assert.equal(resultPageCount('Found 300 results'), MAX_PAGES);
  const base = { title: 'Same', publisher: 'One', pegi: 7, releases: ['PC - 01/01/2025'] };
  assert.equal(mergeResults([[base], [{ ...base }], [{ ...base, releases: ['PS5 - 01/01/2025'] }]]).length, 2);
});
