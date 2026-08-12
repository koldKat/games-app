const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const publicStylesheets = ['foundation.css', 'theme.css', 'library.css', 'landing.css', 'features.css'];
const readPublicCss = () => publicStylesheets.map(file => read(`public/css/${file}`)).join('')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').replace(/\s+/g, ' ').trim();

test('destructive actions never invoke native browser dialogs', () => {
  const sources = ['public/app.js', 'admin/js/accounts.js', 'admin/js/catalogue.js', 'admin/js/tools.js', 'admin/js/core.js'];
  const nativeDialog = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
  for (const source of sources) assert.doesNotMatch(read(source), nativeDialog, source);
});

test('public and admin interfaces include themed confirmation dialogs', () => {
  assert.match(read('public/index.html'), /id="action-dialog" class="action-dialog"/);
  assert.match(read('admin/index.html'), /id="confirm-dialog" class="confirm-dialog"/);
  assert.match(read('admin/js/core.js'), /requiredText/);
});

test('public styles are readable responsibility-based modules', () => {
  const html = read('public/index.html');
  for (const file of publicStylesheets) {
    assert.match(html, new RegExp(`<link rel="stylesheet" href="/css/${file.replace('.', '\\.')}"`));
    assert.ok(read(`public/css/${file}`).split('\n').length > 100, file);
  }
  assert.doesNotMatch(html, /href="\/style\.css"/);
  assert.equal(fs.existsSync(path.join(root, 'public/style.css')), false);
});

test('authentication landing keeps a dense real-cover background', () => {
  const html = read('public/index.html'); const application = read('public/app.js');
  assert.match(html, /class="auth-cover-field" data-cover-slots="32" aria-hidden="true"><\/div>/);
  assert.match(application, /function mountDecorativeCoverSlots\(\)/);
  assert.match(application, /document\.createElement\('i'\)/);
});

