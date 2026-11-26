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
    assert.equal((await request('/api/crew')).status, 401);
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
    for (const target of ['/app.js', '/js/boot/init.js', '/js/library/platforms.js', '/js/covers/decorations.js', '/js/stats/stats-ui.js', '/js/community/activity-feed.js', '/admin/js/boot.js', '/admin/js/account-editor.js']) {
      const result = await request(target); assert.equal(result.status, 200, target);
      assert.match(result.headers.get('content-type'), /javascript/);
    }
    const firstCookie=cookie;
    cookie='';
    const crewAccount=await request('/api/register','POST',{username:'CrewPartner',password:'test-password-456',passwordConfirm:'test-password-456'});
    assert.equal(crewAccount.status,201);
    const secondCookie=cookie;
    const partner=await (await request('/api/auth/me')).json();
    cookie=firstCookie;
    const role=await request(`/api/admin/accounts/${partner.user.id}/sidekick`,'PATCH',{enabled:true});
    assert.equal(role.status,200);assert.deepEqual((await role.json()).account.badges,['sidekick']);
    const detail=await request(`/api/admin/accounts/${partner.user.id}`);
    assert.equal(detail.status,200);assert.equal((await detail.json()).account.password_hash,undefined);
    const edit=await request(`/api/admin/accounts/${partner.user.id}`,'PATCH',{email:'Crew@Example.com',publicProfile:true});
    assert.equal(edit.status,200);assert.equal((await edit.json()).account.email,'crew@example.com');
    assert.equal((await request('/api/admin/accounts/999999')).status,404);
    for(const username of ['slanchoff','sashii']){
      const protectedUser=await (await request('/api/register','POST',{username,password:'test-password-789',passwordConfirm:'test-password-789'})).json();
      const accountId=protectedUser.user.id;
      assert.equal((await request(`/api/admin/accounts/${accountId}`,'DELETE')).status,403);
      assert.equal((await request(`/api/admin/accounts/${accountId}/lock`,'PATCH',{locked:true})).status,403);
      assert.equal((await request(`/api/admin/accounts/${accountId}`,'PATCH',{username:username+'2'})).status,403);
    }
    cookie=secondCookie;
    assert.deepEqual((await (await request('/api/auth/me')).json()).user.badges,['sidekick']);

    assert.equal((await request(`/api/games/${game.id}`)).status,404);
    cookie=firstCookie;
    const sent=await request('/api/crew/invites','POST',{username:'CrewPartner'});assert.equal(sent.status,200);
    const invitation=(await sent.json()).outgoing[0].id;
    cookie=secondCookie;
    const accepted=await request(`/api/crew/invites/${invitation}/accept`,'POST');
    assert.equal(accepted.status,200);
    const { crews: [joined] }=await accepted.json();
    assert.equal((await (await request('/api/progression')).json()).xp,100);
    const signal=await (await request('/api/activity')).json();
    const joinPost=signal.entries.find(item=>item.type==='crew_join');
    assert.equal(joinPost.username,'CrewPartner');
    assert.ok(joinPost.template.includes('{name}') && joinPost.template.includes('Crew'));
    for(const field of ['crewId','crewName','members','inviter']) assert.equal(joinPost[field],undefined);
    assert.equal((await request('/api/crew','POST',{name:'Other private Crew'})).status,200);
    assert.equal((await (await request('/api/crew')).json()).crews.length,2);

    assert.equal((await request(`/api/crew/${joined.id}`,'DELETE')).status,200);
    assert.equal((await request(`/api/games/${game.id}`)).status,404);
    cookie=firstCookie;
    const resent=await (await request('/api/crew/invites','POST',{username:'CrewPartner',crewId:joined.id})).json();
    const secondInvitation=resent.outgoing[0].id;
    cookie=secondCookie;
    assert.equal((await request(`/api/crew/invites/${secondInvitation}/accept`,'POST')).status,200);
    assert.equal((await (await request('/api/progression')).json()).xp,100);
    assert.equal((await (await request('/api/crew')).json()).crews.length,2);
    assert.equal((await request(`/api/crew/invites/${secondInvitation}/accept`,'POST')).status,400);
    const shared=await (await request(`/api/games/${game.id}`)).json();
    assert.equal(shared.rating,null);assert.equal(shared.canDelete,false);
    assert.equal((await request(`/api/games/${game.id}`,'DELETE')).status,403);
    assert.equal((await request(`/api/games/${game.id}`,'PUT',{...shared,title:'Crew Portal',rating:1.5,playStatus:'completed'})).status,200);
    cookie=firstCookie;
    const originalOwner=await (await request(`/api/games/${game.id}`)).json();
    assert.equal(originalOwner.title,'Crew Portal');assert.equal(originalOwner.rating,4.5);assert.equal(originalOwner.playStatus,'backlog');
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
