'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDescriptionBulkManager } = require('../server/description-bulk');

test('description batch uses Steam first and preserves an existing manual description', async () => {
  const games = [{ id: 1, title: 'Steam Match', platform: 'Nintendo Switch', description: '' }, { id: 2, title: 'Manual', platform: 'PC', description: 'Already written' }];
  let thegamesdbCalls = 0; const events = [];
  const data = {
    gamesMissingDescriptions: () => games.filter(game => !game.description), getGame: (_userId, id) => games.find(game => game.id === id),
    updateGameDescription: (_userId, id, match) => { const game = games.find(row => row.id === id); if (!game || game.description) return null; game.description = match.description; return { ...game }; },
  };
  const manager = createDescriptionBulkManager({ data, pause: async () => {}, notify: (_userId, event) => events.push(event), lookups: {
    steam: async title => title === 'Steam Match' ? { description: 'Steam overview', source: 'Steam Store' } : null,
    thegamesdb: async () => { thegamesdbCalls++; return null; },
  } });
  const job = await manager.run(5, { apiKey: 'key' });
  assert.equal(job.state, 'complete'); assert.equal(job.matched, 1); assert.equal(thegamesdbCalls, 0);
  assert.equal(games[0].description, 'Steam overview'); assert.ok(events.includes('game-updated'));
});

test('a TheGamesDB quota rejection pauses the description batch immediately', async () => {
  const games = [{ id: 1, title: 'Fallback', platform: 'Nintendo Switch', description: '' }, { id: 2, title: 'Not reached', platform: 'PC', description: '' }];
  let calls = 0;
  const data = { gamesMissingDescriptions: () => games.filter(game => !game.description), getGame: (_userId, id) => games.find(game => game.id === id), updateGameDescription: () => null };
  const manager = createDescriptionBulkManager({ data, pause: async () => {}, lookups: {
    steam: async () => null,
    thegamesdb: async () => { calls++; const error = new Error('TheGamesDB returned HTTP 403.'); error.status = 403; throw error; },
  } });
  const job = await manager.run(5, { apiKey: 'key' });
  assert.equal(job.state, 'failed'); assert.equal(job.processed, 1); assert.equal(calls, 1); assert.match(job.lastError, /403/);
});

test('a Steam failure is not reported as an unmatched game when TheGamesDB has no answer', async () => {
  const games = [{ id: 1, title: 'Unavailable', platform: 'PC', description: '' }];
  const data = { gamesMissingDescriptions: () => games, getGame: () => games[0], updateGameDescription: () => null };
  const manager = createDescriptionBulkManager({ data, pause: async () => {}, lookups: {
    steam: async () => { throw new Error('Steam Store unavailable.'); }, thegamesdb: async () => null,
  } });
  const job = await manager.run(5, { apiKey: 'key' });
  assert.equal(job.errors, 1); assert.equal(job.unmatched, 0); assert.match(job.lastError, /Steam Store unavailable/);
});
