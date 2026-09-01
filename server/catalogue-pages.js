'use strict';

const { readVersion } = require('./version');

const SITE_URL = 'https://gamekat.net';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function safeExternalUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch { return ''; }
}

function avatarMarkup(user) {
  const initial = escapeHtml(String(user?.username || '?').trim().slice(0, 1).toLocaleUpperCase() || '?');
  return user?.avatarUrl
    ? `<img src="${escapeHtml(user.avatarUrl)}" alt="">`
    : `<span>${initial}</span>`;
}

function headerProgression(progress) {
  if (!progress) return '';
  const remaining = Math.max(0, Number(progress.nextLevelXp || 0) - Number(progress.xp || 0));
  const next = Number(progress.level) >= 100 ? 'Maximum level reached' : `${remaining.toLocaleString()} XP to LV ${Number(progress.level) + 1}`;
  const percent = Math.max(0, Math.min(100, Number(progress.progress) || 0));
  return `<section id="header-progression" class="header-progression" aria-live="polite"><div><span data-header-progress-level>LV ${escapeHtml(progress.level)}</span><b data-header-progress-title>${escapeHtml(progress.title)}</b><small data-header-progress-xp>${escapeHtml(Number(progress.xp || 0).toLocaleString())} XP</small></div><progress class="header-progression-meter" data-header-progress-meter max="100" value="${percent}" aria-label="Progress to next level"></progress><small data-header-progress-next>${escapeHtml(next)}</small></section>`;
}

function navIcon(kind) {
  const paths = {
    signal: '<circle cx="12" cy="12" r="1.5"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9.2 9.2 0 0 0 0 13M18.5 5.5a9.2 9.2 0 0 1 0 13"/>',
    forum: '<path d="M4 5h16v11H10l-5 4v-4H4V5Z"/><path d="M8 10h8M8 13h5"/>',
    catalogue: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
    library: '<path d="M4 11.5 12 4l8 7.5V20H5v-8.5Z"/><path d="M10 20v-5h4v5"/>',
  };
  return `<svg class="header-nav-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[kind]}</svg>`;
}
function headerNav(kind, label, href, active = false) { return `<a class="button ${kind}-button${active ? ' active' : ''}" href="${href}">${navIcon(kind)}<span class="header-nav-label">${label}</span></a>`; }

function headerActions(user, progress = null, currentView = '') {
  if (!user) return `<div class="top-actions">${headerNav('signal', 'Signal', '/signal', currentView === 'signal')}${headerNav('forum', 'Forum', '/forum', currentView === 'forum')}${headerNav('catalogue', 'Kat·a·log', '/katalog', currentView === 'catalogue')}<button class="button patch-button" type="button" data-patch-open>Patch</button><a class="button primary" href="/">Sign in</a></div>`;
  return `<div class="top-actions">
    <div class="header-community-actions">
    ${headerNav('signal', 'Signal', '/signal', currentView === 'signal')}
    ${headerNav('forum', 'Forum', '/forum', currentView === 'forum')}
    <button class="button patch-button" type="button" data-patch-open>Patch</button>
    <button class="button ping-button" type="button" data-ping-open>Ping <b class="ping-badge" data-ping-badge hidden></b></button>
    </div>
    ${headerProgression(progress)}
    <div class="header-library-actions">
    ${headerNav('catalogue', 'Kat·a·log', '/katalog', currentView === 'catalogue')}
    ${headerNav('library', 'My Kat·a·log', '/', currentView === 'library')}
    <a class="button primary desktop-add" href="/"><span class="button-icon" aria-hidden="true">+</span><span class="button-label">Game</span></a>
    <a class="button account-button" href="/" aria-label="Open ${escapeHtml(user.username)}'s library"><span class="nav-avatar">${avatarMarkup(user)}</span><span id="account-name">${escapeHtml(user.username)}</span></a>
    </div>
  </div>`;
}

function decorativeCoverField(coverUrls = []) {
  const covers = coverUrls.filter(value => /^\/covers\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(value || '')));
  const slots = Array.from({ length: 32 }, (_, index) => {
    const cover = covers.length ? covers[index % covers.length] : '';
    return cover ? `<i class="has-art" style="background-image:${escapeHtml(`url(${JSON.stringify(cover)})`)}"></i>` : '<i></i>';
  }).join('');
  return `<div class="auth-cover-field app-cover-field" aria-hidden="true">${slots}</div>`;
}

