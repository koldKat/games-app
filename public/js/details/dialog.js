import { $, $$ } from '../core/dom.js';
import { runtime, state, labels, filters } from '../core/runtime.js';
import { escapeHtml, api, toast } from '../core/api.js';
import { badge, personalRating } from '../library/cards.js';
import { platformThemeClass, platformDisplayName } from '../library/platforms.js';
import { igdbDetailsMarkup } from '../metadata/igdb-ui.js';
import { mountVersionPicker } from '../editor/copy-picker.js';
import { mediaFormatLabel } from '../library/media-formats.js';
import { UI_TIMING } from '../core/ui-policy.js';
import { closeOnTrueBackdrop } from '../ui-helpers/dialogs.js';
import { renderQuickFilter } from '../library/render.js';
import { schedulePreferenceSave } from '../account/preferences.js';
import { loadGames, randomQueryString } from '../library/data.js';
import { openForm } from '../editor/form.js';
import { createRandomGamePicker } from '../library/random-game.js';

let detailGame;
let detailsDialog;

function safeDetailLink(url, label) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.protocol === 'https:' ? `<a href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ↗</a>` : '';
  } catch { return ''; }
}

function detailSection(title, content) {
  return content ? `<section class="game-detail-section"><h3>${escapeHtml(title)}</h3>${content}</section>` : '';
}

function detailRows(rows) {
  return rows
    .filter(([, value]) => value !== '' && value != null)
    .map(([label, value, valueClass = '']) => `<div><span>${escapeHtml(label)}</span><strong${valueClass ? ` class="${escapeHtml(valueClass)}"` : ''}>${escapeHtml(String(value))}</strong></div>`)
    .join('');
}

function detailTimes(game) {
  return [['Main story', game.hltbMainStory], ['Main + sides', game.hltbMainExtra], ['Completionist', game.hltbCompletionist], ['All styles', game.hltbAllStyles]]
    .map(([label, value]) => `<div><span>${label}</span><strong>${value == null ? '//' : `${escapeHtml(String(value))}h`}</strong></div>`)
    .join('');
}

function detailPegiText(game) {
  return [['Advice for consumers', game.pegiAdvice], ['Brief outline', game.pegiOutline], ['Content-specific issues', game.pegiContentIssues], ['Other issues', game.pegiOtherIssues]]
    .filter(([, value]) => value)
    .map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></div>`)
    .join('');
}

function detailReleases(game) {
  if (!(game.pegiReleases || []).length) return '';
  return `<ul>${game.pegiReleases.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`;
}

function detailCover(game) {
  return game.coverUrl
    ? `<img src="${escapeHtml(game.coverUrl)}" alt="${escapeHtml(`${game.title} cover`)}" referrerpolicy="no-referrer">`
    : '<div class="game-detail-no-cover">No cover</div>';
}

function detailMarkup(game, { rating, descriptors, times, facts, pegiText, releases }) {
  const chips = `${badge(game.pegi ? `PEGI ${game.pegi}` : 'Unrated', game.pegi ? `pegi pegi-${game.pegi}` : '')}${rating}${game.favorite ? badge('Favorite') : ''}`;
  const description = game.description ? `<p class="game-detail-description">${escapeHtml(game.description)}</p>` : '';
  const descriptionSource = game.descriptionSource ? `<small>DESCRIPTION // ${escapeHtml(game.descriptionSource)}</small>` : '';
  const hltb = `<div class="game-detail-times">${times}</div>${safeDetailLink(game.hltbUrl, 'View source on HowLongToBeat')}`;
  const pegi = `${descriptors ? `<div class="game-detail-chips">${descriptors}</div>` : ''}${releases}${pegiText}${safeDetailLink(game.pegiUrl, 'View source on PEGI')}`;
  const notes = game.notes ? `<p>${escapeHtml(game.notes)}</p>` : '<p class="empty-detail">No personal notes.</p>';
  return `<div class="game-detail-hero">
  ${detailCover(game)}
  <div><p class="game-detail-platform platform-coded ${platformThemeClass(game.platform)}">${escapeHtml(platformDisplayName(game.platform))}</p><div class="game-detail-chips">${chips}</div>${description}${descriptionSource}${safeDetailLink(game.descriptionSourceUrl, 'View description source')}</div>
</div>
<div class="game-detail-facts">${facts}</div>
${detailSection('HowLongToBeat', hltb)}
${detailSection('PEGI details', pegi)}
${igdbDetailsMarkup(game, escapeHtml)}
${detailSection('Notes', notes)}`;
}

function openDetails(game, randomPick = false) {
  detailGame = game;
  runtime.randomGamePicker?.setDialog(randomPick, game.id);
  $('#game-details-title').textContent = game.title;
  const rating = personalRating(game.rating);
  const descriptors = (game.pegiDescriptors || []).map(item => badge(item, /purchases|random items/i.test(item) ? 'descriptor purchase' : 'descriptor')).join('');
  const times = detailTimes(game);
  const facts = detailRows([['Platform', platformDisplayName(game.platform), `platform-coded game-detail-platform-value ${platformThemeClass(game.platform)}`], ['Collection', labels[game.ownership]], ['Play status', labels[game.playStatus]], ['Format', mediaFormatLabel(game, labels)], ['Publisher', game.publisher], ['Release year', game.releaseYear], ['Cartridge no.', game.cartridgeNumber == null ? '' : game.cartridgeNumber]]);
  const pegiText = detailPegiText(game);
  const releases = detailReleases(game);
  $('#game-details-content').innerHTML = detailMarkup(game, { rating, descriptors, times, facts, pegiText, releases });
  mountVersionPicker(detailsDialog, game, selected => openDetails(selected, randomPick), $('#game-details-title'));
  if (!detailsDialog.open) detailsDialog.showModal();
  setTimeout(() => $('[data-details-close]').focus(), UI_TIMING.formFocusDelayMs);
}

function closeDetails() { detailsDialog.close(); detailGame = null; runtime.randomGamePicker?.setDialog(false); }

export function initializeDetailsDialog() {
  detailsDialog = $('#game-details-dialog');
  detailGame = null;
  $$('[data-details-close]').forEach(button => button.addEventListener('click', closeDetails));
  detailsDialog.addEventListener('close', () => { detailGame = null; runtime.randomGamePicker?.setDialog(false); });
  closeOnTrueBackdrop(detailsDialog, closeDetails);
  detailsDialog.addEventListener('click', event => {
    const chip = event.target.closest('[data-metadata-search]');
    if (!chip) return;
    filters.q.value = chip.dataset.metadataSearch || '';
    closeDetails(); renderQuickFilter(); schedulePreferenceSave(UI_TIMING.searchPreferenceSaveMs); void loadGames();
    filters.q.focus({ preventScroll: true });
  });
  $('#game-details-edit').addEventListener('click', () => { const game = detailGame; closeDetails(); if (game) openForm(game); });
  runtime.randomGamePicker = createRandomGamePicker({
    button: $('#random-game'), rerollButton: $('#game-details-reroll'), api, queryString: randomQueryString,
    openGame: (game, randomPick) => openDetails(game, randomPick), toast,
  });
  runtime.randomGamePicker.setAvailability(state.gameTotal, state.loading);
}
export { openDetails };
