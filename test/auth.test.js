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

  const created = data.createGame(other.id, {
    title: 'Private Game', platform: 'Evercade', pegiDescriptors: ['Fear', 'Paid random items'],
    pegiReleases: ['Evercade - 12/08/2026'], pegiAdvice: 'Suitable for older players.',
    pegiOutline: 'A private test game.', pegiContentIssues: 'Mild fear.', pegiOtherIssues: 'Optional purchases.',
  });
  assert.deepEqual(created.pegiDescriptors, ['Fear', 'Paid random items']);
  assert.deepEqual(created.pegiReleases, ['Evercade - 12/08/2026']);
  assert.equal(created.pegiAdvice, 'Suitable for older players.');
  assert.equal(data.getGame(other.id, created.id).pegiOtherIssues, 'Optional purchases.');
  assert.equal(data.getGame(owner.id, created.id), undefined);
  assert.equal(data.updateGame(owner.id, created.id, { title: 'No Access', platform: 'Evercade' }), null);
  assert.equal(data.deleteGame(owner.id, created.id), false);
  assert.equal(data.stats(other.id).total, 1);

  const pending = data.createGame(other.id, {
    title: 'Needs PEGI', platform: 'Nintendo Switch', ownership: 'wanted', notes: 'Keep this note.',
  });
  assert.ok(data.gamesMissingPegiMetadata(other.id).some(game => game.id === pending.id));
  assert.ok(!data.gamesMissingPegiMetadata(owner.id).some(game => game.id === pending.id));
  const enriched = data.updateGamePegiMetadata(other.id, pending.id, {
    title: 'Needs PEGI', rating: 7, publisher: 'Test Publisher', year: 2026,
    url: 'https://pegi.info/example', descriptors: ['Fear'], releases: ['Nintendo Switch - 12/08/2026'],
    advice: 'Suitable for most players.', outline: 'An example.', contentIssues: 'Mild fear.', otherIssues: '',
  });
  assert.equal(enriched.ownership, 'wanted');
  assert.equal(enriched.notes, 'Keep this note.');
  assert.equal(enriched.pegi, 7);
  assert.deepEqual(enriched.pegiDescriptors, ['Fear']);
  assert.ok(!data.gamesMissingPegiMetadata(other.id).some(game => game.id === pending.id));
  assert.equal(data.updateGamePegiMetadata(other.id, pending.id, { pegi: 18, pegiUrl: 'https://pegi.info/overwrite' }), null);
  assert.equal(data.getGame(other.id, pending.id).pegi, 7);
  assert.equal(data.updateGamePegiMetadata(owner.id, pending.id, { rating: 18 }), null);

  const coverCandidate = data.createGame(other.id, { title: 'Cover Race', platform: 'Nintendo Switch' });
  assert.ok(data.updateGameCover(other.id, coverCandidate.id, { url: 'https://example.com/first.jpg', source: 'test', matchTitle: 'Cover Race' }));
  assert.equal(data.updateGameCover(other.id, coverCandidate.id, { url: 'https://example.com/second.jpg', source: 'test', matchTitle: 'Wrong' }), null);
  assert.equal(data.getGame(other.id, coverCandidate.id).coverUrl, 'https://example.com/first.jpg');
  assert.deepEqual(data.listGames(other.id, { missing: 'pegi' }).map(game => game.id), [coverCandidate.id]);
  assert.ok(data.listGames(other.id, { missing: 'cover' }).some(game => game.id === pending.id));
  assert.ok(!data.listGames(other.id, { missing: 'cover' }).some(game => game.id === coverCandidate.id));
  assert.ok(!data.listGames(other.id, { missing: 'pegi' }).some(game => game.platform === 'Evercade'));
  assert.ok(data.listGames(other.id, { missing: 'either' }).length > data.listGames(other.id, { missing: 'both' }).length);
  const switchCopy = data.createGame(other.id, { title: 'Shared Adventure', platform: 'Nintendo Switch' });
  data.createGame(other.id, { title: 'Shared Adventure', platform: 'PlayStation 5' });
  const titleMatches = data.searchGameTitles(other.id, 'shared adventure');
  assert.equal(titleMatches.length, 2);
  assert.ok(titleMatches.some(game => game.id === switchCopy.id && game.platform === 'Nintendo Switch'));
  assert.deepEqual(data.searchGameTitles(owner.id, 'shared adventure'), []);
  assert.equal(data.findDuplicateGames(other.id, '  SHARED   Adventure ', 'nintendo switch').length, 1);
  assert.equal(data.findDuplicateGames(other.id, 'Shared Adventure', 'Xbox Series X|S').length, 0);
  assert.equal(data.findDuplicateGames(owner.id, 'Shared Adventure', 'Nintendo Switch').length, 0);
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
