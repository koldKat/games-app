const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const sourceSets = {
  'public/app.js': ['public/app.js', 'public/js/boot', 'public/js/core', 'public/js/account', 'public/js/library', 'public/js/editor', 'public/js/details', 'public/js/metadata/bulk-ui.js', 'public/js/covers/decorations.js', 'public/js/ui-helpers/dialogs.js'],
  'server.js': ['server.js', 'server/boot', 'server/runtime', 'server/routes', 'server/http'],
  'server/db.js': ['server/db.js', 'server/db'],
};

function readTree(relative) {
  const filename = path.join(root, relative);
  if (!fs.statSync(filename).isDirectory()) return fs.readFileSync(filename, 'utf8');
  return fs.readdirSync(filename).filter(name => name.endsWith('.js') || fs.statSync(path.join(filename, name)).isDirectory())
    .map(name => readTree(path.join(relative, name))).join('\n');
}

// Source contracts follow feature modules; browser tests check runtime behavior.
function readSource(relative) {
  return (sourceSets[relative] || [relative]).map(readTree).join('\n');
}

module.exports = { readSource, readTree };
