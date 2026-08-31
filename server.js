#!/usr/bin/env node
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./server/db');
const { searchPegi } = require('./server/pegi');
const { createPegiBulkManager } = require('./server/pegi-bulk');
const hltb = require('./server/hltb');
const { createHltbBulkManager } = require('./server/hltb-bulk');
const covers = require('./server/covers');
const thegamesdb = require('./server/thegamesdb');
const steamStore = require('./server/steam-store');
const { createDescriptionBulkManager } = require('./server/description-bulk');
const { createCoverProviderBulkManager } = require('./server/cover-provider-bulk');
const coverStorage = require('./server/cover-storage');
const imagePolicy = require('./server/image-policy');
const showcaseCovers = require('./server/showcase-covers');
const events = require('./server/events');
const activity = require('./server/activity');
const auth = require('./server/auth');
const preferences = require('./server/preferences');
const admin = require('./server/admin');
const catalogue = require('./server/catalogue-runtime');
const { createCatalogueRoutes } = require('./server/catalogue-routes');
const { createForumRoutes } = require('./server/forum-routes');
const { createPatchRoutes } = require('./server/patch-routes');
const { readVersion } = require('./server/version');
const backup = require('./server/backup');
const mailer = require('./server/mailer');
const { createProgressionService } = require('./server/progression-service');
const { BULK_JOB, TITLE_AUTOCOMPLETE_MIN_LENGTH } = require('./server/constants');

