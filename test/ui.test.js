const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const publicStylesheets = ['foundation.css', 'theme.css', 'library.css', 'landing.css', 'features.css'];
const readPublicCss = () => publicStylesheets.map(file => read(`public/css/${file}`)).join('')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').replace(/\s+/g, ' ').trim();

test('browser modules do not assign through an optional chain', () => {
  const modules = fs.readdirSync(path.join(root, 'public/js')).filter(file => file.endsWith('.js')).map(file => read(`public/js/${file}`)).join('\n');
  assert.doesNotMatch(modules, /\?\.[\w$]*\([^)]*\)\s*\.\s*[\w$]+\s*=/);
});

test('destructive actions never invoke native browser dialogs', () => {
  const sources = ['public/app.js', 'admin/js/accounts.js', 'admin/js/catalogue.js', 'admin/js/public-catalogue.js', 'admin/js/tools.js', 'admin/js/core.js'];
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

test('Kat·a·log Signal is a modular public feed with a global account privacy control', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const activity = read('server/activity.js');
  assert.match(html, /id="activity-feed"/); assert.match(html, /data-activity-feed data-activity-limit="3"/); assert.match(html, /href="\/signal">Open the public signal/); assert.match(html, /id="account-hide-from-activity"/);
  assert.match(application, /createActivityFeed/); assert.match(activity, /activity_templates/); assert.match(activity, /activity_events/);
  assert.match(activity, /JOIN_TEMPLATES/); assert.match(activity, /LEVEL_TEMPLATES/);
  assert.match(read('public/js/activity-feed.js'), /new EventSource\('\/api\/activity\/stream'\)/);
  assert.match(read('public/js/signal-page.js'), /createActivityFeed\(\)\.start\(\)/);
  assert.match(read('public/js/activity-feed.js'), /function preview\(content, url, kind, alt\)/);
  assert.match(read('public/js/activity-feed.js'), /class="activity-game-link"/);
  assert.doesNotMatch(read('public/js/activity-feed.js'), /class="activity-art"/);
  assert.match(read('public/js/activity-feed.js'), /function groupedCards\(entries\)/);
  assert.match(read('public/js/activity-feed.js'), /host\.dataset\.activityLimit === 'all' \? entries\.length/);
  assert.match(read('public/js/activity-feed.js'), /const targets = hosts\(\)/);
  assert.match(read('public/js/catalogue-navigation.js'), /onSignalVisible\(\)/);
  assert.match(read('public/css/catalogue.css'), /\.signal-feed \.activity-day h3/);
  assert.match(read('public/js/activity-feed.js'), /entry\.type === 'announcement'/);
  assert.match(read('public/js/activity-feed.js'), /body\.pinned/);
  assert.match(read('public/js/activity-feed.js'), /function pinnedCard\(entry\)/);
  assert.match(read('public/css/activity.css'), /\.activity-pinned-card/);
  assert.match(read('public/js/announcement-format.js'), /formatAnnouncementBody/);
  assert.match(read('admin/index.html'), /data-tab="announcements"/);
  assert.match(read('admin/index.html'), /id="announcement-form"/);
  assert.match(read('admin/js/boot.js'), /loadAnnouncements/);
  assert.match(read('admin/js/announcements.js'), /\/api\/admin\/announcements/);
  assert.match(read('server/admin.js'), /activity\.publishAnnouncement/);
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
  assert.match(css, /\.app-cover-field\{[^}]*opacity:0?\.1/);
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

test('an ordinary logged-out refresh does not report an expired session', () => {
  const application = read('public/app.js');
  assert.match(application, /AUTH_ROUTES_WITHOUT_EXPIRY_NOTICE = new Set\(\['\/api\/login', '\/api\/register', '\/api\/auth\/me'\]\)/);
  assert.match(application, /!AUTH_ROUTES_WITHOUT_EXPIRY_NOTICE\.has\(url\)/);
  assert.match(application, /#auth-error'\)\.textContent = message;\s*\$\('#auth-error'\)\.hidden = !message/);
});

test('auth validation uses themed field state without native browser prompts', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const css = readPublicCss();
  assert.match(html, /<form id="auth-form" novalidate>/);
  assert.match(application, /function validateAuthForm\(\)/);
  assert.match(application, /input\.classList\.toggle\('input-invalid', invalid\)/);
  assert.match(application, /if \(!validateAuthForm\(\)\) return/);
  assert.doesNotMatch(application, /reportValidity\(/);
  assert.match(css, /\.auth-body input\.input-invalid,[^{]*\.auth-body input\.input-invalid:hover,[^{]*\.auth-body input\.input-invalid:focus\{border-color:#e15d5d;box-shadow:/);
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

test('an empty library request uses the favicon controller as its loading state', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const css = readPublicCss();
  assert.match(html, /id="library-loader" class="library-loader" role="status" aria-live="polite" hidden/);
  assert.match(html, /class="library-loader-mark"[\s\S]*class="loader-controller-body"[\s\S]*class="loader-control loader-dpad"[\s\S]*class="loader-control loader-action-a"[\s\S]*class="loader-control loader-action-b"/);
  assert.match(html, /loader-dpad" d="M23\.5 24v10M18\.5 29h10"/);
  assert.match(html, /loader-action-a" cx="41" cy="26"[\s\S]*loader-action-b" cx="46" cy="32"/);
  assert.match(application, /#library-loader'\)\.hidden = !state\.loading \|\| state\.games\.length > 0/);
  assert.match(css, /\.loader-controller-body\{fill:none;stroke:#35d6b2;stroke-width:1\.6/);
  assert.match(css, /\.loader-dpad\{fill:none;stroke:#35d6b2;stroke-width:2\.2/);
  assert.match(css, /@keyframes controller-breathe/);
  assert.match(css, /@keyframes controller-press/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)[^{]*\{[\s\S]*\.library-loader-mark,[^{]*\.loader-control\{animation:none\}/);
});

test('login and registration keep a stable desktop rail without filler content', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const css = readPublicCss();
  assert.match(html, /id="auth-screen" class="auth-screen" data-auth-mode="login"/);
  assert.match(html, /class="auth-public-nav"[\s\S]*href="\/signal">Signal<[\s\S]*href="\/katalog">Kat·a·log</);
  assert.match(html, /class="auth-center"[\s\S]*class="auth-card"/);
  assert.doesNotMatch(html + application + css, /auth-login-promo|promo-pipeline|BACKLOG \/\/ ROUTED/);
  assert.match(application, /#auth-screen'\)\.dataset\.authMode = mode/);
  assert.match(application, /showAuthForm\(\); setAuthMode\(mode\);\s*setTimeout\(\(\) => \$\('#auth-username'\)\.focus\(\), UI_TIMING\.focusDelayMs\)/);
  assert.match(css, /\.auth-center\{width:100%;height:510px;display:flex;flex-direction:column;gap:10px\}/);
  assert.match(css, /@media \(max-width:580px\)[\s\S]*\.auth-center\{width:100%;height:auto\}/);
  assert.match(css, /\.auth-public-nav\{display:grid;grid-template-columns:1fr 1fr;gap:7px;min-height:30px\}/);
  assert.match(css, /\.auth-public-link\{[\s\S]*text-decoration:none/);
  assert.match(css, /\.auth-public-link:after\{[\s\S]*animation:auth-public-pulse 4s ease-in-out infinite/);
  assert.match(css, /@keyframes auth-public-pulse\{[\s\S]*50%\{box-shadow:0 0 0 3px rgb\(88 225 198 \/ 26%\)/);
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
  const html = read('public/index.html'); const application = read('public/app.js'); const policy = read('public/js/ui-policy.js'); const catalogue = read('server/catalogue-pages.js'); const css = readPublicCss();
  assert.match(html, /class="app-footer" aria-label="Site footer"[\s\S]*koldKat productions[\s\S]*data-copyright-year>© 2026[\s\S]*GAMEKAT\.NET \/\/ GAME KAT·A·LOG[\s\S]*USER GUIDE/);
  assert.match(policy, /COPYRIGHT_START_YEAR = 2026/);
  assert.match(application, /copyrightYear > COPYRIGHT_START_YEAR \? `© \$\{COPYRIGHT_START_YEAR\}-\$\{copyrightYear\}`/);
  assert.match(css, /\.app-footer-brand\{color:#f5a623;font-weight:600\}/);
  assert.match(css, /\.app-footer\{display:grid;grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.match(catalogue, /<footer class="app-footer" aria-label="Site footer"><span><span class="app-footer-brand">koldKat productions<\/span> <span>\$\{copyright\}<\/span><\/span><span>GAMEKAT\.NET \/\/ GAME KAT·A·LOG<\/span><a href="\/docs\/user-guide\.html">USER GUIDE<\/a><\/footer>/);
});

test('common filters never move the viewport', () => {
  const application = read('public/app.js');
  assert.doesNotMatch(application, /scrollIntoView|scrollTo\s*\(/);
});

test('private Kat·a·log uses ten-row pagination instead of a show-more control', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const policy = read('public/js/ui-policy.js'); const css = readPublicCss();
  assert.match(html, /id="library-pagination" class="library-pagination" aria-label="My Kat·a·log pages"/);
  assert.doesNotMatch(html, /id="load-more"/);
  assert.match(policy, /LIBRARY_PAGE_SIZE = 50/);
  assert.match(application, /function pagedGames\(\)/);
  assert.match(application, /state\.page \+= direction === 'next' \? 1 : -1/);
  assert.match(css, /\.library-pagination\{display:grid;grid-template-columns:1fr auto 1fr/);
});

test('game saves animate awarded progression even if the event stream is late', () => {
  const application = read('public/app.js'); const server = read('server.js'); const progressionUi = read('public/js/progression-ui.js');
  assert.match(application, /function applySaveProgress\(result\)/);
  assert.match(application, /applySaveProgress\(result\);/);
  assert.match(server, /progression: progressionResult/);
  assert.match(progressionUi, /Number\(next\.xp\) <= highestQueuedXp/);
  assert.match(server, /catalogueContribution: isCatalogueContribution/);
  assert.match(server, /backfillCatalogueContributions\(catalogue\.contributionSources\(\)\)/);
});

test('catalogue navigation keeps the authenticated shell mounted and swaps only its content view', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const navigation = read('public/js/catalogue-navigation.js');
  assert.match(html, /<main id="app-main">\s*<div id="library-view">/);
  assert.match(html, /<section id="catalogue-view" class="catalogue-view" hidden aria-live="polite"><\/section>/);
  assert.match(application, /import \{ createCatalogueNavigation \} from '\.\/js\/catalogue-navigation\.js'/);
  assert.match(application, /openCatalogue: slug => catalogueNavigation\.open/);
  assert.match(navigation, /library\.hidden = false; catalogue\.hidden = true/);
  assert.match(navigation, /catalogue\.replaceChildren\(document\.importNode\(main, true\)\)/);
  assert.match(navigation, /window\.history\.pushState/);
  assert.match(navigation, /event\.stopImmediatePropagation\(\);/);
  assert.match(navigation, /\}, \{ capture: true \}\);/);
  assert.match(html, /header-community-actions[\s\S]*class="button signal-button" href="\/signal">[\s\S]*header-nav-label">Signal[\s\S]*class="button forum-button" href="\/forum">[\s\S]*header-nav-label">Forum[\s\S]*header-progression[\s\S]*header-library-actions[\s\S]*class="button catalogue-button" href="\/katalog">[\s\S]*header-nav-label">Kat·a·log[\s\S]*class="button library-button" href="\/">[\s\S]*header-nav-label">My Kat·a·log/);
  assert.match(navigation, /libraryButton\.classList\.toggle\('active', libraryOpen\)/);
  assert.match(navigation, /catalogueButton\.classList\.toggle\('active', catalogueOpen\)/);
  assert.doesNotMatch(navigation, /toggle\.textContent/);
  assert.match(navigation, /const signal = document\.querySelector\('\.signal-button'\)/);
  assert.match(navigation, /void open\('\/signal'\)/);
  assert.doesNotMatch(navigation, /controllerLoaderMarkup\('Loading public Kat·a·log…'\)/);
  assert.match(navigation, /const \{ main, title \} = pageFromResponse[\s\S]*const nextView = target\.pathname === '\/signal' \? 'signal' : target\.pathname\.startsWith\('\/forum'\) \? 'forum' : 'catalogue';[\s\S]*view = nextView; library\.hidden = true; catalogue\.hidden = false;/);
  assert.match(navigation, /link\.dataset\.catalogueDestination === 'library'[\s\S]*showLibrary\(\)/);
  assert.match(navigation, /onOpenLibrary: \(\) => showLibrary\(\)/);
  assert.match(read('public/js/catalogue-public.js'), /response\.status === 409 && body\.existing/);
  assert.match(read('public/js/controller-loader.js'), /class="library-loader-controller"/);
  assert.match(read('public/css/theme.css'), /\.header-community-actions,\.header-library-actions\{display:flex;align-items:center;gap:6px\}/);
  assert.match(read('public/css/theme.css'), /\.top-actions \.catalogue-button,\.top-actions \.library-button,\.top-actions \.forum-button \{ width:auto; min-width:0;/);
  assert.match(read('public/css/theme.css'), /\.button \{[\s\S]*text-decoration: none/);
  assert.match(read('public/css/theme.css'), /@media \(max-width: 680px\) \{[\s\S]*\.auth-screen \{[\s\S]*\.brand strong \{ font-size: 13px; white-space: nowrap; \}/);
  assert.match(read('public/css/theme.css'), /\.brand strong em \{ display: none; \}/);
  assert.match(read('public/css/theme.css'), /\.header-progression\{display:none\}/);
  assert.match(read('public/css/theme.css'), /\.top-actions \.account-button \{ width: 38px; min-width: 38px; max-width: 38px; padding: 0; \}/);
  assert.match(read('public/css/theme.css'), /\.header-nav-icon \{ display:none; \}/);
  assert.match(read('public/css/theme.css'), /\.header-nav-icon \{ display:block; width:18px; height:18px; stroke:currentColor;/);
  assert.doesNotMatch(read('public/css/theme.css'), /content: "[⌁◌⌂⌕]"/);
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

test('one data-gaps filter handles missing PEGI metadata, covers, HLTB times, and descriptions', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const database = read('server/db.js');
  assert.match(html, /id="missing-filter"[\s\S]*No PEGI info[\s\S]*No cover[\s\S]*No HLTB info[\s\S]*No description[\s\S]*Any missing[\s\S]*All missing/);
  assert.doesNotMatch(html, /id="missing-(?:pegi|cover)-filter"/);
  assert.match(application, /filters\.missing\.value === 'either'/);
  assert.match(application, /filters\.missing\.value === 'both'/);
  assert.match(database, /filters\.missing === 'either'/);
  assert.match(database, /filters\.missing === 'both'/);
  assert.match(application, /filters\.missing\.value === 'description'/);
  assert.match(database, /filters\.missing === 'description'/);
});

test('personal ratings use private half-star values and card rendering', () => {
  const html = read('public/index.html'); const application = read('public/app.js');
  const css = readPublicCss(); const database = read('server/db.js'); const catalogue = read('server/catalogue-store.js');
  assert.match(html, /id="game-rating" type="hidden"[\s\S]*id="game-rating-picker"[\s\S]*data-rating-star="5"/);
  assert.match(application, /function personalRating\(rating\)/);
  assert.match(application, /ratingPicker\.addEventListener\('pointermove'/);
  assert.match(application, /function ratingAtPointer\(event\)/);
  assert.match(application, /paintRating\(rating, true\)/);
  assert.match(application, /personalRating\(game\.rating\)/);
  assert.match(application, /function cardRatingControl\(game\)/);
  assert.match(application, /data-action="rate"/);
  assert.match(application, /action === 'rate'/);
  assert.match(application, /Number\(game\.rating\) === next \? null : next/);
  assert.match(application, /function paintCardRating/);
  assert.match(application, /rating: \$\('#game-rating'\)\.value/);
  assert.match(database, /rating REAL CHECK/);
  assert.match(database, /Rating must be in half-star steps from 0\.5 to 5/);
  assert.match(css, /\.rating-picker \.rating-star\{[^}]*font-size:19px/);
  assert.match(css, /\.rating-picker \.rating-star\.half\{background:linear-gradient\(90deg,#f5a623 50%,#44515e 50%\)/);
  assert.match(application, /rating-picker card-rating-picker/);
  assert.match(application, /card-rating-inline-label">Your rating/);
  assert.match(css, /\.card-rating-field\{margin-top:8px/);
  assert.match(css, /\.rating-star\.half\{background:linear-gradient\(90deg,#f5a623 50%,#44515e 50%\)/);
  assert.match(catalogue, /SELECT AVG\(g\.rating\)/);
  assert.match(catalogue, /count >= 1/);
  assert.doesNotMatch(catalogue, /rating:\s*entry\.rating/);
});

test('compact rows do not mistake the favourite control for a one-star rating', () => {
  const css = readPublicCss();
  assert.match(css, /\.game-grid\.list-view \.card-rating-field\{display:none\}/);
  assert.match(css, /\.game-grid\.list-view \.favorite-button\{display:none\}/);
});

test('library cards open a read-only details view before editing', () => {
  const html = read('public/index.html'); const application = read('public/app.js'); const css = readPublicCss();
  assert.match(html, /id="game-details-dialog"/);
  assert.doesNotMatch(application, /data-action="view">View details/);
  assert.match(application, /if \(!action\) return openDetails\(game\)/);
  assert.match(application, /function openDetails\(game\)/);
  assert.match(application, /if \(action === 'view'\) return openDetails\(game\)/);
  assert.match(application, /safeDetailLink\(game\.descriptionSourceUrl, 'View description source'\)/);
  assert.match(application, /detailsDialog\.addEventListener\('close'/);
  assert.match(html, /id="game-details-edit"/);
  assert.match(css, /\.game-detail-hero\{display:grid/);
});

test('private, public, and administrator catalogues use delayed live search', () => {
  const privateApp = read('public/app.js'); const publicCatalogue = read('public/js/catalogue-public.js');
  const adminCatalogue = read('admin/js/catalogue.js'); const adminPublicCatalogue = read('admin/js/public-catalogue.js');
  assert.match(privateApp, /setTimeout\(loadGames, UI_TIMING\.librarySearchDebounceMs\)/);
  assert.match(publicCatalogue, /catalogueSearchSequence/);
  assert.match(publicCatalogue, /querySelector\('\.catalogue-results'\)/);
  assert.match(publicCatalogue, /current\.replaceWith\(next\); history\.replaceState/);
  assert.match(publicCatalogue, /closest\('main\.catalogue-main'\)\?\.addEventListener\('click'/);
  assert.match(publicCatalogue, /target\.pathname\.startsWith\('\/game\/'\)[\s\S]*openCatalogueGameDialog/);
  assert.match(publicCatalogue, /main\.append\(document\.importNode\(next, true\)\)/);
  assert.match(publicCatalogue, /event\.stopPropagation\(\)/);
  assert.match(publicCatalogue, /setTimeout\(\(\) => \{/);
  assert.match(read('public/js/catalogue-navigation.js'), /async function refreshResults\(url\)/);
  assert.match(read('public/js/catalogue-navigation.js'), /current\.replaceWith\(document\.importNode\(next, true\)\)/);
  assert.match(adminCatalogue, /setTimeout\(loadCatalogue, 250\)/);
  assert.match(adminPublicCatalogue, /setTimeout\(loadPublicCatalogue, 250\)/);
});

test('only public catalogue candidates offer the Publish action', () => {
  const catalogueAdmin = read('admin/js/public-catalogue.js');
  assert.match(catalogueAdmin, /entry\.status === 'candidate'\) actions\.append\(button\('Publish'/);
  assert.doesNotMatch(catalogueAdmin, /entry\.status !== 'public'\) actions\.append\(button\('Publish'/);
});

test('admin account controls show access state and protect koldKat from lock or deletion', () => {
  const html = read('admin/index.html'); const accounts = read('admin/js/accounts.js'); const adminServer = read('server/admin.js'); const authServer = read('server/auth.js');
  assert.match(html, /<th>ACCESS<\/th>/);
  assert.match(accounts, /account\.protected \? 'PROTECTED'/);
  assert.match(accounts, /\/api\/admin\/accounts\/\$\{account\.id\}\/lock/);
  assert.match(accounts, /lock\.disabled = Boolean\(account\.protected\)/);
  assert.match(accounts, /remove\.disabled = Boolean\(account\.protected\)/);
  assert.match(adminServer, /auth\.setAccountLocked/);
  assert.match(authServer, /ACCOUNT_FAILURE_LIMIT = 5/);
  assert.match(authServer, /isProtectedUsername/);
});

test('password reset has a token-based login flow and localhost SMTP administration', () => {
  const html = read('public/index.html'); const app = read('public/app.js'); const adminHtml = read('admin/index.html'); const admin = read('server/admin.js'); const mailer = read('server/mailer.js');
  assert.match(html, /id="forgot-password"/);
  assert.match(html, /id="password-reset-request-form"/);
  assert.match(html, /id="password-reset-complete-form"/);
  assert.doesNotMatch(html, /id="password-reset-dialog"/);
  assert.match(app, /\/api\/password-reset\/request/);
  assert.match(app, /new URLSearchParams\(window\.location\.search\)\.get\('reset'\)/);
  assert.match(app, /history\.replaceState\(\{\}, '', window\.location\.pathname\)/);
  assert.match(adminHtml, /id="mail-settings-form"/);
  assert.match(admin, /\/api\/admin\/mail/);
  assert.match(mailer, /STARTTLS/);
  assert.match(mailer, /AUTH PLAIN/);
  assert.match(mailer, /multipart\/alternative/);
  assert.match(read('server.js'), /GAME KAT·A·LOG/);
  assert.match(read('server.js'), /Reset password<\/a>/);
});

test('public release links retain crawlable URLs while opening in the Kat·a·log detail dialog', () => {
  const navigation = read('public/js/catalogue-navigation.js'); const catalogue = read('public/js/catalogue-public.js'); const css = read('public/css/catalogue.css');
  assert.match(navigation, /bindCatalogueGameDialog/);
  assert.match(catalogue, /data-catalogue-game-dialog/);
  assert.match(catalogue, /dialog\.showModal\(\)/);
  assert.match(catalogue, /window\.history\.replaceState\(\{ catalogue: true \}, '', '\/katalog'\)/);
  assert.match(css, /\.catalogue-game-dialog/);
});

test('public Kat·a·log cards overlay community ratings on their covers', () => {
  const pages = read('server/catalogue-pages.js'); const css = read('public/css/catalogue.css');
  assert.match(pages, /class="catalogue-cover"[^>]*>[\s\S]*\$\{communityRating\(entry\)\}<\/a>/);
  assert.match(css, /\.catalogue-cover \.community-rating\s*\{\s*position: absolute;\s*bottom: 6px;\s*left: 50%/);
  assert.match(css, /transform: translateX\(-50%\); white-space: nowrap/);
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
  assert.match(server, /pathname === '\/api\/titles\/autocomplete'[\s\S]*catch \{ return sendJson\(response, 200, \{ existing, catalogue: publicEntries, suggestions: \[\] \}\); \}/);
  assert.match(css, /\.title-suggestions\{[^}]*background:#080d12/);
  assert.match(html, /id="duplicate-warning"[\s\S]*id="open-duplicate"/);
  assert.match(autocomplete, /kind: 'existing'/);
  assert.match(autocomplete, /kind: 'catalogue'/);
  assert.match(autocomplete, /openCatalogue\(choice\.entry\.slug\)/);
  assert.match(autocomplete, /autocomplete\?exact=1/);
  assert.match(application, /title: 'Add another copy\?'/);
  assert.match(application, /confirmLabel: 'Add anyway'/);
  assert.match(server, /db\.searchGameTitles\(user\.id, query\)/);
  assert.match(server, /catalogue\.searchPublic\(query\)/);
  assert.match(server, /db\.findDuplicateGames\(user\.id, query/);
});

test('cover processing uses compact text with a themed detail tooltip', () => {
  const application = read('public/app.js'); const css = readPublicCss();
  assert.match(application, /Scanning \$\{job\.processed\.toLocaleString\(\)\}\/\$\{job\.total\.toLocaleString\(\)\}/);
  assert.match(application, /element\.dataset\.tooltip = detail/);
  assert.match(application, /element\.title = detail/);
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
  const publicCss = readPublicCss(); const catalogueCss = read('public/css/catalogue.css'); const adminCss = read('admin/style.css');
  assert.match(publicCss, /dialog\{max-height:80dvh;overflow:hidden;overscroll-behavior:contain\}/);
  assert.match(publicCss, /html:has\(dialog\[open\]\)\{overflow:hidden;scrollbar-gutter:stable\}/);
  assert.match(catalogueCss, /\.catalogue-game-dialog \{[^}]*overscroll-behavior: contain/);
  assert.match(catalogueCss, /\.close-button \{ display: grid;[^}]*place-items: center;[^}]*min-height: 25px/);
  assert.match(adminCss, /html:has\(dialog\[open\]\)\{overflow:hidden;scrollbar-gutter:stable\}/);
  assert.match(adminCss, /\.catalogue-edit-dialog\{[^}]*overscroll-behavior:contain/);
  assert.match(publicCss, /\.modal-card\{max-height:80dvh;overflow:auto/);
  assert.match(publicCss, /\.modal-card\{[^}]*scrollbar-gutter:auto/);
  for (const css of [publicCss, adminCss]) {
    assert.match(css, /scrollbar-color:#376e61 #080d12/);
    assert.match(css, /::-webkit-scrollbar-thumb\{background:#2f5e54/);
  }
});
