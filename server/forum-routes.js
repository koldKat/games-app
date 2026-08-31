'use strict';

const forum = require('./forum-data');
const { renderIndex, renderCategory, renderThread } = require('./forum-pages');
const { readJson, securityHeaders } = require('./catalogue-routes');

function send(response, status, type, body) {
  securityHeaders(response); response.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-cache' }); response.end(body);
}
function sendJson(response, status, body) { send(response, status, 'application/json; charset=utf-8', JSON.stringify(body)); }
function pageContext(auth, request, progression, catalogue) {
  const user = auth.authenticate(request); const progress = user ? progression?.info(user.id) || null : null;
  const coverUrls = catalogue.listPublic({ limit: 5 }).entries.map(entry => entry.coverUrl);
  return { user, progress, coverUrls };
}
function createForumRoutes({ auth, progression, catalogue, events, onProgression = () => {} }) {
  function changed() { events.publishPublicForum(); }
  async function handle(request, response, url) {
    const categoryMatch = url.pathname.match(/^\/forum\/c\/([a-z0-9-]+)$/);
    const threadMatch = url.pathname.match(/^\/forum\/thread\/(\d+)$/);
    if (request.method === 'GET' && url.pathname === '/forum') {
      const context = pageContext(auth, request, progression, catalogue); send(response, 200, 'text/html; charset=utf-8', renderIndex({ ...context, categories: forum.categories(), recent: forum.recentThreads() })); return true;
    }
    if (request.method === 'GET' && categoryMatch) {
      const context = pageContext(auth, request, progression, catalogue); const item = forum.category(categoryMatch[1]); send(response, item ? 200 : 404, 'text/html; charset=utf-8', renderCategory({ ...context, category: item, categories: forum.categories(), threads: item ? forum.threads(item.id) : [] })); return true;
    }
    if (request.method === 'GET' && threadMatch) {
      const context = pageContext(auth, request, progression, catalogue); const data = forum.thread(threadMatch[1]); send(response, data ? 200 : 404, 'text/html; charset=utf-8', renderThread({ ...context, data })); return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/forum/stream') { events.subscribePublicForum(request, response); return true; }
    if (request.method === 'GET' && url.pathname === '/api/forum/categories') { sendJson(response, 200, { categories: forum.categories() }); return true; }
    const apiThread = url.pathname.match(/^\/api\/forum\/threads\/(\d+)$/);
    const apiPost = url.pathname.match(/^\/api\/forum\/posts\/(\d+)$/);
    if (request.method === 'GET' && apiThread) { const data = forum.thread(apiThread[1]); sendJson(response, data ? 200 : 404, data || { error: 'Thread not found.' }); return true; }
    const user = auth.authenticate(request);
    if (!user) {
      if (url.pathname.startsWith('/api/forum/')) { sendJson(response, 401, { error: 'Sign in to contribute to the forum.' }); return true; }
      return false;
    }
    const refreshed = auth.refreshSessionCookie(request); if (refreshed) response.setHeader('Set-Cookie', refreshed);
    try {
      if (request.method === 'POST' && url.pathname === '/api/forum/threads') {
        const data = forum.createThread(user.id, await readJson(request)); const result = progression?.recordForumThread?.(user.id, data.thread.id) || null; if (result) onProgression(user.id, result); changed(); sendJson(response, 201, data); return true;
      }
      const reply = url.pathname.match(/^\/api\/forum\/threads\/(\d+)\/posts$/);
      if (request.method === 'POST' && reply) {
        const data = forum.createPost(user.id, reply[1], (await readJson(request)).body); if (!data) { sendJson(response, 404, { error: 'Thread not found.' }); return true; }
        const result = progression?.recordForumReply?.(user.id, reply[1], data.posts.at(-1)?.id) || null; if (result) onProgression(user.id, result); changed(); sendJson(response, 201, data); return true;
      }
      if (request.method === 'PUT' && apiThread) { const data = forum.editThread(user.id, apiThread[1], await readJson(request)); if (!data) { sendJson(response, 403, { error: 'Only the thread author can edit it.' }); return true; } changed(); sendJson(response, 200, data); return true; }
      if (request.method === 'DELETE' && apiThread) { const deleted = forum.deleteThread(user.id, apiThread[1]); if (!deleted) { sendJson(response, 403, { error: 'Only the thread author can delete it.' }); return true; } changed(); sendJson(response, 200, { ok: true }); return true; }
      if (request.method === 'PUT' && apiPost) { const data = forum.editPost(user.id, apiPost[1], (await readJson(request)).body); if (!data) { sendJson(response, 403, { error: 'Only the reply author can edit it.' }); return true; } changed(); sendJson(response, 200, data); return true; }
      if (request.method === 'DELETE' && apiPost) { const data = forum.deletePost(user.id, apiPost[1]); if (!data) { sendJson(response, 403, { error: 'Only the reply author can delete it.' }); return true; } changed(); sendJson(response, 200, data); return true; }
    } catch (error) { sendJson(response, error.status || 400, { error: error.message }); return true; }
    return false;
  }
  return { handle };
}
module.exports = { createForumRoutes };
