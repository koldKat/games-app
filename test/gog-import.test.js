'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createGogImportService } = require('../server/gog-import');

function fixture() {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY);
    CREATE TABLE games(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,platform TEXT NOT NULL,gog_product_id TEXT,canonical_game_id INTEGER);
    INSERT INTO users(id) VALUES (1);
    INSERT INTO games(user_id,title,platform,gog_product_id) VALUES
      (1,'Already There','GOG','10'),(1,'Link Me','GOG',NULL),(1,'Other Copy','Nintendo Switch',NULL),
      (1,'Ambiguous','GOG',NULL),(1,'Ambiguous','GOG',NULL);`);
  const library = [
    { productId: '10', title: 'Already There' }, { productId: '20', title: 'Link Me' },
    { productId: '30', title: 'Other Copy' }, { productId: '40', title: 'Brand New', sourceHidden: true },
    { productId: '50', title: 'Ambiguous' },
  ];
  const data = {
    createGame(userId, input) {
      const id = database.prepare('INSERT INTO games(user_id,title,platform,gog_product_id) VALUES (?,?,?,?)')
        .run(userId, input.title, input.platform, input.gogProductId).lastInsertRowid;
      return { id: Number(id), ...input };
    },
    linkGogGame(userId, id, source) {
      database.prepare('UPDATE games SET gog_product_id=? WHERE id=? AND user_id=?').run(source.productId, id, userId);
      return { id, title: source.title, gogProductId: source.productId };
    },
  };
  const gog = {
    AUTHORIZATION_URL: 'https://auth.gog.test/',
    exchangeAuthorization: async () => ({ accessToken: 'access', refreshToken: 'refresh', expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
    refreshAuthorization: async () => ({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
    account: async () => ({ username: 'kat', userId: '42' }),
    ownedGames: async (_accessToken, _fetchImpl, onPage) => {
      onPage?.({ page: 1, pages: 1, total: library.length }); return library;
    },
  };
  return { database, library, service: createGogImportService({ database, data, gog }), gog };
}

test('GOG preview separates linked, linkable, other-platform, ambiguous, and new records', async t => {
  const { database, service } = fixture(); t.after(() => database.close());
  assert.equal(service.status(1).authorizationUrl, 'https://auth.gog.test/');
  await service.connect(1, 'authorization-code');
  assert.equal(service.status(1).connected, true);
  assert.equal(JSON.stringify(service.status(1)).includes('access'), false);
  assert.equal(JSON.stringify(service.status(1)).includes('refresh'), false);
  const progress = []; const preview = await service.preview(1, update => progress.push(update));
  assert.deepEqual(preview.counts, { new: 1, 'other-platform': 1, link: 1, ambiguous: 1, already: 1 });
  assert.equal(preview.items.find(item => item.status === 'ambiguous').selected, false);
  assert.deepEqual(progress, [{ phase: 'previewing', current: 1, total: 1 }]);
});

test('legacy public-profile connections require authorization instead of presenting a partial library', async t => {
  const { database, service } = fixture(); t.after(() => database.close());
  database.prepare('INSERT INTO gog_connections(user_id,username,profile_url) VALUES (?,?,?)').run(1, 'old-profile', 'https://www.gog.com/u/old-profile');
  assert.deepEqual(service.status(1), {
    connected: false, requiresReconnect: true, authorizationUrl: 'https://auth.gog.test/', connection: null,
  });
  await assert.rejects(() => service.preview(1), /Reconnect GOG/);
});

test('GOG import links one exact record, creates reviewed copies, and is repeat-safe', async t => {
  const { database, service } = fixture(); t.after(() => database.close());
  await service.connect(1, 'authorization-code');
  const result = await service.importSelection(1, ['20', '30', '40']);
  assert.equal(result.linked.length, 1); assert.equal(result.created.length, 2); assert.equal(result.skipped.length, 0);
  assert.equal(result.created.find(game => game.gogProductId === '40').playStatus, 'backlog');
  assert.equal(database.prepare('SELECT gog_product_id value FROM games WHERE title=? AND platform=?').get('Link Me', 'GOG').value, '20');
  assert.equal((await service.importSelection(1, ['20', '30', '40'])).skipped.length, 3);
  assert.equal(database.prepare("SELECT COUNT(*) n FROM games WHERE gog_product_id IN ('30','40') AND platform='GOG'").get().n, 2);
  assert.ok(service.status(1).connection.lastSyncedAt);
});

test('GOG import rejects product IDs outside the freshly read connected library', async t => {
  const { database, service } = fixture(); t.after(() => database.close());
  await service.connect(1, 'authorization-code');
  await assert.rejects(() => service.importSelection(1, ['999']), /outside the connected GOG library/);
});

test('an active GOG import prevents profile replacement and disconnection', async t => {
  const { database, library, service, gog } = fixture(); t.after(() => database.close());
  await service.connect(1, 'authorization-code');
  let releaseLibrary;
  gog.ownedGames = () => new Promise(resolve => { releaseLibrary = () => resolve(library); });
  const importing = service.importSelection(1, ['40']);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(() => service.connect(1, 'another-authorization'), /already running/);
  assert.throws(() => service.disconnect(1), /already running/);
  releaseLibrary(); await importing;
});
