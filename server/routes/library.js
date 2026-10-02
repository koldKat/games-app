function createLibraryRoutes({
  progression, providerCredentials, syncKatalogAndRecordProgress, sendJson, readJson,
  prepareGameCover, finishGameCoverChange, db, igdb, coverStorage, readVersion,
}) {

  return async function handleLibrary(request, response, url, user) {
    if (request.method === 'GET' && url.pathname === '/api/games') {
      return sendJson(response, 200, db.listGamesPage(user.id, Object.fromEntries(url.searchParams)));
    }
    if (request.method === 'GET' && url.pathname === '/api/games/random') {
      const game = db.randomGame(user.id, Object.fromEntries(url.searchParams));
      return game ? sendJson(response, 200, game) : sendJson(response, 404, { error: 'No games match the current filters.' });
    }
    if (request.method === 'GET' && url.pathname === '/api/stats') return sendJson(response, 200, db.stats(user.id));
    if (request.method === 'GET' && url.pathname === '/api/meta') {
      return sendJson(response, 200, { platforms: db.platformNames(user.id), version: readVersion(), pegiLookup: true,
        integrations: { igdb: Boolean(providerCredentials(user.id, 'igdb')) }, user });
    }
    if (request.method === 'POST' && url.pathname === '/api/games') {
      let prepared;
      try {
        prepared = await prepareGameCover(await readJson(request));
        const game = db.createGame(user.id, prepared.input);
        const progressionResult = syncKatalogAndRecordProgress(user.id, game, { created: true });
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
        const progressionResult = syncKatalogAndRecordProgress(user.id, game, { previous: existing });
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

  };
}
module.exports = { createLibraryRoutes };
