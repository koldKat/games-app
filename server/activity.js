'use strict';

const { db } = require('./db');
const { progressForXp } = require('./progression-policy');

const FEED_DAYS = 30;
const ANNOUNCEMENT_TITLE_MAX_LENGTH = 120;
const ANNOUNCEMENT_BODY_MAX_LENGTH = 4_000;
const JOIN_TEMPLATES = [
  '{name} plugged in a new controller. Welcome aboard.',
  'A new save slot flickers to life: {name}.',
  '{name} entered the Kat·a·log. The backlog grows stronger.',
  'Achievement unlocked: {name} joined the party.',
  '{name} found the hidden menu. Welcome in.',
  'A fresh cartridge clicks into place. Hello, {name}.',
  '{name} spawned at the collection terminal.',
  'New player detected: {name}. No tutorial required.',
  '{name} crossed the start screen and into the Kat·a·log.',
  'The signal gained a new curator: {name}.',
];
const LEVEL_TEMPLATES = [
  '{name} hit LV {level}. Save point reached.',
  'Level-up protocol complete: {name} is now LV {level}.',
  '{name} just gained enough XP for LV {level}.',
  'The arcade lights up: {name} reached LV {level}.',
  'LV {level} unlocked for {name}. Keep the run alive.',
  '{name} powered through to LV {level}.',
  'Progress bar filled. {name} is LV {level}.',
  '{name} found another level: LV {level}.',
  'Signal boost: {name} advanced to LV {level}.',
  '{name} is now operating at LV {level}.',
];

db.exec(`
  CREATE TABLE IF NOT EXISTS activity_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('join', 'level_up')),
    template TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    UNIQUE(type, template)
  );
  CREATE TABLE IF NOT EXISTS activity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('join', 'level_up', 'catalogue_contribution')),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
    event_ref TEXT NOT NULL DEFAULT '',
    template_id INTEGER REFERENCES activity_templates(id) ON DELETE SET NULL,
    data_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, user_id, game_id)
  );
  CREATE INDEX IF NOT EXISTS idx_activity_events_recent ON activity_events(created_at DESC);
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    is_draft INTEGER NOT NULL DEFAULT 1 CHECK (is_draft IN (0, 1)),
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(is_draft, pinned, published_at DESC);
`);
const activityColumns = db.pragma('table_info(activity_events)').map(column => column.name);
if (!activityColumns.includes('event_ref')) db.exec("ALTER TABLE activity_events ADD COLUMN event_ref TEXT NOT NULL DEFAULT ''");
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_events_once ON activity_events(type, user_id, event_ref)');

const insertTemplate = db.prepare('INSERT OR IGNORE INTO activity_templates(type, template) VALUES (?, ?)');
for (const template of JOIN_TEMPLATES) insertTemplate.run('join', template);
for (const template of LEVEL_TEMPLATES) insertTemplate.run('level_up', template);

