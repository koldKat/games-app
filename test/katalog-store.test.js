const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { evaluateKatalogGame } = require('../server/katalog-policy');
const { createKatalogStore } = require('../server/katalog-store');

test('public Kat·a·log pages default to ten desktop rows', () => {
  const { database, store } = fixture();
  try { assert.equal(store.listPublic().pageSize, 80); }
  finally { database.close(); }
});

function fixture() {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE games (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, rating REAL);
    INSERT INTO users (id) VALUES (1),(2),(3);
    INSERT INTO games (id,user_id,rating) VALUES (11,1,4.5),(22,2,3.5),(33,3,NULL);
  `);
  return { database, store: createKatalogStore(database) };
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
  const created = store.upsertFromGame(1, first, evaluateKatalogGame(first), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  const second = game({ id: 22 });
  const reused = store.upsertFromGame(2, second, evaluateKatalogGame(second), '/covers/cccccccccccccccccccccccccccccccc.jpg');
  assert.equal(created.created, true);
  assert.equal(reused.created, false);
  assert.equal(reused.usedCover, false);
  assert.equal(store.counts().public, 1);
  assert.equal(database.prepare('SELECT COUNT(*) count FROM catalogue_game_links').get().count, 2);
  assert.deepEqual(store.contributionSources(), [{ userId: 1, gameId: first.id }]);
});

test('public projections never expose contributing account or private row identifiers', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const source = game();
  const result = store.upsertFromGame(1, source, evaluateKatalogGame(source), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  const visible = store.getPublicBySlug(result.entry.slug);
  assert.equal(visible.title, source.title);
  assert.equal('submittedByUserId' in visible, false);
  assert.equal('sourceGameId' in visible, false);
  assert.equal('reasons' in visible, false);
  assert.equal('confidence' in visible, false);
  assert.equal('status' in visible, false);
});

test('public releases retain IGDB identity, user scores, critic scores, and credits', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const source = game({ igdbId: 411, igdbSlug: 'metroid-dread', igdbUrl: 'https://www.igdb.com/games/metroid-dread',
    igdbRating: 84.2, igdbRatingCount: 900, igdbCriticRating: 88.7, igdbCriticRatingCount: 42,
    igdbGenres: ['Platform'], igdbThemes: ['Science fiction'], igdbDevelopers: ['MercurySteam'], igdbUpdatedAt: '2026-09-17T00:00:00.000Z' });
  const created = store.upsertFromGame(1, source, evaluateKatalogGame(source), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg').entry;
  const visible = store.getPublicBySlug(created.slug);
  assert.equal(visible.igdbId, 411); assert.equal(visible.igdbRating, 84.2); assert.equal(visible.igdbCriticRating, 88.7);
  assert.deepEqual(visible.igdbGenres, ['Platform']); assert.deepEqual(visible.igdbDevelopers, ['MercurySteam']);
});

test('IGDB supplementation updates a public release once without churning its timestamp on unrelated saves', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const created = store.upsertFromGame(1, game(), evaluateKatalogGame(game()), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg').entry;
  const metadata = { igdbId: 411, igdbSlug: 'metroid-dread', igdbUrl: 'https://www.igdb.com/games/metroid-dread',
    igdbRating: 84.2, igdbRatingCount: 900, igdbGenres: ['Platform'], igdbThemes: [], igdbDevelopers: ['MercurySteam'],
    igdbUpdatedAt: '2026-09-17T00:00:00.000Z' };
  assert.equal(store.addIgdbIfMissing(created.id, metadata).igdbId, 411);
  database.prepare("UPDATE catalogue_entries SET updated_at='2026-09-17 12:00:00' WHERE id=?").run(created.id);
  store.addIgdbIfMissing(created.id, metadata);
  assert.equal(store.getById(created.id).updatedAt, '2026-09-17 12:00:00');
  store.addIgdbIfMissing(created.id, { ...metadata, igdbId: 999, igdbUpdatedAt: '2026-09-18T00:00:00.000Z' });
  assert.equal(store.getById(created.id).igdbId, 411);
});

test('public entries expose only an anonymous aggregate from linked private ratings', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const first = game();
  const entry = store.upsertFromGame(1, first, evaluateKatalogGame(first), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg').entry;
  const second = game({ id: 22 });
  store.upsertFromGame(2, second, evaluateKatalogGame(second), '/covers/cccccccccccccccccccccccccccccccc.jpg');
  assert.deepEqual([store.getPublicBySlug(entry.slug).ratingAverage, store.getPublicBySlug(entry.slug).ratingCount], [4, 2]);
  database.prepare('UPDATE games SET rating=5 WHERE id=22').run();
  assert.deepEqual([store.getPublicBySlug(entry.slug).ratingAverage, store.getPublicBySlug(entry.slug).ratingCount], [4.75, 2]);
  database.prepare('UPDATE games SET rating=NULL WHERE id=22').run();
  assert.deepEqual([store.getPublicBySlug(entry.slug).ratingAverage, store.getPublicBySlug(entry.slug).ratingCount], [4.5, 1]);
});

test('public search filters by title, publisher, platform, genre, and theme', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const source = game({ igdbId: 411, igdbGenres: ['Platform'], igdbThemes: ['Science fiction'] });
  store.upsertFromGame(1, source, evaluateKatalogGame(source), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  assert.equal(store.listPublic({ q: 'metroid' }).total, 1);
  assert.equal(store.listPublic({ q: 'nintendo' }).total, 1);
  assert.equal(store.listPublic({ q: 'platform' }).total, 1);
  assert.equal(store.listPublic({ q: 'science fiction' }).total, 1);
  assert.equal(store.listPublic({ platform: 'Nintendo Switch' }).total, 1);
  assert.equal(store.listPublic({ q: 'playstation' }).total, 0);
});

test('public Kat·a·log groups title variants, but a platform filter returns individual releases', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const switchRelease = game();
  const steamRelease = game({ id: 22, platform: 'Steam', coverMatchTitle: 'Metroid Dread', hltbTitle: 'Metroid Dread' });
  store.upsertFromGame(1, switchRelease, evaluateKatalogGame(switchRelease), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  store.upsertFromGame(2, steamRelease, evaluateKatalogGame(steamRelease), '/covers/cccccccccccccccccccccccccccccccc.jpg');
  const grouped = store.listPublic();
  assert.equal(grouped.total, 1);
  assert.equal(grouped.entries[0].releases.length, 2);
  assert.equal(store.listPublic({ platform: 'Steam' }).total, 1);
  assert.equal(store.listPublic({ platform: 'Steam' }).entries[0].releases, undefined);
  assert.equal(store.getPublicBySlug(grouped.entries[0].slug).releases.length, 2);
  assert.equal(store.sitemapEntries().length, 1);
});

test('public pagination keeps every release in a group while hydrating only the requested groups', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const switchRelease = game();
  const steamRelease = game({ id: 22, platform: 'Steam' });
  const otherTitle = game({ id: 33, title: 'Zelda Echoes', platform: 'Nintendo Switch', igdbId: 900,
    hltbTitle: 'Zelda Echoes', coverMatchTitle: 'Zelda Echoes' });
  store.upsertFromGame(1, switchRelease, evaluateKatalogGame(switchRelease), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  store.upsertFromGame(2, steamRelease, evaluateKatalogGame(steamRelease), '/covers/cccccccccccccccccccccccccccccccc.jpg');
  store.upsertFromGame(3, otherTitle, evaluateKatalogGame(otherTitle), '/covers/dddddddddddddddddddddddddddddddd.jpg');
  const first = store.listPublic({ limit: 1 });
  assert.deepEqual([first.total, first.pages, first.entries.length, first.entries[0].releaseCount], [2, 2, 1, 2]);
  const second = store.listPublic({ limit: 1, page: 2 });
  assert.deepEqual([second.page, second.entries.length, second.entries[0].title], [2, 1, 'Zelda Echoes']);
  const bounded = store.listPublic({ limit: 1, page: 999 });
  assert.deepEqual([bounded.page, bounded.pages, bounded.entries[0].title], [2, 2, 'Zelda Echoes']);
});

test('IGDB identity groups differently titled platform releases', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const ps4 = game({ igdbId: 100, title: 'NieR: Automata', platform: 'PS4', hltbTitle: 'NieR: Automata', coverMatchTitle: 'NieR: Automata' });
  const switchRelease = game({ id: 22, igdbId: 100, title: 'NieR Automata: The End of YoRHa Edition', platform: 'Nintendo Switch',
    hltbTitle: 'NieR Automata: The End of YoRHa Edition', coverMatchTitle: 'NieR Automata: The End of YoRHa Edition' });
  store.upsertFromGame(1, ps4, evaluateKatalogGame(ps4), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  store.upsertFromGame(2, switchRelease, evaluateKatalogGame(switchRelease), '/covers/cccccccccccccccccccccccccccccccc.jpg');
  const result = store.listPublic();
  assert.equal(result.total, 1);
  assert.equal(result.entries[0].releaseCount, 2);
  assert.equal(new Set(result.entries[0].releases.map(entry => entry.canonicalGameId)).size, 1);
});

test('equal titles with different IGDB identities do not merge across platforms', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const original = game({ igdbId: 1, title: 'Doom', platform: 'DOS', hltbTitle: 'Doom', coverMatchTitle: 'Doom' });
  const reboot = game({ id: 22, igdbId: 2, title: 'Doom', platform: 'PS4', hltbTitle: 'Doom', coverMatchTitle: 'Doom' });
  store.upsertFromGame(1, original, evaluateKatalogGame(original), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  store.upsertFromGame(2, reboot, evaluateKatalogGame(reboot), '/covers/cccccccccccccccccccccccccccccccc.jpg');
  const result = store.listPublic();
  assert.equal(result.total, 2);
  assert.equal(new Set(result.entries.map(entry => entry.canonicalGameId)).size, 2);
});

test('same-platform normalized-title collisions with different IGDB identities remain unlinked', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const first = game({ igdbId: 11429, title: '18 Wheels of Steel: Extreme Trucker 2', platform: 'GOG' });
  const conflicting = game({ id: 22, igdbId: 11428, title: '18 Wheels of Steel Extreme Trucker 2', platform: 'GOG' });
  const original = store.upsertFromGame(1, first, evaluateKatalogGame(first), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  const result = store.upsertFromGame(2, conflicting, evaluateKatalogGame(conflicting), '/covers/cccccccccccccccccccccccccccccccc.jpg');

  assert.equal(result.identityConflict, true);
  assert.equal(result.entry.id, original.entry.id);
  assert.equal(result.usedCover, false);
  assert.equal(database.prepare('SELECT COUNT(*) count FROM catalogue_entries').get().count, 1);
  assert.equal(database.prepare('SELECT COUNT(*) count FROM catalogue_game_links').get().count, 1);
  assert.equal(database.prepare('SELECT COUNT(*) count FROM catalogue_game_links WHERE game_id=22').get().count, 0);
});

test('candidate records remain absent from public pages until reviewed', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const source = game({ coverMatchTitle: 'Metroid Collection' });
  const result = store.upsertFromGame(1, source, evaluateKatalogGame(source), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  assert.equal(result.entry.status, 'candidate');
  assert.equal(store.listPublic().total, 0);
  assert.equal(store.setStatus(result.entry.id, 'public').status, 'public');
  assert.equal(store.listPublic().total, 1);
});

test('administrator updates shared facts without changing a release slug or moderation state', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const source = game();
  const original = store.upsertFromGame(1, source, evaluateKatalogGame(source), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg').entry;
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

test('sitemap entries use the release update time rather than its original publication time', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const created = store.upsertFromGame(1, game(), evaluateKatalogGame(game()), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg').entry;
  database.prepare("UPDATE catalogue_entries SET published_at='2026-01-01 00:00:00', updated_at='2026-08-29 12:00:00' WHERE id=?").run(created.id);
  const [entry] = store.sitemapEntries();
  assert.equal(entry.updatedAt, '2026-08-29 12:00:00');
  assert.equal(entry.coverUrl, '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
});

test('administrator cannot merge two catalogue identities through an edit', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const first = game(); const second = game({ id: 22, title: 'Metroid Prime', hltbTitle: 'Metroid Prime', coverMatchTitle: 'Metroid Prime' });
  const firstEntry = store.upsertFromGame(1, first, evaluateKatalogGame(first), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg').entry;
  store.upsertFromGame(2, second, evaluateKatalogGame(second), '/covers/cccccccccccccccccccccccccccccccc.jpg');
  assert.throws(() => store.updateAdmin(firstEntry.id, { ...firstEntry, title: second.title, platform: second.platform }), /already uses/);
});

test('an administrator rejection is sticky across later account synchronization', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const source = game({ coverMatchTitle: 'Metroid Collection' });
  const result = store.upsertFromGame(1, source, evaluateKatalogGame(source), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  store.setStatus(result.entry.id, 'rejected');
  const next = store.upsertFromGame(1, source, evaluateKatalogGame(source), '/covers/cccccccccccccccccccccccccccccccc.jpg');
  assert.equal(next.entry.status, 'rejected');
  assert.equal(next.usedCover, false);
  assert.equal(store.listPublic().total, 0);
});

test('editing a linked private row to a different release moves its catalogue link', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const first = game();
  const original = store.upsertFromGame(1, first, evaluateKatalogGame(first), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  const changed = game({ title: 'Metroid Prime Remastered', hltbTitle: 'Metroid Prime Remastered', coverMatchTitle: 'Metroid Prime Remastered' });
  const replacement = store.upsertFromGame(1, changed, evaluateKatalogGame(changed), '/covers/cccccccccccccccccccccccccccccccc.jpg');
  const link = database.prepare('SELECT catalogue_id AS catalogueId FROM catalogue_game_links WHERE game_id=11').get();
  assert.notEqual(original.entry.id, replacement.entry.id);
  assert.equal(link.catalogueId, replacement.entry.id);
});

test('an obsolete public link is detached before a changed IGDB identity is synchronized', t => {
  const { database, store } = fixture(); t.after(() => database.close());
  const source = game({ igdbId: 411 });
  store.upsertFromGame(1, source, evaluateKatalogGame(source), '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  assert.equal(store.unlinkIfMismatched({ ...source, igdbId: 999 }), true);
  assert.equal(database.prepare('SELECT COUNT(*) count FROM catalogue_game_links WHERE game_id=11').get().count, 0);
  assert.equal(store.unlinkIfMismatched({ ...source, igdbId: 999 }), false);
});
