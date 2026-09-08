const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join('/tmp', `games-user-location-test-${process.pid}.db`);
process.env.DB_PATH = dbPath;
const data = require('../server/db');
const auth = require('../server/auth');
const location = require('../server/user-location');

test.after(() => {
  data.db.close();
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

test('login location keeps only normalized country and city and throttles repeat lookups', async () => {
  const user = await auth.register('located_user', 'location-password');
  let lookups = 0;
  const resolver = ip => { lookups++; assert.equal(ip, '203.0.113.8'); return { country: 'bg', city: ' Sofia ' }; };
  assert.equal(location.record(user.id, '::ffff:203.0.113.8', { resolver, now: 1000 }), true);
  assert.deepEqual(data.db.prepare('SELECT last_country country, last_city city FROM users WHERE id=?').get(user.id), { country: 'BG', city: 'Sofia' });
  assert.equal(location.record(user.id, '203.0.113.8', { resolver, now: 1001 }), false);
  assert.equal(lookups, 1);
  assert.equal(location.record(user.id, '203.0.113.8', { resolver, now: 1600 }), true);
  assert.equal(lookups, 2);
});

test('unresolvable addresses clear stale display data without storing an IP address', async () => {
  const user = await auth.register('private_location', 'location-password');
  data.db.prepare("UPDATE users SET last_country='US', last_city='Old city' WHERE id=?").run(user.id);
  assert.equal(location.record(user.id, '127.0.0.1', { force: true, resolver: () => null, now: 2000 }), true);
  const columns = data.db.prepare('PRAGMA table_info(users)').all().map(column => column.name);
  assert.equal(columns.some(column => column.includes('ip')), false);
  assert.deepEqual(data.db.prepare('SELECT last_country country, last_city city FROM users WHERE id=?').get(user.id), { country: null, city: null });
});

test('malformed and ambiguous addresses never reach the GeoIP dependency', () => {
  let called = false;
  assert.equal(location.lookup('0127.0.0.1', () => { called = true; return { country: 'US' }; }), null);
  assert.equal(called, false);
});

test('GeoIP failure is best-effort and cannot block authenticated work', async () => {
  const user = await auth.register('failed_location', 'location-password');
  assert.equal(location.record(user.id, '203.0.113.8', { force: true, resolver: () => { throw new Error('offline database unavailable'); } }), true);
  assert.deepEqual(data.db.prepare('SELECT last_country country, last_city city FROM users WHERE id=?').get(user.id), { country: null, city: null });
});