function templateFor(type) { return db.prepare('SELECT id FROM activity_templates WHERE type=? AND active=1 ORDER BY RANDOM() LIMIT 1').get(type)?.id || null; }
function write(type, { userId = null, gameId = null, ref = '', templateId = null, data = {} } = {}) {
  const result = db.prepare(`INSERT OR IGNORE INTO activity_events(type, user_id, game_id, event_ref, template_id, data_json)
    VALUES (?, ?, ?, ?, ?, ?)`).run(type, userId, gameId, String(ref), templateId, JSON.stringify(data));
  return Boolean(result.changes);
}
function recordJoin(userId) { return write('join', { userId, ref: 'joined', templateId: templateFor('join') }); }
function recordLevelUp(userId, level, title, previousTitle) {
  return write('level_up', { userId, ref: `level:${level}`, templateId: templateFor('level_up'), data: { level, title, titleGained: Boolean(title && title !== previousTitle) } });
}
function recordContribution(userId, gameId) { return write('catalogue_contribution', { userId, gameId, ref: `game:${gameId}` }); }
function backfillContributions() {
  const rows = db.prepare(`SELECT submitted_by_user_id AS userId, source_game_id AS gameId, published_at AS publishedAt
    FROM catalogue_entries WHERE status='public' AND submitted_by_user_id IS NOT NULL AND source_game_id IS NOT NULL`).all();
  const insert = db.prepare(`INSERT OR IGNORE INTO activity_events(type, user_id, game_id, event_ref, data_json, created_at)
    VALUES ('catalogue_contribution', ?, ?, ?, '{}', COALESCE(?, CURRENT_TIMESTAMP))`);
  let recorded = 0;
  for (const row of rows) if (insert.run(row.userId, row.gameId, `game:${row.gameId}`, row.publishedAt).changes) recorded++;
  return recorded;
}
function backfillLevelUps() {
  const rows = db.prepare(`SELECT user_id AS userId, amount, created_at AS createdAt
    FROM progression_events ORDER BY user_id, created_at, id`).all();
  const insert = db.prepare(`INSERT OR IGNORE INTO activity_events(type, user_id, event_ref, template_id, data_json, created_at)
    VALUES ('level_up', ?, ?, ?, ?, ?)`);
  let userId = null; let xp = 0; let recorded = 0;
  for (const row of rows) {
    if (row.userId !== userId) { userId = row.userId; xp = 0; }
    const before = progressForXp(xp); xp += Number(row.amount) || 0;
    const after = progressForXp(xp);
    for (let level = before.level + 1; level <= after.level; level++) {
      const current = progressForXp((level * (level + 1) * 1000) / 2);
      const previous = progressForXp(((level - 1) * level * 1000) / 2);
      const result = insert.run(row.userId, `level:${level}`, templateFor('level_up'), JSON.stringify({ level, title: current.title, titleGained: current.title !== previous.title }), row.createdAt);
      recorded += result.changes;
    }
  }
  return recorded;
}
function parseData(value) { try { return JSON.parse(value || '{}'); } catch { return {}; } }
function cleanAnnouncementValue(value, limit, label) {
  const clean = String(value || '').trim();
  if (!clean) throw new Error(`${label} is required.`);
  if (clean.length > limit) throw new Error(`${label} must be ${limit.toLocaleString()} characters or fewer.`);
  return clean;
}
function announcementRow(row) {
  if (!row) return null;
  return { id: Number(row.id), title: row.title, body: row.body, draft: Boolean(row.is_draft), pinned: Boolean(row.pinned), createdAt: row.created_at, publishedAt: row.published_at || null };
}
function createAnnouncement(input = {}) {
  const title = cleanAnnouncementValue(input.title, ANNOUNCEMENT_TITLE_MAX_LENGTH, 'Title');
  const body = cleanAnnouncementValue(input.body, ANNOUNCEMENT_BODY_MAX_LENGTH, 'Body');
  const result = db.prepare('INSERT INTO announcements(title, body) VALUES (?, ?)').run(title, body);
  return announcementRow(db.prepare('SELECT * FROM announcements WHERE id=?').get(result.lastInsertRowid));
}
function updateAnnouncement(id, input = {}) {
  const title = cleanAnnouncementValue(input.title, ANNOUNCEMENT_TITLE_MAX_LENGTH, 'Title');
  const body = cleanAnnouncementValue(input.body, ANNOUNCEMENT_BODY_MAX_LENGTH, 'Body');
  const result = db.prepare('UPDATE announcements SET title=?, body=? WHERE id=?').run(title, body, Number(id));
  return result.changes ? announcementRow(db.prepare('SELECT * FROM announcements WHERE id=?').get(Number(id))) : null;
}
function publishAnnouncement(id) {
  const result = db.prepare("UPDATE announcements SET is_draft=0, published_at=CURRENT_TIMESTAMP WHERE id=? AND is_draft=1").run(Number(id));
  return result.changes ? announcementRow(db.prepare('SELECT * FROM announcements WHERE id=?').get(Number(id))) : null;
}
function unpublishAnnouncement(id) {
  const result = db.prepare('UPDATE announcements SET is_draft=1, pinned=0, published_at=NULL WHERE id=? AND is_draft=0').run(Number(id));
  return result.changes ? announcementRow(db.prepare('SELECT * FROM announcements WHERE id=?').get(Number(id))) : null;
}
const pinAnnouncement = db.transaction(id => {
  const target = db.prepare('SELECT * FROM announcements WHERE id=? AND is_draft=0').get(Number(id));
  if (!target) return null;
  db.prepare('UPDATE announcements SET pinned=0 WHERE pinned=1').run();
  db.prepare('UPDATE announcements SET pinned=1 WHERE id=?').run(Number(id));
  return announcementRow(db.prepare('SELECT * FROM announcements WHERE id=?').get(Number(id)));
});
function unpinAnnouncement(id) {
  const result = db.prepare('UPDATE announcements SET pinned=0 WHERE id=? AND pinned=1').run(Number(id));
  return result.changes ? announcementRow(db.prepare('SELECT * FROM announcements WHERE id=?').get(Number(id))) : null;
}
function deleteAnnouncement(id) { return db.prepare('DELETE FROM announcements WHERE id=?').run(Number(id)).changes > 0; }
function listAnnouncements() { return db.prepare('SELECT * FROM announcements ORDER BY pinned DESC, COALESCE(published_at, created_at) DESC, id DESC').all().map(announcementRow); }
function feedAnnouncement(row) { return { ...announcementRow(row), type: 'announcement', createdAt: row.published_at }; }
function list(limit = null) {
  const take = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 0;
  const query = `SELECT a.id, a.type, a.game_id AS gameId, a.data_json AS dataJson, a.created_at AS createdAt,
      u.username, u.avatar_path AS avatarPath, t.template, c.title AS gameTitle, c.slug AS gameSlug, c.cover_url AS coverUrl
    FROM activity_events a
    LEFT JOIN users u ON u.id=a.user_id
    LEFT JOIN activity_templates t ON t.id=a.template_id
    LEFT JOIN catalogue_entries c ON c.source_game_id=a.game_id AND c.status='public'
    WHERE a.created_at >= datetime('now', ?) AND COALESCE(u.hide_from_activity, 0)=0
      AND (a.type <> 'catalogue_contribution' OR c.id IS NOT NULL)
    ORDER BY a.created_at DESC, a.id DESC${take ? ' LIMIT ?' : ''}`;
  const rows = db.prepare(query).all(`-${FEED_DAYS} days`, ...(take ? [take] : []));
  return rows.map(row => ({ id: row.id, type: row.type, username: row.username || 'Unknown curator', avatarUrl: row.avatarPath ? `/avatars/${row.avatarPath}` : null,
    template: row.template || '', gameTitle: row.gameTitle || '', gameSlug: row.gameSlug || '', coverUrl: row.coverUrl || '', createdAt: row.createdAt, ...parseData(row.dataJson) }));
}

function feed() {
  const pinned = db.prepare('SELECT * FROM announcements WHERE is_draft=0 AND pinned=1 LIMIT 1').get();
  const announcements = db.prepare("SELECT * FROM announcements WHERE is_draft=0 AND pinned=0 AND published_at >= datetime('now', ?) ORDER BY published_at DESC, id DESC").all(`-${FEED_DAYS} days`).map(feedAnnouncement);
  const entries = [...list(), ...announcements].sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)) || Number(right.id) - Number(left.id));
  return { entries, pinned: pinned ? feedAnnouncement(pinned) : null };
}

module.exports = { FEED_DAYS, ANNOUNCEMENT_BODY_MAX_LENGTH, ANNOUNCEMENT_TITLE_MAX_LENGTH, backfillContributions, backfillLevelUps, createAnnouncement, deleteAnnouncement, feed, list, listAnnouncements, pinAnnouncement, publishAnnouncement, recordContribution, recordJoin, recordLevelUp, unpinAnnouncement, unpublishAnnouncement, updateAnnouncement };
