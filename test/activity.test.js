const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join('/tmp', `games-activity-test-${process.pid}.db`);
process.env.DB_PATH = dbPath;
const data = require('../server/db');
const { createCatalogueStore } = require('../server/catalogue-store');
createCatalogueStore(data.db);
const activity = require('../server/activity');
const auth = require('../server/auth');

test.after(() => { data.db.close(); for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true }); });

test('activity templates are database-backed and joins respect the global hide setting', async () => {
  assert.equal(data.db.prepare("SELECT COUNT(*) count FROM activity_templates WHERE type='join'").get().count, 10);
  assert.equal(data.db.prepare("SELECT COUNT(*) count FROM activity_templates WHERE type='level_up'").get().count, 10);
  const user = await auth.register('signal_user', 'password-one');
  assert.equal(activity.recordJoin(user.id), true);
  assert.equal(activity.recordJoin(user.id), false);
  assert.equal(activity.list().find(entry => entry.type === 'join')?.username, 'signal_user');
  await auth.updateAccount(user.id, { currentPassword: 'password-one', hideFromActivity: true });
  assert.equal(activity.list().some(entry => entry.username === 'signal_user'), false);
});

test('level-up messages retain a randomly selected template and newly gained title', async () => {
  const user = await auth.register('signal_level', 'password-two');
  assert.equal(activity.recordLevelUp(user.id, 5, 'Box Hunter', 'Cartridge Keeper'), true);
  const entry = activity.list().find(item => item.type === 'level_up');
  assert.equal(entry.level, 5); assert.equal(entry.title, 'Box Hunter'); assert.equal(entry.titleGained, true);
  assert.match(entry.template, /\{name\}.*\{level\}|\{level\}.*\{name\}/);
});

test('existing progression history backfills real level crossings with their original timestamp', async () => {
  const user = await auth.register('signal_history', 'password-four');
  data.db.prepare(`INSERT INTO progression_events(user_id,event,ref,amount,created_at)
    VALUES (?, 'game_added', 'historic-level', 1000, '2026-08-29 10:00:00')`).run(user.id);
  assert.equal(activity.backfillLevelUps(), 1);
  assert.equal(activity.backfillLevelUps(), 0);
  const entry = activity.list().find(item => item.username === 'signal_history' && item.type === 'level_up');
  assert.equal(entry.level, 1);
  assert.equal(entry.createdAt, '2026-08-29 10:00:00');
});

test('public Kat·a·log contributions can be safely backfilled into Signal', async () => {
  const user = await auth.register('signal_curator', 'password-three');
  const game = data.createGame(user.id, { title: 'Signal Public Game', platform: 'PC' });
  data.db.prepare(`INSERT INTO catalogue_entries(slug,title,title_key,platform,platform_key,cover_url,status,submitted_by_user_id,source_game_id,published_at)
    VALUES ('signal-public-game-pc','Signal Public Game','signal public game','PC','pc','/covers/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg','public',?,?,CURRENT_TIMESTAMP)`).run(user.id, game.id);
  assert.equal(activity.backfillContributions(), 1);
  assert.equal(activity.backfillContributions(), 0);
  assert.equal(activity.list().find(entry => entry.type === 'catalogue_contribution')?.gameTitle, 'Signal Public Game');
});

test('admin announcements stay drafts until published and a pinned notice leads Signal', () => {
  const draft = activity.createAnnouncement({ title: 'Night shift', body: 'Fresh metadata is **live**.' });
  assert.equal(draft.draft, true);
  assert.equal(activity.feed().entries.some(entry => entry.id === draft.id && entry.type === 'announcement'), false);
  const published = activity.publishAnnouncement(draft.id);
  assert.equal(published.draft, false);
  assert.equal(activity.feed().entries.some(entry => entry.id === draft.id && entry.type === 'announcement'), true);
  const pinned = activity.pinAnnouncement(draft.id);
  assert.equal(pinned.pinned, true);
  const feed = activity.feed();
  assert.equal(feed.pinned.id, draft.id);
  assert.equal(feed.entries.some(entry => entry.id === draft.id && entry.type === 'announcement'), false);
  assert.equal(activity.unpinAnnouncement(draft.id).pinned, false);
  assert.equal(activity.unpublishAnnouncement(draft.id).draft, true);
});
