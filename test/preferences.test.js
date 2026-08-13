const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join('/tmp', `games-preferences-test-${process.pid}.db`);
process.env.DB_PATH = dbPath;
const data = require('../server/db');
const auth = require('../server/auth');
const preferences = require('../server/preferences');

test.after(() => {
  data.db.close();
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

test('preferences persist per account and invalid values fall back safely', async () => {
  const first = await auth.register('prefs_one', 'password-one');
  const second = await auth.register('prefs_two', 'password-two');
  assert.deepEqual(preferences.get(first.id), preferences.defaults());
  const saved = preferences.set(first.id, { view: 'list', filters: { q: 'Pokémon', platform: 'Nintendo Switch 2',
    ownership: 'wanted', pegi: '7', playStatus: 'backlog', missing: 'hltb', favorite: '1', sort: 'hltb_main_short' } });
  assert.deepEqual(preferences.get(first.id), saved);
  assert.equal(preferences.set(first.id, { filters: { ownership: 'owned_digital' } }).filters.ownership, 'owned_digital');
  assert.deepEqual(preferences.get(second.id), preferences.defaults());
  assert.deepEqual(preferences.set(second.id, { view: 'invalid', filters: { ownership: 'broken', sort: 'DROP TABLE games' } }), preferences.defaults());
});

test('preference rows cascade when their account is deleted', async () => {
  const user = await auth.register('prefs_delete', 'password-delete');
  preferences.set(user.id, { view: 'list' });
  data.db.prepare('DELETE FROM users WHERE id=?').run(user.id);
  assert.equal(data.db.prepare('SELECT COUNT(*) count FROM user_preferences WHERE user_id=?').get(user.id).count, 0);
});
