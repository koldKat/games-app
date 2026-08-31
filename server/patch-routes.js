'use strict';

const patch = require('./patch-data');
const { readJson, securityHeaders } = require('./catalogue-routes');
const mailer = require('./mailer');

const MAX_BODY = 4_000;
const MAX_NAME = 64;
const MAX_EMAIL = 254;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function send(response, status, value) {
  const body = JSON.stringify(value); securityHeaders(response);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' }); response.end(body);
}
function text(value, max = MAX_BODY) { return String(value || '').trim().slice(0, max); }
function validate(input, authenticatedUser = null) {
  const body = text(input.body); if (!body) throw new Error('Write a message before sending your Patch.');
  const kind = patch.PATCH_KINDS.includes(input.kind) ? input.kind : 'other';
  const username = authenticatedUser?.username || text(input.username, MAX_NAME);
  const email = authenticatedUser?.email || text(input.email, MAX_EMAIL);
  if (!authenticatedUser && !username) throw new Error('A name is required for an anonymous Patch.');
  if (email && !EMAIL.test(email)) throw new Error('Enter a valid email address or leave it blank.');
  return { body, kind, username, email };
}
function createPatchRoutes({ auth, events }) {
  const operatorId = () => auth.operatorUserId?.() || null;
  const operatorUnread = () => patch.adminUnread();
  function notifyOperator() { const id = operatorId(); if (id) events.publish(id, 'ping-updated', { unread: operatorUnread() }); }
  function notifyOwner(item) { if (item?.userId) events.publish(item.userId, 'ping-updated', { unread: patch.unreadForUser(item.userId) }); }
  async function handle(request, response, url) {
    const user = auth.authenticate(request);
    if (request.method === 'POST' && url.pathname === '/api/patch') {
      try {
        const input = validate(await readJson(request), user);
        const item = patch.create({ userId: user?.id || null, ...input });
        if (!user || !auth.isProtectedUsername(user.username)) notifyOperator();
        send(response, 201, { thread: item }); return true;
      } catch (error) { send(response, 400, { error: error.message }); return true; }
    }
    if (!url.pathname.startsWith('/api/ping')) return false;
    if (!user) { send(response, 401, { error: 'Sign in to access Ping.' }); return true; }
    const isOperator = auth.isProtectedUsername(user.username);
    const refresh = auth.refreshSessionCookie(request); if (refresh) response.setHeader('Set-Cookie', refresh);
    const match = url.pathname.match(/^\/api\/ping\/(\d+)(?:\/(read|reply))?$/);
    if (request.method === 'GET' && url.pathname === '/api/ping') { send(response, 200, { threads: isOperator ? patch.forOperator() : patch.forUser(user.id), unread: isOperator ? operatorUnread() : patch.unreadForUser(user.id) }); return true; }
    if (!match) return false;
    const id = Number(match[1]); const item = patch.thread(id);
    if (!item || (!isOperator && item.userId !== user.id)) { send(response, 404, { error: 'Ping thread not found.' }); return true; }
    try {
      if (request.method === 'POST' && match[2] === 'read') { if (isOperator) patch.markAdminRead(id); else patch.markUserRead(id, user.id); send(response, 200, { unread: isOperator ? operatorUnread() : patch.unreadForUser(user.id) }); return true; }
      if (request.method === 'POST' && match[2] === 'reply') {
        const body = text((await readJson(request)).body); if (!body) throw new Error('Write a reply before sending.');
        patch.addMessage(id, isOperator ? 'admin' : 'user', body);
        if (isOperator) { notifyOwner(item); if (item.email) mailer.send({ to: item.email, subject: 'Reply to your Patch // Game Kat·a·log', text: `A reply was posted to your Patch:\n\n${body}\n\nSign in to Game Kat·a·log to continue the conversation in Ping.` }).catch(() => {}); }
        else notifyOperator();
        send(response, 201, { thread: patch.thread(id) }); return true;
      }
      if (request.method === 'DELETE' && !match[2]) { if (isOperator) patch.removeForAdmin(id); else patch.removeForUser(id, user.id); send(response, 200, { ok: true, unread: isOperator ? operatorUnread() : patch.unreadForUser(user.id) }); return true; }
    } catch (error) { send(response, 400, { error: error.message }); return true; }
    return false;
  }
  return { handle };
}
module.exports = { createPatchRoutes, validate, MAX_BODY };
