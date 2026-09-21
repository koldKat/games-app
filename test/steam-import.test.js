'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createSteamImportService } = require('../server/steam-import');

function fixture() {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY);
    CREATE TABLE games(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,platform TEXT NOT NULL,steam_app_id INTEGER,steam_playtime_minutes INTEGER DEFAULT 0,
      steam_last_played_at TEXT,canonical_game_id INTEGER);
    INSERT INTO users(id) VALUES (1);
    INSERT INTO games(user_id,title,platform,steam_app_id) VALUES
      (1,'Already There','Steam',10),(1,'Link Me','Steam',NULL),(1,'Other Copy','Nintendo Switch',NULL),
      (1,'Ambiguous','Steam',NULL),(1,'Ambiguous','Steam',NULL);`);
  const library = [
    { appId: 10, title: 'Already There', playtimeMinutes: 5, lastPlayedAt: null },
    { appId: 20, title: 'Link Me', playtimeMinutes: 10, lastPlayedAt: null },
    { appId: 30, title: 'Other Copy', playtimeMinutes: 20, lastPlayedAt: null },
    { appId: 40, title: 'Brand New', playtimeMinutes: 30, lastPlayedAt: null },
    { appId: 50, title: 'Ambiguous', playtimeMinutes: 40, lastPlayedAt: null },
  ];
  const data = {
    createGame(userId, input) {
      const id = database.prepare(`INSERT INTO games(user_id,title,platform,steam_app_id,steam_playtime_minutes,steam_last_played_at)
        VALUES (?,?,?,?,?,?)`).run(userId, input.title, input.platform, input.steamAppId, input.steamPlaytimeMinutes, input.steamLastPlayedAt).lastInsertRowid;
      return { id: Number(id), ...input };
    },
    linkSteamGame(userId, id, source) {
      database.prepare('UPDATE games SET steam_app_id=?,steam_playtime_minutes=? WHERE id=? AND user_id=?')
        .run(source.appId, source.playtimeMinutes, id, userId);
      return { id, title: source.title, steamAppId: source.appId };
    },
  };
  const steam = {
    player: async () => ({ steamId: '76561198000000000', personaName: 'Kat', profileUrl: 'https://steamcommunity.com/id/kat/' }),
    ownedGames: async () => library,
  };
  const service = createSteamImportService({ database, data, integrations: { credentials: () => ({ apiKey: 'key' }) }, steam });
  return { database, library, service, steam };
}

test('Steam preview separates already linked, linkable, other-platform, ambiguous, and new records', async t => {
  const { database, service } = fixture(); t.after(() => database.close());
  await service.connect(1, 'kat');
  const preview = await service.preview(1);
  assert.deepEqual(preview.counts, { new: 1, 'other-platform': 1, link: 1, ambiguous: 1, already: 1 });
  assert.equal(preview.items.find(item => item.status === 'ambiguous').selected, false);
  assert.equal(preview.items.find(item => item.status === 'link').action, 'link');
});

test('Steam import links one exact record, creates reviewed copies, and is repeat-safe', async t => {
  const { database, service } = fixture(); t.after(() => database.close());
  await service.connect(1, 'kat');
  const progress = [];
  const result = await service.importSelection(1, [20, 30, 40], update => progress.push(update));
  assert.equal(result.linked.length, 1); assert.equal(result.created.length, 2); assert.equal(result.skipped.length, 0);
  assert.equal(progress[0].phase, 'fetching');
  assert.deepEqual(progress.at(-1), { phase: 'importing', current: 3, total: 3 });
  assert.equal(database.prepare('SELECT steam_app_id value FROM games WHERE title=? AND platform=?').get('Link Me', 'Steam').value, 20);
  assert.equal((await service.importSelection(1, [20, 30, 40])).skipped.length, 3);
  assert.ok(service.status(1).connection.lastSyncedAt);
});

test('a same-title Steam row linked to another AppID is never offered as a safe link', async t => {
  const { database, service } = fixture(); t.after(() => database.close());
  database.prepare('INSERT INTO games(user_id,title,platform,steam_app_id) VALUES (1,?,?,?)').run('Brand New', 'Steam', 999);
  await service.connect(1, 'kat');
  const item = (await service.preview(1)).items.find(game => game.appId === 40);
  assert.equal(item.status, 'ambiguous');
  assert.equal(item.selected, false);
});

test('a retry exposes already-written imported rows for idempotent XP recovery', async t => {
  const { database, service } = fixture(); t.after(() => database.close());
  await service.connect(1, 'kat');
  const created = await service.importSelection(1, [40]);
  const retry = await service.importSelection(1, [40]);
  assert.equal(created.xpGames.length, 1);
  assert.equal(retry.created.length, 0);
  assert.deepEqual(retry.xpGames.map(game => game.id), created.created.map(game => game.id));
});

test('an active import prevents profile replacement and disconnection', async t => {
  const { database, library, service, steam } = fixture(); t.after(() => database.close());
  await service.connect(1, 'kat');
  let releaseLibrary;
  steam.ownedGames = () => new Promise(resolve => { releaseLibrary = () => resolve(library); });
  const importing = service.importSelection(1, [40]);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(() => service.connect(1, 'another-profile'), /already running/);
  assert.throws(() => service.disconnect(1), /already running/);
  releaseLibrary(); await importing;
});
