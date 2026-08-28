'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesPlatform, oneExactGameCover, platformKey } = require('../server/cover-provider-utils');
const thegamesdb = require('../server/thegamesdb');

test('cover-provider platform matching understands PC storefronts and provider names', () => {
  assert.equal(platformKey('Steam'), 'windows');
  assert.equal(platformKey('PC (Microsoft Windows)'), 'windows');
  assert.equal(matchesPlatform('GOG', ['PC (Microsoft Windows)']), true);
  assert.equal(matchesPlatform('PlayStation 5', ['Sony PlayStation 5']), true);
  assert.equal(matchesPlatform('Game Boy', ['Nintendo Game Boy']), true);
  assert.equal(matchesPlatform('Nintendo Switch', ['PlayStation 5']), false);
});

test('TheGamesDB parser keeps front boxart and constructs CDN URLs', () => {
  const results = thegamesdb.parseCovers({
    data: { games: [{ id: 53, game_title: 'Sonic', platform: 18 }] },
    include: { boxart: { base_url: { original: 'https://cdn.example/original/', small: 'https://cdn.example/small/' }, data: {
      53: [{ id: 1, type: 'boxart', side: 'back', filename: 'back.jpg' }, { id: 2, type: 'boxart', side: 'front', filename: 'front.jpg', resolution: '800x1100' }],
    } }, platform: { data: { 18: { id: 18, name: 'Sega Genesis' } } } },
  });
  assert.equal(results.length, 1); assert.equal(results[0].url, 'https://cdn.example/original/front.jpg');
  assert.deepEqual([results[0].width, results[0].height, results[0].platforms[0]], [800, 1100, 'Sega Genesis']);
});

test('TheGamesDB description parser retains overview text and provenance', () => {
  const results = thegamesdb.parseDescriptions({ data: { games: [{ id: 53, game_title: 'Sonic', platform: 18, overview: 'Fast blue hedgehog.' }] } });
  assert.deepEqual(results, [{ providerGameId: 53, gameTitle: 'Sonic', description: 'Fast blue hedgehog.', source: 'TheGamesDB', sourceUrl: 'https://thegamesdb.net/game.php?id=53', platform: 18 }]);
});

test('TheGamesDB exact description lookup normalizes one platform-specific overview', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/v1/Platforms') return new Response(JSON.stringify({ data: { platforms: [{ id: 4971, name: 'Nintendo Switch' }] } }), { status: 200 });
    return new Response(JSON.stringify({ data: { games: [{ id: 7, game_title: 'Example™ Game', platform: 4971, overview: 'Platform-specific overview.' }] } }), { status: 200 });
  };
  try {
    const result = await thegamesdb.bestExactDescription({ apiKey: 'description-test-key' }, 'Example Game', 'Nintendo Switch');
    assert.equal(result.description, 'Platform-specific overview.'); assert.equal(result.source, 'TheGamesDB');
  } finally { global.fetch = originalFetch; }
});

test('batch selection permits several regional covers for one exact game but rejects ambiguous games', () => {
  const cover = id => ({ providerGameId: id, gameTitle: 'Example', url: `https://example.com/${id}.jpg` });
  assert.equal(oneExactGameCover('Example', [cover(1), cover(1)]).providerGameId, 1);
  assert.equal(oneExactGameCover('Example', [cover(1), cover(2)]), null);
});

test('TheGamesDB search requests front boxart for the resolved platform', async () => {
  const originalFetch = global.fetch; const calls = [];
  global.fetch = async url => {
    const parsed = new URL(String(url)); calls.push(parsed);
    if (parsed.pathname === '/v1/Platforms') return new Response(JSON.stringify({ data: { platforms: [{ id: 4971, name: 'Nintendo Switch' }] } }), { status: 200 });
    return new Response(JSON.stringify({ data: { games: [{ id: 4, game_title: 'Example', platform: 4971 }] }, include: {
      boxart: { base_url: { original: 'https://cdn.example/', small: 'https://cdn.example/small/' }, data: { 4: [{ type: 'boxart', side: 'front', filename: 'example.jpg' }] } },
      platform: { data: { 4971: { id: 4971, name: 'Nintendo Switch' } } },
    } }), { status: 200 });
  };
  try {
    const results = await thegamesdb.searchCovers({ apiKey: 'thegamesdb-test-key' }, 'Example', 'Nintendo Switch');
    assert.equal(results[0].source, 'thegamesdb'); assert.equal(calls.length, 2);
    assert.equal(calls[1].searchParams.get('filter[platform]'), '4971'); assert.equal(calls[1].searchParams.get('include'), 'boxart,platform');
  } finally { global.fetch = originalFetch; }
});

test('TheGamesDB accepts the API success code in its documented string form', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === '/v1/Platforms') return new Response(JSON.stringify({ code: '200', data: { platforms: [] } }), { status: 200 });
    return new Response(JSON.stringify({ code: '200', data: { games: [] }, include: {} }), { status: 200 });
  };
  try {
    assert.deepEqual(await thegamesdb.searchCovers({ apiKey: 'string-code-test-key' }, 'String Code', ''), []);
  } finally { global.fetch = originalFetch; }
});
