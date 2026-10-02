const PUBLIC_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://cdn.thegamesdb.net https://cdn.steamgriddb.com https://cdn2.steamgriddb.com https://images.igdb.com https://howlongtobeat.com",
  "connect-src 'self'",
  "font-src 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join('; ');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
};
function setPublicSecurityHeaders(response) {
  response.setHeader('Content-Security-Policy', PUBLIC_CONTENT_SECURITY_POLICY);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('X-Frame-Options', 'SAMEORIGIN');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function sendJson(response, status, value, headers = {}) {
  const body = JSON.stringify(value);
  setPublicSecurityHeaders(response);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', ...headers });
  response.end(body);
}

function sendCoverPreview(response, preview) {
  const contentType = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[preview.extension];
  if (!contentType) return sendJson(response, 415, { error: 'Cover provider did not return a supported image.' });
  setPublicSecurityHeaders(response);
  response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': preview.source.length, 'Cache-Control': 'private, max-age=900', 'X-Content-Type-Options': 'nosniff' });
  response.end(preview.source);
}

module.exports = { setPublicSecurityHeaders, sendJson, sendCoverPreview, MIME };
