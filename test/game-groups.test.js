const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

async function versionPickerModule() {
  const platforms = fs.readFileSync(require.resolve('../public/js/platforms.js'), 'utf8');
  const platformUrl = `data:text/javascript;base64,${Buffer.from(platforms).toString('base64')}`;
  const source = fs.readFileSync(require.resolve('../public/js/version-picker.js'), 'utf8')
    .replace("'./platforms.js'", JSON.stringify(platformUrl));
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('selected copy supplies the rating and action ID after regrouping and updates', async () => {
  const source = fs.readFileSync(require.resolve('../public/js/game-groups.js'), 'utf8');
  const { groupGames, selectedGroupCopy } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const { cardVersionControl } = await versionPickerModule();
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
  const control = cardVersionControl(copy, value => String(value), { physical: 'Physical' });
  assert.match(control, /platform-tag-label">PS4</);
  assert.match(control, /aria-checked="true" data-action="version" data-game-id="2"/);
  games[1].rating = 4.5;
  assert.equal(selectedGroupCopy(groupGames(games)[0], selected).rating, 4.5);
  assert.equal(selectedGroupCopy(groupGames([games[0]])[0], selected).id, 1);
  assert.equal(games[0].rating, 2);
});

test('the edition picker safely ignores a missing insertion anchor', async () => {
  const { renderVersionPicker } = await versionPickerModule();
  assert.doesNotThrow(() => renderVersionPicker({ querySelector() { throw new Error('must not inspect host'); } }, { id: 1 }, [], () => [], () => {}, null));
});

test('canonical identities group title variants without merging distinct games', async () => {
  const source = fs.readFileSync(require.resolve('../public/js/game-groups.js'), 'utf8');
  const { groupGames } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const games = [
    { id: 1, canonicalGameId: 90, title: 'NieR: Automata', platform: 'PS4' },
    { id: 2, canonicalGameId: 90, title: 'NieR Automata: The End of YoRHa Edition', platform: 'Switch' },
    { id: 3, canonicalGameId: 91, title: 'NieR: Automata', platform: 'Steam' },
  ];
  const grouped = groupGames(games);
  assert.equal(grouped.length, 2);
  assert.deepEqual(grouped.map(group => group.versionCount).sort(), [1, 2]);
  assert.equal(groupGames(games, { splitPlatforms: true }).length, 3);
});
