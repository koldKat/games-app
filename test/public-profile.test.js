const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join('/tmp', `games-public-profile-test-${process.pid}.db`);
process.env.DB_PATH = dbPath;
const data = require('../server/db');
const { createKatalogStore } = require('../server/katalog-store');
createKatalogStore(data.db);
const auth = require('../server/auth');
const publicProfiles = require('../server/public-profiles');

test.after(() => {
  data.db.close();
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

test('public collector profiles are opt-in and expose aggregates without private account data', async () => {
  const user = await auth.register('public_curator', 'profile-password', 'private@example.com');
  const contributed = data.createGame(user.id, { title: 'Physical Quest', platform: 'PlayStation 5', ownership: 'owned', mediaFormat: 'physical', playStatus: 'completed', favorite: true, notes: 'private note' });
  data.createGame(user.id, { title: 'Digital Quest', platform: 'PC (Steam)', ownership: 'owned', mediaFormat: 'digital', playStatus: 'playing' });
  data.createGame(user.id, { title: 'Future Quest', platform: 'PlayStation 5', ownership: 'wanted' });
  data.db.prepare(`INSERT INTO catalogue_entries(slug,title,title_key,platform,platform_key,cover_url,status,submitted_by_user_id,source_game_id,published_at)
    VALUES ('physical-quest-ps5','Physical Quest','physical quest','PlayStation 5','playstation 5','/covers/11111111111111111111111111111111.jpg','public',?,?,CURRENT_TIMESTAMP)`).run(user.id, contributed.id);
  data.db.prepare('INSERT INTO user_progression(user_id, xp) VALUES (?, ?)').run(user.id, 15000);

  assert.equal(publicProfiles.get('public_curator'), null);
  const updated = await auth.updateAccount(user.id, { currentPassword: 'profile-password', publicProfile: true });
  assert.equal(updated.publicProfile, true);
  const token = auth.createSession(user.id);
  assert.equal(auth.authenticate({ headers: { authorization: `Bearer ${token}` } }).publicProfile, true);

  const profile = publicProfiles.get('PUBLIC_CURATOR');
  assert.equal(profile.username, 'public_curator');
  assert.equal(profile.level, 5);
  assert.equal(profile.title, 'Cartridge Keeper');
  assert.deepEqual(profile.stats, { total: 3, owned: 2, physical: 1, digital: 1, wishlisted: 1, completed: 1, playing: 1, favorites: 1, platforms: 2, contributions: 1 });
  assert.deepEqual(profile.topPlatforms[0], { platform: 'PlayStation 5', count: 2 });
  assert.equal(JSON.stringify(profile).includes('private@example.com'), false);
  assert.equal(JSON.stringify(profile).includes('private note'), false);

  await auth.updateAccount(user.id, { currentPassword: 'profile-password', publicProfile: false });
  assert.equal(publicProfiles.get('public_curator'), null);
});

test('locked accounts never retain a public profile surface', async () => {
  const user = await auth.register('locked_curator', 'profile-password');
  await auth.updateAccount(user.id, { currentPassword: 'profile-password', publicProfile: true });
  assert.ok(publicProfiles.get('locked_curator'));
  auth.setAccountLocked(user.id, true);
  assert.equal(publicProfiles.get('locked_curator'), null);
});
