function createTitlesRoutes({
  providerCredentials, steamGridKey, sendJson, db, covers, igdb, katalog,
  TITLE_AUTOCOMPLETE_MIN_LENGTH,
}) {

  return async function handleTitles(request, response, url, user) {
    if (request.method === 'GET' && url.pathname === '/api/titles/autocomplete') {
      const key = steamGridKey();
      const query = String(url.searchParams.get('q') || '').trim();
      if (url.searchParams.get('exact') === '1') {
        return sendJson(response, 200, { existing: db.findDuplicateGames(user.id, query, url.searchParams.get('platform'), url.searchParams.get('igdbId')), suggestions: [] });
      }
      const existing = db.searchGameTitles(user.id, query);
      const publicEntries = query.length >= TITLE_AUTOCOMPLETE_MIN_LENGTH ? katalog.searchPublic(query) : [];
      if (query.length < TITLE_AUTOCOMPLETE_MIN_LENGTH || url.searchParams.get('local') === '1') {
        return sendJson(response, 200, { existing, catalogue: publicEntries, suggestions: [] });
      }
      const igdbCredentials = providerCredentials(user.id, 'igdb');
      try { return sendJson(response, 200, { existing, catalogue: publicEntries, suggestions: igdbCredentials
        ? await igdb.searchGames(igdbCredentials, query) : key ? await covers.searchTitles(key, query) : [] }); }
      catch { return sendJson(response, 200, { existing, catalogue: publicEntries, suggestions: [] }); }
    }
    if (request.method === 'GET' && url.pathname === '/api/igdb/search') {
      const credentials = providerCredentials(user.id, 'igdb');
      if (!credentials) return sendJson(response, 409, { error: 'IGDB is not available on this server.' });
      try { return sendJson(response, 200, await igdb.searchGames(credentials, url.searchParams.get('q'))); }
      catch (error) { return sendJson(response, error.status || 502, { error: error.message }); }
    }

  };
}
module.exports = { createTitlesRoutes };
