const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('authentication resumes only local public views and preserves their queries', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/auth-return.js'), 'utf8');
  const { publicAuthReturn } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const origin = 'https://gamekat.net';
  for (const value of ['/game/alpha-switch', '/katalog?q=Alpha&page=2', '/signal', '/forum/thread/12']) {
    assert.equal(publicAuthReturn(value, origin), value);
  }
  for (const value of [null, '', '//example.com/game/alpha', 'https://example.com/game/alpha', '/admin', '/api/games', '/game/', '/katalog-extra']) {
    assert.equal(publicAuthReturn(value, origin), null);
  }
});