const PORT = Number(process.env.PORT || 3005);
const HOST = process.env.HOST || '0.0.0.0';
const JSON_BODY_MAX_LENGTH = 1_000_000;
const AVATAR_MAX_BYTES = 256 * 1024;
const SHOWCASE_COVER_COUNT = 38;
const SHUTDOWN_GRACE_MS = 2_500;
const PUBLIC_DIR = path.join(__dirname, 'public');
const PUBLIC_URL = String(process.env.PUBLIC_URL || 'https://gamekat.net').replace(/\/$/, '');
const AVATARS_DIR = path.join(PUBLIC_DIR, 'avatars');
fs.mkdirSync(AVATARS_DIR, { recursive: true });
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
};
const coverJobs = new Map();
const progression = createProgressionService({ store: db.progression, data: db });
const externalCoverProviders = Object.freeze({
  thegamesdb: {
    label: 'TheGamesDB', client: thegamesdb,
    environment: () => process.env.THEGAMESDB_API_KEY ? { apiKey: process.env.THEGAMESDB_API_KEY } : null,
  },
});
const providerCredentials = (userId, provider) => db.coverProviderCredentials(userId, provider) || externalCoverProviders[provider]?.environment() || null;
const escapeEmailHtml = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
function passwordResetEmail({ username, link }) {
  const safeUsername = escapeEmailHtml(username); const safeLink = escapeEmailHtml(link);
  return `<!doctype html><html lang="en"><body style="margin:0;padding:0;background:#071016;color:#dce6ee;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#071016;padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid #29404b;background:#0b141b"><tr><td style="padding:18px 22px;border-bottom:1px solid #29404b;background:#101d24;color:#64e8ca;font-size:12px;font-weight:bold;letter-spacing:1.5px">GAME KAT·A·LOG</td></tr><tr><td style="padding:26px 22px"><p style="margin:0 0 14px;color:#90a1af;font-size:12px;letter-spacing:1px;text-transform:uppercase">Account security</p><h1 style="margin:0 0 14px;color:#f2f7fa;font-size:24px;line-height:1.2">Reset your password</h1><p style="margin:0 0 20px;color:#bfccd5;font-size:15px;line-height:1.55">Hello ${safeUsername}, use the button below to choose a new password. This one-time link expires in one hour.</p><p style="margin:0 0 22px"><a href="${safeLink}" style="display:inline-block;padding:12px 17px;background:#1d8b76;border:1px solid #64e8ca;color:#06120f;font-size:14px;font-weight:bold;text-decoration:none">Reset password</a></p><p style="margin:0;color:#8798a6;font-size:12px;line-height:1.55">If the button does not open, copy this address into your browser:<br><a href="${safeLink}" style="color:#72e4c8;word-break:break-all">${safeLink}</a></p></td></tr><tr><td style="padding:14px 22px;border-top:1px solid #29404b;color:#71828f;font-size:12px;line-height:1.5">If you did not request this reset, you can safely ignore this email.</td></tr></table></td></tr></table></body></html>`;
}
function isCatalogueContribution(userId, game, result) {
  const entry = result?.entry;
  return entry?.status === 'public' && Number(entry.submittedByUserId) === Number(userId) && Number(entry.sourceGameId) === Number(game?.id);
}
function syncCatalogueAndRecordProgress(userId, game, options) {
  const catalogueResult = catalogue.syncGameSafely(userId, game);
  return recordGameProgress(userId, game, { ...options, catalogueContribution: isCatalogueContribution(userId, game, catalogueResult) });
}
function publishAppEvent(userId, event, payload) {
  if (event === 'game-updated' && payload?.game) syncCatalogueAndRecordProgress(userId, payload.game);
  events.publish(userId, event, payload);
}
function publishProgression(userId, result) {
  if (!result?.awards?.length) return;
  events.publish(userId, 'progression-updated', { progress: result.progress, awards: result.awards });
  let changed = false;
  for (const award of result.awards) {
    for (const level of award.levels || []) changed = activity.recordLevelUp(userId, level.level, level.title, level.previousTitle) || changed;
    if (award.event === 'catalogue_contribution') changed = activity.recordContribution(userId, award.ref || '') || changed;
  }
  if (changed) events.publishPublicActivity();
}
function recordGameProgress(userId, game, options) {
  const result = progression.recordGame(userId, game, options); publishProgression(userId, result); return result;
}
async function storeMatchedCover(userId, game, match, source) {
  const localUrl = await coverStorage.storeRemote(match.url);
  try {
    const updated = db.updateGameCover(userId, game.id, { url: localUrl, source, matchTitle: match.gameTitle });
    if (!updated) coverStorage.removeLocal(localUrl);
    return updated;
  } catch (error) { coverStorage.removeLocal(localUrl); throw error; }
}
const externalCoverJobs = Object.fromEntries(Object.entries(externalCoverProviders).map(([provider, definition]) => [provider,
  createCoverProviderBulkManager({ data: db, provider, label: definition.label, lookup: definition.client.bestExactCover,
    saveCover: storeMatchedCover, notify: publishAppEvent })]));
const pegiJobs = createPegiBulkManager({ data: db, lookup: searchPegi, notify: publishAppEvent });
const hltbJobs = createHltbBulkManager({ data: db, lookup: hltb.search, notify: publishAppEvent });
const descriptionJobs = createDescriptionBulkManager({ data: db, lookups: { steam: steamStore.bestExactDescription, thegamesdb: thegamesdb.bestExactDescription }, notify: publishAppEvent });
const catalogueRoutes = createCatalogueRoutes({ catalogue, auth, events, progression, onGameCreated: (userId, game) => recordGameProgress(userId, game, { created: true }) });
const forumRoutes = createForumRoutes({ catalogue, auth, events, progression, onProgression: publishProgression });
const patchRoutes = createPatchRoutes({ auth, events });

