'use strict';

const APP_VIEW_PATH = /^\/(?:signal|katalog|forum(?:\/|$)|game\/)/;

function isAppViewPath(pathname) {
  return APP_VIEW_PATH.test(String(pathname || ''));
}

function wantsAuthenticatedShell(request, url, user) {
  if (!user || request.method !== 'GET' || !isAppViewPath(url.pathname)) return false;
  if (request.headers['x-gamekat-partial'] === '1') return false;
  const destination = String(request.headers['sec-fetch-dest'] || '').toLocaleLowerCase();
  const acceptsHtml = String(request.headers.accept || '').toLocaleLowerCase().includes('text/html');
  return destination === 'document' || acceptsHtml;
}

module.exports = { APP_VIEW_PATH, isAppViewPath, wantsAuthenticatedShell };
