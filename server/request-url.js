'use strict';

const REQUEST_BASE = 'http://request.local';
const INVALID_TARGET_CHARACTERS = /[\u0000-\u001f\u007f\\]/;

function parseRequestUrl(target) {
  if (
    typeof target !== 'string'
    || !target.startsWith('/')
    || target.startsWith('//')
    || INVALID_TARGET_CHARACTERS.test(target)
  ) return null;

  try {
    const parsed = new URL(target, REQUEST_BASE);
    return parsed.origin === REQUEST_BASE ? parsed : null;
  } catch {
    return null;
  }
}

function decodeRequestPathname(url) {
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}

module.exports = { decodeRequestPathname, parseRequestUrl };
