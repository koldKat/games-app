const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function uiModule() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/hltb-ui.js'), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('new-game HLTB state accepts an explicit null game', async () => {
  const { metadataFrom } = await uiModule();
  assert.deepEqual(metadataFrom(null), {
    hltbId: null, hltbTitle: '', hltbUrl: '', hltbMainStory: null, hltbMainExtra: null,
    hltbCompletionist: null, hltbAllStyles: null, hltbUpdatedAt: null,
  });
});

test('saved HLTB state keeps zero-safe nullable estimates', async () => {
  const { metadataFrom } = await uiModule();
  assert.deepEqual(metadataFrom({ hltbId: 42, hltbTitle: 'Game', hltbMainStory: 8, hltbMainExtra: null }), {
    hltbId: 42, hltbTitle: 'Game', hltbUrl: '', hltbMainStory: 8, hltbMainExtra: null,
    hltbCompletionist: null, hltbAllStyles: null, hltbUpdatedAt: null,
  });
});
