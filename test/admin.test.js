const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join('/tmp', `games-admin-test-${process.pid}.db`);
const versionPath = path.join('/tmp', `games-admin-version-test-${process.pid}`);
process.env.DB_PATH = dbPath;
process.env.VERSION_FILE = versionPath;
const data = require('../server/db');
const auth = require('../server/auth');
const admin = require('../server/admin');
const version = require('../server/version');

test.after(() => {
  data.db.close();
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
  fs.rmSync(versionPath, { force: true });
});

test('admin access requires a loopback socket and loopback proxy identity', () => {
  const request = (remoteAddress, headers = {}) => ({ socket: { remoteAddress }, headers });
  assert.equal(admin.isLocalRequest(request('127.0.0.1')), true);
  assert.equal(admin.isLocalRequest(request('::ffff:127.0.0.1', { 'x-forwarded-for': '::1' })), true);
  assert.equal(admin.isLocalRequest(request('192.168.1.5')), false);
  assert.equal(admin.isLocalRequest(request('127.0.0.1', { 'x-real-ip': '203.0.113.9' })), false);
  assert.equal(admin.isLocalRequest(request('127.0.0.1', { 'x-forwarded-for': '203.0.113.9, 127.0.0.1' })), false);
});

test('admin summaries span accounts while preserving owner identity', async () => {
  const alpha = await auth.register('alpha_admin_test', 'long-password-one');
  const beta = await auth.register('beta_admin_test', 'long-password-two');
  data.createGame(alpha.id, { title: 'Alpha Game', platform: 'Nintendo Switch', pegi: 7, favorite: true });
  data.createGame(beta.id, { title: 'Beta Game', platform: 'Custom FPGA', ownership: 'wanted', coverUrl: 'https://example.test/cover.jpg' });
  auth.createSession(alpha.id);
  version.writeVersion('test-channel');

  const stats = admin.adminStats();
  assert.equal(stats.users, 2);
  assert.equal(stats.games, 2);
  assert.equal(stats.covered, 1);
  assert.equal(stats.described, 0);
  assert.equal(stats.missingDescriptions, 2);
  assert.equal(stats.pegiKnown, 1);
  assert.equal(stats.missingPegi, 1);
  assert.equal(stats.hltbKnown, 0);
  assert.equal(stats.rated, 0);
  assert.equal(stats.uptimePercent, 100);
  assert.equal(stats.activeSessions, 1);
  assert.equal(stats.version, 'test-channel');
  assert.deepEqual(stats.catalogue, { candidate: 0, public: 0, rejected: 0 });
  assert.deepEqual(stats.formats, [{ label: 'physical', count: 2 }]);

  const live = admin.liveStats();
  assert.equal(typeof live.heapUsed, 'number');
  assert.equal(typeof live.cpuPct, 'number');
  assert.ok(live.appAgeSeconds >= 0);

  const accounts = admin.listAccounts();
  assert.deepEqual(accounts.map(account => account.games), [1, 1]);
  assert.equal(admin.listCatalogue('FPGA')[0].username, 'beta_admin_test');
  assert.equal(admin.listCatalogue('alpha_admin_test')[0].title, 'Alpha Game');

  const deleted = admin.deleteAccount(beta.id);
  assert.equal(deleted.username, 'beta_admin_test');
  assert.equal(deleted.games, 1);
  assert.equal(data.db.prepare('SELECT COUNT(*) count FROM games WHERE user_id=?').get(beta.id).count, 0);
  assert.equal(admin.deleteAccount(beta.id), null);
});

test('admin refuses to delete the protected koldKat account', async () => {
  const protectedUser = await auth.register('koldKat', 'protected-password');
  assert.throws(() => admin.deleteAccount(protectedUser.id), error => error.code === 'PROTECTED_ACCOUNT' && error.status === 403);
});
