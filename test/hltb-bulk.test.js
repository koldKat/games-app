const test = require('node:test');
const assert = require('node:assert/strict');
const { bestExactHltb, createHltbBulkManager, needsHltb, normalize } = require('../server/hltb-bulk');

const result = (title, id = 1) => ({ id, title, url: `https://howlongtobeat.com/game/${id}`, mainStory: 8,
  mainExtra: 12, completionist: 20, allStyles: 11 });

test('HLTB batch matching only accepts one exact normalized title', () => {
  assert.equal(normalize('Pokémon™: Deluxe!'), 'pokemon deluxe');
  assert.equal(bestExactHltb('Pokémon Pokopia', [result('Pokemon Pokopia')]).id, 1);
  assert.equal(bestExactHltb('Game', [result('Game', 1), result('Game', 2)]), null);
  assert.equal(bestExactHltb('Game', [result('Game Deluxe')]), null);
  assert.equal(needsHltb({ hltbId: null }), true);
  assert.equal(needsHltb({ hltbId: 42 }), false);
});

test('HLTB batch manager updates matches and emits incremental events', async () => {
  const pending = [{ id: 1, title: 'Matched', platform: 'PC' }, { id: 2, title: 'Missing', platform: 'PC' }];
  const updates = []; const events = [];
  const data = {
    gamesMissingHltb: () => pending.filter(game => !updates.some(update => update.id === game.id)),
    updateGameHltb: (userId, id, metadata) => { const game = { ...pending.find(item => item.id === id), ...metadata, hltbId: metadata.id }; updates.push(game); return game; },
  };
  const manager = createHltbBulkManager({ data, lookup: async title => title === 'Matched' ? [result('Matched')] : [],
    pause: async () => {}, notify: (userId, event, payload) => events.push({ userId, event, payload: structuredClone(payload) }) });
  const job = await manager.run(42);
  assert.deepEqual({ state: job.state, matched: job.matched, unmatched: job.unmatched, errors: job.errors },
    { state: 'complete', matched: 1, unmatched: 1, errors: 0 });
  assert.equal(updates.length, 1);
  assert.ok(events.some(item => item.event === 'game-updated' && item.payload.game.id === 1));
  assert.ok(events.some(item => item.event === 'hltb-job' && item.payload.job.state === 'complete'));
});

test('HLTB jobs skip records enriched after their initial snapshot', async () => {
  const queued = { id: 3, title: 'Already handled', platform: 'Nintendo Switch' }; let lookups = 0;
  const data = {
    gamesMissingHltb: () => [queued], getGame: () => ({ ...queued, hltbId: 99 }),
    updateGameHltb: () => { throw new Error('must not update'); },
  };
  const manager = createHltbBulkManager({ data, lookup: async () => { lookups++; return []; }, pause: async () => {} });
  const job = await manager.run(12);
  assert.equal(lookups, 0);
  assert.deepEqual({ state: job.state, processed: job.processed, skipped: job.skipped }, { state: 'complete', processed: 1, skipped: 1 });
});

test('HLTB batch scan pauses after five consecutive provider errors', async () => {
  const pending = Array.from({ length: 7 }, (_, index) => ({ id: index + 1, title: `Game ${index + 1}`, platform: 'PC' }));
  const events = [];
  const manager = createHltbBulkManager({ data: { gamesMissingHltb: () => pending, updateGameHltb: () => null },
    lookup: async () => { throw new Error('provider unavailable'); }, pause: async () => {},
    notify: (userId, event, payload) => events.push({ event, payload: structuredClone(payload) }) });
  const job = await manager.run(5);
  assert.deepEqual({ state: job.state, processed: job.processed, errors: job.errors }, { state: 'failed', processed: 5, errors: 5 });
  assert.ok(events.some(item => item.event === 'hltb-job' && item.payload.job.state === 'failed'));
});
