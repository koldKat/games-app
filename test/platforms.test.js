const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function platformsModule() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/platforms.js'), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('platform catalogue includes major PC storefronts and launchers', async () => {
  const { isPcStorefront, knownPlatforms, pcStorefronts, platformGroups } = await platformsModule();
  for (const platform of ['Steam', 'GOG', 'Epic Games Store']) {
    assert.ok(pcStorefronts.includes(platform));
    assert.ok(knownPlatforms.has(platform));
    assert.equal(isPcStorefront(platform), true);
  }
  assert.equal(platformGroups['PC storefronts & launchers'], pcStorefronts);
});

test('PEGI PC release text maps to Windows without replacing storefront identity', async () => {
  const { isPcStorefront, platformFromReleaseText } = await platformsModule();
  assert.equal(platformFromReleaseText('PC - 14/08/2026'), 'PC (Windows)');
  assert.equal(platformFromReleaseText('Steam - 14/08/2026'), 'Steam');
  assert.equal(isPcStorefront('PC (Windows)'), false);
});

test('platform themes resolve audited product identities without regex guessing', async () => {
  const { knownPlatforms, platformDisplayName, platformTheme, platformThemeClass, platformThemes } = await platformsModule();
  assert.equal(platformDisplayName('Nintendo Entertainment System'), 'NES');
  assert.equal(platformDisplayName('Super Nintendo Entertainment System'), 'SNES');
  assert.equal(platformDisplayName('Nintendo Switch'), 'Nintendo Switch');
  assert.equal(platformTheme('Nintendo Switch'), 'nintendo-red');
  assert.equal(platformTheme('Nintendo GameCube'), 'gamecube');
  assert.equal(platformTheme('Nintendo Wii U'), 'wii-u');
  assert.equal(platformTheme('Nintendo 64'), 'nintendo-multicolor');
  assert.equal(platformTheme('PlayStation'), 'playstation-original');
  assert.equal(platformTheme('PlayStation 5'), 'playstation');
  assert.equal(platformTheme('Xbox Series X|S'), 'xbox');
  assert.equal(platformTheme('Evercade VS'), 'evercade');
  assert.equal(platformTheme('Steam Deck'), 'steam-deck');
  assert.equal(platformTheme('Steam'), 'steam');
  assert.equal(platformTheme('GOG'), 'gog');
  assert.equal(platformTheme('Epic Games Store'), 'epic');
  assert.equal(platformThemeClass('My Homemade Console'), 'platform-theme-custom');
  assert.equal(Object.keys(platformThemes).length, knownPlatforms.size);
  assert.equal(Object.isFrozen(platformThemes), true);
  for (const platform of knownPlatforms) {
    assert.notEqual(platformTheme(platform), 'custom', platform);
    assert.equal(Object.hasOwn(platformThemes, platform), true, platform);
  }
});
