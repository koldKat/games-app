const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTitle, titleSuggestions } = require('../server/covers');

test('cover title normalization handles punctuation and marks conservatively', () => {
  assert.equal(normalizeTitle('Pokémon™: Let’s Go, Pikachu!'), 'pokemon let s go pikachu');
  assert.equal(normalizeTitle('Mario & Luigi: Brothership'), 'mario and luigi brothership');
  assert.notEqual(normalizeTitle('Resident Evil 4'), normalizeTitle('Resident Evil 4 Remake'));
});

test('title autocomplete keeps unique SteamGridDB names only', () => {
  assert.deepEqual(titleSuggestions([
    { name: 'Metroid Prime' }, { name: ' metroid prime ' }, { name: 'Metroid Prime 2: Echoes' }, null, { name: '' },
  ]), ['Metroid Prime', 'Metroid Prime 2: Echoes']);
});
