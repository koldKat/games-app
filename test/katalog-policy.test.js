const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateKatalogGame, hasDurableCover, normalizeKatalogText,
} = require('../server/katalog-policy');

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
  const result = evaluateKatalogGame(completeGame());
  assert.equal(result.eligible, true);
  assert.equal(result.status, 'public');
  assert.equal(result.confidence, 100);
  assert.deepEqual(result.reasons, []);
});

test('complete but ambiguous records become review candidates', () => {
  const result = evaluateKatalogGame(completeGame({ coverMatchTitle: 'Zelda Collection' }));
  assert.equal(result.eligible, true);
  assert.equal(result.status, 'candidate');
  assert.ok(result.reasons.includes('cover-title-ambiguous'));
});

test('missing enrichment remains private and ineligible', () => {
  const result = evaluateKatalogGame(completeGame({ hltbId: null, hltbMainStory: null }));
  assert.equal(result.eligible, false);
  assert.equal(result.status, null);
  assert.ok(result.reasons.includes('missing-hltb'));
});

test('catalogue normalization handles punctuation and accents without weakening exactness', () => {
  assert.equal(normalizeKatalogText('Pokémon™: Let’s Go!'), 'pokemon let s go');
  assert.equal(hasDurableCover(completeGame()), true);
  assert.equal(hasDurableCover(completeGame({ coverUrl: 'https://images.example/game.jpg' })), false);
});