function pageShell({ title, description, canonical, content, structuredData, user = null, progress = null, coverUrls = [], socialImage = `${SITE_URL}/social-preview.png`, socialImageAlt = 'Game Kat·a·log', socialType = 'website', currentView = '', extraStyles = '', extraScripts = '' }) {
  const currentYear = new Date().getFullYear();
  const copyright = currentYear > 2026 ? `© 2026-${currentYear}` : '© 2026';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#080b10">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="${escapeHtml(socialType)}">
  <meta property="og:site_name" content="Game Kat·a·log">
  <meta property="og:locale" content="en_US">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(socialImage)}">
  <meta property="og:image:alt" content="${escapeHtml(socialImageAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(socialImage)}">
  <meta name="twitter:image:alt" content="${escapeHtml(socialImageAlt)}">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/css/foundation.css">
  <link rel="stylesheet" href="/css/theme.css">
  <link rel="stylesheet" href="/css/library.css">
  <link rel="stylesheet" href="/css/landing.css">
  <link rel="stylesheet" href="/css/features.css">
  <link rel="stylesheet" href="/css/activity.css">
  <link rel="stylesheet" href="/css/patch.css">
  <link rel="stylesheet" href="/css/catalogue.css">
  ${extraStyles}
  <script type="application/ld+json">${jsonLd(structuredData)}</script>
</head>
<body class="catalogue-document" data-signed-in="${user ? 'true' : 'false'}">
  <div class="shell catalogue-shell">
    ${decorativeCoverField(coverUrls)}
    <header class="topbar">
      <a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span><span><strong>Game Kat·a·log <em>${escapeHtml(readVersion())}</em></strong><small>Your collection, one place</small></span></a>
      ${headerActions(user, progress, currentView || (canonical === `${SITE_URL}/signal` ? 'signal' : canonical === `${SITE_URL}/katalog` || canonical.includes('/game/') ? 'catalogue' : 'library'))}
    </header>
    ${content}
    <footer class="app-footer" aria-label="Site footer"><span><span class="app-footer-brand">koldKat productions</span> <span>${copyright}</span></span><span>GAMEKAT.NET // GAME KAT·A·LOG</span><a href="/docs/user-guide.html">USER GUIDE</a></footer>
  </div>
  <script type="module" src="/js/catalogue-public.js"></script>
  <script type="module" src="/js/patch-page.js"></script>
  ${canonical === `${SITE_URL}/signal` ? '<script type="module" src="/js/signal-page.js"></script>' : ''}
  ${extraScripts}
