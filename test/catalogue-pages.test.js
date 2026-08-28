const test = require('node:test');
const assert = require('node:assert/strict');

const { renderCatalogue, renderGame, safeExternalUrl, sitemapXml } = require('../server/catalogue-pages');

const entry = {
  id: 3, slug: 'portal-2-steam', title: 'Portal 2', platform: 'Steam', pegi: 12,
  publisher: 'Valve', releaseYear: 2011, coverUrl: '/covers/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
  ratingAverage: 4.25, ratingCount: 8,
  pegiDescriptors: ['Violence'], pegiAdvice: 'Mild <action>', pegiOutline: '', pegiContentIssues: '', pegiOtherIssues: '',
  pegiUrl: 'https://pegi.info/portal-2', hltbUrl: 'https://howlongtobeat.com/game/2',
  hltbMainStory: 8, hltbMainExtra: 13, hltbCompletionist: 21, hltbAllStyles: 12,
};

test('catalogue page is crawlable server-rendered HTML', () => {
  const html = renderCatalogue({ result: { entries: [entry], total: 1, page: 1, pages: 1 }, platforms: [{ platform: 'Steam', count: 1 }] });
  assert.match(html, /<link rel="canonical" href="https:\/\/gamekat\.net\/catalogue">/);
  assert.match(html, /Portal 2/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /class="catalogue-results"/);
  assert.match(html, /name="robots" content="index, follow, max-image-preview:large"/);
  assert.doesNotMatch(html, /submittedByUserId|sourceGameId|ownership|notes/);
  assert.match(html, /class="community-rating"[\s\S]*4\.3[\s\S]*8 ratings/);
});

test('an authenticated catalogue page uses the same account-aware header vocabulary as the app', () => {
  const html = renderCatalogue({
    result: { entries: [entry], total: 1, page: 1, pages: 1 }, platforms: [],
    user: { username: 'koldKat', avatarUrl: '/avatars/koldkat.jpg' },
  });
  assert.match(html, /href="\/css\/theme\.css"/);
  assert.match(html, /class="topbar"/);
  assert.match(html, /class="brand"/);
  assert.match(html, /class="brand-mark"/);
  assert.match(html, /class="top-actions"/);
  assert.match(html, /class="button account-button"/);
  assert.match(html, /class="nav-avatar"/);
  assert.match(html, /Your collection, one place/);
  assert.match(html, /avatars\/koldkat\.jpg/);
  assert.match(html, /My Kat·a·log/);
  assert.match(html, /data-catalogue-destination="library"/);
  assert.match(html, /button-label">Add a game/);
});

test('public release pages show a community aggregate but never offer a public voting control', () => {
  const html = renderGame({ entry, user: { username: 'koldKat' } });
  assert.match(html, /class="community-rating"[\s\S]*4\.3[\s\S]*8 ratings/);
  assert.doesNotMatch(html, /name="rating"|Your rating/);
  assert.doesNotMatch(renderGame({ entry: { ...entry, ratingAverage: 5, ratingCount: 1 } }), /Community rating/);
});

test('game page escapes text and refuses unsafe source links', () => {
  const html = renderGame({ entry: { ...entry, title: '<script>alert(1)</script>', pegiUrl: 'javascript:alert(1)' } });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /property="og:image" content="https:\/\/gamekat\.net\/covers\/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\.jpg"/);
  assert.match(html, /class="community-rating"[\s\S]*4\.3[\s\S]*8 ratings/);
  assert.equal(safeExternalUrl('http://example.com'), '');
});

test('dynamic sitemap includes only entries supplied by the public store', () => {
  const xml = sitemapXml([{ slug: 'portal-2-steam', updatedAt: '2026-08-27 12:00:00' }], '2026-08-28');
  assert.match(xml, /https:\/\/gamekat\.net\/catalogue/);
  assert.match(xml, /https:\/\/gamekat\.net\/game\/portal-2-steam/);
  assert.match(xml, /<lastmod>2026-08-27<\/lastmod>/);
});
