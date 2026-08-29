const test = require('node:test');
const assert = require('node:assert/strict');

const { createCatalogueRoutes } = require('../server/catalogue-routes');

function response() {
  return {
    headers: {}, status: null, body: '',
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); },
    end(body = '') { this.body += body; },
  };
}

function fixture({ user = null, libraryGame = null } = {}) {
  const entry = {
    id: 2, slug: 'portal-2-steam', title: 'Portal 2', platform: 'Steam', pegi: 12,
    publisher: 'Valve', releaseYear: 2011, coverUrl: '/covers/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
    pegiDescriptors: [], hltbMainStory: 8,
  };
  return createCatalogueRoutes({
    catalogue: {
      listPublic: () => ({ entries: [entry], total: 1, page: 1, pages: 1 }), publicPlatforms: () => [],
      getPublicBySlug: slug => slug === entry.slug ? entry : null,
      libraryCopy: () => libraryGame,
      sitemapEntries: () => [{ slug: entry.slug, updatedAt: '2026-08-28' }],
      searchPublic: () => [entry],
    },
    auth: { authenticate: () => user, refreshSessionCookie: () => null },
    events: { publish() {} },
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
  assert.match(output.body, /data-catalogue-game-dialog open/);
  assert.match(output.body, /The public Kat·a·log/);
  assert.match(output.body, /Already in your Kat·a·log/);
  assert.doesNotMatch(output.body, /data-catalogue-add/);
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
  assert.equal(output.headers['Cache-Control'], 'public, max-age=3600');
});
