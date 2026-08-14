'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const policy = require('../server/image-policy');

test('cover processing creates a JPEG within the 900 px and 256 KiB policy', async () => {
  const source = await sharp({ create: { width: 1800, height: 2700, channels: 3, background: '#20775f' } }).png().toBuffer();
  const result = await policy.processCover(source);
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.ok(Math.max(metadata.width, metadata.height) <= policy.COVER_MAX_DIMENSION);
  assert.ok(result.length <= policy.IMAGE_MAX_BYTES);
});

test('avatar processing creates a 512 square JPEG within 256 KiB', async () => {
  const source = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#20775f' } }).png().toBuffer();
  const result = await policy.processAvatar(source);
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, policy.AVATAR_DIMENSION);
  assert.equal(metadata.height, policy.AVATAR_DIMENSION);
  assert.ok(result.length <= policy.IMAGE_MAX_BYTES);
});
