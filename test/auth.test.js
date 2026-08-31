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
  data.setCoverProviderCredentials(owner.id, 'thegamesdb', { apiKey: 'owner-key' });
  assert.deepEqual(data.coverProviderCredentials(owner.id, 'thegamesdb'), { apiKey: 'owner-key' });
  assert.equal(data.coverProviderCredentials(other.id, 'thegamesdb'), null);
  data.setCoverProviderCredentials(owner.id, 'thegamesdb', null);
  assert.equal(data.coverProviderCredentials(owner.id, 'thegamesdb'), null);
  assert.equal(data.db.prepare('SELECT COUNT(*) count FROM games WHERE user_id IS NULL').get().count, 1);

  data.createGame(owner.id, { title: 'Owned Game', platform: 'Nintendo Switch' });
  assert.throws(() => data.createGame(owner.id, { title: 'Removed State', platform: 'PC', ownership: 'unavailable' }),
    /Collection must be Owned or Wishlisted/);
  assert.equal(data.stats(owner.id).total, 1);
  data.createGame(owner.id, { title: 'Digital Game', platform: 'PC (Windows)', mediaFormat: 'digital' });
  assert.deepEqual(data.listGames(owner.id, { ownership: 'owned_physical' }).map(game => game.title), ['Owned Game']);
  assert.deepEqual(data.listGames(owner.id, { ownership: 'owned_digital' }).map(game => game.title), ['Digital Game']);
  assert.equal(data.stats(owner.id).ownedFormats.find(row => row.label === 'physical').count, 1);
  assert.equal(data.stats(owner.id).ownedFormats.find(row => row.label === 'digital').count, 1);

  const created = data.createGame(other.id, {
    title: 'Private Game', platform: 'Evercade', pegiDescriptors: ['Fear', 'Paid random items'],
    pegiReleases: ['Evercade - 12/08/2026'], pegiAdvice: 'Suitable for older players.',
    pegiOutline: 'A private test game.', pegiContentIssues: 'Mild fear.', pegiOtherIssues: 'Optional purchases.', rating: 4.5,
  });
  assert.deepEqual(created.pegiDescriptors, ['Fear', 'Paid random items']);
  assert.deepEqual(created.pegiReleases, ['Evercade - 12/08/2026']);
  assert.equal(created.rating, 4.5);
  assert.equal(created.pegiAdvice, 'Suitable for older players.');
  assert.equal(data.getGame(other.id, created.id).pegiOtherIssues, 'Optional purchases.');
  assert.equal(data.getGame(owner.id, created.id), undefined);
  assert.equal(data.updateGame(owner.id, created.id, { title: 'No Access', platform: 'Evercade' }), null);
  assert.equal(data.deleteGame(owner.id, created.id), false);
  assert.equal(data.stats(other.id).total, 1);

  assert.throws(() => data.createGame(other.id, { title: 'Bad Rating', platform: 'Nintendo Switch', rating: 4.25 }), /half-star steps/);

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
  data.db.prepare("UPDATE games SET updated_at='2026-01-02 03:04:05' WHERE id=?").run(coverCandidate.id);
  assert.ok(data.replaceGameCoverUrl(other.id, coverCandidate.id, 'https://example.com/first.jpg', '/covers/0123456789abcdef0123456789abcdef.jpg'));
  assert.equal(data.getGame(other.id, coverCandidate.id).updatedAt, '2026-01-02 03:04:05');
  assert.ok(data.randomShowcaseCovers(20).includes('/covers/0123456789abcdef0123456789abcdef.jpg'));
  assert.deepEqual(data.listGames(other.id, { missing: 'pegi' }).map(game => game.id), [coverCandidate.id]);
  assert.ok(data.listGames(other.id, { missing: 'cover' }).some(game => game.id === pending.id));
  assert.ok(!data.listGames(other.id, { missing: 'cover' }).some(game => game.id === coverCandidate.id));
  assert.ok(!data.listGames(other.id, { missing: 'pegi' }).some(game => game.platform === 'Evercade'));
  assert.ok(data.listGames(other.id, { missing: 'either' }).length > data.listGames(other.id, { missing: 'both' }).length);
  assert.ok(data.listGames(other.id, { missing: 'description' }).some(game => game.id === coverCandidate.id));
  const described = data.updateGameDescription(other.id, coverCandidate.id, { description: 'A durable game overview.', source: 'Steam Store', sourceUrl: 'https://store.steampowered.com/app/1/' });
  assert.equal(described.descriptionSource, 'Steam Store');
  assert.ok(!data.listGames(other.id, { missing: 'description' }).some(game => game.id === coverCandidate.id));
  const hltbCandidate = data.createGame(other.id, { title: 'Timed Adventure', platform: 'PC (Windows)' });
  assert.ok(data.gamesMissingHltb(other.id).some(game => game.id === hltbCandidate.id));
  const timed = data.updateGameHltb(other.id, hltbCandidate.id, { id: 1234, title: 'Timed Adventure',
    url: 'https://howlongtobeat.com/game/1234', mainStory: 8.25, mainExtra: 13.5, completionist: 22, allStyles: 12.75 });
  assert.deepEqual([timed.hltbMainStory, timed.hltbMainExtra, timed.hltbCompletionist, timed.hltbAllStyles], [8.25, 13.5, 22, 12.75]);
  assert.equal(data.updateGameHltb(other.id, hltbCandidate.id, { id: 9999, title: 'Wrong' }), null);
  assert.ok(!data.listGames(other.id, { missing: 'hltb' }).some(game => game.id === hltbCandidate.id));
  assert.ok(data.listGames(owner.id, { missing: 'hltb' }).every(game => game.id !== hltbCandidate.id));
  const shortGame = data.createGame(other.id, { title: 'Short Adventure', platform: 'PC (Windows)', releaseYear: 2024 });
  data.updateGameHltb(other.id, shortGame.id, { id: 1235, title: 'Short Adventure', mainStory: 2,
    mainExtra: 4, completionist: 7, allStyles: 3.5 });
  assert.deepEqual(data.listGames(other.id, { sort: 'hltb_main_short' }).slice(0, 2).map(game => game.title), ['Short Adventure', 'Timed Adventure']);
  assert.deepEqual(data.listGames(other.id, { sort: 'hltb_main_long' }).slice(0, 2).map(game => game.title), ['Timed Adventure', 'Short Adventure']);
  assert.deepEqual(data.listGames(other.id, { sort: 'year_desc' }).slice(0, 2).map(game => game.title), ['Needs PEGI', 'Short Adventure']);
  const switchCopy = data.createGame(other.id, { title: 'Shared Adventure', platform: 'Nintendo Switch' });
  data.createGame(other.id, { title: 'Shared Adventure', platform: 'PlayStation 5' });
  const titleMatches = data.searchGameTitles(other.id, 'shared adventure');
  assert.equal(titleMatches.length, 2);
  assert.ok(titleMatches.some(game => game.id === switchCopy.id && game.platform === 'Nintendo Switch'));
  assert.deepEqual(data.searchGameTitles(owner.id, 'shared adventure'), []);
  assert.equal(data.findDuplicateGames(other.id, '  SHARED   Adventure ', 'nintendo switch').length, 1);
  assert.equal(data.findDuplicateGames(other.id, 'Shared Adventure', 'Xbox Series X|S').length, 0);
  assert.equal(data.findDuplicateGames(owner.id, 'Shared Adventure', 'Nintendo Switch').length, 0);
  const accented = data.createGame(other.id, { title: 'Pokémon Pokopia', platform: 'Nintendo Switch 2', publisher: 'Pokémon Company' });
  assert.deepEqual(data.listGames(other.id, { q: 'Pokemon Pokopia' }).map(game => game.id), [accented.id]);
  assert.ok(data.searchGameTitles(other.id, 'Pokemon Pokopia').some(game => game.id === accented.id));
  assert.equal(data.findDuplicateGames(other.id, 'Pokemon Pokopia', 'Nintendo Switch 2').length, 1);
  await assert.rejects(() => auth.register('third_user', 'third-password', 'other@example.com'), /already in use/);
});

