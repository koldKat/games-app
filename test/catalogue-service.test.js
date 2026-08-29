const test = require('node:test');
const assert = require('node:assert/strict');

const { createCatalogueService } = require('../server/catalogue-service');

function publicEntry(overrides = {}) {
  return {
    id: 4, title: 'Portal 2', platform: 'Steam', pegi: 12, publisher: 'Valve', releaseYear: 2011,
    pegiUrl: 'https://pegi.info/portal-2', pegiDescriptors: ['Violence'], pegiReleases: [], pegiAdvice: '',
    pegiOutline: '', pegiContentIssues: '', pegiOtherIssues: '', hltbId: 2, hltbTitle: 'Portal 2',
    hltbUrl: 'https://howlongtobeat.com/game/2', hltbMainStory: 8, hltbMainExtra: 13,
    hltbCompletionist: 21, hltbAllStyles: 12, coverUrl: '/covers/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
    coverSource: 'steamgriddb', coverMatchTitle: 'Portal 2', ...overrides,
  };
}

test('adding from the catalogue creates a private row with an independent cover', () => {
  const calls = { removed: [] }; const entry = publicEntry();
  const service = createCatalogueService({
    data: {
      findDuplicateGames: () => [],
      createGame: (userId, input) => ({ id: 9, userId, ...input }),
      deleteGame: () => true,
    },
    store: {
      getPublicById: () => entry,
      link: (catalogueId, gameId, userId) => { calls.link = [catalogueId, gameId, userId]; },
      counts: () => ({}), getById() {}, getPublicBySlug() {}, listAdmin() {}, listPublic() {}, publicPlatforms() {},
      remove() {}, searchPublic() {}, setStatus() {}, sitemapEntries() {},
    },
    covers: { copy: () => '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg', remove: url => calls.removed.push(url) },
  });
  const game = service.addToLibrary(20, 4, { ownership: 'wanted', mediaFormat: 'digital' });
  assert.equal(game.coverUrl, '/covers/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg');
  assert.equal(game.ownership, 'wanted');
  assert.equal(game.notes, '');
  assert.deepEqual(calls.link, [4, 9, 20]);
  assert.deepEqual(calls.removed, []);
});

test('duplicate catalogue release is rejected without copying a cover', () => {
  let copied = false;
  const service = createCatalogueService({
    data: { findDuplicateGames: () => [{ id: 3, title: 'Portal 2', platform: 'Steam' }] },
    store: { getPublicById: () => publicEntry(), counts() {}, getById() {}, getPublicBySlug() {}, listAdmin() {}, listPublic() {}, publicPlatforms() {}, remove() {}, searchPublic() {}, setStatus() {}, sitemapEntries() {} },
    covers: { copy: () => { copied = true; }, remove() {} },
  });
  assert.throws(() => service.addToLibrary(20, 4), error => error.status === 409);
  assert.equal(copied, false);
});

test('library-copy lookup exposes an existing private duplicate for public-page rendering', () => {
  const existing = { id: 3, title: 'Portal 2', platform: 'Steam' };
  const service = createCatalogueService({
    data: { findDuplicateGames: () => [existing] },
    store: { getPublicById: () => publicEntry(), counts() {}, getById() {}, getPublicBySlug() {}, listAdmin() {}, listPublic() {}, publicPlatforms() {}, remove() {}, searchPublic() {}, setStatus() {}, sitemapEntries() {} },
    covers: { copy() {}, remove() {} },
  });
  assert.equal(service.libraryCopy(20, 4), existing);
});

test('safe synchronization never breaks the calling private-library operation', () => {
  const messages = [];
  const service = createCatalogueService({
    data: {},
    store: { findByIdentity: () => null, counts() {}, getById() {}, getPublicById() {}, getPublicBySlug() {}, listAdmin() {}, listPublic() {}, publicPlatforms() {}, remove() {}, searchPublic() {}, setStatus() {}, sitemapEntries() {} },
    covers: { copy: () => { throw new Error('disk full'); }, remove() {} },
    logger: { error: message => messages.push(message) },
  });
  const result = service.syncGameSafely(1, publicEntry({ id: 10 }));
  assert.equal(result.state, 'error');
  assert.match(messages[0], /disk full/);
});
