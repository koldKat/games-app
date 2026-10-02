import { state, filters, runtime } from './runtime.js';
import { gameMatchesFilters, renderGames } from '../library/render.js';
import { compareGames } from '../library/game-sorting.js';
import { loadGames } from '../library/data.js';
import { UI_TIMING } from './ui-policy.js';
import { openEventStream } from './events.js';
import {
  refreshAfterLibraryImport, progressionUi, steamImporter, gogImporter, patchUi,
  coverProviderSettings,
} from '../boot/services.js';
import { $ } from './dom.js';
import {
  renderCoverStatus, renderPegiBulkStatus, renderHltbBulkStatus, renderDescriptionBulkStatus,
  loadCoverStatus, loadPegiStatus, loadHltbStatus, loadDescriptionStatus,
} from '../metadata/bulk-ui.js';
import { showAuth } from '../account/session.js';

function applyGamePatch(game) {
  if (!game?.id) return;
  if (state.loading) { state.pendingGamePatches.set(game.id, game); return; }
  const existingIndex = state.games.findIndex(item => item.id === game.id);
  if (existingIndex !== -1) {
    state.games.splice(existingIndex, 1);
    if (gameMatchesFilters(game)) state.games.push(game);
    state.games.sort((left, right) => compareGames(left, right, filters.sort.value));
    renderGames();
  }
  clearTimeout(runtime.groupFilterRefreshTimer);
  runtime.groupFilterRefreshTimer = setTimeout(() => { void loadGames(state.page); }, UI_TIMING.libraryGroupRefreshDebounceMs);
}

function flushPendingGamePatches() {
  const pending = [...state.pendingGamePatches.values()]; state.pendingGamePatches.clear();
  if (pending.length) {
    clearTimeout(runtime.groupFilterRefreshTimer);
    runtime.groupFilterRefreshTimer = setTimeout(() => { void loadGames(state.page); }, UI_TIMING.libraryGroupRefreshDebounceMs);
  }
}

function connectEventStream() {
  state.stopEvents?.();
  const generation = runtime.sessionGeneration;
  state.stopEvents = openEventStream({ onEvent(event, data) {
    if (generation !== runtime.sessionGeneration || !state.user) return;
    if (event === 'game-updated') applyGamePatch(data.game);
    else if (event === 'games-imported') { void refreshAfterLibraryImport(); }
    else if (event === 'version-updated') $('#app-version').textContent = data.version || 'dev';
    else if (event === 'progression-updated') progressionUi.handleEvent(data);
    else if (event === 'cover-job') { state.coverStatus = mergeLiveJobStatus(state.coverStatus, data.job); renderCoverStatus(); }
    else if (event === 'pegi-job') { state.pegiStatus = mergeLiveJobStatus(state.pegiStatus, data.job); renderPegiBulkStatus(); }
    else if (event === 'hltb-job') { state.hltbStatus = mergeLiveJobStatus(state.hltbStatus, data.job); renderHltbBulkStatus(); }
    else if (event === 'description-job') { state.descriptionStatus = mergeLiveJobStatus(state.descriptionStatus, data.job); renderDescriptionBulkStatus(); }
    else if (event === 'steam-import-progress') steamImporter.handleEvent(data);
    else if (event === 'gog-import-progress') gogImporter.handleEvent(data);
    else if (event === 'ping-updated') patchUi.handleEvent(event, data);
    else if (event === 'stream-reset') { loadGames(); loadCoverStatus(); coverProviderSettings.load(); loadPegiStatus(); loadHltbStatus(); loadDescriptionStatus(); }
    else coverProviderSettings.handleEvent(event, data);
  }, onUnauthorized() {
    if (generation !== runtime.sessionGeneration) return;
    runtime.sessionGeneration++; showAuth('Your session expired. Authenticate again.');
  } });
}

function mergeLiveJobStatus(status, job) {
  const missing = Math.max(0, Number(job.total || 0) - Number(job.matched || 0) - Number(job.skipped || 0));
  return { ...(status || {}), job, missing };
}

export { connectEventStream, flushPendingGamePatches };
