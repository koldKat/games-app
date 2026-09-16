import { formatAnnouncementBody } from './announcement-format.js';
import { controllerLoaderMarkup } from './controller-loader.js';
import { openPublicProfile } from './public-profile.js';
import { UI_LOCALE, UI_TIMING } from './ui-policy.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const PEGI_ACTIVITY_COLORS = Object.freeze({
  3: '#4fbd69',
  7: '#83bd46',
  12: '#e4b447',
  16: '#e67b45',
  18: '#df5656',
});
function pegiGameLinkStyle(rating) {
  const color = PEGI_ACTIVITY_COLORS[rating];
  return color ? ` style="color:${color};text-decoration-color:${color}"` : '';
}
function age(value) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value.replace(' ', 'T') + 'Z')) / 1000));
  if (seconds < 60) return 'now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`; return `${Math.floor(seconds / 86400)}d`;
}
function preview(content, url, kind, alt, detail = '') {
  if (!url && !detail) return content;
  return `<span class="activity-preview-trigger activity-preview-trigger--${kind}">${content}${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">` : ''}${detail}</span>`;
}
export function dismissActivityPreview(link) {
  const trigger = link?.closest?.('.activity-preview-trigger');
  if (!trigger) return;
  trigger.classList.add('activity-preview-dismissed');
  // Clicking a game leaves its anchor focused behind the modal. Blur it before
  // returning the preview to normal hover behavior, otherwise :focus-within
  // can pin that first cover above every subsequent Signal entry.
  if (typeof link.blur === 'function') link.blur();
  trigger.addEventListener('pointerleave', () => trigger.classList.remove('activity-preview-dismissed'), { once: true });
}
function userLabel(entry) {
  const level = Number(entry.userLevel);
  const profile = Number.isFinite(level)
    ? `<span class="activity-preview-profile"><b>LV ${level}</b>${entry.userTitle ? `<small>${escapeHtml(entry.userTitle)}</small>` : ''}</span>`
    : '';
  const username = escapeHtml(entry.username);
  const name = entry.publicProfile
    ? `<button type="button" class="activity-profile-button" data-public-profile="${username}" aria-label="Open ${username}'s public profile">${username}</button>`
    : `<b>${username}</b>`;
  return preview(name, entry.avatarUrl, 'avatar', `${entry.username} avatar`, profile);
}
function phrase(entry) {
  if (entry.type === 'announcement') return `<strong>${escapeHtml(entry.title)}</strong><span class="activity-announcement-body">${formatAnnouncementBody(entry.body)}</span>`;
  const user = userLabel(entry);
  if (entry.type === 'catalogue_contribution') {
    const rating = [3, 7, 12, 16, 18].includes(Number(entry.gamePegi)) ? Number(entry.gamePegi) : null;
    const game = preview(`<a class="activity-game-link${rating ? ` activity-game-link--pegi-${rating}` : ''}"${pegiGameLinkStyle(rating)} href="/game/${encodeURIComponent(entry.gameSlug)}">${escapeHtml(entry.gameTitle)}</a>`, entry.coverUrl, 'cover', `${entry.gameTitle} cover`);
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
  const pinIcon = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
  </svg>`;
  return `<section class="activity-pinned-card"><header>${pinIcon}<strong>${escapeHtml(entry.title)}</strong></header><div>${formatAnnouncementBody(entry.body)}</div></section>`;
}
function timestamp(value) { return new Date(String(value || '').replace(' ', 'T') + 'Z'); }
function dayLabel(value) {
  const date = timestamp(value); const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat(UI_LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' }).format(date);
}
const CONTRIBUTION_COLLAPSE_THRESHOLD = 6;
const SIGNAL_MOBILE_QUERY = '(max-width: 760px)';
const KATALOG_ACTIVITY_TYPES = new Set(['catalogue_contribution']);
function activityLane(entry) {
  if (entry.type === 'announcement') return 'announcement';
  return KATALOG_ACTIVITY_TYPES.has(entry.type) ? 'katalog' : 'collector';
}
function contributionGroup(entry, entries, id, groupKey) {
  const count = entries.length;
  const username = escapeHtml(entry.username);
  return `<section class="activity-contribution-group">
    <div class="activity-group-summary">${userLabel(entry)}<button type="button" class="activity-group-toggle" data-activity-group-toggle="${id}" data-activity-group-key="${escapeHtml(groupKey)}" aria-controls="${id}" aria-expanded="false" aria-label="Show ${username}'s ${count} contributed games"><span class="activity-group-chevron" aria-hidden="true">▶</span><span class="activity-group-count">contributed ${count} game${count === 1 ? '' : 's'}</span></button></div>
    <div class="activity-group-items" id="${id}" hidden>${entries.map(card).join('')}</div>
  </section>`;
}
function collapseContributions(entries, dayIndex, dayKey, idPrefix = 'activity') {
  const byUser = new Map();
  for (const entry of entries) {
    if (entry.type !== 'catalogue_contribution') continue;
    const group = byUser.get(entry.username) || []; group.push(entry); byUser.set(entry.username, group);
  }
  const collapsed = new Set([...byUser.values()].filter(group => group.length >= CONTRIBUTION_COLLAPSE_THRESHOLD).flat());
  const rendered = new Set(); let groupIndex = 0;
  return entries.map(entry => {
    if (!collapsed.has(entry)) return card(entry);
    const group = byUser.get(entry.username);
    if (rendered.has(group)) return '';
    rendered.add(group);
    return contributionGroup(entry, group, `${idPrefix}-contributions-${dayIndex}-${groupIndex++}`, `${dayKey}:${entry.username}`);
  }).join('');
}
function groupedCards(entries, idPrefix = 'activity') {
  const groups = new Map();
  for (const entry of entries) {
    const key = timestamp(entry.createdAt).toDateString();
    const group = groups.get(key) || { key, label: dayLabel(entry.createdAt), entries: [] };
    group.entries.push(entry); groups.set(key, group);
  }
  return [...groups.values()].map((group, index) => `<section class="activity-day"><h3>${escapeHtml(group.label)}</h3><div>${collapseContributions(group.entries, index, group.key, idPrefix)}</div></section>`).join('');
}
function laneMarkup(entries, lane, heading, description) {
  const laneEntries = entries.filter(entry => activityLane(entry) === lane);
  const empty = lane === 'katalog' ? 'No Kat·a·log updates in range.' : 'No collector signals in range.';
  return `<section class="activity-column activity-column--${lane}">
    <header><h3>${heading}</h3><p>${description}</p></header>
    <div class="activity-column-stream">${laneEntries.length ? groupedCards(laneEntries, `activity-${lane}`) : `<p class="activity-feed-empty">${empty}</p>`}</div>
  </section>`;
}
function newspaperCards(entries) {
  const announcements = entries.filter(entry => activityLane(entry) === 'announcement');
  const announcementMarkup = announcements.length
    ? `<div class="activity-newspaper-announcements">${groupedCards(announcements, 'activity-announcement')}</div>`
    : '';
  return `${announcementMarkup}<div class="activity-newspaper">
    ${laneMarkup(entries, 'katalog', 'KAT·A·LOG // UPDATES', 'Games joining the shared index.')}
    ${laneMarkup(entries, 'collector', 'COLLECTORS // SIGNAL', 'New curators, levels, and titles.')}
  </div>`;
}
export function createActivityFeed() {
  const hosts = () => [...document.querySelectorAll('[data-activity-feed]')];
  const mobileLayout = window.matchMedia(SIGNAL_MOBILE_QUERY);
  let refreshTimer = null; let source = null; let cachedPayload = null; let cachedAt = 0; let loading = null; let layoutListening = false;
  function setGroupExpanded(host, groupKey, expanded) {
    host.querySelectorAll('[data-activity-group-key]').forEach(toggle => {
      if (toggle.dataset.activityGroupKey !== groupKey) return;
      const list = host.querySelector(`#${CSS.escape(toggle.dataset.activityGroupToggle)}`);
      if (!list) return;
      list.hidden = !expanded;
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', `${expanded ? 'Hide' : 'Show'} contributed games`);
    });
  }
  function bindInteractions(host) {
    if (host.dataset.activityGroupsBound === 'true') return;
    host.dataset.activityGroupsBound = 'true';
    host.addEventListener('click', event => {
      const profile = event.target.closest('[data-public-profile]');
      if (profile) {
        event.preventDefault(); event.stopPropagation(); dismissActivityPreview(profile);
        void openPublicProfile(profile.dataset.publicProfile); return;
      }
      const toggle = event.target.closest('[data-activity-group-toggle]'); if (!toggle) return;
      setGroupExpanded(host, toggle.dataset.activityGroupKey, toggle.getAttribute('aria-expanded') !== 'true');
    });
  }
  function render(targets, body) {
    const entries = body.entries || []; const pinned = body.pinned || null;
    for (const host of targets) {
      const expandedKeys = new Set([...host.querySelectorAll('[data-activity-group-key][aria-expanded="true"]')].map(toggle => toggle.dataset.activityGroupKey));
      const limit = host.dataset.activityLimit === 'all' ? entries.length : Math.max(1, Number(host.dataset.activityLimit) || 3);
      const visible = entries.slice(0, limit);
      const pinnedMarkup = pinned ? pinnedCard(pinned) : '';
      const desktopNewspaper = host.dataset.activityLayout === 'newspaper' && !mobileLayout.matches;
      const entriesMarkup = desktopNewspaper
        ? newspaperCards(visible)
        : visible.length
          ? (host.dataset.activityGrouped === 'true' ? groupedCards(visible, host.dataset.activityLayout === 'newspaper' ? 'activity-mobile' : 'activity') : visible.map(card).join(''))
          : '';
      host.innerHTML = pinnedMarkup || entriesMarkup ? `${pinnedMarkup}${entriesMarkup}` : '<p class="activity-feed-empty">Quiet channel. New signal soon.</p>';
      for (const groupKey of expandedKeys) setGroupExpanded(host, groupKey, true);
      host.dataset.activityLoaded = 'true'; bindInteractions(host);
    }
  }
  function scheduleSignalLoaders(targets) {
    return setTimeout(() => {
      for (const host of targets) {
        if (!host.classList.contains('signal-feed') || host.dataset.activityLoaded === 'true') continue;
        host.innerHTML = `<div class="library-loader signal-feed-loader" role="status">${controllerLoaderMarkup('Tuning the signal…')}</div>`;
      }
    }, UI_TIMING.signalLoaderDelayMs);
  }
  async function load({ force = false } = {}) {
    const targets = hosts();
    if (!targets.length) return;
    if (cachedPayload) render(targets, cachedPayload);
    if (!force && cachedPayload && Date.now() - cachedAt < UI_TIMING.signalCacheMs) return;
    if (loading) return loading;
    const loaderTimer = cachedPayload ? null : scheduleSignalLoaders(targets);
    loading = (async () => {
      try {
        const response = await fetch('/api/activity', { cache: 'no-store' }); const body = await response.json();
        cachedPayload = body; cachedAt = Date.now(); render(hosts(), body);
      } catch {
        if (!cachedPayload) for (const host of hosts()) { host.innerHTML = '<p class="activity-feed-empty">Signal temporarily unavailable.</p>'; host.dataset.activityLoaded = 'true'; }
      } finally { if (loaderTimer) clearTimeout(loaderTimer); loading = null; }
    })();
    return loading;
  }
  function refreshLayout() {
    if (cachedPayload && hosts().some(host => host.dataset.activityLayout === 'newspaper')) render(hosts(), cachedPayload);
  }
  function start() {
    if (!layoutListening) { mobileLayout.addEventListener('change', refreshLayout); layoutListening = true; }
    void load(); source?.close(); source = new EventSource('/api/activity/stream');
    source.addEventListener('activity-changed', () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void load({ force: true }), UI_TIMING.signalRefreshDebounceMs); });
  }
  return { start, stop: () => {
    clearTimeout(refreshTimer); refreshTimer = null; source?.close(); source = null;
    if (layoutListening) { mobileLayout.removeEventListener('change', refreshLayout); layoutListening = false; }
  }, load };
}
