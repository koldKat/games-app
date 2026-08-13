const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function sortingModule() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/game-sorting.js'), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const games = [
  { id: 1, title: 'Long', platform: 'PC', hltbMainStory: 30, hltbMainExtra: 40, hltbCompletionist: 60, hltbAllStyles: 35 },
  { id: 2, title: 'Missing', platform: 'PC', hltbMainStory: null, hltbMainExtra: null, hltbCompletionist: null, hltbAllStyles: null },
  { id: 3, title: 'Short', platform: 'PC', hltbMainStory: 3, hltbMainExtra: 5, hltbCompletionist: 8, hltbAllStyles: 4 },
];

test('client HLTB duration sorts mirror null-last server ordering', async () => {
  const { compareGames } = await sortingModule();
  for (const [shortSort, longSort] of [['hltb_main_short', 'hltb_main_long'], ['hltb_extra_short', 'hltb_extra_long'],
    ['hltb_100_short', 'hltb_100_long'], ['hltb_all_short', 'hltb_all_long']]) {
    assert.deepEqual([...games].sort((a, b) => compareGames(a, b, shortSort)).map(game => game.title), ['Short', 'Long', 'Missing']);
    assert.deepEqual([...games].sort((a, b) => compareGames(a, b, longSort)).map(game => game.title), ['Long', 'Short', 'Missing']);
  }
});

test('client title ordering is accent-insensitive and deterministic', async () => {
  const { compareGames } = await sortingModule();
  const titles = [{ id: 3, title: 'Zelda' }, { id: 2, title: 'Pokemon' }, { id: 1, title: 'Pokémon' }];
  assert.deepEqual(titles.sort((a, b) => compareGames(a, b, 'title')).map(game => game.id), [1, 2, 3]);
  assert.deepEqual(titles.sort((a, b) => compareGames(a, b, 'title_desc')).map(game => game.id), [3, 2, 1]);
});
