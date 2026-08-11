const fs = require('node:fs');
const path = require('node:path');

const VERSION_FILE = process.env.VERSION_FILE || path.join(__dirname, '..', 'VERSION');
const FALLBACK_VERSION = 'dev';

function readVersion() {
  try { return fs.readFileSync(VERSION_FILE, 'utf8').trim() || FALLBACK_VERSION; }
  catch { return FALLBACK_VERSION; }
}

function normalizeVersion(value) {
  const version = String(value ?? '').trim();
  if (!version) throw new Error('Version cannot be empty.');
  if (version.length > 80) throw new Error('Version must be 80 characters or fewer.');
  if (/\r|\n/.test(version)) throw new Error('Version must be a single line.');
  return version;
}

function writeVersion(value) {
  const version = normalizeVersion(value);
  const temporary = `${VERSION_FILE}.tmp`;
  fs.writeFileSync(temporary, `${version}\n`, { encoding: 'utf8', mode: 0o644 });
  fs.renameSync(temporary, VERSION_FILE);
  return version;
}

module.exports = { VERSION_FILE, readVersion, normalizeVersion, writeVersion };
