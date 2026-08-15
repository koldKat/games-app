const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', 'public');
const read = filename => fs.readFileSync(path.join(publicDir, filename), 'utf8');

test('landing page publishes canonical, social, and structured metadata', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="canonical" href="https:\/\/gamekat\.net\/">/);
  assert.match(html, /property="og:image" content="https:\/\/gamekat\.net\/social-preview\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /type="application\/ld\+json"/);
  assert.match(html, /"@type": "WebApplication"/);
  assert.match(html, /"applicationCategory": "UtilitiesApplication"/);
  assert.match(html, /"sameAs": "https:\/\/github\.com\/koldKat\/games-app"/);
  assert.match(html, /"softwareHelp": \{ "@type": "WebPage", "url": "https:\/\/gamekat\.net\/docs\/user-guide\.html" \}/);
  assert.match(html, /Cross-device account preferences/);
  assert.match(html, /PEGI-assisted ratings and metadata/);
  assert.match(html, /HowLongToBeat playtime estimates/);
  assert.match(html, /name="description" content="[^"]{100,170}"/);
});

test('landing feature copy reflects the current product surface', () => {
  const html = read('index.html'); const manifest = JSON.parse(read('manifest.webmanifest'));
  for (const phrase of ['Every system', 'Interrogate the shelf', 'Ratings and runtimes', 'missing covers', 'Your view follows you', 'Scan without babysitting']) {
    assert.match(html, new RegExp(phrase));
  }
  assert.match(manifest.description, /multi-platform.*metadata.*playtime/i);
});

test('public product copy exposes only owned and wishlisted collection states', () => {
  const html = read('index.html');
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  assert.match(html, /Track owned and wishlisted games—physical or digital/);
  assert.doesNotMatch(html, />Unavailable<|value="unavailable"|availability/i);
  assert.doesNotMatch(readme, /wishlist, availability|Ownership, wishlist, availability/i);
});

test('crawler files expose the landing page without indexing private surfaces', () => {
  const robots = read('robots.txt');
  const sitemap = read('sitemap.xml');
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/admin\//);
  assert.match(robots, /Sitemap: https:\/\/gamekat\.net\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/gamekat\.net\/<\/loc>/);
  assert.equal((sitemap.match(/<loc>/g) || []).length, 2);
});

test('social and install assets have production dimensions', () => {
  const pngDimensions = filename => {
    const buffer = fs.readFileSync(path.join(publicDir, filename));
    assert.equal(buffer.subarray(1, 4).toString(), 'PNG');
    return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
  };
  assert.deepEqual(pngDimensions('social-preview.png'), [1200, 630]);
  assert.deepEqual(pngDimensions('icon-192.png'), [192, 192]);
  assert.deepEqual(pngDimensions('icon-512.png'), [512, 512]);
});
