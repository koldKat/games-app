'use strict';

const { APP_USER_AGENT } = require('./constants');

const API_ROOT = 'https://api.steampowered.com';
const REQUEST_TIMEOUT_MS = 20_000;
const STEAM_ID_RE = /^7656119\d{10}$/;
const VANITY_RE = /^[A-Za-z0-9_-]{2,64}$/;

function apiError(message, status = 502) {
  return Object.assign(new Error(message), { status });
}

function cleanApiKey(value) {
  const key = String(value || '').trim();
  if (!/^[A-Fa-f0-9]{32}$/.test(key)) throw apiError('Enter a valid 32-character Steam Web API key.', 400);
  return key;
}

function profileReference(value) {
  const input = String(value || '').trim();
  if (!input || input.length > 200) throw apiError('Enter a Steam profile URL, custom name, or SteamID64.', 400);
  if (STEAM_ID_RE.test(input)) return { steamId: input, vanity: '' };
  let path = input;
  try {
    if (/^https?:\/\//i.test(input)) {
      const url = new URL(input);
      if (!/(^|\.)steamcommunity\.com$/i.test(url.hostname)) throw new Error('host');
      path = url.pathname;
    }
  } catch { throw apiError('Enter a valid Steam Community profile URL.', 400); }
  const profile = path.match(/(?:^|\/)profiles\/(7656119\d{10})(?:\/|$)/i);
  if (profile) return { steamId: profile[1], vanity: '' };
  const vanity = path.match(/(?:^|\/)id\/([^/?#]+)(?:\/|$)/i)?.[1] || (!path.includes('/') ? path : '');
  if (!VANITY_RE.test(vanity)) throw apiError('Steam custom profile names may contain letters, numbers, underscores, and hyphens.', 400);
  return { steamId: '', vanity };
}

async function fetchJson(pathname, search, fetchImpl = global.fetch) {
  const url = new URL(pathname, API_ROOT);
  for (const [key, value] of Object.entries(search)) url.searchParams.set(key, String(value));
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': APP_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }
  catch { throw apiError('Steam is temporarily unavailable. Try again shortly.'); }
  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? 400 : 502;
    throw apiError(response.status === 401 || response.status === 403
      ? 'Steam rejected the configured Web API key.' : `Steam returned HTTP ${response.status}.`, status);
  }
  try { return await response.json(); }
  catch { throw apiError('Steam returned an unreadable response.'); }
}

async function verify(apiKey, fetchImpl) {
  const key = cleanApiKey(apiKey);
  await fetchJson('/ISteamWebAPIUtil/GetSupportedAPIList/v1/', { key }, fetchImpl);
  return { apiKey: key };
}

async function resolveSteamId(apiKey, reference, fetchImpl) {
  const parsed = profileReference(reference);
  if (parsed.steamId) return parsed.steamId;
  const body = await fetchJson('/ISteamUser/ResolveVanityURL/v1/', { key: cleanApiKey(apiKey), vanityurl: parsed.vanity }, fetchImpl);
  const result = body?.response;
  if (Number(result?.success) !== 1 || !STEAM_ID_RE.test(String(result?.steamid || ''))) {
    throw apiError('Steam could not find that custom profile name.', 404);
  }
  return String(result.steamid);
}

async function player(apiKey, reference, fetchImpl) {
  const key = cleanApiKey(apiKey);
  const steamId = await resolveSteamId(key, reference, fetchImpl);
  const body = await fetchJson('/ISteamUser/GetPlayerSummaries/v2/', { key, steamids: steamId }, fetchImpl);
  const row = body?.response?.players?.[0];
  if (!row) throw apiError('Steam profile not found.', 404);
  return {
    steamId,
    personaName: String(row.personaname || '').trim().slice(0, 120),
    profileUrl: String(row.profileurl || `https://steamcommunity.com/profiles/${steamId}/`).trim(),
  };
}

async function ownedGames(apiKey, steamId, fetchImpl) {
  const key = cleanApiKey(apiKey);
  if (!STEAM_ID_RE.test(String(steamId || ''))) throw apiError('The connected SteamID64 is invalid.', 400);
  const body = await fetchJson('/IPlayerService/GetOwnedGames/v1/', {
    key, steamid: steamId, include_appinfo: 1, include_played_free_games: 1, format: 'json',
  }, fetchImpl);
  const payload = body?.response || {};
  if (!Object.hasOwn(payload, 'game_count') && !Array.isArray(payload.games)) {
    throw apiError('Steam did not expose this library. Set Game details to Public in Steam privacy settings and try again.', 403);
  }
  return (Array.isArray(payload.games) ? payload.games : []).map(game => ({
    appId: Number(game.appid),
    title: String(game.name || '').trim().slice(0, 220),
    playtimeMinutes: Math.max(0, Number.parseInt(game.playtime_forever, 10) || 0),
    lastPlayedAt: Number(game.rtime_last_played) > 0 ? new Date(Number(game.rtime_last_played) * 1000).toISOString() : null,
  })).filter(game => Number.isInteger(game.appId) && game.appId > 0 && game.title)
    .sort((left, right) => left.title.localeCompare(right.title, 'en-US', { sensitivity: 'base', numeric: true }));
}

module.exports = { cleanApiKey, ownedGames, player, profileReference, resolveSteamId, verify };
