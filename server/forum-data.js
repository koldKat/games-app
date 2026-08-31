'use strict';

const { db } = require('./db');

const TITLE_MAX = 180;
const BODY_MAX = 12_000;
const CATEGORY_NAME_MAX = 56;
const CATEGORY_DESCRIPTION_MAX = 240;
const DEFAULT_CATEGORIES = [
  ['General', 'general', 'Introductions, site chatter, and everything around the collection.', 10],
  ['Games & recommendations', 'games', 'Talk games, discoveries, recommendations, and the things worth playing next.', 20],
  ['Collections & hardware', 'collections', 'Shelves, editions, platforms, repairs, and the kit that keeps games alive.', 30],
  ['Kat·a·log', 'kat-a-log', 'Ideas, feedback, and bug reports for Game Kat·a·log.', 40],
];

function cleanText(value, maximum) { return String(value || '').trim().slice(0, maximum); }
function cleanSlug(value) { return String(value || '').trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56); }
function avatarUrl(path) { return path ? `/avatars/${path}` : null; }
function authorFields(alias = 'u', progressionAlias = 'up') { return `${alias}.username AS username, ${alias}.avatar_path AS avatarPath, COALESCE(${progressionAlias}.xp, 0) AS xp`; }

function seedCategories() {
  const statement = db.prepare(`INSERT INTO forum_categories (name, slug, description, sort_order)
    VALUES (?, ?, ?, ?) ON CONFLICT(slug) DO NOTHING`);
  db.transaction(() => DEFAULT_CATEGORIES.forEach(item => statement.run(...item)))();
}

function categories() {
  return db.prepare(`SELECT c.id, c.name, c.slug, c.description, c.sort_order AS sortOrder,
    COUNT(t.id) AS threadCount, MAX(t.last_post_at) AS lastPostAt
    FROM forum_categories c LEFT JOIN forum_threads t ON t.category_id=c.id
    GROUP BY c.id ORDER BY c.sort_order, c.name COLLATE NOCASE`).all();
}
function category(slug) { return db.prepare('SELECT id, name, slug, description, sort_order AS sortOrder FROM forum_categories WHERE slug=?').get(cleanSlug(slug)); }
function categoryById(id) { return db.prepare('SELECT id, name, slug, description, sort_order AS sortOrder FROM forum_categories WHERE id=?').get(Number(id)); }