</body>
</html>`;
}

function queryHref({ q = '', platform = '', page = 1 }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (platform) params.set('platform', platform);
  if (page > 1) params.set('page', String(page));
  return `/katalog${params.size ? `?${params}` : ''}`;
}

function heroCoverDeck(coverUrls = []) {
  const covers = coverUrls.filter(value => /^\/covers\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(value || '')));
  if (!covers.length) return '';
  return `<div class="hero-art catalogue-hero-art" aria-hidden="true">${Array.from({ length: 5 }, (_, index) => {
    const cover = covers[index % covers.length];
    return `<span class="hero-cover catalogue-hero-cover hero-cover-${index + 1} has-art"><img src="${escapeHtml(cover)}" alt="" decoding="async"></span>`;
  }).join('')}</div>`;
}

function renderCatalogueMain({ result, platforms, query = '', platform = '', detail = '' }) {
  const heroTitle = detail ? '<h2>The public Kat·a·log</h2>' : '<h1>The public Kat·a·log</h1>';
  const cards = result.entries.map(entry => `<article class="catalogue-card">
    <a class="catalogue-cover" href="/game/${encodeURIComponent(entry.slug)}"><img src="${escapeHtml(entry.coverUrl)}" alt="${escapeHtml(`${entry.title} cover`)}" loading="lazy">${communityRating(entry)}</a>
    <div class="catalogue-card-body"><span class="catalogue-platform">${escapeHtml(entry.platform)}</span><h2><a href="/game/${encodeURIComponent(entry.slug)}">${escapeHtml(entry.title)}</a></h2>
      <p>${escapeHtml([entry.publisher, entry.releaseYear].filter(Boolean).join(' · ') || 'Release details pending')}</p>
      <div class="catalogue-chips"><span class="pegi pegi-${entry.pegi || 'none'}">PEGI ${entry.pegi || '//'}</span>${entry.hltbMainStory ? `<span>${escapeHtml(entry.hltbMainStory)}h main</span>` : ''}</div>
    </div>
  </article>`).join('');
  const platformOptions = platforms.map(item => `<option value="${escapeHtml(item.platform)}"${item.platform === platform ? ' selected' : ''}>${escapeHtml(item.platform)} (${item.count})</option>`).join('');
  const pagination = result.pages > 1 ? `<nav class="catalogue-pagination" aria-label="Kat·a·log pages">
    ${result.page > 1 ? `<a href="${escapeHtml(queryHref({ q: query, platform, page: result.page - 1 }))}">← Previous</a>` : '<span></span>'}
    <span>Page ${result.page} of ${result.pages}</span>
    ${result.page < result.pages ? `<a href="${escapeHtml(queryHref({ q: query, platform, page: result.page + 1 }))}">Next →</a>` : '<span></span>'}
  </nav>` : '';
  return `<main class="catalogue-main"><section class="hero catalogue-hero"><div><p class="kicker">SHARED // GROWING</p>${heroTitle}<p class="hero-copy">Discover enriched releases and add them to your private library.</p></div>${heroCoverDeck(result.entries.map(entry => entry.coverUrl))}</section>
      <form class="catalogue-search" action="/katalog" method="get"><label><span>Search Kat·a·log</span><input type="search" name="q" value="${escapeHtml(query)}" placeholder="Title, publisher, or platform" maxlength="120"></label><label><span>Platform</span><select name="platform"><option value="">All platforms</option>${platformOptions}</select></label><button type="submit">Search</button></form>
      <div class="catalogue-results"><div class="catalogue-result-head"><strong>${result.total.toLocaleString()} public release${result.total === 1 ? '' : 's'}</strong>${query || platform ? `<a href="/katalog">Clear search</a>` : ''}</div>
      <section class="catalogue-grid">${cards || '<div class="catalogue-empty"><strong>No matching releases.</strong><span>The Kat·a·log grows as members enrich their private libraries.</span></div>'}</section>${pagination}</div>${detail}</main>`;
}

function renderCatalogue({ result, platforms, query = '', platform = '', user = null, progress = null }) {
  const description = 'Browse the public Game Kat·a·log, inspect platform releases, PEGI ratings, cover art, and HowLongToBeat estimates.';
  return pageShell({
    title: 'Public Kat·a·log // Game Kat·a·log', description, canonical: `${SITE_URL}/katalog`, user, progress, coverUrls: result.entries.map(entry => entry.coverUrl),
    structuredData: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Game Kat·a·log Public Kat·a·log', url: `${SITE_URL}/katalog`, numberOfItems: result.total },
    content: renderCatalogueMain({ result, platforms, query, platform }),
  });
}

function renderSignal({ user = null, progress = null, coverUrls = [] } = {}) {
  const description = 'Follow public-safe Game Kat·a·log activity: new curators, collector level-ups, and public catalogue contributions.';
  return pageShell({
    title: 'Kat·a·log Signal // Game Kat·a·log', description, canonical: `${SITE_URL}/signal`, user, progress,
    structuredData: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Game Kat·a·log Signal', url: `${SITE_URL}/signal`, description },
    content: `<main class="catalogue-main signal-main"><section class="hero catalogue-hero signal-hero"><div><p class="kicker">PUBLIC // LIVE</p><h1>Kat·a·log Signal</h1><p class="hero-copy">A public pulse of new curators, collector level-ups, and games that joined the shared Kat·a·log.</p></div>${heroCoverDeck(coverUrls)}</section><section class="signal-feed-panel"><header><span class="kicker">LAST 30 DAYS</span><h2>Recent public activity</h2><p>Personal libraries, ratings, wishlists, edits, and play status stay private.</p></header><div class="activity-feed signal-feed" data-activity-feed data-activity-limit="all" data-activity-grouped="true" aria-live="polite"><p class="activity-feed-empty">Tuning the signal…</p></div></section></main>`,
  });
}

