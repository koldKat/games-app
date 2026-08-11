const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('destructive actions never invoke native browser dialogs', () => {
  const sources = ['public/app.js', 'admin/js/accounts.js', 'admin/js/catalogue.js', 'admin/js/tools.js', 'admin/js/core.js'];
  const nativeDialog = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
  for (const source of sources) assert.doesNotMatch(read(source), nativeDialog, source);
});

test('public and admin interfaces include themed confirmation dialogs', () => {
  assert.match(read('public/index.html'), /id="action-dialog" class="action-dialog"/);
  assert.match(read('admin/index.html'), /id="confirm-dialog" class="confirm-dialog"/);
  assert.match(read('admin/js/core.js'), /requiredText/);
});

test('authentication landing keeps a dense real-cover background', () => {
  const html = read('public/index.html');
  const field = html.match(/<div class="auth-cover-field"[\s\S]*?<\/div>/)?.[0] || '';
  assert.equal((field.match(/<i><\/i>/g) || []).length, 32);
});

test('login and registration use a stable authentication frame', () => {
  const css = read('public/style.css');
  assert.match(css, /\.auth-card\{height:510px\}/);
  assert.match(css, /\.auth-card \.auth-body\{height:calc\(100% - 31px\);overflow-y:auto/);
});

test('landing promo descriptions remain readable', () => {
  assert.match(read('public/style.css'), /\.auth-promo p\{font-size:12px;line-height:1\.5;color:#92a0ae\}/);
});