test('login, sessions, and account password changes work', async () => {
  const user = await auth.login('LIBRARY_OWNER', 'another-long-password');
  assert.equal(user.username, 'library_owner');
  const token = auth.createSession(user.id);
  const request = { headers: { authorization: `Bearer ${token}` } };
  assert.equal(auth.authenticate(request).id, user.id);
  const cookie = auth.sessionCookie(token, { headers: { 'x-forwarded-proto': 'https' }, socket: {} });
  assert.match(cookie, /^games_session=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=1209600; Secure$/);
  assert.equal(auth.authenticate({ headers: { cookie }, socket: {} }).id, user.id);
  assert.equal(auth.refreshSessionCookie({ headers: { authorization: `Bearer ${token}` }, socket: {} }), '');
  assert.match(auth.refreshSessionCookie({ headers: { cookie }, socket: {} }), /^games_session=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=1209600$/);
  assert.match(auth.clearSessionCookie({ headers: {}, socket: {} }), /^games_session=; Path=\/; HttpOnly; SameSite=Strict; Max-Age=0$/);
  assert.equal(auth.authenticate({ headers: { cookie: 'games_session=%E0%A4%A' }, socket: {} }), null);
  await assert.rejects(() => auth.updateAccount(user.id, { username: 'blocked_update', currentPassword: 'wrong-password' }), /Current password is incorrect/);
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
  const activityHidden = await auth.updateAccount(user.id, { currentPassword: 'replacement-password', hideFromActivity: true });
  assert.equal(activityHidden.hideFromActivity, true);
});

