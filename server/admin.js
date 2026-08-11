const fs = require('node:fs');
const path = require('node:path');
const { db } = require('./db');
const { readVersion, writeVersion } = require('./version');
const backup = require('./backup');

const ROOT = path.join(__dirname, '..');
const ADMIN_DIR = path.join(ROOT, 'admin');
const startedAt = Date.now();
const adminFiles = new Map([
  ['/admin', ['index.html', 'text/html; charset=utf-8']],
  ['/admin/', ['index.html', 'text/html; charset=utf-8']],
  ['/admin/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/admin/js/core.js', ['js/core.js', 'application/javascript; charset=utf-8']],
  ['/admin/js/dashboard.js', ['js/dashboard.js', 'application/javascript; charset=utf-8']],
  ['/admin/js/accounts.js', ['js/accounts.js', 'application/javascript; charset=utf-8']],
  ['/admin/js/catalogue.js', ['js/catalogue.js', 'application/javascript; charset=utf-8']],
  ['/admin/js/tools.js', ['js/tools.js', 'application/javascript; charset=utf-8']],
  ['/admin/js/boot.js', ['js/boot.js', 'application/javascript; charset=utf-8']],
]);

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function isLocalRequest(request) {
  if (!isLoopback(request.socket?.remoteAddress)) return false;
  const forwarded = String(request.headers?.['x-real-ip'] || request.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return !forwarded || isLoopback(forwarded);
}

function securityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  securityHeaders(response);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 64 * 1024) request.destroy(new Error('Request body is too large.'));
    });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON body.')); }
    });
    request.on('error', reject);
  });
}

function serveFile(response, filename, contentType) {
  fs.readFile(path.join(ADMIN_DIR, filename), (error, content) => {
    if (error) return sendJson(response, 404, { error: 'Not found.' });
    securityHeaders(response);
    response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': content.length, 'Cache-Control': 'no-cache' });
    response.end(content);
  });
}

function adminStats() {
  const scalar = sql => db.prepare(sql).get().n;
  const pageCount = db.pragma('page_count', { simple: true });
  const pageSize = db.pragma('page_size', { simple: true });
  return {
    version: readVersion(), uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    users: scalar('SELECT COUNT(*) n FROM users'), games: scalar('SELECT COUNT(*) n FROM games'),
    covered: scalar("SELECT COUNT(*) n FROM games WHERE cover_url<>''"),
    missingCovers: scalar("SELECT COUNT(*) n FROM games WHERE cover_url=''"),
    activeSessions: scalar("SELECT COUNT(*) n FROM sessions WHERE expires_at>strftime('%s','now')"),
    favorites: scalar('SELECT COUNT(*) n FROM games WHERE favorite=1'), databaseBytes: pageCount * pageSize,
    ownership: db.prepare('SELECT ownership label, COUNT(*) count FROM games GROUP BY ownership ORDER BY count DESC').all(),
    platforms: db.prepare('SELECT platform label, COUNT(*) count FROM games GROUP BY platform ORDER BY count DESC, platform LIMIT 12').all(),
    pegi: db.prepare("SELECT COALESCE(CAST(pegi AS TEXT),'Unrated') label, COUNT(*) count FROM games GROUP BY pegi ORDER BY pegi").all(),
  };
}

function listAccounts() {
  return db.prepare(`SELECT u.id, u.username, COALESCE(u.email,'') email, u.created_at AS createdAt,
    COUNT(DISTINCT g.id) games, COALESCE(SUM(CASE WHEN g.cover_url<>'' THEN 1 ELSE 0 END),0) covered,
    (SELECT COUNT(*) FROM sessions s WHERE s.user_id=u.id AND s.expires_at>strftime('%s','now')) activeSessions
    FROM users u LEFT JOIN games g ON g.user_id=u.id GROUP BY u.id ORDER BY u.username COLLATE NOCASE`).all();
}

function deleteAccount(id) {
  const account = db.prepare(`SELECT u.id, u.username, u.avatar_path AS avatarPath, COUNT(g.id) games
    FROM users u LEFT JOIN games g ON g.user_id=u.id WHERE u.id=? GROUP BY u.id`).get(Number(id));
  if (!account) return null;
  const result = db.prepare('DELETE FROM users WHERE id=?').run(account.id);
  if (result.changes && account.avatarPath && path.basename(account.avatarPath) === account.avatarPath) {
    try { fs.unlinkSync(path.join(ROOT, 'public', 'avatars', account.avatarPath)); } catch {}
  }
  return result.changes ? account : null;
}

