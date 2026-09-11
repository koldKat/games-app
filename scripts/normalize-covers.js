#!/usr/bin/env node
'use strict';

const db = require('../server/db');
const storage = require('../server/cover-storage');
const { createKatalogStore } = require('../server/katalog-store');
const { createShowcasePool } = require('../server/showcase-pool');
const { writeShowcase } = require('../server/showcase-covers');
createKatalogStore(db.db);
const showcasePool = createShowcasePool(db.db);

storage.normalizeExistingCovers(db, {
  onError: (game, error) => console.error(`[covers] game ${game.id}: ${error.message}`),
}).then(result => {
  writeShowcase(showcasePool.public);
  console.log(JSON.stringify(result));
  db.db.close();
}).catch(error => {
  console.error(error.message);
  db.db.close();
  process.exitCode = 1;
});
