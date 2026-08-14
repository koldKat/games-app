'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const policy = fs.readFileSync(path.join(root, 'public/js/artwork-url.js'), 'utf8');
const application = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const database = fs.readFileSync(path.join(root, 'server/db.js'), 'utf8');

test('decorative artwork accepts durable local covers on every app surface', async () => {
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(policy).toString('base64')}`;
  const { isArtworkUrl, uniqueArtworkUrls } = await import(moduleUrl);
  assert.equal(isArtworkUrl('/covers/0123456789abcdef0123456789abcdef.png'), true);
  assert.equal(isArtworkUrl('https://cdn.example/legacy.jpg'), true);
  assert.equal(isArtworkUrl('/avatars/not-a-cover.jpg'), false);
  assert.deepEqual(uniqueArtworkUrls(['/covers/0123456789abcdef0123456789abcdef.png', '/covers/0123456789abcdef0123456789abcdef.png']),
    ['/covers/0123456789abcdef0123456789abcdef.png']);
  assert.match(application, /const candidates = uniqueArtworkUrls\(covers\)/);
  assert.equal((application.match(/uniqueArtworkUrls\(state\.games\.map\(game => game\.coverUrl\)\)/g) || []).length, 2);
  assert.doesNotMatch(application, /coverUrl\)\.filter\(url => \/\^https/);
  assert.match(application, /fetch\(`\/cover-showcase\.json\?v=\$\{Date\.now\(\)\}`/);
  assert.match(database, /cover_url LIKE 'https:\/\/%' OR cover_url LIKE '\/covers\/%'/);
});
