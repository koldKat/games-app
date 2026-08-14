const test = require('node:test');
const assert = require('node:assert/strict');
const { bestExactPegi, createPegiBulkManager, matchesPlatform, needsPegiMetadata, normalize } = require('../server/pegi-bulk');

const result = (title, platform, publisher = 'Publisher') => ({
  title, publisher, pegi: 7, releases: [`${platform} - 01/01/2025`], descriptors: ['Fear'],
  advice: 'Advice', outline: 'Outline', contentIssues: 'Issues', otherIssues: '', releaseYear: 2025, pegiUrl: 'https://pegi.info/',
});

test('PEGI batch matching is exact-title and platform-aware', () => {
  assert.equal(normalize('Pokémon™: Deluxe!'), 'pokemon deluxe');
  assert.equal(matchesPlatform({ platform: 'PC (Windows)' }.platform, result('Game', 'PC')), true);
  for (const storefront of ['Steam', 'GOG', 'Epic Games Store']) {
    assert.equal(matchesPlatform(storefront, result('Game', 'PC')), true);
  }
  assert.equal(bestExactPegi({ title: 'Minecraft', platform: 'Nintendo Switch' }, [result('Minecraft', 'PC'), result('Minecraft', 'Nintendo Switch')]).releases[0], 'Nintendo Switch - 01/01/2025');
  assert.equal(bestExactPegi({ title: 'Minecraft', platform: 'Nintendo Switch' }, [result('Minecraft', 'Nintendo Switch', 'One'), result('Minecraft', 'Nintendo Switch', 'Two')]), null);
  assert.equal(bestExactPegi({ title: 'Minecraft', platform: 'Nintendo Switch' }, [result('Minecraft Deluxe', 'Nintendo Switch')]), null);
  assert.equal(needsPegiMetadata({ title: 'Game', platform: 'Nintendo Switch', pegiDescriptors: [], pegiReleases: [] }), true);
  assert.equal(needsPegiMetadata({ title: 'Game', platform: 'Nintendo Switch', pegiUrl: 'https://pegi.info/', pegiDescriptors: [], pegiReleases: [] }), false);
});

test('PEGI batch manager updates matches and emits incremental events', async () => {
  const pending = [{ id: 1, title: 'Matched', platform: 'Nintendo Switch' }, { id: 2, title: 'Missing', platform: 'PC (Windows)' }];
  const updates = []; const events = [];
  const data = {
    gamesMissingPegiMetadata: () => pending.filter(game => !updates.some(update => update.id === game.id)),
    updateGamePegiMetadata: (userId, id, metadata) => { const game = { ...pending.find(item => item.id === id), ...metadata, id }; updates.push(game); return game; },
  };
  const manager = createPegiBulkManager({ data, lookup: async title => title === 'Matched' ? [result('Matched', 'Nintendo Switch')] : [], pause: async () => {}, notify: (userId, event, payload) => events.push({ userId, event, payload }) });
  const job = await manager.run(42);
  assert.deepEqual({ state: job.state, matched: job.matched, unmatched: job.unmatched, errors: job.errors }, { state: 'complete', matched: 1, unmatched: 1, errors: 0 });
  assert.equal(updates.length, 1);
  assert.ok(events.some(item => item.event === 'game-updated' && item.payload.game.id === 1));
  assert.ok(events.some(item => item.event === 'pegi-job' && item.payload.job.state === 'complete'));
});

test('unexpected PEGI job failures are reported with complete counters', async () => {
  let reads = 0; const events = [];
  const data = {
    gamesMissingPegiMetadata: () => { if (++reads === 2) throw new Error('database unavailable'); return []; },
    updateGamePegiMetadata: () => null,
  };
  const manager = createPegiBulkManager({ data, lookup: async () => [], pause: async () => {}, notify: (userId, event, payload) => events.push({ userId, event, payload }) });
  assert.deepEqual(manager.start(8), { started: true, missing: 0 });
  await new Promise(resolve => setImmediate(resolve));
  const failed = events.find(item => item.event === 'pegi-job')?.payload.job;
  assert.equal(failed.state, 'failed');
  assert.deepEqual({ total: failed.total, processed: failed.processed, matched: failed.matched, unmatched: failed.unmatched, errors: failed.errors }, { total: 0, processed: 0, matched: 0, unmatched: 0, errors: 1 });
});

test('PEGI jobs skip records enriched after their initial snapshot', async () => {
  const queued = { id: 3, title: 'Already handled', platform: 'Nintendo Switch' }; let lookups = 0;
  const data = {
    gamesMissingPegiMetadata: () => [queued],
    getGame: () => ({ ...queued, pegiUrl: 'https://pegi.info/already', pegiDescriptors: [], pegiReleases: [] }),
    updateGamePegiMetadata: () => { throw new Error('must not update'); },
  };
  const manager = createPegiBulkManager({ data, lookup: async () => { lookups++; return []; }, pause: async () => {} });
  const job = await manager.run(12);
  assert.equal(lookups, 0);
  assert.deepEqual({ state: job.state, processed: job.processed, skipped: job.skipped, current: job.current }, { state: 'complete', processed: 1, skipped: 1, current: '' });
});
