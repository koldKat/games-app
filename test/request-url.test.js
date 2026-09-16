const test = require('node:test');
const assert = require('node:assert/strict');

const { decodeRequestPathname, parseRequestUrl } = require('../server/request-url');

test('request URL parsing accepts ordinary origin-form targets', () => {
  const parsed = parseRequestUrl('/api/games?view=compact');
  assert.equal(parsed.pathname, '/api/games');
  assert.equal(parsed.searchParams.get('view'), 'compact');
  assert.equal(decodeRequestPathname(parseRequestUrl('/covers/Game%20Cover.jpg')), '/covers/Game Cover.jpg');
});

test('request URL parsing rejects authority, absolute, and malformed targets', () => {
  for (const target of ['//%2F.env', 'https://attacker.invalid/path', '/\\attacker.invalid/path', '/bad\u0000path', '', null]) {
    assert.equal(parseRequestUrl(target), null);
  }
  assert.equal(decodeRequestPathname(parseRequestUrl('/bad%encoding')), null);
});
