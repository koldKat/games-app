'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCoverProviderBulkManager } = require('../server/cover-provider-bulk');

test('external cover batches update exact provider matches and emit targeted events', async () => {
  const games = [{ id: 1, title: 'Matched', platform: 'Nintendo Switch', coverUrl: '' }, { id: 2, title: 'Missing', platform: 'PlayStation 5', coverUrl: '' }];
  const events = []; const updates = [];
  const data = {
    gamesMissingCovers: () => games.filter(game => !game.coverUrl), getGame: (_userId, id) => games.find(game => game.id === id),
    updateGameCover: (_userId, id, cover) => { const game = games.find(row => row.id === id); if (!game || game.coverUrl) return null; game.coverUrl = cover.url; updates.push(cover); return { ...game }; },
  };
  const manager = createCoverProviderBulkManager({ data, provider: 'testcovers', pause: async () => {},
    lookup: async (_credentials, title) => title === 'Matched' ? { gameTitle: title, url: 'https://example.com/cover.jpg' } : null,
    notify: (_userId, event, payload) => events.push([event, payload]),
  });
  const job = await manager.run(7, { clientId: 'id', clientSecret: 'secret' });
  assert.equal(job.state, 'complete'); assert.equal(job.matched, 1); assert.equal(job.unmatched, 1);
  assert.deepEqual(updates[0], { url: 'https://example.com/cover.jpg', source: 'testcovers', matchTitle: 'Matched' });
  assert.ok(events.some(([event]) => event === 'game-updated')); assert.ok(events.some(([event]) => event === 'testcovers-job'));
});

test('external cover batches preserve covers added after the queue snapshot', async () => {
  const queued = { id: 1, title: 'Race', platform: 'PC (Windows)', coverUrl: '' }; let current = { ...queued };
  const data = { gamesMissingCovers: () => [queued], getGame: () => current, updateGameCover: () => { throw new Error('must not overwrite'); } };
  current = { ...queued, coverUrl: 'https://example.com/manual.jpg' };
  const manager = createCoverProviderBulkManager({ data, provider: 'thegamesdb', lookup: async () => null, pause: async () => {} });
  const job = await manager.run(1, { apiKey: 'key' });
  assert.equal(job.skipped, 1); assert.equal(job.processed, 1);
});
