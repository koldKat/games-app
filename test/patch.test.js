const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Patch and Ping remain private, modular, and locally triaged', () => {
  const schema = read('server/db.js'); const data = read('server/patch-data.js'); const routes = read('server/patch-routes.js');
  const ui = read('public/js/patch-ui.js'); const admin = read('admin/js/patch.js');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS patch_threads/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS patch_messages/);
  assert.match(data, /deleted_by_user/); assert.match(data, /deleted_by_admin/); assert.match(data, /function forOperator/);
  assert.match(routes, /url\.pathname === '\/api\/patch'/); assert.match(routes, /url\.pathname === '\/api\/ping'/);
  assert.match(routes, /events\.publish\(item\.userId, 'ping-updated'/);
  assert.match(routes, /notifyOperator\(\)/); assert.match(routes, /auth\.operatorUserId/);
  assert.match(read('server/admin.js'), /\/api\/admin\/patch/);
  assert.match(read('admin/index.html'), /data-tab="patch"/);
  assert.match(read('admin/index.html'), /id="panel-patch"/);
  assert.match(ui, /function updateBadge/); assert.match(ui, /data-ping-badge/); assert.match(ui, /ping-attention/);
  assert.match(ui, /function updateAvailability/); assert.match(ui, /No Ping conversations yet/);
  assert.match(read('public/js/patch-page.js'), /openEventStream/);
  assert.match(ui, /closeFromTrueBackdrop/); assert.match(admin, /Reply delivered to Ping/);
  assert.doesNotMatch(ui + admin, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
});