test('authenticated app matches the login account-cover background visibility', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const css = readPublicCss();
  assert.match(html, /class="auth-cover-field app-cover-field" data-cover-slots="32" aria-hidden="true"><\/div>/);
  assert.equal((html.match(/data-cover-slots="32"/g) || []).length, 2);
  assert.doesNotMatch(html, /(?:<i><\/i>){8}/);
  assert.match(application, /state\.games\.map\(game => game\.coverUrl\)/);
  assert.match(application, /#auth-screen[^\n]*hidden = true;[\s\S]*#app-shell[^\n]*hidden = false;[\s\S]*void stageAppDecorations\(user\.id\)\.catch/);
  assert.doesNotMatch(application, /state\.games = games;[^\n]*await loadHeroCovers/);
  assert.match(application, /Promise\.all\(\[loadHeroCovers\(isCurrent\), loadAppBackgroundCovers\(isCurrent\)\]\)/);
  assert.match(application, /const loaded = await Promise\.all/);
  assert.match(css, /\.app-cover-field\{[^}]*opacity:0?\.075/);
  assert.doesNotMatch(css, /\.app-cover-field i\{filter:/);
  assert.match(css, /#app-shell>\.topbar,#app-shell>main\{position:relative;z-index:1\}/);
});

test('stored sessions use a resume screen instead of flashing authentication', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const css = readPublicCss();
  assert.match(html, /games_shelf_auth_token[^<]*resuming-session/);
  assert.match(html, /id="session-resume"[^>]*role="status"/);
  assert.match(css, /\.resuming-session #auth-screen\{visibility:hidden\}/);
  assert.match(css, /\.resuming-session \.session-resume-screen\{display:grid\}/);
  assert.match(application, /function endSessionResume\(\)/);
  assert.match(application, /#app-shell'\)\.hidden = false;[\s\S]*endSessionResume\(\);/);
});

test('authenticated shell renders before library data and artwork finish', () => {
  const application = read('public/app.js');
  assert.match(application, /const dataReady = Promise\.all\(\[loadGames\(\), loadStatsAndMeta\(\)\]\);[\s\S]*#app-shell'\)\.hidden = false;[\s\S]*endSessionResume\(\);[\s\S]*await dataReady;[\s\S]*stageAppDecorations/);
  assert.doesNotMatch(application, /await Promise\.all\(\[loadGames\(\), loadStatsAndMeta\(\)\]\)[\s\S]*#app-shell'\)\.hidden = false/);
});

test('login and registration use a stable authentication frame', () => {
  const css = readPublicCss();
  assert.match(css, /\.auth-card\{height:510px\}/);
  assert.match(css, /\.auth-card \.auth-body\{height:calc\(100% - 31px\);overflow-y:auto/);
});

test('landing promo descriptions remain readable', () => {
  assert.match(readPublicCss(), /\.auth-promo p\{font-size:12px;line-height:1\.5;color:#92a0ae\}/);
});

test('common filters never move the viewport', () => {
  const application = read('public/app.js');
  assert.doesNotMatch(application, /scrollIntoView|scrollTo\s*\(/);
});

test('one data-gaps filter handles missing PEGI metadata and covers', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const database = read('server/db.js');
  assert.match(html, /id="missing-filter"[\s\S]*No PEGI info[\s\S]*No cover[\s\S]*Either missing[\s\S]*Both missing/);
  assert.doesNotMatch(html, /id="missing-(?:pegi|cover)-filter"/);
  assert.match(application, /filters\.missing\.value === 'either'/);
  assert.match(application, /filters\.missing\.value === 'both'/);
  assert.match(database, /filters\.missing === 'either'/);
  assert.match(database, /filters\.missing === 'both'/);
});

test('title autocomplete is themed and silently degrades when SteamGridDB fails', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const autocomplete = read('public/js/title-autocomplete.js'); const css = readPublicCss(); const server = read('server.js');
  assert.match(html, /id="game-title"[\s\S]*role="combobox"[\s\S]*id="title-suggestions"[^>]*role="listbox"/);
  assert.match(application, /createTitleAutocomplete/);
  assert.match(autocomplete, /api\(`\/api\/titles\/autocomplete/);
  assert.match(autocomplete, /catch \{\}/);
  assert.match(autocomplete, /\}, 100\);/);
  assert.match(server, /pathname === '\/api\/titles\/autocomplete'[\s\S]*catch \{ return sendJson\(response, 200, \{ existing, suggestions: \[\] \}\); \}/);
  assert.match(css, /\.title-suggestions\{[^}]*background:#080d12/);
  assert.match(html, /id="duplicate-warning"[\s\S]*id="open-duplicate"/);
  assert.match(autocomplete, /kind: 'existing'/);
  assert.match(autocomplete, /autocomplete\?exact=1/);
  assert.match(application, /title: 'Add another copy\?'/);
  assert.match(application, /confirmLabel: 'Add anyway'/);
  assert.match(server, /db\.searchGameTitles\(user\.id, query\)/);
  assert.match(server, /db\.findDuplicateGames\(user\.id, query/);
});

test('cover processing uses compact text with a themed detail tooltip', () => {
  const application = read('public/app.js'); const css = readPublicCss();
  assert.match(application, /Scanning \$\{job\.processed\.toLocaleString\(\)\}\/\$\{job\.total\.toLocaleString\(\)\}/);
  assert.match(application, /element\.dataset\.tooltip = detail/);
  assert.match(css, /\.bulk-status:after\{content:attr\(data-tooltip\)/);
});

test('batch updates use authenticated SSE and patch individual cards', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const stream = read('public/js/events.js'); const server = read('server.js');
  assert.match(html, /id="pegi-bulk-start"[\s\S]*Fill PEGI details/);
  assert.match(stream, /Authorization: `Bearer \$\{token\}`/);
  assert.match(stream, /headers\['Last-Event-ID'\] = lastEventId/);
  assert.match(server, /X-Accel-Buffering|events\.subscribe/);
  assert.match(application, /event === 'game-updated'\) applyGamePatch\(data\.game\)/);
  assert.match(application, /existingCard\?\.remove\(\)/);
  assert.match(application, /pendingGamePatches\.set\(game\.id, game\)/);
  assert.match(application, /renderGames\(\); flushPendingGamePatches\(\)/);
  assert.match(application, /sequence !== gameLoadSequence \|\| state\.user\?\.id !== userId/);
  assert.match(application, /localStorage\.getItem\(TOKEN_KEY\) === token/);
});

test('the product wordmark uses middle dots and no header cat artwork', () => {
  const html = read('public/index.html'); const css = readPublicCss();
  assert.match(html, /Game Kat·a·log/);
  assert.doesNotMatch(html, /header-kat|header-kat\.svg/);
  assert.doesNotMatch(css, /\.header-kat/);
});

test('generated documentation highlights the section currently in view', () => {
  const generator = read('scripts/generate-docs.js');
  assert.match(generator, /\.toc a\.active/);
  assert.match(generator, /aria-current/);
  assert.match(generator, /getBoundingClientRect\(\)\.top<=72/);
});

test('rich PEGI metadata is shown with themed progressive disclosure', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const css = readPublicCss();
  assert.match(html, /id="game-pegi-details" class="game-pegi-details"/);
  assert.match(html, /Advice for consumers[\s\S]*Brief outline[\s\S]*Content-specific issues[\s\S]*Other issues/);
  assert.match(application, /pegiDescriptors[\s\S]*pegiReleases[\s\S]*pegiAdvice[\s\S]*pegiOutline/);
  assert.match(application, /Purchase warning|purchase-warning/);
  assert.match(css, /summary::-webkit-details-marker\{display:none\}/);
  assert.match(application, /const source = game \|\| \{\}/);
});

test('dialogs stay inside the viewport and scrollbars are themed', () => {
  const publicCss = readPublicCss(); const adminCss = read('admin/style.css');
  assert.match(publicCss, /dialog\{max-height:80dvh;overflow:hidden\}/);
  assert.match(publicCss, /\.modal-card\{max-height:80dvh;overflow:auto/);
  assert.match(publicCss, /\.modal-card\{[^}]*scrollbar-gutter:auto/);
  for (const css of [publicCss, adminCss]) {
    assert.match(css, /scrollbar-color:#376e61 #080d12/);
    assert.match(css, /::-webkit-scrollbar-thumb\{background:#2f5e54/);
  }
});
