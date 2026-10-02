const { db } = require('./connection');
function coverProviderCredentials(userId, provider) {
  const row = db.prepare('SELECT credentials_json FROM cover_provider_credentials WHERE user_id=? AND provider=?').get(userId, provider);
  if (!row) return null;
  try { const value = JSON.parse(row.credentials_json); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
  catch { return null; }
}
function setCoverProviderCredentials(userId, provider, credentials) {
  const cleanProvider = String(provider || '').trim();
  if (!cleanProvider) throw new Error('Cover provider is required.');
  if (!credentials) { db.prepare('DELETE FROM cover_provider_credentials WHERE user_id=? AND provider=?').run(userId, cleanProvider); return; }
  db.prepare(`INSERT INTO cover_provider_credentials (user_id, provider, credentials_json) VALUES (?, ?, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET credentials_json=excluded.credentials_json, updated_at=CURRENT_TIMESTAMP`)
    .run(userId, cleanProvider, JSON.stringify(credentials));
}

module.exports = { coverProviderCredentials, setCoverProviderCredentials };
