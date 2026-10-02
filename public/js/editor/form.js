import { $, $$ } from '../core/dom.js';
import { clearCoverUpload, renderCoverSelection } from './covers.js';
import { pegiMetadata, formValue, renderPegiDetails } from './pegi-details.js';
import { mountVersionPicker } from './copy-picker.js';
import { filters, labels, state } from '../core/runtime.js';
import { MULTIPLATFORM_FILTER_VALUE, UI_TIMING } from '../core/ui-policy.js';
import { setPlatformValue, selectedPlatform } from './platform.js';
import { setMediaFormatInputs, selectedMediaFormats } from '../library/media-formats.js';
import { setRating } from './rating.js';
import { hltbLookup, igdbLookup } from './lookups.js';
import { closeOnTrueBackdrop, confirmAction } from '../ui-helpers/dialogs.js';
import { api, escapeHtml, toast } from '../core/api.js';
import { createTitleAutocomplete } from './title-autocomplete.js';
import { katalogNavigation } from '../boot/navigation.js';
import { platformDisplayName } from '../library/platforms.js';
import { applySaveProgress } from '../boot/services.js';
import { refreshLibraryPage } from '../library/data.js';

let dialog;
let titleAutocomplete;

function openForm(game = null) {
  titleAutocomplete.reset();
  $('#game-form').reset(); $('#game-id').value = game?.id || '';
  $('#game-form').dataset.pegiUrl = game?.pegiUrl || '';
  $('#game-form').dataset.coverUrl = game?.coverUrl || '';
  clearCoverUpload();
  $('#game-form').dataset.coverSource = game?.coverSource || '';
  $('#game-form').dataset.coverMatchTitle = game?.coverMatchTitle || '';
  $('#game-form').dataset.descriptionSource = game?.descriptionSource || '';
  $('#game-form').dataset.descriptionSourceUrl = game?.descriptionSourceUrl || '';
  $('#game-form').dataset.descriptionInitial = game?.description || '';
  $('#game-form')._pegiMetadata = pegiMetadata(game);
  $('#form-title').textContent = game ? 'Edit game' : 'Add a game'; $('#form-kicker').textContent = game ? 'Update the shelf' : 'Grow the shelf';
  mountVersionPicker($('#game-form'), game, openForm, $('#game-title').closest('.title-autocomplete'));
  const filteredPlatform = filters.platform.value && filters.platform.value !== MULTIPLATFORM_FILTER_VALUE ? filters.platform.value : '';
  $('#game-title').value = formValue(game, 'title'); setPlatformValue(formValue(game, 'platform', filteredPlatform || 'Nintendo Switch'));
  $('#game-pegi').value = formValue(game, 'pegi'); $('#game-ownership').value = formValue(game, 'ownership', 'owned');
  $('#game-status').value = formValue(game, 'playStatus', 'backlog');
  setMediaFormatInputs(game, $('#game-format-physical'), $('#game-format-digital'));
  $('#game-cartridge').value = formValue(game, 'cartridgeNumber'); $('#game-publisher').value = formValue(game, 'publisher');
  $('#game-year').value = formValue(game, 'releaseYear'); setRating(formValue(game, 'rating')); $('#game-description').value = formValue(game, 'description'); $('#game-notes').value = formValue(game, 'notes'); $('#game-favorite').checked = Boolean(game?.favorite);
  $('#delete-game').hidden = !game; $('#pegi-results').hidden = true; $('#pegi-results').innerHTML = ''; $('#cover-results').hidden = true; $('#cover-results').innerHTML = ''; $('#description-results').hidden = true; $('#description-results').innerHTML = ''; $('#form-error').hidden = true; titleAutocomplete.updateWarning(); hltbLookup.load(game); igdbLookup.load(game); renderCoverSelection(); renderPegiDetails();
  if (!dialog.open) dialog.showModal();
  setTimeout(() => $('#game-title').focus(), UI_TIMING.formFocusDelayMs);
}

function closeForm() { titleAutocomplete.close(); dialog.close(); }

async function openExistingGame(id) {
  try { const game = await api(`/api/games/${id}`); openForm(game); }
  catch {}
}

