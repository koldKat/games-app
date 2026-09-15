const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function formatModule() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/stats-format.js'), 'utf8')
    .replace("import { UI_LOCALE } from './ui-policy.js';", "const UI_LOCALE = 'en-US';");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('aggregate HLTB hours are expressed as years, days, and hours', async () => {
  const { formatPlaytime } = await formatModule();
  assert.equal(formatPlaytime(19_036.5), '2y 63d 5h');
  assert.equal(formatPlaytime(31_297.6), '3y 209d 2h');
  assert.equal(formatPlaytime(60_003.5), '6y 310d 4h');
  assert.equal(formatPlaytime(29_870.2), '3y 149d 14h');
});

test('short and empty HLTB totals omit meaningless leading units', async () => {
  const { formatPlaytime } = await formatModule();
  assert.equal(formatPlaytime(49), '2d 1h');
  assert.equal(formatPlaytime(7.4), '7h');
  assert.equal(formatPlaytime(null), '0h');
});

test('uptime can retain enough precision to reveal small amounts of downtime', async () => {
  const { formatPercent } = await formatModule();
  assert.equal(formatPercent(99.9753643487, 2), '99.98%');
  assert.equal(formatPercent(99.9753643487), '100.0%');
});