async function runCoverJob(userId, key) {
  const games = db.gamesMissingCovers(userId);
  const job = { state: 'running', total: games.length, processed: 0, matched: 0, unmatched: 0, skipped: 0, errors: 0, current: '', startedAt: new Date().toISOString() };
  coverJobs.set(userId, job);
  events.publish(userId, 'cover-job', { job });
  let consecutiveErrors = 0;
  for (const game of games) {
    const current = db.getGame(userId, game.id);
    if (!current || current.coverUrl) {
      job.current = ''; job.skipped++; job.processed++; events.publish(userId, 'cover-job', { job }); continue;
    }
    job.current = current.title;
    try {
      const match = await covers.bestExactCover(key, current.title);
      if (match) {
        const updated = await storeMatchedCover(userId, current, match, 'steamgriddb');
        if (updated) { job.matched++; publishAppEvent(userId, 'game-updated', { source: 'covers', game: updated }); }
        else job.skipped++;
      } else job.unmatched++;
      consecutiveErrors = 0;
    } catch (error) {
      job.errors++; job.lastError = error.message; consecutiveErrors++;
      if (consecutiveErrors >= BULK_JOB.maxConsecutiveErrors) { job.processed++; job.state = 'failed'; job.current = ''; job.finishedAt = new Date().toISOString(); events.publish(userId, 'cover-job', { job }); return; }
    }
    job.processed++;
    events.publish(userId, 'cover-job', { job });
    await covers.wait(BULK_JOB.coverDelayMs);
  }
  job.state = 'complete'; job.current = ''; job.finishedAt = new Date().toISOString();
  events.publish(userId, 'cover-job', { job });
}

