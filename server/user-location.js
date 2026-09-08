'use strict';

const { isIP } = require('node:net');
const geoip = require('geoip-lite');
const { db } = require('./db');

const LOCATION_REFRESH_SECONDS = 10 * 60;
const CITY_MAX_LENGTH = 160;

function cleanCountry(value) {
  const country = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

function cleanCity(value) {
  return String(value || '').trim().slice(0, CITY_MAX_LENGTH) || null;
}

function lookup(ip, resolver = geoip.lookup) {
  const address = String(ip || '').trim().replace(/^::ffff:/i, '');
  if (!isIP(address)) return null;
  let result;
  try { result = resolver(address); }
  catch { return null; }
  if (!result) return null;
  const country = cleanCountry(result.country);
  const city = cleanCity(result.city);
  return country || city ? { country, city } : null;
}

function record(userId, ip, { force = false, resolver = geoip.lookup, now = Math.floor(Date.now() / 1000) } = {}) {
  const account = db.prepare('SELECT location_updated_at AS updatedAt FROM users WHERE id=?').get(Number(userId));
  if (!account || (!force && account.updatedAt && now - Number(account.updatedAt) < LOCATION_REFRESH_SECONDS)) return false;
  try {
    const location = lookup(ip, resolver);
    db.prepare('UPDATE users SET last_country=?, last_city=?, location_updated_at=? WHERE id=?')
      .run(location?.country || null, location?.city || null, now, Number(userId));
    return true;
  } catch { return false; }
}

module.exports = { CITY_MAX_LENGTH, LOCATION_REFRESH_SECONDS, cleanCity, cleanCountry, lookup, record };
