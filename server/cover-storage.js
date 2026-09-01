'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { APP_USER_AGENT } = require('./constants');
const { COVER_MAX_DIMENSION, IMAGE_MAX_BYTES, processCover } = require('./image-policy');

const COVER_DIR = process.env.COVER_DIR || path.join(__dirname, '..', 'public', 'covers');
const PUBLIC_PREFIX = '/covers/';
const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_REDIRECTS = 3;
const ALLOWED_HOST_SUFFIXES = Object.freeze(['.steamgriddb.com', '.thegamesdb.net']);
const ALLOWED_HOSTS = Object.freeze(['howlongtobeat.com']);

function allowedRemoteUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const hostname = url.hostname.toLocaleLowerCase();
    return url.protocol === 'https:' && (ALLOWED_HOSTS.includes(hostname) || ALLOWED_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix)));
  } catch { return false; }
}

function localFilename(value) {
  const match = String(value || '').match(/^\/covers\/([a-f0-9]{32}\.(?:jpg|png|webp))$/);
  return match?.[1] || '';
}

function imageExtension(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return '';
}

async function responseBuffer(response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_SOURCE_IMAGE_BYTES) throw new Error('Cover source exceeds the 12 MB processing limit.');
  if (!response.body) throw new Error('Cover provider returned an empty response.');
  const reader = response.body.getReader(); const chunks = []; let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_SOURCE_IMAGE_BYTES) { await reader.cancel(); throw new Error('Cover source exceeds the 12 MB processing limit.'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, bytes);
}

async function storeRemote(remoteUrl) {
  if (!allowedRemoteUrl(remoteUrl)) throw new Error('That cover is not hosted by a supported artwork provider.');
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS); let currentUrl = String(remoteUrl); let response;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    response = await fetch(currentUrl, { headers: { Accept: 'image/jpeg,image/png,image/webp', 'User-Agent': APP_USER_AGENT },
      redirect: 'manual', signal });
    if (response.status < 300 || response.status >= 400) break;
    if (redirects === MAX_REDIRECTS) throw new Error('Cover download followed too many redirects.');
    const location = response.headers.get('location');
    const nextUrl = location ? new URL(location, currentUrl).href : '';
    if (!allowedRemoteUrl(nextUrl)) throw new Error('Cover download redirected outside the supported provider.');
    currentUrl = nextUrl;
  }
  if (!response.ok) throw new Error(`Cover download returned HTTP ${response.status}.`);
  const source = await responseBuffer(response); const extension = imageExtension(source);
  if (!extension) throw new Error('Cover provider did not return a supported JPEG, PNG, or WebP image.');
  let image;
  try { image = await processCover(source); }
  catch { throw new Error('Cover provider returned an invalid or unprocessable image.'); }
  fs.mkdirSync(COVER_DIR, { recursive: true });
  const filename = `${crypto.randomBytes(16).toString('hex')}.jpg`;
  const temporary = path.join(COVER_DIR, `.${filename}.${process.pid}.tmp`); const destination = path.join(COVER_DIR, filename);
  try { await fs.promises.writeFile(temporary, image, { flag: 'wx', mode: 0o644 }); await fs.promises.rename(temporary, destination); }
  catch (error) { await fs.promises.unlink(temporary).catch(() => {}); throw error; }
  return `${PUBLIC_PREFIX}${filename}`;
}

async function normalizeExistingCovers(data, { onStored = () => {}, onError = () => {} } = {}) {
  const rows = data.gamesWithLocalCovers(); let stored = 0; let skipped = 0; let failed = 0;
  for (const row of rows) {
    const filename = localFilename(row.coverUrl); const sourcePath = filename && path.join(COVER_DIR, filename); let newUrl = '';
    try {
      if (!sourcePath) throw new Error('Saved cover URL is invalid.');
      if (!fs.existsSync(sourcePath)) throw new Error('Saved cover file is missing.');
      const source = await fs.promises.readFile(sourcePath);
      const metadata = await sharp(source).metadata();
      if (path.extname(filename) === '.jpg' && source.length <= IMAGE_MAX_BYTES && metadata.format === 'jpeg'
        && metadata.width <= COVER_MAX_DIMENSION && metadata.height <= COVER_MAX_DIMENSION) {
        skipped++; continue;
      }
      const image = await processCover(source);
      const newFilename = `${crypto.randomBytes(16).toString('hex')}.jpg`;
      const temporary = path.join(COVER_DIR, `.${newFilename}.${process.pid}.tmp`);
      const destination = path.join(COVER_DIR, newFilename);
      try { await fs.promises.writeFile(temporary, image, { flag: 'wx', mode: 0o644 }); await fs.promises.rename(temporary, destination); }
      catch (error) { await fs.promises.unlink(temporary).catch(() => {}); throw error; }
      newUrl = `${PUBLIC_PREFIX}${newFilename}`;
      const game = data.replaceGameCoverUrl(row.userId, row.id, row.coverUrl, newUrl);
      if (!game) { removeLocal(newUrl); continue; }
      if (!data.coverUrlReferenceCount(row.coverUrl)) removeLocal(row.coverUrl);
      stored++; onStored(row.userId, game);
    } catch (error) { if (newUrl) removeLocal(newUrl); failed++; onError(row, error); }
  }
  return { total: rows.length, stored, skipped, failed };
}

function removeLocal(publicUrl) {
  const filename = localFilename(publicUrl); if (!filename) return false;
  try { fs.unlinkSync(path.join(COVER_DIR, filename)); return true; }
  catch { return false; }
}

async function localizeExistingCovers(data, { onStored = () => {}, onError = () => {}, delayMs = 75 } = {}) {
  const rows = data.gamesWithRemoteCovers(); let stored = 0; let failed = 0;
  for (const row of rows) {
    let localUrl = '';
    try {
      localUrl = await storeRemote(row.coverUrl);
      const game = data.replaceGameCoverUrl(row.userId, row.id, row.coverUrl, localUrl);
      if (!game) { removeLocal(localUrl); continue; }
      stored++; onStored(row.userId, game);
    } catch (error) { if (localUrl) removeLocal(localUrl); failed++; onError(row, error); }
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return { total: rows.length, stored, failed };
}

module.exports = { ALLOWED_HOSTS, ALLOWED_HOST_SUFFIXES, COVER_DIR, IMAGE_MAX_BYTES, MAX_REDIRECTS, MAX_SOURCE_IMAGE_BYTES, allowedRemoteUrl, imageExtension,
  localFilename, localizeExistingCovers, normalizeExistingCovers, removeLocal, storeRemote };
