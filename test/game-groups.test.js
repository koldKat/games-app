const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('selected copy supplies the rating and action ID after regrouping and updates', async () => {
  const source = fs.readFileSync(require.resolve('../public/js/game-groups.js'), 'utf8');
  const { groupGames, selectedGroupCopy } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const games = [
    { id: 1, title: 'Biomutant', platform: 'Switch', rating: 2, coverUrl: '/covers/switch.jpg' },
    { id: 2, title: 'Biomutant', platform: 'PS4', rating: 4 },
  ];
  const selected = new Set([2]);
  const copy = selectedGroupCopy(groupGames(games)[0], selected);
  assert.equal(copy.id, 2);
  assert.equal(copy.rating, 4);
  assert.equal(copy.platform, 'PS4');
  assert.equal(copy.versions.length, 2);
  games[1].rating = 4.5;
  assert.equal(selectedGroupCopy(groupGames(games)[0], selected).rating, 4.5);
  assert.equal(selectedGroupCopy(groupGames([games[0]])[0], selected).id, 1);
  assert.equal(games[0].rating, 2);
});
