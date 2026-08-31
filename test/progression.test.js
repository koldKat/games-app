const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join('/tmp', `games-progression-test-${process.pid}.db`);
process.env.DB_PATH = dbPath;
const data = require('../server/db');
const auth = require('../server/auth');
const { computeLevel, progressForXp, xpForLevel, titleForLevel } = require('../server/progression-policy');
const { createProgressionService } = require('../server/progression-service');

test.after(() => { data.db.close(); for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true }); });

test('uses the Gamebooks triangular level curve and collector titles', () => {
  assert.equal(xpForLevel(1), 1000); assert.equal(xpForLevel(2), 3000); assert.equal(xpForLevel(10), 55000);
  assert.equal(computeLevel(2999), 1); assert.equal(computeLevel(3000), 2);
  assert.equal(progressForXp(55000).level, 10); assert.equal(titleForLevel(60), 'Canon Keeper');
});

test('awards each account event/ref combination only once', async () => {
  const user = await auth.register('xp_idempotent', 'password-one');
  const first = data.progression.award(user.id, 'favourite_added', 'game:1');
  const repeat = data.progression.award(user.id, 'favourite_added', 'game:1');
  assert.equal(first.awarded, true); assert.equal(repeat.awarded, false); assert.equal(data.progression.info(user.id).xp, 10);
});

test('backfill credits existing enriched games once and remains safe to rerun', async () => {
  const user = await auth.register('xp_backfill', 'password-two');
  const game = data.createGame(user.id, { title: 'Test Shelf', platform: 'PC', ownership: 'wanted', favorite: true, rating: 4,
    publisher: 'Studio', releaseYear: 2020, description: 'A properly recorded game.', coverUrl: '/covers/0123456789abcdef0123456789abcdef.jpg',
    pegi: 12, pegiUrl: 'https://pegi.info/test', hltbId: 7, hltbTitle: 'Test Shelf', hltbMainStory: 5 });
  const service = createProgressionService({ store: data.progression, data });
  const first = service.backfill(user.id); const second = service.backfill(user.id);
  assert.ok(first.awards.length > 0); assert.equal(second.awards.length, 0); assert.ok(first.progress.xp >= 50); assert.equal(game.title, 'Test Shelf');
});

test('notes and fulfilled wishlists award their one-time events', async () => {
  const user = await auth.register('xp_notes', 'password-four');
  const game = data.createGame(user.id, { title: 'Notes Game', platform: 'PC', ownership: 'wanted' });
  const service = createProgressionService({ store: data.progression, data });
  const updated = { ...game, ownership: 'owned', notes: 'Steelbook edition.' };
  const events = service.recordGame(user.id, updated, { previous: game }).awards.map(item => item.event);
  assert.ok(events.includes('note_added')); assert.ok(events.includes('wishlist_fulfilled'));
  assert.equal(service.recordGame(user.id, updated, { previous: game }).awards.some(item => ['note_added', 'wishlist_fulfilled'].includes(item.event)), false);
});

test('public Kat·a·log contributions award once and safely backfill', async () => {
  const user = await auth.register('xp_contributor', 'password-five');
  const game = data.createGame(user.id, { title: 'Public Record', platform: 'PC' });
  const service = createProgressionService({ store: data.progression, data });
  assert.deepEqual(service.recordGame(user.id, game, { catalogueContribution: true }).awards.filter(item => item.event === 'catalogue_contribution').map(item => item.amount), [30]);
  assert.equal(service.recordGame(user.id, game, { catalogueContribution: true }).awards.some(item => item.event === 'catalogue_contribution'), false);
  const next = data.createGame(user.id, { title: 'Another Public Record', platform: 'PC' });
  const backfill = service.backfillCatalogueContributions([{ userId: user.id, gameId: game.id }, { userId: user.id, gameId: next.id }]);
  assert.deepEqual(backfill.awards.map(item => item.event), ['catalogue_contribution']);
});

test('awards report each crossed collector level for Signal to record', async () => {
  const user = await auth.register('xp_signal_level', 'password-six');
  const game = data.createGame(user.id, { title: 'Signal Level', platform: 'PC' });
  data.progression.setConfig({ game_added: 1000 });
  const service = createProgressionService({ store: data.progression, data });
  const award = service.recordGame(user.id, game, { created: true }).awards.find(item => item.event === 'game_added');
  assert.deepEqual(award.levels, [{ level: 1, title: 'Shelf Scout', previousTitle: 'Uncatalogued' }]);
  data.progression.setConfig({ game_added: 50 });
});