test('failed password attempts temporarily lock accounts, while admin locks revoke sessions', async () => {
  const user = await auth.register('lockable_account', 'secure-password');
  for (let attempt = 0; attempt < auth.ACCOUNT_FAILURE_LIMIT - 1; attempt++) assert.equal(await auth.login('lockable_account', 'wrong-password'), null);
  await assert.rejects(() => auth.login('lockable_account', 'wrong-password'), error => error.code === 'ACCOUNT_LOCKED' && error.status === 423);
  await assert.rejects(() => auth.login('lockable_account', 'secure-password'), error => error.code === 'ACCOUNT_LOCKED');
  data.db.prepare("UPDATE users SET locked_until=strftime('%s','now')-1 WHERE id=?").run(user.id);
  assert.ok(await auth.login('lockable_account', 'secure-password'));

  const token = auth.createSession(user.id);
  assert.equal(auth.setAccountLocked(user.id, true).adminLocked, true);
  assert.equal(auth.authenticate({ headers: { authorization: `Bearer ${token}` } }), null);
  await assert.rejects(() => auth.login('lockable_account', 'secure-password'), error => error.code === 'ACCOUNT_LOCKED' && error.manual);
  assert.equal(auth.setAccountLocked(user.id, false).adminLocked, false);
  assert.ok(await auth.login('lockable_account', 'secure-password'));
});

test('the koldKat account cannot be locked or renamed', async () => {
  const user = await auth.register('koldKat', 'protected-password');
  assert.throws(() => auth.setAccountLocked(user.id, true), error => error.code === 'PROTECTED_ACCOUNT' && error.status === 403);
  await assert.rejects(() => auth.updateAccount(user.id, { username: 'renamed_koldkat', currentPassword: 'protected-password' }), /cannot be renamed/);
});

test('password reset tokens are one-time and revoke sessions', async () => {
  const user = await auth.register('reset_account', 'old-password', 'reset@example.com');
  const token = await auth.createPasswordReset('RESET@EXAMPLE.COM');
  assert.equal(token.username, 'reset_account');
  assert.doesNotMatch(data.db.prepare('SELECT token_hash FROM password_reset_tokens WHERE user_id=?').get(user.id).token_hash, new RegExp(token.token));
  const session = auth.createSession(user.id);
  await auth.resetPassword(token.token, 'new-password');
  assert.equal(auth.authenticate({ headers: { authorization: `Bearer ${session}` } }), null);
  assert.equal(await auth.login('reset_account', 'old-password'), null);
  assert.ok(await auth.login('reset_account', 'new-password'));
  await assert.rejects(() => auth.resetPassword(token.token, 'another-password'), /invalid or has expired/);
});

test('a reset link is not invalidated until its email has been accepted for delivery', async () => {
  const user = await auth.register('delivery_account', 'old-password', 'delivery@example.com');
  const current = await auth.createPasswordReset('delivery@example.com');
  const originalHash = data.db.prepare('SELECT token_hash FROM password_reset_tokens WHERE user_id=?').get(user.id).token_hash;
  const pending = auth.preparePasswordReset('delivery@example.com');
  assert.equal(data.db.prepare('SELECT COUNT(*) count FROM password_reset_tokens WHERE user_id=?').get(user.id).count, 1);
  assert.equal(data.db.prepare('SELECT token_hash FROM password_reset_tokens WHERE user_id=?').get(user.id).token_hash, originalHash);
  assert.notEqual(pending.token, current.token);
  await auth.resetPassword(current.token, 'new-password');
  assert.ok(await auth.login('delivery_account', 'new-password'));
});
