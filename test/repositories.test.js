const test = require('node:test');
const assert = require('node:assert/strict');

// Isolate all repositories from games.db.
process.env.DB_PATH = ':memory:';
const data = require('../server/db');
const connection = require('../server/db/connection');
const { initializeSchema } = require('../server/db/schema');
data.db.prepare("INSERT INTO users (username, password_hash, salt) VALUES ('RepositoryTest', 'hash', 'salt')").run();
const userId = 1;

test('facade shares exactly one connection and schema setup is idempotent', () => {
  assert.equal(data.db, connection.db); assert.equal(data.canonical, connection.canonical);
  const tables = data.db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
  initializeSchema(data.db);
  assert.deepEqual(data.db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all(), tables);
});

test('scoped repositories round-trip validation, enrichment, and dual-format copies', () => {
  let game = data.createGame(userId, { title: 'Repository Portal', platform: 'Steam', mediaFormats: ['physical', 'digital'] });
  assert.equal(game.formatPhysical, 1); assert.equal(game.formatDigital, 1); assert.equal(game.mediaFormat, 'both');
  assert.equal(data.getGame(999, game.id), undefined);
  game = data.updateGamePegiMetadata(userId, game.id, { pegi: 12, descriptors: ['Violence'], releases: ['PC'], pegiUrl: 'https://pegi.info/test', advice: 'Test advice' });
  assert.equal(game.pegi, 12); assert.deepEqual(game.pegiDescriptors, ['Violence']);
  game = data.updateGameHltb(userId, game.id, { id: 23, mainStory: 8, mainExtra: 13, completionist: 21, allStyles: 12 });
  assert.equal(game.hltbId, 23);
  game = data.updateGameIgdb(userId, game.id, { id: 45, genres: ['Puzzle'], rating: 90 });
  assert.equal(game.igdbId, 45); assert.deepEqual(game.igdbGenres, ['Puzzle']);
  game = data.updateGameDescription(userId, game.id, { description: 'Repository description', source: 'Manual' });
  assert.equal(game.description, 'Repository description');
  game = data.updateGameCover(userId, game.id, { url: '/covers/test.jpg', source: 'upload', matchTitle: game.title });
  assert.equal(game.coverUrl, '/covers/test.jpg');
  assert.equal(data.listGamesPage(userId, { missing: 'pegi' }).games.length, 0);
  assert.equal(data.stats(userId).total, 1);
  assert.deepEqual(data.platformNames(userId), ['Steam']);
  assert.equal(data.deleteGame(999, game.id), false);
  assert.equal(data.deleteGame(userId, game.id), true);
});

test.after(() => data.db.close());
