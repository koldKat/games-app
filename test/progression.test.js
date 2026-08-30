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
