const http = require('node:http');
const path = require('node:path');
const { APP_NAME } = require('../site-config');
const RUNTIME_POLICY = require('../runtime-policy');
const { createRuntime } = require('../runtime/context');
const { createApiRouter } = require('../routes/api');
const { createStaticHandler } = require('../http/static');
const { sendJson, setPublicSecurityHeaders } = require('../http/responses');
const { decodeRequestPathname, parseRequestUrl } = require('../request-url');
const { isAppViewPath, wantsAuthenticatedShell } = require('../app-shell');
const { createKatalogRoutes } = require('../katalog-routes');
const { createForumRoutes } = require('../forum-routes');
const { createPatchRoutes } = require('../patch-routes');
const admin = require('../admin');
const backup = require('../backup');
const trafficMetrics = require('../traffic-metrics');
const showcaseCovers = require('../showcase-covers');
const ROOT = require('node:path').resolve(__dirname, '..', '..');

function startServer() {
  const PORT = Number(process.env.PORT || 3005);
  const HOST = process.env.HOST || '0.0.0.0';
  const context = createRuntime();
  const { db, auth, events, progression, showcasePool, recordGameProgress, publishProgression } = context;
  const katalog = require('../katalog-runtime');
  const handleApi = createApiRouter(context);
  const serveStatic = createStaticHandler(path.join(ROOT, 'public'));
  const katalogRoutes = createKatalogRoutes({ katalog, auth, events, progression, showcaseCovers: showcasePool.shared, onGameCreated: (userId, game) => recordGameProgress(userId, game, { created: true }) });
  const forumRoutes = createForumRoutes({ katalog, auth, events, progression, showcaseCovers: showcasePool.shared, onProgression: publishProgression });
  const patchRoutes = createPatchRoutes({ auth, events });

  const server = http.createServer(async (request, response) => {
    trafficMetrics.trackRequest(request, response);
    setPublicSecurityHeaders(response);
    const url = parseRequestUrl(request.url);
    if (!url) return sendJson(response, 400, { error: 'Invalid request target.' });
    try {
      if (await admin.handle(request, response, url)) return;
      if (isAppViewPath(url.pathname)) {
        const shellUser = auth.authenticate(request, { touch: false });
        if (wantsAuthenticatedShell(request, url, shellUser)) return serveStatic(request, '/', response);
      }
      if (await katalogRoutes.handle(request, response, url)) return;
      if (await forumRoutes.handle(request, response, url)) return;
      if (await patchRoutes.handle(request, response, url)) return;
    } catch (error) { return sendJson(response, 500, { error: error.message || 'Request failed.' }); }
    if (url.pathname.startsWith('/api/')) {
      handleApi(request, response, url).catch(error => sendJson(response, 500, { error: error.message || 'Unexpected server error.' }));
    } else {
      const pathname = decodeRequestPathname(url);
      if (pathname == null) return sendJson(response, 400, { error: 'Invalid request path.' });
      serveStatic(request, pathname, response);
    }
  });

  auth.purgeExpiredSessions();
  server.listen(PORT, HOST, () => {
    console.log(`${APP_NAME} is running at http://localhost:${PORT}`);
    backup.start();
    setImmediate(() => {
      try {
        for (const result of progression.backfillCollectionAchievementsForAll()) publishProgression(result.userId, result);
      }
      catch (error) { console.error('[progression] collection achievement backfill failed:', error.message); }
    });
    // Full-library maintenance belongs in explicit scripts, not startup.
    showcaseCovers.writeShowcase(showcasePool.public, RUNTIME_POLICY.showcaseCoverCount);
  });

  function shutdown() {
    admin.markServerStopped();
    trafficMetrics.flush();
    server.close(() => { trafficMetrics.flush(); db.db.close(); process.exit(0); });
    setTimeout(() => process.exit(1), RUNTIME_POLICY.shutdownGraceMs).unref();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}
module.exports = { startServer };
