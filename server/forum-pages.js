'use strict';

const { SITE_URL, escapeHtml, pageShell } = require('./catalogue-pages');

function formatBody(value) { return escapeHtml(value).replace(/\n/g, '<br>'); }
function timestamp(value) { return String(value || '').replace(' ', 'T') + 'Z'; }
function when(value) { return value ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp(value))) : ''; }
function author(item) { return `<span class="forum-author">${escapeHtml(item.username)}</span>`; }
function level(xp) { return Math.min(100, Math.floor((-1 + Math.sqrt(1 + (8 * Math.max(0, Number(xp) || 0)) / 1000)) / 2)); }
function authorPanel(item) {
  const name = escapeHtml(item.username || 'Deleted account'); const initial = escapeHtml(String(item.username || '?').slice(0, 1).toLocaleUpperCase());
  const portrait = item.avatarUrl ? `<img src="${escapeHtml(item.avatarUrl)}" alt="" loading="lazy">` : `<span class="forum-user-initial">${initial}</span>`;
  return `<aside class="forum-user-card">${portrait}<b>${name}</b><small>LV ${level(item.xp)}</small></aside>`;
}
function threadRow(item) { return `<article class="forum-thread-row"><div class="forum-thread-content"><div class="forum-thread-tags">${item.pinned ? '<span>PINNED</span>' : ''}${item.locked ? '<span>LOCKED</span>' : ''}</div><div class="forum-thread-heading"><h3><a href="/forum/thread/${item.id}">${escapeHtml(item.title)}</a></h3><aside><strong>${item.replyCount}</strong><span>${item.replyCount === 1 ? 'reply' : 'replies'}</span><small>${when(item.lastPostAt)}</small></aside></div><p>Started by ${author(item)} · ${when(item.createdAt)}</p></div></article>`; }
function hero(coverUrls, title, copy, kicker = 'PUBLIC // DISCUSSION') {
  const covers = coverUrls.filter(Boolean).slice(0, 5);
  const art = covers.length ? `<div class="hero-art catalogue-hero-art" aria-hidden="true">${covers.map((cover, index) => `<span class="hero-cover catalogue-hero-cover hero-cover-${index + 1} has-art"><img src="${escapeHtml(cover)}" alt="" decoding="async"></span>`).join('')}</div>` : '';
  return `<section class="hero catalogue-hero forum-hero"><div><p class="kicker">${kicker}</p><h1>${escapeHtml(title)}</h1><p class="hero-copy">${escapeHtml(copy)}</p></div>${art}</section>`;
}
function shell({ title, description, canonical, content, user, progress, coverUrls = [], type = 'CollectionPage' }) {
  return pageShell({ title, description, canonical, content, user, progress, coverUrls, currentView: 'forum',
    structuredData: { '@context': 'https://schema.org', '@type': type, name: title.replace(' // Game Kat·a·log', ''), url: canonical, description },
    extraStyles: '<link rel="stylesheet" href="/css/forum.css">', extraScripts: '<script type="module" src="/js/forum-page.js"></script>' });
}
function threadComposer(category) {
  if (!category) return '';
  return `<section class="forum-inline-composer" data-forum-inline-composer hidden><form class="forum-composer" data-forum-thread-form><header><span>NEW THREAD // ${escapeHtml(category.name)}</span><button type="button" data-forum-inline-close aria-label="Close">×</button></header><label>Channel<input value="${escapeHtml(category.name)}" disabled></label><input type="hidden" name="categoryId" value="${category.id}"><label>Title<input name="title" maxlength="180" required autocomplete="off" placeholder="Give the thread a clear title"></label><label>Message<textarea name="body" rows="8" maxlength="12000" required placeholder="Start the conversation…"></textarea></label><p data-forum-error role="status"></p><footer><button type="button" data-forum-inline-close>Cancel</button><button type="submit">Publish thread</button></footer></form></section>`;
}
function renderIndex({ categories, recent, user, progress, coverUrls = [] }) {
  const description = 'Join the public Game Kat·a·log forum for game recommendations, collecting, hardware, and Kat·a·log discussion.';
  const categoryCards = categories.map(item => `<a class="forum-category-card" href="/forum/c/${encodeURIComponent(item.slug)}"><div class="forum-category-heading"><h2>${escapeHtml(item.name)}</h2><span><b>${item.threadCount}</b> ${item.threadCount === 1 ? 'thread' : 'threads'}${item.lastPostAt ? `<time>${when(item.lastPostAt)}</time>` : ''}</span></div><p>${escapeHtml(item.description)}</p></a>`).join('');
  return shell({ title: 'Forum // Game Kat·a·log', description, canonical: `${SITE_URL}/forum`, user, progress, coverUrls,
    content: `<main class="catalogue-main forum-main">${hero(coverUrls, 'The Game Kat·a·log forum', 'A small, public place to compare notes on games, hardware, shelves, and the systems around them.')}<section class="forum-toolbar"><div><strong>Find your signal</strong><span>Choose a channel to start a thread; read freely or sign in to contribute.</span></div></section><section class="forum-categories"><header><p class="kicker">CHANNELS // OPEN</p><h2>Choose a channel</h2></header><div>${categoryCards}</div></section><section class="forum-recent"><header><p class="kicker">RECENT // SIGNAL</p><h2>Latest threads</h2></header><div class="forum-thread-list">${recent.map(threadRow).join('') || '<p class="forum-empty">The forum is ready when the first conversation is.</p>'}</div></section></main>` });
}
function renderCategory({ category, threads, categories, user, progress, coverUrls = [] }) {
  if (!category) return renderNotFound({ user, progress, coverUrls });
  const description = `${category.name} discussions in the public Game Kat·a·log forum.`;
  return shell({ title: `${category.name} forum // Game Kat·a·log`, description, canonical: `${SITE_URL}/forum/c/${encodeURIComponent(category.slug)}`, user, progress, coverUrls,
    content: `<main class="catalogue-main forum-main">${hero(coverUrls, category.name, category.description, 'FORUM // CHANNEL')}<nav class="forum-crumbs"><a href="/forum">Forum</a><span>/</span><b>${escapeHtml(category.name)}</b></nav><section class="forum-toolbar"><div><strong>${threads.length} ${threads.length === 1 ? 'thread' : 'threads'}</strong><span>Newest replies rise; pinned threads stay on top.</span></div>${user ? '<button class="forum-action" type="button" data-forum-new-thread>Start a thread</button>' : '<a class="forum-action" href="/">Sign in to contribute</a>'}</section>${user ? threadComposer(category) : ''}<section class="forum-recent"><div class="forum-thread-list">${threads.map(threadRow).join('') || '<p class="forum-empty">No threads in this channel yet.</p>'}</div></section></main>` });
}
function postCard(item, isOpening = false, currentUserId = 0) {
  const own = Number(item.userId) === Number(currentUserId);
  return `<div class="forum-post-wrap"><article class="forum-post${item.deleted ? ' deleted' : ''}" data-forum-post="${item.id}"><header><div>${author(item)}${isOpening ? '<span class="forum-op">OP</span>' : ''}</div><time datetime="${escapeHtml(timestamp(item.createdAt))}">${when(item.createdAt)}${item.editedAt ? ' · edited' : ''}</time></header><div class="forum-post-body" data-forum-body>${item.deleted ? 'This reply was deleted.' : formatBody(item.body)}</div>${own && !item.deleted ? `<footer><button type="button" data-forum-edit-post="${item.id}">Edit</button><button type="button" data-forum-delete-post="${item.id}">Delete</button></footer>` : ''}</article>${authorPanel(item)}</div>`;
}
function renderThread({ data, user, progress, coverUrls = [] }) {
  if (!data) return renderNotFound({ user, progress, coverUrls });
  const { thread, posts } = data; const description = `${thread.title} // a Game Kat·a·log forum discussion.`;
  const own = Number(thread.userId) === Number(user?.id);
  return shell({ title: `${thread.title} // Game Kat·a·log Forum`, description, canonical: `${SITE_URL}/forum/thread/${thread.id}`, user, progress, coverUrls, type: 'DiscussionForumPosting',
    content: `<main class="catalogue-main forum-main" data-forum-thread-id="${thread.id}">${hero(coverUrls, thread.title, `${thread.replyCount} ${thread.replyCount === 1 ? 'reply' : 'replies'} in ${thread.categoryName}`, 'FORUM // THREAD')}<nav class="forum-crumbs"><a href="/forum">Forum</a><span>/</span><a href="/forum/c/${encodeURIComponent(thread.categorySlug)}">${escapeHtml(thread.categoryName)}</a><span>/</span><b>${escapeHtml(thread.title)}</b></nav><section class="forum-thread-view"><div class="forum-post-wrap"><article class="forum-post forum-opening" data-forum-thread="${thread.id}"><header><div>${author(thread)}<span class="forum-op">OP</span>${thread.pinned ? '<span class="forum-state">PINNED</span>' : ''}${thread.locked ? '<span class="forum-state">LOCKED</span>' : ''}</div><time>${when(thread.createdAt)}${thread.editedAt ? ' · edited' : ''}</time></header><div class="forum-post-body" data-forum-body>${formatBody(thread.body)}</div>${own ? `<footer><button type="button" data-forum-edit-thread="${thread.id}">Edit thread</button><button type="button" data-forum-delete-thread="${thread.id}">Delete thread</button></footer>` : ''}</article>${authorPanel(thread)}</div><div class="forum-replies">${posts.map(post => postCard(post, false, user?.id)).join('')}</div>${thread.locked ? '<p class="forum-locked-note">This thread is locked to new replies.</p>' : user ? '<form class="forum-reply-form" data-forum-reply-form><label>Reply<textarea name="body" rows="6" maxlength="12000" placeholder="Write a reply…"></textarea></label><p data-forum-error role="status"></p><button type="submit">Post reply</button></form>' : '<aside class="forum-signin">Want to join in? <a href="/">Sign in or create an account</a> to reply.</aside>'}</section></main>` });
}
function renderNotFound({ user, progress, coverUrls }) { return shell({ title: 'Forum page not found // Game Kat·a·log', description: 'The requested forum page could not be found.', canonical: `${SITE_URL}/forum`, user, progress, coverUrls, content: '<main class="catalogue-main forum-main"><section class="forum-empty"><strong>That forum page does not exist.</strong><a href="/forum">Back to the forum</a></section></main>' }); }

module.exports = { renderIndex, renderCategory, renderThread };