function payload() {
  return { title: $('#game-title').value, platform: selectedPlatform(), pegi: $('#game-pegi').value,
    ownership: $('#game-ownership').value, playStatus: $('#game-status').value,
    mediaFormats: selectedMediaFormats($('#game-format-physical'), $('#game-format-digital')),
    cartridgeNumber: $('#game-cartridge').value, publisher: $('#game-publisher').value, releaseYear: $('#game-year').value, rating: $('#game-rating').value,
    notes: $('#game-notes').value, description: $('#game-description').value, descriptionSource: $('#game-form').dataset.descriptionSource || '', descriptionSourceUrl: $('#game-form').dataset.descriptionSourceUrl || '', favorite: $('#game-favorite').checked, pegiUrl: $('#game-form').dataset.pegiUrl || '',
    ...($('#game-form')._pegiMetadata || pegiMetadata()), ...hltbLookup.payload(), ...igdbLookup.payload(),
    coverUrl: $('#game-form').dataset.coverUrl || '', coverUpload: $('#game-form').dataset.coverUpload || '', coverSource: $('#game-form').dataset.coverSource || '', coverMatchTitle: $('#game-form').dataset.coverMatchTitle || '' };
}

export function initializeEditorForm() {
  dialog = $('#game-dialog');
}

export function bindEditorDialog() {
  $$('[data-add-game]').forEach(button => button.addEventListener('click', () => openForm()));
  $$('[data-close]').forEach(button => button.addEventListener('click', closeForm));
  closeOnTrueBackdrop(dialog, closeForm);
}

export function initializeTitleAutocomplete() {
  titleAutocomplete = createTitleAutocomplete({
    input: $('#game-title'), suggestionBox: $('#title-suggestions'), warning: $('#duplicate-warning'), summary: $('#duplicate-summary'),
    openButton: $('#open-duplicate'), platformInput: $('#game-platform'), customPlatformInput: $('#game-platform-custom'),
    api, escapeHtml, labels, getPlatform: selectedPlatform, getEditingId: () => $('#game-id').value, openExisting: openExistingGame,
    getIgdbId: () => igdbLookup.payload().igdbId,
    openKatalog: slug => katalogNavigation.open(`/game/${encodeURIComponent(slug)}`),
    onExternalSelect: result => { igdbLookup.apply(result); titleAutocomplete.updateWarning(); },
  });
}

export function bindEditorMutations() {
  $('#game-form').addEventListener('submit', async event => {
    event.preventDefault(); const id = $('#game-id').value; const save = $('#save-game');
    const returnPage = id ? state.page : 1;
    save.disabled = true; save.textContent = 'Checking…';
    const duplicate = await titleAutocomplete.duplicateBeforeSave();
    const original = state.games.find(game => String(game.id) === id);
    const changesIdentity = original && (original.platform !== selectedPlatform() || original.title !== $('#game-title').value);
    if (changesIdentity && duplicate && !await confirmAction({ title: 'Another copy already exists', message: `You are changing ${platformDisplayName(original.platform)} to ${platformDisplayName(selectedPlatform())}. Another copy already exists there. Change this copy anyway?`, confirmLabel: 'Change copy', kicker: 'Duplicate // game' })) {
      save.disabled = false; save.textContent = 'Save game'; return;
    }
    if (!id && duplicate && !await confirmAction({ title: 'Add another copy?', message: `“${duplicate.title}” is already in your ${platformDisplayName(duplicate.platform)} library. Add another entry anyway?`, confirmLabel: 'Add anyway', kicker: 'Duplicate // game' })) {
      save.disabled = false; save.textContent = 'Save game'; return;
    }
    save.textContent = 'Saving…';
    try {
      const result = await api(id ? `/api/games/${id}` : '/api/games', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
      applySaveProgress(result);
      closeForm(); toast(id ? 'Game updated.' : 'Game added to the shelf.'); await refreshLibraryPage(returnPage);
    } catch (error) { $('#form-error').textContent = error.message; $('#form-error').hidden = false; }
    finally { save.disabled = false; save.textContent = 'Save game'; }
  });
  $('#delete-game').addEventListener('click', async () => {
    const id = $('#game-id').value; const title = $('#game-title').value; const returnPage = state.page;
    if (!id || !await confirmAction({ title: 'Delete game?', message: `Permanently delete “${title}” from the collection?`, confirmLabel: 'Delete game', kicker: 'Destructive // game' })) return;
    try { await api(`/api/games/${id}`, { method: 'DELETE' }); closeForm(); toast('Game deleted.'); await refreshLibraryPage(returnPage); }
    catch (error) { toast(error.message); }
  });
}
export { openForm };
