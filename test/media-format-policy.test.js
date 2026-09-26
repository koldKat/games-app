const test = require('node:test');
const assert = require('node:assert/strict');

const { mediaFormatsForGame, normalizeMediaFormats } = require('../server/media-format-policy');

test('media format policy accepts physical, digital, both, and unknown ownership', () => {
  assert.deepEqual(normalizeMediaFormats({ mediaFormat: 'physical' }), {
    mediaFormat: 'physical', mediaFormats: ['physical'], formatPhysical: 1, formatDigital: 0,
  });
  assert.deepEqual(normalizeMediaFormats({ mediaFormat: 'both' }), {
    mediaFormat: 'physical', mediaFormats: ['physical', 'digital'], formatPhysical: 1, formatDigital: 1,
  });
  assert.deepEqual(normalizeMediaFormats({ mediaFormats: [] }), {
    mediaFormat: 'unknown', mediaFormats: [], formatPhysical: 0, formatDigital: 0,
  });
  assert.deepEqual(mediaFormatsForGame({ formatPhysical: 1, formatDigital: 1, mediaFormat: 'physical' }), ['physical', 'digital']);
});
