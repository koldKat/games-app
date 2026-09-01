const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { frame, keepAlive, publish, subscribe } = require('../server/events');
const clientSource = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'js', 'events.js'), 'utf8');

test('SSE frames carry named JSON events', () => {
  assert.equal(frame('game-updated', { game: { id: 7 } }), 'event: game-updated\ndata: {"game":{"id":7}}\n\n');
  assert.equal(frame('game-updated', { game: { id: 7 } }, 12), 'id: 12\nevent: game-updated\ndata: {"game":{"id":7}}\n\n');
});

function connection(headers = {}) {
  const request = new EventEmitter(); request.headers = headers;
  const response = new EventEmitter(); response.chunks = []; response.destroyed = false; response.writableEnded = false;
  response.writeHead = (status, sentHeaders) => { response.status = status; response.headers = sentHeaders; };
  response.write = chunk => { response.chunks.push(chunk); return true; };
  response.end = () => { response.writableEnded = true; response.emit('close'); };
  return { request, response };
}

test('SSE reconnects replay only the missed events for that account', () => {
  const userId = 91001; const otherUserId = 91002;
  publish(userId, 'game-updated', { game: { id: 1 } });
  const first = connection(); subscribe(first.request, first.response, userId);
  assert.doesNotMatch(first.response.chunks.join(''), /"id":1/);
  assert.match(first.response.chunks.join(''), /id: 1\nevent: stream-ready/);

  publish(userId, 'game-updated', { game: { id: 2 } });
  publish(otherUserId, 'game-updated', { game: { id: 99 } });
  assert.match(first.response.chunks.join(''), /id: 2\nevent: game-updated/);
  assert.doesNotMatch(first.response.chunks.join(''), /"id":99/);
  first.request.emit('close');

  publish(userId, 'game-updated', { game: { id: 3 } });
  const resumed = connection({ 'last-event-id': '2' }); subscribe(resumed.request, resumed.response, userId);
  assert.match(resumed.response.chunks.join(''), /id: 3\nevent: game-updated\ndata: {"game":{"id":3}}/);
  resumed.request.emit('close');
});

test('SSE heartbeats close streams whose bearer session was revoked', () => {
  const active = connection().response;
  assert.equal(keepAlive(active, () => true), true);
  assert.equal(active.writableEnded, false);
  assert.match(active.chunks.join(''), /: heartbeat/);

  const revoked = connection().response;
  assert.equal(keepAlive(revoked, () => false), false);
  assert.equal(revoked.writableEnded, true);
});

test('browser SSE reconnects back off and page owners can stop them', () => {
  assert.match(clientSource, /RECONNECT_MAX_MS = 30_000/);
  assert.match(clientSource, /Math\.min\(RECONNECT_MAX_MS, reconnectMs \* 2\)/);
  assert.match(clientSource, /return \(\) => \{ stopped = true; controller\?\.abort\(\); \}/);
});
