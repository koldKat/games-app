'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const steam = require('../server/steam-store');

test('Steam Store bulk lookup fetches only one unique exact title', async () => {
  const originalFetch = global.fetch; const calls = [];
  global.fetch = async url => {
    const parsed = new URL(String(url)); calls.push(parsed);
    if (parsed.pathname === '/api/storesearch/') return new Response(JSON.stringify({ items: [{ id: 1, name: 'Exact Game' }, { id: 2, name: 'Exact Game Demo' }] }), { status: 200 });
    return new Response(JSON.stringify({ 1: { success: true, data: { name: 'Exact Game', short_description: 'A game.' } } }), { status: 200 });
  };
  try {
    const result = await steam.bestExactDescription('exact game');
    assert.equal(result.description, 'A game.'); assert.equal(calls.length, 2); assert.equal(calls[1].searchParams.get('appids'), '1');
  } finally { global.fetch = originalFetch; }
});

test('Steam Store manual lookup retains successful details when another result fails', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/storesearch/') return new Response(JSON.stringify({ items: [{ id: 1, name: 'Working' }, { id: 2, name: 'Broken' }] }), { status: 200 });
    if (parsed.searchParams.get('appids') === '2') return new Response('', { status: 503 });
    return new Response(JSON.stringify({ 1: { success: true, data: { name: 'Working', short_description: 'Still available.' } } }), { status: 200 });
  };
  try { assert.deepEqual((await steam.searchDescriptions('work')).map(result => result.gameTitle), ['Working']); }
  finally { global.fetch = originalFetch; }
});

test('Steam Store manual lookup reports a provider failure when every detail request fails', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/storesearch/') return new Response(JSON.stringify({ items: [{ id: 1, name: 'Broken' }] }), { status: 200 });
    return new Response('', { status: 503 });
  };
  try { await assert.rejects(() => steam.searchDescriptions('broken'), /503/); }
  finally { global.fetch = originalFetch; }
});
