const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { createCanonicalStore } = require('../server/canonical-store');

function fixture() {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE games (
      id INTEGER PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      platform TEXT NOT NULL,
      publisher TEXT NOT NULL DEFAULT '',
      release_year INTEGER,
      description TEXT NOT NULL DEFAULT '',
      igdb_id INTEGER,
      igdb_slug TEXT NOT NULL DEFAULT '',
      igdb_url TEXT NOT NULL DEFAULT '',
      igdb_rating REAL,
      igdb_rating_count INTEGER NOT NULL DEFAULT 0,
      igdb_critic_rating REAL,
      igdb_critic_rating_count INTEGER NOT NULL DEFAULT 0,
      igdb_genres TEXT NOT NULL DEFAULT '[]',
      igdb_themes TEXT NOT NULL DEFAULT '[]',
      igdb_developers TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE catalogue_entries (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      platform TEXT NOT NULL,
      publisher TEXT NOT NULL DEFAULT '',
      release_year INTEGER,
      description TEXT NOT NULL DEFAULT '',
      igdb_id INTEGER,
      igdb_slug TEXT NOT NULL DEFAULT '',
      igdb_url TEXT NOT NULL DEFAULT '',
      igdb_rating REAL,
      igdb_rating_count INTEGER NOT NULL DEFAULT 0,
      igdb_critic_rating REAL,
      igdb_critic_rating_count INTEGER NOT NULL DEFAULT 0,
      igdb_genres TEXT NOT NULL DEFAULT '[]',
      igdb_themes TEXT NOT NULL DEFAULT '[]',
      igdb_developers TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE catalogue_game_links (
      catalogue_id INTEGER NOT NULL REFERENCES catalogue_entries(id) ON DELETE CASCADE,
      game_id INTEGER NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (catalogue_id, user_id)
    );
    INSERT INTO users(id) VALUES (1), (2);
  `);
  return { database, canonical: createCanonicalStore(database) };
}

test('an IGDB identity owns multiple platform releases and title variants', t => {
  const { database, canonical } = fixture(); t.after(() => database.close());
  const first = canonical.upsertGame({ title: 'NieR: Automata', igdbId: 100, igdbGenres: ['RPG'] });
  const second = canonical.upsertGame({ title: 'NieR Automata: The End of YoRHa Edition', igdbId: 100 });
  const ps4 = canonical.ensureRelease(first.id, { platform: 'PS4' });
  const switchRelease = canonical.ensureRelease(second.id, { platform: 'Nintendo Switch' });
  assert.equal(first.id, second.id);
  assert.notEqual(ps4.id, switchRelease.id);
  assert.deepEqual(canonical.counts(), { games: 1, releases: 2, linkedCopies: 0, conflicts: 0 });
});

test('later enrichment fills canonical facts without erasing known provider metadata', t => {
  const { database, canonical } = fixture(); t.after(() => database.close());
  const first = canonical.upsertGame({ title: 'Metadata Quest', igdbId: 501, igdbGenres: ['RPG'], igdbRating: 81, igdbRatingCount: 10 });
  const enriched = canonical.upsertGame({ title: 'Metadata Quest', igdbId: 501, description: 'A durable overview.', publisher: 'Example Studio',
    releaseYear: 2025, igdbRatingCount: 12 });
  assert.equal(enriched.id, first.id);
  assert.equal(enriched.description, 'A durable overview.');
  assert.equal(enriched.publisher, 'Example Studio');
  assert.equal(enriched.release_year, 2025);
  assert.equal(enriched.igdb_rating, 81);
  assert.equal(enriched.igdb_rating_count, 12);
  assert.equal(enriched.igdb_genres, '["RPG"]');
});

test('equal display titles with different IGDB IDs remain distinct identities', t => {
  const { database, canonical } = fixture(); t.after(() => database.close());
  const original = canonical.upsertGame({ title: 'Doom', igdbId: 1 });
  const reboot = canonical.upsertGame({ title: 'Doom', igdbId: 2 });
  assert.notEqual(original.id, reboot.id);
  assert.equal(canonical.counts().games, 2);
});

test('backfill links public releases and private copies and is repeatable', t => {
  const { database, canonical } = fixture(); t.after(() => database.close());
  database.exec(`
    INSERT INTO games(id,user_id,title,platform,igdb_id,igdb_slug) VALUES (11,1,'Metroid Dread','Nintendo Switch',411,'metroid-dread');
    INSERT INTO catalogue_entries(id,title,platform,igdb_id,igdb_slug) VALUES (21,'Metroid Dread','Nintendo Switch',411,'metroid-dread');
    INSERT INTO catalogue_game_links(catalogue_id,game_id,user_id) VALUES (21,11,1);
  `);
  const first = canonical.backfill();
  database.prepare("UPDATE canonical_releases SET updated_at='2020-01-01 00:00:00'").run();
  const second = canonical.backfill();
  const game = database.prepare('SELECT canonical_game_id gameId,canonical_release_id releaseId FROM games WHERE id=11').get();
  const entry = database.prepare('SELECT canonical_game_id gameId,canonical_release_id releaseId FROM catalogue_entries WHERE id=21').get();
  assert.deepEqual(game, entry);
  assert.deepEqual(second, first);
  assert.deepEqual(second, { games: 1, releases: 1, linkedCopies: 1, conflicts: 0 });
  assert.equal(database.prepare('SELECT updated_at updatedAt FROM canonical_releases').get().updatedAt, '2020-01-01 00:00:00');
  assert.equal(database.prepare('SELECT COUNT(*) count FROM canonical_migrations').get().count, 1);
});

test('a linked private IGDB identity is not overwritten by a conflicting public identity', t => {
  const { database, canonical } = fixture(); t.after(() => database.close());
  database.exec(`
    INSERT INTO games(id,user_id,title,platform,igdb_id) VALUES (11,1,'Doom','Steam',1);
    INSERT INTO catalogue_entries(id,title,platform,igdb_id) VALUES (21,'Doom','Steam',2);
    INSERT INTO catalogue_game_links(catalogue_id,game_id,user_id) VALUES (21,11,1);
  `);
  canonical.backfill();
  const game = database.prepare('SELECT canonical_game_id gameId FROM games WHERE id=11').get();
  const entry = database.prepare('SELECT canonical_game_id gameId FROM catalogue_entries WHERE id=21').get();
  assert.notEqual(game.gameId, entry.gameId);
  assert.equal(canonical.counts().conflicts, 1);
  assert.match(canonical.unresolvedConflicts()[0].reason, /different IGDB identity/);
});

test('a legacy public release adopts the IGDB identity of its linked private copy', t => {
  const { database, canonical } = fixture(); t.after(() => database.close());
  database.exec(`
    INSERT INTO games(id,user_id,title,platform,igdb_id) VALUES (11,1,'Peppa Pig World Adventures','Nintendo Switch',229119);
    INSERT INTO catalogue_entries(id,title,platform) VALUES (21,'Peppa Pig World Adventures','Nintendo Switch');
    INSERT INTO catalogue_game_links(catalogue_id,game_id,user_id) VALUES (21,11,1);
  `);
  canonical.backfill();
  const game = database.prepare('SELECT canonical_game_id gameId,canonical_release_id releaseId FROM games WHERE id=11').get();
  const entry = database.prepare('SELECT canonical_game_id gameId,canonical_release_id releaseId FROM catalogue_entries WHERE id=21').get();
  assert.deepEqual(entry, game);
  assert.equal(canonical.counts().conflicts, 0);
  assert.equal(canonical.counts().games, 1);
  assert.equal(canonical.counts().releases, 1);
  assert.equal(database.prepare('SELECT identity_key identityKey FROM canonical_games WHERE id=?').get(game.gameId).identityKey, 'igdb:229119');
});

test('public records without IGDB data receive a stable local fallback identity', t => {
  const { database, canonical } = fixture(); t.after(() => database.close());
  database.exec(`
    INSERT INTO catalogue_entries(id,title,platform) VALUES (21,'Local Gem','Steam'),(22,'Local Gem','GOG');
  `);
  canonical.backfill();
  const rows = database.prepare('SELECT canonical_game_id gameId,canonical_release_id releaseId FROM catalogue_entries ORDER BY id').all();
  assert.equal(rows[0].gameId, rows[1].gameId);
  assert.notEqual(rows[0].releaseId, rows[1].releaseId);
  assert.deepEqual(canonical.counts(), { games: 1, releases: 2, linkedCopies: 0, conflicts: 0 });
});
