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
  assert.match(html, /<link rel="canonical" href="https:\/\/gamekat\.net\/katalog">/);
  assert.match(html, /Portal 2/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /class="catalogue-results"/);
  assert.match(html, /class="hero catalogue-hero"/);
  assert.match(html, /class="hero-art catalogue-hero-art"/);
  assert.match(html, /class="hero-cover catalogue-hero-cover hero-cover-3 has-art"/);
  assert.match(html, /class="auth-cover-field app-cover-field"/);
  assert.match(html, /<img src="\/covers\/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\.jpg" alt="" decoding="async">/);
  assert.match(html, /Discover enriched releases and add them to your private library\.<\/p>/);
  assert.doesNotMatch(html, /without entering everything again/);
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
  assert.match(html, /<dialog class="catalogue-game-dialog" data-catalogue-game-dialog open/);
  assert.match(html, /class="close-button" data-catalogue-game-close/);
  assert.match(html, /<section class="hero catalogue-hero">[\s\S]*<h2>The public Kat·a·log<\/h2>/);
  assert.match(html, /property="og:type" content="video\.game"/);
  assert.match(html, /property="og:image:alt" content="Portal 2 cover"/);
  assert.match(html, /"@type":"AggregateRating"/);
  assert.doesNotMatch(html, /name="rating"|Your rating/);
  assert.doesNotMatch(renderGame({ entry: { ...entry, ratingAverage: 5, ratingCount: 1 } }), /Community rating/);
});

test('a signed-in user with the release already in their library cannot add it again', () => {
  const html = renderGame({ entry, user: { username: 'koldKat' }, libraryGame: { id: 9, title: entry.title, platform: entry.platform } });
  assert.match(html, /Already in your Kat·a·log/);
  assert.match(html, /Open my Kat·a·log/);
  assert.match(html, /data-catalogue-destination="library"/);
  assert.doesNotMatch(html, /data-catalogue-add/);
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

test('dynamic sitemap uses the plain Gamebooks-style URL-set for each public release', () => {
  const xml = sitemapXml([{ slug: 'portal-2-steam', title: 'Portal 2', coverUrl: '/covers/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg', updatedAt: '2026-08-27 12:00:00' }], '2026-08-28');
  assert.match(xml, /https:\/\/gamekat\.net\/katalog/);
  assert.match(xml, /https:\/\/gamekat\.net\/game\/portal-2-steam/);
  assert.match(xml, /<lastmod>2026-08-27<\/lastmod>/);
  assert.doesNotMatch(xml, /xmlns:image|<image:/);
  assert.match(xml, /<priority>0\.8<\/priority>\n  <\/url>/);
});
