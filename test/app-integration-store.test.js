const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { createAppIntegrationStore } = require('../server/app-integration-store');

function fixture() {
  const database = new Database(':memory:');
  database.exec(`CREATE TABLE user_integrations(user_id INTEGER PRIMARY KEY,steamgriddb_key TEXT);
    CREATE TABLE cover_provider_credentials(user_id INTEGER,provider TEXT,credentials_json TEXT,PRIMARY KEY(user_id,provider));`);
  database.prepare('INSERT INTO user_integrations(user_id,steamgriddb_key) VALUES (?,?)').run(7, 'steam-key');
  database.prepare('INSERT INTO cover_provider_credentials(user_id,provider,credentials_json) VALUES (?,?,?)')
    .run(7, 'igdb', JSON.stringify({ clientId: 'app-id', clientSecret: 'app-secret' }));
  return database;
}

test('legacy owner credentials are copied non-destructively into application integrations', () => {
  const database = fixture();
  const store = createAppIntegrationStore(database, { operatorUserId: () => 7 });
  assert.deepEqual(store.credentials('steamgriddb'), { apiKey: 'steam-key' });
  assert.deepEqual(store.credentials('igdb'), { clientId: 'app-id', clientSecret: 'app-secret' });
  assert.equal(database.prepare('SELECT steamgriddb_key FROM user_integrations WHERE user_id=7').get().steamgriddb_key, 'steam-key');
  assert.equal(database.prepare("SELECT credentials_json FROM cover_provider_credentials WHERE user_id=7 AND provider='igdb'").get().credentials_json,
    JSON.stringify({ clientId: 'app-id', clientSecret: 'app-secret' }));
});

test('saved app credentials take precedence and are never overwritten by legacy migration', () => {
  const database = fixture();
  const store = createAppIntegrationStore(database, { operatorUserId: () => 7 });
  store.save('steamgriddb', { apiKey: 'replacement' });
  store.migrateLegacy();
  assert.deepEqual(store.credentials('steamgriddb'), { apiKey: 'replacement' });
  assert.deepEqual(store.credentials('igdb'), { clientId: 'app-id', clientSecret: 'app-secret' });
});

test('deployment credentials remain a fallback when no owner exists', () => {
  const database = fixture();
  const store = createAppIntegrationStore(database, {
    operatorUserId: () => null,
    environmentCredentials: provider => provider === 'steamgriddb' ? { apiKey: 'environment-key' } : null,
  });
  assert.deepEqual(store.credentials('steamgriddb'), { apiKey: 'environment-key' });
  assert.equal(store.credentials('igdb'), null);
});
