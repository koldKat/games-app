'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const gog = require('../server/gog-library');

function page(number, pages, products) {
  return { page: number, totalPages: pages, totalProducts: products.length, products };
}
function game(id, title) { return { id: String(id), title }; }

test('GOG authorization accepts only a code or the expected result URL', () => {
  assert.equal(gog.authorizationCode('abcdefgh_1234'), 'abcdefgh_1234');
  assert.equal(gog.authorizationCode('https://embed.gog.com/on_login_success?origin=client&code=abcdefgh_1234'), 'abcdefgh_1234');
  assert.throws(() => gog.authorizationCode('https://example.com/on_login_success?code=abcdefgh_1234'), /complete GOG authorization/);
});

test('GOG exchanges an authorization code without exposing account credentials to the browser', async () => {
  let requested;
  const tokens = await gog.exchangeAuthorization('abcdefgh_1234', async url => {
    requested = new URL(String(url));
    return new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 120 }));
  });
  assert.equal(requested.hostname, 'auth.gog.com');
  assert.equal(requested.searchParams.get('grant_type'), 'authorization_code');
  assert.equal(requested.searchParams.get('code'), 'abcdefgh_1234');
  assert.equal(tokens.accessToken, 'access');
  assert.equal(tokens.refreshToken, 'refresh');
});

test('GOG owned games reads visible and hidden pagination and removes duplicates', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(String(url));
    const hidden = parsed.searchParams.get('hiddenFlag') === '1';
    const pageNumber = Number(parsed.searchParams.get('page')); requests.push([hidden, pageNumber]);
    assert.equal(options.headers.Authorization, 'Bearer access');
    if (!hidden) return new Response(JSON.stringify(page(pageNumber, 1, [game(2, 'Second'), game(1, 'First')])));
    return new Response(JSON.stringify(page(pageNumber, 2, pageNumber === 1 ? [game(2, 'Second'), game(3, 'Third')] : [game(4, 'Fourth')])));
  };
  const progress = [];
  const games = await gog.ownedGames('access', fetchImpl, update => progress.push(update));
  assert.deepEqual(requests, [[false, 1], [true, 1], [true, 2]]);
  assert.deepEqual(games.map(item => item.productId), ['1', '4', '2', '3']);
  assert.equal(games.find(item => item.productId === '2').sourceHidden, false);
  assert.equal(games.find(item => item.productId === '3').sourceHidden, true);
  assert.deepEqual(progress.map(item => [item.page, item.pages]), [[1, 3], [2, 3], [3, 3]]);
});

test('GOG refresh retains an existing refresh token when the response rotates only access', async () => {
  const tokens = await gog.refreshAuthorization('old-refresh', async () => new Response(JSON.stringify({ access_token: 'new-access', expires_in: 600 })));
  assert.equal(tokens.refreshToken, 'old-refresh');
});

test('GOG authorization failures request a reconnect and oversized pagination fails closed', async () => {
  await assert.rejects(() => gog.ownedGames('expired', async () => new Response('', { status: 401 })), /connection expired/);
  const fetchImpl = async url => {
    const hidden = new URL(String(url)).searchParams.get('hiddenFlag') === '1';
    return new Response(JSON.stringify(page(1, hidden ? 101 : 100, [])));
  };
  await assert.rejects(() => gog.ownedGames('access', fetchImpl), /too large/);
});

test('GOG account identity is validated', async () => {
  assert.deepEqual(await gog.account('access', async () => new Response(JSON.stringify({ username: 'Kat', userId: '42' }))), { username: 'Kat', userId: '42' });
  await assert.rejects(() => gog.account('access', async () => new Response('{}')), /valid account identity/);
});
