#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
async function run() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gamekat-server-'));
  for (const name of ['server', 'admin', 'public', 'server.js', 'VERSION', 'package.json']) {
    fs.cpSync(path.join(root, name), path.join(fixture, name), {
      recursive: true,
      filter: filename => ![path.join(root, 'public/covers'), path.join(root, 'public/avatars')].includes(filename),
    });
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
  const child = spawn(process.execPath, ['-e', "const server = require('./server/boot/start').startServer(); server.on('listening', () => process.send(server.address().port));"], {
    cwd: fixture, env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DB_PATH: path.join(fixture, 'test.db') },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const exit = new Promise(resolve => child.once('close', resolve));
  let timer;
  try {
    const port = await Promise.race([
      new Promise((resolve, reject) => { child.once('message', resolve); child.once('error', reject); child.once('exit', () => reject(new Error(output))); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Isolated server startup timed out.\n' + output)), 15_000); }),
    ]);
    clearTimeout(timer);
    const origin = `http://127.0.0.1:${port}`;
    let cookie = '';
    async function request(target, method = 'GET', body) {
      const result = await fetch(origin + target, {
        method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const session = result.headers.get('set-cookie'); if (session) cookie = session.split(';')[0];
      return result;
    }
    assert.equal((await request('/api/auth/me')).status, 401);
    assert.equal((await request('/api/config')).status, 200);
    const registered = await request('/api/register', 'POST', { username: 'TestCollector', password: 'test-password-123', passwordConfirm: 'test-password-123' });
    assert.equal(registered.status, 201, await registered.text());
    assert.ok(cookie.startsWith('games_session='));
    assert.equal((await request('/api/auth/me')).status, 200);
    const game = await (await request('/api/games', 'POST', { title: 'Portal 2', platform: 'Steam', ownership: 'owned', mediaFormats: ['digital'] })).json();
    assert.ok(game.id, JSON.stringify(game));
    const updated = await request(`/api/games/${game.id}`, 'PUT', { ...game, favorite: true, rating: 4.5 });
    assert.equal(updated.status, 200, await updated.text());
    const games = await (await request('/api/games')).json(); assert.equal(games.games[0].rating, 4.5);
    assert.equal((await request('/api/stats')).status, 200);
    assert.equal((await request('/api/meta')).status, 200);
    assert.equal((await request('/api/progression')).status, 200);
    assert.equal((await request('/api/preferences', 'PUT', { sort: 'title_desc' })).status, 200);
    for (const target of [
      '/katalog', '/signal', '/forum', '/api/site-stats', '/api/activity', '/api/ping', '/api/showcase/covers', '/admin',
      '/api/covers/status', '/api/cover-providers/thegamesdb/status', '/api/cover-providers/igdb/status',
      '/api/pegi/status', '/api/hltb/status', '/api/descriptions/status', '/api/steam/status', '/api/gog/status',
    ]) {
      const result = await request(target); assert.equal(result.status, 200, `${target}: ${await result.text()}`);
    }
    for (const target of ['/app.js', '/js/boot/init.js', '/js/library/platforms.js', '/js/covers/decorations.js', '/js/stats/stats-ui.js', '/js/community/activity-feed.js', '/admin/js/boot.js']) {
      const result = await request(target); assert.equal(result.status, 200, target);
      assert.match(result.headers.get('content-type'), /javascript/);
    }
    assert.equal((await request(`/api/games/${game.id}`, 'DELETE')).status, 200);
    assert.equal((await request('/api/logout', 'POST')).status, 200);
    assert.equal((await request('/api/auth/me')).status, 401);
    assert.equal((await request('/signal')).status, 200);
    console.log('Isolated server flows passed: bootstrap, auth, game CRUD, preferences, public views, admin, and static modules.');
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 6000);
    await exit; clearTimeout(force);
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
