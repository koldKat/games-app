// Only public application views can be resumed after authentication.
export function publicAuthReturn(value, origin) {
  if (!value || !String(value).startsWith('/') || String(value).startsWith('//')) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || !/^\/(?:katalog|signal|forum(?:\/.*)?|game\/[^/]+)$/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}