function sendJson(response, status, value, headers = {}) {
  const body = JSON.stringify(value);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', ...headers });
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

async function prepareGameCover(input, existing = null) {
  const requested = String(input?.coverUrl || '').trim();
  if (!requested || (requested === existing?.coverUrl && coverStorage.localFilename(requested))) return { input, createdUrl: '' };
  if (coverStorage.localFilename(requested)) throw new Error('Saved cover paths cannot be assigned manually. Request the cover again.');
  const createdUrl = await coverStorage.storeRemote(requested);
  return { input: { ...input, coverUrl: createdUrl }, createdUrl };
}

function finishGameCoverChange(existing, game) {
  if (existing?.coverUrl && existing.coverUrl !== game?.coverUrl) coverStorage.removeLocal(existing.coverUrl);
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

function serveStatic(request, requestPath, response) {
  const relative = requestPath === '/' ? 'index.html' : `${requestPath.replace(/^\/+/, '')}${requestPath.endsWith('/') ? 'index.html' : ''}`;
  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== PUBLIC_DIR) return sendJson(response, 403, { error: 'Forbidden.' });
  const durableCover = filePath.startsWith(`${coverStorage.COVER_DIR}${path.sep}`);
  if (durableCover) {
    return fs.stat(filePath, (error, stats) => {
      if (error || !stats.isFile()) return sendJson(response, error?.code === 'ENOENT' ? 404 : 500, { error: error?.code === 'ENOENT' ? 'Not found.' : 'Could not read file.' });
      response.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Content-Length': stats.size,
        'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      const stream = fs.createReadStream(filePath); stream.on('error', () => response.destroy()); stream.pipe(response);
    });
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') return sendJson(response, 404, { error: 'Not found.' });
      return sendJson(response, 500, { error: 'Could not read file.' });
    }
    const etag = `"${content.length}-${crypto.createHash('md5').update(content).digest('hex').slice(0, 8)}"`;
    const headers = {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'ETag': etag,
    };
    if (request.headers['if-none-match'] === etag) {
      response.writeHead(304, headers);
      return response.end();
    }
    response.writeHead(200, { ...headers, 'Content-Length': content.length });
    response.end(content);
  });
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/config') {
    return sendJson(response, 200, { version: readVersion() });
  }
  if (request.method === 'GET' && url.pathname === '/api/showcase/covers') {
    return sendJson(response, 200, { covers: db.randomShowcaseCovers(SHOWCASE_COVER_COUNT) });
  }
  if (request.method === 'POST' && url.pathname === '/api/register') {
    const ip = auth.clientIp(request);
    if (auth.isRateLimited(ip)) return sendJson(response, 429, { error: 'Too many attempts. Try again later.' });
    try {
      const input = await readJson(request);
      if (input.password !== input.passwordConfirm) return sendJson(response, 400, { error: 'Passwords do not match.' });
      const user = await auth.register(input.username, input.password, input.email);
      const token = auth.createSession(user.id);
      if (activity.recordJoin(user.id)) events.publishPublicActivity();
      auth.clearFailures(ip);
      return sendJson(response, 201, { user: { id: user.id, username: user.username, email: user.email || '', avatarUrl: user.avatarUrl, hideFromActivity: user.hideFromActivity }, preferences: preferences.get(user.id) }, { 'Set-Cookie': auth.sessionCookie(token, request) });
    } catch (error) { auth.recordFailure(ip); return sendJson(response, 400, { error: error.message }); }
  }
  if (request.method === 'POST' && url.pathname === '/api/login') {
    const ip = auth.clientIp(request);
    if (auth.isRateLimited(ip)) return sendJson(response, 429, { error: 'Too many attempts. Try again later.' });
    try {
      const input = await readJson(request);
      const user = await auth.login(input.username, input.password);
      if (!user) { auth.recordFailure(ip); return sendJson(response, 401, { error: 'Invalid username or password.' }); }
      auth.clearFailures(ip);
      const token = auth.createSession(user.id);
      return sendJson(response, 200, { user, preferences: preferences.get(user.id) }, { 'Set-Cookie': auth.sessionCookie(token, request) });
    } catch (error) {
      if (error.code === 'ACCOUNT_LOCKED') return sendJson(response, error.status, { error: error.message });
      auth.recordFailure(ip);
      return sendJson(response, 400, { error: error.message });
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/password-reset/request') {
    const ip = auth.clientIp(request);
    if (auth.isRateLimited(ip)) return sendJson(response, 429, { error: 'Too many attempts. Try again later.' });
    try {
      const reset = auth.preparePasswordReset((await readJson(request)).identity);
      if (reset) {
        try {
          const link = `${PUBLIC_URL}/?reset=${encodeURIComponent(reset.token)}`;
          await mailer.send({ to: reset.email, subject: 'Reset your Game Kat·a·log password', text: `Hello ${reset.username},\n\nUse this one-time link to choose a new Game Kat·a·log password:\n${link}\n\nIt expires in one hour. If you did not request this, you can ignore this email.`, html: passwordResetEmail({ username: reset.username, link }) });
          auth.storePasswordReset(reset);
        } catch (error) { console.error(`[mail] password-reset delivery failed: ${error.message}`); }
      }
      return sendJson(response, 200, { message: 'If that account has an email address, a password reset link has been sent.' });
    } catch (error) { auth.recordFailure(ip); return sendJson(response, 400, { error: error.message }); }
  }
  if (request.method === 'POST' && url.pathname === '/api/password-reset') {
    try {
      const input = await readJson(request);
      if (input.password !== input.passwordConfirm) return sendJson(response, 400, { error: 'Passwords do not match.' });
      await auth.resetPassword(input.token, input.password);
      return sendJson(response, 200, { message: 'Password reset. You can now sign in.' });
    } catch (error) { return sendJson(response, 400, { error: error.message }); }
  }
  if (request.method === 'POST' && url.pathname === '/api/logout') {
    auth.logout(request);
    return sendJson(response, 200, { ok: true }, { 'Set-Cookie': auth.clearSessionCookie(request) });
  }
  if (request.method === 'GET' && url.pathname === '/api/activity') return sendJson(response, 200, activity.feed());
  if (request.method === 'GET' && url.pathname === '/api/activity/stream') return events.subscribePublicActivity(request, response);
  const user = auth.authenticate(request);
  if (!user) return sendJson(response, 401, { error: 'Unauthorized.' });
  const refreshedCookie = auth.refreshSessionCookie(request);
  if (refreshedCookie) response.setHeader('Set-Cookie', refreshedCookie);
  if (request.method === 'GET' && url.pathname === '/api/events') {
    return events.subscribe(request, response, user.id, () => Boolean(auth.authenticate(request)));
  }
  if (request.method === 'GET' && url.pathname === '/api/auth/me') return sendJson(response, 200, { user, preferences: preferences.get(user.id) });
  if (request.method === 'GET' && url.pathname === '/api/progression') {
    const result = progression.backfill(user.id);
    return sendJson(response, 200, user.avatarUrl ? progression.recordAvatar(user.id).progress : result.progress);
  }
  if (request.method === 'GET' && url.pathname === '/api/preferences') return sendJson(response, 200, preferences.get(user.id));
  if (request.method === 'PUT' && url.pathname === '/api/preferences') {
    try { return sendJson(response, 200, preferences.set(user.id, await readJson(request))); }
    catch (error) { return sendJson(response, 400, { error: error.message }); }
  }
  if (request.method === 'PUT' && url.pathname === '/api/account') {
    try {
      const updated = await auth.updateAccount(user.id, await readJson(request));
      events.publishPublicActivity();
      return sendJson(response, 200, { user: updated }, updated.sessionInvalidated ? { 'Set-Cookie': auth.clearSessionCookie(request) } : {});
    }
    catch (error) { return sendJson(response, 400, { error: error.message }); }
  }
  if (request.method === 'POST' && url.pathname === '/api/account/avatar') {
    try {
      const source = await readRaw(request, AVATAR_MAX_BYTES);
      let image;
      try { image = await imagePolicy.processAvatar(source); }
      catch { return sendJson(response, 415, { error: 'Avatar must be a valid image that can be processed.' }); }
      const filename = `${user.id}_${Date.now()}_${require('node:crypto').randomBytes(4).toString('hex')}.jpg`;
      const old = auth.avatarPath(user.id);
      fs.writeFileSync(path.join(AVATARS_DIR, filename), image, { flag: 'wx' });
      const avatarUrl = auth.updateAvatar(user.id, filename);
      removeAvatarFile(old);
      publishProgression(user.id, progression.recordAvatar(user.id));
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
    const accountKey = Boolean(db.coverApiKey(user.id)); const serverKey = Boolean(process.env.STEAMGRIDDB_API_KEY);
    return sendJson(response, 200, { configured: Boolean(accountKey || serverKey), missing: db.gamesMissingCovers(user.id).length, job: coverJobs.get(user.id) || null });
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
  const providerRoute = url.pathname.match(/^\/api\/cover-providers\/(thegamesdb)\/(status|config|bulk)$/);
  if (providerRoute) {
    const [, provider, action] = providerRoute; const definition = externalCoverProviders[provider];
    const credentials = providerCredentials(user.id, provider); const manager = externalCoverJobs[provider];
    if (request.method === 'GET' && action === 'status') {
      return sendJson(response, 200, { configured: Boolean(credentials), ...manager.status(user.id) });
    }
    if (request.method === 'PUT' && action === 'config') {
      try {
        const input = await readJson(request); const clean = definition.client.cleanCredentials(input);
        await definition.client.verify(clean); db.setCoverProviderCredentials(user.id, provider, clean);
        return sendJson(response, 200, { configured: true });
      } catch (error) { return sendJson(response, 400, { error: error.message }); }
    }
    if (request.method === 'DELETE' && action === 'config') {
      db.setCoverProviderCredentials(user.id, provider, null);
      return sendJson(response, 200, { configured: Boolean(definition.environment()) });
    }
    if (request.method === 'POST' && action === 'bulk') {
      if (!credentials) return sendJson(response, 409, { error: `Configure ${definition.label} in Account Settings first.` });
      try { return sendJson(response, 202, manager.start(user.id, credentials)); }
      catch (error) { return sendJson(response, 409, { error: error.message }); }
    }
  }
  if (request.method === 'GET' && url.pathname === '/api/covers/search') {
    const key = db.coverApiKey(user.id) || process.env.STEAMGRIDDB_API_KEY; const title = url.searchParams.get('q'); const platform = url.searchParams.get('platform');
    const searches = [];
    if (key) searches.push(covers.searchCovers(key, title));
    for (const [provider, definition] of Object.entries(externalCoverProviders)) {
      const credentials = providerCredentials(user.id, provider);
      if (credentials) searches.push(definition.client.searchCovers(credentials, title, platform));
    }
    if (!searches.length) return sendJson(response, 409, { error: 'Configure at least one cover provider in Account Settings first.' });
    const settled = await Promise.allSettled(searches); const results = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    if (results.length || settled.some(result => result.status === 'fulfilled')) return sendJson(response, 200, results.slice(0, 30));
    return sendJson(response, 502, { error: settled.find(result => result.status === 'rejected')?.reason?.message || 'Cover providers are unavailable.' });
  }
  if (request.method === 'GET' && url.pathname === '/api/titles/autocomplete') {
    const key = db.coverApiKey(user.id) || process.env.STEAMGRIDDB_API_KEY;
    const query = String(url.searchParams.get('q') || '').trim();
    if (url.searchParams.get('exact') === '1') {
      return sendJson(response, 200, { existing: db.findDuplicateGames(user.id, query, url.searchParams.get('platform')), suggestions: [] });
    }
    const existing = db.searchGameTitles(user.id, query);
    const publicEntries = query.length >= TITLE_AUTOCOMPLETE_MIN_LENGTH ? catalogue.searchPublic(query) : [];
    if (!key || query.length < TITLE_AUTOCOMPLETE_MIN_LENGTH || url.searchParams.get('local') === '1') {
      return sendJson(response, 200, { existing, catalogue: publicEntries, suggestions: [] });
    }
    try { return sendJson(response, 200, { existing, catalogue: publicEntries, suggestions: await covers.searchTitles(key, query) }); }
    catch { return sendJson(response, 200, { existing, catalogue: publicEntries, suggestions: [] }); }
  }
  if (request.method === 'POST' && url.pathname === '/api/covers/bulk') {
    const key = db.coverApiKey(user.id) || process.env.STEAMGRIDDB_API_KEY;
    if (!key) return sendJson(response, 409, { error: 'Configure a SteamGridDB API key in Account Settings first.' });
    const active = coverJobs.get(user.id);
    if (active?.state === 'running') return sendJson(response, 409, { error: 'A cover scan is already running.', job: active });
    runCoverJob(user.id, key).catch(error => {
      const previous = coverJobs.get(user.id) || {};
      const job = { ...previous, state: 'failed', total: previous.total ?? 0, processed: previous.processed ?? 0,
        matched: previous.matched ?? 0, unmatched: previous.unmatched ?? 0, skipped: previous.skipped ?? 0, errors: (previous.errors ?? 0) + 1,
        error: error.message, lastError: error.message, current: '', finishedAt: new Date().toISOString() };
      coverJobs.set(user.id, job); events.publish(user.id, 'cover-job', { job });
    });
    return sendJson(response, 202, { started: true, missing: db.gamesMissingCovers(user.id).length });
  }
  if (request.method === 'GET' && url.pathname === '/api/games') {
    return sendJson(response, 200, db.listGames(user.id, Object.fromEntries(url.searchParams)));
  }
  if (request.method === 'GET' && url.pathname === '/api/stats') return sendJson(response, 200, db.stats(user.id));
  if (request.method === 'GET' && url.pathname === '/api/meta') {
    return sendJson(response, 200, { platforms: db.stats(user.id).platforms.map(row => row.label), version: readVersion(), pegiLookup: true, user });
  }
  if (request.method === 'GET' && url.pathname === '/api/pegi/search') {
    try { return sendJson(response, 200, await searchPegi(url.searchParams.get('q'))); }
    catch (error) { return sendJson(response, 502, { error: error.message, fallbackUrl: `https://pegi.info/search-pegi?q=${encodeURIComponent(url.searchParams.get('q') || '')}` }); }
  }
  if (request.method === 'GET' && url.pathname === '/api/pegi/status') return sendJson(response, 200, pegiJobs.status(user.id));
  if (request.method === 'POST' && url.pathname === '/api/pegi/bulk') {
    try { return sendJson(response, 202, pegiJobs.start(user.id)); }
    catch (error) { return sendJson(response, 409, { error: error.message, job: pegiJobs.status(user.id).job }); }
  }
  if (request.method === 'GET' && url.pathname === '/api/hltb/search') {
    try { return sendJson(response, 200, await hltb.search(url.searchParams.get('q'))); }
    catch (error) { return sendJson(response, 502, { error: error.message, fallbackUrl: 'https://howlongtobeat.com/' }); }
  }
  if (request.method === 'GET' && url.pathname === '/api/hltb/status') return sendJson(response, 200, hltbJobs.status(user.id));
  if (request.method === 'POST' && url.pathname === '/api/hltb/bulk') {
    try { return sendJson(response, 202, hltbJobs.start(user.id)); }
    catch (error) { return sendJson(response, 409, { error: error.message, job: hltbJobs.status(user.id).job }); }
  }
  if (request.method === 'GET' && url.pathname === '/api/descriptions/status') {
    return sendJson(response, 200, { configured: true, thegamesdbConfigured: Boolean(providerCredentials(user.id, 'thegamesdb')), ...descriptionJobs.status(user.id) });
  }
  if (request.method === 'GET' && url.pathname === '/api/descriptions/search') {
    const title = url.searchParams.get('q'); const platform = url.searchParams.get('platform'); const credentials = providerCredentials(user.id, 'thegamesdb');
    const searches = [steamStore.searchDescriptions(title)]; if (credentials) searches.push(thegamesdb.searchDescriptions(credentials, title, platform));
    const settled = await Promise.allSettled(searches); const results = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    if (results.length || settled.some(result => result.status === 'fulfilled')) return sendJson(response, 200, results.slice(0, 20));
    return sendJson(response, 502, { error: settled.find(result => result.status === 'rejected')?.reason?.message || 'Description sources are unavailable.' });
  }
  if (request.method === 'POST' && url.pathname === '/api/descriptions/bulk') {
    try { return sendJson(response, 202, descriptionJobs.start(user.id, providerCredentials(user.id, 'thegamesdb'))); }
    catch (error) { return sendJson(response, 409, { error: error.message }); }
  }
  if (request.method === 'POST' && url.pathname === '/api/games') {
    let prepared;
    try {
      prepared = await prepareGameCover(await readJson(request));
      const game = db.createGame(user.id, prepared.input);
      const progressionResult = syncCatalogueAndRecordProgress(user.id, game, { created: true });
      return sendJson(response, 201, { ...game, progression: progressionResult });
    }
    catch (error) {
      if (prepared?.createdUrl) coverStorage.removeLocal(prepared.createdUrl);
      return sendJson(response, 400, { error: error.message });
    }
  }
  const match = url.pathname.match(/^\/api\/games\/(\d+)$/);
  if (match && request.method === 'GET') {
    const game = db.getGame(user.id, Number(match[1]));
    return game ? sendJson(response, 200, game) : sendJson(response, 404, { error: 'Game not found.' });
  }
  if (match && request.method === 'PUT') {
    const existing = db.getGame(user.id, Number(match[1]));
    if (!existing) return sendJson(response, 404, { error: 'Game not found.' });
    let prepared;
    try {
      prepared = await prepareGameCover(await readJson(request), existing);
      const game = db.updateGame(user.id, Number(match[1]), prepared.input);
      if (!game) { if (prepared.createdUrl) coverStorage.removeLocal(prepared.createdUrl); return sendJson(response, 404, { error: 'Game not found.' }); }
      finishGameCoverChange(existing, game);
      const progressionResult = syncCatalogueAndRecordProgress(user.id, game, { previous: existing });
      return sendJson(response, 200, { ...game, progression: progressionResult });
    } catch (error) {
      if (prepared?.createdUrl) coverStorage.removeLocal(prepared.createdUrl);
      return sendJson(response, 400, { error: error.message });
    }
  }
  if (match && request.method === 'DELETE') {
    const existing = db.getGame(user.id, Number(match[1]));
    if (!existing || !db.deleteGame(user.id, Number(match[1]))) return sendJson(response, 404, { error: 'Game not found.' });
    coverStorage.removeLocal(existing.coverUrl); return sendJson(response, 200, { ok: true });
  }
  sendJson(response, 404, { error: 'API route not found.' });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (await admin.handle(request, response, url)) return;
    if (await catalogueRoutes.handle(request, response, url)) return;
    if (await forumRoutes.handle(request, response, url)) return;
    if (await patchRoutes.handle(request, response, url)) return;
  } catch (error) { return sendJson(response, 500, { error: error.message || 'Request failed.' }); }
  if (url.pathname.startsWith('/api/')) {
    handleApi(request, response, url).catch(error => sendJson(response, 500, { error: error.message || 'Unexpected server error.' }));
  } else {
    serveStatic(request, decodeURIComponent(url.pathname), response);
  }
});

