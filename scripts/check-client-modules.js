const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', 'public');
const context = vm.createContext({});
const modules = new Map();
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filename);
    else if (entry.name.endsWith('.js')) modules.set(filename, new vm.SourceTextModule(fs.readFileSync(filename, 'utf8'), { context, identifier: filename }));
  }
}

async function check() {
  walk(path.join(root, 'js'));
  walk(path.join(root, '..', 'admin', 'js'));
  const entry = path.join(root, 'app.js');
  modules.set(entry, new vm.SourceTextModule(fs.readFileSync(entry, 'utf8'), { context, identifier: entry }));
  for (const module of modules.values()) {
    if (module.status !== 'unlinked') continue;
    await module.link((specifier, parent) => {
      assert.ok(specifier.startsWith('.') || specifier.startsWith('/js/'), `${parent.identifier}: unexpected external import ${specifier}`);
      const filename = specifier.startsWith('/js/') ? path.join(root, specifier) : path.resolve(path.dirname(parent.identifier), specifier);
      assert.ok(modules.has(filename), `${parent.identifier}: missing dependency ${specifier}`);
      return modules.get(filename);
    });
  }
  for (const module of modules.values()) assert.equal(module.status, 'linked', module.identifier);
  console.log(`Client module graph linked (${modules.size} modules).`);
}

check().catch(error => { console.error(error); process.exitCode = 1; });
