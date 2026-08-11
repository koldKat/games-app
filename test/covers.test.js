const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTitle } = require('../server/covers');

test('cover title normalization handles punctuation and marks conservatively', () => {
  assert.equal(normalizeTitle('Pokémon™: Let’s Go, Pikachu!'), 'pokemon let s go pikachu');
  assert.equal(normalizeTitle('Mario & Luigi: Brothership'), 'mario and luigi brothership');
  assert.notEqual(normalizeTitle('Resident Evil 4'), normalizeTitle('Resident Evil 4 Remake'));
});
