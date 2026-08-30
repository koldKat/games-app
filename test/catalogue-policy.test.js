const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateCatalogueGame, hasDurableCover, normalizeCatalogueText,
} = require('../server/catalogue-policy');

const completeGame = overrides => ({
  id: 7,
  title: 'The Legend of Zelda: Echoes of Wisdom',
  platform: 'Nintendo Switch',
  pegi: 7,
  pegiUrl: 'https://pegi.info/game/zelda',
  hltbId: 101,
  hltbTitle: 'The Legend of Zelda: Echoes of Wisdom',
  hltbMainStory: 18,
  coverUrl: '/covers/0123456789abcdef0123456789abcdef.jpg',
  coverMatchTitle: 'The Legend of Zelda: Echoes of Wisdom',
  ...overrides,
});

test('only complete, exact factual records publish automatically', () => {
  const result = evaluateCatalogueGame(completeGame());
  assert.equal(result.eligible, true);
  assert.equal(result.status, 'public');
  assert.equal(result.confidence, 100);
  assert.deepEqual(result.reasons, []);
});

test('complete but ambiguous records become review candidates', () => {
  const result = evaluateCatalogueGame(completeGame({ coverMatchTitle: 'Zelda Collection' }));
  assert.equal(result.eligible, true);
  assert.equal(result.status, 'candidate');
  assert.ok(result.reasons.includes('cover-title-ambiguous'));
});

test('missing enrichment remains private and ineligible', () => {
  const result = evaluateCatalogueGame(completeGame({ hltbId: null, hltbMainStory: null }));
  assert.equal(result.eligible, false);
  assert.equal(result.status, null);
  assert.ok(result.reasons.includes('missing-hltb'));
});

test('substantive ESRB metadata can qualify a release without PEGI', () => {
  const result = evaluateCatalogueGame(completeGame({ pegi: null, pegiUrl: '', esrbRating: 'E10+', esrbUrl: 'https://www.esrb.org/ratings/1/example/', esrbDescriptors: ['Fantasy Violence'] }));
  assert.equal(result.eligible, true);
  assert.equal(result.status, 'public');
  assert.deepEqual(result.reasons, []);
});

test('catalogue normalization handles punctuation and accents without weakening exactness', () => {
  assert.equal(normalizeCatalogueText('Pokémon™: Let’s Go!'), 'pokemon let s go');
  assert.equal(hasDurableCover(completeGame()), true);
  assert.equal(hasDurableCover(completeGame({ coverUrl: 'https://images.example/game.jpg' })), false);
});
