import { formatAnnouncementBody } from './announcement-format.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
function age(value) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value.replace(' ', 'T') + 'Z')) / 1000));
  if (seconds < 60) return 'now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`; return `${Math.floor(seconds / 86400)}d`;
}
function preview(content, url, kind, alt) {
  if (!url) return content;
  return `<span class="activity-preview-trigger activity-preview-trigger--${kind}">${content}<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"></span>`;
}
export function dismissActivityPreview(link) {
  const trigger = link?.closest?.('.activity-preview-trigger');
  if (!trigger) return;
  trigger.classList.add('activity-preview-dismissed');
  trigger.addEventListener('pointerenter', () => trigger.classList.remove('activity-preview-dismissed'), { once: true });
}
function userLabel(entry) {
  return preview(`<b>${escapeHtml(entry.username)}</b>`, entry.avatarUrl, 'avatar', `${entry.username} avatar`);
}
function phrase(entry) {
  if (entry.type === 'announcement') return `<strong>${escapeHtml(entry.title)}</strong><span class="activity-announcement-body">${formatAnnouncementBody(entry.body)}</span>`;
  const user = userLabel(entry);
  if (entry.type === 'catalogue_contribution') {
    const game = preview(`<a class="activity-game-link" href="/game/${encodeURIComponent(entry.gameSlug)}">${escapeHtml(entry.gameTitle)}</a>`, entry.coverUrl, 'cover', `${entry.gameTitle} cover`);
    return `${user} contributed ${game} to the Kat·a·log.`;
  }
  const base = escapeHtml(entry.template || '').replaceAll('{name}', user).replaceAll('{level}', escapeHtml(entry.level));
  if (entry.type === 'level_up' && entry.titleGained) return `${base} <em>New title: ${escapeHtml(entry.title)}.</em>`;
  return base;
}
function card(entry) {
  return `<article class="activity-entry activity-entry--${escapeHtml(entry.type)}"><p>${phrase(entry)}</p><time datetime="${escapeHtml(entry.createdAt)}">${age(entry.createdAt)}</time></article>`;
}
function pinnedCard(entry) {
  return `<section class="activity-pinned-card"><header><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg><strong>${escapeHtml(entry.title)}</strong></header><div>${formatAnnouncementBody(entry.body)}</div></section>`;
}
function timestamp(value) { return new Date(String(value || '').replace(' ', 'T') + 'Z'); }
function dayLabel(value) {
  const date = timestamp(value); const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' }).format(date);
}
function groupedCards(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = timestamp(entry.createdAt).toDateString();
    const group = groups.get(key) || { label: dayLabel(entry.createdAt), entries: [] };
    group.entries.push(entry); groups.set(key, group);
  }
  return [...groups.values()].map(group => `<section class="activity-day"><h3>${escapeHtml(group.label)}</h3><div>${group.entries.map(card).join('')}</div></section>`).join('');
}
export function createActivityFeed() {
  const hosts = () => [...document.querySelectorAll('[data-activity-feed]')]; let refreshTimer = null; let source = null;
  async function load() {
    const targets = hosts();
    if (!targets.length) return;
    try {
      const response = await fetch('/api/activity', { cache: 'no-store' }); const body = await response.json();
      const entries = body.entries || []; const pinned = body.pinned || null;
      for (const host of targets) {
        const limit = host.dataset.activityLimit === 'all' ? entries.length : Math.max(1, Number(host.dataset.activityLimit) || 3);
        const visible = entries.slice(0, limit);
        const pinnedMarkup = pinned ? pinnedCard(pinned) : '';
        const entriesMarkup = visible.length ? (host.dataset.activityGrouped === 'true' ? groupedCards(visible) : visible.map(card).join('')) : '';
        host.innerHTML = pinnedMarkup || entriesMarkup ? `${pinnedMarkup}${entriesMarkup}` : '<p class="activity-feed-empty">Quiet channel. New signal soon.</p>';
      }
    } catch { for (const host of targets) host.innerHTML = '<p class="activity-feed-empty">Signal temporarily unavailable.</p>'; }
  }
  function start() {
    void load(); source?.close(); source = new EventSource('/api/activity/stream');
    source.addEventListener('activity-changed', () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void load(), 120); });
  }
  return { start, stop: () => { clearTimeout(refreshTimer); refreshTimer = null; source?.close(); source = null; }, load };
}
