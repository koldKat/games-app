'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const steam = require('../server/steam-library');

const KEY = '0123456789abcdef0123456789abcdef';

test('Steam profile references accept IDs, profile URLs, and vanity URLs', () => {
  assert.deepEqual(steam.profileReference('76561198000000000'), { steamId: '76561198000000000', vanity: '' });
  assert.deepEqual(steam.profileReference('https://steamcommunity.com/profiles/76561198000000000/'), { steamId: '76561198000000000', vanity: '' });
  assert.deepEqual(steam.profileReference('https://steamcommunity.com/id/kold-kat/'), { steamId: '', vanity: 'kold-kat' });
  assert.throws(() => steam.profileReference('https://example.com/id/not-steam'), /Steam Community/);
});

test('Steam resolves a vanity profile and reads an owned library', async () => {
  const requests = [];
  const fetchImpl = async url => {
    const parsed = new URL(String(url)); requests.push(parsed);
    if (parsed.pathname.includes('ResolveVanityURL')) return new Response(JSON.stringify({ response: { success: 1, steamid: '76561198000000000' } }));
    if (parsed.pathname.includes('GetPlayerSummaries')) return new Response(JSON.stringify({ response: { players: [{ steamid: '76561198000000000', personaname: 'Kat', profileurl: 'https://steamcommunity.com/id/kat/' }] } }));
    return new Response(JSON.stringify({ response: { game_count: 2, games: [
      { appid: 20, name: 'Second', playtime_forever: 90, rtime_last_played: 1_700_000_000 },
      { appid: 10, name: 'First', playtime_forever: 0 },
    ] } }));
  };
  const profile = await steam.player(KEY, 'kat', fetchImpl);
  const games = await steam.ownedGames(KEY, profile.steamId, fetchImpl);
  assert.equal(profile.personaName, 'Kat');
  assert.deepEqual(games.map(game => game.title), ['First', 'Second']);
  assert.equal(games[1].playtimeMinutes, 90);
  assert.equal(requests.at(-1).searchParams.get('include_appinfo'), '1');
  assert.ok(!requests.some(request => request.searchParams.get('key') !== KEY));
});

test('Steam reports private game details without leaking a provider response', async () => {
  await assert.rejects(() => steam.ownedGames(KEY, '76561198000000000', async () => new Response('{"response":{}}')), /Game details to Public/);
});
