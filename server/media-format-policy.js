'use strict';

const OWNED_MEDIA_FORMATS = Object.freeze(['physical', 'digital']);

function selectedMediaFormats(input = {}) {
  let requested;
  if (Array.isArray(input.mediaFormats)) requested = input.mediaFormats;
  else if (input.mediaFormat === 'both') requested = OWNED_MEDIA_FORMATS;
  else requested = [input.mediaFormat || 'physical'];
  const selected = new Set(requested.map(value => String(value || '').toLowerCase()).filter(value => OWNED_MEDIA_FORMATS.includes(value)));
  return OWNED_MEDIA_FORMATS.filter(value => selected.has(value));
}

function normalizeMediaFormats(input = {}) {
  const mediaFormats = selectedMediaFormats(input);
  const formatPhysical = mediaFormats.includes('physical') ? 1 : 0;
  const formatDigital = mediaFormats.includes('digital') ? 1 : 0;
  const mediaFormat = formatPhysical ? 'physical' : formatDigital ? 'digital' : 'unknown';
  return { mediaFormat, mediaFormats, formatPhysical, formatDigital };
}

function mediaFormatsForGame(game = {}) {
  if (game.formatPhysical != null || game.formatDigital != null) {
    return OWNED_MEDIA_FORMATS.filter(format => Boolean(game[format === 'physical' ? 'formatPhysical' : 'formatDigital']));
  }
  return selectedMediaFormats(game);
}

module.exports = { OWNED_MEDIA_FORMATS, mediaFormatsForGame, normalizeMediaFormats, selectedMediaFormats };
