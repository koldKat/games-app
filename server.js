#!/usr/bin/env node
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./server/db');
const { searchPegi } = require('./server/pegi');
const covers = require('./server/covers');
const auth = require('./server/auth');

const PORT = Number(process.env.PORT || 3005);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const AVATARS_DIR = path.join(PUBLIC_DIR, 'avatars');
fs.mkdirSync(AVATARS_DIR, { recursive: true });
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webmanifest': 'application/manifest+json; charset=utf-8',
};
const coverJobs = new Map();

async function runCoverJob(userId, key) {
  const games = db.gamesMissingCovers(userId);
  const job = { state: 'running', total: games.length, processed: 0, matched: 0, unmatched: 0, errors: 0, current: '', startedAt: new Date().toISOString() };
  coverJobs.set(userId, job);
  let consecutiveErrors = 0;
  for (const game of games) {
    job.current = game.title;
    try {
      const match = await covers.bestExactCover(key, game.title);
      if (match) { db.updateGameCover(userId, game.id, { url: match.url, source: 'steamgriddb', matchTitle: match.gameTitle }); job.matched++;
      } else job.unmatched++;
      consecutiveErrors = 0;
    } catch (error) {
      job.errors++; job.lastError = error.message; consecutiveErrors++;
      if (consecutiveErrors >= 5) { job.processed++; job.state = 'failed'; job.current = ''; job.finishedAt = new Date().toISOString(); return; }
    }
    job.processed++;
    await covers.wait(150);
  }
  job.state = 'complete'; job.current = ''; job.finishedAt = new Date().toISOString();
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  response.end(body);
}

function readRaw(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let rejected = false;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) { rejected = true; reject(Object.assign(new Error('Avatar is too large (maximum 256 KB).'), { status: 413 })); request.resume(); return; }
      chunks.push(chunk);
    });
    request.on('end', () => { if (!rejected) resolve(Buffer.concat(chunks)); });
    request.on('error', reject);
  });
}

function removeAvatarFile(filename) {
  if (!filename || path.basename(filename) !== filename) return;
  fs.unlink(path.join(AVATARS_DIR, filename), () => {});
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) request.destroy(new Error('Request body is too large.'));
    });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON body.')); }
    });
    request.on('error', reject);
  });
}

function serveStatic(requestPath, response) {
  const relative = requestPath === '/' ? 'index.html' : `${requestPath.replace(/^\/+/, '')}${requestPath.endsWith('/') ? 'index.html' : ''}`;
  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== PUBLIC_DIR) return sendJson(response, 403, { error: 'Forbidden.' });
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') return sendJson(response, 404, { error: 'Not found.' });
      return sendJson(response, 500, { error: 'Could not read file.' });
    }
    response.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(content);
  });
}

