const test = require('node:test');
const assert = require('node:assert/strict');
const { coverUrl, hours, normalize, parseGame, similarity } = require('../server/hltb');
const fs = require('node:fs');
const path = require('node:path');

test('HLTB response values are reduced to safe hour estimates', () => {
  assert.equal(hours(0), null);
  assert.equal(hours(90), 0.03);
  assert.equal(hours(132600), 36.83);
  assert.deepEqual(parseGame({
    game_id: 174354, game_name: 'Pokémon Pokopia', game_image: '174354_Pokemon_Pokopia.jpg', comp_main: 132600,
    comp_plus: 192276, comp_100: 512928, comp_all: 184500,
  }, 'Pokemon Pokopia'), {
    id: 174354, title: 'Pokémon Pokopia', url: 'https://howlongtobeat.com/game/174354',
    mainStory: 36.83, mainExtra: 53.41, completionist: 142.48, allStyles: 51.25,
    coverUrl: 'https://howlongtobeat.com/games/174354_Pokemon_Pokopia.jpg', similarity: 1,
  });
});

test('HLTB lookup targets the current endpoint and normalizes title matching', () => {
  const provider = fs.readFileSync(path.join(__dirname, '..', 'server/hltb.js'), 'utf8');
  assert.match(provider, /const SEARCH_PATH = '\/api\/search\/site'/);
  assert.match(provider, /\$\{BASE_URL\}\$\{SEARCH_PATH\}\/init/);
  assert.match(provider, /if \(results\.length\) cache\.set\(key, \{ at: Date\.now\(\), results \}\)/);
  assert.equal(normalize('Pokémon™ & Friends'), 'pokemon and friends');
  assert.equal(similarity('Pokémon Pokopia', 'Pokemon Pokopia'), 1);
  assert.ok(similarity('Metroid Prime 4', 'Metroid Prime Four') > 0.7);
  assert.equal(coverUrl('Portal2cover.jpg'), 'https://howlongtobeat.com/games/Portal2cover.jpg');
  assert.equal(coverUrl('Mario & Luigi.jpg'), 'https://howlongtobeat.com/games/Mario%20%26%20Luigi.jpg');
  assert.equal(coverUrl('../not-a-cover.jpg'), '');
});
