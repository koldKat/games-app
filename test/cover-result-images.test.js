'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'cover-result-images.js'), 'utf8');

test('cover result thumbnails retry the provider original without inline handlers', () => {
  assert.match(source, /image\.addEventListener\('error'/);
  assert.match(source, /image\.src = result\.url/);
  assert.doesNotMatch(source, /onerror\s*=/);
});
