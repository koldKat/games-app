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

function headerActions(user) {
  if (!user) return `<div class="top-actions"><a class="button primary" href="/">Sign in</a></div>`;
  return `<div class="top-actions">
    <a class="button catalogue-button" data-catalogue-destination="library" href="/">My Kat·a·log</a>
    <a class="button account-button" href="/" aria-label="Open ${escapeHtml(user.username)}'s library"><span class="nav-avatar">${avatarMarkup(user)}</span><span id="account-name">${escapeHtml(user.username)}</span></a>
    <a class="button primary desktop-add" href="/"><span class="button-icon" aria-hidden="true">＋</span><span class="button-label">Add a game</span></a>
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

function pageShell({ title, description, canonical, content, structuredData, user = null, coverUrls = [], socialImage = `${SITE_URL}/social-preview.png`, socialImageAlt = 'Game Kat·a·log', socialType = 'website' }) {
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
  <meta property="og:locale" content="en_GB">
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
  <link rel="stylesheet" href="/css/landing.css">
  <link rel="stylesheet" href="/css/features.css">
  <link rel="stylesheet" href="/css/catalogue.css">
  <script type="application/ld+json">${jsonLd(structuredData)}</script>
</head>
<body class="catalogue-document" data-signed-in="${user ? 'true' : 'false'}">
  <div class="shell catalogue-shell">
    ${decorativeCoverField(coverUrls)}
    <header class="topbar">
      <a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span><span><strong>Game Kat·a·log <em>${escapeHtml(readVersion())}</em></strong><small>Your collection, one place</small></span></a>
      ${headerActions(user)}
    </header>
    ${content}
    <footer class="catalogue-footer"><span>GAMEKAT.NET // GAME KAT·A·LOG</span><a href="/docs/user-guide.html">USER GUIDE</a></footer>
  </div>
  <script type="module" src="/js/catalogue-public.js"></script>
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
    <a class="catalogue-cover" href="/game/${encodeURIComponent(entry.slug)}"><img src="${escapeHtml(entry.coverUrl)}" alt="${escapeHtml(`${entry.title} cover`)}" loading="lazy"></a>
    <div class="catalogue-card-body"><span class="catalogue-platform">${escapeHtml(entry.platform)}</span><h2><a href="/game/${encodeURIComponent(entry.slug)}">${escapeHtml(entry.title)}</a></h2>
      <p>${escapeHtml([entry.publisher, entry.releaseYear].filter(Boolean).join(' · ') || 'Release details pending')}</p>
      <div class="catalogue-chips"><span class="pegi pegi-${entry.pegi || 'none'}">PEGI ${entry.pegi || '—'}</span>${communityRating(entry)}${entry.hltbMainStory ? `<span>${escapeHtml(entry.hltbMainStory)}h main</span>` : ''}</div>
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

function renderCatalogue({ result, platforms, query = '', platform = '', user = null }) {
  const description = 'Browse the public Game Kat·a·log, inspect platform releases, PEGI ratings, cover art, and HowLongToBeat estimates.';
  return pageShell({
    title: 'Public Kat·a·log | Game Kat·a·log', description, canonical: `${SITE_URL}/katalog`, user, coverUrls: result.entries.map(entry => entry.coverUrl),
    structuredData: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Game Kat·a·log Public Kat·a·log', url: `${SITE_URL}/katalog`, numberOfItems: result.total },
    content: renderCatalogueMain({ result, platforms, query, platform }),
  });
}

function hours(label, value) {
  return value ? `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}h</strong></div>` : '';
}

function communityRating(entry) {
  const count = Number(entry.ratingCount) || 0;
  const average = Number(entry.ratingAverage);
  if (count < 2 || !Number.isFinite(average)) return '';
  const stars = Array.from({ length: 5 }, (_, index) => {
    const position = index + 1;
    return `<i class="rating-star ${average >= position ? 'on' : average >= position - 0.5 ? 'half' : ''}" aria-hidden="true">★</i>`;
  }).join('');
  return `<span class="community-rating" aria-label="Community rating ${average.toFixed(1)} out of 5 from ${count} ratings"><span class="rating-stars">${stars}</span><b>${average.toFixed(1)}</b><small>${count} ratings</small></span>`;
}

function renderGame({ entry, result = { entries: [], total: 0, page: 1, pages: 1 }, platforms = [], user = null, libraryGame = null }) {
  const description = entry.description || `${entry.title} for ${entry.platform}: PEGI ${entry.pegi || 'unrated'} information, cover art, publisher details, and HowLongToBeat estimates.`;
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
    title: `${entry.title} (${entry.platform}) | Game Kat·a·log`, description, canonical, user, coverUrls: [entry.coverUrl, ...result.entries.map(item => item.coverUrl)],
    socialImage: `${SITE_URL}${entry.coverUrl}`, socialImageAlt: `${entry.title} cover`, socialType: 'video.game',
    structuredData: { '@context': 'https://schema.org', '@type': 'VideoGame', name: entry.title, gamePlatform: entry.platform,
      contentRating: entry.pegi ? `PEGI ${entry.pegi}` : undefined, image: `${SITE_URL}${entry.coverUrl}`, url: canonical,
      description: entry.description || undefined, datePublished: entry.releaseYear ? `${entry.releaseYear}-01-01` : undefined,
      aggregateRating: Number(entry.ratingCount) >= 2 ? { '@type': 'AggregateRating', ratingValue: Number(entry.ratingAverage).toFixed(1), ratingCount: Number(entry.ratingCount), bestRating: 5, worstRating: 0.5 } : undefined,
      publisher: entry.publisher ? { '@type': 'Organization', name: entry.publisher } : undefined },
    content: renderCatalogueMain({ result, platforms, detail: `<dialog class="catalogue-game-dialog" data-catalogue-game-dialog open aria-label="${escapeHtml(`${entry.title} details`)}"><article class="catalogue-game-dialog-card"><header><span>PUBLIC RELEASE</span><button type="button" class="close-button" data-catalogue-game-close aria-label="Close game details">×</button></header><div class="game-detail"><article class="game-overview"><div class="game-cover"><img src="${escapeHtml(entry.coverUrl)}" alt="${escapeHtml(`${entry.title} cover`)}"></div><div class="game-summary"><p>${escapeHtml(entry.platform)}</p><h1>${escapeHtml(entry.title)}</h1><div class="catalogue-chips"><span class="pegi pegi-${entry.pegi || 'none'}">PEGI ${entry.pegi || '—'}</span>${communityRating(entry)}${entry.releaseYear ? `<span>${entry.releaseYear}</span>` : ''}${entry.publisher ? `<span>${escapeHtml(entry.publisher)}</span>` : ''}</div>${addPanel}${descriptionPanel}</div></article>
      <section class="game-metadata"><article><header><span>PLAYTIME // HLTB</span><h2>How long it takes</h2></header><div class="time-grid">${hours('Main story', entry.hltbMainStory)}${hours('Main + sides', entry.hltbMainExtra)}${hours('Completionist', entry.hltbCompletionist)}${hours('All styles', entry.hltbAllStyles)}</div>${hltbUrl ? `<a href="${escapeHtml(hltbUrl)}" target="_blank" rel="noopener noreferrer">View source on HowLongToBeat ↗</a>` : ''}</article>
      <article><header><span>CONTENT // PEGI</span><h2>Rating information</h2></header>${entry.pegiDescriptors.length ? `<div class="descriptor-list">${entry.pegiDescriptors.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}${pegiDetails}${pegiUrl ? `<a href="${escapeHtml(pegiUrl)}" target="_blank" rel="noopener noreferrer">View source on PEGI ↗</a>` : ''}</article></section></div></article></dialog>` }),
  });
}

