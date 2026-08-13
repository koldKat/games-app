const clients = new Map();
const channels = new Map();
const HISTORY_LIMIT = 2048;
const RETRY_MS = 2_500;
const HEARTBEAT_MS = 20_000;
const CONNECTION_LIFETIME_MS = 10 * 60 * 1000;

function frame(event, data, id = null) {
  return `${id == null ? '' : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function channel(userId) {
  if (!channels.has(userId)) channels.set(userId, { nextId: 1, history: [] });
  return channels.get(userId);
}

function publish(userId, event, data) {
  const stream = channel(userId); const id = stream.nextId++; const packet = frame(event, data, id);
  stream.history.push({ id, packet });
  if (stream.history.length > HISTORY_LIMIT) stream.history.splice(0, stream.history.length - HISTORY_LIMIT);
  for (const response of clients.get(userId) || []) {
    if (!response.destroyed && !response.writableEnded) response.write(packet);
  }
}

function keepAlive(response, isAuthorized = () => true) {
  if (response.writableEnded || response.destroyed) return false;
  let authorized = false;
  try { authorized = Boolean(isAuthorized()); } catch {}
  if (!authorized) { response.end(); return false; }
  response.write(': heartbeat\n\n'); return true;
}

function subscribe(request, response, userId, isAuthorized = () => true) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.write(`retry: ${RETRY_MS}\n\n`);
  const stream = channel(userId);
  const requestedId = Number.parseInt(request.headers['last-event-id'], 10);
  if (Number.isInteger(requestedId) && requestedId >= 0) {
    const oldestId = stream.history[0]?.id ?? stream.nextId;
    if (requestedId < oldestId - 1 || requestedId >= stream.nextId) {
      response.write(frame('stream-reset', { reason: 'replay-window-missed' }, stream.nextId - 1));
    } else {
      for (const item of stream.history) if (item.id > requestedId) response.write(item.packet);
    }
  }
  response.write(frame('stream-ready', {}, stream.nextId - 1));
  const userClients = clients.get(userId) || new Set(); userClients.add(response); clients.set(userId, userClients);
  const heartbeat = setInterval(() => keepAlive(response, isAuthorized), HEARTBEAT_MS);
  heartbeat.unref?.();
  const lifetime = setTimeout(() => response.end(), CONNECTION_LIFETIME_MS);
  lifetime.unref?.();
  const close = () => {
    clearInterval(heartbeat); clearTimeout(lifetime); userClients.delete(response);
    if (!userClients.size) clients.delete(userId);
  };
  request.once('close', close); response.once('close', close);
}

module.exports = { HISTORY_LIMIT, frame, keepAlive, publish, subscribe };
