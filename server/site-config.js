'use strict';

const APP_NAME = 'Game Kat·a·log';
const APP_NAME_UPPER = 'GAME KAT·A·LOG';
const APP_NAME_ASCII = 'Game Kat-a-log';
const DEFAULT_PUBLIC_URL = 'https://gamekat.net';
const PUBLIC_URL = String(process.env.PUBLIC_URL || DEFAULT_PUBLIC_URL).trim().replace(/\/+$/, '');
const OWNER_USERNAME = String(process.env.OWNER_USERNAME || '').trim();
const COPYRIGHT_START_YEAR = 2026;

function publicHostname() {
  try { return new URL(PUBLIC_URL).hostname; }
  catch { return 'localhost'; }
}

module.exports = Object.freeze({
  APP_NAME,
  APP_NAME_ASCII,
  APP_NAME_UPPER,
  COPYRIGHT_START_YEAR,
  DEFAULT_PUBLIC_URL,
  OWNER_USERNAME,
  PUBLIC_HOSTNAME: publicHostname(),
  PUBLIC_URL,
});
