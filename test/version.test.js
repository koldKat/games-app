const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const versionPath = path.join('/tmp', `games-version-test-${process.pid}`);
process.env.VERSION_FILE = versionPath;
const version = require('../server/version');

test.after(() => fs.rmSync(versionPath, { force: true }));

test('version strings persist verbatim after surrounding whitespace is trimmed', () => {
  assert.equal(version.readVersion(), 'dev');
  assert.equal(version.writeVersion('  night-shift / beta 2  '), 'night-shift / beta 2');
  assert.equal(fs.readFileSync(versionPath, 'utf8'), 'night-shift / beta 2\n');
  assert.equal(version.readVersion(), 'night-shift / beta 2');
});

test('version validation rejects empty, multiline, and oversized values', () => {
  assert.throws(() => version.normalizeVersion('  '), /cannot be empty/);
  assert.throws(() => version.normalizeVersion('one\ntwo'), /single line/);
  assert.throws(() => version.normalizeVersion('x'.repeat(81)), /80 characters/);
});
