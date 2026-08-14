#!/usr/bin/env node
'use strict';

const db = require('../server/db');
const storage = require('../server/cover-storage');
const { writeShowcase } = require('../server/showcase-covers');

storage.normalizeExistingCovers(db, {
  onError: (game, error) => console.error(`[covers] game ${game.id}: ${error.message}`),
}).then(result => {
  writeShowcase(db);
  console.log(JSON.stringify(result));
  db.db.close();
}).catch(error => {
  console.error(error.message);
  db.db.close();
  process.exitCode = 1;
});
