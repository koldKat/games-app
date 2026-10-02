import { filters, state } from '../core/runtime.js';
import { renderQuickFilter } from './render.js';
import { schedulePreferenceSave } from '../account/preferences.js';
import { UI_TIMING } from '../core/ui-policy.js';
import { loadGames } from './data.js';
import { $ } from '../core/dom.js';

let searchTimer;

export function cancelPendingLibrarySearch() {
  clearTimeout(searchTimer); searchTimer = null;
}

function reconcileLibraryFilters(changedKey) {
  if (changedKey === 'ownership' && filters.ownership.value === 'hidden') filters.playStatus.value = '';
  if (changedKey === 'playStatus' && filters.playStatus.value && filters.ownership.value === 'hidden') filters.ownership.value = '';
}

export function initializeLibraryFilters() {
  searchTimer = undefined;
  filters.q.addEventListener('input', () => { renderQuickFilter(); schedulePreferenceSave(UI_TIMING.searchPreferenceSaveMs); clearTimeout(searchTimer); searchTimer = setTimeout(loadGames, UI_TIMING.librarySearchDebounceMs); });
  Object.entries(filters).filter(([key]) => !['q', 'favorite'].includes(key)).forEach(([key, element]) => element.addEventListener('change', () => {
    reconcileLibraryFilters(key); renderQuickFilter(); schedulePreferenceSave(); loadGames();
  }));
  $('#clear-filters').addEventListener('click', () => { Object.entries(filters).forEach(([key, element]) => { element.value = key === 'sort' ? 'title' : ''; }); renderQuickFilter(); schedulePreferenceSave(); loadGames(); });
  $('#library-pagination').addEventListener('click', event => {
    if (state.loading) return;
    const direction = event.target.closest('[data-library-page]')?.dataset.libraryPage;
    if (!direction) return;
    void loadGames(state.page + (direction === 'next' ? 1 : -1));
  });
}
