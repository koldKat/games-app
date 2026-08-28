const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { evaluateCatalogueGame } = require('../server/catalogue-policy');
const { createCatalogueStore } = require('../server/catalogue-store');

function fixture() {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE games (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, rating REAL);
    INSERT INTO users (id) VALUES (1),(2);
    INSERT INTO games (id,user_id,rating) VALUES (11,1,4.5),(22,2,3.5);
  `);
  return { database, store: createCatalogueStore(database) };
}

function game(overrides = {}) {
  return {
    id: 11, title: 'Metroid Dread', platform: 'Nintendo Switch', pegi: 12,
    publisher: 'Nintendo', releaseYear: 2021,
    pegiUrl: 'https://pegi.info/metroid', pegiDescriptors: ['Violence'], pegiReleases: [],
    pegiAdvice: '', pegiOutline: '', pegiContentIssues: '', pegiOtherIssues: '',
    hltbId: 700, hltbTitle: 'Metroid Dread', hltbUrl: 'https://howlongtobeat.com/game/700',
    hltbMainStory: 9, hltbMainExtra: 11, hltbCompletionist: 13, hltbAllStyles: 10,
    coverSource: 'steamgriddb', coverMatchTitle: 'Metroid Dread',
    coverUrl: '/covers/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
    ...overrides,
  };
}

test('store deduplicates title/platform identities and links separate users', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const first = game();
  const created = store.upsertFromGame(1, first, evaluateCatalogueGame(first), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  const second = game({ id: 22 });
  const reused = store.upsertFromGame(2, second, evaluateCatalogueGame(second), '/covers/cccccccccccccccccccccccccccccccc.jpg');
  assert.equal(created.created, true);
  assert.equal(reused.created, false);
  assert.equal(reused.usedCover, false);
  assert.equal(store.counts().public, 1);
  assert.equal(database.prepare('SELECT COUNT(*) count FROM catalogue_game_links').get().count, 2);
});

test('public projections never expose contributing account or private row identifiers', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const source = game();
  const result = store.upsertFromGame(1, source, evaluateCatalogueGame(source), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  const visible = store.getPublicBySlug(result.entry.slug);
  assert.equal(visible.title, source.title);
  assert.equal('submittedByUserId' in visible, false);
  assert.equal('sourceGameId' in visible, false);
  assert.equal('reasons' in visible, false);
  assert.equal('confidence' in visible, false);
  assert.equal('status' in visible, false);
});

test('public entries expose only an anonymous aggregate from linked private ratings', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const first = game();
  const entry = store.upsertFromGame(1, first, evaluateCatalogueGame(first), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg').entry;
  const second = game({ id: 22 });
  store.upsertFromGame(2, second, evaluateCatalogueGame(second), '/covers/cccccccccccccccccccccccccccccccc.jpg');
  assert.deepEqual([store.getPublicBySlug(entry.slug).ratingAverage, store.getPublicBySlug(entry.slug).ratingCount], [4, 2]);
  database.prepare('UPDATE games SET rating=5 WHERE id=22').run();
  assert.deepEqual([store.getPublicBySlug(entry.slug).ratingAverage, store.getPublicBySlug(entry.slug).ratingCount], [4.75, 2]);
  database.prepare('UPDATE games SET rating=NULL WHERE id=22').run();
  assert.deepEqual([store.getPublicBySlug(entry.slug).ratingAverage, store.getPublicBySlug(entry.slug).ratingCount], [null, 0]);
});

test('public search filters by title, publisher, and platform', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const source = game();
  store.upsertFromGame(1, source, evaluateCatalogueGame(source), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  assert.equal(store.listPublic({ q: 'metroid' }).total, 1);
  assert.equal(store.listPublic({ q: 'nintendo' }).total, 1);
  assert.equal(store.listPublic({ platform: 'Nintendo Switch' }).total, 1);
  assert.equal(store.listPublic({ q: 'playstation' }).total, 0);
});

test('candidate records remain absent from public pages until reviewed', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const source = game({ coverMatchTitle: 'Metroid Collection' });
  const result = store.upsertFromGame(1, source, evaluateCatalogueGame(source), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  assert.equal(result.entry.status, 'candidate');
  assert.equal(store.listPublic().total, 0);
  assert.equal(store.setStatus(result.entry.id, 'public').status, 'public');
  assert.equal(store.listPublic().total, 1);
});

test('administrator updates shared facts without changing a release slug or moderation state', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const source = game();
  const original = store.upsertFromGame(1, source, evaluateCatalogueGame(source), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg').entry;
  const updated = store.updateAdmin(original.id, {
    ...original, title: 'Metroid Dread: Deluxe', publisher: 'Nintendo EPD', releaseYear: 2022,
    pegi: 16, pegiDescriptors: 'Violence, Fear', hltbId: 701, hltbTitle: 'Metroid Dread: Deluxe',
    hltbMainStory: 10.5, coverMatchTitle: 'Metroid Dread: Deluxe',
  });
  assert.equal(updated.slug, original.slug);
  assert.equal(updated.status, 'public');
  assert.equal(updated.title, 'Metroid Dread: Deluxe');
  assert.equal(updated.publisher, 'Nintendo EPD');
  assert.deepEqual(updated.pegiDescriptors, ['Violence', 'Fear']);
  assert.equal(updated.hltbMainStory, 10.5);
});

test('administrator cannot merge two catalogue identities through an edit', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const first = game(); const second = game({ id: 22, title: 'Metroid Prime', hltbTitle: 'Metroid Prime', coverMatchTitle: 'Metroid Prime' });
  const firstEntry = store.upsertFromGame(1, first, evaluateCatalogueGame(first), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg').entry;
  store.upsertFromGame(2, second, evaluateCatalogueGame(second), '/covers/cccccccccccccccccccccccccccccccc.jpg');
  assert.throws(() => store.updateAdmin(firstEntry.id, { ...firstEntry, title: second.title, platform: second.platform }), /already uses/);
});

test('an administrator rejection is sticky across later account synchronization', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const source = game({ coverMatchTitle: 'Metroid Collection' });
  const result = store.upsertFromGame(1, source, evaluateCatalogueGame(source), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  store.setStatus(result.entry.id, 'rejected');
  const next = store.upsertFromGame(1, source, evaluateCatalogueGame(source), '/covers/cccccccccccccccccccccccccccccccc.jpg');
  assert.equal(next.entry.status, 'rejected');
  assert.equal(next.usedCover, false);
  assert.equal(store.listPublic().total, 0);
});

test('editing a linked private row to a different release moves its catalogue link', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const first = game();
  const original = store.upsertFromGame(1, first, evaluateCatalogueGame(first), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  const changed = game({ title: 'Metroid Prime Remastered', hltbTitle: 'Metroid Prime Remastered', coverMatchTitle: 'Metroid Prime Remastered' });
  const replacement = store.upsertFromGame(1, changed, evaluateCatalogueGame(changed), '/covers/cccccccccccccccccccccccccccccccc.jpg');
  const link = database.prepare('SELECT catalogue_id AS catalogueId FROM catalogue_game_links WHERE game_id=11').get();
  assert.notEqual(original.entry.id, replacement.entry.id);
  assert.equal(link.catalogueId, replacement.entry.id);
});
