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

test('maintained markup does not hardcode decorative placeholder clusters', () => {
  const html = read('public/index.html'); const admin = read('admin/index.html'); const application = read('public/app.js');
  assert.doesNotMatch(html + admin, /<i\b[^>]*>\s*<\/i>/);
  assert.doesNotMatch(html, /class="hero-cover hero-cover-\d"/);
  assert.doesNotMatch(html, /class="modal-actions"[^>]*>[\s\S]{0,180}<span>\s*<\/span>/);
  assert.match(html, /class="promo-cover-deck" data-cover-slots="5"/);
  assert.match(html, /class="hero-art" data-cover-slots="5" data-cover-element="span" data-cover-class="hero-cover"/);
  assert.match(html, /class="auth-promo promo-library" data-cover-decoration="promo-loose-cover"/);
  assert.match(application, /field\.dataset\.coverElement \|\| 'i'/);
  assert.match(application, /`\$\{baseClass\} \$\{baseClass\}-\$\{index \+ 1\}`/);
});

test('authenticated app matches the login account-cover background visibility', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const css = readPublicCss();
  assert.match(html, /class="auth-cover-field app-cover-field" data-cover-slots="32" aria-hidden="true"><\/div>/);
  assert.equal((html.match(/data-cover-slots="32"/g) || []).length, 2);
  assert.doesNotMatch(html, /(?:<i><\/i>){8}/);
  assert.match(application, /state\.games\.map\(game => game\.coverUrl\)/);
  assert.match(application, /#auth-screen[^\n]*hidden = true;[\s\S]*#app-shell[^\n]*hidden = false;[\s\S]*void stageAppDecorations\(user\.id\)\.catch/);
  assert.doesNotMatch(application, /state\.games = games;[^\n]*await loadHeroCovers/);
  assert.match(application, /await loadHeroCovers\(isCurrent\);[\s\S]*await loadAppBackgroundCovers\(isCurrent\)/);
  assert.match(application, /for \(const candidate of candidates\)[\s\S]*await loadCandidate\(candidate\)/);
  assert.doesNotMatch(application, /Promise\.all\(slots\.map|Math\.min\(8, candidates\.length\)/);
  assert.match(application, /setTimeout\(\(\) => finish\('\'\), UI_TIMING\.artworkLoadTimeoutMs\)/);
  assert.match(application, /loaded\[nextSlot % loaded\.length\]/);
  assert.doesNotMatch(application, /applyDecorativeCovers\(slots, covers\.slice/);
  assert.match(css, /\.app-cover-field\{[^}]*opacity:0?\.075/);
  assert.doesNotMatch(css, /\.app-cover-field i\{filter:/);
  assert.match(css, /#app-shell>\.topbar,#app-shell>main\{position:relative;z-index:1\}/);
});

test('stored sessions use a resume screen instead of flashing authentication', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const css = readPublicCss();
  assert.match(html, /document\.documentElement\.classList\.add\('resuming-session'\)/);
  assert.match(html, /id="session-resume"[^>]*role="status"/);
  assert.match(css, /\.resuming-session #auth-screen\{visibility:hidden\}/);
  assert.match(css, /\.resuming-session \.session-resume-screen\{display:grid\}/);
  assert.match(application, /function endSessionResume\(\)/);
  assert.match(application, /#app-shell'\)\.hidden = false;[\s\S]*endSessionResume\(\);/);
  assert.doesNotMatch(html + application, /localStorage|sessionStorage/);
});

test('account preferences use SQLite-backed API state instead of browser storage', () => {
  const application = read('public/app.js'); const server = read('server.js'); const preferences = read('server/preferences.js'); const database = read('server/db.js'); const constants = read('server/constants.js');
  assert.match(database, /CREATE TABLE IF NOT EXISTS user_preferences/);
  assert.match(server, /pathname === '\/api\/preferences'/);
  assert.match(application, /api\('\/api\/preferences', \{ method: 'PUT'/);
  assert.match(application, /applyPreferences\(savedPreferences\)/);
  assert.match(application, /window\.addEventListener\('pagehide',[^\n]*savePreferences\(true\)/);
  assert.match(application, /#logout-button'[\s\S]*await savePreferences\(\);[\s\S]*api\('\/api\/logout'/);
  assert.match(preferences, /new Set\(SORT_VALUES\)/);
  assert.match(constants, /'hltb_main_short'/);
  assert.doesNotMatch(application, /localStorage|sessionStorage/);
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

test('landing footer links to the public repository without replacing the app', () => {
  const html = read('public/index.html');
  assert.match(html, /href="https:\/\/github\.com\/koldKat\/games-app" target="_blank" rel="noopener noreferrer">GITHUB/);
  assert.doesNotMatch(readPublicCss(), /\.auth-footer \.repo-link\{/);
});

test('authenticated library carries the family copyright notice with a rolling year', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const policy = read('public/js/ui-policy.js'); const css = readPublicCss();
  assert.match(html, /class="app-footer"[\s\S]*koldKat productions[\s\S]*data-copyright-year>© 2026/);
  assert.match(policy, /COPYRIGHT_START_YEAR = 2026/);
  assert.match(application, /copyrightYear > COPYRIGHT_START_YEAR \? `© \$\{COPYRIGHT_START_YEAR\}-\$\{copyrightYear\}`/);
  assert.match(css, /\.app-footer-brand\{color:#f5a623;font-weight:600\}/);
});

test('common filters never move the viewport', () => {
  const application = read('public/app.js');
  assert.doesNotMatch(application, /scrollIntoView|scrollTo\s*\(/);
});

test('collection filtering separates owned physical and digital games', () => {
  const html = read('public/index.html'); const application = read('public/app.js');
  const database = read('server/db.js'); const preferences = read('server/preferences.js'); const constants = read('server/constants.js');
  assert.match(html, /value="owned_physical">Owned · physical<\/option><option value="owned_digital">Owned · digital/);
  assert.match(html, /id="stat-owned-physical"[\s\S]*id="stat-owned-digital"/);
  assert.match(application, /filters\.ownership\.value === 'owned_physical'/);
  assert.match(application, /filters\.ownership\.value === 'owned_digital'/);
  assert.match(database, /media_format = @ownedFormat/);
  assert.match(database, /const ownedFormats =/);
  assert.match(preferences, /OWNERSHIP_FILTER_VALUES/);
  assert.match(constants, /'owned_physical', 'owned_digital'/);
});

test('collection tracking has no unavailable state or dead dashboard control', () => {
  const html = read('public/index.html'); const application = read('public/app.js');
  const sorting = read('public/js/game-sorting.js'); const icons = read('public/assets/stat-icons.svg'); const css = readPublicCss();
  assert.equal((html.match(/class="stat-card /g) || []).length, 10);
  assert.doesNotMatch(html, /data-stat-value="unavailable"|value="unavailable"|>Unavailable</);
  assert.doesNotMatch(application, /stat-unavailable|unavailable: 'Unavailable'/);
  assert.doesNotMatch(sorting, /unavailable/);
  assert.doesNotMatch(icons, /id="unavailable"/);
  assert.doesNotMatch(css, /badge\.unavailable|stat-tone-red/);
  assert.match(css, /\.stats\{grid-template-columns:repeat\(10,minmax\(0,1fr\)\)/);
});

test('one data-gaps filter handles missing PEGI metadata, covers, and HLTB times', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const database = read('server/db.js');
  assert.match(html, /id="missing-filter"[\s\S]*No PEGI info[\s\S]*No cover[\s\S]*No HLTB info[\s\S]*Any missing[\s\S]*All three missing/);
  assert.doesNotMatch(html, /id="missing-(?:pegi|cover)-filter"/);
  assert.match(application, /filters\.missing\.value === 'either'/);
  assert.match(application, /filters\.missing\.value === 'both'/);
  assert.match(database, /filters\.missing === 'either'/);
  assert.match(database, /filters\.missing === 'both'/);
});

test('sorting is modular and includes catalogue and HLTB duration orders', () => {
  const html = read('public/index.html'); const application = read('public/app.js');
  const sorting = read('public/js/game-sorting.js'); const database = read('server/db.js');
  assert.match(application, /import \{ compareGames \} from '\.\/js\/game-sorting\.js'/);
  assert.doesNotMatch(application, /function compareGames\(/);
  assert.match(html, /Title · Z–A[\s\S]*Release year · newest[\s\S]*Recently updated/);
  assert.match(html, /HLTB main · shortest[\s\S]*HLTB main \+ sides · longest[\s\S]*HLTB completionist · shortest[\s\S]*HLTB all styles · longest/);
  for (const value of ['hltb_main_short', 'hltb_main_long', 'hltb_extra_short', 'hltb_extra_long', 'hltb_100_short', 'hltb_100_long', 'hltb_all_short', 'hltb_all_long']) {
    assert.match(sorting, new RegExp(value)); assert.match(database, new RegExp(`${value}:`));
  }
  assert.match(application, /compareGames\(left, right, filters\.sort\.value\)/);
});

test('HLTB integration is native Node and exposes all four estimates', () => {
  const html = read('public/index.html'); const application = read('public/app.js');
  const provider = read('server/hltb.js'); const hltbUi = read('public/js/hltb-ui.js'); const server = read('server.js'); const css = readPublicCss();
  assert.match(html, /Main Story, Main \+ Sides, Completionist, and All Styles/);
  assert.match(html, /id="hltb-bulk-start"[\s\S]*Fill HLTB times/);
  assert.match(application, /event === 'hltb-job'/);
  assert.match(application, /createHltbLookup/);
  assert.match(server, /pathname === '\/api\/hltb\/search'/);
  assert.match(server, /pathname === '\/api\/hltb\/bulk'/);
  assert.match(provider, /async function fetchSearch/);
  assert.doesNotMatch(provider, /spawn|python/i);
  assert.match(hltbUi, /sequence !== searchSequence \|\| titleInput\.value\.trim\(\) !== title/);
  assert.match(hltbUi, /titleInput\.addEventListener\('input'/);
  assert.match(css, /\.card-hltb\{[^}]*display:grid/);
  assert.match(css, /\.game-card\{display:flex;flex-direction:column/);
  assert.match(css, /\.card-actions\{margin-top:auto/);
  assert.match(css, /\.game-title\{font-size:14px;height:2\.44em/);
  assert.match(css, /\.badges\{height:42px;align-content:flex-start;overflow:hidden/);
  assert.match(css, /\.game-grid\.list-view \.card-hltb\{display:grid;grid-column:4;grid-row:1;margin:0/);
  assert.match(css, /\.card-hltb dt\{[^}]*font-size:10px/);
  assert.match(css, /\.card-hltb dd\{[^}]*font-size:13px/);
  assert.match(read('public/js/hltb-ui.js'), /card-hltb\$\{game\.hltbId \? '' : ' is-empty'\}/);
});

test('title autocomplete is themed and silently degrades when SteamGridDB fails', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const autocomplete = read('public/js/title-autocomplete.js'); const css = readPublicCss(); const server = read('server.js');
  assert.match(html, /id="game-title"[\s\S]*role="combobox"[\s\S]*id="title-suggestions"[^>]*role="listbox"/);
  assert.match(application, /createTitleAutocomplete/);
  assert.match(autocomplete, /api\(`\/api\/titles\/autocomplete/);
  assert.match(autocomplete, /catch \{\}/);
  assert.match(autocomplete, /\}, AUTOCOMPLETE_POLICY\.debounceMs\);/);
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

test('SteamGridDB configuration uses a disabled connected field and explicit replacement mode', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const server = read('server.js'); const css = readPublicCss();
  assert.doesNotMatch(html, /cover-connection-state/);
  assert.match(application, /input\.type = 'text'; input\.value = 'Connected'; input\.disabled = true/);
  assert.match(application, /setCoverKeyMode\(true, true\); input\.focus\(\); return/);
  assert.match(application, /replacing \? 'Save key' : 'Connect'/);
  assert.match(application, /const saving = input\.dataset\.saving === 'true'/);
  assert.match(application, /input\.disabled = saving/);
  assert.doesNotMatch(application, /Personal API key saved securely/);
  assert.match(css, /input\.is-connected:disabled/);
  assert.match(server, /configured: Boolean\(accountKey \|\| serverKey\)/);
  assert.doesNotMatch(server, /steamgriddb_key[^\n]*sendJson/);
});

test('TheGamesDB cover provider is modular, themed, and account-backed', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const settings = read('public/js/cover-provider-settings.js'); const server = read('server.js');
  assert.match(html, /data-cover-provider="thegamesdb"/);
  assert.match(html, /thegamesdb\.net\/login\.php[^>]*>Sign in \/ register ↗/);
  assert.match(html, /api\.thegamesdb\.net\/key\.php[^>]*>View API key ↗/);
  assert.match(settings, /\/api\/cover-providers\/\$\{provider\}\/config/);
  assert.match(settings, /connectedInput\.value = 'Connected'; connectedInput\.disabled = true/);
  assert.match(application, /coverProviderSettings\.handleEvent/);
  assert.match(application, /TheGamesDB art ↗/);
  assert.match(server, /db\.coverProviderCredentials\(userId, provider\)/);
  assert.match(server, /\(thegamesdb\)/);
});

test('durable public covers stream from disk instead of buffering whole images', () => {
  const server = read('server.js');
  assert.match(server, /fs\.createReadStream\(filePath\)/);
  assert.match(server, /public, max-age=31536000, immutable/);
  assert.match(server, /'Content-Length': stats\.size/);
});

test('batch updates use cookie-authenticated SSE and patch individual cards', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const stream = read('public/js/events.js'); const server = read('server.js');
  assert.match(html, /id="pegi-bulk-start"[\s\S]*Fill PEGI details/);
  assert.match(stream, /credentials: 'same-origin'/);
  assert.doesNotMatch(stream, /Authorization|Bearer/);
  assert.match(stream, /headers\['Last-Event-ID'\] = lastEventId/);
  assert.match(server, /X-Accel-Buffering|events\.subscribe/);
  assert.match(application, /event === 'game-updated'\) applyGamePatch\(data\.game\)/);
  assert.match(application, /existingCard\?\.remove\(\)/);
  assert.match(application, /pendingGamePatches\.set\(game\.id, game\)/);
  assert.match(application, /renderGames\(\); flushPendingGamePatches\(\)/);
  assert.match(application, /sequence !== gameLoadSequence \|\| state\.user\?\.id !== userId/);
  assert.match(application, /generation !== sessionGeneration/);
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
