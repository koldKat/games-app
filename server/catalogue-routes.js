'use strict';

const { renderCatalogue, renderGame, renderNotFound, renderSignal, sitemapXml } = require('./catalogue-pages');
const forum = require('./forum-data');

function securityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'SAMEORIGIN');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: https://cdn.thegamesdb.net https://cdn.steamgriddb.com https://cdn2.steamgriddb.com https://howlongtobeat.com; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
}

function send(response, status, contentType, body, cacheControl = 'no-cache') {
  securityHeaders(response);
  response.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': cacheControl,
  });
  response.end(body);
}

function sendJson(response, status, value) {
  send(response, status, 'application/json; charset=utf-8', JSON.stringify(value), 'no-store');
}

function readJson(request, maxBytes = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > maxBytes) request.destroy(new Error('Request body is too large.'));
    });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON body.')); }
    });
    request.on('error', reject);
  });
}

function createCatalogueRoutes({ catalogue, auth, events, progression = null, onGameCreated = () => {} }) {
  async function handle(request, response, url) {
    if (request.method === 'GET' && url.pathname === '/api/site/stream') {
      events.subscribePublicSite(request, response);
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/signal') {
      const user = auth.authenticate(request);
      const progress = user ? progression?.info(user.id) || null : null;
      const refreshed = user && auth.refreshSessionCookie(request);
      if (refreshed) response.setHeader('Set-Cookie', refreshed);
      const coverUrls = catalogue.listPublic({ limit: 5 }).entries.map(entry => entry.coverUrl);
      send(response, 200, 'text/html; charset=utf-8', renderSignal({ user, progress, coverUrls }));
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/katalog') {
      const user = auth.authenticate(request);
      const progress = user ? progression?.info(user.id) || null : null;
      const refreshed = user && auth.refreshSessionCookie(request);
      if (refreshed) response.setHeader('Set-Cookie', refreshed);
      const query = String(url.searchParams.get('q') || '').trim().slice(0, 120);
      const platform = String(url.searchParams.get('platform') || '').trim().slice(0, 120);
      const result = catalogue.listPublic({ q: query, platform, page: url.searchParams.get('page') });
      send(response, 200, 'text/html; charset=utf-8', renderCatalogue({
        result, platforms: catalogue.publicPlatforms(), query, platform, user, progress,
      }));
      return true;
    }
    const gamePage = url.pathname.match(/^\/game\/([a-z0-9-]+)$/);
    if (request.method === 'GET' && gamePage) {
      const user = auth.authenticate(request);
      const progress = user ? progression?.info(user.id) || null : null;
      const refreshed = user && auth.refreshSessionCookie(request);
      if (refreshed) response.setHeader('Set-Cookie', refreshed);
      const entry = catalogue.getPublicBySlug(gamePage[1]);
      const libraryGame = entry && user ? catalogue.libraryCopy?.(user.id, entry.id) || null : null;
      send(response, entry ? 200 : 404, 'text/html; charset=utf-8', entry
        ? renderGame({ entry, result: catalogue.listPublic({}), platforms: catalogue.publicPlatforms(), user, progress, libraryGame }) : renderNotFound());
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/sitemap.xml') {
      send(response, 200, 'application/xml; charset=utf-8', sitemapXml(catalogue.sitemapEntries(), undefined, forum.sitemapThreads()), 'public, max-age=3600');
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/catalogue/search') {
      const query = String(url.searchParams.get('q') || '').trim();
      sendJson(response, 200, { entries: query.length >= 2 ? catalogue.searchPublic(query) : [] });
      return true;
    }
    const detailApi = url.pathname.match(/^\/api\/catalogue\/game\/([a-z0-9-]+)$/);
    if (request.method === 'GET' && detailApi) {
      const entry = catalogue.getPublicBySlug(detailApi[1]);
      sendJson(response, entry ? 200 : 404, entry || { error: 'Kat·a·log game not found.' });
      return true;
    }
    const addApi = url.pathname.match(/^\/api\/catalogue\/(\d+)\/library$/);
    if (request.method === 'POST' && addApi) {
      const user = auth.authenticate(request);
      if (!user) { sendJson(response, 401, { error: 'Sign in to add this game.' }); return true; }
      const refreshed = auth.refreshSessionCookie(request);
      if (refreshed) response.setHeader('Set-Cookie', refreshed);
      try {
        const game = catalogue.addToLibrary(user.id, Number(addApi[1]), await readJson(request));
        onGameCreated(user.id, game);
        events.publish(user.id, 'game-created', { source: 'catalogue', game });
        sendJson(response, 201, { game });
      } catch (error) {
        sendJson(response, error.status || 400, { error: error.message, existing: error.existing || null });
      }
      return true;
    }
    return false;
  }

  return { handle };
}

module.exports = { createCatalogueRoutes, readJson, securityHeaders };
