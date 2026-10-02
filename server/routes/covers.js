function createCoversRoutes({
  coverJobs, externalCoverProviders, providerCredentials, steamGridKey, externalCoverJobs,
  igdbJobs, sendJson, sendCoverPreview, readJson, runCoverJob, db, hltb, covers, thegamesdb,
  igdb, coverStorage, events,
}) {

  return async function handleCovers(request, response, url, user) {
    if (request.method === 'GET' && url.pathname === '/api/covers/status') {
      return sendJson(response, 200, { configured: Boolean(steamGridKey()), shared: true,
        missing: db.gamesMissingCovers(user.id).length, job: coverJobs.get(user.id) || null });
    }
    const providerRoute = url.pathname.match(/^\/api\/cover-providers\/(thegamesdb|igdb)\/(status|bulk)$/);
    if (providerRoute) {
      const [, provider, action] = providerRoute; const definition = externalCoverProviders[provider];
      const credentials = providerCredentials(user.id, provider); const manager = provider === 'igdb' ? igdbJobs : externalCoverJobs[provider];
      if (request.method === 'GET' && action === 'status') {
        return sendJson(response, 200, { configured: Boolean(credentials), shared: provider === 'igdb', canConfigure: provider === 'thegamesdb', ...manager.status(user.id) });
      }
      if (request.method === 'POST' && action === 'bulk') {
        if (!credentials) return sendJson(response, 409, { error: `${definition.label} is not available on this server.` });
        try { return sendJson(response, 202, manager.start(user.id, credentials)); }
        catch (error) { return sendJson(response, 409, { error: error.message }); }
      }
    }
    if (url.pathname === '/api/cover-providers/thegamesdb/config') {
      const definition = externalCoverProviders.thegamesdb;
      if (request.method === 'PUT') {
        try {
          const input = await readJson(request); const clean = definition.client.cleanCredentials(input);
          await definition.client.verify(clean); db.setCoverProviderCredentials(user.id, 'thegamesdb', clean);
          return sendJson(response, 200, { configured: true });
        } catch (error) { return sendJson(response, 400, { error: error.message }); }
      }
      if (request.method === 'DELETE') {
        db.setCoverProviderCredentials(user.id, 'thegamesdb', null);
        return sendJson(response, 200, { configured: Boolean(definition.environment()) });
      }
    }
    if (request.method === 'GET' && url.pathname === '/api/covers/search') {
      const key = steamGridKey(); const title = url.searchParams.get('q'); const platform = url.searchParams.get('platform');
      const searches = [];
      if (key) searches.push(covers.searchCovers(key, title));
      for (const [provider, definition] of Object.entries(externalCoverProviders)) {
        const credentials = providerCredentials(user.id, provider);
        if (credentials) searches.push(definition.client.searchCovers(credentials, title, platform));
      }
      searches.push(hltb.searchCovers(title));
      const settled = await Promise.allSettled(searches); const results = settled.flatMap(result => result.status === 'fulfilled' ? result.value : [])
        .map(result => result.source === 'thegamesdb' ? { ...result, thumbnailUrl: `/api/covers/preview?url=${encodeURIComponent(result.url)}` } : result);
      if (results.length || settled.some(result => result.status === 'fulfilled')) return sendJson(response, 200, results.slice(0, 30));
      return sendJson(response, 502, { error: settled.find(result => result.status === 'rejected')?.reason?.message || 'Cover providers are unavailable.' });
    }
    if (request.method === 'GET' && url.pathname === '/api/covers/preview') {
      try { return sendCoverPreview(response, await coverStorage.previewRemote(url.searchParams.get('url'))); }
      catch (error) { return sendJson(response, error.status || 400, { error: error.message }); }
    }
    if (request.method === 'POST' && url.pathname === '/api/covers/bulk') {
      const key = steamGridKey();
      if (!key) return sendJson(response, 409, { error: 'SteamGridDB is not available on this server.' });
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

  };
}
module.exports = { createCoversRoutes };
