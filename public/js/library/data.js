import { filters, state, runtime } from '../core/runtime.js';
import { LIBRARY_PAGE_SIZE } from '../core/ui-policy.js';
import { renderGames } from './render.js';
import { api, toast } from '../core/api.js';
import { flushPendingGamePatches } from '../core/live-updates.js';
import { setIgdbAvailability } from '../editor/lookups.js';
import { renderStats, renderPlatforms } from './summary.js';

function queryString() {
  const params = new URLSearchParams();
  for (const [key, element] of Object.entries(filters)) if (element.value) params.set(key, element.value);
  params.set('page', String(state.page));
  params.set('limit', String(LIBRARY_PAGE_SIZE));
  return params.toString();
}

function randomQueryString() {
  const params = new URLSearchParams();
  for (const [key, element] of Object.entries(filters)) if (key !== 'sort' && element.value) params.set(key, element.value);
  return params.toString();
}

async function loadGames(page = 1) {
  clearTimeout(runtime.groupFilterRefreshTimer);
  const sequence = ++runtime.gameLoadSequence; const userId = state.user?.id;
  const previousPage = state.page;
  state.page = Math.max(1, Number(page) || 1);
  state.loading = true; renderGames();
  try {
    const result = await api(`/api/games?${queryString()}`);
    if (sequence !== runtime.gameLoadSequence || state.user?.id !== userId) return;
    state.games = result.games || [];
    state.gameTotal = Number(result.total) || 0;
    state.gamePages = Math.max(1, Number(result.pages) || 1);
    state.page = Math.min(Math.max(1, Number(result.page) || 1), state.gamePages);
  } catch (error) {
    if (sequence === runtime.gameLoadSequence && state.user?.id === userId) { state.page = previousPage; toast(error.message); }
  }
  finally {
    if (sequence === runtime.gameLoadSequence && state.user?.id === userId) { state.loading = false; renderGames(); flushPendingGamePatches(); }
  }
}

function refreshLibraryPage(page = state.page) {
  return Promise.all([loadGames(page), loadStatsAndMeta()]);
}

async function loadStatsAndMeta() {
  const sequence = ++runtime.metaLoadSequence; const userId = state.user?.id;
  try {
    const [stats, meta] = await Promise.all([api('/api/stats'), api('/api/meta')]);
    if (sequence !== runtime.metaLoadSequence || state.user?.id !== userId) return;
    state.stats = stats; state.platforms = meta.platforms; state.integrations = meta.integrations || {};
    setIgdbAvailability(Boolean(state.integrations.igdb)); renderStats(); renderPlatforms();
  } catch (error) { if (sequence === runtime.metaLoadSequence && state.user?.id === userId) toast(error.message); }
}

export { loadGames, loadStatsAndMeta, randomQueryString, refreshLibraryPage };
