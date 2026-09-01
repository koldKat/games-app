const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const os = require('node:os');

const dbPath = path.join(os.tmpdir(), `games-app-patch-routes-${process.pid}.sqlite`);
for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
process.env.DB_PATH = dbPath;
const { db } = require('../server/db');
const { createPatchRoutes } = require('../server/patch-routes');
const patch = require('../server/patch-data');
const liveEvents = require('../server/events');

test.after(() => {
  db.close();
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

function request(user, body = null) {
  const stream = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  stream.user = user; stream.headers = {}; return stream;
}
function response() {
  return { headers: {}, status: 0, body: null, setHeader(key, value) { this.headers[key] = value; }, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); }, end(body) { this.body = JSON.parse(body); } };
}
async function call(routes, user, method, pathname, body) {
  const req = request(user, body); req.method = method; const res = response();
  await routes.handle(req, res, new URL(pathname, 'http://test.local'));
  return res;
}
function sseConnection() {
  const req = new EventEmitter(); req.headers = {};
  const res = new EventEmitter(); res.destroyed = false; res.writableEnded = false; res.chunks = [];
  res.writeHead = () => {}; res.write = value => { res.chunks.push(value); return true; }; res.end = () => { res.writableEnded = true; };
  return { req, res };
}

test('Ping keeps distinct owner and operator unread states through live Patch replies', async () => {
  db.prepare("INSERT INTO users (username, password_hash, salt) VALUES ('koldKat', 'x', 'x')").run();
  db.prepare("INSERT INTO users (username, password_hash, salt) VALUES ('member', 'x', 'x')").run();
  const operator = { id: 1, username: 'koldKat', email: '' }; const member = { id: 2, username: 'member', email: '' };
  const published = []; const routes = createPatchRoutes({
    auth: { authenticate: req => req.user, refreshSessionCookie: () => '', isProtectedUsername: username => String(username).toLowerCase() === 'koldkat', operatorUserId: () => 1 },
    events: { publish: (id, event, data) => published.push({ id, event, data }) },
  });
  const created = await call(routes, member, 'POST', '/api/patch', { kind: 'bug', body: 'The test is broken.' });
  assert.equal(created.status, 201); assert.equal(published.at(-1).id, operator.id); assert.equal(published.at(-1).data.unread, 1);
  const listed = await call(routes, operator, 'GET', '/api/ping'); assert.equal(listed.body.unread, 1); assert.equal(listed.body.threads[0].userUnread, 1);
  const id = listed.body.threads[0].id;
  const read = await call(routes, operator, 'POST', `/api/ping/${id}/read`); assert.equal(read.body.unread, 0);
  const userReply = await call(routes, member, 'POST', `/api/ping/${id}/reply`, { body: 'More detail.' }); assert.equal(userReply.status, 201); assert.equal(published.at(-1).id, operator.id); assert.equal(published.at(-1).data.unread, 1);
  const relisted = await call(routes, operator, 'GET', '/api/ping'); assert.equal(relisted.body.unread, 1); assert.equal(relisted.body.threads[0].userUnread, 1);
  const operatorReply = await call(routes, operator, 'POST', `/api/ping/${id}/reply`, { body: 'Fixed.' }); assert.equal(operatorReply.status, 201); assert.equal(published.at(-1).id, member.id); assert.equal(published.at(-1).data.unread, 1);
  assert.equal(patch.removeForAdmin(id), true);
  assert.equal(patch.forOperator().length, 0);
  assert.equal(patch.forUser(member.id).length, 1, 'admin removal must not remove a member Ping thread');
});

test('a Ping reply is delivered through the authenticated SSE channel', async () => {
  const userId = 71003; const pair = sseConnection(); liveEvents.subscribe(pair.req, pair.res, userId);
  liveEvents.publish(userId, 'ping-updated', { unread: 2 });
  assert.match(pair.res.chunks.join(''), /event: ping-updated\ndata: {"unread":2}/);
  pair.req.emit('close');
});
