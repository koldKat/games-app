'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'cover-result-images.js'), 'utf8');

async function fallbackModule() {
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

function fakeImage({ complete = false, naturalWidth = 0 } = {}) {
  return {
    dataset: { coverImageIndex: '0' }, complete, naturalWidth, src: 'https://cdn.example/small.jpg', listener: null,
    addEventListener(type, listener) { if (type === 'error') this.listener = listener; },
    removeEventListener(type, listener) { if (type === 'error' && this.listener === listener) this.listener = null; },
    removeAttribute(name) { if (name === 'data-cover-image-index') delete this.dataset.coverImageIndex; },
  };
}

test('cover result thumbnails retry the provider original without inline handlers', () => {
  assert.match(source, /image\.addEventListener\('error'/);
  assert.match(source, /image\.src = result\.url/);
  assert.doesNotMatch(source, /onerror\s*=/);
});

test('a thumbnail failure after binding switches to the provider original', async () => {
  const { bindCoverResultFallbacks } = await fallbackModule(); const image = fakeImage();
  bindCoverResultFallbacks({ querySelectorAll: () => [image] }, [{ thumbnailUrl: image.src, url: 'https://cdn.example/original.jpg' }]);
  image.listener();
  assert.equal(image.src, 'https://cdn.example/original.jpg');
  assert.equal(image.dataset.coverImageIndex, undefined);
});

test('a cached thumbnail failure that completed before binding recovers immediately', async () => {
  const { bindCoverResultFallbacks } = await fallbackModule(); const image = fakeImage({ complete: true });
  bindCoverResultFallbacks({ querySelectorAll: () => [image] }, [{ thumbnailUrl: image.src, url: 'https://cdn.example/original.jpg' }]);
  assert.equal(image.src, 'https://cdn.example/original.jpg');
  assert.equal(image.listener, null);
});
