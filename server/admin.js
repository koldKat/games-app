const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { db } = require('./db');
const auth = require('./auth');
const { readVersion, writeVersion } = require('./version');
const backup = require('./backup');
const coverStorage = require('./cover-storage');
const mailer = require('./mailer');
const catalogue = require('./catalogue-runtime');
const activity = require('./activity');
const events = require('./events');
const forum = require('./forum-data');

const ROOT = path.join(__dirname, '..');
const ADMIN_DIR = path.join(ROOT, 'admin');
const JSON_BODY_MAX_LENGTH = 64 * 1024;
const CATALOGUE_QUERY_MAX_LENGTH = 120;
const CATALOGUE_RESULT_LIMIT = 250;
const UPTIME_DOWNTIME_GRACE_SECONDS = 5;
const startedAt = Math.floor(Date.now() / 1000);
let lastCpuAt = Date.now();
let lastCpuUsage = process.cpuUsage();
const adminFiles = new Map([
  ['/admin', ['index.html', 'text/html; charset=utf-8']],
  ['/admin/', ['index.html', 'text/html; charset=utf-8']],
  ['/admin/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/admin/announcements.css', ['announcements.css', 'text/css; charset=utf-8']],
  ['/admin/js/forum.js', ['js/forum.js', 'application/javascript; charset=utf-8']],
  ['/admin/js/core.js', ['js/core.js', 'application/javascript; charset=utf-8']],
  ['/admin/js/dashboard.js', ['js/dashboard.js', 'application/javascript; charset=utf-8']],
  ['/admin/js/accounts.js', ['js/accounts.js', 'application/javascript; charset=utf-8']],
  ['/admin/js/catalogue.js', ['js/catalogue.js', 'application/javascript; charset=utf-8']],
  ['/admin/js/public-catalogue.js', ['js/public-catalogue.js', 'application/javascript; charset=utf-8']],
  ['/admin/js/tools.js', ['js/tools.js', 'application/javascript; charset=utf-8']],
  ['/admin/js/mail.js', ['js/mail.js', 'application/javascript; charset=utf-8']],
  ['/admin/js/progression.js', ['js/progression.js', 'application/javascript; charset=utf-8']],
  ['/admin/js/announcements.js', ['js/announcements.js', 'application/javascript; charset=utf-8']],
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
      if (body.length > JSON_BODY_MAX_LENGTH) request.destroy(new Error('Request body is too large.'));
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

function setting(key) {
  return db.prepare('SELECT value FROM runtime_settings WHERE key=?').get(key)?.value || '';
}

function saveSetting(key, value) {
  db.prepare('INSERT INTO runtime_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
}

function appBirthAt() {
  const row = db.prepare(`SELECT MIN(CAST(strftime('%s', createdAt) AS INTEGER)) AS timestamp FROM (
    SELECT created_at AS createdAt FROM users
    UNION ALL SELECT created_at AS createdAt FROM games
  )`).get();
  const timestamp = Number(row?.timestamp) || 0;
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : startedAt;
}

function initialiseUptimeTracking() {
  const stoppedAt = Number(setting('server_stopped_at')) || 0;
  const lastHeartbeat = Number(setting('server_last_heartbeat')) || 0;
  const reference = stoppedAt || lastHeartbeat;
  const gap = reference > 0 ? Math.max(0, startedAt - reference) : 0;
  // The first five seconds of every restart are continuous uptime. Only the
  // excess is downtime, and a new session starts five seconds before boot so
  // the live duration displays that same allowance.
  if (gap > UPTIME_DOWNTIME_GRACE_SECONDS) {
    saveSetting('server_total_downtime_s', (Number(setting('server_total_downtime_s')) || 0) + gap - UPTIME_DOWNTIME_GRACE_SECONDS);
    saveSetting('server_session_start_at', startedAt - UPTIME_DOWNTIME_GRACE_SECONDS);
  } else if (!setting('server_session_start_at')) saveSetting('server_session_start_at', startedAt);
  saveSetting('server_stopped_at', 0);
  saveSetting('server_last_heartbeat', startedAt);
}

function updateHeartbeat() { saveSetting('server_last_heartbeat', Math.floor(Date.now() / 1000)); }

function markServerStopped() { saveSetting('server_stopped_at', Math.floor(Date.now() / 1000)); }

function uptimeStats() {
  const now = Math.floor(Date.now() / 1000);
  const appAge = Math.max(0, now - appBirthAt());
  const downtimeSeconds = Number(setting('server_total_downtime_s')) || 0;
  const sessionStarted = Number(setting('server_session_start_at')) || startedAt;
  return {
    appAgeSeconds: appAge,
    sessionUptimeSeconds: Math.max(0, now - sessionStarted),
    downtimeSeconds,
    uptimePercent: appAge ? Math.max(0, Math.min(100, Math.round((appAge - downtimeSeconds) / appAge * 10000) / 100)) : 100,
  };
}

function liveStats() {
  const now = Date.now();
  const cpuNow = process.cpuUsage();
  const elapsedUs = Math.max(1, (now - lastCpuAt) * 1000);
  const usedUs = (cpuNow.user - lastCpuUsage.user) + (cpuNow.system - lastCpuUsage.system);
  const cpuPct = Math.max(0, Math.round(usedUs / (elapsedUs * Math.max(1, os.cpus().length)) * 1000) / 10);
  lastCpuAt = now; lastCpuUsage = cpuNow;
  const memory = process.memoryUsage();
  return { heapUsed: memory.heapUsed, heapTotal: memory.heapTotal, rss: memory.rss, cpuPct, ...uptimeStats() };
}

initialiseUptimeTracking();
const heartbeat = setInterval(updateHeartbeat, 10_000);
heartbeat.unref?.();

function adminStats() {
  const scalar = sql => db.prepare(sql).get().n;
  const pageCount = db.pragma('page_count', { simple: true });
  const pageSize = db.pragma('page_size', { simple: true });
  return {
    version: readVersion(), ...uptimeStats(),
    users: scalar('SELECT COUNT(*) n FROM users'), games: scalar('SELECT COUNT(*) n FROM games'),
    covered: scalar("SELECT COUNT(*) n FROM games WHERE cover_url<>''"),
    missingCovers: scalar("SELECT COUNT(*) n FROM games WHERE cover_url=''"),
    described: scalar("SELECT COUNT(*) n FROM games WHERE trim(description)<>''"),
    missingDescriptions: scalar("SELECT COUNT(*) n FROM games WHERE trim(description)=''"),
    pegiKnown: scalar('SELECT COUNT(*) n FROM games WHERE pegi IS NOT NULL'),
    missingPegi: scalar('SELECT COUNT(*) n FROM games WHERE pegi IS NULL'),
    hltbKnown: scalar('SELECT COUNT(*) n FROM games WHERE hltb_id IS NOT NULL'),
    missingHltb: scalar('SELECT COUNT(*) n FROM games WHERE hltb_id IS NULL'),
    rated: scalar('SELECT COUNT(*) n FROM games WHERE rating IS NOT NULL'),
    averageRating: db.prepare('SELECT AVG(rating) average FROM games WHERE rating IS NOT NULL').get().average || 0,
    activeSessions: scalar("SELECT COUNT(*) n FROM sessions WHERE expires_at>strftime('%s','now')"),
    favorites: scalar('SELECT COUNT(*) n FROM games WHERE favorite=1'), databaseBytes: pageCount * pageSize,
    catalogue: catalogue.counts(),
    ownership: db.prepare('SELECT ownership label, COUNT(*) count FROM games GROUP BY ownership ORDER BY count DESC').all(),
    formats: db.prepare('SELECT media_format label, COUNT(*) count FROM games GROUP BY media_format ORDER BY count DESC, media_format').all(),
    playStatus: db.prepare('SELECT play_status label, COUNT(*) count FROM games GROUP BY play_status ORDER BY count DESC, play_status').all(),
    platforms: db.prepare('SELECT platform label, COUNT(*) count FROM games GROUP BY platform ORDER BY count DESC, platform LIMIT 12').all(),
    pegi: db.prepare("SELECT COALESCE(CAST(pegi AS TEXT),'Unrated') label, COUNT(*) count FROM games GROUP BY pegi ORDER BY pegi").all(),
  };
}

function listAccounts() {
  return db.prepare(`SELECT u.id, u.username, COALESCE(u.email,'') email, u.created_at AS createdAt,
    u.admin_locked AS adminLocked, u.locked_until AS lockedUntil,
    CASE WHEN lower(u.username)='koldkat' THEN 1 ELSE 0 END protected,
    COUNT(DISTINCT g.id) games, COALESCE(SUM(CASE WHEN g.cover_url<>'' THEN 1 ELSE 0 END),0) covered,
    (SELECT COUNT(*) FROM sessions s WHERE s.user_id=u.id AND s.expires_at>strftime('%s','now')) activeSessions
    FROM users u LEFT JOIN games g ON g.user_id=u.id GROUP BY u.id ORDER BY u.username COLLATE NOCASE`).all();
}

function deleteAccount(id) {
  const account = db.prepare(`SELECT u.id, u.username, u.avatar_path AS avatarPath, COUNT(g.id) games
    FROM users u LEFT JOIN games g ON g.user_id=u.id WHERE u.id=? GROUP BY u.id`).get(Number(id));
  if (!account) return null;
  if (auth.isProtectedUsername(account.username)) throw Object.assign(new Error('The protected koldKat account cannot be deleted.'), { status: 403, code: 'PROTECTED_ACCOUNT' });
  const coverUrls = db.prepare("SELECT cover_url AS coverUrl FROM games WHERE user_id=? AND cover_url LIKE '/covers/%'").all(account.id);
  const result = db.prepare('DELETE FROM users WHERE id=?').run(account.id);
  if (result.changes && account.avatarPath && path.basename(account.avatarPath) === account.avatarPath) {
    try { fs.unlinkSync(path.join(ROOT, 'public', 'avatars', account.avatarPath)); } catch {}
  }
  if (result.changes) for (const { coverUrl } of coverUrls) coverStorage.removeLocal(coverUrl);
  return result.changes ? account : null;
}

function listCatalogue(query = '') {
  const q = String(query).trim().slice(0, CATALOGUE_QUERY_MAX_LENGTH);
  return db.prepare(`SELECT g.id, g.title, g.platform, g.pegi, g.ownership, g.play_status AS playStatus,
    CASE WHEN g.cover_url<>'' THEN 1 ELSE 0 END hasCover, u.username
    FROM games g LEFT JOIN users u ON u.id=g.user_id
    WHERE (@q='' OR g.title LIKE @like OR g.platform LIKE @like OR u.username LIKE @like)
    ORDER BY g.title COLLATE NOCASE LIMIT ${CATALOGUE_RESULT_LIMIT}`).all({ q, like: `%${q}%` });
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;
  if (request.method === 'GET' && pathname === '/api/admin/stats') return sendJson(response, 200, adminStats());
  if (request.method === 'GET' && pathname === '/api/admin/live') return sendJson(response, 200, liveStats());
  if (request.method === 'GET' && pathname === '/api/admin/accounts') return sendJson(response, 200, listAccounts());
  if (request.method === 'GET' && pathname === '/api/admin/forum') return sendJson(response, 200, { categories: forum.categories(), recent: forum.recentThreads(30) });
  let forumMatch = pathname.match(/^\/api\/admin\/forum\/categories(?:\/(\d+))?$/);
  if (forumMatch) {
    try {
      if (request.method === 'POST' && !forumMatch[1]) { const category = forum.saveCategory(await readJson(request)); events.publishPublicForum(); return sendJson(response, 201, { category }); }
      if (request.method === 'PUT' && forumMatch[1]) { const category = forum.saveCategory(await readJson(request), forumMatch[1]); events.publishPublicForum(); return category ? sendJson(response, 200, { category }) : sendJson(response, 404, { error: 'Category not found.' }); }
      if (request.method === 'DELETE' && forumMatch[1]) { const deleted = forum.deleteCategory(forumMatch[1]); if (deleted) events.publishPublicForum(); return deleted ? sendJson(response, 200, { ok: true }) : sendJson(response, 409, { error: 'Categories with threads cannot be deleted.' }); }
    } catch (error) { return sendJson(response, 400, { error: error.message }); }
  }
  forumMatch = pathname.match(/^\/api\/admin\/forum\/threads\/(\d+)(?:\/(lock|pin))?$/);
  if (forumMatch) {
    const [, id, action] = forumMatch;
    if (request.method === 'DELETE' && !action) { const deleted = forum.adminDeleteThread(id); if (deleted) events.publishPublicForum(); return deleted ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Thread not found.' }); }
    if (request.method === 'PATCH' && action) { const state = action === 'lock' ? 'locked' : 'pinned'; const item = forum.setThreadState(id, state, Boolean((await readJson(request)).value)); if (item) events.publishPublicForum(); return item ? sendJson(response, 200, { thread: item.thread }) : sendJson(response, 404, { error: 'Thread not found.' }); }
  }
  if (request.method === 'GET' && pathname === '/api/admin/announcements') return sendJson(response, 200, activity.listAnnouncements());
  if (request.method === 'POST' && pathname === '/api/admin/announcements') {
    try { return sendJson(response, 201, { announcement: activity.createAnnouncement(await readJson(request)) }); }
    catch (error) { return sendJson(response, 400, { error: error.message }); }
  }
  let announcement = pathname.match(/^\/api\/admin\/announcements\/(\d+)(?:\/(publish|unpublish|pin|unpin))?$/);
  if (announcement) {
    const [, id, action] = announcement;
    try {
      if (request.method === 'PATCH' && !action) {
        const item = activity.updateAnnouncement(Number(id), await readJson(request));
        if (item?.draft === false) events.publishPublicActivity();
        return item ? sendJson(response, 200, { announcement: item }) : sendJson(response, 404, { error: 'Announcement not found.' });
      }
      if (request.method === 'DELETE' && !action) {
        const item = activity.listAnnouncements().find(row => row.id === Number(id));
        const deleted = activity.deleteAnnouncement(Number(id));
        if (deleted && item?.draft === false) events.publishPublicActivity();
        return deleted ? sendJson(response, 200, { ok: true }) : sendJson(response, 404, { error: 'Announcement not found.' });
      }
      if (request.method === 'POST' && action) {
        const operations = { publish: activity.publishAnnouncement, unpublish: activity.unpublishAnnouncement, pin: activity.pinAnnouncement, unpin: activity.unpinAnnouncement };
        const item = operations[action]?.(Number(id));
        if (!item) return sendJson(response, 404, { error: 'Announcement is not available for that action.' });
        events.publishPublicActivity();
        return sendJson(response, 200, { announcement: item });
      }
    } catch (error) { return sendJson(response, 400, { error: error.message }); }
  }
  if (request.method === 'GET' && pathname === '/api/admin/progression') return sendJson(response, 200, { config: require('./db').progression.config() });
  if (request.method === 'PUT' && pathname === '/api/admin/progression') {
    try { return sendJson(response, 200, { config: require('./db').progression.setConfig((await readJson(request)).amounts || {}) }); }
    catch (error) { return sendJson(response, 400, { error: error.message }); }
  }
  if (request.method === 'GET' && pathname === '/api/admin/mail') return sendJson(response, 200, mailer.publicSettings());
  if (request.method === 'PUT' && pathname === '/api/admin/mail') {
    try { return sendJson(response, 200, mailer.saveSettings(await readJson(request))); }
    catch (error) { return sendJson(response, 400, { error: error.message }); }
  }
  if (request.method === 'POST' && pathname === '/api/admin/mail/test') {
    try {
      const input = await readJson(request); const settings = mailer.publicSettings();
      await mailer.send({ to: String(input.to || settings.sender || ''), subject: 'Game Kat·a·log SMTP test', text: 'SMTP delivery is configured correctly.' });
      return sendJson(response, 200, { ok: true });
    } catch (error) { return sendJson(response, 400, { error: error.message }); }
  }
  let match = pathname.match(/^\/api\/admin\/accounts\/(\d+)\/sessions$/);
  if (request.method === 'DELETE' && match) {
    const result = db.prepare('DELETE FROM sessions WHERE user_id=?').run(Number(match[1]));
    return sendJson(response, 200, { cleared: result.changes });
  }
  match = pathname.match(/^\/api\/admin\/accounts\/(\d+)$/);
  if (request.method === 'DELETE' && match) {
    try {
      const account = deleteAccount(Number(match[1]));
      return account ? sendJson(response, 200, { deleted: account }) : sendJson(response, 404, { error: 'Account not found.' });
    } catch (error) { return sendJson(response, error.status || 400, { error: error.message }); }
  }
  match = pathname.match(/^\/api\/admin\/accounts\/(\d+)\/lock$/);
  if (request.method === 'PATCH' && match) {
    try {
      const account = auth.setAccountLocked(Number(match[1]), (await readJson(request)).locked === true);
      return account ? sendJson(response, 200, { account }) : sendJson(response, 404, { error: 'Account not found.' });
    } catch (error) { return sendJson(response, error.status || 400, { error: error.message }); }
  }
  if (request.method === 'GET' && pathname === '/api/admin/games') return sendJson(response, 200, listCatalogue(url.searchParams.get('q')));
  if (request.method === 'GET' && pathname === '/api/admin/catalogue') {
    return sendJson(response, 200, { entries: catalogue.listAdmin({ q: url.searchParams.get('q'), status: url.searchParams.get('status') }), counts: catalogue.counts() });
  }
  match = pathname.match(/^\/api\/admin\/catalogue\/(\d+)$/);
  if (request.method === 'PATCH' && match) {
    try {
      const body = await readJson(request);
      const entry = Object.hasOwn(body, 'status')
        ? catalogue.setStatus(Number(match[1]), String(body.status || ''))
        : catalogue.updateAdmin(Number(match[1]), body);
      return entry ? sendJson(response, 200, { entry }) : sendJson(response, 404, { error: 'Catalogue entry not found.' });
    } catch (error) { return sendJson(response, 400, { error: error.message }); }
  }
  if (request.method === 'PUT' && match) {
    try {
      const entry = await catalogue.replaceCover(Number(match[1]), String((await readJson(request)).url || ''));
      return entry ? sendJson(response, 200, { entry }) : sendJson(response, 404, { error: 'Catalogue entry not found.' });
    } catch (error) { return sendJson(response, 400, { error: error.message }); }
  }
  if (request.method === 'DELETE' && match) {
    const entry = catalogue.removeEntry(Number(match[1]));
    return entry ? sendJson(response, 200, { deleted: entry }) : sendJson(response, 404, { error: 'Catalogue entry not found.' });
  }
  match = pathname.match(/^\/api\/admin\/games\/(\d+)$/);
  if (request.method === 'DELETE' && match) {
    const game = db.prepare('SELECT cover_url AS coverUrl FROM games WHERE id=?').get(Number(match[1]));
    const result = db.prepare('DELETE FROM games WHERE id=?').run(Number(match[1]));
    if (result.changes) coverStorage.removeLocal(game?.coverUrl);
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

module.exports = { handle, isLoopback, isLocalRequest, adminStats, liveStats, markServerStopped, listAccounts, listCatalogue, deleteAccount };
