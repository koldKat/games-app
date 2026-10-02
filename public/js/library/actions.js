import { state } from '../core/runtime.js';
import { api, toast } from '../core/api.js';
import { applySaveProgress } from '../boot/services.js';
import { refreshLibraryPage } from './data.js';
import { $, selectedCopyIds } from '../core/dom.js';
import {
  toggleCardVersionMenu, handleCardVersionMenuKeydown, handleCardVersionMenuFocusin,
  closeCardVersionMenus,
} from '../editor/version-picker.js';
import { displayedGames, cardNode } from './render.js';
import { selectedGroupCopy } from './game-groups.js';
import { openDetails } from '../details/dialog.js';
import { openForm } from '../editor/form.js';
import { cardRatingAtPointer, paintCardRating } from './cards.js';

function changedCardGame(game, action, event) {
  const changed = { ...game };
  if (action === 'favorite') changed.favorite = !changed.favorite;
  if (action === 'own') changed.ownership = 'owned';
  if (action === 'rate') {
    const star = event.target.closest('[data-rating-star]');
    const position = Number(star?.dataset.ratingStar);
    if (!position) return null;
    const bounds = star.getBoundingClientRect();
    const next = event.detail === 0 ? position : position - (event.clientX - bounds.left < bounds.width / 2 ? 0.5 : 0);
    changed.rating = Number(game.rating) === next ? null : next;
  }
  return changed;
}

function cardActionToast(action, changed) {
  if (action === 'own') return 'Moved to owned.';
  if (action === 'rate') return changed.rating == null ? 'Rating cleared.' : `Rated ${changed.rating.toFixed(1)} / 5.`;
  return changed.favorite ? 'Added to favorites.' : 'Removed from favorites.';
}

async function saveCardAction(game, action, event) {
  const changed = changedCardGame(game, action, event);
  if (!changed) return;
  const returnPage = state.page;
  try {
    const result = await api(`/api/games/${game.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changed) });
    applySaveProgress(result);
    await refreshLibraryPage(returnPage);
    toast(cardActionToast(action, changed));
  } catch (error) { toast(error.message); }
}

export function initializeLibraryActions() {
  $('#games').addEventListener('click', async event => {
    const card = event.target.closest('.game-card'); const action = event.target.closest('[data-action]')?.dataset.action;
    if (!card) return; const game = state.games.find(item => item.id === Number(card.dataset.id)); if (!game) return;
    if (action === 'version-menu') {
      toggleCardVersionMenu($('#games'), event.target.closest('.platform-picker'));
      return;
    }
    if (action === 'version') {
      const version = state.games.find(item => item.id === Number(event.target.closest('[data-game-id]')?.dataset.gameId));
      const group = displayedGames().find(item => item.versions.some(copy => copy.id === version?.id));
      if (group && version) {
        group.versions.forEach(copy => selectedCopyIds.delete(copy.id));
        selectedCopyIds.add(version.id);
        const next = cardNode(selectedGroupCopy(group, selectedCopyIds));
        card.replaceWith(next);
        next.querySelector('.platform-switch')?.focus({ preventScroll: true });
      }
      return;
    }
    if (!action) return openDetails(game);
    if (action === 'view') return openDetails(game);
    if (action === 'edit') return openForm(game);
    await saveCardAction(game, action, event);
  });
  $('#games').addEventListener('keydown', event => handleCardVersionMenuKeydown(event, $('#games')));
  document.addEventListener('focusin', event => handleCardVersionMenuFocusin(event, $('#games')));
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.platform-picker')) closeCardVersionMenus($('#games'));
  });
  $('#games').addEventListener('pointermove', event => {
    const rating = cardRatingAtPointer(event); const picker = event.target.closest('.card-rating-picker');
    if (picker && rating != null) paintCardRating(picker, rating, true);
  });
  $('#games').addEventListener('pointerout', event => {
    const picker = event.target.closest('.card-rating-picker');
    if (!picker || picker.contains(event.relatedTarget)) return;
    paintCardRating(picker, picker.dataset.cardRating, false);
  });
}
