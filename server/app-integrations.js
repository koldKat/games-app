'use strict';

const data = require('./db');
const auth = require('./auth');
const { createAppIntegrationStore } = require('./app-integration-store');

module.exports = createAppIntegrationStore(data.db, {
  operatorUserId: auth.operatorUserId,
  environmentCredentials(provider) {
    if (provider === 'steamgriddb' && process.env.STEAMGRIDDB_API_KEY) return { apiKey: process.env.STEAMGRIDDB_API_KEY };
    if (provider === 'igdb' && process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET) {
      return { clientId: process.env.IGDB_CLIENT_ID, clientSecret: process.env.IGDB_CLIENT_SECRET };
    }
    return null;
  },
});
