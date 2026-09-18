const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const constants = require('../server/constants');
const { ACCOUNT_LIMITS, GAME_LIMITS, KATALOG_LIMITS } = require('../server/validation-policy');
const siteConfig = require('../server/site-config');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('shared server constants define catalogue domains and batch policy', () => {
  assert.deepEqual(constants.PEGI_RATINGS, [3, 7, 12, 16, 18]);
  assert.deepEqual(constants.OWNERSHIP_VALUES, ['owned', 'wanted']);
  assert.deepEqual(constants.OWNERSHIP_FILTER_VALUES, ['owned_physical', 'owned_digital', 'wanted', 'hidden']);
  assert.equal(constants.MULTIPLATFORM_FILTER_VALUE, '__multiple_platforms__');
  assert.deepEqual(constants.STORED_PLAY_STATUS_VALUES, ['backlog', 'playing', 'completed', 'paused', 'abandoned']);
  assert.deepEqual(constants.PLAY_STATUS_VALUES, ['backlog', 'playing', 'completed', 'paused', 'abandoned', 'hidden']);
  assert.deepEqual(constants.MEDIA_FORMAT_VALUES, ['physical', 'digital', 'unknown']);
  assert.deepEqual(constants.PC_STOREFRONT_VALUES.slice(0, 3), ['Steam', 'GOG', 'Epic Games Store']);
  assert.equal(constants.TITLE_LOOKUP_MIN_LENGTH, 2);
  assert.equal(constants.TITLE_AUTOCOMPLETE_MIN_LENGTH, 3);
  assert.equal(constants.BULK_JOB.maxConsecutiveErrors, 5);
  assert.equal(constants.UI_LOCALE, 'en-US');
});

test('provider requests use the current shared application identity', () => {
  const providerSources = `${read('server/covers.js')}\n${read('server/pegi.js')}\n${read('server/thegamesdb.js')}\n${read('server/steam-store.js')}`;
  assert.match(constants.APP_USER_AGENT, /Game-Kat-a-log/);
  assert.doesNotMatch(providerSources, /GamesShelf/);
  assert.match(read('server/covers.js'), /'User-Agent': APP_USER_AGENT/);
  assert.match(read('server/pegi.js'), /'User-Agent': APP_USER_AGENT/);
  assert.match(read('server/thegamesdb.js'), /'User-Agent': APP_USER_AGENT/);
  assert.match(read('server/steam-store.js'), /'User-Agent': APP_USER_AGENT/);
});

test('browser policies name pagination, lookup, and timing contracts', () => {
  const policy = read('public/js/ui-policy.js');
  const application = read('public/app.js');
  assert.match(policy, /LIBRARY_PAGE_SIZE = 50/);
  assert.match(policy, /debounceMs: 100/);
  assert.match(application, /state\.page \+= direction === 'next' \? 1 : -1/);
  assert.doesNotMatch(application, /state\.limit/);
  assert.match(policy, /UI_LOCALE = 'en-US'/);
  assert.match(policy, /MULTIPLATFORM_FILTER_VALUE = '__multiple_platforms__'/);
  assert.match(read('public/js/game-labels.js'), /wanted: 'Wishlisted'/);
  assert.match(read('public/js/site-config.js'), /GITHUB_URL/);
});

test('site identity and input limits have explicit small policy modules', () => {
  assert.equal(siteConfig.PUBLIC_URL, 'https://gamekat.net');
  assert.equal(siteConfig.PUBLIC_HOSTNAME, 'gamekat.net');
  assert.equal(ACCOUNT_LIMITS.usernameMax, 32);
  assert.equal(GAME_LIMITS.platformMax, 80);
  assert.equal(GAME_LIMITS.notesMax, 2_000);
  assert.equal(GAME_LIMITS.descriptionMax, 12_000);
  assert.equal(KATALOG_LIMITS.pageSize, 80);
  assert.equal(require('../server/runtime-policy').siteStatsCacheMs, 15_000);
  assert.equal(require('../server/hardware-policy').CPU_RELEASE_DATES['i7-4785T'], '2014-05-11');
  const productionSources = [read('server/auth.js'), read('server/admin.js')].join('\n');
  assert.doesNotMatch(productionSources, /['"]koldkat['"]/i);
});

test('user-facing dates and numbers never inherit a device locale', () => {
  const sources = [
    'public/app.js', 'public/js/activity-feed.js', 'public/js/cover-provider-settings.js',
    'public/js/patch-ui.js', 'public/js/progression-ui.js', 'public/js/public-profile.js',
    'admin/js/core.js', 'admin/js/patch.js', 'admin/js/announcements.js',
    'server/activity.js', 'server/forum-pages.js', 'server/katalog-pages.js',
  ].map(read).join('\n');
  assert.doesNotMatch(sources, /\.toLocale(?:String|DateString|TimeString)\(\s*\)/);
  assert.doesNotMatch(sources, /\.toLocaleString\(\s*\[\s*\]/);
  assert.doesNotMatch(sources, /Intl\.DateTimeFormat\((?:undefined|'en-GB')/);
});