function renderNotFound() {
  return pageShell({
    title: 'Game not found | Game Kat·a·log', description: 'The requested catalogue release could not be found.',
    canonical: `${SITE_URL}/katalog`, structuredData: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Game not found' },
    content: '<main class="catalogue-main"><div class="catalogue-empty"><strong>That release is not public.</strong><a href="/katalog">Browse the Kat·a·log</a></div></main>',
  });
}

function sitemapXml(entries, today = new Date().toISOString().slice(0, 10)) {
  const urls = [
    [`${SITE_URL}/`, 'weekly', '1.0', today],
    [`${SITE_URL}/katalog`, 'daily', '0.9', today],
    [`${SITE_URL}/docs/user-guide.html`, 'monthly', '0.5', today],
    ...entries.map(entry => [`${SITE_URL}/game/${encodeURIComponent(entry.slug)}`, 'monthly', '0.8', String(entry.updatedAt || today).slice(0, 10)]),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([url, frequency, priority, lastmod]) => `  <url>\n    <loc>${escapeHtml(url)}</loc>\n    <lastmod>${escapeHtml(lastmod)}</lastmod>\n    <changefreq>${frequency}</changefreq>\n    <priority>${priority}</priority>\n  </url>`).join('\n')}\n</urlset>`;
}

module.exports = { SITE_URL, escapeHtml, renderCatalogue, renderGame, renderNotFound, safeExternalUrl, sitemapXml };