function threads(categoryId) {
  return db.prepare(`SELECT t.id, t.title, t.reply_count AS replyCount, t.is_locked AS locked, t.is_pinned AS pinned,
    t.created_at AS createdAt, t.last_post_at AS lastPostAt, ${authorFields('u')}
    FROM forum_threads t JOIN users u ON u.id=t.user_id LEFT JOIN user_progression up ON up.user_id=u.id WHERE t.category_id=?
    ORDER BY t.is_pinned DESC, t.last_post_at DESC, t.id DESC`).all(Number(categoryId)).map(row => ({ ...row, locked: Boolean(row.locked), pinned: Boolean(row.pinned), avatarUrl: avatarUrl(row.avatarPath) }));
}
function recentThreads(limit = 8) {
  return db.prepare(`SELECT t.id, t.title, t.reply_count AS replyCount, t.is_locked AS locked, t.is_pinned AS pinned,
    t.created_at AS createdAt, t.last_post_at AS lastPostAt, c.name AS categoryName, c.slug AS categorySlug, ${authorFields('u')}
    FROM forum_threads t JOIN users u ON u.id=t.user_id LEFT JOIN user_progression up ON up.user_id=u.id JOIN forum_categories c ON c.id=t.category_id
    ORDER BY t.is_pinned DESC, t.last_post_at DESC, t.id DESC LIMIT ?`).all(Math.max(1, Math.min(30, Number(limit) || 8))).map(row => ({ ...row, locked: Boolean(row.locked), pinned: Boolean(row.pinned), avatarUrl: avatarUrl(row.avatarPath) }));
}
function thread(id) {
  const item = db.prepare(`SELECT t.id, t.category_id AS categoryId, t.user_id AS userId, t.title, t.body,
    t.reply_count AS replyCount, t.is_locked AS locked, t.is_pinned AS pinned, t.created_at AS createdAt,
    t.last_post_at AS lastPostAt, t.edited_at AS editedAt, c.name AS categoryName, c.slug AS categorySlug,
    ${authorFields('u')} FROM forum_threads t JOIN users u ON u.id=t.user_id LEFT JOIN user_progression up ON up.user_id=u.id JOIN forum_categories c ON c.id=t.category_id WHERE t.id=?`).get(Number(id));
  if (!item) return null;
  const posts = db.prepare(`SELECT p.id, p.user_id AS userId, p.body, p.is_deleted AS deleted, p.created_at AS createdAt,
    p.edited_at AS editedAt, ${authorFields('u')} FROM forum_posts p JOIN users u ON u.id=p.user_id LEFT JOIN user_progression up ON up.user_id=u.id WHERE p.thread_id=? ORDER BY p.created_at, p.id`).all(item.id)
    .map(post => ({ ...post, deleted: Boolean(post.deleted), avatarUrl: avatarUrl(post.avatarPath) }));
  return { thread: { ...item, locked: Boolean(item.locked), pinned: Boolean(item.pinned), avatarUrl: avatarUrl(item.avatarPath) }, posts };
}
function createThread(userId, input) {
  const title = cleanText(input?.title, TITLE_MAX); const body = cleanText(input?.body, BODY_MAX); const categoryId = Number(input?.categoryId);
  if (!title) throw new Error('A thread title is required.'); if (!body) throw new Error('Write something before posting.');
  if (!categoryById(categoryId)) throw new Error('Choose a forum category.');
  const result = db.prepare('INSERT INTO forum_threads (category_id, user_id, title, body) VALUES (?, ?, ?, ?)').run(categoryId, Number(userId), title, body);
  return thread(result.lastInsertRowid);
}
function createPost(userId, threadId, bodyValue) {
  const body = cleanText(bodyValue, BODY_MAX); if (!body) throw new Error('Write a reply before posting.');
  const existing = db.prepare('SELECT id, is_locked AS locked FROM forum_threads WHERE id=?').get(Number(threadId));
  if (!existing) return null; if (existing.locked) throw Object.assign(new Error('This thread is locked.'), { status: 403 });
  db.transaction(() => {
    db.prepare('INSERT INTO forum_posts (thread_id, user_id, body) VALUES (?, ?, ?)').run(existing.id, Number(userId), body);
    db.prepare('UPDATE forum_threads SET reply_count=reply_count+1, last_post_at=CURRENT_TIMESTAMP WHERE id=?').run(existing.id);
  })();
  return thread(existing.id);
}
function editThread(userId, threadId, input) {
  const title = cleanText(input?.title, TITLE_MAX); const body = cleanText(input?.body, BODY_MAX); if (!title || !body) throw new Error('A title and post are required.');
  const result = db.prepare('UPDATE forum_threads SET title=?, body=?, edited_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').run(title, body, Number(threadId), Number(userId));
  return result.changes ? thread(threadId) : null;
}
function editPost(userId, postId, bodyValue) {
  const body = cleanText(bodyValue, BODY_MAX); if (!body) throw new Error('A reply cannot be empty.');
  const post = db.prepare('SELECT thread_id AS threadId FROM forum_posts WHERE id=? AND user_id=? AND is_deleted=0').get(Number(postId), Number(userId));
  if (!post) return null;
  db.prepare('UPDATE forum_posts SET body=?, edited_at=CURRENT_TIMESTAMP WHERE id=?').run(body, Number(postId)); return thread(post.threadId);
}
function deleteThread(userId, threadId) { return db.prepare('DELETE FROM forum_threads WHERE id=? AND user_id=?').run(Number(threadId), Number(userId)).changes > 0; }
function deletePost(userId, postId) {
  const post = db.prepare('SELECT thread_id AS threadId FROM forum_posts WHERE id=? AND user_id=? AND is_deleted=0').get(Number(postId), Number(userId)); if (!post) return null;
  db.transaction(() => { db.prepare("UPDATE forum_posts SET is_deleted=1, body='[deleted]', edited_at=CURRENT_TIMESTAMP WHERE id=?").run(Number(postId)); db.prepare('UPDATE forum_threads SET reply_count=MAX(0,reply_count-1) WHERE id=?').run(post.threadId); })();
  return thread(post.threadId);
}
function setThreadState(id, property, value) {
  const column = property === 'pinned' ? 'is_pinned' : property === 'locked' ? 'is_locked' : null; if (!column) throw new Error('Unknown forum state.');
  const result = db.prepare(`UPDATE forum_threads SET ${column}=? WHERE id=?`).run(value ? 1 : 0, Number(id)); return result.changes ? thread(id) : null;
}
function adminDeleteThread(id) { return db.prepare('DELETE FROM forum_threads WHERE id=?').run(Number(id)).changes > 0; }
function saveCategory(input, id = null) {
  const name = cleanText(input?.name, CATEGORY_NAME_MAX); const slug = cleanSlug(input?.slug || name); const description = cleanText(input?.description, CATEGORY_DESCRIPTION_MAX); const sortOrder = Math.max(0, Math.min(9999, Number(input?.sortOrder) || 0));
  if (!name || !slug) throw new Error('Category name and slug are required.');
  if (id) { const result = db.prepare('UPDATE forum_categories SET name=?, slug=?, description=?, sort_order=? WHERE id=?').run(name, slug, description, sortOrder, Number(id)); return result.changes ? categoryById(id) : null; }
  return categoryById(db.prepare('INSERT INTO forum_categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)').run(name, slug, description, sortOrder).lastInsertRowid);
}
function deleteCategory(id) { return db.prepare('DELETE FROM forum_categories WHERE id=? AND NOT EXISTS (SELECT 1 FROM forum_threads WHERE category_id=?)').run(Number(id), Number(id)).changes > 0; }
function sitemapThreads() { return db.prepare('SELECT id, last_post_at AS lastPostAt FROM forum_threads ORDER BY last_post_at DESC').all(); }

seedCategories();
module.exports = { BODY_MAX, TITLE_MAX, categories, category, categoryById, threads, recentThreads, thread, createThread, createPost, editThread, editPost, deleteThread, deletePost, setThreadState, adminDeleteThread, saveCategory, deleteCategory, sitemapThreads };
