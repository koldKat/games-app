const LOCAL_COVER = /^\/covers\/[a-f0-9]{32}\.(?:jpg|png|webp)$/i;

export function isArtworkUrl(value) {
  const url = String(value || '');
  return /^https:\/\//i.test(url) || LOCAL_COVER.test(url);
}

export function uniqueArtworkUrls(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(isArtworkUrl))];
}
