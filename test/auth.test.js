const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join('/tmp', `games-auth-test-${process.pid}.db`);
process.env.DB_PATH = dbPath;
const data = require('../server/db');
const auth = require('../server/auth');

test.after(() => {
  data.db.close();
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

test('account libraries remain isolated and unowned rows are never claimed by username', async () => {
  data.db.prepare(`INSERT INTO games (title, platform) VALUES ('Unowned Game', 'Nintendo Switch')`).run();
  const other = await auth.register('other_user', 'long-password', 'Other@Example.com');
  assert.equal(other.email, 'other@example.com');
  assert.equal(data.stats(other.id).total, 0);

  const owner = await auth.register('library_owner', 'another-long-password');
  assert.equal(data.stats(owner.id).total, 0);
  assert.equal(data.stats(other.id).total, 0);
  assert.equal(data.db.prepare('SELECT COUNT(*) count FROM games WHERE user_id IS NULL').get().count, 1);

  data.createGame(owner.id, { title: 'Owned Game', platform: 'Nintendo Switch' });
  assert.equal(data.stats(owner.id).total, 1);

  const created = data.createGame(other.id, { title: 'Private Game', platform: 'Evercade' });
  assert.equal(data.getGame(owner.id, created.id), undefined);
  assert.equal(data.updateGame(owner.id, created.id, { title: 'No Access', platform: 'Evercade' }), null);
  assert.equal(data.deleteGame(owner.id, created.id), false);
  assert.equal(data.stats(other.id).total, 1);
  await assert.rejects(() => auth.register('third_user', 'third-password', 'other@example.com'), /already in use/);
});

test('login, sessions, and account password changes work', async () => {
  const user = await auth.login('LIBRARY_OWNER', 'another-long-password');
  assert.equal(user.username, 'library_owner');
  const token = auth.createSession(user.id);
  const request = { headers: { authorization: `Bearer ${token}` } };
  assert.equal(auth.authenticate(request).id, user.id);
  const updated = await auth.updateAccount(user.id, { username: 'library_owner', currentPassword: 'another-long-password', newPassword: 'replacement-password' });
  assert.equal(updated.sessionInvalidated, true);
  assert.equal(auth.authenticate(request), null);
  assert.ok(await auth.login('library_owner', 'replacement-password'));
  assert.equal(await auth.login('library_owner', 'another-long-password'), null);
  assert.equal(auth.updateAvatar(user.id, '1_test.jpg'), '/avatars/1_test.jpg');
  assert.equal(auth.avatarPath(user.id), '1_test.jpg');
  assert.equal((await auth.login('library_owner', 'replacement-password')).avatarUrl, '/avatars/1_test.jpg');
  assert.equal(auth.updateAvatar(user.id, null), null);
  assert.equal(auth.avatarPath(user.id), null);
});
