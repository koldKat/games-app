#!/usr/bin/env node
'use strict';

const db = require('../server/db');
const { createKatalogStore } = require('../server/katalog-store');
const { createShowcasePool } = require('../server/showcase-pool');
const { writeShowcase } = require('../server/showcase-covers');

createKatalogStore(db.db);
writeShowcase(createShowcasePool(db.db).public);
db.db.close();
