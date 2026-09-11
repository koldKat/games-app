const test = require('node:test');
const assert = require('node:assert/strict');

const { createKatalogRoutes } = require('../server/katalog-routes');

function response() {
  return {
    headers: {}, status: null, body: '',
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); },
    end(body = '') { this.body += body; },
  };
}

function fixture({ user = null, libraryGame = null, eventHandlers = {}, showcaseCovers = null } = {}) {
  const entry = {
    id: 2, slug: 'portal-2-steam', title: 'Portal 2', platform: 'Steam', pegi: 12,
    publisher: 'Valve', releaseYear: 2011, coverUrl: '/covers/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
    pegiDescriptors: [], hltbMainStory: 8,
  };
  return createKatalogRoutes({
    catalogue: {
      listPublic: () => ({ entries: [entry], total: 1, page: 1, pages: 1 }), publicPlatforms: () => [],
      getPublicBySlug: slug => slug === entry.slug ? entry : null,
      libraryCopy: () => libraryGame,
      sitemapEntries: () => [{ slug: entry.slug, updatedAt: '2026-08-28' }],
      searchPublic: () => [entry],
    },
    auth: { authenticate: () => user, refreshSessionCookie: () => null },
    events: { publish() {}, subscribePublicSite() {}, ...eventHandlers }, showcaseCovers,
  });
}

test('public katalog routes render before account authentication', async () => {
  const routes = fixture(); const output = response();
  const handled = await routes.handle({ method: 'GET' }, output, new URL('https://gamekat.net/katalog'));
  assert.equal(handled, true);
  assert.equal(output.status, 200);
  assert.match(output.body, /Portal 2/);
  assert.match(output.headers['Content-Security-Policy'], /default-src 'self'/);
});

test('the public site stream is available for live header version updates', async () => {
  let subscriptions = 0;
  const routes = fixture({ eventHandlers: { subscribePublicSite() { subscriptions++; } } }); const output = response();
  const handled = await routes.handle({ method: 'GET' }, output, new URL('https://gamekat.net/api/site/stream'));
  assert.equal(handled, true);
  assert.equal(subscriptions, 1);
});

test('the public Signal route is available without an account', async () => {
  const routes = fixture(); const output = response();
  const handled = await routes.handle({ method: 'GET' }, output, new URL('https://gamekat.net/signal'));
  assert.equal(handled, true);
  assert.equal(output.status, 200);
  assert.match(output.body, /data-activity-feed data-activity-limit="all" data-activity-grouped="true"/);
  assert.match(output.body, /signal-page\.js/);
});

test('each public page request receives a newly selected cover fan', async () => {
  const first = '/covers/11111111111111111111111111111111.jpg';
  const second = '/covers/22222222222222222222222222222222.jpg';
  let requestCount = 0;
  const routes = fixture({ showcaseCovers: () => [requestCount++ ? second : first] });
  const firstPage = response(); const secondPage = response();
  await routes.handle({ method: 'GET' }, firstPage, new URL('https://gamekat.net/katalog'));
  await routes.handle({ method: 'GET' }, secondPage, new URL('https://gamekat.net/katalog'));
  assert.match(firstPage.body, new RegExp(first));
  assert.doesNotMatch(firstPage.body, new RegExp(second));
  assert.match(secondPage.body, new RegExp(second));
});

test('signed-in public views add only that account to the shared cover pool', async () => {
  const calls = [];
  const routes = fixture({ user: { id: 17, username: 'collector' }, showcaseCovers: (limit, userId) => {
    calls.push({ limit, userId }); return [];
  } });
  await routes.handle({ method: 'GET' }, response(), new URL('https://gamekat.net/katalog'));
  await routes.handle({ method: 'GET' }, response(), new URL('https://gamekat.net/signal'));
  assert.deepEqual(calls, [{ limit: 5, userId: 17 }, { limit: 5, userId: 17 }]);
});

test('the former catalogue path is not a public route', async () => {
  const routes = fixture(); const output = response();
  assert.equal(await routes.handle({ method: 'GET' }, output, new URL('https://gamekat.net/catalogue')), false);
});

test('a signed-in release page hides the add form for an existing library copy', async () => {
  const routes = fixture({
    user: { id: 7, username: 'koldKat' },
    libraryGame: { id: 9, title: 'Portal 2', platform: 'Steam' },
  });
  const output = response();
  await routes.handle({ method: 'GET' }, output, new URL('https://gamekat.net/game/portal-2-steam'));
  assert.match(output.body, /data-katalog-game-dialog open/);
  assert.match(output.body, /<h2>Public Kat·a·log<\/h2>/);
  assert.match(output.body, /Already in your Kat·a·log/);
  assert.doesNotMatch(output.body, /data-katalog-add/);
});

test('public search is quiet for short input and returns factual matches otherwise', async () => {
  const routes = fixture(); const short = response(); const full = response();
  await routes.handle({ method: 'GET' }, short, new URL('https://gamekat.net/api/catalogue/search?q=p'));
  await routes.handle({ method: 'GET' }, full, new URL('https://gamekat.net/api/catalogue/search?q=portal'));
  assert.deepEqual(JSON.parse(short.body), { entries: [] });
  assert.equal(JSON.parse(full.body).entries[0].title, 'Portal 2');
  assert.equal(full.headers['Cache-Control'], 'no-store');
});

test('dynamic sitemap contains public release pages', async () => {
  const routes = fixture(); const output = response();
  await routes.handle({ method: 'GET' }, output, new URL('https://gamekat.net/sitemap.xml'));
  assert.equal(output.status, 200);
  assert.match(output.body, /https:\/\/gamekat\.net\/game\/portal-2-steam/);
  assert.equal(output.headers['Content-Type'], 'application/xml; charset=utf-8');
  assert.equal(output.headers['Cache-Control'], 'public, max-age=3600');
});
