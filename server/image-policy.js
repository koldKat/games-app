'use strict';

const sharp = require('sharp');

const IMAGE_MAX_BYTES = 256 * 1024;
const COVER_MAX_DIMENSION = 900;
const AVATAR_DIMENSION = 512;
const JPEG_QUALITIES = Object.freeze([88, 80, 72, 64, 56, 48, 40, 32, 24]);

async function jpegWithinLimit(input, resize) {
  let dimension = resize.width;
  while (dimension >= 192) {
    for (const quality of JPEG_QUALITIES) {
      const image = await sharp(input, { failOn: 'error', limitInputPixels: 64_000_000 })
        .rotate()
        .resize({ ...resize, width: dimension, height: dimension })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (image.length <= IMAGE_MAX_BYTES) return image;
    }
    if (resize.fit === 'cover') break;
    dimension = Math.floor(dimension * 0.85);
  }
  throw new Error('Could not compress image below 256 KB.');
}

function processCover(input) {
  return jpegWithinLimit(input, {
    width: COVER_MAX_DIMENSION,
    height: COVER_MAX_DIMENSION,
    fit: 'inside',
    withoutEnlargement: true,
  });
}

function processAvatar(input) {
  return jpegWithinLimit(input, {
    width: AVATAR_DIMENSION,
    height: AVATAR_DIMENSION,
    fit: 'cover',
    position: 'centre',
  });
}

module.exports = { AVATAR_DIMENSION, COVER_MAX_DIMENSION, IMAGE_MAX_BYTES, processAvatar, processCover };
