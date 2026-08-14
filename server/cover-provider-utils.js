'use strict';

const crypto = require('node:crypto');
const { PC_STOREFRONT_VALUES } = require('./constants');

const normalize = value => String(value || '').replace(/[™®©]/g, '').normalize('NFKD').replace(/\p{M}/gu, '')
  .toLocaleLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const fingerprint = credentials => crypto.createHash('sha256').update(JSON.stringify(credentials || {})).digest('hex').slice(0, 16);
const pcStorefrontKeys = new Set(PC_STOREFRONT_VALUES.map(normalize));

const PLATFORM_ALIASES = Object.freeze({
  pc: 'windows', 'pc windows': 'windows', 'pc microsoft windows': 'windows', 'microsoft windows': 'windows',
  'pc linux': 'linux', macos: 'macintosh', 'xbox series x s': 'xbox series',
  'nintendo entertainment system': 'nes', 'super nintendo entertainment system': 'snes',
  'sega genesis mega drive': 'genesis', 'playstation portable': 'psp',
});

function platformKey(value) {
  const key = normalize(value);
  if (pcStorefrontKeys.has(key)) return 'windows';
  return PLATFORM_ALIASES[key] || key.replace(/^(?:sony|nintendo|microsoft|sega)\s+/, '');
}

function matchesPlatform(wanted, candidates) {
  const key = platformKey(wanted);
  return !key || (Array.isArray(candidates) ? candidates : []).some(candidate => platformKey(candidate) === key);
}

function exactTitleMatches(title, results) {
  const wanted = normalize(title);
  return (Array.isArray(results) ? results : []).filter(result => normalize(result.gameTitle || result.title) === wanted);
}
function oneExactGameCover(title, results) {
  const exact = exactTitleMatches(title, results); const games = new Map();
  for (const result of exact) if (!games.has(result.providerGameId)) games.set(result.providerGameId, result);
  return games.size === 1 ? games.values().next().value : null;
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

module.exports = { exactTitleMatches, fingerprint, matchesPlatform, normalize, oneExactGameCover, platformKey, wait };
