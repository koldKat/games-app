import { $ } from '../core/dom.js';
import { state, filters } from '../core/runtime.js';
import { UI_LOCALE, MULTIPLATFORM_FILTER_VALUE } from '../core/ui-policy.js';
import { escapeHtml } from '../core/api.js';
import { platformDisplayName } from './platforms.js';

function count(group, label) { return group?.find(row => row.label === label)?.count || 0; }

function renderStats() {
  $('#stat-total').textContent = state.stats?.total?.toLocaleString(UI_LOCALE) || '0';
  $('#stat-owned-physical').textContent = count(state.stats?.ownedFormats, 'physical').toLocaleString(UI_LOCALE);
  $('#stat-owned-digital').textContent = count(state.stats?.ownedFormats, 'digital').toLocaleString(UI_LOCALE);
  $('#stat-wanted').textContent = count(state.stats?.ownership, 'wanted').toLocaleString(UI_LOCALE);
  $('#stat-backlog').textContent = count(state.stats?.play, 'backlog').toLocaleString(UI_LOCALE);
  $('#stat-playing').textContent = count(state.stats?.play, 'playing').toLocaleString(UI_LOCALE);
  $('#stat-completed').textContent = count(state.stats?.play, 'completed').toLocaleString(UI_LOCALE);
  $('#stat-paused').textContent = count(state.stats?.play, 'paused').toLocaleString(UI_LOCALE);
  $('#stat-abandoned').textContent = count(state.stats?.play, 'abandoned').toLocaleString(UI_LOCALE);
  $('#stat-favorites').textContent = Number(state.stats?.favorites || 0).toLocaleString(UI_LOCALE);
}

function renderPlatforms() {
  const current = filters.platform.value;
  filters.platform.innerHTML = `<option value="">All platforms</option><option value="${MULTIPLATFORM_FILTER_VALUE}">Multiple platforms</option>`
    + state.platforms.map(platform => `<option value="${escapeHtml(platform)}">${escapeHtml(platformDisplayName(platform))}</option>`).join('');
  filters.platform.value = current;
}

export { renderStats, renderPlatforms };
