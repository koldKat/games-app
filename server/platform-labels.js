'use strict';

const PLATFORM_DISPLAY_NAMES = Object.freeze({
  'Nintendo Entertainment System': 'NES',
  'Super Nintendo Entertainment System': 'SNES',
});

function platformDisplayName(platform) {
  const value = String(platform || '').trim();
  return PLATFORM_DISPLAY_NAMES[value] || value;
}

module.exports = { PLATFORM_DISPLAY_NAMES, platformDisplayName };
