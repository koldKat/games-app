const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const constants = require('../server/constants');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('shared server constants define catalogue domains and batch policy', () => {
  assert.deepEqual(constants.PEGI_RATINGS, [3, 7, 12, 16, 18]);
  assert.deepEqual(constants.OWNERSHIP_VALUES, ['owned', 'wanted']);
  assert.deepEqual(constants.OWNERSHIP_FILTER_VALUES, ['owned_physical', 'owned_digital', 'wanted']);
  assert.deepEqual(constants.PLAY_STATUS_VALUES, ['backlog', 'playing', 'completed', 'paused', 'abandoned']);
  assert.deepEqual(constants.MEDIA_FORMAT_VALUES, ['physical', 'digital', 'unknown']);
  assert.deepEqual(constants.PC_STOREFRONT_VALUES.slice(0, 3), ['Steam', 'GOG', 'Epic Games Store']);
  assert.equal(constants.TITLE_LOOKUP_MIN_LENGTH, 2);
  assert.equal(constants.TITLE_AUTOCOMPLETE_MIN_LENGTH, 3);
  assert.equal(constants.BULK_JOB.maxConsecutiveErrors, 5);
});

test('provider requests use the current shared application identity', () => {
  const providerSources = `${read('server/covers.js')}\n${read('server/pegi.js')}\n${read('server/thegamesdb.js')}`;
  assert.match(constants.APP_USER_AGENT, /Game-Kat-a-log/);
  assert.doesNotMatch(providerSources, /GamesShelf/);
  assert.match(read('server/covers.js'), /'User-Agent': APP_USER_AGENT/);
  assert.match(read('server/pegi.js'), /'User-Agent': APP_USER_AGENT/);
  assert.match(read('server/thegamesdb.js'), /'User-Agent': APP_USER_AGENT/);
});

test('browser policies name pagination, lookup, and timing contracts', () => {
  const policy = read('public/js/ui-policy.js');
  const application = read('public/app.js');
  assert.match(policy, /LIBRARY_PAGE_SIZE = 120/);
  assert.match(policy, /debounceMs: 100/);
  assert.match(application, /state\.limit \+= LIBRARY_PAGE_SIZE/);
  assert.doesNotMatch(application, /state\.limit (?:=|\+=) 120/);
});
