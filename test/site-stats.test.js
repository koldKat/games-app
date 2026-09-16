const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join('/tmp', `games-site-stats-test-${process.pid}.db`);
process.env.DB_PATH = dbPath;
const data = require('../server/db');
require('../server/katalog-runtime');
require('../server/activity');
const forum = require('../server/forum-data');
const auth = require('../server/auth');
const { createSiteStats } = require('../server/site-stats');

test.after(() => {
  data.db.close();
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

test('public site stats aggregate game-focused facts without exposing private records', async () => {
  const collector = await auth.register('stats_collector', 'long-password-one', 'private@example.com');
  const second = await auth.register('stats_second', 'long-password-two');
  await auth.register('stats_without_progression', 'long-password-three');
  const enriched = data.createGame(collector.id, {
    title: 'Shared Adventure', platform: 'Nintendo Switch', pegi: 7, ownership: 'owned', mediaFormat: 'physical',
    playStatus: 'completed', favorite: true, rating: 4.5, coverUrl: 'https://example.test/cover.jpg',
    description: 'Private library description', hltbId: 101, hltbTitle: 'Shared Adventure', hltbMainStory: 10,
    hltbMainExtra: 18, hltbCompletionist: 30, hltbAllStyles: 17,
  });
  const duplicate = data.createGame(second.id, { title: 'Shared Adventure', platform: 'Steam', ownership: 'owned', mediaFormat: 'digital', playStatus: 'playing', rating: 3 });
  data.createGame(collector.id, { title: 'Future Game', platform: 'PlayStation 5', ownership: 'wanted', playStatus: 'hidden' });
  auth.createSession(collector.id);
  data.db.prepare('UPDATE users SET public_profile=1, avatar_path=? WHERE id=?').run('avatar.jpg', collector.id);
  data.progression.info(collector.id);
  data.progression.info(second.id);
  data.db.prepare('UPDATE user_progression SET xp=? WHERE user_id=?').run(15_000, collector.id);
  data.db.prepare('UPDATE user_progression SET xp=? WHERE user_id=?').run(3_000, second.id);
  data.db.prepare("INSERT INTO progression_events(user_id,event,ref,amount) VALUES (?,?,?,?)").run(collector.id, 'game_added', 'stats-game', 50);
  data.db.prepare(`INSERT INTO catalogue_entries(slug,title,title_key,platform,platform_key,pegi,cover_url,status,submitted_by_user_id,source_game_id,published_at)
    VALUES ('shared-adventure-switch','Shared Adventure','shared adventure','Nintendo Switch','nintendo switch',7,'/covers/a.jpg','public',?,?,CURRENT_TIMESTAMP)`).run(collector.id, enriched.id);
  const catalogueId = Number(data.db.prepare("SELECT id FROM catalogue_entries WHERE slug='shared-adventure-switch'").get().id);
  data.db.prepare(`INSERT INTO catalogue_entries(slug,title,title_key,platform,platform_key,pegi,cover_url,status,submitted_by_user_id,source_game_id,published_at)
    VALUES ('shared-adventure-steam','Shared Adventure','shared adventure','Steam','steam',7,'/covers/b.jpg','public',?,?,CURRENT_TIMESTAMP)`).run(second.id, duplicate.id);
  data.db.prepare('INSERT INTO catalogue_game_links(catalogue_id,game_id,user_id) VALUES (?,?,?)').run(catalogueId, enriched.id, collector.id);
  forum.createThread(collector.id, { categoryId: forum.categories()[0].id, title: 'Stats thread', body: 'Counting things.' });
  data.db.prepare("INSERT INTO activity_events(type,user_id,event_ref) VALUES ('join',?,'joined')").run(collector.id);
  data.db.prepare("INSERT INTO announcements(title,body,is_draft) VALUES ('Public notice','Visible',0)").run();

  const stats = createSiteStats(data.db, {
    root: path.join(__dirname, '..'),
    resourceAverages: () => ({ avgCpu: 0.2, avgHeapUsed: 10, avgHeapTotal: 20, avgRss: 30, avgSamples: 60 }),
    trafficStats: () => ({ trafficIn: 2_048, trafficOut: 4_096 }),
  }).snapshot();
  assert.equal(stats.users, 3);
  assert.equal(stats.libraryRecords, 3);
  assert.equal(stats.uniqueLibraryTitles, 2);
  assert.equal(stats.publicReleases, 2);
  assert.equal(stats.publicTitles, 1);
  assert.equal(stats.multiPlatformTitles, 1);
  assert.deepEqual(stats.platforms.map(item => item.platform).sort(), ['Nintendo Switch', 'Steam']);
  assert.ok(!stats.platforms.some(item => item.platform === 'PlayStation 5'));
  assert.equal(stats.fullyEnriched, 1);
  assert.equal(stats.hltbMainHours, 10);
  assert.equal(stats.ratingsTotal, 2);
  assert.equal(stats.ratingAverage, 3.75);
  assert.equal(stats.totalXp, 18_000);
  assert.equal(stats.appLevel, 3);
  assert.equal(Math.floor(stats.averageLevel), 2);
  assert.equal(stats.xpEventTypes, 33);
  assert.equal(stats.avgCpu, 0.2);
  assert.equal(stats.avgHeapTotal, 20);
  assert.equal(stats.avgSamples, 60);
  assert.equal(stats.trafficIn, 2_048);
  assert.equal(stats.trafficOut, 4_096);
  assert.equal(stats.forumThreads, 1);
  assert.equal(stats.signalEvents, 1);
  assert.equal(stats.announcements, 1);
  assert.ok(stats.linesOfCode > 0);
  assert.ok(stats.jsModules > 0);
  const publicPayload = JSON.stringify(stats);
  assert.doesNotMatch(publicPayload, /stats_collector|private@example\.com|Private library description|Future Game/);
  assert.doesNotMatch(publicPayload, /stats_without_progression/);
});

test('stats UI is modular, public, responsive, and protected from false backdrop closes', () => {
  const root = path.join(__dirname, '..');
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const server = read('server.js'); const markup = read('public/index.html');
  const ui = read('public/js/stats-ui.js'); const css = read('public/css/stats.css');
  assert.match(server, /url\.pathname === '\/api\/site-stats'/);
  assert.ok(server.indexOf("url.pathname === '/api/site-stats'") < server.indexOf('const user = auth.authenticate(request)'));
  assert.match(markup, /data-stats-open/);
  assert.match(markup, /src="\/js\/stats-ui\.js"/);
  assert.match(markup, /src="\/js\/mobile-action-dock\.js"/);
  assert.match(read('server/katalog-pages.js'), /src="\/js\/stats-ui\.js"/);
  assert.match(read('server/katalog-pages.js'), /src="\/js\/mobile-action-dock\.js"/);
  assert.match(ui, /controllerLoaderMarkup/);
  assert.match(ui, /pressedBackdrop/);
  assert.match(ui, /pointerdown/);
  assert.match(ui, /pointerup/);
  assert.match(ui, /formatCount\(Math\.floor\(Number\(stats\.averageLevel\)/);
  assert.match(ui, /Avg CPU \(session\)/);
  assert.match(ui, /CPU age/);
  assert.match(ui, /Traffic in/);
  assert.match(ui, /Traffic out/);
  assert.match(read('server.js'), /trafficMetrics\.trackRequest\(request, response\)/);
  assert.match(read('server.js'), /trafficMetrics\.flush\(\);[\s\S]*server\.close/);
  assert.match(read('admin/index.html'), /id="metric-traffic-in"/);
  assert.match(read('admin/js/dashboard.js'), /data\.trafficOut/);
  assert.match(css, /max-height: 80dvh/);
  assert.match(css, /column-count: 3/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.doesNotMatch(css, /\.top-actions \.stats-button \{ display: none; \}/);
  assert.match(read('public/css/theme.css'), /\.header-community-actions\.mobile-action-dock \{[\s\S]*position:fixed;[\s\S]*bottom:calc\(10px \+ env\(safe-area-inset-bottom\)\)/);
  const mobileDock = read('public/js/mobile-action-dock.js');
  assert.match(mobileDock, /document\.body\.append\(group\)/);
  assert.match(mobileDock, /home\.after\(group\)/);
  assert.match(mobileDock, /classList\.add\('mobile-action-dock', 'top-actions'\)/);
  assert.match(mobileDock, /classList\.remove\('mobile-action-dock', 'top-actions'\)/);
  assert.match(mobileDock, /!visibilityRoot\?\.hidden/);
  assert.match(mobileDock, /new MutationObserver\(placeActions\)/);
  assert.match(mobileDock, /media\.addEventListener\('change', placeActions\)/);
  assert.match(read('public/css/theme.css'), /#app-shell\[hidden\] ~ \.mobile-action-dock/);
  assert.match(read('server/katalog-pages.js'), /if \(!user\)[\s\S]*header-community-actions[\s\S]*statsButton\(\)[\s\S]*header-library-actions/);
});