auth.purgeExpiredSessions();
server.listen(PORT, HOST, () => {
  console.log(`Game Kat·a·log is running at http://localhost:${PORT}`);
  backup.start();
  coverStorage.localizeExistingCovers(db, {
    onStored: (userId, game) => publishAppEvent(userId, 'game-updated', { source: 'cover-storage', game }),
    onError: (game, error) => console.error(`[covers] could not store game ${game.id}: ${error.message}`),
  }).then(async result => {
    if (result.total) console.log(`[covers] localized ${result.stored}/${result.total}; ${result.failed} failed`);
    const normalized = await coverStorage.normalizeExistingCovers(db, {
      onStored: (userId, game) => publishAppEvent(userId, 'game-updated', { source: 'cover-storage', game }),
      onError: (game, error) => console.error(`[covers] could not normalize game ${game.id}: ${error.message}`),
    });
    showcaseCovers.writeShowcase(db, SHOWCASE_COVER_COUNT);
    const catalogueSummary = catalogue.syncAll(db.allGamesForCatalogue());
    const activityBackfill = activity.backfillContributions();
    if (activityBackfill) console.log(`[activity] recorded ${activityBackfill} Kat·a·log contribution${activityBackfill === 1 ? '' : 's'}`);
    const levelActivityBackfill = activity.backfillLevelUps();
    if (levelActivityBackfill) console.log(`[activity] recorded ${levelActivityBackfill} historical level-up${levelActivityBackfill === 1 ? '' : 's'}`);
    const contributionBackfill = progression.backfillCatalogueContributions(catalogue.contributionSources());
    if (contributionBackfill.awards.length) console.log(`[progression] awarded ${contributionBackfill.awards.length} Kat·a·log contribution${contributionBackfill.awards.length === 1 ? '' : 's'}`);
    if (catalogueSummary.public || catalogueSummary.candidate || catalogueSummary.errors) {
      console.log(`[catalogue] public ${catalogueSummary.public}; candidates ${catalogueSummary.candidate}; linked ${catalogueSummary.linked}; errors ${catalogueSummary.errors}`);
    }
    if (normalized.total) console.log(`[covers] normalized ${normalized.stored}/${normalized.total}; ${normalized.skipped} already compliant; ${normalized.failed} failed`);
  }).catch(error => console.error('[covers] migration failed:', error.message));
});

function shutdown() {
  admin.markServerStopped();
  server.close(() => { db.db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
