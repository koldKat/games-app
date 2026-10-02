import { $ } from '../core/dom.js';
import { escapeHtml, toast, api } from '../core/api.js';
import { SOURCE_IMAGE_MAX_BYTES, LOOKUP_MIN_TITLE_LENGTH } from '../core/ui-policy.js';
import { selectedPlatform } from './platform.js';
import { bindCoverResultFallbacks } from '../ui-helpers/cover-result-images.js';

function renderCoverSelection() {
  const url = $('#game-form').dataset.coverPreview || $('#game-form').dataset.coverUrl || ''; const box = $('#cover-selection');
  $('#cover-remove-button').hidden = !url; box.hidden = !url;
  const source = $('#game-form').dataset.coverSource || ''; const sourceLabels = { steamgriddb: 'SteamGridDB', thegamesdb: 'TheGamesDB', hltb: 'HowLongToBeat', igdb: 'IGDB', upload: 'Uploaded' };
  const details = [$('#game-form').dataset.coverMatchTitle || 'Custom match', sourceLabels[source]].filter(Boolean).join(' · ');
  box.innerHTML = url ? `<img class="cover-selection-image" src="${escapeHtml(url)}" alt="Selected game cover"><span><strong>Cover selected</strong><small>${escapeHtml(details)}</small></span>` : '';
}

function clearCoverUpload() {
  const preview = $('#game-form').dataset.coverPreview || '';
  if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
  delete $('#game-form').dataset.coverUpload; delete $('#game-form').dataset.coverPreview;
}

function readCoverBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: String(reader.result || ''), previewUrl: URL.createObjectURL(blob) });
    reader.onerror = () => reject(new Error('Could not read that cover.'));
    reader.readAsDataURL(blob);
  });
}

function compressedCoverBlob(canvas, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function compressCover(canvas, quality = .9) {
  const blob = await compressedCoverBlob(canvas, quality);
  if (!blob) throw new Error('Could not process that cover.');
  if (blob.size <= 512 * 1024) return readCoverBlob(blob);
  if (quality <= .2) throw new Error('Could not compress cover enough to upload.');
  return compressCover(canvas, quality - .1);
}

function coverDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return reject(new Error('Choose a JPEG, PNG, or WebP cover.'));
    if (file.size > SOURCE_IMAGE_MAX_BYTES) return reject(new Error('Source image is too large (maximum 20 MB).'));
    const image = new Image(); const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      compressCover(canvas).then(resolve, reject);
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not read that cover.')); };
    image.src = objectUrl;
  });
}

function coverResultMarkup(result, index) {
  const providerLabels = { steamgriddb: 'SteamGridDB', thegamesdb: 'TheGamesDB', hltb: 'HowLongToBeat', igdb: 'IGDB' };
  const dimensions = result.width && result.height ? `${result.width}×${result.height}` : '';
  const details = [providerLabels[result.source] || result.source, dimensions, result.style].filter(Boolean).join(' · ');
  return `<button type="button" class="cover-result" data-cover-index="${index}">
    <img src="${escapeHtml(result.thumbnailUrl)}" data-cover-image-index="${index}" alt="" loading="lazy" referrerpolicy="no-referrer">
    <span><strong>${escapeHtml(result.gameTitle)}</strong><small>${escapeHtml(details)}</small></span>
  </button>`;
}

function coverResultsMarkup(results) {
  if (!results.length) return '<p class="pegi-message">No portrait covers found. Try a shorter or more exact title.</p>';
  return results.map(coverResultMarkup).join('');
}

export function initializeEditorCovers() {
  $('#cover-upload-button').addEventListener('click', () => $('#cover-file').click());
  $('#cover-file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    const button = $('#cover-upload-button'); button.disabled = true; button.textContent = 'Preparing…';
    try {
      const upload = await coverDataUrl(file); clearCoverUpload();
      $('#game-form').dataset.coverUpload = upload.dataUrl; $('#game-form').dataset.coverPreview = upload.previewUrl; $('#game-form').dataset.coverUrl = '';
      $('#game-form').dataset.coverSource = 'upload'; $('#game-form').dataset.coverMatchTitle = $('#game-title').value.trim() || file.name.replace(/\.[^.]+$/, '') || 'Uploaded cover';
      $('#cover-results').hidden = true; renderCoverSelection(); toast('Cover ready. Save the game to upload it.');
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; button.textContent = 'Upload cover'; }
  });
  $('#cover-search-button').addEventListener('click', async () => {
    const title = $('#game-title').value.trim(); const box = $('#cover-results'); box.hidden = false;
    if (title.length < LOOKUP_MIN_TITLE_LENGTH) { box.innerHTML = '<p class="pegi-message">Type at least two characters of the title first.</p>'; return; }
    box.innerHTML = '<p class="pegi-message">Querying cover sources…</p>';
    try {
      const results = await api(`/api/covers/search?q=${encodeURIComponent(title)}&platform=${encodeURIComponent(selectedPlatform())}`); box._results = results;
      box.innerHTML = coverResultsMarkup(results);
      bindCoverResultFallbacks(box, results);
    } catch (error) { box.innerHTML = `<p class="pegi-message">${escapeHtml(error.message)}</p>`; }
  });
  $('#cover-results').addEventListener('click', event => {
    const button = event.target.closest('[data-cover-index]'); if (!button) return;
    const result = $('#cover-results')._results?.[Number(button.dataset.coverIndex)]; if (!result) return;
    clearCoverUpload();
    $('#game-form').dataset.coverUrl = result.url; $('#game-form').dataset.coverSource = result.source; $('#game-form').dataset.coverMatchTitle = result.gameTitle;
    $('#cover-results').hidden = true; renderCoverSelection(); toast('Cover selected. Save the game to keep it.');
  });
  $('#cover-remove-button').addEventListener('click', () => {
    clearCoverUpload();
    $('#game-form').dataset.coverUrl = ''; $('#game-form').dataset.coverSource = ''; $('#game-form').dataset.coverMatchTitle = ''; renderCoverSelection();
  });
}
export { clearCoverUpload, renderCoverSelection };
