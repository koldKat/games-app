#!/usr/bin/env node
'use strict';

const db = require('../server/db');
const { writeShowcase } = require('../server/showcase-covers');

writeShowcase(db);
db.db.close();
