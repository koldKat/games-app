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

test('common filters never move the viewport', () => {
  const application = read('public/app.js');
  assert.doesNotMatch(application, /scrollIntoView|scrollTo\s*\(/);
});

test('cover processing uses compact text with a themed detail tooltip', () => {
  const application = read('public/app.js'); const css = read('public/style.css');
  assert.match(application, /Scanning \$\{job\.processed\.toLocaleString\(\)\}\/\$\{job\.total\.toLocaleString\(\)\}/);
  assert.match(application, /bulkStatus\.dataset\.tooltip = detail/);
  assert.match(css, /#cover-bulk-status:after\{content:attr\(data-tooltip\)/);
});

test('the product wordmark uses middle dots and no header cat artwork', () => {
  const html = read('public/index.html'); const css = read('public/style.css');
  assert.match(html, /Game Kat·a·log/);
  assert.doesNotMatch(html, /header-kat|header-kat\.svg/);
  assert.doesNotMatch(css, /\.header-kat/);
});

test('generated documentation highlights the section currently in view', () => {
  const generator = read('scripts/generate-docs.js');
  assert.match(generator, /\.toc a\.active/);
  assert.match(generator, /aria-current/);
  assert.match(generator, /getBoundingClientRect\(\)\.top<=72/);
});
