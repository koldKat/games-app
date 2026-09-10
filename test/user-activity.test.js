const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join('/tmp', `games-user-activity-test-${process.pid}.db`);
process.env.DB_PATH = dbPath;
const data = require('../server/db');
const auth = require('../server/auth');
const activity = require('../server/user-activity');

test.after(() => {
  data.db.close();
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

test('account activity is stored at most once per minute unless forced', async () => {
  const user = await auth.register('active_user', 'activity-password');
  assert.equal(activity.record(user.id, { now: 1000 }), true);
  assert.equal(activity.record(user.id, { now: 1059 }), false);
  assert.equal(activity.record(user.id, { now: 1060 }), true);
  assert.equal(activity.record(user.id, { now: 1061, force: true }), true);
  assert.equal(data.db.prepare('SELECT last_active_at value FROM users WHERE id=?').get(user.id).value, 1061);
});

test('session authentication records activity without changing its public user shape', async () => {
  const user = await auth.register('session_active_user', 'activity-password');
  const token = auth.createSession(user.id);
  data.db.prepare('UPDATE users SET last_active_at=NULL WHERE id=?').run(user.id);
  const authenticated = auth.authenticate({ headers: { authorization: `Bearer ${token}` }, socket: {} }, { touch: false });
  assert.equal(authenticated.id, user.id);
  assert.ok(data.db.prepare('SELECT last_active_at value FROM users WHERE id=?').get(user.id).value > 0);
  assert.equal(Object.hasOwn(authenticated, 'lastActiveAt'), false);
});