function hours(label, value) {
  return value ? `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}h</strong></div>` : '';
}

function communityRating(entry) {
  const count = Number(entry.ratingCount) || 0;
  const average = Number(entry.ratingAverage);
  if (count < 1 || !Number.isFinite(average)) return '';
  const stars = Array.from({ length: 5 }, (_, index) => {
    const position = index + 1;
    return `<i class="rating-star ${average >= position ? 'on' : average >= position - 0.5 ? 'half' : ''}" aria-hidden="true">★</i>`;
  }).join('');
  return `<span class="community-rating" aria-label="Community rating ${average.toFixed(1)} out of 5 from ${count} ratings"><span class="rating-stars">${stars}</span><b>${average.toFixed(1)}</b><small>${count} ratings</small></span>`;
}

function renderGame({ entry, result = { entries: [], total: 0, page: 1, pages: 1 }, platforms = [], user = null, progress = null, libraryGame = null }) {
  const ratingLabel = entry.pegi ? `PEGI ${entry.pegi}` : 'unrated';
  const description = entry.description || `${entry.title} for ${entry.platform}: ${ratingLabel} information, cover art, publisher details, and HowLongToBeat estimates.`;
  const canonical = `${SITE_URL}/game/${encodeURIComponent(entry.slug)}`;
  const addPanel = user && libraryGame
    ? `<aside class="catalogue-add catalogue-added"><div><strong>Already in your Kat·a·log</strong><span>${escapeHtml(libraryGame.platform || entry.platform)} · ${escapeHtml(libraryGame.title || entry.title)}</span></div><a data-catalogue-destination="library" href="/">Open my Kat·a·log</a></aside>`
    : user
    ? `<form class="catalogue-add" data-catalogue-add="${entry.id}"><div><strong>Add this release</strong><span>Personal tracking stays private.</span></div><label><span>Collection</span><select name="ownership"><option value="owned">Owned</option><option value="wanted">Wishlisted</option></select></label><label><span>Format</span><select name="mediaFormat"><option value="physical">Physical</option><option value="digital">Digital</option><option value="unknown">Unknown</option></select></label><button type="submit">Add to my Kat·a·log</button><p data-add-message role="status" aria-live="polite"></p></form>`
    : `<aside class="catalogue-signin"><strong>Keep this game in your library.</strong><span>Create an account or sign in to add it with one click.</span><a href="/">Sign in to Game Kat·a·log</a></aside>`;
  const pegiDetails = [
    ['Consumer advice', entry.pegiAdvice], ['Brief outline', entry.pegiOutline],
    ['Content-specific issues', entry.pegiContentIssues], ['Other issues', entry.pegiOtherIssues],
  ].filter(([, value]) => value).map(([label, value]) => `<section><h3>${escapeHtml(label)}</h3><p>${escapeHtml(value)}</p></section>`).join('');
  const hltbUrl = safeExternalUrl(entry.hltbUrl);
  const pegiUrl = safeExternalUrl(entry.pegiUrl);
  const descriptionUrl = safeExternalUrl(entry.descriptionSourceUrl);
  const descriptionPanel = entry.description ? `<article class="game-description"><header><span>OVERVIEW // ${escapeHtml(entry.descriptionSource || 'SOURCE')}</span><h2>About this game</h2></header><p>${escapeHtml(entry.description)}</p>${descriptionUrl ? `<a href="${escapeHtml(descriptionUrl)}" target="_blank" rel="noopener noreferrer">View description source ↗</a>` : ''}</article>` : '';
  return pageShell({
    title: `${entry.title} (${entry.platform}) // Game Kat·a·log`, description, canonical, user, progress, coverUrls: [entry.coverUrl, ...result.entries.map(item => item.coverUrl)],
    socialImage: `${SITE_URL}${entry.coverUrl}`, socialImageAlt: `${entry.title} cover`, socialType: 'video.game',
    structuredData: { '@context': 'https://schema.org', '@type': 'VideoGame', name: entry.title, gamePlatform: entry.platform,
      contentRating: entry.pegi ? `PEGI ${entry.pegi}` : undefined, image: `${SITE_URL}${entry.coverUrl}`, url: canonical,
      description: entry.description || undefined, datePublished: entry.releaseYear ? `${entry.releaseYear}-01-01` : undefined,
      aggregateRating: Number(entry.ratingCount) >= 1 ? { '@type': 'AggregateRating', ratingValue: Number(entry.ratingAverage).toFixed(1), ratingCount: Number(entry.ratingCount), bestRating: 5, worstRating: 0.5 } : undefined,
      publisher: entry.publisher ? { '@type': 'Organization', name: entry.publisher } : undefined },
    content: renderCatalogueMain({ result, platforms, detail: `<dialog class="catalogue-game-dialog" data-catalogue-game-dialog open aria-label="${escapeHtml(`${entry.title} details`)}"><article class="catalogue-game-dialog-card"><header><span>PUBLIC RELEASE</span><button type="button" class="close-button" data-catalogue-game-close aria-label="Close game details">×</button></header><div class="game-detail"><article class="game-overview"><div class="game-cover"><img src="${escapeHtml(entry.coverUrl)}" alt="${escapeHtml(`${entry.title} cover`)}"></div><div class="game-summary"><p>${escapeHtml(entry.platform)}</p><h1>${escapeHtml(entry.title)}</h1><div class="catalogue-chips"><span class="pegi pegi-${entry.pegi || 'none'}">${escapeHtml(ratingLabel)}</span>${communityRating(entry)}${entry.releaseYear ? `<span>${entry.releaseYear}</span>` : ''}${entry.publisher ? `<span>${escapeHtml(entry.publisher)}</span>` : ''}</div>${addPanel}${descriptionPanel}</div></article>
      <section class="game-metadata"><article><header><span>PLAYTIME // HLTB</span><h2>How long it takes</h2></header><div class="time-grid">${hours('Main story', entry.hltbMainStory)}${hours('Main + sides', entry.hltbMainExtra)}${hours('Completionist', entry.hltbCompletionist)}${hours('All styles', entry.hltbAllStyles)}</div>${hltbUrl ? `<a href="${escapeHtml(hltbUrl)}" target="_blank" rel="noopener noreferrer">View source on HowLongToBeat ↗</a>` : ''}</article>
      <article><header><span>CONTENT // PEGI</span><h2>Rating information</h2></header>${entry.pegiDescriptors.length ? `<div class="descriptor-list">${entry.pegiDescriptors.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}${pegiDetails}${pegiUrl ? `<a href="${escapeHtml(pegiUrl)}" target="_blank" rel="noopener noreferrer">View source on PEGI ↗</a>` : ''}</article></section></div></article></dialog>` }),
  });
}

function renderNotFound() {
  return pageShell({
    title: 'Game not found // Game Kat·a·log', description: 'The requested catalogue release could not be found.',
    canonical: `${SITE_URL}/katalog`, structuredData: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Game not found' },
    content: '<main class="catalogue-main"><div class="catalogue-empty"><strong>That release is not public.</strong><a href="/katalog">Browse the Kat·a·log</a></div></main>',
  });
}

function sitemapXml(entries, today = new Date().toISOString().slice(0, 10), forumThreads = []) {
  const urls = [
    [`${SITE_URL}/`, 'weekly', '1.0', today],
    [`${SITE_URL}/katalog`, 'daily', '0.9', today],
    [`${SITE_URL}/signal`, 'daily', '0.6', today],
    [`${SITE_URL}/forum`, 'daily', '0.7', today],
    [`${SITE_URL}/docs/user-guide.html`, 'monthly', '0.5', today],
    ...entries.map(entry => [`${SITE_URL}/game/${encodeURIComponent(entry.slug)}`, 'monthly', '0.8', String(entry.updatedAt || today).slice(0, 10)]),
    ...forumThreads.map(thread => [`${SITE_URL}/forum/thread/${Number(thread.id)}`, 'weekly', '0.5', String(thread.lastPostAt || today).slice(0, 10)]),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([url, frequency, priority, lastmod]) => `  <url>\n    <loc>${escapeHtml(url)}</loc>\n    <lastmod>${escapeHtml(lastmod)}</lastmod>\n    <changefreq>${frequency}</changefreq>\n    <priority>${priority}</priority>\n  </url>`).join('\n')}\n</urlset>`;
}

module.exports = { SITE_URL, escapeHtml, pageShell, renderCatalogue, renderGame, renderNotFound, renderSignal, safeExternalUrl, sitemapXml };
