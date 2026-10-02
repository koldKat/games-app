import { selectedCopyIds, $$, $ } from '../core/dom.js';
import { runtime, state, filters } from '../core/runtime.js';
import { coverProviderSettings, endSessionResume, progressionUi, patchUi } from '../boot/services.js';
import { setIgdbAvailability } from '../editor/lookups.js';
import { loadAuthCovers, stageAppDecorations } from '../covers/decorations.js';
import { showAuthForm } from './authentication.js';
import { UI_TIMING } from '../core/ui-policy.js';
import { applyPreferences } from './preferences.js';
import { loadGames, loadStatsAndMeta } from '../library/data.js';
import { connectEventStream } from '../core/live-updates.js';
import { katalogNavigation } from '../boot/navigation.js';
import { openDetails } from '../details/dialog.js';
import { api, toast } from '../core/api.js';
import { cancelPendingLibrarySearch } from '../library/filters.js';

function showAuth(message = '') {
  cancelPendingLibrarySearch();
  progressionUi.reset();
  katalogNavigation.suspend();
  for (const dialog of $$('dialog[open]')) {
    if (dialog.hasAttribute('data-katalog-game-dialog')) dialog.dataset.skipCloseNavigation = 'true';
    dialog.close();
  }
  selectedCopyIds.clear();
  runtime.decorationSequence += 1;
  state.stopEvents?.(); state.stopEvents = null;
  runtime.gameLoadSequence++; runtime.metaLoadSequence++; state.pendingGamePatches.clear(); state.loading = false;
  state.coverStatus = null; state.pegiStatus = null; state.hltbStatus = null; state.descriptionStatus = null;
  coverProviderSettings.reset();
  runtime.preferencesReady = false; runtime.preferencesDirty = false; clearTimeout(runtime.preferenceSaveTimer);
  clearTimeout(runtime.groupFilterRefreshTimer);
  state.games = []; state.gameTotal = 0; state.gamePages = 1; state.stats = null; state.platforms = []; state.integrations = {}; state.page = 1;
  setIgdbAvailability(false);
  for (const [key, element] of Object.entries(filters)) element.value = key === 'sort' ? 'title' : '';
  for (const slot of $$('.hero-cover, .app-cover-field i')) { slot.style.backgroundImage = ''; slot.classList.remove('has-art'); }
  state.user = null;
  $('#app-shell').hidden = true;
  $('#auth-screen').hidden = false;
  void loadAuthCovers();
  showAuthForm();
  endSessionResume();
  $('#auth-error').textContent = message;
  $('#auth-error').hidden = !message;
  setTimeout(() => $('#auth-username').focus(), UI_TIMING.focusDelayMs);
}

async function enterApp(user, savedPreferences, progress = null) {
  cancelPendingLibrarySearch();
  progressionUi.reset();
  runtime.authDecorationSequence += 1;
  state.user = user;
  $('#account-name').textContent = user.username;
  $('#account-current-name').textContent = user.username;
  updateAvatarUI();
  applyPreferences(savedPreferences);
  const dataReady = Promise.all([loadGames(), loadStatsAndMeta()]);
  $('#auth-screen').hidden = true;
  $('#app-shell').hidden = false;
  if (progress) progressionUi.hydrate(progress);
  connectEventStream();
  const routeReady = katalogNavigation.restoreCurrent().catch(() => {});
  void patchUi.refreshUnread();
  if (!progress) void progressionUi.load();
  await Promise.all([dataReady, routeReady]);
  if (state.user?.id !== user.id) return;
  const linkedGameId = window.location.pathname === '/' ? Number(new URLSearchParams(window.location.search).get('game')) : 0;
  if (linkedGameId > 0) {
    window.history.replaceState({ appView: 'library' }, '', '/');
    try { openDetails(await api(`/api/games/${linkedGameId}`)); }
    catch (error) { toast(error.message); }
  }
  endSessionResume();
  void stageAppDecorations(user.id).catch(() => {});
}

function setAvatar(element, user) {
  element.replaceChildren();
  if (user?.avatarUrl) {
    const image = document.createElement('img'); image.src = user.avatarUrl; image.alt = '';
    element.append(image);
  } else {
    const initial = document.createElement('span'); initial.className = 'avatar-initial';
    initial.textContent = user?.username?.slice(0, 1).toUpperCase() || '?'; element.append(initial);
  }
}

function updateAvatarUI() {
  setAvatar($('#account-avatar'), state.user);
  setAvatar($('#nav-avatar'), state.user);
  $('#avatar-remove').hidden = !state.user?.avatarUrl;
}

export { showAuth, enterApp, updateAvatarUI };
