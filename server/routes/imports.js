function createImportsRoutes({ steamImports, gogImports, sendJson, readJson, runLibraryImport, events }) {

  return async function handleImports(request, response, url, user) {
    if (request.method === 'GET' && url.pathname === '/api/steam/status') {
      return sendJson(response, 200, steamImports.status(user.id));
    }
    if (request.method === 'PUT' && url.pathname === '/api/steam/connection') {
      try { return sendJson(response, 200, await steamImports.connect(user.id, (await readJson(request)).profile)); }
      catch (error) { return sendJson(response, error.status || 400, { error: error.message }); }
    }
    if (request.method === 'DELETE' && url.pathname === '/api/steam/connection') {
      try { return sendJson(response, 200, steamImports.disconnect(user.id)); }
      catch (error) { return sendJson(response, error.status || 400, { error: error.message }); }
    }
    if (request.method === 'GET' && url.pathname === '/api/steam/import-preview') {
      try { return sendJson(response, 200, await steamImports.preview(user.id)); }
      catch (error) { return sendJson(response, error.status || 502, { error: error.message }); }
    }
    if (request.method === 'POST' && url.pathname === '/api/steam/import') {
      try {
        const body = await readJson(request);
        return sendJson(response, 200, await runLibraryImport({ userId: user.id, provider: 'Steam', service: steamImports,
          ids: body.appIds, progressEvent: 'steam-import-progress' }));
      } catch (error) { return sendJson(response, error.status || 400, { error: error.message }); }
    }
    if (request.method === 'GET' && url.pathname === '/api/gog/status') {
      return sendJson(response, 200, gogImports.status(user.id));
    }
    if (request.method === 'PUT' && url.pathname === '/api/gog/connection') {
      try { return sendJson(response, 200, await gogImports.connect(user.id, (await readJson(request)).authorization)); }
      catch (error) { return sendJson(response, error.status || 400, { error: error.message }); }
    }
    if (request.method === 'DELETE' && url.pathname === '/api/gog/connection') {
      try { return sendJson(response, 200, gogImports.disconnect(user.id)); }
      catch (error) { return sendJson(response, error.status || 400, { error: error.message }); }
    }
    if (request.method === 'GET' && url.pathname === '/api/gog/import-preview') {
      try {
        const publishProgress = progress => events.publish(user.id, 'gog-import-progress', progress);
        return sendJson(response, 200, await gogImports.preview(user.id, publishProgress));
      }
      catch (error) { return sendJson(response, error.status || 502, { error: error.message }); }
    }
    if (request.method === 'POST' && url.pathname === '/api/gog/import') {
      try {
        const body = await readJson(request);
        return sendJson(response, 200, await runLibraryImport({ userId: user.id, provider: 'GOG', service: gogImports,
          ids: body.productIds, progressEvent: 'gog-import-progress' }));
      } catch (error) { return sendJson(response, error.status || 400, { error: error.message }); }
    }

  };
}
module.exports = { createImportsRoutes };