async function handleApi(request, response, url) {
  if (request.method === 'POST' && url.pathname === '/api/register') {
    const ip = auth.clientIp(request);
    if (auth.isRateLimited(ip)) return sendJson(response, 429, { error: 'Too many attempts. Try again later.' });
    try {
      const input = await readJson(request);
      if (input.password !== input.passwordConfirm) return sendJson(response, 400, { error: 'Passwords do not match.' });
      const user = await auth.register(input.username, input.password, input.email);
      const token = auth.createSession(user.id);
      auth.clearFailures(ip);
      return sendJson(response, 201, { token, user: { id: user.id, username: user.username, email: user.email || '', avatarUrl: user.avatarUrl } });
    } catch (error) { auth.recordFailure(ip); return sendJson(response, 400, { error: error.message }); }
  }
  if (request.method === 'POST' && url.pathname === '/api/login') {
    const ip = auth.clientIp(request);
    if (auth.isRateLimited(ip)) return sendJson(response, 429, { error: 'Too many attempts. Try again later.' });
    const input = await readJson(request);
    const user = await auth.login(input.username, input.password);
    if (!user) { auth.recordFailure(ip); return sendJson(response, 401, { error: 'Invalid username or password.' }); }
    auth.clearFailures(ip);
    return sendJson(response, 200, { token: auth.createSession(user.id), user });
  }
  if (request.method === 'POST' && url.pathname === '/api/logout') {
    auth.logout(request);
    return sendJson(response, 200, { ok: true });
  }
  const user = auth.authenticate(request);
  if (!user) return sendJson(response, 401, { error: 'Unauthorized.' });
  if (request.method === 'GET' && url.pathname === '/api/auth/me') return sendJson(response, 200, { user });
  if (request.method === 'PUT' && url.pathname === '/api/account') {
    try { return sendJson(response, 200, { user: await auth.updateAccount(user.id, await readJson(request)) }); }
    catch (error) { return sendJson(response, 400, { error: error.message }); }
  }
  if (request.method === 'POST' && url.pathname === '/api/account/avatar') {
    try {
      const image = await readRaw(request, 256 * 1024);
      if (image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) return sendJson(response, 415, { error: 'Avatar must be a JPEG image.' });
      const filename = `${user.id}_${Date.now()}_${require('node:crypto').randomBytes(4).toString('hex')}.jpg`;
      const old = auth.avatarPath(user.id);
      fs.writeFileSync(path.join(AVATARS_DIR, filename), image, { flag: 'wx' });
      const avatarUrl = auth.updateAvatar(user.id, filename);
      removeAvatarFile(old);
      return sendJson(response, 200, { avatarUrl });
    } catch (error) { return sendJson(response, error.status || 400, { error: error.message }); }
  }
  if (request.method === 'DELETE' && url.pathname === '/api/account/avatar') {
    const old = auth.avatarPath(user.id);
    auth.updateAvatar(user.id, null);
    removeAvatarFile(old);
    return sendJson(response, 200, { avatarUrl: null });
  }
  if (request.method === 'GET' && url.pathname === '/api/covers/status') {
    return sendJson(response, 200, { configured: Boolean(db.coverApiKey(user.id) || process.env.STEAMGRIDDB_API_KEY), missing: db.gamesMissingCovers(user.id).length, job: coverJobs.get(user.id) || null });
  }
  if (request.method === 'PUT' && url.pathname === '/api/covers/config') {
    try {
      const input = await readJson(request); const key = String(input.apiKey || '').trim();
      await covers.verifyKey(key); db.setCoverApiKey(user.id, key);
      return sendJson(response, 200, { configured: true });
    } catch (error) { return sendJson(response, 400, { error: error.message }); }
  }
  if (request.method === 'DELETE' && url.pathname === '/api/covers/config') {
    db.setCoverApiKey(user.id, ''); return sendJson(response, 200, { configured: Boolean(process.env.STEAMGRIDDB_API_KEY) });
  }
  if (request.method === 'GET' && url.pathname === '/api/covers/search') {
    const key = db.coverApiKey(user.id) || process.env.STEAMGRIDDB_API_KEY;
    if (!key) return sendJson(response, 409, { error: 'Configure a SteamGridDB API key in Account Settings first.' });
    try { return sendJson(response, 200, await covers.searchCovers(key, url.searchParams.get('q'))); }
    catch (error) { return sendJson(response, 502, { error: error.message }); }
  }
  if (request.method === 'POST' && url.pathname === '/api/covers/bulk') {
    const key = db.coverApiKey(user.id) || process.env.STEAMGRIDDB_API_KEY;
    if (!key) return sendJson(response, 409, { error: 'Configure a SteamGridDB API key in Account Settings first.' });
    const active = coverJobs.get(user.id);
    if (active?.state === 'running') return sendJson(response, 409, { error: 'A cover scan is already running.', job: active });
    runCoverJob(user.id, key).catch(error => coverJobs.set(user.id, { state: 'failed', error: error.message }));
    return sendJson(response, 202, { started: true, missing: db.gamesMissingCovers(user.id).length });
  }
  if (request.method === 'GET' && url.pathname === '/api/games') {
    return sendJson(response, 200, db.listGames(user.id, Object.fromEntries(url.searchParams)));
  }
  if (request.method === 'GET' && url.pathname === '/api/stats') return sendJson(response, 200, db.stats(user.id));
  if (request.method === 'GET' && url.pathname === '/api/meta') {
    return sendJson(response, 200, { platforms: db.stats(user.id).platforms.map(row => row.label), version: '1.1.0', pegiLookup: true, user });
  }
  if (request.method === 'GET' && url.pathname === '/api/pegi/search') {
    try { return sendJson(response, 200, await searchPegi(url.searchParams.get('q'))); }
    catch (error) { return sendJson(response, 502, { error: error.message, fallbackUrl: `https://pegi.info/search-pegi?q=${encodeURIComponent(url.searchParams.get('q') || '')}` }); }
  }
  if (request.method === 'POST' && url.pathname === '/api/games') {
    try { return sendJson(response, 201, db.createGame(user.id, await readJson(request))); }
    catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }
  const match = url.pathname.match(/^\/api\/games\/(\d+)$/);
  if (match && request.method === 'GET') {
    const game = db.getGame(user.id, Number(match[1]));
    return game ? sendJson(response, 200, game) : sendJson(response, 404, { error: 'Game not found.' });
  }
  if (match && request.method === 'PUT') {
    try {
      const game = db.updateGame(user.id, Number(match[1]), await readJson(request));
      return game ? sendJson(response, 200, game) : sendJson(response, 404, { error: 'Game not found.' });
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }
  if (match && request.method === 'DELETE') {
    return db.deleteGame(user.id, Number(match[1])) ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Game not found.' });
  }
  sendJson(response, 404, { error: 'API route not found.' });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(request, response, url).catch(error => sendJson(response, 500, { error: error.message || 'Unexpected server error.' }));
  } else {
    serveStatic(decodeURIComponent(url.pathname), response);
  }
});

auth.purgeExpiredSessions();
server.listen(PORT, HOST, () => console.log(`Games Shelf is running at http://localhost:${PORT}`));

function shutdown() {
  server.close(() => { db.db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 2500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
