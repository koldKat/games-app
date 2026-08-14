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
