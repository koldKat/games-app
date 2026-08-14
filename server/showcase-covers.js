'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SHOWCASE_PATH = path.join(__dirname, '..', 'public', 'cover-showcase.json');

function writeShowcase(data, count = 38) {
  const temporary = `${SHOWCASE_PATH}.${process.pid}.tmp`;
  const body = `${JSON.stringify({ covers: data.randomShowcaseCovers(count) })}\n`;
  try {
    fs.writeFileSync(temporary, body, { mode: 0o644 });
    fs.renameSync(temporary, SHOWCASE_PATH);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

module.exports = { SHOWCASE_PATH, writeShowcase };
