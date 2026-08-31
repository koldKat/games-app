'use strict';

// Private support threads: a Patch is opened by a visitor/account and Ping is
// the account-facing view of the same conversation.
const { db } = require('./db');

const PATCH_KINDS = Object.freeze(['bug', 'idea', 'game_data', 'other']);

function messages(threadId) {
  return db.prepare(`SELECT id, sender, body, created_at AS createdAt
    FROM patch_messages WHERE thread_id=? ORDER BY created_at, id`).all(threadId);
}
function hydrate(rows) { return rows.map(row => ({ ...row, messages: messages(row.id) })); }
function create({ userId = null, username = '', email = '', kind = 'other', body }) {
  const result = db.prepare(`INSERT INTO patch_threads (user_id, username, email, kind, admin_unread)
    VALUES (?, ?, ?, ?, 1)`).run(userId, username, email, kind);
  const id = Number(result.lastInsertRowid);
  db.prepare("INSERT INTO patch_messages (thread_id, sender, body) VALUES (?, 'user', ?)").run(id, body);
  return thread(id);
}
function thread(id) {
  const row = db.prepare(`SELECT id, user_id AS userId, username, email, kind, admin_unread AS adminUnread,
    user_unread AS userUnread, created_at AS createdAt FROM patch_threads WHERE id=?`).get(id);
  return row ? { ...row, messages: messages(row.id) } : null;
}
function forUser(userId) {
  return hydrate(db.prepare(`SELECT id, user_id AS userId, username, email, kind, admin_unread AS adminUnread,
    user_unread AS userUnread, created_at AS createdAt FROM patch_threads
    WHERE user_id=? AND deleted_by_user=0
    ORDER BY (SELECT MAX(created_at) FROM patch_messages WHERE thread_id=patch_threads.id) DESC, id DESC`).all(userId));
}
function all() {
  return hydrate(db.prepare(`SELECT id, user_id AS userId, username, email, kind, admin_unread AS adminUnread,
    user_unread AS userUnread, created_at AS createdAt FROM patch_threads WHERE deleted_by_admin=0
    ORDER BY (SELECT MAX(created_at) FROM patch_messages WHERE thread_id=patch_threads.id) DESC, id DESC`).all());
}
function forOperator() {
  return hydrate(db.prepare(`SELECT id, user_id AS userId, username, email, kind, admin_unread AS adminUnread,
    admin_unread AS userUnread, created_at AS createdAt FROM patch_threads WHERE deleted_by_admin=0
    ORDER BY (SELECT MAX(created_at) FROM patch_messages WHERE thread_id=patch_threads.id) DESC, id DESC`).all());
}
function addMessage(id, sender, body) {
  const result = db.prepare('INSERT INTO patch_messages (thread_id, sender, body) VALUES (?, ?, ?)').run(id, sender, body);
  if (sender === 'admin') db.prepare('UPDATE patch_threads SET user_unread=user_unread+1, deleted_by_user=0 WHERE id=?').run(id);
  else db.prepare('UPDATE patch_threads SET admin_unread=admin_unread+1, deleted_by_admin=0 WHERE id=?').run(id);
  return Number(result.lastInsertRowid);
}
function markUserRead(id, userId) { db.prepare('UPDATE patch_threads SET user_unread=0 WHERE id=? AND user_id=?').run(id, userId); }
function markAdminRead(id) { db.prepare('UPDATE patch_threads SET admin_unread=0 WHERE id=?').run(id); }
function removeForUser(id, userId) { return db.prepare('UPDATE patch_threads SET deleted_by_user=1 WHERE id=? AND user_id=?').run(id, userId).changes > 0; }
function removeForAdmin(id) { return db.prepare('UPDATE patch_threads SET deleted_by_admin=1 WHERE id=?').run(id).changes > 0; }
function unreadForUser(userId) { return db.prepare('SELECT COUNT(*) AS n FROM patch_threads WHERE user_id=? AND deleted_by_user=0 AND user_unread>0').get(userId).n; }
function adminUnread() { return db.prepare('SELECT COUNT(*) AS n FROM patch_threads WHERE deleted_by_admin=0 AND admin_unread>0').get().n; }

module.exports = { PATCH_KINDS, create, thread, forUser, forOperator, all, addMessage, markUserRead, markAdminRead, removeForUser, removeForAdmin, unreadForUser, adminUnread };
