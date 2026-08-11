const test = require('node:test');
const assert = require('node:assert/strict');
const { parseResults } = require('../server/pegi');

test('PEGI HTML results are reduced to safe metadata', () => {
  const html = `<div id="results"><article class="game"><div class="game-content__header-rating"><img src="https://rating.pegi.info/assets/images/games/age_threshold_icons/7.png"></div><div class="game-content__header-title"><h3>ASTRO BOT</h3><span class="publisher">Sony Interactive Entertainment Europe</span></div><img src="x/category_threshold_icons/fear.png" alt="Fear"><span>Release Dates &amp; Platforms:</span><ul><li><div class="icon-playstation-5">PlayStation 5 - 06/09/2024</div></li></ul></article></main>`;
  assert.deepEqual(parseResults(html, 'Astro Bot')[0], {
    title: 'ASTRO BOT', publisher: 'Sony Interactive Entertainment Europe', pegi: 7,
    descriptors: ['Fear'], releases: ['PlayStation 5 - 06/09/2024'], releaseYear: 2024,
    pegiUrl: 'https://pegi.info/search-pegi?q=ASTRO%20BOT',
  });
});
