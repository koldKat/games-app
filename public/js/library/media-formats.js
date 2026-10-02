const TRACKED_FORMATS = Object.freeze(['physical', 'digital']);

export function mediaFormats(game = {}) {
  if (game.formatPhysical != null || game.formatDigital != null) {
    return TRACKED_FORMATS.filter(format => Boolean(game[format === 'physical' ? 'formatPhysical' : 'formatDigital']));
  }
  if (game.mediaFormat === 'both') return [...TRACKED_FORMATS];
  return TRACKED_FORMATS.includes(game.mediaFormat) ? [game.mediaFormat] : [];
}

export function hasMediaFormat(game, format) { return mediaFormats(game).includes(format); }

export function mediaFormatLabel(game, labels = {}) {
  const formats = mediaFormats(game);
  if (formats.length === 2) return labels.both || 'Physical + digital';
  return formats.length ? labels[formats[0]] || formats[0] : labels.unknown || 'Unknown';
}

export function setMediaFormatInputs(game, physicalInput, digitalInput) {
  const formats = game ? mediaFormats(game) : ['physical'];
  physicalInput.checked = formats.includes('physical');
  digitalInput.checked = formats.includes('digital');
}

export function selectedMediaFormats(physicalInput, digitalInput) {
  return [physicalInput.checked && 'physical', digitalInput.checked && 'digital'].filter(Boolean);
}
