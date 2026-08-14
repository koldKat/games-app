'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const coverDir = path.join('/tmp', `games-cover-storage-test-${process.pid}`);
process.env.COVER_DIR = coverDir;
const storage = require('../server/cover-storage');

test.after(() => fs.rmSync(coverDir, { recursive: true, force: true }));

test('provider images are signature-checked and stored at public immutable paths', async () => {
  const originalFetch = global.fetch;
  const source = await sharp({ create: { width: 1200, height: 1800, channels: 3, background: '#1d8066' } }).jpeg({ quality: 95 }).toBuffer();
  global.fetch = async () => new Response(source, {
    status: 200, headers: { 'Content-Type': 'image/jpeg' },
  });
  try {
    const publicUrl = await storage.storeRemote('https://cdn2.steamgriddb.com/grid/example.jpg');
    assert.match(publicUrl, /^\/covers\/[a-f0-9]{32}\.jpg$/);
    const stored = fs.readFileSync(path.join(coverDir, path.basename(publicUrl)));
    const metadata = await sharp(stored).metadata();
    assert.ok(stored.length <= 256 * 1024);
    assert.ok(Math.max(metadata.width, metadata.height) <= 900);
    assert.equal(storage.removeLocal(publicUrl), true);
  } finally { global.fetch = originalFetch; }
});

test('storage rejects arbitrary hosts and non-image responses', async () => {
  await assert.rejects(() => storage.storeRemote('https://example.com/not-allowed.jpg'), /not hosted by a supported/);
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('not an image', { status: 200 });
  try { await assert.rejects(() => storage.storeRemote('https://cdn.thegamesdb.net/fake.jpg'), /supported JPEG, PNG, or WebP/); }
  finally { global.fetch = originalFetch; }
});

test('storage validates a redirect target before requesting it', async () => {
  const originalFetch = global.fetch; const calls = [];
  global.fetch = async url => {
    calls.push(String(url));
    return new Response(null, { status: 302, headers: { Location: 'https://example.com/untrusted.jpg' } });
  };
  try {
    await assert.rejects(() => storage.storeRemote('https://cdn.thegamesdb.net/redirect.jpg'), /redirected outside/);
    assert.deepEqual(calls, ['https://cdn.thegamesdb.net/redirect.jpg']);
  } finally { global.fetch = originalFetch; }
});

test('existing remote covers migrate through a compare-and-swap database update', async () => {
  const originalFetch = global.fetch; const updates = [];
  const source = await sharp({ create: { width: 400, height: 600, channels: 4, background: '#1d8066' } }).png().toBuffer();
  global.fetch = async () => new Response(source, { status: 200 });
  const data = {
    gamesWithRemoteCovers: () => [{ id: 4, userId: 2, coverUrl: 'https://cdn.thegamesdb.net/cover.png' }],
    replaceGameCoverUrl: (userId, id, expected, localUrl) => { updates.push({ userId, id, expected, localUrl }); return { id, coverUrl: localUrl }; },
  };
  try {
    const result = await storage.localizeExistingCovers(data, { delayMs: 0 });
    assert.deepEqual(result, { total: 1, stored: 1, failed: 0 });
    assert.match(updates[0].localUrl, /^\/covers\/[a-f0-9]{32}\.jpg$/);
    storage.removeLocal(updates[0].localUrl);
  } finally { global.fetch = originalFetch; }
});

test('existing local covers normalize MIME-mismatched paths and remove the replaced file', async () => {
  fs.mkdirSync(coverDir, { recursive: true });
  const oldFilename = `${'a'.repeat(32)}.png`;
  const oldUrl = `/covers/${oldFilename}`;
  const source = await sharp({ create: { width: 400, height: 600, channels: 3, background: '#1d8066' } }).jpeg().toBuffer();
  fs.writeFileSync(path.join(coverDir, oldFilename), source);
  let replacement = '';
  const data = {
    gamesWithLocalCovers: () => [{ id: 9, userId: 3, coverUrl: oldUrl }],
    replaceGameCoverUrl: (userId, id, expected, localUrl) => { replacement = localUrl; return { id, coverUrl: localUrl }; },
    coverUrlReferenceCount: () => 0,
  };
  const result = await storage.normalizeExistingCovers(data);
  assert.deepEqual(result, { total: 1, stored: 1, skipped: 0, failed: 0 });
  assert.match(replacement, /^\/covers\/[a-f0-9]{32}\.jpg$/);
  assert.equal(fs.existsSync(path.join(coverDir, oldFilename)), false);
  assert.equal(fs.existsSync(path.join(coverDir, path.basename(replacement))), true);
  storage.removeLocal(replacement);
});

test('missing local cover files are reported as failures', async () => {
  const errors = [];
  const data = {
    gamesWithLocalCovers: () => [{ id: 10, userId: 3, coverUrl: `/covers/${'b'.repeat(32)}.jpg` }],
    replaceGameCoverUrl: () => null,
    coverUrlReferenceCount: () => 0,
  };
  const result = await storage.normalizeExistingCovers(data, { onError: (game, error) => errors.push({ game, error }) });
  assert.deepEqual(result, { total: 1, stored: 0, skipped: 0, failed: 1 });
  assert.match(errors[0].error.message, /file is missing/);
});
