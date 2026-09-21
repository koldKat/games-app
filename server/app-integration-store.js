'use strict';

const APP_INTEGRATION_PROVIDERS = Object.freeze(['steamgriddb', 'igdb', 'steam']);

function createAppIntegrationStore(database, { operatorUserId, environmentCredentials = () => null } = {}) {
  database.exec(`CREATE TABLE IF NOT EXISTS app_integrations (
    provider TEXT PRIMARY KEY,
    credentials_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const read = database.prepare('SELECT credentials_json FROM app_integrations WHERE provider=?');
  const write = database.prepare(`INSERT INTO app_integrations(provider,credentials_json) VALUES (?,?)
    ON CONFLICT(provider) DO UPDATE SET credentials_json=excluded.credentials_json,updated_at=CURRENT_TIMESTAMP`);
  let legacyMigrationComplete = false;

  function parse(row) {
    try { const value = JSON.parse(row?.credentials_json || ''); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
    catch { return null; }
  }

  function migrateLegacy() {
    if (legacyMigrationComplete) return;
    const ownerId = Number(operatorUserId?.()) || null;
    if (!ownerId) return;
    database.transaction(() => {
      if (!read.get('steamgriddb')) {
        const key = database.prepare('SELECT steamgriddb_key AS apiKey FROM user_integrations WHERE user_id=?').get(ownerId)?.apiKey;
        if (key) write.run('steamgriddb', JSON.stringify({ apiKey: key }));
      }
      if (!read.get('igdb')) {
        const row = database.prepare("SELECT credentials_json FROM cover_provider_credentials WHERE user_id=? AND provider='igdb'").get(ownerId);
        if (parse(row)) write.run('igdb', row.credentials_json);
      }
    })();
    legacyMigrationComplete = true;
  }

  function credentials(provider) {
    if (!APP_INTEGRATION_PROVIDERS.includes(provider)) return null;
    migrateLegacy();
    return parse(read.get(provider)) || environmentCredentials(provider) || null;
  }
  function configured(provider) { return Boolean(credentials(provider)); }
  function save(provider, value) {
    if (!APP_INTEGRATION_PROVIDERS.includes(provider)) throw new Error('Unsupported application integration.');
    write.run(provider, JSON.stringify(value)); return { provider, configured: true };
  }

  return { configured, credentials, migrateLegacy, save };
}

module.exports = { APP_INTEGRATION_PROVIDERS, createAppIntegrationStore };
