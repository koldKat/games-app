'use strict';

const { normalizeKatalogText } = require('./katalog-policy');

const MAX_IMPORT_SELECTION = 5000;
const IMPORT_CHUNK_SIZE = 5;
const yieldToEventLoop = () => new Promise(resolve => setImmediate(resolve));

function createSteamImportService({ database, data, integrations, steam }) {
  const activeUsers = new Set();
  database.exec(`CREATE TABLE IF NOT EXISTS steam_connections (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    steam_id TEXT NOT NULL,
    persona_name TEXT NOT NULL DEFAULT '',
    profile_url TEXT NOT NULL DEFAULT '',
    last_synced_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  const connectionStatement = database.prepare(`SELECT steam_id AS steamId, persona_name AS personaName,
    profile_url AS profileUrl, last_synced_at AS lastSyncedAt FROM steam_connections WHERE user_id=?`);

  function credentials() { return integrations.credentials('steam'); }
  function configured() { return Boolean(credentials()?.apiKey); }
  function connection(userId) { return connectionStatement.get(userId) || null; }
  function status(userId) { return { configured: configured(), connected: Boolean(connection(userId)), connection: connection(userId) }; }

  function assertIdle(userId) {
    if (activeUsers.has(userId)) throw Object.assign(new Error('A Steam import is already running for this account.'), { status: 409 });
  }

  async function connect(userId, reference) {
    assertIdle(userId);
    const apiKey = credentials()?.apiKey;
    if (!apiKey) throw Object.assign(new Error('Steam library import is not configured on this server.'), { status: 409 });
    const profile = await steam.player(apiKey, reference);
    database.prepare(`INSERT INTO steam_connections(user_id,steam_id,persona_name,profile_url) VALUES (?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET steam_id=excluded.steam_id,persona_name=excluded.persona_name,
      profile_url=excluded.profile_url,last_synced_at=NULL,updated_at=CURRENT_TIMESTAMP`)
      .run(userId, profile.steamId, profile.personaName, profile.profileUrl);
    return status(userId);
  }

  function disconnect(userId) {
    assertIdle(userId);
    database.prepare('DELETE FROM steam_connections WHERE user_id=?').run(userId);
    return status(userId);
  }

  function libraryRows(userId) {
    return database.prepare(`SELECT id,title,platform,steam_app_id AS steamAppId,canonical_game_id AS canonicalGameId
      FROM games WHERE user_id=? ORDER BY id`).all(userId);
  }

  function indexRows(rows) {
    const byApp = new Map(); const byTitle = new Map();
    for (const row of rows) {
      if (row.steamAppId) byApp.set(Number(row.steamAppId), row);
      const titleKey = normalizeKatalogText(row.title);
      if (!byTitle.has(titleKey)) byTitle.set(titleKey, []);
      byTitle.get(titleKey).push(row);
    }
    return { byApp, byTitle };
  }

  function addIndexedRow(index, row) {
    if (row.steamAppId) index.byApp.set(Number(row.steamAppId), row);
    const titleKey = normalizeKatalogText(row.title);
    if (!index.byTitle.has(titleKey)) index.byTitle.set(titleKey, []);
    index.byTitle.get(titleKey).push(row);
  }

  function classify(game, index) {
    const titleKey = normalizeKatalogText(game.title);
    const appMatch = index.byApp.get(game.appId);
    if (appMatch) return { status: 'already', action: 'none', matches: [appMatch], selected: false };
    const sameTitle = index.byTitle.get(titleKey) || [];
    const steamMatches = sameTitle.filter(row => normalizeKatalogText(row.platform) === 'steam');
    const unlinkedSteamMatches = steamMatches.filter(row => !row.steamAppId);
    if (steamMatches.length === 1 && unlinkedSteamMatches.length === 1) {
      return { status: 'link', action: 'link', matches: unlinkedSteamMatches, selected: true };
    }
    if (steamMatches.length) return { status: 'ambiguous', action: 'create', matches: steamMatches, selected: false };
    if (sameTitle.length) return { status: 'other-platform', action: 'create', matches: sameTitle, selected: true };
    return { status: 'new', action: 'create', matches: [], selected: true };
  }

  async function fetchLibrary(userId) {
    const apiKey = credentials()?.apiKey;
    if (!apiKey) throw Object.assign(new Error('Steam library import is not configured on this server.'), { status: 409 });
    const linked = connection(userId);
    if (!linked) throw Object.assign(new Error('Connect a Steam profile first.'), { status: 409 });
    const games = await steam.ownedGames(apiKey, linked.steamId);
    return { linked, games };
  }

  async function preview(userId) {
    const { linked, games } = await fetchLibrary(userId); const index = indexRows(libraryRows(userId));
    const items = games.map(game => ({ ...game, ...classify(game, index) }));
    const counts = Object.fromEntries(['new', 'other-platform', 'link', 'ambiguous', 'already'].map(key => [key, items.filter(item => item.status === key).length]));
    return { connection: linked, total: items.length, counts, items };
  }

  async function importSelection(userId, appIds, onProgress = () => {}) {
    assertIdle(userId);
    const ids = [...new Set((Array.isArray(appIds) ? appIds : []).map(Number).filter(value => Number.isInteger(value) && value > 0))];
    if (!ids.length) throw Object.assign(new Error('Select at least one Steam game to import.'), { status: 400 });
    if (ids.length > MAX_IMPORT_SELECTION) throw Object.assign(new Error(`A single import can contain at most ${MAX_IMPORT_SELECTION} games.`), { status: 400 });
    activeUsers.add(userId);
    try {
      onProgress({ phase: 'fetching', current: 0, total: ids.length });
      const { games } = await fetchLibrary(userId); const allowed = new Map(games.map(game => [game.appId, game]));
      if (ids.some(id => !allowed.has(id))) throw Object.assign(new Error('The import selection contains a game outside the connected Steam library.'), { status: 400 });
      const created = []; const linked = []; const skipped = []; const xpGames = []; const index = indexRows(libraryRows(userId));
      onProgress({ phase: 'importing', current: 0, total: ids.length });
      for (let offset = 0; offset < ids.length; offset += IMPORT_CHUNK_SIZE) {
        const chunk = ids.slice(offset, offset + IMPORT_CHUNK_SIZE);
        database.transaction(() => {
          for (const appId of chunk) {
            const source = allowed.get(appId); const outcome = classify(source, index);
            if (outcome.status === 'already') {
              const existing = outcome.matches[0];
              skipped.push({ appId, title: source.title, id: existing.id });
              xpGames.push(existing);
              continue;
            }
            if (outcome.action === 'link' && outcome.matches.length === 1) {
              const game = data.linkSteamGame(userId, outcome.matches[0].id, source);
              if (game) {
                linked.push(game);
                const row = outcome.matches[0]; row.steamAppId = source.appId;
                index.byApp.set(source.appId, row);
              } else skipped.push({ appId, title: source.title });
              continue;
            }
            const game = data.createGame(userId, {
              title: source.title, platform: 'Steam', ownership: 'owned', mediaFormat: 'digital', playStatus: 'backlog',
              steamAppId: source.appId, steamPlaytimeMinutes: source.playtimeMinutes, steamLastPlayedAt: source.lastPlayedAt,
            });
            created.push(game); xpGames.push(game);
            addIndexedRow(index, { id: game.id, title: game.title, platform: game.platform, steamAppId: source.appId, canonicalGameId: game.canonicalGameId });
          }
        })();
        onProgress({ phase: 'importing', current: Math.min(offset + chunk.length, ids.length), total: ids.length });
        await yieldToEventLoop();
      }
      database.prepare('UPDATE steam_connections SET last_synced_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(userId);
      return { created, linked, skipped, xpGames, connection: connection(userId) };
    } finally {
      activeUsers.delete(userId);
    }
  }

  return { connect, disconnect, importSelection, preview, status };
}

module.exports = { createSteamImportService };
