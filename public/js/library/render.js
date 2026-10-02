import { filters, state, runtime } from '../core/runtime.js';
import { MULTIPLATFORM_FILTER_VALUE, UI_LOCALE } from '../core/ui-policy.js';
import { hasMediaFormat } from './media-formats.js';
import { isMissingPegiInfo, isMissingHltbInfo, isMissingDescription, gameCard } from './cards.js';
import { groupGames, selectedGroupCopy } from './game-groups.js';
import { selectedCopyIds, $, $$ } from '../core/dom.js';
import { syncSearchClears } from '../ui-helpers/search-clears.js';
import { syncFilterSelectStates, bindFilterSelectStates } from '../ui-helpers/filter-state.js';
import { schedulePreferenceSave } from '../account/preferences.js';
import { loadGames } from './data.js';

let compactViewMedia;

function gameMatchesFilters(game) {
  const query = filters.q.value.trim().toLocaleLowerCase();
  if (query && ![game.title, game.publisher, game.notes, game.description, ...(game.igdbGenres || []), ...(game.igdbThemes || [])]
    .some(value => String(value || '').toLocaleLowerCase().includes(query))) return false;
  if (filters.platform.value && filters.platform.value !== MULTIPLATFORM_FILTER_VALUE && game.platform !== filters.platform.value) return false;
  const hiddenFilter = filters.ownership.value === 'hidden';
  if (hiddenFilter && game.playStatus !== 'hidden') return false;
  if (!hiddenFilter && game.playStatus === 'hidden') return false;
  if (filters.ownership.value === 'owned_physical' && (game.ownership !== 'owned' || !hasMediaFormat(game, 'physical'))) return false;
  if (filters.ownership.value === 'owned_digital' && (game.ownership !== 'owned' || !hasMediaFormat(game, 'digital'))) return false;
  if (filters.ownership.value && !filters.ownership.value.startsWith('owned_') && !hiddenFilter && game.ownership !== filters.ownership.value) return false;
  if (filters.playStatus.value && game.playStatus !== filters.playStatus.value) return false;
  if (filters.pegi.value === 'none' && game.pegi != null) return false;
  if (filters.pegi.value && filters.pegi.value !== 'none' && Number(game.pegi) !== Number(filters.pegi.value)) return false;
  const missingPegi = isMissingPegiInfo(game); const missingIgdb = !game.igdbId; const missingCover = !game.coverUrl;
  const missingHltb = isMissingHltbInfo(game); const missingDescription = isMissingDescription(game);
  if (filters.missing.value === 'pegi' && !missingPegi) return false;
  if (filters.missing.value === 'igdb' && !missingIgdb) return false;
  if (filters.missing.value === 'cover' && !missingCover) return false;
  if (filters.missing.value === 'hltb' && !missingHltb) return false;
  if (filters.missing.value === 'description' && !missingDescription) return false;
  if (filters.missing.value === 'either' && !missingPegi && !missingIgdb && !missingCover && !missingHltb && !missingDescription) return false;
  if (filters.missing.value === 'both' && (!missingPegi || !missingIgdb || !missingCover || !missingHltb || !missingDescription)) return false;
  if (filters.favorite.value === '1' && !game.favorite) return false;
  return true;
}

function cardNode(game) {
  const template = document.createElement('template'); template.innerHTML = gameCard(game).trim(); return template.content.firstElementChild;
}

function displayedGames() {
  const splitPlatforms = Boolean(filters.platform.value && filters.platform.value !== MULTIPLATFORM_FILTER_VALUE);
  return groupGames(state.games.filter(gameMatchesFilters), { splitPlatforms }).map(group => selectedGroupCopy(group, selectedCopyIds));
}

function pageCount() { return Math.max(1, state.gamePages); }

function pagedGames() {
  state.page = Math.min(Math.max(1, state.page), pageCount());
  return displayedGames();
}

function updateCollectionChrome() {
  const shown = pagedGames(); const pages = pageCount(); const pagination = $('#library-pagination');
  $('#library-loader').hidden = !state.loading || state.games.length > 0;
  $('#empty').hidden = state.loading || state.games.length > 0;
  pagination.hidden = pages < 2;
  pagination.toggleAttribute('inert', state.loading);
  pagination.setAttribute('aria-busy', String(state.loading));
  $('#library-page-status').textContent = `Page ${state.page} of ${pages}`;
  pagination.querySelector('[data-library-page="previous"]').disabled = state.page <= 1;
  pagination.querySelector('[data-library-page="next"]').disabled = state.page >= pages;
  runtime.randomGamePicker?.setAvailability(state.gameTotal, state.loading);
  const count = state.gameTotal; const grouped = !filters.platform.value || filters.platform.value === MULTIPLATFORM_FILTER_VALUE;
  $('#result-count').textContent = `${count.toLocaleString(UI_LOCALE)} ${grouped ? count === 1 ? 'game group' : 'game groups' : count === 1 ? 'game' : 'games'} found`;
}

function renderGames() {
  const shown = pagedGames();
  $('#games').innerHTML = shown.map(gameCard).join('');
  $('#games').classList.toggle('list-view', state.view === 'list' && !compactViewMedia.matches);
  updateCollectionChrome();
  if (state.loading) $('#result-count').textContent = 'Loading collection…';
  $('#clear-filters').hidden = !Object.entries(filters).some(([key, el]) => key !== 'sort' && el.value);
}

function renderQuickFilter() {
  syncSearchClears();
  syncFilterSelectStates();
  $$('[data-stat-kind]').forEach(button => {
    const { statKind: kind, statValue: value = '' } = button.dataset;
    const active = kind === 'all'
      ? !Object.entries(filters).some(([key, element]) => key !== 'sort' && element.value)
      : filters[kind].value === value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function syncViewControls() {
  const compact = state.view === 'list' && !compactViewMedia.matches;
  $('#grid-view').classList.toggle('active', !compact); $('#list-view').classList.toggle('active', compact);
}

function setView(view, persist = true) {
  state.view = view === 'list' ? 'list' : 'grid';
  syncViewControls(); renderGames();
  if (persist) schedulePreferenceSave();
}

export function initializeLibraryRender() {
  $$('[data-stat-kind]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.statKind === 'all') Object.entries(filters).forEach(([key, element]) => { if (key !== 'sort') element.value = ''; });
    else { filters.ownership.value = ''; filters.playStatus.value = ''; filters.favorite.value = ''; }
    if (button.dataset.statKind !== 'all') filters[button.dataset.statKind].value = button.dataset.statValue;
    renderQuickFilter();
    schedulePreferenceSave();
    loadGames();
  }));
  renderQuickFilter();
  bindFilterSelectStates();
  compactViewMedia = window.matchMedia('(max-width: 680px)');
  compactViewMedia.addEventListener('change', () => { syncViewControls(); renderGames(); });
  $('#grid-view').addEventListener('click', () => setView('grid'));
  $('#list-view').addEventListener('click', () => setView('list'));
  setView(state.view);
}
export { setView, renderQuickFilter, gameMatchesFilters, renderGames, displayedGames, cardNode };
