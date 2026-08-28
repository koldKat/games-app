'use strict';

const { APP_USER_AGENT, TITLE_LOOKUP_MIN_LENGTH } = require('./constants');
const { normalize } = require('./cover-provider-utils');

const STORE_ROOT = 'https://store.steampowered.com';
const REQUEST_TIMEOUT_MS = 20_000;
const cleanText = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
async function request(pathname, parameters = {}) {
  const url = new URL(pathname, STORE_ROOT); for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': APP_USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(`Steam Store returned HTTP ${response.status}.`); error.status = response.status; throw error; }
  return body;
}
async function search(title) {
  const cleanTitle = String(title || '').trim(); if (cleanTitle.length < TITLE_LOOKUP_MIN_LENGTH) throw new Error('Enter at least two title characters.');
  const body = await request('/api/storesearch/', { term: cleanTitle, l: 'english', cc: 'us' });
  return Array.isArray(body.items) ? body.items.slice(0, 10) : [];
}
async function descriptionFor(item) {
  const body = await request('/api/appdetails/', { appids: item.id, l: 'english', cc: 'us' }); const data = body?.[item.id]?.success ? body[item.id].data : null;
  const description = cleanText(data?.short_description || data?.detailed_description); if (!description) return null;
  return { providerGameId: item.id, gameTitle: data?.name || item.name || '', description, source: 'Steam Store', sourceUrl: `${STORE_ROOT}/app/${item.id}/` };
}
async function searchDescriptions(title) {
  const items = await search(title); const details = await Promise.allSettled(items.map(descriptionFor));
  if (items.length && details.every(result => result.status === 'rejected')) throw details.find(result => result.status === 'rejected').reason;
  return details.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
}
async function bestExactDescription(title) {
  const exact = (await search(title)).filter(result => normalize(result.name) === normalize(title));
  return exact.length === 1 ? descriptionFor(exact[0]) : null;
}

module.exports = { bestExactDescription, cleanText, searchDescriptions };
