const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join('/tmp', `games-random-test-${process.pid}.db`);
process.env.DB_PATH = dbPath;
const data = require('../server/db');
const auth = require('../server/auth');

test.after(() => {
  data.db.close();
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

test('random selection spans all matching groups and honors active filters', async () => {
  const user = await auth.register('random_picker', 'random-picker-password');
  const firstSwitch = data.createGame(user.id, { title: 'Alpha Game', platform: 'Nintendo Switch', playStatus: 'backlog' });
  data.createGame(user.id, { title: 'Alpha Game', platform: 'PlayStation 5', playStatus: 'backlog' });
  const beta = data.createGame(user.id, { title: 'Beta Game', platform: 'PlayStation 5', playStatus: 'completed' });
  data.createGame(user.id, { title: 'Hidden Game', platform: 'Nintendo Switch', playStatus: 'hidden' });

  const groupedAlpha = data.randomGame(user.id, {}, () => 0);
  assert.equal(groupedAlpha.id, firstSwitch.id);
  assert.deepEqual(groupedAlpha.versions.map(game => game.platform), ['Nintendo Switch', 'PlayStation 5']);
  assert.equal(data.randomGame(user.id, {}, () => 0.999999).id, beta.id);
  const exactRelease = data.randomGame(user.id, { platform: 'PlayStation 5', playStatus: 'completed' }, () => 0);
  assert.equal(exactRelease.id, beta.id);
  assert.equal(exactRelease.versions, undefined);
  assert.equal(data.randomGame(user.id, { q: 'missing title' }, () => 0), null);
});

test('reroll excludes the current group when another match exists', async () => {
  const user = await auth.register('random_reroll', 'random-reroll-password');
  const alpha = data.createGame(user.id, { title: 'Alpha Game', platform: 'Nintendo Switch' });
  data.createGame(user.id, { title: 'Alpha Game', platform: 'Steam' });
  const beta = data.createGame(user.id, { title: 'Beta Game', platform: 'Steam' });

  assert.equal(data.randomGame(user.id, { excludeId: alpha.id }, () => 0).id, beta.id);
  assert.equal(data.randomGame(user.id, { platform: 'Nintendo Switch', excludeId: alpha.id }, () => 0).id, alpha.id);
});

test('titles outside the ASCII fallback alphabet remain distinct random candidates', async () => {
  const user = await auth.register('random_unicode', 'random-unicode-password');
  const cyrillic = data.createGame(user.id, { title: 'Игра', platform: 'PC' });
  const japanese = data.createGame(user.id, { title: 'ゲーム', platform: 'PC' });
  assert.equal(data.randomGame(user.id, {}, () => 0).id, cyrillic.id);
  assert.equal(data.randomGame(user.id, {}, () => 0.999999).id, japanese.id);
});
