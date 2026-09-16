const test = require('node:test');
const assert = require('node:assert/strict');

const igdb = require('../server/igdb');
const { createIgdbBulkManager } = require('../server/igdb-bulk');

const credentials = { clientId: 'igdb-client-id', clientSecret: 'igdb-client-secret-value' };

test('IGDB maps ratings, credits, tags, platforms, and artwork', () => {
  const game = igdb.mapGame({
    id: 1942, name: 'Example Game', slug: 'example-game', summary: 'An example.', first_release_date: 1704067200,
    url: 'https://www.igdb.com/games/example-game', game_type: 8, rating: 81.26, rating_count: 42,
    aggregated_rating: 74.84, aggregated_rating_count: 7, cover: { image_id: 'co1234' },
    platforms: [{ name: 'Nintendo Switch' }], genres: [{ name: 'Adventure' }], themes: [{ name: 'Fantasy' }],
    involved_companies: [
      { publisher: true, developer: false, company: { name: 'Publisher Ltd.' } },
      { publisher: false, developer: true, company: { name: 'Studio Inc.' } },
    ],
  });
  assert.equal(game.igdbId, 1942); assert.equal(game.releaseYear, 2024); assert.equal(game.gameType, 'Remake');
  assert.deepEqual(game.platforms, ['Nintendo Switch']); assert.deepEqual(game.genres, ['Adventure']);
  assert.deepEqual(game.developers, ['Studio Inc.']); assert.equal(game.publisher, 'Publisher Ltd.');
  assert.equal(game.rating, 81.3); assert.equal(game.criticRating, 74.8); assert.equal(game.ratingCount, 42);
  assert.equal(game.coverUrl, 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1234.jpg');
  const unrated = igdb.mapGame({ id: 2, name: 'Unrated', rating: null, aggregated_rating: null });
  assert.equal(unrated.rating, null); assert.equal(unrated.criticRating, null);
});

test('IGDB search authenticates server-side and sends the required API headers', async () => {
  const originalFetch = global.fetch; const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith('https://id.twitch.tv/')) return new Response(JSON.stringify({ access_token: 'secret-token', expires_in: 3600 }), { status: 200 });
    return new Response(JSON.stringify([{ id: 9, name: 'Header Test', slug: 'header-test', platforms: [{ name: 'Steam' }] }]), { status: 200 });
  };
  try {
    const results = await igdb.searchGames(credentials, 'Header Test');
    assert.equal(results[0].title, 'Header Test'); assert.equal(calls.length, 2);
    assert.equal(calls[1].options.headers['Client-ID'], credentials.clientId);
    assert.equal(calls[1].options.headers.Authorization, 'Bearer secret-token');
    assert.match(calls[1].options.body, /search "Header Test";/); assert.match(calls[1].options.body, /aggregated_rating_count/);
  } finally { global.fetch = originalFetch; }
});

test('concurrent IGDB searches share token work and stay inside the request rate', async () => {
  const originalFetch = global.fetch; const apiTimes = []; let tokenCalls = 0;
  const parallelCredentials = { clientId: 'parallel-client-id', clientSecret: 'parallel-client-secret-value' };
  global.fetch = async url => {
    if (String(url).startsWith('https://id.twitch.tv/')) {
      tokenCalls++; return new Response(JSON.stringify({ access_token: 'parallel-token', expires_in: 3600 }), { status: 200 });
    }
    apiTimes.push(Date.now()); return new Response('[]', { status: 200 });
  };
  try {
    await Promise.all([igdb.searchGames(parallelCredentials, 'Parallel One'), igdb.searchGames(parallelCredentials, 'Parallel Two')]);
    assert.equal(tokenCalls, 1); assert.equal(apiTimes.length, 2);
    assert.ok(apiTimes[1] - apiTimes[0] >= 240, `IGDB requests were only ${apiTimes[1] - apiTimes[0]}ms apart`);
    await Promise.all([igdb.searchGames(parallelCredentials, 'Shared Query'), igdb.searchGames(parallelCredentials, 'Shared Query')]);
    assert.equal(apiTimes.length, 3);
  } finally { global.fetch = originalFetch; }
});

test('IGDB batch enrichment uses exact matches, persists metadata, and emits live updates', async () => {
  const updated = []; const events = [];
  const data = {
    gamesMissingIgdb: () => [{ id: 1, title: 'Exact', platform: 'Nintendo Switch' }, { id: 2, title: 'Miss', platform: 'Steam' }],
    getGame: (_userId, id) => ({ id, title: id === 1 ? 'Exact' : 'Miss', platform: id === 1 ? 'Nintendo Switch' : 'Steam', coverUrl: '' }),
    updateGameIgdb: (_userId, id, match) => { const game = { id, title: match.title, igdbId: match.igdbId }; updated.push(game); return game; },
  };
  const manager = createIgdbBulkManager({ data, lookup: async (_credentials, title) => title === 'Exact'
    ? { igdbId: 7, title, coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/a.jpg' } : null,
  notify: (_userId, event, payload) => events.push([event, payload]), pause: async () => {} });
  const result = await manager.run(5, credentials);
  assert.deepEqual([result.matched, result.unmatched, result.errors], [1, 1, 0]);
  assert.deepEqual(updated, [{ id: 1, title: 'Exact', igdbId: 7 }]);
  assert.ok(events.some(([event]) => event === 'game-updated'));
  assert.equal(events.at(-1)[1].job.state, 'complete');
});
