import { createIgdbLookup } from '../metadata/igdb-ui.js';
import { $ } from '../core/dom.js';
import { api, escapeHtml, toast } from '../core/api.js';
import { selectedPlatform, setPlatformValue } from './platform.js';
import { platformFromReleaseText, platformForPegiResult, isPcStorefront } from '../library/platforms.js';
import { renderCoverSelection } from './covers.js';
import { createHltbLookup } from '../metadata/hltb-ui.js';
import { UI_LOCALE, PEGI_RELEASE_PREVIEW_LIMIT, LOOKUP_MIN_TITLE_LENGTH } from '../core/ui-policy.js';
import { pegiMetadata, renderPegiDetails } from './pegi-details.js';

let igdbLookup;
let hltbLookup;

function setIgdbAvailability(available) {
  const button = $('#igdb-search-button');
  button.disabled = !available;
  $('#igdb-assist-status').textContent = available
    ? 'Match a title to add IGDB ratings, credits, genres, description, and artwork.'
    : 'IGDB is not connected for this server. Continue entering the game manually.';
}

function pegiSearchResultsMarkup(results, title) {
  if (!results.length) {
    return `<p class="pegi-message">No PEGI match found. You can keep entering it manually or <a href="https://pegi.info/search-pegi?q=${encodeURIComponent(title)}" target="_blank" rel="noopener">search PEGI directly</a>.</p>`;
  }
  const count = `${results.length.toLocaleString(UI_LOCALE)} PEGI result${results.length === 1 ? '' : 's'}`;
  const matches = results.map((result, index) => {
    const releaseText = [result.publisher, ...result.releases.slice(0, PEGI_RELEASE_PREVIEW_LIMIT)].filter(Boolean).join(' · ');
    return `<button type="button" class="pegi-result" data-pegi-index="${index}">
      <span class="pegi-box pegi-box-${result.pegi || 'none'}">${result.pegi || '?'}</span>
      <span><strong>${escapeHtml(result.title)}</strong><small>${escapeHtml(releaseText)}</small></span>
    </button>`;
  }).join('');
  return `<p class="pegi-message pegi-result-count">${count}</p>${matches}`;
}

async function searchPegi() {
  const title = $('#game-title').value.trim();
  const box = $('#pegi-results');
  box.hidden = false;
  if (title.length < LOOKUP_MIN_TITLE_LENGTH) {
    box.innerHTML = '<p class="pegi-message">Type at least two characters of the title first.</p>';
    return;
  }
  box.innerHTML = '<p class="pegi-message">Searching PEGI’s Kat·a·log…</p>';
  try {
    const results = await api(`/api/pegi/search?q=${encodeURIComponent(title)}`);
    box.innerHTML = pegiSearchResultsMarkup(results, title);
    box._results = results;
  } catch (error) {
    box.innerHTML = `<p class="pegi-message">${escapeHtml(error.message)} You can still enter the game manually.</p>`;
  }
}

export function initializeIgdbLookup() {
  igdbLookup = createIgdbLookup({
    $, api, escapeHtml, toast, selectedPlatform, setPlatformValue, platformFromReleaseText, isPcStorefront, renderCoverSelection,
  });
}

export function initializeHltbLookup() {
  hltbLookup = createHltbLookup({ $, api, escapeHtml, toast });
}

export function bindMetadataLookups() {
  $('#pegi-search-button').addEventListener('click', () => void searchPegi());
  $('#pegi-results').addEventListener('click', event => {
    const button = event.target.closest('[data-pegi-index]'); if (!button) return;
    const result = $('#pegi-results')._results?.[Number(button.dataset.pegiIndex)]; if (!result) return;
    $('#game-title').value = result.title; $('#game-pegi').value = result.pegi || ''; $('#game-publisher').value = result.publisher || ''; $('#game-year').value = result.releaseYear || '';
    const current = selectedPlatform();
    const mapped = platformForPegiResult(result.releases, current);
    if (mapped && mapped !== current) setPlatformValue(mapped);
    $('#game-form').dataset.pegiUrl = result.pegiUrl;
    $('#game-form')._pegiMetadata = pegiMetadata({ pegiDescriptors: result.descriptors, pegiReleases: result.releases, pegiAdvice: result.advice, pegiOutline: result.outline, pegiContentIssues: result.contentIssues, pegiOtherIssues: result.otherIssues });
    $('#pegi-results').hidden = true; renderPegiDetails(); $('#game-pegi-details').open = true; toast('PEGI details applied.');
  });
  $('#game-description').addEventListener('input', () => {
    if ($('#game-description').value !== $('#game-form').dataset.descriptionInitial) {
      $('#game-form').dataset.descriptionSource = $('#game-description').value.trim() ? 'Manual' : '';
      $('#game-form').dataset.descriptionSourceUrl = '';
    }
  });
  $('#description-search-button').addEventListener('click', async () => {
    const title = $('#game-title').value.trim(); const box = $('#description-results'); box.hidden = false;
    if (title.length < LOOKUP_MIN_TITLE_LENGTH) { box.innerHTML = '<p class="pegi-message">Type at least two characters of the title first.</p>'; return; }
    box.innerHTML = '<p class="pegi-message">Searching Steam Store, IGDB and TheGamesDB…</p>';
    try {
      const results = await api(`/api/descriptions/search?q=${encodeURIComponent(title)}&platform=${encodeURIComponent(selectedPlatform())}`); box._results = results;
      box.innerHTML = results.length ? results.map((result, index) => `<button type="button" class="pegi-result" data-description-index="${index}"><span><strong>${escapeHtml(result.gameTitle)}</strong><small>${escapeHtml(result.source)} · ${escapeHtml(result.description.slice(0, 180))}${result.description.length > 180 ? '…' : ''}</small></span></button>`).join('') : '<p class="pegi-message">No description match found. You can write one manually.</p>';
    } catch (error) { box.innerHTML = `<p class="pegi-message">${escapeHtml(error.message)} You can still write a description manually.</p>`; }
  });
  $('#description-results').addEventListener('click', event => {
    const button = event.target.closest('[data-description-index]'); if (!button) return;
    const result = $('#description-results')._results?.[Number(button.dataset.descriptionIndex)]; if (!result) return;
    $('#game-description').value = result.description; $('#game-form').dataset.descriptionInitial = result.description;
    $('#game-form').dataset.descriptionSource = result.source; $('#game-form').dataset.descriptionSourceUrl = result.sourceUrl;
    $('#description-results').hidden = true; toast(`${result.source} description applied.`);
  });
}
export { setIgdbAvailability, hltbLookup, igdbLookup };
