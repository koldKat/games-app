const test = require('node:test');
const assert = require('node:assert/strict');

const { renderKatalog, renderGame, renderSignal, safeExternalUrl, sitemapXml } = require('../server/katalog-pages');

const entry = {
  id: 3, slug: 'portal-2-steam', title: 'Portal 2', platform: 'Steam', pegi: 12,
  publisher: 'Valve', releaseYear: 2011, coverUrl: '/covers/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
  ratingAverage: 4.25, ratingCount: 8,
  pegiDescriptors: ['Violence'], pegiAdvice: 'Mild <action>', pegiOutline: '', pegiContentIssues: '', pegiOtherIssues: '',
  pegiUrl: 'https://pegi.info/portal-2', hltbUrl: 'https://howlongtobeat.com/game/2',
  hltbMainStory: 8, hltbMainExtra: 13, hltbCompletionist: 21, hltbAllStyles: 12,
};

test('catalogue page is crawlable server-rendered HTML', () => {
  const html = renderKatalog({ result: { entries: [entry], total: 1, page: 1, pages: 1 }, platforms: [{ platform: 'Steam', count: 1 }] });
  assert.match(html, /<link rel="canonical" href="https:\/\/gamekat\.net\/katalog">/);
  assert.match(html, /Portal 2/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /class="katalog-results"/);
  assert.match(html, /class="katalog-title" data-katalog-title data-full-title="Portal 2"/);
  assert.match(html, /class="hero katalog-hero"/);
  assert.match(html, /<h1>Public Kat·a·log<\/h1>/);
  assert.match(html, /class="hero-art katalog-hero-art"/);
  assert.match(html, /class="hero-cover katalog-hero-cover hero-cover-3 has-art"/);
  assert.match(html, /class="auth-cover-field app-cover-field"/);
  assert.match(html, /<i class="has-art"><img src="\/covers\/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\.jpg" alt="" decoding="async"><\/i>/);
  assert.doesNotMatch(html, /style="background-image:/);
  assert.match(html, /data-app-version/);
  assert.match(html, /src="\/js\/site-header\.js"/);
  assert.match(html, /<img src="\/covers\/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\.jpg" alt="" decoding="async">/);
  assert.match(html, /Discover enriched releases and add them to your private library\.<\/p>/);
  assert.doesNotMatch(html, /without entering everything again/);
  assert.match(html, /name="robots" content="index, follow, max-image-preview:large"/);
  assert.doesNotMatch(html, /submittedByUserId|sourceGameId|ownership|notes/);
  assert.match(html, /class="community-rating"[\s\S]*4\.3[\s\S]*8 ratings/);
});

test('catalogue cards summarize platform variants and release dialogs expose each edition', () => {
  const releases = [entry, { ...entry, id: 4, slug: 'portal-2-ps5', platform: 'PlayStation 5' }];
  const catalogue = renderKatalog({ result: { entries: [{ ...entry, releases, releaseCount: 2 }], total: 1, page: 1, pages: 1 }, platforms: [] });
  assert.match(catalogue, /data-platform-theme="Steam">Steam<\/span><i>·<\/i><span[^>]*data-platform-theme="PlayStation 5">PlayStation 5<\/span>/);
  assert.doesNotMatch(catalogue, /2 platforms/);
  const detail = renderGame({ entry: { ...entry, releases, releaseCount: 2 } });
  assert.match(detail, /PLATFORM RELEASES/);
  assert.match(detail, /portal-2-ps5/);
});

test('signed-in catalogue cards mark grouped titles with an owned release', () => {
  const releases = [entry, { ...entry, id: 4, slug: 'portal-2-ps5', platform: 'PlayStation 5' }];
  const html = renderKatalog({
    result: { entries: [{ ...entry, releases, releaseCount: 2 }], total: 1, page: 1, pages: 1 },
    platforms: [], user: { username: 'collector' },
    libraryGames: new Map([[4, { id: 19, ownership: 'owned', platform: 'PlayStation 5' }]]),
  });
  assert.match(html, /class="katalog-library-pill">Owned<\/span>/);
  assert.equal((html.match(/katalog-library-pill/g) || []).length, 1);
});

test('public game details separate searchable IGDB genres and themes', () => {
  const html = renderGame({ entry: { ...entry, igdbId: 411, igdbGenres: ['Puzzle'], igdbThemes: ['Science fiction'] } });
  assert.match(html, /class="game-metadata-stack"[\s\S]*PLAYTIME \/\/ HLTB[\s\S]*DATABASE \/\/ IGDB[\s\S]*class="metadata-panel pegi-metadata"/);
  assert.match(html, /<strong>Genres<\/strong>[\s\S]*metadata-filter-chip--genre[^>]*href="\/katalog\?q=Puzzle"[^>]*>Puzzle<\/a>/);
  assert.match(html, /<strong>Themes<\/strong>[\s\S]*metadata-filter-chip--theme[^>]*href="\/katalog\?q=Science\+fiction"[^>]*>Science fiction<\/a>/);
  assert.match(html, /"genre":\["Puzzle"\]/);
});

test('Nintendo Entertainment System names use recognizable display aliases without changing filter values', () => {
  const nes = { ...entry, platform: 'Nintendo Entertainment System' };
  const snes = { ...entry, id: 4, slug: 'portal-2-snes', platform: 'Super Nintendo Entertainment System' };
  const html = renderKatalog({
    result: { entries: [{ ...nes, releases: [nes, snes], releaseCount: 2 }], total: 1, page: 1, pages: 1 },
    platforms: [{ platform: nes.platform, count: 1 }, { platform: snes.platform, count: 1 }],
  });
  assert.match(html, /data-platform-theme="Nintendo Entertainment System">NES<\/span><i>·<\/i><span[^>]*data-platform-theme="Super Nintendo Entertainment System">SNES<\/span>/);
  assert.match(html, /value="Nintendo Entertainment System">NES \(1\)<\/option>/);
  assert.match(html, /value="Super Nintendo Entertainment System">SNES \(1\)<\/option>/);
  assert.doesNotMatch(html, />Nintendo Entertainment System · Super Nintendo Entertainment System</);
});

test('catalogue pagination uses symmetric code-style controls with descriptive labels', () => {
  const html = renderKatalog({ result: { entries: [entry], total: 30, page: 2, pages: 3 }, platforms: [] });
  assert.match(html, /aria-label="Previous page">page\.prev\(\)<\/a>/);
  assert.match(html, /aria-label="Next page">page\.next\(\)<\/a>/);
});

test('an authenticated catalogue page uses the same account-aware header vocabulary as the app', () => {
  const html = renderKatalog({
    result: { entries: [entry], total: 1, page: 1, pages: 1 }, platforms: [],
    user: { username: 'koldKat', avatarUrl: '/avatars/koldkat.jpg' },
  });
  assert.match(html, /href="\/css\/theme\.css"/);
  assert.match(html, /href="\/css\/library\.css"/);
  assert.match(html, /class="topbar"/);
  assert.match(html, /class="brand"/);
  assert.match(html, /class="brand-mark"/);
  assert.match(html, /class="top-actions"/);
  assert.match(html, /class="button account-button themed-tooltip header-tooltip"/);
  assert.match(html, /class="nav-avatar"/);
  assert.match(html, /Your collection, one place/);
  assert.match(html, /avatars\/koldkat\.jpg/);
  assert.match(html, /My Kat·a·log/);
  assert.match(html, /class="button library-button themed-tooltip header-tooltip" href="\/"[\s\S]*header-nav-label">My Kat·a·log/);
  assert.match(html, /class="button katalog-button themed-tooltip header-tooltip(?: active)?" href="\/katalog"[\s\S]*header-nav-label">Kat·a·log/);
  assert.match(html, /button-label">Game/);
  assert.match(html, /class="button signal-button themed-tooltip header-tooltip" href="\/signal"[\s\S]*header-nav-label">Signal/);
});

test('Signal is a crawlable public page that attaches to the live feed client', () => {
  const html = renderSignal({ user: { username: 'signal_user' }, progress: { level: 17, title: 'Kat·a·log Architect', xp: 153995, progress: 4, nextLevelXp: 171000 }, coverUrls: [entry.coverUrl] });
  assert.match(html, /<link rel="canonical" href="https:\/\/gamekat\.net\/signal">/);
  assert.match(html, /<h1>Kat·a·log Signal<\/h1>/);
  assert.match(html, /data-activity-feed data-activity-limit="all" data-activity-grouped="true" data-activity-layout="newspaper"/);
  assert.match(html, /src="\/js\/signal-page\.js"/);
  assert.doesNotMatch(html, /LAST 30 DAYS|Recent public activity|Personal libraries, ratings, wishlists, edits, and play status stay private/);
  assert.match(html, /id="header-progression" class="header-progression"/);
  assert.match(html, /LV 17/);
  assert.match(html, /Kat·a·log Architect/);
  assert.match(html, /<progress class="header-progression-meter" data-header-progress-meter max="100" value="4"/);
  assert.doesNotMatch(html, /data-header-progress-meter style=/);
  assert.match(html, /class="button signal-button themed-tooltip header-tooltip active" href="\/signal"[\s\S]*header-nav-label">Signal/);
  assert.match(html, /class="hero-art katalog-hero-art"/);
  assert.match(html, /class="hero-cover katalog-hero-cover hero-cover-3 has-art"/);
});

test('guest public navigation marks the current Signal or Kat·a·log section inactive', () => {
  const catalogue = renderKatalog({ result: { entries: [entry], total: 1, page: 1, pages: 1 }, platforms: [] });
  const signal = renderSignal();
  assert.match(catalogue, /class="button katalog-button themed-tooltip header-tooltip active" href="\/katalog"[\s\S]*header-nav-label">Kat·a·log/);
  assert.match(signal, /class="button signal-button themed-tooltip header-tooltip active" href="\/signal"[\s\S]*header-nav-label">Signal/);
  for (const html of [catalogue, signal]) {
    assert.match(html, /class="header-community-actions"[\s\S]*data-stats-open[\s\S]*class="header-library-actions"/);
    assert.match(html, /src="\/js\/stats-ui\.js"/);
  }
});

test('public release pages show a community aggregate but never offer a public voting control', () => {
  const html = renderGame({ entry, user: { username: 'koldKat' } });
  assert.match(html, /class="community-rating"[\s\S]*4\.3[\s\S]*8 ratings/);
  assert.match(html, /<dialog class="katalog-game-dialog" data-katalog-game-dialog open/);
  assert.match(html, /class="close-button" data-katalog-game-close/);
  assert.match(html, /<section class="hero katalog-hero">[\s\S]*<h2>Public Kat·a·log<\/h2>/);
  assert.match(html, /property="og:type" content="video\.game"/);
  assert.match(html, /property="og:image:alt" content="Portal 2 cover"/);
  assert.match(html, /"@type":"AggregateRating"/);
  assert.doesNotMatch(html, /name="rating"|Your rating/);
  assert.match(renderGame({ entry: { ...entry, ratingAverage: 5, ratingCount: 1 } }), /Community rating/);
});

test('a signed-in user with the release already in their library cannot add it again', () => {
  const html = renderGame({ entry, user: { username: 'koldKat' }, libraryGame: { id: 9, title: entry.title, platform: entry.platform, ownership: 'owned' } });
  assert.match(html, /Owned in your Kat·a·log/);
  assert.match(html, /Open my Kat·a·log/);
  assert.match(html, /data-katalog-destination="library-game" data-library-game-id="9" href="\/\?game=9"/);
  assert.doesNotMatch(html, /data-katalog-add/);
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
  assert.match(xml, /https:\/\/gamekat\.net\/signal/);
  assert.match(xml, /https:\/\/gamekat\.net\/game\/portal-2-steam/);
  assert.match(xml, /<lastmod>2026-08-27<\/lastmod>/);
  assert.doesNotMatch(xml, /xmlns:image|<image:/);
  assert.match(xml, /<priority>0\.8<\/priority>\n  <\/url>/);
});
