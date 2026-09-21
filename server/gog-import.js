'use strict';

const { normalizeKatalogText } = require('./katalog-policy');

const MAX_IMPORT_SELECTION = 10_000;
const IMPORT_CHUNK_SIZE = 5;
const yieldToEventLoop = () => new Promise(resolve => setImmediate(resolve));

function createGogImportService({ database, data, gog }) {
  const activeUsers = new Set();
  database.exec(`CREATE TABLE IF NOT EXISTS gog_connections (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    profile_url TEXT NOT NULL DEFAULT '',
    gog_user_id TEXT NOT NULL DEFAULT '',
    access_token TEXT NOT NULL DEFAULT '',
    refresh_token TEXT NOT NULL DEFAULT '',
    token_expires_at INTEGER NOT NULL DEFAULT 0,
    last_synced_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const columns = database.prepare('PRAGMA table_info(gog_connections)').all().map(column => column.name);
  if (!columns.includes('gog_user_id')) database.exec("ALTER TABLE gog_connections ADD COLUMN gog_user_id TEXT NOT NULL DEFAULT ''");
  if (!columns.includes('access_token')) database.exec("ALTER TABLE gog_connections ADD COLUMN access_token TEXT NOT NULL DEFAULT ''");
  if (!columns.includes('refresh_token')) database.exec("ALTER TABLE gog_connections ADD COLUMN refresh_token TEXT NOT NULL DEFAULT ''");
  if (!columns.includes('token_expires_at')) database.exec('ALTER TABLE gog_connections ADD COLUMN token_expires_at INTEGER NOT NULL DEFAULT 0');
  const connectionStatement = database.prepare(`SELECT username, profile_url AS profileUrl, gog_user_id AS gogUserId,
    access_token AS accessToken, refresh_token AS refreshToken, token_expires_at AS expiresAt,
    last_synced_at AS lastSyncedAt FROM gog_connections WHERE user_id=?`);
  const saveTokensStatement = database.prepare(`UPDATE gog_connections SET access_token=?,refresh_token=?,
    token_expires_at=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?`);

  function connectionRecord(userId) { return connectionStatement.get(userId) || null; }
  function publicConnection(row) {
    if (!row) return null;
    return { username: row.username, profileUrl: row.profileUrl, gogUserId: row.gogUserId, lastSyncedAt: row.lastSyncedAt };
  }
  function status(userId) {
    const row = connectionRecord(userId); const connected = Boolean(row?.refreshToken);
    return { connected, requiresReconnect: Boolean(row && !connected), authorizationUrl: gog.AUTHORIZATION_URL, connection: connected ? publicConnection(row) : null };
  }
  function assertIdle(userId) {
    if (activeUsers.has(userId)) throw Object.assign(new Error('A GOG import is already running for this account.'), { status: 409 });
  }

  async function connect(userId, authorization) {
    assertIdle(userId);
    const tokens = await gog.exchangeAuthorization(authorization);
    const account = await gog.account(tokens.accessToken);
    const profileUrl = `https://www.gog.com/u/${encodeURIComponent(account.username)}`;
    database.prepare(`INSERT INTO gog_connections(user_id,username,profile_url,gog_user_id,access_token,refresh_token,token_expires_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,profile_url=excluded.profile_url,
      gog_user_id=excluded.gog_user_id,access_token=excluded.access_token,refresh_token=excluded.refresh_token,
      token_expires_at=excluded.token_expires_at,last_synced_at=NULL,updated_at=CURRENT_TIMESTAMP`)
      .run(userId, account.username, profileUrl, account.userId, tokens.accessToken, tokens.refreshToken, tokens.expiresAt);
    return status(userId);
  }

  function disconnect(userId) {
    assertIdle(userId);
    database.prepare('DELETE FROM gog_connections WHERE user_id=?').run(userId);
    return status(userId);
  }

  function libraryRows(userId) {
    return database.prepare(`SELECT id,title,platform,gog_product_id AS gogProductId,canonical_game_id AS canonicalGameId
      FROM games WHERE user_id=? ORDER BY id`).all(userId);
  }

  function indexRows(rows) {
    const byProduct = new Map(); const byTitle = new Map();
    for (const row of rows) {
      if (row.gogProductId) byProduct.set(String(row.gogProductId), row);
      const titleKey = normalizeKatalogText(row.title);
      if (!byTitle.has(titleKey)) byTitle.set(titleKey, []);
      byTitle.get(titleKey).push(row);
    }
    return { byProduct, byTitle };
  }

  function addIndexedRow(index, row) {
    if (row.gogProductId) index.byProduct.set(String(row.gogProductId), row);
    const titleKey = normalizeKatalogText(row.title);
    if (!index.byTitle.has(titleKey)) index.byTitle.set(titleKey, []);
    index.byTitle.get(titleKey).push(row);
  }

  function classify(game, index) {
    const productMatch = index.byProduct.get(game.productId);
    if (productMatch) return { status: 'already', action: 'none', matches: [productMatch], selected: false };
    const sameTitle = index.byTitle.get(normalizeKatalogText(game.title)) || [];
    const gogMatches = sameTitle.filter(row => normalizeKatalogText(row.platform) === 'gog');
    const unlinked = gogMatches.filter(row => !row.gogProductId);
    if (gogMatches.length === 1 && unlinked.length === 1) return { status: 'link', action: 'link', matches: unlinked, selected: true };
    if (gogMatches.length) return { status: 'ambiguous', action: 'create', matches: gogMatches, selected: false };
    if (sameTitle.length) return { status: 'other-platform', action: 'create', matches: sameTitle, selected: true };
    return { status: 'new', action: 'create', matches: [], selected: true };
  }

  async function accessToken(userId) {
    const linked = connectionRecord(userId);
    if (!linked?.refreshToken) throw Object.assign(new Error('Reconnect GOG to read your complete library.'), { status: 409 });
    if (linked.accessToken && Number(linked.expiresAt) > Math.floor(Date.now() / 1_000) + 60) return { linked, token: linked.accessToken };
    const tokens = await gog.refreshAuthorization(linked.refreshToken);
    saveTokensStatement.run(tokens.accessToken, tokens.refreshToken, tokens.expiresAt, userId);
    return { linked: connectionRecord(userId), token: tokens.accessToken };
  }

  async function fetchLibrary(userId, onPage) {
    const { linked, token } = await accessToken(userId);
    return { linked: publicConnection(linked), games: await gog.ownedGames(token, undefined, onPage) };
  }

  async function preview(userId, onProgress = () => {}) {
    const { linked, games } = await fetchLibrary(userId, page => onProgress({ phase: 'previewing', current: page.page, total: page.pages }));
    const index = indexRows(libraryRows(userId));
    const items = games.map(game => ({ ...game, ...classify(game, index) }));
    const counts = Object.fromEntries(['new', 'other-platform', 'link', 'ambiguous', 'already'].map(key => [key, items.filter(item => item.status === key).length]));
    return { connection: linked, total: items.length, counts, items };
  }

  async function importSelection(userId, productIds, onProgress = () => {}) {
    assertIdle(userId);
    const ids = [...new Set((Array.isArray(productIds) ? productIds : []).map(value => String(value || '').trim()).filter(value => /^\d+$/.test(value)))];
    if (!ids.length) throw Object.assign(new Error('Select at least one GOG game to import.'), { status: 400 });
    if (ids.length > MAX_IMPORT_SELECTION) throw Object.assign(new Error(`A single import can contain at most ${MAX_IMPORT_SELECTION} games.`), { status: 400 });
    activeUsers.add(userId);
    try {
      onProgress({ phase: 'fetching', current: 0, total: 0 });
      const { games } = await fetchLibrary(userId, page => onProgress({ phase: 'fetching', current: page.page, total: page.pages }));
      const allowed = new Map(games.map(game => [game.productId, game]));
      if (ids.some(id => !allowed.has(id))) throw Object.assign(new Error('The import selection contains a game outside the connected GOG library.'), { status: 400 });
      const created = []; const linked = []; const skipped = []; const xpGames = []; const index = indexRows(libraryRows(userId));
      onProgress({ phase: 'importing', current: 0, total: ids.length });
      for (let offset = 0; offset < ids.length; offset += IMPORT_CHUNK_SIZE) {
        const chunk = ids.slice(offset, offset + IMPORT_CHUNK_SIZE);
        database.transaction(() => {
          for (const productId of chunk) {
            const source = allowed.get(productId); const outcome = classify(source, index);
            if (outcome.status === 'already') {
              const existing = outcome.matches[0]; skipped.push({ productId, title: source.title, id: existing.id }); xpGames.push(existing); continue;
            }
            if (outcome.action === 'link' && outcome.matches.length === 1) {
              const game = data.linkGogGame(userId, outcome.matches[0].id, source);
              if (game) {
                linked.push(game); const row = outcome.matches[0]; row.gogProductId = source.productId; index.byProduct.set(source.productId, row);
              } else skipped.push({ productId, title: source.title });
              continue;
            }
            const game = data.createGame(userId, {
              title: source.title, platform: 'GOG', ownership: 'owned', mediaFormat: 'digital', playStatus: 'backlog', gogProductId: source.productId,
            });
            created.push(game); xpGames.push(game);
            addIndexedRow(index, { id: game.id, title: game.title, platform: game.platform, gogProductId: source.productId, canonicalGameId: game.canonicalGameId });
          }
        })();
        onProgress({ phase: 'importing', current: Math.min(offset + chunk.length, ids.length), total: ids.length });
        await yieldToEventLoop();
      }
      database.prepare('UPDATE gog_connections SET last_synced_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(userId);
      return { created, linked, skipped, xpGames, connection: publicConnection(connectionRecord(userId)) };
    } finally { activeUsers.delete(userId); }
  }

  return { connect, disconnect, importSelection, preview, status };
}

module.exports = { createGogImportService };
