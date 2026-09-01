const test = require('node:test');
const assert = require('node:assert/strict');

const { isAppViewPath, wantsAuthenticatedShell } = require('../server/app-shell');

function request(headers = {}, method = 'GET') { return { method, headers }; }
function url(pathname) { return { pathname }; }

test('authenticated document refreshes mount the application shell on every app view', () => {
  const user = { id: 1 };
  for (const pathname of ['/signal', '/katalog', '/forum', '/forum/c/general', '/forum/thread/3', '/game/portal-2-steam']) {
    assert.equal(isAppViewPath(pathname), true);
    assert.equal(wantsAuthenticatedShell(request({ accept: 'text/html' }), url(pathname), user), true);
  }
});

test('guests and partial view fetches retain crawlable server rendering', () => {
  assert.equal(wantsAuthenticatedShell(request({ accept: 'text/html' }), url('/signal'), null), false);
  assert.equal(wantsAuthenticatedShell(request({ accept: 'text/html', 'x-gamekat-partial': '1' }), url('/signal'), { id: 1 }), false);
  assert.equal(wantsAuthenticatedShell(request({ accept: 'application/json' }), url('/signal'), { id: 1 }), false);
  assert.equal(wantsAuthenticatedShell(request({ accept: 'text/html' }, 'POST'), url('/signal'), { id: 1 }), false);
  assert.equal(wantsAuthenticatedShell(request({ accept: 'text/html' }), url('/docs/user-guide.html'), { id: 1 }), false);
});
