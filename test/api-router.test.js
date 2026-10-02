const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createApiRouter } = require('../server/routes/api');
const { sendJson } = require('../server/http/responses');
const { readJson } = require('../server/http/body');

function response() {
  return {
    headers: {}, headersSent: false,
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); this.headersSent = true; },
    end(body) { this.body = JSON.parse(body); },
  };
}

function fixture() {
  const calls = [];
  const user = { id: 17, username: 'collector' };
  let signedIn = true;
  const context = {
    sendJson, readJson, RUNTIME_POLICY: { showcaseCoverCount: 6 }, readVersion: () => 'test-version',
    auth: { authenticate: () => signedIn ? user : null, clientIp: () => '127.0.0.1', refreshSessionCookie: () => null },
    userLocation: { record: (...args) => calls.push(['location', ...args]) },
    preferences: { get: () => ({ sort: 'title' }) }, progression: { info: () => ({ xp: 100, level: 0 }) },
    showcasePool: { owned: (_, id) => [`owned-${id}`], shared: () => ['public'] },
    siteStats: { snapshot: () => ({ users: 1 }) }, activity: { feed: () => ({ entries: [] }) },
    events: { subscribe: (req, res, id) => sendJson(res, 200, { subscribed: id }) },
    db: {
      listGamesPage: (id, filters) => ({ games: [], account: id, ...filters }),
      getGame: (id, gameId) => gameId === 1 ? { id: 1, userId: id } : null,
      createGame: (id, input) => ({ id: 2, userId: id, ...input }),
      findDuplicateGames: () => [], searchGameTitles: () => [{ title: 'Local game' }],
    },
    prepareGameCover: async input => ({ input }),
    syncKatalogAndRecordProgress: (id, game) => { calls.push(['progress', id, game.id]); return { awards: [] }; },
    steamGridKey: () => '', providerCredentials: () => ({}), TITLE_AUTOCOMPLETE_MIN_LENGTH: 3,
    katalog: { searchPublic: () => [] }, igdb: { searchGames: async () => { throw new Error('Provider offline'); } },
  };
  const router = createApiRouter(context);
  return {
    calls, setSignedIn(value) { signedIn = value; },
    async request(target, method = 'GET', body) {
      const req = Readable.from(body ? [JSON.stringify(body)] : []);
      req.method = method; req.headers = {};
      const res = response(); await router(req, res, new URL(target, 'http://localhost')); return res;
    },
  };
}

test('public routes do not require authentication; private routes do', async () => {
  const app = fixture(); app.setSignedIn(false);
  assert.equal((await app.request('/api/config')).body.version, 'test-version');
  assert.equal((await app.request('/api/showcase/covers')).status, 200);
  assert.equal((await app.request('/api/showcase/covers?scope=owned')).status, 401);
  assert.equal((await app.request('/api/games')).status, 401);
  assert.equal(app.calls.length, 0);
});

test('authenticated dispatch retains account scope, pagination, progress, and security headers', async () => {
  const app = fixture();
  const listed = await app.request('/api/games?page=3&platform=Steam');
  assert.equal(listed.body.account, 17); assert.equal(listed.body.page, '3'); assert.equal(listed.body.platform, 'Steam');
  assert.equal(listed.headers['X-Content-Type-Options'], 'nosniff');
  assert.match(listed.headers['Content-Security-Policy'], /script-src 'self'/);
  assert.equal((await app.request('/api/auth/me')).body.user.username, 'collector');
  assert.equal((await app.request('/api/events')).body.subscribed, 17);
  const created = await app.request('/api/games', 'POST', { title: 'Portal 2', platform: 'Steam' });
  assert.equal(created.status, 201); assert.equal(created.body.title, 'Portal 2');
  assert.deepEqual(app.calls.at(-1), ['progress', 17, 2]);
  assert.equal((await app.request('/api/games/99')).status, 404);
  assert.equal((await app.request('/api/unknown')).status, 404);
});

test('autocomplete failure remains silent and retains local suggestions', async () => {
  const app = fixture(); const result = await app.request('/api/titles/autocomplete?q=Portal');
  assert.equal(result.status, 200); assert.deepEqual(result.body.suggestions, []);
  assert.deepEqual(result.body.existing, [{ title: 'Local game' }]);
});
