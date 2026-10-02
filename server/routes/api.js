const { createPublicRoutes } = require('./public');
const { createAuthenticationRoutes } = require('./authentication');
const { createAccountRoutes } = require('./account');
const { createImportsRoutes } = require('./imports');
const { createCoversRoutes } = require('./covers');
const { createTitlesRoutes } = require('./titles');
const { createLibraryRoutes } = require('./library');
const { createMetadataRoutes } = require('./metadata');

function createApiRouter(context) {
  const { auth, userLocation, sendJson } = context;
  const publicRoutes = createPublicRoutes(context);
  const authenticationRoutes = createAuthenticationRoutes(context);
  const accountRoutes = createAccountRoutes(context);
  const importsRoutes = createImportsRoutes(context);
  const coversRoutes = createCoversRoutes(context);
  const titlesRoutes = createTitlesRoutes(context);
  const libraryRoutes = createLibraryRoutes(context);
  const metadataRoutes = createMetadataRoutes(context);
  return async function handleApi(request, response, url) {
    const anonymous = url.pathname === '/api/config' || url.pathname === '/api/site-stats' || url.pathname === '/api/showcase/covers' || url.pathname.startsWith('/api/activity') || url.pathname.startsWith('/api/public/user/');
    if (anonymous) { await publicRoutes(request, response, url); if (response.headersSent) return; }
    const authentication = ['/api/register', '/api/login', '/api/logout', '/api/password-reset/request', '/api/password-reset'].includes(url.pathname);
    if (authentication) { await authenticationRoutes(request, response, url); if (response.headersSent) return; }
    const user = auth.authenticate(request);
    if (!user) return sendJson(response, 401, { error: 'Unauthorized.' });
    userLocation.record(user.id, auth.clientIp(request));
    const refreshedCookie = auth.refreshSessionCookie(request);
    if (refreshedCookie) response.setHeader('Set-Cookie', refreshedCookie);

    const routes = url.pathname.startsWith('/api/steam/') || url.pathname.startsWith('/api/gog/') ? importsRoutes
      : url.pathname.startsWith('/api/covers/') || url.pathname.startsWith('/api/cover-providers/') ? coversRoutes
      : url.pathname.startsWith('/api/titles/') || url.pathname.startsWith('/api/igdb/') ? titlesRoutes
      : url.pathname.startsWith('/api/games') || ['/api/stats', '/api/meta'].includes(url.pathname) ? libraryRoutes
      : url.pathname.startsWith('/api/pegi/') || url.pathname.startsWith('/api/hltb/') || url.pathname.startsWith('/api/descriptions/') ? metadataRoutes : accountRoutes;
    await routes(request, response, url, user);
    if (!response.headersSent) sendJson(response, 404, { error: 'API route not found.' });
  };
}
module.exports = { createApiRouter };
