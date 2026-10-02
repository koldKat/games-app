const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const coverStorage = require('../cover-storage');
const { sendJson, setPublicSecurityHeaders, MIME } = require('./responses');

function createStaticHandler(PUBLIC_DIR) {
  function serveStatic(request, requestPath, response) {
    const relative = requestPath === '/' ? 'index.html' : `${requestPath.replace(/^\/+/, '')}${requestPath.endsWith('/') ? 'index.html' : ''}`;
    const filePath = path.resolve(PUBLIC_DIR, relative);
    if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== PUBLIC_DIR) return sendJson(response, 403, { error: 'Forbidden.' });
    const durableCover = filePath.startsWith(`${coverStorage.COVER_DIR}${path.sep}`);
    if (durableCover) {
      return fs.stat(filePath, (error, stats) => {
        if (error || !stats.isFile()) return sendJson(response, error?.code === 'ENOENT' ? 404 : 500, { error: error?.code === 'ENOENT' ? 'Not found.' : 'Could not read file.' });
        setPublicSecurityHeaders(response);
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
      setPublicSecurityHeaders(response);
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

  return serveStatic;
}
module.exports = { createStaticHandler };
