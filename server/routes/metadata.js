function createMetadataRoutes({
  providerCredentials, pegiJobs, hltbJobs, descriptionJobs, sendJson, searchPegi, hltb,
  thegamesdb, igdb, steamStore,
}) {

  return async function handleMetadata(request, response, url, user) {
    if (request.method === 'GET' && url.pathname === '/api/pegi/search') {
      try { return sendJson(response, 200, await searchPegi(url.searchParams.get('q'))); }
      catch { return sendJson(response, 502, { error: 'PEGI is temporarily unavailable. Try again shortly.', fallbackUrl: `https://pegi.info/search-pegi?q=${encodeURIComponent(url.searchParams.get('q') || '')}` }); }
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
      return sendJson(response, 200, { configured: true, thegamesdbConfigured: Boolean(providerCredentials(user.id, 'thegamesdb')),
        ...descriptionJobs.status(user.id) });
    }
    if (request.method === 'GET' && url.pathname === '/api/descriptions/search') {
      const title = url.searchParams.get('q'); const platform = url.searchParams.get('platform'); const credentials = providerCredentials(user.id, 'thegamesdb');
      const searches = [steamStore.searchDescriptions(title)]; if (credentials) searches.push(thegamesdb.searchDescriptions(credentials, title, platform));
      const igdbCredentials = providerCredentials(user.id, 'igdb'); if (igdbCredentials) searches.push(igdb.searchDescriptions(igdbCredentials, title, platform));
      const settled = await Promise.allSettled(searches); const results = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      if (results.length || settled.some(result => result.status === 'fulfilled')) return sendJson(response, 200, results.slice(0, 20));
      return sendJson(response, 502, { error: settled.find(result => result.status === 'rejected')?.reason?.message || 'Description sources are unavailable.' });
    }
    if (request.method === 'POST' && url.pathname === '/api/descriptions/bulk') {
      try { return sendJson(response, 202, descriptionJobs.start(user.id, providerCredentials(user.id, 'thegamesdb'))); }
      catch (error) { return sendJson(response, 409, { error: error.message }); }
    }

  };
}
module.exports = { createMetadataRoutes };
