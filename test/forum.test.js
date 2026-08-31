const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('forum stays modular, public to read, account-gated to contribute, and locally moderated', () => {
  const data = read('server/forum-data.js'); const routes = read('server/forum-routes.js'); const pages = read('server/forum-pages.js'); const client = read('public/js/forum-page.js');
  assert.match(read('server/db.js'), /CREATE TABLE IF NOT EXISTS forum_threads/);
  assert.match(read('server/db.js'), /CREATE TABLE IF NOT EXISTS forum_categories/);
  assert.match(data, /DEFAULT_CATEGORIES/);
  assert.match(routes, /url\.pathname === '\/forum'/);
  assert.match(routes, /if \(!user\)/);
  assert.match(routes, /events\.subscribePublicForum/);
  assert.match(routes, /events\.publishPublicForum/);
  assert.match(pages, /currentView: 'forum'/);
  assert.match(pages, /data-forum-thread-form/);
  assert.match(client, /new EventSource\('\/api\/forum\/stream'\)/);
  assert.match(pages, /function threadComposer\(category\)/);
  assert.match(pages, /data-forum-inline-composer/);
  assert.match(pages, /data-forum-new-thread/);
  assert.match(pages, /function authorPanel\(item\)/);
  assert.match(pages, /forum-user-card/);
  assert.match(data, /user_progression up/);
  assert.match(client, /forum-inline-error/);
  assert.doesNotMatch(client, /Click delete again to permanently remove it/);
  assert.doesNotMatch(client, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
  assert.match(read('server/admin.js'), /\/api\/admin\/forum/);
  assert.match(read('admin/index.html'), /data-tab="forum"/);
});

test('forum participation awards idempotent progression events', () => {
  const policy = read('server/progression-policy.js'); const service = read('server/progression-service.js');
  assert.match(policy, /forum_thread: \{ amount: 25/);
  assert.match(policy, /forum_reply: \{ amount: 5/);
  assert.match(service, /recordForumThread/);
  assert.match(service, /recordForumReply/);
});