function listCatalogue(query = '') {
  const q = String(query).trim().slice(0, 120);
  return db.prepare(`SELECT g.id, g.title, g.platform, g.pegi, g.ownership, g.play_status AS playStatus,
    CASE WHEN g.cover_url<>'' THEN 1 ELSE 0 END hasCover, u.username
    FROM games g LEFT JOIN users u ON u.id=g.user_id
    WHERE (@q='' OR g.title LIKE @like OR g.platform LIKE @like OR u.username LIKE @like)
    ORDER BY g.title COLLATE NOCASE LIMIT 250`).all({ q, like: `%${q}%` });
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;
  if (request.method === 'GET' && pathname === '/api/admin/stats') return sendJson(response, 200, adminStats());
  if (request.method === 'GET' && pathname === '/api/admin/accounts') return sendJson(response, 200, listAccounts());
  let match = pathname.match(/^\/api\/admin\/accounts\/(\d+)\/sessions$/);
  if (request.method === 'DELETE' && match) {
    const result = db.prepare('DELETE FROM sessions WHERE user_id=?').run(Number(match[1]));
    return sendJson(response, 200, { cleared: result.changes });
  }
  match = pathname.match(/^\/api\/admin\/accounts\/(\d+)$/);
  if (request.method === 'DELETE' && match) {
    const account = deleteAccount(Number(match[1]));
    return account ? sendJson(response, 200, { deleted: account }) : sendJson(response, 404, { error: 'Account not found.' });
  }
  if (request.method === 'GET' && pathname === '/api/admin/games') return sendJson(response, 200, listCatalogue(url.searchParams.get('q')));
  match = pathname.match(/^\/api\/admin\/games\/(\d+)$/);
  if (request.method === 'DELETE' && match) {
    const result = db.prepare('DELETE FROM games WHERE id=?').run(Number(match[1]));
    return result.changes ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Game not found.' });
  }
  if (request.method === 'GET' && pathname === '/api/admin/version') return sendJson(response, 200, { version: readVersion() });
  if (request.method === 'PUT' && pathname === '/api/admin/version') {
    try { return sendJson(response, 200, { version: writeVersion((await readJson(request)).version) }); }
    catch (error) { return sendJson(response, 400, { error: error.message }); }
  }
  if (request.method === 'POST' && pathname === '/api/admin/database/checkpoint') {
    db.pragma('wal_checkpoint(TRUNCATE)'); return sendJson(response, 200, { ok: true });
  }
  if (request.method === 'POST' && pathname === '/api/admin/database/optimize') {
    db.pragma('optimize'); return sendJson(response, 200, { ok: true });
  }
  if (request.method === 'POST' && pathname === '/api/admin/database/vacuum') {
    db.exec('VACUUM'); return sendJson(response, 200, { ok: true });
  }
  if (request.method === 'GET' && pathname === '/api/admin/backups') return sendJson(response, 200, backup.listBackups());
  if (request.method === 'POST' && pathname === '/api/admin/backups') {
    const result = await backup.runBackup();
    return sendJson(response, result.created ? 201 : 200, result);
  }
  match = pathname.match(/^\/api\/admin\/backups\/([^/]+)$/);
  if (request.method === 'DELETE' && match && backup.validName(match[1])) {
    try { return backup.deleteBackup(match[1]) ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Backup not found.' }); }
    catch (error) { return sendJson(response, 500, { error: error.message }); }
  }
  return sendJson(response, 404, { error: 'Admin route not found.' });
}

async function handle(request, response, url) {
  if (!url.pathname.startsWith('/admin') && !url.pathname.startsWith('/api/admin')) return false;
  if (!isLocalRequest(request)) { sendJson(response, 403, { error: 'Localhost only.' }); return true; }
  const file = adminFiles.get(url.pathname);
  if (request.method === 'GET' && file) { serveFile(response, file[0], file[1]); return true; }
  if (url.pathname.startsWith('/api/admin/')) { await handleApi(request, response, url); return true; }
  sendJson(response, 404, { error: 'Not found.' }); return true;
}

module.exports = { handle, isLoopback, isLocalRequest, adminStats, listAccounts, listCatalogue, deleteAccount };
