const test = require('node:test');
const assert = require('node:assert/strict');
const { hours, normalize, parseGame, searchPath, similarity } = require('../server/hltb');

test('HLTB response values are reduced to safe hour estimates', () => {
  assert.equal(hours(0), null);
  assert.equal(hours(90), 0.03);
  assert.equal(hours(132600), 36.83);
  assert.deepEqual(parseGame({
    game_id: 174354, game_name: 'Pokémon Pokopia', comp_main: 132600,
    comp_plus: 192276, comp_100: 512928, comp_all: 184500,
  }, 'Pokemon Pokopia'), {
    id: 174354, title: 'Pokémon Pokopia', url: 'https://howlongtobeat.com/game/174354',
    mainStory: 36.83, mainExtra: 53.41, completionist: 142.48, allStyles: 51.25, similarity: 1,
  });
});

test('HLTB search discovery and title matching tolerate current bundle formatting', () => {
  assert.equal(searchPath('return fetch("/api/bleed/v2",{headers:x,method:"POST",body:y})'), '/api/bleed');
  assert.equal(searchPath('fetch("/api/not-a-search",{method:"GET"})'), '');
  assert.equal(normalize('Pokémon™ & Friends'), 'pokemon and friends');
  assert.equal(similarity('Pokémon Pokopia', 'Pokemon Pokopia'), 1);
  assert.ok(similarity('Metroid Prime 4', 'Metroid Prime Four') > 0.7);
});
