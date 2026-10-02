function createPublicRoutes({
  showcasePool, siteStats, sendJson, RUNTIME_POLICY, covers, events, activity, auth,
  publicProfiles, readVersion,
}) {

  return async function handlePublic(request, response, url, user) {
    if (request.method === 'GET' && url.pathname === '/api/config') {
      return sendJson(response, 200, { version: readVersion() });
    }
    if (request.method === 'GET' && url.pathname === '/api/site-stats') {
      return sendJson(response, 200, siteStats.snapshot());
    }
    if (request.method === 'GET' && url.pathname === '/api/showcase/covers') {
      const user = auth.authenticate(request, { touch: false });
      const ownedOnly = url.searchParams.get('scope') === 'owned';
      if (ownedOnly && !user) return sendJson(response, 401, { error: 'Authentication required.' });
      return sendJson(response, 200, {
        covers: ownedOnly ? showcasePool.owned(RUNTIME_POLICY.showcaseCoverCount, user.id) : showcasePool.shared(RUNTIME_POLICY.showcaseCoverCount, user?.id),
      });
    }
    if (request.method === 'GET' && url.pathname === '/api/activity') return sendJson(response, 200, activity.feed());
    if (request.method === 'GET' && url.pathname === '/api/activity/stream') return events.subscribePublicActivity(request, response);
    const publicProfileMatch = request.method === 'GET' && url.pathname.match(/^\/api\/public\/user\/([^/]+)$/);
    if (publicProfileMatch) {
      let username;
      try { username = decodeURIComponent(publicProfileMatch[1]); }
      catch { return sendJson(response, 400, { error: 'Invalid profile name.' }); }
      const profile = username.length <= 32 ? publicProfiles.get(username) : null;
      return profile ? sendJson(response, 200, profile) : sendJson(response, 404, { error: 'Public profile not found.' });
    }

  };
}
module.exports = { createPublicRoutes };
